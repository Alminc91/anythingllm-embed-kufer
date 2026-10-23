import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";

// Nutzerentscheidung 23.10.2026: Die Optik der rhein-Demo wird für die
// Darstellung „In der Seite“ (Inline) zum Standard, Farbtöne automatisch aus
// der Akzentfarbe aus dem Design Center (Standard DEFAULT_ACCENT #007c82).
// Leiste: Rand und Schatten wie die Demo (BAR_THEMES); aufgeklapptes Panel:
// Schatten aus der Akzentfarbe (--allmi-inline-panel-shadow); Fokusring auch
// hell 2px Akzent. Seiten-CSS (--allm-shadow, --allm-bar-shadow,
// --allm-focus-ring) gewinnt weiter (Gruppe B); das Chatfenster
// (Blasen-Modus, App.jsx) behält seinen Schatten.

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
import * as theme from "../src/utils/theme.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};

// erwartete Panel-Schatten (Akzentfarbe mal 0,33, je Kanal gerundet)
const PETROL_LIGHT =
  "0 40px 90px -30px rgba(0, 41, 43, 0.45), 0 4px 14px rgba(23, 24, 27, 0.06)";
const PETROL_DARK =
  "0 40px 100px -30px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(0, 124, 130, 0.10)";
const RUST_LIGHT =
  "0 40px 90px -30px rgba(65, 22, 3, 0.45), 0 4px 14px rgba(23, 24, 27, 0.06)";
const RUST_DARK =
  "0 40px 100px -30px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(196, 67, 10, 0.10)";

