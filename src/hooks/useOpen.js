import { CHAT_UI_REOPEN } from "@/utils/constants";
import { useState } from "react";

export default function useOpenChat() {
  // sessionStorage statt localStorage: der Offen-Zustand gilt pro Tab.
  // Ein per target="_blank" (rel="noopener") geoeffneter neuer Tab (z.B. Kurslink)
  // bekommt einen frischen sessionStorage -> Chatbot startet dort geschlossen und
  // verdeckt die Zielseite nicht. Im selben Tab bleibt der Chat beim Navigieren offen.
  // Der Gespraechsverlauf haengt an der sessionId (useSessionId) und bleibt unberuehrt.
  const [isOpen, setOpen] = useState(
    !!window?.sessionStorage?.getItem(CHAT_UI_REOPEN) || false,
  );

  function toggleOpenChat(newValue) {
    if (newValue === true) window.sessionStorage.setItem(CHAT_UI_REOPEN, "1");
    if (newValue === false) window.sessionStorage.removeItem(CHAT_UI_REOPEN);
    setOpen(newValue);
  }

  return { isChatOpen: isOpen, toggleOpenChat };
}
