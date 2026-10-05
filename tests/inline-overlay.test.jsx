import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Inline-Box schwebend (inlineLayout "overlay") und Aufklapp-Effekt
// (inlineEffect): Validierung, Vorrang visual_config, Klassenwahl, Rendern
// der schwebenden Box, Außenklick/Escape, Signal am Platzhalter,
// Überlauf-Fallback. Layout-Messungen im Browser: tests/visual/overlay.py.

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
  parseAndValidateEmbedSettings,
} from "../src/hooks/useScriptAttributes.js";
import {
  INLINE_EFFECT_VALUES,
  findClippingAncestor,
  inlineBoxHeightPx,
  inlineBoxStyle,
  inlineEffectClass,
  isInlineOverlay,
  resolveInlineEffect,
  resolveInlineHeight,
} from "../src/utils/layout.js";
import { buildThemeCss } from "../src/utils/theme.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};

function fetchConfig(config) {
  return vi.fn(async () => ({ ok: true, json: async () => config }));
}

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Settings inlineLayout / inlineEffect", () => {
  it("Standard: flow ohne Effekt (null = keine Animation, wie main)", async () => {
    const s = await loadEmbedSettings({ ...BASE }, fetchConfig({}));
    expect(s.inlineLayout).toBe("flow");
    expect(s.inlineEffect).toBeNull();
    expect(resolveInlineEffect(s)).toBeNull();
    expect(DEFAULT_SETTINGS.inlineLayout).toBe("flow");
    expect(DEFAULT_SETTINGS.inlineEffect).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("overlay ohne Effekt-Angabe -> expand", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineLayout: "overlay" },
      fetchConfig({}),
    );
    expect(s.inlineEffect).toBeNull();
    expect(resolveInlineEffect(s)).toBe("expand");
  });

  it("Script-Attribute data-inline-layout / data-inline-effect (Groß-/Kleinschreibung egal)", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineLayout: "Overlay", inlineEffect: " FLOAT " },
      fetchConfig({}),
    );
    expect(s.inlineLayout).toBe("overlay");
    expect(s.inlineEffect).toBe("float");
    expect(warn).not.toHaveBeenCalled();
  });

  it("AK-8: visual_config.inlineLayout = overlay ohne Script-Attribut", async () => {
    const fetchFn = fetchConfig({
      inlineLayout: "overlay",
      inlineEffect: "spring",
    });
    const s = await loadEmbedSettings({ ...BASE }, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith(
      `${BASE.baseApiUrl}/${BASE.embedId}/config`,
    );
    expect(s.inlineLayout).toBe("overlay");
    expect(s.inlineEffect).toBe("spring");
    expect(isInlineOverlay(s)).toBe(true);
  });

  it("visual_config schlägt Script-Attribut, leerer Server-Wert nicht", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineLayout: "overlay", inlineEffect: "grow" },
      fetchConfig({ inlineLayout: "flow", inlineEffect: "" }),
    );
    expect(s.inlineLayout).toBe("flow");
    expect(s.inlineEffect).toBe("grow");
  });

  it('NAK-3: data-inline-effect="wobble" -> Standard + genau eine Warnung mit dem wirksamen Wert', async () => {
    let s = await loadEmbedSettings(
      { ...BASE, inlineEffect: "wobble" },
      fetchConfig({}),
    );
    expect(s.inlineEffect).toBeNull();
    expect(resolveInlineEffect(s)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(
      /inlineEffect-Wert "wobble" \(Script-Attribut\).*es gilt keine Animation \(Standard\)/,
    );
    warn.mockClear();
    s = await loadEmbedSettings(
      { ...BASE, inlineLayout: "overlay", inlineEffect: "wobble" },
      fetchConfig({}),
    );
    expect(resolveInlineEffect(s)).toBe("expand");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/"wobble".*es gilt "expand"/);
  });

  it("verworfener Server-Wert: Warnung nennt den gültigen Script-Wert", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineLayout: "overlay", inlineEffect: "grow" },
      fetchConfig({ inlineLayout: "popup", inlineEffect: "wobble" }),
    );
    expect(s.inlineLayout).toBe("overlay");
    expect(s.inlineEffect).toBe("grow");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatch(
      /inlineLayout-Wert "popup" \(Design Center\).*Wert wird verworfen, es gilt "overlay" \(Script-Attribut\)/,
    );
    expect(warn.mock.calls[1][0]).toMatch(
      /inlineEffect-Wert "wobble" \(Design Center\).*es gilt "grow" \(Script-Attribut\)/,
    );
  });

  it("ungültiges inlineLayout -> flow + eine Warnung; ungültiger Server-Wert -> Script-Wert", async () => {
    let s = await loadEmbedSettings(
      { ...BASE, inlineLayout: "popup" },
      fetchConfig({}),
    );
    expect(s.inlineLayout).toBe("flow");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(
      /inlineLayout-Wert "popup".*es gilt "flow" \(Standard\)/,
    );
    warn.mockClear();
    s = await loadEmbedSettings(
      { ...BASE, inlineLayout: "overlay" },
      fetchConfig({ inlineLayout: 7 }),
    );
    expect(s.inlineLayout).toBe("overlay");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(
      /inlineLayout-Wert 7 \(Design Center\).*es gilt "overlay" \(Script-Attribut\)/,
    );
  });

  it("Validierung lässt nur die Enums durch (kein CSS-Text)", () => {
    const v = parseAndValidateEmbedSettings({
      inlineLayout: "overlay;position:fixed",
      inlineEffect: "float}",
    });
    expect(v.inlineLayout).toBeUndefined();
    expect(v.inlineEffect).toBeUndefined();
  });
});

