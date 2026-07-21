import { useEffect, useState } from "react";
import { embedderSettings } from "../main";
import { v4 } from "uuid";

export default function useSessionId() {
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    function getOrAssignSessionId() {
      if (!window || !embedderSettings?.settings?.embedId) return;

      const STORAGE_IDENTIFIER = `allm_${embedderSettings?.settings?.embedId}_session_id`;
      // Lesepfad ebenfalls kapseln: in vollstaendig blockiertem Storage
      // (Cookies/Storage deaktiviert) wirft bereits der localStorage-Zugriff bzw.
      // getItem, bevor irgendein setItem erreicht wird. Fallback currentId = null
      // -> es wird eine frische, nur-im-Speicher-ID vergeben, Session laeuft.
      let currentId = null;
      try {
        currentId = window.localStorage.getItem(STORAGE_IDENTIFIER);
      } catch (e) {
        console.warn(
          "[AnythingLLM Embed] sessionId konnte nicht aus localStorage gelesen werden:",
          e,
        );
      }
      if (!!currentId) {
        console.log(`Resuming session id`, currentId);
        setSessionId(currentId);
        return;
      }

      const newId = v4();
      console.log(`Registering new session id`, newId);
      try {
        window.localStorage.setItem(STORAGE_IDENTIFIER, newId);
      } catch (e) {
        // QuotaExceeded/SecurityError/Private-Mode duerfen das Widget nicht
        // crashen: State trotzdem setzen, Session laeuft (nur nicht persistent).
        console.warn(
          "[AnythingLLM Embed] sessionId konnte nicht in localStorage gespeichert werden:",
          e,
        );
      }
      setSessionId(newId);
    }
    getOrAssignSessionId();
  }, [window]);

  return sessionId;
}
