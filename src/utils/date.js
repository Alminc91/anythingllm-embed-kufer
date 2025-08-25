import { embedderSettings } from "../main";

export function formatDate(sentAt, hour24 = null) {
  if (!sentAt) return "";

  try {
    const date = new Date(sentAt * 1000);
    
    // Check if we should use 24-hour format
    // Priority: explicit parameter > language setting > default
    const useHour24 = hour24 !== null 
      ? hour24 
      : embedderSettings?.settings?.language === "de";
    
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
