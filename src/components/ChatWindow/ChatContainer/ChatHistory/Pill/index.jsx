import { embedderSettings } from "@/main";

// Pille für Vorschläge (Wunschfragen im Panel, Folgefragen unter der
// Antwort): Form/Farben wie die Chips unter der Leiste (--allmi-bar-*), Rand-
// Übergang über .allm-inline-chip (main.jsx). Text immer als Text.
//   - Fläche beider Varianten: --allmi-pill-bg (hell wie die Leiste, dunkel
//     der Panelton), damit Start- und Folgefragen-Pillen gleich aussehen
//   - Standard: Rand --allmi-pill-border, Schrift --allmi-bar-text,
//     einzeilig, lange Texte mit … (label; voller Text im title)
//   - variant "accent" (Folgefragen): Rand im Akzent (--allmi-accent),
//     Schrift --allmi-pill-accent-text (hell der Akzent, dunkel der Text des
//     dunklen Satzes, Kontrast), langer Text bricht um statt gekürzt zu werden;
//     Hover und Tastaturfokus füllen die Pille im Akzent, Text weiß
//     (.allm-pill-accent, CSS in main.jsx, Übergang --allmi-transition)
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
      className={`allm-inline-chip allm-font-sans allm-cursor-pointer${accent ? " allm-pill-accent" : ""}`}
      style={{
        maxWidth: "100%",
        margin: 0,
        padding: "6px 14px",
        border: `1px solid ${accent || "var(--allmi-pill-border, #d1d5db)"}`,
        borderRadius: "var(--allmi-bar-radius, 999px)",
        backgroundColor: "var(--allmi-pill-bg, var(--allmi-bar-bg, #FFFFFF))",
        color: accent
          ? `var(--allmi-pill-accent-text, ${accent})`
          : "var(--allmi-bar-text, #1f2937)",
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
