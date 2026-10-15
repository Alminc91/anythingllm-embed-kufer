// Escape im Widget (KIE-565 D7, Fixliste 7.22-rc7 Nr. 14, 17, 18).
//
// Escape schließt die Chatblase bzw. klappt die Inline-Box ein. Ausnahmen:
// - IME-Eingabe (z. B. Japanisch): Escape bricht dort nur die Umwandlung ab
//   (isImeEscape).
// - Verschachtelte Schritte im Fenster (Kommentarfeld nach „Daumen runter“,
//   Ansicht „Frühere Chats“): Escape schließt nur diesen Schritt. Solche
//   Schritte melden sich als Ebene an (useEscapeLayer); die Escape-Listener
//   von Chatblase und Inline-Box fragen zuerst closeTopEscapeLayer(). Die
//   zuletzt geöffnete Ebene schließt zuerst, unabhängig davon, wo der Fokus
//   liegt (nach einem Mausklick steht er oft auf <body>).
// - Fokus in einem Eingabefeld der Webseite (focusInPageField).

import { useEffect, useRef } from "react";

// Escape während einer IME-Umwandlung (keyCode 229: ältere Safari-Versionen
// setzen isComposing nicht)
export function isImeEscape(e) {
  return !!(e?.isComposing || e?.keyCode === 229);
}

const layers = [];

// Oberste Ebene schließen; true = eine Ebene hat Escape verbraucht.
export function closeTopEscapeLayer() {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function escapeLayerCount() {
  return layers.length;
}

// Ebene anmelden, solange active gilt. onClose wird stets in der aktuellen
// Fassung aufgerufen.
export function useEscapeLayer(active, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const layer = { close: () => closeRef.current?.() };
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
  if (el.isContentEditable === true) return true;
  // jsdom kennt isContentEditable nicht: Attribut auswerten (nächster
  // Vorfahre mit contenteditable entscheidet, "false" schaltet ab)
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
