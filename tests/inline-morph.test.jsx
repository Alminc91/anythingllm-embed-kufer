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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
// Inline-Fläche bei sichtbarer Box (null = rootRect), Eingabefeld, Chip-Opacity
let rootOpenRect;
let inputRect;
let chipsOpacity;
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
  rootOpenRect = null;
  inputRect = { left: 20, top: 500, width: 760, height: 40 };
  chipsOpacity = null;
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
      if (this.id === "message-input") return rect(inputRect);
      if (
        this.id === "anything-llm-embed-inline" &&
        rootOpenRect &&
        this.querySelector("#anything-llm-chat") &&
        !this.querySelector(
          "#anything-llm-chat",
        ).parentElement.classList.contains("allm-hidden")
      )
        return rect(rootOpenRect);
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
    if (el.id === "anything-llm-inline-chips" && chipsOpacity != null)
      return { ...cs, opacity: chipsOpacity };
    if (el.id === "anything-llm-chat")
      return {
        ...cs,
        // wie main.jsx: Aufklappen 720ms; Zuklappen 480ms, Box erst nach
        // 80ms; Schatten jeweils + 100 ms (längste Transition)
        transitionProperty:
          "width, height, transform, border-radius, box-shadow",
        transitionDuration: el.classList.contains("allm-morph-close")
          ? "0.48s, 0.48s, 0.48s, 0.48s, 0.58s"
          : el.classList.contains("allm-morph")
            ? "0.72s, 0.72s, 0.72s, 0.72s, 0.82s"
            : "0s",
        transitionDelay: el.classList.contains("allm-morph-close")
          ? "80ms"
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
    act(() => vi.advanceTimersByTime(900)); // Schatten 820 + 100
    expect(ui.chat().classList.contains("allm-morph")).toBe(true);
    act(() => vi.advanceTimersByTime(30));
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

// Review-Befunde (Code-Review high, 05.10.); „Befund n“ weiter unten = Code-Review high, 06.10.
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
    transitionEnd(win.querySelector(".allm-inline-content"), "box-shadow");
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

describe("Review 6: Startrundung in px oder %", () => {
  it("30 %: gegen die kleinere Seite (56px) = 16,8px", () => {
    barRadius = "30%";
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    expect(v(ui.chat(), "mr")).toBe("16.8px");
  });

  it("zwei Werte (horizontal/vertikal): der kleinere", () => {
    barRadius = "40px 20%";
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    expect(v(ui.chat(), "mr")).toBe("11.2px");
  });

  it("weiter höchstens halbe Höhe", () => {
    barRadius = "80%";
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    expect(v(ui.chat(), "mr")).toBe("28px");
  });
});

// Issue „Morph flüssiger“: kein Scroll im Lauf, Schließen mit gleicher
// Dauer/Kurve (Inhalt zuerst aus), Chips blenden aus/ein, will-change nur im
// Lauf. Verlauf im Browser: tests/visual/overlay.py (ov-morph-frames u. a.).
// Seite für die Scroll-Tests: Viewport 768 px, Box bei y = 600 (scrollY 0),
// Endhöhe 520 px, darunter belowPx Inhalt. Dokumenthöhe folgt der Box
// (Startform = 68 px) bzw. der reservierten Höhe (min-height der
// Inline-Fläche); window.scrollTo klemmt wie ein Browser.
describe("Morph flüssiger: Scroll vor dem Lauf", () => {
  let scrollCalls;
  let scrollToCalls;
  let sy;
  let belowPx;
  let protoBefore;
  let scrollToBefore;
  const de = document.documentElement;
  const inlineRoot = () =>
    container.querySelector("#anything-llm-embed-inline");
  const docHeight = () => {
    const box = container.querySelector("#anything-llm-chat")?.parentElement;
    const open = box && !box.classList.contains("allm-hidden");
    let h = open && !box.classList.contains("allm-morph-flow-from") ? 520 : 68;
    h = Math.max(h, parseFloat(inlineRoot()?.style.minHeight) || 0);
    return 600 + h + belowPx;
  };
  beforeEach(() => {
    scrollCalls = [];
    scrollToCalls = [];
    sy = 0;
    belowPx = 2000;
    protoBefore = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (opts) {
      scrollCalls.push({
        opts,
        // Lauf noch nicht gestartet: nur die Startform (allm-morph-from) steht an
        running: !!this.querySelector(".allm-morph"),
      });
    };
    scrollToBefore = window.scrollTo;
    window.scrollTo = (opts) => {
      const box = container.querySelector("#anything-llm-chat")?.parentElement;
      const max = docHeight() - 768;
      const y = Math.min(Math.max(0, opts.top), max);
      scrollToCalls.push({
        opts,
        y,
        startForm: !!box?.classList.contains("allm-morph-flow-from"),
        running: !!box?.querySelector(".allm-morph"),
        reserve: inlineRoot()?.style.minHeight || "",
        scrollBehavior: de.style.scrollBehavior,
      });
      sy = y;
    };
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => sy,
    });
    Object.defineProperty(de, "scrollHeight", {
      configurable: true,
      get: docHeight,
    });
    Object.defineProperty(de, "clientHeight", {
      configurable: true,
      get: () => 768,
    });
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = protoBefore;
    window.scrollTo = scrollToBefore;
    delete window.scrollY;
    delete de.scrollHeight;
    delete de.clientHeight;
    de.style.removeProperty("scroll-behavior");
  });

  it("overlay: Box ragt aus dem Viewport -> trotzdem kein Scroll (wie das Mockup)", () => {
    panelRect = { left: 20, top: 600, width: 760, height: 520 };
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    transitionEnd(ui.chat());
    expect(scrollCalls).toHaveLength(0);
    expect(scrollToCalls).toHaveLength(0);
  });

  it("NAK-1 flow: Box ragt aus dem Viewport -> genau ein Sofort-Scroll gegen die Endgröße, mit Startform, vor dem ersten Frame", () => {
    panelRect = { left: 20, top: 600, width: 760, height: 520 };
    rootOpenRect = panelRect;
    const ui = setup({ inlineLayout: "flow" });
    ui.open();
    expect(scrollCalls).toHaveLength(0);
    expect(scrollToCalls).toEqual([
      {
        opts: { left: 0, top: 352, behavior: "instant" },
        y: 352,
        startForm: true,
        running: false,
        reserve: "", // genug Inhalt darunter: nichts reserviert
        scrollBehavior: "",
      },
    ]);
    nextFrames();
    transitionEnd(ui.chat());
    // nach dem Lauf scrollt nichts mehr nach
    expect(scrollToCalls).toHaveLength(1);
    expect(scrollCalls).toHaveLength(0);
  });

  it("Befund 1: nur 100 px Inhalt unter dem Widget -> Endhöhe reserviert, kein Klemmen, Box am Ende ganz sichtbar", () => {
    belowPx = 100;
    panelRect = { left: 20, top: 600, width: 760, height: 520 };
    rootOpenRect = panelRect;
    const ui = setup({ inlineLayout: "flow" });
    ui.open();
    // Startform liegt an (Seite nur 768 px hoch) -> min-height = Endhöhe
    expect(scrollToCalls).toHaveLength(1);
    expect(scrollToCalls[0]).toMatchObject({
      opts: { top: 352, behavior: "instant" },
      y: 352, // nicht geklemmt (ohne Reserve: 0)
      startForm: true,
      reserve: "520px",
    });
    nextFrames();
    expect(inlineRoot().style.minHeight).toBe("520px"); // während des Laufs
    transitionEnd(ui.chat());
    expect(inlineRoot().style.minHeight).toBe("");
    // Box am Ende: 600 + 520 - 352 = 768 = Viewport-Unterkante, scrollY steht
    expect(600 + 520 - sy).toBeLessThanOrEqual(768);
    expect(sy).toBe(352);
    expect(scrollToCalls).toHaveLength(1);
  });

  it("Befund 1: Zuklappen mitten im Lauf gibt die Reserve frei", () => {
    belowPx = 100;
    panelRect = { left: 20, top: 600, width: 760, height: 520 };
    rootOpenRect = panelRect;
    const ui = setup({ inlineLayout: "flow" });
    ui.open();
    nextFrames();
    expect(inlineRoot().style.minHeight).toBe("520px");
    act(() => chatWindowProps.current.closeChat());
    expect(inlineRoot().style.minHeight).toBe("");
  });

  it('Befund 3: ohne behavior "instant" (TypeError) -> "auto" mit kurzzeitig scroll-behavior: auto, danach wie vorher', () => {
    de.style.setProperty("scroll-behavior", "smooth");
    const plain = window.scrollTo;
    window.scrollTo = (opts) => {
      if (opts?.behavior === "instant") throw new TypeError("behavior");
      plain(opts);
    };
    panelRect = { left: 20, top: 600, width: 760, height: 520 };
    rootOpenRect = panelRect;
    const ui = setup({ inlineLayout: "flow" });
    ui.open();
    expect(scrollToCalls).toHaveLength(1);
    expect(scrollToCalls[0]).toMatchObject({
      opts: { top: 352, behavior: "auto" },
      y: 352,
      scrollBehavior: "auto",
    });
    expect(de.style.scrollBehavior).toBe("smooth");
    expect(de.style.getPropertyPriority("scroll-behavior")).toBe("");
    expect(sy).toBe(352);
    nextFrames();
    transitionEnd(ui.chat());
  });

  it("AK-1: Box im Viewport -> kein Scroll (weder vorher noch nachher)", () => {
    for (const inlineLayout of ["overlay", "flow"]) {
      const ui = setup({ inlineLayout });
      ui.open();
      nextFrames();
      transitionEnd(ui.chat());
      expect(scrollCalls).toHaveLength(0);
      expect(scrollToCalls).toHaveLength(0);
      act(() => chatWindowProps.current.closeChat());
      transitionEnd(ui.chat());
      expect(scrollCalls).toHaveLength(0);
      expect(scrollToCalls).toHaveLength(0);
    }
  });

  it("andere Effekte scrollen wie bisher sanft", () => {
    panelRect = { left: 20, top: 600, width: 760, height: 520 };
    const ui = setup({ inlineLayout: "overlay", inlineEffect: "float" });
    ui.open();
    expect(scrollCalls.map((c) => c.opts)).toEqual([
      { block: "nearest", behavior: "smooth" },
    ]);
    expect(scrollToCalls).toHaveLength(0);
  });
});

