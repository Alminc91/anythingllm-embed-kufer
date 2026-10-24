import { useEffect, useState } from "react";
import { embedderSettings } from "../main";
import {
  DEFAULT_COURSE_CARDS_POSITION,
  DEFAULT_COURSE_CARDS_LAYOUT,
  DEFAULT_INLINE_COLLAPSED_TEXT,
  DEFAULT_INLINE_EFFECT,
  DEFAULT_INLINE_HEIGHT,
  DEFAULT_INLINE_LAYOUT,
  DEFAULT_INLINE_OPEN_ON,
  DEFAULT_MOUNT_SELECTOR,
  applyFixedStandards,
  dropLegacyDefaults,
  layoutValidations,
  warnInvalidInlineEnums,
} from "@/utils/layout";
import { applyTheme, userTextColorFor, DEFAULT_ACCENT } from "@/utils/theme";
import { syncI18nLanguage } from "@/i18n";
import { widgetLanguage } from "@/utils/language";

// Rangfolge der Einbau-Angaben (Fixliste 7.22-rc17, E23 und E24):
// - Gruppe A (DC_COVERED): im Design Center 2.0 einstellbar (je ein Feld im
//   Reiter Aussehen oder Inhalt, Fork EmbedAppearance/AppearanceTab.jsx und
//   ContentTab.jsx). Es gilt nur das Design Center: der Wert vom Server
//   (gespeichert oder sein Standard), sonst der Standard des Widgets. Skript-
//   Angaben werden vor dem Zusammenführen verworfen, auch wenn nichts
//   gespeichert ist; CSS-Variablen der Seite wirken dafür ebenfalls nicht
//   (utils/theme.js, Variablen mit dc).
// - Gruppe B: feste Standards ohne Feld (FIXED_STANDARDS, INLINE_STANDARDS
//   und die übrige Optik). Die Skript-Angabe schlägt den Wert vom Server.
// - Gruppe C: Technik und Verhalten (Widget-ID, Adresse, Sprache, data-mount,
//   data-username, KI-Overrides, Audio, Öffnen beim Laden, Menütexte,
//   Sponsor-Zeile): wirken immer.
// - E24: Der KI-Hinweis (disclaimer, disclaimerText) ist auf keinem Weg
//   abschaltbar oder änderbar (utils/layout.js LOCKED_STANDARDS), ebenso
//   der Link „Datenschutz“ und die Begrüßung als Blase.
export const DC_COVERED = [
  "displayMode", // Darstellung
  "theme", // Farbschema
  "buttonColor", // Akzentfarbe (der Server liefert sie als diese drei)
  "userBgColor",
  "linkColor",
  "userTextColor", // Schrift auf der Akzentfarbe
  "brandImageUrl", // Logo (Kopfzeile und Avatar)
  "assistantIcon",
  "chatIcon", // Chat-Icon
  "position", // Position des Chat-Buttons
  "courseCards", // Kurse anzeigen als
  "courseCardsPosition", // Reihenfolge
  "brandText", // Name (Kopfzeile und über den Antworten)
  "assistantName",
  "assistantSubtitle", // Untertitel
  "greeting", // Begrüßungstext
  "greetingBubbleText",
  "greetingStyle", // Begrüßung (seit 7.23 immer als Blase, ohne Feld)
  "privacyNotice", // Datenschutz-Hinweis (seit 7.23 immer der Link)
  "privacyTitle",
  "privacyText",
  "privacyUrl",
  "defaultMessages", // Startvorschläge
  "sendMessageText", // Platzhalter im Eingabefeld
  "chatbotBubblesMessages", // Willkommensblasen (Texte und Anzeige)
  "displayChatbotBubbles",
  "bubblePersistence",
  "welcomeBubblesDesktop",
  "welcomeBubblesMobile",
  "supportEmail", // Support-E-Mail
];
// Ohne Wirkung, aber nicht aus dem Design Center: der KI-Hinweis (E24) und
// Altangaben, die schon früher nichts bewirkten (Fenstergröße: Bestands-
// Snippets enthalten laut altem ATTRIBUTES.md-Beispiel data-window-height
// "77%" und data-window-width "25%"; Online-Punkt: im Kopf entfallen).
const IGNORED_HINTS = {
  disclaimer: "Der KI-Hinweis ist fest und lässt sich nicht abschalten.",
  disclaimerText: "Der Text des KI-Hinweises ist fest.",
  windowWidth: "Die Fenstergröße ist fest.",
  windowHeight: "Die Fenstergröße ist fest.",
  onlineDot: "Den Online-Punkt gibt es nicht mehr.",
};
const DC_HINTS = {
  bubblePersistence:
    "Für „einmal je Besuch“ im Design Center unter „Willkommensblasen anzeigen“ die Option „Bei jedem Besuch“ wählen.",
  privacyNotice:
    "Der Datenschutz-Hinweis erscheint immer als Link „Datenschutz“ unter der Eingabe.",
  greetingStyle: "Die Begrüßung erscheint immer als Blase.",
};
// Vom Server bestimmt, auch gegen eine Skript-Angabe (Widget-Einstellung
// „Frühere Chats“, KIE-503; kein Feld des Design Centers)
const SERVER_WINS = ["historyEnabled"];

