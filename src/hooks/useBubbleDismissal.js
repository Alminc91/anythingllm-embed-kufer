import { useState, useEffect } from "react";

const STORAGE_KEY = "anythingllm-embed-bubbles-dismissed";

export default function useBubbleDismissal(settings = {}) {
  const [bubblesVisible, setBubblesVisible] = useState(true);

  const getStorageType = () => {
    // Default: localStorage (bubbles nur einmal pro Browser, wie Chatbase)
    // Option: sessionStorage wenn explizit gewünscht
    if (
      settings.bubblePersistence === "sessionStorage" &&
      typeof sessionStorage !== "undefined"
    ) {
      return sessionStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
    return null;
  };

  const createStorageKey = () => {
    const baseUrl = window.location.origin;
    const embedId = settings.embedId || "default";
    return `${STORAGE_KEY}-${baseUrl}-${embedId}`;
  };

  const getDismissalState = () => {
    const storage = getStorageType();
    if (!storage) return { manuallyDismissed: false, chatOpened: false };

    try {
      const storageKey = createStorageKey();
      const storedData = storage.getItem(storageKey);
      
      if (!storedData) {
        return { manuallyDismissed: false, chatOpened: false };
      }

      // Handle legacy boolean storage format
      if (storedData === "true") {
        return { manuallyDismissed: true, chatOpened: false };
      }

      // Parse new JSON format
      const parsed = JSON.parse(storedData);
      return {
        manuallyDismissed: parsed.manuallyDismissed || false,
        chatOpened: parsed.chatOpened || false,
      };
    } catch (error) {
      console.warn(
        "AnythingLLM Embed: Unable to access storage for bubble dismissal state",
      );
      return { manuallyDismissed: false, chatOpened: false };
    }
  };

  const saveDismissalState = (state) => {
    const storage = getStorageType();
    if (!storage) return;

    try {
      const storageKey = createStorageKey();
      storage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn(
        "AnythingLLM Embed: Unable to save bubble dismissal state to storage",
      );
    }
  };

  useEffect(() => {
    const dismissalState = getDismissalState();
    const shouldHideBubbles = dismissalState.manuallyDismissed || dismissalState.chatOpened;
    setBubblesVisible(!shouldHideBubbles);
  }, [settings.bubblePersistence, settings.embedId]);

  const dismissBubbles = () => {
    setBubblesVisible(false);
    const currentState = getDismissalState();
    saveDismissalState({
      ...currentState,
      manuallyDismissed: true,
    });
  };

  const dismissBubblesOnChatOpen = () => {
    setBubblesVisible(false);
    const currentState = getDismissalState();
    saveDismissalState({
      ...currentState,
      chatOpened: true,
    });
  };

  return {
    bubblesVisible,
    dismissBubbles,
    dismissBubblesOnChatOpen,
  };
}