describe("Befund 2 / Tastenübergabe: Overlay-Morph – Text nie in ein unsichtbares Feld", () => {
  let shadowHost;
  let input;
  beforeEach(() => {
    shadowHost = document.createElement("div");
    document.body.appendChild(shadowHost);
    const sr = shadowHost.attachShadow({ mode: "open" });
    input = document.createElement("textarea");
    input.id = "message-input";
    sr.appendChild(input);
    embedderSettings.shadowRoot = sr;
  });
  afterEach(() => {
    embedderSettings.shadowRoot = null;
    shadowHost.remove();
  });
  const focused = () => embedderSettings.shadowRoot.activeElement === input;

  const sink = () => container.querySelector("#anything-llm-key-sink");
  const type = (el, text) => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el),
      "value",
    ).set;
    act(() => {
      setter.call(el, el.value + text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("Tastenübergabe: Feld in Endlage im Viewport -> Fokus sofort in der Klick-Geste (Lauf läuft weiter)", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    expect(focused()).toBe(true);
    nextFrames();
    expect(ui.chat().classList.contains("allm-morph")).toBe(true);
    transitionEnd(ui.chat());
    expect(focused()).toBe(true);
  });

  it("NAK-4: Feld unter dem Viewport -> Zeichen im Auffangfeld, kein Scroll im Lauf; danach Tippen -> Text im Feld + einmal hinscrollen", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const protoBefore = Element.prototype.scrollIntoView;
    const intoView = vi.fn();
    Element.prototype.scrollIntoView = intoView;
    try {
      panelRect = { left: 20, top: 600, width: 760, height: 520 };
      inputRect = { left: 20, top: 1060, width: 760, height: 40 };
      const ui = setup({ inlineLayout: "overlay" });
      ui.open();
      expect(focused()).toBe(false);
      expect(document.activeElement).toBe(sink());
      nextFrames();
      type(sink(), "abc"); // mitten im Lauf
      expect(input.value).toBe("");
      expect(intoView).not.toHaveBeenCalled();
      transitionEnd(ui.chat());
      // Ende des Laufs: Text übergeben, Fokus ins Feld, einmal hinscrollen
      expect(input.value).toBe("abc");
      expect(focused()).toBe(true);
      expect(intoView).toHaveBeenCalledTimes(1);
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = protoBefore;
    }
  });

  it("NAK-4: Feld unter dem Viewport, nichts getippt -> nach dem Lauf kein Scroll, erst das erste Zeichen holt das Feld", () => {
    const protoBefore = Element.prototype.scrollIntoView;
    const intoView = vi.fn();
    Element.prototype.scrollIntoView = intoView;
    try {
      panelRect = { left: 20, top: 600, width: 760, height: 520 };
      inputRect = { left: 20, top: 1060, width: 760, height: 40 };
      const ui = setup({ inlineLayout: "overlay" });
      ui.open();
      nextFrames();
      transitionEnd(ui.chat());
      expect(focused()).toBe(false);
      expect(document.activeElement).toBe(sink());
      expect(intoView).not.toHaveBeenCalled();
      type(sink(), "x");
      expect(input.value).toBe("x");
      expect(focused()).toBe(true);
      expect(intoView).toHaveBeenCalledTimes(1);
    } finally {
      Element.prototype.scrollIntoView = protoBefore;
    }
  });

  it("Schließen vor dem Ende: kein Fokus ins Feld", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    act(() => chatWindowProps.current.closeChat());
    transitionEnd(ui.chat());
    expect(focused()).toBe(false);
  });

  it("flow: Fokus wie bisher sofort in der Klick-Geste", () => {
    const ui = setup({ inlineLayout: "flow" });
    ui.open();
    expect(focused()).toBe(true);
  });
});

