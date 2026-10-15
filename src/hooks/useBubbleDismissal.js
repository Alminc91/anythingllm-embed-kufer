import { useState, useEffect } from "react";

const STORAGE_KEY = "anythingllm-embed-bubbles-dismissed";

// Willkommensblasen neben dem geschlossenen Chat-Button. mode (KIE-568,
// utils/layout.js welcomeBubblesMode, je Gerät beim Laden bestimmt):
// - "first" (Standard, bisheriges Verhalten): localStorage; nach Schließen
//   der Blasen oder Öffnen des Chats nicht mehr, bis der Nutzer die
//   Browserdaten löscht. Ein altes data-bubble-persistence="sessionStorage"
//   wirkt hier nur ohne Server-Wert (applyFixedStandards entfernt es sonst).
// - "every": einmal je Browser-Tab (sessionStorage). Sobald die Blasen
//   einmal zu sehen waren, erscheinen sie auf Unterseiten im selben Tab nicht
//   erneut (shown); ein neuer Tab bzw. ein späterer Besuch zeigt sie wieder.
// - "off": keine Blasen, nur der Chat-Button.
// Auf dieser Seite schon als gezeigt gemerkt (je Widget): dann blendet
// "shown" sie hier nicht wieder aus (erst auf der nächsten Seite im selben
// Tab). Auf Modulebene, weil OpenButton beim Öffnen und Schließen des Chats
// neu eingehängt wird (Fixliste 7.22-rc7 Nr. 19).
const shownOnThisPage = new Set();
export function resetShownOnThisPage() {
  shownOnThisPage.clear();
}

export default function useBubbleDismissal(settings = {}, mode = "first") {
  const pageKey = settings.embedId || "default";

  const getStorageType = () => {
    try {
      if (mode === "every") {
        return typeof sessionStorage !== "undefined" ? sessionStorage : null;
      }
      // "first": localStorage (Blasen nur einmal pro Browser, wie Chatbase);
      // sessionStorage nur, wenn per Altattribut explizit gewünscht
      if (
        settings.bubblePersistence === "sessionStorage" &&
        typeof sessionStorage !== "undefined"
      ) {
        return sessionStorage;
      }
      if (typeof localStorage !== "undefined") {
        return localStorage;
      }
    } catch {
      // Zugriff auf den Speicher gesperrt (z. B. Cookies blockiert)
    }
    return null;
  };

  const createStorageKey = () => {
    const baseUrl = window.location.origin;
    const embedId = settings.embedId || "default";
    return `${STORAGE_KEY}-${baseUrl}-${embedId}`;
  };

  const EMPTY = { manuallyDismissed: false, chatOpened: false, shown: false };

  const getDismissalState = () => {
    const storage = getStorageType();
    if (!storage) return { ...EMPTY };

    try {
      const storageKey = createStorageKey();
      const storedData = storage.getItem(storageKey);

      if (!storedData) {
        return { ...EMPTY };
      }

      // Handle legacy boolean storage format
      if (storedData === "true") {
        return { ...EMPTY, manuallyDismissed: true };
      }

      // Parse new JSON format
      const parsed = JSON.parse(storedData);
      return {
        manuallyDismissed: parsed?.manuallyDismissed || false,
        chatOpened: parsed?.chatOpened || false,
        shown: parsed?.shown || false,
      };
    } catch (error) {
      console.warn(
        "AnythingLLM Embed: Unable to access storage for bubble dismissal state",
      );
      return { ...EMPTY };
    }
  };

  const saveDismissalState = (state) => {
    const storage = getStorageType();
    if (!storage) return;

    try {
      const storageKey = createStorageKey();
      // "shown" nur im Modus "every" speichern (bisheriges Format sonst)
      const { shown, ...rest } = state;
      storage.setItem(
        storageKey,
        JSON.stringify(mode === "every" && shown ? { ...rest, shown } : rest),
      );
    } catch (error) {
      console.warn(
        "AnythingLLM Embed: Unable to save bubble dismissal state to storage",
      );
    }
  };

  const computeVisible = () => {
    if (mode === "off") return false;
    const state = getDismissalState();
    if (state.manuallyDismissed || state.chatOpened) return false;
    if (mode === "every" && state.shown && !shownOnThisPage.has(pageKey))
      return false;
    return true;
  };

  // Synchron beim ersten Render (kein Aufblitzen bei "off" bzw. schon
  // gezeigten Blasen)
  const [bubblesVisible, setBubblesVisible] = useState(computeVisible);

  useEffect(() => {
    setBubblesVisible(computeVisible());
  }, [settings.bubblePersistence, settings.embedId, mode]);

  const dismissBubbles = () => {
    setBubblesVisible(false);
    if (mode === "off") return;
    const currentState = getDismissalState();
    saveDismissalState({
      ...currentState,
      manuallyDismissed: true,
    });
  };

  const dismissBubblesOnChatOpen = () => {
    setBubblesVisible(false);
    if (mode === "off") return;
    const currentState = getDismissalState();
    saveDismissalState({
      ...currentState,
      chatOpened: true,
    });
  };

  // Blasen sind jetzt zu sehen (OpenButton): im Modus "every" für diesen Tab
  // merken, damit Unterseiten sie nicht erneut zeigen.
  const markBubblesShown = () => {
    if (mode !== "every" || shownOnThisPage.has(pageKey)) return;
    shownOnThisPage.add(pageKey);
    const currentState = getDismissalState();
    if (currentState.shown) return;
    saveDismissalState({ ...currentState, shown: true });
  };

  return {
    bubblesVisible,
    dismissBubbles,
    dismissBubblesOnChatOpen,
    markBubblesShown,
  };
}
