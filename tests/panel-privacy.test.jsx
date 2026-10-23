import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";

// Panel-Optik (Pillen, Begrüßungsblase, Kopfzeile mit Untertitel/Online-
// Punkt), Datenschutz-Texte und KI-Hinweis: Settings/Validierung, Rendering.
// Bewusste Änderung (7.23, Datenschutz in der Fußzeile, Nutzerentscheidungen
// 23.10.2026): die Datenschutz-Blase unter der Begrüßung und der
// Einmal-Hinweis mit Bestätigung („modal“, Knopf „Start“, Sperre,
// localStorage) entfallen; ihre Tests sind entfernt. Link und
// Datenschutz-Fenster prüft tests/datenschutz-fenster.test.jsx.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
const chatService = vi.hoisted(() => ({
  streamChat: vi.fn(() => new Promise(() => {})), // Antwort bleibt aus
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

import { embedderSettings } from "../src/main.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import {
  DEFAULT_GREETING_BUBBLE_TEXT,
  DEFAULT_PRIVACY_POINTS,
  DEFAULT_PRIVACY_TITLE,
  INLINE_CHIPS_MAX,
  PANEL_TEXTS,
  layoutValidations,
  panelLanguage,
  panelPills,
} from "../src/utils/layout.js";
import * as layout from "../src/utils/layout.js";
import {
  DEFAULT_ACCENT,
  THEME_VARIABLES,
  buildThemeCss,
  resolveThemeVars,
} from "../src/utils/theme.js";
import ChatContainer, {
  SEND_TEXT_EVENT,
  sendSuggestion,
} from "../src/components/ChatWindow/ChatContainer/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";
import { EmbedModeContext } from "../src/hooks/useEmbedMode.js";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const MSGS = ["Spanisch A1", "Yoga", "KI-Basics", "Töpfern"];
const GREETING = "Dieser Chatbot nutzt KI.";

function fetchConfig(config) {
  return vi.fn(async () => ({ ok: true, json: async () => config }));
}

let container;
let root;
// jsdom kennt Element.scrollTo nicht (ChatHistory scrollt nach unten)
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  chatService.streamChat.mockClear();
  window.localStorage.clear();
  embedderSettings.settings = {};
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(el) {
  act(() => root.render(el));
}
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => [...container.querySelectorAll(sel)];

// ---------------------------------------------------------------------------
describe("Settings: Script-Attribute + visual_config (AK-7, NAK-4)", () => {
  // Bewusste Änderung (Design Center vereinfacht, 15.10.2026): der Standard
  // ohne Attribute ist das neue Design (Pillen, Begrüßungsblase, Datenschutz-
  // Blase, KI-Hinweis, kein Online-Punkt), nicht mehr die alte Darstellung.
  it("Standard ohne Attribute = neues Design (feste Standards)", async () => {
    const s = await loadEmbedSettings(BASE, fetchConfig({}));
    expect(s.suggestionStyle).toBe("pills");
    expect(s.greetingStyle).toBe("bubble");
    expect(s.onlineDot).toBe(false);
    // Bewusste Änderung (Fixliste 7.22-rc8 R5): ohne Server-Wert zeigt das
    // Widget den Untertitel-Standard der Sprache (vorher null = nie
    // automatisch); "" vom Server = keiner (tests/rc8-fixes.test.jsx)
    expect(s.assistantSubtitle).toBe(
      "Online-Berater mit künstlicher Intelligenz",
    );
    // Bewusste Änderung (7.23): immer der Link „Datenschutz“
    expect(s.privacyNotice).toBe("link");
    expect(s.privacyUrl).toBe(null);
    expect(s.greetingBubbleText).toBe(null); // Standard der Sprache
    expect(s.greeting).toBe(null); // früher der Datenschutzsatz
    expect(s.privacyTitle).toBe(null);
    expect(s.privacyText).toBe(null);
    expect(s.privacyButtonText).toBe(null);
    expect(s.disclaimer).toBe("footer");
    expect(s.disclaimerText).toBe(null);
    expect(s.followUps).toBe("pills");
    expect(s.sendMessageText).toBe(null); // Standard „Stellen Sie hier Ihre Frage …“
    expect(s.assistantName).toBe("KI-Berater");
    expect(s.brandText).toBe("KI-Berater");
  });

  // Bewusste Änderung (Fixliste 7.22-rc17 E23, E24): Texte, die das Design
  // Center einstellt (Begrüßung, Untertitel, Datenschutz), wirken per
  // Skript-Attribut nicht mehr; feste Standards ohne Feld (Vorschlags- und
  // Begrüßungsstil, Folgefragen) verfeinert ein Skript-Attribut; der
  // KI-Hinweis bleibt fest, den Online-Punkt gibt es nicht mehr.
  // Bewusste Änderung (7.23): E26 (greetingStyle "bubble" gegen "text", weil
  // die Datenschutz-Blase die Begrüßungsblase brauchte) entfällt mit der
  // Blase; data-greeting-style verfeinert wieder wie jeder feste Standard.
  it("Script-Attribute (data-*): Design-Center-Texte wirken nicht, feste Standards verfeinerbar, KI-Hinweis fest", async () => {
    const s = await loadEmbedSettings(
      {
        ...BASE,
        suggestionStyle: "bars",
        greetingStyle: "text",
        greetingBubbleText: "  Hallo!  ",
        assistantSubtitle: "durchsucht 1.243 Kurse",
        onlineDot: "true",
        privacyNotice: "modal",
        privacyTitle: "Datenschutz",
        privacyText: "Punkt eins | Punkt zwei",
        privacyButtonText: "Los",
        privacyUrl: "https://example.org/datenschutz",
        disclaimer: "none",
        disclaimerText: "KI kann irren.",
        followUps: "none",
      },
      fetchConfig({}),
    );
    expect(s).toMatchObject({
      suggestionStyle: "bars",
      greetingStyle: "text",
      greetingBubbleText: null,
      assistantSubtitle: "Online-Berater mit künstlicher Intelligenz",
      onlineDot: false,
      privacyNotice: "link",
      privacyTitle: null,
      privacyText: null,
      privacyButtonText: "Los",
      privacyUrl: null,
      disclaimer: "footer",
      disclaimerText: null,
      followUps: "none",
    });
  });

  // Texte aus visual_config gewinnen weiter; Altkonfiguration (Balken, Text-
  // Begrüßung, Modal, kein KI-Hinweis, Online-Punkt) wirkt nicht mehr
  // (bewusste Änderung, AK-3/AK-4 des Issues design-center-vereinfachen).
  it("visual_config (gemockter /config): Texte gewinnen, Altwerte der Darstellung wirken nicht", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, greetingBubbleText: "Script-Begrüßung" },
      fetchConfig({
        suggestionStyle: "bars",
        greetingStyle: "text",
        greetingBubbleText: "Server-Begrüßung",
        assistantSubtitle: "Server-Untertitel",
        onlineDot: true,
        privacyNotice: "modal",
        privacyTitle: "Server-Titel",
        privacyText: "Server-Text",
        privacyButtonText: "Weiter",
        privacyUrl: "/datenschutz",
        disclaimer: "none",
        disclaimerText: "Server-Hinweis",
        followUps: "none",
      }),
    );
    expect(s).toMatchObject({
      suggestionStyle: "pills",
      greetingStyle: "bubble",
      greetingBubbleText: "Server-Begrüßung",
      assistantSubtitle: "Server-Untertitel",
      onlineDot: false,
      privacyNotice: "link",
      privacyTitle: "Server-Titel",
      privacyText: "Server-Text",
      privacyButtonText: "Weiter",
      privacyUrl: "/datenschutz",
      disclaimer: "footer",
      disclaimerText: null,
      followUps: "pills",
    });
    // keine Auflösung zur Renderzeit mehr
    expect(layout.greetingAsBubble).toBeUndefined();
  });

  it('privacyTitle: leer im Design Center = keine Überschrift ("" bleibt erhalten)', async () => {
    const s = await loadEmbedSettings(BASE, fetchConfig({ privacyTitle: "" }));
    expect(s.privacyTitle).toBe("");
    expect(layout.privacyTitleText(s)).toBe("");
    // Bewusste Änderung (Fixliste 7.22-rc17 E23): ein Script-Attribut wirkt
    // nicht (Gruppe A); fehlend = Standard „Datenschutz“
    const t = await loadEmbedSettings(
      { ...BASE, privacyTitle: "  " },
      fetchConfig({}),
    );
    expect(t.privacyTitle).toBe(null);
    expect(layout.privacyTitleText(t)).toBe("Datenschutz");
    const u = await loadEmbedSettings(BASE, fetchConfig({}));
    expect(layout.privacyTitleText(u)).toBe("Datenschutz");
    expect(layout.privacyTitleText({ ...u, language: "en" })).toBe("Privacy");
  });

  it("frühere Standardtexte gelten als nicht gesetzt (neuer Standard greift), eigene Texte bleiben", async () => {
    const s = await loadEmbedSettings(
      BASE,
      fetchConfig({
        greeting:
          "Hallo und herzlich willkommen! Ich helfe Ihnen gerne weiter und beantworte Ihre Fragen mit intelligenten, KI-gestützten Antworten.",
        greetingBubbleText:
          "Hallo! Ich bin Ihr digitaler Berater mit künstlicher Intelligenz (KI). Beschreiben Sie einfach, was Sie suchen.",
        privacyTitle: "Datenschutz:",
        sendMessageText: "Wie kann ich Ihnen helfen?",
      }),
    );
    expect(s.greeting).toBe(null);
    expect(s.greetingBubbleText).toBe(null);
    expect(s.privacyTitle).toBe(null);
    expect(s.sendMessageText).toBe(null);
    expect(layout.greetingText(s)).toBe(
      "Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?",
    );
    expect(layout.privacyTitleText(s)).toBe("Datenschutz");
    // alter Server-Standard + eigenes Script-Attribut: Bewusste Änderung
    // (Fixliste 7.22-rc17 E23), das Script-Attribut wirkt nicht (Gruppe A),
    // es gilt der neue Standard
    const t = await loadEmbedSettings(
      { ...BASE, greetingBubbleText: "Willkommen bei der vhs!" },
      fetchConfig({
        greetingBubbleText:
          "Hallo! Ich bin Ihr digitaler Berater mit künstlicher Intelligenz (KI). Beschreiben Sie einfach, was Sie suchen.",
      }),
    );
    expect(layout.greetingText(t)).toBe(
      "Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?",
    );
    // eigener Text bleibt unverändert
    const u = await loadEmbedSettings(
      BASE,
      fetchConfig({ greeting: "Guten Tag!", sendMessageText: "Frage?" }),
    );
    expect(layout.greetingText(u)).toBe("Guten Tag!");
    expect(u.sendMessageText).toBe("Frage?");
  });

  it("greetingText: greetingBubbleText vor greeting vor Standard der Sprache", () => {
    expect(
      layout.greetingText({ greetingBubbleText: " Blase ", greeting: "Text" }),
    ).toBe("Blase");
    expect(layout.greetingText({ greeting: "Text" })).toBe("Text");
    expect(layout.greetingText({ greeting: "  " })).toBe(
      PANEL_TEXTS.de.greetingBubble,
    );
    expect(layout.greetingText({ language: "en" })).toBe(
      "Hello! I am your AI advisor. How can I help you?",
    );
  });

  // privacyNotice und disclaimer am Skript: seit Fixliste 7.22-rc17 (E23,
  // E24) ohne Wirkung, gemeldet als „wirkt nicht“ statt als ungültiger Wert
  it("ungültige Enums -> fester Standard + je eine console.warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await loadEmbedSettings(
      {
        ...BASE,
        suggestionStyle: "chips",
        greetingStyle: "blase",
        privacyNotice: "popup",
        disclaimer: "unten",
      },
      fetchConfig({}),
    );
    expect(s.suggestionStyle).toBe("pills");
    expect(s.greetingStyle).toBe("bubble");
    expect(s.privacyNotice).toBe("link");
    expect(s.disclaimer).toBe("footer");
    const lines = warn.mock.calls.map((c) => String(c[0]));
    for (const key of ["suggestionStyle", "greetingStyle"]) {
      const mine = lines.filter((l) => l.includes(`Ungültiger ${key}-Wert`));
      expect(mine).toHaveLength(1);
    }
    for (const attr of ["data-privacy-notice", "data-disclaimer "]) {
      expect(lines.filter((l) => l.includes(attr))).toHaveLength(1);
      expect(lines.find((l) => l.includes(attr))).toContain("wirkt nicht");
    }
    expect(lines.filter((l) => l.includes("Ungültiger"))).toHaveLength(2);
    expect(lines.find((l) => l.includes("suggestionStyle"))).toContain(
      'es gilt "pills"',
    );
  });

  it("Texte: getrimmt, Höchstlängen (zu lang -> verworfen, nicht gekürzt)", () => {
    expect(layoutValidations.assistantSubtitle("x".repeat(60))).toHaveLength(
      60,
    );
    expect(layoutValidations.assistantSubtitle("x".repeat(61))).toBe(undefined);
    expect(layoutValidations.privacyButtonText("x".repeat(41))).toBe(undefined);
    expect(layoutValidations.disclaimerText("x".repeat(160))).toHaveLength(160);
    expect(layoutValidations.disclaimerText("x".repeat(161))).toBe(undefined);
    // leer = bewusst keine Überschrift (früher verworfen)
    expect(layoutValidations.privacyTitle("   ")).toBe("");
    expect(layoutValidations.privacyTitle("x".repeat(121))).toBe(undefined);
    expect(layoutValidations.greetingBubbleText(42)).toBe(undefined);
  });

  // Bewusste Änderung: freier Text statt 5 × 160 Zeichen (lange Absätze und
  // mehr Zeilen wurden sonst verworfen und der Standard erschien).
  it("privacyText: altes Format je Zeile oder |, neues Format mit •/-, max. 12 Zeilen × 500 Zeichen", () => {
    expect(layoutValidations.privacyText(" Eins |Zwei\r\nDrei\n\n ")).toBe(
      "Eins\nZwei\nDrei",
    );
    // mit Aufzählungszeichen: "|" bleibt Text, Zeilen getrimmt
    expect(
      layoutValidations.privacyText("Absatz a|b\n  • Punkt\n- zwei  "),
    ).toBe("Absatz a|b\n• Punkt\n- zwei");
    const twelve = Array.from({ length: 12 }, () => "p".repeat(80)).join("\n");
    expect(layoutValidations.privacyText(twelve).split("\n")).toHaveLength(12);
    expect(layoutValidations.privacyText(`${twelve}\nx`)).toBe(undefined);
    expect(layoutValidations.privacyText("q".repeat(500))).toHaveLength(500);
    expect(layoutValidations.privacyText("q".repeat(501))).toBe(undefined);
    expect(layoutValidations.privacyText("q".repeat(1001))).toBe(undefined);
    expect(layoutValidations.privacyText(" | ")).toBe(undefined);
  });

  it("parsePrivacyText: •/-/– = Punkte, sonst Absätze; altes Format bleibt Punkte", () => {
    const P = (text) => ({ type: "paragraph", text });
    const B = (text) => ({ type: "bullet", text });
    // neues Format
    expect(
      layout.parsePrivacyText(
        "Wir nehmen Datenschutz ernst.\n• Server in Deutschland\n-Keine Weitergabe\n– Einsicht zur Qualität\nMehr unten.",
      ),
    ).toEqual([
      P("Wir nehmen Datenschutz ernst."),
      B("Server in Deutschland"),
      B("Keine Weitergabe"),
      B("Einsicht zur Qualität"),
      P("Mehr unten."),
    ]);
    // Rückwärtskompatibel: gespeicherter Text ohne Zeichen, ein Punkt je
    // Zeile (bzw. "|") -> weiter Aufzählungspunkte
    expect(layout.parsePrivacyText("Eins\nZwei")).toEqual([
      B("Eins"),
      B("Zwei"),
    ]);
    expect(layout.parsePrivacyText("Eins | Zwei")).toEqual([
      B("Eins"),
      B("Zwei"),
    ]);
    // eine Zeile ohne Zeichen -> Absatz
    expect(layout.parsePrivacyText("Nur ein Satz.")).toEqual([
      P("Nur ein Satz."),
    ]);
    // Zeichen ohne Text entfällt; leer -> keine Blöcke (Standard greift)
    expect(layout.parsePrivacyText("•\n• a")).toEqual([B("a")]);
    expect(layout.parsePrivacyText("")).toEqual([]);
    expect(layout.parsePrivacyText(null)).toEqual([]);
    expect(layout.privacyBlocks({})).toEqual(
      PANEL_TEXTS.de.privacyPoints.map(B),
    );
    // Standardtext im neuen Format ergibt dieselben Punkte
    expect(layout.parsePrivacyText(PANEL_TEXTS.de.privacyText)).toEqual(
      PANEL_TEXTS.de.privacyPoints.map(B),
    );
    expect(PANEL_TEXTS.de.privacyText.split("\n")[0]).toBe(
      "• Ihre Anfragen bleiben auf Servern in Deutschland und werden nicht an Dritte weitergegeben.",
    );
  });

  it("privacyUrl: nur https oder Pfad der Seite", () => {
    const ok = ["https://vhs.de/datenschutz", "/datenschutz#ki"];
    const bad = [
      "http://vhs.de/datenschutz",
      "javascript:alert(1)",
      "//evil.example/x",
      "/\\evil.example/x", // Browser lesen "\\" wie "/" -> fremder Host
      "/datenschutz\\x",
      "https://vhs.de\\@evil.example/",
      "data:text/html,<b>x</b>",
      "https://vhs.de/a b",
      `https://vhs.de/${"x".repeat(520)}`,
      42,
    ];
    for (const u of ok) expect(layoutValidations.privacyUrl(u)).toBe(u);
    for (const u of bad)
      expect(layoutValidations.privacyUrl(u)).toBe(undefined);
  });

  it("Sprache der Panel-Texte: en (auch Region) englisch, alles andere deutsch", () => {
    for (const l of ["en", "EN", " en-GB ", "en_US"])
      expect(panelLanguage({ language: l })).toBe("en");
    for (const l of ["de", "fr", "fr-FR", "english", "e", "", null, 42, {}])
      expect(panelLanguage({ language: l })).toBe("de");
    expect(panelLanguage({})).toBe("de");
  });

  it("onlineDot: Boolean-Strings wie inlineInput (Wert wird danach ignoriert)", () => {
    expect(layoutValidations.onlineDot("on")).toBe(true);
    expect(layoutValidations.onlineDot("0")).toBe(false);
    expect(layoutValidations.onlineDot("vielleicht")).toBe(undefined);
  });

  // Darstellung nur aus dem Design Center (Fixliste 7.22-rc17 E23)
  it("Inline: Standard wie die Demo (focus, morph, schwebend, Eingabe-Leiste, 520 px), nur im Inline-Modus", async () => {
    const s = await loadEmbedSettings(
      BASE,
      fetchConfig({ displayMode: "inline" }),
    );
    expect(s).toMatchObject({
      inlineInput: true,
      inlineOpenOn: "focus",
      inlineLayout: "overlay",
      inlineEffect: "morph",
      inlineHeight: "520px",
      inlineStartState: "collapsed",
      inlineTheme: null,
      inlineMaxWidth: null,
      // Bewusste Änderung (Fixliste 7.22-rc8 R4): beim Laden null, der
      // Standard "auto" in der Seite kommt erst mit der tatsächlichen
      // Darstellung (App.jsx applyDisplayed, tests/rc8-fixes.test.jsx)
      courseCards: null,
      courseCardsPosition: "above",
      courseCardsLayout: "rows",
    });
    // data-display-mode am Skript wirkt nicht: Chatfenster
    const t = await loadEmbedSettings(
      { ...BASE, displayMode: "inline" },
      fetchConfig({}),
    );
    expect(t.displayMode).toBe("bubble");
    expect(t.inlineOpenOn).toBe("submit");
    // Skript-Angabe schlägt den Standard; Bewusste Änderung (Fixliste
    // 7.22-rc18 C18, eine Regel wie FIXED_STANDARDS): ein Altwert vom Server
    // ohne Skript-Angabe wirkt nicht mehr (der Server liefert dieselben
    // Werte wie INLINE_STANDARDS)
    const u = await loadEmbedSettings(
      { ...BASE, inlineOpenOn: "submit" },
      fetchConfig({ displayMode: "inline", inlineEffect: "expand" }),
    );
    expect(u.inlineOpenOn).toBe("submit");
    expect(u.inlineEffect).toBe("morph");
    expect(u.inlineLayout).toBe("overlay");
    // Chatblase: keine Inline-Standards (keine inlineInput-Warnung)
    const b = await loadEmbedSettings(BASE, fetchConfig({}));
    expect(b.inlineInput).toBe(false);
    expect(b.inlineOpenOn).toBe("submit");
    expect(b.inlineEffect).toBe(null);
  });
});

