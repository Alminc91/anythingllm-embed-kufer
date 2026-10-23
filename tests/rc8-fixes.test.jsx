import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Korrekturrunde Design Center 2.0, Fixliste 7.22-rc8, Teil Widget
// (issues/rollout-721/fixliste-7.22-rc8.md): R1 KI-Hinweis, R4 Standard
// von „Antworten mit Kursen“ nach der tatsächlichen Darstellung (und die
// Darstellung im Body von stream-chat), R5 Untertitel-Standard der Sprache,
// Restpunkt rc7 Nr. 3 (Hover des Absende-Buttons nur mit Zeiger).
// Restpunkt Nr. 4 (Akzentfarbe nur am Platzhalter):
// tests/rc8-inline-accent.test.jsx.

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
  embedSessionHistory: vi.fn(async () => []),
  listConversations: vi.fn(async () => []),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
// Chat-Anfragen des ECHTEN ChatService (vi.importActual) landen hier
const sse = vi.hoisted(() => ({ calls: [] }));
vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: vi.fn(async (url, options) => {
    sse.calls.push({ url, options });
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
  I18nextProvider: ({ children }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
// Chatfenster und Darstellung in der Seite als Stubs, die zeigen, welche
// Settings App.jsx ihnen gibt (tatsächliche Darstellung, Antworten mit Kursen)
vi.mock("@/components/ChatWindow", () => ({
  SEND_TEXT_EVENT: "send-text",
  default: ({ settings }) => (
    <div
      id="chat-window-stub"
      data-display={settings.displayMode}
      data-course-cards={String(settings.courseCards)}
    />
  ),
}));
vi.mock("@/components/InlineChat", () => ({
  default: ({ settings }) => (
    <div
      id="inline-stub"
      data-display={settings.displayMode}
      data-course-cards={String(settings.courseCards)}
    />
  ),
}));

import { embedderSettings } from "../src/main.jsx";
import App from "../src/App.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import * as layout from "../src/utils/layout.js";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => config }));
const load = (script, server = {}) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));
const DE_SUBTITLE = "Online-Berater mit künstlicher Intelligenz";
const EN_SUBTITLE = "Online advisor powered by artificial intelligence";
// Bewusste Änderung (Datenschutz in der Fußzeile, Nutzerentscheidung
// 23.10.2026): Kurzfassung ohne Bitte um Prüfung, daneben der Link
// „Datenschutz“ (tests/datenschutz-fusszeile.test.jsx); vorher „Unsere KI
// kann Fehler machen. Bitte prüfen Sie die Antworten.“ bzw. „Our AI can make
// mistakes. Please double-check the answers.“
const DE_DISCLAIMER = "Unsere KI kann Fehler machen";
const EN_DISCLAIMER = "Our AI can make mistakes";

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
  embedderSettings.hostElement = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  sse.calls.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.querySelector("#kufer-assistent")?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = (el) => act(() => root.render(el));
const $ = (sel) => container.querySelector(sel);
const flush = async () => {
  for (let i = 0; i < 4; i++) await act(async () => {});
};

// App mit gemocktem /config; placeholder = Platzhalter <div id="kufer-
// assistent"> in der Seite. Liefert den Stub der gezeigten Darstellung.
async function renderApp(script, server, { placeholder = false } = {}) {
  embedderSettings.settings = { ...BASE, openOnLoad: "on", ...script };
  embedderSettings.hostElement = container;
  if (placeholder) {
    const ph = document.createElement("div");
    ph.id = "kufer-assistent";
    document.body.appendChild(ph);
  }
  vi.stubGlobal("fetch", fetchConfig(server));
  await act(async () => root.render(<App />));
  await flush();
  return $("#inline-stub") || $("#chat-window-stub");
}

// ---------------------------------------------------------------------------
describe("R4: Antworten mit Kursen ohne gespeicherte Wahl folgt der tatsächlichen Darstellung", () => {
  it("Einstellungen: nur der Server-Wert zählt; ohne ihn null (Standard nach Darstellung)", async () => {
    expect((await load({})).courseCards).toBe(null);
    // data-course-cards am Skript wirkt nicht (der Server kennt es nicht)
    expect((await load({ courseCards: "off" })).courseCards).toBe(null);
    expect((await load({ courseCards: "auto" })).courseCards).toBe(null);
    expect((await load({}, { courseCards: "off" })).courseCards).toBe("off");
    expect(
      (await load({ courseCards: "off" }, { courseCards: "auto" })).courseCards,
    ).toBe("auto");
    // ungültig = nicht gespeichert
    expect((await load({}, { courseCards: "karten" })).courseCards).toBe(null);
    // Reihenfolge-Standard bleibt „Karten zuerst“
    expect((await load({})).courseCardsPosition).toBe("above");
  });

  it("applyDisplayed: In der Seite Kurskarten, Chatfenster Nur Text, gespeicherter Wert gewinnt", () => {
    expect(layout.courseCardsDefault("inline")).toBe("auto");
    expect(layout.courseCardsDefault("bubble")).toBe("off");
    expect(layout.displayedCourseCards({ courseCards: null }, "inline")).toBe(
      "auto",
    );
    expect(layout.displayedCourseCards({}, "bubble")).toBe("off");
    expect(layout.displayedCourseCards({ courseCards: "off" }, "inline")).toBe(
      "off",
    );
    expect(layout.displayedCourseCards({ courseCards: "auto" }, "bubble")).toBe(
      "auto",
    );
    expect(layout.displayedCourseCards({ courseCards: "x" }, "inline")).toBe(
      "auto",
    );
    expect(
      layout.applyDisplayed(
        { displayMode: "inline", courseCards: null },
        false,
      ),
    ).toMatchObject({ displayMode: "bubble", courseCards: "off" });
    expect(
      layout.applyDisplayed({ displayMode: "bubble" }, true),
    ).toMatchObject({ displayMode: "inline", courseCards: "auto" });
    expect(layout.DISPLAYED_VALUES).toEqual(["bubble", "inline"]);
  });

  it("In der Seite mit Platzhalter (Server displayMode inline): Kurskarten", async () => {
    const el = await renderApp(
      {},
      { displayMode: "inline" },
      { placeholder: true },
    );
    expect(el?.id).toBe("inline-stub");
    expect(el.dataset.display).toBe("inline");
    expect(el.dataset.courseCards).toBe("auto");
    // Komponenten, die embedderSettings.settings direkt lesen, sehen dasselbe
    expect(embedderSettings.settings.displayMode).toBe("inline");
    expect(embedderSettings.settings.courseCards).toBe("auto");
  });

  it("Rückfall auf das Chatfenster ohne Platzhalter: Nur Text mit Links", async () => {
    const el = await renderApp({}, { displayMode: "inline" });
    expect(el?.id).toBe("chat-window-stub");
    expect(el.dataset.display).toBe("bubble");
    expect(el.dataset.courseCards).toBe("off");
    expect(embedderSettings.settings.displayMode).toBe("bubble");
    expect(embedderSettings.settings.courseCards).toBe("off");
  });

  // Bewusste Änderung (Fixliste 7.22-rc17 E23): die Darstellung stellt nur
  // das Design Center ein; data-display-mode am Skript wirkt nicht
  it("In der Seite aus dem Design Center: Kurskarten; data-display-mode am Skript wirkt nicht", async () => {
    const el = await renderApp(
      {},
      { displayMode: "inline" },
      { placeholder: true },
    );
    expect(el?.id).toBe("inline-stub");
    expect(el.dataset.display).toBe("inline");
    expect(el.dataset.courseCards).toBe("auto");
    act(() => root.unmount());
    root = createRoot(container);
    const bubble = await renderApp(
      { displayMode: "inline" },
      {},
      { placeholder: true },
    );
    expect(bubble?.id).toBe("chat-window-stub");
    expect(bubble.dataset.courseCards).toBe("off");
  });

  it("Chatfenster (Standard): Nur Text mit Links", async () => {
    const el = await renderApp({}, {});
    expect(el?.id).toBe("chat-window-stub");
    expect(el.dataset.display).toBe("bubble");
    expect(el.dataset.courseCards).toBe("off");
  });

  it("Server-Wert gewinnt: Nur Text in der Seite", async () => {
    const el = await renderApp(
      {},
      { displayMode: "inline", courseCards: "off" },
      { placeholder: true },
    );
    expect(el?.id).toBe("inline-stub");
    expect(el.dataset.courseCards).toBe("off");
  });

  it("Server-Wert gewinnt: Kurskarten im Chatfenster", async () => {
    const el = await renderApp({}, { courseCards: "auto" });
    expect(el?.id).toBe("chat-window-stub");
    expect(el.dataset.courseCards).toBe("auto");
  });

  it("stream-chat: tatsächliche Darstellung als displayMode im JSON-Body, sonst kein Feld", async () => {
    const real = (await vi.importActual("../src/models/chatService.js"))
      .default;
    const send = async (settings) => {
      sse.calls.length = 0;
      await real.streamChat(
        "s-1",
        { ...BASE, ...settings },
        "Gibt es Yogakurse?",
        () => {},
        "c-1",
        null,
      );
      expect(sse.calls).toHaveLength(1);
      expect(sse.calls[0].url).toBe(
        `${BASE.baseApiUrl}/${BASE.embedId}/stream-chat`,
      );
      return JSON.parse(sse.calls[0].options.body);
    };
    const inline = await send({ displayMode: "inline" });
    expect(inline).toMatchObject({
      message: "Gibt es Yogakurse?",
      sessionId: "s-1",
      conversationId: "c-1",
      displayMode: "inline",
    });
    expect((await send({ displayMode: "bubble" })).displayMode).toBe("bubble");
    // ohne bzw. mit ungültigem Wert kein Feld (der Server nimmt dann bubble)
    expect(await send({})).not.toHaveProperty("displayMode");
    expect(await send({ displayMode: "Inline" })).not.toHaveProperty(
      "displayMode",
    );
  });
});

// ---------------------------------------------------------------------------
describe("R5: Untertitel unter dem Namen", () => {
  it('ohne Server-Wert der Standard der Sprache, "" = keiner, eigener Text gewinnt', async () => {
    expect((await load({})).assistantSubtitle).toBe(DE_SUBTITLE);
    expect((await load({ language: "en" })).assistantSubtitle).toBe(
      EN_SUBTITLE,
    );
    expect((await load({ language: "fr" })).assistantSubtitle).toBe(
      DE_SUBTITLE,
    );
    expect((await load({}, { assistantSubtitle: "" })).assistantSubtitle).toBe(
      "",
    );
    expect(
      (await load({}, { assistantSubtitle: "   " })).assistantSubtitle,
    ).toBe("");
    expect(
      (await load({}, { assistantSubtitle: "durchsucht 1.243 Kurse" }))
        .assistantSubtitle,
    ).toBe("durchsucht 1.243 Kurse");
    // zu lang (über 60 Zeichen): verworfen, es gilt der Standard
    expect(
      (await load({}, { assistantSubtitle: "x".repeat(61) })).assistantSubtitle,
    ).toBe(DE_SUBTITLE);
    expect(layout.layoutValidations.assistantSubtitle("")).toBe("");
  });

  // Bewusste Änderung (Fixliste 7.22-rc17 E23): der Untertitel kommt nur
  // aus dem Design Center, auch ohne Server-Wert wirkt das Skript nicht
  it("data-assistant-subtitle am Skript wirkt nicht (auch ohne Server-Wert)", async () => {
    expect(
      (await load({ assistantSubtitle: "Vom Skript" }, {})).assistantSubtitle,
    ).toBe(DE_SUBTITLE);
    expect(
      (
        await load(
          { assistantSubtitle: "Vom Skript" },
          { assistantSubtitle: "" },
        )
      ).assistantSubtitle,
    ).toBe("");
    expect(
      (
        await load(
          { assistantSubtitle: "Vom Skript" },
          { assistantSubtitle: "Vom Server" },
        )
      ).assistantSubtitle,
    ).toBe("Vom Server");
  });

  it("assistantSubtitleText: Standard, leer, eigener Text getrimmt", () => {
    expect(layout.assistantSubtitleText({})).toBe(DE_SUBTITLE);
    expect(layout.assistantSubtitleText({ language: "en" })).toBe(EN_SUBTITLE);
    expect(layout.assistantSubtitleText({ assistantSubtitle: "" })).toBe("");
    expect(layout.assistantSubtitleText({ assistantSubtitle: " Eigen " })).toBe(
      "Eigen",
    );
    expect(layout.PANEL_TEXTS.de.assistantSubtitle).toBe(DE_SUBTITLE);
    expect(layout.PANEL_TEXTS.en.assistantSubtitle).toBe(EN_SUBTITLE);
  });

  it('Titelleiste zeigt den Standard live; "" vom Server = kein Untertitel', async () => {
    render(<ChatWindowHeader settings={await load({})} />);
    expect($("#anything-llm-header-subtitle")?.textContent).toBe(DE_SUBTITLE);
    render(<ChatWindowHeader settings={await load({ language: "en" })} />);
    expect($("#anything-llm-header-subtitle")?.textContent).toBe(EN_SUBTITLE);
    render(
      <ChatWindowHeader settings={await load({}, { assistantSubtitle: "" })} />,
    );
    expect($("#anything-llm-header-subtitle")).toBe(null);
  });
});

// ---------------------------------------------------------------------------
describe("R1: KI-Hinweis unter der Eingabe", () => {
  it("Wortlaut deutsch (Kurzfassung nach Messung) und englisch, keine Gedankenstriche", () => {
    expect(layout.PANEL_TEXTS.de.aiDisclaimer).toBe(DE_DISCLAIMER);
    expect(layout.PANEL_TEXTS.en.aiDisclaimer).toBe(EN_DISCLAIMER);
    for (const t of [DE_DISCLAIMER, EN_DISCLAIMER])
      expect(t).not.toMatch(/[–—]/);
    expect(layout.panelTexts({ language: "en" }).aiDisclaimer).toBe(
      EN_DISCLAIMER,
    );
  });

  it("gerenderte Zeile: neuer Text, eine Zeile, 2 px Seitenrand, Schrift 11 px bis 10 px (Teiler 34)", async () => {
    render(<ChatContainer sessionId="s-1" settings={{ ...BASE }} />);
    const note = $("#anything-llm-ai-disclaimer");
    expect(note).not.toBeNull();
    expect(note.textContent).toBe(DE_DISCLAIMER);
    expect(note.getAttribute("title")).toBe(DE_DISCLAIMER);
    expect(note.style.whiteSpace).toBe("nowrap");
    expect(note.style.textOverflow).toBe("ellipsis");
    expect(note.style.marginLeft).toBe("2px");
    expect(note.style.marginRight).toBe("2px");
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/src/main.jsx`, "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(css).toContain(
      ".allm-ai-disclaimer { font-size: 11px; font-size: clamp(10px, calc((100cqi - 4px) / 34), 11px); }",
    );
  });
});

// ---------------------------------------------------------------------------
describe("Restpunkt rc7 Nr. 3: Hover des Absende-Buttons der Leiste nur mit Zeiger", () => {
  it("#anything-llm-inline-send:hover steht nur in @media (hover: hover)", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/src/main.jsx`, "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(css).toMatch(
      /@media \(hover: hover\) \{ #anything-llm-inline-send:hover \{ opacity: 0\.9; \} \}/,
    );
    expect(css.split("#anything-llm-inline-send:hover")).toHaveLength(2);
  });
});
