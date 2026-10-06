import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { CaretDown, ChatCircleDots } from "@phosphor-icons/react";
import ChatWindow from "@/components/ChatWindow";
import { resolveChatIcon } from "@/components/OpenButton";
import { EmbedModeContext } from "@/hooks/useEmbedMode";
import useMobileKeyboard from "@/hooks/useMobileKeyboard";
import { embedderSettings } from "@/main";
import { isCoarsePointer, isTouchDevice } from "@/utils/platform";
import { BAR_THEMES, ON_ACCENT_TEXT } from "@/utils/theme";
import {
  DEFAULT_INLINE_COLLAPSED_TEXT,
  DEFAULT_INLINE_INPUT_PLACEHOLDER,
  DEFAULT_INLINE_SEND_TEXT,
  findClippingAncestor,
  inlineBoxHeightPx,
  inlineBoxStyle,
  inlineChips,
  inlineEffectClass,
  inlineMaxWidth,
  isInlineOverlay,
  opensOnPointer,
  resolveInlineEffect,
} from "@/utils/layout";

// Kufer Inline-Modus: Chat mitten in der Webseite (im Platzhalter
// <div id="kufer-assistent">) statt als Blase.
//   eingeklappt      -> breite Leiste im Seitenfluss ("Jetzt mit unserem KI-Assistenten schreiben")
//   Tablet/Desktop   -> Klick klappt an Ort und Stelle eine Box mit FESTER Höhe
//   (>=768px)           (inlineHeight) auf, darin das normale ChatWindow
//   mobil (<768px)   -> KEINE Box in der Seite: die Leiste bleibt, Tippen öffnet
//                       immer das Vollbild-Overlay (Fokus aufs Eingabefeld in
//                       derselben Geste -> iOS öffnet die Tastatur). Dafür wird
//                       der Shadow-Host an <body> gehängt (robust gegen
//                       transform/z-index/overflow der Webseite) und im
//                       Platzhalter ein gleich hoher Abstandhalter gelassen.
// Einmal geöffnet bleibt das ChatWindow gemountet (eingeklappt nur ausgeblendet):
// eine laufende Antwort bricht nicht ab, beim Wiederöffnen wird nichts neu geladen.
// Viewport <768px bei offener Box -> eingeklappt (Leiste); zurück >=768px zeigt
// die Box wieder. inlineStartState="expanded" gilt entsprechend nur ab 768px.
//
// inlineInput (data-inline-input="true" bzw. visual_config): die eingeklappte
// Leiste ist ein Eingabefeld mit Absende-Knopf, darunter die defaultMessages
// als Chips. Enter/Knopf/Chip klappt auf UND sendet die Frage: sie wird als
// Übergabe pendingFirstMessage = { ticket, text, send, suppressAutoFocus } an
// das ChatWindow gegeben; der ChatContainer sendet jedes Ticket genau einmal,
// sobald er bereit ist. Ein neues Absenden aus der Leiste ersetzt eine noch
// nicht verbrauchte Übergabe (die ältere verfällt) und klappt immer auf;
// Zuklappen verwirft sie und legt ihren Text zurück ins Leisten-Feld (nichts
// wird unsichtbar gesendet). Klick in die Leiste neben das Feld: aufklappen,
// getippter Text landet unversendet im Chat-Eingabefeld (send: false). Es gibt
// nur EIN Eingabefeld je Zustand.
//
// inlineLayout "overlay" (ab 768px): die eingeklappte Leiste bleibt im
// Seitenfluss (unsichtbar, gleiche Höhe), die aufgeklappte Box liegt
// position:absolute darüber (oben an der Leiste, Breite der Inline-Fläche =
// Platzhalter bzw. inlineMaxWidth, Stapel --allm-overlay-z) und verschiebt den
// Inhalt darunter nicht. Klick/Tippen außerhalb des Widgets (nur linke
// Maustaste, Wischen zählt nicht) und Escape klappen ein — erst nach dem Klick,
// damit ein Link der Seite ihn sicher bekommt. Kein Scroll-Lock, keine Styles
// an body/html. Schneidet ein Vorfahre des Platzhalters (overflow hidden/clip)
// die Box ab, bleibt es im Seitenfluss (eine Warnung); geprüft bei jedem
// Aufklappen, auch beim Wiedereintritt (Drehen, Fenster wieder >=768px).
// inlineEffect: Klasse am Chat-Fenster (inlineEffectClass; ohne Angabe im
// Seitenfluss keine), Animation in main.jsx, nur beim Aufklappen durch den
// Nutzer. Solange die Box aufgeklappt ist, trägt der Platzhalter
// data-allm-expanded="true" (Signal für Seiten-CSS).
// inlineEffect "morph" (ab 768px, nicht bei reduzierter Bewegung): die Leiste
// wächst zum Panel und beim Einklappen zurück (runMorph) — die Leistenform
// wird beim Aufklappen einmal gemessen, das Panel im ersten Commit (vor dem
// Paint), dann laufen CSS-Transitionen; Einklappen erst nach dem Rückweg.
// Ein nötiger Scroll zur Box passiert vor dem Lauf (ohne Animation), nie
// währenddessen; Chips unter der Leiste blenden weich aus bzw. wieder ein.
//
// Schaltbare Variante der Eingabe-Leiste (Standard = Verhalten oben):
//   inlineOpenOn "focus"   Klick/Tippen mit Zeiger ins Leisten-Feld klappt auf
//                          (Entwurf wandert per Übergabe send: false mit). Nur
//                          nach pointerdown mit mouse/touch/pen — Tab-Fokus
//                          öffnet nie (Tastatur/Screenreader), Enter wie bisher.

const NARROW_CONTAINER_PX = 480; // Leiste kompakter in schmalen Spalten
// Chat-Fenster (Box bzw. Overlay); Ziel von aria-controls der Eingabe-Leiste
const CHAT_WINDOW_ID = "anything-llm-chat";
const DESKTOP_QUERY = "(min-width: 768px)"; // = Tailwind md
// Signal am Platzhalter, solange die Box aufgeklappt ist (README)
const EXPANDED_ATTR = "data-allm-expanded";
// Tippen außerhalb der schwebenden Box: weiter als das bewegt = Wischen
const TAP_SLOP_PX = 10;
// Touch: auf den click nach dem Tippen warten (ein Link soll ihn bekommen);
// Safari schickt für nicht-interaktive Stellen keinen -> danach einklappen
const TOUCH_CLICK_WAIT_MS = 350;
// Leiste (Klick-Leiste bzw. Pille der Eingabe-Leiste): Startform von "morph"
const BAR_SELECTOR = "#anything-llm-inline-bar";
const MORPH_WIN_VARS = ["mw", "mh", "mt", "mr", "cw", "ch"];
const MORPH_CLASSES = ["allm-morph", "allm-morph-from", "allm-morph-close"];
const MORPH_FLOW_CLASSES = [
  "allm-morph-flow",
  "allm-morph-flow-from",
  "allm-morph-flow-close",
];
// Chips unter der (schwebend unsichtbaren) Leiste: Aus-/Einblenden im Lauf
const MORPH_CHIP_CLASSES = ["allm-morph-chips-out", "allm-morph-chips-in"];
const CHIPS_SELECTOR = "#anything-llm-inline-chips";

