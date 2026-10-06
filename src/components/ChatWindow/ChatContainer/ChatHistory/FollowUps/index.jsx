import { useRef, useState } from "react";
import { embedderSettings } from "@/main";
import { followUpsList } from "@/utils/courseCards";
import { panelTexts } from "@/utils/layout";
import { sendSuggestion } from "../..";

// Folgefragen (followUps "pills"): Vorschläge des Modells für die nächste
// Frage als Pillen unter der letzten Antwort (Mockup „Antworten“, Fassung
// B). Ob sie erscheinen (letzte Antwort, fertig, Eingabe frei), entscheidet
// ChatHistory. Ein Klick sendet den Text als nächste Frage (sendSuggestion);
// danach verschwinden die Pillen sofort, weitere Klicks senden nichts.
// Rand und Schrift im Akzent (--allm-accent), Form wie die Panel-Pillen;
// Einzug wie die Kurskarten (bündig mit der Antwortblase). Texte als Text.
export default function FollowUps({ items = null, settings = {} }) {
  const [sent, setSent] = useState(false);
  const sentRef = useRef(false);
  const list = followUpsList(items);
  if (sent || list.length === 0) return null;
  const accent = `var(--allmi-accent, ${embedderSettings.settings?.buttonColor || "#01a5a9"})`;
  const send = (text) => {
    if (sentRef.current) return;
    sentRef.current = true;
    setSent(true);
    sendSuggestion(text);
  };
  return (
    <div
      id="anything-llm-follow-ups"
      role="group"
      aria-label={panelTexts(settings).followUps}
      className="allm-font-sans allm-mt-2 allm-ml-[54px] allm-mr-6"
      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
    >
      {list.map((text, i) => (
        <button
          key={i}
          type="button"
          onClick={() => send(text)}
          className="allm-follow-up allm-font-sans allm-cursor-pointer"
          style={{
            maxWidth: "100%",
            margin: 0,
            padding: "6px 14px",
            border: `1px solid ${accent}`,
            borderRadius: "var(--allmi-bar-radius, 999px)",
            backgroundColor: "var(--allmi-bar-bg, #FFFFFF)",
            color: accent,
            fontSize: "12.5px",
            lineHeight: 1.3,
            textAlign: "left",
            wordBreak: "break-word",
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