describe("AK-4: Klassenwahl des Effekts", () => {
  it("ausdrücklich gesetzt: genau seine Klasse (flow und overlay)", () => {
    for (const e of INLINE_EFFECT_VALUES)
      for (const inlineLayout of ["flow", "overlay"])
        expect(inlineEffectClass({ inlineEffect: e, inlineLayout })).toBe(
          `allm-effect allm-effect-${e}`,
        );
  });

  it("ohne/ungültige Angabe: flow -> keine Klasse, overlay -> expand", () => {
    expect(inlineEffectClass({})).toBe("");
    expect(inlineEffectClass({ inlineLayout: "flow" })).toBe("");
    expect(inlineEffectClass({ inlineEffect: "wobble" })).toBe("");
    expect(inlineEffectClass({ inlineLayout: "overlay" })).toBe(
      "allm-effect allm-effect-expand",
    );
    expect(
      inlineEffectClass({ inlineLayout: "overlay", inlineEffect: "wobble" }),
    ).toBe("allm-effect allm-effect-expand");
  });

  it("Variablen: Stapel mit Standard, Dauer/Kurve ohne (Standard je Effekt in main.jsx); reduzierte Bewegung nur per animation: none (main.jsx)", () => {
    const css = buildThemeCss(DEFAULT_SETTINGS, "light");
    expect(css).toContain(
      "--allmi-effect-duration: var(--allm-effect-duration);",
    );
    expect(css).toContain("--allmi-effect-easing: var(--allm-effect-easing);");
    expect(css).toContain("--allmi-overlay-z: var(--allm-overlay-z, 1000);");
    // eine Stelle: die Dauer wird bei reduzierter Bewegung NICHT zusätzlich genullt
    expect(css).not.toMatch(/--allmi-effect-duration: 0ms/);
  });
});

