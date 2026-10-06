import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";

// Panel-Optik (Pillen, Begrüßungsblase, Kopfzeile mit Untertitel/Online-
// Punkt) und einmaliger Datenschutz-Hinweis (privacyNotice "modal"):
// Settings/Validierung, Rendering, Sperre + wartendes Ticket, localStorage.

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
  PANEL_PILLS_MAX,
  PANEL_TEXTS,
  layoutValidations,
  panelPills,
} from "../src/utils/layout.js";
import { _resetPrivacyMemory, privacyAckKey } from "../src/utils/privacy.js";
import ChatContainer, {
  SEND_TEXT_EVENT,
} from "../src/components/ChatWindow/ChatContainer/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";

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
  _resetPrivacyMemory();
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
  it("Standard ohne Attribute = bisherige Darstellung", async () => {
    const s = await loadEmbedSettings(BASE, fetchConfig({}));
    expect(s.suggestionStyle).toBe("bars");
    expect(s.greetingStyle).toBe("text");
    expect(s.onlineDot).toBe(false);
    expect(s.assistantSubtitle).toBe(null);
    expect(s.privacyNotice).toBe("none");
    expect(s.privacyUrl).toBe(null);
    expect(s.greetingBubbleText).toBe(null); // Standard der Sprache
    expect(s.privacyTitle).toBe(null);
    expect(s.privacyText).toBe(null);
    expect(s.privacyButtonText).toBe(null);
    expect(s.disclaimer).toBe("none");
    expect(s.disclaimerText).toBe(null);
  });

  it("Script-Attribute (data-*) wirken", async () => {
    const s = await loadEmbedSettings(
      {
        ...BASE,
        suggestionStyle: "Pills",
        greetingStyle: "bubble",
        greetingBubbleText: "  Hallo!  ",
        assistantSubtitle: "durchsucht 1.243 Kurse",
        onlineDot: "true",
        privacyNotice: "modal",
        privacyTitle: "Datenschutz",
        privacyText: "Punkt eins | Punkt zwei",
        privacyButtonText: "Los",
        privacyUrl: "https://example.org/datenschutz",
        disclaimer: "footer",
        disclaimerText: "KI kann irren.",
      },
      fetchConfig({}),
    );
    expect(s).toMatchObject({
      suggestionStyle: "pills",
      greetingStyle: "bubble",
      greetingBubbleText: "Hallo!",
      assistantSubtitle: "durchsucht 1.243 Kurse",
      onlineDot: true,
      privacyNotice: "modal",
      privacyTitle: "Datenschutz",
      privacyText: "Punkt eins\nPunkt zwei",
      privacyButtonText: "Los",
      privacyUrl: "https://example.org/datenschutz",
      disclaimer: "footer",
      disclaimerText: "KI kann irren.",
    });
  });

  it("alle Schlüssel aus visual_config (gemockter /config) wirken und gewinnen", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, suggestionStyle: "bars", onlineDot: "false" },
      fetchConfig({
        suggestionStyle: "pills",
        greetingStyle: "bubble",
        greetingBubbleText: "Server-Begrüßung",
        assistantSubtitle: "Server-Untertitel",
        onlineDot: true,
        privacyNotice: "bubble",
        privacyTitle: "Server-Titel",
        privacyText: "Server-Text",
        privacyButtonText: "Weiter",
        privacyUrl: "/datenschutz",
        disclaimer: "footer",
        disclaimerText: "Server-Hinweis",
      }),
    );
    expect(s).toMatchObject({
      suggestionStyle: "pills",
      greetingStyle: "bubble",
      greetingBubbleText: "Server-Begrüßung",
      assistantSubtitle: "Server-Untertitel",
      onlineDot: true,
      privacyNotice: "bubble",
      privacyTitle: "Server-Titel",
      privacyText: "Server-Text",
      privacyButtonText: "Weiter",
      privacyUrl: "/datenschutz",
      disclaimer: "footer",
      disclaimerText: "Server-Hinweis",
    });
  });

  it("ungültige Enums -> Standard + je eine console.warn", async () => {
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
    expect(s.suggestionStyle).toBe("bars");
    expect(s.greetingStyle).toBe("text");
    expect(s.privacyNotice).toBe("none");
    expect(s.disclaimer).toBe("none");
    const lines = warn.mock.calls.map((c) => String(c[0]));
    for (const key of [
      "suggestionStyle",
      "greetingStyle",
      "privacyNotice",
      "disclaimer",
    ]) {
      const mine = lines.filter((l) => l.includes(`Ungültiger ${key}-Wert`));
      expect(mine).toHaveLength(1);
    }
    expect(lines.find((l) => l.includes("suggestionStyle"))).toContain(
      'es gilt "bars"',
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
    expect(layoutValidations.privacyTitle("   ")).toBe(undefined);
    expect(layoutValidations.greetingBubbleText(42)).toBe(undefined);
  });

  it("privacyText: Stichpunkte je Zeile oder |, max. 5 × 160 Zeichen", () => {
    expect(layoutValidations.privacyText(" Eins |Zwei\r\nDrei\n\n ")).toBe(
      "Eins\nZwei\nDrei",
    );
    const five = Array.from({ length: 5 }, () => "p".repeat(160)).join("|");
    expect(layoutValidations.privacyText(five).split("\n")).toHaveLength(5);
    expect(layoutValidations.privacyText(`${five}|sechs`)).toBe(undefined);
    expect(layoutValidations.privacyText("q".repeat(161))).toBe(undefined);
    expect(layoutValidations.privacyText(" | ")).toBe(undefined);
  });

  it("privacyUrl: nur https oder Pfad der Seite", () => {
    const ok = ["https://vhs.de/datenschutz", "/datenschutz#ki"];
    const bad = [
      "http://vhs.de/datenschutz",
      "javascript:alert(1)",
      "//evil.example/x",
      "data:text/html,<b>x</b>",
      "https://vhs.de/a b",
      `https://vhs.de/${"x".repeat(520)}`,
      42,
    ];
    for (const u of ok) expect(layoutValidations.privacyUrl(u)).toBe(u);
    for (const u of bad)
      expect(layoutValidations.privacyUrl(u)).toBe(undefined);
  });

  it("onlineDot: Boolean-Strings wie inlineInput", () => {
    expect(layoutValidations.onlineDot("on")).toBe(true);
    expect(layoutValidations.onlineDot("0")).toBe(false);
    expect(layoutValidations.onlineDot("vielleicht")).toBe(undefined);
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
    expect(pills[0].style.border).toContain("1px solid");
    expect(pills[0].style.borderRadius).toBe("var(--allmi-bar-radius, 999px)");
    expect($("#anything-llm-suggestion-pills").style.flexWrap).toBe("wrap");
    act(() => pills[1].click());
    window.removeEventListener(SEND_TEXT_EVENT, onSend);
    expect(sent).toEqual(["Yoga"]);
  });

  it("pills: höchstens 6, Text über 60 Zeichen mit … gekürzt, gesendet wird der volle Text", () => {
    const long = `Gibt es ${"sehr ".repeat(15)}lange Kurse?`;
    const list = [long, ...Array.from({ length: 8 }, (_, i) => `F${i}`)];
    const pills = panelPills({ defaultMessages: list });
    expect(pills).toHaveLength(PANEL_PILLS_MAX);
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

  it("bubble: Blase mit Avatar und greetingBubbleText, greeting klein darunter", () => {
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
    const small = $("#anything-llm-greeting-small");
    expect(small.textContent).toBe(GREETING);
    expect(small.style.fontSize).toBe("11.5px");
    expect(small.style.color).toContain("--allmi-text-muted");
    // Reihenfolge: Blase, Pillen, Hinweis
    const order = [bubble, $("#anything-llm-suggestion-pills"), small].map(
      (el) => el.compareDocumentPosition(small),
    );
    expect(order[0] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("bubble ohne eigenen Text: Standardtext", () => {
    render(<ChatHistory settings={{ greetingStyle: "bubble" }} history={[]} />);
    expect($("#anything-llm-greeting-bubble").textContent).toBe(
      DEFAULT_GREETING_BUBBLE_TEXT,
    );
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

  it("Untertitel, grüner Punkt (aria-hidden, Tooltip online), Icon-URL", () => {
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
    const dot = $("[data-online-dot]");
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.getAttribute("title")).toBe("online");
    expect(dot.style.width).toBe("8px");
    expect(dot.style.backgroundColor).toBe("rgb(59, 178, 115)");
    expect($("#anything-llm-header img").getAttribute("src")).toBe(
      "https://x.test/kursberater.svg",
    );
  });
});

// ---------------------------------------------------------------------------
describe("Datenschutz-Hinweis (AK-5, AK-6, NAK-1, NAK-3)", () => {
  const settings = {
    ...BASE,
    enableStt: false,
    privacyNotice: "modal",
    privacyUrl: "https://vhs.example/datenschutz",
  };
  const props = {
    sessionId: "s-1",
    conversationId: "c-1",
    knownHistory: [],
  };
  const ackButton = () =>
    $$("#anything-llm-privacy-notice button").find(
      (b) => b.textContent === "Start",
    );

  it("Standard (none): kein Hinweis, Eingabe frei", () => {
    render(
      <ChatContainer {...props} settings={{ ...BASE, enableStt: false }} />,
    );
    expect($("#anything-llm-privacy-notice")).toBe(null);
    expect($("#message-input").disabled).toBe(false);
  });

  it("erstes Öffnen: „Datenschutz:“, Stichpunkte, Link, Knopf „Start“; Eingabe gesperrt; Fokus auf „Start“", () => {
    render(<ChatContainer {...props} settings={settings} />);
    const dlg = $("[role=dialog]");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.querySelector("h2").textContent).toBe(DEFAULT_PRIVACY_TITLE);
    expect(DEFAULT_PRIVACY_TITLE).toBe("Datenschutz:");
    expect([...dlg.querySelectorAll("li")].map((li) => li.textContent)).toEqual(
      DEFAULT_PRIVACY_POINTS,
    );
    expect(dlg.textContent).toContain("eigener Infrastruktur in Deutschland");
    const link = dlg.querySelector("a");
    expect(link.textContent).toBe("Erklärung zum Datenschutz");
    expect(link.parentElement.textContent).toBe(
      "Weitere Informationen in der Erklärung zum Datenschutz",
    );
    expect(link.getAttribute("href")).toBe("https://vhs.example/datenschutz");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(ackButton()).toBeTruthy();
    expect(document.activeElement).toBe(ackButton());
    expect($("#message-input").disabled).toBe(true);
    expect($("#send-message-button").disabled).toBe(true);
  });

  it("Knopftext, Titel und Punkte aus den Settings; englisch mit language en", () => {
    render(
      <ChatContainer
        {...props}
        settings={{
          ...settings,
          privacyTitle: "Hinweis",
          privacyText: "A\nB",
          privacyButtonText: "Los geht's",
        }}
      />,
    );
    expect($("[role=dialog] h2").textContent).toBe("Hinweis");
    expect($$("[role=dialog] li").map((li) => li.textContent)).toEqual([
      "A",
      "B",
    ]);
    expect($("[role=dialog] button").textContent).toBe("Los geht's");
    act(() => root.unmount());
    root = createRoot(container);
    render(
      <ChatContainer {...props} settings={{ ...settings, language: "en" }} />,
    );
    expect($("[role=dialog] h2").textContent).toBe(PANEL_TEXTS.en.privacyTitle);
    expect($$("[role=dialog] li")).toHaveLength(3);
  });

  it("Tab bleibt im Hinweis (Link <-> Start)", () => {
    render(<ChatContainer {...props} settings={settings} />);
    const link = $("#anything-llm-privacy-notice a");
    const btn = ackButton();
    btn.focus();
    act(() => {
      btn.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(link);
    act(() => {
      link.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(btn);
    act(() => {
      btn.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(document.activeElement).toBe(link);
  });

  it("Escape bestätigt nicht", () => {
    render(<ChatContainer {...props} settings={settings} />);
    act(() => {
      ackButton().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect($("#anything-llm-privacy-notice")).toBeTruthy();
    expect(window.localStorage.getItem(privacyAckKey(BASE.embedId))).toBe(null);
  });

  it("„Start“: frei, localStorage-Eintrag (Zeitstempel); erneutes Öffnen ohne Hinweis", () => {
    render(<ChatContainer {...props} settings={settings} />);
    act(() => ackButton().click());
    expect($("#anything-llm-privacy-notice")).toBe(null);
    expect($("#message-input").disabled).toBe(false);
    const stored = window.localStorage.getItem(
      `allm-privacy-ack-${BASE.embedId}`,
    );
    expect(Number.isNaN(Date.parse(stored))).toBe(false);
    // neues Laden (Speicher leer, nur localStorage): kein Hinweis
    _resetPrivacyMemory();
    act(() => root.unmount());
    root = createRoot(container);
    render(<ChatContainer {...props} settings={settings} />);
    expect($("#anything-llm-privacy-notice")).toBe(null);
  });

  it("anderes Embed: eigener Schlüssel, Hinweis erscheint", () => {
    window.localStorage.setItem(privacyAckKey(BASE.embedId), "x");
    render(
      <ChatContainer
        {...props}
        settings={{ ...settings, embedId: "anderes-embed" }}
      />,
    );
    expect($("#anything-llm-privacy-notice")).toBeTruthy();
  });

  it("Vorschlag (SEND_TEXT_EVENT) wird während der Sperre nicht gesendet", () => {
    render(<ChatContainer {...props} settings={settings} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SEND_TEXT_EVENT, { detail: { command: "Yoga" } }),
      );
    });
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  it("AK-6: Frage aus der Leiste wartet auf „Start“ und wird danach genau einmal gesendet", () => {
    const consumed = vi.fn();
    const pending = {
      ticket: 1,
      text: "Gibt es Yogakurse am Abend?",
      send: true,
      suppressAutoFocus: false,
    };
    render(
      <StrictMode>
        <ChatContainer
          {...props}
          settings={settings}
          pendingFirstMessage={pending}
          onPendingFirstMessageConsumed={consumed}
        />
      </StrictMode>,
    );
    expect(chatService.streamChat).not.toHaveBeenCalled();
    expect(consumed).not.toHaveBeenCalled();
    act(() => ackButton().click());
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(chatService.streamChat.mock.calls[0][2]).toBe(
      "Gibt es Yogakurse am Abend?",
    );
    expect(consumed).toHaveBeenCalledTimes(1);
    // erneutes Rendern mit demselben Ticket: keine zweite Sendung
    render(
      <StrictMode>
        <ChatContainer
          {...props}
          settings={settings}
          pendingFirstMessage={{ ...pending }}
          onPendingFirstMessageConsumed={consumed}
        />
      </StrictMode>,
    );
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
  });

  it("Entwurf (send false) landet nach „Start“ im Eingabefeld", () => {
    const consumed = vi.fn();
    render(
      <ChatContainer
        {...props}
        settings={settings}
        pendingFirstMessage={{ ticket: 3, text: "Töpfern", send: false }}
        onPendingFirstMessageConsumed={consumed}
      />,
    );
    expect($("#message-input").value).toBe("");
    act(() => ackButton().click());
    expect($("#message-input").value).toBe("Töpfern");
    expect(chatService.streamChat).not.toHaveBeenCalled();
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it("NAK-1: HTML in privacyTitle/privacyText erscheint als Text", () => {
    render(
      <ChatContainer
        {...props}
        settings={{
          ...settings,
          privacyTitle: "<i>Titel</i>",
          privacyText: "<b>fett</b><script>x()</script>",
        }}
      />,
    );
    const dlg = $("[role=dialog]");
    expect(dlg.querySelector("b, i, script, strong")).toBe(null);
    expect(dlg.textContent).toContain("<b>fett</b><script>x()</script>");
    expect(dlg.textContent).toContain("<i>Titel</i>");
  });

  it("ohne privacyUrl: kein Link", () => {
    render(
      <ChatContainer {...props} settings={{ ...settings, privacyUrl: null }} />,
    );
    expect($("#anything-llm-privacy-notice a")).toBe(null);
  });

  it("NAK-3: localStorage wirft -> kein Fehler, Hinweis einmal pro Sitzung", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<ChatContainer {...props} settings={settings} />);
    expect($("#anything-llm-privacy-notice")).toBeTruthy();
    act(() => ackButton().click());
    expect($("#anything-llm-privacy-notice")).toBe(null);
    expect($("#message-input").disabled).toBe(false);
    // gleiche Sitzung, neuer Mount (z. B. Reset/anderer Chat): kein Hinweis
    act(() => root.unmount());
    root = createRoot(container);
    render(<ChatContainer {...props} settings={settings} />);
    expect($("#anything-llm-privacy-notice")).toBe(null);
    expect(err).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("Datenschutz in der Begrüßungsblase (privacyNotice bubble)", () => {
  const props = { sessionId: "s-1", conversationId: "c-1", knownHistory: [] };
  const settings = {
    ...BASE,
    enableStt: false,
    privacyNotice: "bubble",
    privacyUrl: "/datenschutz",
    greeting: GREETING,
  };

  it("Punkte als Absätze in der Blase, letzter mit fettem „Wichtig:“, Link; kein Popup, Eingabe frei, kein localStorage", () => {
    render(<ChatContainer {...props} settings={settings} />);
    // greetingStyle nicht gesetzt -> Blase trotzdem
    const bubble = $("#anything-llm-greeting-bubble");
    expect(bubble.textContent.startsWith(DEFAULT_GREETING_BUBBLE_TEXT)).toBe(
      true,
    );
    const paras = $$("#anything-llm-bubble-privacy p");
    expect(paras.map((p) => p.textContent)).toEqual([
      DEFAULT_PRIVACY_POINTS[0],
      DEFAULT_PRIVACY_POINTS[1],
      `Wichtig: ${DEFAULT_PRIVACY_POINTS[2]}`,
      "Datenschutz",
    ]);
    expect(paras[2].querySelector("strong").textContent).toBe("Wichtig:");
    expect(paras[0].querySelector("strong")).toBe(null);
    expect(paras[3].querySelector("a").getAttribute("href")).toBe(
      "/datenschutz",
    );
    expect($("#anything-llm-privacy-notice")).toBe(null);
    expect($("#message-input").disabled).toBe(false);
    expect(window.localStorage.length).toBe(0);
    // kleiner greeting-Text entfällt (sonst doppelt)
    expect($("#anything-llm-greeting-small")).toBe(null);
  });

  it("eigene Punkte (|), ohne privacyUrl kein Link; HTML nur als Text", () => {
    render(
      <ChatContainer
        {...props}
        settings={{
          ...settings,
          privacyUrl: null,
          privacyText: "<b>Eins</b> | Zwei",
        }}
      />,
    );
    const paras = $$("#anything-llm-bubble-privacy p");
    expect(paras.map((p) => p.textContent)).toEqual([
      "<b>Eins</b>",
      "Wichtig: Zwei",
    ]);
    expect($("#anything-llm-bubble-privacy a")).toBe(null);
    expect($("#anything-llm-bubble-privacy b")).toBe(null);
  });

  it("Vorschlag wird ohne Sperre gesendet", () => {
    render(<ChatContainer {...props} settings={settings} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SEND_TEXT_EVENT, { detail: { command: "Yoga" } }),
      );
    });
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
describe("Fester KI-Hinweis unter dem Eingabefeld (disclaimer)", () => {
  const props = { sessionId: "s-1", conversationId: "c-1", knownHistory: [] };
  const base = { ...BASE, enableStt: false };

  it("Standard none: keine Zeile", () => {
    render(<ChatContainer {...props} settings={base} />);
    expect($("#anything-llm-ai-disclaimer")).toBe(null);
    expect($("[role=note]")).toBe(null);
  });

  it("footer: Zeile unter dem Eingabefeld (role note, 11,5 px, gedämpft, mittig), i18n-Schlüssel", () => {
    render(
      <ChatContainer {...props} settings={{ ...base, disclaimer: "footer" }} />,
    );
    const note = $("#anything-llm-ai-disclaimer");
    expect(note.getAttribute("role")).toBe("note");
    expect(note.textContent).toBe("chat.ai-disclaimer"); // t ist gemockt
    expect(note.style.fontSize).toBe("11.5px");
    expect(note.style.textAlign).toBe("center");
    expect(note.style.color).toContain("--allmi-text-muted");
    expect(note.querySelector("a, button")).toBe(null);
    const form = $("#message-input").closest("form") || $("#message-input");
    expect(
      form.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("disclaimerText ersetzt den Standard, HTML nur als Text", () => {
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
    const note = $("#anything-llm-ai-disclaimer");
    expect(note.textContent).toBe("<b>KI</b>");
    expect(note.querySelector("b")).toBe(null);
  });

  it("Standardtexte de/en in den Locales", async () => {
    const de = (await import("../src/locales/de/common.js")).default;
    const en = (await import("../src/locales/en/common.js")).default;
    expect(de.chat["ai-disclaimer"]).toBe(
      "Ich bin eine KI und kann Fehler machen. Bitte überprüfen Sie meine Antworten.",
    );
    expect(en.chat["ai-disclaimer"]).toBe(
      "I am an AI and can make mistakes. Please double-check my answers.",
    );
  });
});
