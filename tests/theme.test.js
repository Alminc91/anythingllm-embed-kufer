import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  HEADER_STYLE,
  MESSAGE_FONT_SIZE,
  THEME_VARIABLES,
  accentTintFallback,
  applyTheme,
  buildThemeCss,
  cssValue,
  headerBorder,
  legacyTextSize,
  resolveBarTheme,
  resolveThemeMode,
  resolveThemeVars,
  suggestionFontSize,
} from "../src/utils/theme.js";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};

// gemockter /config-Fetch
function fetchConfig(config) {
  return vi.fn(async (url) => {
    // mit der Sprache des Widgets (ohne data-language: de, Fixliste
    // 7.22-rc13 F01)
    expect(url).toBe(`${BASE.baseApiUrl}/${BASE.embedId}/config?language=de`);
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
  // Bewusste Änderung (Fixliste 7.22-rc17 E23): Variablen der Gruppe A (dc,
  // im Design Center einstellbar) stehen direkt und mit !important, ohne
  // Rückgriff auf die öffentliche Variable; alle übrigen wie bisher.
  it("host-css-wins: Standards nur als --allmi-* auf :host, öffentliche Variable gewinnt außer bei Gruppe A", () => {
    const css = buildThemeCss(DEFAULT_SETTINGS, "light");
    const host = css.slice(css.indexOf(":host {"), css.indexOf("}") + 1);
    // keine öffentliche Variable wird vom Widget deklariert (sonst schlüge
    // :host Vorfahren bzw. ein Inline-Style auf dem Host das Seiten-CSS)
    expect(host).not.toMatch(/(^|[\s{;])--allm-[a-z-]+\s*:/);
    const dc = THEME_VARIABLES.filter((v) => v.dc).map((v) => v.name);
    expect(dc.sort()).toEqual(
      ["accent", "link", "on-accent", "user-bg", "user-text"].sort(),
    );
    // jede übrige öffentliche Variable steht als erstes Argument im var()
    for (const { name, dc: fromDc } of THEME_VARIABLES)
      if (fromDc) {
        expect(host).toMatch(
          new RegExp(`--allmi-${name}: #[0-9a-fA-F]{6} !important;`),
        );
        expect(host).not.toContain(`var(--allm-${name}`);
      } else
        expect(host).toMatch(
          new RegExp(`--allmi-${name}: var\\(--allm-${name}[,)]`),
        );
    // Werte im :host-Stylesheet, nicht als Inline-Style am Host
    expect(css.startsWith(":host {")).toBe(true);
  });

  // Bewusste Änderung (Fixliste 7.22-rc17 E23): Farbe der Nutzerblase =
  // Akzentfarbe aus dem Design Center (Gruppe A); das Script-Attribut wirkt
  // auch ohne Server-Wert nicht.
  it("precedence-server-over-script: visual_config gilt, data-Attribut wirkt nicht", async () => {
    const { vars, settings } = await finalVars(
      { userBgColor: "#111111" },
      { userBgColor: "#222222" },
    );
    expect(vars["--allm-user-bg"]).toBe("#222222");
    expect(buildThemeCss(settings, "light")).toContain(
      "--allmi-user-bg: #222222 !important;",
    );
    // ohne Server-Wert der Standard, nicht das Script-Attribut
    expect(
      (await finalVars({ userBgColor: "#111111" })).vars["--allm-user-bg"],
    ).toBe("#01a5a9");
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

  // Bewusste Änderung (Fixliste 7.22-rc17 E23): das Farbschema stellt nur
  // das Design Center ein; data-theme wirkt auch ohne Server-Wert nicht
  // (eine Warnung).
  it("theme-script-attr-without-server-theme: Server-Antwort ohne theme, data-theme=dark wirkt nicht", async () => {
    const { settings, mode, vars } = await finalVars(
      { theme: "dark" },
      { buttonColor: "#FFA102", userBgColor: "#FFA102" },
    );
    expect(settings.theme).toBe("light");
    expect(mode).toBe("light");
    expect(vars["--allm-surface"]).toBe("#FFFFFF");
    expect(vars["--allm-accent"]).toBe("#FFA102");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("data-theme wirkt nicht");
    expect(error).not.toHaveBeenCalled();
  });

  it("legacy-settings-map: buttonColor/linkColor speisen --allm-accent/--allm-link", async () => {
    // seit Fixliste 7.22-rc17 (E23) nur vom Server (Design Center)
    const { vars } = await finalVars(
      { buttonColor: "#0000ff", linkColor: "#0000ff" },
      { buttonColor: "#ff0000", linkColor: "#00ff00" },
    );
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
    // data-theme wirkt seit Fixliste 7.22-rc17 (E23) nicht: eine Warnung
    // „wirkt nicht“, keine zweite über den Wert
    const a = await finalVars({ theme: "blau" });
    expect(a.settings.theme).toBe("light");
    expect(a.mode).toBe("light");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("data-theme wirkt nicht");

    warn.mockClear();
    const b = await finalVars({}, { theme: 7 });
    expect(b.settings.theme).toBe("light");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("7");
    expect(error).not.toHaveBeenCalled();

    // Groß-/Kleinschreibung egal, gültige Werte vom Server ohne Warnung
    warn.mockClear();
    expect((await finalVars({}, { theme: "Dark" })).settings.theme).toBe(
      "dark",
    );
    expect((await finalVars({}, { theme: "auto" })).settings.theme).toBe(
      "auto",
    );
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
    // Kurskarten getrennt rundbar, Standard 0,75 × --allm-radius (AK-6)
    expect(css).toContain(
      "--allmi-radius-card: var(--allm-radius-card, calc(var(--allmi-radius) * 0.75));",
    );
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

  // Fixliste 7.22-rc7 Nr. 21: ohne Angabe folgt die Leiste dem Farbschema
  // aus dem Design Center, ein Serverwert wirkt nicht. Bewusste Änderung
  // (Fixliste 7.22-rc17 E23): data-inline-theme verfeinert den festen
  // Standard wieder (Gruppe B).
  it("inlineTheme: Leiste folgt ohne Angabe dem Fenster-Theme, data-inline-theme verfeinert", async () => {
    expect(DEFAULT_SETTINGS.inlineTheme).toBeNull();
    expect((await finalVars({})).settings.inlineTheme).toBeNull();
    expect(resolveBarTheme({ inlineTheme: null }, "light")).toBe("light");
    expect(resolveBarTheme({ inlineTheme: null }, "dark")).toBe("dark");
    // data-inline-theme="dark" im hellen Fenster: dunkle Leiste
    const own = await finalVars({ inlineTheme: "dark" });
    expect(own.settings.inlineTheme).toBe("dark");
    expect(own.mode).toBe("light");
    expect(own.vars["--allm-bar-bg"]).toBe(BAR_THEMES.dark.bg);
    // ohne Angabe im dunklen Fenster: dunkle Leiste
    const darkBar = await finalVars({}, { theme: "dark" });
    expect(darkBar.vars["--allm-bar-bg"]).toBe(BAR_THEMES.dark.bg);
    expect(darkBar.vars["--allm-surface"]).toBe(DARK.surface);
    // ein Serverwert wirkt nicht
    const server = await finalVars({}, { inlineTheme: "dark" });
    expect(server.vars["--allm-bar-bg"]).toBe(BAR_THEMES.light.bg);
  });

  it("brand-header-dark: headerBgColor ohne headerTextColor -> Text folgt dem dunklen Satz (Kontrast >= 4,5:1)", async () => {
    const brand = "#0b3d6b";
    const dark = await finalVars({}, { theme: "dark", headerBgColor: brand });
    expect(dark.vars["--allm-header-bg"]).toBe(brand);
    expect(dark.vars["--allm-header-text"]).toBe(DARK.text);
    expect(dark.vars["--allm-header-icon"]).toBe("#FFFFFF");
    expect(
      contrast(dark.vars["--allm-header-text"], brand),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(dark.vars["--allm-header-icon"], brand),
    ).toBeGreaterThanOrEqual(4.5);
    // Seiten-CSS --allm-text bleibt wirksam (Kette statt festem Wert)
    expect(buildThemeCss(dark.settings, "dark")).toContain(
      `--allmi-header-text: var(--allm-header-text, var(--allmi-text, ${DARK.text}));`,
    );
    // helles Theme: bisheriges #1f2937 (pixelgleich)
    const light = await finalVars({}, { headerBgColor: brand });
    expect(light.vars["--allm-header-text"]).toBe("#1f2937");
    // headerTextColor gewinnt in beiden Themes
    const explicit = await finalVars(
      {},
      { theme: "dark", headerBgColor: brand, headerTextColor: "#FFFFFF" },
    );
    expect(explicit.vars["--allm-header-text"]).toBe("#FFFFFF");
  });

  it("header-border: keine Linie bei Header-Farbe (Setting oder Seiten-CSS), sonst Rahmenfarbe", () => {
    expect(headerBorder({ headerBgColor: "#0b5f8a" })).toBe("none");
    expect(headerBorder({})).toBe(
      "1px solid var(--allm-header-bg, var(--allmi-border, #E9E9E9))",
    );
    expect(buildThemeCss({ headerBgColor: "#0b5f8a" }, "dark")).toContain(
      "--allmi-header-border: none;",
    );
    expect(buildThemeCss(DEFAULT_SETTINGS, "dark")).toContain(
      "--allmi-header-border: 1px solid var(--allm-header-bg, var(--allmi-border, #E9E9E9));",
    );
    // Komponenten lesen nur die Variable
    expect(HEADER_STYLE.borderBottom).toBe(
      "var(--allmi-header-border, 1px solid #E9E9E9)",
    );
  });

  it("hover-icon: Eingabe-Icons beim Hover hell bisheriger Wert, dunkel Text des dunklen Satzes", () => {
    expect(buildThemeCss(DEFAULT_SETTINGS, "light")).toContain(
      "--allmi-hover-icon: var(--allm-input-text, var(--allm-text, #222628e6));",
    );
    expect(buildThemeCss(DEFAULT_SETTINGS, "dark")).toContain(
      `--allmi-hover-icon: var(--allm-input-text, var(--allm-text, ${DARK.text}));`,
    );
    expect(contrast(DARK.text, DARK.inputBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("Schriftgröße: Antwort streamend/Verlauf und Vorschläge lesen --allmi-font-size", () => {
    expect(MESSAGE_FONT_SIZE).toBe("var(--allmi-font-size)");
    expect(suggestionFontSize(16)).toBe("var(--allmi-font-size, 16px)");
    expect(suggestionFontSize("15")).toBe("var(--allmi-font-size, 15)");
    expect(suggestionFontSize(undefined)).toBe("var(--allmi-font-size)");
    expect(buildThemeCss({ textSize: 16 }, "light")).toContain(
      "--allmi-font-size: var(--allm-font-size, 16px);",
    );
  });

  it("Icon-Kachel: Tönung aus buttonColor nie ungültig (hex, rgb())", () => {
    expect(accentTintFallback("#FFA102")).toBe("#FFA1021a");
    expect(accentTintFallback("#abc")).toBe("#aabbcc1a");
    expect(accentTintFallback("#FFA10280")).toBe("#FFA1021a");
    expect(accentTintFallback("rgb(255, 161, 2)")).toBe(
      "rgba(255, 161, 2, 0.102)",
    );
    expect(accentTintFallback("rgb(255 161 2 / 50%)")).toBe(
      "rgba(255, 161, 2, 0.102)",
    );
    for (const bad of [
      "rgb(300, 0, 0)",
      "red",
      "hsl(10 50% 50%)",
      "",
      null,
      "#12",
    ])
      expect(accentTintFallback(bad), String(bad)).toBeNull();
    // gültige Werte sind gültiges CSS (jsdom-Parser)
    for (const c of ["#FFA102", "rgb(255, 161, 2)", "#abc"]) {
      const el = document.createElement("span");
      el.style.backgroundColor = accentTintFallback(c);
      expect(el.style.backgroundColor, c).not.toBe("");
    }
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
    expect(css).toContain("--allmi-accent: #01a5a9 !important;");
    expect(css).not.toContain("<script>");
  });

  it("textSize: bisherige Klassen-Werte exakt, sonst erbt die Schrift", () => {
    expect(legacyTextSize(14)).toBe("14px");
    expect(legacyTextSize("16")).toBe("16px");
    expect(legacyTextSize(null)).toBe("14px");
    expect(legacyTextSize("15")).toBeNull();
  });

  // Bewusste Änderung (Fixliste 7.22-rc17 E23): Angaben, die das Design
  // Center einstellt (Position, Begrüßung, Darstellung, Akzentfarbe),
  // wirken per data-Attribut nicht mehr; die übrigen weiter.
  it("NAK-5: dokumentierte data-Attribute ohne Feld im Design Center werden weiter angewendet", async () => {
    const s = await loadEmbedSettings(
      {
        ...BASE,
        position: "top-right",
        greeting: "Hallo Test",
        noHeader: "true",
        inheritFont: "",
        displayMode: "Inline",
        buttonColor: "#123456",
        headerBgColor: "#0b5f8a",
        textSize: "16",
      },
      fetchConfig({}),
    );
    expect(s.position).toBe("bottom-left");
    expect(s.greeting).toBe(null);
    expect(s.noHeader).toBe("true");
    expect(s.inheritFont).toBe(true);
    expect(s.displayMode).toBe("bubble");
    expect(s.buttonColor).toBe("#01a5a9");
    expect(s.headerBgColor).toBe("#0b5f8a");
    expect(s.textSize).toBe("16");
    expect(s.theme).toBe("light");
  });

  it("Config-Fetch-Fehler: Script-Attribute ohne Feld im Design Center bleiben gültig", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, theme: "dark", headerBgColor: "#0b5f8a" },
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    // Farbschema nur aus dem Design Center (Fixliste 7.22-rc17 E23)
    expect(s.theme).toBe("light");
    expect(s.headerBgColor).toBe("#0b5f8a");
    expect(s.loaded).toBe(true);
  });
});

describe("Effekt-Dauer (Review 5: nur --allmi-*, Vorrang über theme.js)", () => {
  const mainSrc = readFileSync(resolve(process.cwd(), "src/main.jsx"), "utf8");

  it("Mapping ohne Standard: Seiten-CSS --allm-effect-duration gewinnt, sonst Standard je Effekt (morph 720ms, Zuklappen 480ms)", () => {
    for (const mode of ["light", "dark"]) {
      const css = buildThemeCss(
        { ...DEFAULT_SETTINGS, buttonColor: "#123456" },
        mode,
      );
      expect(css).toContain(
        "--allmi-effect-duration: var(--allm-effect-duration);",
      );
      expect(
        resolveThemeVars(DEFAULT_SETTINGS, mode)["--allm-effect-duration"],
      ).toBeNull();
      for (const k of ["close-duration", "close-easing"]) {
        expect(css).toContain(`--allmi-effect-${k}: var(--allm-effect-${k});`);
        expect(
          resolveThemeVars(DEFAULT_SETTINGS, mode)[`--allm-effect-${k}`],
        ).toBeNull();
      }
    }
    // Standard an der Verwendungsstelle: Keyframe-Effekte 320ms, morph 720ms
    expect(mainSrc).toContain(
      "animation-duration: var(--allmi-effect-duration, 320ms);",
    );
    expect(mainSrc).toContain(
      "--allmi-fx-d:var(--allmi-effect-duration,720ms)",
    );
    expect(mainSrc).toContain(
      "--allmi-fx-e:var(--allmi-effect-easing,cubic-bezier(.16,1,.3,1))",
    );
    expect(mainSrc).toContain(
      "--allmi-fx-d:var(--allmi-effect-close-duration,480ms);--allmi-fx-e:var(--allmi-effect-close-easing,cubic-bezier(.65,0,.35,1))",
    );
  });

  it("Widget-CSS in main.jsx liest keine öffentliche --allm-* direkt", () => {
    expect(mainSrc.match(/var\(\s*--allm-[a-z]/g)).toBeNull();
  });
});
