import { useEffect, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  ChatCircleDots,
  CircleNotch,
} from "@phosphor-icons/react";
import ChatService from "@/models/chatService";
import { CloseButton } from "../Header";

// KIE-503: Vollbild-Ansicht "Frühere Chats" (Mockup: Burger + Vollbild-Liste).
// Zeigt die Konversationen der aktuellen Session (serverseitig session-gebunden,
// BOLA). Auswahl wechselt via switchConversation die conversationId -> der
// ChatContainer remountet (key) und lädt die History der Konversation.
// Bewusst KEIN "Neuer Chat"-Button hier — Reset bleibt im Burger-Menü.

// Relatives Datum wie im Mockup ("heute · 4 Nachrichten").
function relativeDayLabel(timestampMs) {
  if (!timestampMs) return "";
  const now = new Date();
  const then = new Date(timestampMs);
  const startOfDay = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(now) - startOfDay(then)) / (24 * 60 * 60 * 1000),
  );
  if (dayDiff <= 0) return "heute";
  if (dayDiff === 1) return "gestern";
  if (dayDiff < 7) return `vor ${dayDiff} Tagen`;
  const weeks = Math.floor(dayDiff / 7);
  if (dayDiff < 30) return weeks === 1 ? "vor 1 Woche" : `vor ${weeks} Wochen`;
  const months = Math.floor(dayDiff / 30);
  if (months < 12)
    return months === 1 ? "vor 1 Monat" : `vor ${months} Monaten`;
  const years = Math.floor(months / 12);
  return years === 1 ? "vor 1 Jahr" : `vor ${years} Jahren`;
}

export default function ConversationHistory({
  settings,
  sessionId,
  conversationId,
  onSelect,
  onBack,
  closeChat,
}) {
  const [conversations, setConversations] = useState(null); // null = lädt
  // aus dem settings-Prop lesen (eine Quelle), nicht aus dem Modul-Singleton.
  const accent = settings?.buttonColor || "#01a5a9";

  useEffect(() => {
    let cancelled = false;
    ChatService.listConversations(settings, sessionId).then((list) => {
      if (!cancelled) setConversations(list);
    });
    return () => {
      cancelled = true;
    };
  }, [settings, sessionId]);

  // Kopf wie ChatWindowHeader über CSS-Variablen (utils/theme.js)
  const headerStyle = {
    borderBottom: settings.headerBgColor
      ? "none"
      : "1px solid var(--allmi-border, #E9E9E9)",
    backgroundColor: "var(--allmi-header-bg, transparent)",
  };
  const headerIconStyle = { color: "var(--allmi-header-icon, #374151)" };
  const headerButtonClass =
    "allm-bg-transparent hover:allm-cursor-pointer allm-border-none hover:allm-bg-[color:var(--allmi-hover-bg,#f3f4f6)] allm-rounded-sm";

  return (
    <div className="allm-flex allm-flex-col allm-h-full">
      {/* Kopf: Zurück ‹ + Titel + Schließen — Muster wie ChatWindowHeader */}
      <div
        style={headerStyle}
        className="allm-flex allm-items-center allm-relative allm-rounded-t-[var(--allmi-radius,16px)] allm-h-[56px] allm-flex-shrink-0"
      >
        <div className="allm-flex allm-items-center allm-gap-x-1 allm-px-3 allm-flex-1 allm-min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Zurück zum Chat"
            className={`${headerButtonClass} allm-p-1 allm-flex allm-items-center`}
            style={headerIconStyle}
          >
            <CaretLeft size={20} weight="bold" />
          </button>
          <span
            className="allm-font-semibold allm-text-sm allm-truncate allm-font-sans"
            style={{ color: "var(--allmi-header-text, #1f2937)" }}
          >
            {settings.historyTitleText || "Frühere Chats"}
          </span>
        </div>
        <div className="allm-flex allm-items-center allm-px-[22px]">
          <CloseButton
            onClick={closeChat}
            className={headerButtonClass}
            style={headerIconStyle}
          />
        </div>
      </div>

      {/* Liste */}
      <div className="allm-flex-1 allm-overflow-y-auto allm-bg-[color:var(--allmi-bg,#f9fafb)] allm-p-2.5 allm-no-scroll">
        {conversations === null ? (
          <div className="allm-flex allm-justify-center allm-items-center allm-h-full allm-text-[color:var(--allmi-text-muted,#9ca3af)]">
            <CircleNotch size={22} className="allm-animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="allm-text-center allm-text-sm allm-text-[color:var(--allmi-text-muted,#9ca3af)] allm-font-sans allm-py-8">
            Noch keine früheren Chats vorhanden.
          </p>
        ) : (
          <>
            <p className="allm-text-[11px] allm-uppercase allm-tracking-wide allm-text-[color:var(--allmi-text-muted,#9ca3af)] allm-font-sans allm-px-1 allm-pb-2 allm-pt-1 allm-m-0">
              {conversations.length}{" "}
              {conversations.length === 1 ? "Konversation" : "Konversationen"}
            </p>
            {conversations.map((conv) => {
              const isCurrent = conv.conversationId === conversationId;
              return (
                <button
                  key={conv.conversationId}
                  type="button"
                  onClick={() => onSelect(conv.conversationId)}
                  style={
                    isCurrent
                      ? { borderColor: `var(--allmi-accent, ${accent})` }
                      : {}
                  }
                  className="allm-box-border allm-w-full allm-text-left allm-cursor-pointer allm-flex allm-items-start allm-gap-x-2.5 allm-bg-[color:var(--allmi-surface,#fff)] allm-border allm-border-solid allm-border-[color:var(--allmi-border,#e5e7eb)] hover:allm-border-[color:var(--allmi-border,#d1d5db)] allm-rounded-xl allm-p-3 allm-mb-2 allm-font-sans"
                >
                  <span
                    className="allm-flex-shrink-0 allm-w-8 allm-h-8 allm-rounded-lg allm-flex allm-items-center allm-justify-center"
                    style={{
                      backgroundColor: `${accent}1a`,
                      color: `var(--allmi-accent, ${accent})`,
                    }}
                  >
                    <ChatCircleDots size={17} weight="fill" />
                  </span>
                  <span className="allm-flex-1 allm-min-w-0">
                    <span
                      className="allm-block allm-text-[13px] allm-font-semibold allm-text-[color:var(--allmi-text,#1f2937)] allm-leading-snug allm-overflow-hidden"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {conv.title || "Konversation"}
                    </span>
                    <span className="allm-block allm-text-[11px] allm-text-[color:var(--allmi-text-muted,#9ca3af)] allm-mt-1">
                      {/* messageCount = Frage/Antwort-PAARE (eine DB-Zeile je
                          Austausch) — daher "Fragen", nicht "Nachrichten". */}
                      {relativeDayLabel(conv.lastMessageAt)} ·{" "}
                      {conv.messageCount}{" "}
                      {conv.messageCount === 1 ? "Frage" : "Fragen"}
                      {isCurrent ? " · aktuell" : ""}
                    </span>
                  </span>
                  <CaretRight
                    size={16}
                    className="allm-flex-shrink-0 allm-self-center allm-text-[color:var(--allmi-text-muted,#d1d5db)]"
                  />
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
