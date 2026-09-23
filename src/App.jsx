import useGetScriptAttributes from "@/hooks/useScriptAttributes";
import useSessionId from "@/hooks/useSessionId";
import useConversationId from "@/hooks/useConversationId";
import useOpenChat from "@/hooks/useOpen";
import useMobileKeyboard from "@/hooks/useMobileKeyboard";
import OpenButton from "@/components/OpenButton";
import ChatWindow from "./components/ChatWindow";
import InlineChat from "@/components/InlineChat";
import { useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18next from "@/i18n";
import ChatService from "@/models/chatService";
import { embedderSettings, inlineTailwindStyles } from "@/main";
import {
  bubbleButtonStyle,
  bubbleWindowCss,
  findMountTarget,
  whenDomReady,
} from "@/utils/layout";

export default function App() {
  const { isChatOpen, toggleOpenChat } = useOpenChat();
  const embedSettings = useGetScriptAttributes();
  const sessionId = useSessionId();
  const { conversationId, newConversation, switchConversation, justCreatedRef } =
    useConversationId(sessionId);
  const [isEnabled, setIsEnabled] = useState(null); // null = loading, true = enabled, false = disabled
  // Inline-Modus: Platzhalter-Element (null = Chat-Blase, undefined = noch offen)
  const [mountTarget, setMountTarget] = useState(undefined);
  const chatWindowRef = useRef(null);
  const isInline = !!mountTarget;
  // Mobile Tastatur-Logik (visualViewport) — nur im Blasen-Modus; das Inline-
  // Vollbild-Overlay nutzt denselben Hook in InlineChat.
  const isKeyboardOpen = useMobileKeyboard(
    chatWindowRef,
    isChatOpen,
    !isInline,
  );

  // Check embed status on load - if disabled, don't render anything
  useEffect(() => {
    async function checkStatus() {
      if (!embedSettings.loaded) return;
      const enabled = await ChatService.checkEmbedStatus(embedSettings);
      setIsEnabled(enabled);
    }
    checkStatus();
  }, [embedSettings.loaded]);

  // Darstellung entscheiden, sobald die (Server-)Config da ist: Inline nur wenn
  // displayMode "inline" UND geeigneter Platzhalter gefunden — sonst wie bisher
  // Blase. Steht der Platzhalter im HTML nach dem Script, bis DOMContentLoaded
  // warten. Vor dem ersten Umhängen das Tailwind-CSS als <style> einbetten
  // (siehe main.jsx), damit Umhängen keinen ungestylten Frame erzeugt.
  useEffect(() => {
    if (!embedSettings.loaded) return;
    if (embedSettings.displayMode !== "inline") {
      setMountTarget(null);
      return;
    }
    let cancelled = false;
    whenDomReady().then(async () => {
      if (cancelled) return;
      const target = findMountTarget(
        embedSettings.mount,
        embedderSettings.hostElement,
      );
      if (!target) {
        setMountTarget(null); // Grund loggt findMountTarget
        return;
      }
      await inlineTailwindStyles();
      if (!cancelled) setMountTarget(target);
    });
    return () => {
      cancelled = true;
    };
  }, [embedSettings.loaded]);

  useEffect(() => {
    // Inline: kein Auto-Öffnen der Blase (und kein sessionStorage-Offen-Flag,
    // das sonst auf einer Blase-Seite derselben Domain nachwirken würde).
    if (
      embedSettings.openOnLoad === "on" &&
      isEnabled &&
      mountTarget === null
    ) {
      toggleOpenChat(true);
    }
  }, [embedSettings.loaded, isEnabled, mountTarget]);

  // Don't render until we know the embed status (and the display mode)
  if (!embedSettings.loaded || isEnabled === null || mountTarget === undefined)
    return null;

  // If embed is disabled, don't render anything (hide completely)
  if (isEnabled === false) return null;

  // Inline-Modus: keine Blase, kein Open-Button, keine Willkommensblasen.
  if (isInline) {
    return (
      <I18nextProvider i18n={i18next}>
        <InlineChat
          settings={embedSettings}
          mountTarget={mountTarget}
          onMountError={() => setMountTarget(null)}
          sessionId={sessionId}
          conversationId={conversationId}
          newConversation={newConversation}
          switchConversation={switchConversation}
          justCreatedRef={justCreatedRef}
        />
      </I18nextProvider>
    );
  }

  const validPositions = ["bottom-left", "bottom-right", "top-left", "top-right"];
  const position = validPositions.includes(embedSettings.position)
    ? embedSettings.position
    : "bottom-right";

  // Position classes for tablet/desktop (md: and above) — used for the
  // (on mobile fullscreen) chat window, where no edge margin must apply on mobile.
  const positionClasses = {
    "bottom-left": "md:allm-bottom-0 md:allm-left-0 md:allm-ml-4",
    "bottom-right": "md:allm-bottom-0 md:allm-right-0 md:allm-mr-4",
    "top-left": "md:allm-top-0 md:allm-left-0 md:allm-ml-4 md:allm-mt-4",
    "top-right": "md:allm-top-0 md:allm-right-0 md:allm-mr-4 md:allm-mt-4",
  };

  // Button-Container (geschlossener Zustand): horizontaler Rand auf ALLEN
  // Breakpoints. Sonst klebt der kleine Button auf Mobil am Bildschirmrand,
  // weil positionClasses md:-only sind und mobil nicht greifen.
  const buttonPositionClasses = {
    "bottom-left": "allm-left-0 allm-ml-4",
    "bottom-right": "allm-right-0 allm-mr-4",
    "top-left": "allm-left-0 allm-ml-4",
    "top-right": "allm-right-0 allm-mr-4",
  };

  // Responsive layout:
  // Mobile (<768px): 100% width/height, no rounded corners, fullscreen
  // Tablet (768-1279px): 40% width, 77% height, rounded corners (inkl. iPad Pro 1024px)
  // Desktop (>=1280px): 25% width, 77% height, rounded corners
  const responsiveClasses = `
    allm-inset-0
    allm-w-full allm-h-full
    allm-rounded-none
    md:allm-inset-auto md:allm-max-w-[40%] md:allm-max-h-[77%] md:allm-rounded-2xl md:allm-mb-4
    xl:allm-max-w-[25%]
  `;

  // Optionale Fenstergröße/Randabstand (Design Center). Leer -> "" -> exakt
  // bisherige Klassen-Größen. Werte sind whitelist-validiert (utils/layout).
  const windowCss = bubbleWindowCss(embedSettings, position);

  return (
    <I18nextProvider i18n={i18next}>
      {windowCss && <style>{windowCss}</style>}
      <div
        id="anything-llm-embed-chat-container"
        className={`allm-fixed allm-z-[9999] ${isChatOpen ? "allm-block" : "allm-hidden"}`}
      >
        <div
          ref={chatWindowRef}
          className={`allm-bubble-window allm-bg-white allm-fixed allm-border allm-border-gray-300 allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)] allm-flex allm-flex-col allm-overflow-hidden ${responsiveClasses} ${positionClasses[position]}`}
          id="anything-llm-chat"
        >
          {isChatOpen && (
            <ChatWindow
              closeChat={() => toggleOpenChat(false)}
              settings={embedSettings}
              sessionId={sessionId}
              conversationId={conversationId}
              newConversation={newConversation}
              switchConversation={switchConversation}
              justCreatedRef={justCreatedRef}
              compactHeader={isKeyboardOpen}
            />
          )}
        </div>
      </div>
      {!isChatOpen && (
        <div
          id="anything-llm-embed-chat-button-container"
          className={`allm-fixed allm-bottom-0 ${buttonPositionClasses[position]} allm-mb-4 allm-z-[9999]`}
          style={bubbleButtonStyle(embedSettings, position)}
        >
          <OpenButton
            settings={embedSettings}
            isOpen={isChatOpen}
            toggleOpen={() => toggleOpenChat(true)}
          />
        </div>
      )}
    </I18nextProvider>
  );
}
