import { useEffect, useState } from "react";
import { embedderSettings } from "../main";
import { v4 } from "uuid";

// conversationId = ein einzelner Chat-Verlauf. Getrennt von der dauerhaften
// sessionId (Besucher-/Browser-Identifier). "Chat zuruecksetzen" erzeugt via
// newConversation() eine neue conversationId; der Server laedt den LLM-Kontext
// nach conversation_id, wodurch der neue Chat automatisch frisch ist und die
// alte Konversation als eigene, auffindbare Einheit erhalten bleibt.
export default function useConversationId(sessionId = null) {
  const [conversationId, setConversationId] = useState("");

  useEffect(() => {
    if (!window || !embedderSettings?.settings?.embedId) return;
    const STORAGE_IDENTIFIER = `allm_${embedderSettings.settings.embedId}_conversation_id`;
    const currentId = window.localStorage.getItem(STORAGE_IDENTIFIER);
    if (!!currentId) {
      setConversationId(currentId);
      return;
    }
    // Migration/Kontinuitaet: erste conversationId = bestehende sessionId, damit
    // ein bereits laufender Chat nahtlos erhalten bleibt. Erst der naechste Reset
    // erzeugt eine eigene, getrennte conversationId.
    if (!sessionId) return; // warten bis sessionId vorliegt
    window.localStorage.setItem(STORAGE_IDENTIFIER, sessionId);
    setConversationId(sessionId);
  }, [sessionId]);

  const newConversation = () => {
    if (!embedderSettings?.settings?.embedId) return null;
    const STORAGE_IDENTIFIER = `allm_${embedderSettings.settings.embedId}_conversation_id`;
    const fresh = v4();
    window.localStorage.setItem(STORAGE_IDENTIFIER, fresh);
    setConversationId(fresh);
    return fresh;
  };

  return { conversationId, newConversation };
}
