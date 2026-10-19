import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Restpunkt rc7 Nr. 4 (W01-Rest, issues/rollout-721/restpunkte-7.22-rc7.md):
// Setzt die Seite --allm-accent nur am Platzhalter #kufer-assistent, hängt der
// Host beim ersten applyTheme noch an <body> und sieht die Farbe nicht; die
// Schrift auf der Akzentfarbe folgte dann nicht der gezeigten Fläche.
// InlineChat liest die Farben der Seite nach jedem Umhängen neu
// (utils/theme.js refreshTheme). jsdom vererbt eigene Eigenschaften nicht:
// die Farbe steht hier direkt am Host und wird erst NACH applyTheme gesetzt
// (wie im Browser erst im Platzhalter im berechneten Stil des Hosts sichtbar).

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
const ON_ACCENT = (hex) => `--allmi-on-accent: var(--allm-on-accent, ${hex});`;

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

describe("Restpunkt rc7 Nr. 4: Akzentfarbe der Seite nur am Platzhalter", () => {
  it("refreshTheme liest die Farben der Seite am Host neu", () => {
    theme.applyTheme(styleEl, { buttonColor: "#ffd400" });
    // Gelb aus dem Design Center: Schwarz
    expect(styleEl.textContent).toContain(ON_ACCENT("#222628"));
    host.style.setProperty("--allm-accent", "#b45309");
    theme.refreshTheme();
    // gezeigt wird jetzt Braun von der Seite: Weiß
    expect(styleEl.textContent).toContain(ON_ACCENT("#FFFFFF"));
    expect(styleEl.textContent).toContain(
      "--allmi-pill-accent-text: var(--allm-pill-accent-text, var(--allmi-accent));",
    );
  });

  it("nach dem Einhängen in den Platzhalter folgt die Schrift der dort gezeigten Akzentfarbe", () => {
    theme.applyTheme(styleEl, { buttonColor: "#ffd400" });
    expect(styleEl.textContent).toContain(ON_ACCENT("#222628"));
    // im Browser: erst im Platzhalter sichtbar (jsdom: direkt am Host, nach
    // applyTheme); ohne Neu-Lesen bliebe Schwarz stehen
    host.style.setProperty("--allm-accent", "#b45309");
    expect(styleEl.textContent).toContain(ON_ACCENT("#222628"));
    renderInline();
    expect(host.parentNode).toBe(mountTarget);
    expect(styleEl.textContent).toContain(ON_ACCENT("#FFFFFF"));
    expect(styleEl.textContent).not.toContain(ON_ACCENT("#222628"));
  });

  it("gewählte Schrift (userTextColor) bleibt auch nach dem Umhängen wie gewählt", () => {
    theme.applyTheme(styleEl, {
      buttonColor: "#ffd400",
      userTextColor: "#222628",
    });
    host.style.setProperty("--allm-accent", "#b45309");
    renderInline({ userTextColor: "#222628" });
    expect(host.parentNode).toBe(mountTarget);
    expect(styleEl.textContent).toContain(ON_ACCENT("#222628"));
  });
});
