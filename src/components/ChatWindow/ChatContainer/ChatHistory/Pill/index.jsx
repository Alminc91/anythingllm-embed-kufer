import { embedderSettings } from "@/main";

// Pille im Panel: EINE Komponente für Startvorschläge (Wunschfragen im
// leeren Chat) und Folgefragen unter der Antwort (KIE-565 Nachtrag, Punkt 4:
// Startvorschläge sehen aus und reagieren wie die Folgefragen). Chatblase und
// Inline, hell und dunkel; Farben nur über --allmi-*:
//   - Fläche --allmi-pill-bg (hell Weiß, dunkel der Panelton)
//   - Rand --allmi-pill-border (Akzentfarbe aus dem Design Center,
//     --allmi-accent, Gruppe A)
//   - Schrift --allmi-pill-accent-text: Kundenfarbe mit mindestens 4,5:1 zur
//     Fläche (hell ggf. abgedunkelt, dunkel ggf. aufgehellt; utils/theme.js
//     pillTextColor)
//   - Hover und Tastaturfokus füllen die Pille in Kundenfarbe, Schrift dann
//     --allmi-on-accent (Schrift auf der Kundenfarbe aus dem Design Center,
//     Gruppe A; .allm-pill-accent, CSS in main.jsx, Übergang
//     --allmi-transition)
//   - langer Text bricht um; label = Anzeige (Startvorschläge ab 60 Zeichen
//     mit … gekürzt, voller Text im title und beim Senden)
// Text immer als Text, nie als HTML.
export const PILL_CLASS =
  "allm-inline-chip allm-pill-accent allm-font-sans allm-cursor-pointer";

export default function Pill({ text, label = text, onClick }) {
  const accent = `var(--allmi-accent, ${embedderSettings.settings?.buttonColor || "#01a5a9"})`;
  return (
    <button
      type="button"
      title={label !== text ? text : undefined}
      onClick={onClick}
      className={PILL_CLASS}
      style={{
        maxWidth: "100%",
        margin: 0,
        padding: "6px 14px",
        border: `1px solid var(--allmi-pill-border, ${accent})`,
        borderRadius: "var(--allmi-bar-radius, 999px)",
        backgroundColor: "var(--allmi-pill-bg, #FFFFFF)",
        color: `var(--allmi-pill-accent-text, ${accent})`,
        fontSize: "12.5px",
        lineHeight: 1.3,
        textAlign: "left",
        wordBreak: "break-word",
      }}
    >
      {label}
    </button>
  );
}
