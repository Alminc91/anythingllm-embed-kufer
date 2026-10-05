import { embedderSettings } from "../main";

export function formatDate(sentAt, hour24 = null) {
  if (!sentAt) return "";

  try {
    const date = new Date(sentAt * 1000);

    // Check if we should use 24-hour format
    // Priority: explicit parameter > language setting > default
    const useHour24 =
      hour24 !== null ? hour24 : embedderSettings?.settings?.language === "de";

    if (useHour24) {
      // 24-hour format
      const timeString = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      // Add "Uhr" for German
      if (embedderSettings?.settings?.language === "de") {
        return `${timeString} Uhr`;
      }
      return timeString;
    }

    // Default 12-hour format with AM/PM
    const timeString = date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return timeString;
  } catch (e) {
    return "";
  }
}

// Datum + Uhrzeit im deutschen Format "DD.MM.YYYY, HH:MM:SS Uhr" (sentAt in
// Sekunden), z. B. für den Hinweis „Unterhaltung fortsetzen“ der Inline-Leiste.
export function formatDateTime(sentAt) {
  if (!sentAt) return "";
  try {
    const d = new Date(sentAt * 1000);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} Uhr`;
  } catch (e) {
    return "";
  }
}
