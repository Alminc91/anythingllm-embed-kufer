// Kufer: Kurskarten unter einer Antwort (opt-in, Setting courseCards "auto").
//
// Der Server (Fork, Image >= 7.9) liefert zu einer Antwort `courseSources`:
// nur Kurs-Metadaten (url, title, start_date, end_date, start_minutes,
// weekdays, price, bookable, format, location), nie Kontexttext. Welche davon
// als Karte erscheinen, bestimmt allein die Antwort:
//   - Kurse, deren Kursseite in der Antwort verlinkt ist (URL-Match, Vorrang)
//   - Kurse, deren Titel in der Antwort genannt wird (normalisiert, >= 90 %
//     Ähnlichkeit, nur eindeutig — gleichnamige Kurse ohne Link: keine Karte).
//     Längere Titel werden zuerst gesucht und ihre Fundstellen ausgeblendet:
//     "Hatha Yoga" trifft nicht innerhalb von "Hatha Yoga für Senioren".
//     Titel, die nur in einer Rückfrage ("Meinen Sie …?") vorkommen, ergeben
//     keine Karte.
// Dedupe über die URL, Sortierung nach Beginn, höchstens 5 Karten; ab 6
// Kursen eine Kompaktliste (höchstens 10 Zeilen). Ein Link der Antwort auf
// eine Programmkategorie derselben Domain wird zum Abschlusslink; Links unter
// dem Kurs-Pfadpräfix der courseSources (z. B. /kurssuche/kurs/) sind
// Kursseiten und nie Abschlusslink.
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

