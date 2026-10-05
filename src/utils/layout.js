// Kufer: Darstellung (Blase/Inline) + einstellbare Fenstergröße/Randabstand.
//
// Alle Werte hier landen später in style-Objekten bzw. im CSS-Text eines
// <style>-Elements im Shadow DOM. Deshalb werden sie AUSSCHLIESSLICH über
// strikte Whitelists übernommen (Zahl + erlaubte Einheit, Enum, Integer-Range).
// Ungültig -> undefined -> das Feld fällt weg und der nächstniedrigere Wert
// (Script-Attribut bzw. Default) greift.

export const DEFAULT_MOUNT_SELECTOR = "#kufer-assistent";
export const DEFAULT_INLINE_COLLAPSED_TEXT =
  "Jetzt mit unserem KI-Assistenten schreiben";
export const DEFAULT_INLINE_HEIGHT = "600px";
// Inline-Leiste als Eingabefeld (inlineInput): Platzhalter + Text des Knopfs
export const DEFAULT_INLINE_INPUT_PLACEHOLDER = "Stellen Sie hier Ihre Frage …";
export const DEFAULT_INLINE_SEND_TEXT = "Chatten";
// Wunschfragen-Chips unter der Leiste (aus defaultMessages): höchstens so viele
export const INLINE_CHIPS_MAX = 6;

// Grenzen (Widget-seitig geklemmt, unabhängig davon was gespeichert ist)
export const INLINE_MIN_HEIGHT_PX = 400;
export const INLINE_MAX_HEIGHT_PX = 1200;
export const INLINE_MIN_WIDTH_PX = 280;
export const WINDOW_MIN_WIDTH_PX = 320;
export const WINDOW_MIN_HEIGHT_PX = 400;
export const OFFSET_MAX_PX = 200;
export const INLINE_TEXT_MAX_LEN = 120;
export const INLINE_SEND_TEXT_MAX_LEN = 40; // Knopf neben dem Eingabefeld
export const THEME_VALUES = ["light", "dark", "auto"];
// Kurskarten unter Antworten (utils/courseCards.js): "off" | "auto"
export const COURSE_CARDS_VALUES = ["off", "auto"];
// Inline-Box: im Seitenfluss (flow, Standard) oder schwebend über dem
// nachfolgenden Inhalt (overlay); Aufklapp-Effekt nur auf ausdrücklichen
// Wunsch: ohne Angabe (null) klappt die Box im Seitenfluss ohne Animation auf
// wie bisher, schwebend gilt expand (resolveInlineEffect).
export const INLINE_LAYOUT_VALUES = ["flow", "overlay"];
export const INLINE_EFFECT_VALUES = ["expand", "grow", "spring", "float"];
export const DEFAULT_INLINE_LAYOUT = "flow";
export const DEFAULT_INLINE_EFFECT = null;
export const DEFAULT_OVERLAY_EFFECT = "expand";

// Zahl (max. 4 Stellen, optional 2 Nachkommastellen) + Einheit. Eine nackte
// Zahl wird als px interpretiert.
function cssLength(value, units) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    value = String(value);
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  const m = /^(\d{1,4}(?:\.\d{1,2})?)(px|%|vw|vh)?$/.exec(v);
  if (!m) return undefined;
  const unit = m[2] || "px";
  if (!units.includes(unit)) return undefined;
  if (Number(m[1]) <= 0) return undefined;
  return `${m[1]}${unit}`;
}

// Groß-/Kleinschreibung egal ("Inline" == "inline"), Rückgabe kleingeschrieben.
function oneOf(value, allowed) {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  return allowed.includes(v) ? v : undefined;
}

function intRange(value, min, max) {
  let n = value;
  if (typeof n === "string") {
    const m = /^\s*(\d{1,3})\s*(px)?\s*$/i.exec(n);
    if (!m) return undefined;
    n = Number(m[1]);
  }
  if (typeof n !== "number" || !Number.isInteger(n)) return undefined;
  if (n < min || n > max) return undefined;
  return n;
}

function bool(value) {
  if (value === true || value === false) return value;
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (["true", "on", "1", "yes", ""].includes(v)) return true; // data-inherit-font (ohne Wert) = an
  if (["false", "off", "0", "no"].includes(v)) return false;
  return undefined;
}

function shortText(value, maxLen = INLINE_TEXT_MAX_LEN) {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (v.length === 0 || v.length > maxLen) return undefined;
  return v;
}

