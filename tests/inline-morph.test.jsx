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
let rafSeq;
let gcsBefore;
// je Test änderbar: Leiste, Panel, Inline-Fläche, Rundung der Leiste
let barRect;
let panelRect;
let rootRect;
let barRadius;
// Signal am Platzhalter bei jeder Messung der Leiste
let barSignals;
let mqlListeners;
const onResize = () => {
  const was = desktop;
  desktop = window.innerWidth >= 768;
  if (was !== desktop) mqlListeners.forEach((fn) => fn());
};
let innerWidthBefore;
beforeEach(() => {
  desktop = true;
  reduced = false;
  frames = [];
  rafSeq = 0;
  barRect = BAR;
  panelRect = PANEL;
  rootRect = { left: 0, top: 0, width: 760, height: 68 };
  barRadius = "999px";
  barSignals = [];
  mqlListeners = new Set();
  innerWidthBefore = window.innerWidth;
  window.innerWidth = 1024;
  window.addEventListener("resize", onResize);
  vi.spyOn(window, "matchMedia").mockImplementation((q) => ({
    get matches() {
      if (q === "(min-width: 768px)") return desktop;
      if (q === "(prefers-reduced-motion: reduce)") return reduced;
      return false;
    },
    media: q,
    addEventListener(type, fn) {
      if (q === "(min-width: 768px)" && type === "change") mqlListeners.add(fn);
    },
    removeEventListener(type, fn) {
      mqlListeners.delete(fn);
    },
  }));
  vi.stubGlobal("requestAnimationFrame", (fn) => {
    frames.push({ id: ++rafSeq, fn });
    return rafSeq;
  });
  vi.stubGlobal("cancelAnimationFrame", (id) => {
    frames = frames.filter((f) => f.id !== id);
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function () {
      if (this.id === "anything-llm-inline-bar") {
        barSignals.push(mountTarget?.getAttribute("data-allm-expanded"));
        return rect(barRect);
      }
      // Chat-Fenster und äußere Box (Panel-Ecke)
      if (
        this.id === "anything-llm-chat" ||
        this.firstElementChild?.id === "anything-llm-chat"
      )
        return rect(panelRect);
      return rect(rootRect);
    },
  );
  gcsBefore = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
    const cs = gcsBefore(el);
    if (el.id === "anything-llm-inline-bar")
      return { ...cs, borderTopLeftRadius: barRadius };
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
  window.removeEventListener("resize", onResize);
  window.innerWidth = innerWidthBefore;
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
      frames.splice(0).forEach((f) => f.fn());
  });
const resizeTo = (w) =>
  act(() => {
    window.innerWidth = w;
    window.dispatchEvent(new Event("resize"));
  });
const escapeOnPage = () =>
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
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

// Review-Befunde (Code-Review high, 05.10.)
const typeInto = (input, text) =>
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const openAndSettle = (ui) => {
  ui.open();
  nextFrames();
  transitionEnd(ui.chat());
};

describe("Review 1: abgebrochener Rückweg klappt trotzdem ein", () => {
  it("Schließen läuft, Fenster <768px: eingeklappt, zurück ab 768px bleibt die Box zu", () => {
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    const win = ui.chat();
    act(() => chatWindowProps.current.closeChat());
    expect(win.classList.contains("allm-morph-close")).toBe(true);
    resizeTo(390);
    expect(visible(ui)).toBe(false);
    expect(win.classList.contains("allm-morph")).toBe(false);
    resizeTo(1024);
    expect(visible(ui)).toBe(false);
    expect(ui.bar()).not.toBeNull();
    expect(win.classList.contains("allm-morph")).toBe(false);
  });

  it("wartende Übergabe wird wie beim Zuklappen verworfen, Text zurück ins Leisten-Feld", () => {
    const ui = setup({ inlineLayout: "overlay", inlineInput: true });
    typeInto(
      container.querySelector("#anything-llm-inline-input"),
      "Gibt es Yoga?",
    );
    act(() =>
      ui
        .bar()
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    nextFrames();
    expect(chatWindowProps.current.pendingFirstMessage?.text).toBe(
      "Gibt es Yoga?",
    );
    act(() => chatWindowProps.current.closeChat());
    resizeTo(390);
    expect(chatWindowProps.current.pendingFirstMessage).toBeNull();
    expect(container.querySelector("#anything-llm-inline-input").value).toBe(
      "Gibt es Yoga?",
    );
    resizeTo(1024);
    expect(visible(ui)).toBe(false);
  });

  it("Unmount während des Rückwegs: kein Fehler, kein späterer Lauf", () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    act(() => chatWindowProps.current.closeChat());
    act(() => root.unmount());
    act(() => vi.advanceTimersByTime(1000));
    expect(errors).not.toHaveBeenCalled();
    root = createRoot(container); // afterEach unmountet erneut
  });
});

describe("Review 2: Leistenform vor jedem Rückweg frisch gemessen", () => {
  it("overlay: unsichtbare Leiste ohne Signal gemessen, Panel-Ecke frisch", () => {
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    const win = ui.chat();
    // Fenster/Seite geändert: Leiste schmaler und tiefer, Panel verschoben
    barRect = { left: 150, top: 80, width: 500, height: 60 };
    panelRect = { left: 40, top: 80, width: 700, height: 520 };
    barSignals = [];
    act(() => chatWindowProps.current.closeChat());
    expect(v(win, "mw")).toBe("500px");
    expect(v(win, "mh")).toBe("60px");
    expect(v(win, "mt")).toBe("translate(110px, 0px)");
    expect(v(win, "mr")).toBe("30px");
    // eingeklappter Stand der Seite (Signal kurz weg), danach wieder gesetzt
    expect(barSignals).toEqual([null]);
    expect(mountTarget.getAttribute("data-allm-expanded")).toBe("true");
  });

  it("flow: Lage/Breite der Inline-Fläche, Höhe der Leiste vom Aufklappen", () => {
    const ui = setup({ inlineLayout: "flow" });
    openAndSettle(ui);
    const win = ui.chat();
    rootRect = { left: 30, top: 90, width: 640, height: 520 };
    panelRect = { left: 30, top: 90, width: 640, height: 520 };
    act(() => chatWindowProps.current.closeChat());
    expect(v(win, "mw")).toBe("640px");
    expect(v(win, "mh")).toBe("56px");
    expect(v(win, "mt")).toBe("translate(0px, 0px)");
  });

  it("Viewport-Wechsel verwirft die Leistenform: Zuklappen danach ohne Morph", () => {
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    resizeTo(390);
    resizeTo(1024);
    expect(visible(ui)).toBe(true);
    act(() => chatWindowProps.current.closeChat());
    expect(visible(ui)).toBe(false);
    expect(ui.chat().classList.contains("allm-morph")).toBe(false);
  });
});

describe("Review 3: Ende per transitionend jeder Form-Eigenschaft", () => {
  it("gleiche Breite (PANEL = BAR = 600): height beendet den Lauf ohne Timer", () => {
    vi.useFakeTimers();
    barRect = { left: 20, top: 50, width: 600, height: 56 };
    panelRect = { left: 20, top: 50, width: 600, height: 520 };
    const ui = setup({ inlineLayout: "flow" });
    ui.open();
    nextFrames();
    const win = ui.chat();
    expect(win.classList.contains("allm-morph")).toBe(true);
    transitionEnd(win, "opacity");
    transitionEnd(win, "box-shadow");
    expect(win.classList.contains("allm-morph")).toBe(true);
    transitionEnd(win, "height");
    expect(win.classList.contains("allm-morph")).toBe(false);
    expect(visible(ui)).toBe(true);
    // Rückweg: Rundung (Längsform je Ecke) beendet ihn ebenso
    act(() => chatWindowProps.current.closeChat());
    expect(visible(ui)).toBe(true);
    transitionEnd(win, "border-top-left-radius");
    expect(visible(ui)).toBe(false);
  });

  it("transform beendet den Lauf; Ereignisse aus dem Inhalt zählen nicht", () => {
    vi.useFakeTimers();
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    const win = ui.chat();
    transitionEnd(win.querySelector(".allm-inline-content"), "width");
    expect(win.classList.contains("allm-morph")).toBe(true);
    transitionEnd(win, "transform");
    expect(win.classList.contains("allm-morph")).toBe(false);
  });
});

describe("Review 4: Zuklappen vor dem ersten Frame", () => {
  it("Öffnen und sofort Escape: sofort zu, keine leere Leistenform", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    expect(win.classList.contains("allm-morph-from")).toBe(true);
    escapeOnPage();
    expect(visible(ui)).toBe(false);
    expect(ui.bar()).not.toBeNull();
    expect(win.classList.contains("allm-morph-from")).toBe(false);
    expect(v(win, "mw")).toBe("");
    // der abgebrochene Frame startet nichts mehr
    nextFrames();
    expect(win.classList.contains("allm-morph")).toBe(false);
  });
});
