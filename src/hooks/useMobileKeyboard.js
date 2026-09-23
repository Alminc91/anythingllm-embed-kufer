import { useEffect, useRef, useState } from "react";

// Mobile keyboard handling: on mobile (<768px) couple the chat window height
// to window.visualViewport so the soft keyboard doesn't push the header
// (with the close button) out of view. Tablet/desktop are left untouched.
//
// (Unverändert aus App.jsx herausgelöst, damit Blase UND mobiles Inline-
// Vollbild-Overlay dieselbe Logik nutzen.) `active` = das Vollbild-Fenster ist
// gerade offen; chatWindowRef = das position:fixed-Fenster-Element (darf KEINE
// von React gesetzte Inline-Höhe tragen, da hier style.height/top/bottom
// überschrieben bzw. zurückgesetzt werden).
export default function useMobileKeyboard(chatWindowRef, active) {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const kbBaselineRef = useRef(0); // groesste je gesehene sichtbare Hoehe (= ohne Tastatur)
  const lastWidthRef = useRef(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const applyViewport = () => {
      // Tastatur-Erkennung ueber ZWEI Signale (iOS-Robustheit): die sichtbare
      // Hoehe liegt deutlich unter (a) der groessten je gesehenen Hoehe (Baseline =
      // ohne Tastatur) ODER (b) der Layout-Hoehe window.innerHeight. Auf manchen
      // iOS-Staenden schrumpft innerHeight mit der Tastatur mit (Delta ~0), dann
      // greift die Baseline. Desktop (auch schmal, Firefox) hat keine Soft-Tastatur
      // -> beide Deltas ~0 -> feuert nie.
      const isMobile = window.innerWidth < 768;
      // Bei Orientierungswechsel (Breite aendert sich) Baseline zuruecksetzen.
      if (window.innerWidth !== lastWidthRef.current) {
        lastWidthRef.current = window.innerWidth;
        kbBaselineRef.current = 0;
      }
      if (vv.height > kbBaselineRef.current) kbBaselineRef.current = vv.height;
      const shrink = Math.max(
        kbBaselineRef.current - vv.height,
        window.innerHeight - vv.height,
      );
      const keyboardOpen = isMobile && shrink > 120;
      const isActive = active && keyboardOpen;
      const el = chatWindowRef.current;
      if (el) {
        if (isActive) {
          el.style.height = `${vv.height}px`;
          el.style.top = `${vv.offsetTop}px`;
          el.style.bottom = "auto";
        } else {
          el.style.height = "";
          el.style.top = "";
          el.style.bottom = "";
        }
      }
      setIsKeyboardOpen(isActive);
    };
    applyViewport();
    vv.addEventListener("resize", applyViewport);
    vv.addEventListener("scroll", applyViewport);
    return () => {
      vv.removeEventListener("resize", applyViewport);
      vv.removeEventListener("scroll", applyViewport);
    };
  }, [active]);

  return isKeyboardOpen;
}
