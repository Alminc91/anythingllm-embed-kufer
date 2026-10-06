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
// Kurskarten über ("above") oder unter ("below", Standard) der Antwort
export const COURSE_CARDS_POSITION_VALUES = ["below", "above"];
export const DEFAULT_COURSE_CARDS_POSITION = "below";
// Inline-Box: im Seitenfluss (flow, Standard) oder schwebend über dem
// nachfolgenden Inhalt (overlay); Aufklapp-Effekt nur auf ausdrücklichen
// Wunsch: ohne Angabe (null) klappt die Box im Seitenfluss ohne Animation auf
// wie bisher, schwebend gilt expand (resolveInlineEffect). "morph": die
// Leiste wächst zum Panel (Maße/Rundung per CSS-Transition, InlineChat).
export const INLINE_LAYOUT_VALUES = ["flow", "overlay"];
export const INLINE_EFFECT_VALUES = [
  "expand",
  "grow",
  "spring",
  "float",
  "morph",
];
export const DEFAULT_INLINE_LAYOUT = "flow";
export const DEFAULT_INLINE_EFFECT = null;
export const DEFAULT_OVERLAY_EFFECT = "expand";
// Eingabe-Leiste (inlineInput): Öffnen schon beim Zeiger-Klick ins Feld
// ("focus") statt erst beim Absenden ("submit", Standard).
export const INLINE_OPEN_ON_VALUES = ["submit", "focus"];
export const DEFAULT_INLINE_OPEN_ON = "submit";

// Panel-Optik (Mockup „Wunschfragen im Panel“), alles opt-in; Standard =
// bisherige Darstellung. Vorschläge im leeren Chat als Balken ("bars") oder
// kleine Pillen ("pills"); Begrüßung als zentrierter Text ("text") oder als
// Assistenten-Blase ("bubble", der greeting-Text steht dann klein darunter).
export const SUGGESTION_STYLE_VALUES = ["bars", "pills"];
export const GREETING_STYLE_VALUES = ["text", "bubble"];
// Datenschutz-Hinweis: keiner ("none"), als Absätze in der Begrüßungsblase
// ("bubble", ohne Bestätigung) oder einmalig als Karte beim ersten Öffnen
// ("modal", Bestätigung per Knopf, gespeichert in localStorage).
export const PRIVACY_NOTICE_VALUES = ["none", "bubble", "modal"];
export const PANEL_PILLS_MAX = 6;
export const PANEL_PILL_TEXT_MAX = 60; // längere Wunschfragen: gekürzt mit …
export const GREETING_BUBBLE_TEXT_MAX_LEN = 300;
export const ASSISTANT_SUBTITLE_MAX_LEN = 60;
export const PRIVACY_TITLE_MAX_LEN = 120;
// privacyText: ein Stichpunkt je Zeile (Zeilenumbruch oder "|"), höchstens
// 5 Punkte mit je höchstens 160 Zeichen; Rohtext höchstens 1000 Zeichen.
export const PRIVACY_POINTS_MAX = 5;
export const PRIVACY_POINT_MAX_LEN = 160;
export const PRIVACY_TEXT_MAX_LEN = 1000;
export const PRIVACY_BUTTON_TEXT_MAX_LEN = 40;
// Fester KI-Hinweis unter dem Eingabefeld ("footer") statt vom Modell
// erzeugt; Text disclaimerText (max. 160 Zeichen) bzw. PANEL_TEXTS.aiDisclaimer.
export const DISCLAIMER_VALUES = ["none", "footer"];
export const DISCLAIMER_TEXT_MAX_LEN = 160;
export const URL_MAX_LEN = 512;

