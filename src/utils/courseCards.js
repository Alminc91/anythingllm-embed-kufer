// Kufer: Kurskarten unter einer Antwort (opt-in, Setting courseCards "auto").
//
// Der Server (Fork, Image >= 7.9) liefert zu einer Antwort `courseSources`:
// nur Kurs-Metadaten (url, title, start_date, end_date, start_minutes,
// weekdays, price, bookable, format, location), nie Kontexttext; nur url und
// title sind Pflicht, alle anderen Felder optional. Welche davon
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
// dem Kurs-Pfadpräfix der courseSources (gemeinsamer Pfadanfang der Kurs-URLs
// ohne ihre letzten zwei Segmente, z. B. /kurssuche/kurs/) sind Kursseiten
// und nie Abschlusslink — auch ohne Metadaten.
// Schlanke Fallback-Karte: Kursseiten-Links der Antwort ohne courseSources-
// Eintrag (Server hat den Kurs nicht gefunden) ergeben eine Karte nur mit
// Titel (= Linktext ohne Markdown) und Link, ohne Zeit/Preis/Ort — erst, wenn
// die Antwort fertig ist (Option fallback), nur auf Kundendomains, nur mit
// sprechendem Linktext; Sortierung wie Karten ohne Datum.
// Linktexte (Karten, Kompaktliste, Abschlusslink) ohne Markdown-Zeichen.
// Fehlende Felder werden weggelassen, nie geschätzt oder aus anderen Quellen
// ergänzt. Der Antworttext selbst wird nicht verändert.
//
// Kurskarten v2, Position "above" (courseCardsPosition): Der Server (Fork
// >= 7.10) kündigt die empfohlenen Kurse vorab an (Chunk type
// "courseSources", Karten-Marker [[KARTEN: n]] im Prompt); die ersten
// `courseCardsAnnounced` Einträge erscheinen dann in Server-Reihenfolge über
// der Antwort, verlinkte weitere Kurse werden angehängt
// (selectAnnouncedCourseCards). Ohne Ankündigung gilt die Auswahl oben.
//
// Kurskarten v3 (Fork >= 7.13): courseSources tragen optional `sessions`
// (Kopfzeile "Dauer:", z. B. "16 Abende") und `venue` (Kopfzeile "Kursort:",
// Teil vor dem ersten ";", z. B. "Realschule") -> Kopfzeile "Mo · 18:00 Uhr ·
// 16 Abende", Metazeile "ab 14.09.2026 · Realschule · 60 €" (ein Ort ersetzt
// "vor Ort"; "online" bleibt). Dazu KI-Teaser je Karte (Chunk type
// "courseTeasers", { url: text }, nach den angekündigten Karten), als
// Untertext unter dem Titel (teaserMap). Teaserzeilen "[[TEASER n: …]]"
// direkt hinter einem Marker entfernt das Widget zusätzlich selbst
// (Übergangs-Abwehr für ältere Server, stripTeaserLines).

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
// Rückfall, wenn es für die Domain keine Kurs-URL in den courseSources gibt
// (siehe coursePathPrefixes)
const COURSE_PATH_RX =
  /\/(kurs|course|veranstaltung|event)\/[^/]+\/[^/]+|\/(kurs|course)\/[^/]*\d|[?&](kursnr|knr|kursid|courseid)=/i;

// Linktexte, die keinen Kurstitel tragen ("hier", "Zur Anmeldung") -> keine
// Fallback-Karte (verglichen nach normalizeText)
const GENERIC_LINK_TEXT_RX =
  /^(hier|link|mehr|details|kursdetails|infos?|informationen|weitere (infos?|informationen)|mehr (infos?|informationen|erfahren)|zum kurs|zur kursseite|kursseite|anmeldung|zur anmeldung|anmelden|jetzt anmelden|buchen|jetzt buchen|zur buchung)$/;

