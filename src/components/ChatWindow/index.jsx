import ChatWindowHeader from "./Header";
import SessionId from "../SessionId";
import useChatHistory from "@/hooks/chat/useChatHistory";
import ChatContainer from "./ChatContainer";
import Sponsor from "../Sponsor";
import { ChatHistoryLoading } from "./ChatContainer/ChatHistory";
import ConversationHistory from "./ConversationHistory";
import ResetChat from "../ResetChat";
import { embedderSettings } from "@/main";
import { useState } from "react";

export default function ChatWindow({
  closeChat,
  settings,
  sessionId,
  conversationId = null,
  newConversation = () => {},
  switchConversation = () => {},
  justCreatedRef = null,
  compactHeader = false,
}) {
  // KIE-503: Vollbild-Ansicht "Frühere Chats" statt des Chats anzeigen.
  const [showHistory, setShowHistory] = useState(false);
  // Abschaltbar pro Widget (visual_config im Admin) oder per Script-Attribut;
  // data-Attribute liefern Strings, daher auch "false" behandeln.
  const historyEnabled =
    settings?.historyEnabled !== false &&
    String(settings?.historyEnabled) !== "false";
  const openHistory = historyEnabled ? () => setShowHistory(true) : null;
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
    // z-[60]: muss ÜBER dem Scroll-nach-unten-Pfeil (z-50, fixed) in ChatHistory
    // liegen, sonst schwebt der Pfeil über der Liste und scrollt den verdeckten Chat.
    <div className="allm-absolute allm-inset-0 allm-z-[60] allm-bg-white allm-rounded-2xl allm-overflow-hidden">
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
        />
        <ChatHistoryLoading />
        <div className="allm-pt-2 allm-pb-3 allm-h-fit">
          <Sponsor settings={settings} />
        </div>
      </div>
    );
  }

  setEventDelegatorForCodeSnippets();

  return (
    <div className="allm-flex allm-flex-col allm-h-full allm-relative">
      {historyOverlay}
      {!settings.noHeader && (
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
        />
      )}
      <div className="allm-flex-grow allm-overflow-y-auto">
        <ChatContainer
          key={conversationId}
          sessionId={sessionId}
          conversationId={conversationId}
          settings={settings}
          knownHistory={chatHistory}
        />
      </div>
      <div className="allm-pt-2 allm-pb-3 allm-h-fit allm-z-10">
        <Sponsor settings={settings} />
      </div>
    </div>
  );
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
  target.innerText = "Copied!";
  target.setAttribute("disabled", true);

  setTimeout(() => {
    target.classList.remove("allm-text-green-500");
    target.innerHTML = originalText;
    target.removeAttribute("disabled");
  }, 2500);
}

// Listens and hunts for all data-code-snippet clicks.
function setEventDelegatorForCodeSnippets() {
  // Use Shadow Root for event listeners (works with closed Shadow DOM)
  const eventTarget = embedderSettings.shadowRoot || document;
  eventTarget.addEventListener("click", function (e) {
    const target = e.target.closest("[data-code-snippet]");
    const uuidCode = target?.dataset?.code;
    if (!uuidCode) return false;
    copyCodeSnippet(uuidCode);
  });
}
