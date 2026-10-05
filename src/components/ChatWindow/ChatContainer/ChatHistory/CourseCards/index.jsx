import { memo, useMemo } from "react";
import { MORE_COURSES_TEXT, selectCourseCards } from "@/utils/courseCards";

// Kurskarten unter einer Assistenten-Antwort (Setting courseCards "auto").
// Optik ausschließlich über die internen Theme-Variablen (--allmi-*, gesetzt
// aus den öffentlichen --allm-* bzw. dem hellen/dunklen Standardsatz); die
// Fallbacks gelten nur, solange im hellen Theme nichts gesetzt ist.
const TEXT = "var(--allmi-text, #222628)";
const MUTED = "var(--allmi-text-muted, #5f6368)";
const ACCENT = "var(--allmi-accent, #01a5a9)";
const BORDER = "var(--allmi-border, #e5e7eb)";
const SURFACE = "var(--allmi-surface, #FFFFFF)";
const RADIUS = "calc(var(--allmi-radius, 16px) * 0.75)";

const boxStyle = {
  boxSizing: "border-box",
  minWidth: 0,
  backgroundColor: SURFACE,
  color: TEXT,
  border: `1px solid ${BORDER}`,
  borderLeft: `3px solid ${ACCENT}`,
  borderRadius: RADIUS,
  padding: "10px 12px",
  fontSize: "13px",
  lineHeight: "18px",
};

const linkStyle = {
  color: TEXT,
  fontWeight: 600,
  textDecoration: "underline",
  textDecorationColor: ACCENT,
  textUnderlineOffset: "2px",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const mutedStyle = { color: MUTED, fontSize: "12px", lineHeight: "17px" };
const listReset = { listStyle: "none", margin: 0, padding: 0 };

function joinParts(parts) {
  return parts.filter(Boolean).join(" · ");
}

// card.url ist immer gesetzt (selectCourseCards nimmt nur http(s)-Kurs-URLs)
function CourseTitle({ card, style }) {
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...linkStyle, ...style }}
      data-course-link=""
    >
      {card.title}
    </a>
  );
}

function Card({ card }) {
  const details = joinParts([card.start, card.place, card.price]);
  return (
    <li
      className="allm-course-card"
      style={{
        ...boxStyle,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      {card.schedule && (
        <span
          className="allm-course-schedule"
          style={{ ...mutedStyle, fontWeight: 600 }}
        >
          {card.schedule}
        </span>
      )}
      <CourseTitle
        card={card}
        style={{ display: "block", fontSize: "14px", lineHeight: "19px" }}
      />
      {details && (
        <span className="allm-course-details" style={mutedStyle}>
          {details}
        </span>
      )}
      {card.status && (
        <span
          className="allm-course-status"
          style={{
            alignSelf: "flex-start",
            marginTop: "4px",
            padding: "0 8px",
            borderRadius: "999px",
            border: `1px solid ${card.bookable ? ACCENT : BORDER}`,
            color: TEXT,
            fontSize: "11px",
            lineHeight: "18px",
          }}
        >
          {card.status}
        </span>
      )}
    </li>
  );
}

function CompactRow({ card, first }) {
  const lead = joinParts([card.weekdays, card.time]);
  return (
    <li
      className="allm-course-row"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: "6px",
        padding: "6px 0",
        borderTop: first ? "none" : `1px solid ${BORDER}`,
      }}
    >
      {lead && (
        <span style={{ ...mutedStyle, fontWeight: 600, whiteSpace: "nowrap" }}>
          {lead}
        </span>
      )}
      <CourseTitle card={card} style={{ minWidth: 0 }} />
      {card.place && <span style={mutedStyle}>· {card.place}</span>}
    </li>
  );
}

// courseCards als String-Prop (kein Objekt pro Render) -> memo greift;
// die Aktivierung prüft allein selectCourseCards.
function CourseCards({ reply, courseSources, courseCards }) {
  const selection = useMemo(
    () => selectCourseCards(reply, courseSources, { courseCards }),
    [reply, courseSources, courseCards],
  );
  const { cards, compact, categoryLink, more } = selection;
  if (!cards || cards.length === 0) return null;

  return (
    <section
      aria-label="Genannte Kurse"
      data-course-cards=""
      data-compact={compact ? "true" : "false"}
      className="allm-course-cards allm-font-sans allm-mt-2 allm-ml-[54px] allm-mr-6"
      style={{ color: TEXT }}
    >
      {compact ? (
        <ul
          className="allm-course-compact"
          style={{ ...listReset, ...boxStyle, padding: "4px 12px" }}
        >
          {cards.map((card, i) => (
            <CompactRow key={card.key} card={card} first={i === 0} />
          ))}
        </ul>
      ) : (
        <ul
          className="allm-course-list"
          style={{
            ...listReset,
            display: "grid",
            gap: "8px",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 220px), 1fr))",
          }}
        >
          {cards.map((card) => (
            <Card key={card.key} card={card} />
          ))}
        </ul>
      )}
      {categoryLink ? (
        <a
          href={categoryLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="allm-course-category"
          style={{
            ...linkStyle,
            display: "inline-block",
            marginTop: "8px",
            fontSize: "13px",
          }}
        >
          {categoryLink.text} →
        </a>
      ) : (
        more > 0 && (
          <p
            className="allm-course-more"
            style={{ ...mutedStyle, margin: "6px 0 0" }}
          >
            {MORE_COURSES_TEXT}
          </p>
        )
      )}
    </section>
  );
}

export default memo(CourseCards);