// Karten-Marker des Servers ("[[KARTEN: 0, 2]]" in der ersten Antwortzeile)
const CARDS_MARKER_TAG = "[[KARTEN:";
const CARDS_MARKER_BUFFER_MAX = 120;
// Kurskarten v3: Teaserzeilen "[[TEASER n: …]]" direkt nach dem Marker.
// Grenzen spiegeln embedCardsMarker.js im Fork: je Zeile höchstens 240
// Zeichen, Schluss = letztes "]]" vor dem Zeilenende, höchstens 12 Zeilen
// (COURSE_SOURCES_MAX, so viele Marker-Nummern gibt es höchstens).
const TEASER_TAG = "[[TEASER";
const TEASER_LINE_MAX = 240;
const TEASER_LINES_MAX = 12;
const TEASER_LINE_RX = /^\[\[TEASER[ \t]*\d{1,3}[ \t]*:[^\n]*\]\]$/i;
export const TEASER_MAX_LEN = 200;
// Einblenden nur, wenn der Teaser gerade eben (nach der Karte) angekommen ist
export const TEASER_FADE_WINDOW_MS = 1000;

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
export function courseCardsEnabled(settings = {}) {
  return settings?.courseCards === "auto";
}

// Karten über der Antwort? Nur mit Kurskarten "auto" und Position "above".
export function courseCardsAbove(settings = {}) {
  return (
    courseCardsEnabled(settings) && settings?.courseCardsPosition === "above"
  );
}

/**
 * Karten-Marker vom Antwortanfang entfernen (Abwehr in der Tiefe: der Server
 * ab Fork 7.10 entfernt ihn schon; ältere Server reichen ihn durch). Läuft
 * einmal bei der Aufnahme (appendReplyText, handleChat, Verlauf laden) — die
 * Anzeige bekommt nur noch sauberen Text.
 * Gültige oder kaputte Markerzeile -> entfernt (inkl. Leerraum dahinter).
 * partial (Antwort streamt noch): ein begonnener, noch offener Marker
 * (höchstens 120 Zeichen, wie der Server-Filter) ergibt "" statt Rohtext.
 * Teaserzeilen (Kurskarten v3) werden nur direkt hinter einem Marker
 * entfernt: hinter dem hier entfernten oder — afterMarker — hinter einem,
 * den der Server schon verarbeitet hat (Antwort mit angekündigten Karten).
 * Ohne Marker bleibt der Text unverändert, wie im Server.
 * @param {string} text
 * @param {{partial?: boolean, afterMarker?: boolean}} [options]
 * @returns {string}
 */
export function stripCardsMarker(
  text,
  { partial = false, afterMarker = false } = {},
) {
  const rest = stripMarkerLine(text, { partial });
  // rest !== text <=> Markerzeile entfernt bzw. noch offen (partial -> "")
  if (rest === text && !afterMarker) return text;
  if (typeof rest !== "string" || rest.length === 0) return rest;
  return stripTeaserLines(rest, { partial });
}

function stripMarkerLine(text, { partial = false } = {}) {
  if (typeof text !== "string" || text.length === 0) return text;
  const body = text.trimStart();
  const head = body.slice(0, CARDS_MARKER_TAG.length).toUpperCase();
  if (body.length === 0 || !CARDS_MARKER_TAG.startsWith(head)) return text;
  if (body.length < CARDS_MARKER_TAG.length) return partial ? "" : text;
  const close = body.indexOf("]]");
  const newline = body.indexOf("\n");
  if (close !== -1 && (newline === -1 || close < newline))
    return body.slice(close + 2).trimStart();
  if (newline !== -1) return body.slice(newline + 1).trimStart();
  return partial && body.length <= CARDS_MARKER_BUFFER_MAX ? "" : text;
}