function prefersReducedMotion() {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
}
const px = (n) => `${Math.round(n * 100) / 100}px`;

// Rundung einer Ecke (computed border-*-radius: "999px", "30%", "40px 10px")
// für die Startform von "morph": Prozent gegen die kleinere Seite, bei zwei
// Werten (horizontal/vertikal) der kleinere, höchstens halbe Höhe (Pille).
function cornerRadiusPx(value, w, h) {
  const radii = String(value || "")
    .trim()
    .split(/\s+/)
    .map((v) =>
      v.endsWith("%") ? (Math.min(w, h) * parseFloat(v)) / 100 : parseFloat(v),
    )
    .filter((n) => Number.isFinite(n) && n >= 0);
  return radii.length ? Math.min(...radii, h / 2) : 0;
}

// Leistenform für "morph" (Rect in Viewport-Koordinaten + Rundung)
function measureBar(pill) {
  const r = pill.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    w: r.width,
    h: r.height,
    r: cornerRadiusPx(
      getComputedStyle(pill).borderTopLeftRadius,
      r.width,
      r.height,
    ),
  };
}

// Ende eines Laufs: erste beendete Transition einer Form-Eigenschaft des
// Fensters (im Seitenfluss sind Leiste und Panel gleich breit -> kein
// width-Übergang; border-radius meldet die Längsform je Ecke)
const isMorphProperty = (p) =>
  p === "width" ||
  p === "height" ||
  p === "transform" ||
  /^border-(.+-)?radius$/.test(p);

// Sekunden/Millisekunden-Angabe (erster Wert einer Liste) in ms
const cssMs = (v) => {
  const d = String(v || "")
    .split(",")[0]
    .trim();
  return parseFloat(d) * (d.endsWith("ms") ? 1 : 1000) || 0;
};

// Ein Morph-Lauf am Chat-Fenster win (und im Seitenfluss an der äußeren Box,
// deren Höhe den nachfolgenden Inhalt schiebt). geom = Leistenform relativ zum
// Panel: { dx, dy, w, h, r, rootH }. Aufklappen: Leistenform einen Frame lang
// zeigen, dann Transition zum Panel; Zuklappen: Inhalt blendet zuerst aus,
// dann (gleiche Dauer und Kurve wie beim Aufklappen, Verzögerung per CSS)
// Transition vom aktuellen Stand zur Leistenform — steht die Leistenform noch
// an (Zuklappen vor dem ersten Frame des Aufklappens), endet der Lauf sofort.
// chips (schwebend: Chips unter der unsichtbaren Leiste) blenden beim
// Aufklappen aus, beim Zuklappen wieder ein. Ende per transitionend
// (isMorphProperty) bzw. Sicherheits-Timer; onEnd läuft vor dem Aufräumen
// (Zuklappen: erst einklappen, kein Rücksprung).
// Rückgabe: stop(keep) — keep = Klassen stehen lassen (Rückweg übernimmt).
function runMorph(win, box, geom, { opening, flow, chips, onEnd }) {
  const set = (el, k, v) => el.style.setProperty(`--allmi-${k}`, v);
  set(win, "mw", px(geom.w));
  set(win, "mh", px(geom.h));
  set(win, "mt", `translate(${px(geom.dx)}, ${px(geom.dy)})`);
  set(win, "mr", px(geom.r));
  // Inhalt in Panelgröße (nur zu Beginn messen, ein Rückweg erbt die Werte)
  if (!win.style.getPropertyValue("--allmi-cw")) {
    set(win, "cw", px(win.clientWidth));
    set(win, "ch", px(win.clientHeight));
  }
  if (flow) set(box, "bh", px(geom.rootH));
  let raf = 0;
  let timer = 0;
  const onTransitionEnd = (e) => {
    if (e.target === win && isMorphProperty(e.propertyName)) finish();
  };
  const stop = (keep = false) => {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    win.removeEventListener("transitionend", onTransitionEnd);
    if (keep) return;
    win.classList.remove(...MORPH_CLASSES);
    box.classList.remove(...MORPH_FLOW_CLASSES);
    chips?.classList.remove(...MORPH_CHIP_CLASSES);
    MORPH_WIN_VARS.forEach((k) => win.style.removeProperty(`--allmi-${k}`));
    box.style.removeProperty("--allmi-bh");
  };
  function finish() {
    stop(true);
    onEnd?.();
    stop();
  }
  const run = () => {
    win.classList.add("allm-morph");
    if (flow) box.classList.add("allm-morph-flow");
    win.classList.toggle("allm-morph-from", !opening);
    win.classList.toggle("allm-morph-close", !opening);
    if (flow) {
      box.classList.toggle("allm-morph-flow-from", !opening);
      box.classList.toggle("allm-morph-flow-close", !opening);
    }
    if (!opening && chips) {
      chips.classList.remove("allm-morph-chips-out");
      chips.classList.add("allm-morph-chips-in");
    }
    const cs = getComputedStyle(win);
    const ms = cssMs(cs.transitionDuration) + cssMs(cs.transitionDelay);
    win.addEventListener("transitionend", onTransitionEnd);
    timer = setTimeout(finish, ms + 100);
  };
  if (opening) {
    win.classList.add("allm-morph-from");
    if (flow) box.classList.add("allm-morph-flow-from");
    chips?.classList.add("allm-morph-chips-out");
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(run);
    });
  } else if (
    win.classList.contains("allm-morph-from") &&
    !win.classList.contains("allm-morph")
  )
    finish(); // nichts transitioniert (Leistenform liegt schon an)
  else run();
  return stop;
}

// Geerbte Text-Eigenschaften der Webseite neutralisieren: der Host sitzt jetzt
// mitten im Inhalt (text-align:center, line-height:2, Großbuchstaben o. ä. würden
// sonst in den Shadow DOM durchschlagen). font-family bleibt je nach inheritFont.
const TEXT_RESET = {
  textAlign: "left",
  lineHeight: "normal",
  letterSpacing: "normal",
  wordSpacing: "normal",
  textTransform: "none",
  textIndent: 0,
  fontStyle: "normal",
  fontWeight: 400,
  whiteSpace: "normal",
  fontSize: "16px",
  color: "var(--allmi-text, #222628)",
  boxSizing: "border-box",
  marginLeft: "auto",
  marginRight: "auto",
};

