import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import ChatService from "@/models/chatService";
import {
  ArrowCounterClockwise,
  Check,
  Copy,
  DotsThreeOutlineVertical,
  Envelope,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { embedderSettings } from "@/main";

export default function ChatWindowHeader({
  sessionId,
  settings = {},
  iconUrl = null,
  closeChat,
  setChatHistory,
}) {
  const [showingOptions, setShowOptions] = useState(false);
  const menuRef = useRef();
  const buttonRef = useRef();

  const handleChatReset = async () => {
    await ChatService.resetEmbedChatSession(settings, sessionId);
    setChatHistory([]);
    setShowOptions(false);
  };
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowOptions(false);
      }
    }
    // Use Shadow Root for event listeners (works with closed Shadow DOM)
    const eventTarget = embedderSettings.shadowRoot || document;
    eventTarget.addEventListener("mousedown", handleClickOutside);
    return () => {
      eventTarget.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  // Header styling with optional custom colors
  const headerStyle = {
    borderBottom: settings.headerBgColor ? "none" : "1px solid #E9E9E9",
    backgroundColor: settings.headerBgColor || "transparent",
  };

  // Icon button styling - adapt to header background
  const iconButtonClass = settings.headerBgColor
    ? "allm-bg-transparent hover:allm-cursor-pointer allm-border-none hover:allm-bg-white/20 allm-rounded-sm"
    : "allm-bg-transparent hover:allm-cursor-pointer allm-border-none hover:allm-bg-gray-100 allm-rounded-sm allm-text-slate-800/60";

  // Icon color based on header background
  const iconColor = settings.headerTextColor || (settings.headerBgColor ? "#FFFFFF" : undefined);

  // Icon container style based on iconStyle setting
  const getIconContainerStyle = () => {
    const iconStyle = settings.iconStyle || "rounded";
    const hasHeaderBg = !!settings.headerBgColor;

    // Base style
    const baseStyle = {
      width: "44px",
      height: "44px",
    };

    if (iconStyle === "none" || !hasHeaderBg) {
      return { ...baseStyle, backgroundColor: "transparent" };
    }

    if (iconStyle === "circle") {
      return { ...baseStyle, borderRadius: "50%", backgroundColor: "#FFFFFF" };
    }

    // Default: rounded
    return { ...baseStyle, borderRadius: "8px", backgroundColor: "#FFFFFF" };
  };

  return (
    <div
      style={headerStyle}
      className="allm-flex allm-items-center allm-relative allm-rounded-t-2xl"
      id="anything-llm-header"
    >
      <div className="allm-flex allm-items-center allm-px-4 allm-h-[76px] allm-flex-1">
        <div
          className="allm-flex-shrink-0 allm-flex allm-items-center allm-justify-center"
          style={getIconContainerStyle()}
        >
          <img
            src={iconUrl ?? AnythingLLMIcon}
            alt={iconUrl ? "Brand" : "AnythingLLM Logo"}
            style={{ maxWidth: "40px", maxHeight: "40px" }}
          />
        </div>
        {settings.brandText && (
          <span
            className="allm-ml-3 allm-font-semibold allm-text-sm allm-truncate allm-font-sans"
            style={{ color: settings.headerTextColor || "#1f2937" }}
          >
            {settings.brandText}
          </span>
        )}
      </div>
      <div className="allm-absolute allm-right-0 allm-flex allm-gap-x-1 allm-items-center allm-px-[22px]">
        {settings.loaded && (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setShowOptions(!showingOptions)}
            className={iconButtonClass}
            aria-label="Options"
          >
            <DotsThreeOutlineVertical size={20} weight="fill" color={iconColor} />
          </button>
        )}
        <button
          type="button"
          onClick={closeChat}
          className={iconButtonClass}
          aria-label="Close"
        >
          <X size={20} weight="bold" color={iconColor} />
        </button>
      </div>
      <OptionsMenu
        settings={settings}
        showing={showingOptions}
        resetChat={handleChatReset}
        sessionId={sessionId}
        menuRef={menuRef}
      />
    </div>
  );
}

function OptionsMenu({ settings, showing, resetChat, sessionId, menuRef }) {
  if (!showing) return null;
  return (
    <div
      ref={menuRef}
      className="allm-bg-white allm-absolute allm-z-10 allm-flex allm-flex-col allm-gap-y-1 allm-rounded-xl allm-shadow-lg allm-top-[64px] allm-right-[46px]"
    >
      <button
        onClick={resetChat}
        className="hover:allm-cursor-pointer allm-bg-white allm-gap-x-[12px] hover:allm-bg-gray-100 allm-rounded-lg allm-border-none allm-flex allm-items-center allm-text-base allm-text-[#7A7D7E] allm-font-bold allm-px-4"
      >
        <ArrowCounterClockwise size={24} />
        <p className="allm-text-[14px] allm-font-sans">
          {settings.resetBurgerText || "Reset Chat"}
        </p>
      </button>
      <ContactSupport email={settings.supportEmail} settings={settings} />
      <SessionID sessionId={sessionId} settings={settings} />
    </div>
  );
}

function SessionID({ sessionId, settings }) {
  if (!sessionId) return null;

  const [sessionIdCopied, setSessionIdCopied] = useState(false);

  const copySessionId = () => {
    navigator.clipboard.writeText(sessionId);
    setSessionIdCopied(true);
    setTimeout(() => setSessionIdCopied(false), 1000);
  };

  if (sessionIdCopied) {
    return (
      <div className="hover:allm-cursor-pointer allm-bg-white allm-gap-x-[12px] hover:allm-bg-gray-100 allm-rounded-lg allm-border-none allm-flex allm-items-center allm-text-base allm-text-[#7A7D7E] allm-font-bold allm-px-4">
        <Check size={24} />
        <p className="allm-text-[14px] allm-font-sans">Copied!</p>
      </div>
    );
  }

  return (
    <button
      onClick={copySessionId}
      className="hover:allm-cursor-pointer allm-bg-white allm-gap-x-[12px] hover:allm-bg-gray-100 allm-rounded-lg allm-border-none allm-flex allm-items-center allm-text-base allm-text-[#7A7D7E] allm-font-bold allm-px-4"
    >
      <Copy size={24} />
      <p className="allm-text-[14px] allm-font-sans">
        {settings.sessionBurgerText || "Session ID"}
      </p>
    </button>
  );
}

function ContactSupport({ email = null, settings }) {
  if (!email) return null;

  const subject = `Inquiry from ${window.location.origin}`;
  return (
    <a
      href={`mailto:${email}?Subject=${encodeURIComponent(subject)}`}
      className="allm-no-underline hover:allm-underline hover:allm-cursor-pointer allm-bg-white allm-gap-x-[12px] hover:allm-bg-gray-100 allm-rounded-lg allm-border-none allm-flex allm-items-center allm-text-base allm-text-[#7A7D7E] allm-font-bold allm-px-4"
    >
      <Envelope size={24} />
      <p className="allm-text-[14px] allm-font-sans">
        {settings.emailBurgerText || "Email Support"}
      </p>
    </a>
  );
}