// ---------------------------------------------------------------------------
describe("Leerer Chat: Pillen und Begrüßungsblase (AK-2, AK-3, NAK-1)", () => {
  it("Standard: Balken wie bisher, keine Pillen/Blase", () => {
    render(
      <ChatHistory
        settings={{ defaultMessages: MSGS, greeting: GREETING }}
        history={[]}
      />,
    );
    expect($$(".msg-suggestion")).toHaveLength(4);
    expect($("#anything-llm-suggestion-pills")).toBe(null);
    expect($("#anything-llm-greeting-bubble")).toBe(null);
    expect(container.textContent).toContain(GREETING);
  });

  it("pills: 4 Pillen (Rand, Rundung 999 px), Klick sendet wie bisher", () => {
    const sent = [];
    const onSend = (e) => sent.push(e.detail.command);
    window.addEventListener(SEND_TEXT_EVENT, onSend);
    render(
      <ChatHistory
        settings={{ defaultMessages: MSGS, suggestionStyle: "pills" }}
        history={[]}
      />,
    );
    const pills = $$("#anything-llm-suggestion-pills button");
    expect(pills.map((b) => b.textContent)).toEqual(MSGS);
    expect($$(".msg-suggestion")).toHaveLength(0);
    // KIE-565 Nachtrag Punkt 4: Rand in Kundenfarbe wie die Folgefragen;
    // ohne buttonColor der Kufer-Standard
    expect(pills[0].style.border).toBe(
      `1px solid var(--allmi-pill-border, var(--allmi-accent, ${DEFAULT_ACCENT}))`,
    );
    expect(pills[0].style.borderRadius).toBe("var(--allmi-bar-radius, 999px)");
    expect($("#anything-llm-suggestion-pills").style.flexWrap).toBe("wrap");
    act(() => pills[1].click());
    window.removeEventListener(SEND_TEXT_EVENT, onSend);
    expect(sent).toEqual(["Yoga"]);
  });

  // KIE-565 Nachtrag Punkt 4: Standard jetzt die Kundenfarbe (vorher
  // --allm-bar-border)
  it("--allm-pill-border: eigene Variable, Standard = --allm-accent (hell/dunkel)", () => {
    expect(THEME_VARIABLES.some((v) => v.name === "pill-border")).toBe(true);
    for (const mode of ["light", "dark"]) {
      expect(buildThemeCss({}, mode)).toContain(
        "--allmi-pill-border: var(--allm-pill-border, var(--allmi-accent));",
      );
      const vars = resolveThemeVars({}, mode);
      expect(vars["--allm-pill-border"]).toBe(vars["--allm-accent"]);
    }
  });

  it("sendSuggestion: ein Helfer für Balken und Pillen (SEND_TEXT_EVENT)", () => {
    const sent = [];
    const onSend = (e) => sent.push(e.detail.command);
    window.addEventListener(SEND_TEXT_EVENT, onSend);
    sendSuggestion("Direkt");
    render(<ChatHistory settings={{ defaultMessages: MSGS }} history={[]} />);
    act(() => $$(".msg-suggestion")[2].click());
    window.removeEventListener(SEND_TEXT_EVENT, onSend);
    expect(sent).toEqual(["Direkt", "KI-Basics"]);
  });

  // KIE-565 (Browser-Fund B-02, Fixliste Nr. 28): die Begrüßungsblase muss
  // beim Öffnen sichtbar sein; bisher wurde ans Ende gescrollt (Pillen
  // sichtbar), bei 700 px Fensterhöhe lag die Begrüßung dann über dem
  // sichtbaren Bereich. Jetzt höchstens bis 8 px über der Begrüßung.
  it("bubble: Überlauf -> Begrüßung bleibt beim Öffnen oben im Blick (Pillen dürfen darunter liegen), ohne Animation", () => {
    const proto = HTMLElement.prototype;
    const sets = [];
    const scrollTo = vi.fn();
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        return { top: this.id === "anything-llm-greeting-bubble" ? 16 : 0 };
      });
    Object.defineProperty(proto, "scrollHeight", {
      configurable: true,
      get: () => 900,
    });
    Object.defineProperty(proto, "clientHeight", {
      configurable: true,
      get: () => 300,
    });
    Object.defineProperty(proto, "scrollTop", {
      configurable: true,
      get: () => 0,
      set(v) {
        sets.push([this, v]);
      },
    });
    const origScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = scrollTo;
    try {
      render(
        <ChatHistory
          settings={{
            defaultMessages: MSGS,
            suggestionStyle: "pills",
            greetingStyle: "bubble",
            privacyNotice: "bubble",
          }}
          history={[]}
        />,
      );
      const scroller = $("#anything-llm-panel-welcome").parentElement;
      // Begrüßung bei 16 px (Polsterung) -> 8 px, nicht ans Ende (600/900)
      expect(sets).toEqual([[scroller, 8]]);
      expect(scrollTo).not.toHaveBeenCalled(); // kein smooth-Scrollen
      expect(scroller.className).toContain("allm-box-border");
    } finally {
      rect.mockRestore();
      delete proto.scrollHeight;
      delete proto.clientHeight;
      delete proto.scrollTop;
      Element.prototype.scrollTo = origScrollTo;
    }
  });

  it("bubble ohne Überlauf: Scrollposition bleibt", () => {
    const sets = [];
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get: () => 0,
      set: (v) => sets.push(v),
    });
    try {
      render(
        <ChatHistory settings={{ greetingStyle: "bubble" }} history={[]} />,
      );
      expect(sets).toEqual([]);
    } finally {
      delete HTMLElement.prototype.scrollTop;
    }
  });

  it("pills: höchstens 6, Text über 60 Zeichen mit … gekürzt, gesendet wird der volle Text", () => {
    const long = `Gibt es ${"sehr ".repeat(15)}lange Kurse?`;
    const list = [long, ...Array.from({ length: 8 }, (_, i) => `F${i}`)];
    const pills = panelPills({ defaultMessages: list });
    // eine Kappung: dieselbe wie die Chips unter der Leiste
    expect(pills).toHaveLength(INLINE_CHIPS_MAX);
    expect(INLINE_CHIPS_MAX).toBe(6);
    expect(layout.PANEL_PILLS_MAX).toBeUndefined();
    expect(pills[0].text).toBe(long);
    expect(pills[0].label.length).toBeLessThanOrEqual(60);
    expect(pills[0].label.endsWith("…")).toBe(true);
    const sent = [];
    const onSend = (e) => sent.push(e.detail.command);
    window.addEventListener(SEND_TEXT_EVENT, onSend);
    render(
      <ChatHistory
        settings={{ defaultMessages: list, suggestionStyle: "pills" }}
        history={[]}
      />,
    );
    const btn = $$("#anything-llm-suggestion-pills button")[0];
    expect(btn.getAttribute("title")).toBe(long);
    act(() => btn.click());
    window.removeEventListener(SEND_TEXT_EVENT, onSend);
    expect(sent).toEqual([long]);
  });

  // Bewusste Änderung: der Begrüßungstext IST die Blase (kein kleiner
  // greeting-Text mehr unter der Blase; greetingBubbleText hat Vorrang).
  it("bubble: Blase mit Avatar und greetingBubbleText (Vorrang vor greeting), kein kleiner Text darunter", () => {
    embedderSettings.settings = { assistantIcon: "https://x.test/a.png" };
    render(
      <ChatHistory
        settings={{
          defaultMessages: MSGS,
          suggestionStyle: "pills",
          greetingStyle: "bubble",
          greetingBubbleText: "Hallo! Ich bin Ihr KI-Kursberater.",
          greeting: GREETING,
        }}
        history={[]}
      />,
    );
    const bubble = $("#anything-llm-greeting-bubble");
    expect(bubble.textContent).toBe("Hallo! Ich bin Ihr KI-Kursberater.");
    expect(bubble.style.backgroundColor).toContain("--allmi-assistant-bg");
    const avatar = $("#anything-llm-panel-welcome img");
    expect(avatar.getAttribute("src")).toBe("https://x.test/a.png");
    expect($("#anything-llm-greeting-small")).toBe(null);
    expect(container.textContent).not.toContain(GREETING);
    // Reihenfolge: Blase, dann Pillen
    const pills = $("#anything-llm-suggestion-pills");
    expect(
      bubble.compareDocumentPosition(pills) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("bubble: ohne greetingBubbleText steht greeting (Begrüßungstext) in der Blase", () => {
    render(
      <ChatHistory
        settings={{ greetingStyle: "bubble", greeting: "Guten Tag!" }}
        history={[]}
      />,
    );
    expect($("#anything-llm-greeting-bubble").textContent).toBe("Guten Tag!");
  });

  it("bubble ohne eigenen Text: Standardtext", () => {
    render(<ChatHistory settings={{ greetingStyle: "bubble" }} history={[]} />);
    expect($("#anything-llm-greeting-bubble").textContent).toBe(
      DEFAULT_GREETING_BUBBLE_TEXT,
    );
  });

  // Bewusste Änderung: neue Standardtexte (Design Center vereinfacht,
  // 15.10.2026), Datenschutz in einer eigenen zweiten Blase.
  // Bewusste Änderung (7.23): keine Datenschutz-Blase und kein Popup mehr,
  // die Standardpunkte stehen im Datenschutz-Fenster
  // (tests/datenschutz-fenster.test.jsx); hier nur Begrüßung und Texte
  it("AK-5: neue Standardtexte der Begrüßungsblase (de/en), Datenschutz-Standard in PANEL_TEXTS, keine Datenschutz-Blase", () => {
    render(
      <ChatHistory
        settings={{ greetingStyle: "bubble", privacyNotice: "bubble" }}
        history={[]}
      />,
    );
    const bubble = $("#anything-llm-greeting-bubble");
    expect(bubble.textContent).toBe(
      "Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?",
    );
    expect($("#anything-llm-privacy-bubble")).toBe(null);
    expect(container.textContent).not.toContain(
      "Mitarbeiter der Einrichtung können Gespräche zur Qualitätssicherung einsehen.",
    );
    expect(PANEL_TEXTS.de.privacyPoints[1]).toBe(
      "Mitarbeiter der Einrichtung können Gespräche zur Qualitätssicherung einsehen.",
    );
    render(
      <ChatHistory
        settings={{
          greetingStyle: "bubble",
          privacyNotice: "bubble",
          language: "en",
        }}
        history={[]}
      />,
    );
    expect($("#anything-llm-greeting-bubble").textContent).toBe(
      "Hello! I am your AI advisor. How can I help you?",
    );
    expect($("#anything-llm-privacy-bubble")).toBe(null);
    expect(PANEL_TEXTS.en.privacyPoints[1]).toBe(
      "Staff of the institution may view conversations for quality assurance.",
    );
  });

  // Bewusste Änderung (7.23): die Datenschutz-Blase (zweite Blase unter der
  // Begrüßung, Absätze und Punkte, Link in eigener Zeile) entfällt; die
  // Spalte enthält nur die Begrüßungsblase. Absätze, Punkte und Link stehen
  // im Datenschutz-Fenster (tests/datenschutz-fenster.test.jsx).
  it("AK-6 (neu): Spalte nur mit der Begrüßungsblase, ≤ 80 % breit, auch mit gespeichertem Datenschutz-Text", () => {
    render(
      <ChatHistory
        settings={{
          greetingStyle: "bubble",
          privacyNotice: "bubble",
          privacyText: "Erstens. | Zweitens! | Drittens",
          privacyUrl: "https://vhs.example/datenschutz",
        }}
        history={[]}
      />,
    );
    const bubble = $("#anything-llm-greeting-bubble");
    expect(bubble.textContent).toBe(DEFAULT_GREETING_BUBBLE_TEXT);
    expect(bubble.nextElementSibling).toBe(null);
    expect(bubble.parentElement.children).toHaveLength(1);
    expect(bubble.parentElement.style.maxWidth).toBe("80%");
    expect(bubble.style.boxSizing).toBe("border-box");
    expect(container.textContent).not.toContain("Erstens.");
    expect(container.querySelector("a")).toBe(null);
  });

  it("NAK-1: HTML in greetingBubbleText erscheint als Text", () => {
    render(
      <ChatHistory
        settings={{
          greetingStyle: "bubble",
          greetingBubbleText: "<b>fett</b><img src=x onerror=alert(1)>",
        }}
        history={[]}
      />,
    );
    const bubble = $("#anything-llm-greeting-bubble");
    expect(bubble.querySelector("b, img")).toBe(null);
    expect(bubble.textContent).toBe("<b>fett</b><img src=x onerror=alert(1)>");
  });
});

// ---------------------------------------------------------------------------
describe("Begrüßung bleibt im Verlauf (greetingStyle bubble)", () => {
  const HIST = [
    { role: "user", content: "Gibt es Yoga?", sentAt: 1 },
    { role: "assistant", content: "Ja, montags.", sentAt: 2, chatId: 1 },
  ];
  const BUBBLE = {
    ...BASE,
    enableStt: false,
    defaultMessages: MSGS,
    suggestionStyle: "pills",
    greetingStyle: "bubble",
    privacyNotice: "bubble",
    privacyUrl: "/datenschutz",
  };
  const list = () => $("#chat-history").firstElementChild;

  // Bewusste Änderung (7.23): ohne Datenschutz-Blase
  it("AK-2: nach der ersten Frage bleibt die Begrüßungsblase erste Nachricht (ohne Datenschutz-Blase), Pillen weg", () => {
    render(
      <ChatContainer
        sessionId="s-1"
        conversationId="c-1"
        knownHistory={[]}
        settings={BUBBLE}
      />,
    );
    expect($("#anything-llm-suggestion-pills")).not.toBe(null);
    act(() => sendSuggestion("Yoga"));
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect($("#anything-llm-suggestion-pills")).toBe(null);
    expect($$("#anything-llm-greeting-bubble")).toHaveLength(1);
    const first = list().firstElementChild;
    expect(first.id).toBe("anything-llm-panel-welcome");
    expect(first.hasAttribute("data-persistent")).toBe(true);
    expect(first.querySelector("#anything-llm-privacy-bubble")).toBe(null);
    expect(first.querySelector("a")).toBe(null);
    // danach die Frage
    expect(first.nextElementSibling.textContent).toContain("Yoga");
  });

  it("AK-2: geladener Verlauf (Reload) -> Blase genau einmal an erster Stelle, keine Pillen", () => {
    render(
      <ChatContainer
        sessionId="s-1"
        conversationId="c-1"
        knownHistory={HIST}
        settings={BUBBLE}
      />,
    );
    expect($$("#anything-llm-greeting-bubble")).toHaveLength(1);
    expect(list().firstElementChild.id).toBe("anything-llm-panel-welcome");
    expect(list().children).toHaveLength(3); // Blase + 2 Nachrichten
    expect($("#anything-llm-suggestion-pills")).toBe(null);
    expect($$(".msg-suggestion")).toHaveLength(0);
    // Blase ist kein Chat-Eintrag: nichts gesendet
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  // Bewusste Änderung: der Begrüßungstext steht in der Blase selbst (kein
  // kleiner greeting-Text mehr), auch im Verlauf.
  // Bewusste Änderung (7.23): keine Datenschutz-Blase mehr darunter
  it("im Verlauf: Begrüßungstext in der Blase, keine Datenschutz-Blase", () => {
    render(
      <ChatHistory
        settings={{
          greetingStyle: "bubble",
          privacyNotice: "bubble",
          greeting: GREETING,
        }}
        history={HIST}
      />,
    );
    const welcome = list().firstElementChild;
    expect(
      welcome.querySelector("#anything-llm-greeting-bubble").textContent,
    ).toBe(GREETING);
    expect(welcome.querySelector("#anything-llm-greeting-small")).toBe(null);
    expect(welcome.querySelector("#anything-llm-privacy-bubble")).toBe(null);
  });

  it("NAK-1: greetingStyle text (Bestandskunden) -> Verlauf unverändert, keine Blase, kein greeting", () => {
    render(
      <ChatHistory
        settings={{ greeting: GREETING, defaultMessages: MSGS }}
        history={HIST}
      />,
    );
    expect($("#anything-llm-greeting-bubble")).toBe(null);
    expect($("#anything-llm-panel-welcome")).toBe(null);
    expect(container.textContent).not.toContain(GREETING);
    expect(list().children).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
describe("Kopfzeile: Untertitel, Online-Punkt, Icon (AK-4)", () => {
  const props = {
    sessionId: "s-1",
    setChatHistory: () => {},
    closeChat: () => {},
    iconUrl: "https://x.test/kursberater.svg",
  };

  it("Standard: kein Untertitel, kein Punkt", () => {
    render(
      <ChatWindowHeader
        {...props}
        settings={{ brandText: "Ihr Online-Berater", loaded: true }}
      />,
    );
    expect($("#anything-llm-header-subtitle")).toBe(null);
    expect($("[data-online-dot]")).toBe(null);
    expect(container.textContent).toContain("Ihr Online-Berater");
  });

  it("AK-4: onlineDot Standard aus — Konfiguration ohne onlineDot zeigt keinen Punkt", async () => {
    const s = await loadEmbedSettings(
      BASE,
      fetchConfig({
        greetingStyle: "bubble",
        assistantSubtitle: "durchsucht 1.243 Kurse",
      }),
    );
    expect(s.onlineDot).toBe(false);
    render(<ChatWindowHeader {...props} settings={{ ...s, loaded: true }} />);
    expect($("#anything-llm-header-subtitle")).not.toBe(null);
    expect($("[data-online-dot]")).toBe(null);
    // ausdrücklich false (Design Center der Demo) ebenso
    const off = await loadEmbedSettings(
      BASE,
      fetchConfig({ onlineDot: false }),
    );
    render(<ChatWindowHeader {...props} settings={{ ...off, loaded: true }} />);
    expect($("[data-online-dot]")).toBe(null);
  });

  // Bewusste Änderung (Nutzer 14.10.2026): kein grüner Online-Punkt mehr,
  // auch nicht mit onlineDot true aus Altkonfiguration (AK-4).
  it("Untertitel und Icon-URL; kein Online-Punkt, auch nicht mit onlineDot true", () => {
    render(
      <ChatWindowHeader
        {...props}
        settings={{
          brandText: "KI-Kursberater",
          assistantSubtitle: "durchsucht 1.243 Kurse",
          onlineDot: true,
          loaded: true,
        }}
      />,
    );
    expect($("#anything-llm-header-subtitle").textContent).toBe(
      "durchsucht 1.243 Kurse",
    );
    expect(container.textContent).toContain("KI-Kursberater");
    expect($("[data-online-dot]")).toBe(null);
    expect(container.querySelector("[title=online]")).toBe(null);
    expect($("#anything-llm-header img").getAttribute("src")).toBe(
      "https://x.test/kursberater.svg",
    );
  });
});

// ---------------------------------------------------------------------------
// Bewusste Änderung (7.23): Der Einmal-Hinweis mit Bestätigung („modal“,
// Karte mit Knopf „Start“, Sperre der Eingabe, Bestätigung in localStorage)
// entfällt (Hard Constraint 2: kein Pop-up mit Bestätigung vor dem Chat, auch
// nicht als Option); seine Tests sind entfernt. Es bleiben die Standardtexte.
describe("Datenschutz-Texte (AK-5, E30)", () => {
  // Begrüßung neu (Nutzer 15.10.2026, bewusste Änderung)
  it("Standardtexte neutral (alle Kundenarten), ohne Speicherdauer, Standard ohne Link", async () => {
    expect(PANEL_TEXTS.de.greetingBubble).toBe(
      "Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?",
    );
    expect(PANEL_TEXTS.en.greetingBubble).toBe(
      "Hello! I am your AI advisor. How can I help you?",
    );
    expect(DEFAULT_PRIVACY_POINTS).toEqual([
      "Ihre Anfragen bleiben auf Servern in Deutschland und werden nicht an Dritte weitergegeben.",
      "Mitarbeiter der Einrichtung können Gespräche zur Qualitätssicherung einsehen.",
      "Bitte teilen Sie nur Angaben, die für Ihre Anfrage nötig sind.",
    ]);
    expect(PANEL_TEXTS.en.privacyPoints).toEqual([
      "Your requests stay on servers in Germany and are not passed on to third parties.",
      "Staff of the institution may view conversations for quality assurance.",
      "Please only share information that is necessary for your request.",
    ]);
    // Datenschutz-Satz spricht für die Einrichtung des Kunden, nicht „Unser Team“
    expect(JSON.stringify(PANEL_TEXTS)).not.toMatch(/Unser Team|Our team/);
    expect(PANEL_TEXTS.de.privacyButton).toBe("Start");
    // Bewusste Änderung (Datenschutz in der Fußzeile, 23.10.2026): der Punkt
    // „Hinweis zur KI“ im Datenschutz-Fenster nennt Kursangebot und
    // Kursseite (Wortlaut vom Nutzer freigegeben); alle übrigen Texte bleiben
    // neutral
    const neutral = (texts) => {
      const { privacyAiText, ...rest } = texts;
      return rest;
    };
    const all = JSON.stringify({
      de: neutral(PANEL_TEXTS.de),
      en: neutral(PANEL_TEXTS.en),
    });
    for (const word of [
      "Volkshochschule",
      "Kursberater",
      "Kurs",
      "Wichtig",
      "adult education",
      "course",
    ])
      expect(all).not.toContain(word);
    const s = await loadEmbedSettings(BASE, fetchConfig({}));
    expect(s.privacyUrl).toBe(null);
    // ohne privacyUrl kein Link zur Datenschutzerklärung (Fenster:
    // tests/datenschutz-fenster.test.jsx)
    expect(layout.privacyHref(s.privacyUrl)).toBe(null);
  });

  // E30 (Fixliste 7.22-rc19): Standardtext ohne Gendersprache, wortgleich
  // mit dem Fork (Gegenprobe in tests/embed-config-contract.test.js mit
  // KUFER_FORK_DIR); Englisch unverändert
  it("E30: Datenschutz-Standard „Mitarbeiter der Einrichtung …“, keine Gendersprache", () => {
    expect(DEFAULT_PRIVACY_POINTS[1]).toBe(
      "Mitarbeiter der Einrichtung können Gespräche zur Qualitätssicherung einsehen.",
    );
    expect(PANEL_TEXTS.de.privacyText.split("\n")[1]).toBe(
      "• Mitarbeiter der Einrichtung können Gespräche zur Qualitätssicherung einsehen.",
    );
    expect(PANEL_TEXTS.en.privacyPoints[1]).toBe(
      "Staff of the institution may view conversations for quality assurance.",
    );
    const de = JSON.stringify(PANEL_TEXTS.de);
    expect(de).not.toMatch(/Mitarbeitende|Teilnehmende|Lehrende/);
    expect(de).not.toMatch(/\p{L}[*:_/]innen\b|\p{Ll}Innen\b/u);
  });
});

// ---------------------------------------------------------------------------
describe("Vorschläge ohne Datenschutz-Sperre", () => {
  const props = { sessionId: "s-1", conversationId: "c-1", knownHistory: [] };
  // auch mit gespeichertem Altwert „modal“ oder „bubble“: keine Sperre
  it.each(["modal", "bubble", "link"])(
    "privacyNotice %s: Vorschlag wird sofort gesendet, Eingabe frei",
    (privacyNotice) => {
      render(
        <ChatContainer
          {...props}
          settings={{ ...BASE, enableStt: false, privacyNotice }}
        />,
      );
      expect($("#message-input").disabled).toBe(false);
      expect($("#anything-llm-privacy-notice")).toBe(null);
      act(() => {
        window.dispatchEvent(
          new CustomEvent(SEND_TEXT_EVENT, { detail: { command: "Yoga" } }),
        );
      });
      expect(chatService.streamChat).toHaveBeenCalledTimes(1);
      expect(window.localStorage.length).toBe(0);
    },
  );
});

// ---------------------------------------------------------------------------
describe("Fester KI-Hinweis unter dem Eingabefeld (disclaimer)", () => {
  const props = { sessionId: "s-1", conversationId: "c-1", knownHistory: [] };
  const base = { ...BASE, enableStt: false };

  // Bewusste Änderung (Nutzer 14./15.10.2026): der KI-Hinweis steht immer
  // da, auch ohne bzw. mit disclaimer "none" (nicht abschaltbar, AK-3).
  it("immer: Zeile auch ohne disclaimer und mit disclaimer none", () => {
    render(<ChatContainer {...props} settings={base} />);
    expect($("#anything-llm-ai-disclaimer-text").textContent).toBe(
      PANEL_TEXTS.de.aiDisclaimer,
    );
    render(
      <ChatContainer {...props} settings={{ ...base, disclaimer: "none" }} />,
    );
    expect($$("#anything-llm-ai-disclaimer")).toHaveLength(1);
  });

  it("footer: Zeile unter dem Eingabefeld (role note, 11 px, gedämpft, mittig), Standardtext deutsch", () => {
    render(
      <ChatContainer {...props} settings={{ ...base, disclaimer: "footer" }} />,
    );
    const note = $("#anything-llm-ai-disclaimer");
    expect(note.getAttribute("role")).toBe("note");
    // Bewusste Änderung (7.23): in derselben Zeile der Link „Datenschutz“
    expect(note.textContent).toBe(
      `${PANEL_TEXTS.de.aiDisclaimer} · ${PANEL_TEXTS.de.privacyLinkText}`,
    );
    // dezent wie im Mockup (11 px, eine Zeile); Größe per Klasse, in
    // schmalen Fenstern bis 10 px (Fixliste 7.22-rc7 Nr. 22, main.jsx)
    expect(note.classList.contains("allm-ai-disclaimer")).toBe(true);
    expect(note.style.textAlign).toBe("center");
    // Farbe fest je Farbschema (Fixliste 7.22-rc17 E24), keine --allm-*
    expect(note.style.color).toContain("--allmi-ai-notice-text");
    // Bewusste Änderung (7.23): genau ein Button, der Link „Datenschutz“;
    // der KI-Satz selbst bleibt nicht anklickbar
    expect([...note.querySelectorAll("a, button")].map((b) => b.id)).toEqual([
      "anything-llm-privacy-link",
    ]);
    const form = $("#message-input").closest("form") || $("#message-input");
    expect(
      form.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Bewusste Änderung: Text fest, disclaimerText wirkt nicht mehr.
  it("disclaimerText wird ignoriert (Text fest)", () => {
    render(
      <ChatContainer
        {...props}
        settings={{
          ...base,
          disclaimer: "footer",
          disclaimerText: "<b>KI</b>",
        }}
      />,
    );
    const note = $("#anything-llm-ai-disclaimer-text");
    expect(note.textContent).toBe(PANEL_TEXTS.de.aiDisclaimer);
    expect($("#anything-llm-ai-disclaimer").querySelector("b")).toBe(null);
  });

  it("Standardtexte de/en in PANEL_TEXTS (ein Mechanismus, kein i18n-Schlüssel)", async () => {
    // neuer Text (Nutzer 15.10.2026), ein Text für beide Stile; Wortlaut
    // seit Fixliste 7.22-rc8 R1 („Unsere KI …“). Bewusste Änderung
    // (Datenschutz in der Fußzeile, 23.10.2026): Kurzfassung ohne „Bitte
    // prüfen Sie die Antworten.“ (tests/datenschutz-fusszeile.test.jsx)
    expect(PANEL_TEXTS.de.aiDisclaimer).toBe("Unsere KI kann Fehler machen");
    expect(PANEL_TEXTS.en.aiDisclaimer).toBe("Our AI can make mistakes");
    const de = (await import("../src/locales/de/common.js")).default;
    const en = (await import("../src/locales/en/common.js")).default;
    expect(de.chat["ai-disclaimer"]).toBeUndefined();
    expect(en.chat["ai-disclaimer"]).toBeUndefined();
    render(
      <ChatContainer
        {...props}
        settings={{ ...base, disclaimer: "footer", language: "en" }}
      />,
    );
    expect($("#anything-llm-ai-disclaimer-text").textContent).toBe(
      PANEL_TEXTS.en.aiDisclaimer,
    );
  });

  it("keine Gedankenstriche (– oder —) in sichtbaren Standardtexten (Panel-Texte, Inline-Texte)", () => {
    for (const lang of Object.keys(PANEL_TEXTS))
      for (const value of Object.values(PANEL_TEXTS[lang]))
        expect(JSON.stringify(value)).not.toMatch(/[–—]/);
    for (const t of [
      layout.DEFAULT_INLINE_COLLAPSED_TEXT,
      layout.DEFAULT_INLINE_INPUT_PLACEHOLDER,
      layout.DEFAULT_INLINE_SEND_TEXT,
    ])
      expect(t).not.toMatch(/[–—]/);
    // Platzhalter des Fensters = Text der eingeklappten Leiste (7.22.2)
    expect(PANEL_TEXTS.de.inputPlaceholder).toBe(
      "Stellen Sie hier Ihre Frage …",
    );
    expect(PANEL_TEXTS.de.inputPlaceholder).toBe(
      PANEL_TEXTS.de.inlineBarPlaceholder,
    );
    expect(PANEL_TEXTS.en.inputPlaceholder).toBe(
      PANEL_TEXTS.en.inlineBarPlaceholder,
    );
    expect(PANEL_TEXTS.de.assistantName).toBe("KI-Berater");
    expect(PANEL_TEXTS.de.assistantSubtitle).toBe(
      "Online-Berater mit künstlicher Intelligenz",
    );
  });

  it("Platzhalter im Eingabefeld: Standard „Stellen Sie hier Ihre Frage …“ (en „Ask your question here …“) wie die Leiste, eigener Text gewinnt", () => {
    render(<ChatContainer {...props} settings={base} />);
    expect($("#message-input").getAttribute("placeholder")).toBe(
      "Stellen Sie hier Ihre Frage …",
    );
    render(<ChatContainer {...props} settings={{ ...base, language: "en" }} />);
    expect($("#message-input").getAttribute("placeholder")).toBe(
      "Ask your question here …",
    );
    render(
      <ChatContainer
        {...props}
        settings={{ ...base, sendMessageText: "Was suchen Sie?" }}
      />,
    );
    expect($("#message-input").getAttribute("placeholder")).toBe(
      "Was suchen Sie?",
    );
  });

  // Bewusste Änderung (7.23): statt des Einmal-Hinweises der Link
  // „Datenschutz“ in der Zeile des KI-Hinweises (Fenster auf Deutsch:
  // tests/datenschutz-fenster.test.jsx); kein Fenster beim Start
  it("language fr: Blase, KI-Hinweis und Link einheitlich deutsch, kein Fenster beim Start", () => {
    render(
      <ChatContainer
        {...props}
        settings={{
          ...base,
          language: "fr",
          greetingStyle: "bubble",
          privacyNotice: "modal",
          disclaimer: "footer",
        }}
      />,
    );
    const de = PANEL_TEXTS.de;
    expect($("#anything-llm-greeting-bubble").textContent).toBe(
      de.greetingBubble,
    );
    expect($("[role=dialog]")).toBe(null);
    expect($("#anything-llm-ai-disclaimer-text").textContent).toBe(
      de.aiDisclaimer,
    );
    expect($("#anything-llm-privacy-link").textContent).toBe(
      de.privacyLinkText,
    );
  });
});
