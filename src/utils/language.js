// Sprache des Widgets (settings.language, Standard "de" wie DEFAULT_SETTINGS)
// ohne i18next: für i18n.js und für den Abruf der Konfiguration
// (useScriptAttributes embedConfigUrl, Fixliste 7.22-rc13 F01).
export const DEFAULT_LANGUAGE = "de";

export function widgetLanguage(settings) {
  const raw = typeof settings?.language === "string" ? settings.language : "";
  return raw.trim().toLowerCase() || DEFAULT_LANGUAGE;
}