// Länge der Teaserzeile am Anfang von body (bis einschließlich ihres letzten
// "]]" vor dem Zeilenende); null = keine bzw. kaputte Zeile (bleibt Text),
// undefined = noch offen (partial: erst Zeilenende, 240-Zeichen-Grenze oder
// Antwortende entscheiden — der Teaser darf selbst "]]" enthalten).
function teaserLineLength(body, partial) {
  const head = body.slice(0, TEASER_TAG.length).toUpperCase();
  if (!TEASER_TAG.startsWith(head)) return null;
  const win = body.slice(0, TEASER_LINE_MAX);
  const newline = win.indexOf("\n");
  if (partial && newline === -1 && body.length < TEASER_LINE_MAX)
    return undefined;
  const line = newline === -1 ? win : win.slice(0, newline);
  const close = line.lastIndexOf("]]");
  if (close === -1 || !TEASER_LINE_RX.test(line.slice(0, close + 2)))
    return null;
  return close + 2;
}

/**
 * Kurskarten v3: Teaserzeilen "[[TEASER n: …]]" am Anfang eines Texts
 * entfernen, der direkt hinter einem Karten-Marker steht (nur über
 * stripCardsMarker aufrufen bzw. wenn ein Marker verarbeitet wurde).
 * Übergangs-Abwehr: Server ≥ 7.13 entfernt die Zeilen selbst und schickt sie
 * als Chunk "courseTeasers"; ältere Server reichen sie durch. Regeln
 * spiegeln parseTeaserLines in embedCardsMarker.js (Fork): Leerraum davor
 * und dazwischen wird übersprungen, je Zeile höchstens 240 Zeichen bis zum
 * letzten "]]" vor dem Zeilenende, höchstens 12 Zeilen; kaputte Zeilen und
 * alles danach bleiben Text.
 * partial (Antwort streamt noch): eine begonnene, noch offene Zeile bzw. nur
 * Leerraum hinter entfernten Zeilen ergibt "" (weiter puffern).
 * @param {string} text
 * @param {{partial?: boolean}} [options]
 * @returns {string}
 */
export function stripTeaserLines(text, { partial = false } = {}) {
  if (typeof text !== "string" || text.length === 0) return text;
  let rest = text;
  let count = 0;
  let open = false;
  while (count < TEASER_LINES_MAX) {
    const body = rest.trimStart();
    const len = teaserLineLength(body, partial);
    open = len === undefined;
    if (!len) break;
    rest = body.slice(len);
    count++;
  }
  return open ? "" : count > 0 ? rest.trimStart() : text;
}

/**
 * Text-Chunk an eine streamende Antwort anhängen, Karten-Marker am
 * Antwortanfang dabei entfernen. Solange noch nichts Sichtbares da ist und nur
 * ein (offener oder gerade geschlossener) Marker angekommen ist, bleibt der
 * Rohtext im Puffer (markerBuffer, Antwort gilt als wartend); sobald Text
 * folgt, die Grenze überschritten ist oder der Stream endet, wird er Inhalt.
 * Hat der Server den Marker schon verarbeitet (Karten angekündigt,
 * courseCardsAnnounced), gelten folgende Teaserzeilen als "hinter dem
 * Marker" (afterMarker).
 * @param {{content?: string, markerBuffer?: string, courseCardsAnnounced?: number}|null} prev - bisheriger Eintrag
 * @param {string} chunk - neuer Text
 * @param {boolean} done - Stream beendet (close)
 * @returns {{content: string, markerBuffer?: string}}
 */
export function appendReplyText(prev, chunk, done = false) {
  const add = chunk ?? "";
  const visible = prev?.content || "";
  if (visible.trim()) return { content: visible + add };
  const raw = (prev?.markerBuffer ?? visible) + add;
  const content = stripCardsMarker(raw, {
    partial: !done,
    afterMarker: cardsAnnounced(prev),
  });
  return !done && raw && !content
    ? { content, markerBuffer: raw }
    : { content };
}

// Hat der Server zu dieser Antwort Karten vorab angekündigt (Marker
// verarbeitet)?
export function cardsAnnounced(entry) {
  const n = entry?.courseCardsAnnounced;
  return Number.isInteger(n) && n > 0;
}

