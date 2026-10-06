import { embedderSettings } from "@/main";

// Pille für Vorschläge (Wunschfragen im Panel, Folgefragen unter der
// Antwort): Form/Farben wie die Chips unter der Leiste (--allmi-bar-*), Rand-
// Übergang über .allm-inline-chip (main.jsx). Text immer als Text.
//   - Standard: Rand --allmi-pill-border, Schrift --allmi-bar-text,
//     einzeilig, lange Texte mit … (label; voller Text im title)
//   - variant "accent" (Folgefragen): Rand und Schrift im Akzent
//     (--allmi-accent), langer Text bricht um statt gekürzt zu werden
export default function Pill({ text, label = text, onClick, variant = null }) {
  const accent =
    variant === "accent"
      ? `var(--allmi-accent, ${embedderSettings.settings?.buttonColor || "#01a5a9"})`
      : null;
  return (
    <button
      type="button"
      title={label !== text ? text : undefined}
      onClick={onClick}
      className="allm-inline-chip allm-font-sans allm-cursor-pointer"
      style={{
        maxWidth: "100%",
        margin: 0,
        padding: "6px 14px",
        border: `1px solid ${accent || "var(--allmi-pill-border, #d1d5db)"}`,
        borderRadius: "var(--allmi-bar-radius, 999px)",
        backgroundColor: "var(--allmi-bar-bg, #FFFFFF)",
        color: accent || "var(--allmi-bar-text, #1f2937)",
        fontSize: "12.5px",
        lineHeight: 1.3,
        ...(accent
          ? { textAlign: "left", wordBreak: "break-word" }
          : {
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }),
      }}
    >
      {label}
    </button>
  );
}
