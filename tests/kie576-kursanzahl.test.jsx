import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// KIE-576 Paket 3, Teil Widget (issues/KIE-576/KIE-576-kursanzahl.md,
// Abschnitt „Widget“, AK-K5, NAK-K3, NAK-K5): Mit courseCount vom Server
// steht im Kopf statt des Untertitels „aktuell 837 Kurse“ mit Info-Knopf,
// das Info-Element nennt Umfang, ausgeblendete und fehlende Kurse und den
// Stand (Europe/Berlin), Wortlaut nach D-K5. Kompakter
// Kopf und eingeklappte Inline-Leiste ohne Zahl, veraltet (älter als 24 h)
// wieder der Untertitel. Maße und Optik im Browser (browser_guide der
// Rückgabe), hier Inhalt, Sprache, Tastatur und Rückfälle.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/main.jsx", () => ({
  embedderSettings: {
    settings: {},
    USER_STYLES: {},
    ASSISTANT_STYLES: {},
    shadowRoot: null,
    hostElement: null,
  },
  inlineTailwindStyles: () => Promise.resolve(false),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
  I18nextProvider: ({ children }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

import { embedderSettings } from "../src/main.jsx";
import {
  DEFAULT_SETTINGS,
  loadEmbedSettings,
} from "../src/hooks/useScriptAttributes.js";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";
import InlineChat from "../src/components/InlineChat/index.jsx";
import {
  activeCourseCount,
  courseCountTexts,
  courseStandText,
} from "../src/utils/courseCount.js";
import {
  courseCountValue,
  courseCountWordValue,
  layoutValidations,
} from "../src/utils/layout.js";
import { closeEscapeLayerFor, escapeLayerCount } from "../src/utils/escape.js";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// Beispielwerte des Vertrags; jetzt = 24.10.2026, 12:30 Uhr in Berlin
// (MESZ), stand = 10:00 Uhr in Berlin
const NOW = Date.parse("2026-10-24T10:30:00.000Z");
const STAND = "2026-10-24T08:00:00.000Z";
const CC = {
  count: 812,
  offered: 837,
  hidden: 14,
  stand: STAND,
  word: "Kurse",
};
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server = {}) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let container;
let root;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
  embedderSettings.shadowRoot = null;
  embedderSettings.hostElement = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const $ = (s) => container.querySelector(s);
