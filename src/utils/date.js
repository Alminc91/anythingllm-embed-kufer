import { embedderSettings } from "../main";

// sentAt in Sekunden. Option { withDate: true } (statt oder nach hour24):
// Datum + Uhrzeit mit Sekunden, deutsch "DD.MM.YYYY, HH:MM:SS Uhr", sonst im
// Format des Browsers (z. B. Tooltip des Hinweises „Unterhaltung fortsetzen“).
export function formatDate(sentAt, hour24 = null, options = {}) {
  if (!sentAt) return "";
  if (hour24 !== null && typeof hour24 === "object") {
    options = hour24;
    hour24 = null;
  }

  try {
    const date = new Date(sentAt * 1000);
    const isGerman = embedderSettings?.settings?.language === "de";

    // Check if we should use 24-hour format
    // Priority: explicit parameter > language setting > default
    const useHour24 = hour24 !== null ? hour24 : isGerman;

    if (options?.withDate) {
      if (Number.isNaN(date.getTime())) return "";
      const locale = isGerman ? "de-DE" : [];
      const day = date.toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const time = date.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: !useHour24,
      });
      return isGerman ? `${day}, ${time} Uhr` : `${day}, ${time}`;
    }

    if (useHour24) {
      // 24-hour format
      const timeString = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      // Add "Uhr" for German
      if (isGerman) {
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
