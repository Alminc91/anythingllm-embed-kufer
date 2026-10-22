import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultNS, resources } from "./locales/resources.js";
import { DEFAULT_LANGUAGE, widgetLanguage } from "./utils/language.js";

// Sprache der i18next-Texte = Sprache des Widgets (settings.language, Standard
// "de" wie DEFAULT_SETTINGS). Früher stand hier "en" als Rückfall, sobald die
// Seite kein data-language setzte, und der Spracherkenner schrieb diese
// Sprache als allm_embed_language in den localStorage der Kundenseite
// (Fixliste 7.22-rc7 Nr. 35, E3). Die Sprache ist immer ausdrücklich gesetzt,
// ein Spracherkenner wird deshalb nicht gebraucht; den alten Eintrag räumen
// wir weg. Nach dem Laden der Konfiguration folgt syncI18nLanguage() einer
// im Design Center gespeicherten Sprache. DEFAULT_LANGUAGE und
// widgetLanguage() stehen ohne i18next in utils/language.js.
export { DEFAULT_LANGUAGE, widgetLanguage };
const LEGACY_LANGUAGE_KEY = "allm_embed_language";

function dropLegacyLanguageKey() {
  try {
    window.localStorage?.removeItem(LEGACY_LANGUAGE_KEY);
  } catch (e) {
    // Speicher gesperrt: nichts zu tun
  }
}

// Fehlt einer Sprache ein Text, gilt Deutsch wie bei den Panel- und
// Bedientexten (utils/layout.js panelLanguage, uiTexts; ATTRIBUTES.md
// „andere Sprachen nutzen dafür Deutsch“). Vorher Englisch: bei
// data-language="fr" las der Screenreader „Aufnahme starten“, der Tooltip
// zeigte „Start recording“ (Fixliste 7.22-rc13 W09).
export const FALLBACK_LANGUAGE = DEFAULT_LANGUAGE;

export function initI18n(settings) {
  dropLegacyLanguageKey();
  i18next.use(initReactI18next).init({
    fallbackLng: FALLBACK_LANGUAGE,
    lng: widgetLanguage(settings),
    debug: import.meta.env.DEV,
    defaultNS,
    resources,
    load: "languageOnly",
    lowerCaseLng: true,
    interpolation: {
      escapeValue: false,
    },
  });

  return i18next;
}

// Nach loadEmbedSettings: Sprache aus Script bzw. Server übernehmen.
// Darf das Laden nie verhindern: ohne initialisiertes i18next (Tests) bzw.
// bei einem Fehler bleibt die bisherige Sprache.
export function syncI18nLanguage(settings) {
  try {
    if (!i18next.isInitialized) return;
    const lng = widgetLanguage(settings);
    if (i18next.language !== lng) i18next.changeLanguage(lng);
  } catch (e) {
    // Sprache bleibt
  }
}

export default i18next;