function render(el) {
  act(() => root.render(el));
}
async function header(server = {}, script = {}, props = {}) {
  const settings = await load(script, server);
  render(
    <ChatWindowHeader settings={{ ...settings, loaded: true }} {...props} />,
  );
  return settings;
}
const button = () => $("#anything-llm-course-count-button");
const card = () => $('[role="dialog"]');
const click = (el) =>
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const mousedown = (el) =>
  act(() => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
const cardLines = () => [...card().children].map((el) => el.textContent);

// ---------------------------------------------------------------------------
describe("Feld courseCount: nur vom Server, geprüft", () => {
  it("gültig: übernommen, Bezeichnung getrimmt, weitere Schlüssel fallen weg", async () => {
    const s = await load(
      {},
      { courseCount: { ...CC, word: " Angebote ", x: 1 } },
    );
    expect(s.courseCount).toEqual({ ...CC, word: "Angebote" });
  });

  it("ungültig: null, der Kopf zeigt den Untertitel", async () => {
    for (const bad of [
      { ...CC, count: 0 },
      { ...CC, count: -3 },
      { ...CC, count: 1.5 },
      { ...CC, count: "812" },
      { ...CC, offered: 811 },
      { ...CC, offered: null },
      { ...CC, stand: "gestern" },
      { ...CC, stand: "2026-10-24" },
      { ...CC, stand: "2026-10-24T08:00:00" }, // ohne Zeitzone
      { ...CC, stand: undefined },
      [CC],
      "812",
      812,
    ]) {
      const s = await load({}, { courseCount: bad });
      expect(s.courseCount, JSON.stringify(bad)).toBeNull();
    }
  });

  it("hidden (D-K5): fehlend (älterer Server) 0; negativ oder keine ganze Zahl 0, das Feld bleibt", async () => {
    const { hidden, ...older } = CC;
    expect(hidden).toBe(14);
    expect((await load({}, { courseCount: older })).courseCount).toEqual({
      ...CC,
      hidden: 0,
    });
    for (const bad of [-1, 1.5, "14", null, NaN, Infinity, 2 ** 53]) {
      const s = await load({}, { courseCount: { ...CC, hidden: bad } });
      expect(s.courseCount, String(bad)).toEqual({ ...CC, hidden: 0 });
    }
  });

  it("Stand mit Mikrosekunden und +00:00 (Python) ist gültig", () => {
    const v = courseCountValue({
      ...CC,
      stand: "2026-10-24T08:00:00.123456+00:00",
    });
    expect(v?.count).toBe(812);
    expect(activeCourseCount({ courseCount: v }, NOW)).not.toBeNull();
  });

  it("Bezeichnung: ein Wort aus Buchstaben, Bindestrich nur zwischen Buchstaben, höchstens 20 Zeichen; sonst der Standard der Sprache", () => {
    expect(courseCountWordValue("Kurse")).toBe("Kurse");
    expect(courseCountWordValue("Kurs-Angebote")).toBe("Kurs-Angebote");
    expect(courseCountWordValue("Veranstaltungen")).toBe("Veranstaltungen");
    expect(courseCountWordValue("Übungen")).toBe("Übungen");
    for (const bad of [
      "",
      "  ",
      "-",
      "Übungen und Kurse",
      "Online Kurse",
      "-Kurse",
      "Kurse-",
      "Online--Kurse",
      "Kurse!",
      "Kurse<b>",
      "Kurse2",
      "a".repeat(21),
      42,
      null,
    ])
      expect(courseCountWordValue(bad), String(bad)).toBeUndefined();
    const v = courseCountValue({ ...CC, word: "<img src=x>" });
    expect(v.word).toBeNull();
    expect(courseCountTexts({ courseCount: v }, NOW).word).toBe("Kurse");
    expect(courseCountTexts({ courseCount: v, language: "en" }, NOW).word).toBe(
      "courses",
    );
  });

  it("gespeicherte Bezeichnung mit Leerzeichen (Altbestand): der Kopf zeigt den Standard", async () => {
    await header({ courseCount: { ...CC, word: "Online Kurse" } });
    expect($("#anything-llm-header-course-count").textContent).toBe(
      "aktuell 812 Kurse",
    );
  });

  it("Skript-Attribut data-course-count wirkt nicht und meldet sich", async () => {
    const s = await load({ courseCount: '{"count":9999}' }, {});
    expect(s.courseCount).toBeNull();
    expect(
      console.warn.mock.calls.some(([m]) => /data-course-count/.test(m)),
    ).toBe(true);
    const t = await load(
      { courseCount: '{"count":9999}' },
      { courseCount: CC },
    );
    expect(t.courseCount).toEqual(CC);
  });

  it("Standard ohne Server-Feld: null; Validator im gemeinsamen Satz", () => {
    expect(DEFAULT_SETTINGS.courseCount).toBeNull();
    expect(layoutValidations.courseCount).toBe(courseCountValue);
  });
});

// ---------------------------------------------------------------------------
describe("Kopf: „aktuell <n> <Bezeichnung>“ statt des Untertitels", () => {
  it("deutsch: Zahl im deutschen Format und fett, Info-Knopf, kein Untertitel", async () => {
    await header({
      assistantSubtitle: "Ihr Kursberater für Musterstadt",
      courseCount: { ...CC, count: 1243, offered: 1243 },
    });
    const line = $("#anything-llm-header-course-count");
    expect(line).not.toBeNull();
    expect(line.textContent).toBe("aktuell 1.243 Kurse");
    const bold = [...line.querySelectorAll("span")].find(
      (el) => el.textContent === "1.243",
    );
    expect(bold.style.fontWeight).toBe("600");
    expect(line.style.whiteSpace).toBe("nowrap");
    expect($("#anything-llm-header-subtitle")).toBeNull();
    expect($("#anything-llm-header").textContent).not.toContain(
      "Ihr Kursberater",
    );
    const b = button();
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("type")).toBe("button");
    expect(b.getAttribute("aria-label")).toBe("Was bedeutet die Zahl?");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(b.style.width).toBe("24px");
    expect(b.style.height).toBe("24px");
    expect(b.querySelector("svg")).not.toBeNull();
    expect(card()).toBeNull();
  });

  it("englisch: „currently 1,243 courses“, englische Beschriftung", async () => {
    await header(
      { courseCount: { ...CC, count: 1243, offered: 1300, word: "courses" } },
      { language: "en" },
    );
    expect($("#anything-llm-header-course-count").textContent).toBe(
      "currently 1,243 courses",
    );
    expect(button().getAttribute("aria-label")).toBe(
      "What does this number mean?",
    );
  });

  it("auch ohne Untertitel (im Design Center leer): Name und Kursanzahl", async () => {
    await header({ assistantSubtitle: "", courseCount: CC, brandText: "VHS" });
    expect($("#anything-llm-header-course-count").textContent).toBe(
      "aktuell 812 Kurse",
    );
    expect($("#anything-llm-header").textContent).toContain("VHS");
  });

  it("ohne courseCount: Untertitel wie bisher (NAK-K5)", async () => {
    await header({ assistantSubtitle: "Ihr Kursberater für Musterstadt" });
    expect($("#anything-llm-header-course-count")).toBeNull();
    expect(button()).toBeNull();
    expect($("#anything-llm-header-subtitle").textContent).toBe(
      "Ihr Kursberater für Musterstadt",
    );
  });

  it("kompakter Kopf (offene Tastatur): keine Zahl, kein Untertitel", async () => {
    await header({ courseCount: CC }, {}, { compact: true });
    expect($("#anything-llm-header-course-count")).toBeNull();
    expect($("#anything-llm-header-subtitle")).toBeNull();
    expect($("#anything-llm-header").textContent).not.toMatch(/812|aktuell/);
  });

  it("veraltet (stand älter als 24 h): Untertitel statt Zahl; genau 24 h noch die Zahl", async () => {
    vi.setSystemTime(Date.parse(STAND) + 24 * 3600 * 1000 + 1);
    await header({ courseCount: CC });
    expect($("#anything-llm-header-course-count")).toBeNull();
    expect($("#anything-llm-header-subtitle").textContent).toBe(
      "Online-Berater mit künstlicher Intelligenz",
    );
    act(() => root.unmount());
    root = createRoot(container);
    vi.setSystemTime(Date.parse(STAND) + 24 * 3600 * 1000);
    await header({ courseCount: CC });
    expect($("#anything-llm-header-course-count")).not.toBeNull();
  });

  it("veraltet mit eigenem Untertitel: der eigene Untertitel", async () => {
    vi.setSystemTime(Date.parse(STAND) + 25 * 3600 * 1000);
    await header({ courseCount: CC, assistantSubtitle: "Eigener Text" });
    expect($("#anything-llm-header-subtitle").textContent).toBe("Eigener Text");
  });
});

