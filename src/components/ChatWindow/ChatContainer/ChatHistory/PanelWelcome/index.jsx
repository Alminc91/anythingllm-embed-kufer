import { useLayoutEffect, useRef } from "react";
import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import { embedderSettings } from "@/main";
import {
  BUBBLE_RADIUS,
  BUBBLE_SHADOW,
  DEFAULT_ACCENT,
  LOGO_RADIUS,
} from "@/utils/theme";
import {
  greetingText,
  groupPrivacyBlocks,
  panelPills,
  panelTexts,
  privacyBlocks,
  privacyDialogTitle,
  privacyHref,
} from "@/utils/layout";
import { sendSuggestion } from "../..";
import Pill from "../Pill";

// Panel-Optik (Mockup „Wunschfragen im Panel“, Variante B; seit Design Center
// vereinfacht fester Standard suggestionStyle "pills", die Begrüßung ist
// seit 7.23 immer eine Blase, utils/layout.js LOCKED_STANDARDS); Vorschläge
// nur im leeren Chat, die Begrüßungsblase bleibt auch im Verlauf
// (PanelGreeting). Seit 7.23 steht der Datenschutz-Hinweis immer als Link
// „Datenschutz“ neben dem KI-Hinweis unter der Eingabe und öffnet ein
// Fenster über dem Chat (Nutzerentscheidung 23.10.2026, ChatContainer
// AiDisclaimer, PrivacyNotice). Zusätzlich, nur mit dem Schalter im Design
// Center (privacyStartBubble true, AK-12, Nutzer 24.10.2026), steht er
// beim Start als Datenschutz-Blase unter der Begrüßung (PrivacyBubble).
// Farben/Rundung ausschließlich über --allmi-* (hell/dunkel folgen dem
// Theme). Texte immer als Text, nie als HTML.

// Kennungen der Datenschutz-Blase und ihrer Überschrift (wie 7.22.2; Tests
// und Messungen, tests/visual/datenschutz_blase.py)
export const PRIVACY_BUBBLE_ID = "anything-llm-privacy-bubble";
export const PRIVACY_BUBBLE_TITLE_ID = "anything-llm-bubble-privacy-title";

// Abstand Blasen-Text zur linken Kante: Avatar 28px + Lücke 10px + Rand 8px
const BUBBLE_INSET = "46px";
// Abstand der Begrüßungsblase zur Oberkante beim Öffnen mit Überlauf
const GREETING_MARGIN_PX = 8;

// Wunschfragen als kleine Pillen (Pill, dieselbe Komponente wie die
// Folgefragen: Rand und Text in Kundenfarbe, Hover/Fokus gefüllt),
// umbrechend, höchstens 6, lange Texte gekürzt.
export function SuggestedPills({ settings, align = "center" }) {
  const pills = panelPills(settings);
  if (pills.length === 0) return null;
  return (
    <div
      id="anything-llm-suggestion-pills"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        justifyContent: align === "start" ? "flex-start" : "center",
        maxWidth: "100%",
      }}
    >
      {pills.map(({ text, label }, i) => (
        <Pill
          key={i}
          text={text}
          label={label}
          onClick={(e) => sendSuggestion(text, e.currentTarget)}
        />
      ))}
    </div>
  );
}

// Begrüßung als Assistenten-Blase mit Avatar (immer, LOCKED_STANDARDS),
// darunter die Vorschläge (Pillen links eingerückt, Balken wie bisher
// mittig). Die Spalte enthält die Begrüßungsblase und, nur mit
// privacyStartBubble true (AK-12), darunter die Datenschutz-Blase; ein
// gespeicherter privacyNotice-Wert wirkt nicht (D2).
// Beim Öffnen (ohne Animation): Die Begrüßungsblase muss sichtbar sein
// (KIE-565, Browser-Fund B-02: bei 700 px Fensterhöhe stand sie über dem
// sichtbaren Bereich). Bei Überlauf wird deshalb höchstens so weit Richtung
// Vorschläge gescrollt, dass die Begrüßung oben ganz im Blick bleibt;
// passen nicht beide, liegen die Pillen darunter (erreichbar per Scrollen).
// allm-box-border: Höhe inklusive Polsterung (im Shadow DOM gilt kein
// globales box-sizing), sonst ragte die Fläche unter die Eingabe.
export default function PanelWelcome({ settings = {}, suggestions = null }) {
  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    const greeting = el.querySelector("#anything-llm-greeting-bubble");
    const greetingTop = greeting
      ? greeting.getBoundingClientRect().top -
        el.getBoundingClientRect().top +
        el.scrollTop
      : 0;
    el.scrollTop = Math.min(
      el.scrollHeight - el.clientHeight,
      Math.max(0, greetingTop - GREETING_MARGIN_PX),
    );
  }, []);
  const pills = settings.suggestionStyle === "pills";
  return (
    <div
      ref={scrollRef}
      className="allm-h-full allm-box-border allm-overflow-y-auto allm-px-2 allm-py-4 allm-no-scroll"
    >
      <WelcomeBlock settings={settings}>
        {suggestions && (
          <div
            style={
              pills
                ? { paddingLeft: BUBBLE_INSET, paddingRight: "8px" }
                : { display: "flex", justifyContent: "center" }
            }
          >
            {suggestions}
          </div>
        )}
      </WelcomeBlock>
    </div>
  );
}

