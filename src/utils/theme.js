// Kufer: CSS-Variablen + Theme (hell/dunkel/auto) für das Embed-Widget.
//
// Schnittstelle für Agenturen/Seiten-CSS sind die ÖFFENTLICHEN Variablen
// `--allm-<name>` (Liste: THEME_VARIABLES, Doku: README "Styling per
// CSS-Variablen"). Das Widget liest sie aber nie direkt, sondern über eine
// INTERNE Variable `--allmi-<name>`, die in einem <style> im (geschlossenen)
// Shadow-Root auf `:host` gesetzt wird:
//
//     :host { --allmi-accent: var(--allm-accent, #01a5a9); … }
//
// Dadurch gilt der Vorrang
//     Standard < Script-Attribut < Server-visual_config < Seiten-CSS
// - Settings (Script/Server) landen als Fallback-Wert im :host-Stylesheet.
// - Seiten-CSS setzt `--allm-*` auf #anythingllm-embed-widget ODER einem
//   Vorfahren (z. B. #kufer-assistent, :root). Da das Widget die öffentliche
//   Variable selbst nie deklariert, wird sie normal vererbt bzw. gilt direkt
//   auf dem Host und gewinnt immer gegen den Fallback. (Würden die Standards
//   direkt als `--allm-*` auf :host stehen, schlüge :host jeden Vorfahren und
//   ein Inline-Style auf dem Host sogar das Seiten-CSS.)
// - Fremde Elemente (Geschwister) erreichen das Widget nicht (NAK-3), Klassen
//   im Shadow DOM bleiben unerreichbar (NAK-2).
//
// Hat eine Variable im aktuellen Theme KEINEN Standardwert (light: null), ist
// `--allmi-<name>` ungültig, solange die Seite nichts setzt — dann greift an
// jeder Verwendungsstelle der bisherige, fest kodierte Wert
// (`var(--allmi-text-muted, #9ca3af)`). So bleibt das helle Theme für
// Bestandskunden pixelgleich, obwohl dort heute mehrere Grautöne/Rahmenfarben
// nebeneinander existieren.

export const THEME_STYLE_ID = "allm-theme-vars";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Leiste (Inline-Modus, eingeklappt) — bisher BAR_THEMES in InlineChat.
export const BAR_THEMES = {
  light: {
    bg: "#FFFFFF",
    text: "#1f2937",
    border: "#d1d5db",
    shadow: "0 1px 3px rgba(0, 0, 0, 0.06)",
  },
  dark: {
    bg: "rgba(17, 24, 39, 0.78)",
    text: "#FFFFFF",
    border: "rgba(255, 255, 255, 0.16)",
    shadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
  },
};

// Dunkler Satz (Kontrast geprüft, siehe README/Test AK-4): Text auf Fenster
// 15,0:1, Antworttext auf Blase 12,8:1, Link auf Blase 7,2:1, gedämpft auf
// Fenster 7,1:1 / auf Eingabefeld 6,3:1, Rahmen auf Fenster 4,0:1 / auf
// Eingabefeld 3,6:1. Flächen nach dem Mockup (THEMES.dark).
export const DARK = {
  bg: "#131316",
  surface: "#1D1D21",
  text: "#F4F2EF",
  textMuted: "#A6A8AD",
  border: "#787B82",
  assistantBg: "#2A2A2F",
  link: "#5CC8CB",
  headerBg: "#18181B",
  inputBg: "#26262B",
  shadow: "0 4px 14px rgba(0, 0, 0, 0.5)",
  bubbleShadow: "0 4px 14px rgba(0, 0, 0, 0.35)",
  hoverBg: "rgba(255, 255, 255, 0.08)",
};

const DEFAULTS = {
  accent: "#01a5a9",
  userBg: "#01a5a9",
  userText: "#FFFFFF",
  assistantBg: "#FFFFFF",
  link: "#01a5a9",
};

