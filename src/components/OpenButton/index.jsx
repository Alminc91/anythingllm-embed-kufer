import {
  Plus,
  ChatCircleDots,
  Headset,
  Binoculars,
  MagnifyingGlass,
  MagicWand,
} from "@phosphor-icons/react";
import useBubbleDismissal from "@/hooks/useBubbleDismissal";

const CHAT_ICONS = {
  plus: Plus,
  chatBubble: ChatCircleDots,
  support: Headset,
  search2: Binoculars,
  search: MagnifyingGlass,
  magic: MagicWand,
};

// Icon zum chatIcon-Setting (auch für die Inline-Leiste). Unbekannt -> fallback.
export function resolveChatIcon(name, fallback = Plus) {
  return CHAT_ICONS.hasOwnProperty(name) ? CHAT_ICONS[name] : fallback;
}

export default function OpenButton({ settings, isOpen, toggleOpen }) {
  // Default welcome messages - can be customized via settings
  const defaultBubbleMessages = [
    "Hallo! Ich bin Kuno, Ihr Online-Berater!",
    "Möchten Sie mehr über unser Angebot erfahren? Ich helfe gerne weiter!",
  ];

  const welcomeMessages =
    settings?.chatbotBubblesMessages?.length > 0
      ? settings.chatbotBubblesMessages
      : defaultBubbleMessages;
  const { bubblesVisible, dismissBubbles, dismissBubblesOnChatOpen } =
    useBubbleDismissal(settings);

  // Auto-detect bubble direction based on button position to prevent overflow
  const position = settings?.position || "bottom-right";
  const isButtonOnLeft = position.includes("left");

  // If button is on left side: bubbles appear RIGHT of button (point left toward button)
  // If button is on right side: bubbles appear LEFT of button (point right toward button)
  const isRightDirection = isButtonOnLeft;
  const bubbleContainerClasses = isRightDirection
    ? "allm-absolute allm-bottom-full allm-mb-3 allm-left-4 allm-flex allm-flex-col allm-gap-3 allm-group allm-cursor-pointer"
    : "allm-absolute allm-bottom-full allm-mb-3 allm-right-4 allm-flex allm-flex-col allm-gap-3 allm-group allm-cursor-pointer";
  const closeButtonPosition = isRightDirection
    ? { left: "-12px" }
    : { right: "-12px" };
  const tailClasses = isRightDirection
    ? "allm-absolute allm-top-full allm-left-5 allm-w-0 allm-h-0 allm-border-l-[10px] allm-border-r-[10px] allm-border-t-[10px] allm-border-l-transparent allm-border-r-transparent allm-border-t-[color:var(--allmi-surface,#fff)] allm-filter allm-drop-shadow-sm"
    : "allm-absolute allm-top-full allm-right-5 allm-w-0 allm-h-0 allm-border-l-[10px] allm-border-r-[10px] allm-border-t-[10px] allm-border-l-transparent allm-border-r-transparent allm-border-t-[color:var(--allmi-surface,#fff)] allm-filter allm-drop-shadow-sm";
  const animationName = isRightDirection ? "slideInLeft" : "slideInRight";

  if (isOpen) return null;

  const ChatIcon = resolveChatIcon(settings?.chatIcon);

  return (
    <div className="allm-relative">
      {/* Welcome message bubbles */}
      {settings.displayChatbotBubbles && bubblesVisible && (
        <div
          className={bubbleContainerClasses}
          onClick={() => {
            dismissBubblesOnChatOpen();
            toggleOpen();
          }}
        >
          {/* Single X button for entire group */}
          <button
            className="allm-absolute allm-top-0 allm-z-10 allm-text-[color:var(--allmi-text-muted,#9ca3af)] hover:allm-text-[color:var(--allmi-text,#4b5563)] allm-rounded-full allm-p-2 allm-w-7 allm-h-7 allm-flex allm-items-center allm-justify-center allm-text-sm allm-transition-all allm-duration-[var(--allmi-transition,200ms)] allm-ease-[var(--allmi-easing,cubic-bezier(0.4,0,0.2,1))] allm-opacity-0 group-hover:allm-opacity-100 hover:allm-bg-[color:var(--allmi-hover-bg,#f3f4f6)] allm-bg-[color:var(--allmi-surface,#fff)] allm-shadow-sm allm-border"
            style={closeButtonPosition}
            onClick={(e) => {
              e.stopPropagation();
              dismissBubbles();
            }}
            aria-label="Close all chat bubbles"
          >
            ×
          </button>

          {welcomeMessages.map((msg, i) => (
            <div
              key={i}
              className={`allm-font-sans allm-relative allm-bg-[color:var(--allmi-surface,#fff)] allm-text-[color:var(--allmi-text,#2d3748)] allm-rounded-2xl allm-shadow-lg allm-px-4 allm-transition-all allm-duration-[calc(var(--allmi-transition,200ms)*1.5)] allm-ease-[var(--allmi-easing,cubic-bezier(0.4,0,0.2,1))] group-hover:allm-shadow-xl allm-border allm-border-[color:var(--allmi-border,#e5e7eb)] group-hover:allm-scale-[1.02] ${i === 0 ? "allm-py-3 allm-max-w-[350px] sm:allm-max-w-[400px] allm-min-w-[250px]" : "allm-py-2 allm-max-w-[380px] sm:allm-max-w-[430px] allm-min-w-[280px]"}`}
              style={{
                // Dauer = 2 x --allm-transition (bisher 0.4s); reduzierte
                // Bewegung -> 0 (Endzustand sofort)
                animation: `calc(var(--allmi-transition, 200ms) * 2) ease-out ${i * 0.1}s 1 normal forwards running ${animationName}`,
              }}
            >
              <div className="allm-leading-snug allm-text-sm sm:allm-text-base allm-font-sans">
                {msg}
              </div>
              {/* Speech bubble tail on last bubble */}
              {i === welcomeMessages.length - 1 && (
                <div className={tailClasses}></div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Chat button */}
      <button
        style={{
          backgroundColor: `var(--allmi-accent, ${settings.buttonColor})`,
          ...(settings.buttonOutline === "white" && {
            border: "2px solid rgba(255, 255, 255, 0.8)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }),
          ...(settings.buttonOutline === "black" && {
            border: "2px solid rgba(0, 0, 0, 0.4)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }),
        }}
        id="anything-llm-embed-chat-button"
        onClick={() => {
          dismissBubblesOnChatOpen();
          toggleOpen();
        }}
        className={`hover:allm-cursor-pointer allm-border-none allm-flex allm-items-center allm-justify-center allm-p-4 allm-rounded-full allm-text-white allm-text-2xl hover:allm-opacity-95 allm-transition-all allm-duration-[var(--allmi-transition,200ms)] allm-ease-[var(--allmi-easing,cubic-bezier(0.4,0,0.2,1))] hover:allm-scale-105`}
        aria-label="Toggle Menu"
      >
        <ChatIcon weight="fill" className="text-white" />
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
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
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
