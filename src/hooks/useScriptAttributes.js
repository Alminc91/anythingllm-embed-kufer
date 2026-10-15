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
import { applyTheme } from "@/utils/theme";

// Nur aus der Server-Config übernehmen, nie aus Script-Attributen: Bestands-
// Snippets enthalten laut altem ATTRIBUTES.md-Beispiel data-window-height="77%"
// / data-window-width="25%", die früher wirkungslos waren und es bleiben müssen.
const SERVER_ONLY_SETTINGS = ["windowWidth", "windowHeight"];
// Leerer Server-Wert ist hier eine Angabe (nicht „nicht gesetzt“)
const EMPTY_MEANS_NONE = ["privacyTitle"];

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
  // Früher stand hier der Datenschutzsatz; der steht jetzt in der eigenen
  // Datenschutz-Blase (privacyText).
  greeting: null,
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
  assistantName: null, // Name über den Antworten; null wie brandText
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
  // (utils/theme.js); Seiten-CSS (--allm-*) gewinnt immer.
  theme: "light",
  // Inline: Schrift der Webseite übernehmen. Im Inline-Modus ohne Angabe an
  // (INLINE_STANDARDS, wie die Demo); in der Chatblase ohne Wirkung.
  inheritFont: false,
  // Kurskarten zu Antworten, die Kurse nennen: "off" | "auto". Braucht
  // courseSources vom Server (Fork-Image >= 7.9); sonst ohne Wirkung.
  // Standard seit Design Center vereinfacht: "auto" in Chatblase und Inline
  // (Entscheidung D1, KIE-565; der Server liefert "auto" für beide
  // Darstellungen, unabhängig vom gespeicherten displayMode).
  courseCards: "auto",
  // Kurskarten über ("above", Standard: Karten zuerst, danach der kurze Text)
  // oder unter ("below") der Antwort. Bei "above" erscheinen vom Server
  // angekündigte Kurse schon vor dem Text (Fork >= 7.10).
  courseCardsPosition: DEFAULT_COURSE_CARDS_POSITION,
  // Kartenlayout "grid" (Raster) | "rows" (Standard, Zeilen-Karten über die
  // volle Breite, data-course-cards-layout bzw. visual_config courseCardsLayout)
  courseCardsLayout: DEFAULT_COURSE_CARDS_LAYOUT,
  // Panel-Optik, fest seit Design Center vereinfacht (utils/layout.js
  // FIXED_STANDARDS, in loadEmbedSettings gesetzt, egal was Script oder
  // Server liefern): Vorschläge als Pillen, Begrüßung als Blase, darunter die
  // Datenschutz-Blase, Folgefragen als Pillen, KI-Hinweis fest unter der
  // Eingabe, kein Online-Punkt. Die Datenschutz-Blase schaltet allein der
  // Server ab (privacyNotice "none", utils/layout.js privacyNoticeSetting). Icon-Bild = brandImageUrl (Kopfzeile) bzw.
  // assistantIcon (Blase), im Design Center per Logo gesetzt.
  suggestionStyle: "pills",
  greetingStyle: "bubble",
  greetingBubbleText: null, // max. 300 Zeichen; Vorrang vor greeting
  assistantSubtitle: null, // max. 60 Zeichen, optional (nie automatisch)
  onlineDot: false,
  privacyNotice: "bubble",
  // Datenschutz-Blase: Überschrift ("" = keine, null = Standard der Sprache),
  // freier Text (Zeilen mit „•“/„-“ = Punkte, sonst Absätze; null = Standard
  // der Sprache, utils/layout.js PANEL_TEXTS), Link zur Datenschutzerklärung
  privacyTitle: null, // max. 120 Zeichen
  privacyText: null, // max. 12 Zeilen à 500 Zeichen, 1000 Zeichen gesamt
  privacyButtonText: null, // nur früherer Einmal-Hinweis („modal“)
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
  // (PANEL_TEXTS.inputPlaceholder „Ihre Frage eingeben“)
  sendMessageText: null,
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
  // (Ausnahme privacyTitle: "" = im Design Center bewusst geleert -> keine
  // Überschrift)
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
  const given = new Set([...Object.keys(script), ...Object.keys(server)]);
  const resolved = applyFixedStandards(
    { ...DEFAULT_SETTINGS, ...script, ...server, loaded: true },
    given,
    server,
  );
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
