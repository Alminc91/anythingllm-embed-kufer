import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { CaretDown, ChatCircleDots } from "@phosphor-icons/react";
import ChatWindow from "@/components/ChatWindow";
import { resolveChatIcon } from "@/components/OpenButton";
import { EmbedModeContext } from "@/hooks/useEmbedMode";
import useMobileKeyboard from "@/hooks/useMobileKeyboard";
import { embedderSettings } from "@/main";
import { isTouchDevice } from "@/utils/platform";
import {
  DEFAULT_INLINE_COLLAPSED_TEXT,
  inlineBoxStyle,
  inlineMaxWidth,
} from "@/utils/layout";

// Kufer Inline-Modus: Chat mitten in der Webseite (im Platzhalter
// <div id="kufer-assistent">) statt als Blase.
//   eingeklappt      -> breite Leiste im Seitenfluss ("Jetzt mit unserem KI-Assistenten schreiben")
//   Tablet/Desktop   -> Klick klappt an Ort und Stelle eine Box mit FESTER Höhe
//   (>=768px)           (inlineHeight) auf, darin das normale ChatWindow
//   mobil (<768px)   -> KEINE Box in der Seite: die Leiste bleibt, Tippen öffnet
//                       immer das Vollbild-Overlay (Fokus aufs Eingabefeld in
//                       derselben Geste -> iOS öffnet die Tastatur). Dafür wird
//                       der Shadow-Host an <body> gehängt (robust gegen
//                       transform/z-index/overflow der Webseite) und im
//                       Platzhalter ein gleich hoher Abstandhalter gelassen.
// Einmal geöffnet bleibt das ChatWindow gemountet (eingeklappt nur ausgeblendet):
// eine laufende Antwort bricht nicht ab, beim Wiederöffnen wird nichts neu geladen.
// Viewport <768px bei offener Box -> eingeklappt (Leiste); zurück >=768px zeigt
// die Box wieder. inlineStartState="expanded" gilt entsprechend nur ab 768px.

const NARROW_CONTAINER_PX = 480; // Leiste kompakter in schmalen Spalten
const DESKTOP_QUERY = "(min-width: 768px)"; // = Tailwind md

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

// Unsichtbares Hilfsfeld fürs erste Öffnen des Overlays: existiert das echte
// Eingabefeld noch nicht (Chat lädt), bekommt dieses Feld den Fokus in der
// Nutzer-Geste (iOS öffnet die Tastatur); PromptInput übernimmt den Fokus beim
// Mount. 16px verhindert den iOS-Zoom.
const FOCUS_PROXY_STYLE = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "1px",
  height: "1px",
  opacity: 0,
  border: 0,
  padding: 0,
  fontSize: "16px",
  pointerEvents: "none",
};

const chatClasses = {
  box: "allm-relative allm-w-full allm-h-full allm-bg-white allm-border allm-border-solid allm-border-gray-300 allm-rounded-2xl allm-overflow-hidden allm-flex allm-flex-col allm-box-border allm-shadow-[0_4px_14px_rgba(0,0,0,0.12)]",
  overlay:
    "allm-fixed allm-inset-0 allm-w-full allm-h-full allm-bg-white allm-overflow-hidden allm-flex allm-flex-col allm-rounded-none allm-z-[9999]",
};

