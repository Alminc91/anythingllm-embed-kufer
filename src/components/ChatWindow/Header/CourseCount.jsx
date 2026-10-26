// Kursanzahl statt des Untertitels (KIE-576 Paket 3, Mockup „Entscheidung“,
// Fixliste r4 Nr. 1): „aktuell 837 Kurse“ in einer Zeile, die Zahl fett,
// ohne Info-Knopf und ohne Karte (fehlende und ausgeblendete Kurse und der
// Stand sind Betreiber-Info). Reicht der Platz nicht (sehr lange
// Bezeichnung), wird der Text gekürzt; der Kopf bleibt 76 px.
// texts = utils/courseCount.js courseCountTexts (nie null hier), nur Text.
export default function CourseCountSubtitle({ texts }) {
  return (
    <span
      id="anything-llm-header-course-count"
      style={{
        display: "block",
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontSize: "11.5px",
        lineHeight: 1.35,
        whiteSpace: "nowrap",
        color: "var(--allmi-text-muted, #6b7280)",
      }}
    >
      {texts.lead}{" "}
      <span
        style={{
          fontWeight: 600,
          color: "var(--allmi-header-text, #1f2937)",
        }}
      >
        {texts.number}
      </span>{" "}
      {texts.word}
    </span>
  );
}