// Leiste: Farben aus den CSS-Variablen --allm-bar-* (Standard je nach
// inlineTheme bzw. theme, siehe BAR_THEMES in utils/theme.js). Fallbacks =
// bisherige helle Leiste. --allmi-bar-backdrop/-ring sind nur bei dunkler
// Leiste gesetzt (sonst ungültig -> none, wie bisher).
const BAR_STYLE = {
  backgroundColor: `var(--allmi-bar-bg, ${BAR_THEMES.light.bg})`,
  color: `var(--allmi-bar-text, ${BAR_THEMES.light.text})`,
  border: `1px solid var(--allmi-bar-border, ${BAR_THEMES.light.border})`,
  boxShadow: `var(--allmi-bar-shadow, ${BAR_THEMES.light.shadow})`,
  borderRadius: "var(--allmi-bar-radius, 16px)",
  backdropFilter: "var(--allmi-bar-backdrop)",
  WebkitBackdropFilter: "var(--allmi-bar-backdrop)",
};

// Akzent der Leiste (Icon-Kreis, Absende-Knopf): --allm-accent, Fallback
// buttonColor bzw. der Kufer-Standard.
function barAccent(settings) {
  return `var(--allmi-accent, ${settings.buttonColor || "#01a5a9"})`;
}

// Unsichtbares Hilfsfeld fürs erste Öffnen des Overlays: existiert das echte
// Eingabefeld noch nicht (Chat lädt), bekommt dieses Feld den Fokus in der
// Nutzer-Geste (iOS öffnet die Tastatur); PromptInput übernimmt den Fokus beim
// Mount. 16px verhindert den iOS-Zoom.
const FOCUS_PROXY_STYLE = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "1px",
  height: "1px",
  opacity: 0,
  border: 0,
  padding: 0,
  fontSize: "16px",
  pointerEvents: "none",
};

// Schwebende Box (inlineLayout "overlay"): relativ zur Inline-Fläche
// (#anything-llm-embed-inline, position:relative), oben an der Leiste.
const OVERLAY_BOX_STYLE = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: "var(--allmi-overlay-z, 1000)",
};

// Inhalt des Chat-Fensters (füllt es wie bisher das ChatWindow selbst)
const CONTENT_STYLE = { height: "100%", minHeight: 0 };

const chatClasses = {
  box: "allm-relative allm-w-full allm-h-full allm-border allm-border-solid allm-overflow-hidden allm-flex allm-flex-col allm-box-border",
  overlay:
    "allm-fixed allm-inset-0 allm-w-full allm-h-full allm-overflow-hidden allm-flex allm-flex-col allm-rounded-none allm-z-[9999]",
};
// Flächen über CSS-Variablen; Fallbacks = bisherige Klassenwerte.
const chatStyles = {
  box: {
    backgroundColor: "var(--allmi-surface, #FFFFFF)",
    borderColor: "var(--allmi-border, #d1d5db)",
    borderRadius: "var(--allmi-radius, 16px)",
    boxShadow: "var(--allmi-shadow, 0 4px 14px rgba(0, 0, 0, 0.12))",
  },
  overlay: { backgroundColor: "var(--allmi-surface, #FFFFFF)" },
};

