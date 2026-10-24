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
// wie die Demo (deutsch; englisch PANEL_TEXTS.en, inlineBarTexts)
export const DEFAULT_INLINE_INPUT_PLACEHOLDER = "Stellen Sie hier Ihre Frage …";
export const DEFAULT_INLINE_SEND_TEXT = "Chatten";
// Wunschfragen-Chips unter der Leiste und Pillen im Panel (aus
// defaultMessages): höchstens so viele
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
// Kurskarten über ("above") oder unter ("below") der Antwort
export const COURSE_CARDS_POSITION_VALUES = ["below", "above"];
// Standard seit Design Center vereinfacht: Karten zuerst, danach der kurze
// Text (wie Demo-Variante 4 „Suche“)
export const DEFAULT_COURSE_CARDS_POSITION = "above";
// Kartenlayout: "grid" (Raster) oder "rows" (je Kurs eine Karte
// über die volle Breite; schmale Karten < 480 px bleiben Rasterkarten)
export const COURSE_CARDS_LAYOUT_VALUES = ["grid", "rows"];
// Standard seit Design Center vereinfacht: Zeilen (wie die Demo)
export const DEFAULT_COURSE_CARDS_LAYOUT = "rows";
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
// Datenschutz-Hinweis: seit 7.23 immer als Link „Datenschutz“ in der Zeile
// des KI-Hinweises ("link", Nutzerentscheidung 23.10.2026, keine Auswahl im
// Design Center). Die früheren Werte "none" (aus), "bubble" (Blase unter der
// Begrüßung) und "modal" (Einmal-Hinweis mit Bestätigung) gelten als gültig
// (gespeicherte Altwerte, keine Warnung), wirken aber nicht (AI_NOTICE).
export const PRIVACY_NOTICE_VALUES = ["link", "none", "bubble", "modal"];
// Folgefragen: Vorschläge des Modells für die nächste Frage als Pillen unter
// der letzten Antwort ("pills") oder keine ("none", Standard). Der Server
// (Fork >= 7.14) liefert sie als Chunk "followUps" bzw. im Verlauf.
export const FOLLOW_UPS_VALUES = ["none", "pills"];
// Willkommensblasen neben dem geschlossenen Chat-Button (nur Chatblase), je
// Gerät (KIE-568): "off" = keine Blasen, "first" = beim ersten Besuch
// (localStorage, wie bisher), "every" = bei jedem Besuch (einmal je
// Browser-Tab, sessionStorage)
export const WELCOME_BUBBLES_VALUES = ["off", "first", "every"];
export const DEFAULT_WELCOME_BUBBLES = "first";
export const PANEL_PILL_TEXT_MAX = 60; // längere Wunschfragen: gekürzt mit …
export const GREETING_BUBBLE_TEXT_MAX_LEN = 300;
export const ASSISTANT_SUBTITLE_MAX_LEN = 60;
export const PRIVACY_TITLE_MAX_LEN = 120;
// privacyText: freier Text (Zeilen mit „•“/„-“ = Aufzählungspunkte, sonst
// Absätze; altes Format ein Punkt je Zeile bzw. "|"), höchstens 12 Zeilen
// mit je höchstens 500 Zeichen; Rohtext höchstens 1000 Zeichen.
export const PRIVACY_LINES_MAX = 12;
export const PRIVACY_LINE_MAX_LEN = 500;
export const PRIVACY_TEXT_MAX_LEN = 1000;
// Fester KI-Hinweis unter dem Eingabefeld ("footer") statt vom Modell
// erzeugt; Text fest PANEL_TEXTS.aiDisclaimer (disclaimerText wird seit dem
// vereinfachten Design Center ignoriert, AI_NOTICE).
export const DISCLAIMER_VALUES = ["none", "footer"];
export const DISCLAIMER_TEXT_MAX_LEN = 160;
export const URL_MAX_LEN = 512;

