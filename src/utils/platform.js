/**
 * iOS/iPadOS-Erkennung.
 *
 * Auf iOS sind alle Browser WebKit-basiert; nur dort ist der sticky-Compositing-
 * Hack (translateZ/will-change) fuer die Eingabezeile noetig — er behebt einen
 * WebKit-Bug, bei dem die Bot-Bubble beim Streaming/bei offener Tastatur in die
 * sticky Eingabezeile ragt statt dahinter zu verschwinden.
 *
 * Auf Desktop-Chromium (Brave/Chrome) und Gecko (Firefox) ist der permanente
 * GPU-Compositing-Layer dagegen schaedlich: beim Auto-Scroll pro Streaming-Token
 * muss der Browser die Ebenen-Kante neu zusammensetzen -> sichtbares Flackern der
 * untersten Nachrichtenzeile. Deshalb wird der Hack ausserhalb von iOS weggelassen.
 */
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iP(hone|od|ad)/.test(ua);
  // iPadOS 13+ meldet sich als "MacIntel", ist aber am Touch erkennbar.
  const iPadOS =
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
  return iOSDevice || iPadOS;
}
