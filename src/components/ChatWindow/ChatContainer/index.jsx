import { isImeEscape } from "@/utils/escape";
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import ChatHistory from "./ChatHistory";
import PromptInput from "./PromptInput";
import handleChat from "@/utils/chat";
import ChatService from "@/models/chatService";
import PrivacyNotice from "../PrivacyNotice";
import { acknowledgePrivacy, privacyNoticePending } from "@/utils/privacy";
import { panelTexts } from "@/utils/layout";
import { AI_NOTICE_BG, AI_NOTICE_ID, AI_NOTICE_TEXT } from "@/utils/theme";
export const SEND_TEXT_EVENT = "anythingllm-embed-send-prompt";
// id des Shadow-Hosts jedes Widgets (main.jsx)
const WIDGET_HOST_ID = "anythingllm-embed-widget";
// Vorschlag (Balken/Pille im leeren Chat, Folgefrage) senden: ChatContainer
// hört auf SEND_TEXT_EVENT (während der Datenschutz-Sperre ignoriert).
// Security: das Ereignis startet am angeklickten Element (source) und steigt
// nur bis zur Wurzel des EIGENEN ChatContainers auf (nicht composed: bleibt im
// Shadow DOM) — bei zwei Widgets auf einer Seite sendet nur das angeklickte.
// Ohne source (Aufruf von außen) wie bisher auf window.
// Von der Webseite ausgelöste Ereignisse (window, document, Seitenelemente)
// wirken wie bisher in jedem Widget; verworfen werden nur Ereignisse aus
// einem anderen Widget (Ziel liegt in dessen Shadow-Host, WIDGET_HOST_ID).
export function sendSuggestion(text, source = null) {
  const detail = { command: text };
  if (source && typeof source.dispatchEvent === "function")
    source.dispatchEvent(
      new CustomEvent(SEND_TEXT_EVENT, { detail, bubbles: true }),
    );
  else window.dispatchEvent(new CustomEvent(SEND_TEXT_EVENT, { detail }));
}

