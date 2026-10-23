import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";

// KIE-565 Nachträge (issues/rollout-721/nachtraege-7.22-rc6.md, Teil
// Widget):
//   Punkt 2: Schrift auf der Kundenfarbe (userTextColor) gilt wie gewählt für
//     Nutzerblasen und alle Flächen in Kundenfarbe; ohne Wert die Empfehlung
//     nach WCAG-Kontrast (utils/contrast.js, wortgleich im Fork)
//   Punkt 4: Startvorschlag-Pillen wie die Folgefragen-Pillen
//   Punkt 5: KI-Kurzbeschreibung in der Chatblase ganz statt „…“
// utils/contrast.js wird je Test dynamisch geladen: am alten Stand fehlt die
// Datei, jeder Test scheitert dann einzeln.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

vi.mock("../src/main.jsx", () => ({
  embedderSettings: {
    settings: {},
    USER_STYLES: { msgBg: "#01a5a9", msgText: "#FFFFFF" },
    ASSISTANT_STYLES: {},
    shadowRoot: null,
    hostElement: null,
  },
  inlineTailwindStyles: () => Promise.resolve(false),
}));
vi.mock("@/models/chatService", () => ({
  default: {
    getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
    streamChat: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock("@/components/ChatWindow", () => ({ SEND_TEXT_EVENT: "send-text" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
  I18nextProvider: ({ children }) => children,
}));

import { embedderSettings } from "../src/main.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import {
  DARK,
  DEFAULT_ACCENT,
  ON_ACCENT_TEXT,
  buildThemeCss,
  resolveThemeVars,
} from "../src/utils/theme.js";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import { SuggestedPills } from "../src/components/ChatWindow/ChatContainer/ChatHistory/PanelWelcome/index.jsx";
import OpenButton from "../src/components/OpenButton/index.jsx";
import { EmbedModeContext } from "../src/hooks/useEmbedMode.js";

// Pfad als Variable: am alten Stand (ohne Datei) scheitert nur der Test,
// nicht schon das Laden der ganzen Datei
const CONTRAST_PATH = "../src/utils/contrast.js";
const contrastModule = () => import(/* @vite-ignore */ CONTRAST_PATH);
const src = (p) => readFileSync(`${process.cwd()}/${p}`, "utf8");

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = (el) => act(() => root.render(el));
const $$ = (sel) => [...container.querySelectorAll(sel)];
const inline = (el) => (
  <EmbedModeContext.Provider
    value={{ inline: true, overlay: false, consumeFocusRequest: () => false }}
  >
    {el}
  </EmbedModeContext.Provider>
);

const KUNDENFARBEN = [
  DEFAULT_ACCENT, // Kufer-Standard (Petrol #007c82 seit 23.10.2026)
  "#01a5a9", // Würfel-Türkis, Standard bis 23.10.2026
  "#607D8B",
  "#FFA102",
  "#ffd400",
  "#0b5f8a",
  "#7a1f5c",
  "#FFFFFF",
  "#000000",
  "#e30613",
];

// ---------------------------------------------------------------------------
// Punkt 2: Empfehlung nach WCAG 2.x (wortgleich im Fork)
// ---------------------------------------------------------------------------
describe("Punkt 2: Kontrast nach WCAG 2.x (utils/contrast.js)", () => {
  it("relative Luminanz und Kontrast: Referenzwerte", async () => {
    const { relativeLuminance, contrastRatio } = await contrastModule();
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 6);
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 6);
    expect(relativeLuminance("rgb(255, 255, 255)")).toBeCloseTo(1, 6);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 6);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 6);
    // bekannte Grenzfarbe: #767676 auf Weiß 4,54:1
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#01a5a9", "#FFFFFF")).toBeCloseTo(3.02, 2);
    expect(contrastRatio("#01a5a9", "#000000")).toBeCloseTo(6.96, 2);
    expect(contrastRatio("#007c82", "#FFFFFF")).toBeCloseTo(4.99, 2);
    expect(contrastRatio("#007c82", "#222628")).toBeCloseTo(3.06, 2);
    expect(relativeLuminance("blau")).toBe(null);
    expect(contrastRatio("blau", "#FFFFFF")).toBe(null);
  });

  // Entscheidung E1 (Fixliste 7.22-rc7): „Schwarz“ ist die gezeigte Farbe
  // #222628, Empfehlung und Kontrast rechnen damit
  it("Empfehlung: höherer Kontrast gewinnt, Gleichstand Weiß, ungültig Weiß", async () => {
    const { recommendedTextColor, contrastRatio } = await contrastModule();
    expect(recommendedTextColor("#01a5a9")).toBe("#222628");
    expect(recommendedTextColor("#007c82")).toBe("#FFFFFF");
    expect(recommendedTextColor("#0b5f8a")).toBe("#FFFFFF");
    expect(recommendedTextColor("#FFFFFF")).toBe("#222628");
    expect(recommendedTextColor("#000000")).toBe("#FFFFFF");
    expect(recommendedTextColor("#ffd400")).toBe("#222628");
    expect(recommendedTextColor("#7a1f5c")).toBe("#FFFFFF");
    expect(recommendedTextColor(null)).toBe("#FFFFFF");
    expect(recommendedTextColor("url(x)")).toBe("#FFFFFF");
    // alle Grautöne: Wahl = höherer Kontrast, bei Gleichstand (>=) Weiß
    for (let v = 0; v <= 255; v++) {
      const hex = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      const w = contrastRatio(hex, "#FFFFFF");
      const b = contrastRatio(hex, "#222628");
      expect(recommendedTextColor(hex)).toBe(w >= b ? "#FFFFFF" : "#222628");
    }
  });

  it("Text in Kundenfarbe mit mindestens 4,5:1 (abgedunkelt bzw. aufgehellt)", async () => {
    const { accessibleTextColor, contrastRatio, relativeLuminance } =
      await contrastModule();
    // reicht schon: Farbe selbst
    expect(accessibleTextColor("#0b5f8a", ["#FFFFFF"])).toBe("#0B5F8A");
    for (const c of KUNDENFARBEN) {
      const light = accessibleTextColor(c, ["#FFFFFF"]);
      expect(contrastRatio(light, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      // hell nur dunkler, nie heller
      expect(relativeLuminance(light)).toBeLessThanOrEqual(
        relativeLuminance(c) + 1e-9,
      );
      const dark = accessibleTextColor(c, [DARK.bg, DARK.surface]);
      expect(contrastRatio(dark, DARK.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark, DARK.surface)).toBeGreaterThanOrEqual(4.5);
      expect(relativeLuminance(dark)).toBeGreaterThanOrEqual(
        relativeLuminance(c) - 1e-9,
      );
    }
    expect(accessibleTextColor("blau", ["#FFFFFF"])).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Punkt 2: Schrift auf der Kundenfarbe im Widget
// ---------------------------------------------------------------------------
describe("Punkt 2: Schrift auf der Kundenfarbe (userTextColor)", () => {
  it("ohne Wert: Empfehlung aus der Kundenfarbe für Nutzerblase und Flächen in Kundenfarbe", async () => {
    const { recommendedTextColor } = await contrastModule();
    for (const mode of ["light", "dark"])
      for (const c of KUNDENFARBEN) {
        const vars = resolveThemeVars({ buttonColor: c, userBgColor: c }, mode);
        expect(vars["--allm-user-text"]).toBe(recommendedTextColor(c));
        expect(vars["--allm-on-accent"]).toBe(recommendedTextColor(c));
      }
    // Kufer-Standard Petrol ohne jede Angabe: Weiß (4,99:1 statt 3,06:1 mit
    // #222628; bis 23.10.2026 beim Türkis Schwarz #222628)
    expect(resolveThemeVars({}, "light")["--allm-user-text"]).toBe("#FFFFFF");
    expect(resolveThemeVars({}, "light")["--allm-on-accent"]).toBe("#FFFFFF");
  });

  it("gewählter Wert gilt wie gewählt, auch unter 4,5:1 (Weiß, Schwarz, #222628 vom Server)", () => {
    for (const chosen of ["#FFFFFF", "#000000", "#222628"])
      for (const mode of ["light", "dark"]) {
        const vars = resolveThemeVars(
          {
            buttonColor: "#ffd400",
            userBgColor: "#ffd400",
            userTextColor: chosen,
          },
          mode,
        );
        expect(vars["--allm-user-text"]).toBe(chosen);
        expect(vars["--allm-on-accent"]).toBe(chosen);
      }
  });

  it("Server ohne userTextColor: Settings ohne Wert, Stylesheet mit der Empfehlung; gespeicherter Wert bleibt", async () => {
    const BASE = {
      embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
      baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
    };
    const fetchConfig = (config) =>
      vi.fn(async () => ({ ok: true, json: async () => config }));
    const neu = await loadEmbedSettings(
      BASE,
      fetchConfig({ buttonColor: "#FFA102", userBgColor: "#FFA102" }),
    );
    expect(neu.userTextColor ?? null).toBe(null);
    const css = buildThemeCss(neu, "light");
    // seit Fixliste 7.22-rc17 (E23) direkt gesetzt, ohne --allm-* der Seite
    expect(css).toContain("--allmi-user-text: #222628 !important;");
    expect(css).toContain("--allmi-on-accent: #222628 !important;");
    const alt = await loadEmbedSettings(
      BASE,
      fetchConfig({
        buttonColor: "#FFA102",
        userBgColor: "#FFA102",
        userTextColor: "#FFFFFF",
      }),
    );
    expect(alt.userTextColor).toBe("#FFFFFF");
    expect(buildThemeCss(alt, "dark")).toContain(
      "--allmi-on-accent: #FFFFFF !important;",
    );
  });

  it("alle Flächen in Kundenfarbe nutzen --allm-on-accent (Senden-Button, Icon-Kreis, Chat-Button, Pillen-Hover, Rückmeldung)", () => {
    expect(ON_ACCENT_TEXT).toBe("var(--allmi-on-accent, #FFFFFF)");
    // Chat-Button: gerendert
    render(
      <OpenButton
        settings={{ buttonColor: "#ffd400", chatIcon: "chatBubble" }}
        isOpen={false}
        toggleOpen={() => {}}
      />,
    );
    const btn = container.querySelector("#anything-llm-embed-chat-button");
    expect(btn.style.color).toBe("var(--allmi-on-accent, #FFFFFF)");
    expect(btn.className).not.toContain("allm-text-white");
    // Leiste (Senden-Button und Icon-Kreis), Pillen-Hover, Rückmeldung
    const inlineSrc = src("src/components/InlineChat/index.jsx");
    expect(inlineSrc.match(/color: ON_ACCENT_TEXT,/g)).toHaveLength(2);
    const hist = src(
      "src/components/ChatWindow/ChatContainer/ChatHistory/HistoricalMessage/index.jsx",
    );
    expect(hist).toMatch(
      /backgroundColor: `var\(--allmi-accent, \$\{accent\}\)`,\s*color: ON_ACCENT_TEXT,/,
    );
    const main = src("src/main.jsx").replace(/\s+/g, " ");
    expect(main).toContain(
      // Hover nur mit echtem Zeiger (Fixliste 7.22-rc7 Nr. 34), Fokus immer
      "@media (hover: hover) { .allm-pill-accent:hover { background-color: var(--allmi-accent, ${DEFAULT_ACCENT}) !important; border-color: var(--allmi-accent, ${DEFAULT_ACCENT}) !important; color: ${ON_ACCENT_TEXT} !important; } }",
    );
    expect(main).toContain(
      ".allm-pill-accent:focus-visible { background-color: var(--allmi-accent, ${DEFAULT_ACCENT}) !important; border-color: var(--allmi-accent, ${DEFAULT_ACCENT}) !important; color: ${ON_ACCENT_TEXT} !important; }",
    );
  });
});

// ---------------------------------------------------------------------------
// Punkt 4: Startvorschläge wie Folgefragen
// ---------------------------------------------------------------------------
const MSGS = ["Welche Sprachkurse gibt es?", "Kurse am Wochenende"];
const ANSWER = {
  role: "assistant",
  content: "Gern.",
  sentAt: 1759651205,
  chatId: 3,
  sources: [],
  followUps: MSGS,
};

describe("Punkt 4: Startvorschlag-Pillen = Folgefragen-Pillen", () => {
  it("gleiche Klassen und gleiche Optik (Rand und Text in Kundenfarbe, Umbruch)", () => {
    render(
      <div>
        <SuggestedPills
          settings={{ suggestionStyle: "pills", defaultMessages: MSGS }}
        />
        <ChatHistory
          settings={{ followUps: "pills" }}
          history={[
            { role: "user", content: "Hallo", sentAt: 1759651200 },
            ANSWER,
          ]}
        />
      </div>,
    );
    const start = $$("#anything-llm-suggestion-pills button");
    const follow = $$("#anything-llm-follow-ups button");
    expect(start).toHaveLength(2);
    expect(follow).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(start[i].className).toBe(follow[i].className);
      expect(start[i].style.cssText).toBe(follow[i].style.cssText);
    }
    for (const b of [...start, ...follow]) {
      expect(b.className.split(" ")).toEqual(
        expect.arrayContaining(["allm-inline-chip", "allm-pill-accent"]),
      );
      expect(b.style.border).toContain("--allmi-pill-border");
      expect(b.style.border).toContain("--allmi-accent");
      expect(b.style.color).toContain("--allmi-pill-accent-text");
      expect(b.style.backgroundColor).toContain("--allmi-pill-bg");
    }
  });

  it("Pillen-Text in Kundenfarbe ≥ 4,5:1 zur Fläche, hell und dunkel; Rand folgt der Kundenfarbe", async () => {
    const { contrastRatio } = await contrastModule();
    for (const c of KUNDENFARBEN) {
      const light = resolveThemeVars({ buttonColor: c }, "light");
      expect(light["--allm-pill-bg"]).toBe("#FFFFFF");
      expect(light["--allm-pill-border"]).toBe(c);
      const lt = light["--allm-pill-accent-text"];
      const lText = lt === "var(--allmi-accent)" ? c : lt;
      expect(contrastRatio(lText, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      const dark = resolveThemeVars({ buttonColor: c }, "dark");
      expect(dark["--allm-pill-bg"]).toBe("transparent");
      const dt = dark["--allm-pill-accent-text"];
      const dText = dt === "var(--allmi-accent)" ? c : dt;
      expect(contrastRatio(dText, DARK.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dText, DARK.surface)).toBeGreaterThanOrEqual(4.5);
    }
    // Kundenfarbe reicht: Text bleibt die Kundenfarbe (folgt --allm-accent)
    expect(
      resolveThemeVars({ buttonColor: "#0b5f8a" }, "light")[
        "--allm-pill-accent-text"
      ],
    ).toBe("var(--allmi-accent)");
    // Kufer-Standard Petrol reicht hell (4,99:1 auf Weiß): Text bleibt die
    // Akzentfarbe
    expect(resolveThemeVars({}, "light")["--allm-pill-accent-text"]).toBe(
      "var(--allmi-accent)",
    );
    // Türkis hell abgedunkelt (3,02:1 reicht nicht, #018487 hat 4,52:1)
    expect(
      resolveThemeVars({ buttonColor: "#01a5a9" }, "light")[
        "--allm-pill-accent-text"
      ],
    ).toBe("#018487");
  });

  it("Hover/Fokus füllt in Kundenfarbe mit der Schrift auf der Kundenfarbe", () => {
    const vars = resolveThemeVars(
      { buttonColor: "#ffd400", userTextColor: "#000000" },
      "light",
    );
    expect(vars["--allm-on-accent"]).toBe("#000000");
    const main = src("src/main.jsx").replace(/\s+/g, " ");
    expect(main).toMatch(
      /@media \(hover: hover\) \{ \.allm-pill-accent:hover \{ background-color: var\(--allmi-accent/,
    );
    expect(main).toMatch(
      /\.allm-pill-accent:focus-visible \{ background-color: var\(--allmi-accent/,
    );
    expect(ON_ACCENT_TEXT).toContain("--allmi-on-accent");
  });

  it("Inline: dieselben Pillen im Panel", () => {
    render(
      inline(
        <SuggestedPills
          settings={{ suggestionStyle: "pills", defaultMessages: MSGS }}
        />,
      ),
    );
    for (const b of $$("#anything-llm-suggestion-pills button")) {
      expect(b.className).toContain("allm-pill-accent");
      expect(b.style.color).toContain("--allmi-pill-accent-text");
    }
  });
});

// ---------------------------------------------------------------------------
// Punkt 5: Kurzbeschreibung in der Chatblase
// ---------------------------------------------------------------------------
const COURSE_BASE = "https://aw.donau.kufer.de/kurssuche/kurs";
const YOGA = {
  url: `${COURSE_BASE}/yoga-aufbaukurs/262-3103`,
  title: "Yoga (Aufbaukurs)",
  start_date: "2026-09-14",
  start_minutes: 1080,
  weekdays: ",mon,",
  price: 60,
  bookable: true,
  format: "onsite",
};
const ENGLISH = {
  url: `${COURSE_BASE}/englisch-1/262-4601A`,
  title: "Englisch 1",
  start_date: "2026-09-16",
  start_minutes: 1110,
  weekdays: ",wed,",
  price: 90,
  bookable: true,
  format: "online",
};
const TEASERS = {
  [YOGA.url]:
    "Für alle mit etwas Yoga-Erfahrung: kräftigende Haltungen, ruhige Atemübungen und ein entspannter Ausklang am Montagabend.",
  [ENGLISH.url]:
    "Online-Einstieg in Englisch mit viel Sprechpraxis für den Alltag, ganz ohne Vorkenntnisse.",
};
const SETTINGS = {
  courseCards: "auto",
  courseCardsPosition: "above",
  courseCardsLayout: "rows",
};
const user = { role: "user", content: "Yoga am Abend?", sentAt: 1759651200 };
const reply = `Ja: [${YOGA.title}](${YOGA.url}) und [${ENGLISH.title}](${ENGLISH.url}).`;
const answer = (extra = {}) => ({
  role: "assistant",
  content: reply,
  sentAt: 1759651205,
  chatId: 3,
  sources: [],
  courseSources: [{ ...YOGA }, { ...ENGLISH }],
  courseCardsAnnounced: 2,
  courseTeasers: TEASERS,
  ...extra,
});
const streaming = (extra = {}) =>
  answer({
    uuid: "u",
    content: "",
    chatId: undefined,
    animate: true,
    pending: true,
    courseTeasers: undefined,
    ...extra,
  });

describe("Punkt 5: KI-Kurzbeschreibung in der Chatblase ganz lesbar", () => {
  it("Chatblase: Teaser ohne Zeilenklammer (kein „…“), voller Text", () => {
    render(<ChatHistory settings={SETTINGS} history={[user, answer()]} />);
    const t = $$("[data-course-teaser]");
    expect(t).toHaveLength(2);
    for (const el of t) {
      expect(el.style.webkitLineClamp || el.style.WebkitLineClamp).toBe("none");
      expect(el.style.display).toBe("block");
      expect(el.style.overflow).toBe("visible");
    }
    expect(t.map((el) => el.textContent)).toEqual([
      TEASERS[YOGA.url],
      TEASERS[ENGLISH.url],
    ]);
  });

  it("Chatblase im Stream: Platzhalter reserviert 3 Zeilen, der Teaser behält mindestens diese Höhe", () => {
    render(<ChatHistory settings={SETTINGS} history={[user, streaming()]} />);
    const pending = $$("[data-teaser-pending]");
    expect(pending).toHaveLength(2);
    for (const p of pending) expect(p.style.height).toBe("54px");
    render(
      <ChatHistory
        settings={SETTINGS}
        history={[
          user,
          streaming({ courseTeasers: TEASERS, teaserArrivedAt: Date.now() }),
        ]}
      />,
    );
    for (const el of $$("[data-course-teaser]")) {
      expect(el.style.webkitLineClamp || el.style.WebkitLineClamp).toBe("none");
      expect(el.style.minHeight).toBe("54px");
    }
  });

  it("Inline unverändert: Teaser geklammert (Zeilen-Karte 2 bzw. 3 Zeilen)", () => {
    render(
      inline(<ChatHistory settings={SETTINGS} history={[user, answer()]} />),
    );
    for (const el of $$("[data-course-teaser]"))
      expect(el.style.webkitLineClamp || el.style.WebkitLineClamp).toMatch(
        /^[23]$/,
      );
  });
});
