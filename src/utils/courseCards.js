// Kufer: Kurskarten unter einer Antwort (opt-in, Setting courseCards "auto").
//
// Der Server (Fork, Image >= 7.9) liefert zu einer Antwort `courseSources`:
// nur Kurs-Metadaten (url, title, start_date, end_date, start_minutes,
// weekdays, price, bookable, format, location), nie Kontexttext. Welche davon
// als Karte erscheinen, bestimmt allein die Antwort:
//   - Kurse, deren Kursseite in der Antwort verlinkt ist (URL-Match, Vorrang)
//   - Kurse, deren Titel in der Antwort genannt wird (normalisiert, >= 90 %
//     Ähnlichkeit, nur eindeutig — gleichnamige Kurse ohne Link: keine Karte)
// Dedupe über die URL, Sortierung nach Beginn, höchstens 5 Karten; ab 6
// Kursen eine Kompaktliste (höchstens 10 Zeilen). Ein Link der Antwort auf
// eine Programmkategorie derselben Domain wird zum Abschlusslink.
// Fehlende Felder werden weggelassen, nie geschätzt oder aus anderen Quellen
// ergänzt. Der Antworttext selbst wird nicht verändert.

export const COURSE_CARDS_MAX = 5;
export const COURSE_COMPACT_MAX = 10;
export const TITLE_MATCH_MIN = 0.9;
export const MORE_COURSES_TEXT = "weitere Kurse im Programm";
export const CATEGORY_FALLBACK_TEXT = "Alle Kurse ansehen";

const EMPTY = Object.freeze({
  cards: [],
  compact: false,
  categoryLink: null,
  more: 0,
});

const WEEKDAY_LABELS = {
  mon: "Mo",
  tue: "Di",
  wed: "Mi",
  thu: "Do",
  fri: "Fr",
  sat: "Sa",
  sun: "So",
};
const WEEKDAY_ORDER = Object.keys(WEEKDAY_LABELS);
const DATE_RX = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS_RX = /^,((mon|tue|wed|thu|fri|sat|sun),)+$/;

// Öffentliche Zweitebenen-Endungen, bei denen die "Kundendomain" drei Labels hat
const SECOND_LEVEL = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gv.at",
  "or.at",
  "co.at",
  "ac.at",
  "com.au",
]);

// Pfade, die nach Programm-/Kategorieseite aussehen (Abschlusslink)
const CATEGORY_PATH_RX =
  /\/(programm|kursprogramm|programme|kurse|kursangebot|kategorie|kategorien|kurssuche|fachbereich|fachbereiche|bereich|bereiche|themen|thema|angebot|angebote|category|categories)(\/|$)/i;
// Pfade, die nach einzelner Kursseite aussehen (nie Abschlusslink)
const COURSE_PATH_RX =
  /\/(kurs|course|veranstaltung|event)\/[^/]+\/[^/]+|\/(kurs|course)\/[^/]*\d|[?&](kursnr|knr|kursid|courseid)=/i;

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
export function courseCardsEnabled(settings = {}) {
  return settings?.courseCards === "auto";
}

function httpUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const u = new URL(value.trim());
    return ["http:", "https:"].includes(u.protocol) ? u : null;
  } catch (e) {
    return null;
  }
}

// Vergleichsschlüssel: Schema, "www.", Fragment, Schluss-Slash und
// Groß-/Kleinschreibung egal (Modelle schreiben Kursnummern gern klein).
export function normalizeUrl(value) {
  const u = httpUrl(value);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  return `${host}${path}${u.search}`.toLowerCase();
}

export function siteDomain(hostname) {
  if (typeof hostname !== "string" || hostname.length === 0) return null;
  const host = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (/^[\d.]+$/.test(host) || !host.includes(".")) return host;
  const labels = host.split(".");
  const lastTwo = labels.slice(-2).join(".");
  if (SECOND_LEVEL.has(lastTwo) && labels.length >= 3)
    return labels.slice(-3).join(".");
  return lastTwo;
}