export default function ChatContainer({
  sessionId,
  conversationId = null,
  settings,
  knownHistory = [],
  pendingFirstMessage = null,
  onPendingFirstMessageConsumed = null,
  // Blasen-Modus: Escape im Datenschutz-Hinweis schließt das Fenster
  onClose = null,
}) {
  const rootRef = useRef(null);
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
  // Datenschutz-Hinweis (privacyNotice "modal"): bis zur Bestätigung (Knopf
  // „Start“) ist die Eingabe gesperrt, Vorschläge/Fragen aus der Leiste
  // warten. "bubble" = nur Text in der Begrüßungsblase, keine Sperre.
  const [privacyLocked, setPrivacyLocked] = useState(() =>
    privacyNoticePending(settings),
  );
  const privacyLockedRef = useRef(privacyLocked);
  privacyLockedRef.current = privacyLocked;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Blasen-Modus (onClose; im Inline-Modus null, dort klappt InlineChat bei
  // Escape ein): solange der Datenschutz-Hinweis sperrt, schließt Escape das
  // Fenster wie der Schließen-Knopf, ohne zu bestätigen — auch wenn der Fokus
  // auf der Webseite liegt (keydown aus dem Shadow DOM ist composed und kommt
  // ebenfalls am document an). Keine Tastaturfalle.
  const escapeCloses = privacyLocked && !!onClose;
  useEffect(() => {
    if (!escapeCloses) return;
    const doc = rootRef.current?.ownerDocument || document;
    const onKeyDown = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || isImeEscape(e)) return;
      e.preventDefault();
      onCloseRef.current?.();
    };
    doc.addEventListener("keydown", onKeyDown);
    return () => doc.removeEventListener("keydown", onKeyDown);
  }, [escapeCloses]);

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
  // Datenschutz-Hinweis: das Ticket wartet bis zur Bestätigung
  // (consumePending direkt im Klick, siehe acknowledge).
  const replyStreaming = isStreaming(chatHistory[chatHistory.length - 1]);
  const consumePending = () => {
    const pending = pendingFirstMessage;
    if (!pending?.text || !onPendingFirstMessageConsumed) return;
    if (pending.ticket === lastConsumedTicketRef.current) return;
    if (pending.send && (loadingResponse || replyStreaming)) return;
    lastConsumedTicketRef.current = pending.ticket;
    onPendingFirstMessageConsumed(pending);
    if (pending.send) sendCommand(pending.text, [], []);
    else setMessage((current) => appendDraft(current, pending.text));
  };
  useEffect(() => {
    if (!privacyLocked) consumePending();
  }, [pendingFirstMessage, loadingResponse, replyStreaming, privacyLocked]);

  // Knopf im Hinweis: Bestätigung speichern, Sperre lösen und eine wartende
  // Frage im selben Klick senden (ein Commit: das Eingabefeld wird nicht
  // erst frei und gleich wieder gesperrt).
  const acknowledge = () => {
    acknowledgePrivacy(settings?.embedId);
    setPrivacyLocked(false);
    consumePending();
  };

  const handleAutofillEvent = (event) => {
    if (!event.detail.command) return;
    if (privacyLockedRef.current) return;
    sendCommand(event.detail.command, [], []);
  };
  // Der Listener ruft immer den aktuellen Handler (Folgefragen kommen mitten
  // im Gespräch: sendCommand braucht den aktuellen Verlauf, nicht den beim
  // Einhängen).
  const autofillRef = useRef(handleAutofillEvent);
  useLayoutEffect(() => {
    autofillRef.current = handleAutofillEvent;
  });

  // Eigene Vorschläge kommen an der Wurzel dieses Containers an (und gehen
  // nicht weiter); auf window alles von der Webseite (window, document,
  // Seitenelemente) und aus dem eigenen Widget, nie aus einem anderen: dort
  // zeigt das Ziel (auf window auf den Shadow-Host umgelenkt) in einen
  // fremden Widget-Host.
  useEffect(() => {
    const root = rootRef.current;
    const ownHost = root?.getRootNode?.()?.host ?? null;
    const local = (event) => {
      event.stopPropagation();
      autofillRef.current(event);
    };
    const external = (event) => {
      const target = event.target;
      const el = target?.nodeType === 1 ? target : target?.parentElement;
      const widget = el?.closest?.(`#${WIDGET_HOST_ID}`) ?? null;
      if (widget && widget !== ownHost && !widget.contains(root)) return;
      autofillRef.current(event);
    };
    root?.addEventListener(SEND_TEXT_EVENT, local);
    window.addEventListener(SEND_TEXT_EVENT, external);
    return () => {
      root?.removeEventListener(SEND_TEXT_EVENT, local);
      window.removeEventListener(SEND_TEXT_EVENT, external);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="allm-h-full allm-w-full allm-flex allm-flex-col"
      style={privacyLocked ? { position: "relative" } : undefined}
    >
      {privacyLocked && (
        <PrivacyNotice
          settings={settings}
          onAcknowledge={acknowledge}
          suppressAutoFocus={pendingFirstMessage?.suppressAutoFocus === true}
        />
      )}
      <div className="allm-flex-1 allm-min-h-0 allm-mb-8">
        <ChatHistory
          settings={settings}
          history={chatHistory}
          sessionId={sessionId}
          canSend={!loadingResponse && !privacyLocked}
        />
      </div>
      <div className="allm-flex-shrink-0 allm-mt-auto">
        <PromptInput
          settings={settings}
          message={message}
          submit={handleSubmit}
          onChange={handleMessageChange}
          inputDisabled={loadingResponse || privacyLocked}
          buttonDisabled={loadingResponse || privacyLocked}
          suppressAutoFocus={pendingFirstMessage?.suppressAutoFocus === true}
        />
        <AiDisclaimer settings={settings} />
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
    !message.followUpsHold &&
    Array.isArray(message.courseSources)
  );
}

// Entwurf aus der Leiste ins Chat-Eingabefeld: leeres Feld -> Entwurf, sonst
// mit einem Leerzeichen angehängt (Getipptes wird nie überschrieben).
export function appendDraft(current, draft) {
  if (!current || current.trim() === "") return draft;
  return `${current.replace(/\s+$/, "")} ${draft}`;
}

// Fester KI-Hinweis unter dem Eingabefeld, in allen Modi und immer (Design
// Center vereinfacht, 15.10.2026: nicht abschaltbar, Text nicht änderbar;
// disclaimer/disclaimerText aus Script oder Konfiguration wirken nicht).
// Farben fest je Farbschema (E24, Fixliste 7.22-rc17, utils/theme.js
// AI_NOTICE_COLORS): Schrift und eine eigene Fläche hinter dem Satz, damit
// keine CSS-Variable der Seite (--allm-text-muted, --allm-surface, auch per
// @property registrierte --allmi-*) ihn unsichtbar oder unlesbar macht. Die
// festen Farben gelten als Regel direkt am Element (Theme-Stylesheet,
// buildThemeCss, Fixliste 7.22-rc18 W62); die Werte im style gelten nur
// ohne dieses Stylesheet.
// Text: Standard der Panel-Texte (utils/layout.js panelTexts: "en" englisch,
// sonst deutsch; Wortlaut Fixliste 7.22-rc8 R1). Eine dezente Zeile, nur
// Text, nicht anklickbar. Immer genau eine Zeile (Fixliste 7.22-rc7 Nr. 22):
// kein Umbruch. In schmalen Fenstern (Chatfenster bei 1280 px: 320 px breit,
// 316 px Platz bei 2 px Rand; der Satz braucht bei 11 px etwa 345 px, bei
// 10 px etwa 314 px in DejaVu Sans, in Segoe UI/Arial etwa 280 px) wird die
// Schrift bis 10 px kleiner (Containerabfrage, .allm-ai-disclaimer in
// main.jsx); reicht auch das nicht (noch breitere Schrift), endet die Zeile
// mit „…“ (voller Text im title und für Screenreader). Seitenrand 2 px
// (rc8, vorher 8 px): die Zeile ist zentriert, der Rand zählt nur, wenn der
// Satz das Fenster fast ausfüllt (gemessen: tests/visual/disclaimer_measure.py).
function AiDisclaimer({ settings }) {
  const text = panelTexts(settings || {}).aiDisclaimer;
  return (
    <div className="allm-ai-disclaimer-box">
      <p
        id={AI_NOTICE_ID}
        role="note"
        title={text}
        className="allm-ai-disclaimer allm-font-sans"
        style={{
          margin: "4px 2px 0",
          lineHeight: 1.4,
          textAlign: "center",
          color: AI_NOTICE_TEXT,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <span style={{ backgroundColor: AI_NOTICE_BG }}>{text}</span>
      </p>
    </div>
  );
}