// Begrüßung bleibt im Verlauf: nach der ersten Frage und nach dem Laden
// eines Verlaufs steht die Begrüßungsblase (mit privacyStartBubble samt
// Datenschutz-Blase, wie 7.22.2) als festes erstes Element über den
// Nachrichten (kein Chat-Eintrag, wird nie gesendet oder gespeichert;
// ChatHistory), ohne die Vorschläge.
export function PanelGreeting({ settings = {} }) {
  return <WelcomeBlock settings={settings} persistent />;
}

// Optik der Begrüßungs- und der Datenschutz-Blase wie die Antwortblasen
// (AK-12, D4: die Datenschutz-Blase wie die Begrüßung): Fläche und Schrift folgen
// data-assistant-bg-color und den Variablen der Seite (--allm-assistant-bg,
// --allm-assistant-text); Innenabstand, Schriftgröße und Zeilenhöhe wie 7.22.2
// (Nutzerentscheidung 23.10.2026). Das Datenschutz-Fenster folgt der Blase
// nicht: es hat feste Farben je Farbschema und fest 14 px (R1-D1, ersetzt
// D2; utils/theme.js PRIVACY_DIALOG_COLORS).
const BUBBLE_STYLE = {
  boxSizing: "border-box",
  maxWidth: "100%",
  backgroundColor: "var(--allmi-assistant-bg, #FFFFFF)",
  color: "var(--allmi-assistant-text, #222628)",
  borderRadius: BUBBLE_RADIUS.assistant,
  boxShadow: BUBBLE_SHADOW,
  overflowWrap: "anywhere",
  padding: "11px 16px",
  fontSize: "var(--allmi-font-size, 14px)",
  lineHeight: 1.5,
};

// Avatar + Begrüßungsblase (+ Datenschutz-Blase); children = Vorschläge
// darunter (nur im leeren Chat). Der Avatar steht neben der letzten Blase.
function WelcomeBlock({ settings, persistent = false, children = null }) {
  const avatar =
    embedderSettings.settings.assistantIcon ||
    embedderSettings.settings.brandImageUrl ||
    AnythingLLMIcon;
  return (
    <div
      id="anything-llm-panel-welcome"
      data-persistent={persistent ? "" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: "14px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "10px",
          marginLeft: "8px",
        }}
      >
        <img
          src={avatar}
          alt=""
          aria-hidden="true"
          style={{
            width: "28px",
            height: "28px",
            objectFit: "contain",
            flex: "none",
            marginBottom: "2px",
            borderRadius: LOGO_RADIUS,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "6px",
            // ≈ Breite der Antwortblasen
            maxWidth: "80%",
            minWidth: 0,
          }}
        >
          <div
            id="anything-llm-greeting-bubble"
            className="allm-font-sans"
            style={{
              ...BUBBLE_STYLE,
              whiteSpace: "pre-line",
            }}
          >
            {greetingText(settings)}
          </div>
          {settings.privacyStartBubble === true && (
            <PrivacyBubble settings={settings} />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// Datenschutz-Blase beim Start (AK-12, D4; Aufbau und Optik wie die Blase
// in 7.22.2, Embed 3b35449): fette Überschrift (privacyTitle, sonst Standard
// „Datenschutz“ bzw. „Privacy“), darunter der Text (privacyText: Zeilen mit
// „•“/„-“ als Aufzählung, andere als Absätze; sonst die Standardpunkte), am
// Ende der Link „Datenschutzerklärung“ in eigener Zeile, nur mit gültiger
// privacyUrl (https oder Pfad der Seite, privacyHref; neuer Tab). Ohne den
// Punkt „Hinweis zur KI“: der steht im Datenschutz-Fenster, die KI-Zeile
// unter der Eingabe. Gleiche Fläche, Schrift, Schriftgröße, Zeilenhöhe und
// Innenabstand wie die Begrüßungsblase (BUBBLE_STYLE). Alles Text, nie HTML.
// Nur genau true schaltet sie ein (WelcomeBlock), auch für Werte, die nicht
// über loadEmbedSettings kamen.
function PrivacyBubble({ settings }) {
  const texts = panelTexts(settings);
  const groups = groupPrivacyBlocks(privacyBlocks(settings));
  const href = privacyHref(settings.privacyUrl);
  return (
    <div
      id={PRIVACY_BUBBLE_ID}
      className="allm-font-sans"
      style={{
        ...BUBBLE_STYLE,
        display: "flex",
        flexDirection: "column",
        gap: "5px",
      }}
    >
      <strong
        id={PRIVACY_BUBBLE_TITLE_ID}
        style={{ display: "block", fontWeight: 700 }}
      >
        {privacyDialogTitle(settings)}
      </strong>
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
              gap: "3px",
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
          }}
        >
          {texts.privacyBubbleLink}
        </a>
      )}
    </div>
  );
}
