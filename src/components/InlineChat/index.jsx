import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CaretDown, ChatCircleDots } from "@phosphor-icons/react";
import ChatWindow from "@/components/ChatWindow";
import { CHAT_ICONS } from "@/components/OpenButton";
import { EmbedModeContext } from "@/hooks/useEmbedMode";
import useMobileKeyboard from "@/hooks/useMobileKeyboard";
import { embedderSettings } from "@/main";
import {
  DEFAULT_INLINE_COLLAPSED_TEXT,
  inlineBoxStyle,
  inlineMaxWidth,
} from "@/utils/layout";

// Kufer Inline-Modus: Chat mitten in der Webseite (im Platzhalter
// <div id="kufer-assistent">) statt als Blase.
//   eingeklappt  -> breite Leiste im Seitenfluss ("Jetzt mit unserem KI-Assistenten schreiben")
//   aufgeklappt  -> Box mit FESTER Höhe (inlineHeight), darin das normale ChatWindow
//   mobil (<768) -> Tippen auf Leiste/Eingabefeld öffnet das Vollbild-Overlay der
//                   Blase-Mobilansicht; dafür wird der Shadow-Host kurz an <body>
//                   gehängt (robust gegen transform/z-index/overflow der Webseite)
//                   und im Platzhalter ein Abstandhalter gleicher Höhe gelassen,
//                   damit die Seite darunter nicht springt.
// Es wird bewusst NICHT an Viewport-Breakpoints (md:/xl:) ausgerichtet, sondern an
// der Container-Breite (ResizeObserver).

const NARROW_CONTAINER_PX = 480;

// Geerbte Text-Eigenschaften der Webseite neutralisieren: der Host sitzt jetzt
// mitten im Inhalt (text-align:center, line-height:2, Großbuchstaben o. ä. würden
// sonst in den Shadow DOM durchschlagen). font-family bleibt je nach inheritFont.
const TEXT_RESET = {
  textAlign: "left",
  lineHeight: "normal",
  letterSpacing: "normal",
  wordSpacing: "normal",
  textTransform: "none",
  textIndent: 0,
  fontStyle: "normal",
  fontWeight: 400,
  whiteSpace: "normal",
  fontSize: "16px",
  color: "#222628",
  boxSizing: "border-box",
  marginLeft: "auto",
  marginRight: "auto",
};

const BAR_THEMES = {
  light: {
    backgroundColor: "#FFFFFF",
    color: "#1f2937",
    border: "1px solid #d1d5db",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06)",
  },
  dark: {
    backgroundColor: "rgba(17, 24, 39, 0.78)",
    color: "#FFFFFF",
    border: "1px solid rgba(255, 255, 255, 0.16)",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
};

