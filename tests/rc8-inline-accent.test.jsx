import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Restpunkt rc7 Nr. 4 (W01-Rest, issues/rollout-721/restpunkte-7.22-rc7.md):
// Setzte die Seite --allm-accent nur am Platzhalter #kufer-assistent, las
// InlineChat die Farben der Seite nach jedem Umhängen neu (refreshTheme).
// Bewusste Änderung (Fixliste 7.22-rc17 E23): Akzentfarbe und Schrift auf
// der Akzentfarbe kommen nur aus dem Design Center (Gruppe A); eine Farbe
// der Seite zählt nicht, weder vor noch nach dem Umhängen. jsdom vererbt
// eigene Eigenschaften nicht: die Farbe steht hier direkt am Host.

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
const chatService = vi.hoisted(() => ({
  streamChat: vi.fn(() => new Promise(() => {})),
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
  embedSessionHistory: vi.fn(async () => []),
  listConversations: vi.fn(async () => []),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
vi.mock("@/components/ChatWindow/ChatContainer/ChatHistory", () => ({
  default: () => <ol id="history" />,
  ChatHistoryLoading: () => <div id="history-loading" />,
  ScrollArrowSlotContext: { Provider: ({ children }) => children },
}));

import { embedderSettings } from "../src/main.jsx";
import * as theme from "../src/utils/theme.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const ON_ACCENT = (hex) => `--allmi-on-accent: ${hex} !important;`;

let container;
let root;
let host;
let styleEl;
let mountTarget;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // Host mit Shadow-Root und Theme-<style> wie main.jsx, zunächst an <body>
  host = document.createElement("div");
  host.id = "anythingllm-embed-widget";
  styleEl = document.createElement("style");
  host.attachShadow({ mode: "open" }).appendChild(styleEl);
  document.body.appendChild(host);
  mountTarget = document.createElement("div");
  mountTarget.id = "kufer-assistent";
  document.body.appendChild(mountTarget);
  embedderSettings.hostElement = host;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  host.remove();
  mountTarget.remove();
  vi.restoreAllMocks();
});

function renderInline(extra = {}) {
  act(() =>
    root.render(
      <InlineChat
        settings={{
          ...BASE,
          loaded: true,
          displayMode: "inline",
          inlineInput: true,
          enableStt: false,
          buttonColor: "#ffd400",
          ...extra,
        }}
        mountTarget={mountTarget}
        sessionId="s-1"
        conversationId="c-1"
        newConversation={vi.fn()}
        switchConversation={vi.fn()}
        justCreatedRef={{ current: false }}
      />,
    ),
  );
}

describe("Restpunkt rc7 Nr. 4: Akzentfarbe der Seite nur am Platzhalter (seit E23: ohne Wirkung)", () => {
  it("refreshTheme entfällt: die Farben der Seite werden nicht mehr gelesen", () => {
    expect(theme.refreshTheme).toBeUndefined();
    expect(theme.pageColors).toBeUndefined();
    host.style.setProperty("--allm-accent", "#b45309");
    theme.applyTheme(styleEl, { buttonColor: "#ffd400" });
    // Gelb aus dem Design Center: Schwarz, auch mit Braun der Seite
    expect(styleEl.textContent).toContain(ON_ACCENT("#222628"));
    expect(styleEl.textContent).toContain("--allmi-accent: #ffd400 !important;");
    expect(styleEl.textContent).not.toContain("var(--allm-accent");
  });

  it("nach dem Einhängen in den Platzhalter bleiben Akzent und Schrift aus dem Design Center", () => {
    theme.applyTheme(styleEl, { buttonColor: "#ffd400" });
    const before = styleEl.textContent;
    host.style.setProperty("--allm-accent", "#b45309");
    mountTarget.style.setProperty("--allm-accent", "#b45309");
    renderInline();
    expect(host.parentNode).toBe(mountTarget);
    expect(styleEl.textContent).toBe(before);
    expect(styleEl.textContent).toContain(ON_ACCENT("#222628"));
  });

  it("gewählte Schrift (userTextColor) bleibt auch nach dem Umhängen wie gewählt", () => {
    theme.applyTheme(styleEl, {
      buttonColor: "#b45309",
      userTextColor: "#222628",
    });
    host.style.setProperty("--allm-accent", "#ffd400");
    renderInline({ buttonColor: "#b45309", userTextColor: "#222628" });
    expect(host.parentNode).toBe(mountTarget);
    expect(styleEl.textContent).toContain(ON_ACCENT("#222628"));
  });
});