// Validatoren je Setting (von useScriptAttributes für Script- UND Server-Werte
// genutzt). Rückgabe undefined = verwerfen.
export const layoutValidations = {
  displayMode: (v) => oneOf(v, ["bubble", "inline"]),
  mount: (v) =>
    typeof v === "string" && v.trim().length > 0 && v.trim().length <= 200
      ? v.trim()
      : undefined,
  windowWidth: (v) => cssLength(v, ["px", "%", "vw", "vh"]),
  windowHeight: (v) => cssLength(v, ["px", "%", "vw", "vh"]),
  offsetX: (v) => intRange(v, 0, OFFSET_MAX_PX),
  offsetY: (v) => intRange(v, 0, OFFSET_MAX_PX),
  inlineCollapsedText: (v) => shortText(v),
  // Leiste als Eingabefeld mit Absende-Knopf + Wunschfragen-Chips (nur Inline)
  inlineInput: bool,
  inlineInputPlaceholder: (v) => shortText(v),
  inlineSendText: (v) => shortText(v, INLINE_SEND_TEXT_MAX_LEN),
  inlineHeight: (v) => cssLength(v, ["px", "vh"]),
  inlineMaxWidth: (v) => cssLength(v, ["px"]),
  inlineStartState: (v) => oneOf(v, ["collapsed", "expanded"]),
  // explizit "light" | "dark"; leer/ungültig -> verworfen -> Standard null
  // (Leiste folgt dem Fenster-Theme, utils/theme.js resolveBarTheme)
  inlineTheme: (v) => oneOf(v, ["light", "dark"]),
  inheritFont: bool,
  // Kurskarten aus den Kurs-Metadaten der Antwort-Quellen (opt-in);
  // ungültig -> verworfen -> Standard "off"
  courseCards: (v) => oneOf(v, COURSE_CARDS_VALUES),
  // Inline-Box schwebend (overlay) und Aufklapp-Effekt; ungültig -> verworfen,
  // die Warnung (mit dem tatsächlich geltenden Wert) schreibt
  // warnInvalidInlineEnums nach dem Zusammenführen von Script und Server.
  inlineLayout: (v) => oneOf(v, INLINE_LAYOUT_VALUES),
  inlineEffect: (v) => oneOf(v, INLINE_EFFECT_VALUES),
  // Theme des ganzen Fensters (CSS-Variablen, utils/theme.js). Ungültig ->
  // eine Warnung, Feld fällt weg -> nächstniedrigerer Wert (Standard "light").
  theme: (v) => {
    const t = oneOf(v, THEME_VALUES);
    if (t === undefined)
      console.warn(
        `[AnythingLLM Embed] Ungültiger theme-Wert ${JSON.stringify(v)} — erlaubt: ${THEME_VALUES.join(", ")}. Es gilt der Standard "light".`,
      );
    return t;
  },
};

// Ungültige inlineLayout-/inlineEffect-Werte: je Quelle eine console.warn-Zeile,
// die den tatsächlich geltenden Wert nennt (gültiger Wert der anderen Quelle
// bzw. Standard). script/server = Rohwerte (Script-Attribute bzw. nicht leere
// visual_config-Werte), settings = fertig zusammengeführte Settings.
const ENUM_SOURCES = [
  ["script", "Script-Attribut"],
  ["server", "Design Center"],
];
export function warnInvalidInlineEnums(
  script = {},
  server = {},
  settings = {},
) {
  const raw = { script, server };
  for (const [key, allowed] of [
    ["inlineLayout", INLINE_LAYOUT_VALUES],
    ["inlineEffect", INLINE_EFFECT_VALUES],
  ]) {
    const valid = (src) => oneOf(raw[src][key], allowed) !== undefined;
    for (const [src, label] of ENUM_SOURCES) {
      const value = raw[src][key];
      if (value === undefined || value === null || value === "" || valid(src))
        continue;
      const origin = valid("server")
        ? "Design Center"
        : valid("script")
          ? "Script-Attribut"
          : "Standard";
      const effective =
        key === "inlineLayout"
          ? `"${settings.inlineLayout}"`
          : resolveInlineEffect(settings)
            ? `"${resolveInlineEffect(settings)}"`
            : "keine Animation";
      console.warn(
        `[AnythingLLM Embed] Ungültiger ${key}-Wert ${JSON.stringify(value)} (${label}) — erlaubt: ${allowed.join(", ")}. Wert wird verworfen, es gilt ${effective} (${origin}).`,
      );
    }
  }
}

// inlineInput gilt nur im Inline-Modus. Wird das Widget als Blase gezeigt
// (displayMode "bubble" oder Platzhalter fehlt), bleibt die Blase unverändert;
// eine Warnzeile weist auf das ignorierte Attribut hin. Rückgabe: gewarnt?
export function warnIfInlineInputIgnored(settings = {}, isInline = false) {
  if (isInline || settings.inlineInput !== true) return false;
  console.warn(
    "[AnythingLLM Embed] inlineInput (data-inline-input) wirkt nur im Inline-Modus — wird in der Chat-Blase ignoriert.",
  );
  return true;
}

