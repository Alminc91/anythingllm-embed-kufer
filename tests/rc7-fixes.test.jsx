import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Korrekturrunde Design Center 2.0, Fixliste 7.22-rc7, Teil Widget
// (issues/rollout-721/fixliste-7.22-rc7.md, Details review-7.22-rc6.md):
// Nr. 3 (W01), 9 (F08 Widget), 14 (W02), 16 (W04), 17 (W05), 18 (W06),
// 19 (W07), 20/27 (W08), 21 (W09), 22 (W10), 34 (B-08), 35 (B-09, E3),
// 36 (B-10), E1 (Widget-Teil).
// Neue Funktionen werden je Test dynamisch geladen: Am alten Stand scheitert
// dann der einzelne Test an seiner Prüfung, nicht die ganze Datei am Import.

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
  streamChat: vi.fn(() => new Promise(() => {})),
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
  checkEmbedStatus: vi.fn(async () => true),
  sendFeedback: vi.fn(async () => true),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
  I18nextProvider: ({ children }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
// Chatfenster der Blase: Ersatz mit Eingabefeld und einem verschachtelten
// Schritt (wie Kommentarfeld bzw. „Frühere Chats“), der sich als
// Escape-Ebene anmeldet (am alten Stand gibt es keine Ebenen: no-op)
vi.mock("@/components/ChatWindow", async () => {
  const React = await import("react");
  let useEscapeLayer = () => {};
  try {
    const path = "../src/utils/escape.js";
    ({ useEscapeLayer } = await import(/* @vite-ignore */ path));
  } catch (e) {
    // alter Stand
  }
  return {
    SEND_TEXT_EVENT: "send-text",
    default: function ChatWindowStub() {
      const [step, setStep] = React.useState(false);
      useEscapeLayer(step, () => setStep(false));
      return (
        <div id="chat-window-stub">
          <textarea id="message-input" />
          <button id="open-step" type="button" onClick={() => setStep(true)} />
          {step && <div id="nested-step" />}
        </div>
      );
    },
  };
});

import { embedderSettings } from "../src/main.jsx";
import App from "../src/App.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import * as layout from "../src/utils/layout.js";
import * as theme from "../src/utils/theme.js";
import * as contrast from "../src/utils/contrast.js";
import * as openButtonModule from "../src/components/OpenButton/index.jsx";
import * as dismissal from "../src/hooks/useBubbleDismissal.js";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import HistoricalMessage from "../src/components/ChatWindow/ChatContainer/ChatHistory/HistoricalMessage/index.jsx";
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";
import InlineChat from "../src/components/InlineChat/index.jsx";

const OpenButton = openButtonModule.default;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => config }));
const load = (script, server = {}) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));
const realInnerWidth = window.innerWidth;
function setWidth(px) {
  Object.defineProperty(window, "innerWidth", {
    value: px,
    configurable: true,
    writable: true,
  });
}
// neue Seite: Gerät und „auf dieser Seite gezeigt“ neu (Modulebene)
function newPage() {
  openButtonModule.resetPhoneAtLoad?.();
  dismissal.resetShownOnThisPage?.();
}

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
  embedderSettings.shadowRoot = null;
  embedderSettings.hostElement = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  newPage();
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  setWidth(realInnerWidth);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render(el) {
  act(() => root.render(el));
}
function remount(el) {
  act(() => root.unmount());
  root = createRoot(container);
  render(el);
}
const $ = (sel) => container.querySelector(sel);
// jsdom übernimmt isComposing/keyCode nicht aus dem Init: als Eigenschaft
const keydown = (target, extra = {}) =>
  act(() => {
    const e = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    for (const [k, v] of Object.entries(extra))
      Object.defineProperty(e, k, { value: v });
    target.dispatchEvent(e);
  });