// Standardtexte der Panel-Optik, des Datenschutz- und des KI-Hinweises —
// EIN Mechanismus für alle diese Texte (panelTexts): Sprache des Widgets
// (settings.language) "en" -> englisch, alles andere (fehlend, ungültig, eine
// Sprache ohne eigene Texte wie "fr") -> deutsch. Absichtlich nicht über
// i18next: ohne data-language stünde dort Englisch, und Sprachen ohne diese
// Texte fielen auf Englisch zurück (gemischte Sprachen im Panel).
// Datenschutz-Punkte sachlich, keine Rechtsberatung; Kunden ersetzen sie
// über privacyText.
export const PANEL_TEXTS = {
  de: {
    greetingBubble:
      "Hallo! Ich bin Ihr KI-Kursberater. Beschreiben Sie, was Sie suchen, ich finde den passenden Kurs.",
    privacyTitle: "Datenschutz:",
    privacyPoints: [
      "Der KI-Kursberater läuft auf eigener Infrastruktur in Deutschland. Ihre Daten bleiben bei der Volkshochschule und werden nach DSGVO verarbeitet.",
      "Der Chatverlauf wird für die Qualitätssicherung gespeichert und kann von unserem Team eingesehen werden.",
      "Dies ist eine Maschine (KI). Bitte geben Sie keine personenbezogenen Daten ein.",
    ],
    privacyButton: "Start",
    privacyMoreLead: "Weitere Informationen in der ",
    privacyMoreLink: "Erklärung zum Datenschutz",
    privacyBubbleLink: "Datenschutz",
    important: "Wichtig:",
    online: "online",
    aiDisclaimer:
      "Ich bin eine KI und kann Fehler machen. Bitte überprüfen Sie meine Antworten.",
  },
  en: {
    greetingBubble:
      "Hello! I am your AI course advisor. Describe what you are looking for and I will find the right course.",
    privacyTitle: "Privacy:",
    privacyPoints: [
      "The AI course advisor runs on its own infrastructure in Germany. Your data stays with the adult education centre and is processed in accordance with the GDPR.",
      "The chat history is stored for quality assurance and can be viewed by our team.",
      "This is a machine (AI). Please do not enter any personal data.",
    ],
    privacyButton: "Start",
    privacyMoreLead: "More information in our ",
    privacyMoreLink: "privacy statement",
    privacyBubbleLink: "Privacy",
    important: "Important:",
    online: "online",
    aiDisclaimer:
      "I am an AI and can make mistakes. Please double-check my answers.",
  },
};
// Sprache der Panel-Texte: Sprachcode (2 Buchstaben, optional Region wie
// "en-GB"/"en_US"), nur Sprachen mit eigenen Texten; sonst "de".
export function panelLanguage(settings = {}) {
  const raw = typeof settings?.language === "string" ? settings.language : "";
  const m = /^([a-z]{2})(?:[-_][a-z0-9]{1,8})?$/i.exec(raw.trim());
  const lang = m ? m[1].toLowerCase() : "de";
  return Object.prototype.hasOwnProperty.call(PANEL_TEXTS, lang) ? lang : "de";
}
export function panelTexts(settings = {}) {
  return PANEL_TEXTS[panelLanguage(settings)];
}
export const DEFAULT_GREETING_BUBBLE_TEXT = PANEL_TEXTS.de.greetingBubble;
export const DEFAULT_PRIVACY_TITLE = PANEL_TEXTS.de.privacyTitle;
export const DEFAULT_PRIVACY_POINTS = PANEL_TEXTS.de.privacyPoints;
export const DEFAULT_PRIVACY_BUTTON_TEXT = PANEL_TEXTS.de.privacyButton;

