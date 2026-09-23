import { createContext, useContext } from "react";

// Kufer Inline-Modus: Darstellungs-Kontext für tief verschachtelte Komponenten
// (PromptInput, ChatHistory, Header), damit nicht jede Ebene Props durchreichen
// muss. Default = Chat-Blase -> bisheriges Verhalten unverändert.
//   inline              Inline-Modus aktiv (Platzhalter gefunden)
//   overlay             Inline, aber gerade als mobiles Vollbild-Overlay geöffnet
//   consumeFocusRequest einmaliger Fokus-Wunsch nach Klick auf die Leiste, falls
//                       das Eingabefeld beim Klick noch nicht existierte
export const EmbedModeContext = createContext({
  inline: false,
  overlay: false,
  consumeFocusRequest: () => false,
});

export default function useEmbedMode() {
  return useContext(EmbedModeContext);
}
