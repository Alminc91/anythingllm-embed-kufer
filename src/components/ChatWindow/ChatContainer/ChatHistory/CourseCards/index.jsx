import { memo, useId, useMemo } from "react";
import {
  MORE_COURSES_TEXT,
  selectCourseCards,
  teaserMap,
} from "@/utils/courseCards";

// Kurskarten zu einer Assistenten-Antwort (Setting courseCards "auto").
// Optik ausschließlich über die internen Theme-Variablen (--allmi-*, gesetzt
// aus den öffentlichen --allm-* bzw. dem hellen/dunklen Standardsatz); die
// Fallbacks gelten nur, solange im hellen Theme nichts gesetzt ist.
// Jede Karte (und jede Kompaktzeile) ist EIN Link als Block: Klick irgendwo
// auf die Karte öffnet die Kursseite; zugänglicher Name = Kurstitel; Hover
// und Fokus über --allmi-hover-bg / --allmi-focus-ring (CSS in main.jsx).
const TEXT = "var(--allmi-text, #222628)";
const MUTED = "var(--allmi-text-muted, #5f6368)";
const ACCENT = "var(--allmi-accent, #01a5a9)";
const BORDER = "var(--allmi-border, #e5e7eb)";
const SURFACE = "var(--allmi-surface, #FFFFFF)";
// --allm-radius-card (utils/theme.js), Standard 0,75 × --allm-radius
const RADIUS =
  "var(--allmi-radius-card, calc(var(--allmi-radius, 16px) * 0.75))";

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

