import { Info } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { embedderSettings } from "@/main";
import { useEscapeLayer } from "@/utils/escape";
import { uiTexts } from "@/utils/layout";
import { HEADER_ICON_STYLE } from "@/utils/theme";

// Kursanzahl statt des Untertitels (KIE-576 Paket 3, Mockup „Entscheidung“):
// „aktuell 837 Kurse“ in einer Zeile, die Zahl fett, daneben der Info-Knopf
// (Trefferfläche 24 px, ohne die Zeile zu erhöhen: der Kopf bleibt 76 px).
// Der Knopf öffnet eine kleine Dialogkarte unter dem Kopf (Muster
// PrivacyNotice: role dialog, nur Text, Farben über --allmi-*): Kurse im
// KI-Berater, Umfang, ausgeblendete beendete und fehlende Kurse (nur wenn
// es welche gibt), ab 5 % Lücke der Hinweis auf die Kurssuche, Stand (D-K5).
// Schließen per Escape (Ebene in utils/escape.js, Fokus zurück auf den
// Knopf), Klick daneben (im Widget und auf der Webseite), erneuten Klick
// oder wenn der Fokus von Knopf oder Karte per Tab ein anderes Element
// erreicht (focusout am umgebenden Element, Fixliste r2b Nr. 8).
// texts = utils/courseCount.js courseCountTexts (nie null hier).
export default function CourseCountSubtitle({ settings, texts }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const cardRef = useRef(null);
  const ui = uiTexts(settings);
  const id = useId();
  const cardId = `anything-llm-course-count-info${id.replace(/:/g, "")}`;

  useEscapeLayer(open, () => setOpen(false), {
    within: () => [buttonRef.current, cardRef.current],
    returnFocus: () => buttonRef.current,
  });

  // Klick daneben: im Widget über den Shadow Root (wie das Menü unter ⋮),
  // auf der Webseite über das document (dort ist ein Klick ins Widget auf
  // den Host umgelenkt und zählt nicht). Ohne Shadow Root (Tests) entscheidet
  // allein der Listener am document.
  useEffect(() => {
    if (!open) return;
    const inside = (target) =>
      !!target &&
      (cardRef.current?.contains(target) ||
        buttonRef.current?.contains(target));
    const root = embedderSettings.shadowRoot || null;
    const host = embedderSettings.hostElement || null;
    const onRoot = (e) => {
      if (!inside(e.target)) setOpen(false);
    };
    const onDocument = (e) => {
      const path = e.composedPath?.() || [];
      if (host && path.includes(host)) return;
      if (inside(path[0] || e.target)) return;
      setOpen(false);
    };
    root?.addEventListener("mousedown", onRoot);
    document.addEventListener("mousedown", onDocument);
    return () => {
      root?.removeEventListener("mousedown", onRoot);
      document.removeEventListener("mousedown", onDocument);
    };
  }, [open]);

  // Geöffnet: Fokus in die Karte, damit Screenreader sie vorlesen (sie hat
  // keine bedienbaren Elemente); Tab führt aus ihr heraus weiter
  useEffect(() => {
    if (open) cardRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Fokus wandert per Tab von Knopf oder Karte auf ein anderes Element:
  // Karte zu (sonst bliebe sie offen, und Escape schlösse das Fenster).
  // Ohne neues Ziel (Fensterwechsel, Klick auf Text) bleibt sie offen; ein
  // Klick daneben schließt sie über den Listener oben.
  const onBlur = (e) => {
    if (!open) return;
    const next = e.relatedTarget;
    if (!next) return;
    if (cardRef.current?.contains(next) || buttonRef.current?.contains(next))
      return;
    setOpen(false);
  };

  return (
    <div
      id="anything-llm-header-course-count"
      onBlur={onBlur}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        minWidth: 0,
        fontSize: "11.5px",
        lineHeight: 1.35,
        whiteSpace: "nowrap",
        color: "var(--allmi-text-muted, #6b7280)",
      }}
    >
      {/* eine Zeile: reicht der Platz nicht (sehr lange Bezeichnung), wird
          der Text gekürzt, der Knopf bleibt sichtbar; die Karte nennt alles */}
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
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
      <button
        ref={buttonRef}
        type="button"
        id="anything-llm-course-count-button"
        aria-label={ui.courseCountInfo}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="allm-cursor-pointer allm-border-none allm-p-0 allm-flex allm-items-center allm-justify-center allm-flex-shrink-0 hover:allm-bg-[color:var(--allmi-hover-bg,#f3f4f6)]"
        style={{
          ...HEADER_ICON_STYLE,
          width: "24px",
          height: "24px",
          margin: "-4px 0",
          borderRadius: "50%",
          backgroundColor: open
            ? "var(--allmi-hover-bg, #e5e7eb)"
            : "transparent",
        }}
      >
        <Info size={15} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={cardRef}
          id={cardId}
          role="dialog"
          aria-label={ui.courseCountDialog}
          tabIndex={-1}
          className="allm-font-sans"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: "72px",
            right: "12px",
            maxWidth: "360px",
            // über der Datenschutz-Sperre (PrivacyNotice, 60) im selben
            // Stapelkontext: die Karte bleibt lesbar (Fixliste r2b Nr. 8)
            zIndex: 61,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "12px 14px",
            borderRadius: "10px",
            // umgekehrte Farben des Fensters: hell dunkel, dunkel hell
            backgroundColor: "var(--allmi-text, #1f2937)",
            color: "var(--allmi-surface, #FFFFFF)",
            boxShadow: "0 8px 24px rgba(20, 30, 50, 0.18)",
            fontSize: "13px",
            lineHeight: 1.45,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            textAlign: "left",
            outline: "none",
          }}
        >
          <span style={{ fontWeight: 600 }}>{texts.head}</span>
          <span>{texts.scope}</span>
          {texts.hiddenLine && <span>{texts.hiddenLine}</span>}
          {texts.missingLine && <span>{texts.missingLine}</span>}
          {texts.gapHint && <span>{texts.gapHint}</span>}
          <span style={{ opacity: 0.82 }}>{texts.stand}</span>
        </div>
      )}
    </div>
  );
}
