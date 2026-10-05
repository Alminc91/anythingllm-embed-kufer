import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Aufklapp-Effekt "morph": Leiste wächst zum Panel (Klassen + Maße als
// CSS-Variablen am Chat-Fenster, Transition per CSS in main.jsx). Geometrie
// hier mit gemocktem getBoundingClientRect; Verlauf im Browser:
// tests/visual/overlay.py (ov-morph-*).

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
const chatWindowProps = vi.hoisted(() => ({ current: null }));
vi.mock("@/components/ChatWindow", () => ({
  default: function ChatWindowStub(props) {
    chatWindowProps.current = props;
    return <div id="chat-window-stub" />;
  },
}));

import { embedderSettings } from "../src/main.jsx";
import {
  DEFAULT_SETTINGS,
  loadEmbedSettings,
} from "../src/hooks/useScriptAttributes.js";
import {
  INLINE_EFFECT_VALUES,
  inlineEffectClass,
  resolveInlineEffect,
} from "../src/utils/layout.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// AK-2: Leiste 600×56 (Pille 999px), Panel 760×520 (Seite verbreitert)
const BAR = { left: 100, top: 50, width: 600, height: 56 };
const PANEL = { left: 20, top: 50, width: 760, height: 520 };
const rect = (r) => ({
  ...r,
  x: r.left,
  y: r.top,
  right: r.left + r.width,
  bottom: r.top + r.height,
});

let container;
let root;
let mountTarget;
let desktop;
let reduced;
let frames;
let gcsBefore;
beforeEach(() => {
  desktop = true;
  reduced = false;
  frames = [];
  vi.spyOn(window, "matchMedia").mockImplementation((q) => ({
    get matches() {
      if (q === "(min-width: 768px)") return desktop;
      if (q === "(prefers-reduced-motion: reduce)") return reduced;
      return false;
    },
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal("requestAnimationFrame", (fn) => frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function () {
      if (this.id === "anything-llm-inline-bar") return rect(BAR);
      if (this.id === "anything-llm-chat") return rect(PANEL);
      return rect({ left: 0, top: 0, width: 760, height: 68 });
    },
  );
  gcsBefore = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
    const cs = gcsBefore(el);
    if (el.id === "anything-llm-inline-bar")
      return { ...cs, borderTopLeftRadius: "999px" };
    if (el.id === "anything-llm-chat")
      return {
        ...cs,
        transitionDuration: el.classList.contains("allm-morph")
          ? "0.46s, 0.46s"
          : "0s",
      };
    return cs;
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  chatWindowProps.current = null;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  mountTarget?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(extra = {}) {
  mountTarget = document.createElement("div");
  document.body.appendChild(mountTarget);
  const host = document.createElement("div");
  mountTarget.appendChild(host);
  embedderSettings.hostElement = host;
  act(() =>
    root.render(
      <InlineChat
        settings={{
          ...DEFAULT_SETTINGS,
          ...BASE,
          displayMode: "inline",
          inlineEffect: "morph",
          ...extra,
        }}
        mountTarget={mountTarget}
        sessionId="s-1"
        conversationId="c-1"
      />,
    ),
  );
  const q = (s) => container.querySelector(s);
  return {
    bar: () => q("#anything-llm-inline-bar"),
    chat: () => q("#anything-llm-chat"),
    box: () => q("#anything-llm-chat")?.parentElement,
    open: () =>
      act(() =>
        q("#anything-llm-inline-bar").dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        ),
      ),
  };
}
const nextFrames = () =>
  act(() => {
    for (let i = 0; i < 3 && frames.length; i++)
      frames.splice(0).forEach((f) => f());
  });
function transitionEnd(el, propertyName = "width") {
  const ev = new Event("transitionend", { bubbles: true });
  Object.defineProperty(ev, "propertyName", { value: propertyName });
  act(() => el.dispatchEvent(ev));
}
const v = (el, k) => el.style.getPropertyValue(`--allmi-${k}`);
const visible = (ui) =>
  !!ui.chat() && !ui.box().classList.contains("allm-hidden");

describe("Settings / Klassenwahl morph", () => {
  it('"morph" ist ein gültiger Effekt (Script-Attribut, Groß-/Kleinschreibung egal)', async () => {
    expect(INLINE_EFFECT_VALUES).toContain("morph");
    const s = await loadEmbedSettings(
      { ...BASE, inlineEffect: " Morph " },
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    expect(s.inlineEffect).toBe("morph");
    expect(resolveInlineEffect(s)).toBe("morph");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("Klasse allm-effect-morph in flow und overlay", () => {
    for (const inlineLayout of ["flow", "overlay"])
      expect(inlineEffectClass({ inlineEffect: "morph", inlineLayout })).toBe(
        "allm-effect allm-effect-morph",
      );
  });
});

describe("AK-2: Start- und Endgeometrie", () => {
  it("overlay: Leistenform einen Frame, dann Transition zum Panel, danach aufgeräumt", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    expect(win.className).toContain("allm-effect-morph");
    expect(win.classList.contains("allm-morph-from")).toBe(true);
    expect(win.classList.contains("allm-morph")).toBe(false);
    expect(v(win, "mw")).toBe("600px");
    expect(v(win, "mh")).toBe("56px");
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    // Rundung der Leiste (999px) = Pille, höchstens halbe Höhe
    expect(v(win, "mr")).toBe("28px");
    // schwebend: äußere Box wächst nicht mit
    expect(ui.box().classList.contains("allm-morph-flow-from")).toBe(false);
    nextFrames();
    expect(win.classList.contains("allm-morph")).toBe(true);
    expect(win.classList.contains("allm-morph-from")).toBe(false);
    // Inhalt per Opacity, nie skaliert: fester Inhalts-Container
    expect(win.querySelector(".allm-inline-content")).not.toBeNull();
    transitionEnd(win, "opacity"); // andere Eigenschaft: läuft weiter
    expect(win.classList.contains("allm-morph")).toBe(true);
    transitionEnd(win);
    expect(win.classList.contains("allm-morph")).toBe(false);
    expect(v(win, "mw")).toBe("");
    expect(v(win, "cw")).toBe("");
    expect(visible(ui)).toBe(true);
  });

  it("flow: äußere Box startet in Höhe der Leistenfläche und wächst mit", () => {
    const ui = setup({ inlineLayout: "flow" });
    ui.open();
    const box = ui.box();
    expect(box.classList.contains("allm-morph-flow-from")).toBe(true);
    expect(v(box, "bh")).toBe("68px");
    nextFrames();
    expect(box.classList.contains("allm-morph-flow")).toBe(true);
    expect(box.classList.contains("allm-morph-flow-from")).toBe(false);
    transitionEnd(ui.chat());
    expect(box.classList.contains("allm-morph-flow")).toBe(false);
    expect(v(box, "bh")).toBe("");
  });

  it("NAK-2: Sicherheits-Timer beendet den Lauf auch ohne transitionend", () => {
    vi.useFakeTimers();
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    act(() => vi.advanceTimersByTime(600));
    expect(ui.chat().classList.contains("allm-morph")).toBe(false);
    expect(visible(ui)).toBe(true);
  });
});

describe("AK-3: Zuklappen rückwärts", () => {
  it("Schließen: erst zurück zur Leistenform, dann eingeklappt, Fokus auf der Leiste", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    transitionEnd(ui.chat());
    const win = ui.chat();
    act(() => chatWindowProps.current.closeChat());
    expect(visible(ui)).toBe(true);
    expect(win.classList.contains("allm-morph")).toBe(true);
    expect(win.classList.contains("allm-morph-from")).toBe(true);
    expect(win.classList.contains("allm-morph-close")).toBe(true);
    expect(v(win, "mw")).toBe("600px");
    // zweiter Aufruf während des Rückwegs zählt nicht
    act(() => chatWindowProps.current.closeChat());
    transitionEnd(win);
    expect(visible(ui)).toBe(false);
    expect(ui.bar()).not.toBeNull();
    expect(document.activeElement).toBe(ui.bar());
    expect(win.classList.contains("allm-morph")).toBe(false);
    expect(v(win, "mw")).toBe("");
  });

  it("Schließen mitten im Aufklappen kehrt um (Klassen bleiben, Rückweg)", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    const win = ui.chat();
    act(() => chatWindowProps.current.closeChat());
    expect(win.classList.contains("allm-morph-close")).toBe(true);
    transitionEnd(win);
    expect(visible(ui)).toBe(false);
  });
});

describe("AK-4 / AK-5: reduzierte Bewegung, mobil", () => {
  it("prefers-reduced-motion: kein Morph, Endzustand sofort, Schließen sofort", () => {
    reduced = true;
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    expect(win.classList.contains("allm-morph-from")).toBe(false);
    expect(v(win, "mw")).toBe("");
    act(() => chatWindowProps.current.closeChat());
    expect(visible(ui)).toBe(false);
  });

  it("mobil (<768px): Vollbild ohne Morph", () => {
    desktop = false;
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    expect(win.className).toContain("allm-fixed");
    expect(win.className).not.toContain("allm-morph");
    expect(v(win, "mw")).toBe("");
  });

  it("andere Effekte bleiben ohne Morph-Klassen", () => {
    const ui = setup({ inlineLayout: "overlay", inlineEffect: "float" });
    ui.open();
    expect(ui.chat().className).toContain("allm-effect-float");
    expect(ui.chat().className).not.toContain("allm-morph");
    act(() => chatWindowProps.current.closeChat());
    expect(visible(ui)).toBe(false);
  });
});