// Standardtexte der Panel-Optik, des Datenschutz- und des KI-Hinweises:
// EIN Mechanismus für alle diese Texte (panelTexts): Sprache des Widgets
// (settings.language) "en" -> englisch, alles andere (fehlend, ungültig, eine
// Sprache ohne eigene Texte wie "fr") -> deutsch. Absichtlich nicht über
// i18next: ohne data-language stünde dort Englisch, und Sprachen ohne diese
// Texte fielen auf Englisch zurück (gemischte Sprachen im Panel).
// Neutral für alle Kundenarten (VHS, Bildungsträger, …), kurz, ohne
// Speicherdauer, sachlich, keine Rechtsberatung; Kunden ersetzen den Text
// über privacyText und tragen ihre Erklärung als privacyUrl ein (Standard:
// kein Link). Design Center vereinfacht (15.10.2026): keine Gedankenstriche
// in sichtbaren Texten; keine Gendersprache („Mitarbeiter“, Fixliste
// 7.22-rc19 E30). Wörtliche Kopie im Fork:
// server/utils/chats/embedDefaults.js (Jest-Test vergleicht beide, mit
// KUFER_FORK_DIR auch tests/embed-config-contract.test.js).
export const PANEL_TEXTS = {
  de: {
    greetingBubble: "Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?",
    // Überschrift des Datenschutz-Fensters (ohne eigenen privacyTitle)
    privacyTitle: "Datenschutz",
    privacyPoints: [
      "Ihre Anfragen bleiben auf Servern in Deutschland und werden nicht an Dritte weitergegeben.",
      "Mitarbeiter der Einrichtung können Gespräche zur Qualitätssicherung einsehen.",
      "Bitte teilen Sie nur Angaben, die für Ihre Anfrage nötig sind.",
    ],
    // Link zur Datenschutzerklärung im Datenschutz-Fenster (nur mit privacyUrl)
    privacyBubbleLink: "Datenschutzerklärung",
    // KI-Hinweis unter der Eingabe: fest, nicht änderbar (disclaimerText wird
    // ignoriert, E24). Seit dem Link in der Fußzeile (Nutzerentscheidung
    // 23.10.2026, Variante 1) die Kurzfassung „Unsere KI …“ ohne Bitte um
    // Prüfung; diese steht als eigener Punkt im Datenschutz-Fenster
    // (privacyAiTitle, privacyAiText). Die Zeile lautet KI-Hinweis + " · " +
    // privacyLinkText, nur der Linktext ist klickbar (ChatContainer
    // AiDisclaimer). Messung: tests/visual/disclaimer_measure.py.
    aiDisclaimer: "Unsere KI kann Fehler machen",
    // Link in der Zeile des KI-Hinweises, öffnet das Datenschutz-Fenster
    privacyLinkText: "Datenschutz",
    // eigener Punkt im Datenschutz-Fenster: ein Wortlaut für alle Kunden,
    // ohne Kurs-Wörter (Nutzerentscheidung F8 vom 23.10.2026)
    privacyAiTitle: "Hinweis zur KI",
    privacyAiText:
      "Unser KI-Berater ist auf richtige Auskünfte optimiert. Wie jede KI kann er sich dennoch einmal irren. Wichtige Angaben wie Termine und Preise finden Sie zur Kontrolle immer auf unserer Website.",
    // Button unten im Datenschutz-Fenster und Beschriftung des
    // Schließen-Symbols oben (für Screenreader)
    privacyCloseText: "Schließen",
    privacyCloseLabel: "Datenschutz schließen",
    // Standard für leere Felder (Name in der Titelleiste, Untertitel,
    // Platzhalter im Eingabefeld). Untertitel seit Fixliste 7.22-rc8 R5 auch
    // live der Standard, wenn der Server keinen liefert (assistantSubtitleText)
    assistantName: "KI-Berater",
    assistantSubtitle: "Online-Berater mit künstlicher Intelligenz",
    // gleich wie die eingeklappte Inline-Leiste (Nutzer 23.10.2026, vorher
    // „Ihre Frage eingeben“): eingeklappt und aufgeklappt derselbe Text
    inputPlaceholder: "Stellen Sie hier Ihre Frage …",
    followUps: "Vorschläge für Ihre nächste Frage",
    // Platzhalter an der Teaser-Stelle, solange der KI-Teaser erwartet wird
    teaserPending: "KI-Beschreibung wird erstellt …",
    // Eingeklappte Inline-Leiste: Platzhalter und Knopf wie die Demo (das
    // Chat-Eingabefeld nutzt inputPlaceholder bzw. den Platzhalter aus dem
    // Design Center)
    inlineBarPlaceholder: DEFAULT_INLINE_INPUT_PLACEHOLDER,
    inlineSendText: DEFAULT_INLINE_SEND_TEXT,
    // Rückmeldung nach dem Kopieren (Chat-ID, Codeblock)
    copied: "Kopiert!",
  },
  en: {
    greetingBubble: "Hello! I am your AI advisor. How can I help you?",
    privacyTitle: "Privacy",
    privacyPoints: [
      "Your requests stay on servers in Germany and are not passed on to third parties.",
      "Staff of the institution may view conversations for quality assurance.",
      "Please only share information that is necessary for your request.",
    ],
    privacyBubbleLink: "Privacy statement",
    aiDisclaimer: "Our AI can make mistakes",
    privacyLinkText: "Privacy",
    privacyAiTitle: "About the AI",
    privacyAiText:
      "Our AI advisor is optimised for accurate information. Like any AI, it can still make the occasional mistake. You can always check important details such as dates and prices on our website.",
    privacyCloseText: "Close",
    privacyCloseLabel: "Close privacy notice",
    assistantName: "AI Advisor",
    assistantSubtitle: "Online advisor powered by artificial intelligence",
    inputPlaceholder: "Ask your question here …",
    followUps: "Suggestions for your next question",
    teaserPending: "AI description is being written …",
    inlineBarPlaceholder: "Ask your question here …",
    inlineSendText: "Chat",
    copied: "Copied!",
  },
};
// Standard-Datenschutztext als freier Text (privacyText-Format): je Punkt eine
// Zeile mit „• “ (so trägt ihn das Design Center als Vorbelegung ein).
export const PRIVACY_BULLET_PREFIX = "• ";
for (const lang of Object.keys(PANEL_TEXTS))
  PANEL_TEXTS[lang].privacyText = PANEL_TEXTS[lang].privacyPoints
    .map((p) => `${PRIVACY_BULLET_PREFIX}${p}`)
    .join("\n");

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

