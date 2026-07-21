import React, { useState, useEffect, useRef } from "react";
import ChatHistory from "./ChatHistory";
import PromptInput from "./PromptInput";
import handleChat from "@/utils/chat";
import ChatService from "@/models/chatService";
export const SEND_TEXT_EVENT = "anythingllm-embed-send-prompt";

export default function ChatContainer({
  sessionId,
  conversationId = null,
  settings,
  knownHistory = [],
}) {
  const [message, setMessage] = useState("");
  const [loadingResponse, setLoadingResponse] = useState(false);
  const [chatHistory, setChatHistory] = useState(knownHistory);
  // Haelt den AbortController des gerade laufenden Streams, damit er beim
  // Unmount (Reset remountet ChatContainer via key={conversationId}) abgebrochen
  // werden kann. Ref statt Effect-Cleanup, weil der fetchReply-Effect bei JEDEM
  // gestreamten Chunk (chatHistory-Dependency) neu laeuft -- ein Abort im
  // Effect-Cleanup wuerde den laufenden Stream sonst nach dem ersten Chunk toeten.
  const streamControllerRef = useRef(null);

  // Resync history if the ref to known history changes
  // eg: cleared.
  useEffect(() => {
    if (knownHistory.length !== chatHistory.length)
      setChatHistory([...knownHistory]);
  }, [knownHistory]);

  const handleMessageChange = (event) => {
    setMessage(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!message || message === "") return false;

    const prevChatHistory = [
      ...chatHistory,
      { content: message, role: "user", sentAt: Math.floor(Date.now() / 1000) },
      {
        content: "",
        role: "assistant",
        pending: true,
        userMessage: message,
        animate: true,
        sentAt: Math.floor(Date.now() / 1000),
      },
    ];
    setChatHistory(prevChatHistory);
    setMessage("");
    setLoadingResponse(true);
  };

  const sendCommand = (command, history = [], attachments = []) => {
    if (!command || command === "") return false;

    let prevChatHistory;
    if (history.length > 0) {
      // use pre-determined history chain.
      prevChatHistory = [
        ...history,
        {
          content: "",
          role: "assistant",
          pending: true,
          userMessage: command,
          attachments,
          animate: true,
          sentAt: Math.floor(Date.now() / 1000),
        },
      ];
    } else {
      prevChatHistory = [
        ...chatHistory,
        {
          content: command,
          role: "user",
          attachments,
          sentAt: Math.floor(Date.now() / 1000),
        },
        {
          content: "",
          role: "assistant",
          pending: true,
          userMessage: command,
          animate: true,
          sentAt: Math.floor(Date.now() / 1000),
        },
      ];
    }

    setChatHistory(prevChatHistory);
    setLoadingResponse(true);
  };

  useEffect(() => {
    async function fetchReply() {
      const promptMessage =
        chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
      const remHistory = chatHistory.length > 0 ? chatHistory.slice(0, -1) : [];
      var _chatHistory = [...remHistory];

      if (!promptMessage || !promptMessage?.userMessage) {
        setLoadingResponse(false);
        return false;
      }

      // Neuen Controller erst hier (nach dem Guard) erzeugen, damit die
      // chunk-getriebenen Re-Runs des Effects den aktiven Controller nicht
      // ueberschreiben. Der Cleanup-Effect unten bricht ihn beim Unmount ab.
      const controller = new AbortController();
      streamControllerRef.current = controller;

      await ChatService.streamChat(
        sessionId,
        settings,
        promptMessage.userMessage,
        (chatResult) =>
          handleChat(
            chatResult,
            setLoadingResponse,
            setChatHistory,
            remHistory,
            _chatHistory,
          ),
        conversationId,
        controller.signal,
      );
      return;
    }

    loadingResponse === true && fetchReply();
  }, [loadingResponse, chatHistory]);

  // Laufenden Stream beim Unmount abbrechen: der Reset erzeugt via
  // newConversation() eine neue conversationId, wodurch ChatWindow den
  // ChatContainer (key={conversationId}) neu mountet. Ohne Abbruch wuerde die
  // alte, noch streamende Antwort weiterlaufen und ins Leere gehen.
  useEffect(() => {
    return () => streamControllerRef.current?.abort();
  }, []);

  const handleAutofillEvent = (event) => {
    if (!event.detail.command) return;
    sendCommand(event.detail.command, [], []);
  };

  useEffect(() => {
    window.addEventListener(SEND_TEXT_EVENT, handleAutofillEvent);
    return () => {
      window.removeEventListener(SEND_TEXT_EVENT, handleAutofillEvent);
    };
  }, []);

  return (
    <div className="allm-h-full allm-w-full allm-flex allm-flex-col">
      <div className="allm-flex-1 allm-min-h-0 allm-mb-8">
        <ChatHistory settings={settings} history={chatHistory} />
      </div>
      <div className="allm-flex-shrink-0 allm-mt-auto">
        <PromptInput
          settings={settings}
          message={message}
          submit={handleSubmit}
          onChange={handleMessageChange}
          inputDisabled={loadingResponse}
          buttonDisabled={loadingResponse}
        />
      </div>
    </div>
  );
}