// ---------------------------------------------------------------------------
describe("Info-Element: Inhalt (Wortlaut D-K5)", () => {
  const SCOPE = "Enthalten sind die aktuellen Kurse aus unserem Kursprogramm.";
  const STAND_LINE =
    "Stand: heute, 10:00 Uhr, stündlich aktualisiert. Verbindlich ist das Kursprogramm auf unserer Webseite.";
  const GAP =
    "Für eine vollständige Suche nutzen Sie bitte die Kurssuche auf unserer Webseite.";

  it("nichts ausgeblendet, nichts fehlt: Kopfzeile, Umfang, Stand", async () => {
    await header({ courseCount: { ...CC, count: 837, hidden: 0 } });
    click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(card().getAttribute("aria-label")).toBe("Info zur Kursanzahl");
    expect(button().getAttribute("aria-controls")).toBe(card().id);
    expect(cardLines()).toEqual(["837 Kurse im KI-Berater", SCOPE, STAND_LINE]);
    // nur Text, keine Links oder Knöpfe in der Karte
    expect(card().querySelector("a, button")).toBeNull();
    // die Sätze zur Abdeckung von früher entfallen
    expect(card().textContent).not.toMatch(/angebotenen|sind enthalten/);
  });

  it("ausgeblendete und fehlende Kurse (Lücke unter 5 %): beide Zahlen, kein Hinweis auf die Kurssuche", async () => {
    await header({ courseCount: CC });
    click(button());
    expect(cardLines()).toEqual([
      "812 Kurse im KI-Berater",
      SCOPE,
      "14 Kurse sind ausgeblendet, weil sie voraussichtlich beendet sind.",
      "Zurzeit fehlen 25 Kurse.",
      STAND_LINE,
    ]);
  });

  it("Lücke ab 5 %: zusätzlich der Hinweis auf die Kurssuche (ohne Link), Zahlen im deutschen Format", async () => {
    await header({
      courseCount: { ...CC, count: 1243, offered: 1310, hidden: 1050 },
    });
    click(button());
    expect(cardLines()).toEqual([
      "1.243 Kurse im KI-Berater",
      SCOPE,
      "1.050 Kurse sind ausgeblendet, weil sie voraussichtlich beendet sind.",
      "Zurzeit fehlen 67 Kurse.",
      GAP,
      STAND_LINE,
    ]);
    expect(card().querySelector("a")).toBeNull();
  });

  it("nur ausgeblendete, nichts fehlt: keine Zeile zu fehlenden Kursen", async () => {
    await header({ courseCount: { ...CC, count: 837 } });
    click(button());
    expect(cardLines()).toEqual([
      "837 Kurse im KI-Berater",
      SCOPE,
      "14 Kurse sind ausgeblendet, weil sie voraussichtlich beendet sind.",
      STAND_LINE,
    ]);
  });

  it("Grenze 5 %: 95 von 100 mit Hinweis, 96 von 100 ohne, ohne Lücke nie", () => {
    const t = (count) =>
      courseCountTexts({ courseCount: { ...CC, count, offered: 100 } }, NOW);
    expect(t(95).gapHint).toBe(GAP);
    expect(t(95).missingLine).toBe("Zurzeit fehlen 5 Kurse.");
    expect(t(96).gapHint).toBeNull();
    expect(t(96).missingLine).toBe("Zurzeit fehlen 4 Kurse.");
    expect(t(100).gapHint).toBeNull();
    expect(t(100).missingLine).toBeNull();
  });

  it("Einzahl mit der Standardbezeichnung", async () => {
    await header({ courseCount: { ...CC, count: 836, hidden: 1 } });
    click(button());
    expect(cardLines()).toEqual([
      "836 Kurse im KI-Berater",
      SCOPE,
      "1 Kurs ist ausgeblendet, weil er voraussichtlich beendet ist.",
      "Zurzeit fehlt 1 Kurs.",
      STAND_LINE,
    ]);
  });

  it("Einzahl auch ohne Bezeichnung vom Server (Standard der Sprache)", () => {
    const t = courseCountTexts(
      { courseCount: { ...CC, count: 836, hidden: 1, word: null } },
      NOW,
    );
    expect(t.hiddenLine).toBe("1 Kurs ist ausgeblendet, weil er voraussichtlich beendet ist.");
    expect(t.missingLine).toBe("Zurzeit fehlt 1 Kurs.");
  });

  it("eigene Bezeichnung: als Text, auch bei 1 in der Mehrzahl", async () => {
    await header({
      courseCount: {
        ...CC,
        count: 1242,
        offered: 1243,
        hidden: 1,
        word: "Angebote",
      },
    });
    expect($("#anything-llm-header-course-count").textContent).toBe(
      "aktuell 1.242 Angebote",
    );
    click(button());
    expect(cardLines()).toEqual([
      "1.242 Angebote im KI-Berater",
      "Enthalten sind die aktuellen Angebote aus unserem Kursprogramm.",
      "1 Angebote sind ausgeblendet, weil sie voraussichtlich beendet sind.",
      "Zurzeit fehlen 1 Angebote.",
      STAND_LINE,
    ]);
  });

  it("älterer Server ohne hidden: keine Zeile zu ausgeblendeten Kursen", async () => {
    const { hidden: _h, ...older } = CC;
    await header({ courseCount: older });
    click(button());
    expect(cardLines()).toEqual([
      "812 Kurse im KI-Berater",
      SCOPE,
      "Zurzeit fehlen 25 Kurse.",
      STAND_LINE,
    ]);
  });

  it("englisch", async () => {
    await header(
      {
        courseCount: {
          ...CC,
          count: 1243,
          offered: 1310,
          hidden: 14,
          word: "courses",
        },
      },
      { language: "en" },
    );
    click(button());
    expect(card().getAttribute("aria-label")).toBe(
      "About the number of courses",
    );
    expect(cardLines()).toEqual([
      "1,243 courses in the AI advisor",
      "This includes the current courses from our course program.",
      "14 courses are hidden because they have probably ended.",
      "67 courses are currently missing.",
      "For a complete search, please use the course search on our website.",
      "Status: today, 10:00 AM, updated hourly. The course program on our website is binding.",
    ]);
  });

  it("englisch: Einzahl mit der Standardbezeichnung, eigene bleibt in der Mehrzahl", () => {
    const en = (word) =>
      courseCountTexts(
        {
          language: "en",
          courseCount: { ...CC, count: 836, hidden: 1, word },
        },
        NOW,
      );
    expect(en("courses").hiddenLine).toBe("1 course is hidden because it has probably ended.");
    expect(en("courses").missingLine).toBe("1 course is currently missing.");
    expect(en("workshops").hiddenLine).toBe("1 workshops are hidden because they have probably ended.");
    expect(en("workshops").missingLine).toBe(
      "1 workshops are currently missing.",
    );
  });

  it("keine Gedankenstriche in den Zeilen", () => {
    for (const language of ["de", "en"]) {
      const t = courseCountTexts(
        { language, courseCount: { ...CC, count: 612 } },
        NOW,
      );
      for (const line of [
        t.head,
        t.scope,
        t.hiddenLine,
        t.missingLine,
        t.gapHint,
        t.stand,
      ])
        expect(line, language).not.toMatch(/[–—]/);
    }
  });
});