describe("Box-Höhe / Überlauf-Fallback", () => {
  it("resolveInlineHeight: gemeinsame Quelle für Stil und Messung", () => {
    expect(resolveInlineHeight({})).toBe("600px");
    expect(resolveInlineHeight({ inlineHeight: "520" })).toBe("520px");
    expect(resolveInlineHeight({ inlineHeight: "50vh" })).toBe("50vh");
    expect(resolveInlineHeight({ inlineHeight: "50%" })).toBe("600px");
    expect(inlineBoxStyle({ inlineHeight: "520" }).height).toBe(
      "clamp(400px, 520px, 1200px)",
    );
  });

  it("inlineBoxHeightPx wie inlineBoxStyle (clamp 400–1200, max. Viewport - 32)", () => {
    expect(inlineBoxHeightPx({}, 900)).toBe(600);
    expect(inlineBoxHeightPx({ inlineHeight: "520px" }, 900)).toBe(520);
    expect(inlineBoxHeightPx({ inlineHeight: "50vh" }, 1000)).toBe(500);
    expect(inlineBoxHeightPx({ inlineHeight: "100px" }, 900)).toBe(400);
    expect(inlineBoxHeightPx({ inlineHeight: "2000px" }, 2000)).toBe(1200);
    expect(inlineBoxHeightPx({ inlineHeight: "800px" }, 600)).toBe(568);
  });

  function rect(el, bottom) {
    el.getBoundingClientRect = () => ({ top: 0, bottom, left: 0, right: 0 });
  }

  it("findClippingAncestor: overflow hidden zu niedrig -> Element, sonst null", () => {
    const outer = document.createElement("div");
    const mount = document.createElement("div");
    outer.appendChild(mount);
    document.body.appendChild(outer);
    rect(outer, 300);
    rect(mount, 66);
    expect(findClippingAncestor(mount, 700)).toBeNull(); // overflow visible
    outer.style.overflow = "hidden";
    expect(findClippingAncestor(mount, 700)).toBe(outer);
    expect(findClippingAncestor(mount, 250)).toBeNull(); // Box passt hinein
    outer.style.overflow = "";
    outer.style.overflowX = "clip";
    expect(findClippingAncestor(mount, 700)).toBe(outer);
    outer.remove();
  });

  it("body/html zählen nicht (overflow wirkt auf den Viewport)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    document.body.style.overflowX = "hidden";
    rect(document.body, 100);
    expect(findClippingAncestor(mount, 700)).toBeNull();
    document.body.style.overflowX = "";
    delete document.body.getBoundingClientRect;
    mount.remove();
  });
});

