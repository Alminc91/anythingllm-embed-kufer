import { useRef, useState } from "react";
import { panelTexts } from "@/utils/layout";
import { sendSuggestion } from "../..";
import Pill from "../Pill";

// Folgefragen (followUps "pills"): Vorschläge des Modells für die nächste
// Frage als Pillen unter der letzten Antwort (Mockup „Antworten“, Fassung
// B). Ob sie erscheinen (letzte Antwort, fertig, Eingabe frei) und welche
// (geprüft mit followUpsList), entscheidet ChatHistory. Ein Klick sendet den
// Text als nächste Frage (sendSuggestion); danach verschwinden die Pillen
// sofort, weitere Klicks senden nichts. Pill-Variante "accent"; Einzug wie
// die Kurskarten (bündig mit der Antwortblase).
export default function FollowUps({ items, settings }) {
  const [sent, setSent] = useState(false);
  const sentRef = useRef(false);
  if (sent || items.length === 0) return null;
  const send = (text, source) => {
    if (sentRef.current) return;
    sentRef.current = true;
    setSent(true);
    sendSuggestion(text, source);
  };
  return (
    <div
      id="anything-llm-follow-ups"
      role="group"
      aria-label={panelTexts(settings).followUps}
      className="allm-font-sans allm-mt-2 allm-ml-[54px] allm-mr-6"
      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
    >
      {items.map((text, i) => (
        <Pill
          key={i}
          text={text}
          variant="accent"
          onClick={(e) => send(text, e.currentTarget)}
        />
      ))}
    </div>
  );
}