// Bedientexte des Widgets je Sprache (Fixliste 7.22-rc7 Nr. 35, E3, Teil von
// KIE-571): Menüeinträge, Standard-Willkommensblasen neben dem Chat-Button
// und die Beschriftungen für Screenreader (aria-label, title). Gleiche
// Sprachwahl wie die Panel-Texte (panelLanguage: "en" englisch, sonst
// deutsch). Ein eigener Menütext (resetBurgerText, emailBurgerText,
// sessionBurgerText, historyBurgerText) und eigene Willkommensblasen
// (chatbotBubblesMessages) gewinnen.
export const UI_TEXTS = {
  de: {
    menuReset: "Chat zurücksetzen",
    menuHistory: "Frühere Chats",
    menuEmail: "E-Mail Support",
    menuChatId: "Chat-ID",
    mailSubject: (name, host) => `Anfrage zum Chatbot "${name}" von ${host}`,
    // wortgleich mit dem Vorschlag im Design Center (DEFAULT_WELCOME_BUBBLES)
    welcomeBubbles: [
      "Hallo! Ich bin Ihr KI-Berater.",
      "Möchten Sie mehr über unser Angebot erfahren? Ich helfe gerne weiter!",
    ],
    openChat: "Chat öffnen",
    closeWelcomeBubbles: "Willkommensblasen schließen",
    options: "Optionen",
    close: "Schließen",
    collapse: "Einklappen",
    backToChat: "Zurück zum Chat",
    send: "Nachricht senden",
    startRecording: "Aufnahme starten",
    stopRecording: "Aufnahme beenden",
    scrollToBottom: "Nach unten scrollen",
    speak: "Antwort vorlesen",
    stopSpeaking: "Vorlesen beenden",
    speakTitle: "Vorlesen",
    stopTitle: "Stopp",
    helpful: "Antwort war hilfreich",
    helpfulTitle: "Hilfreich",
    notHelpful: "Antwort war nicht hilfreich",
    notHelpfulTitle: "Nicht hilfreich",
    courses: "Genannte Kurse",
    moreCourses: "Weitere genannte Kurse",
  },
  en: {
    menuReset: "Reset chat",
    menuHistory: "Previous chats",
    menuEmail: "Email support",
    menuChatId: "Chat ID",
    mailSubject: (name, host) =>
      `Question about the chatbot "${name}" from ${host}`,
    welcomeBubbles: [
      "Hello! I am your AI advisor.",
      "Would you like to learn more about what we offer? I am happy to help!",
    ],
    openChat: "Open chat",
    closeWelcomeBubbles: "Close welcome messages",
    options: "Options",
    close: "Close",
    collapse: "Collapse",
    backToChat: "Back to chat",
    send: "Send message",
    startRecording: "Start recording",
    stopRecording: "Stop recording",
    scrollToBottom: "Scroll to bottom",
    speak: "Read answer aloud",
    stopSpeaking: "Stop reading aloud",
    speakTitle: "Read aloud",
    stopTitle: "Stop",
    helpful: "Answer was helpful",
    helpfulTitle: "Helpful",
    notHelpful: "Answer was not helpful",
    notHelpfulTitle: "Not helpful",
    courses: "Courses mentioned",
    moreCourses: "More courses mentioned",
  },
};
export function uiTexts(settings = {}) {
  return UI_TEXTS[panelLanguage(settings)];
}
export const DEFAULT_GREETING_BUBBLE_TEXT = PANEL_TEXTS.de.greetingBubble;
export const DEFAULT_PRIVACY_TITLE = PANEL_TEXTS.de.privacyTitle;
export const DEFAULT_PRIVACY_POINTS = PANEL_TEXTS.de.privacyPoints;

// Eingeklappte Inline-Leiste (inlineInput): Platzhalter und Knopftext. Ein
// eigener Text (inlineInputPlaceholder bzw. inlineSendText, z. B. früher im
// Design Center gespeichert oder per Script-Attribut) gewinnt, sonst die
// Texte in der Sprache des Widgets. Seit 7.22.2 liefert der Server bei einem
// eigenen Platzhalter des Chats (sendMessageText) denselben Text als
// inlineInputPlaceholder, und der Standard der Leiste gleicht dem des
// Eingabefelds: eingeklappt und aufgeklappt derselbe Text (Nutzer 23.10.2026).
export function inlineBarTexts(settings = {}) {
  const t = panelTexts(settings);
  return {
    placeholder: settings.inlineInputPlaceholder || t.inlineBarPlaceholder,
    sendText: settings.inlineSendText || t.inlineSendText,
  };
}

