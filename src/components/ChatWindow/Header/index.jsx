import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import {
  ArrowCounterClockwise,
  CaretUp,
  Check,
  ClockCounterClockwise,
  Copy,
  DotsThreeOutlineVertical,
  Envelope,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { embedderSettings } from "@/main";
import useEmbedMode from "@/hooks/useEmbedMode";
import {
  HEADER_ICON_STYLE,
  HEADER_STYLE,
  headerButtonClass,
  LOGO_RADIUS,
} from "@/utils/theme";
import { panelTexts, uiTexts } from "@/utils/layout";

// Name und Untertitel immer ausgeschrieben, Standard wie eigener Text des
// Kunden: umbrechen statt kürzen (keine Ellipse, kein title-Ersatz nötig).
// overflowWrap "anywhere" trennt notfalls auch ein einzelnes überlanges
// Wort, damit nichts unter das Menü läuft (Nutzerentscheidung N3, Fixliste
// 7.22-rc13; ersetzt die Ellipse aus rc10 W1). wordBreak "break-word" ist
// der Rückfall für Safari vor 15.4, das "anywhere" verwirft (Fixliste
// 7.22-rc16 W44, wie in CourseCards); neuere Browser trennen damit gleich.
// Ausnahme kompakter Kopf (mobil bei offener Tastatur): nur der Name, kein
// Untertitel (Bestand seit 06.10.2026, bestätigt in Fixliste 7.22-rc16 E21).
export const HEADER_WRAP = {
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

// Titelblock (Logo, Name, Untertitel): Mindesthöhe einschließlich des
// senkrechten Innenabstands (allm-box-border; im Shadow Root gilt kein
// globales box-sizing, preflight ist aus). Mit kurzem Namen misst der Kopf
// so 76 px plus 1 px Unterlinie, kompakt 56 px plus 1 px; nur umbrochene
// Zeilen machen ihn höher (Fixliste 7.22-rc16 W40). Kompakt 6 px statt
// 8 px Innenabstand: der Logo-Rahmen (44 px) passt dann genau in 56 px.
export function headerTitleClass(compact = false) {
  return `allm-flex allm-items-center allm-box-border allm-pl-4 allm-pr-2 ${
    compact ? "allm-py-1.5 allm-min-h-[56px]" : "allm-py-2 allm-min-h-[76px]"
  } allm-flex-1 allm-min-w-0 allm-transition-all allm-duration-[var(--allmi-transition,200ms)] allm-ease-[var(--allmi-easing,cubic-bezier(0.4,0,0.2,1))]`;
}

// Menü unter ⋮: bei der üblichen Kopfhöhe (76 px, kompakt 56 px) wie bisher
// 64 px unter der Oberkante; wird der Kopf durch umbrochene Zeilen höher,
// wandert es mit dem mittig stehenden ⋮ nach unten (N3).
const OPTIONS_MENU_TOP = "max(64px, calc(50% + 26px))";

export default function ChatWindowHeader({
  sessionId,
  conversationId = null,
  newConversation = () => {},
  settings = {},
  iconUrl = null,
  closeChat,
  setChatHistory,
  compact = false,
  openHistory = null, // KIE-503: öffnet die "Frühere Chats"-Ansicht
  // Ref für ⋮ vom ChatWindow: überdauert das Neueinhängen des Kopfs nach dem
  // Laden, damit Escape in „Frühere Chats“ den Fokus auf den aktuellen ⋮
  // zurückgibt (Fixliste 7.22-rc16 W42); ohne Übergabe eine eigene Ref
  optionsButtonRef = null,
}) {
  const [showingOptions, setShowOptions] = useState(false);
  const menuRef = useRef();
  const ownButtonRef = useRef();
  const buttonRef = optionsButtonRef || ownButtonRef;

  const handleChatReset = () => {
    // Neue Konversation starten: alte bleibt serverseitig erhalten & im Backend
    // auffindbar. Der Server laedt den Kontext nach conversation_id -> frischer Chat.
    newConversation();
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

  // Kopfzeile über CSS-Variablen (--allm-header-bg/-text/-icon, Standard aus
  // headerBgColor/headerTextColor; Unterlinie --allmi-header-border), gemeinsam
  // mit "Frühere Chats" — siehe utils/theme.js.
  const iconButtonClass = headerButtonClass(settings);

  // Icon container style based on iconStyle setting
  const getIconContainerStyle = () => {
    const iconStyle = settings.iconStyle || "rounded";
    const hasHeaderBg = !!settings.headerBgColor;

    // Base style. border-box: ein Rand (Stile border, border-dark, glass)
    // zählt in die 44 px; im Shadow Root gilt sonst content-box, und der
    // Rahmen wäre 46 bzw. 48 px hoch (kompakter Kopf 58 bis 61 statt 57 px,
    // Fixliste 7.22-rc18 W64)
    const baseStyle = {
      width: "44px",
      height: "44px",
      boxSizing: "border-box",
    };

    // Pill style is wider
    const pillStyle = {
      width: "52px",
      height: "40px",
      boxSizing: "border-box",
    };

    if (iconStyle === "none" || !hasHeaderBg) {
      return { ...baseStyle, backgroundColor: "transparent" };
    }

    if (iconStyle === "circle") {
      return { ...baseStyle, borderRadius: "50%", backgroundColor: "#FFFFFF" };
    }

    // 1. White/Light Border (outline)
    if (iconStyle === "border") {
      return {
        ...baseStyle,
        borderRadius: "8px",
        backgroundColor: "transparent",
        border: "2px solid rgba(255, 255, 255, 0.6)",
      };
    }

    // Dark border variant
    if (iconStyle === "border-dark") {
      return {
        ...baseStyle,
        borderRadius: "8px",
        backgroundColor: "transparent",
        border: "2px solid rgba(0, 0, 0, 0.4)",
      };
    }

    // 2. Semi-transparent white background
    if (iconStyle === "soft") {
      return {
        ...baseStyle,
        borderRadius: "10px",
        backgroundColor: "rgba(255, 255, 255, 0.2)",
      };
    }

    // 3. Glassmorphism / Frosted glass
    if (iconStyle === "glass") {
      return {
        ...baseStyle,
        borderRadius: "10px",
        backgroundColor: "rgba(255, 255, 255, 0.15)",
        backdropFilter: "blur(4px)",
        border: "1px solid rgba(255, 255, 255, 0.2)",
      };
    }

    // 4. Adaptive - slightly lighter than header
    if (iconStyle === "adaptive") {
      return {
        ...baseStyle,
        borderRadius: "8px",
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
      };
    }

    // 5. Shadow / glow effect
    if (iconStyle === "shadow") {
      return {
        ...baseStyle,
        backgroundColor: "transparent",
        filter:
          "drop-shadow(0 0 6px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 3px rgba(255, 255, 255, 0.6))",
      };
    }

    // 6. Pill shape - wider than tall
    if (iconStyle === "pill") {
      return {
        ...pillStyle,
        borderRadius: "20px",
        backgroundColor: "#FFFFFF",
      };
    }

    // Default: rounded (white rounded square)
    return { ...baseStyle, borderRadius: "8px", backgroundColor: "#FFFFFF" };
  };

  return (
    <div
      style={HEADER_STYLE}
      className="allm-flex allm-items-center allm-relative allm-rounded-t-[var(--allmi-radius,16px)]"
      id="anything-llm-header"
    >
      {/* Titelteil (Logo, Name, Untertitel) und Buttongruppe (⋮, X) stehen
          beide im Fluss: der Titelteil darf schrumpfen (min-width 0), die
          Buttons nicht (Fixliste 7.22-rc10 W1). Name und Untertitel werden nie
          gekürzt: Bei Platzmangel brechen sie um und enden mindestens 8 px
          (pr-2) vor dem Menü, der Kopf wird dafür höher (Mindesthöhe 76 px,
          kompakt 56 px, jeweils mit Innenabstand; Nutzerentscheidung N3,
          Fixliste 7.22-rc13, W40 aus rc16). */}
      <div className={headerTitleClass(compact)}>
        <div
          className="allm-flex-shrink-0 allm-flex allm-items-center allm-justify-center"
          style={getIconContainerStyle()}
        >
          <img
            src={iconUrl ?? AnythingLLMIcon}
            // dekorativ: der Name steht als Text daneben bzw. darüber (Fixliste
            // 7.22-rc13 W04, vorher fest englisch „Brand“/„Anything LLM Icon“)
            alt=""
            style={{
              maxWidth: compact ? "28px" : "40px",
              maxHeight: compact ? "28px" : "40px",
              objectFit: "contain",
              borderRadius: LOGO_RADIUS,
              transition:
                "max-width var(--allmi-transition, 200ms), max-height var(--allmi-transition, 200ms)",
            }}
          />
        </div>
        {settings.assistantSubtitle ? (
          <BrandWithSubtitle settings={settings} compact={compact} />
        ) : (
          settings.brandText && (
            <span
              className="allm-ml-3 allm-font-semibold allm-text-sm allm-font-sans allm-min-w-0"
              style={{
                ...HEADER_WRAP,
                color: "var(--allmi-header-text, #1f2937)",
              }}
            >
              {settings.brandText}
            </span>
          )
        )}
      </div>
      <div className="allm-flex allm-flex-shrink-0 allm-gap-x-1 allm-items-center allm-pr-[22px]">
        {settings.loaded && (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setShowOptions(!showingOptions)}
            className={iconButtonClass}
            style={HEADER_ICON_STYLE}
            aria-label={uiTexts(settings).options}
          >
            <DotsThreeOutlineVertical size={20} weight="fill" />
          </button>
        )}
        <CloseButton
          onClick={closeChat}
          className={iconButtonClass}
          style={HEADER_ICON_STYLE}
        />
      </div>
      <OptionsMenu
        settings={settings}
        showing={showingOptions}
        resetChat={handleChatReset}
        sessionId={sessionId}
        conversationId={conversationId}
        menuRef={menuRef}
        openHistory={
          openHistory
            ? () => {
                setShowOptions(false);
                // ⋮ als Öffner: Fokus nach Escape in „Frühere Chats“. Die Ref,
                // nicht der Knoten: aufgelöst wird erst beim Schließen (W42)
                openHistory(buttonRef);
              }
            : null
        }
      />
    </div>
  );
}

// Kein Online-Punkt mehr (Design Center vereinfacht, 15.10.2026): er wirkte
// wie ein menschlicher Live-Chat; onlineDot aus Script/Konfiguration wird
// ignoriert (utils/layout.js FIXED_STANDARDS).

// Name mit Untertitel (assistantSubtitle, z. B. „durchsucht 1.243 Kurse“);
// ohne Untertitel steht nur der Name. Beide brechen bei Platzmangel um.
// Kompakt (mobil bei offener Tastatur) steht nur der Name (E21).
function BrandWithSubtitle({ settings, compact }) {
  return (
    <div
      className="allm-ml-3 allm-flex allm-flex-col allm-font-sans"
      style={{ minWidth: 0 }}
    >
      {settings.brandText && (
        <span
          className="allm-font-semibold allm-text-sm"
          style={{ ...HEADER_WRAP, color: "var(--allmi-header-text, #1f2937)" }}
        >
          {settings.brandText}
        </span>
      )}
      {!compact && (
        <span
          id="anything-llm-header-subtitle"
          style={{
            ...HEADER_WRAP,
            fontSize: "11.5px",
            lineHeight: 1.35,
            color: "var(--allmi-text-muted, #6b7280)",
          }}
        >
          {settings.assistantSubtitle}
        </span>
      )}
    </div>
  );
}

// Schließen (X) bzw. in der Inline-Box "Einklappen" (Chevron nach oben).
// Variante kommt aus dem Darstellungs-Kontext (Blase/Overlay: X).
export function CloseButton({ onClick, className, color, style }) {
  const { inline, overlay } = useEmbedMode();
  const collapse = inline && !overlay;
  const Icon = collapse ? CaretUp : X;
  const ui = uiTexts(embedderSettings.settings);
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={style}
      aria-label={collapse ? ui.collapse : ui.close}
      title={collapse ? ui.collapse : undefined}
    >
      <Icon size={20} weight="bold" color={color} />
    </button>
  );
}

function OptionsMenu({
  settings,
  showing,
  resetChat,
  sessionId,
  conversationId,
  menuRef,
  openHistory = null,
}) {
  if (!showing) return null;
  return (
    <div
      ref={menuRef}
      className="allm-bg-[color:var(--allmi-surface,#fff)] allm-absolute allm-z-10 allm-flex allm-flex-col allm-gap-y-1 allm-rounded-xl allm-shadow-lg allm-right-[46px]"
      style={{ top: OPTIONS_MENU_TOP }}
    >
      {/* Reset bleibt oben (häufigste Aktion, gewohnte Position), "Frühere
          Chats" (KIE-503) direkt darunter. */}
      <button
        onClick={resetChat}
        className="hover:allm-cursor-pointer allm-bg-[color:var(--allmi-surface,#fff)] allm-gap-x-[12px] hover:allm-bg-[color:var(--allmi-hover-bg,#f3f4f6)] allm-rounded-lg allm-border-none allm-flex allm-items-center allm-text-base allm-text-[color:var(--allmi-text-muted,#7A7D7E)] allm-font-bold allm-px-4"
      >
        <ArrowCounterClockwise size={24} />
        <p className="allm-text-[14px] allm-font-sans">
          {settings.resetBurgerText || uiTexts(settings).menuReset}
        </p>
      </button>
      {openHistory && (
        <button
          onClick={openHistory}
          className="hover:allm-cursor-pointer allm-bg-[color:var(--allmi-surface,#fff)] allm-gap-x-[12px] hover:allm-bg-[color:var(--allmi-hover-bg,#f3f4f6)] allm-rounded-lg allm-border-none allm-flex allm-items-center allm-text-base allm-text-[color:var(--allmi-text-muted,#7A7D7E)] allm-font-bold allm-px-4"
        >
          <ClockCounterClockwise size={24} />
          <p className="allm-text-[14px] allm-font-sans">
            {settings.historyBurgerText || uiTexts(settings).menuHistory}
          </p>
        </button>
      )}
      <ContactSupport
        email={settings.supportEmail}
        settings={settings}
        sessionId={sessionId}
        conversationId={conversationId}
      />
      <SessionID
        sessionId={sessionId}
        conversationId={conversationId}
        settings={settings}
      />
    </div>
  );
}

function SessionID({ sessionId, conversationId, settings }) {
  if (!sessionId && !conversationId) return null;

  const [sessionIdCopied, setSessionIdCopied] = useState(false);

  const copySessionId = () => {
    const idToCopy = conversationId || sessionId;
    navigator.clipboard.writeText(idToCopy);
    setSessionIdCopied(true);
    setTimeout(() => setSessionIdCopied(false), 1000);
  };

  if (sessionIdCopied) {
    return (
      <div className="hover:allm-cursor-pointer allm-bg-[color:var(--allmi-surface,#fff)] allm-gap-x-[12px] hover:allm-bg-[color:var(--allmi-hover-bg,#f3f4f6)] allm-rounded-lg allm-border-none allm-flex allm-items-center allm-text-base allm-text-[color:var(--allmi-text-muted,#7A7D7E)] allm-font-bold allm-px-4">
        <Check size={24} />
        <p className="allm-text-[14px] allm-font-sans">
          {panelTexts(settings).copied}
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={copySessionId}
      className="hover:allm-cursor-pointer allm-bg-[color:var(--allmi-surface,#fff)] allm-gap-x-[12px] hover:allm-bg-[color:var(--allmi-hover-bg,#f3f4f6)] allm-rounded-lg allm-border-none allm-flex allm-items-center allm-text-base allm-text-[color:var(--allmi-text-muted,#7A7D7E)] allm-font-bold allm-px-4"
    >
      <Copy size={24} />
      <p className="allm-text-[14px] allm-font-sans">
        {settings.sessionBurgerText || uiTexts(settings).menuChatId}
      </p>
    </button>
  );
}

function ContactSupport({ email = null, settings, sessionId, conversationId }) {
  if (!email) return null;

  const subject = uiTexts(settings).mailSubject(
    settings.brandText,
    window.location.hostname,
  );
  const body = `\n\n---\nChat-ID: ${conversationId || sessionId || "-"}`;
  return (
    <a
      href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
      className="allm-no-underline hover:allm-underline hover:allm-cursor-pointer allm-bg-[color:var(--allmi-surface,#fff)] allm-gap-x-[12px] hover:allm-bg-[color:var(--allmi-hover-bg,#f3f4f6)] allm-rounded-lg allm-border-none allm-flex allm-items-center allm-text-base allm-text-[color:var(--allmi-text-muted,#7A7D7E)] allm-font-bold allm-px-4"
    >
      <Envelope size={24} />
      <p className="allm-text-[14px] allm-font-sans">
        {settings.emailBurgerText || uiTexts(settings).menuEmail}
      </p>
    </a>
  );
}
