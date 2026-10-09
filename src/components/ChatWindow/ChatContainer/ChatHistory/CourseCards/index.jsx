import { memo, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MORE_COURSES_TEXT,
  rowLead,
  rowMeta,
  selectCourseCards,
  teaserFadeIn,
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
// bis zu 3 Zeilen (15–20 Wörter passen auch in eine schmale Karte ohne
// Ellipse; die Zeilenklammer kürzt nur als letzter Ausweg). Blendet nur ein, wenn er nach der
// schon sichtbaren Karte ankommt (Teaser, teaserFadeIn; Keyframes
// allm-course-teaser-in in main.jsx, ohne Bewegung bei
// prefers-reduced-motion).
const teaserStyle = {
  color: TEXT,
  fontSize: "13px",
  lineHeight: "18px",
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 3,
  overflow: "hidden",
  overflowWrap: "anywhere",
};
const listReset = { listStyle: "none", margin: 0, padding: 0 };
const itemStyle = { display: "flex", minWidth: 0 };
const TEASER_LINE_PX = 18;
// Zeilen-Karten nur ab dieser Kartenbreite; schmaler = Rasterkarte
export const ROW_CARD_MIN_PX = 480;
// Zeilen-Karte: Teaser-Zeilen nach Kartenbreite — 20 Wörter brauchen
// ≈ 500 px Textbreite für zwei Zeilen (Karte ≈ 680 px abzüglich Zeit-Spalte,
// Pille, Polsterung); schmaler 3 Zeilen. Raster immer 3.
export const ROW_TEASER_2_LINES_MIN_PX = 680;
const rowTeaserLines = (width) => (width >= ROW_TEASER_2_LINES_MIN_PX ? 2 : 3);
const GRID_TEASER_LINES = 3;

// Eigene Komponente: mountet erst, wenn der Teaser da ist — die Entscheidung
// "einblenden" fällt einmal beim Erscheinen (kein erneutes Einblenden bei
// späteren Renders). reserve = Zeilen, die vorher der Platzhalter belegt hat
// (min-height, die Karte wird beim Ersetzen nicht kleiner oder größer).
function Teaser({
  id,
  text,
  arrivedAt = null,
  lines,
  reserve = 0,
  placement = null,
}) {
  const [fadeIn] = useState(() => teaserFadeIn(arrivedAt));
  return (
    <span
      id={id}
      className={
        fadeIn
          ? "allm-course-teaser allm-course-teaser-in"
          : "allm-course-teaser"
      }
      data-course-teaser=""
      style={{
        ...teaserStyle,
        ...(placement || {}),
        WebkitLineClamp: lines,
        ...(reserve > 0 && { minHeight: `${reserve * TEASER_LINE_PX}px` }),
      }}
    >
      {text}
    </span>
  );
}

// Platzhalter an der Teaser-Stelle (Karten oben, Teaser erwartet): gedämpft,
// pulsierend (CSS allm-course-teaser-pending in main.jsx, ruhig bei
// prefers-reduced-motion), reserviert die Höhe des Teasers (lines Zeilen).
// Immer Text (React escaped), nie HTML.
function TeaserPending({ text, lines, placement = null }) {
  return (
    <span
      className="allm-course-teaser-pending"
      data-teaser-pending=""
      style={{
        display: "block",
        color: MUTED,
        fontSize: "13px",
        lineHeight: `${TEASER_LINE_PX}px`,
        height: `${lines * TEASER_LINE_PX}px`,
        overflow: "hidden",
        overflowWrap: "anywhere",
        ...(placement || {}),
      }}
    >
      {text}
    </span>
  );
}

// Teaser-Stelle einer Karte: Teaser, Platzhalter oder nichts. Hat die Karte
// einmal den Platzhalter gezeigt, behält der Teaser dessen Höhe (reserve).
function useTeaserSlot({ teaser, pending, fallback, lines }) {
  const reservedRef = useRef(0);
  const showTeaser = !!teaser && !fallback;
  const showPending = !showTeaser && !!pending && !fallback;
  if (showPending) reservedRef.current = lines;
  return { showTeaser, showPending, reserve: reservedRef.current };
}

function joinParts(parts) {
  return parts.filter(Boolean).join(" · ");
}

// card.url ist immer gesetzt (selectCourseCards nimmt nur http(s)-Kurs-URLs).
// Fallback-Karte (card.fallback, Kurs ohne Serverdaten): nur der Titel —
// die Metadaten-Zeilen fehlen einfach, sonst gleiche Karte (auch ohne
// Teaser). teaser = KI-Teaser (Kurskarten v3), sonst null; teaserArrivedAt
// = Ankunft des Teasers im Stream (nur Karten oben, sonst null).
// pending = Teaser erwartet (Platzhalter, nur Karten oben im Stream)
function Card({ card, teaser = null, teaserArrivedAt = null, pending = null }) {
  const id = useId();
  const details = joinParts([card.start, card.place, card.price]);
  const { showTeaser, showPending, reserve } = useTeaserSlot({
    teaser,
    pending,
    fallback: card.fallback,
    lines: GRID_TEASER_LINES,
  });
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
          <Teaser
            id={`${id}-t`}
            text={teaser}
            arrivedAt={teaserArrivedAt}
            lines={GRID_TEASER_LINES}
            reserve={reserve}
          />
        )}
        {showPending && (
          <TeaserPending text={pending} lines={GRID_TEASER_LINES} />
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

// Status-Pille (Raster und Zeilen-Karte): "buchbar" mit Akzentrahmen,
// "nicht buchbar" neutral
const statusStyle = (bookable) => ({
  padding: "0 8px",
  borderRadius: "999px",
  border: `1px solid ${bookable ? ACCENT : BORDER}`,
  color: TEXT,
  fontSize: "11px",
  lineHeight: "18px",
  whiteSpace: "nowrap",
});

// Zeilen-Karte (courseCardsLayout "rows", Kartenbreite >= 480 px): links
// Wochentag + Uhrzeit in Akzentfarbe (Tabellenziffern), Mitte Titel, Meta-
// Zeile und Teaser (höchstens 2 Zeilen) bzw. Platzhalter, rechts die
// Status-Pille; Zeit und Pille mittig zum Kopfblock Titel + Meta (Variante C). Wie die Rasterkarte EIN Link (Name = Titel), Beschreibung =
// sichtbare Zeilen; Hover/Fokus über .allm-course-card (main.jsx).
function CardRow({
  card,
  teaser = null,
  teaserArrivedAt = null,
  pending = null,
  lines = 2,
}) {
  const id = useId();
  const lead = rowLead(card);
  const meta = rowMeta(card);
  const { showTeaser, showPending, reserve } = useTeaserSlot({
    teaser,
    pending,
    fallback: card.fallback,
    lines,
  });
  const describedBy = [
    lead && `${id}-s`,
    meta && `${id}-d`,
    showTeaser && `${id}-t`,
    card.status && `${id}-b`,
  ]
    .filter(Boolean)
    .join(" ");
  // Variante C (Entwurf der Designerin): Zeit und Status-Pille sitzen auf der
  // Mitte des Kopfblocks aus Titel + Metazeile; der Teaser (oder Platzhalter)
  // hängt als eigene Zeile darunter. Raster statt Flex, damit die Spalten die
  // Kopfzeilen überspannen können; ohne Metazeile zentriert auf den Titel.
  const headRows = meta ? 2 : 1;
  const contentCol = lead ? 2 : 1;
  const statusCol = contentCol + 1;
  const sideCell = {
    alignSelf: "center",
    gridRow: `1 / ${headRows + 1}`,
  };
  return (
    <li style={itemStyle}>
      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={card.title}
        aria-describedby={describedBy || undefined}
        data-course-link=""
        data-course-row=""
        data-course-fallback={card.fallback ? "" : undefined}
        className="allm-course-card allm-course-card-row"
        style={{
          ...blockLinkStyle,
          boxSizing: "border-box",
          minWidth: 0,
          flex: "1 1 auto",
          backgroundColor: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: RADIUS,
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: `${lead ? "auto " : ""}minmax(0, 1fr)${
            card.status ? " auto" : ""
          }`,
          columnGap: "14px",
          rowGap: "2px",
          alignItems: "start",
          fontSize: "13px",
          lineHeight: "18px",
        }}
      >
        {lead && (
          <span
            id={`${id}-s`}
            className="allm-course-when"
            style={{
              ...sideCell,
              gridColumn: 1,
              minWidth: "4.5em",
              color: ACCENT,
              fontWeight: 600,
              fontSize: "13px",
              lineHeight: "19px",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {lead}
          </span>
        )}
        <span
          className="allm-course-title"
          style={{
            gridColumn: contentCol,
            gridRow: 1,
            minWidth: 0,
            color: TEXT,
            fontWeight: 600,
            fontSize: "14px",
            lineHeight: "19px",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
            overflowWrap: "anywhere",
          }}
        >
          {card.title}
        </span>
        {meta && (
          <span
            id={`${id}-d`}
            className="allm-course-details"
            style={{
              ...mutedStyle,
              gridColumn: contentCol,
              gridRow: 2,
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            {meta}
          </span>
        )}
        {showTeaser && (
          <Teaser
            id={`${id}-t`}
            text={teaser}
            arrivedAt={teaserArrivedAt}
            lines={lines}
            reserve={reserve}
            placement={{
              gridColumn: contentCol,
              gridRow: headRows + 1,
              minWidth: 0,
            }}
          />
        )}
        {showPending && (
          <TeaserPending
            text={pending}
            lines={lines}
            placement={{
              gridColumn: contentCol,
              gridRow: headRows + (showTeaser ? 2 : 1),
              minWidth: 0,
            }}
          />
        )}
        {card.status && (
          <span
            id={`${id}-b`}
            className="allm-course-status"
            style={{
              ...statusStyle(card.bookable),
              ...sideCell,
              gridColumn: statusCol,
            }}
          >
            {card.status}
          </span>
        )}
      </a>
    </li>
  );
}

// Breite der Kartenliste (= Kartenbreite, eine Spalte), gemessen vor dem
// Paint und bei jeder Größenänderung; ohne Layout (Breite 0: ausgeblendet,
// jsdom) gilt "breit" (Infinity) — beim Einblenden misst der ResizeObserver
// neu. State wechselt nur an den Schwellen (Zeilen-Karte ja/nein, Teaser-
// Zeilen), nicht bei jedem Pixel.
const listWidthClass = (w) =>
  !(w > 0)
    ? Infinity
    : w < ROW_CARD_MIN_PX
      ? 0
      : w < ROW_TEASER_2_LINES_MIN_PX
        ? ROW_CARD_MIN_PX
        : ROW_TEASER_2_LINES_MIN_PX;
function useListWidth(ref, active) {
  const [width, setWidth] = useState(Infinity);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const check = (w) => setWidth(listWidthClass(w));
    check(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) =>
      check(entries[0]?.contentRect?.width ?? el.clientWidth),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);
  return width;
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
// normalisierte URL -> Teaser (Kurskarten v3, sonst leer). layout "rows":
// Zeilen-Karten untereinander, unter ROW_CARD_MIN_PX Listenbreite die
// Rasterkarte einspaltig. pending = Text des Platzhalters, solange Teaser
// erwartet werden (sonst null).
function CardList({
  cards,
  teasers = null,
  teaserArrivedAt = null,
  layout = "grid",
  pending = null,
}) {
  const ref = useRef(null);
  const rows = layout === "rows";
  const width = useListWidth(ref, rows);
  const wide = width >= ROW_CARD_MIN_PX;
  const Item = rows && wide ? CardRow : Card;
  return (
    <ul
      ref={ref}
      className="allm-course-list"
      data-layout={rows ? (wide ? "rows" : "rows-narrow") : undefined}
      style={{
        ...listReset,
        display: "grid",
        gap: "8px",
        gridTemplateColumns: rows
          ? "minmax(0, 1fr)"
          : "repeat(auto-fill, minmax(min(100%, 220px), 1fr))",
      }}
    >
      {cards.map((card) => (
        <Item
          key={card.key}
          card={card}
          teaser={teasers?.get(card.key)}
          teaserArrivedAt={teaserArrivedAt}
          pending={pending}
          {...(Item === CardRow && { lines: rowTeaserLines(width) })}
        />
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
//   teasers (Kurskarten v3): KI-Teaser je Karte als Untertext — Map aus
//     teaserMap, einmal je Antwort berechnet (auch für die Sprachausgabe);
//     fehlt sie, sehen die Karten aus wie bisher.
//     teaserArrivedAt: nur Karten oben — Teaser kam nach den Karten an und
//     blendet ein (unter der Antwort erscheinen Karte und Teaser zusammen)
//   layout: "grid" (Raster, Standard) | "rows" (Zeilen-Karten, courseCardsLayout)
//   teaserPending: nur Karten oben im Stream — Text des Platzhalters an der
//     Teaser-Stelle, solange Teaser erwartet werden (ChatHistory), sonst null
function CourseCards({
  reply,
  courseSources,
  courseCards,
  teasers = null,
  teaserArrivedAt = null,
  fallback = false,
  selection: given = null,
  position = "below",
  part = "all",
  layout = "grid",
  teaserPending = null,
}) {
  const above = position === "above";
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
        <CardList cards={footerCards} layout={layout} />
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
        <CardList
          cards={cards}
          teasers={teasers}
          teaserArrivedAt={teaserArrivedAt}
          layout={layout}
          pending={teaserPending}
        />
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
