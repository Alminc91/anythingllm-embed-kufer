// Kufer: einmaliger Datenschutz-Hinweis im Panel (privacyNotice "modal").
//
// Bestätigung je Embed in localStorage unter allm-privacy-ack-<embedId>
// (Wert = Zeitstempel ISO). Ist localStorage gesperrt (privates Fenster,
// Cookies blockiert: Zugriff wirft), gilt die Bestätigung bis zum Neuladen
// der Seite im Speicher -> der Hinweis erscheint dann einmal pro Sitzung.

export const PRIVACY_ACK_PREFIX = "allm-privacy-ack-";
const memoryAcks = new Set();

export function privacyAckKey(embedId) {
  return `${PRIVACY_ACK_PREFIX}${embedId || "default"}`;
}

export function isPrivacyAcknowledged(embedId) {
  const key = privacyAckKey(embedId);
  if (memoryAcks.has(key)) return true;
  try {
    return !!window.localStorage.getItem(key);
  } catch (e) {
    return false;
  }
}

export function acknowledgePrivacy(embedId, now = new Date()) {
  const key = privacyAckKey(embedId);
  memoryAcks.add(key);
  try {
    window.localStorage.setItem(key, now.toISOString());
    return true;
  } catch (e) {
    return false; // nur im Speicher
  }
}

// Muss der Hinweis (noch) gezeigt werden?
export function privacyNoticePending(settings = {}) {
  return (
    settings.privacyNotice === "modal" &&
    !isPrivacyAcknowledged(settings.embedId)
  );
}

// nur für Tests
export function _resetPrivacyMemory() {
  memoryAcks.clear();
}