// ---------------------------------------------------------------------------
describe("Stand in Europe/Berlin: heute, gestern, TT.MM.", () => {
  const de = {};
  const en = { language: "en" };
  it("heute und gestern nach dem Kalendertag in Berlin, nicht nach 24 h", () => {
    expect(courseStandText(STAND, de, NOW)).toBe("heute, 10:00 Uhr");
    // 00:30 Uhr in Berlin, in UTC noch der Vortag
    expect(courseStandText("2026-10-23T22:30:00.000Z", de, NOW)).toBe(
      "heute, 00:30 Uhr",
    );
    // 23:50 Uhr in Berlin am Vortag, nur 12 Stunden her
    expect(courseStandText("2026-10-23T21:50:00.000Z", de, NOW)).toBe(
      "gestern, 23:50 Uhr",
    );
    expect(courseStandText("2026-10-22T08:00:00.000Z", de, NOW)).toBe(
      "22.10., 10:00 Uhr",
    );
  });

  it("englisch", () => {
    expect(courseStandText(STAND, en, NOW)).toBe("today, 10:00 AM");
    expect(courseStandText("2026-10-23T12:05:00.000Z", en, NOW)).toBe(
      "yesterday, 2:05 PM",
    );
    expect(courseStandText("2026-10-02T08:00:00.000Z", en, NOW)).toBe(
      "Oct 2, 10:00 AM",
    );
  });

  it("Winterzeit: 08:00 UTC ist 09:00 Uhr in Berlin", () => {
    const now = Date.parse("2026-11-10T12:00:00.000Z");
    expect(courseStandText("2026-11-10T08:00:00.000Z", de, now)).toBe(
      "heute, 09:00 Uhr",
    );
  });
});