// Werte aus Settings landen als CSS-Text im Stylesheet -> nur harmlose Zeichen
// (Hex, Farbnamen, rgb()/hsl() …), keine Deklarations-/Regel-Grenzen, kein url().
const SAFE_CSS_VALUE = /^[#a-zA-Z0-9\s(),.%/+-]{1,64}$/;
export function cssValue(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (!SAFE_CSS_VALUE.test(v) || /url\s*\(|expression/i.test(v))
    return fallback;
  return v;
}

// textSize: bisher Klasse `allm-text-[${textSize}px]` — die gab es im Build nur
// für diese Werte; alle anderen erbten die Schriftgröße. Exakt so beibehalten
// (null = keine Vorgabe -> font-size erbt wie bisher).
const LEGACY_TEXT_SIZES = ["10", "11", "12", "13", "14", "16"];
export function legacyTextSize(textSize) {
  if (!textSize) return "14px";
  return LEGACY_TEXT_SIZES.includes(String(textSize)) ? `${textSize}px` : null;
}

// Spezifikation je öffentlicher Variable. light/dark: Standardwert (String,
// Funktion der Settings oder null = keiner). chain: Variable, der dieser Wert
// folgt, solange er nicht explizit per Setting vorgegeben ist (explicit).
export const THEME_VARIABLES = [
  // Flächen/Text
  { name: "bg", light: null, dark: DARK.bg },
  { name: "surface", light: "#FFFFFF", dark: DARK.surface },
  { name: "text", light: null, dark: DARK.text },
  { name: "text-muted", light: null, dark: DARK.textMuted },
  { name: "border", light: null, dark: DARK.border },
  // Akzent/Blasen
  {
    name: "accent",
    light: (s) => cssValue(s.buttonColor, DEFAULTS.accent),
    dark: (s) => cssValue(s.buttonColor, DEFAULTS.accent),
  },
  {
    name: "user-bg",
    light: (s) => cssValue(s.userBgColor, DEFAULTS.userBg),
    dark: (s) => cssValue(s.userBgColor, DEFAULTS.userBg),
  },
  {
    name: "user-text",
    light: (s) => cssValue(s.userTextColor, DEFAULTS.userText),
    dark: (s) => cssValue(s.userTextColor, DEFAULTS.userText),
  },
  {
    name: "assistant-bg",
    light: (s) => cssValue(s.assistantBgColor, DEFAULTS.assistantBg),
    dark: DARK.assistantBg,
  },
  {
    name: "assistant-text",
    chain: "text",
    light: "#222628",
    dark: DARK.text,
  },
  {
    name: "link",
    light: (s) => cssValue(s.linkColor, DEFAULTS.link),
    dark: DARK.link,
  },
  // Header/Eingabe
  {
    name: "header-bg",
    light: (s) => cssValue(s.headerBgColor, "transparent"),
    dark: (s) => cssValue(s.headerBgColor, DARK.headerBg),
  },
  {
    name: "header-text",
    chain: "text",
    explicit: (s) =>
      cssValue(s.headerTextColor) || (s.headerBgColor ? "#1f2937" : null),
    light: "#1f2937",
    dark: DARK.text,
  },
  {
    name: "header-icon",
    chain: "text-muted",
    explicit: (s) =>
      cssValue(s.headerTextColor) || (s.headerBgColor ? "#FFFFFF" : null),
    light: null,
    dark: DARK.textMuted,
  },
  { name: "input-bg", light: "transparent", dark: DARK.inputBg },
  {
    name: "input-border",
    chain: "border",
    light: "#22262833",
    dark: DARK.border,
  },
  { name: "input-text", chain: "text", light: "#000000", dark: DARK.text },
  // Form
  { name: "radius", light: "16px", dark: "16px" },
  {
    name: "radius-bubble",
    light: "calc(var(--allmi-radius) * 1.125)",
    dark: "calc(var(--allmi-radius) * 1.125)",
  },
  { name: "shadow", light: null, dark: DARK.shadow },
  {
    name: "bubble-shadow",
    light: "0 4px 14px rgba(0, 0, 0, 0.25)",
    dark: DARK.bubbleShadow,
  },
  {
    name: "font-size",
    light: (s) => legacyTextSize(s.textSize),
    dark: (s) => legacyTextSize(s.textSize),
  },
  // Effekte
  { name: "transition", light: "200ms", dark: "200ms" },
  {
    name: "easing",
    light: "cubic-bezier(0.4, 0, 0.2, 1)",
    dark: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  { name: "hover-bg", light: null, dark: DARK.hoverBg },
  {
    name: "focus-ring",
    light: null,
    dark: "2px solid var(--allmi-accent)",
  },
  // Inline-Leiste
  { name: "bar-bg", bar: "bg" },
  { name: "bar-text", bar: "text" },
  { name: "bar-border", bar: "border" },
  { name: "bar-shadow", bar: "shadow" },
  {
    name: "bar-radius",
    light: "var(--allmi-radius)",
    dark: "var(--allmi-radius)",
  },
];

// theme-Setting -> "light" | "dark". Ungültig/fehlend -> light.
export function resolveThemeMode(theme, prefersDark = false) {
  if (theme === "dark") return "dark";
  if (theme === "auto") return prefersDark ? "dark" : "light";
  return "light";
}

// Leiste: dunkel bei inlineTheme "dark" (Bestand) ODER dunklem Theme.
export function resolveBarTheme(settings = {}, mode = "light") {
  return settings.inlineTheme === "dark" || mode === "dark" ? "dark" : "light";
}

function pick(spec, settings, mode) {
  const v = spec[mode];
  return typeof v === "function" ? v(settings) : (v ?? null);
}

// Wirksame Standardwerte je öffentlicher Variable (ohne Seiten-CSS) für
// Tests/Doku: { "--allm-accent": "#01a5a9", "--allm-text": null, … }.
// Kettenwerte werden aufgelöst (header-text -> text usw.).
export function resolveThemeVars(settings = {}, mode = "light") {
  const bar = BAR_THEMES[resolveBarTheme(settings, mode)];
  const out = {};
  for (const spec of THEME_VARIABLES) {
    let value;
    if (spec.bar) value = bar[spec.bar];
    else {
      const explicit = spec.explicit?.(settings) ?? null;
      const chained = spec.chain ? out[`--allm-${spec.chain}`] : null;
      value = explicit ?? chained ?? pick(spec, settings, mode);
    }
    out[`--allm-${spec.name}`] = value;
  }
  return out;
}

// Stylesheet-Text für den Shadow-Root.
export function buildThemeCss(settings = {}, mode = "light") {
  const bar = BAR_THEMES[resolveBarTheme(settings, mode)];
  const decls = [];
  for (const spec of THEME_VARIABLES) {
    const pub = `--allm-${spec.name}`;
    let fallback;
    if (spec.bar) fallback = bar[spec.bar];
    else {
      const explicit = spec.explicit?.(settings) ?? null;
      const def = pick(spec, settings, mode);
      if (explicit) fallback = explicit;
      else if (spec.chain)
        fallback = def
          ? `var(--allmi-${spec.chain}, ${def})`
          : `var(--allmi-${spec.chain})`;
      else fallback = def;
    }
    decls.push(
      fallback
        ? `--allmi-${spec.name}: var(${pub}, ${fallback});`
        : `--allmi-${spec.name}: var(${pub});`,
    );
  }
  // interne Hilfswerte
  decls.push(
    "--allmi-radius-bubble-small: min(4px, calc(var(--allmi-radius-bubble) / 4.5));",
  );
  if (resolveBarTheme(settings, mode) === "dark")
    decls.push(
      "--allmi-bar-backdrop: blur(6px);",
      "--allmi-bar-ring: 0 0 0 2px rgba(255, 255, 255, 0.28);",
    );
  return (
    `:host { ${decls.join(" ")} }\n` +
    // Reduzierte Bewegung schlägt auch eine per Seiten-CSS gesetzte Dauer.
    `@media (prefers-reduced-motion: reduce) { :host { --allmi-transition: 0ms; } }`
  );
}

// --- Laufzeit: Stylesheet im Shadow-Root pflegen, "auto" folgt dem System ---
let current = { styleEl: null, settings: null, mql: null, listener: null };

function prefersDark() {
  try {
    return !!window.matchMedia?.(DARK_QUERY).matches;
  } catch (e) {
    return false;
  }
}

function render() {
  const { styleEl, settings } = current;
  if (!styleEl || !settings) return;
  const mode = resolveThemeMode(settings.theme, prefersDark());
  const css = buildThemeCss(settings, mode);
  if (styleEl.textContent !== css) styleEl.textContent = css;
  styleEl.dataset.mode = mode;
}

// Setzt/aktualisiert die Variablen. Synchron vor dem ersten Render aufrufen
// (useScriptAttributes), dann gibt es keinen Frame im falschen Theme (NAK-4).
export function applyTheme(styleEl, settings = {}) {
  current.styleEl = styleEl;
  current.settings = settings;
  const wantListener = settings.theme === "auto";
  if (wantListener && !current.listener && window.matchMedia) {
    current.mql = window.matchMedia(DARK_QUERY);
    current.listener = () => render();
    if (current.mql.addEventListener)
      current.mql.addEventListener("change", current.listener);
    else current.mql.addListener?.(current.listener); // ältere Safari
  } else if (!wantListener && current.listener) {
    if (current.mql.removeEventListener)
      current.mql.removeEventListener("change", current.listener);
    else current.mql.removeListener?.(current.listener);
    current.listener = null;
    current.mql = null;
  }
  render();
}

// --- Bausteine für Komponenten (Inline-Styles, Fallback = bisheriger Wert) ---
const BUBBLE_R = "var(--allmi-radius-bubble, 18px)";
const BUBBLE_S = "var(--allmi-radius-bubble-small, 4px)";
// Sprechblasen: drei Ecken --allm-radius-bubble, die "Zipfel"-Ecke klein
// (bisher rounded-t-[18px] + rounded-br/bl-[4px]).
export const BUBBLE_RADIUS = {
  user: `${BUBBLE_R} ${BUBBLE_R} ${BUBBLE_S} ${BUBBLE_R}`,
  assistant: `${BUBBLE_R} ${BUBBLE_R} ${BUBBLE_R} ${BUBBLE_S}`,
};
export const BUBBLE_SHADOW =
  "var(--allmi-bubble-shadow, 0 4px 14px rgba(0, 0, 0, 0.25))";

// Vorschläge (SuggestedMessages) setzten fontSize bisher direkt aus textSize
// (Zahl -> px, String unverändert -> bei "14" ungültig -> erbt). Exakt so als
// Fallback beibehalten; --allm-font-size (Seiten-CSS) gewinnt.
export function suggestionFontSize(textSize) {
  const legacy =
    typeof textSize === "number"
      ? `${textSize}px`
      : cssValue(typeof textSize === "string" ? textSize : null);
  return legacy ? `var(--allm-font-size, ${legacy})` : "var(--allm-font-size)";
}
