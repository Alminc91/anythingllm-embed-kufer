import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// E42 (Nutzerentscheidung 22.10.2026, Rollout 7.22, 7.22-rc23): Standard
// der Startvorschläge leer. Kunden ohne gespeicherte Startvorschläge bekommen
// keine Standard-Startvorschläge mehr („Ich suche einen Deutschkurs.“, „Gibt
// es Excel-Kurse am Abend?“ bzw. englisch bis 7.22-rc22), in allen Sprachen.
// Der Fork liefert ohne gespeicherte Liste [] mit defaultMessagesStandard:
// true (Vertrag unverändert, tests/fixtures/embedConfigContract.json);
// gespeicherte Listen gelten unverändert, ein gespeichertes [] bleibt
// „keine“. Das Widget hat keine eigene Standardliste (DEFAULT_SETTINGS
// defaultMessages: []), ein data-default-messages am Skript wirkt nicht
// (E23). Mit KUFER_FORK_DIR zusätzlich die Gegenprobe gegen den Fork.

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
import {
  DEFAULT_SETTINGS,
  loadEmbedSettings,
} from "../src/hooks/useScriptAttributes.js";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import InlineChat from "../src/components/InlineChat/index.jsx";

const contract = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "embedConfigContract.json"), "utf8"),
);
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// frühere Standard-Startvorschläge (bis 7.22-rc22)
const OLD = /Deutschkurs|Excel-Kurse|German course|Excel courses/;
// Antwort des Forks seit E42 ohne gespeicherte Liste
const FORK_STANDARD = { defaultMessages: [], defaultMessagesStandard: true };
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server) =>
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
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.querySelectorAll("[data-e42-page]").forEach((el) => el.remove());
  vi.restoreAllMocks();
});
const render = (el) => act(() => root.render(el));
const pills = () =>
  [...container.querySelectorAll("#anything-llm-suggestion-pills button")].map(
    (b) => b.textContent,
  );
const chips = () =>
  [...container.querySelectorAll("#anything-llm-inline-chips button")].map(
    (b) => b.textContent,
  );

// Leerer Chat im Chatfenster und eingeklappte Inline-Leiste mit den
// aufgelösten Settings
function renderBoth(settings) {
  embedderSettings.settings = settings;
  render(<ChatHistory settings={settings} history={[]} />);
  const panel = pills();
  const panelHtml = container.innerHTML;
  act(() => root.unmount());
  root = createRoot(container);
  const mountTarget = document.createElement("div");
  mountTarget.setAttribute("data-e42-page", "");
  document.body.appendChild(mountTarget);
  const host = document.createElement("div");
  mountTarget.appendChild(host);
  embedderSettings.hostElement = host;
  render(
    <InlineChat
      settings={{ ...settings, displayMode: "inline", inlineInput: true }}
      mountTarget={mountTarget}
      sessionId="s-e42"
      conversationId="c-e42"
    />,
  );
  return { panel, panelHtml, inline: chips(), inlineHtml: container.innerHTML };
}

describe("E42: Standard der Startvorschläge leer", () => {
  it("Vertrag: Standard je Sprache leer, jeder Standard-Fall liefert und zeigt []", () => {
    expect(contract.standardSuggestions).toEqual({ de: [], en: [] });
    const standardCases = contract.cases.filter(
      (c) => c.config?.defaultMessagesStandard === true,
    );
    expect(standardCases.length).toBeGreaterThanOrEqual(4);
    for (const c of standardCases) {
      expect([c.name, c.config.defaultMessages]).toEqual([c.name, []]);
      expect([c.name, c.widget.defaultMessages]).toEqual([c.name, []]);
    }
    expect(JSON.stringify(contract)).not.toMatch(OLD);
  });

  it("Widget ohne eigene Standardliste", () => {
    expect(DEFAULT_SETTINGS.defaultMessages).toEqual([]);
  });

  it.each([
    ["de", {}],
    ["en", { language: "en" }],
    ["fr", { language: "fr" }],
    ["de mit data-default-messages", { defaultMessages: "Spanisch A1,Yoga" }],
  ])(
    "nichts gespeichert (%s): keine Pillen im leeren Chat, keine Chips unter der Leiste",
    async (_name, script) => {
      const s = await load(script, FORK_STANDARD);
      expect(s.defaultMessages).toEqual([]);
      expect(s).not.toHaveProperty("defaultMessagesStandard");
      const { panel, panelHtml, inline, inlineHtml } = renderBoth(s);
      expect(panel).toEqual([]);
      expect(panelHtml).not.toContain("anything-llm-suggestion-pills");
      expect(inline).toEqual([]);
      expect(inlineHtml).not.toContain("anything-llm-inline-chips");
      expect(panelHtml + inlineHtml).not.toMatch(OLD);
    },
  );

  it("gespeicherte Liste gilt unverändert, gespeichertes [] bleibt „keine“", async () => {
    const own = await load(
      { defaultMessages: "Yoga" },
      { defaultMessages: ["Wie melde ich mich an?", "Gibt es Kurse, abends?"] },
    );
    expect(renderBoth(own).panel).toEqual([
      "Wie melde ich mich an?",
      "Gibt es Kurse, abends?",
    ]);
    act(() => root.unmount());
    root = createRoot(container);
    const none = await load(
      { defaultMessages: "Yoga" },
      { defaultMessages: [], defaultMessagesSaved: true },
    );
    const shown = renderBoth(none);
    expect(shown.panel).toEqual([]);
    expect(shown.inline).toEqual([]);
  });
});

// Gegenprobe gegen den Fork (KUFER_FORK_DIR), wie embed-config-contract
const forkDir = process.env.KUFER_FORK_DIR;
const describeFork = forkDir ? describe : describe.skip;
describeFork(
  forkDir
    ? "E42: Gegenprobe gegen den Fork (KUFER_FORK_DIR)"
    : "E42: Gegenprobe gegen den Fork (übersprungen: KUFER_FORK_DIR nicht gesetzt)",
  () => {
    it("Fork: Standard-Startvorschläge in jeder Sprache leer, auch in den Standardtexten des Design Centers", () => {
      const require = createRequire(import.meta.url);
      const { defaultSuggestions, embedDefaultTexts } = require(
        join(forkDir, "server/utils/chats/embedDefaults.js"),
      );
      for (const lang of [
        "de",
        "en",
        "en-GB",
        "fr",
        "tr",
        "uk",
        "",
        undefined,
      ]) {
        expect([lang, defaultSuggestions(lang)]).toEqual([lang, []]);
        expect([lang, embedDefaultTexts(lang).defaultMessages]).toEqual([
          lang,
          [],
        ]);
      }
    });
  },
);
