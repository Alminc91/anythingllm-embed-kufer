import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// main.jsx baut beim Import den Shadow-Host und rendert die App -> für die
// reinen Settings-/Theme-Tests durch ein Minimal-Objekt ersetzen.
vi.mock("../src/main.jsx", () => ({
  embedderSettings: {
    settings: {},
    USER_STYLES: {},
    ASSISTANT_STYLES: {},
  },
  inlineTailwindStyles: () => Promise.resolve(false),
}));

import {
  DEFAULT_SETTINGS,
  loadEmbedSettings,
} from "../src/hooks/useScriptAttributes.js";
import {
  BAR_THEMES,
  DARK,
  THEME_VARIABLES,
  applyTheme,
  buildThemeCss,
  cssValue,
  legacyTextSize,
  resolveThemeMode,
  resolveThemeVars,
} from "../src/utils/theme.js";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};

// gemockter /config-Fetch
function fetchConfig(config) {
  return vi.fn(async (url) => {
    expect(url).toBe(`${BASE.baseApiUrl}/${BASE.embedId}/config`);
    return { ok: true, json: async () => config };
  });
}

async function finalVars(dataset, serverConfig = {}) {
  const settings = await loadEmbedSettings(
    { ...BASE, ...dataset },
    fetchConfig(serverConfig),
  );
  const mode = resolveThemeMode(settings.theme, false);
  return { settings, mode, vars: resolveThemeVars(settings, mode) };
}

