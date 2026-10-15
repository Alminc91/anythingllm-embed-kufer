import { useLayoutEffect, useRef } from "react";
import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import { embedderSettings } from "@/main";
import { BUBBLE_RADIUS, BUBBLE_SHADOW } from "@/utils/theme";
import {
  greetingText,
  panelPills,
  panelTexts,
  privacyBlocks,
  privacyTitleText,
} from "@/utils/layout";
import { sendSuggestion } from "../..";
import Pill from "../Pill";

// Panel-Optik (Mockup „Wunschfragen im Panel“, Variante B; seit Design Center
// vereinfacht fester Standard: suggestionStyle "pills", greetingStyle
// "bubble", privacyNotice "bubble"); Vorschläge nur im leeren Chat, die
// Begrüßungs- und Datenschutz-Blase bleiben auch im Verlauf (PanelGreeting).
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
// die Vorschläge (Pillen links eingerückt, Balken wie bisher mittig).
// privacyNotice "bubble" (fester Standard): der Datenschutz-Hinweis steht als
// eigene zweite Blase direkt unter der Begrüßungsblase (Design Center
// vereinfacht, 15.10.2026), nicht mehr als Absatz in derselben Blase.
// Beim Öffnen ans Ende gescrollt (ohne Animation): lange Blasen (z. B. der
// Datenschutz-Hinweis im kleinen Blasenfenster) schöben die Vorschläge
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
// Frage und nach dem Laden eines Verlaufs stehen Begrüßungs- und
// Datenschutz-Blase als feste erste Elemente über den Nachrichten (kein
// Chat-Eintrag, wird nie gesendet oder gespeichert; ChatHistory), ohne die
// Vorschläge.
export function PanelGreeting({ settings = {} }) {
  return <WelcomeBlock settings={settings} persistent />;
}

// gemeinsame Optik beider Blasen (Begrüßung, Datenschutz)
const BUBBLE_STYLE = {
  boxSizing: "border-box",
  maxWidth: "100%",
  backgroundColor: "var(--allmi-assistant-bg, #FFFFFF)",
  color: "var(--allmi-assistant-text, #222628)",
  borderRadius: BUBBLE_RADIUS.assistant,
  boxShadow: BUBBLE_SHADOW,
  overflowWrap: "anywhere",
};

// Blasen (Avatar + Begrüßung + Datenschutz); children = Vorschläge darunter
// (nur im leeren Chat). Der Avatar steht neben der letzten Blase der Gruppe.
function WelcomeBlock({ settings, persistent = false, children = null }) {
  const texts = panelTexts(settings);
  const privacyBubble = settings.privacyNotice === "bubble";
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
              padding: "11px 16px",
              fontSize: "var(--allmi-font-size, 14px)",
              lineHeight: 1.5,
              whiteSpace: "pre-line",
            }}
          >
            {greetingText(settings)}
          </div>
          {privacyBubble && <PrivacyBubble settings={settings} texts={texts} />}
        </div>
      </div>
      {children}
    </div>
  );
}

// Datenschutz-Blase (privacyNotice "bubble"): optionale fette Überschrift
// (privacyTitle; "" = keine, Standard „Datenschutz“), darunter der Text
// (privacyText: Zeilen mit „•“/„-“ als Aufzählung, andere als Absätze; altes
// Format ein Punkt je Zeile weiter als Aufzählung), am Ende der Link zur
// Datenschutzerklärung (privacyUrl) in eigener Zeile. Etwas kleiner und
// gedämpft wie im Mockup. Alles Text, nie HTML.
function PrivacyBubble({ settings, texts }) {
  const title = privacyTitleText(settings);
  const groups = groupPrivacyBlocks(privacyBlocks(settings));
  return (
    <div
      id="anything-llm-privacy-bubble"
      className="allm-font-sans"
      style={{
        ...BUBBLE_STYLE,
        padding: "10px 15px",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
        fontSize: "12.5px",
        lineHeight: 1.45,
        color: "var(--allmi-text-muted, #57534e)",
      }}
    >
      {title && (
        <strong
          id="anything-llm-bubble-privacy-title"
          style={{
            display: "block",
            fontWeight: 700,
            color: "var(--allmi-assistant-text, #222628)",
          }}
        >
          {title}
        </strong>
      )}
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
      {settings.privacyUrl && (
        <a
          href={settings.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            alignSelf: "flex-start",
            color: "var(--allmi-link, #01a5a9)",
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

// Aufeinanderfolgende Aufzählungspunkte -> eine Liste; Absätze einzeln.
export function groupPrivacyBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.type === "bullet") {
      if (last?.type === "list") last.items.push(b.text);
      else out.push({ type: "list", items: [b.text] });
    } else out.push({ type: "paragraph", text: b.text });
  }
  return out;
}

// Früher: Punkte als Fließtext in der Begrüßungsblase. Bleibt als Helfer
// (Satzzeichen am Ende ergänzen) für bestehende Aufrufer.
export function privacyParagraph(points) {
  return points.map((p) => (/[.!?…:;]$/.test(p) ? p : `${p}.`)).join(" ");
}