function scrollChatToBottom() {
  // Nach Umhängen/Einblenden: Chat-Verlauf wieder ans Ende (nur der Container,
  // nie die Seite).
  requestAnimationFrame(() => {
    const el = embedderSettings.shadowRoot?.getElementById("chat-history");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function useIsDesktopViewport() {
  const [matches, setMatches] = useState(
    () =>
      window.matchMedia?.(DESKTOP_QUERY).matches ?? window.innerWidth >= 768,
  );
  useEffect(() => {
    const mql = window.matchMedia?.(DESKTOP_QUERY);
    if (!mql) return;
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return matches;
}

export default function InlineChat({
  settings,
  mountTarget,
  onMountError,
  sessionId,
  conversationId,
  newConversation,
  switchConversation,
  justCreatedRef,
}) {
  const host = embedderSettings.hostElement;
  const isDesktop = useIsDesktopViewport();
  // expanded = Box an Ort und Stelle (nur >=768px wirksam)
  const [expanded, setExpanded] = useState(
    settings.inlineStartState === "expanded",
  );
  const [overlay, setOverlay] = useState(false); // mobiles Vollbild
  const [narrow, setNarrow] = useState(false);
  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const barRef = useRef(null);
  const chatWindowRef = useRef(null);
  const proxyRef = useRef(null);
  const spacerHeightRef = useRef(0);
  const focusRequestRef = useRef(false);
  const scrollOnExpandRef = useRef(false);
  const chatMountedRef = useRef(false);

  const view = overlay ? "overlay" : expanded && isDesktop ? "box" : "bar";
  if (view !== "bar") chatMountedRef.current = true;
  const isKeyboardOpen = useMobileKeyboard(chatWindowRef, overlay);

  // Host im Platzhalter halten; für das mobile Overlay an <body> hängen.
  // useLayoutEffect: umhängen vor dem Paint, kein Aufblitzen an falscher Stelle.
  useLayoutEffect(() => {
    if (!host || !mountTarget) return;
    if (!overlay) {
      if (host.parentNode === mountTarget) return;
      try {
        mountTarget.appendChild(host);
      } catch (e) {
        // z. B. Platzhalter inzwischen ungeeignet/entfernt -> Blase
        console.warn(
          "[AnythingLLM Embed] Inline-Modus: Einhängen fehlgeschlagen — Chat-Blase wird verwendet.",
          e,
        );
        if (host.parentNode !== document.body) document.body.appendChild(host);
        onMountError?.();
      }
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

  // Drehen/Vergrößern auf >=768px bei offenem Overlay -> zurück in die Seite,
  // aufgeklappt (Chat bleibt gemountet, laufende Antwort läuft weiter).
  useEffect(() => {
    if (overlay && isDesktop) {
      setExpanded(true);
      setOverlay(false);
    }
  }, [overlay, isDesktop]);

  // Container-Breite statt Viewport-Breite (schmale Spalten, Sidebars);
  // State ändert sich nur beim Überschreiten der Schwelle.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setNarrow(w < NARROW_CONTAINER_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Box eingeblendet: Verlauf ans Ende; nach Klick genau EINMAL scrollen — und
  // nur, wenn die Box nicht vollständig sichtbar ist (block: "nearest").
  // Startzustand "expanded" scrollt nie (scrollOnExpandRef nur beim Klick).
  useEffect(() => {
    if (view !== "box") return;
    scrollChatToBottom();
    if (!scrollOnExpandRef.current) return;
    scrollOnExpandRef.current = false;
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < 0 || rect.bottom > vh)
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [view]);

  // Fokus direkt in der Klick-Geste setzen; existiert das Eingabefeld noch
  // nicht (Chat lädt), übernimmt PromptInput beim Mount (consumeFocusRequest).
  const focusInput = (inOverlay) => {
    const input = embedderSettings.shadowRoot?.getElementById("message-input");
    if (input && !input.disabled) {
      input.focus({ preventScroll: true });
      return;
    }
    focusRequestRef.current = true;
    if (inOverlay) proxyRef.current?.focus({ preventScroll: true });
  };

  const openChat = () => {
    if (!isDesktop) {
      spacerHeightRef.current = host?.getBoundingClientRect?.().height || 0;
      // flushSync: Overlay + Host-Umhängen synchron, damit der Fokus unten noch
      // in derselben Nutzer-Geste liegt (iOS öffnet die Tastatur nur dann).
      flushSync(() => setOverlay(true));
      focusInput(true);
      return;
    }
    scrollOnExpandRef.current = true;
    flushSync(() => setExpanded(true));
    // Touch-Tablets: kein Auto-Fokus (Tastatur würde die Seite verschieben)
    if (!isTouchDevice()) focusInput(false);
  };

  // Einklappen (Box) bzw. Schließen (Overlay); Fokus zurück auf die Leiste.
  const closeChat = () => {
    flushSync(() => {
      setOverlay(false);
      setExpanded(false);
    });
    barRef.current?.focus({ preventScroll: true });
  };

  // Escape schließt das Overlay bzw. klappt die Box ein — nur wenn der Fokus
  // im Widget liegt (Listener am Shadow Root sieht nur Events aus dem Widget).
  useEffect(() => {
    const root = embedderSettings.shadowRoot;
    if (!root || view === "bar") return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      closeChat();
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [view]);

  const embedMode = useMemo(
    () => ({
      inline: true,
      overlay,
      consumeFocusRequest: () => {
        const wanted = focusRequestRef.current;
        focusRequestRef.current = false;
        return wanted;
      },
    }),
    [overlay],
  );

  const inheritFont = settings.inheritFont === true;

  return (
    <EmbedModeContext.Provider value={embedMode}>
      <div
        ref={rootRef}
        id="anything-llm-embed-inline"
        className={`allm-relative allm-w-full allm-font-sans ${inheritFont ? "allm-inherit-font" : ""}`}
        style={{ ...TEXT_RESET, maxWidth: inlineMaxWidth(settings) }}
      >
        {view === "bar" && (
          <InlineBar
            ref={barRef}
            settings={settings}
            narrow={narrow}
            onOpen={openChat}
          />
        )}
        {chatMountedRef.current && (
          <div
            ref={boxRef}
            className={
              view === "box"
                ? "allm-relative allm-w-full"
                : view === "bar"
                  ? "allm-hidden"
                  : ""
            }
            style={view === "box" ? inlineBoxStyle(settings) : undefined}
          >
            <div
              ref={chatWindowRef}
              id="anything-llm-chat"
              className={
                view === "overlay" ? chatClasses.overlay : chatClasses.box
              }
            >
              {view === "overlay" && (
                <input
                  ref={proxyRef}
                  aria-hidden="true"
                  tabIndex={-1}
                  style={FOCUS_PROXY_STYLE}
                />
              )}
              <ChatWindow
                closeChat={closeChat}
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

const InlineBar = forwardRef(function InlineBar(
  { settings, narrow, onOpen },
  ref,
) {
  const theme = BAR_THEMES[settings.inlineTheme] || BAR_THEMES.light;
  const accent = settings.buttonColor || "#01a5a9";
  const Icon = resolveChatIcon(settings?.chatIcon, ChatCircleDots);
  // Immer als Text rendern (React escaped), nie als HTML.
  const text =
    typeof settings.inlineCollapsedText === "string" &&
    settings.inlineCollapsedText.trim()
      ? settings.inlineCollapsedText.trim()
      : DEFAULT_INLINE_COLLAPSED_TEXT;
  const iconSize = narrow ? 36 : 42;

  return (
    <button
      ref={ref}
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
});
