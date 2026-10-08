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

describe("Zuklappen wie das Original: Leistenform vom Aufklappen, Box festgehalten, Signal beim Start", () => {
  it("overlay: Fenster unverändert -> Leistenform vom Aufklappen (in Seitenkoordinaten) relativ zur festgehaltenen Box", () => {
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    const win = ui.chat();
    // Seite seit dem Aufklappen verändert (Panel verschoben, Leiste wäre im
    // aufgeklappten Zustand breiter) -> zählt nicht, nichts wird neu gemessen
    barRect = { left: 150, top: 80, width: 500, height: 60 };
    panelRect = { left: 40, top: 80, width: 700, height: 520 };
    barSignals = [];
    act(() => chatWindowProps.current.closeChat());
    expect(v(win, "mw")).toBe("600px");
    expect(v(win, "mh")).toBe("56px");
    expect(v(win, "mr")).toBe("28px");
    // Leiste beim Aufklappen bei (100, 50); Box jetzt bei (40, 80)
    expect(v(win, "mt")).toBe("translate(60px, -30px)");
    expect(barSignals).toEqual([]);
    // Box festgehalten: feste Breite, kein right
    expect(ui.box().style.width).toBe("700px");
    expect(ui.box().style.right).toBe("auto");
    transitionEnd(win);
    expect(visible(ui)).toBe(false);
  });

  it("::expanded-attr-removed-on-close-start — Signal fällt beim Start, vor der ersten Lauf-Klasse, und kommt nicht wieder (AK-9)", () => {
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    const win = ui.chat();
    expect(mountTarget.getAttribute("data-allm-expanded")).toBe("true");
    const mo = new MutationObserver(() => {});
    mo.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-allm-expanded", "class"],
    });
    act(() => chatWindowProps.current.closeChat());
    const recs = mo.takeRecords();
    mo.disconnect();
    const removed = recs.findIndex(
      (r) =>
        r.attributeName === "data-allm-expanded" && r.target === mountTarget,
    );
    const closeClass = recs.findIndex(
      (r) => r.target === win && win.classList.contains("allm-morph-close"),
    );
    expect(removed).toBeGreaterThanOrEqual(0);
    expect(closeClass).toBeGreaterThan(removed);
    // während des ganzen Laufs weg (Seite baut parallel zurück)
    expect(visible(ui)).toBe(true);
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    nextFrames();
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    transitionEnd(win);
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
  });

  it("Box folgt der Seite nicht: verschiebt die Seite die Inline-Fläche im Lauf, gleicht die Box je Frame aus; am Ende gelöst", () => {
    rootOpenRect = { left: 0, top: 0, width: 760, height: 68 };
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    const box = ui.box();
    expect(box.style.left).toBe("0px"); // OVERLAY_BOX_STYLE
    act(() => chatWindowProps.current.closeChat());
    // Seite zieht die Fläche zusammen (80 px nach rechts, wie .ask der Demo)
    rootOpenRect = { left: 80, top: 0, width: 600, height: 68 };
    nextFrames();
    expect(box.style.left).toBe("-80px");
    expect(box.style.top).toBe("0px");
    transitionEnd(ui.chat());
    expect(visible(ui)).toBe(false);
    // gelöst und eingeklappt: keine festen Maße bleiben an der Box
    expect(box.style.width).toBe("");
    expect(box.style.right).toBe("");
    expect(box.style.left).toBe("");
    // kein Nachführ-Frame mehr: auch nach weiteren Frames bleibt die Box
    // frei, die Frame-Warteschlange ist leer
    nextFrames();
    expect(box.style.left).toBe("");
    expect(box.style.top).toBe("");
    expect(frames).toHaveLength(0);
  });

  it("flow: Leistenform vom Aufklappen, Box festgehalten", () => {
    const ui = setup({ inlineLayout: "flow" });
    openAndSettle(ui);
    const win = ui.chat();
    // Inline-Fläche steht noch dort, wo sie am Ende des Aufklappens stand
    // (nur höher); die Box liegt woanders -> Ziel relativ zur Box
    rootRect = { left: 0, top: 0, width: 760, height: 520 };
    panelRect = { left: 30, top: 90, width: 640, height: 520 };
    act(() => chatWindowProps.current.closeChat());
    expect(v(win, "mw")).toBe("600px");
    expect(v(win, "mh")).toBe("56px");
    expect(v(win, "mt")).toBe("translate(70px, -40px)");
    expect(ui.box().style.width).toBe("640px");
  });

  it("Fenstergröße geändert (1024 -> 900, weiter Desktop): Ziel = Leiste in der Inline-Fläche, Breite 100 % der mitlaufenden Box (AK-10)", () => {
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    const win = ui.chat();
    resizeTo(900);
    expect(visible(ui)).toBe(true);
    barRect = { left: 100, top: 50, width: 500, height: 60 };
    act(() => chatWindowProps.current.closeChat());
    expect(win.classList.contains("allm-morph-close")).toBe(true);
    expect(v(win, "mw")).toBe("100%");
    expect(v(win, "mh")).toBe("60px");
    expect(v(win, "mr")).toBe("30px");
    // Lage der Leiste in der Inline-Fläche vom Aufklappen (BAR - Fläche)
    expect(v(win, "mt")).toBe("translate(100px, 50px)");
    // nicht festgehalten
    expect(ui.box().style.width).toBe("");
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    transitionEnd(win);
    expect(visible(ui)).toBe(false);
  });

  // Review-Befund 1: Scroll-Container/Layoutverschiebung zwischen Aufklappen
  // und Zuklappen (window.scroll unverändert) -> gespeicherte Seiten-
  // koordinaten veraltet -> frisch messen (Signal kurz weg, Layout lesen)
  it("::close-after-shift — Inline-Fläche um 300 px verschoben (ohne window.scroll): Ziel frisch gemessen, relativ zur Box", () => {
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    const win = ui.chat();
    expect(window.scrollY).toBe(0);
    rootRect = { left: 0, top: 300, width: 760, height: 68 };
    barRect = { left: 100, top: 350, width: 600, height: 56 };
    panelRect = { left: 20, top: 350, width: 760, height: 520 };
    barSignals = [];
    act(() => chatWindowProps.current.closeChat());
    expect(win.classList.contains("allm-morph-close")).toBe(true);
    // Leiste (100, 350) relativ zur Box (20, 350) — nicht die veraltete
    // Seitenlage vom Aufklappen (das wäre translate(80px, -300px))
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    expect(v(win, "mw")).toBe("600px");
    expect(v(win, "mh")).toBe("56px");
    // gemessen im eingeklappten Stand (Signal weg), danach Signal weg
    expect(barSignals).toEqual([null]);
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    // frisch gemessen -> Box nicht festgehalten
    expect(ui.box().style.width).toBe("");
    transitionEnd(win);
    expect(visible(ui)).toBe(false);
  });

  it("::close-after-shift (flow) — Fläche verschoben: Ziel = Lage der Fläche, frisch gemessen", () => {
    const ui = setup({ inlineLayout: "flow" });
    openAndSettle(ui);
    const win = ui.chat();
    rootRect = { left: 0, top: 300, width: 760, height: 520 };
    panelRect = { left: 0, top: 300, width: 760, height: 520 };
    act(() => chatWindowProps.current.closeChat());
    expect(v(win, "mw")).toBe("760px");
    expect(v(win, "mh")).toBe("56px");
    expect(v(win, "mt")).toBe("translate(0px, 0px)");
    expect(ui.box().style.width).toBe("");
  });

  it("Fläche nur um < 1 px verschoben (Subpixel): gespeicherte Leistenform bleibt", () => {
    const ui = setup({ inlineLayout: "overlay" });
    openAndSettle(ui);
    const win = ui.chat();
    rootRect = { left: 0.6, top: 0.4, width: 760, height: 68 };
    barSignals = [];
    act(() => chatWindowProps.current.closeChat());
    expect(barSignals).toEqual([]);
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    expect(ui.box().style.width).toBe("760px");
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
  let scrollYBefore;
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
    scrollYBefore = Object.getOwnPropertyDescriptor(window, "scrollY");
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
    // jsdom-Eigenschaft zurück (delete allein ließe scrollY undefined für
    // alle folgenden Tests)
    if (scrollYBefore) Object.defineProperty(window, "scrollY", scrollYBefore);
    else delete window.scrollY;
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

  it("Befund 8 / NAK-4: Feld unter dem Viewport, nichts getippt -> am Laufende Fokus ins Chatfeld (preventScroll), nie aufs Auffangfeld, kein Scroll", () => {
    const protoBefore = Element.prototype.scrollIntoView;
    const intoView = vi.fn();
    Element.prototype.scrollIntoView = intoView;
    const focusSpy = vi.spyOn(input, "focus");
    try {
      panelRect = { left: 20, top: 600, width: 760, height: 520 };
      inputRect = { left: 20, top: 1060, width: 760, height: 40 };
      const ui = setup({ inlineLayout: "overlay" });
      ui.open();
      nextFrames();
      // im Lauf: Auffangfeld (unsichtbares Feld bekommt keinen Fokus)
      expect(document.activeElement).toBe(sink());
      expect(focused()).toBe(false);
      transitionEnd(ui.chat());
      // Laufende: Übergabe beendet, Fokus im Chatfeld
      expect(focused()).toBe(true);
      expect(document.activeElement).not.toBe(sink());
      expect(embedderSettings.shadowRoot.activeElement).not.toBe(sink());
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
      expect(intoView).not.toHaveBeenCalled();
      // weitere Frames/Tippen ins Chatfeld: Fokus bleibt dort
      nextFrames();
      type(input, "x");
      expect(input.value).toBe("x");
      expect(focused()).toBe(true);
      expect(sink().value).toBe("");
    } finally {
      Element.prototype.scrollIntoView = protoBefore;
    }
  });

  it("Befund 3: Enter im Auffangfeld mitten im Lauf, Chatfeld bereit aber unter dem Viewport -> Text ins Feld, requestSubmit genau einmal", async () => {
    const form = document.createElement("form");
    embedderSettings.shadowRoot.appendChild(form);
    form.appendChild(input);
    const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => {});
    panelRect = { left: 20, top: 600, width: 760, height: 520 };
    inputRect = { left: 20, top: 1060, width: 760, height: 40 };
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    expect(document.activeElement).toBe(sink());
    type(sink(), "abcdefgh");
    expect(input.value).toBe("");
    const ev = new KeyboardEvent("keydown", {
      key: "Enter",
      keyCode: 13,
      bubbles: true,
      cancelable: true,
    });
    act(() => sink().dispatchEvent(ev));
    expect(ev.defaultPrevented).toBe(true);
    // Lauf läuft noch; Text steht im Chatfeld, Auffangfeld leer
    expect(ui.chat().classList.contains("allm-morph")).toBe(true);
    expect(input.value).toBe("abcdefgh");
    expect(sink().value).toBe("");
    expect(submit).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(submit).toHaveBeenCalledTimes(1);
    // zweites Enter (Auffangfeld leer, Übergabe beendet): nichts
    act(() =>
      sink().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("Befund 6: IME-Komposition über das Laufende -> erst bei compositionend übergeben, genau einmal, Komposition nicht abgebrochen", async () => {
    const protoBefore = Element.prototype.scrollIntoView;
    const intoView = vi.fn();
    Element.prototype.scrollIntoView = intoView;
    try {
      panelRect = { left: 20, top: 600, width: 760, height: 520 };
      inputRect = { left: 20, top: 1060, width: 760, height: 40 };
      const ui = setup({ inlineLayout: "overlay" });
      ui.open();
      nextFrames();
      const s = sink();
      const blur = vi.fn();
      s.addEventListener("blur", blur);
      act(() =>
        s.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" })),
      );
      // Zwischenstand der Komposition (Dead-Key „´“, dann „é“)
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      for (const v of ["´", "é"]) {
        act(() => {
          setter.call(s, v);
          s.dispatchEvent(
            new InputEvent("input", { bubbles: true, isComposing: true, data: v }),
          );
        });
      }
      // Laufende während der Komposition: nichts übergeben, Fokus bleibt
      transitionEnd(ui.chat());
      expect(input.value).toBe("");
      expect(document.activeElement).toBe(s);
      expect(blur).not.toHaveBeenCalled();
      expect(s.value).toBe("é");
      act(() =>
        s.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "é" })),
      );
      // Safari: letztes input NACH compositionend (isComposing false)
      act(() =>
        s.dispatchEvent(new InputEvent("input", { bubbles: true, data: "é" })),
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
      expect(input.value).toBe("é");
      expect(focused()).toBe(true);
      expect(s.value).toBe("");
      expect(intoView).toHaveBeenCalledTimes(1);
      // nicht doppelt
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
      expect(input.value).toBe("é");
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
    // Tastenübergabe: im Lauf overflow: clip (kein Scroll-Container) —
    // nur, dass die Eigenschaft an den Lauf-Klassen steht; ob dabei nichts
    // scrollt, misst inline_input.py (check_type_during_morph) je Frame
    expect(rule(".allm-morph,.allm-morph-from")).toMatch(
      /(^|;)overflow:clip(!important)?(;|$)/,
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

// Issue embed-morph-aufklappen-kante: Leistenform gegen das Panel NACH der
// Seitenreaktion (erster Frame), Box für den Lauf in der Endlage festgehalten
describe("Aufklappen: erster Frame = Leiste, Bahn unabhängig von der Seite", () => {
  // nur den nächsten Frame laufen lassen
  const oneFrame = () =>
    act(() => {
      frames.splice(0).forEach((f) => f.fn());
    });
  // Seite reagiert wie die Demo asynchron (MutationObserver) auf das Signal
  const pageReacts = (after) => {
    const mo = new MutationObserver(() => {
      if (mountTarget.getAttribute("data-allm-expanded") === "true") after();
    });
    mo.observe(mountTarget, {
      attributes: true,
      attributeFilter: ["data-allm-expanded"],
    });
    return mo;
  };
  afterEach(() => {
    delete document.getAnimations;
  });

  it("::morph-open-first-frame — Host verschiebt sich NACH dem Attribut (Microtask): dx = +80 im ersten Frame", async () => {
    // eingeklappt: Fläche 600 px bei 100 (Leiste = Fläche); die Seite
    // verbreitert sie erst im MutationObserver auf 760 px bei 20
    panelRect = { left: 100, top: 50, width: 600, height: 520 };
    const ui = setup({ inlineLayout: "overlay" });
    pageReacts(() => {
      panelRect = PANEL;
    });
    ui.open();
    const win = ui.chat();
    // vorläufig (synchron im Klick, Seite hat noch nicht reagiert): dx = 0
    expect(v(win, "mt")).toBe("translate(0px, 0px)");
    await Promise.resolve(); // Microtask: Seite reagiert
    oneFrame(); // erster Frame, vor dem Malen
    expect(win.classList.contains("allm-morph-from")).toBe(true);
    expect(win.classList.contains("allm-morph")).toBe(false);
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    expect(v(win, "mw")).toBe("600px");
    expect(v(win, "mh")).toBe("56px");
    oneFrame();
    expect(win.classList.contains("allm-morph")).toBe(true);
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    transitionEnd(win);
    expect(win.classList.contains("allm-morph")).toBe(false);
  });

  it("Seiten-Transition läuft: Panel in der ENDlage gemessen (Transition kurz am Ende), Box dort festgehalten, Transition zurückgespult", async () => {
    // Fläche (root) und Panel: Start 600 @ 100, Ende 760 @ 20; die Seite
    // transitioniert max-width am Elternelement des Platzhalters (500 ms)
    const START = { left: 100, top: 50, width: 600, height: 520 };
    const at = (p) => ({
      left: 100 - 80 * p,
      top: 50,
      width: 600 + 160 * p,
      height: 520,
    });
    panelRect = START;
    rootRect = { left: 100, top: 50, width: 600, height: 68 };
    rootOpenRect = { ...START, height: 68 };
    const seeks = [];
    const anim = {
      transitionProperty: "max-width",
      effect: {
        target: null,
        getComputedTiming: () => ({ endTime: 500 }),
      },
      t: 0,
      get currentTime() {
        return this.t;
      },
      set currentTime(t) {
        seeks.push(t);
        this.t = t;
        panelRect = at(Math.min(1, t / 500));
        rootOpenRect = { ...panelRect, height: 68 };
      },
    };
    // unbeteiligte Transition (nicht am Platzhalter/Vorfahren): bleibt
    // stehen — jeder Spul-Versuch wird protokolliert
    const otherSeeks = [];
    const other = {
      transitionProperty: "opacity",
      effect: {
        target: document.createElement("div"),
        getComputedTiming: () => ({ endTime: 600 }),
      },
      get currentTime() {
        return 10;
      },
      set currentTime(t) {
        otherSeeks.push(t);
      },
    };
    let running = false;
    document.getAnimations = () => (running ? [anim, other] : []);
    const ui = setup({ inlineLayout: "overlay" });
    pageReacts(() => {
      running = true;
    });
    anim.effect.target = mountTarget.parentElement; // body enthält den Platzhalter
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    await Promise.resolve();
    oneFrame();
    // Ende gelesen, danach zurück auf 0 (die Seite läuft unverändert weiter)
    expect(seeks).toEqual([500, 0]);
    expect(otherSeeks).toEqual([]);
    // Leiste (100, 50) relativ zum Panel in der Endlage (20, 50)
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    // Inhalt in Endbreite (jsdom: Rahmen 0)
    expect(v(win, "cw")).toBe("760px");
    // Box: feste Endbreite, Versatz = Endlage - aktuelle Lage der Fläche
    expect(box.style.width).toBe("760px");
    expect(box.style.right).toBe("auto");
    expect(box.style.left).toBe("-80px");
    // die Seite bewegt die Fläche weiter: der Pin gleicht je Frame aus
    anim.t = 250;
    panelRect = at(0.5);
    rootOpenRect = { ...panelRect, height: 68 };
    oneFrame(); // Lauf startet + Pin-Schritt
    expect(win.classList.contains("allm-morph")).toBe(true);
    expect(box.style.left).toBe("-40px");
    expect(box.style.width).toBe("760px");
    anim.t = 500;
    panelRect = at(1);
    rootOpenRect = { ...panelRect, height: 68 };
    oneFrame();
    expect(box.style.left).toBe("0px");
    // Ende des Laufs: Pin gelöst, Stil wie vorher (left 0, right 0, keine Breite)
    transitionEnd(win);
    expect(win.classList.contains("allm-morph")).toBe(false);
    expect(box.style.width).toBe("");
    expect(box.style.left).toBe("0px");
    expect(box.style.right).toBe("0px");
    const n = frames.length;
    oneFrame();
    expect(box.style.width).toBe(""); // kein Pin-Schritt mehr
    expect(frames.length).toBeLessThanOrEqual(n);
  });

  it("ohne getAnimations (ältere Browser): Startform nachgemessen, Box nicht festgehalten", async () => {
    panelRect = { left: 100, top: 50, width: 600, height: 520 };
    const ui = setup({ inlineLayout: "overlay" });
    pageReacts(() => {
      panelRect = PANEL;
    });
    ui.open();
    await Promise.resolve();
    oneFrame();
    expect(v(ui.chat(), "mt")).toBe("translate(80px, 0px)");
    expect(ui.box().style.width).toBe("");
  });

  it("Seite ohne Reaktion: Startform und Box unverändert (dx wie bisher, Pin ohne Versatz)", () => {
    document.getAnimations = () => [];
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    oneFrame();
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    expect(ui.box().style.left).toBe("0px");
    expect(ui.box().style.width).toBe("760px");
    nextFrames();
    transitionEnd(win);
    expect(ui.box().style.width).toBe("");
  });

  it("NAK-2: Zuklappen nach dem ersten Frame, vor dem Lauf: sofort zu, Pin gelöst", () => {
    document.getAnimations = () => [];
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    oneFrame();
    expect(ui.box().style.width).toBe("760px");
    escapeOnPage();
    expect(visible(ui)).toBe(false);
    expect(ui.box().style.width).toBe("");
    nextFrames();
    expect(ui.chat().classList.contains("allm-morph")).toBe(false);
  });

  it("Zuklappen mitten im Aufklappen: Rückweg-Pin übernimmt die Box an ihrer festgehaltenen Lage", () => {
    document.getAnimations = () => [];
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    nextFrames();
    const win = ui.chat();
    expect(win.classList.contains("allm-morph")).toBe(true);
    act(() => chatWindowProps.current.closeChat());
    expect(win.classList.contains("allm-morph-close")).toBe(true);
    // Rückweg hält die Box (Breite des Panels) und zielt auf die Leiste
    expect(ui.box().style.width).toBe("760px");
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    transitionEnd(win);
    expect(visible(ui)).toBe(false);
    expect(ui.box().style.width).toBe("");
  });

  it("Zuklappen mitten im Aufklappen bei Seiten-Transition: Box bleibt in der Endlage des Aufklappens, Leistenform unverändert", async () => {
    const at = (p) => ({
      left: 100 - 80 * p,
      top: 50,
      width: 600 + 160 * p,
      height: 520,
    });
    panelRect = at(0);
    rootOpenRect = { ...at(0), height: 68 };
    const anim = {
      transitionProperty: "max-width",
      effect: { target: null, getComputedTiming: () => ({ endTime: 500 }) },
      t: 0,
      get currentTime() {
        return this.t;
      },
      set currentTime(t) {
        this.t = t;
        panelRect = at(Math.min(1, t / 500));
        rootOpenRect = { ...panelRect, height: 68 };
      },
    };
    let running = false;
    document.getAnimations = () => (running ? [anim] : []);
    const ui = setup({ inlineLayout: "overlay" });
    anim.effect.target = mountTarget.parentElement;
    pageReacts(() => {
      running = true;
    });
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    await Promise.resolve();
    oneFrame();
    anim.t = 100;
    panelRect = at(0.25);
    rootOpenRect = { ...panelRect, height: 68 };
    oneFrame(); // Lauf + Pin-Schritt
    expect(box.style.left).toBe("-60px");
    // Schließen: die Seite baut zurück (hier: Fläche steht noch bei 0,25)
    running = false;
    act(() => chatWindowProps.current.closeChat());
    expect(win.classList.contains("allm-morph-close")).toBe(true);
    // gleiche Endlage wie beim Aufklappen (20, Breite 760), nicht die aktuelle Lage
    expect(box.style.width).toBe("760px");
    expect(box.style.left).toBe("-60px");
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    expect(v(win, "mw")).toBe("600px");
    // Seite läuft zurück: Pin gleicht weiter gegen dieselbe Endlage aus
    panelRect = at(0.1);
    rootOpenRect = { ...panelRect, height: 68 };
    oneFrame();
    expect(box.style.left).toBe("-72px");
    transitionEnd(win);
    expect(visible(ui)).toBe(false);
    expect(box.style.width).toBe("");
  });

  // NAK-3 (Gate): bei reduzierter Bewegung greift der Morph gar nicht —
  // Box und Fenster tragen dieselben Inline-Stile (und die Box dieselben
  // Klassen) wie ohne Morph, vor und nach den Frames; kein Pin, kein
  // Nachmessen. Das Verhalten im Browser belegt overlay.py
  // (check_morph_reduced_mobile: Endzustand sofort, keine Morph-Klassen;
  // Pixel-Referenzen des Bestands innerhalb 0,1 %).
  it("prefers-reduced-motion: Box und Fenster wie ohne Morph (Inline-Stile), kein Pin, kein Nachmessen", () => {
    reduced = true;
    document.getAnimations = vi.fn(() => []);
    const snap = (ui) => ({
      box: ui.box().getAttribute("style"),
      boxClass: ui.box().className,
      win: ui.chat().getAttribute("style"),
      mt: v(ui.chat(), "mt"),
    });
    const states = (extra) => {
      const ui = setup({ inlineLayout: "overlay", ...extra });
      ui.open();
      const atClick = snap(ui);
      nextFrames();
      const later = snap(ui);
      act(() => root.unmount());
      root = createRoot(container);
      mountTarget.remove();
      return [atClick, later];
    };
    const morph = states({});
    const plain = states({ inlineEffect: "expand" });
    expect(morph).toEqual(plain);
    expect(morph[1].mt).toBe("");
    expect(document.getAnimations).not.toHaveBeenCalled();
  });
});

// Review-Fixrunde: Seite reagiert verzögert (MutationObserver-Callback per
// rAF/setTimeout), startet ihre Transition erst später oder das Fenster
// ändert sich — Endlage je Frame nachgeführt (followPage), kein Endsprung.
// Fensterkanten im jsdom-Modell: Box bei Fläche + left, Fenster =
// Box + translate(dx)·(1 − e), Breite = mw·(1 − e) + Box·e (CSS-Transitionen
// von --allmi-mt/--allmi-mw zum Panel, e = Fortschritt mit Kurve).
describe("Aufklappen: verzögerte Seitenreaktion und Fensteränderung nachgeführt", () => {
  const oneFrame = () =>
    act(() => {
      frames.splice(0).forEach((f) => f.fn());
    });
  const pageReacts = (after) => {
    const mo = new MutationObserver(() => {
      if (mountTarget.getAttribute("data-allm-expanded") === "true") after();
    });
    mo.observe(mountTarget, {
      attributes: true,
      attributeFilter: ["data-allm-expanded"],
    });
    return mo;
  };
  // Form-Transition des Fensters (Fortschritt e mit Kurve)
  const winAnim = (win) => {
    const a = {
      transitionProperty: "width",
      playState: "running",
      progress: 0,
      effect: {
        getComputedTiming: () => ({ progress: a.progress }),
        getTiming: () => ({ easing: "cubic-bezier(0.16, 1, 0.3, 1)" }),
      },
    };
    win.getAnimations = () => [a];
    return a;
  };
  const START = { left: 100, top: 50, width: 600, height: 520 };
  const setRects = (r) => {
    panelRect = r;
    rootOpenRect = { ...r, height: 68 };
  };
  const edges = (ui, e) => {
    const box = ui.box();
    const win = ui.chat();
    const dx = parseFloat(/translate\(([-\d.]+)px/.exec(v(win, "mt"))[1]);
    const L = rootOpenRect.left + parseFloat(box.style.left) + dx * (1 - e);
    const W =
      parseFloat(v(win, "mw")) * (1 - e) + parseFloat(box.style.width) * e;
    return { L, R: L + W };
  };
  const expectMonotonic = (seq) => {
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i].L).toBeLessThanOrEqual(seq[i - 1].L + 1e-9);
      expect(seq[i].R).toBeGreaterThanOrEqual(seq[i - 1].R - 1e-9);
    }
  };
  afterEach(() => {
    delete document.getAnimations;
  });

  it("Seite reagiert erst nach dem Laufstart (setTimeout): Ziel gleitet über den Rest der Kurve, Kanten monoton, Ende ohne Sprung", () => {
    document.getAnimations = () => [];
    setRects(START);
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    const a = winAnim(win);
    oneFrame(); // Pin: Seite hat noch nicht reagiert
    expect(v(win, "mt")).toBe("translate(0px, 0px)");
    expect(box.style.width).toBe("600px");
    oneFrame(); // Lauf startet
    expect(win.classList.contains("allm-morph")).toBe(true);
    a.progress = 0.1;
    oneFrame();
    const seq = [edges(ui, 0.1)];
    // jetzt reagiert die Seite: Fläche 760 @ 20
    setRects(PANEL);
    for (const e of [0.2, 0.45, 0.7, 0.9, 0.97, 1]) {
      a.progress = e;
      oneFrame();
      seq.push(edges(ui, e));
    }
    // im Frame der Reaktion kein Sprung: alte Bahn bei e = 0,2
    expect(seq[1].L).toBeCloseTo(100, 6);
    expect(seq[1].R).toBeCloseTo(700, 6);
    expectMonotonic(seq);
    expect(seq.at(-1).L).toBeCloseTo(20, 6);
    expect(seq.at(-1).R).toBeCloseTo(780, 6);
    expect(box.style.left).toBe("0px");
    expect(box.style.width).toBe("760px");
    // Inhalt in der neuen Endbreite
    expect(v(win, "cw")).toBe("760px");
    a.playState = "finished";
    transitionEnd(win);
    expect(win.classList.contains("allm-morph")).toBe(false);
    expect(box.style.width).toBe("");
    expect(box.style.left).toBe("0px");
  });

  it("Seite reagiert per rAF (nach dem Pin, vor dem Lauf): Startform gegen die neue Endlage, Stil vor dem Laufstart übernommen", () => {
    document.getAnimations = () => [];
    setRects(START);
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    winAnim(win);
    const impl = window.getComputedStyle.getMockImplementation();
    const flushes = [];
    window.getComputedStyle.mockImplementation((el) => {
      if (el === win)
        flushes.push([v(win, "mt"), win.classList.contains("allm-morph")]);
      return impl(el);
    });
    oneFrame();
    expect(v(win, "mt")).toBe("translate(0px, 0px)");
    setRects(PANEL); // rAF-Callback der Seite nach unserem
    oneFrame();
    expect(win.classList.contains("allm-morph")).toBe(true);
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    expect(v(win, "cw")).toBe("760px");
    expect(box.style.left).toBe("0px");
    expect(box.style.width).toBe("760px");
    // neue Startform per Stil-Abfrage übernommen, BEVOR der Lauf startet
    expect(flushes[0]).toEqual(["translate(80px, 0px)", false]);
  });

  it("Seiten-Transition startet erst verzögert: ihr Ende einmal gelesen (zurückgespult), danach nur noch ausgeglichen", () => {
    const at = (p) => ({
      left: 100 - 80 * p,
      top: 50,
      width: 600 + 160 * p,
      height: 520,
    });
    const seeks = [];
    const anim = {
      transitionProperty: "max-width",
      effect: { target: null, getComputedTiming: () => ({ endTime: 500 }) },
      t: 0,
      get currentTime() {
        return this.t;
      },
      set currentTime(t) {
        seeks.push(t);
        this.t = t;
        setRects(at(Math.min(1, t / 500)));
      },
    };
    let running = false;
    document.getAnimations = () => (running ? [anim] : []);
    setRects(START);
    const ui = setup({ inlineLayout: "overlay" });
    anim.effect.target = mountTarget.parentElement;
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    const a = winAnim(win);
    oneFrame();
    oneFrame(); // Lauf startet, Seite noch ohne Reaktion
    expect(seeks).toEqual([]);
    // Seite startet ihre Transition (setTimeout im MutationObserver)
    running = true;
    anim.t = 20;
    setRects(at(0.04));
    a.progress = 0.15;
    oneFrame();
    expect(seeks).toEqual([500, 20]);
    const seq = [edges(ui, 0.15)];
    for (const [t, e] of [
      [120, 0.4],
      [250, 0.6],
      [400, 0.85],
      [500, 1],
    ]) {
      anim.t = t;
      setRects(at(t / 500));
      if (t === 500) running = false;
      a.progress = e;
      oneFrame();
      seq.push(edges(ui, e));
    }
    expect(seeks).toEqual([500, 20]); // bekannt: nicht erneut gespult
    expectMonotonic(seq);
    expect(seq.at(-1).L).toBeCloseTo(20, 6);
    expect(seq.at(-1).R).toBeCloseTo(780, 6);
    expect(box.style.width).toBe("760px");
  });

  it("Reaktion im letzten Rest der Kurve: Nachlauf 120 ms mit derselben Kurve, finish wartet ihn ab (kein Endsprung)", async () => {
    document.getAnimations = () => [];
    setRects(START);
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    const a = winAnim(win);
    const inline = container.querySelector("#anything-llm-embed-inline");
    let finishTail;
    const tail = {
      playState: "running",
      p: 0,
      effect: { getComputedTiming: () => ({ progress: tail.p }) },
      finished: new Promise((res) => (finishTail = res)),
      cancel: vi.fn(),
    };
    inline.animate = vi.fn(() => tail);
    oneFrame();
    oneFrame();
    a.progress = 0.99;
    setRects(PANEL);
    oneFrame();
    expect(inline.animate).toHaveBeenCalledWith(null, {
      duration: 120,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
    const seq = [edges(ui, 0.99)];
    expect(seq[0].L).toBeCloseTo(100, 6); // noch die alte Bahn
    a.progress = 1;
    a.playState = "finished";
    for (const p of [0.3, 0.7]) {
      tail.p = p;
      oneFrame();
      seq.push(edges(ui, 1));
    }
    // Fenster-Transition zu Ende, Nachlauf läuft noch: finish wartet
    transitionEnd(win);
    expect(win.classList.contains("allm-morph")).toBe(true);
    tail.p = 1;
    oneFrame();
    seq.push(edges(ui, 1));
    expectMonotonic(seq);
    expect(seq.at(-1)).toEqual({ L: 20, R: 780 });
    tail.playState = "finished";
    await act(async () => {
      finishTail();
      await Promise.resolve();
    });
    expect(win.classList.contains("allm-morph")).toBe(false);
    expect(box.style.width).toBe("");
  });

  it("Fenster-Resize im Lauf: bekannte Seiten-Transition neu gelesen, Ziel gleitet zur neuen Endlage", () => {
    // Endbreite hängt am Fenster: 760 ab 1000 px, sonst 680 (zentriert)
    const endW = () => (window.innerWidth >= 1000 ? 760 : 680);
    const at = (p) => {
      const w = 600 + (endW() - 600) * p;
      return { left: 400 - w / 2, top: 50, width: w, height: 520 };
    };
    const seeks = [];
    const anim = {
      transitionProperty: "max-width",
      effect: { target: null, getComputedTiming: () => ({ endTime: 500 }) },
      t: 0,
      get currentTime() {
        return this.t;
      },
      set currentTime(t) {
        seeks.push(t);
        this.t = t;
        setRects(at(Math.min(1, t / 500)));
      },
    };
    let running = false;
    document.getAnimations = () => (running ? [anim] : []);
    setRects(at(0));
    const ui = setup({ inlineLayout: "overlay" });
    anim.effect.target = mountTarget.parentElement;
    pageReacts(() => {
      running = true;
    });
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    const a = winAnim(win);
    return Promise.resolve().then(() => {
      oneFrame(); // Endlage 760 @ 20 gelesen
      expect(seeks).toEqual([500, 0]);
      expect(box.style.width).toBe("760px");
      oneFrame();
      anim.t = 100;
      setRects(at(0.2));
      a.progress = 0.3;
      oneFrame();
      expect(seeks).toEqual([500, 0]);
      const seq = [edges(ui, 0.3)];
      resizeTo(900); // bleibt Desktop
      anim.t = 150;
      setRects(at(0.3));
      a.progress = 0.45;
      oneFrame();
      expect(seeks).toEqual([500, 0, 500, 150]); // neu gelesen
      seq.push(edges(ui, 0.45));
      for (const [t, e] of [
        [300, 0.75],
        [500, 1],
      ]) {
        anim.t = t;
        setRects(at(t / 500));
        if (t === 500) running = false;
        a.progress = e;
        oneFrame();
        seq.push(edges(ui, e));
      }
      // kein Sprung im Resize-Frame (< 15 px bei Δe = 0,15), Ende = neue Endlage
      expect(Math.abs(seq[1].L - seq[0].L)).toBeLessThan(15);
      expect(Math.abs(seq[1].R - seq[0].R)).toBeLessThan(15);
      expect(seq.at(-1).L).toBeCloseTo(60, 6);
      expect(seq.at(-1).R).toBeCloseTo(740, 6);
      expect(box.style.width).toBe("680px");
    });
  });

  it("Fenster-Resize ohne Seiten-Transition: Fläche verschoben -> nachgeführt (innerWidth-Vergleich je Frame)", () => {
    document.getAnimations = () => [];
    setRects(PANEL);
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    const a = winAnim(win);
    oneFrame();
    oneFrame();
    a.progress = 0.5;
    oneFrame();
    expect(box.style.left).toBe("0px");
    resizeTo(900);
    setRects({ ...PANEL, left: -30 });
    a.progress = 0.6;
    oneFrame();
    const e1 = edges(ui, 0.6);
    // alte Bahn bei e = 0,6: Leiste 100 -> 20
    expect(e1.L).toBeCloseTo(100 * 0.4 + 20 * 0.6, 6);
    a.progress = 1;
    oneFrame();
    expect(edges(ui, 1).L).toBeCloseTo(-30, 6);
    expect(box.style.left).toBe("0px");
  });

  it("ResizeObserver: Seite ändert die Fläche nach dem Pin-Schritt im selben Frame -> vor dem Malen korrigiert", () => {
    const observers = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb) {
          this.cb = cb;
          this.els = [];
          observers.push(this);
        }
        observe(el) {
          this.els.push(el);
        }
        disconnect() {
          this.els = [];
        }
      },
    );
    document.getAnimations = () => [];
    setRects(START);
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    const a = winAnim(win);
    const before = observers.length; // eigener RO der Komponente (Breite)
    oneFrame();
    const inline = container.querySelector("#anything-llm-embed-inline");
    const ro = observers.slice(before).find((o) => o.els.includes(inline));
    expect(ro).toBeTruthy();
    // rAF-Callback der Seite nach dem Pin-Schritt: Fläche 760 @ 20
    setRects(PANEL);
    act(() => ro.cb([]));
    expect(v(win, "mt")).toBe("translate(80px, 0px)");
    expect(box.style.left).toBe("0px");
    expect(box.style.width).toBe("760px");
    oneFrame();
    expect(win.classList.contains("allm-morph")).toBe(true);
    a.playState = "finished";
    transitionEnd(win);
    expect(ro.els).toEqual([]); // gelöst
  });

  it("Zuklappen mitten im nachgeführten Aufklappen: Box mit dem Fortschritt des Rückwegs zurück zum Bezug, Leistenform unverändert", () => {
    document.getAnimations = () => [];
    setRects(START);
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    const box = ui.box();
    const a = winAnim(win);
    oneFrame();
    oneFrame();
    a.progress = 0.2;
    setRects(PANEL);
    oneFrame();
    a.progress = 0.6;
    oneFrame();
    // Box nachgeführt: x = 100 + (60 − 100)·0,6 = 76
    expect(box.style.left).toBe("56px");
    const width = box.style.width;
    // Schließen: die Seite baut (verzögert) noch nicht zurück
    a.progress = 0;
    act(() => chatWindowProps.current.closeChat());
    expect(win.classList.contains("allm-morph-close")).toBe(true);
    expect(v(win, "mt")).toBe("translate(0px, 0px)");
    expect(box.style.left).toBe("56px");
    expect(box.style.width).toBe(width);
    a.progress = 0.5;
    oneFrame();
    expect(box.style.left).toBe("68px"); // 76 + (100 − 76)·0,5 − 20
    a.progress = 1;
    oneFrame();
    expect(box.style.left).toBe("80px"); // Bezug 100 = Leiste
    a.playState = "finished";
    transitionEnd(win);
    expect(visible(ui)).toBe(false);
    expect(box.style.width).toBe("");
  });
});

describe("readAtPageTransitionEnd: Negativfälle", () => {
  const oneFrame = () =>
    act(() => {
      frames.splice(0).forEach((f) => f.fn());
    });
  afterEach(() => {
    delete document.getAnimations;
  });

  it("Animation ohne transitionProperty am Vorfahren (CSS-Animation/Web-Animation) wird nicht gespult", () => {
    const seeks = [];
    const anim = {
      effect: { target: null, getComputedTiming: () => ({ endTime: 500 }) },
      get currentTime() {
        return 0;
      },
      set currentTime(t) {
        seeks.push(t);
      },
    };
    document.getAnimations = () => [anim];
    const ui = setup({ inlineLayout: "overlay" });
    anim.effect.target = mountTarget.parentElement;
    ui.open();
    oneFrame();
    oneFrame();
    expect(seeks).toEqual([]);
    expect(ui.box().style.width).toBe("760px"); // Pin wie ohne Seiten-Transition
  });

  it("read() wirft: trotzdem zurückgespult, kein Pin, Startform aus der Messung danach", () => {
    const seeks = [];
    const anim = {
      transitionProperty: "max-width",
      effect: { target: null, getComputedTiming: () => ({ endTime: 500 }) },
      t: 0,
      get currentTime() {
        return this.t;
      },
      set currentTime(t) {
        seeks.push(t);
        this.t = t;
      },
    };
    document.getAnimations = () => [anim];
    const gbcr =
      Element.prototype.getBoundingClientRect.getMockImplementation();
    Element.prototype.getBoundingClientRect.mockImplementation(function () {
      if (anim.t === 500)
        throw new Error("Layout im Endzustand fehlgeschlagen");
      return gbcr.call(this);
    });
    const ui = setup({ inlineLayout: "overlay" });
    anim.effect.target = mountTarget.parentElement;
    ui.open();
    oneFrame();
    expect(seeks).toEqual([500, 0]);
    expect(anim.t).toBe(0);
    // pin liefert null: Box nicht festgehalten
    expect(ui.box().style.width).toBe("");
    expect(ui.box().style.right).toBe("0px");
    expect(v(ui.chat(), "mt")).toBe("translate(80px, 0px)");
    oneFrame();
    expect(ui.chat().classList.contains("allm-morph")).toBe(true);
    transitionEnd(ui.chat());
    expect(ui.chat().classList.contains("allm-morph")).toBe(false);
  });
});

describe("Inhaltsbreite im ersten Frame (Rahmen des Fensters)", () => {
  const oneFrame = () =>
    act(() => {
      frames.splice(0).forEach((f) => f.fn());
    });
  afterEach(() => {
    delete document.getAnimations;
  });
  const frame2px = () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function () {
        return this.id === "anything-llm-chat" ? 762 : 0;
      },
    );
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(
      function () {
        return this.id === "anything-llm-chat" ? 760 : 0;
      },
    );
  };

  it("cw = Endbreite − Rahmen (762/760 -> 758 px), auch nach Nachmessen im ersten Frame", async () => {
    frame2px();
    document.getAnimations = () => [];
    panelRect = { left: 100, top: 50, width: 600, height: 520 };
    const ui = setup({ inlineLayout: "overlay" });
    const mo = new MutationObserver(() => {
      panelRect = PANEL;
    });
    mo.observe(mountTarget, { attributes: true });
    ui.open();
    const win = ui.chat();
    // vorläufig (vor der Seitenreaktion): Inhaltsbreite = clientWidth
    expect(v(win, "cw")).toBe("760px");
    await Promise.resolve();
    oneFrame();
    expect(v(win, "cw")).toBe("758px");
    mo.disconnect();
  });

  it("nachgeführte Endbreite: cw = neue Endbreite − Rahmen", () => {
    frame2px();
    document.getAnimations = () => [];
    panelRect = { left: 100, top: 50, width: 600, height: 520 };
    rootOpenRect = { left: 100, top: 50, width: 600, height: 68 };
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const win = ui.chat();
    const a = {
      transitionProperty: "width",
      playState: "running",
      effect: {
        getComputedTiming: () => ({ progress: 0.3 }),
        getTiming: () => ({ easing: "ease" }),
      },
    };
    win.getAnimations = () => [a];
    oneFrame();
    expect(v(win, "cw")).toBe("598px");
    oneFrame();
    panelRect = PANEL;
    rootOpenRect = { ...PANEL, height: 68 };
    oneFrame();
    expect(v(win, "cw")).toBe("758px");
  });
});
