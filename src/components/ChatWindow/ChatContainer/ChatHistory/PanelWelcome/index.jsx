import { useLayoutEffect, useRef } from "react";
import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import { embedderSettings } from "@/main";
import { BUBBLE_RADIUS, BUBBLE_SHADOW, LOGO_RADIUS } from "@/utils/theme";
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
// "bubble"; privacyNotice "bubble" oder "none"); Vorschläge nur im leeren Chat, die
// Begrüßungs- und Datenschutz-Blase bleiben auch im Verlauf (PanelGreeting).
// Farben/Rundung ausschließlich über --allmi-* (hell/dunkel folgen dem
// Theme); Texte immer als Text, nie als HTML.

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

// greetingStyle "bubble": Begrüßung als Assistenten-Blase mit Avatar, darunter
// die Vorschläge (Pillen links eingerückt, Balken wie bisher mittig).
// privacyNotice "bubble" (Standard): der Datenschutz-Hinweis steht als
// eigene zweite Blase direkt unter der Begrüßungsblase (Design Center
// vereinfacht, 15.10.2026), nicht mehr als Absatz in derselben Blase.
// privacyNotice "none" (im Design Center ausgeschaltet, KIE-565 Nachtrag):
// keine zweite Blase, auch kein leerer Rahmen oder Abstand; die Spalte
// enthält dann nur die Begrüßungsblase.
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
