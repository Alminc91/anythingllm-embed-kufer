import { useEffect, useRef, useState } from "react";
import { embedderSettings } from "../main";
import { v4 } from "uuid";

// conversationId = ein einzelner Chat-Verlauf. Getrennt von der dauerhaften
// sessionId (Besucher-/Browser-Identifier). "Chat zuruecksetzen" erzeugt via
// newConversation() eine neue conversationId; der Server laedt den LLM-Kontext
// nach conversation_id, wodurch der neue Chat automatisch frisch ist und die
// alte Konversation als eigene, auffindbare Einheit erhalten bleibt.
export default function useConversationId(sessionId = null) {
  const [conversationId, setConversationId] = useState("");

  // true = aktuelle conversationId wurde soeben per newConversation() frisch
  // erzeugt (hat serverseitig garantiert keine History); false = aus
  // localStorage restauriert bzw. initial aus der sessionId migriert (kann
  // bestehende Nachrichten haben). useChatHistory fetcht NUR bei false. Ref
  // statt State: kein Render-Flackern und im useChatHistory-Effect synchron
  // aktuell, weil newConversation den Wert vor setConversationId setzt.
  const justCreatedRef = useRef(false);

  // localStorage-Key einmal ableiten (embedId liegt ab Boot in
  // embedderSettings.settings, siehe main.jsx) statt an mehreren Stellen bauen.
  const embedId = embedderSettings?.settings?.embedId;
  const storageKey = embedId ? `allm_${embedId}_conversation_id` : null;

  useEffect(() => {
    if (!window || !storageKey) return;
    // Lesepfad ebenfalls kapseln: in vollstaendig blockiertem Storage
    // (Cookies/Storage deaktiviert) wirft bereits der localStorage-Zugriff bzw.
    // getItem, bevor irgendein setItem erreicht wird. Fallback currentId = null
    // -> Hook laeuft mit einer nur-im-Speicher-ID sauber weiter.
    let currentId = null;
    try {
      currentId = window.localStorage.getItem(storageKey);
    } catch (e) {
      console.warn(
        "[AnythingLLM Embed] conversationId konnte nicht aus localStorage gelesen werden:",
        e,
      );
    }
    if (!!currentId) {
      justCreatedRef.current = false; // restauriert -> History laden
      setConversationId(currentId);
      return;
    }
    // Migration/Kontinuitaet: erste conversationId = bestehende sessionId, damit
    // ein bereits laufender Chat nahtlos erhalten bleibt. Erst der naechste Reset
    // erzeugt eine eigene, getrennte conversationId.
    if (!sessionId) return; // warten bis sessionId vorliegt
    justCreatedRef.current = false; // initial/migriert -> History laden
    try {
      window.localStorage.setItem(storageKey, sessionId);
    } catch (e) {
      // QuotaExceeded/SecurityError/Private-Mode duerfen das Widget nicht
      // crashen: State trotzdem setzen, Session laeuft (nur nicht persistent).
      console.warn(
        "[AnythingLLM Embed] conversationId konnte nicht in localStorage gespeichert werden:",
        e,
      );
    }
    setConversationId(sessionId);
  }, [sessionId, storageKey]);

  const newConversation = () => {
    if (!storageKey) return null;
    const fresh = v4();
    justCreatedRef.current = true; // frisch -> kein History-Fetch (Race-Fix)
    try {
      window.localStorage.setItem(storageKey, fresh);
    } catch (e) {
      console.warn(
        "[AnythingLLM Embed] conversationId konnte nicht in localStorage gespeichert werden:",
        e,
      );
    }
    setConversationId(fresh);
    return fresh;
  };

  return { conversationId, newConversation, justCreatedRef };
}
