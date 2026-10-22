import ChatWindowHeader from "./Header";
import SessionId from "../SessionId";
import useChatHistory from "@/hooks/chat/useChatHistory";
import ChatContainer from "./ChatContainer";
import Sponsor from "../Sponsor";
import {
  ChatHistoryLoading,
  ScrollArrowSlotContext,
} from "./ChatContainer/ChatHistory";
import ConversationHistory from "./ConversationHistory";
import ResetChat from "../ResetChat";
import { embedderSettings } from "@/main";
import { panelTexts } from "@/utils/layout";
import { useEscapeLayer } from "@/utils/escape";
import useEmbedMode from "@/hooks/useEmbedMode";
import { useEffect, useRef, useState } from "react";

export default function ChatWindow({
  closeChat,
  settings,
  sessionId,
  conversationId = null,
  newConversation = () => {},
  switchConversation = () => {},
  justCreatedRef = null,
  compactHeader = false,
  // Inline-Leiste (inlineInput): Frage/Entwurf aus der eingeklappten Leiste,
  // { ticket, text, send, suppressAutoFocus }. ChatContainer verbraucht jedes
  // Ticket genau einmal, sobald er bereit ist (Verlauf geladen), und meldet es
  // über onPendingFirstMessageConsumed zurück.
  pendingFirstMessage = null,
  onPendingFirstMessageConsumed = null,
}) {
  const { inline } = useEmbedMode();
  // Anker für den Scroll-nach-unten-Pfeil (siehe ChatHistory)
  const [arrowSlot, setArrowSlot] = useState(null);
  // KIE-503: Vollbild-Ansicht "Frühere Chats" statt des Chats anzeigen.
  const [showHistory, setShowHistory] = useState(false);
  // Abschaltbar pro Widget (visual_config im Admin) oder per Script-Attribut;
  // data-Attribute liefern Strings, daher auch "false" behandeln.
  const historyEnabled =
    settings?.historyEnabled !== false &&
    String(settings?.historyEnabled) !== "false";
  // Öffner der Ansicht (⋮ in der Titelleiste, von ChatWindowHeader
  // übergeben): bekommt nach Escape den Fokus zurück (Fixliste 7.22-rc13 W03).
  // Die Ref des ⋮ liegt hier und nicht im Kopf: Endet das Laden des Verlaufs,
  // während „Frühere Chats“ offen ist, hängt React den Kopf neu ein (anderer
  // Wurzelknoten unten); die Ref zeigt dann auf den neuen ⋮, ein gespeicherter
  // Knoten wäre vom Dokument getrennt (Fixliste 7.22-rc16 W42). Der Öffner
  // wird deshalb erst beim Schließen aufgelöst.
  const optionsButtonRef = useRef(null);
  const historyOpenerRef = useRef(null);
  const openHistory = historyEnabled
    ? (opener = null) => {
        historyOpenerRef.current = opener;
        setShowHistory(true);
      }
    : null;
  // Escape in „Frühere Chats“: zurück zum Chat statt das Fenster zu schließen
  // (die Ansicht deckt das ganze Fenster ab und nimmt jedes Escape)
  useEscapeLayer(showHistory, () => setShowHistory(false), {
    returnFocus: () => resolveOpener(historyOpenerRef.current),
  });
  const { chatHistory, setChatHistory, loading } = useChatHistory(
    settings,
    sessionId,
    conversationId,
    justCreatedRef,
  );

  // KIE-503 (Review-Fund W1): Die "Frühere Chats"-Ansicht wird als OVERLAY über
  // dem gemounteten Chat gerendert (nicht per early return an seiner Stelle).
  // So bleibt der ChatContainer beim bloßen Öffnen/Ansehen gemountet: ein
  // laufender Stream wird NICHT abgebrochen und lokal angezeigte Nachrichten
  // bleiben beim "Zurück" erhalten. Erst eine echte Auswahl einer ANDEREN
  // Konversation wechselt via switchConversation -> loading + Remount.
  const historyOverlay = showHistory ? (
    // z-[60]: muss ÜBER dem Scroll-nach-unten-Pfeil (z-50) aus ChatHistory
    // liegen, sonst schwebt der Pfeil über der Liste und scrollt den verdeckten Chat.
    <div className="allm-absolute allm-inset-0 allm-z-[60] allm-bg-[color:var(--allmi-surface,#fff)] allm-rounded-[var(--allmi-radius,16px)] allm-overflow-hidden">
      <ConversationHistory
        settings={settings}
        sessionId={sessionId}
        conversationId={conversationId}
        onSelect={(id) => {
          // Wechsel: conversationId setzen -> useChatHistory schaltet auf
          // loading und lädt die Ziel-History; ChatContainer remountet (key).
          switchConversation(id);
          setShowHistory(false);
        }}
        onBack={() => setShowHistory(false)}
        closeChat={closeChat}
      />
    </div>
  ) : null;

  // "Code kopieren": EIN delegierter Click-Listener am Shadow Root für die
  // Lebensdauer des Fensters (früher bei jedem Render neu angehängt -> Leck).
  useEffect(() => {
    const eventTarget = embedderSettings.shadowRoot || document;
    eventTarget.addEventListener("click", handleCodeSnippetClick);
    return () =>
      eventTarget.removeEventListener("click", handleCodeSnippetClick);
  }, []);

  if (loading) {
    return (
      // allm-relative + historyOverlay auch hier: sonst verpufft ein Klick auf
      // "Frühere Chats" während des Ladens (showHistory=true, aber unsichtbar).
      <div className="allm-flex allm-flex-col allm-h-full allm-relative">
        {historyOverlay}
        <ChatWindowHeader
          sessionId={sessionId}
          conversationId={conversationId}
          newConversation={newConversation}
          settings={settings}
          iconUrl={settings.brandImageUrl}
          closeChat={closeChat}
          setChatHistory={setChatHistory}
          compact={compactHeader}
          openHistory={openHistory}
          optionsButtonRef={optionsButtonRef}
        />
        <ChatHistoryLoading />
        <div className="allm-pt-2 allm-pb-3 allm-h-fit">
          <Sponsor settings={settings} />
        </div>
      </div>
    );
  }

  return (
    <ScrollArrowSlotContext.Provider value={arrowSlot}>
      <div className="allm-flex allm-flex-col allm-h-full allm-relative">
        {historyOverlay}
        {/* Inline: Header immer (einziger Weg zum Einklappen/Schließen) */}
        {(!settings.noHeader || inline) && (
          <ChatWindowHeader
            sessionId={sessionId}
            conversationId={conversationId}
            newConversation={newConversation}
            settings={settings}
            iconUrl={settings.brandImageUrl}
            closeChat={closeChat}
            setChatHistory={setChatHistory}
            compact={compactHeader}
            openHistory={openHistory}
            optionsButtonRef={optionsButtonRef}
          />
        )}
        <div className="allm-flex-grow allm-overflow-y-auto">
          <ChatContainer
            key={conversationId}
            sessionId={sessionId}
            conversationId={conversationId}
            settings={settings}
            knownHistory={chatHistory}
            pendingFirstMessage={pendingFirstMessage}
            onPendingFirstMessageConsumed={onPendingFirstMessageConsumed}
            onClose={inline ? null : closeChat}
          />
        </div>
        <div className="allm-pt-2 allm-pb-3 allm-h-fit allm-z-10">
          <Sponsor settings={settings} />
        </div>
        {/* Scroll-Pfeil-Anker: direktes Kind der (relativen) Fenster-Wurzel,
            AUSSERHALB der Scroll-Container -> wird auf iOS nicht geclippt. */}
        <div ref={setArrowSlot} />
      </div>
    </ScrollArrowSlotContext.Provider>
  );
}

