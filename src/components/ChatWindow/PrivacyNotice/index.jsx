import { useLayoutEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { embedderSettings } from "@/main";
import {
  DEFAULT_ACCENT,
  ON_ACCENT_TEXT,
  PRIVACY_DIALOG_BODY_ID,
  PRIVACY_DIALOG_COLORS,
  PRIVACY_DIALOG_ID,
  PRIVACY_DIALOG_TITLE_ID,
  PRIVACY_TEXT_MAX_WIDTH,
} from "@/utils/theme";
import useEmbedMode from "@/hooks/useEmbedMode";
import {
  groupPrivacyBlocks,
  panelTexts,
  privacyBlocks,
  privacyDialogTitle,
  privacyHref,
} from "@/utils/layout";

// Datenschutz-Fenster (7.23, Nutzerentscheidungen 23.10.2026): öffnet sich
// über den Link „Datenschutz“ neben dem KI-Hinweis unter der Eingabe und
// deckt den ganzen Chat ab (Chatfenster, aufgeklapptes „In der Seite“,
// mobiles Vollbild; ChatWindow legt es über Kopf, Verlauf und Eingabe, wie
// „Frühere Chats“). Ersetzt den früheren Einmal-Hinweis mit Bestätigung
// („modal“), aus dem Aufbau und Tab-Falle stammen, und als Standard die
// Datenschutz-Blase unter der Begrüßung (die gibt es seit AK-12 nur
// zusätzlich mit privacyStartBubble, PanelWelcome PrivacyBubble). Kein
// Pop-up vor dem Chat (Hard Constraint 2).
//
// Aufbau: Überschrift (privacyTitle, sonst Standard), Text (privacyText,
// Zeilen mit „•“/„-“ als Aufzählung, andere als Absätze; sonst die
// Standardpunkte), Punkt „Hinweis zur KI“, Link zur Datenschutzerklärung
// (nur mit privacyUrl, nur http/https, neuer Tab), Button „Schließen“; das
// Schließen-Symbol steht oben rechts, im Dokument aber zuletzt.
// Alle Texte als Text (nie HTML).
//
// Tastatur und Screenreader: role dialog, aria-modal, aria-labelledby auf
// die Überschrift. Beim Öffnen bekommt die Überschrift den Fokus (tabIndex
// -1, wird zuerst vorgelesen); Tab-Reihenfolge Text (Textbereich, per
// Tastatur scrollbar), Link, Schließen, Schließen-Symbol, und Tab bleibt im
// Fenster. Escape schließt über die Escape-Ebene (ChatWindow). Der Fokus
// darf auch sonst nicht hinter das Fenster (ChatWindow, onFocus).
//
// Optik (R1-D1, ersetzt D2): Fläche, Schrift, Trennlinien, Link und
// Fokusrahmen fest je Farbschema, als Regel direkt am Element im
// Theme-Stylesheet (utils/theme.js PRIVACY_DIALOG_COLORS, buildThemeCss);
// keine Variable der Seite wirkt darauf, auch nicht data-assistant-bg-color.
// Die Inline-Stile tragen nur die hellen Werte als Rückfall und feste
// Schriftgrößen (14 px wie die Begrüßung, Überschrift 17 px). Nur der
// Button „Schließen“ nutzt die Akzentfarbe und die Schrift darauf aus dem
// Design Center (Gruppe A). Rundung des Panels (das Fenster liegt im Panel,
// dessen Rundung schneidet es zu). z-index 60 wie „Frühere Chats“: über dem
// Scroll-nach-unten-Pfeil (z-50).

const FALLBACK = PRIVACY_DIALOG_COLORS.light;
const LINE = `1px solid ${FALLBACK.line}`;
const FONT_SIZE = "14px";

export default function PrivacyDialog({
  settings = {},
  onClose,
  dialogRef = null,
}) {
  const texts = panelTexts(settings);
  const title = privacyDialogTitle(settings);
  const groups = groupPrivacyBlocks(privacyBlocks(settings));
  const href = privacyHref(settings.privacyUrl);
  const ownRef = useRef(null);
  const titleRef = useRef(null);
  // Textbreite (R1-D2): nur In der Seite (aufgeklappt, nicht das mobile
  // Vollbild) höchstens 70ch (70 Breiten der Ziffer 0, gemessen rund 80 bis
  // 90 Zeichen Text je Zeile), sonst liefe eine Zeile bei 1440 und 1920 px
  // über 150 Zeichen und mehr. Kopfzeile, Button-Zeile und Bildlauf bleiben
  // über die ganze Breite; im Chatfenster und mobil keine Grenze.
  const { inline, overlay } = useEmbedMode();
  const narrowText = inline && !overlay;

  const setRef = (el) => {
    ownRef.current = el;
    if (typeof dialogRef === "function") dialogRef(el);
    else if (dialogRef) dialogRef.current = el;
  };

  // Fokus beim Öffnen auf die Überschrift (das Fenster öffnet nur ein Klick
  // bzw. Enter im Widget, der Fokus liegt also schon hier)
  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const trapTab = (e) => {
    if (e.key !== "Tab") return;
    const items = focusables(ownRef.current);
    if (items.length === 0) return;
    const root = embedderSettings.shadowRoot;
    const active = root ? root.activeElement : document.activeElement;
    const i = items.indexOf(active);
    const next = e.shiftKey
      ? items[(i <= 0 ? items.length : i) - 1]
      : items[(i + 1) % items.length];
    e.preventDefault();
    next.focus({ preventScroll: true });
    revealFocused(next);
  };

  return (
    <div
      ref={setRef}
      id={PRIVACY_DIALOG_ID}
      role="dialog"
      aria-modal="true"
      aria-labelledby={PRIVACY_DIALOG_TITLE_ID}
      onKeyDown={trapTab}
      className="allm-font-sans"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflow: "hidden",
        backgroundColor: FALLBACK.bg,
        color: FALLBACK.text,
        fontSize: FONT_SIZE,
      }}
    >
      <div
        className="allm-privacy-dialog-line"
        style={{
          flex: "none",
          padding: "16px 60px 12px 20px",
          borderBottom: LINE,
        }}
      >
        <h2
          ref={titleRef}
          id={PRIVACY_DIALOG_TITLE_ID}
          tabIndex={-1}
          style={{
            margin: 0,
            fontSize: "17px",
            fontWeight: 700,
            lineHeight: 1.35,
            overflowWrap: "anywhere",
            outline: "none",
          }}
        >
          {title}
        </h2>
      </div>
      <div
        id={PRIVACY_DIALOG_BODY_ID}
        tabIndex={0}
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          // Abstand beim Sichtbarmachen (W5), damit der Fokusrahmen (2 px
          // mit 2 px Abstand) am Rand des Textbereichs nicht abgeschnitten wird
          scrollPaddingBlock: "8px",
          boxSizing: "border-box",
          padding: "16px 20px",
          fontSize: FONT_SIZE,
          lineHeight: 1.55,
          overflowWrap: "anywhere",
        }}
      >
        <div
          className="allm-privacy-dialog-text"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            maxWidth: narrowText ? PRIVACY_TEXT_MAX_WIDTH : undefined,
          }}
        >
          {groups.map((g, i) =>
            g.type === "list" ? (
              <ul
                key={i}
                style={{
                  margin: 0,
                  paddingLeft: "1.15em",
                  listStyle: "disc",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {g.items.map((text, j) => (
                  <li key={j}>{text}</li>
                ))}
              </ul>
            ) : (
              <p key={i} style={{ margin: 0 }}>
                {g.text}
              </p>
            ),
          )}
          <div>
            <strong style={{ display: "block", fontWeight: 700 }}>
              {texts.privacyAiTitle}
            </strong>
            <p style={{ margin: "4px 0 0" }}>{texts.privacyAiText}</p>
          </div>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                alignSelf: "flex-start",
                color: DEFAULT_ACCENT,
                fontWeight: 500,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              {texts.privacyBubbleLink}
            </a>
          )}
        </div>
      </div>
      <div
        className="allm-privacy-dialog-line"
        style={{
          flex: "none",
          display: "flex",
          justifyContent: "flex-end",
          padding: "12px 16px 16px",
          borderTop: LINE,
        }}
      >
        <button
          type="button"
          onClick={() => onClose?.()}
          className="allm-cursor-pointer allm-font-sans"
          style={{
            minHeight: "44px",
            padding: "0 22px",
            border: "none",
            borderRadius: "12px",
            backgroundColor: `var(--allmi-accent, ${DEFAULT_ACCENT})`,
            color: ON_ACCENT_TEXT,
            fontSize: "14px",
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {texts.privacyCloseText}
        </button>
      </div>
      <button
        type="button"
        onClick={() => onClose?.()}
        aria-label={texts.privacyCloseLabel}
        title={texts.privacyCloseLabel}
        className="allm-cursor-pointer allm-privacy-dialog-close"
        style={{
          position: "absolute",
          top: "6px",
          right: "10px",
          width: "44px",
          height: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          border: "none",
          borderRadius: "10px",
          backgroundColor: "transparent",
          color: "inherit",
        }}
      >
        <X size={18} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

// Tab im Fenster (W5): das neue Ziel sichtbar machen. Der Fokus selbst
// bleibt ohne Bildlauf (preventScroll), weil der Browser dabei auch die Seite
// verschiebt und das Ziel mittig setzt; „nearest“ scrollt den Textbereich
// und die Seite nur so weit wie nötig (die Seite im Chatfenster und mobil,
// fest positioniert, gar nicht).
function revealFocused(el) {
  el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

// Bedienbare Elemente im Fenster in Dokumentreihenfolge (Tab-Falle)
function focusables(container) {
  if (!container) return [];
  return [
    ...container.querySelectorAll('a[href], button, [tabindex="0"]'),
  ].filter((el) => !el.disabled);
}
