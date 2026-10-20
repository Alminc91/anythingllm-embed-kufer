import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Korrekturrunde 7.22-rc13 W01, Fall schwebende Inline-Box (issues/
// rollout-721/fixliste-7.22-rc13.md, Details review-7.22-nachreview-rc12.md
// W01): Der Escape-Listener am document darf ein Escape der Webseite nicht
// abfangen. Fokus in einem Feld der Seite (Suchfeld): keine Ebene schließt,
// kein preventDefault (das Feld leert sich, der Kommentarentwurf bleibt),
// die Box klappt wie bisher ein. Escape auf einem Button der Seite (Dialog):
// die Ebene schließt, aber ohne preventDefault. Ohne Fokus (<body>): wie
// bisher mit preventDefault. Der Fall Chatfenster steht in rc13-fixes.

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
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
vi.mock("@/components/ChatWindow", () => ({
  default: function ChatWindowStub() {
    return <div id="chat-window-stub" />;
  },
}));

import { embedderSettings } from "../src/main.jsx";
import { DEFAULT_SETTINGS } from "../src/hooks/useScriptAttributes.js";
import { useEscapeLayer } from "../src/utils/escape.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};

// Zwischenschritt im Widget (wie „Frühere Chats“: nimmt jedes Escape aus dem
// Widget oder ohne Fokus)
function Layer({ onClose }) {
  useEscapeLayer(true, onClose);
  return null;
}

let container;
let root;
let layerRoot;
let layerContainer;
let mountTarget;
let matchMediaBefore;
beforeEach(() => {
  matchMediaBefore = window.matchMedia;
  window.matchMedia = (q) => ({
    matches: q === "(min-width: 768px)",
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  layerContainer = document.createElement("div");
  layerRoot = createRoot(layerContainer);
});
afterEach(() => {
  act(() => layerRoot.unmount());
  act(() => root.unmount());
  container.remove();
  mountTarget?.remove();
  document.querySelectorAll("[data-rc13-page]").forEach((el) => el.remove());
  window.matchMedia = matchMediaBefore;
  vi.restoreAllMocks();
});

function setup() {
  mountTarget = document.createElement("div");
  document.body.appendChild(mountTarget);
  const host = document.createElement("div");
  mountTarget.appendChild(host);
  embedderSettings.hostElement = host;
  embedderSettings.shadowRoot = null;
  const settings = {
    ...DEFAULT_SETTINGS,
    ...BASE,
    displayMode: "inline",
    inlineLayout: "overlay",
  };
  act(() =>
    root.render(
      <InlineChat
        settings={settings}
        mountTarget={mountTarget}
        sessionId="s-1"
        conversationId="c-1"
      />,
    ),
  );
  const q = (s) => container.querySelector(s);
  act(() =>
    q("#anything-llm-inline-bar").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    ),
  );
  const onClose = vi.fn();
  act(() => layerRoot.render(<Layer onClose={onClose} />));
  return {
    onClose,
    collapsed: () =>
      q("#anything-llm-chat")?.parentElement?.className === "allm-hidden",
  };
}
function pageElement(tag, attrs = {}, parent = document.body) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute("data-rc13-page", "");
  parent.appendChild(el);
  return el;
}
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

describe("W01: schwebende Inline-Box, Escape der Webseite", () => {
  it("Escape im Suchfeld der Seite: Ebene bleibt offen, kein preventDefault, Box klappt ein, Fokus bleibt im Feld", () => {
    const ui = setup();
    const search = pageElement("input", { type: "search" });
    search.focus();
    const e = escapeAt(search);
    expect(e.defaultPrevented).toBe(false);
    expect(ui.onClose).not.toHaveBeenCalled();
    expect(ui.collapsed()).toBe(true);
    expect(document.activeElement).toBe(search);
  });

  it("Escape auf einem Button in einem Dialog der Seite: Ebene schließt ohne preventDefault, Box bleibt offen", () => {
    const ui = setup();
    const dialog = pageElement("dialog");
    const button = pageElement("button", {}, dialog);
    button.focus();
    const e = escapeAt(button);
    expect(e.defaultPrevented).toBe(false);
    expect(ui.onClose).toHaveBeenCalledTimes(1);
    expect(ui.collapsed()).toBe(false);
  });

  it("Escape ohne Fokus (<body>): Ebene schließt mit preventDefault wie bisher", () => {
    const ui = setup();
    const e = escapeAt(document.body);
    expect(e.defaultPrevented).toBe(true);
    expect(ui.onClose).toHaveBeenCalledTimes(1);
    expect(ui.collapsed()).toBe(false);
  });
});
