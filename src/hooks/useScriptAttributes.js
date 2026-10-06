import { useEffect, useState } from "react";
import { embedderSettings } from "../main";
import {
  DEFAULT_COURSE_CARDS_POSITION,
  DEFAULT_COURSE_CARDS_LAYOUT,
  DEFAULT_INLINE_COLLAPSED_TEXT,
  DEFAULT_INLINE_EFFECT,
  DEFAULT_INLINE_HEIGHT,
  DEFAULT_INLINE_INPUT_PLACEHOLDER,
  DEFAULT_INLINE_LAYOUT,
  DEFAULT_INLINE_OPEN_ON,
  DEFAULT_INLINE_SEND_TEXT,
  DEFAULT_MOUNT_SELECTOR,
  layoutValidations,
  normalizePanelSettings,
  warnInvalidInlineEnums,
} from "@/utils/layout";
import { applyTheme } from "@/utils/theme";

// Nur aus der Server-Config übernehmen, nie aus Script-Attributen: Bestands-
// Snippets enthalten laut altem ATTRIBUTES.md-Beispiel data-window-height="77%"
// / data-window-width="25%", die früher wirkungslos waren und es bleiben müssen.
const SERVER_ONLY_SETTINGS = ["windowWidth", "windowHeight"];

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
  brandText: "Ihr Online-Berater", // brand text to display next to brand image
  greeting:
    "Dieser Chatbot nutzt künstliche Intelligenz (KI). Ihre Nachrichten werden nicht an Dritte weitergegeben, können aber zur Qualitätssicherung von uns eingesehen werden. Bitte geben Sie keine sensiblen personenbezogenen Daten ein.", // Datenschutz-Standardhinweis (greeting) – wird bei fehlender server-/scriptseitiger Konfiguration angezeigt.
  buttonColor: "#01a5a9", // must be hex color code
  buttonOutline: null, // button outline: "none", "white", "black"
  userBgColor: "#01a5a9", // user text bubble color
  userTextColor: "#FFFFFF", // user text bubble text color (only "#FFFFFF" or "#000000" via admin)
  assistantBgColor: "#FFFFFF", // assistant text bubble color
  linkColor: "#01a5a9", // color for links in assistant messages (Kufer accent)
  headerBgColor: null, // header background color (default: white)
  headerTextColor: null, // header text color for chatbot name (default: gray-800)
  iconStyle: "rounded", // icon background style: "none", "rounded", or "circle"
  noSponsor: true, // Shows sponsor in footer of chat
  sponsorText: "Ein Dienst der Kufer Software GmbH", // default sponsor textNo
  sponsorLink: "https://kufer.de", // default sponsor link
  position: "bottom-left", // position of chat button/window
  assistantName: "Ihr Online-Berater", // default assistant name
  assistantIcon:
    "https://www.kufer.de/typo3conf/ext/kubuslayout/Resources/Public/Icons/augenbrauen-3.png", // default assistant icon
  // Fenstergröße der Blase (Tablet/Desktop) — NUR aus dem Design Center
  // (Server-Config). null = bisherige Standardgröße (40 % / 25 % Breite, 77 %
  // Höhe per Klassen). Früher standen hier "80%"/"25%", die aber nie ausgewertet
  // wurden — NICHT wieder vorbelegen, sonst ändert sich das Aussehen aller
  // Bestandskunden. data-window-width/-height am Script werden verworfen
  // (SERVER_ONLY_SETTINGS).
  windowHeight: null, // z. B. "600px" | "80%" | "70vh"
  windowWidth: null, // z. B. "420px" | "25%" | "30vw"
  offsetX: null, // Randabstand Button/Fenster in px (0–200), null = 16px
  offsetY: null, // Randabstand Button/Fenster in px (0–200), null = 16px

  // Darstellung: "bubble" (Chat-Blase) | "inline" (in der Seite, im Platzhalter
  // <div id="kufer-assistent">). Ohne Platzhalter fällt inline auf die Blase zurück.
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
  inlineInputPlaceholder: DEFAULT_INLINE_INPUT_PLACEHOLDER, // max. 120 Zeichen
  inlineSendText: DEFAULT_INLINE_SEND_TEXT, // Knopf, max. 40 Zeichen
  // Eingabe-Leiste: "submit" = öffnet erst beim Absenden (bisher) | "focus" =
  // schon beim Klick/Tippen ins Feld (nur Zeiger/Touch, nie per Tab-Fokus).
  inlineOpenOn: DEFAULT_INLINE_OPEN_ON,
  // Stil der eingeklappten Leiste: "light" | "dark"; null = folgt dem
  // Fenster-Theme (theme). Ein explizit gesetzter Wert gewinnt.
  inlineTheme: null,
  // Theme des ganzen Fensters: "light" | "dark" | "auto" (folgt
  // prefers-color-scheme). Setzt den Standard-Satz der CSS-Variablen
  // (utils/theme.js); Seiten-CSS (--allm-*) gewinnt immer.
  theme: "light",
  inheritFont: false, // Inline: Schrift der Webseite übernehmen
  // Kurskarten unter Antworten, die Kurse nennen: "off" | "auto". Braucht
  // courseSources vom Server (Fork-Image >= 7.9); sonst ohne Wirkung.
  courseCards: "off",
  // Kurskarten über ("above") oder unter ("below") der Antwort. Bei "above"
  // erscheinen vom Server angekündigte Kurse schon vor dem Text (Fork >= 7.10).
  courseCardsPosition: DEFAULT_COURSE_CARDS_POSITION,
  // Kartenlayout "grid" (Raster) | "rows" (Zeilen-Karten über die volle
  // Breite, data-course-cards-layout bzw. visual_config courseCardsLayout)
  courseCardsLayout: DEFAULT_COURSE_CARDS_LAYOUT,
  // Panel-Optik (opt-in, Standard = bisher): Vorschläge "bars" | "pills",
  // Begrüßung "text" | "bubble" (greetingBubbleText als Assistenten-Blase,
  // greeting klein darunter); Kopfzeile: Untertitel unter dem Namen und
  // dekorativer Online-Punkt am Icon. Icon-Bild = brandImageUrl (Kopfzeile)
  // bzw. assistantIcon (Blase), im Design Center per Logo gesetzt.
  suggestionStyle: "bars",
  greetingStyle: "text",
  greetingBubbleText: null, // max. 300 Zeichen; null = Standard der Sprache
  assistantSubtitle: null, // max. 60 Zeichen
  onlineDot: false,
  // Datenschutz-Hinweis: "none" | "bubble" (Absätze in der Begrüßungsblase,
  // ohne Bestätigung; setzt greetingStyle "bubble", normalisiert in
  // loadEmbedSettings) | "modal" (einmalige Karte beim ersten Öffnen,
  // Bestätigung in localStorage allm-privacy-ack-<embedId>). Texte null =
  // Standard der Sprache (utils/layout.js PANEL_TEXTS).
  privacyNotice: "none",
  privacyTitle: null, // max. 120 Zeichen
  privacyText: null, // Stichpunkte je Zeile bzw. "|", max. 5 × 160 Zeichen
  privacyButtonText: null, // max. 40 Zeichen, Standard „Start“
  privacyUrl: null, // https-URL oder /pfad: Link zur Datenschutzerklärung
  // Fester KI-Hinweis unter dem Eingabefeld: "none" | "footer";
  // disclaimerText max. 160 Zeichen, null = Standard der Sprache
  // (utils/layout.js PANEL_TEXTS.aiDisclaimer)
  disclaimer: "none",
  disclaimerText: null,
  // Folgefragen des Modells als Pillen unter der letzten Antwort: "none" |
  // "pills" (Server-Chunk "followUps", Fork >= 7.14; ohne Wirkung sonst)
  followUps: "none",
  textSize: 14, // text size in px (number only)
  noHeader: null, // If set, hide the header above the chatbox
  language: "de", // language of chat interface
  sendMessageText: "Wie kann ich Ihnen helfen?", // override text for send message button
  resetChatText: "Chat zur&uuml;cksetzen", // override text for reset chat button
  resetBurgerText: "Chat zurücksetzen", // override text for reset option in burger menu
  emailBurgerText: "E-Mail Support", // override text for email support option in burger menu
  sessionBurgerText: "Chat-ID", // override text for chat ID option in burger menu (copies conversationId)

  // behaviors
  openOnLoad: "off", // or "on"
  supportEmail: "info@kufer.de", // string of email for contact
  username: null, // The display or readable name set on a script
  defaultMessages: [], // list of strings for default messages.
  displayChatbotBubbles: true, // controls whether welcome message bubbles are shown
  chatbotBubblesMessages: [], // messages to display in welcome bubbles

  // audio features
  enableStt: true, // true/false - show STT microphone if server supports it
  enableTts: true, // true/false - show TTS speaker if server supports it
  ttsPosition: "bottom-right", // "bottom-right" or "icon-left" (under avatar)

  // KIE-503: "Frühere Chats" im Burger-Menü. Abschaltbar per Admin
  // (visual_config.historyEnabled=false) oder data-history-enabled="false".
  historyEnabled: true,
};