function scrollChatToBottom() {
  // Nach Umhängen/Einblenden: Chat-Verlauf wieder ans Ende (nur der Container,
  // nie die Seite).
  requestAnimationFrame(() => {
    const el = embedderSettings.shadowRoot?.getElementById("chat-history");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

// beforeChangeRef.current(matches) läuft vor dem Umschalten, solange die
// Seite noch den bisherigen Zustand zeigt (Messen vor dem Wiedereintritt).
function useIsDesktopViewport(beforeChangeRef) {
  const [matches, setMatches] = useState(
    () =>
      window.matchMedia?.(DESKTOP_QUERY).matches ?? window.innerWidth >= 768,
  );
  useEffect(() => {
    const mql = window.matchMedia?.(DESKTOP_QUERY);
    if (!mql) return;
    const onChange = () => {
      beforeChangeRef?.current?.(mql.matches);
      setMatches(mql.matches);
    };
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return matches;
}

export default function InlineChat({
  settings,
  mountTarget,
  onMountError,
  sessionId,
  conversationId,
  newConversation,
  switchConversation,
  justCreatedRef,
}) {
  const host = embedderSettings.hostElement;
  const beforeViewportChangeRef = useRef(null);
  const isDesktop = useIsDesktopViewport(beforeViewportChangeRef);
  // expanded = Box an Ort und Stelle (nur >=768px wirksam)
  const [expanded, setExpanded] = useState(
    settings.inlineStartState === "expanded",
  );
  const [overlay, setOverlay] = useState(false); // mobiles Vollbild
  const [narrow, setNarrow] = useState(false);
  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const barRef = useRef(null);
  const chatWindowRef = useRef(null);
  const proxyRef = useRef(null);
  const spacerHeightRef = useRef(0);
  const focusRequestRef = useRef(false);
  const scrollOnExpandRef = useRef(false);
  // "morph": { geom, stop, closing } des laufenden bzw. letzten Laufs;
  // geom.open = Panel im nächsten Commit messen und Lauf starten
  const morphRef = useRef(null);
  // Leistenform gilt nach Viewport-Wechsel/Neuberechnung des Overlays nicht
  // mehr: Zuklappen dann ohne Morph (ein laufender Lauf behält sein stop)
  const invalidateMorph = () => {
    if (morphRef.current) morphRef.current.geom = null;
  };
  const chatMountedRef = useRef(false);
  // Übergabe Frage/Entwurf aus der Leiste (inlineInput), einzige Quelle der
  // Wahrheit: { ticket, text, send, suppressAutoFocus } | null. ticket ist eine
  // fortlaufende Nummer; der ChatContainer sendet jedes Ticket genau einmal.
  const [pendingFirstMessage, setPendingFirstMessage] = useState(null);
  const lastTicketRef = useRef(0);
  // Text der Eingabe-Leiste. Liegt hier, weil die Leiste beim Aufklappen
  // abgebaut wird: beim Zuklappen kommt eine verworfene Frage zurück ins Feld.
  const [barText, setBarText] = useState("");
  // inlineLayout "overlay": Box schwebt, außer ein Vorfahre schneidet sie ab
  // (beim Aufklappen geprüft, dann bleibt sie im Seitenfluss).
  const wantOverlay = isInlineOverlay(settings);
  const [overlayClipped, setOverlayClipped] = useState(false);
  const warnedClipRef = useRef(false);
  // Aufklapp-Effekt nur beim Aufklappen durch den Nutzer (openChat); der
  // Startzustand "expanded" und der Wiedereintritt (Drehen, Fenster wieder
  // >=768px) erscheinen ohne Animation.
  const animateRef = useRef(false);
  // Höhe der Inline-Fläche beim Aufklappen (schwebende Box): die unsichtbare
  // Leiste hält genau diese Höhe, auch wenn die Seite den Platzhalter beim
  // Aufklappen verbreitert (Chips brechen dann anders um) -> nichts rückt nach.
  // null = natürliche Höhe der Leiste.
  const flowHeightRef = useRef(null);
  // Abschneide-Prüfung nach dem nächsten Commit (Box sichtbar und schwebend):
  // Startzustand "expanded" und Drehen aus dem Vollbild.
  const clipCheckRef = useRef(settings.inlineStartState === "expanded");
  const floating = wantOverlay && !overlayClipped;
  // Varianten der Eingabe-Leiste (siehe Kopfkommentar)
  const openOnPointer = opensOnPointer(settings);

  const view = overlay ? "overlay" : expanded && isDesktop ? "box" : "bar";
  if (view !== "bar") chatMountedRef.current = true;
  const isKeyboardOpen = useMobileKeyboard(chatWindowRef, overlay);

  // Host im Platzhalter halten; für das mobile Overlay an <body> hängen.
  // useLayoutEffect: umhängen vor dem Paint, kein Aufblitzen an falscher Stelle.
  useLayoutEffect(() => {
    if (!host || !mountTarget) return;
    if (!overlay) {
      if (host.parentNode === mountTarget) return;
      try {
        mountTarget.appendChild(host);
      } catch (e) {
        // z. B. Platzhalter inzwischen ungeeignet/entfernt -> Blase
        console.warn(
          "[AnythingLLM Embed] Inline-Modus: Einhängen fehlgeschlagen — Chat-Blase wird verwendet.",
          e,
        );
        if (host.parentNode !== document.body) document.body.appendChild(host);
        onMountError?.();
      }
      return;
    }
    const spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.height = `${Math.round(spacerHeightRef.current)}px`;
    if (host.parentNode === mountTarget) mountTarget.insertBefore(spacer, host);
    else mountTarget.appendChild(spacer);
    document.body.appendChild(host);
    scrollChatToBottom();
    return () => {
      // Overlay zu: Host exakt an die Stelle des Abstandhalters zurück.
      if (spacer.parentNode) spacer.parentNode.replaceChild(host, spacer);
      else mountTarget.appendChild(host);
      scrollChatToBottom();
    };
  }, [overlay, mountTarget]);

  // Overlay-Fallback: würde die schwebende Box (Oberkante = Inline-Fläche)
  // von einem Vorfahren des Platzhalters abgeschnitten? Vor dem Aufklappen
  // messen (Seitenfluss = wie eingeklappt).
  const isOverlayClipped = () => {
    if (!wantOverlay || !mountTarget || !rootRef.current) return false;
    const top = rootRef.current.getBoundingClientRect().top;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const clipper = findClippingAncestor(
      mountTarget,
      top + inlineBoxHeightPx(settings, vh),
    );
    if (clipper && !warnedClipRef.current) {
      warnedClipRef.current = true;
      console.warn(
        '[AnythingLLM Embed] inlineLayout "overlay": ein Vorfahre des Platzhalters schneidet die Box ab (overflow hidden/clip) — die Box klappt im Seitenfluss auf (flow).',
        clipper,
      );
    }
    return !!clipper;
  };

  // Abschneide-Prüfung im Commit, in dem die Box sichtbar wird (Startzustand
  // "expanded", Drehen aus dem Vollbild): vor dem Paint, Host hängt dann im
  // Platzhalter (Effekt oben) und die Box schwebt (clipCheckRef wird nur bei
  // overlayClipped = false gesetzt) -> sie vergrößert keinen Vorfahren.
  useLayoutEffect(() => {
    if (!clipCheckRef.current || view !== "box") return;
    clipCheckRef.current = false;
    if (wantOverlay && isOverlayClipped()) setOverlayClipped(true);
  });

  // Fenster wird wieder >=768px, während die Box aufgeklappt sein soll (die
  // Leiste ist noch zu sehen): wie beim Aufklappen messen — Höhe der Leiste
  // in der neuen Breite und Abschneide-Prüfung —, aber ohne Effekt.
  beforeViewportChangeRef.current = (desktop) => {
    invalidateMorph();
    if (!desktop || isDesktop || overlay || !expanded) return;
    animateRef.current = false;
    if (!wantOverlay) return;
    flowHeightRef.current =
      rootRef.current?.getBoundingClientRect().height || null;
    setOverlayClipped(isOverlayClipped());
  };

  // Signal für die Seite: Platzhalter trägt data-allm-expanded="true",
  // solange die Box aufgeklappt ist (vor dem Paint, damit Seiten-CSS im
  // selben Frame greift); Aufräumen auch beim Unmount.
  useLayoutEffect(() => {
    if (!mountTarget || view !== "box") return;
    mountTarget.setAttribute(EXPANDED_ATTR, "true");
    return () => mountTarget.removeAttribute(EXPANDED_ATTR);
  }, [view, mountTarget]);

  // "morph" aufklappen: Panel einmal messen (nach dem Signal oben, Seiten-CSS
  // hat die Fläche ggf. schon verbreitert), Leistenform relativ dazu ablegen
  // (auch für den Rückweg) und den Lauf starten. Nach Klick: liegt die Box
  // nicht ganz im Viewport, scrollt die Seite JETZT (vor dem Paint, ohne
  // Animation) — während des Laufs scrollt nichts. Die Leistenform ist
  // relativ zum Panel abgelegt, der Scroll ändert daran nichts. Box verlassen
  // (Einklappen, Vollbild, Unmount) bricht einen Lauf ab.
  useLayoutEffect(() => {
    const m = morphRef.current;
    const win = chatWindowRef.current;
    const box = boxRef.current;
    if (view !== "box" || !m?.geom?.open || !win || !box) return;
    const g = m.geom;
    g.open = false;
    const f = win.getBoundingClientRect();
    g.dx = g.x - f.left;
    g.dy = g.y - f.top;
    if (scrollOnExpandRef.current) {
      scrollOnExpandRef.current = false;
      scrollBoxIntoView(true);
    }
    m.stop = runMorph(win, box, g, {
      opening: true,
      flow: !floating,
      chips: morphChips(),
      onEnd: () => {
        m.stop = null;
      },
    });
  }, [view]);
  // Abgebrochener Rückweg (Fenster <768px, Unmount): trotzdem einklappen wie
  // am Ende des Laufs (Übergabe/Text wie beim Zuklappen, Fokus bleibt) —
  // sonst bliebe die Box aufgeklappt und käme ab 768px wieder.
  useLayoutEffect(() => {
    if (view !== "box") return;
    return () => {
      const m = morphRef.current;
      if (!m) return;
      const wasClosing = m.closing;
      m.stop?.();
      m.stop = null;
      m.closing = false;
      if (wasClosing) collapseNowRef.current(false, false);
    };
  }, [view]);

  // Drehen/Vergrößern auf >=768px bei offenem Overlay -> zurück in die Seite,
  // aufgeklappt (Chat bleibt gemountet, laufende Antwort läuft weiter). Ohne
  // Effekt; schwebend: Leiste in natürlicher Höhe (die Leiste war im Vollbild
  // nicht zu sehen), Abschneide-Prüfung im nächsten Commit (Box schwebt dann).
  useEffect(() => {
    if (overlay && isDesktop) {
      invalidateMorph();
      animateRef.current = false;
      flowHeightRef.current = null;
      clipCheckRef.current = wantOverlay;
      setOverlayClipped(false);
      setExpanded(true);
      setOverlay(false);
    }
  }, [overlay, isDesktop]);

  // Container-Breite statt Viewport-Breite (schmale Spalten, Sidebars);
  // State ändert sich nur beim Überschreiten der Schwelle.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setNarrow(w < NARROW_CONTAINER_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Box eingeblendet: Verlauf ans Ende; nach Klick genau EINMAL scrollen — und
  // nur, wenn die Box nicht vollständig sichtbar ist (block: "nearest").
  // Startzustand "expanded" scrollt nie (scrollOnExpandRef nur beim Klick).
  // "morph": vor dem Lauf ohne Animation (instant, Effekt oben).
  const scrollBoxIntoView = (instant = false) => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top >= 0 && rect.bottom <= vh) return;
    if (!instant) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    try {
      el.scrollIntoView({ block: "nearest", behavior: "instant" });
    } catch (e) {
      el.scrollIntoView({ block: "nearest" }); // ältere Browser ohne "instant"
    }
  };
  useEffect(() => {
    if (view !== "box") return;
    scrollChatToBottom();
    if (!scrollOnExpandRef.current) return;
    scrollOnExpandRef.current = false;
    scrollBoxIntoView();
  }, [view]);
  // "morph", schwebend: Chips unter der unsichtbaren Leiste (blenden im Lauf
  // aus bzw. wieder ein); im Seitenfluss ist die Leiste nicht gerendert
  const morphChips = () =>
    (floating && rootRef.current?.querySelector(CHIPS_SELECTOR)) || null;

  // Fokus direkt in der Klick-Geste setzen; existiert das Eingabefeld noch
  // nicht (Chat lädt), übernimmt PromptInput beim Mount (consumeFocusRequest).
  const focusInput = (inOverlay) => {
    const input = embedderSettings.shadowRoot?.getElementById("message-input");
    if (input && !input.disabled) {
      input.focus({ preventScroll: true });
      return;
    }
    focusRequestRef.current = true;
    if (inOverlay) proxyRef.current?.focus({ preventScroll: true });
  };

  // first (nur inlineInput): { text, send } aus der Leiste, sonst null.
  // Klappt immer auf: die Leiste ist nie "tot".
  const openChat = (first = null) => {
    const hasFirst = typeof first?.text === "string" && first.text !== "";
    const sending = hasFirst && first.send === true;
    const ticket = hasFirst ? ++lastTicketRef.current : 0;
    const queue = () => {
      if (!hasFirst) return;
      setBarText("");
      // Eine noch nicht verbrauchte Übergabe wird ersetzt (die ältere
      // verfällt). Gleicher Text + gleiche Art = dieselbe Übergabe (zweites
      // Enter, Knopf nach Enter, Doppelklick) -> kein zweites Ticket (NAK-1).
      setPendingFirstMessage((prev) =>
        prev && prev.text === first.text && prev.send === sending
          ? prev
          : {
              ticket,
              text: first.text,
              send: sending,
              // Touch: keine Tastatur über der laufenden Antwort (PromptInput
              // überspringt den Auto-Fokus, solange die Übergabe wartet —
              // also beim ersten Mount des Chats)
              suppressAutoFocus: sending && isCoarsePointer(),
            },
      );
    };
    if (!isDesktop) {
      spacerHeightRef.current = host?.getBoundingClientRect?.().height || 0;
      // flushSync: Overlay + Host-Umhängen synchron, damit der Fokus unten noch
      // in derselben Nutzer-Geste liegt (iOS öffnet die Tastatur nur dann).
      flushSync(() => {
        queue();
        setOverlay(true);
      });
      // Frage abgeschickt: keine Tastatur über der laufenden Antwort
      if (!sending) focusInput(true);
      return;
    }
    scrollOnExpandRef.current = true;
    animateRef.current = true;
    flowHeightRef.current =
      rootRef.current?.getBoundingClientRect().height || null;
    // "morph": Leistenform einmal messen (Panel misst der Effekt oben)
    morphRef.current = null;
    const pill = rootRef.current?.querySelector(BAR_SELECTOR);
    if (
      pill &&
      resolveInlineEffect(settings) === "morph" &&
      !prefersReducedMotion()
    ) {
      const g = measureBar(pill);
      morphRef.current = {
        geom: { ...g, open: true, rootH: flowHeightRef.current || g.h },
      };
    }
    const clipped = isOverlayClipped();
    flushSync(() => {
      queue();
      setOverlayClipped(clipped);
      setExpanded(true);
    });
    // Touch-Tablets: kein Auto-Fokus (Tastatur würde die Seite verschieben).
    // Frage abgeschickt: kein Fokus ins Chat-Eingabefeld — es wird mit dem
    // Senden gesperrt (disabled) und verliert den Fokus in einem React-Commit;
    // React stellt dann den Fokus des Hosts und die scrollTop-Werte ALLER
    // Vorfahren (auch <html>) wieder her und bricht damit das sanfte Scrollen
    // zur Box ab. Nach der Antwort kommt der Fokus wie gewohnt ins Feld
    // (onPendingFirstMessageConsumed).
    if (!sending && !isTouchDevice()) focusInput(false);
  };

  // Vom ChatContainer aufgerufen, sobald er ein Ticket verbraucht hat.
  const onPendingFirstMessageConsumed = useCallback((pending) => {
    setPendingFirstMessage((prev) =>
      prev?.ticket === pending?.ticket ? null : prev,
    );
    // Nach der Antwort zurück ins Chat-Eingabefeld wie nach dem Absenden aus
    // dem Feld (PromptInput: Inline-Box nicht auf Touch-Geräten).
    if (pending?.send) focusRequestRef.current = true;
  }, []);

  // Fokus auf die Leiste. Eingabe-Leiste bei Finger-Bedienung nicht
  // fokussieren: ein Textfeld würde sofort die Bildschirmtastatur öffnen.
  // Schmale Desktop-Fenster (Maus/Tastatur) bekommen den Fokus wie breite.
  const focusBar = () => {
    if (settings.inlineInput === true && isCoarsePointer()) return;
    barRef.current?.focus({ preventScroll: true });
  };

  // Einklappen (Box) bzw. Schließen (Overlay); Fokus zurück auf die Leiste.
  // Eine noch nicht verbrauchte Übergabe wird verworfen (nie unsichtbar
  // senden), ihr Text kommt zurück ins Leisten-Feld.
  // focus "bar": auf die Leiste; "if-free" (Klick außerhalb, Escape auf der
  // Seite): nur, wenn der Fokus frei ist (body/Host) — liegt er auf einem
  // Element der Seite (Link, Eingabefeld), bleibt er dort. Außenklicks kommen
  // erst nach dem click hier an, der Fokus des Klicks steht dann schon.
  // focus false: Fokus bleibt; flush false: ohne flushSync (aus einem
  // Effekt-Cleanup, dort darf React nicht synchron rendern).
  const collapseNow = (focus = "bar", flush = true) => {
    const unsent = pendingFirstMessage?.text;
    const apply = () => {
      setPendingFirstMessage(null);
      if (unsent) setBarText(unsent);
      setOverlay(false);
      setExpanded(false);
    };
    if (flush) flushSync(apply);
    else apply();
    if (!focus) return;
    const a = document.activeElement;
    const free =
      !a || a === document.body || a === document.documentElement || a === host;
    if (focus !== "if-free" || free) focusBar();
  };
  // "morph", Leistenform vor jedem Rückweg frisch messen (Fenstergröße,
  // Umbruch, Scrollen seit dem Aufklappen). Die Seite zeigt dafür ohne Paint
  // kurz den eingeklappten Stand (Signal data-allm-expanded weg, Layout lesen,
  // Signal wieder an), damit ein per Seiten-CSS verbreiterter Platzhalter
  // nicht mitzählt. Schwebend: die unsichtbare Leiste im Seitenfluss messen;
  // im Seitenfluss (Leiste nicht gerendert): Lage/Breite der Inline-Fläche,
  // Höhe/Rundung vom Aufklappen. Panel-Ecke = äußere Box (nie transformiert).
  const measureCloseGeom = (g, box) => {
    const panel = box.getBoundingClientRect();
    const root = rootRef.current;
    const signal = !!mountTarget?.hasAttribute(EXPANDED_ATTR);
    if (signal) mountTarget.removeAttribute(EXPANDED_ATTR);
    try {
      const pill = floating ? root?.querySelector(BAR_SELECTOR) : null;
      if (pill) Object.assign(g, measureBar(pill));
      else if (root) {
        const r = root.getBoundingClientRect();
        Object.assign(g, { x: r.left, y: r.top, w: r.width });
      }
    } finally {
      if (signal) mountTarget.setAttribute(EXPANDED_ATTR, "true");
    }
    g.dx = g.x - panel.left;
    g.dy = g.y - panel.top;
  };
  // "morph": erst zur Leistenform zurück, dann einklappen (aktuelle Übergabe/
  // Fokus beim Ende); weitere Aufrufe während des Rückwegs zählen nicht.
  const collapse = (focus = "bar") => {
    const m = morphRef.current;
    const win = chatWindowRef.current;
    const box = boxRef.current;
    if (view === "box" && m?.geom && win && box && !prefersReducedMotion()) {
      if (m.closing) return;
      m.closing = true;
      m.stop?.(true);
      // vor dem ersten Frame des Aufklappens liegt die Leistenform noch an
      // (runMorph endet dann sofort): nichts zu messen
      if (!win.classList.contains("allm-morph-from"))
        measureCloseGeom(m.geom, box);
      const stop = runMorph(win, box, m.geom, {
        opening: false,
        flow: !floating,
        chips: morphChips(),
        onEnd: () => {
          m.stop = null;
          m.closing = false;
          collapseNowRef.current(focus);
        },
      });
      if (m.closing) m.stop = stop;
      return;
    }
    collapseNow(focus);
  };
  // Für ChatWindow (Button "Schließen" o. ä.): ohne Argumente
  const closeChat = () => collapse("bar");
  // Escape-/Außenklick-Listener rufen immer das aktuelle collapse (sieht die
  // aktuelle Übergabe), ohne bei jedem Render neu angehängt zu werden.
  const collapseRef = useRef(collapse);
  const collapseNowRef = useRef(collapseNow);
  useLayoutEffect(() => {
    collapseRef.current = collapse;
    collapseNowRef.current = collapseNow;
  });

  // Escape schließt das Overlay bzw. klappt die Box ein — nur wenn der Fokus
  // im Widget liegt (Listener am Shadow Root sieht nur Events aus dem Widget).
  useEffect(() => {
    const root = embedderSettings.shadowRoot;
    if (!root || view === "bar") return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      collapseRef.current();
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [view]);

  // Schwebende Box: Klick/Tippen außerhalb des Widgets und Escape (auch wenn
  // der Fokus nicht im Widget liegt) klappen ein. pointerdown/pointerup in der
  // Capture-Phase am document, damit Seiten-Scripts (stopPropagation) sie
  // nicht verschlucken; nie preventDefault. Nur primärer Zeiger mit linker
  // Taste (Rechts-/Mittelklick: Kontextmenü, neuer Tab -> bleibt offen).
  // Eingeklappt wird erst NACH dem click (Maus: setTimeout 0 nach pointerup,
  // click läuft im selben Task; Touch: nach dem click bzw. spätestens nach
  // TOUCH_CLICK_WAIT_MS, Safari feuert für Taps auf nicht-interaktive Stellen
  // keinen click am document): verbreitert die Seite den Platzhalter per
  // data-allm-expanded, verschiebt das Einklappen den Inhalt — vorher würde
  // der Klick auf einen Link danebengehen. Touch: Bewegung > TAP_SLOP_PX bzw.
  // pointercancel (Scrollen) = Wischen, schließt nicht.
  useEffect(() => {
    if (!floating || view !== "box") return;
    let down = null; // { id, touch, x, y } des Außen-pointerdown
    let timer = 0;
    let awaitingClick = false;
    const collapseSoon = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        awaitingClick = false;
        collapseRef.current("if-free");
      }, ms);
    };
    const isOutside = (e) => {
      const path = e.composedPath?.() || [];
      if (host && path.includes(host)) return false;
      // Scrollleiste des Viewports ist kein Klick in die Seite
      const de = document.documentElement;
      if (
        e.target === de &&
        (e.clientX >= de.clientWidth || e.clientY >= de.clientHeight)
      )
        return false;
      return true;
    };
    const onPointerDown = (e) => {
      down = null;
      if (e.isPrimary === false || e.button !== 0 || !isOutside(e)) return;
      down = {
        id: e.pointerId,
        touch: !!e.pointerType && e.pointerType !== "mouse",
        x: e.clientX,
        y: e.clientY,
      };
    };
    const onPointerUp = (e) => {
      const d = down;
      down = null;
      if (!d || e.pointerId !== d.id) return;
      if (!d.touch) {
        collapseSoon(0);
        return;
      }
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP_PX) return;
      awaitingClick = true;
      collapseSoon(TOUCH_CLICK_WAIT_MS);
    };
    const onPointerCancel = () => {
      down = null;
    };
    const onClick = () => {
      if (awaitingClick) collapseSoon(0);
    };
    const onKeyDown = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // aus dem Widget: Listener am Shadow Root (oben)
      if (host && e.composedPath?.().includes(host)) return;
      // Fokus in einem Feld der Seite bleibt dort
      collapseRef.current("if-free");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [floating, view]);

  const embedMode = useMemo(
    () => ({
      inline: true,
      overlay,
      consumeFocusRequest: () => {
        const wanted = focusRequestRef.current;
        focusRequestRef.current = false;
        return wanted;
      },
    }),
    [overlay],
  );

  const inheritFont = settings.inheritFont === true;
  const boxFloating = view === "box" && floating;
  const effectClass =
    view === "box" && animateRef.current ? inlineEffectClass(settings) : "";
  const bar =
    settings.inlineInput === true ? (
      <InlineInputBar
        ref={barRef}
        settings={settings}
        narrow={narrow}
        value={barText}
        onChange={setBarText}
        expanded={view !== "bar"}
        onOpen={openChat}
        openOnPointer={openOnPointer}
      />
    ) : (
      <InlineBar
        ref={barRef}
        settings={settings}
        narrow={narrow}
        onOpen={() => openChat()}
      />
    );

  return (
    <EmbedModeContext.Provider value={embedMode}>
      <div
        ref={rootRef}
        id="anything-llm-embed-inline"
        className={`allm-relative allm-w-full allm-font-sans ${inheritFont ? "allm-inherit-font" : ""}`}
        style={{ ...TEXT_RESET, maxWidth: inlineMaxWidth(settings) }}
      >
        {view === "bar" && bar}
        {/* schwebende Box: Leiste bleibt unsichtbar im Seitenfluss (Höhe) */}
        {boxFloating && (
          <div
            aria-hidden="true"
            style={{
              visibility: "hidden",
              height: flowHeightRef.current
                ? `${flowHeightRef.current}px`
                : undefined,
              overflow: "hidden",
            }}
          >
            {bar}
          </div>
        )}
        {chatMountedRef.current && (
          <div
            ref={boxRef}
            className={
              view === "box"
                ? boxFloating
                  ? ""
                  : "allm-relative allm-w-full"
                : view === "bar"
                  ? "allm-hidden"
                  : ""
            }
            style={
              view === "box"
                ? boxFloating
                  ? { ...OVERLAY_BOX_STYLE, ...inlineBoxStyle(settings) }
                  : inlineBoxStyle(settings)
                : undefined
            }
          >
            <div
              ref={chatWindowRef}
              id={CHAT_WINDOW_ID}
              className={
                view === "overlay"
                  ? chatClasses.overlay
                  : effectClass
                    ? `${chatClasses.box} ${effectClass}`
                    : chatClasses.box
              }
              style={view === "overlay" ? chatStyles.overlay : chatStyles.box}
            >
              {view === "overlay" && (
                <input
                  ref={proxyRef}
                  aria-hidden="true"
                  tabIndex={-1}
                  style={FOCUS_PROXY_STYLE}
                />
              )}
              {/* fester Inhalts-Container: "morph" blendet ihn ein (der
                  Inhalt darin wechselt beim Laden das Element) */}
              <div className="allm-inline-content" style={CONTENT_STYLE}>
                <ChatWindow
                  closeChat={closeChat}
                  settings={settings}
                  sessionId={sessionId}
                  conversationId={conversationId}
                  newConversation={newConversation}
                  switchConversation={switchConversation}
                  justCreatedRef={justCreatedRef}
                  compactHeader={isKeyboardOpen}
                  pendingFirstMessage={pendingFirstMessage}
                  onPendingFirstMessageConsumed={onPendingFirstMessageConsumed}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </EmbedModeContext.Provider>
  );
}

const InlineBar = forwardRef(function InlineBar(
  { settings, narrow, onOpen },
  ref,
) {
  const accent = barAccent(settings);
  const Icon = resolveChatIcon(settings?.chatIcon, ChatCircleDots);
  // Immer als Text rendern (React escaped), nie als HTML. Wert kommt
  // validiert (getrimmt, max. 120 Zeichen) aus loadEmbedSettings.
  const text = settings.inlineCollapsedText || DEFAULT_INLINE_COLLAPSED_TEXT;
  const iconSize = narrow ? 36 : 42;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      id="anything-llm-inline-bar"
      className="allm-w-full allm-flex allm-items-center allm-text-left allm-cursor-pointer allm-box-border allm-m-0 allm-font-sans hover:allm-opacity-95 allm-transition-opacity allm-duration-[var(--allmi-transition,200ms)] allm-ease-[var(--allmi-easing,cubic-bezier(0.4,0,0.2,1))]"
      style={{
        ...BAR_STYLE,
        padding: narrow ? "10px 12px" : "12px 18px",
        gap: narrow ? "10px" : "14px",
        minHeight: narrow ? "56px" : "66px",
      }}
    >
      <span
        className="allm-flex-shrink-0 allm-rounded-full allm-flex allm-items-center allm-justify-center"
        style={{
          width: `${iconSize}px`,
          height: `${iconSize}px`,
          backgroundColor: accent,
          color: ON_ACCENT_TEXT,
          // dunkle Leiste: heller Ring, damit auch dunkle Akzentfarben sichtbar
          // bleiben (--allmi-bar-ring nur bei dunkler Leiste gesetzt)
          boxShadow: "var(--allmi-bar-ring)",
        }}
      >
        <Icon size={narrow ? 20 : 22} weight="fill" />
      </span>
      <span
        className="allm-flex-1 allm-min-w-0 allm-font-sans allm-font-semibold"
        style={{
          fontSize: narrow ? "14px" : "16px",
          lineHeight: 1.35,
          overflowWrap: "anywhere",
        }}
      >
        {text}
      </span>
      <CaretDown
        size={18}
        weight="bold"
        className="allm-flex-shrink-0"
        style={{ opacity: 0.6 }}
      />
    </button>
  );
});

// Leiste als Eingabefeld (inlineInput): Feld + Absende-Knopf (bewusst ohne
// Chat-Icon links — der Absende-Knopf ist der Chat-Einstieg); darunter
// die defaultMessages als Chips. Farben/Rundung nur über --allmi-* (wie die
// Klick-Leiste); Fokusring/Platzhalter/Hover per CSS in main.jsx.
// Wunschfragen-Chips: Fläche/Text/Rundung der Leiste über --allmi-bar-*
const CHIP_STYLE = {
  maxWidth: "100%",
  margin: 0,
  padding: "6px 14px",
  border: `1px solid var(--allmi-bar-border, ${BAR_THEMES.light.border})`,
  borderRadius: "var(--allmi-bar-radius, 16px)",
  backgroundColor: `var(--allmi-bar-bg, ${BAR_THEMES.light.bg})`,
  color: `var(--allmi-bar-text, ${BAR_THEMES.light.text})`,
  lineHeight: 1.3,
  textAlign: "center",
  overflowWrap: "anywhere",
};

const InlineInputBar = forwardRef(function InlineInputBar(
  {
    settings,
    narrow,
    value,
    onChange,
    expanded,
    onOpen,
    openOnPointer = false,
  },
  ref,
) {
  const accent = barAccent(settings);
  // Werte kommen validiert (getrimmt, Längen-Grenzen) aus loadEmbedSettings.
  const placeholder =
    settings.inlineInputPlaceholder || DEFAULT_INLINE_INPUT_PLACEHOLDER;
  const sendText = settings.inlineSendText || DEFAULT_INLINE_SEND_TEXT;
  const chips = inlineChips(settings);
  // inlineOpenOn "focus": nur ein Zeiger-Klick (pointerdown mit
  // mouse/touch/pen, Maus nur linke Taste) öffnet; der click danach klappt
  // auf. Fokus per Tab (kein pointerdown) öffnet nie.
  const pointerOpenRef = useRef(false);
  const notePointer = (e) => {
    pointerOpenRef.current =
      openOnPointer &&
      ["mouse", "touch", "pen"].includes(e.pointerType) &&
      (e.pointerType !== "mouse" || e.button === 0);
  };

  // Enter oder Knopf: mit Text aufklappen + senden, leer nur aufklappen.
  const submit = (e) => {
    e.preventDefault();
    const text = value.trim();
    onOpen(text ? { text, send: true } : null);
  };
  // Aufklappen, getippter Text unversendet mit (Übergabe send: false).
  const openDraft = () => {
    const text = value.trim();
    onOpen(text ? { text, send: false } : null);
  };
  // Klick in die Leiste neben Feld/Knopf: aufklappen, Text unversendet mitnehmen.
  const openWithDraft = (e) => {
    if (e.target?.closest?.("input, button")) return;
    openDraft();
  };
  // Klick ins Feld (nur inlineOpenOn "focus", nur nach Zeiger-pointerdown)
  const openFromInput = () => {
    if (!pointerOpenRef.current) return;
    pointerOpenRef.current = false;
    openDraft();
  };
  // Chip: leeres Feld -> wie Enter mit dem Chip-Text. Steht schon etwas im
  // Feld, wird der Chip-Text angehängt (nichts ersetzt, nichts gesendet).
  const pickChip = (e, chip) => {
    if (!value.trim()) {
      onOpen({ text: chip, send: true });
      return;
    }
    onChange(`${value.replace(/\s+$/, "")} ${chip}`);
    e.currentTarget
      .closest("#anything-llm-inline-input-bar")
      ?.querySelector("#anything-llm-inline-input")
      ?.focus({ preventScroll: true });
  };

  return (
    <div id="anything-llm-inline-input-bar">
      <form
        id="anything-llm-inline-bar"
        role="search"
        aria-label={placeholder}
        onSubmit={submit}
        onClick={openWithDraft}
        className="allm-w-full allm-flex allm-items-center allm-box-border allm-m-0 allm-font-sans allm-cursor-pointer"
        style={{
          ...BAR_STYLE,
          padding: narrow ? "6px 6px 6px 16px" : "8px 8px 8px 24px",
          gap: narrow ? "8px" : "12px",
          minHeight: narrow ? "56px" : "66px",
        }}
      >
        <input
          ref={ref}
          id="anything-llm-inline-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={openOnPointer ? notePointer : undefined}
          onClick={openOnPointer ? openFromInput : undefined}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          className="allm-font-sans"
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            margin: 0,
            padding: "8px 2px",
            border: "none",
            background: "transparent",
            color: "inherit",
            // 16px: kein iOS-Zoom beim Fokus
            fontSize: "16px",
            lineHeight: 1.35,
            cursor: "text",
          }}
        />
        <button
          type="submit"
          id="anything-llm-inline-send"
          aria-expanded={expanded === true}
          aria-controls={CHAT_WINDOW_ID}
          className="allm-flex-shrink-0 allm-font-sans allm-font-semibold allm-cursor-pointer allm-transition-opacity allm-duration-[var(--allmi-transition,200ms)] allm-ease-[var(--allmi-easing,cubic-bezier(0.4,0,0.2,1))]"
          style={{
            height: narrow ? "42px" : "48px",
            maxWidth: "45%",
            padding: narrow ? "0 14px" : "0 20px",
            margin: 0,
            border: "none",
            borderRadius: "max(0px, calc(var(--allmi-bar-radius, 16px) - 6px))",
            backgroundColor: accent,
            color: ON_ACCENT_TEXT,
            fontSize: narrow ? "15px" : "16px",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sendText}
        </button>
      </form>
      {chips.length > 0 && (
        <div
          id="anything-llm-inline-chips"
          className="allm-flex allm-items-center allm-justify-center"
          style={{ flexWrap: "wrap", gap: "8px", marginTop: "12px" }}
        >
          {chips.map((chip, i) => (
            <button
              key={i}
              type="button"
              className="allm-inline-chip allm-font-sans allm-cursor-pointer"
              onClick={(e) => pickChip(e, chip)}
              style={{ ...CHIP_STYLE, fontSize: narrow ? "13px" : "14px" }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