// data-Attribut zum Schlüssel im dataset (buttonColor -> data-button-color)
function dataAttributeName(key) {
  return `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

// Gruppe A und wirkungslose Angaben aus den Skript-Attributen entfernen,
// eine Warnung je entfernter Angabe (Fixliste 7.22-rc17 W50).
export function dropIneffectiveAttributes(dataset = {}) {
  const out = { ...dataset };
  for (const key of Object.keys(out)) {
    const dc = DC_COVERED.includes(key);
    const ignored = Object.prototype.hasOwnProperty.call(IGNORED_HINTS, key);
    if (!dc && !ignored) continue;
    delete out[key];
    const hint = dc
      ? DC_HINTS[key] ||
        "Diese Einstellung kommt aus dem Design Center (gespeichert oder Standard)."
      : IGNORED_HINTS[key];
    console.warn(
      `[AnythingLLM Embed] Einbau-Angabe ${dataAttributeName(key)} wirkt nicht. ${hint}`,
    );
  }
  return out;
}

// Leerer Server-Wert ist hier eine Angabe (nicht „nicht gesetzt“):
// assistantSubtitle "" = kein Untertitel (Fixliste 7.22-rc8 R5; fehlt der
// Wert, gilt der Standard der Sprache). Eine leere Überschrift des
// Datenschutz-Fensters gilt seit 7.23 wie der Standard (W10), wie jeder
// andere leere Wert.
const EMPTY_MEANS_NONE = ["assistantSubtitle"];
// Kennzeichen der Startvorschläge vom Server (Vertrag mit dem Fork, GET
// /embed/:id/config, Fixliste 7.22-rc13 F02): defaultMessagesSaved = im
// Design Center gespeichert, auch als leere Liste; defaultMessagesStandard =
// nichts gespeichert, die Liste ist der Standard der Sprache (seit E42,
// 7.22-rc23, leer: keine Startvorschläge; das Widget hat keine eigene
// Standardliste, DEFAULT_SETTINGS.defaultMessages []). Beide werden
// nach dem Auflösen entfernt (applyDefaultMessagesOrder).
const DEFAULT_MESSAGES_SAVED = "defaultMessagesSaved";
const DEFAULT_MESSAGES_STANDARD = "defaultMessagesStandard";

// Rohe Script-Attribute (data-*), wie die Seite sie gesetzt hat, bevor
// embedderSettings.settings mit den aufgelösten Werten überschrieben wird.
// Für Hinweise, die nur bei einem Attribut der Seite gelten
// (warnIfInlineInputIgnored), nicht bei festen Standards des Servers.
let scriptDataset = {};
export function scriptAttributes() {
  return scriptDataset;
}

export const DEFAULT_SETTINGS = {
  embedId: null, //required
  baseApiUrl: null, // required

  // Override properties that can be defined.
  prompt: null, // override
  model: null, // override
  temperature: null, //override
  showThoughts: false, // show the AI's thought process in responses.

  // style parameters
  chatIcon: "chatBubble",
  brandImageUrl:
    "https://www.kufer.de/typo3conf/ext/kubuslayout/Resources/Public/Icons/augenbrauen-3.png", // will be forced into 100x50px container
  // Name im Kopf; null = Standardname der Sprache (PANEL_TEXTS
  // assistantName „KI-Berater“ bzw. „AI Advisor“, applyFixedStandards)
  brandText: null,
  // Begrüßungstext = Text der Begrüßungsblase (utils/layout.js greetingText:
  // greetingBubbleText > greeting > Standard der Sprache). null = Standard.
  // Früher stand hier der Datenschutzsatz; der steht jetzt im
  // Datenschutz-Fenster (privacyText, Link „Datenschutz“ unter der Eingabe).
  greeting: null,
  buttonColor: DEFAULT_ACCENT, // must be hex color code
  buttonOutline: null, // button outline: "none", "white", "black"
  userBgColor: DEFAULT_ACCENT, // user text bubble color
  // Schrift auf der Kundenfarbe (Nutzerblasen und alle Flächen in
  // Kundenfarbe): Wahl im Design Center (Weiß oder Schwarz); null = Empfehlung
  // nach WCAG-Kontrast aus der Kundenfarbe (utils/theme.js userTextColorFor,
  // onAccentTextColor; KIE-565 Nachtrag)
  userTextColor: null,
  assistantBgColor: "#FFFFFF", // assistant text bubble color
  linkColor: DEFAULT_ACCENT, // color for links in assistant messages (Kufer accent)
  headerBgColor: null, // header background color (default: white)
  headerTextColor: null, // header text color for chatbot name (default: gray-800)
  iconStyle: "rounded", // icon background style: "none", "rounded", or "circle"
  noSponsor: true, // Shows sponsor in footer of chat
  sponsorText: "Ein Dienst der Kufer Software GmbH", // default sponsor textNo
  sponsorLink: "https://kufer.de", // default sponsor link
  position: "bottom-left", // position of chat button/window
  assistantName: null, // Name über den Antworten; null wie brandText
  assistantIcon:
    "https://www.kufer.de/typo3conf/ext/kubuslayout/Resources/Public/Icons/augenbrauen-3.png", // default assistant icon
  // Fenstergröße der Blase (Tablet/Desktop) — NUR aus dem Design Center
  // (Server-Config). null = Standardgröße (40 % / 25 % Breite, mindestens
  // 360 px, 77 % Höhe per Klassen, utils/layout.js BUBBLE_WINDOW_CLASSES).
  // Früher standen hier "80%"/"25%", die aber nie ausgewertet
  // wurden — NICHT wieder vorbelegen, sonst ändert sich das Aussehen aller
  // Bestandskunden. data-window-width/-height am Script werden verworfen
  // (IGNORED_HINTS, mit Warnung).
  windowHeight: null, // z. B. "600px" | "80%" | "70vh"
  windowWidth: null, // z. B. "420px" | "25%" | "30vw"
  offsetX: null, // Randabstand Button/Fenster in px (0–200), null = 16px
  offsetY: null, // Randabstand Button/Fenster in px (0–200), null = 16px

  // Darstellung: "bubble" (Chatfenster) | "inline" (in der Seite, im
  // Platzhalter <div id="kufer-assistent">). Ohne Platzhalter fällt inline auf
  // das Chatfenster zurück. Nach der Entscheidung (App.jsx, applyDisplayed)
  // steht in den Settings der Komponenten die TATSÄCHLICHE Darstellung; sie
  // geht mit jeder Chat-Anfrage an den Server (stream-chat, displayMode).
  displayMode: "bubble",
  mount: DEFAULT_MOUNT_SELECTOR, // nur per data-mount (CSS-Selektor)
  inlineCollapsedText: DEFAULT_INLINE_COLLAPSED_TEXT,
  inlineHeight: DEFAULT_INLINE_HEIGHT, // px oder vh, geklemmt 400–1200px
  inlineMaxWidth: null, // px, null = volle Container-Breite
  inlineStartState: "collapsed", // "collapsed" | "expanded"
  // Aufgeklappte Box (ab 768px): "flow" = im Seitenfluss (schiebt den Inhalt
  // darunter nach unten, bisher) | "overlay" = schwebt über dem Inhalt.
  inlineLayout: DEFAULT_INLINE_LAYOUT,
  // Aufklapp-Effekt: "expand" | "grow" | "spring" | "float"; null = ohne
  // Animation (bisher), bei "overlay" gilt dann "expand" (resolveInlineEffect)
  inlineEffect: DEFAULT_INLINE_EFFECT,
  // Eingeklappte Leiste als Eingabefeld mit Absende-Knopf; darunter die
  // defaultMessages als Chips (max. 6). false = Klickfläche wie bisher.
  // Nur Inline-Modus (Blase: ignoriert, eine Warnung).
  inlineInput: false,
  // Platzhalter (max. 120 Zeichen) und Knopf (max. 40 Zeichen) der
  // Eingabe-Leiste; null = Demo-Texte der Sprache („Stellen Sie hier Ihre
  // Frage …“/„Chatten“, englisch „Ask your question here …“/„Chat“;
  // utils/layout.js inlineBarTexts). Nicht der Platzhalter im Chat-Feld.
  inlineInputPlaceholder: null,
  inlineSendText: null,
  // Eingabe-Leiste: "submit" = öffnet erst beim Absenden (bisher) | "focus" =
  // schon beim Klick/Tippen ins Feld (nur Zeiger/Touch, nie per Tab-Fokus).
  inlineOpenOn: DEFAULT_INLINE_OPEN_ON,
  // Stil der eingeklappten Leiste: "light" | "dark"; null = folgt dem
  // Fenster-Theme (theme). Ein explizit gesetzter Wert gewinnt.
  inlineTheme: null,
  // Theme des ganzen Fensters: "light" | "dark" | "auto" (folgt
  // prefers-color-scheme). Setzt den Standard-Satz der CSS-Variablen
  // (utils/theme.js). Nur aus dem Design Center (Gruppe A, E23);
  // Flächen- und Textfarben verfeinert Seiten-CSS (--allm-*).
  theme: "light",
  // Inline: Schrift der Webseite übernehmen. Im Inline-Modus ohne Angabe an
  // (INLINE_STANDARDS, wie die Demo); in der Chatblase ohne Wirkung.
  inheritFont: false,
  // Kurskarten zu Antworten, die Kurse nennen: "off" | "auto". Braucht
  // courseSources vom Server (Fork-Image >= 7.9); sonst ohne Wirkung.
  // Im Design Center wählbar (KIE-567 „Antworten mit Kursen“: Kurskarten /
  // Nur Text mit Links); der Server liefert den Wert nur, wenn gespeichert.
  // null = nicht gespeichert: Standard nach der tatsächlichen Darstellung
  // (Fixliste 7.22-rc8 R4: In der Seite "auto", Chatfenster "off"), gesetzt
  // in App.jsx (utils/layout.js applyDisplayed), sobald die Darstellung
  // feststeht. Ein data-course-cards am Skript wirkt nicht.
  courseCards: null,
  // Kurskarten über ("above", Standard: Karten zuerst, danach der kurze Text)
  // oder unter ("below", Text zuerst, danach Karten und Folgefragen) der
  // Antwort (KIE-567 „Reihenfolge“). Vom Server angekündigte Kurse erscheinen
  // bei "above" schon vor dem Text (Fork >= 7.10), bei "below" unter der
  // fertigen Antwort (utils/courseCards.js selectBelowCourseCards).
  courseCardsPosition: DEFAULT_COURSE_CARDS_POSITION,
  // Kartenlayout "grid" (Raster) | "rows" (Standard, Zeilen-Karten über die
  // volle Breite, data-course-cards-layout bzw. visual_config courseCardsLayout)
  courseCardsLayout: DEFAULT_COURSE_CARDS_LAYOUT,
  // Panel-Optik, Standard seit Design Center vereinfacht (utils/layout.js
  // FIXED_STANDARDS, Gruppe B: eine Skript-Angabe verfeinert ihn, E23):
  // Vorschläge als Pillen, Folgefragen als Pillen. Fest (utils/layout.js
  // LOCKED_STANDARDS): Begrüßung immer als Blase, KI-Hinweis unter der
  // Eingabe (E24), in derselben Zeile der Link „Datenschutz“ (privacyNotice
  // immer "link"; keine Datenschutz-Blase beim Start).
  // Icon-Bild = brandImageUrl (Kopfzeile) bzw. assistantIcon (Blase), im
  // Design Center per Logo gesetzt.
  suggestionStyle: "pills",
  greetingStyle: "bubble",
  greetingBubbleText: null, // max. 300 Zeichen; Vorrang vor greeting
  // Untertitel unter dem Namen (max. 60 Zeichen): null = Standard der
  // Sprache („Online-Berater mit künstlicher Intelligenz“, Fixliste 7.22-rc8
  // R5), "" vom Server = bewusst keiner (im Design Center leer gespeichert)
  assistantSubtitle: null,
  onlineDot: false,
  privacyNotice: "link",
  // Datenschutz-Fenster: Überschrift (null oder "" = Standard der Sprache),
  // freier Text (Zeilen mit „•“/„-“ = Punkte, sonst Absätze; null = Standard
  // der Sprache, utils/layout.js PANEL_TEXTS), Link zur Datenschutzerklärung
  privacyTitle: null, // max. 120 Zeichen
  privacyText: null, // max. 12 Zeilen à 500 Zeichen, 1000 Zeichen gesamt
  privacyUrl: null, // https-URL oder /pfad: Link zur Datenschutzerklärung
  disclaimer: "footer",
  disclaimerText: null, // ignoriert: Text fest (PANEL_TEXTS.aiDisclaimer)
  // Folgefragen des Modells als Pillen unter der letzten Antwort (Server-
  // Chunk "followUps", Fork >= 7.14; ohne Wirkung sonst)
  followUps: "pills",
  textSize: 14, // text size in px (number only)
  noHeader: null, // If set, hide the header above the chatbox
  language: "de", // language of chat interface
  // Platzhalter im Eingabefeld; null = Standard der Sprache
  // (PANEL_TEXTS.inputPlaceholder „Stellen Sie hier Ihre Frage …“, seit 7.22.2)
  sendMessageText: null,
  resetChatText: "Chat zur&uuml;cksetzen", // override text for reset chat button
  // Menütexte (Burger-Menü): null = Text in der Sprache des Widgets
  // (utils/layout.js uiTexts: „Chat zurücksetzen“, „E-Mail Support“,
  // „Chat-ID“, „Frühere Chats“ bzw. englisch); eigener Text per Attribut
  resetBurgerText: null,
  emailBurgerText: null,
  sessionBurgerText: null, // kopiert die conversationId
  historyBurgerText: null,

  // behaviors
  openOnLoad: "off", // or "on"
  supportEmail: "info@kufer.de", // string of email for contact
  username: null, // The display or readable name set on a script
  // Startvorschläge (Liste von Strings): gespeichert im Design Center (auch
  // leer) vor dem Standard der Sprache vom Server (applyDefaultMessagesOrder,
  // E10 neu, Fixliste 7.22-rc17); data-default-messages wirkt nicht
  defaultMessages: [],
  displayChatbotBubbles: true, // controls whether welcome message bubbles are shown
  chatbotBubblesMessages: [], // messages to display in welcome bubbles
  // Willkommensblasen je Gerät (KIE-568, Design Center „Willkommensblasen
  // anzeigen“): "off" | "first" (beim ersten Besuch, localStorage) | "every"
  // (bei jedem Besuch, einmal je Browser-Tab). Allein der Server-Wert zählt
  // (utils/layout.js applyFixedStandards), Handy = Viewport < 768 px beim
  // Laden (utils/platform.js isPhoneViewport).
  welcomeBubblesDesktop: "first",
  welcomeBubblesMobile: "first",

  // audio features
  enableStt: true, // true/false - show STT microphone if server supports it
  enableTts: true, // true/false - show TTS speaker if server supports it
  ttsPosition: "bottom-right", // "bottom-right" or "icon-left" (under avatar)

  // KIE-503: "Frühere Chats" im Burger-Menü. Abschaltbar per Admin
  // (visual_config.historyEnabled=false, gewinnt: SERVER_WINS) oder
  // data-history-enabled="false".
  historyEnabled: true,
};

// Script-Attribute + Server-visual_config zu den finalen Settings auflösen
// (ohne Seiteneffekte; testbar mit gemocktem fetch). Rangfolge nach E23
// (oben): Gruppe A nur vom Server, sonst Standard; übrige Angaben
// Standard < Server < Skript-Attribut (die Skript-Angabe schlägt einen vom
// Server gelieferten festen Standard; FIXED_STANDARDS gelten ohne
// Skript-Angabe auch gegen den Server), Ausnahme SERVER_WINS.
export async function loadEmbedSettings(dataset = {}, fetchFn = fetch) {
  const effective = dropIneffectiveAttributes(dataset);
  const scriptSettings = parseAndValidateEmbedSettings(effective);

  // Fetch live visual config from server (admin panel settings)
  let serverConfig = {};
  try {
    const res = await fetchFn(
      embedConfigUrl({ ...DEFAULT_SETTINGS, ...scriptSettings }),
    );
    if (res.ok) serverConfig = await res.json();
  } catch (e) {
    console.warn("[AnythingLLM Embed] Could not fetch server config:", e);
  }

  // Nur nicht leere Server-Werte übernehmen (Ausnahme privacyTitle und
  // assistantSubtitle: "" = im Design Center bewusst geleert)
  const mergedServerConfig = {};
  for (const [key, value] of Object.entries(serverConfig || {})) {
    if (value === "" && EMPTY_MEANS_NONE.includes(key))
      mergedServerConfig[key] = value;
    else if (value !== null && value !== undefined && value !== "")
      mergedServerConfig[key] = value;
  }
  // Frühere Standardtexte gelten je Quelle als nicht gesetzt (der nächst-
  // niedrigere Wert greift); danach feste Standards und Inline-Standards.
  const script = dropLegacyDefaults(scriptSettings);
  const server = dropLegacyDefaults(
    parseAndValidateEmbedSettings(mergedServerConfig),
  );
  applyDefaultMessagesOrder(script, server);
  const serverWins = {};
  for (const key of SERVER_WINS)
    if (server[key] !== undefined) serverWins[key] = server[key];
  const resolved = applyFixedStandards(
    { ...DEFAULT_SETTINGS, ...server, ...script, ...serverWins, loaded: true },
    server,
    new Set(Object.keys(script)),
  );
  // Ungültige Enums erst hier melden: die Warnung nennt den wirksamen Wert.
  warnInvalidInlineEnums(effective, mergedServerConfig, resolved);
  return resolved;
}

// Abruf der Konfiguration mit der Sprache des Widgets (Fixliste 7.22-rc13
// F01, Entscheidung E12): Die Sprache steht nur im Skript (data-language,
// sonst "de"); der Server wählt damit die Standard-Startvorschläge
// (fehlend oder unbekannt = de). Die Abfrage trennt auch den Cache je
// Sprache (max-age=300).
export function embedConfigUrl(settings = {}) {
  const language = encodeURIComponent(widgetLanguage(settings));
  return `${settings.baseApiUrl}/${settings.embedId}/config?language=${language}`;
}

// Startvorschläge (E10 neu, Fixliste 7.22-rc17): gespeicherte Liste (auch
// leer) vor dem Standard des Servers (defaultMessagesStandard); ein
// gespeichertes [] (defaultMessagesSaved) heißt „keine Startvorschläge“.
// data-default-messages am Skript wirkt nicht (Gruppe A, DC_COVERED), auch
// ohne Liste vom Server (älterer Server, keine Antwort: keine
// Startvorschläge). Entfernt die Kennzeichen aus beiden Quellen, ändert
// server und script an Ort und Stelle.
export function applyDefaultMessagesOrder(script = {}, server = {}) {
  const saved = server[DEFAULT_MESSAGES_SAVED] === true;
  for (const source of [server, script]) {
    delete source[DEFAULT_MESSAGES_SAVED];
    delete source[DEFAULT_MESSAGES_STANDARD];
  }
  if (saved && !Array.isArray(server.defaultMessages))
    server.defaultMessages = [];
}

export default function useGetScriptAttributes() {
  const [settings, setSettings] = useState({
    loaded: false,
    ...DEFAULT_SETTINGS,
  });

  useEffect(() => {
    async function fetchAttribs() {
      if (!document) return false;
      if (
        !embedderSettings.settings.baseApiUrl ||
        !embedderSettings.settings.embedId
      )
        throw new Error(
          "[AnythingLLM Embed Module::Abort] - Invalid script tag setup detected. Missing required parameters for boot!",
        );

      scriptDataset = { ...embedderSettings.settings };
      const finalSettings = await loadEmbedSettings(embedderSettings.settings);

      // Update module-level settings so components that read embedderSettings
      // directly (assistantName, assistantIcon, brandImageUrl, etc.) see the
      // fully resolved config — defaults < script attributes < server config.
      // Previously only the server values were merged here, so the
      // DEFAULT_SETTINGS never reached these components: with nothing
      // configured in the design center, the message-bubble avatar/name fell
      // back to the generic AnythingLLM icon + "Anything LLM Chat Assistant"
      // even though the header (which reads the hook state) showed the correct
      // brand logo + name.
      const { loaded: _loaded, ...resolvedSettings } = finalSettings;
      Object.assign(embedderSettings.settings, resolvedSettings);

      // Update module-level styles so chat bubbles use live colors
      if (finalSettings.userBgColor)
        embedderSettings.USER_STYLES.msgBg = finalSettings.userBgColor;
      embedderSettings.USER_STYLES.msgText = userTextColorFor(finalSettings);
      if (finalSettings.assistantBgColor)
        embedderSettings.ASSISTANT_STYLES.msgBg =
          finalSettings.assistantBgColor;

      // CSS-Variablen (Farben inkl. Link, Theme hell/dunkel/auto) im Shadow-Root
      // setzen — synchron VOR dem ersten Render, damit kein Frame im falschen
      // Theme entsteht. Ersetzt die frühere Link-Farb-Injektion.
      if (embedderSettings.themeStyle)
        applyTheme(embedderSettings.themeStyle, finalSettings);
      // i18next-Texte in der Sprache des Widgets (Script bzw. Server)
      syncI18nLanguage(finalSettings);

      setSettings(finalSettings);
    }
    fetchAttribs();
  }, [document]);

  return settings;
}

const validations = {
  // Kufer Darstellung/Fenstergröße: strikte Whitelists (Wert landet in CSS).
  // undefined = ungültig -> Feld wird verworfen (siehe unten).
  ...layoutValidations,

  defaultMessages: messageList,
  chatbotBubblesMessages: messageList,
};

// Startvorschläge und Willkommensblasen: Der Server liefert ein Array von
// Strings (Fixliste 7.22-rc13 F03, Entscheidung E11), jeder Eintrag bleibt
// ganz, auch mit Komma („Gibt es Kurse, die abends stattfinden?“). An Kommas
// getrennt wird nur ein String: das Skript-Attribut (data-default-messages=
// "A,B", Bestand) und die Antwort älterer Server. Leere Einträge und
// Nicht-Strings fallen weg; alles andere ergibt eine leere Liste.
function messageList(value = null) {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return items
    .filter((v) => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function parseAndValidateEmbedSettings(settings = {}) {
  const validated = {};
  for (let [key, value] of Object.entries(settings)) {
    if (!Object.prototype.hasOwnProperty.call(validations, key)) {
      validated[key] = value;
      continue;
    }

    const validatedValue = validations[key](value);
    // undefined = ungültiger Wert -> weglassen, damit der nächstniedrigere
    // Wert (Script-Attribut bzw. Default) greift.
    if (validatedValue === undefined) continue;
    validated[key] = validatedValue;
  }

  return validated;
}
