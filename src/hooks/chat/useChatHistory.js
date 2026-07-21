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
      if (justCreatedRef?.current) {
        setMessages([]);
        setLoading(false);
        return;
      }

      try {
        const formattedMessages = await ChatService.embedSessionHistory(
          settings,
          sessionId,
          conversationId,
        );
        setMessages(formattedMessages);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching historical chats:", error);
        setLoading(false);
      }
    }
    fetchChatHistory();
  }, [sessionId, conversationId, settings]);

  return { chatHistory: messages, setChatHistory: setMessages, loading };
}