function domainOfUrl(value) {
  const u = httpUrl(value);
  return u ? siteDomain(u.hostname) : null;
}

// Text für den Titelvergleich: klein, Umlaute gefaltet, nur Buchstaben/Ziffern
export function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

// Beste Ähnlichkeit eines (normalisierten) Titels zu einem Textfenster der
// Antwort mit ähnlich vielen Wörtern. Exakter Wortfolgen-Treffer = 1.
export function titleSimilarity(normTitle, normReply) {
  if (!normTitle || !normReply) return 0;
  if (` ${normReply} `.includes(` ${normTitle} `)) return 1;
  const words = normReply.split(" ");
  const n = normTitle.split(" ").length;
  let best = 0;
  for (let size = Math.max(1, n - 1); size <= n + 1; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      const window = words.slice(i, i + size).join(" ");
      const longer = Math.max(window.length, normTitle.length);
      // Längenunterschied > 10 % -> 90 % sind nicht erreichbar
      if (Math.abs(window.length - normTitle.length) > longer * 0.1) continue;
      const s = similarity(window, normTitle);
      if (s > best) best = s;
      if (best === 1) return 1;
    }
  }
  return best;
}

// Zu kurze/allgemeine Titel ("Yoga") nie per Titel zuordnen, nur per Link.
function titleMatchable(normTitle) {
  return normTitle.length >= 8 && normTitle.split(" ").length >= 2;
}

