import { useLayoutEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { embedderSettings } from "@/main";
import {
  DARK,
  DEFAULT_ACCENT,
  ON_ACCENT_TEXT,
  PRIVACY_DIALOG_BODY_ID,
  PRIVACY_DIALOG_ID,
  PRIVACY_DIALOG_TITLE_ID,
} from "@/utils/theme";
import { contrastRatio, MIN_TEXT_CONTRAST } from "@/utils/contrast";
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
// „Frühere Chats“). Ersetzt die Datenschutz-Blase unter der Begrüßung und den
// früheren Einmal-Hinweis mit Bestätigung („modal“), aus dem Aufbau und
// Tab-Falle stammen. Kein Pop-up vor dem Chat (Hard Constraint 2).
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
// Optik (D2): Fläche und Schrift der Antwortblasen (--allmi-assistant-bg,
// --allmi-assistant-text, --allmi-font-size; folgen data-assistant-bg-color
// und den Variablen der Seite), Rundung des Panels (das Fenster liegt im
// Panel, dessen Rundung schneidet es zu). Ergeben die Variablen der Seite
// eine unlesbare Fläche (durchsichtig, Kontrast unter 4,5:1, Schrift unter
// 12 px), gelten feste Standardfarben bzw. 14 px (NAK-2, readableColors).
// z-index 60 wie „Frühere Chats“: über dem Scroll-nach-unten-Pfeil (z-50).

const FALLBACK = {
  light: { color: "#222628", backgroundColor: "#FFFFFF" },
  dark: { color: DARK.text, backgroundColor: DARK.assistantBg },
};
const MIN_FONT_PX = 12;
const LINE = "var(--allmi-header-border, 1px solid #E9E9E9)";

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
  const [guard, setGuard] = useState(null);

  const setRef = (el) => {
    ownRef.current = el;
    if (typeof dialogRef === "function") dialogRef(el);
    else if (dialogRef) dialogRef.current = el;
  };

  // Fokus beim Öffnen auf die Überschrift (das Fenster öffnet nur ein Klick
  // bzw. Enter im Widget, der Fokus liegt also schon hier); Lesbarkeit prüfen
  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    setGuard(readableGuard(ownRef.current));
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
        backgroundColor: "var(--allmi-assistant-bg, #FFFFFF)",
        color: "var(--allmi-assistant-text, #222628)",
        ...guard,
      }}
    >
      <div
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
          boxSizing: "border-box",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          fontSize: guard?.fontSize || "var(--allmi-font-size, 14px)",
          lineHeight: 1.55,
          overflowWrap: "anywhere",
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
              color: `var(--allmi-link, ${DEFAULT_ACCENT})`,
              fontWeight: 500,
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            {texts.privacyBubbleLink}
          </a>
        )}
      </div>
      <div
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
          right: "8px",
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

// Bedienbare Elemente im Fenster in Dokumentreihenfolge (Tab-Falle)
function focusables(container) {
  if (!container) return [];
  return [
    ...container.querySelectorAll('a[href], button, [tabindex="0"]'),
  ].filter((el) => !el.disabled);
}

// Lesbarkeit gegen Variablen der Seite (NAK-2): Farben und Schriftgröße so,
// wie der Browser sie berechnet. Unlesbar (Fläche nicht deckend, Kontrast
// unter 4,5:1, Schrift unter 12 px) -> feste Standardwerte des Farbschemas
// (Stylesheet-Modus utils/theme.js render, data-mode). Ohne berechnete
// Farben (jsdom, alte Browser) bleibt es bei den Variablen.
export function readableGuard(el, mode = themeMode()) {
  if (!el || typeof getComputedStyle !== "function") return null;
  const cs = getComputedStyle(el);
  const fg = rgba(cs.color);
  const bg = rgba(cs.backgroundColor);
  const out = {};
  if (fg && bg) {
    const hex = (c) =>
      `#${c
        .slice(0, 3)
        .map((v) => Math.round(v).toString(16).padStart(2, "0"))
        .join("")}`;
    const ratio = contrastRatio(hex(fg), hex(bg));
    if (bg[3] < 1 || fg[3] < 1 || ratio === null || ratio < MIN_TEXT_CONTRAST)
      Object.assign(out, FALLBACK[mode === "dark" ? "dark" : "light"]);
  }
  const body = el.querySelector?.(`#${PRIVACY_DIALOG_BODY_ID}`);
  const size = body ? parseFloat(getComputedStyle(body).fontSize) : NaN;
  if (Number.isFinite(size) && size < MIN_FONT_PX) out.fontSize = "14px";
  return Object.keys(out).length ? out : null;
}

function themeMode() {
  return embedderSettings.themeStyle?.dataset?.mode === "dark"
    ? "dark"
    : "light";
}

// "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" / "rgb(1 2 3 / 50%)" -> [r, g, b, a];
// sonst null
function rgba(value) {
  if (typeof value !== "string") return null;
  const m =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(
      value.trim(),
    );
  if (!m) return null;
  const a =
    m[4] === undefined ? 1 : parseFloat(m[4]) / (m[5] === "%" ? 100 : 1);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}
