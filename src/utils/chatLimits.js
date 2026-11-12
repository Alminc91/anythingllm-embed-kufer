import { uiTexts } from "@/utils/layout";

// Grenzen des Widgets und Kontakt für Besucher (issues/widget-grenzen-
// kontakt.md, AK-7 bis AK-11, AK-16, NAK-3, NAK-4, §11 E5). Vertrag mit dem
// Fork (tests/fixtures/embedLimitContract.json, wortgleich im Fork; Fälle
// des Widgets in embedLimitWidgetCases.json): Erreicht eine Frage an
// POST /embed/:id/stream-chat eine Grenze, antwortet der Server mit HTTP 429
// und JSON {id, type "abort", textResponse null, sources [], close true,
// error, errorMsg (falls vorhanden)} plus errorCode:
// - "session_limit": Fragen je Besucher und Tag (max_chats_per_session)
// - "daily_limit": Fragen aller Besucher je Tag (max_chats_per_day)
// Jeder andere Fehler trägt keine dieser Kennungen und zeigt den technischen
// Text. Das Widget entscheidet nur nach errorCode (nie nach dem Text des
// Servers) und übernimmt ihn nur aus der 429-Antwort (errorResponse); Chunks
// im Stream verlieren ein errorCode (withoutErrorCode).
export const LIMIT_ERROR_CODES = ["session_limit", "daily_limit"];

// Kennung der Grenze, sonst null (nur die beiden Werte wörtlich)
export function limitErrorCode(value) {
  return typeof value === "string" && LIMIT_ERROR_CODES.includes(value)
    ? value
    : null;
}

// Art der Fehlerblase einer Nachricht: Kennung der Grenze oder "technical"
export function noticeKind(message) {
  return limitErrorCode(message?.errorCode) || "technical";
}

// Fehlerantwort des Servers (Status >= 400) als Nachricht für handleChat:
// errorCode nur bei 429 und nur mit einer der beiden Kennungen, sonst ohne
// das Feld. Ohne verwertbaren JSON-Körper (kein Objekt, kein Fehlertext) die
// technische Meldung wie bisher, damit immer eine Fehlerblase erscheint.
export function errorResponse(status, body, newId) {
  const fallback = `An error occurred while streaming response. Code ${status}`;
  const { errorCode, ...rest } =
    body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const code = status === 429 ? limitErrorCode(errorCode) : null;
  return {
    ...rest,
    id: rest.id ?? newId,
    type: "abort",
    textResponse: null,
    sources: Array.isArray(rest.sources) ? rest.sources : [],
    close: true,
    error: rest.error || fallback,
    ...(code ? { errorCode: code } : {}),
  };
}

// Chunk aus dem Stream ohne errorCode (Vertrag 5: Grenzen kommen nur als
// 429-Antwort, z. B. das Kontingent des Workspaces kommt als Chunk)
export function withoutErrorCode(chunk) {
  if (!chunk || typeof chunk !== "object" || !("errorCode" in chunk))
    return chunk;
  const { errorCode: _ignored, ...rest } = chunk;
  return rest;
}

// E-Mail für Besucher (Design Center, visual_config supportEmail): einfache
// Prüfung auf genau eine Adresse, getrimmt; sonst null (kein Link, kein
// Kontaktsatz). Verboten sind Leerzeichen, Steuerzeichen (\p{Cc}, auch C1
// wie U+0085) und unsichtbare Formatzeichen (\p{Cf}: weiches Trennzeichen
// U+00AD, Nullbreite U+200B und U+2060, Bidi-Steuerzeichen wie U+202E; eine
// so kopierte Adresse sieht richtig aus, die Mail kommt aber zurück),
// Trenner mehrerer Adressen (Komma, Semikolon), Zeichen, die einen
// mailto-Link um Betreff, Kopie oder Pfad erweitern (? # & % /),
// HTML-Zeichen (< > ") und Klammern sowie der Doppelpunkt (kein "mailto:"
// oder "javascript:"). Domain mit mindestens zwei Teilen, die Endung
// mindestens zwei Zeichen lang.
const EMAIL_CHARS = '[^\\s\\p{Cc}\\p{Cf}@<>()\\[\\]\\\\,;:"?#&%/]';
const EMAIL_LABEL = '[^\\s\\p{Cc}\\p{Cf}@<>()\\[\\]\\\\,;:"?#&%/.]';
const EMAIL_RX = new RegExp(
  `^${EMAIL_CHARS}+@(?:${EMAIL_LABEL}+\\.)+${EMAIL_LABEL}{2,}$`,
  "u",
);
export const SUPPORT_EMAIL_MAX_LEN = 254;
export function supportEmailValue(value) {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (!email || email.length > SUPPORT_EMAIL_MAX_LEN) return null;
  return EMAIL_RX.test(email) ? email : null;
}

// Inhalt der Fehlerblase (ErrorNotice) in der Sprache des Widgets
// (uiTexts: "en" englisch, sonst deutsch): erster Satz als Überschrift, die
// übrigen darunter, dann der Kontaktsatz nur mit gültiger Adresse (ohne
// Adresse entfällt er ganz, nie eine Ersatzadresse).
export function errorNotice(settings = {}, errorCode = null) {
  const t = uiTexts(settings || {});
  const kind = limitErrorCode(errorCode) || "technical";
  const sentences =
    kind === "session_limit"
      ? t.errorSessionLimit
      : kind === "daily_limit"
        ? t.errorDailyLimit
        : t.errorTechnical;
  const email = supportEmailValue(settings?.supportEmail);
  return {
    kind,
    title: sentences[0],
    details: sentences.slice(1),
    contact: email ? { lead: t.errorContact, email } : null,
  };
}
