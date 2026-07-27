import ChatService from "@/models/chatService";
import { useEffect, useState } from "react";

export default function useChatHistory(
  settings = null,
  sessionId = null,
  conversationId = null,
  justCreatedRef = null,
) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Cancel-Guard: Wird waehrend eines laufenden History-Fetch (z.B. der
    // restaurierten Vorgaenger-Konversation) die conversationId gewechselt
    // (Reset -> neues conv), darf das spaet eintreffende Ergebnis NICHT mehr
    // per setMessages in das frische Fenster bluten. Der Effect-Cleanup setzt
    // cancelled=true; nach jedem await wird das geprueft, bevor State gesetzt wird.
    let cancelled = false;
    async function fetchChatHistory() {
      // nur wenn Grunddaten fehlen -> nicht laden, loading beenden
      if (!settings || !sessionId) {
        setLoading(false);
        return;
      }
      // conversationId wird gleich aus sessionId abgeleitet -> warten, loading bleibt true
      if (!conversationId) return;

      // Frisch per newConversation() erzeugte conversationId hat serverseitig
      // garantiert keine History -> KEIN Fetch. Das spart nicht nur den leeren
      // Roundtrip, sondern verhindert die Race, in der ein verzoegert
      // eintreffendes Leer-Ergebnis ([] als neue Array-Referenz) ueber den
      // ChatContainer-Resync (knownHistory.length !== chatHistory.length) eine
      // gerade gesendete Nachricht wieder loeschte. Nur restaurierte/initial
      // migrierte IDs (justCreatedRef.current === false) laden History.
      //
      // justCreatedRef liegt in App (unmountet nie), useChatHistory laeuft aber
      // bei jedem ChatWindow-Remount neu. Darum wird das Ref hier NACH dem einen
      // Skip sofort auf false zurueckgesetzt: nur das eine Render direkt nach
      // newConversation() ueberspringt den Fetch, jeder spaetere Load (z.B.
      // Close/Reopen) restauriert die aktuelle Konversation wieder normal. Es
      // wird kein Fetch ausgeloest -> die Reset-Race bleibt geschlossen.
      if (justCreatedRef?.current) {
        justCreatedRef.current = false;
        setMessages([]);
        setLoading(false);
        return;
      }

      // KIE-503 (Review-Fund K1): Vor einem echten Fetch (Restore ODER Wechsel
      // via switchConversation) in den Ladezustand schalten und die alte Liste
      // leeren. Ohne das behielte der State beim Konversationswechsel die
      // Nachrichten der VORHERIGEN Konversation (loading blieb false) — der
      // remountete ChatContainer zeigte sie unter der neuen ID, und bei
      // gleicher Nachrichtenzahl hätte sein Längen-Resync die richtige History
      // nie nachgezogen. Mit loading=true rendert ChatWindow stattdessen den
      // Loading-Zweig, bis die Ziel-History wirklich da ist.
      setLoading(true);
      setMessages([]);

      try {
        const formattedMessages = await ChatService.embedSessionHistory(
          settings,
          sessionId,
          conversationId,
        );
        if (cancelled) return;
        setMessages(formattedMessages);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching historical chats:", error);
        setLoading(false);
      }
    }
    fetchChatHistory();
    return () => {
      cancelled = true;
    };
  }, [sessionId, conversationId, settings]);

  return { chatHistory: messages, setChatHistory: setMessages, loading };
}