// Links in der Antwort. Markdown-URLs dürfen balancierte Klammern enthalten
// ([Kurs](https://vhs.de/kurs/123-(abend))).
const MD_LINK_RX =
  /\[([^\]]*)\]\(\s*<?(https?:\/\/(?:[^\s()<>]|\([^\s()<>]*\))+)>?(?:\s+"[^"]*")?\s*\)/g;
const ANCHOR_RX =
  /<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const BARE_URL_RX = /<?(https?:\/\/[^\s<>"'\]]+)>?/g;
const ANY_URL_RX = /https?:\/\/\S+/g;
const HTML_TAG_RX = /<[^>]*>/g;
// Satz = Text bis einschließlich Satzzeichen bzw. Zeilenende
const SENTENCE_RX = /[^.!?\n]+[.!?]*/g;
const WORD_RX = /\S+/g;

// Pfade, die nach Programm-/Kategorieseite aussehen (Abschlusslink)
const CATEGORY_PATH_RX =
  /\/(programm|kursprogramm|programme|kurse|kursangebot|kategorie|kategorien|kurssuche|fachbereich|fachbereiche|bereich|bereiche|themen|thema|angebot|angebote|category|categories)(\/|$)/i;
// Pfade, die nach einzelner Kursseite aussehen (nie Abschlusslink) — nur
// Rückfall, wenn sich aus den courseSources kein Kurs-Pfadpräfix ableiten
// lässt (siehe coursePathPrefixes)
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

// Fenster-Suche eines Titels in den (normalisierten) Wörtern der Antwort.
// Levenshtein nur für Kandidaten: das Fenster beginnt mit einem Titel-Token
// und enthält mindestens 50 % der (verschiedenen) Titel-Tokens; Fenster mit
// ausgeblendeten Wörtern ("") werden übersprungen. Ein bestes Fenster beginnt
// immer mit einem Titel-Token (sonst wäre das um eins verschobene, kürzere
// Fenster mindestens gleich gut), daher geht dabei kein Treffer verloren.
// onWindow(start, end, score) für jedes bewertete Fenster.
function scanTitleWindows(titleTokens, words, onWindow) {
  const n = titleTokens.length;
  if (n === 0) return;
  const normTitle = titleTokens.join(" ");
  const tokenSet = new Set(titleTokens);
  const need = Math.ceil(tokenSet.size * 0.5);
  for (let i = 0; i < words.length; i++) {
    if (!tokenSet.has(words[i])) continue;
    const seen = new Set();
    let text = "";
    for (let size = 1; size <= n + 1 && i + size <= words.length; size++) {
      const w = words[i + size - 1];
      if (!w) break; // ausgeblendet (Teil eines längeren Titels)
      if (tokenSet.has(w)) seen.add(w);
      text = size === 1 ? w : `${text} ${w}`;
      if (size < n - 1 || seen.size < need) continue;
      const longer = Math.max(text.length, normTitle.length);
      // Längenunterschied > 10 % -> 90 % sind nicht erreichbar
      if (Math.abs(text.length - normTitle.length) > longer * 0.1) continue;
      const score = text === normTitle ? 1 : similarity(text, normTitle);
      if (onWindow(i, i + size, score) === false) return;
    }
  }
}

// Beste Ähnlichkeit eines (normalisierten) Titels zu einem Textfenster der
// Antwort mit ähnlich vielen Wörtern. Exakter Wortfolgen-Treffer = 1.
export function titleSimilarity(normTitle, normReply) {
  if (!normTitle || !normReply) return 0;
  let best = 0;
  scanTitleWindows(
    normTitle.split(" "),
    normReply.split(" "),
    (_s, _e, score) => {
      if (score > best) best = score;
      return best < 1;
    },
  );
  return best;
}

// Alle nicht überlappenden Fundstellen (>= TITLE_MATCH_MIN) eines Titels;
// je Startwort das beste Fenster, danach geht es hinter der Fundstelle weiter.
function findTitleSpans(titleTokens, words) {
  const byStart = new Map();
  scanTitleWindows(titleTokens, words, (start, end, score) => {
    if (score < TITLE_MATCH_MIN) return true;
    const prev = byStart.get(start);
    if (!prev || score > prev.score) byStart.set(start, { start, end, score });
    return true;
  });
  const spans = [];
  let next = 0;
  for (const span of [...byStart.values()].sort((a, b) => a.start - b.start)) {
    if (span.start < next) continue;
    spans.push(span);
    next = span.end;
  }
  return spans;
}

// Zu kurze/allgemeine Titel ("Yoga") nie per Titel zuordnen, nur per Link.
function titleMatchable(normTitle) {
  return normTitle.length >= 8 && normTitle.split(" ").length >= 2;
}

// Satzzeichen am URL-Ende abschneiden; ")" nur, wenn sie keine "(" in der
// URL schließt (Klammern im Pfad bleiben erhalten).
function trimUrlTail(url) {
  let u = url.replace(/[.,;:!?]+$/, "");
  const count = (ch) => u.split(ch).length - 1;
  while (u.endsWith(")") && count(")") > count("("))
    u = u.slice(0, -1).replace(/[.,;:!?]+$/, "");
  return u;
}

// Gleich lange Leerzeichen statt des Treffers: Positionen bleiben erhalten.
const blankOut = (m) => " ".repeat(m.length);

// Links der Antwort: [Text](url), <a href="url">Text</a>, <url>, nackte URL —
// in Reihenfolge ihres Vorkommens, mit Position (index) im Originaltext.
export function extractLinks(replyText = "") {
  const text = typeof replyText === "string" ? replyText : "";
  const links = [];
  const push = (url, label, index) => {
    const clean = typeof url === "string" ? trimUrlTail(url) : "";
    if (!httpUrl(clean)) return;
    links.push({ url: clean, text: (label || "").trim(), index });
  };
  for (const m of text.matchAll(MD_LINK_RX)) push(m[2], m[1], m.index);
  for (const m of text.matchAll(ANCHOR_RX))
    push(m[1], m[2].replace(HTML_TAG_RX, ""), m.index);
  // nackte URLs, die nicht schon Teil eines Markdown-/HTML-Links sind
  const stripped = text
    .replace(MD_LINK_RX, blankOut)
    .replace(ANCHOR_RX, blankOut);
  for (const m of stripped.matchAll(BARE_URL_RX)) push(m[1], "", m.index);
  return links.sort((a, b) => a.index - b.index);
}

// Wörter der Antwort für den Titelvergleich: ohne URLs/Linkziele/HTML-Tags,
// normalisiert, je Wort mit Position im Originaltext und Rückfrage-Kennung
// (Satz endet mit "?"). Erwartet Text ohne <think>-Blöcke (HistoricalMessage
// übergibt responseContent).
function replyWords(replyText) {
  const masked = String(replyText || "")
    .replace(MD_LINK_RX, (m, label) => `[${label}]`.padEnd(m.length, " "))
    .replace(ANY_URL_RX, blankOut)
    .replace(HTML_TAG_RX, blankOut);
  const words = [];
  for (const sentence of masked.matchAll(SENTENCE_RX)) {
    const question = sentence[0].trimEnd().endsWith("?");
    for (const w of sentence[0].matchAll(WORD_RX)) {
      const index = sentence.index + w.index;
      for (const t of normalizeText(w[0]).split(" "))
        if (t) words.push({ t, index, question });
    }
  }
  return words;
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
export function formatCourse(entry) {
  const weekdays = formatWeekdays(entry.weekdays);
  const time = formatTime(entry.start_minutes);
  const start = formatDateDE(entry.start_date);
  const schedule = [weekdays, time ? `${time} Uhr` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    key: normalizeUrl(entry.url) || entry.title,
    url: httpUrl(entry.url)?.toString() || null,
    title: entry.title.trim(),
    schedule: schedule || null,
    weekdays,
    time,
    start: start ? `ab ${start}` : null,
    place: formatPlace(entry.format, entry.location),
    price: formatPrice(entry.price),
    status: formatStatus(entry.bookable),
    bookable: typeof entry.bookable === "boolean" ? entry.bookable : null,
  };
}

// Kurs-Pfadpräfix je Domain aus den Kurs-URLs: längster gemeinsamer
// Pfadanfang (Segmente, klein), z. B. ["kurssuche", "kurs"]. Bei nur einer
// URL ihr Elternverzeichnis (schwacher Beleg -> Wortliste bleibt Rückfall).
function coursePathPrefixes(sources) {
  const byDomain = new Map();
  for (const s of sources) {
    const u = httpUrl(s.entry.url);
    if (!u || !s.domain) continue;
    const segs = u.pathname.toLowerCase().split("/").filter(Boolean);
    if (!byDomain.has(s.domain)) byDomain.set(s.domain, []);
    byDomain.get(s.domain).push(segs);
  }
  const out = new Map();
  for (const [domain, paths] of byDomain) {
    let prefix;
    if (paths.length === 1) prefix = paths[0].slice(0, -1);
    else {
      prefix = paths[0];
      for (const segs of paths.slice(1)) {
        let i = 0;
        while (i < prefix.length && i < segs.length && prefix[i] === segs[i])
          i++;
        prefix = prefix.slice(0, i);
      }
    }
    if (prefix.length > 0)
      out.set(domain, { segs: prefix, strong: paths.length >= 2 });
  }
  return out;
}

// Kursseite? Unter dem Kurs-Pfadpräfix der Domain (nicht der Präfix selbst)
// immer; ohne belastbaren Präfix entscheidet die Wortliste.
function isCoursePage(u, prefixes) {
  const prefix = prefixes.get(siteDomain(u.hostname));
  if (prefix) {
    const segs = u.pathname.toLowerCase().split("/").filter(Boolean);
    if (
      segs.length > prefix.segs.length &&
      prefix.segs.every((seg, i) => segs[i] === seg)
    )
      return true;
    if (prefix.strong) return false;
  }
  return COURSE_PATH_RX.test(`${u.pathname}${u.search}`);
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
  const linkPos = new Map(); // normalisierte URL -> erste Position im Text
  for (const l of links) {
    const k = normalizeUrl(l.url);
    if (k && !linkPos.has(k)) linkPos.set(k, l.index);
  }

  const matched = [];
  const matchedKeys = new Set();
  // URL-Match hat Vorrang
  own.forEach((s, order) => {
    if (linkPos.has(s.key)) {
      matched.push({ ...s, order, pos: linkPos.get(s.key) });
      matchedKeys.add(s.key);
    }
  });

  // Titel-Fundstellen aller eigenen Kurse, längste Titel zuerst; jede
  // Fundstelle wird ausgeblendet, damit ein kürzerer Titel ("Hatha Yoga")
  // nicht innerhalb eines längeren genannten ("Hatha Yoga für Senioren")
  // trifft. Position = erste Fundstelle außerhalb einer Rückfrage.
  const words = replyWords(replyText);
  const tokens = words.map((w) => w.t);
  const titleQuestion = new Map(); // Titel endet selbst mit "?"
  for (const s of own) {
    const t = normalizeText(s.entry.title);
    if (s.entry.title.trim().endsWith("?")) titleQuestion.set(t, true);
  }
  const titlePos = new Map();
  const titles = [...new Set(own.map((s) => normalizeText(s.entry.title)))]
    .filter(titleMatchable)
    .sort((a, b) => b.length - a.length);
  for (const t of titles) {
    for (const span of findTitleSpans(t.split(" "), tokens)) {
      const first = words[span.start];
      if (!titlePos.has(t) && (!first.question || titleQuestion.get(t)))
        titlePos.set(t, first.index);
      for (let k = span.start; k < span.end; k++) tokens[k] = "";
    }
  }

  // Titel-Match nur für den Rest, nur eindeutig und nicht gleichnamig zu
  // einem schon verlinkten Kurs (sonst: "Englisch 1" verlinkt + zwei weitere
  // "Englisch 1"-Termine würden fälschlich mitkommen)
  const linkedTitles = matched.map((m) => normalizeText(m.entry.title));
  const titleCount = new Map();
  for (const s of own) {
    const t = normalizeText(s.entry.title);
    titleCount.set(t, (titleCount.get(t) || 0) + 1);
  }
  own.forEach((s, order) => {
    if (matchedKeys.has(s.key)) return;
    const t = normalizeText(s.entry.title);
    if (!titlePos.has(t)) return;
    if (titleCount.get(t) > 1) return; // mehrdeutig
    if (linkedTitles.some((lt) => similarity(lt, t) >= TITLE_MATCH_MIN)) return;
    matched.push({ ...s, order, pos: titlePos.get(t) });
  });
  if (matched.length === 0) return EMPTY;

  // 4) Sortierung nach Beginn (ohne Datum ans Ende); bei gleichem Beginn nach
  //    der ersten Fundstelle in der Antwort (Link-Position bzw. Titel-
  //    Fundstelle, jeweils Zeichenposition im Originaltext), dann Quellen-
  //    Reihenfolge.
  matched.sort((a, b) => {
    const da = a.entry.start_date || "9999-99-99";
    const db = b.entry.start_date || "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    if (a.pos !== b.pos) return a.pos - b.pos;
    return a.order - b.order;
  });

  // 5) Abschlusslink: Link der Antwort auf derselben Domain, keine Kursseite
  //    (Kurs-Pfadpräfix aus den courseSources), Kategorie-Pfad
  const courseKeys = new Set(sources.map((s) => s.key));
  const prefixes = coursePathPrefixes(sources);
  let categoryLink = null;
  for (const l of links) {
    const k = normalizeUrl(l.url);
    const u = httpUrl(l.url);
    if (!k || !u || courseKeys.has(k)) continue;
    if (!allowed.has(siteDomain(u.hostname))) continue;
    if (isCoursePage(u, prefixes) || !CATEGORY_PATH_RX.test(u.pathname))
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
