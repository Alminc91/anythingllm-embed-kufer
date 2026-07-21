import ChatService from "@/models/chatService";
import { useEffect, useState } from "react";

export default function useChatHistory(
  settings = null,
  sessionId = null,
  conversationId = null,
) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    async function fetchChatHistory() {
      if (!sessionId || !conversationId || !settings) {
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