// Links der Antwort: [Text](url), <a href="url">Text</a>, <url>, nackte URL
export function extractLinks(replyText = "") {
  const text = typeof replyText === "string" ? replyText : "";
  const links = [];
  const push = (url, label) => {
    const clean = typeof url === "string" ? url.replace(/[).,;:!?]+$/, "") : "";
    if (!httpUrl(clean)) return;
    links.push({ url: clean, text: (label || "").trim() });
  };
  const md = /\[([^\]]*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (const m of text.matchAll(md)) push(m[2], m[1]);
  const anchor =
    /<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of text.matchAll(anchor))
    push(m[1], m[2].replace(/<[^>]*>/g, ""));
  // nackte URLs, die nicht schon Teil eines Markdown-/HTML-Links sind
  const stripped = text.replace(md, " ").replace(anchor, " ");
  for (const m of stripped.matchAll(/<?(https?:\/\/[^\s<>"'\]]+)>?/g))
    push(m[1], "");
  return links;
}

// Antworttext ohne URLs und Markdown-Linkziele (für den Titelvergleich)
function replyPlainText(replyText) {
  return String(replyText || "")
    .replace(/<think>[\s\S]*?<\/think>/g, " ")
    .replace(/\]\(\s*<?https?:\/\/[^)]*\)/g, "] ")
    .replace(/https?:\/\/\S+/g, " ");
}

function isCourseSource(entry) {
  return (
    entry &&
    typeof entry === "object" &&
    typeof entry.title === "string" &&
    entry.title.trim().length > 0 &&
    !!httpUrl(entry.url) &&
    ((typeof entry.start_date === "string" && DATE_RX.test(entry.start_date)) ||
      (typeof entry.weekdays === "string" && WEEKDAYS_RX.test(entry.weekdays)))
  );
}

function capitalizeWords(value) {
  return value.replace(
    /(^|[\s\-.])([a-zäöü])/g,
    (_m, sep, ch) => `${sep}${ch.toUpperCase()}`,
  );
}

// ---------------------------------------------------------------------------
// Formatierung (deutsch)
// ---------------------------------------------------------------------------
export function formatWeekdays(weekdays) {
  if (typeof weekdays !== "string" || !WEEKDAYS_RX.test(weekdays)) return null;
  const set = new Set(weekdays.split(",").filter(Boolean));
  return WEEKDAY_ORDER.filter((d) => set.has(d))
    .map((d) => WEEKDAY_LABELS[d])
    .join(", ");
}

export function formatTime(startMinutes) {
  const n = Number(startMinutes);
  if (!Number.isInteger(n) || n < 0 || n >= 1440) return null;
  const h = String(Math.floor(n / 60)).padStart(2, "0");
  const m = String(n % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function formatDateDE(isoDate) {
  const m = typeof isoDate === "string" ? DATE_RX.exec(isoDate) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

// 60 -> "60 €", 175.9 -> "175,90 €"; 0/ungültig -> null (im Feed heißt 0,00
// meist "keine Angabe" — nicht als Preis zeigen)
export function formatPrice(price) {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0)
    return null;
  const whole = Number.isInteger(price);
  const text = price.toLocaleString("de-DE", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${text} €`;
}

export function formatPlace(format, location) {
  const loc =
    typeof location === "string" && location.trim().length > 0
      ? location.trim()
      : null;
  const locLabel =
    loc && loc.toLowerCase() !== "online" ? capitalizeWords(loc) : null;
  if (format === "online") return "online";
  if (format === "hybrid")
    return locLabel ? `${locLabel} · auch online` : "online und vor Ort";
  if (format === "onsite") return locLabel || "vor Ort";
  if (loc && loc.toLowerCase() === "online") return "online";
  return locLabel;
}

export function formatStatus(bookable) {
  if (bookable === true) return "buchbar";
  if (bookable === false) return "nicht buchbar";
  return null;
}

// Eine Karte: nur Felder, die es gibt — kein "undefined", keine Platzhalter.
export function formatCourse(entry, { linked = true } = {}) {
  const weekdays = formatWeekdays(entry.weekdays);
  const time = formatTime(entry.start_minutes);
  const start = formatDateDE(entry.start_date);
  const schedule = [weekdays, time ? `${time} Uhr` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    key: normalizeUrl(entry.url) || entry.title,
    url: linked ? httpUrl(entry.url)?.toString() || null : null,
    title: entry.title.trim(),
    schedule: schedule || null,
    weekdays,
    time,
    start: start ? `ab ${start}` : null,
    place: formatPlace(entry.format, entry.location),
    price: formatPrice(entry.price),
    status: formatStatus(entry.bookable),
    bookable: typeof entry.bookable === "boolean" ? entry.bookable : null,
    startDate: start ? entry.start_date : null,
  };
}

// ---------------------------------------------------------------------------
// Auswahl
// ---------------------------------------------------------------------------
/**
 * Welche Kurse erscheinen unter der Antwort?
 * @param {string} replyText - Antwort (Markdown) — wird nicht verändert
 * @param {object[]} courseSources - Kurs-Metadaten vom Server
 * @param {object} settings - Widget-Settings (courseCards)
 * @param {{pageHost?: string}} [options] - Host der Webseite (Standard: window.location)
 * @returns {{cards: object[], compact: boolean, categoryLink: ({url: string, text: string}|null), more: number}}
 */
export function selectCourseCards(
  replyText,
  courseSources,
  settings = {},
  options = {},
) {
  if (!courseCardsEnabled(settings)) return EMPTY;
  if (typeof replyText !== "string" || replyText.trim().length === 0)
    return EMPTY;
  if (!Array.isArray(courseSources) || courseSources.length === 0) return EMPTY;

  // 1) gültige Kursquellen, Dedupe über die URL (erster gewinnt)
  const sources = [];
  const seen = new Set();
  for (const entry of courseSources) {
    if (!isCourseSource(entry)) continue;
    const key = normalizeUrl(entry.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sources.push({ entry, key, domain: domainOfUrl(entry.url) });
  }
  if (sources.length === 0) return EMPTY;

  // 2) Kundendomain: Domain der Webseite + häufigste Domain der Kursquellen.
  //    Quellen auf anderen Domains werden nicht verlinkt (weggelassen).
  const pageHost =
    options.pageHost ??
    (typeof window !== "undefined" ? window.location?.hostname : null);
  const counts = new Map();
  for (const s of sources)
    if (s.domain) counts.set(s.domain, (counts.get(s.domain) || 0) + 1);
  let majority = null;
  for (const [domain, count] of counts)
    if (!majority || count > counts.get(majority)) majority = domain;
  const allowed = new Set([siteDomain(pageHost), majority].filter(Boolean));
  const own = sources.filter((s) => allowed.has(s.domain));
  if (own.length === 0) return EMPTY;

  // 3) Zuordnung zur Antwort
  const links = extractLinks(replyText);
  const linkKeys = new Map(); // normalisierte URL -> Position in der Antwort
  links.forEach((l, i) => {
    const k = normalizeUrl(l.url);
    if (k && !linkKeys.has(k)) linkKeys.set(k, i);
  });

  const matched = [];
  const matchedKeys = new Set();
  // URL-Match hat Vorrang
  own.forEach((s, order) => {
    if (linkKeys.has(s.key)) {
      matched.push({ ...s, order, pos: linkKeys.get(s.key) });
      matchedKeys.add(s.key);
    }
  });
  // Titel-Match nur für den Rest, nur eindeutig und nicht gleichnamig zu
  // einem schon verlinkten Kurs (sonst: "Englisch 1" verlinkt + zwei weitere
  // "Englisch 1"-Termine würden fälschlich mitkommen)
  const plain = normalizeText(replyPlainText(replyText));
  const linkedTitles = matched.map((m) => normalizeText(m.entry.title));
  const rest = own.filter((s) => !matchedKeys.has(s.key));
  const titleCount = new Map();
  for (const s of own) {
    const t = normalizeText(s.entry.title);
    titleCount.set(t, (titleCount.get(t) || 0) + 1);
  }
  rest.forEach((s) => {
    const t = normalizeText(s.entry.title);
    if (!titleMatchable(t)) return;
    if (titleCount.get(t) > 1) return; // mehrdeutig
    if (linkedTitles.some((lt) => similarity(lt, t) >= TITLE_MATCH_MIN)) return;
    if (titleSimilarity(t, plain) < TITLE_MATCH_MIN) return;
    matched.push({ ...s, order: own.indexOf(s), pos: links.length + 1 });
  });
  if (matched.length === 0) return EMPTY;

  // 4) Sortierung nach Beginn (ohne Datum ans Ende), sonst Reihenfolge der Antwort
  matched.sort((a, b) => {
    const da = a.entry.start_date || "9999-99-99";
    const db = b.entry.start_date || "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    if (a.pos !== b.pos) return a.pos - b.pos;
    return a.order - b.order;
  });

  // 5) Abschlusslink: Link der Antwort auf derselben Domain, keine Kursseite
  const courseKeys = new Set(sources.map((s) => s.key));
  let categoryLink = null;
  for (const l of links) {
    const k = normalizeUrl(l.url);
    const u = httpUrl(l.url);
    if (!k || !u || courseKeys.has(k)) continue;
    if (!allowed.has(siteDomain(u.hostname))) continue;
    const path = `${u.pathname}${u.search}`;
    if (COURSE_PATH_RX.test(path) || !CATEGORY_PATH_RX.test(u.pathname))
      continue;
    const label = l.text && !httpUrl(l.text) ? l.text : CATEGORY_FALLBACK_TEXT;
    categoryLink = { url: u.toString(), text: label };
    break;
  }

  const compact = matched.length > COURSE_CARDS_MAX;
  const limit = compact ? COURSE_COMPACT_MAX : COURSE_CARDS_MAX;
  const shown = matched.slice(0, limit).map((m) => formatCourse(m.entry));
  const more = Math.max(0, matched.length - limit);
  return { cards: shown, compact, categoryLink, more };
}
