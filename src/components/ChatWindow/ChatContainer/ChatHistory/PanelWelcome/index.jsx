import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import { embedderSettings } from "@/main";
import { BUBBLE_RADIUS, BUBBLE_SHADOW } from "@/utils/theme";
import { panelPills, panelTexts, privacyPoints } from "@/utils/layout";
import { SEND_TEXT_EVENT } from "../..";

// Panel-Optik (Mockup „Wunschfragen im Panel“, Variante B), nur im leeren
// Chat und nur auf Wunsch (suggestionStyle "pills" / greetingStyle "bubble").
// Farben/Rundung ausschließlich über --allmi-* (hell/dunkel folgen dem
// Theme); Texte immer als Text, nie als HTML.

// Abstand Blasen-Text zur linken Kante: Avatar 28px + Lücke 10px + Rand 8px
const BUBBLE_INSET = "46px";

function sendSuggestion(text) {
  window.dispatchEvent(
    new CustomEvent(SEND_TEXT_EVENT, { detail: { command: text } }),
  );
}

// Wunschfragen als kleine Pillen (Form/Farben wie die Chips unter der
// Leiste: --allmi-bar-*), umbrechend, höchstens 6, lange Texte gekürzt.
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
        <button
          key={i}
          type="button"
          title={label !== text ? text : undefined}
          onClick={() => sendSuggestion(text)}
          className="allm-inline-chip allm-font-sans allm-cursor-pointer"
          style={{
            maxWidth: "100%",
            margin: 0,
            padding: "6px 14px",
            border: "1px solid var(--allmi-bar-border, #d1d5db)",
            borderRadius: "var(--allmi-bar-radius, 999px)",
            backgroundColor: "var(--allmi-bar-bg, #FFFFFF)",
            color: "var(--allmi-bar-text, #1f2937)",
            fontSize: "12.5px",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// greetingStyle "bubble": Begrüßung als Assistenten-Blase mit Avatar, darunter
// die Vorschläge (Pillen links eingerückt, Balken wie bisher mittig) und der
// greeting-Text (Datenschutzsatz) klein. privacyNotice "bubble": die
// Datenschutz-Punkte stehen als Absätze in der Blase (letzter Punkt mit
// „Wichtig:“, darunter der Link „Datenschutz“), der kleine greeting-Text
// entfällt dann (sonst doppelt).
export default function PanelWelcome({ settings = {}, suggestions = null }) {
  const pills = settings.suggestionStyle === "pills";
  const texts = panelTexts(settings);
  const privacyInBubble = settings.privacyNotice === "bubble";
  const avatar =
    embedderSettings.settings.assistantIcon ||
    embedderSettings.settings.brandImageUrl ||
    AnythingLLMIcon;
  return (
    <div className="allm-h-full allm-overflow-y-auto allm-px-2 allm-py-4 allm-no-scroll">
      <div
        id="anything-llm-panel-welcome"
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
              maxWidth: "76%",
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
    </div>
  );
}

// Datenschutz in der Begrüßungsblase (privacyNotice "bubble"): ein Absatz je
// Punkt, der letzte mit fettem „Wichtig:“, darunter der Link (privacyUrl).
function BubblePrivacy({ settings, texts }) {
  const points = privacyPoints(settings);
  const last = points.length - 1;
  return (
    <div id="anything-llm-bubble-privacy">
      {points.map((point, i) => (
        <p key={i} style={{ margin: "8px 0 0" }}>
          {i === last && !point.startsWith(texts.important) ? (
            <>
              <strong>{texts.important}</strong> {point}
            </>
          ) : (
            point
          )}
        </p>
      ))}
      {settings.privacyUrl && (
        <p style={{ margin: "8px 0 0" }}>
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
        </p>
      )}
    </div>
  );
}