// ---------------------------------------------------------------------------
describe("Info-Element: Bedienung (Klick, Escape, Klick daneben, Tab)", () => {
  it("erneuter Klick schließt", async () => {
    await header({ courseCount: CC });
    click(button());
    expect(card()).not.toBeNull();
    mousedown(button());
    click(button());
    expect(card()).toBeNull();
    expect(button().getAttribute("aria-expanded")).toBe("false");
  });

  it("geöffnet steht der Fokus in der Karte; Escape schließt, Fokus zurück auf den Knopf", async () => {
    await header({ courseCount: CC });
    const before = escapeLayerCount();
    click(button());
    expect(document.activeElement).toBe(card());
    expect(escapeLayerCount()).toBe(before + 1);
    const e = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    let taken;
    act(() => {
      taken = closeEscapeLayerFor(e, {
        origin: "widget",
        root: { activeElement: document.activeElement },
      });
    });
    expect(taken).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(card()).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(escapeLayerCount()).toBe(before);
  });

  it("Escape vom Knopf schließt ebenfalls; aus einem anderen Feld schließt Escape das Fenster wie bisher", async () => {
    await header({ courseCount: CC });
    click(button());
    const other = document.createElement("input");
    container.appendChild(other);
    const fromInput = closeEscapeLayerFor(
      new KeyboardEvent("keydown", { key: "Escape" }),
      { origin: "widget", root: { activeElement: other } },
    );
    expect(fromInput).toBe(false);
    expect(card()).not.toBeNull();
    button().focus();
    let taken;
    act(() => {
      taken = closeEscapeLayerFor(
        new KeyboardEvent("keydown", { key: "Escape" }),
        { origin: "widget", root: { activeElement: button() } },
      );
    });
    expect(taken).toBe(true);
    expect(card()).toBeNull();
    other.remove();
  });

  it("Klick daneben schließt, Klick in die Karte nicht", async () => {
    await header({ courseCount: CC });
    click(button());
    mousedown(card().firstChild);
    expect(card()).not.toBeNull();
    mousedown(document.body);
    expect(card()).toBeNull();
  });

  it("Klick daneben im Shadow Root schließt; ein Klick ins Widget zählt auf der Webseite nicht", async () => {
    // Shadow Root nachgestellt: Listener am Root sieht das Ziel im Widget,
    // das document sieht nur den Host (geschlossener Shadow Root)
    const host = document.createElement("div");
    const shadowRoot = new EventTarget();
    embedderSettings.shadowRoot = shadowRoot;
    embedderSettings.hostElement = host;
    await header({ courseCount: CC });
    click(button());
    // Klick in die Karte: am Root innen, am document nur der Host
    act(() => {
      const ev = new MouseEvent("mousedown", { bubbles: true });
      Object.defineProperty(ev, "target", { value: card().firstChild });
      shadowRoot.dispatchEvent(ev);
    });
    act(() => {
      const ev = new MouseEvent("mousedown", { bubbles: true });
      ev.composedPath = () => [host, document.body, document];
      document.dispatchEvent(ev);
    });
    expect(card()).not.toBeNull();
    // Klick auf ein anderes Element im Widget
    act(() => {
      const ev = new MouseEvent("mousedown", { bubbles: true });
      Object.defineProperty(ev, "target", { value: document.body });
      shadowRoot.dispatchEvent(ev);
    });
    expect(card()).toBeNull();
  });

  it("Tab auf ein anderes Element schließt, Fokuswechsel ohne Ziel nicht", async () => {
    await header({ courseCount: CC });
    click(button());
    act(() =>
      card().dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
      ),
    );
    expect(card()).not.toBeNull();
    const next = $('[aria-label="Schließen"]');
    act(() =>
      card().dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: next }),
      ),
    );
    expect(card()).toBeNull();
  });

  it("Tab vom Knopf auf ⋮ schließt die Karte, Wechsel zwischen Knopf und Karte nicht", async () => {
    await header({ courseCount: CC });
    click(button());
    act(() =>
      button().dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: card() }),
      ),
    );
    expect(card()).not.toBeNull();
    act(() =>
      button().dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: $('[aria-label="Optionen"]'),
        }),
      ),
    );
    expect(card()).toBeNull();
  });

  it("Karte liegt über der Datenschutz-Sperre (z-index über 60)", async () => {
    await header({ courseCount: CC });
    click(button());
    expect(Number(card().style.zIndex)).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------------------
describe("Inline: eingeklappte Leiste ohne Zahl", () => {
  it("Leiste zeigt nur ihren Text, auch mit courseCount", async () => {
    const matchMediaBefore = window.matchMedia;
    window.matchMedia = (q) => ({
      matches: q === "(min-width: 768px)",
      media: q,
      addEventListener() {},
      removeEventListener() {},
    });
    const mountTarget = document.createElement("div");
    document.body.appendChild(mountTarget);
    const host = document.createElement("div");
    mountTarget.appendChild(host);
    embedderSettings.hostElement = host;
    const settings = await load(
      { displayMode: "inline" },
      { displayMode: "inline", courseCount: CC },
    );
    expect(settings.courseCount).toEqual(CC);
    render(
      <InlineChat
        settings={{ ...settings, ...BASE }}
        mountTarget={mountTarget}
        sessionId="s-1"
        conversationId="c-1"
      />,
    );
    const bar = $("#anything-llm-inline-bar");
    expect(bar).not.toBeNull();
    expect(bar.textContent).not.toMatch(/812|aktuell/);
    expect($("#anything-llm-header-course-count")).toBeNull();
    mountTarget.remove();
    window.matchMedia = matchMediaBefore;
  });
});
