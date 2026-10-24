import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// AK-12 (issues/datenschutz-fusszeile.md, Nutzer 24.10.2026, „Option Blase
// beim Start“, D1 bis D4; Auftrag issues/datenschutz-fusszeile/
// auftrag-ak12-blase.md, Vertrag 3, 4, 5 und 7): Schalter im Design Center
// „Zusätzlich beim Start als Blase zeigen“, gespeichert als
// visual_config.privacyStartBubble true. Widget-Seite:
//  - Vertrag 3: Gruppe A, nur der Server-Wert zählt und nur genau true;
//    eine Einbau-Angabe (data-privacy-start-bubble) wirkt nicht, ein
//    Altwert privacyNotice „bubble“ schaltet die Blase nicht ein (D2).
//  - Vertrag 4 (D4): Blase unter der Begrüßungsblase wie in 7.22.2
//    (Fläche, Schrift, Avatar, Abstände wie die Begrüßung), Überschrift fett,
//    Datenschutztext als Punkte, Link „Datenschutzerklärung“ nur mit
//    gültiger privacyUrl; ohne den Punkt „Hinweis zur KI“; alles Text
//    (NAK-1), nur https oder Pfad (NAK-3); bleibt im Verlauf oben stehen;
//    Startvorschläge darunter.
//  - Vertrag 5 (D1): der Link „Datenschutz“ in der Fußzeile bleibt immer,
//    das Fenster unverändert.
//  - Vertrag 7: ATTRIBUTES.md und README nennen den Schlüssel.

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
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
const historyState = vi.hoisted(() => ({ value: [] }));
vi.mock("@/hooks/chat/useChatHistory", () => ({
  default: () => ({
    chatHistory: historyState.value,
    setChatHistory: () => {},
    loading: false,
  }),
}));

import { embedderSettings } from "../src/main.jsx";
import * as scriptAttrs from "../src/hooks/useScriptAttributes.js";
import * as layout from "../src/utils/layout.js";
import ChatContainer, {
  sendSuggestion,
} from "../src/components/ChatWindow/ChatContainer/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import ChatWindow from "../src/components/ChatWindow/index.jsx";

const { loadEmbedSettings } = scriptAttrs;
const { PANEL_TEXTS } = layout;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const HISTORY = [
  { role: "user", content: "Gibt es Yoga?", sentAt: 1 },
  { role: "assistant", content: "Ja, montags.", sentAt: 2, chatId: 1 },
];
const MSGS = ["Gibt es Yoga?", "Kurse am Abend?"];
const ON = { privacyStartBubble: true };

const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script = {}, server = {}) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
  historyState.value = [];
  chatService.streamChat.mockClear();
  window.localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
function render(el) {
  act(() => root.render(el));
}
function rerender(el) {
  act(() => root.unmount());
  root = createRoot(container);
  render(el);
}
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => [...container.querySelectorAll(sel)];
const click = (el) =>
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const bubble = () => $("#anything-llm-privacy-bubble");
const greeting = () => $("#anything-llm-greeting-bubble");
const warnings = () => console.warn.mock.calls.map((c) => String(c[0]));