// Wunschfragen-Chips: defaultMessages (Liste von Strings), leere/Nicht-Strings
// verworfen, höchstens INLINE_CHIPS_MAX.
export function inlineChips(settings = {}) {
  const list = Array.isArray(settings.defaultMessages)
    ? settings.defaultMessages
    : [];
  return list
    .filter((m) => typeof m === "string" && m.trim().length > 0)
    .map((m) => m.trim())
    .slice(0, INLINE_CHIPS_MAX);
}

// ---------------------------------------------------------------------------
// Blase: CSS für Fenstergröße/Randabstand (nur Tablet/Desktop >=768px; mobil
// bleibt Vollbild). Liefert "" wenn nichts gesetzt ist -> exakt bisheriges
// Verhalten. Werte kommen validiert aus layoutValidations; hier zusätzlich
// nochmals gegen die Whitelist geprüft, bevor sie in CSS-Text gehen.
// ---------------------------------------------------------------------------
export function bubbleWindowCss(settings = {}, position = "bottom-right") {
  const width = layoutValidations.windowWidth(settings.windowWidth);
  const height = layoutValidations.windowHeight(settings.windowHeight);
  const offX = layoutValidations.offsetX(settings.offsetX);
  const offY = layoutValidations.offsetY(settings.offsetY);
  const rules = [];
  const sideX = position.includes("left") ? "left" : "right";
  const sideY = position.includes("top") ? "top" : "bottom";
  const edgeX = Math.max(32, (offX ?? 16) + 16);
  const edgeY = Math.max(32, (offY ?? 16) + 16);
  if (width)
    rules.push(
      `width: min(max(${WINDOW_MIN_WIDTH_PX}px, ${width}), calc(100vw - ${edgeX}px)) !important;`,
      "max-width: none !important;",
    );
  if (height)
    rules.push(
      `height: min(max(${WINDOW_MIN_HEIGHT_PX}px, ${height}), calc(100vh - ${edgeY}px)) !important;`,
      "max-height: none !important;",
    );
  if (offX !== undefined) rules.push(`margin-${sideX}: ${offX}px !important;`);
  if (offY !== undefined) rules.push(`margin-${sideY}: ${offY}px !important;`);
  if (rules.length === 0) return "";
  return `@media (min-width: 768px) { #anything-llm-chat.allm-bubble-window { ${rules.join(" ")} } }`;
}

// Blase: Randabstand des Open-Buttons (alle Breakpoints, wie die bisherigen
// allm-ml-4/allm-mr-4/allm-mb-4). undefined -> Klassen-Default (16px) bleibt.
export function bubbleButtonStyle(settings = {}, position = "bottom-right") {
  const offX = layoutValidations.offsetX(settings.offsetX);
  const offY = layoutValidations.offsetY(settings.offsetY);
  const style = {};
  if (offX !== undefined) {
    if (position.includes("left")) style.marginLeft = `${offX}px`;
    else style.marginRight = `${offX}px`;
  }
  if (offY !== undefined) style.marginBottom = `${offY}px`;
  return style;
}

// Inline: Höhe der aufgeklappten Box (fest, wächst NICHT mit dem Inhalt).
// Nur Tablet/Desktop (>=768px) — mobil gibt es keine Box, nur das Vollbild.
export function inlineBoxStyle(settings = {}) {
  const h =
    layoutValidations.inlineHeight(settings.inlineHeight) ||
    DEFAULT_INLINE_HEIGHT;
  return {
    height: `clamp(${INLINE_MIN_HEIGHT_PX}px, ${h}, ${INLINE_MAX_HEIGHT_PX}px)`,
    maxHeight: "calc(100vh - 32px)", // nie höher als der sichtbare Bereich
  };
}

// Inline: Höhe der Box in px (wie inlineBoxStyle, für die Überlauf-Prüfung
// des Overlays vor dem Aufklappen).
export function inlineBoxHeightPx(settings = {}, viewportHeight = 0) {
  const h =
    layoutValidations.inlineHeight(settings.inlineHeight) ||
    DEFAULT_INLINE_HEIGHT;
  const n = parseFloat(h);
  const px = h.endsWith("vh") ? (n * viewportHeight) / 100 : n;
  const clamped = Math.min(
    Math.max(px, INLINE_MIN_HEIGHT_PX),
    INLINE_MAX_HEIGHT_PX,
  );
  return viewportHeight > 0 ? Math.min(clamped, viewportHeight - 32) : clamped;
}

// Inline: schwebt die aufgeklappte Box (inlineLayout "overlay")? Werte
// kommen validiert aus loadEmbedSettings; alles andere = flow.
export function isInlineOverlay(settings = {}) {
  return settings.inlineLayout === "overlay";
}

