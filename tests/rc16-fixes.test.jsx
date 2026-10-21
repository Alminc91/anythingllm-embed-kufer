import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import tailwindConfig from "../tailwind.config.js";

// Korrekturrunde 7.22-rc16, Teil Widget (issues/rollout-721/
// fixliste-7.22-rc16.md, Details review-7.22-nachreview-rc15.md):
// W40 Kopfhöhe: Mindesthöhe schließt den Innenabstand ein (allm-box-border),
//   mit kurzem Namen 76 px (kompakt 56 px) plus 1 px Unterlinie. Maße im
//   Browser: tests/visual/n3_header.py (Fälle „kurz“ und „kompakt“).
// W42 Fokus zurück auf ⋮ auch dann, wenn der Kopf nach dem Laden des
//   Verlaufs neu eingehängt wurde.
// W44 Rückfall wordBreak "break-word" für Safari vor 15.4.
// E21 Kompakter Kopf (mobil bei offener Tastatur): nur der Name.
// Der Fall Inline-Box (W43) steht in rc16-inline-escape.test.jsx, W45 in
// embed-config-contract.test.js.

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
  embedSessionHistory: vi.fn(async () => []),
  listConversations: vi.fn(async () => []),
  resetEmbedChatSession: vi.fn(async () => true),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
  I18nextProvider: ({ children }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

import { embedderSettings } from "../src/main.jsx";
import App from "../src/App.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import * as headerModule from "../src/components/ChatWindow/Header/index.jsx";
import * as openButtonModule from "../src/components/OpenButton/index.jsx";
import * as dismissal from "../src/hooks/useBubbleDismissal.js";

const ChatWindowHeader = headerModule.default;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server = {}) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
if (!Element.prototype.scrollIntoView)
  Element.prototype.scrollIntoView = () => {};
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
  embedderSettings.shadowRoot = null;
  embedderSettings.hostElement = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  openButtonModule.resetPhoneAtLoad?.();
  dismissal.resetShownOnThisPage?.();
  chatService.embedSessionHistory.mockImplementation(async () => []);
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render(el) {
  act(() => root.render(el));
}
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => [...container.querySelectorAll(sel)];
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await act(async () => {});
};
const escapeAt = (target) => {
  const e = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  act(() => target.dispatchEvent(e));
  return e;
};

// ---------------------------------------------------------------------------
// W40: Höhe des Titelblocks aus seinen Klassen, wie der Browser sie rechnet.
// Im Shadow Root gilt kein globales box-sizing (preflight aus): ohne
// allm-box-border kommt der senkrechte Innenabstand auf die Mindesthöhe drauf.
// Abstände aus tailwind.config.js (feste px-Werte).
const SPACING = tailwindConfig.theme.spacing;
function px(value) {
  const n = Number.parseFloat(value);
  expect(Number.isFinite(n), `kein px-Wert: ${value}`).toBe(true);
  return n;
}
function blockHeight(className, contentPx) {
  const classes = className.split(/\s+/);
  const minH = classes
    .map((c) => /^allm-min-h-\[(\d+(?:\.\d+)?)px\]$/.exec(c)?.[1])
    .find(Boolean);
  expect(minH, `Mindesthöhe in „${className}“`).toBeTruthy();
  const pad = (side) => {
    const py = classes.map((c) => /^allm-py-(.+)$/.exec(c)?.[1]).find(Boolean);
    const one = classes
      .map((c) => new RegExp(`^allm-p${side}-(.+)$`).exec(c)?.[1])
      .find(Boolean);
    const key = one ?? py;
    return key === undefined ? 0 : px(SPACING[key]);
  };
  const vertical = pad("t") + pad("b");
  const borderBox = classes.includes("allm-box-border");
  return borderBox
    ? Math.max(Number(minH), contentPx + vertical)
    : Math.max(Number(minH), contentPx) + vertical;
}
// Inhalt mit kurzem Namen: der Logo-Rahmen (44 px bzw. 40 px) ist höher als
// Name (20 px) und Untertitel (11,5 px × 1,35) zusammen
function logoFrameHeight(header) {
  const frame = header.firstElementChild.firstElementChild;
  return px(frame.style.height);
}
// Unterlinie des Kopfs (HEADER_STYLE: 1 px, mit Header-Farbe keine)
const HEADER_LINE = 1;