// Frühere Standardtexte (Widget- bzw. Design-Center-Vorbelegung), die als
// Wert gespeichert sein können, obwohl der Kunde nie eigenen Text geschrieben
// hat. Sie gelten beim Laden als „nicht gesetzt“ (loadEmbedSettings ->
// dropLegacyDefaults je Quelle: Schlüssel entfällt, der nächstniedrigere Wert
// greift), damit der neue Standard greift. Gespeichert bleibt alles
// unverändert (nur die Anzeige ändert sich).
// Begrüßung: dieselben vier Texte für greeting und greetingBubbleText wie im
// Fork (server/utils/chats/embedStandards.js LEGACY_DEFAULT_GREETINGS): alter
// Widget-Standard von greeting (Datenschutzsatz, steht jetzt in der eigenen
// Datenschutz-Blase), alte Design-Center-Vorbelegung und der bisherige
// Standard der Begrüßungsblase (de/en).
const LEGACY_DEFAULT_GREETINGS = [
  "Dieser Chatbot nutzt künstliche Intelligenz (KI). Ihre Nachrichten werden nicht an Dritte weitergegeben, können aber zur Qualitätssicherung von uns eingesehen werden. Bitte geben Sie keine sensiblen personenbezogenen Daten ein.",
  "Hallo und herzlich willkommen! Ich helfe Ihnen gerne weiter und beantworte Ihre Fragen mit intelligenten, KI-gestützten Antworten.",
  "Hallo! Ich bin Ihr digitaler Berater mit künstlicher Intelligenz (KI). Beschreiben Sie einfach, was Sie suchen.",
  "Hello! I am your digital advisor powered by artificial intelligence (AI). Just describe what you are looking for.",
];
export const LEGACY_DEFAULT_TEXTS = {
  greeting: LEGACY_DEFAULT_GREETINGS,
  greetingBubbleText: LEGACY_DEFAULT_GREETINGS,
  // bisherige Überschrift mit Doppelpunkt
  privacyTitle: ["Datenschutz:", "Privacy:"],
  // alter Platzhalter = dieselbe Frage wie die neue Begrüßung
  // frühere Standards (bis 7.22.1 „Ihre Frage eingeben“/„Enter your question“), wie der Server
  sendMessageText: [
    "Wie kann ich Ihnen helfen?",
    "Ihre Frage eingeben",
    "Enter your question",
  ],
  // frühere feste Menütexte (Widget-Standard bzw. Einbau-Beispiel): gelten
  // als nicht gesetzt, damit die Sprache des Widgets greift (uiTexts)
  resetBurgerText: ["Chat zurücksetzen", "Reset Chat"],
  emailBurgerText: ["E-Mail Support", "Email Support"],
  sessionBurgerText: ["Chat-ID"],
  historyBurgerText: ["Frühere Chats"],
};
export function dropLegacyDefaults(settings = {}) {
  const out = { ...settings };
  for (const [key, olds] of Object.entries(LEGACY_DEFAULT_TEXTS)) {
    const v = out[key];
    if (typeof v === "string" && olds.includes(v.trim())) delete out[key];
  }
  return out;
}

// Begrüßungsblase: EIN Text. greetingBubbleText (früheres eigenes Feld der
// Blase) hat Vorrang vor greeting (Begrüßungstext), danach der Standard der
// Sprache. Begründung: wer die Blase eigens beschriftet hat, hat diesen Text
// zuletzt für die Blase gewählt; greeting war bis dahin oft nur der kleine
// Satz unter der Blase bzw. der Datenschutzsatz.
// Längere Texte (alte Begrüßung ohne Längengrenze) werden gekürzt, nicht
// verworfen (shortenGreeting, Fixliste 7.22-rc7 Nr. 9).
export function greetingText(settings = {}) {
  for (const key of ["greetingBubbleText", "greeting"]) {
    const v = settings[key];
    if (typeof v === "string" && v.trim().length > 0)
      return shortenGreeting(v.trim());
  }
  return panelTexts(settings).greetingBubble;
}

