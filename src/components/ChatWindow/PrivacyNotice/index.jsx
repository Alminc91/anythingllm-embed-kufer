import { useEffect, useRef } from "react";
import { embedderSettings } from "@/main";
import useEmbedMode from "@/hooks/useEmbedMode";
import { ON_ACCENT_TEXT } from "@/utils/theme";
import { panelTexts, privacyPoints } from "@/utils/layout";
import { isTouchDevice } from "@/utils/platform";
import { focusIsElsewhereOnPage } from "../ChatContainer/PromptInput";

// Einmaliger Datenschutz-Hinweis (privacyNotice "modal"): Karte über dem Chat
// IM Panel (Shadow DOM), kein Overlay über der Webseite, kein Scroll-Lock.
// Aufbau: Überschrift („Datenschutz:“), Stichpunkte (privacyText, je Zeile
// ein Punkt), optional „Weitere Informationen in der Erklärung zum
// Datenschutz“ (privacyUrl), mittig der Knopf („Start“, privacyButtonText).
// ChatContainer zeigt sie, solange nicht bestätigt (utils/privacy.js), und
// sperrt bis dahin die Eingabe. Tastatur: Fokus auf den Knopf (Regel wie
// PromptInput, s. u.), Tab bleibt in der Karte; Escape bestätigt nicht —
// im Inline-Modus klappt es wie gewohnt das Panel ein, im Blasen-Modus
// schließt es das Chatfenster wie der Schließen-Knopf (Listener am document
// in ChatContainer, auch bei Fokus auf der Webseite) -> keine
// Tastaturfalle, der Hinweis kommt beim nächsten Öffnen wieder. z-index 60
// wie das Overlay „Frühere Chats“: über dem Scroll-nach-unten-Pfeil (z-50).
// Alle Texte als Text (nie HTML); Farben über --allmi-*.
export default function PrivacyNotice({
  settings = {},
  onAcknowledge,
  // wie PromptInput: Frage per Touch aus der Leiste abgeschickt -> kein
  // Auto-Fokus (keine Bildschirmtastatur/kein Fokus-Sprung)
  suppressAutoFocus = false,
}) {
  const embedMode = useEmbedMode();
  const cardRef = useRef(null);
  const buttonRef = useRef(null);
  const texts = panelTexts(settings);
  const title = settings.privacyTitle || texts.privacyTitle;
  const points = privacyPoints(settings);
  const buttonText = settings.privacyButtonText || texts.privacyButton;
  const url = settings.privacyUrl || null;

  // Fokus auf den Knopf, einmalig beim Mount und nur wenn erlaubt — dieselbe
  // Regel wie das Eingabefeld (PromptInput): nie einem Element der Webseite
  // den Fokus wegnehmen; im Inline-Seitenfluss auf Touch kein Auto-Fokus
  // (Seitensprung); nicht bei suppressAutoFocus (Frage per Touch aus der Leiste).
  useEffect(() => {
    const inlineFlow = embedMode.inline && !embedMode.overlay;
    if (suppressAutoFocus || (inlineFlow && isTouchDevice())) return;
    if (focusIsElsewhereOnPage()) return;
    buttonRef.current?.focus({ preventScroll: true });
  }, []);

  const trapTab = (e) => {
    if (e.key !== "Tab") return;
    const items = [...cardRef.current.querySelectorAll("a[href], button")];
    if (items.length === 0) return;
    const root = embedderSettings.shadowRoot;
    const active = root ? root.activeElement : document.activeElement;
    const i = items.indexOf(active);
    const next = e.shiftKey
      ? items[(i <= 0 ? items.length : i) - 1]
      : items[(i + 1) % items.length];
    e.preventDefault();
    next.focus({ preventScroll: true });
  };

  return (
    <div
      id="anything-llm-privacy-notice"
      className="allm-font-sans"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 0",
        overflowY: "auto",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "var(--allmi-surface, #FFFFFF)",
          opacity: 0.86,
        }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="anything-llm-privacy-title"
        aria-describedby="anything-llm-privacy-text"
        onKeyDown={trapTab}
        style={{
          position: "relative",
          boxSizing: "border-box",
          width: "90%",
          maxWidth: "520px",
          margin: "auto",
          padding: "22px 24px 20px",
          backgroundColor: "var(--allmi-surface, #FFFFFF)",
          color: "var(--allmi-text, #1f2937)",
          border: "1px solid var(--allmi-border, transparent)",
          borderRadius: "24px",
          boxShadow:
            "var(--allmi-shadow, 0 10px 30px rgba(0, 0, 0, 0.16)), 0 2px 6px rgba(0, 0, 0, 0.06)",
        }}
      >
        <h2
          id="anything-llm-privacy-title"
          style={{
            margin: 0,
            fontSize: "20px",
            fontWeight: 700,
            lineHeight: 1.3,
            textAlign: "left",
          }}
        >
          {title}
        </h2>
        <ul
          id="anything-llm-privacy-text"
          style={{
            margin: "12px 0 0",
            paddingLeft: "20px",
            listStyle: "disc",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {points.map((point, i) => (
            <li
              key={i}
              style={{ marginTop: i ? "6px" : 0, overflowWrap: "anywhere" }}
            >
              {point}
            </li>
          ))}
        </ul>
        {url && (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "12.5px",
              lineHeight: 1.5,
              color: "var(--allmi-text-muted, #4b5563)",
            }}
          >
            {texts.privacyMoreLead}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--allmi-link, #01a5a9)",
                textDecoration: "underline",
              }}
            >
              {texts.privacyMoreLink}
            </a>
          </p>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "18px",
          }}
        >
          <button
            ref={buttonRef}
            type="button"
            onClick={onAcknowledge}
            className="allm-cursor-pointer allm-font-sans"
            style={{
              minHeight: "44px",
              minWidth: "140px",
              border: "none",
              borderRadius: "999px",
              padding: "10px 28px",
              backgroundColor: "var(--allmi-accent, #01a5a9)",
              color: ON_ACCENT_TEXT,
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