// ---------------------------------------------------------------------------
describe("Vertrag 4 (D4): Blase wie die Begrüßung, Inhalt wie in 7.22.2 ohne KI-Punkt", () => {
  it("direkt unter der Begrüßungsblase in derselben Spalte, Optik wie die Begrüßung", async () => {
    const s = await load({}, ON);
    render(<ChatHistory settings={s} history={[]} />);
    const g = greeting();
    const p = bubble();
    expect(p).not.toBe(null);
    expect(g.contains(p)).toBe(false);
    expect(g.nextElementSibling).toBe(p);
    expect(g.parentElement.style.maxWidth).toBe("80%");
    for (const prop of [
      "boxSizing",
      "maxWidth",
      "backgroundColor",
      "color",
      "borderRadius",
      "boxShadow",
      "padding",
      "fontSize",
      "lineHeight",
      "overflowWrap",
    ])
      expect(p.style[prop], prop).toBe(g.style[prop]);
    expect(p.style.backgroundColor).toContain("--allmi-assistant-bg");
    expect(p.className).toBe(g.className);
    // Avatar steht neben der letzten Blase der Gruppe (wie 7.22.2)
    const row = g.parentElement.parentElement;
    expect(row.style.alignItems).toBe("flex-end");
    expect(row.querySelector("img").getAttribute("aria-hidden")).toBe("true");
    expect(row.querySelectorAll("img")).toHaveLength(1);
  });

  it.each([
    ["de", "Datenschutz", "Hinweis zur KI"],
    ["en", "Privacy", "About the AI"],
  ])(
    "%s: Standard-Überschrift fett, Standardpunkte, ohne KI-Punkt, ohne Link",
    async (language, title, aiTitle) => {
      const s = await load({ language }, ON);
      render(<ChatHistory settings={s} history={[]} />);
      const p = bubble();
      const strong = p.querySelector("strong");
      expect(strong.textContent).toBe(title);
      expect(strong.style.fontWeight).toBe("700");
      expect(p.firstElementChild).toBe(strong);
      expect([...p.querySelectorAll("li")].map((l) => l.textContent)).toEqual(
        PANEL_TEXTS[language].privacyPoints,
      );
      expect(p.textContent).not.toContain(aiTitle);
      expect(p.textContent).not.toContain(PANEL_TEXTS[language].privacyAiText);
      expect(p.querySelector("a")).toBe(null);
      expect(p.textContent).not.toMatch(/[–—]/);
    },
  );

  it("gespeicherte Überschrift und Text (Absätze und Punkte), leere Überschrift = Standard", async () => {
    const s = await load(
      {},
      {
        ...ON,
        privacyTitle: "Datenschutz bei uns",
        privacyText:
          "Wir nehmen Datenschutz ernst.\n• Server in Deutschland\n- Keine Weitergabe\nFragen? Schreiben Sie uns.",
      },
    );
    render(<ChatHistory settings={s} history={[]} />);
    const p = bubble();
    expect(p.querySelector("strong").textContent).toBe("Datenschutz bei uns");
    expect([...p.children].map((el) => el.tagName)).toEqual([
      "STRONG",
      "P",
      "UL",
      "P",
    ]);
    expect([...p.querySelectorAll("li")].map((l) => l.textContent)).toEqual([
      "Server in Deutschland",
      "Keine Weitergabe",
    ]);
    const empty = await load({}, { ...ON, privacyTitle: "   " });
    rerender(<ChatHistory settings={empty} history={[]} />);
    expect(bubble().querySelector("strong").textContent).toBe("Datenschutz");
    rerender(
      <ChatHistory settings={{ ...ON, privacyTitle: "" }} history={[]} />,
    );
    expect(bubble().querySelector("strong").textContent).toBe("Datenschutz");
  });

  it.each([
    ["de", "Datenschutzerklärung"],
    ["en", "Privacy statement"],
  ])(
    "%s: Link zur Datenschutzerklärung mit privacyUrl, neuer Tab, noopener noreferrer, eigene Zeile am Ende",
    async (language, text) => {
      for (const url of ["https://vhs.example/datenschutz", "/datenschutz"]) {
        const s = await load({ language }, { ...ON, privacyUrl: url });
        rerender(<ChatHistory settings={s} history={[]} />);
        const a = bubble().querySelector("a");
        expect(a.textContent).toBe(text);
        expect(a.getAttribute("href")).toBe(url);
        expect(a.getAttribute("target")).toBe("_blank");
        expect(a.getAttribute("rel")).toBe("noopener noreferrer");
        expect(bubble().lastElementChild).toBe(a);
        expect(a.style.textDecoration).toBe("underline");
      }
    },
  );

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "http://vhs.example/datenschutz",
    "//evil.example/datenschutz",
    "/\\evil.example",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "ftp://vhs.example/datenschutz",
  ])("NAK-3: privacyUrl %j wird nicht verlinkt", async (url) => {
    const s = await load({}, { ...ON, privacyUrl: url });
    render(<ChatHistory settings={s} history={[]} />);
    expect(bubble()).not.toBe(null);
    expect(bubble().querySelector("a")).toBe(null);
    // auch wenn der Wert ohne Prüfung in die Settings käme
    rerender(
      <ChatHistory settings={{ ...ON, privacyUrl: url }} history={[]} />,
    );
    expect(bubble().querySelector("a")).toBe(null);
  });

  it("NAK-1: HTML in Überschrift und Text erscheint als Text", async () => {
    const title = "<img src=x onerror=alert(1)>Titel";
    const text =
      '• <a href="javascript:alert(1)">klick</a>\n• <b>fett</b><script>alert(2)</script>';
    for (const settings of [
      await load({}, { ...ON, privacyTitle: title, privacyText: text }),
      { ...ON, privacyTitle: title, privacyText: text },
    ]) {
      rerender(<ChatHistory settings={settings} history={[]} />);
      const p = bubble();
      expect(p.querySelector("img, b, script, a")).toBe(null);
      expect(p.querySelector("strong").textContent).toBe(title);
      expect([...p.querySelectorAll("li")].map((l) => l.textContent)).toEqual([
        '<a href="javascript:alert(1)">klick</a>',
        "<b>fett</b><script>alert(2)</script>",
      ]);
    }
  });

  it("Startvorschläge folgen unter der Blase", async () => {
    const s = await load({}, { ...ON, defaultMessages: MSGS });
    render(<ChatHistory settings={s} history={[]} />);
    const pills = $("#anything-llm-suggestion-pills");
    expect(pills).not.toBe(null);
    expect(
      bubble().compareDocumentPosition(pills) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(bubble().contains(pills)).toBe(false);
  });

  it("im Verlauf: nach der ersten Frage und nach dem Laden bleibt die Blase mit der Begrüßung oben, ohne Vorschläge", async () => {
    const s = await load(
      {},
      { ...ON, defaultMessages: MSGS, privacyUrl: "/datenschutz" },
    );
    const settings = { ...s, enableStt: false };
    render(
      <ChatContainer
        sessionId="s-1"
        conversationId="c-1"
        knownHistory={[]}
        settings={settings}
      />,
    );
    expect($("#anything-llm-suggestion-pills")).not.toBe(null);
    act(() => sendSuggestion("Gibt es Yoga?"));
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect($("#anything-llm-suggestion-pills")).toBe(null);
    const list = () => $("#chat-history").firstElementChild;
    let first = list().firstElementChild;
    expect(first.id).toBe("anything-llm-panel-welcome");
    expect(first.hasAttribute("data-persistent")).toBe(true);
    expect(first.querySelector("#anything-llm-privacy-bubble a")).not.toBe(
      null,
    );
    expect($$("#anything-llm-privacy-bubble")).toHaveLength(1);
    expect(first.nextElementSibling.textContent).toContain("Gibt es Yoga?");
    // geladener Verlauf: genau einmal an erster Stelle, kein Chat-Eintrag
    chatService.streamChat.mockClear();
    rerender(
      <ChatContainer
        sessionId="s-1"
        conversationId="c-1"
        knownHistory={HISTORY}
        settings={settings}
      />,
    );
    first = list().firstElementChild;
    expect(first.id).toBe("anything-llm-panel-welcome");
    expect(first.querySelector("#anything-llm-greeting-bubble")).not.toBe(null);
    expect(first.querySelector("#anything-llm-privacy-bubble")).not.toBe(null);
    expect($$("#anything-llm-privacy-bubble")).toHaveLength(1);
    expect(list().children).toHaveLength(3);
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("Vertrag 5 (D1): Link „Datenschutz“ in der Fußzeile bleibt, Fenster unverändert", () => {
  it.each(["de", "en"])(
    "%s: Blase und Link, der Link öffnet das Fenster mit KI-Punkt",
    async (language) => {
      const s = await load(
        { language },
        { ...ON, privacyUrl: "https://vhs.example/datenschutz" },
      );
      render(
        <ChatWindow
          closeChat={() => {}}
          settings={{ ...s, enableStt: false }}
          sessionId="s-1"
          conversationId="c-1"
        />,
      );
      const texts = PANEL_TEXTS[language];
      expect(bubble()).not.toBe(null);
      const link = $("#anything-llm-privacy-link");
      expect(link).not.toBe(null);
      expect(link.textContent).toBe(texts.privacyLinkText);
      expect($("#anything-llm-ai-disclaimer-text").textContent).toBe(
        texts.aiDisclaimer,
      );
      click(link);
      const d = $("[role=dialog]");
      expect(d).not.toBe(null);
      expect(d.getAttribute("aria-modal")).toBe("true");
      expect(d.textContent).toContain(texts.privacyAiTitle);
      expect(d.textContent).toContain(texts.privacyAiText);
      expect(d.querySelector("a").getAttribute("href")).toBe(
        "https://vhs.example/datenschutz",
      );
      // die Blase bleibt unter dem Fenster bestehen
      expect(bubble()).not.toBe(null);
    },
  );

  it("mit und ohne Blase genau ein Link in der Fußzeile (AK-1)", async () => {
    for (const [server, withBubble] of [
      [ON, true],
      [{}, false],
    ]) {
      const s = await load({}, server);
      rerender(
        <ChatContainer
          sessionId="s-1"
          knownHistory={[]}
          settings={{ ...s, enableStt: false }}
        />,
      );
      expect(bubble() !== null, JSON.stringify(server)).toBe(withBubble);
      expect($$("#anything-llm-privacy-link")).toHaveLength(1);
    }
  });
});
