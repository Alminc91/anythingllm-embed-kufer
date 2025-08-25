import {
  Plus,
  ChatCircleDots,
  Headset,
  Binoculars,
  MagnifyingGlass,
  MagicWand,
} from "@phosphor-icons/react";
import { useState } from "react";

const CHAT_ICONS = {
  plus: Plus,
  chatBubble: ChatCircleDots,
  support: Headset,
  search2: Binoculars,
  search: MagnifyingGlass,
  magic: MagicWand,
};

export default function OpenButton({ settings, isOpen, toggleOpen }) {
  // Default welcome messages - can be customized via settings
  const defaultMessages = [
    "Hi! Ich bin heiße Kuno, ich bin dein Kursberater!",
    "Frage mich gerne, was immer du möchtest! Ich berate dich gerne!"
  ];
  
  const welcomeMessages = settings?.welcomeMessages || defaultMessages;
  const [visibleBubbles, setVisibleBubbles] = useState(
    welcomeMessages.map((_, index) => ({ id: index, visible: true }))
  );
  
  if (isOpen) return null;
  
  const ChatIcon = CHAT_ICONS.hasOwnProperty(settings?.chatIcon)
    ? CHAT_ICONS[settings.chatIcon]
    : CHAT_ICONS.plus;
    
  const closeBubble = (bubbleId, e) => {
    e.stopPropagation();
    setVisibleBubbles(prev => 
      prev.map(bubble => 
        bubble.id === bubbleId ? { ...bubble, visible: false } : bubble
      )
    );
  };
  
  const visibleBubblesList = visibleBubbles.filter(bubble => bubble.visible);
  
  return (
    <div className="allm-relative">
      {/* Welcome message bubbles */}
      {visibleBubblesList.length > 0 && (
        <div className="allm-absolute allm-bottom-full allm-mb-2 allm-right-0 allm-flex allm-flex-col allm-gap-2">
          {visibleBubblesList.map((bubble, index) => {
            const messageIndex = bubble.id;
            const message = welcomeMessages[messageIndex];
            const isLast = index === visibleBubblesList.length - 1;
            
            return (
              <div
                key={bubble.id}
                className="allm-group allm-relative allm-bg-white allm-text-[#222628] allm-rounded-lg allm-shadow-lg allm-p-3 allm-max-w-xs allm-text-sm allm-cursor-pointer allm-transition-all allm-duration-200 hover:allm-shadow-xl allm-border allm-border-gray-100"
                onClick={toggleOpen}
                style={{
                  animationDelay: `${index * 1000}ms`,
                  animation: 'slideInRight 0.3s ease-out forwards'
                }}
              >
                {/* Message content */}
                <div className="allm-pr-6">
                  <span className="allm-leading-relaxed">{message}</span>
                </div>
                
                {/* Close button - only visible on hover */}
                <button
                  className="allm-absolute allm-top-2 allm-right-2 allm-text-gray-400 hover:allm-text-gray-600 allm-rounded-full allm-p-1 allm-w-6 allm-h-6 allm-flex allm-items-center allm-justify-center allm-text-xs allm-transition-all allm-duration-200 allm-opacity-0 group-hover:allm-opacity-100 hover:allm-bg-gray-100"
                  onClick={(e) => closeBubble(bubble.id, e)}
                  aria-label="Close chat bubble"
                >
                  ×
                </button>
                
                {/* Speech bubble tail */}
                {isLast && (
                  <div className="allm-absolute allm-top-full allm-right-4 allm-w-0 allm-h-0 allm-border-l-8 allm-border-r-8 allm-border-t-8 allm-border-l-transparent allm-border-r-transparent allm-border-t-white allm-filter allm-drop-shadow-sm"></div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Chat button */}
      <button
        style={{ backgroundColor: settings.buttonColor }}
        id="anything-llm-embed-chat-button"
        onClick={toggleOpen}
        className={`hover:allm-cursor-pointer allm-border-none allm-flex allm-items-center allm-justify-center allm-p-4 allm-rounded-full allm-text-white allm-text-2xl hover:allm-opacity-95 allm-transition-all allm-duration-200 hover:allm-scale-105`}
        aria-label="Toggle Menu"
      >
        <ChatIcon className="text-white" />
      </button>
      
      {/* Custom styles for animations */}
      <style jsx>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