// Wirksamer Wert einer Angabe mit var(), wie im Browser: Deklarationen des
// Theme-Stylesheets (:host und :host *), davor die öffentlichen Variablen
// --allm-* der Seite (page). Innerstes var() zuerst; ohne Wert und ohne
// Rückfall ungültig (null).
function themeDecls(css) {
  const out = {};
  for (const line of css.split("\n").slice(0, 2)) {
    const body = line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"));
    for (const d of body.split(";")) {
      const i = d.indexOf(":");
      if (i > 0)
        out[d.slice(0, i).trim()] = d
          .slice(i + 1)
          .replace("!important", "")
          .trim();
    }
  }
  return out;
}
const INNER_VAR =
  /var\(\s*(--[\w-]+)\s*(?:,\s*((?:(?!var\()[^()]|\([^()]*\))*?))?\s*\)/;
function resolveCss(value, decls, page = {}) {
  let v = value;
  for (let n = 0; n < 50; n++) {
    const m = v.match(INNER_VAR);
    if (!m) return v;
    const [all, name, fallback] = m;
    let rep = name.startsWith("--allm-")
      ? (page[name] ?? null)
      : decls[name] != null
        ? resolveCss(decls[name], decls, page)
        : null;
    if (rep == null) rep = fallback != null ? fallback.trim() : null;
    if (rep == null) return null;
    v = v.replace(all, rep);
  }
  return v;
}
function effective(value, settings, mode, page) {
  return resolveCss(
    value,
    themeDecls(theme.buildThemeCss(settings, mode)),
    page,
  );
}

describe("Leiste: Rand und Schatten wie die rhein-Demo (23.10.2026)", () => {
  it("BAR_THEMES: hell Rand und Schatten neu, dunkel nur der Schatten", () => {
    // Bewusste Änderung, vorher hell #d1d5db / 0 1px 3px rgba(0, 0, 0, 0.06)
    // und dunkel 0 4px 16px rgba(0, 0, 0, 0.18)
    expect(theme.BAR_THEMES.light).toEqual({
      bg: "#FFFFFF",
      text: "#1f2937",
      border: "rgba(23, 24, 27, 0.04)",
      shadow: "0 18px 40px -22px rgba(23, 24, 27, 0.45)",
    });
    expect(theme.BAR_THEMES.dark).toEqual({
      bg: "rgba(17, 24, 39, 0.78)",
      text: "#FFFFFF",
      border: "rgba(255, 255, 255, 0.16)",
      shadow: "0 18px 40px -20px rgba(0, 0, 0, 0.8)",
    });
  });

  it("Theme-Stylesheet: Standards der Leiste, inlineTheme dunkel im hellen Fenster", () => {
    const light = theme.buildThemeCss(DEFAULT_SETTINGS, "light");
    expect(light).toContain(
      "--allmi-bar-border: var(--allm-bar-border, rgba(23, 24, 27, 0.04));",
    );
    expect(light).toContain(
      "--allmi-bar-shadow: var(--allm-bar-shadow, 0 18px 40px -22px rgba(23, 24, 27, 0.45));",
    );
    for (const [settings, mode] of [
      [DEFAULT_SETTINGS, "dark"],
      [{ ...DEFAULT_SETTINGS, inlineTheme: "dark" }, "light"],
    ]) {
      const css = theme.buildThemeCss(settings, mode);
      expect(css).toContain(
        "--allmi-bar-shadow: var(--allm-bar-shadow, 0 18px 40px -20px rgba(0, 0, 0, 0.8));",
      );
      expect(css).toContain(
        "--allmi-bar-border: var(--allm-bar-border, rgba(255, 255, 255, 0.16));",
      );
      expect(css).toContain(
        "--allmi-bar-bg: var(--allm-bar-bg, rgba(17, 24, 39, 0.78));",
      );
    }
  });

  it("--allm-bar-shadow und --allm-bar-border der Seite gewinnen (hell und dunkel)", () => {
    const page = {
      "--allm-bar-shadow": "0 2px 4px rgba(1, 2, 3, 0.5)",
      "--allm-bar-border": "#123456",
    };
    for (const mode of ["light", "dark"]) {
      expect(
        effective("var(--allmi-bar-shadow)", DEFAULT_SETTINGS, mode, page),
      ).toBe("0 2px 4px rgba(1, 2, 3, 0.5)");
      expect(
        effective("var(--allmi-bar-border)", DEFAULT_SETTINGS, mode, page),
      ).toBe("#123456");
      expect(
        effective("var(--allmi-bar-shadow)", DEFAULT_SETTINGS, mode, {}),
      ).toBe(theme.BAR_THEMES[mode].shadow);
    }
  });
});

describe("Panel: Schatten aus der Akzentfarbe (23.10.2026)", () => {
  it("inlinePanelShadow: Petrol und #C4430A, hell und dunkel", () => {
    expect(theme.inlinePanelShadow({}, "light")).toBe(PETROL_LIGHT);
    expect(theme.inlinePanelShadow()).toBe(PETROL_LIGHT);
    expect(theme.inlinePanelShadow({}, "dark")).toBe(PETROL_DARK);
    expect(theme.inlinePanelShadow({ buttonColor: "#007c82" }, "light")).toBe(
      PETROL_LIGHT,
    );
    for (const buttonColor of ["#C4430A", "#c4430a", "rgb(196, 67, 10)"]) {
      expect(theme.inlinePanelShadow({ buttonColor }, "light")).toBe(
        RUST_LIGHT,
      );
      expect(theme.inlinePanelShadow({ buttonColor }, "dark")).toBe(RUST_DARK);
    }
    // Kurzform, Rundung je Kanal (255 × 0,33 = 84,15)
    expect(theme.inlinePanelShadow({ buttonColor: "#fff" }, "light")).toBe(
      "0 40px 90px -30px rgba(84, 84, 84, 0.45), 0 4px 14px rgba(23, 24, 27, 0.06)",
    );
  });

  it("ungültige oder nicht lesbare Akzentfarbe -> Standard (DEFAULT_ACCENT)", () => {
    for (const buttonColor of [
      undefined,
      null,
      "",
      "red",
      "hsl(0 0% 0%)",
      "rgba(196, 67, 10, 0.5)",
      "#C4430A80",
      "var(--allm-accent)",
      "url(x)",
      "#12345",
      42,
    ]) {
      expect(
        theme.inlinePanelShadow({ buttonColor }, "light"),
        String(buttonColor),
      ).toBe(PETROL_LIGHT);
      expect(
        theme.inlinePanelShadow({ buttonColor }, "dark"),
        String(buttonColor),
      ).toBe(PETROL_DARK);
    }
  });

  it("Theme-Stylesheet: --allmi-inline-panel-shadow mit --allm-shadow der Seite davor", () => {
    const cases = [
      [{}, "light", PETROL_LIGHT],
      [{}, "dark", PETROL_DARK],
      [{ buttonColor: "#C4430A" }, "light", RUST_LIGHT],
      [{ buttonColor: "#C4430A" }, "dark", RUST_DARK],
      [{ buttonColor: "nope" }, "dark", PETROL_DARK],
    ];
    for (const [extra, mode, expected] of cases) {
      const settings = { ...DEFAULT_SETTINGS, ...extra };
      expect(theme.buildThemeCss(settings, mode)).toContain(
        `--allmi-inline-panel-shadow: var(--allm-shadow, ${expected});`,
      );
      expect(
        effective("var(--allmi-inline-panel-shadow)", settings, mode, {}),
      ).toBe(expected);
      // --allm-shadow der Seite gewinnt
      expect(
        effective("var(--allmi-inline-panel-shadow)", settings, mode, {
          "--allm-shadow": "0 0 0 1px #000000",
        }),
      ).toBe("0 0 0 1px #000000");
    }
  });
});

describe("Chatfenster (Blasen-Modus): Schatten unverändert", () => {
  const APP_SHADOW = "var(--allmi-shadow, 0 4px 14px rgba(0, 0, 0, 0.25))";

  it("App.jsx nutzt weiter --allmi-shadow, nicht den Panel-Schatten", () => {
    const src = readFileSync(`${process.cwd()}/src/App.jsx`, "utf8");
    expect(src).toContain(`boxShadow: "${APP_SHADOW}",`);
    expect(src).not.toContain("inline-panel-shadow");
  });

  it("--allmi-shadow wie bisher: hell ohne Standard, dunkel DARK.shadow, Seite gewinnt", () => {
    expect(theme.buildThemeCss(DEFAULT_SETTINGS, "light")).toContain(
      "--allmi-shadow: var(--allm-shadow);",
    );
    expect(theme.buildThemeCss(DEFAULT_SETTINGS, "dark")).toContain(
      `--allmi-shadow: var(--allm-shadow, ${theme.DARK.shadow});`,
    );
    const s = { ...DEFAULT_SETTINGS, buttonColor: "#C4430A" };
    expect(effective(APP_SHADOW, s, "light", {})).toBe(
      "0 4px 14px rgba(0, 0, 0, 0.25)",
    );
    expect(effective(APP_SHADOW, s, "dark", {})).toBe(theme.DARK.shadow);
    expect(effective(APP_SHADOW, s, "dark", { "--allm-shadow": "none" })).toBe(
      "none",
    );
  });
});

describe("Fokusring: hell und dunkel 2px Akzent (23.10.2026)", () => {
  it("Theme-Stylesheet: gleicher Standard in beiden Farbschemata", () => {
    for (const mode of ["light", "dark"]) {
      expect(theme.buildThemeCss(DEFAULT_SETTINGS, mode)).toContain(
        "--allmi-focus-ring: var(--allm-focus-ring, 2px solid var(--allmi-accent));",
      );
      expect(
        theme.resolveThemeVars(DEFAULT_SETTINGS, mode)["--allm-focus-ring"],
      ).toBe("2px solid var(--allmi-accent)");
    }
  });

  it("deckend in der Akzentfarbe, --allm-focus-ring der Seite gewinnt", () => {
    const s = { ...DEFAULT_SETTINGS, buttonColor: "#C4430A" };
    for (const mode of ["light", "dark"]) {
      expect(effective("var(--allmi-focus-ring)", s, mode, {})).toBe(
        "2px solid #C4430A",
      );
      expect(
        effective("var(--allmi-focus-ring)", s, mode, {
          "--allm-focus-ring": "3px dotted #000000",
        }),
      ).toBe("3px dotted #000000");
    }
  });

  it("main.jsx: Buttons und Links ohne Theme-Wert 2px Akzent statt Browser-Standard", () => {
    const css = readFileSync(`${process.cwd()}/src/main.jsx`, "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(css).toContain(
      "#anythingllm-embed-root button:focus-visible, #anythingllm-embed-root a:focus-visible { outline: var(--allmi-focus-ring, 2px solid var(--allmi-accent, ${DEFAULT_ACCENT})); }",
    );
    expect(css).not.toContain("var(--allmi-focus-ring, revert)");
  });
});

describe("InlineChat: Leiste und Panel nutzen die neuen Standards", () => {
  let container;
  let root;
  let mountTarget;
  let matchMediaBefore;
  beforeEach(() => {
    matchMediaBefore = window.matchMedia;
    // Desktop: aufgeklappt die Box (kein mobiles Vollbild)
    window.matchMedia = (q) => ({
      matches: q === "(min-width: 768px)",
      media: q,
      addEventListener() {},
      removeEventListener() {},
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mountTarget?.remove();
    window.matchMedia = matchMediaBefore;
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
      open: () =>
        act(() =>
          q("#anything-llm-inline-bar").dispatchEvent(
            new MouseEvent("click", { bubbles: true }),
          ),
        ),
    };
  }

  it("Leiste: Rückfallwerte = heller Standard der rhein-Demo", () => {
    const ui = setup();
    const bar = ui.bar();
    expect(bar.style.boxShadow).toBe(
      "var(--allmi-bar-shadow, 0 18px 40px -22px rgba(23, 24, 27, 0.45))",
    );
    expect(bar.style.border).toContain(
      "var(--allmi-bar-border, rgba(23, 24, 27, 0.04))",
    );
  });

  it("Panel: Schatten über --allmi-inline-panel-shadow, wirksam aus der Akzentfarbe", () => {
    const ui = setup({ buttonColor: "#C4430A" });
    ui.open();
    const value = ui.chat().style.boxShadow;
    expect(value).toBe(`var(--allmi-inline-panel-shadow, ${PETROL_LIGHT})`);
    const s = { ...DEFAULT_SETTINGS, buttonColor: "#C4430A" };
    expect(effective(value, s, "light", {})).toBe(RUST_LIGHT);
    // dunkel der eigene Panel-Schatten, nicht DARK.shadow des Chatfensters
    expect(effective(value, s, "dark", {})).toBe(RUST_DARK);
    expect(effective(value, s, "dark", { "--allm-shadow": "none" })).toBe(
      "none",
    );
  });
});
