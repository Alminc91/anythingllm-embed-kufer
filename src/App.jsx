import useGetScriptAttributes from "@/hooks/useScriptAttributes";
import useSessionId from "@/hooks/useSessionId";
import useOpenChat from "@/hooks/useOpen";
import OpenButton from "@/components/OpenButton";
import ChatWindow from "./components/ChatWindow";
import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18next from "@/i18n";
import ChatService from "@/models/chatService";

export default function App() {
  const { isChatOpen, toggleOpenChat } = useOpenChat();
  const embedSettings = useGetScriptAttributes();
  const sessionId = useSessionId();
  const [isEnabled, setIsEnabled] = useState(null); // null = loading, true = enabled, false = disabled

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

  // Don't render until we know the embed status
  if (!embedSettings.loaded || isEnabled === null) return null;

  // If embed is disabled, don't render anything (hide completely)
  if (isEnabled === false) return null;

  const position = embedSettings.position || "bottom-right";

  // Position classes for tablet/desktop (md: and above)
  const positionClasses = {
    "bottom-left": "md:allm-bottom-0 md:allm-left-0 md:allm-ml-4",
    "bottom-right": "md:allm-bottom-0 md:allm-right-0 md:allm-mr-4",
    "top-left": "md:allm-top-0 md:allm-left-0 md:allm-ml-4 md:allm-mt-4",
    "top-right": "md:allm-top-0 md:allm-right-0 md:allm-mr-4 md:allm-mt-4",
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
          className={`allm-bg-white allm-fixed allm-border allm-border-gray-300 allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)] allm-flex allm-flex-col allm-overflow-hidden ${responsiveClasses} ${positionClasses[position]}`}
          id="anything-llm-chat"
        >
          {isChatOpen && (
            <ChatWindow
              closeChat={() => toggleOpenChat(false)}
              settings={embedSettings}
              sessionId={sessionId}
            />
          )}
        </div>
      </div>
      {!isChatOpen && (
        <div
          id="anything-llm-embed-chat-button-container"
          className={`allm-fixed allm-bottom-0 ${positionClasses[position]} allm-mb-4 allm-z-[9999]`}
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