describe("W40: Kopfhöhe mit kurzem Namen wie vor rc13 (Innenabstand eingeschlossen)", () => {
  for (const [name, server] of [
    ["mit Standard-Untertitel", {}],
    ["ohne Untertitel", { assistantSubtitle: "" }],
    ["Logo als Pille (40 px)", { iconStyle: "pill", headerBgColor: "#0b5f8a" }],
  ]) {
    it(`${name}: 76 px, kompakt 56 px (mit Unterlinie 77 bzw. 57 px), Titelblock mit allm-box-border`, async () => {
      const settings = await load({ brandText: "KI-Berater" }, server);
      for (const [compact, soll] of [
        [false, 76],
        [true, 56],
      ]) {
        render(
          <ChatWindowHeader
            settings={{ ...settings, loaded: true }}
            compact={compact}
          />,
        );
        const header = $("#anything-llm-header");
        const title = header.firstElementChild;
        expect(title.className.split(/\s+/)).toContain("allm-box-border");
        const h = blockHeight(title.className, logoFrameHeight(header));
        expect(h, `compact=${compact}`).toBe(soll);
        // Unterlinie wie bisher: 77 bzw. 57 px ohne Header-Farbe
        if (!server.headerBgColor)
          expect(h + HEADER_LINE, `compact=${compact}`).toBe(soll + 1);
        act(() => root.unmount());
        root = createRoot(container);
      }
    });
  }

  it("Klassen des Titelblocks kommen aus headerTitleClass (eine Quelle für Kopf und Tests)", () => {
    expect(typeof headerModule.headerTitleClass).toBe("function");
    for (const compact of [false, true]) {
      const cls = headerModule.headerTitleClass(compact);
      expect(cls).toMatch(/(^|\s)allm-box-border(\s|$)/);
      // beim Umbruch weiter mindestens 6 px Luft oben und unten
      const content = 200; // vier Zeilen Name und zwei Zeilen Untertitel
      expect(blockHeight(cls, content)).toBeGreaterThanOrEqual(content + 12);
    }
  });
});

// ---------------------------------------------------------------------------
describe("W44: Rückfall für Safari vor 15.4 (overflow-wrap: anywhere fehlt)", () => {
  it("HEADER_WRAP und Name/Untertitel tragen zusätzlich word-break: break-word", async () => {
    expect(headerModule.HEADER_WRAP).toMatchObject({
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
    });
    const LONG = "Volkshochschulzweckverbandsgeschäftsstelle";
    for (const server of [
      { assistantSubtitle: "vhs-musterstadtlandkreis-volkshochschule.de" },
      { assistantSubtitle: "" },
    ]) {
      const settings = await load({ brandText: LONG }, server);
      render(<ChatWindowHeader settings={{ ...settings, loaded: true }} />);
      const spans = $$("#anything-llm-header span");
      const nameEl = spans.find((el) => el.textContent === LONG);
      expect(nameEl).toBeTruthy();
      const texts = [nameEl, $("#anything-llm-header-subtitle")].filter(
        Boolean,
      );
      expect(texts.length).toBe(server.assistantSubtitle ? 2 : 1);
      for (const el of texts) {
        expect(el.style.wordBreak).toBe("break-word");
        expect(el.style.overflowWrap).toBe("anywhere");
      }
      act(() => root.unmount());
      root = createRoot(container);
    }
  });
});