// WCAG-Kontrast
function rgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function lum([r, g, b]) {
  const ch = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
function contrast(a, b) {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

let warn;
let error;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe("theme.test.js", () => {
  it("host-css-wins: Standards nur als --allmi-* auf :host, öffentliche Variable gewinnt immer", () => {
    const css = buildThemeCss(DEFAULT_SETTINGS, "light");
    const host = css.slice(css.indexOf(":host {"), css.indexOf("}") + 1);
    // keine öffentliche Variable wird vom Widget deklariert (sonst schlüge
    // :host Vorfahren bzw. ein Inline-Style auf dem Host das Seiten-CSS)
    expect(host).not.toMatch(/(^|[\s{;])--allm-[a-z-]+\s*:/);
    // jede öffentliche Variable steht als erstes Argument im var()
    for (const { name } of THEME_VARIABLES)
      expect(host).toMatch(
        new RegExp(`--allmi-${name}: var\\(--allm-${name}[,)]`),
      );
    // Werte im :host-Stylesheet, nicht als Inline-Style am Host
    expect(css.startsWith(":host {")).toBe(true);
  });

  it("precedence-server-over-script: visual_config schlägt data-Attribut", async () => {
    const { vars, settings } = await finalVars(
      { userBgColor: "#111111" },
      { userBgColor: "#222222" },
    );
    expect(vars["--allm-user-bg"]).toBe("#222222");
    expect(buildThemeCss(settings, "light")).toContain(
      "--allmi-user-bg: var(--allm-user-bg, #222222);",
    );
    // ohne Server-Wert greift das Script-Attribut, ohne beides der Default
    expect(
      (await finalVars({ userBgColor: "#111111" })).vars["--allm-user-bg"],
    ).toBe("#111111");
    expect((await finalVars({})).vars["--allm-user-bg"]).toBe("#01a5a9");
  });

  it("theme-from-server-config: visual_config.theme = dark ohne data-theme", async () => {
    const { settings, mode, vars } = await finalVars({}, { theme: "dark" });
    expect(settings.theme).toBe("dark");
    expect(mode).toBe("dark");
    expect(vars["--allm-surface"]).toBe(DARK.surface);
    expect(vars["--allm-assistant-bg"]).toBe(DARK.assistantBg);
    expect(buildThemeCss(settings, mode)).toContain(
      `--allmi-bg: var(--allm-bg, ${DARK.bg});`,
    );
  });

  it("legacy-settings-map: buttonColor/linkColor speisen --allm-accent/--allm-link", async () => {
    const { vars } = await finalVars({
      buttonColor: "#ff0000",
      linkColor: "#00ff00",
    });
    expect(vars["--allm-accent"]).toBe("#ff0000");
    expect(vars["--allm-link"]).toBe("#00ff00");
    // weitere Bestands-Settings
    const h = await finalVars(
      {},
      {
        headerBgColor: "#0b5f8a",
        headerTextColor: "#FFFFFF",
        assistantBgColor: "#f1f5f9",
        userTextColor: "#222628",
      },
    );
    expect(h.vars["--allm-header-bg"]).toBe("#0b5f8a");
    expect(h.vars["--allm-header-text"]).toBe("#FFFFFF");
    expect(h.vars["--allm-header-icon"]).toBe("#FFFFFF");
    expect(h.vars["--allm-assistant-bg"]).toBe("#f1f5f9");
    expect(h.vars["--allm-user-text"]).toBe("#222628");
  });

  it("invalid-theme-falls-back: data-theme=blau / visual_config.theme=7 -> light + genau eine Warnung", async () => {
    const a = await finalVars({ theme: "blau" });
    expect(a.settings.theme).toBe("light");
    expect(a.mode).toBe("light");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"blau"');

    warn.mockClear();
    const b = await finalVars({}, { theme: 7 });
    expect(b.settings.theme).toBe("light");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("7");
    expect(error).not.toHaveBeenCalled();

    // Groß-/Kleinschreibung egal, gültige Werte ohne Warnung
    warn.mockClear();
    expect((await finalVars({ theme: "Dark" })).settings.theme).toBe("dark");
    expect((await finalVars({ theme: "auto" })).settings.theme).toBe("auto");
    expect(warn).not.toHaveBeenCalled();
  });

  it("auto folgt prefers-color-scheme (Listener, ohne Reload)", () => {
    let listener = null;
    const mql = {
      matches: true,
      addEventListener: (_e, fn) => (listener = fn),
      removeEventListener: () => (listener = null),
    };
    const orig = window.matchMedia;
    window.matchMedia = vi.fn(() => mql);
    try {
      const style = document.createElement("style");
      applyTheme(style, { ...DEFAULT_SETTINGS, theme: "auto" });
      expect(style.dataset.mode).toBe("dark");
      expect(style.textContent).toContain(`var(--allm-bg, ${DARK.bg})`);
      mql.matches = false;
      listener();
      expect(style.dataset.mode).toBe("light");
      expect(style.textContent).toContain("--allmi-bg: var(--allm-bg);");
      // Wechsel auf festes Theme entfernt den Listener
      applyTheme(style, { ...DEFAULT_SETTINGS, theme: "dark" });
      expect(listener).toBeNull();
    } finally {
      window.matchMedia = orig;
    }
  });

  it("helles Theme: Variablen mit mehreren Altwerten bleiben ohne Standard (pixelgleich)", () => {
    const css = buildThemeCss(DEFAULT_SETTINGS, "light");
    for (const name of [
      "bg",
      "text",
      "text-muted",
      "border",
      "shadow",
      "hover-bg",
      "focus-ring",
    ])
      expect(css).toContain(`--allmi-${name}: var(--allm-${name});`);
    expect(css).toContain("--allmi-surface: var(--allm-surface, #FFFFFF);");
    expect(css).toContain("--allmi-radius: var(--allm-radius, 16px);");
    expect(css).toContain(
      "--allmi-assistant-text: var(--allm-assistant-text, var(--allmi-text, #222628));",
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ :host \{ --allmi-transition: 0ms; \} \}/,
    );
  });

  it("Inline-Leiste: inlineTheme speist --allm-bar-*, dunkles Theme macht die Leiste dunkel", () => {
    const light = resolveThemeVars({ ...DEFAULT_SETTINGS }, "light");
    expect(light["--allm-bar-bg"]).toBe(BAR_THEMES.light.bg);
    const legacyDark = resolveThemeVars(
      { ...DEFAULT_SETTINGS, inlineTheme: "dark" },
      "light",
    );
    expect(legacyDark["--allm-bar-bg"]).toBe(BAR_THEMES.dark.bg);
    expect(legacyDark["--allm-surface"]).toBe("#FFFFFF"); // Fenster bleibt hell
    const dark = resolveThemeVars({ ...DEFAULT_SETTINGS }, "dark");
    expect(dark["--allm-bar-text"]).toBe(BAR_THEMES.dark.text);
  });

  it("dunkler Satz: Kontrast Text >= 4,5:1, Rahmen >= 3:1 (WCAG AA)", () => {
    const text = [
      [DARK.text, DARK.surface],
      [DARK.text, DARK.bg],
      [DARK.text, DARK.assistantBg],
      [DARK.text, DARK.headerBg],
      [DARK.text, DARK.inputBg],
      [DARK.textMuted, DARK.surface],
      [DARK.textMuted, DARK.bg],
      [DARK.textMuted, DARK.inputBg],
      [DARK.textMuted, DARK.headerBg],
      [DARK.link, DARK.assistantBg],
    ];
    for (const [fg, bg] of text)
      expect(contrast(fg, bg), `${fg} auf ${bg}`).toBeGreaterThanOrEqual(4.5);
    for (const bg of [DARK.surface, DARK.inputBg, DARK.headerBg, DARK.bg])
      expect(
        contrast(DARK.border, bg),
        `Rahmen auf ${bg}`,
      ).toBeGreaterThanOrEqual(3);
  });

  it("Werte aus Settings werden vor dem CSS-Text geprüft", () => {
    expect(cssValue("#abc")).toBe("#abc");
    expect(cssValue("rgb(1 2 3 / 50%)")).toBe("rgb(1 2 3 / 50%)");
    expect(cssValue("red; } :host { color: red")).toBeNull();
    expect(cssValue("url(https://evil.example/x.png)")).toBeNull();
    const css = buildThemeCss(
      { ...DEFAULT_SETTINGS, buttonColor: "red;}</style><script>" },
      "light",
    );
    expect(css).toContain("--allmi-accent: var(--allm-accent, #01a5a9);");
    expect(css).not.toContain("<script>");
  });

  it("textSize: bisherige Klassen-Werte exakt, sonst erbt die Schrift", () => {
    expect(legacyTextSize(14)).toBe("14px");
    expect(legacyTextSize("16")).toBe("16px");
    expect(legacyTextSize(null)).toBe("14px");
    expect(legacyTextSize("15")).toBeNull();
  });

  it("NAK-5: dokumentierte data-Attribute werden weiter angewendet", async () => {
    const s = await loadEmbedSettings(
      {
        ...BASE,
        position: "top-right",
        greeting: "Hallo Test",
        noHeader: "true",
        inheritFont: "",
        displayMode: "Inline",
        inlineTheme: "dark",
        buttonColor: "#123456",
      },
      fetchConfig({}),
    );
    expect(s.position).toBe("top-right");
    expect(s.greeting).toBe("Hallo Test");
    expect(s.noHeader).toBe("true");
    expect(s.inheritFont).toBe(true);
    expect(s.displayMode).toBe("inline");
    expect(s.inlineTheme).toBe("dark");
    expect(s.buttonColor).toBe("#123456");
    expect(s.theme).toBe("light");
  });

  it("Config-Fetch-Fehler: Script-Attribute bleiben gültig", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, theme: "dark" },
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(s.theme).toBe("dark");
    expect(s.loaded).toBe(true);
  });
});
