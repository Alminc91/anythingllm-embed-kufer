// Kursanzahl im Untertitel (KIE-576 Paket 3, Spezifikation
// issues/KIE-576/KIE-576-kursanzahl.md, Abschnitt „Widget“; Gestaltung nach
// Mockup „Entscheidung“). Der Server liefert courseCount nur, wenn die
// Anzeige an und die Kursliste gültig ist (Vertrag); das Widget prüft das
// Feld beim Laden (utils/layout.js courseCountValue) und hier beim Anzeigen
// noch das Alter: Ist stand älter als 24 h (Uhr des Besuchers), steht der
// Untertitel wie ohne Kursanzahl. Alle Texte als Text (nie HTML).
import {
  courseCountValue,
  courseStandTime,
  panelLanguage,
  uiTexts,
} from "@/utils/layout";

export const COURSE_COUNT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Ab dieser Lücke (Anteil der angebotenen Kurse, die der KI-Berater nicht
// kennt) zusätzlich der Hinweis auf die Kurssuche der Webseite
export const COURSE_COUNT_GAP_HINT = 0.05;
const TIME_ZONE = "Europe/Berlin";
const LOCALES = { de: "de-DE", en: "en-US" };

// Gültige, nicht veraltete Kursanzahl der Settings oder null
export function activeCourseCount(settings = {}, now = Date.now()) {
  const value = courseCountValue(settings?.courseCount);
  if (!value) return null;
  const age = now - courseStandTime(value.stand);
  if (!(age <= COURSE_COUNT_MAX_AGE_MS)) return null;
  return value;
}

export function formatCourseNumber(n, settings = {}) {
  return new Intl.NumberFormat(LOCALES[panelLanguage(settings)]).format(n);
}

// Kalendertag in Europe/Berlin als Zahl der Tage seit 1970 (für heute,
// gestern), dazu Tag und Monat
function berlinDay(ms) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms)))
    parts[p.type] = p.value;
  const index =
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) /
    86400000;
  return { index, day: parts.day, month: parts.month };
}

// „heute, 10:00 Uhr“, „gestern, 10:00 Uhr“ oder „22.10., 10:00 Uhr“ in
// Europe/Berlin; englisch „today, 10:00 AM“, „yesterday, …“, „Oct 22, …“
export function courseStandText(stand, settings = {}, now = Date.now()) {
  const ms = courseStandTime(stand);
  if (!Number.isFinite(ms)) return "";
  const lang = panelLanguage(settings);
  const ui = uiTexts(settings);
  const date = new Date(ms);
  const then = berlinDay(ms);
  const diff = berlinDay(now).index - then.index;
  let day;
  if (diff <= 0) day = ui.today;
  else if (diff === 1) day = ui.yesterday;
  else if (lang === "de") day = `${then.day}.${then.month}.`;
  else
    day = new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      month: "short",
      day: "numeric",
    }).format(date);
  const time =
    lang === "de"
      ? `${new Intl.DateTimeFormat("de-DE", {
          timeZone: TIME_ZONE,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(date)} Uhr`
      : new Intl.DateTimeFormat("en-US", {
          timeZone: TIME_ZONE,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(date);
  return `${day}, ${time}`;
}

// Alle Texte für Kopf und Info-Element; null ohne gültige, aktuelle
// Kursanzahl. Info-Karte nach D-K5 (Spezifikation, „Entscheidungen und
// Nachträge“): head, scope, hiddenLine nur bei s > 0, missingLine nur bei
// m = b − n > 0, ab 5 % Lücke gapHint, stand. Einzahl (s = 1, m = 1) nur mit
// der Standardbezeichnung der Sprache, eine eigene bleibt in der Mehrzahl.
export function courseCountTexts(settings = {}, now = Date.now()) {
  const value = activeCourseCount(settings, now);
  if (!value) return null;
  const ui = uiTexts(settings);
  const word = value.word || ui.courseCountWord;
  const standardWord = word === ui.courseCountWord;
  const n = formatCourseNumber(value.count, settings);
  const hidden = value.hidden > 0 ? value.hidden : 0;
  const missing = Math.max(0, value.offered - value.count);
  const gap = missing / value.offered;
  return {
    count: value.count,
    offered: value.offered,
    hidden,
    missing,
    number: n,
    word,
    lead: ui.courseCountLead,
    subtitle: `${ui.courseCountLead} ${n} ${word}`,
    head: ui.courseCountHead(n, word),
    scope: ui.courseCountScope(word),
    hiddenLine:
      hidden === 0
        ? null
        : hidden === 1 && standardWord
          ? ui.courseCountHiddenOne
          : ui.courseCountHidden(formatCourseNumber(hidden, settings), word),
    missingLine:
      missing === 0
        ? null
        : missing === 1 && standardWord
          ? ui.courseCountMissingOne
          : ui.courseCountMissing(formatCourseNumber(missing, settings), word),
    gapHint:
      missing > 0 && gap >= COURSE_COUNT_GAP_HINT ? ui.courseCountGap : null,
    stand: ui.courseCountStand(courseStandText(value.stand, settings, now)),
  };
}
