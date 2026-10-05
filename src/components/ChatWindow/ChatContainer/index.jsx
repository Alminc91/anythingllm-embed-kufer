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
  pendingFirstMessage = null,
  onPendingFirstMessageConsumed = null,
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
  // Zuletzt verbrauchtes Ticket der Inline-Leiste: jedes Ticket genau einmal.
  const lastConsumedTicketRef = useRef(null);

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
        // Freigabe wie bisher, sobald die Antwort im Verlauf liegt (erster
        // Text-Chunk). Ausnahme Kurskarten v2: Die Antwort entstand nur durch
        // den frühen courseSources-Chunk und hat noch keinen Text -> gesperrt
        // lassen, bis Text kommt.
        if (!awaitsFirstText(promptMessage)) setLoadingResponse(false);
        return false;
      }

      // Neuen Controller erst hier (nach dem Guard) erzeugen, damit die
      // chunk-getriebenen Re-Runs des Effects den aktiven Controller nicht
      // ueberschreiben. Der Cleanup-Effect unten bricht ihn beim Unmount ab.
      const controller = new AbortController();
      streamControllerRef.current = controller;

      try {
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
      } finally {
        // Rückfallebene: Stream zu Ende ohne Text nach dem courseSources-Chunk
        // bzw. ohne Abschluss-Chunk (close) -> trotzdem freigeben.
        if (isStreaming(_chatHistory[_chatHistory.length - 1]))
          setLoadingResponse(false);
      }
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

  // Inline-Leiste (inlineInput): Frage bzw. Entwurf aus der eingeklappten
  // Leiste übernehmen. Dieser Container wird erst nach dem Laden des Verlaufs
  // gemountet (ChatWindow zeigt vorher die Ladeanzeige) -> hier ist der Chat
  // bereit. Jedes Ticket wird genau EINMAL verbraucht (Vergleich mit
  // lastConsumedTicketRef, auch bei doppelt laufendem Effect/StrictMode) ->
  // keine Doppelsendung; danach gibt die Leiste die Übergabe frei.
  // send: über denselben Pfad wie ein Vorschlag/Senden (sendCommand ->
  // fetchReply -> ChatService.streamChat, inkl. conversationId); läuft gerade
  // noch eine Antwort (bis zum Abschluss-Chunk close, nicht nur bis zum
  // ersten Wort), wird gewartet — sonst liefen zwei Anfragen parallel.
  // Entwurf (send false): ins Eingabefeld — ein dort schon getippter Text
  // bleibt stehen, der Entwurf wird angehängt.
  const replyStreaming = isStreaming(chatHistory[chatHistory.length - 1]);
  useEffect(() => {
    const pending = pendingFirstMessage;
    if (!pending?.text || !onPendingFirstMessageConsumed) return;
    if (pending.ticket === lastConsumedTicketRef.current) return;
    if (pending.send && (loadingResponse || replyStreaming)) return;
    lastConsumedTicketRef.current = pending.ticket;
    onPendingFirstMessageConsumed(pending);
    if (pending.send) sendCommand(pending.text, [], []);
    else setMessage((current) => appendDraft(current, pending.text));
  }, [pendingFirstMessage, loadingResponse, replyStreaming]);

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
        <ChatHistory
          settings={settings}
          history={chatHistory}
          sessionId={sessionId}
        />
      </div>
      <div className="allm-flex-shrink-0 allm-mt-auto">
        <PromptInput
          settings={settings}
          message={message}
          submit={handleSubmit}
          onChange={handleMessageChange}
          inputDisabled={loadingResponse}
          buttonDisabled={loadingResponse}
          suppressAutoFocus={pendingFirstMessage?.suppressAutoFocus === true}
        />
      </div>
    </div>
  );
}

// Assistenten-Antwort, deren Stream noch läuft (wartend oder ohne close)
function isStreaming(message) {
  return (
    message?.role === "assistant" && message.animate === true && !message.closed
  );
}

// Kurskarten v2: Antwort nur aus dem frühen courseSources-Chunk angelegt —
// wartend, noch kein Text (auch kein gepufferter Karten-Marker)
function awaitsFirstText(message) {
  return (
    isStreaming(message) &&
    message.pending === true &&
    !message.content &&
    message.markerBuffer === undefined &&
    Array.isArray(message.courseSources)
  );
}

// Entwurf aus der Leiste ins Chat-Eingabefeld: leeres Feld -> Entwurf, sonst
// mit einem Leerzeichen angehängt (Getipptes wird nie überschrieben).
export function appendDraft(current, draft) {
  if (!current || current.trim() === "") return draft;
  return `${current.replace(/\s+$/, "")} ${draft}`;
}