// privacyText -> Stichpunkte (Zeilenumbruch oder "|"), leere verworfen.
export function splitPrivacyPoints(text) {
  if (typeof text !== "string") return [];
  return text
    .split(/\r?\n|\|/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// Wirksame Datenschutz-Punkte: privacyText bzw. Standard der Sprache.
export function privacyPoints(settings = {}) {
  const own = splitPrivacyPoints(settings.privacyText);
  return own.length > 0 ? own : panelTexts(settings).privacyPoints;
}

// Begrüßung als Blase: greetingStyle "bubble" oder Datenschutz in der Blase
// (privacyNotice "bubble" setzt die Blase voraus).
export function greetingAsBubble(settings = {}) {
  return (
    settings.greetingStyle === "bubble" || settings.privacyNotice === "bubble"
  );
}

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

// Datenschutz-Stichpunkte: 1–5 Punkte mit je höchstens 160 Zeichen, sonst
// verworfen (nicht gekürzt). Rückgabe normalisiert: ein Punkt je Zeile.
function privacyTextValue(value) {
  const v = shortText(value, PRIVACY_TEXT_MAX_LEN);
  if (v === undefined) return undefined;
  const points = splitPrivacyPoints(v);
  if (
    points.length === 0 ||
    points.length > PRIVACY_POINTS_MAX ||
    points.some((p) => p.length > PRIVACY_POINT_MAX_LEN)
  )
    return undefined;
  return points.join("\n");
}

// Link (Datenschutz): absolute https-URL oder Pfad der eigenen Seite ("/…",
// nicht "//…" und nicht "/\…": Browser lesen den Backslash wie "/", das wäre
// ein fremder Host), ohne Leer-/Steuerzeichen und ohne Backslash (überall),
// höchstens URL_MAX_LEN Zeichen.
function safeUrl(value) {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v || v.length > URL_MAX_LEN || /[\s\u0000-\u001f\u007f\\]/.test(v))
    return undefined;
  if (/^\/(?![\/\\])/.test(v)) return v;
  try {
    return new URL(v).protocol === "https:" ? v : undefined;
  } catch (e) {
    return undefined;
  }
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
  // Position der Kurskarten; ungültig -> verworfen -> Standard "below"
  courseCardsPosition: (v) => oneOf(v, COURSE_CARDS_POSITION_VALUES),
  // Inline-Box schwebend (overlay) und Aufklapp-Effekt; ungültig -> verworfen,
  // die Warnung (mit dem tatsächlich geltenden Wert) schreibt
  // warnInvalidInlineEnums nach dem Zusammenführen von Script und Server.
  inlineLayout: (v) => oneOf(v, INLINE_LAYOUT_VALUES),
  inlineEffect: (v) => oneOf(v, INLINE_EFFECT_VALUES),
  // Öffnen bei Zeiger-Klick: ungültig -> verworfen, Warnung wie oben
  // (warnInvalidInlineEnums)
  inlineOpenOn: (v) => oneOf(v, INLINE_OPEN_ON_VALUES),
  // Panel-Optik und Datenschutz-Hinweis: Enums ungültig -> verworfen,
  // Warnung wie oben (warnInvalidInlineEnums); Texte getrimmt mit Höchstlänge
  // (zu lang -> verworfen, nicht gekürzt), gerendert immer als Text.
  suggestionStyle: (v) => oneOf(v, SUGGESTION_STYLE_VALUES),
  greetingStyle: (v) => oneOf(v, GREETING_STYLE_VALUES),
  greetingBubbleText: (v) => shortText(v, GREETING_BUBBLE_TEXT_MAX_LEN),
  assistantSubtitle: (v) => shortText(v, ASSISTANT_SUBTITLE_MAX_LEN),
  onlineDot: bool,
  privacyNotice: (v) => oneOf(v, PRIVACY_NOTICE_VALUES),
  privacyTitle: (v) => shortText(v, PRIVACY_TITLE_MAX_LEN),
  privacyText: privacyTextValue,
  privacyButtonText: (v) => shortText(v, PRIVACY_BUTTON_TEXT_MAX_LEN),
  privacyUrl: safeUrl,
  disclaimer: (v) => oneOf(v, DISCLAIMER_VALUES),
  disclaimerText: (v) => shortText(v, DISCLAIMER_TEXT_MAX_LEN),
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

// Ungültige inlineLayout-/inlineEffect-Werte (ebenso inlineOpenOn):
// je Quelle eine console.warn-Zeile, die den tatsächlich geltenden Wert nennt
// (gültiger Wert der anderen Quelle bzw. Standard). script/server = Rohwerte
// (Script-Attribute bzw. nicht leere visual_config-Werte), settings = fertig
// zusammengeführte Settings.
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
    ["inlineOpenOn", INLINE_OPEN_ON_VALUES],
    ["suggestionStyle", SUGGESTION_STYLE_VALUES],
    ["greetingStyle", GREETING_STYLE_VALUES],
    ["privacyNotice", PRIVACY_NOTICE_VALUES],
    ["disclaimer", DISCLAIMER_VALUES],
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
        key !== "inlineEffect"
          ? `"${settings[key]}"`
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

// Pillen im Panel (suggestionStyle "pills"): wie die Chips, höchstens
// PANEL_PILLS_MAX; { text: vollständige Frage (wird gesendet), label: Anzeige,
// ab PANEL_PILL_TEXT_MAX Zeichen mit … gekürzt }.
export function panelPills(settings = {}) {
  return inlineChips(settings)
    .slice(0, PANEL_PILLS_MAX)
    .map((text) => ({
      text,
      label:
        text.length > PANEL_PILL_TEXT_MAX
          ? `${text.slice(0, PANEL_PILL_TEXT_MAX - 1).trimEnd()}…`
          : text,
    }));
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

// Inline: eingestellte Höhe der Box (validiert, px oder vh), sonst Standard.
// Gemeinsame Quelle für inlineBoxStyle (CSS) und inlineBoxHeightPx (Messung).
export function resolveInlineHeight(settings = {}) {
  return (
    layoutValidations.inlineHeight(settings.inlineHeight) ||
    DEFAULT_INLINE_HEIGHT
  );
}

// Inline: Höhe der aufgeklappten Box (fest, wächst NICHT mit dem Inhalt).
// Nur Tablet/Desktop (>=768px) — mobil gibt es keine Box, nur das Vollbild.
export function inlineBoxStyle(settings = {}) {
  const h = resolveInlineHeight(settings);
  return {
    height: `clamp(${INLINE_MIN_HEIGHT_PX}px, ${h}, ${INLINE_MAX_HEIGHT_PX}px)`,
    maxHeight: "calc(100vh - 32px)", // nie höher als der sichtbare Bereich
  };
}

// Inline: Höhe der Box in px (wie inlineBoxStyle, für die Überlauf-Prüfung
// des Overlays vor dem Aufklappen).
export function inlineBoxHeightPx(settings = {}, viewportHeight = 0) {
  const h = resolveInlineHeight(settings);
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

// Eingabe-Leiste: öffnet schon der Zeiger-Klick ins Feld (inlineOpenOn "focus")?
export function opensOnPointer(settings = {}) {
  return settings.inlineInput === true && settings.inlineOpenOn === "focus";
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