// Titel in Link-Optik (Unterstreichung in Akzentfarbe) — der Link selbst
// ist die ganze Karte
const titleStyle = {
  color: TEXT,
  fontWeight: 600,
  textDecoration: "underline",
  textDecorationColor: ACCENT,
  textUnderlineOffset: "2px",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

// Footer-Link (Abschlusslink) — ein normaler Textlink
const linkStyle = titleStyle;

// Block-Link: keine eigene Unterstreichung/Farbe, Hintergrund per CSS-Klasse
// (Hover), nicht inline (sonst wirkt :hover nicht)
const blockLinkStyle = {
  color: TEXT,
  textDecoration: "none",
  cursor: "pointer",
};

const mutedStyle = { color: MUTED, fontSize: "12px", lineHeight: "17px" };

// Kurskarten v3: KI-Teaser als Untertext unter dem Titel — 13 px, Textfarbe,
// höchstens 2 Zeilen (Zeilenklammer), blendet beim Eintreffen ein
// (Keyframes allm-course-teaser-in in main.jsx, ohne Bewegung bei
// prefers-reduced-motion).
const teaserStyle = {
  color: TEXT,
  fontSize: "13px",
  lineHeight: "18px",
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
  overflowWrap: "anywhere",
};
const listReset = { listStyle: "none", margin: 0, padding: 0 };
const itemStyle = { display: "flex", minWidth: 0 };

function joinParts(parts) {
  return parts.filter(Boolean).join(" · ");
}

// card.url ist immer gesetzt (selectCourseCards nimmt nur http(s)-Kurs-URLs).
// Fallback-Karte (card.fallback, Kurs ohne Serverdaten): nur der Titel —
// die Metadaten-Zeilen fehlen einfach, sonst gleiche Karte (auch ohne
// Teaser). teaser = KI-Teaser (Kurskarten v3), sonst null.
function Card({ card, teaser = null }) {
  const id = useId();
  const details = joinParts([card.start, card.place, card.price]);
  const showTeaser = !!teaser && !card.fallback;
  // Beschreibung = die sichtbaren Zeilen (Name = Titel per aria-label)
  const describedBy = [
    card.schedule && `${id}-s`,
    showTeaser && `${id}-t`,
    details && `${id}-d`,
    card.status && `${id}-b`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li style={itemStyle}>
      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={card.title}
        aria-describedby={describedBy || undefined}
        data-course-link=""
        data-course-fallback={card.fallback ? "" : undefined}
        className="allm-course-card"
        style={{
          ...boxStyle,
          ...blockLinkStyle,
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {card.schedule && (
          <span
            id={`${id}-s`}
            className="allm-course-schedule"
            style={{ ...mutedStyle, fontWeight: 600 }}
          >
            {card.schedule}
          </span>
        )}
        <span
          className="allm-course-title"
          style={{
            ...titleStyle,
            display: "block",
            fontSize: "14px",
            lineHeight: "19px",
          }}
        >
          {card.title}
        </span>
        {showTeaser && (
          <span
            id={`${id}-t`}
            className="allm-course-teaser"
            data-course-teaser=""
            style={teaserStyle}
          >
            {teaser}
          </span>
        )}
        {details && (
          <span
            id={`${id}-d`}
            className="allm-course-details"
            style={mutedStyle}
          >
            {details}
          </span>
        )}
        {card.status && (
          <span
            id={`${id}-b`}
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
      </a>
    </li>
  );
}

function CompactRow({ card, first }) {
  const lead = joinParts([card.weekdays, card.time]);
  return (
    <li style={{ minWidth: 0 }}>
      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={card.title}
        data-course-link=""
        className="allm-course-row"
        style={{
          ...blockLinkStyle,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          columnGap: "6px",
          padding: "6px 0",
          borderTop: first ? "none" : `1px solid ${BORDER}`,
        }}
      >
        {lead && (
          <span
            style={{ ...mutedStyle, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            {lead}
          </span>
        )}
        <span
          className="allm-course-title"
          style={{ ...titleStyle, minWidth: 0 }}
        >
          {card.title}
        </span>
        {card.place && <span style={mutedStyle}>· {card.place}</span>}
      </a>
    </li>
  );
}

// Karten als Raster (einspaltig bei schmaler Breite); teasers = Map
// normalisierte URL -> Teaser (Kurskarten v3, sonst leer)
function CardList({ cards, teasers = null }) {
  return (
    <ul
      className="allm-course-list"
      style={{
        ...listReset,
        display: "grid",
        gap: "8px",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))",
      }}
    >
      {cards.map((card) => (
        <Card key={card.key} card={card} teaser={teasers?.get(card.key)} />
      ))}
    </ul>
  );
}

function MoreLine() {
  return (
    <p
      className="allm-course-more"
      style={{ ...mutedStyle, margin: "6px 0 0" }}
    >
      {MORE_COURSES_TEXT}
    </p>
  );
}

function CategoryLink({ categoryLink }) {
  return (
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
  );
}

// courseCards als String-Prop (kein Objekt pro Render) -> memo greift;
// die Aktivierung prüft allein selectCourseCards.
//   Standard (position "below", part "all"): Auswahl aus reply +
//     courseSources, Karten + Abschlusslink unter der Antwort; fallback
//     (Antwort fertig): auch schlanke Karten für Kursseiten ohne Serverdaten
//   selection: fertige Auswahl (Position "above", einmal berechnet im
//     umgebenden Block, selectAnnouncedCourseCards) — part "cards": Karten
//     über der Antwort, part "footer": Abschlusslink darunter bzw. die
//     Fallback-Karten (footerCards) samt Abschlusslink
//   courseTeasers (Kurskarten v3): KI-Teaser je Karte (URL -> Text) als
//     Untertext; fehlt das Feld, sehen die Karten aus wie bisher
function CourseCards({
  reply,
  courseSources,
  courseCards,
  courseTeasers = null,
  fallback = false,
  selection: given = null,
  position = "below",
  part = "all",
}) {
  const above = position === "above";
  const teasers = useMemo(() => teaserMap(courseTeasers), [courseTeasers]);
  const computed = useMemo(
    () =>
      given
        ? null
        : selectCourseCards(
            reply,
            courseSources,
            { courseCards },
            { fallback },
          ),
    [given, reply, courseSources, courseCards, fallback],
  );
  const {
    cards,
    compact,
    categoryLink,
    more,
    footerCards = [],
    footerMore = 0,
  } = given || computed;

  if (part === "footer" && footerCards.length > 0) {
    return (
      <section
        aria-label="Weitere genannte Kurse"
        data-course-cards-footer=""
        className="allm-course-cards-footer allm-font-sans allm-mt-2 allm-ml-[54px] allm-mr-6"
        style={{ color: TEXT }}
      >
        <CardList cards={footerCards} />
        {categoryLink ? (
          <CategoryLink categoryLink={categoryLink} />
        ) : (
          footerMore > 0 && !more && <MoreLine />
        )}
      </section>
    );
  }
  if (!cards || cards.length === 0) return null;

  if (part === "footer") {
    if (!categoryLink) return null;
    return (
      <div
        data-course-cards-footer=""
        className="allm-course-cards-footer allm-font-sans allm-ml-[54px] allm-mr-6"
      >
        <CategoryLink categoryLink={categoryLink} />
      </div>
    );
  }
  const showFooter = part !== "cards";

  return (
    <section
      aria-label="Genannte Kurse"
      data-course-cards=""
      data-compact={compact ? "true" : "false"}
      data-position={above ? "above" : "below"}
      className={`allm-course-cards allm-font-sans ${above ? "allm-mb-2" : "allm-mt-2"} allm-ml-[54px] allm-mr-6`}
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
        <CardList cards={cards} teasers={teasers} />
      )}
      {showFooter && categoryLink ? (
        <CategoryLink categoryLink={categoryLink} />
      ) : (
        more > 0 && <MoreLine />
      )}
    </section>
  );
}

export default memo(CourseCards);
