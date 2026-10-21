// Escape im Widget (KIE-565 D7, Fixliste 7.22-rc7 Nr. 14, 17, 18,
// Fixliste 7.22-rc13 W01 bis W03, W10).
//
// Escape schließt die Chatblase bzw. klappt die Inline-Box ein. Ausnahmen:
// - IME-Eingabe (z. B. Japanisch): Escape bricht dort nur die Umwandlung ab
//   (isImeEscape).
// - Verschachtelte Schritte im Fenster (Kommentarfeld nach „Daumen runter“,
//   Ansicht „Frühere Chats“): Escape schließt nur diesen Schritt. Solche
//   Schritte melden sich als Ebene an (useEscapeLayer); die Escape-Listener
//   von Chatblase und Inline-Box fragen zuerst closeEscapeLayerFor(). Die
//   zuletzt geöffnete Ebene, die das Escape nimmt, schließt zuerst:
//   „Frühere Chats“ deckt das ganze Fenster ab und nimmt jedes Escape. Das
//   Kommentarfeld mitten im Verlauf nimmt es nur, wenn der Fokus darin oder
//   bei den Daumen steht oder auf keinem Element (nach einem Mausklick auf
//   Text steht er auf <body>); aus dem Haupt-Eingabefeld schließt Escape
//   weiter das Fenster (W02). Danach steht der Fokus wieder auf dem Öffner
//   (⋮ bzw. Daumen), nicht auf <body> (W03), auch wenn der Kopf inzwischen
//   neu eingehängt wurde (Fixliste 7.22-rc16 W42). Ohne Fokus schließt die
//   Ebene in jeder Darstellung, auch im mobilen Vollbild und in der
//   Inline-Box im Seitenfluss (W43).
// - Fokus in einem Eingabefeld der Webseite (focusInPageField).
// - preventDefault nur für Escape aus dem Widget oder ohne Fokus: Ein Escape
//   der Webseite (Button in einem <dialog> der Seite) bleibt für die Seite
//   wirksam (W01).

import { useEffect, useRef } from "react";

// Escape während einer IME-Umwandlung (keyCode 229: ältere Safari-Versionen
// setzen isComposing nicht)
export function isImeEscape(e) {
  return !!(e?.isComposing || e?.keyCode === 229);
}

// Herkunft eines Escape: "widget" = aus dem Widget (der Ereignispfad enthält
// den Host; am document ist bei geschlossenem Shadow Root der Host das
// innerste Element), "none" = Fokus auf keinem Element (<body>, <html>),
// "page" = ein Element der Webseite.
export function escapeOrigin(e, host = null) {
  const path = e?.composedPath?.() || [];
  if (host && path.includes(host)) return "widget";
  const el = path[0] || e?.target || null;
  if (
    !el ||
    el === document ||
    el === document.body ||
    el === document.documentElement ||
    el === window
  )
    return "none";
  return "page";
}

const layers = [];

// Oberste Ebene schließen, die dieses Escape nimmt; true = verbraucht.
// origin wie escapeOrigin, focused = Element mit dem Fokus im Widget
// (activeElement des Shadow Root). Ohne Angaben (Aufruf aus dem Code)
// schließt die oberste Ebene.
export function closeTopEscapeLayer({ origin = "none", focused = null } = {}) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.takes(origin, focused)) continue;
    layer.close(origin !== "page");
    return true;
  }
  return false;
}

// Für die Escape-Listener: Ebene schließen und preventDefault nur bei
// Escape aus dem Widget oder ohne Fokus. root = Shadow Root des Widgets (für
// das fokussierte Element), origin vorgeben, wenn der Listener die Herkunft
// schon kennt (Listener am Shadow Root: "widget").
export function closeEscapeLayerFor(
  e,
  { host = null, root = null, origin } = {},
) {
  const from = origin || escapeOrigin(e, host);
  const focused = from === "widget" ? root?.activeElement || null : null;
  if (!closeTopEscapeLayer({ origin: from, focused })) return false;
  if (from !== "page") e?.preventDefault?.();
  return true;
}

export function escapeLayerCount() {
  return layers.length;
}

// Fokus auf keinem bestimmten Element im Widget (Host selbst, <body>)
function noFocus(el) {
  return !el || el === document.body || el === document.documentElement;
}

// Ebene anmelden, solange active gilt. onClose wird stets in der aktuellen
// Fassung aufgerufen. options.within: () => Elemente der Ebene; ohne nimmt
// die Ebene jedes Escape (Ansicht über dem ganzen Fenster). Mit within nimmt
// sie nur ein Escape aus diesen Elementen oder ohne Fokus, nie eines der
// Webseite. options.returnFocus: () => Element, das nach dem Schließen per
// Escape den Fokus bekommt (Öffner), außer bei einem Escape der Webseite.
export function useEscapeLayer(active, onClose, options = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    if (!active) return;
    const layer = {
      takes: (origin, focused) => {
        const within = optionsRef.current?.within;
        if (typeof within !== "function") return true;
        if (origin === "page") return false;
        if (origin === "none" || noFocus(focused)) return true;
        return (within() || []).some(
          (el) => !!el && (el === focused || el.contains?.(focused)),
        );
      },
      close: (restoreFocus) => {
        const target = restoreFocus
          ? optionsRef.current?.returnFocus?.() || null
          : null;
        closeRef.current?.();
        if (target?.isConnected) target.focus?.({ preventScroll: true });
      },
    };
    layers.push(layer);
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [active]);
}

// Texteingaben (für Escape „beim Feld bleiben“); Checkboxen, Radio-Buttons,
// Buttons, Schieberegler, Farbwähler und Datei-Auswahl zählen nicht.
const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "image",
  "range",
  "color",
  "file",
  "hidden",
]);

export function isTextField(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input")
    return !NON_TEXT_INPUT_TYPES.has((el.type || "text").toLowerCase());
  // Browser: isContentEditable entscheidet (auch für "inherit" oder einen
  // ungültigen Wert ohne editierbaren Vorfahren: false, Fixliste 7.22-rc13
  // W10). Nur jsdom kennt die Eigenschaft nicht: Attribut auswerten
  // (nächster Vorfahre mit contenteditable entscheidet, "false" schaltet ab)
  if (typeof el.isContentEditable === "boolean") return el.isContentEditable;
  const editable = el.closest?.("[contenteditable]");
  if (!editable) return false;
  const v = editable.getAttribute("contenteditable").trim().toLowerCase();
  return v !== "false";
}

// Escape aus einem Eingabefeld der Webseite (nicht aus dem Widget): gehört
// dem Feld. Ziel ist das innerste Element des Ereignispfads (composedPath),
// damit auch ein Feld in einem offenen Shadow Root einer Web-Komponente der
// Seite erkannt wird (dort ist e.target auf Dokumentebene der Host).
export function focusInPageField(e, host) {
  const path = e.composedPath?.() || [];
  if (host && path.includes(host)) return false;
  const el = path[0] || e.target;
  return isTextField(el);
}