// ---------------------------------------------------------------------------
describe("E21: kompakter Kopf (mobil bei offener Tastatur) zeigt nur den Namen", () => {
  it("mit Untertitel: kompakt nur der Name (umbrechend), sonst Name und Untertitel", async () => {
    const LONG_NAME =
      "KI-Berater der Volkshochschule Rhein-Sieg-Kreis und Umgebung";
    const settings = await load(
      { brandText: LONG_NAME },
      { assistantSubtitle: "durchsucht 1.243 Kurse" },
    );
    render(<ChatWindowHeader settings={{ ...settings, loaded: true }} />);
    expect($("#anything-llm-header-subtitle")?.textContent).toBe(
      "durchsucht 1.243 Kurse",
    );
    act(() => root.unmount());
    root = createRoot(container);
    render(
      <ChatWindowHeader settings={{ ...settings, loaded: true }} compact />,
    );
    const header = $("#anything-llm-header");
    expect($("#anything-llm-header-subtitle")).toBeNull();
    const nameEl = [...header.querySelectorAll("span")].find(
      (el) => el.textContent === LONG_NAME,
    );
    expect(nameEl).toBeTruthy();
    expect(nameEl.style.whiteSpace).toBe("normal");
    expect(nameEl.style.wordBreak).toBe("break-word");
    // kompakt mit kurzem Namen 56 px plus Unterlinie (W40)
    expect(
      blockHeight(header.firstElementChild.className, logoFrameHeight(header)),
    ).toBe(56);
  });
});

// ---------------------------------------------------------------------------
// W42: App mit echtem Chatfenster; Verlauf lädt noch, während „Frühere Chats“
// geöffnet wird. Endet das Laden, hängt React den Kopf neu ein.
async function mountApp(script = {}, config = {}) {
  embedderSettings.settings = { ...BASE, openOnLoad: "on", ...script };
  embedderSettings.shadowRoot = document;
  embedderSettings.hostElement = container;
  vi.stubGlobal("fetch", fetchConfig(config));
  await act(async () => root.render(<App />));
  await flush(10);
}
const optionsButton = () => $('button[aria-label="Optionen"]');
const historyItem = () =>
  $$("button").find((b) => b.textContent.includes("Frühere Chats"));
const historyOpen = () => !!container.querySelector(".allm-z-\\[60\\]");

describe("W42: Fokus nach Escape in „Frühere Chats“ auf dem aktuellen ⋮", () => {
  it("Ansicht während des Ladens geöffnet, Laden endet (Kopf neu eingehängt): Escape setzt den Fokus auf den neuen ⋮", async () => {
    let finish;
    chatService.embedSessionHistory.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve([]);
        }),
    );
    await mountApp();
    // Lade-Zweig: ⋮ ist schon da, „Frühere Chats“ öffnet die Ansicht
    expect(typeof finish).toBe("function");
    const loadingOptions = optionsButton();
    expect(loadingOptions).not.toBeNull();
    act(() => loadingOptions.click());
    const item = historyItem();
    expect(item).toBeTruthy();
    await act(async () => item.click());
    await flush();
    expect(historyOpen()).toBe(true);

    // Laden endet: anderer Wurzelknoten im ChatWindow, Kopf neu eingehängt
    await act(async () => finish());
    await flush();
    expect(historyOpen()).toBe(true);
    expect(loadingOptions.isConnected).toBe(false);
    const current = optionsButton();
    expect(current).not.toBeNull();
    expect(current).not.toBe(loadingOptions);

    // Escape ohne Fokus: Ansicht zu, Fokus auf dem aktuellen ⋮
    document.activeElement?.blur?.();
    escapeAt(document.body);
    await flush(2);
    expect(historyOpen()).toBe(false);
    expect(document.activeElement).toBe(optionsButton());
  });

  it("ohne Neueinhängen wie bisher: Fokus auf ⋮", async () => {
    await mountApp();
    act(() => optionsButton().click());
    await act(async () => historyItem().click());
    await flush();
    expect(historyOpen()).toBe(true);
    escapeAt(document.body);
    await flush(2);
    expect(historyOpen()).toBe(false);
    expect(document.activeElement).toBe(optionsButton());
  });
});
