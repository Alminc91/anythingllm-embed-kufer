// Kursanzahl im Untertitel (KIE-576 Paket 3, Spezifikation
// issues/KIE-576/KIE-576-kursanzahl.md, Abschnitt „Widget“ und Nachträge
// 26.10.2026). Der Server liefert courseCount nur, wenn die Anzeige an und
// die Kursliste gültig und aktuell ist (Vertrag, die 24-h-Regel entscheidet
// der Server); das Widget prüft das Feld beim Laden (utils/layout.js
// courseCountValue: count und word). Besucher sehen nur „aktuell <n> <w>“,
// fehlende und ausgeblendete Kurse und der Stand sind Betreiber-Info
// (Fixliste r4 Nr. 1). Alle Texte als Text (nie HTML).
import { courseCountValue, panelLanguage, uiTexts } from "@/utils/layout";

const LOCALES = { de: "de-DE", en: "en-US" };

export function formatCourseNumber(n, settings = {}) {
  return new Intl.NumberFormat(LOCALES[panelLanguage(settings)]).format(n);
}

// Texte der Untertitel-Zeile; null ohne gültige Kursanzahl (dann gilt der
// Untertitel wie bisher, NAK-K5)
export function courseCountTexts(settings = {}) {
  const value = courseCountValue(settings?.courseCount);
  if (!value) return null;
  const ui = uiTexts(settings);
  const word = value.word || ui.courseCountWord;
  const number = formatCourseNumber(value.count, settings);
  return {
    count: value.count,
    number,
    word,
    lead: ui.courseCountLead,
    subtitle: `${ui.courseCountLead} ${number} ${word}`,
  };
}