// Script-Attribute + Server-visual_config zu den finalen Settings auflösen
// (ohne Seiteneffekte; testbar mit gemocktem fetch).
// Priority: defaults < script data-attributes < server config (live design)
export async function loadEmbedSettings(dataset = {}, fetchFn = fetch) {
  const scriptSettings = parseAndValidateEmbedSettings(dataset);
  for (const key of SERVER_ONLY_SETTINGS) delete scriptSettings[key];

  // Fetch live visual config from server (admin panel settings)
  let serverConfig = {};
  try {
    const res = await fetchFn(
      `${scriptSettings.baseApiUrl}/${scriptSettings.embedId}/config`,
    );
    if (res.ok) serverConfig = await res.json();
  } catch (e) {
    console.warn("[AnythingLLM Embed] Could not fetch server config:", e);
  }

  // Only merge non-empty server values so script attributes remain as fallback
  const mergedServerConfig = {};
  for (const [key, value] of Object.entries(serverConfig || {})) {
    if (value !== null && value !== undefined && value !== "")
      mergedServerConfig[key] = value;
  }

  const resolved = normalizePanelSettings({
    ...DEFAULT_SETTINGS,
    ...scriptSettings,
    ...parseAndValidateEmbedSettings(mergedServerConfig),
    loaded: true,
  });
  // Ungültige Enums erst hier melden: die Warnung nennt den wirksamen Wert.
  warnInvalidInlineEnums(dataset, mergedServerConfig, resolved);
  return resolved;
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
      if (finalSettings.userTextColor)
        embedderSettings.USER_STYLES.msgText = finalSettings.userTextColor;
      if (finalSettings.assistantBgColor)
        embedderSettings.ASSISTANT_STYLES.msgBg =
          finalSettings.assistantBgColor;

      // CSS-Variablen (Farben inkl. Link, Theme hell/dunkel/auto) im Shadow-Root
      // setzen — synchron VOR dem ersten Render, damit kein Frame im falschen
      // Theme entsteht. Ersetzt die frühere Link-Farb-Injektion.
      if (embedderSettings.themeStyle)
        applyTheme(embedderSettings.themeStyle, finalSettings);

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

  _fallbacks: {
    defaultMessages: [],
    chatbotBubblesMessages: [],
  },

  defaultMessages: function (value = null) {
    if (typeof value !== "string") return this._fallbacks.defaultMessages;
    const list = value
      .split(",")
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0);
    return list;
  },

  chatbotBubblesMessages: function (value = null) {
    if (typeof value !== "string")
      return this._fallbacks.chatbotBubblesMessages;
    const list = value
      .split(",")
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0);
    return list;
  },
};

export function parseAndValidateEmbedSettings(settings = {}) {
  const validated = {};
  for (let [key, value] of Object.entries(settings)) {
    if (!validations.hasOwnProperty(key)) {
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