// ---------------------------------------------------------------------------
describe("E1: Schwarz ist #222628, Empfehlung rechnet mit der gezeigten Farbe", () => {
  it("mittlere Kundenfarben: Empfehlung erreicht mit #222628 wirklich den höheren Kontrast", () => {
    const { recommendedTextColor, contrastRatio } = contrast;
    // F01: #767676 hatte mit #000000 Schwarz (4,62:1), gezeigt wurden 3,36:1
    for (const c of ["#767676", "#808080", "#3A9D23"]) {
      const rec = recommendedTextColor(c);
      const other = rec === "#FFFFFF" ? "#222628" : "#FFFFFF";
      expect(contrastRatio(c, rec)).toBeGreaterThanOrEqual(
        contrastRatio(c, other),
      );
    }
    expect(recommendedTextColor("#767676")).toBe("#FFFFFF");
    expect(recommendedTextColor("#01a5a9")).toBe("#222628");
    // Widget zeigt ohne Wert dieselbe Farbe, die das Design Center speichert
    expect(theme.resolveThemeVars({}, "light")["--allm-on-accent"]).toBe(
      "#222628",
    );
    // Pillen-Text unverändert (Abdunkeln weiter Richtung reines Schwarz),
    // gemessene Werte aus der Browser-Abnahme rc6 (Sonnet)
    expect(theme.pillTextColor({ buttonColor: "#01A5A9" }, "light")).toBe(
      "#018487",
    );
    expect(theme.pillTextColor({ buttonColor: "#FFD700" }, "light")).toBe(
      "#8A7400",
    );
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 3 (W01): Schrift auf der Kundenfarbe folgt der gezeigten Fläche", () => {
  function shadowStyle(hostStyle = {}) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    for (const [k, v] of Object.entries(hostStyle))
      host.style.setProperty(k, v);
    const shadow = host.attachShadow({ mode: "open" });
    const styleEl = document.createElement("style");
    shadow.appendChild(styleEl);
    return { host, styleEl };
  }

  it("Seite setzt --allm-accent ohne --allm-on-accent: Schrift aus dieser Farbe (Weiß auf Braun)", () => {
    const { host, styleEl } = shadowStyle({ "--allm-accent": "#b45309" });
    theme.applyTheme(styleEl, { buttonColor: "#01a5a9" });
    expect(styleEl.textContent).toContain(
      "--allmi-on-accent: var(--allm-on-accent, #FFFFFF);",
    );
    // Pillen-Text richtet sich ebenfalls nach der gezeigten Farbe
    expect(styleEl.textContent).toContain(
      "--allmi-pill-accent-text: var(--allm-pill-accent-text, var(--allmi-accent));",
    );
    host.remove();
  });

  it("Seite setzt --allm-user-bg: Nutzerblase aus dieser Farbe; nicht auswertbar: Weiß", () => {
    const a = shadowStyle({ "--allm-user-bg": "#1e3a8a" });
    theme.applyTheme(a.styleEl, {
      buttonColor: "#ffd400",
      userBgColor: "#ffd400",
    });
    expect(a.styleEl.textContent).toContain(
      "--allmi-user-text: var(--allm-user-text, #FFFFFF);",
    );
    a.host.remove();
    const b = shadowStyle({ "--allm-accent": "teal" });
    theme.applyTheme(b.styleEl, { buttonColor: "#ffd400" });
    expect(b.styleEl.textContent).toContain(
      "--allmi-on-accent: var(--allm-on-accent, #FFFFFF);",
    );
    b.host.remove();
  });

  it("ohne Seitenwert: Design-Center-Farbe; gewählte Schrift bleibt wie gewählt", () => {
    const a = shadowStyle();
    theme.applyTheme(a.styleEl, { buttonColor: "#ffd400" });
    expect(a.styleEl.textContent).toContain(
      "--allmi-on-accent: var(--allm-on-accent, #222628);",
    );
    a.host.remove();
    const b = shadowStyle({ "--allm-accent": "#b45309" });
    theme.applyTheme(b.styleEl, {
      buttonColor: "#ffd400",
      userTextColor: "#222628",
    });
    expect(b.styleEl.textContent).toContain(
      "--allmi-on-accent: var(--allm-on-accent, #222628);",
    );
    b.host.remove();
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 9 (F08, Widget): Begrüßung als Gruppe vom Server, kürzen statt verwerfen", () => {
  it("Server-Begrüßung verdrängt data-greeting-bubble-text am Skript", async () => {
    const s = await load(
      { greetingBubbleText: "Alte Blase vom Skript" },
      { greeting: "Willkommen bei der VHS!" },
    );
    expect(layout.greetingText(s)).toBe("Willkommen bei der VHS!");
    // ohne Serverwert bleibt das Skript-Attribut wirksam
    const t = await load({ greetingBubbleText: "Blase vom Skript" }, {});
    expect(layout.greetingText(t)).toBe("Blase vom Skript");
  });

  it("zu lange Begrüßung wird auf ein Wortende gekürzt (wie Server und Design Center)", async () => {
    const long = `${"Willkommen in unserem Kursprogramm ".repeat(12)}Ende.`;
    expect(long.length).toBeGreaterThan(300);
    const s = await load({}, { greetingBubbleText: long });
    expect(typeof s.greetingBubbleText).toBe("string");
    expect(s.greetingBubbleText.length).toBeLessThanOrEqual(300);
    expect(s.greetingBubbleText.endsWith("…")).toBe(true);
    expect(s.greetingBubbleText).not.toMatch(/\s…$/);
    expect(long.startsWith(s.greetingBubbleText.slice(0, -1))).toBe(true);
    // Begrüßung ohne Längengrenze (greeting) ebenso
    expect(layout.greetingText({ greeting: long })).toBe(s.greetingBubbleText);
  });
});

// ---------------------------------------------------------------------------
describe("Escape (Nr. 14 W02, Nr. 17 W05, Nr. 18 W06)", () => {
  async function mountApp(script = {}) {
    embedderSettings.settings = { ...BASE, openOnLoad: "on", ...script };
    embedderSettings.shadowRoot = document;
    embedderSettings.hostElement = container;
    vi.stubGlobal("fetch", fetchConfig({}));
    await act(async () => root.render(<App />));
    for (let i = 0; i < 5; i++) await act(async () => {});
    expect($("#chat-window-stub")).not.toBeNull();
  }

  it("IME-Eingabe: Escape bricht nur die Umwandlung ab, Fenster bleibt offen", async () => {
    await mountApp();
    keydown($("#message-input"), { isComposing: true });
    expect($("#chat-window-stub")).not.toBeNull();
    keydown($("#message-input"), { keyCode: 229 });
    expect($("#chat-window-stub")).not.toBeNull();
  });

  it("verschachtelter Schritt offen: Escape schließt nur den Schritt, danach das Fenster", async () => {
    await mountApp();
    act(() => $("#open-step").click());
    expect($("#nested-step")).not.toBeNull();
    // Fokus liegt nach dem Klick auf der Seite: trotzdem nur der Schritt
    keydown(document.body);
    expect($("#nested-step")).toBeNull();
    expect($("#chat-window-stub")).not.toBeNull();
    keydown(document.body);
    expect($("#chat-window-stub")).toBeNull();
  });

  it("Feld in einem offenen Shadow Root der Seite: Escape bleibt beim Feld", async () => {
    await mountApp();
    const comp = document.createElement("site-search");
    document.body.appendChild(comp);
    const field = document.createElement("input");
    comp.attachShadow({ mode: "open" }).appendChild(field);
    keydown(field);
    expect($("#chat-window-stub")).not.toBeNull();
    comp.remove();
  });

  it("Checkbox, Button oder contenteditable=false der Seite: Escape schließt; Textfelder halten es", async () => {
    for (const make of [
      () =>
        Object.assign(document.createElement("input"), { type: "checkbox" }),
      () => Object.assign(document.createElement("input"), { type: "range" }),
      () => document.createElement("button"),
      () => {
        const d = document.createElement("div");
        d.setAttribute("contenteditable", "false");
        return d;
      },
    ]) {
      await mountApp();
      const el = make();
      document.body.appendChild(el);
      keydown(el);
      expect($("#chat-window-stub")).toBeNull();
      el.remove();
      remount(<div />);
    }
    // Textfeld und contenteditable der Seite: Escape bleibt beim Feld
    for (const make of [
      () => Object.assign(document.createElement("input"), { type: "search" }),
      () => {
        const d = document.createElement("div");
        d.setAttribute("contenteditable", "");
        return d;
      },
    ]) {
      await mountApp();
      const el = make();
      document.body.appendChild(el);
      keydown(el);
      expect($("#chat-window-stub")).not.toBeNull();
      el.remove();
      remount(<div />);
    }
  });

  it("Kommentarfeld nach Daumen runter: Escape schließt nur das Kommentarfeld", async () => {
    const path = "../src/utils/escape.js";
    const escape = await import(/* @vite-ignore */ path).catch(() => ({}));
    embedderSettings.settings = { enableTts: false };
    render(
      <HistoricalMessage
        uuid="m-1"
        message="Antwort"
        role="assistant"
        chatId={42}
        sentAt={1760000000}
        sessionId="s-1"
        settings={{}}
      />,
    );
    const down = $('button[aria-label="Antwort war nicht hilfreich"]');
    await act(async () => down.click());
    expect($("textarea")).not.toBeNull();
    expect(escape.closeTopEscapeLayer?.()).toBe(true);
    await act(async () => {});
    expect($("textarea")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 16 (W04): data-bubble-persistence mit neuem Server", () => {
  it("wirkungslos, eine Warnzeile nennt den Ersatz", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await load(
      { bubblePersistence: "sessionStorage" },
      { welcomeBubblesDesktop: "first", welcomeBubblesMobile: "first" },
    );
    expect(s.bubblePersistence).toBeUndefined();
    const lines = warn.mock.calls
      .map(([m]) => String(m))
      .filter((m) => m.includes("data-bubble-persistence"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Bei jedem Besuch");
    expect(lines[0]).not.toMatch(/[–—]/);
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 19 (W07): Gerät und „gezeigt“ gelten für den ganzen Seitenaufruf", () => {
  const button = (extra = {}) => (
    <OpenButton
      settings={{
        embedId: "e1",
        displayChatbotBubbles: true,
        chatbotBubblesMessages: [],
        position: "bottom-right",
        ...extra,
      }}
      isOpen={false}
      toggleOpen={() => {}}
    />
  );
  const KEY = `anythingllm-embed-bubbles-dismissed-${window.location.origin}-e1`;

  it("Fenster nach dem Laden über 768 px vergrößert: Chat schließen behält das Handy-Verhalten", () => {
    setWidth(390);
    const cfg = { welcomeBubblesDesktop: "off", welcomeBubblesMobile: "every" };
    render(button(cfg));
    expect($("[data-welcome-bubbles]")).not.toBeNull();
    // Chat öffnen (OpenButton ausgehängt), Fenster breiter, Chat schließen
    act(() => root.unmount());
    setWidth(1440);
    root = createRoot(container);
    render(button(cfg));
    expect($("[data-welcome-bubbles]")).not.toBeNull();
  });

  it("„Bei jedem Besuch“ und sofortiges Öffnen: nicht schon im ersten Frame als gezeigt gemerkt", () => {
    vi.useFakeTimers();
    setWidth(1440);
    const cfg = { welcomeBubblesDesktop: "every" };
    render(button(cfg));
    // Chat öffnet sofort (openOnLoad): OpenButton gleich wieder ausgehängt
    act(() => root.unmount());
    act(() => vi.advanceTimersByTime(2000));
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    // Blasen eine Weile zu sehen: dann gemerkt
    root = createRoot(container);
    render(button(cfg));
    act(() => vi.advanceTimersByTime(2000));
    expect(JSON.parse(window.sessionStorage.getItem(KEY)).shown).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 20/27 (W08): Startvorschläge unter der eingeklappten Leiste wie die Pillen", () => {
  it("Chips nutzen die Pillen-Optik (Klasse, Rand und Text in Kundenfarbe)", () => {
    const mountTarget = document.createElement("div");
    document.body.appendChild(mountTarget);
    const host = document.createElement("div");
    mountTarget.appendChild(host);
    embedderSettings.hostElement = host;
    render(
      <InlineChat
        settings={{
          ...BASE,
          displayMode: "inline",
          inlineInput: true,
          defaultMessages: ["Spanisch A1", "Yoga"],
        }}
        mountTarget={mountTarget}
        sessionId="s-1"
        conversationId="c-1"
      />,
    );
    const chips = [
      ...container.querySelectorAll("#anything-llm-inline-chips button"),
    ];
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.classList.contains("allm-pill-accent")).toBe(true);
      expect(chip.style.color).toContain("--allmi-pill-accent-text");
      expect(chip.style.border).toContain("--allmi-pill-border");
      expect(chip.style.backgroundColor).toContain("--allmi-chip-bg");
    }
    mountTarget.remove();
  });

  it("Fläche der Chips: hell Weiß, dunkel der Fensterton (Text dort mindestens 4,5:1)", () => {
    expect(theme.buildThemeCss({}, "light")).toContain(
      "--allmi-chip-bg: #FFFFFF;",
    );
    expect(theme.buildThemeCss({}, "dark")).toContain(
      `--allmi-chip-bg: ${theme.DARK.bg};`,
    );
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 21 (W09): Leiste folgt dem Farbschema aus dem Design Center", () => {
  it("data-inline-theme am Skript wirkt nicht mehr", async () => {
    const s = await load({ displayMode: "inline", inlineTheme: "dark" }, {});
    expect(s.inlineTheme).toBeNull();
    expect(theme.resolveBarTheme(s, "light")).toBe("light");
    const d = await load(
      { displayMode: "inline", inlineTheme: "light" },
      {
        theme: "dark",
      },
    );
    expect(theme.resolveBarTheme(d, "dark")).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 22 (W10): KI-Hinweis immer genau eine Zeile", () => {
  it("kein Umbruch, kleinere Schrift bis 10 px, notfalls „…“, voller Text im title", async () => {
    render(<ChatContainer sessionId="s-1" settings={{ ...BASE }} />);
    const note = $("#anything-llm-ai-disclaimer");
    expect(note).not.toBeNull();
    expect(note.style.whiteSpace).toBe("nowrap");
    expect(note.style.overflow).toBe("hidden");
    expect(note.style.textOverflow).toBe("ellipsis");
    expect(note.getAttribute("title")).toBe(note.textContent);
    // Schrift 11 px, in schmalen Fenstern bis 10 px (Containerabfrage)
    expect(note.parentElement.className).toContain("allm-ai-disclaimer-box");
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/src/main.jsx`, "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(css).toContain(
      ".allm-ai-disclaimer-box { container-type: inline-size; }",
    );
    expect(css).toContain(
      ".allm-ai-disclaimer { font-size: 11px; font-size: clamp(10px, calc((100cqi - 16px) / 30), 11px); }",
    );
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 34 (B-08): Touch", () => {
  it("Schließen-X der Willkommensblasen ohne Hover sichtbar, Hover-Füllung nur mit Zeiger", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/src/main.jsx`, "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(css).toContain(
      "@media (hover: none) { .allm-welcome-close { opacity: 1 !important; } }",
    );
    expect(css).toMatch(
      /@media \(hover: hover\) \{ \.allm-pill-accent:hover \{/,
    );
    // keine Hover-Regel der Pillen außerhalb von (hover: hover)
    expect(css).not.toMatch(/\.allm-pill-accent:hover,/);
    setWidth(390);
    render(
      <OpenButton
        settings={{
          embedId: "e2",
          displayChatbotBubbles: true,
          chatbotBubblesMessages: [],
        }}
        isOpen={false}
        toggleOpen={() => {}}
      />,
    );
    const close = [
      ...container.querySelectorAll("[data-welcome-bubbles] > button"),
    ][0];
    expect(close.classList.contains("allm-welcome-close")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 35 (B-09, E3): Sprache", () => {
  it("ohne data-language: i18next deutsch, kein allm_embed_language im localStorage", async () => {
    window.localStorage.setItem("allm_embed_language", "en");
    const { initI18n } = await import("../src/i18n.js");
    const i18n = initI18n({});
    expect(i18n.language).toBe("de");
    expect(window.localStorage.getItem("allm_embed_language")).toBeNull();
  });

  it("Menüeinträge je Sprache; frühere feste Menütexte gelten als nicht gesetzt", async () => {
    const en = await load({
      language: "en",
      resetBurgerText: "Chat zurücksetzen",
    });
    expect(en.resetBurgerText ?? null).toBeNull();
    render(
      <ChatWindowHeader
        sessionId="s-1"
        conversationId="c-1"
        settings={{ ...en, loaded: true, supportEmail: "info@example.org" }}
        closeChat={() => {}}
        setChatHistory={() => {}}
        openHistory={() => {}}
      />,
    );
    const options = $('[aria-label="Options"]');
    expect(options).not.toBeNull();
    act(() => options.click());
    const text = container.textContent;
    for (const t of [
      "Reset chat",
      "Previous chats",
      "Email support",
      "Chat ID",
    ])
      expect(text).toContain(t);
    expect(text).not.toContain("Chat zurücksetzen");
    // deutsch
    const de = await load({});
    remount(
      <ChatWindowHeader
        sessionId="s-1"
        conversationId="c-1"
        settings={{ ...de, loaded: true, supportEmail: "info@example.org" }}
        closeChat={() => {}}
        setChatHistory={() => {}}
        openHistory={() => {}}
      />,
    );
    act(() => $('[aria-label="Optionen"]').click());
    for (const t of [
      "Chat zurücksetzen",
      "Frühere Chats",
      "E-Mail Support",
      "Chat-ID",
    ])
      expect(container.textContent).toContain(t);
  });

  it("Standard-Willkommensblasen und Beschriftungen des Chat-Buttons je Sprache", () => {
    setWidth(1440);
    render(
      <OpenButton
        settings={{
          embedId: "e3",
          language: "en",
          displayChatbotBubbles: true,
          chatbotBubblesMessages: [],
        }}
        isOpen={false}
        toggleOpen={() => {}}
      />,
    );
    expect(container.textContent).toContain("Hello! I am your AI advisor.");
    expect(container.textContent).not.toContain("KI-Berater");
    expect($('[aria-label="Open chat"]')).not.toBeNull();
    expect($('[aria-label="Close welcome messages"]')).not.toBeNull();
    remount(
      <OpenButton
        settings={{
          embedId: "e4",
          displayChatbotBubbles: true,
          chatbotBubblesMessages: [],
        }}
        isOpen={false}
        toggleOpen={() => {}}
      />,
    );
    expect(container.textContent).toContain("Hallo! Ich bin Ihr KI-Berater.");
    expect($('[aria-label="Chat öffnen"]')).not.toBeNull();
    expect($('[aria-label="Willkommensblasen schließen"]')).not.toBeNull();
  });

  it("aria-labels im Fenster folgen der Sprache (Senden, Schließen, Optionen)", () => {
    embedderSettings.settings = { language: "en" };
    render(
      <ChatContainer sessionId="s-1" settings={{ ...BASE, language: "en" }} />,
    );
    expect($('[aria-label="Send message"]')).not.toBeNull();
    remount(<ChatContainer sessionId="s-1" settings={{ ...BASE }} />);
    expect($('[aria-label="Nachricht senden"]')).not.toBeNull();
    expect($('[aria-label="Send message"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("Nr. 36 (B-10): Pfeil nach unten, wenn Inhalt unter dem Sichtbereich wächst", () => {
  const props = {};
  beforeEach(() => {
    for (const [name, value] of [
      ["scrollHeight", 1200],
      ["clientHeight", 400],
    ]) {
      props[name] = Object.getOwnPropertyDescriptor(Element.prototype, name);
      Object.defineProperty(Element.prototype, name, {
        configurable: true,
        get() {
          return this.id === "chat-history" ? value : 0;
        },
      });
    }
  });
  afterEach(() => {
    for (const [name, d] of Object.entries(props))
      Object.defineProperty(Element.prototype, name, d);
  });

  it("Text zuerst: Frage bleibt oben, Folgefragen darunter, Pfeil erscheint ohne Scrollen", async () => {
    const settings = {
      courseCards: "auto",
      courseCardsPosition: "below",
      followUps: "pills",
    };
    render(
      <ChatHistory
        settings={settings}
        history={[
          { role: "user", content: "Gibt es Yogakurse?", uuid: "u" },
          {
            role: "assistant",
            content: "Ja, mehrere.",
            uuid: "a",
            chatId: 7,
            followUps: ["Wann?", "Wo?"],
            followUpsArrivedAt: 1,
          },
        ]}
      />,
    );
    await act(() => new Promise((r) => setTimeout(r, 200)));
    const arrow = $("#scroll-to-bottom-button");
    expect(arrow).not.toBeNull();
    expect(arrow.getAttribute("aria-label")).toBe("Nach unten scrollen");
  });

  it("neuer Chat (erst leer): Scrollen ans Ende blendet den Pfeil wieder aus", async () => {
    const settings = { courseCards: "auto", courseCardsPosition: "below" };
    render(<ChatHistory settings={settings} history={[]} />);
    render(
      <ChatHistory
        settings={settings}
        history={[
          { role: "user", content: "Gibt es Yogakurse?", uuid: "u" },
          { role: "assistant", content: "Ja.", uuid: "a", chatId: 7 },
        ]}
      />,
    );
    await act(() => new Promise((r) => setTimeout(r, 200)));
    expect($("#scroll-to-bottom-button")).not.toBeNull();
    const hist = $("#chat-history");
    Object.defineProperty(hist, "scrollTop", {
      configurable: true,
      value: 800,
    });
    act(() => hist.dispatchEvent(new Event("scroll")));
    await act(() => new Promise((r) => setTimeout(r, 250)));
    expect($("#scroll-to-bottom-button")).toBeNull();
  });
});
