import { createContext, useContext } from "react";

// Kufer Inline-Modus: Darstellungs-Kontext für tief verschachtelte Komponenten
// (PromptInput, ChatHistory, Header), damit nicht jede Ebene Props durchreichen
// muss. Default = Chat-Blase -> bisheriges Verhalten unverändert.
//   inline            Inline-Modus aktiv (Platzhalter gefunden)
//   overlay           Inline, aber gerade als mobiles Vollbild-Overlay geöffnet
//   requestFullscreen nur mobil in der aufgeklappten Inline-Box gesetzt: Tippen
//                     aufs Eingabefeld öffnet stattdessen das Vollbild-Overlay
//   consumeFocusRequest einmaliger Fokus-Wunsch nach Klick auf die Leiste (Desktop)
export const EmbedModeContext = createContext({
  inline: false,
  overlay: false,
  requestFullscreen: null,
  consumeFocusRequest: () => false,
});

export default function useEmbedMode() {
  return useContext(EmbedModeContext);
}
