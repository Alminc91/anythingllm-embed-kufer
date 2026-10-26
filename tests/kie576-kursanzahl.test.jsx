import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";

// KIE-576 Paket 3, Teil Widget (issues/KIE-576/KIE-576-kursanzahl.md,
// Abschnitt „Widget“ und Nachträge 26.10.2026, AK-K5, NAK-K3, NAK-K5,
// Fixliste r4 Nr. 1): Mit courseCount vom Server steht im Kopf statt des
// Untertitels „aktuell 837 Kurse“, die Zahl fett, ohne Info-Knopf und ohne
// Karte (fehlende und ausgeblendete Kurse und der Stand sind Betreiber-Info).
// Der Vertrag liest nur count und word; ob die Kursliste aktuell ist,
// entscheidet der Server. Kompakter Kopf und eingeklappte Inline-Leiste ohne
// Zahl. Die Fokus-Regel aus r3-W1 (escapeLayerHoldsFocus) gilt weiter für
// jede offene Ebene. Maße und Optik im Browser (browser_guide der Rückgabe),
// hier Inhalt, Sprache und Rückfälle.

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
import PromptInput from "../src/components/ChatWindow/ChatContainer/PromptInput/index.jsx";
import * as courseCountModule from "../src/utils/courseCount.js";
import { courseCountTexts } from "../src/utils/courseCount.js";
import {
  courseCountValue,
  courseCountWordValue,
  layoutValidations,
  UI_TEXTS,
} from "../src/utils/layout.js";
import { useEscapeLayer } from "../src/utils/escape.js";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// Beispielwerte des Vertrags (Fixliste r4 Nr. 2: öffentlich nur count, word)
const CC = { count: 812, word: "Kurse" };
// Antwort eines Servers vor r4 (mit offered, hidden und stand)
const OLDER = {
  count: 812,
  offered: 837,
  hidden: 14,
  stand: "2026-10-24T08:00:00.000Z",
  word: "Kurse",
};
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server = {}) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let container;
let root;
beforeEach(() => {
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

// ---------------------------------------------------------------------------
describe("Feld courseCount: nur vom Server, geprüft (nur count und word)", () => {
  it("gültig: übernommen, Bezeichnung getrimmt, weitere Schlüssel fallen weg", async () => {
    const s = await load(
      {},
      { courseCount: { ...CC, word: " Angebote ", x: 1 } },
    );
    expect(s.courseCount).toEqual({ count: 812, word: "Angebote" });
  });

  it("ohne Bezeichnung: word null (Standard der Sprache)", async () => {
    const s = await load({}, { courseCount: { count: 812 } });
    expect(s.courseCount).toEqual({ count: 812, word: null });
  });

  it("fehlen offered, hidden und stand, ist das kein Fehler (r4)", () => {
    expect(courseCountValue(CC)).toEqual(CC);
  });

  it("älterer Server mit offered, hidden und stand: nur count und word, auch bei altem oder ungültigem stand", async () => {
    for (const older of [
      OLDER,
      { ...OLDER, stand: "2020-01-01T00:00:00.000Z" },
      { ...OLDER, stand: "gestern" },
      { ...OLDER, offered: 1, hidden: -3 },
    ]) {
      const s = await load({}, { courseCount: older });
      expect(s.courseCount, JSON.stringify(older)).toEqual(CC);
    }
  });

  it("ungültig: null, der Kopf zeigt den Untertitel", async () => {
    for (const bad of [
      { ...CC, count: 0 },
      { ...CC, count: -3 },
      { ...CC, count: 1.5 },
      { ...CC, count: "812" },
      { ...CC, count: null },
      { ...CC, count: 2 ** 53 },
      { word: "Kurse" },
      [CC],
      "812",
      812,
      null,
    ]) {
      const s = await load({}, { courseCount: bad });
      expect(s.courseCount, JSON.stringify(bad)).toBeNull();
    }
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
    expect(courseCountTexts({ courseCount: v }).word).toBe("Kurse");
    expect(courseCountTexts({ courseCount: v, language: "en" }).word).toBe(
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
  it("deutsch: Zahl im deutschen Format und fett, eine Zeile, kein Untertitel", async () => {
    await header({
      assistantSubtitle: "Ihr Kursberater für Musterstadt",
      courseCount: { ...CC, count: 1243 },
    });
    const line = $("#anything-llm-header-course-count");
    expect(line).not.toBeNull();
    expect(line.textContent).toBe("aktuell 1.243 Kurse");
    const bold = [...line.querySelectorAll("span")].find(
      (el) => el.textContent === "1.243",
    );
    expect(bold.style.fontWeight).toBe("600");
    expect(line.style.whiteSpace).toBe("nowrap");
    expect(line.style.textOverflow).toBe("ellipsis");
    expect($("#anything-llm-header-subtitle")).toBeNull();
    expect($("#anything-llm-header").textContent).not.toContain(
      "Ihr Kursberater",
    );
  });

  it("kein Info-Knopf und keine Karte (Fixliste r4 Nr. 1)", async () => {
    await header({ courseCount: OLDER });
    const line = $("#anything-llm-header-course-count");
    expect(line.textContent).toBe("aktuell 812 Kurse");
    expect($("#anything-llm-course-count-button")).toBeNull();
    expect(line.querySelector("button, svg, [role]")).toBeNull();
    expect($('[role="dialog"]')).toBeNull();
    expect($("#anything-llm-header").textContent).not.toMatch(
      /ausgeblendet|fehlen|Stand|im KI-Berater|837|14 Kurse/,
    );
  });

  it("englisch: „currently 1,243 courses“", async () => {
    await header(
      { courseCount: { count: 1243, word: "courses" } },
      { language: "en" },
    );
    expect($("#anything-llm-header-course-count").textContent).toBe(
      "currently 1,243 courses",
    );
  });

  it("eigene Bezeichnung als Text", async () => {
    await header({ courseCount: { count: 1242, word: "Angebote" } });
    expect($("#anything-llm-header-course-count").textContent).toBe(
      "aktuell 1.242 Angebote",
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
    expect($("#anything-llm-header-subtitle").textContent).toBe(
      "Ihr Kursberater für Musterstadt",
    );
  });

  it("ungültiges courseCount: Standard-Untertitel (NAK-K5)", async () => {
    await header({ courseCount: { ...CC, count: 0 } });
    expect($("#anything-llm-header-course-count")).toBeNull();
    expect($("#anything-llm-header-subtitle").textContent).toBe(
      "Online-Berater mit künstlicher Intelligenz",
    );
  });

  it("kompakter Kopf (offene Tastatur): keine Zahl, kein Untertitel", async () => {
    await header({ courseCount: CC }, {}, { compact: true });
    expect($("#anything-llm-header-course-count")).toBeNull();
    expect($("#anything-llm-header-subtitle")).toBeNull();
    expect($("#anything-llm-header").textContent).not.toMatch(/812|aktuell/);
  });

  it("Texte der Zeile: nur Untertitel-Zeile, keine Gedankenstriche", () => {
    for (const language of ["de", "en"]) {
      const t = courseCountTexts({ language, courseCount: CC });
      expect(Object.keys(t).sort()).toEqual(
        ["count", "lead", "number", "subtitle", "word"].sort(),
      );
      expect(t.subtitle, language).not.toMatch(/[–—]/);
    }
    expect(courseCountTexts({ courseCount: null })).toBeNull();
  });

  it("die Texte der Karte und ihre Hilfsfunktionen sind entfernt", () => {
    for (const lang of ["de", "en"])
      for (const key of [
        "courseCountInfo",
        "courseCountDialog",
        "courseCountHead",
        "courseCountScope",
        "courseCountHidden",
        "courseCountHiddenOne",
        "courseCountMissing",
        "courseCountMissingOne",
        "courseCountGap",
        "courseCountStand",
      ])
        expect(UI_TEXTS[lang], `${lang}.${key}`).not.toHaveProperty(key);
    expect(Object.keys(courseCountModule).sort()).toEqual(
      ["courseCountTexts", "formatCourseNumber"].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Fixliste r3 Nr. 1 (r3-W1), weiter gültig nach r4: PromptInput holt sich am
// Ende einer Antwort den Fokus nicht, solange eine offene Ebene ihn hält
// (Kommentarfeld, Datenschutz-Fenster). Im Shadow Root wie im Widget:
// document.activeElement ist dann der Host.
describe("Fokus-Regel escapeLayerHoldsFocus (r3-W1) bleibt", () => {
  function Layer({ open }) {
    const ref = useRef(null);
    useEscapeLayer(open, () => {}, { within: () => [ref.current] });
    return <textarea id="layer-field" ref={ref} />;
  }

  async function layerAndInput(open) {
    const settings = {
      ...(await load({}, { courseCount: CC })),
      loaded: true,
      enableStt: false,
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const mount = document.createElement("div");
    shadow.appendChild(mount);
    embedderSettings.shadowRoot = shadow;
    embedderSettings.hostElement = host;
    const shadowReactRoot = createRoot(mount);
    const ui = (inputDisabled) => (
      <>
        <ChatWindowHeader settings={settings} />
        <Layer open={open} />
        <PromptInput
          settings={settings}
          message=""
          submit={() => {}}
          onChange={() => {}}
          inputDisabled={inputDisabled}
          buttonDisabled={inputDisabled}
        />
      </>
    );
    act(() => shadowReactRoot.render(ui(true)));
    return {
      q: (sel) => shadow.querySelector(sel),
      focused: () => shadow.activeElement,
      answerEnds: () => act(() => shadowReactRoot.render(ui(false))),
      done: () => {
        act(() => shadowReactRoot.unmount());
        host.remove();
      },
    };
  }

  it("Antwort endet, Fokus in einer offenen Ebene: der Fokus bleibt dort", async () => {
    const w = await layerAndInput(true);
    try {
      const field = w.q("#layer-field");
      field.focus();
      expect(w.focused()).toBe(field);
      w.answerEnds();
      expect(w.focused()).toBe(field);
    } finally {
      w.done();
    }
  });

  it("Antwort endet ohne offene Ebene: das Eingabefeld holt den Fokus wie bisher", async () => {
    const w = await layerAndInput(false);
    try {
      w.q("#layer-field").focus();
      w.answerEnds();
      expect(w.focused()).toBe(w.q("#message-input"));
    } finally {
      w.done();
    }
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