function scrollChatToBottom() {
  // Nach dem Umhängen des Hosts: Chat-Verlauf wieder ans Ende (nur der
  // Container, nie die Seite).
  requestAnimationFrame(() => {
    const el = embedderSettings.shadowRoot?.getElementById("chat-history");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

export default function InlineChat({
  settings,
  mountTarget,
  sessionId,
  conversationId,
  newConversation,
  switchConversation,
  justCreatedRef,
}) {
  const host = embedderSettings.hostElement;
  const [expanded, setExpanded] = useState(
    settings.inlineStartState === "expanded",
  );
  const [overlay, setOverlay] = useState(false); // mobiles Vollbild
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [containerWidth, setContainerWidth] = useState(null);
  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const chatWindowRef = useRef(null);
  const spacerHeightRef = useRef(0);
  const focusRequestRef = useRef(false);
  const scrollOnExpandRef = useRef(false);

  const isMobileViewport = viewportWidth < 768;
  const narrow =
    containerWidth !== null && containerWidth < NARROW_CONTAINER_PX;
  const isKeyboardOpen = useMobileKeyboard(chatWindowRef, overlay);

  // Host im Platzhalter halten; für das mobile Overlay an <body> hängen.
  // useLayoutEffect: umhängen vor dem Paint, kein Aufblitzen an falscher Stelle.
  useLayoutEffect(() => {
    if (!host || !mountTarget) return;
    if (!overlay) {
      if (host.parentNode !== mountTarget) mountTarget.appendChild(host);
      return;
    }
    const spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.height = `${Math.round(spacerHeightRef.current)}px`;
    if (host.parentNode === mountTarget) mountTarget.insertBefore(spacer, host);
    else mountTarget.appendChild(spacer);
    document.body.appendChild(host);
    scrollChatToBottom();
    return () => {
      // Overlay zu: Host exakt an die Stelle des Abstandhalters zurück.
      if (spacer.parentNode) spacer.parentNode.replaceChild(host, spacer);
      else mountTarget.appendChild(host);
      scrollChatToBottom();
    };
  }, [overlay, mountTarget]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Drehen/Vergrößern auf >=768px bei offenem Overlay -> zurück in die Seite,
  // aufgeklappt (Chat bleibt gemountet, laufende Antwort läuft weiter).
  useEffect(() => {
    if (overlay && !isMobileViewport) {
      setExpanded(true);
      setOverlay(false);
    }
  }, [overlay, isMobileViewport]);

  // Container-Breite statt Viewport-Breite (schmale Spalten, Sidebars).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Beim Aufklappen per Klick genau EINMAL scrollen — und nur, wenn die Box
  // nicht vollständig sichtbar ist (block: "nearest"). Startzustand "expanded"
  // scrollt nie (scrollOnExpandRef nur beim Klick gesetzt).
  useEffect(() => {
    if (!expanded || !scrollOnExpandRef.current) return;
    scrollOnExpandRef.current = false;
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < 0 || rect.bottom > vh)
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [expanded]);

  const openOverlay = (focusInput = false) => {
    spacerHeightRef.current = host?.getBoundingClientRect?.().height || 0;
    // flushSync: Overlay + Host-Umhängen synchron, damit der Fokus unten noch
    // in derselben Nutzer-Geste liegt (iOS öffnet die Tastatur nur dann).
    flushSync(() => setOverlay(true));
    if (focusInput) {
      embedderSettings.shadowRoot
        ?.getElementById("message-input")
        ?.focus({ preventScroll: true });
    }
  };

  const onBarClick = () => {
    if (isMobileViewport) return openOverlay(false);
    scrollOnExpandRef.current = true;
    focusRequestRef.current = true; // Desktop: Eingabefeld nach Klick fokussieren
    setExpanded(true);
  };

  const inBox = !overlay;
  const embedMode = useMemo(
    () => ({
      inline: true,
      overlay,
      requestFullscreen:
        expanded && inBox && isMobileViewport ? () => openOverlay(true) : null,
      consumeFocusRequest: () => {
        const wanted = focusRequestRef.current;
        focusRequestRef.current = false;
        return wanted;
      },
    }),
    [overlay, expanded, isMobileViewport],
  );

  const showBar = !expanded && !overlay;
  const showChat = expanded || overlay;
  const inheritFont = settings.inheritFont === true;

  return (
    <EmbedModeContext.Provider value={embedMode}>
      <div
        ref={rootRef}
        id="anything-llm-embed-inline"
        className={`allm-relative allm-w-full allm-font-sans ${inheritFont ? "allm-inherit-font" : ""}`}
        style={{ ...TEXT_RESET, maxWidth: inlineMaxWidth(settings) }}
      >
        {showBar && (
          <InlineBar settings={settings} narrow={narrow} onOpen={onBarClick} />
        )}
        {showChat && (
          <div
            ref={boxRef}
            className={inBox ? "allm-relative allm-w-full" : ""}
            style={
              inBox ? inlineBoxStyle(settings, isMobileViewport) : undefined
            }
          >
            <div
              ref={chatWindowRef}
              id="anything-llm-chat"
              className={
                inBox
                  ? "allm-relative allm-w-full allm-h-full allm-bg-white allm-border allm-border-solid allm-border-gray-300 allm-rounded-2xl allm-overflow-hidden allm-flex allm-flex-col allm-box-border allm-shadow-[0_4px_14px_rgba(0,0,0,0.12)]"
                  : "allm-fixed allm-inset-0 allm-w-full allm-h-full allm-bg-white allm-overflow-hidden allm-flex allm-flex-col allm-rounded-none allm-z-[9999]"
              }
            >
              <ChatWindow
                closeChat={
                  inBox ? () => setExpanded(false) : () => setOverlay(false)
                }
                closeVariant={inBox ? "collapse" : "close"}
                settings={settings}
                sessionId={sessionId}
                conversationId={conversationId}
                newConversation={newConversation}
                switchConversation={switchConversation}
                justCreatedRef={justCreatedRef}
                compactHeader={isKeyboardOpen}
              />
            </div>
          </div>
        )}
      </div>
    </EmbedModeContext.Provider>
  );
}

function InlineBar({ settings, narrow, onOpen }) {
  const theme = BAR_THEMES[settings.inlineTheme] || BAR_THEMES.light;
  const accent = settings.buttonColor || "#01a5a9";
  const Icon = CHAT_ICONS.hasOwnProperty(settings?.chatIcon)
    ? CHAT_ICONS[settings.chatIcon]
    : ChatCircleDots;
  // Immer als Text rendern (React escaped), nie als HTML.
  const text =
    typeof settings.inlineCollapsedText === "string" &&
    settings.inlineCollapsedText.trim()
      ? settings.inlineCollapsedText.trim()
      : DEFAULT_INLINE_COLLAPSED_TEXT;
  const iconSize = narrow ? 36 : 42;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      id="anything-llm-inline-bar"
      className="allm-w-full allm-flex allm-items-center allm-text-left allm-cursor-pointer allm-rounded-2xl allm-box-border allm-m-0 allm-font-sans hover:allm-opacity-95 allm-transition-opacity allm-duration-200"
      style={{
        ...theme,
        padding: narrow ? "10px 12px" : "12px 18px",
        gap: narrow ? "10px" : "14px",
        minHeight: narrow ? "56px" : "66px",
      }}
    >
      <span
        className="allm-flex-shrink-0 allm-rounded-full allm-flex allm-items-center allm-justify-center"
        style={{
          width: `${iconSize}px`,
          height: `${iconSize}px`,
          backgroundColor: accent,
          color: "#FFFFFF",
          // dunkle Leiste: heller Ring, damit auch dunkle Akzentfarben sichtbar bleiben
          boxShadow:
            settings.inlineTheme === "dark"
              ? "0 0 0 2px rgba(255, 255, 255, 0.28)"
              : undefined,
        }}
      >
        <Icon size={narrow ? 20 : 22} weight="fill" />
      </span>
      <span
        className="allm-flex-1 allm-min-w-0 allm-font-sans allm-font-semibold"
        style={{
          fontSize: narrow ? "14px" : "16px",
          lineHeight: 1.35,
          overflowWrap: "anywhere",
        }}
      >
        {text}
      </span>
      <CaretDown
        size={18}
        weight="bold"
        className="allm-flex-shrink-0"
        style={{ opacity: 0.6 }}
      />
    </button>
  );
}
