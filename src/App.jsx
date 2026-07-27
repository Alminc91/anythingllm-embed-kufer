import useGetScriptAttributes from "@/hooks/useScriptAttributes";
import useSessionId from "@/hooks/useSessionId";
import useConversationId from "@/hooks/useConversationId";
import useOpenChat from "@/hooks/useOpen";
import OpenButton from "@/components/OpenButton";
import ChatWindow from "./components/ChatWindow";
import { useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18next from "@/i18n";
import ChatService from "@/models/chatService";

export default function App() {
  const { isChatOpen, toggleOpenChat } = useOpenChat();
  const embedSettings = useGetScriptAttributes();
  const sessionId = useSessionId();
  const { conversationId, newConversation, switchConversation, justCreatedRef } =
    useConversationId(sessionId);
  const [isEnabled, setIsEnabled] = useState(null); // null = loading, true = enabled, false = disabled
  const chatWindowRef = useRef(null);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const kbBaselineRef = useRef(0); // groesste je gesehene sichtbare Hoehe (= ohne Tastatur)
  const lastWidthRef = useRef(0);

  // Check embed status on load - if disabled, don't render anything
  useEffect(() => {
    async function checkStatus() {
      if (!embedSettings.loaded) return;
      const enabled = await ChatService.checkEmbedStatus(embedSettings);
      setIsEnabled(enabled);
    }
    checkStatus();
  }, [embedSettings.loaded]);

  useEffect(() => {
    if (embedSettings.openOnLoad === "on" && isEnabled) {
      toggleOpenChat(true);
    }
  }, [embedSettings.loaded, isEnabled]);

  // Mobile keyboard handling: on mobile (<768px) couple the chat window height
  // to window.visualViewport so the soft keyboard doesn't push the header
  // (with the close button) out of view. Tablet/desktop are left untouched.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const applyViewport = () => {
      // Tastatur-Erkennung ueber ZWEI Signale (iOS-Robustheit): die sichtbare
      // Hoehe liegt deutlich unter (a) der groessten je gesehenen Hoehe (Baseline =
      // ohne Tastatur) ODER (b) der Layout-Hoehe window.innerHeight. Auf manchen
      // iOS-Staenden schrumpft innerHeight mit der Tastatur mit (Delta ~0), dann
      // greift die Baseline. Desktop (auch schmal, Firefox) hat keine Soft-Tastatur
      // -> beide Deltas ~0 -> feuert nie.
      const isMobile = window.innerWidth < 768;
      // Bei Orientierungswechsel (Breite aendert sich) Baseline zuruecksetzen.
      if (window.innerWidth !== lastWidthRef.current) {
        lastWidthRef.current = window.innerWidth;
        kbBaselineRef.current = 0;
      }
      if (vv.height > kbBaselineRef.current) kbBaselineRef.current = vv.height;
      const shrink = Math.max(
        kbBaselineRef.current - vv.height,
        window.innerHeight - vv.height,
      );
      const keyboardOpen = isMobile && shrink > 120;
      const active = isChatOpen && keyboardOpen;
      const el = chatWindowRef.current;
      if (el) {
        if (active) {
          el.style.height = `${vv.height}px`;
          el.style.top = `${vv.offsetTop}px`;
          el.style.bottom = "auto";
        } else {
          el.style.height = "";
          el.style.top = "";
          el.style.bottom = "";
        }
      }
      setIsKeyboardOpen(active);
    };
    applyViewport();
    vv.addEventListener("resize", applyViewport);
    vv.addEventListener("scroll", applyViewport);
    return () => {
      vv.removeEventListener("resize", applyViewport);
      vv.removeEventListener("scroll", applyViewport);
    };
  }, [isChatOpen]);

  // Don't render until we know the embed status
  if (!embedSettings.loaded || isEnabled === null) return null;

  // If embed is disabled, don't render anything (hide completely)
  if (isEnabled === false) return null;

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

  return (
    <I18nextProvider i18n={i18next}>
      <div
        id="anything-llm-embed-chat-container"
        className={`allm-fixed allm-z-[9999] ${isChatOpen ? "allm-block" : "allm-hidden"}`}
      >
        <div
          ref={chatWindowRef}
          className={`allm-bg-white allm-fixed allm-border allm-border-gray-300 allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)] allm-flex allm-flex-col allm-overflow-hidden ${responsiveClasses} ${positionClasses[position]}`}
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
