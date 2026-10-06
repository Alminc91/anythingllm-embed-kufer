import { useLayoutEffect, useRef } from "react";
import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import { embedderSettings } from "@/main";
import { BUBBLE_RADIUS, BUBBLE_SHADOW } from "@/utils/theme";
import { panelPills, panelTexts, privacyPoints } from "@/utils/layout";
import { sendSuggestion } from "../..";
import Pill from "../Pill";

// Panel-Optik (Mockup „Wunschfragen im Panel“, Variante B), nur auf Wunsch
// (suggestionStyle "pills" / greetingStyle "bubble"); Vorschläge nur im
// leeren Chat, die Begrüßungsblase bleibt auch im Verlauf (PanelGreeting).
// Farben/Rundung ausschließlich über --allmi-* (hell/dunkel folgen dem
// Theme); Texte immer als Text, nie als HTML.

// Abstand Blasen-Text zur linken Kante: Avatar 28px + Lücke 10px + Rand 8px
const BUBBLE_INSET = "46px";

// Wunschfragen als kleine Pillen (Pill, Standard-Variante: Rand über
// --allmi-pill-border), umbrechend, höchstens 6, lange Texte gekürzt.
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

// greetingStyle "bubble": Begrüßung als Assistenten-Blase mit Avatar, darunter
// die Vorschläge (Pillen links eingerückt, Balken wie bisher mittig) und der
// greeting-Text (Datenschutzsatz) klein. privacyNotice "bubble": die
// Datenschutz-Punkte stehen als zweiter Absatz (Fließtext) in der Blase
// (am Ende der Link „Datenschutz“, nur mit privacyUrl), der kleine
// greeting-Text entfällt dann (sonst doppelt).
// Beim Öffnen ans Ende gescrollt (ohne Animation): eine lange Blase (z. B.
// mit Datenschutz-Punkten im kleinen Blasenfenster) schöbe die Vorschläge
// sonst unter den sichtbaren Bereich. Ohne Überlauf bleibt alles stehen.
export default function PanelWelcome({ settings = {}, suggestions = null }) {
  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
  }, []);
  const pills = settings.suggestionStyle === "pills";
  return (
    <div
      ref={scrollRef}
      className="allm-h-full allm-overflow-y-auto allm-px-2 allm-py-4 allm-no-scroll"
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

// Begrüßung bleibt im Verlauf (greetingStyle "bubble"): nach der ersten
// Frage und nach dem Laden eines Verlaufs steht sie als festes erstes
// Element über den Nachrichten (kein Chat-Eintrag, wird nie gesendet oder
// gespeichert; ChatHistory) — Blase mit Datenschutz-Absatz bzw. kleinem
// greeting-Text, ohne die Vorschläge.
export function PanelGreeting({ settings = {} }) {
  return <WelcomeBlock settings={settings} persistent />;
}

// Blase (Avatar + Text) samt kleinem greeting-Text; children = Vorschläge
// zwischen Blase und greeting-Text (nur im leeren Chat).
function WelcomeBlock({ settings, persistent = false, children = null }) {
  const texts = panelTexts(settings);
  const privacyInBubble = settings.privacyNotice === "bubble";
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
          }}
        />
        <div
          id="anything-llm-greeting-bubble"
          className="allm-font-sans"
          style={{
            // ≈ Breite der Antwortblasen; border-box: 80 % inkl. Polsterung
            boxSizing: "border-box",
            maxWidth: "80%",
            padding: "11px 16px",
            backgroundColor: "var(--allmi-assistant-bg, #FFFFFF)",
            color: "var(--allmi-assistant-text, #222628)",
            borderRadius: BUBBLE_RADIUS.assistant,
            boxShadow: BUBBLE_SHADOW,
            fontSize: "var(--allmi-font-size, 14px)",
            lineHeight: 1.5,
            whiteSpace: "pre-line",
            overflowWrap: "anywhere",
          }}
        >
          {settings.greetingBubbleText || texts.greetingBubble}
          {privacyInBubble && (
            <BubblePrivacy settings={settings} texts={texts} />
          )}
        </div>
      </div>
      {children}
      {settings.greeting && !privacyInBubble && (
        <p
          id="anything-llm-greeting-small"
          className="allm-font-sans"
          style={{
            margin: 0,
            paddingLeft: BUBBLE_INSET,
            paddingRight: "8px",
            fontSize: "11.5px",
            lineHeight: 1.45,
            color: "var(--allmi-text-muted, #6b7280)",
          }}
        >
          {settings.greeting}
        </p>
      )}
    </div>
  );
}

// Datenschutz in der Begrüßungsblase (privacyNotice "bubble"): EIN Absatz
// unter dem Begrüßungstext, die Punkte als Fließtext (neutral, ohne
// Hervorhebung; ein Punkt ohne Satzzeichen am Ende bekommt einen Punkt),
// am Ende der Link (privacyUrl).
export function privacyParagraph(points) {
  return points.map((p) => (/[.!?…:;]$/.test(p) ? p : `${p}.`)).join(" ");
}

function BubblePrivacy({ settings, texts }) {
  return (
    <p id="anything-llm-bubble-privacy" style={{ margin: "8px 0 0" }}>
      {privacyParagraph(privacyPoints(settings))}
      {settings.privacyUrl && (
        <>
          {" "}
          <a
            href={settings.privacyUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--allmi-link, #01a5a9)",
              textDecoration: "underline",
            }}
          >
            {texts.privacyBubbleLink}
          </a>
        </>
      )}
    </p>
  );
}
