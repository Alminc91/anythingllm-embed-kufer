import { useState, useEffect } from "react";

const STORAGE_KEY = "anythingllm-embed-bubbles-dismissed";

export default function useBubbleDismissal(settings = {}) {
  const [bubblesVisible, setBubblesVisible] = useState(true);

  const getStorageType = () => {
    if (
      settings.bubblePersistence === "localStorage" &&
      typeof localStorage !== "undefined"
    ) {
      return localStorage;
    }
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage;
    }
    return null;
  };

  const createStorageKey = () => {
    const baseUrl = window.location.origin;
    const embedId = settings.embedId || "default";
    return `${STORAGE_KEY}-${baseUrl}-${embedId}`;
  };

  useEffect(() => {
    const storage = getStorageType();
    if (!storage) return;

    try {
      const storageKey = createStorageKey();
      const isDismissed = storage.getItem(storageKey) === "true";
      setBubblesVisible(!isDismissed);
    } catch (error) {
      console.warn(
        "AnythingLLM Embed: Unable to access storage for bubble dismissal state",
      );
    }
  }, [settings.bubblePersistence, settings.embedId]);

  const dismissBubbles = () => {
    setBubblesVisible(false);

    const storage = getStorageType();
    if (storage) {
      try {
        const storageKey = createStorageKey();
        storage.setItem(storageKey, "true");
      } catch (error) {
        console.warn(
          "AnythingLLM Embed: Unable to save bubble dismissal state to storage",
        );
      }
    }
  };

  return {
    bubblesVisible,
    dismissBubbles,
  };
}
