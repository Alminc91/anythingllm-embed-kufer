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
  inlineEffectClass,
  isInlineOverlay,
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
  it("Standard: flow + expand", async () => {
    const s = await loadEmbedSettings({ ...BASE }, fetchConfig({}));
    expect(s.inlineLayout).toBe("flow");
    expect(s.inlineEffect).toBe("expand");
    expect(DEFAULT_SETTINGS.inlineLayout).toBe("flow");
    expect(DEFAULT_SETTINGS.inlineEffect).toBe("expand");
    expect(warn).not.toHaveBeenCalled();
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

  it('NAK-3: data-inline-effect="wobble" -> expand + genau eine Warnung', async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineEffect: "wobble" },
      fetchConfig({}),
    );
    expect(s.inlineEffect).toBe("expand");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/inlineEffect.*"wobble".*"expand"/);
  });

  it("ungültiges inlineLayout -> flow + eine Warnung; ungültiger Server-Wert -> Script-Wert", async () => {
    let s = await loadEmbedSettings(
      { ...BASE, inlineLayout: "popup" },
      fetchConfig({}),
    );
    expect(s.inlineLayout).toBe("flow");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/inlineLayout.*"popup".*"flow"/);
    warn.mockClear();
    s = await loadEmbedSettings(
      { ...BASE, inlineLayout: "overlay" },
      fetchConfig({ inlineLayout: 7 }),
    );
    expect(s.inlineLayout).toBe("overlay");
    expect(warn).toHaveBeenCalledTimes(1);
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
  it("je Effekt genau seine Klasse, unbekannt -> expand", () => {
    for (const e of INLINE_EFFECT_VALUES)
      expect(inlineEffectClass({ inlineEffect: e })).toBe(
        `allm-effect allm-effect-${e}`,
      );
    expect(inlineEffectClass({})).toBe("allm-effect allm-effect-expand");
    expect(inlineEffectClass({ inlineEffect: "wobble" })).toBe(
      "allm-effect allm-effect-expand",
    );
  });

  it("Variablen: Dauer/Stapel mit Standard, Kurve ohne; reduzierte Bewegung -> 0ms", () => {
    const css = buildThemeCss(DEFAULT_SETTINGS, "light");
    expect(css).toContain(
      "--allmi-effect-duration: var(--allm-effect-duration, 320ms);",
    );
    expect(css).toContain("--allmi-effect-easing: var(--allm-effect-easing);");
    expect(css).toContain("--allmi-overlay-z: var(--allm-overlay-z, 1000);");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ :host \{ --allmi-effect-duration: 0ms; \} \}/,
    );
  });
});

describe("Box-Höhe / Überlauf-Fallback", () => {
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

  beforeEach(() => {
    matchMediaBefore = window.matchMedia;
    // Desktop (>=768px), feine Maus
    window.matchMedia = (q) => ({
      matches: q === "(min-width: 768px)",
      media: q,
      addEventListener() {},
      removeEventListener() {},
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

  function pointerDown(target) {
    const ev = new MouseEvent("pointerdown", {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    act(() => target.dispatchEvent(ev));
    return ev;
  }

  it("AK-1: Standard flow + expand — Box im Fluss, Leiste weg, Effekt expand", () => {
    const ui = setup();
    ui.open();
    expect(ui.box().className).toBe("allm-relative allm-w-full");
    expect(ui.box().style.position).toBe("");
    expect(ui.chat().className).toContain("allm-effect allm-effect-expand");
    expect(ui.bar()).toBeNull();
    // Außenklick klappt im Seitenfluss NICHT ein (wie bisher)
    pointerDown(document.body);
    expect(ui.chat()).not.toBeNull();
    expect(ui.box().className).toBe("allm-relative allm-w-full");
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

  it("AK-3/NAK-2: Außenklick klappt ein, ohne das Ereignis zu blockieren; Fokus auf die Leiste", async () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    const link = document.createElement("a");
    link.href = "#ziel";
    document.body.appendChild(link);
    const ev = pointerDown(link);
    expect(ev.defaultPrevented).toBe(false);
    expect(ui.box().className).toBe("allm-hidden");
    expect(mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    // Verlauf bleibt: ChatWindow weiter gemountet
    expect(ui.chat()).not.toBeNull();
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(document.activeElement).toBe(ui.bar());
    link.remove();
  });

  it("Klick in das Widget (Host im composedPath) klappt nicht ein", () => {
    const ui = setup({ inlineLayout: "overlay" });
    ui.open();
    pointerDown(embedderSettings.hostElement);
    expect(ui.box().style.position).toBe("absolute");
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
    pointerDown(document.body);
    expect(ui.box().className).toBe("allm-relative allm-w-full");
    act(() => chatWindowProps.current.closeChat());
    ui.open();
    expect(warn).toHaveBeenCalledTimes(1); // nur einmal je Seite
    clip.remove();
  });
});