describe("Morph flüssiger: Schließen", () => {
  it("Sicherheits-Timer rechnet die Verzögerung des Rückwegs mit", () => {
    vi.useFakeTimers();
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    act(() => chatWindowProps.current.closeChat());
    act(() => vi.advanceTimersByTime(740)); // Schatten 580 + 80 + 100 = 760
    expect(visible(ui)).toBe(true);
    act(() => vi.advanceTimersByTime(30));
    expect(visible(ui)).toBe(false);
  });

  it("flow: äußere Box bekommt beim Rückweg die Verzögerung (allm-morph-flow-close)", () => {
    const ui = setup({ inlineLayout: "flow" });
    openAndSettle(ui);
    const box = ui.box();
    act(() => chatWindowProps.current.closeChat());
    expect(box.classList.contains("allm-morph-flow-close")).toBe(true);
    expect(box.classList.contains("allm-morph-flow-from")).toBe(true);
    transitionEnd(ui.chat());
    expect(box.classList.contains("allm-morph-flow-close")).toBe(false);
  });

  it("AK-2 (CSS): Timing wie das Mockup (720 / 480 + 80 ms), Inhalt vor 50 % aus; will-change nur im Lauf; Schatten +100 ms", () => {
    const src = readFileSync(resolve(process.cwd(), "src/main.jsx"), "utf8");
    const rule = (sel) => {
      const i = src.indexOf(`\n  ${sel}{`);
      expect(i).toBeGreaterThan(-1);
      return src.slice(src.indexOf("{", i) + 1, src.indexOf("}", i));
    };
    // Aufklappen 720ms expo; Zuklappen eigene Dauer/Kurve (480ms,
    // cubic-bezier(.65,0,.35,1)), Box erst nach 1/6 (80 ms)
    expect(rule(".allm-morph,.allm-morph-flow,.allm-morph-chips-out")).toBe(
      "--allmi-fx-d:var(--allmi-effect-duration,720ms);--allmi-fx-e:var(--allmi-effect-easing,cubic-bezier(.16,1,.3,1));--allmi-fx-w:0s",
    );
    expect(
      rule(".allm-morph-close,.allm-morph-flow-close,.allm-morph-chips-in"),
    ).toBe(
      "--allmi-fx-d:var(--allmi-effect-close-duration,480ms);--allmi-fx-e:var(--allmi-effect-close-easing,cubic-bezier(.65,0,.35,1));--allmi-fx-w:calc(var(--allmi-fx-d)/6)",
    );
    const tr = rule(".allm-morph");
    for (const p of ["width", "height", "transform", "border-radius"])
      expect(tr).toContain(
        `${p} var(--allmi-fx-d) var(--allmi-fx-e) var(--allmi-fx-w)`,
      );
    expect(tr).toContain(
      "box-shadow calc(var(--allmi-fx-d) + 100ms) ease var(--allmi-fx-w)",
    );
    // Inhalt beim Schließen: 1/3 der Dauer (160 ms), ohne Verzögerung (< 50 %)
    expect(rule(".allm-morph-close>*")).toBe(
      "transition:opacity calc(var(--allmi-fx-d)/3) ease",
    );
    // Befund 6: Chips-Einblenden nur in der Gruppe des Zuklappens (die
    // erste Gruppe wäre für .allm-morph-chips-in ohnehin überschrieben)
    expect(
      src.match(/\n  [^{\n]*\.allm-morph-chips-in[,{][^\n]*--allmi-fx-d:/g),
    ).toHaveLength(1);
    // Befund 4/5: Ausblenden bleibt stehen (forwards), Einblenden ab
    // --allmi-chips-o
    expect(src).toContain(
      "@keyframes allm-chips-in{from{opacity:var(--allmi-chips-o,0);visibility:visible}",
    );
    expect(rule(".allm-morph-chips-out,.allm-morph-chips-in")).toContain(
      "animation:allm-chips-out calc(var(--allmi-fx-d)*.5) ease forwards",
    );
    // will-change nur an den Lauf-Klassen
    expect(src.match(/will-change:[^;}]*/g)).toEqual([
      "will-change:width,height,transform",
    ]);
    // Tastenübergabe: im Lauf overflow: clip (kein Scroll-Container)
    expect(src).toContain(
      ".allm-morph,.allm-morph-from{will-change:width,height,transform;overflow:clip!important}",
    );
  });
});

describe("Morph flüssiger: Chips unter der Leiste (AK-4)", () => {
  const chips = () => container.querySelector("#anything-llm-inline-chips");
  const SETTINGS = {
    inlineLayout: "overlay",
    inlineInput: true,
    defaultMessages: ["Spanisch A1", "Yoga"],
  };

  it("Öffnen: Chips blenden aus (Klasse am Chip-Container), danach aufgeräumt", () => {
    const ui = setup(SETTINGS);
    ui.open();
    // schwebend: Leiste samt Chips unsichtbar im Seitenfluss, Chips blenden aus
    expect(chips().closest('[aria-hidden="true"]')).not.toBeNull();
    expect(chips().classList.contains("allm-morph-chips-out")).toBe(true);
    nextFrames();
    transitionEnd(ui.chat());
    expect(chips().className).not.toContain("allm-morph-chips");
  });

  it("Schließen: Chips blenden wieder ein, danach normale Leiste mit Chips", () => {
    const ui = setup(SETTINGS);
    openAndSettle(ui);
    act(() => chatWindowProps.current.closeChat());
    expect(chips().classList.contains("allm-morph-chips-in")).toBe(true);
    expect(chips().classList.contains("allm-morph-chips-out")).toBe(false);
    transitionEnd(ui.chat());
    expect(visible(ui)).toBe(false);
    expect(chips().closest('[aria-hidden="true"]')).toBeNull();
    expect(chips().className).not.toContain("allm-morph-chips");
  });

  it("Befund 4: Schließen, während die Chips noch ausblenden -> Einblenden ab der aktuellen Opacity", () => {
    const ui = setup(SETTINGS);
    ui.open();
    nextFrames();
    chipsOpacity = "0.4"; // Ausblenden halb gelaufen
    act(() => chatWindowProps.current.closeChat());
    expect(chips().classList.contains("allm-morph-chips-in")).toBe(true);
    expect(chips().style.getPropertyValue("--allmi-chips-o")).toBe("0.4");
    transitionEnd(ui.chat());
    expect(chips().style.getPropertyValue("--allmi-chips-o")).toBe("");
  });

  it("Befund 4: Schließen nach beendetem Aufklappen -> Einblenden ab 0 (ohne Startwert)", () => {
    const ui = setup(SETTINGS);
    openAndSettle(ui);
    chipsOpacity = "1"; // ohne Klasse: natürliche Opacity, gilt nicht
    act(() => chatWindowProps.current.closeChat());
    expect(chips().classList.contains("allm-morph-chips-in")).toBe(true);
    expect(chips().style.getPropertyValue("--allmi-chips-o")).toBe("");
  });

  it("andere Effekte: Chips ohne Morph-Klassen", () => {
    const ui = setup({ ...SETTINGS, inlineEffect: "float" });
    ui.open();
    expect(chips().className).not.toContain("allm-morph-chips");
  });
});

describe("Befund 5: Ende erst nach der längsten Transition (Schatten +100 ms)", () => {
  it("Form fertig, Schatten läuft noch -> Klassen bleiben bis zu dessen Ende", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    const win = ui.chat();
    let running = [{ transitionProperty: "box-shadow", playState: "running" }];
    win.getAnimations = () => running;
    transitionEnd(win, "width");
    transitionEnd(win, "transform");
    expect(win.classList.contains("allm-morph")).toBe(true);
    running = [{ transitionProperty: "box-shadow", playState: "finished" }];
    transitionEnd(win, "box-shadow");
    expect(win.classList.contains("allm-morph")).toBe(false);
  });

  it("andere laufende Animationen (keine Transition) halten das Ende nicht auf", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    const win = ui.chat();
    win.getAnimations = () => [{ playState: "running" }];
    transitionEnd(win, "width");
    expect(win.classList.contains("allm-morph")).toBe(false);
  });

  it("Sicherheits-Timer = längste Transition (Schatten) + 100 ms, nicht die erste", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setTimeout");
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    spy.mockClear();
    nextFrames();
    expect(spy.mock.calls.map((c) => c[1])).toContain(920); // 820 + 100
    openAndSettleClose(ui, spy);
  });
});

function openAndSettleClose(ui, spy) {
  transitionEnd(ui.chat());
  spy.mockClear();
  act(() => chatWindowProps.current.closeChat());
  // Zuklappen: Schatten 580 + 80 ms Verzögerung + 100
  expect(spy.mock.calls.map((c) => c[1])).toContain(760);
}