// Begrüßung für die Blase: bis GREETING_BUBBLE_TEXT_MAX_LEN Zeichen
// unverändert, länger auf ein Wortende gekürzt (ab GREETING_WORD_CUT_MIN,
// davor hart) mit „…“. Allein das Widget kürzt (Review 7.22-rc6 F08), der
// Server liefert die Begrüßung ungekürzt. Wörtlich dieselbe Regel wie
// bubbleGreetingText() im Design Center (Fork, EmbedAppearance/widgetKeys.js,
// genutzt von previewGreeting() für die Vorschau).
export const GREETING_WORD_CUT_MIN = 200;
export function shortenGreeting(text) {
  if (typeof text !== "string") return text;
  if (text.length <= GREETING_BUBBLE_TEXT_MAX_LEN) return text;
  let cut = text.slice(0, GREETING_BUBBLE_TEXT_MAX_LEN - 1);
  const space = cut.search(/\s\S*$/);
  if (space >= GREETING_WORD_CUT_MIN) cut = cut.slice(0, space);
  // kein halbes Ersatzpaar (Emoji) am Ende
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.replace(/[\s.,;:!?]+$/u, "")}…`;
}

// Untertitel unter dem Namen in der Titelleiste (Fixliste 7.22-rc8 R5):
// "" = bewusst keiner (im Design Center leer gespeichert, der Server liefert
// dann assistantSubtitle ""), ein eigener Text wie geliefert, null/undefined
// (nicht gespeichert, älterer Server) = Standard der Sprache
// („Online-Berater mit künstlicher Intelligenz“). Ein data-assistant-subtitle
// am Skript wirkt nicht (Gruppe A, useScriptAttributes DC_COVERED).
export function assistantSubtitleText(settings = {}) {
  const v = settings.assistantSubtitle;
  if (v === "") return "";
  if (typeof v === "string" && v.trim()) return v.trim();
  return panelTexts(settings).assistantSubtitle;
}

// Gespeicherte Überschrift des Datenschutz-Hinweises: "" = im Design Center
// geleert, null/undefined = Standard der Sprache. Das Datenschutz-Fenster
// braucht immer eine Überschrift (aria-labelledby): dort gilt "" als
// Standard (privacyDialogTitle).
export function privacyTitleText(settings = {}) {
  if (settings.privacyTitle === "") return "";
  if (typeof settings.privacyTitle === "string" && settings.privacyTitle.trim())
    return settings.privacyTitle.trim();
  return panelTexts(settings).privacyTitle;
}

// Datenschutz-Text (privacyText), Regel seit Design Center vereinfacht:
//  - Zeilen, die mit „•“, „-“ oder „–“ beginnen, werden Aufzählungspunkte
//    (Zeichen entfernt), alle anderen Zeilen Absätze.
//  - Rückwärtskompatibel: enthält KEINE Zeile ein solches Zeichen, ist es das
//    alte Format „ein Punkt je Zeile (bzw. "|")“ -> bei mehr als einer Zeile
//    werden alle Zeilen Aufzählungspunkte wie bisher; eine einzelne Zeile ist
//    ein Absatz.
// Leere Zeilen verworfen. Rückgabe: [{ type: "bullet" | "paragraph", text }].
const PRIVACY_BULLET_RE = /^[•\-–]\s*/;
function privacyLines(text) {
  const clean = (parts) =>
    parts.map((l) => l.trim()).filter((l) => l.length > 0);
  if (typeof text !== "string") return { marked: false, lines: [] };
  const lines = clean(text.split(/\r?\n/));
  if (lines.some((l) => PRIVACY_BULLET_RE.test(l)))
    return { marked: true, lines };
  return { marked: false, lines: clean(text.split(/\r?\n|\|/)) };
}
export function parsePrivacyText(text) {
  const { marked, lines } = privacyLines(text);
  if (lines.length === 0) return [];
  if (!marked)
    return lines.length === 1
      ? [{ type: "paragraph", text: lines[0] }]
      : lines.map((t) => ({ type: "bullet", text: t }));
  return lines
    .map((l) =>
      PRIVACY_BULLET_RE.test(l)
        ? { type: "bullet", text: l.replace(PRIVACY_BULLET_RE, "").trim() }
        : { type: "paragraph", text: l },
    )
    .filter((b) => b.text.length > 0);
}

// Überschrift des Datenschutz-Fensters: gespeicherter Titel, sonst (auch bei
// "") der Standard der Sprache („Datenschutz“ bzw. „Privacy“).
export function privacyDialogTitle(settings = {}) {
  return privacyTitleText(settings) || panelTexts(settings).privacyTitle;
}

// Wirksame Blöcke des Datenschutz-Texts: privacyText bzw. Standard der Sprache.
export function privacyBlocks(settings = {}) {
  const own = parsePrivacyText(settings.privacyText);
  return own.length > 0
    ? own
    : panelTexts(settings).privacyPoints.map((text) => ({
        type: "bullet",
        text,
      }));
}

// Aufeinanderfolgende Aufzählungspunkte -> eine Liste; Absätze einzeln
// (Darstellung im Datenschutz-Fenster).
export function groupPrivacyBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.type === "bullet") {
      if (last?.type === "list") last.items.push(b.text);
      else out.push({ type: "list", items: [b.text] });
    } else out.push({ type: "paragraph", text: b.text });
  }
  return out;
}

// Link zur Datenschutzerklärung (privacyUrl) im Datenschutz-Fenster: nur ein
// Wert, den safeUrl annimmt (absolute https-URL oder Pfad der eigenen
// Seite), und nur, wenn er gegen die Adresse der Seite aufgelöst http: oder
// https: ergibt (ein Pfad auf einer file:-Seite wird nicht verlinkt). Prüft
// auch Werte, die nicht über loadEmbedSettings kamen. Sonst null (kein Link).
export function privacyHref(value) {
  const url = safeUrl(value);
  if (!url) return null;
  try {
    const base = typeof document !== "undefined" ? document.baseURI : undefined;
    const { protocol } = new URL(url, base);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch (e) {
    return null;
  }
}

// Feste Standards (Design Center vereinfacht, 15.10.2026), ohne Feld im
// Design Center: Gruppe B nach E23 (Fixliste 7.22-rc17). Eine Skript-Angabe
// verfeinert sie; ohne Skript-Angabe gilt der feste Wert, auch gegen einen
// Altwert vom Server (der Server liefert dieselben Werte). Dieselbe Regel
// gilt für INLINE_STANDARDS (applyFixedStandards, Fixliste 7.22-rc18 C18).
// Bis 7.22.2 galt bei angeschaltetem Datenschutz-Hinweis greetingStyle
// "bubble" auch gegen eine Skript-Angabe (E26): die Datenschutz-Blase stand
// unter der Begrüßungsblase. Seit 7.23 gibt es die Blase nicht mehr (Link in
// der Fußzeile), die Ausnahme entfällt.
// Randabstände der Chatblase (offsetX/offsetY, Standard 16 px), Max. Breite
// der Inline-Box (inlineMaxWidth, Standard volle Breite des Platzhalters) und
// Stil der Inline-Leiste (inlineTheme, Standard: folgt dem Farbschema).
export const FIXED_STANDARDS = {
  greetingStyle: "bubble",
  suggestionStyle: "pills",
  followUps: "pills",
  onlineDot: false,
  offsetX: null,
  offsetY: null,
  inlineMaxWidth: null,
  inlineTheme: null,
};
// KI-Hinweis (E24, Fixliste 7.22-rc17): fest unter dem Eingabefeld, Text
// fest (PANEL_TEXTS.aiDisclaimer). Auf keinem Weg abschalt- oder änderbar,
// weder per Skript-Angabe noch vom Server noch per CSS-Variable
// (utils/theme.js AI_NOTICE_COLORS). In derselben Zeile steht immer der Link
// „Datenschutz“ (Nutzerentscheidung 23.10.2026, 7.23): privacyNotice fest
// "link", ohne Auswahl im Design Center. Der Server liefert fest "link";
// gespeicherte Altwerte ("bubble", "none", "modal"), ein fehlender Wert und
// ein Script-Attribut (data-privacy-notice, Gruppe A) ändern nichts. Keine
// Datenschutz-Blase beim Start und kein Einmal-Hinweis mit Bestätigung (Hard
// Constraint 2).
export const AI_NOTICE = {
  disclaimer: "footer",
  disclaimerText: null,
  privacyNotice: "link",
};

// Inline: Standard wie die Demo-Seite (/var/docker/demo/site/app.js,
// loadWidgetScript: data-inline-input "true", data-inline-open-on "focus",
// data-inline-layout "overlay", data-inline-effect "morph",
// data-inline-height "520px", data-inline-start-state "collapsed",
// data-inherit-font "true"; Leisten-Stil folgt dem Fenster-Theme, Breite =
// Platzhalter). Nur im Inline-Modus, in der Chatblase wirkungslos. Regel wie
// FIXED_STANDARDS (Gruppe B nach E23): eine Skript-Angabe schlägt den
// Standard, ohne Skript-Angabe gilt er, auch gegen einen Altwert vom Server
// (der Server liefert dieselben Werte; Fixliste 7.22-rc18 C18).
export const INLINE_STANDARDS = {
  inlineInput: true,
  inlineOpenOn: "focus",
  inlineLayout: "overlay",
  inlineEffect: "morph",
  inlineHeight: "520px",
  inlineStartState: "collapsed",
  inheritFont: true,
};

// Willkommensblasen je Gerät (KIE-568, Nutzer 15.10.2026): wie der
// Datenschutz-Hinweis zählt allein der Wert vom Server (Design Center
// gewinnt, ein Script-Attribut data-welcome-bubbles-* wirkt nicht).
// Fehlend oder ungültig = "first" (bisheriges Verhalten). undefined, wenn der
// Server keinen gültigen Wert geliefert hat (applyFixedStandards).
export function welcomeBubblesSetting(serverValue) {
  return oneOf(serverValue, WELCOME_BUBBLES_VALUES);
}

// Wirksamer Modus der Willkommensblasen für das beim Laden erkannte Gerät
// (phone = Viewport < 768 px, utils/platform.js isPhoneViewport).
export function welcomeBubblesMode(settings = {}, phone = false) {
  const value = phone
    ? settings?.welcomeBubblesMobile
    : settings?.welcomeBubblesDesktop;
  return oneOf(value, WELCOME_BUBBLES_VALUES) || DEFAULT_WELCOME_BUBBLES;
}

// Einmal beim Laden (loadEmbedSettings): feste Standards und im Inline-Modus
// die Inline-Standards setzen, außer das Skript gibt den Wert vor
// (scriptKeys, eine Regel für beide Tabellen), KI-Hinweis und Link
// „Datenschutz“ fest, Willkommensblasen aus dem Server-Wert (server =
// geprüfte Server-Konfiguration), ohne eigenen Namen den Standardnamen der
// Sprache (brandText im Kopf, assistantName über den Antworten; „KI-Berater“
// bzw. „AI Advisor“).
export function applyFixedStandards(
  settings = {},
  server = {},
  scriptKeys = new Set(),
) {
  const out = { ...settings, ...AI_NOTICE };
  for (const [key, value] of Object.entries(FIXED_STANDARDS))
    if (!scriptKeys.has(key)) out[key] = value;
  // Willkommensblasen: nur der Server-Wert zählt, ohne gültigen Wert "first"
  // (data-bubble-persistence wirkt nicht, Gruppe A)
  for (const key of ["welcomeBubblesDesktop", "welcomeBubblesMobile"])
    out[key] = welcomeBubblesSetting(server?.[key]) || DEFAULT_WELCOME_BUBBLES;
  delete out.bubblePersistence;
  if (out.displayMode === "inline")
    for (const [key, value] of Object.entries(INLINE_STANDARDS))
      if (!scriptKeys.has(key)) out[key] = value;
  const name = panelTexts(out).assistantName;
  for (const key of ["brandText", "assistantName"])
    if (typeof out[key] !== "string" || out[key].trim() === "") out[key] = name;
  out.assistantSubtitle = assistantSubtitleText(out);
  return out;
}

// Antworten mit Kursen ohne gespeicherte Wahl (Fixliste 7.22-rc8 R4): der
// Standard hängt an der TATSÄCHLICHEN Darstellung, die nur das Widget kennt
// (Inline nur mit gefundenem Platzhalter; sonst Chatfenster): In der Seite
// Kurskarten ("auto"), im Chatfenster Nur Text mit Links ("off"). Der Server
// liefert courseCards nur, wenn im Design Center gespeichert; dieser Wert
// gewinnt immer. Ein data-course-cards am Skript wirkt nicht (Gruppe A,
// useScriptAttributes DC_COVERED): der Server
// kennt es nicht und entscheidet über courseSources nach demselben Standard
// (er bekommt die Darstellung mit jeder Chat-Anfrage, displayMode im Body
// von stream-chat, models/chatService.js).
export const DISPLAYED_VALUES = ["bubble", "inline"];
export function courseCardsDefault(displayed) {
  return displayed === "inline" ? "auto" : "off";
}
export function displayedCourseCards(settings = {}, displayed = "bubble") {
  return (
    oneOf(settings?.courseCards, COURSE_CARDS_VALUES) ||
    courseCardsDefault(displayed)
  );
}
// Settings nach der Entscheidung über die Darstellung (App.jsx): displayMode
// = tatsächliche Darstellung, courseCards = gespeicherter Wert oder Standard
// der Darstellung. Vorher steht in displayMode die konfigurierte Darstellung.
export function applyDisplayed(settings = {}, inline = false) {
  const displayed = inline ? "inline" : "bubble";
  return {
    ...settings,
    displayMode: displayed,
    courseCards: displayedCourseCards(settings, displayed),
  };
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

// Datenschutz-Text: 1–12 Zeilen mit je höchstens 500 Zeichen, sonst
// verworfen (nicht gekürzt). Rückgabe normalisiert: getrimmte Zeilen, leere
// verworfen; altes Format (keine Zeile mit Aufzählungszeichen) wie bisher ein
// Punkt je Zeile ("|" wird zum Zeilenumbruch).
function privacyTextValue(value) {
  const v = shortText(value, PRIVACY_TEXT_MAX_LEN);
  if (v === undefined) return undefined;
  const { lines } = privacyLines(v);
  if (
    lines.length === 0 ||
    lines.length > PRIVACY_LINES_MAX ||
    lines.some((l) => l.length > PRIVACY_LINE_MAX_LEN)
  )
    return undefined;
  return lines.join("\n");
}

// Überschrift der Datenschutz-Blase: leer (nur Leerraum) = bewusst keine
// Überschrift ("" bleibt erhalten), sonst Text bis 120 Zeichen.
function privacyTitleValue(value) {
  if (typeof value === "string" && value.trim() === "") return "";
  return shortText(value, PRIVACY_TITLE_MAX_LEN);
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
  // (Leiste folgt dem Fenster-Theme, utils/theme.js resolveBarTheme).
  // Standard null (FIXED_STANDARDS), per Skript-Angabe verfeinerbar (E23).
  inlineTheme: (v) => oneOf(v, ["light", "dark"]),
  inheritFont: bool,
  // Kurskarten (nur Server-Wert, Fixliste 7.22-rc8 R4); ungültig ->
  // verworfen -> null -> Standard der tatsächlichen Darstellung
  // (displayedCourseCards)
  courseCards: (v) => oneOf(v, COURSE_CARDS_VALUES),
  // Position der Kurskarten; ungültig -> verworfen -> Standard "above"
  // (DEFAULT_COURSE_CARDS_POSITION)
  courseCardsPosition: (v) => oneOf(v, COURSE_CARDS_POSITION_VALUES),
  // Kartenlayout; ungültig -> verworfen -> Standard "rows"
  // (DEFAULT_COURSE_CARDS_LAYOUT; Warnung wie unten, warnInvalidInlineEnums)
  courseCardsLayout: (v) => oneOf(v, COURSE_CARDS_LAYOUT_VALUES),
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
  // zu lang: gekürzt statt verworfen (shortenGreeting)
  greetingBubbleText: (v) => {
    if (typeof v !== "string" || v.trim().length === 0) return undefined;
    return shortenGreeting(v.trim());
  },
  // leer (nur Leerraum) = bewusst kein Untertitel ("" bleibt erhalten,
  // Fixliste 7.22-rc8 R5), sonst Text bis 60 Zeichen (zu lang: verworfen)
  assistantSubtitle: (v) => {
    if (typeof v === "string" && v.trim() === "") return "";
    return shortText(v, ASSISTANT_SUBTITLE_MAX_LEN);
  },
  onlineDot: bool,
  privacyNotice: (v) => oneOf(v, PRIVACY_NOTICE_VALUES),
  privacyTitle: privacyTitleValue,
  privacyText: privacyTextValue,
  privacyUrl: safeUrl,
  disclaimer: (v) => oneOf(v, DISCLAIMER_VALUES),
  // Folgefragen-Pillen: ungültig -> verworfen (Standard "none"), Warnung wie
  // oben (warnInvalidInlineEnums)
  followUps: (v) => oneOf(v, FOLLOW_UPS_VALUES),
  // Willkommensblasen je Gerät: ungültig -> verworfen -> "first"
  // (wirksam nur der Server-Wert, applyFixedStandards)
  welcomeBubblesDesktop: (v) => oneOf(v, WELCOME_BUBBLES_VALUES),
  welcomeBubblesMobile: (v) => oneOf(v, WELCOME_BUBBLES_VALUES),
  disclaimerText: (v) => shortText(v, DISCLAIMER_TEXT_MAX_LEN),
  // Theme des ganzen Fensters (CSS-Variablen, utils/theme.js). Ungültig ->
  // eine Warnung, Feld fällt weg -> nächstniedrigerer Wert (Standard "light").
  theme: (v) => {
    const t = oneOf(v, THEME_VALUES);
    if (t === undefined)
      console.warn(
        `[AnythingLLM Embed] Ungültiger theme-Wert ${JSON.stringify(v)}. Erlaubt: ${THEME_VALUES.join(", ")}. Es gilt der Standard "light".`,
      );
    return t;
  },
};

// Ungültige inlineLayout-/inlineEffect-Werte (ebenso inlineOpenOn):
// je Quelle eine console.warn-Zeile, die den tatsächlich geltenden Wert nennt
// (gültiger Wert der anderen Quelle bzw. Standard). script/server = Rohwerte
// (Script-Attribute bzw. nicht leere visual_config-Werte), settings = fertig
// zusammengeführte Settings. Herkunft bei festen Standards (FIXED_STANDARDS,
// INLINE_STANDARDS, KI-Hinweis AI_NOTICE und SERVER_FIXED_KEYS): ein
// Server-Wert ist dort kein Wert aus dem Design Center, es gilt das
// Script-Attribut, wenn sein Wert wirkt, sonst der „Standard“
// (applyFixedStandards; Fixliste 7.22-rc20 W82). Die Inline-Schlüssel
// zählen auch im Chatfenster dazu: der Server schickt sie an jedes Widget
// (Fork server/utils/chats/embedStandards.js INLINE_FIXED_STANDARDS,
// Fixliste 7.22-rc21 W92).
const ENUM_SOURCES = [
  ["script", "Script-Attribut"],
  ["server", "Design Center"],
];
// Vom Server immer als fester Standard geliefert, ohne Feld im Design Center
// und ohne Eintrag in FIXED_STANDARDS (Fork EMBED_FIXED_STANDARDS; die
// Skript-Angabe schlägt ihn, Gruppe B; W92)
const SERVER_FIXED_KEYS = ["courseCardsLayout"];
function isFixedStandard(key) {
  return (
    key in AI_NOTICE ||
    key in FIXED_STANDARDS ||
    key in INLINE_STANDARDS ||
    SERVER_FIXED_KEYS.includes(key)
  );
}
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
    ["followUps", FOLLOW_UPS_VALUES],
    ["courseCardsLayout", COURSE_CARDS_LAYOUT_VALUES],
  ]) {
    const valid = (src) => oneOf(raw[src][key], allowed) !== undefined;
    for (const [src, label] of ENUM_SOURCES) {
      const value = raw[src][key];
      if (value === undefined || value === null || value === "" || valid(src))
        continue;
      const scriptWins =
        !(key in AI_NOTICE) &&
        valid("script") &&
        settings[key] === oneOf(raw.script[key], allowed);
      const origin = isFixedStandard(key)
        ? scriptWins
          ? "Script-Attribut"
          : "Standard"
        : valid("server")
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
        `[AnythingLLM Embed] Ungültiger ${key}-Wert ${JSON.stringify(value)} (${label}). Erlaubt: ${allowed.join(", ")}. Wert wird verworfen, es gilt ${effective} (${origin}).`,
      );
    }
  }
}

// inlineInput gilt nur im Inline-Modus. Wird das Widget als Blase gezeigt
// (displayMode "bubble" oder Platzhalter fehlt), bleibt die Blase unverändert;
// eine Warnzeile weist auf das ignorierte Attribut hin, aber nur, wenn die
// Seite data-inline-input selbst gesetzt hat (script = rohe Script-
// Attribute). Der Server liefert inlineInput als festen Inline-Standard an
// jedes Widget; das ist keine Fehlkonfiguration der Seite. Rückgabe: gewarnt?
export function warnIfInlineInputIgnored(script = {}, isInline = false) {
  if (isInline || layoutValidations.inlineInput(script?.inlineInput) !== true)
    return false;
  console.warn(
    "[AnythingLLM Embed] inlineInput (data-inline-input) wirkt nur im Inline-Modus und wird im Chatfenster ignoriert.",
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

// Pillen im Panel (suggestionStyle "pills"): dieselbe Liste wie die Chips
// (inlineChips, höchstens INLINE_CHIPS_MAX); { text: vollständige Frage (wird
// gesendet), label: Anzeige, ab PANEL_PILL_TEXT_MAX Zeichen mit … gekürzt }.
export function panelPills(settings = {}) {
  return inlineChips(settings).map((text) => ({
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
      `[AnythingLLM Embed] Ungültiger data-mount-Selektor "${sel}". Das Chatfenster wird verwendet.`,
    );
    return null;
  }
  if (matches.length === 0) {
    console.warn(
      `[AnythingLLM Embed] Inline-Modus: Platzhalter "${sel}" nicht gefunden. Das Chatfenster wird verwendet.`,
    );
    return null;
  }
  if (matches.length > 1)
    console.warn(
      `[AnythingLLM Embed] Platzhalter "${sel}" ${matches.length}x gefunden, der erste wird verwendet.`,
    );
  const target = matches[0];
  if (!isSuitableMountTarget(target, host)) {
    console.warn(
      `[AnythingLLM Embed] Platzhalter "${sel}" ist als Einhängeort ungeeignet (<${target.tagName.toLowerCase()}>). Das Chatfenster wird verwendet.`,
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