// Inline: wirksamer Aufklapp-Effekt. Ausdrücklich gesetzt -> dieser; ohne
// (gültige) Angabe: schwebend (overlay) "expand", im Seitenfluss null = keine
// Animation (verhaltensgleich zu vorher).
export function resolveInlineEffect(settings = {}) {
  if (INLINE_EFFECT_VALUES.includes(settings.inlineEffect))
    return settings.inlineEffect;
  return isInlineOverlay(settings) ? DEFAULT_OVERLAY_EFFECT : null;
}

// Inline: Klassen des Aufklapp-Effekts (Animation in main.jsx, customCss);
// "" = keine Animation.
export function inlineEffectClass(settings = {}) {
  const effect = resolveInlineEffect(settings);
  return effect ? `allm-effect allm-effect-${effect}` : "";
}

// Overlay-Fallback: schneidet ein Vorfahre des Platzhalters (overflow
// hidden/clip, contain: paint) die schwebende Box unten ab, bleibt die Box im
// Seitenfluss. boxBottom = Unterkante der Box im Viewport (px). Rückgabe: das
// beschneidende Element oder null. body/html zählen nicht (deren overflow
// wirkt auf den Viewport, der scrollt).
export function findClippingAncestor(mount, boxBottom) {
  for (
    let el = mount;
    el &&
    el.nodeType === 1 &&
    el !== document.body &&
    el !== document.documentElement;
    el = el.parentElement
  ) {
    const cs = getComputedStyle(el);
    const clips =
      /hidden|clip/.test(`${cs.overflow} ${cs.overflowX} ${cs.overflowY}`) ||
      /paint|strict|content/.test(cs.contain || "");
    if (clips && el.getBoundingClientRect().bottom < boxBottom - 1) return el;
  }
  return null;
}

// Inline: optionale Maximalbreite (zentriert), sonst volle Container-Breite.
export function inlineMaxWidth(settings = {}) {
  const w = layoutValidations.inlineMaxWidth(settings.inlineMaxWidth);
  if (!w) return undefined;
  return `${Math.max(INLINE_MIN_WIDTH_PX, parseFloat(w))}px`;
}

// Elemente, in die der Chat nicht eingehängt werden kann/darf (void-,
// Ersetz- und Formular-Elemente, Metadaten).
const UNSUITABLE_MOUNT_TAGS = new Set(
  (
    "html head body script style link meta title template noscript input " +
    "textarea select option button img picture source track br hr wbr area " +
    "iframe frame object embed video audio canvas svg math"
  ).split(" "),
);

function isSuitableMountTarget(el, host) {
  if (!el || el.nodeType !== 1) return false;
  // Host selbst bzw. ein Vorfahre des Hosts (z. B. data-mount="body") -> nein
  if (host && (el === host || el.contains(host))) return false;
  // nur HTML-Elemente (SVG/MathML-Kinder haben einen anderen Namespace)
  if (el.namespaceURI && el.namespaceURI !== "http://www.w3.org/1999/xhtml")
    return false;
  return !UNSUITABLE_MOUNT_TAGS.has(el.tagName.toLowerCase());
}

// Platzhalter suchen. Ungültiger Selektor oder ungeeignetes Ziel -> null
// (Fallback Blase), kein Crash. Mehrere Treffer -> erster, mit Warnung.
export function findMountTarget(selector, host = null) {
  const sel = layoutValidations.mount(selector) || DEFAULT_MOUNT_SELECTOR;
  let matches;
  try {
    matches = document.querySelectorAll(sel);
  } catch (e) {
    console.warn(
      `[AnythingLLM Embed] Ungültiger data-mount-Selektor "${sel}" — Chat-Blase wird verwendet.`,
    );
    return null;
  }
  if (matches.length === 0) {
    console.warn(
      `[AnythingLLM Embed] Inline-Modus: Platzhalter "${sel}" nicht gefunden — Chat-Blase wird verwendet.`,
    );
    return null;
  }
  if (matches.length > 1)
    console.warn(
      `[AnythingLLM Embed] Platzhalter "${sel}" ${matches.length}x gefunden — der erste wird verwendet.`,
    );
  const target = matches[0];
  if (!isSuitableMountTarget(target, host)) {
    console.warn(
      `[AnythingLLM Embed] Platzhalter "${sel}" ist als Einhängeort ungeeignet (<${target.tagName.toLowerCase()}>) — Chat-Blase wird verwendet.`,
    );
    return null;
  }
  return target;
}

// Wartet (falls nötig) bis DOMContentLoaded, damit ein Platzhalter, der im HTML
// NACH dem Script steht, noch gefunden wird.
export function whenDomReady() {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) =>
    document.addEventListener("DOMContentLoaded", () => resolve(), {
      once: true,
    }),
  );
}