/**
 * Markdown-Zeichen aus einem Linktext entfernen ("**Umwelt und Gesundheit**"
 * -> "Umwelt und Gesundheit"): Backticks, ** und __, sowie * und _ am
 * Wortrand. Unterstriche/Sternchen mitten im Wort bleiben.
 * @param {string} value
 * @returns {string}
 */
export function stripMarkdown(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/`+/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/(^|[\s([{"'„])[*_]+(?=\S)/g, "$1")
    .replace(/(\S)[*_]+(?=$|[\s)\]}.,;:!?"'“])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
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

// Kurs = http(s)-url + Titel. Die Einstufung als Kurs trifft der Server
// (Kurs-URL aus der Kopfzeile "Kurs-Link:", Info-Seiten kommen gar nicht erst
// als courseSources an); Datum/Wochentage sind nur Anreicherung.
function isCourseSource(entry) {
  return (
    !!entry &&
    typeof entry === "object" &&
    typeof entry.title === "string" &&
    entry.title.trim().length > 0 &&
    !!httpUrl(entry.url)
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

// Kürzen an der Wortgrenze wie truncateAtWord im Server: höchstens max
// Zeichen inkl. "…", geschnitten am letzten Leerraum vor der Grenze, wenn
// dabei mindestens 60 % der Länge bleiben, sonst hart.
export function truncateAtWord(value, max) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.search(/\s\S*$/);
  const head = space >= Math.floor(max * 0.6) ? cut.slice(0, space) : cut;
  return `${head.trimEnd()}…`;
}

// Kurzer Klartext (Dauer, Ort, Teaser): Tags raus, Leerraum zusammengezogen,
// höchstens max Zeichen (Wortgrenze); leer -> null
function shortText(value, max) {
  if (typeof value !== "string") return null;
  const v = value
    .replace(HTML_TAG_RX, " ")
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:!?])/g, "$1")
    .trim();
  return v ? truncateAtWord(v, max) : null;
}

// Ort einer Karte: Kursort (venue, Kurskarten v3) hat Vorrang vor dem
// KIE-480-Ortsfeld (location) und ersetzt "vor Ort" — nur bei Präsenz bzw.
// hybrid. Online-Kurse (format "online" oder location "online" ohne
// Präsenz-/Hybrid-Format) bleiben "online", auch mit venue (z. B. "Zoom").
export function formatPlace(format, location, venue = null) {
  const fmt = typeof format === "string" ? format.trim().toLowerCase() : null;
  const loc =
    typeof location === "string" && location.trim().length > 0
      ? location.trim()
      : null;
  const locOnline = !!loc && loc.toLowerCase() === "online";
  const present = fmt === "onsite" || fmt === "hybrid";
  if (fmt === "online" || (locOnline && !present)) return "online";
  const locLabel =
    shortText(venue, 60) || (loc && !locOnline ? capitalizeWords(loc) : null);
  if (fmt === "hybrid")
    return locLabel ? `${locLabel} · auch online` : "online und vor Ort";
  if (fmt === "onsite") return locLabel || "vor Ort";
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
  // Kurskarten v3: Anzahl Termine ("16 Abende") ans Ende der Kopfzeile
  const sessions = shortText(entry.sessions, 30);
  const schedule = [weekdays, time ? `${time} Uhr` : null, sessions]
    .filter(Boolean)
    .join(" · ");
  return {
    key: normalizeUrl(entry.url) || entry.title,
    url: httpUrl(entry.url)?.toString() || null,
    title: stripMarkdown(entry.title) || entry.title.trim(),
    schedule: schedule || null,
    weekdays,
    time,
    start: start ? `ab ${start}` : null,
    place: formatPlace(entry.format, entry.location, entry.venue),
    price: formatPrice(entry.price),
    status: formatStatus(entry.bookable),
    bookable: typeof entry.bookable === "boolean" ? entry.bookable : null,
  };
}

/**
 * Kurskarten v3: KI-Teaser je Karte (courseTeasers vom Server, URL -> Text)
 * als Map normalisierte URL -> Text (Vergleich wie card.key). Text ohne
 * HTML/Markdown-Zeichen, höchstens TEASER_MAX_LEN Zeichen; Ungültiges
 * entfällt.
 * @param {any} courseTeasers
 * @returns {Map<string, string>}
 */
export function teaserMap(courseTeasers) {
  const out = new Map();
  if (
    !courseTeasers ||
    typeof courseTeasers !== "object" ||
    Array.isArray(courseTeasers)
  )
    return out;
  for (const [url, value] of Object.entries(courseTeasers)) {
    const key = normalizeUrl(url);
    if (!key || out.has(key) || typeof value !== "string") continue;
    const text = shortText(stripMarkdown(value), TEASER_MAX_LEN);
    if (text) out.set(key, text);
  }
  return out;
}

/**
 * Kurskarten v3: Teaser einblenden? Nur, wenn er im Stream nach der schon
 * sichtbaren Karte ankam (teaserArrivedAt, gesetzt vom Chunk
 * "courseTeasers") und das gerade eben war — nicht beim Verlauf-Laden und
 * nicht beim erneuten Aufbau der Karten (Fenster wieder geöffnet).
 * @param {any} arrivedAt - Zeitstempel (ms) am Antwort-Eintrag
 * @param {number} [now]
 * @returns {boolean}
 */
export function teaserFadeIn(arrivedAt, now = Date.now()) {
  return (
    typeof arrivedAt === "number" &&
    Number.isFinite(arrivedAt) &&
    now - arrivedAt >= 0 &&
    now - arrivedAt < TEASER_FADE_WINDOW_MS
  );
}

// Kurs-Pfadpräfix je Domain: gemeinsamer Pfadanfang der Kurs-URLs ohne ihre
// letzten zwei Segmente (Slug + Kursnummer), mindestens das erste Segment
// nach der Domain — z. B. /kurssuche/kurs/<slug>/<nr> -> ["kurssuche",
// "kurs"]; schon eine Kurs-URL genügt (zwei Kurse mit gleichem Slug ergeben
// so nicht mehr ".../<slug>/" als Präfix).
function coursePathPrefixes(sources) {
  const byDomain = new Map();
  for (const s of sources) {
    const u = httpUrl(s.entry.url);
    if (!u || !s.domain) continue;
    const segs = u.pathname.toLowerCase().split("/").filter(Boolean);
    const base = segs.slice(0, Math.max(1, segs.length - 2));
    if (base.length === 0) continue;
    if (!byDomain.has(s.domain)) byDomain.set(s.domain, []);
    byDomain.get(s.domain).push(base);
  }
  const out = new Map();
  for (const [domain, paths] of byDomain) {
    let prefix = paths[0];
    for (const segs of paths.slice(1)) {
      let i = 0;
      while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++;
      prefix = prefix.slice(0, i);
    }
    if (prefix.length > 0) out.set(domain, prefix);
  }
  return out;
}

// Kursseite? Unter dem Kurs-Pfadpräfix der Domain (nicht der Präfix selbst);
// die Wortliste gilt nur, wenn es für die Domain keine Kurs-URL gibt.
function isCoursePage(u, prefixes) {
  const prefix = prefixes.get(siteDomain(u.hostname));
  if (prefix) {
    const segs = u.pathname.toLowerCase().split("/").filter(Boolean);
    return (
      segs.length > prefix.length && prefix.every((seg, i) => segs[i] === seg)
    );
  }
  return COURSE_PATH_RX.test(`${u.pathname}${u.search}`);
}

// Gültige Kursquellen (Dedupe über die URL, erster gewinnt; index = Position
// in courseSources) und die Kundendomain(s): Domain der Webseite + häufigste
// Domain der Kursquellen. Quellen anderer Domains werden weggelassen.
// Ohne gültige Quelle: own leer, Kundendomain = Domain der Webseite (für
// Fallback-Karten).
function ownCourseSources(courseSources, pageHostOption) {
  const sources = [];
  const seen = new Set();
  (Array.isArray(courseSources) ? courseSources : []).forEach(
    (entry, index) => {
      if (!isCourseSource(entry)) return;
      const key = normalizeUrl(entry.url);
      if (!key || seen.has(key)) return;
      seen.add(key);
      sources.push({ entry, key, index, domain: domainOfUrl(entry.url) });
    },
  );

  const pageHost =
    pageHostOption ??
    (typeof window !== "undefined" ? window.location?.hostname : null);
  const counts = new Map();
  for (const s of sources)
    if (s.domain) counts.set(s.domain, (counts.get(s.domain) || 0) + 1);
  let majority = null;
  for (const [domain, count] of counts)
    if (!majority || count > counts.get(majority)) majority = domain;
  const allowed = new Set([siteDomain(pageHost), majority].filter(Boolean));
  const own = sources.filter((s) => allowed.has(s.domain));
  return { sources, own, allowed };
}

// Abschlusslink: erster Link der Antwort auf einer Kundendomain, der keine
// Kursseite ist und nach Programm-/Kategorieseite aussieht. Linktext ohne
// Markdown; leer oder selbst eine URL -> Standardtext.
function findCategoryLink(links, { sources, allowed }) {
  const courseKeys = new Set(sources.map((s) => s.key));
  const prefixes = coursePathPrefixes(sources);
  for (const l of links) {
    const k = normalizeUrl(l.url);
    const u = httpUrl(l.url);
    if (!k || !u || courseKeys.has(k)) continue;
    if (!allowed.has(siteDomain(u.hostname))) continue;
    if (isCoursePage(u, prefixes) || !CATEGORY_PATH_RX.test(u.pathname))
      continue;
    const text = stripMarkdown(l.text);
    const label = text && !httpUrl(text) ? text : CATEGORY_FALLBACK_TEXT;
    return { url: u.toString(), text: label };
  }
  return null;
}

// Fallback-Karten: Links der Antwort (Reihenfolge des Vorkommens) auf eine
// Kursseite einer Kundendomain ohne courseSources-Eintrag. Dedupe per URL;
// ohne sprechenden Linktext (leer, selbst eine URL, "hier" …) keine Karte;
// entspricht der Linktext einer schon gewählten Karte (gleicher Kurs, andere
// URL), auch nicht.
function fallbackCourseLinks(links, { sources, allowed }, chosen) {
  const known = new Set(sources.map((s) => s.key));
  const prefixes = coursePathPrefixes(sources);
  const chosenTitles = chosen.map((m) => normalizeText(m.entry.title));
  const out = [];
  for (const l of links) {
    const key = normalizeUrl(l.url);
    const u = httpUrl(l.url);
    if (!key || !u || known.has(key)) continue;
    if (!allowed.has(siteDomain(u.hostname)) || !isCoursePage(u, prefixes))
      continue;
    const title = stripMarkdown(l.text);
    const norm = normalizeText(title);
    if (!norm || httpUrl(title) || GENERIC_LINK_TEXT_RX.test(norm)) continue;
    if (chosenTitles.some((t) => similarity(t, norm) >= TITLE_MATCH_MIN))
      continue;
    known.add(key);
    out.push({
      entry: { url: u.toString(), title },
      key,
      pos: l.index,
      fallback: true,
    });
  }
  return out;
}

// Karte aus einem Auswahl-Eintrag (Fallback-Karten markiert)
function cardOf(m) {
  const card = formatCourse(m.entry);
  return m.fallback ? { ...card, fallback: true } : card;
}

// normalisierte URL -> erste Position im Text
function linkPositions(links) {
  const pos = new Map();
  for (const l of links) {
    const k = normalizeUrl(l.url);
    if (k && !pos.has(k)) pos.set(k, l.index);
  }
  return pos;
}

// Karten bzw. Kompaktliste aus der fertigen Reihenfolge (noCompact: immer
// Karten, höchstens 5, Rest = "weitere Kurse" — Darstellung schaltet nie um)
function layoutCards(matched, links, ctx, noCompact = false) {
  if (matched.length === 0) return EMPTY;
  const compact = !noCompact && matched.length > COURSE_CARDS_MAX;
  const limit = compact ? COURSE_COMPACT_MAX : COURSE_CARDS_MAX;
  const shown = matched.slice(0, limit).map(cardOf);
  const more = Math.max(0, matched.length - limit);
  return {
    cards: shown,
    compact,
    categoryLink: findCategoryLink(links, ctx),
    more,
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
 * @param {{pageHost?: string, fallback?: boolean}} [options] - Host der
 *   Webseite (Standard: window.location); fallback: Antwort ist fertig ->
 *   Kursseiten-Links ohne courseSources-Eintrag als schlanke Karte
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

  // 1) + 2) gültige Kursquellen der Kundendomain
  const ctx = ownCourseSources(courseSources, options.pageHost);
  const { own } = ctx;
  if (own.length === 0 && !options.fallback) return EMPTY;

  // 3) Zuordnung zur Antwort
  const links = extractLinks(replyText);
  const linkPos = linkPositions(links);

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
  // Fallback-Karten (ohne Datum -> hinter die datierten, nach Link-Position)
  if (options.fallback)
    fallbackCourseLinks(links, ctx, matched).forEach((f, i) =>
      matched.push({ ...f, order: own.length + i }),
    );
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

  // 5) Abschlusslink (keine Kursseite, Kategorie-Pfad) + Karten/Kompaktliste
  return layoutCards(matched, links, ctx);
}

/**
 * Karten über der Antwort (courseCardsPosition "above"): Hat der Server Kurse
 * vorab angekündigt (`announced` = Anzahl am Listenanfang), erscheinen genau
 * diese in Server-Reihenfolge — schon bevor Text da ist —, danach weitere
 * Kurse, die die Antwort verlinkt (in Link-Reihenfolge, angehängt). Keine
 * Titelsuche, keine Umsortierung, keine Kompaktliste (höchstens 5 Karten,
 * Rest = "weitere Kurse"): Karten springen nicht, wenn Text oder die
 * Ergänzung am Stream-Ende ankommen. Ohne Ankündigung: selectCourseCards.
 * Fallback-Karten (options.fallback, Antwort fertig) stehen bei Ankündigung
 * nicht oben, sondern unter der Antwort (footerCards, Link-Reihenfolge;
 * zusammen mit den Karten oben höchstens 5, Rest footerMore) — so springt
 * die Antwort am Ende nicht nach unten.
 * @param {string} replyText - bisheriger Antworttext (darf leer sein)
 * @param {object[]} courseSources
 * @param {object} settings
 * @param {{announced?: number, pageHost?: string, fallback?: boolean}} [options]
 */
export function selectAnnouncedCourseCards(
  replyText,
  courseSources,
  settings = {},
  options = {},
) {
  const announced = Number.isInteger(options.announced) ? options.announced : 0;
  if (announced <= 0)
    return selectCourseCards(replyText, courseSources, settings, options);
  if (!courseCardsEnabled(settings)) return EMPTY;
  const ctx = ownCourseSources(courseSources, options.pageHost);
  if (ctx.own.length === 0 && !options.fallback) return EMPTY;

  const links = extractLinks(replyText);
  const linkPos = linkPositions(links);
  const head = ctx.own.filter((s) => s.index < announced);
  const rest = ctx.own
    .filter((s) => s.index >= announced && linkPos.has(s.key))
    .sort((a, b) => linkPos.get(a.key) - linkPos.get(b.key));
  const chosen = [...head, ...rest];
  const layout = layoutCards(chosen, links, ctx, true);
  if (!options.fallback) return layout;

  const extra = fallbackCourseLinks(links, ctx, chosen);
  if (extra.length === 0) return layout;
  const slots = Math.max(0, COURSE_CARDS_MAX - layout.cards.length);
  return {
    ...layout,
    categoryLink: layout.categoryLink || findCategoryLink(links, ctx),
    footerCards: extra.slice(0, slots).map(cardOf),
    footerMore: extra.length - Math.min(slots, extra.length),
  };
}