describe("InlineChat: schwebende Box", () => {
  let container;
  let root;
  let matchMediaBefore;
  let mountTarget;

  // Desktop (>=768px), feine Maus; setDesktop(false/true) simuliert das
  // Verkleinern/Vergrößern des Fensters über die 768-px-Schwelle.
  let desktop;
  let mqlListeners;
  function setDesktop(value) {
    desktop = value;
    act(() => mqlListeners.forEach((fn) => fn()));
  }
  beforeEach(() => {
    matchMediaBefore = window.matchMedia;
    desktop = true;
    mqlListeners = new Set();
    window.matchMedia = (q) => ({
      get matches() {
        return q === "(min-width: 768px)" ? desktop : false;
      },
      media: q,
      addEventListener(type, fn) {
        if (q === "(min-width: 768px)") mqlListeners.add(fn);
      },
      removeEventListener(type, fn) {
        mqlListeners.delete(fn);
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    chatWindowProps.current = null;
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mountTarget?.remove();
    window.matchMedia = matchMediaBefore;
  });

  function setup(extra = {}) {
    mountTarget = document.createElement("div");
    document.body.appendChild(mountTarget);
    const host = document.createElement("div");
    mountTarget.appendChild(host);
    embedderSettings.hostElement = host;
    const settings = {
      ...DEFAULT_SETTINGS,
      ...BASE,
      displayMode: "inline",
      ...extra,
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

  // Zeiger-Ereignis (jsdom kennt kein PointerEvent): MouseEvent mit
  // pointerType/pointerId/isPrimary.
  function ptr(type, target, opts = {}) {
    const {
      x = 5,
      y = 5,
      button = 0,
      pointerType = "mouse",
      pointerId = 1,
    } = opts;
    const ev = new MouseEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button,
    });
    Object.defineProperties(ev, {
      pointerType: { value: pointerType },
      pointerId: { value: pointerId },
      isPrimary: { value: true },
    });
    act(() => target.dispatchEvent(ev));
    return ev;
  }
  function pointerDown(target, opts) {
    return ptr("pointerdown", target, opts);
  }
  const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));
  // Kompletter Mausklick: pointerdown, pointerup, click (wie im Browser)
  function clickAt(target, opts = {}) {
    const down = ptr("pointerdown", target, opts);
    ptr("pointerup", target, opts);
    const click = new MouseEvent("click", {
      bubbles: true,
      composed: true,
      cancelable: true,
      button: opts.button ?? 0,
    });
    act(() => target.dispatchEvent(click));
    return { down, click };
  }
  const CHAT_BOX_CLASS =
    "allm-relative allm-w-full allm-h-full allm-border allm-border-solid allm-overflow-hidden allm-flex allm-flex-col allm-box-border";

  it("AK-1: Standard flow — Box im Fluss, Leiste weg, KEIN Effekt (wie main)", () => {
    const ui = setup();
    ui.open();
    expect(ui.box().className).toBe("allm-relative allm-w-full");
    expect(ui.box().style.position).toBe("");
    expect(ui.chat().className).toBe(CHAT_BOX_CLASS);
    expect(ui.bar()).toBeNull();
    // Außenklick klappt im Seitenfluss NICHT ein (wie bisher)
    clickAt(document.body);
    expect(ui.chat()).not.toBeNull();
    expect(ui.box().className).toBe("allm-relative allm-w-full");
  });

  it("AK-4: flow mit ausdrücklichem expand -> Effekt-Klasse", () => {
    const ui = setup({ inlineEffect: "expand" });
    ui.open();
    expect(ui.chat().className).toBe(
      `${CHAT_BOX_CLASS} allm-effect allm-effect-expand`,
    );
  });

  it("overlay ohne Effekt-Angabe -> expand", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    expect(ui.chat().className).toContain("allm-effect allm-effect-expand");
  });

  it("overlay: Box absolut über der Inline-Fläche, Leiste unsichtbar im Fluss, z-index über Variable", () => {
    const ui = setup({ inlineLayout: "overlay", inlineEffect: "float" });
    ui.open();
    const box = ui.box();
    expect(box.style.position).toBe("absolute");
    expect(box.style.top).toBe("0px");
    expect(box.style.left).toBe("0px");
    expect(box.style.right).toBe("0px");
    expect(box.style.zIndex).toBe("var(--allmi-overlay-z, 1000)");
    expect(ui.chat().className).toContain("allm-effect-float");
    const hidden = ui.bar().closest("[aria-hidden]");
    expect(hidden.style.visibility).toBe("hidden");
    // Wurzel bleibt positioniert (Bezug der absoluten Box)
    expect(
      container.querySelector("#anything-llm-embed-inline").className,
    ).toContain("allm-relative");
  });

  it("Signal data-allm-expanded am Platzhalter (nur solange aufgeklappt)", () => {
    const ui = setup({ inlineLayout: "overlay" });
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    ui.open();
    expect(mountTarget.getAttribute("data-allm-expanded")).toBe("true");
    act(() => chatWindowProps.current.closeChat());
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
  });

  it("AK-3/NAK-2: Außenklick klappt erst NACH dem click ein, ohne das Ereignis zu blockieren; Fokus auf die Leiste", async () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const link = document.createElement("a");
    link.href = "#ziel";
    let linkSawOpenBox = null;
    link.addEventListener("click", () => {
      // beim click ist die Box noch offen (Seite hat noch nicht umgebaut)
      linkSawOpenBox = mountTarget.hasAttribute("data-allm-expanded");
    });
    document.body.appendChild(link);
    const { down, click } = clickAt(link);
    expect(down.defaultPrevented).toBe(false);
    expect(click.defaultPrevented).toBe(false);
    expect(linkSawOpenBox).toBe(true);
    await wait(5);
    expect(ui.box().className).toBe("allm-hidden");
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    // Verlauf bleibt: ChatWindow weiter gemountet
    expect(ui.chat()).not.toBeNull();
    expect(document.activeElement).toBe(ui.bar());
    link.remove();
  });

  it("pointerdown allein klappt nicht ein (erst pointerup/click)", async () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    pointerDown(document.body);
    await wait(5);
    expect(ui.box().style.position).toBe("absolute");
  });

  it("Rechts- und Mittelklick außerhalb klappen nicht ein", async () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    clickAt(document.body, { button: 2 });
    clickAt(document.body, { button: 1 });
    await wait(5);
    expect(ui.box().style.position).toBe("absolute");
    clickAt(document.body, { button: 0 });
    await wait(5);
    expect(ui.box().className).toBe("allm-hidden");
  });

  it("Touch: Tippen außerhalb schließt auch ohne click (Safari), Wischen nicht", async () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const t = { pointerType: "touch", pointerId: 7 };
    // Wischen: 30 px bewegt
    ptr("pointerdown", document.body, { ...t, x: 100, y: 100 });
    ptr("pointerup", document.body, { ...t, x: 100, y: 130 });
    // abgebrochen (Browser übernimmt das Scrollen)
    ptr("pointerdown", document.body, { ...t, x: 100, y: 100 });
    ptr("pointercancel", document.body, t);
    ptr("pointerup", document.body, { ...t, x: 100, y: 100 });
    await wait(400);
    expect(ui.box().style.position).toBe("absolute");
    // Tippen (≤ 10 px), kein click am document
    ptr("pointerdown", document.body, { ...t, x: 100, y: 100 });
    ptr("pointerup", document.body, { ...t, x: 104, y: 106 });
    await wait(5);
    expect(ui.box().style.position).toBe("absolute"); // wartet auf click
    await wait(400);
    expect(ui.box().className).toBe("allm-hidden");
  });

  it("Touch: kommt der click, wird gleich danach eingeklappt", async () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const t = { pointerType: "touch", pointerId: 3 };
    ptr("pointerdown", document.body, t);
    ptr("pointerup", document.body, t);
    act(() =>
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await wait(5);
    expect(ui.box().className).toBe("allm-hidden");
  });

  it("Klick in das Widget (Host im composedPath) klappt nicht ein", async () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    clickAt(embedderSettings.hostElement);
    await wait(5);
    expect(ui.box().style.position).toBe("absolute");
  });

  it("Escape auf der Seite mit Fokus in einem Seitenfeld: klappt ein, Fokus bleibt im Feld", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(ui.box().className).toBe("allm-hidden");
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it("Effekt nur beim Aufklappen durch den Nutzer, nicht beim Wiedereintritt (Fenster über 768 px)", () => {
    const ui = setup({ inlineLayout: "overlay", inlineEffect: "float" });
    ui.open();
    expect(ui.chat().className).toContain("allm-effect-float");
    setDesktop(false);
    expect(ui.box().className).toBe("allm-hidden");
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    setDesktop(true);
    expect(ui.box().style.position).toBe("absolute");
    expect(ui.chat().className).toBe(CHAT_BOX_CLASS);
    expect(mountTarget.getAttribute("data-allm-expanded")).toBe("true");
    // erneutes Aufklappen durch den Nutzer: wieder mit Effekt
    act(() => chatWindowProps.current.closeChat());
    ui.open();
    expect(ui.chat().className).toContain("allm-effect-float");
  });

  it("Wiedereintritt (Fenster wieder >=768px): Höhe der Leiste und Abschneiden neu gemessen", () => {
    const ui = setup({ inlineLayout: "overlay" });
    const rootEl = container.querySelector("#anything-llm-embed-inline");
    let h = 66;
    rootEl.getBoundingClientRect = () => ({
      top: 0,
      bottom: h,
      height: h,
      left: 0,
      right: 0,
    });
    ui.open();
    const spacer = () => ui.bar().closest("[aria-hidden]");
    expect(spacer().style.height).toBe("66px");
    setDesktop(false); // 700 px: Leiste, Chips brechen um
    h = 110;
    setDesktop(true);
    expect(spacer().style.height).toBe("110px");
    expect(ui.box().style.position).toBe("absolute");
    // inzwischen schneidet ein Vorfahre ab -> beim Wiedereintritt flow
    setDesktop(false);
    const clip = document.createElement("div");
    clip.style.overflow = "hidden";
    clip.getBoundingClientRect = () => ({ top: 0, bottom: 120 });
    document.body.appendChild(clip);
    clip.appendChild(mountTarget);
    setDesktop(true);
    expect(ui.box().className).toBe("allm-relative allm-w-full");
    expect(warn).toHaveBeenCalledTimes(1);
    clip.remove();
  });

  it("Drehen aus dem Vollbild in einen overflow:hidden-Vorfahren -> Flow-Fallback", () => {
    desktop = false;
    const clip = document.createElement("div");
    clip.style.overflow = "hidden";
    clip.getBoundingClientRect = () => ({ top: 0, bottom: 120 });
    document.body.appendChild(clip);
    const ui = setup({ inlineLayout: "overlay", inlineEffect: "float" });
    clip.appendChild(mountTarget);
    ui.open(); // mobil: Vollbild, Host an <body>
    expect(embedderSettings.hostElement.parentNode).toBe(document.body);
    setDesktop(true);
    expect(embedderSettings.hostElement.parentNode).toBe(mountTarget);
    expect(ui.box().className).toBe("allm-relative allm-w-full");
    expect(ui.box().style.position).toBe("");
    expect(ui.chat().className).toBe(CHAT_BOX_CLASS); // kein Effekt
    expect(warn).toHaveBeenCalledTimes(1);
    clip.remove();
  });

  it("Drehen aus dem Vollbild ohne abschneidenden Vorfahren -> schwebt, Leiste natürlich hoch", () => {
    desktop = false;
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    setDesktop(true);
    expect(ui.box().style.position).toBe("absolute");
    expect(ui.bar().closest("[aria-hidden]").style.height).toBe("");
    expect(warn).not.toHaveBeenCalled();
  });

  it("data-allm-expanded wird beim Unmount entfernt", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    expect(mountTarget.getAttribute("data-allm-expanded")).toBe("true");
    act(() => root.unmount());
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    root = createRoot(container); // für afterEach
  });

  it("AK-3: Escape auf der Seite klappt ein, Fokus auf die Leiste", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    act(() =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(ui.box().className).toBe("allm-hidden");
    expect(document.activeElement).toBe(ui.bar());
  });

  it("NAK-1: keine Styles an body/html", () => {
    const before = [
      document.body.getAttribute("style"),
      document.documentElement.getAttribute("style"),
    ];
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    expect([
      document.body.getAttribute("style"),
      document.documentElement.getAttribute("style"),
    ]).toEqual(before);
    expect(mountTarget.getAttribute("style")).toBeNull();
  });

  it("Fallback: Vorfahre mit overflow:hidden schneidet ab -> flow + eine Warnung", () => {
    const clip = document.createElement("div");
    clip.style.overflow = "hidden";
    clip.getBoundingClientRect = () => ({
      top: 0,
      bottom: 120,
      left: 0,
      right: 0,
    });
    document.body.appendChild(clip);
    const ui = setup({ inlineLayout: "overlay" });
    clip.appendChild(mountTarget);
    ui.open();
    expect(ui.box().className).toBe("allm-relative allm-w-full");
    expect(ui.box().style.position).toBe("");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/overlay.*Seitenfluss/);
    // Außenklick wie im Seitenfluss ohne Wirkung
    clickAt(document.body);
    expect(ui.box().className).toBe("allm-relative allm-w-full");
    act(() => chatWindowProps.current.closeChat());
    ui.open();
    expect(warn).toHaveBeenCalledTimes(1); // nur einmal je Seite
    clip.remove();
  });
});