// Öffner als Ref ({ current }) oder Element; die Ref wird erst hier, beim
// Schließen, gelesen (W42)
function resolveOpener(opener) {
  if (opener && typeof opener === "object" && "current" in opener)
    return opener.current;
  return opener;
}

// Enables us to safely markdown and sanitize all responses without risk of injection
// but still be able to attach a handler to copy code snippets on all elements
// that are code snippets.
function copyCodeSnippet(uuid) {
  // Use Shadow Root for querySelector (works with closed Shadow DOM)
  const root = embedderSettings.shadowRoot || document;
  const target = root.querySelector(`[data-code="${uuid}"]`);
  if (!target) return false;

  const markdown =
    target.parentElement?.parentElement?.querySelector(
      "pre:first-of-type",
    )?.innerText;
  if (!markdown) return false;

  window.navigator.clipboard.writeText(markdown);

  target.classList.add("allm-text-green-500");
  const originalText = target.innerHTML;
  // Sprache des Widgets („Kopiert!“ bzw. „Copied!“)
  target.innerText = panelTexts(embedderSettings.settings).copied;
  target.setAttribute("disabled", true);

  setTimeout(() => {
    target.classList.remove("allm-text-green-500");
    target.innerHTML = originalText;
    target.removeAttribute("disabled");
  }, 2500);
}

// Listens and hunts for all data-code-snippet clicks.
function handleCodeSnippetClick(e) {
  const target = e.target.closest("[data-code-snippet]");
  const uuidCode = target?.dataset?.code;
  if (!uuidCode) return false;
  copyCodeSnippet(uuidCode);
}
