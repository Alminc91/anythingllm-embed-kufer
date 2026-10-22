import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Korrekturrunde 7.22-rc16 W43 (issues/rollout-721/fixliste-7.22-rc16.md,
// Details review-7.22-nachreview-rc15.md W43): Im mobilen Vollbild der
// Inline-Darstellung (view „overlay“) und in der Box im Seitenfluss
// (inlineLayout „flow“) schließt ein Escape ohne Fokus (<body>) die offene
// Ebene („Frühere Chats“, Kommentarfeld) mit preventDefault und Fokus zurück
// auf den Öffner. Das Widget selbst bleibt offen (eingeklappt wird dort nur
// mit Escape aus dem Widget). Ein Escape der Webseite ändert dort nichts.
// Die schwebende Box (rc13-inline-escape.test.jsx) bleibt unverändert und
// schließt je Escape genau eine Ebene.

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
import { escapeLayerCount, useEscapeLayer } from "../src/utils/escape.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};

// Zwischenschritt wie „Frühere Chats“ (nimmt jedes Escape aus dem Widget oder
// ohne Fokus), mit Öffner für die Fokusrückgabe
function Layer({ onClose, opener = null }) {
  useEscapeLayer(true, onClose, { returnFocus: () => opener });
  return null;
}

let container;
let root;
let layerRoot;
let layerContainer;
let mountTarget;
let matchMediaBefore;
let desktop = true;
beforeEach(() => {
  desktop = true;
  matchMediaBefore = window.matchMedia;
  window.matchMedia = (q) => ({
    matches: q === "(min-width: 768px)" ? desktop : false,
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
  embedderSettings.hostElement?.remove();
  document.querySelectorAll("[data-rc16-page]").forEach((el) => el.remove());
  window.matchMedia = matchMediaBefore;
  vi.restoreAllMocks();
});

// view: "flow" (Box im Seitenfluss, Desktop), "overlay" (mobiles Vollbild),
// "floating" (schwebende Box, Desktop)
function setup(view) {
  desktop = view !== "overlay";
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
    inlineLayout: view === "floating" ? "overlay" : "flow",
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
  // Öffner im Widget (wie ⋮)
  const opener = document.createElement("button");
  container.appendChild(opener);
  const onClose = vi.fn();
  const onCloseBelow = vi.fn();
  act(() =>
    layerRoot.render(
      <>
        <Layer onClose={onCloseBelow} opener={opener} />
        <Layer onClose={onClose} opener={opener} />
      </>,
    ),
  );
  return {
    onClose,
    onCloseBelow,
    opener,
    open: () =>
      !!q("#chat-window-stub") &&
      q("#anything-llm-chat")?.parentElement?.className !== "allm-hidden",
  };
}
function pageElement(tag, attrs = {}) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute("data-rc16-page", "");
  document.body.appendChild(el);
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

describe("W43: Escape ohne Fokus im mobilen Vollbild und in der Box im Seitenfluss", () => {
  for (const view of ["overlay", "flow"]) {
    it(`${view}: Escape auf <body> schließt die oberste Ebene mit preventDefault, Fokus auf den Öffner, Widget bleibt offen`, () => {
      const ui = setup(view);
      expect(ui.open()).toBe(true);
      expect(escapeLayerCount()).toBe(2);
      document.activeElement?.blur?.();
      const e = escapeAt(document.body);
      expect(e.defaultPrevented).toBe(true);
      expect(ui.onClose).toHaveBeenCalledTimes(1);
      expect(ui.onCloseBelow).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(ui.opener);
      expect(ui.open()).toBe(true);
    });

    it(`${view}: Escape der Webseite (Button, Suchfeld) schließt keine Ebene, kein preventDefault`, () => {
      const ui = setup(view);
      for (const el of [
        pageElement("button"),
        pageElement("input", { type: "search" }),
      ]) {
        el.focus();
        const e = escapeAt(el);
        expect(e.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(el);
      }
      expect(ui.onClose).not.toHaveBeenCalled();
      expect(ui.onCloseBelow).not.toHaveBeenCalled();
      expect(ui.open()).toBe(true);
    });
  }

  it("ohne offene Ebene: Escape auf <body> lässt Vollbild und Box im Fluss offen, kein preventDefault", () => {
    for (const view of ["overlay", "flow"]) {
      setup(view);
      act(() => layerRoot.render(null));
      expect(escapeLayerCount()).toBe(0);
      const e = escapeAt(document.body);
      expect(e.defaultPrevented, view).toBe(false);
      expect(container.querySelector("#chat-window-stub"), view).not.toBeNull();
      act(() => root.unmount());
      root = createRoot(container);
      mountTarget.remove();
      embedderSettings.hostElement?.remove();
    }
  });

  it("schwebende Box unverändert: Escape auf <body> schließt genau eine Ebene", () => {
    const ui = setup("floating");
    const e = escapeAt(document.body);
    expect(e.defaultPrevented).toBe(true);
    expect(ui.onClose).toHaveBeenCalledTimes(1);
    expect(ui.onCloseBelow).not.toHaveBeenCalled();
    expect(ui.open()).toBe(true);
  });
});
