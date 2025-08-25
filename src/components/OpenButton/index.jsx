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
  const defaultBubbleMessages = [
    "Hallo! Ich bin Kuno, Ihr Online-Berater!",
    "Möchten Sie mehr über unser Angebot erfahren? Ich helfe gerne weiter!"
  ];
  
  const welcomeMessages = settings?.chatbotBubblesMessages?.length > 0 
    ? settings.chatbotBubblesMessages 
    : defaultBubbleMessages;
  const [bubblesVisible, setBubblesVisible] = useState(true);
  
  if (isOpen) return null;
  
  const ChatIcon = CHAT_ICONS.hasOwnProperty(settings?.chatIcon)
    ? CHAT_ICONS[settings.chatIcon]
    : CHAT_ICONS.plus;
  
  return (
    <div className="allm-relative">
      {/* Welcome message bubbles */}
      {settings.displayChatbotBubbles && bubblesVisible && (
        <div 
          className="allm-absolute allm-bottom-full allm-mb-3 allm-right-4 allm-flex allm-flex-col allm-gap-3 allm-group allm-cursor-pointer"
          onClick={toggleOpen}
        >
          {/* Single X button for entire group */}
          <button
            className="allm-absolute allm-top-0 allm-z-10 allm-text-gray-400 hover:allm-text-gray-600 allm-rounded-full allm-p-2 allm-w-7 allm-h-7 allm-flex allm-items-center allm-justify-center allm-text-sm allm-transition-all allm-duration-200 allm-opacity-0 group-hover:allm-opacity-100 hover:allm-bg-gray-100 allm-bg-white allm-shadow-sm allm-border"
            style={{ right: '-12px' }}
            onClick={(e) => {
              e.stopPropagation();
              setBubblesVisible(false);
            }}
            aria-label="Close all chat bubbles"
          >
            ×
          </button>
          
          {/* First bubble */}
          <div 
            className="allm-font-sans allm-relative allm-bg-white allm-text-[#2d3748] allm-rounded-2xl allm-shadow-lg allm-px-4 allm-transition-all allm-duration-300 group-hover:allm-shadow-xl allm-border allm-border-gray-200 group-hover:allm-scale-[1.02] allm-py-3 allm-max-w-[350px] sm:allm-max-w-[400px] allm-min-w-[250px]"
            style={{ animation: '0.4s ease-out 0s 1 normal forwards running slideInRight' }}
          >
            <div className="allm-leading-snug allm-text-sm sm:allm-text-base allm-font-sans">
              {welcomeMessages[0]}
            </div>
          </div>
          
          {/* Second bubble with tail */}
          <div 
            className="allm-font-sans allm-relative allm-bg-white allm-text-[#2d3748] allm-rounded-2xl allm-shadow-lg allm-px-4 allm-transition-all allm-duration-300 group-hover:allm-shadow-xl allm-border allm-border-gray-200 group-hover:allm-scale-[1.02] allm-py-2 allm-max-w-[380px] sm:allm-max-w-[430px] allm-min-w-[280px]"
            style={{ animation: '0.4s ease-out 0s 1 normal forwards running slideInRight' }}
          >
            <div className="allm-leading-snug allm-text-sm sm:allm-text-base allm-font-sans">
              {welcomeMessages[1]}
            </div>
            {/* Speech bubble tail */}
            <div className="allm-absolute allm-top-full allm-right-5 allm-w-0 allm-h-0 allm-border-l-[10px] allm-border-r-[10px] allm-border-t-[10px] allm-border-l-transparent allm-border-r-transparent allm-border-t-white allm-filter allm-drop-shadow-sm"></div>
          </div>
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
