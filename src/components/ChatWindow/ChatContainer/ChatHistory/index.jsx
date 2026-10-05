import HistoricalMessage from "./HistoricalMessage";
import PromptReply from "./PromptReply";
import CourseCards from "./CourseCards";
import { courseCardsAbove, stripCardsMarker } from "@/utils/courseCards";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, CircleNotch } from "@phosphor-icons/react";
import { embedderSettings } from "@/main";
import { MESSAGE_NAME_CLASS, suggestionFontSize } from "@/utils/theme";
import debounce from "lodash.debounce";
import { SEND_TEXT_EVENT } from "..";

// DOM-Knoten, in den der Scroll-nach-unten-Pfeil gerendert wird (von ChatWindow
// bereitgestellt): ein Kind der relativen Fenster-Wurzel AUSSERHALB der Scroll-
// Container. So sitzt der Pfeil per absolute am Chatfenster (Blase und Inline
// gleich) statt per fixed am Viewport — und WebKit/iOS clippt ihn nicht (das
// Clipping betraf absolute Elemente INNERHALB eines overflow-Scroll-Containers).
export const ScrollArrowSlotContext = createContext(null);

export default function ChatHistory({
  settings = {},
  history = [],
  sessionId = null,
}) {
  const replyRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const chatHistoryRef = useRef(null);
  const arrowSlot = useContext(ScrollArrowSlotContext);
  const cardsAbove = courseCardsAbove(settings);

  useEffect(() => {
    if (cardsAbove) scrollToLatestTurn();
    else scrollToBottom();
  }, [history]);

  const handleScroll = () => {
    if (!chatHistoryRef.current) return;
    const diff =
      chatHistoryRef.current.scrollHeight -
      chatHistoryRef.current.scrollTop -
      chatHistoryRef.current.clientHeight;
    // Fuzzy margin for what qualifies as "bottom". Stronger than straight comparison since that may change over time.
    const isBottom = diff <= 40;
    setIsAtBottom(isBottom);
  };

  const debouncedScroll = debounce(handleScroll, 100);
  useEffect(() => {
    function watchScrollEvent() {
      if (!chatHistoryRef.current) return null;
      const chatHistoryElement = chatHistoryRef.current;
      if (!chatHistoryElement) return null;
      chatHistoryElement.addEventListener("scroll", debouncedScroll);
    }
    watchScrollEvent();
  }, []);

  const scrollToBottom = () => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTo({
        top: chatHistoryRef.current.scrollHeight,
        behavior: "auto",
      });
    }
  };

  // Kurskarten über der Antwort: nach unten scrollen, aber höchstens bis die
  // letzte Frage oben steht — sonst schöbe der wachsende Text die Karten aus
  // dem Bild. Der Pfeil führt weiter ganz nach unten.
  const scrollToLatestTurn = () => {
    const el = chatHistoryRef.current;
    if (!el) return;
    const turns = el.querySelectorAll("[data-assistant-turn]");
    const turn = turns[turns.length - 1];
    const anchor = turn?.previousElementSibling || turn;
    let top = el.scrollHeight;
    if (anchor) {
      const anchorTop =
        anchor.getBoundingClientRect().top -
        el.getBoundingClientRect().top +
        el.scrollTop;
      top = Math.min(top, Math.max(0, anchorTop - 8));
    }
    el.scrollTo({ top, behavior: "auto" });
  };

  const scrollArrow = (
    <div className="allm-absolute allm-bottom-[5.5rem] allm-right-4 allm-z-50 allm-cursor-pointer allm-animate-pulse">
      <div className="allm-flex allm-flex-col allm-items-center">
        <div className="allm-rounded-full allm-border allm-border-white/10 allm-bg-black/20 hover:allm-bg-black/50 allm-w-8 allm-h-8 allm-flex allm-items-center allm-justify-center">
          <ArrowDown
            weight="bold"
            className="allm-text-white/50 allm-w-4 allm-h-4"
            onClick={scrollToBottom}
            id="scroll-to-bottom-button"
            aria-label="Scroll to bottom"
          />
        </div>
      </div>
    </div>
  );

  if (history.length === 0) {
    return (
      <div className="allm-h-full allm-overflow-y-auto allm-px-2 allm-py-4 allm-flex allm-flex-col allm-justify-start allm-no-scroll">
        <div className="allm-flex allm-h-full allm-flex-col allm-items-center allm-justify-center">
          <p className="allm-text-[color:var(--allmi-text-muted,#94a3b8)] allm-text-sm allm-font-sans allm-py-4 allm-text-center">
            {settings?.greeting ?? "Send a chat to get started."}
          </p>
          <SuggestedMessages settings={settings} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="allm-h-full allm-overflow-y-auto allm-px-2 allm-pt-4 allm-pb-8 allm-flex allm-flex-col allm-justify-start allm-no-scroll"
      id="chat-history"
      ref={chatHistoryRef}
    >
      <div className="allm-flex allm-flex-col allm-gap-y-4">
        {history.map((props, index) => {
          const isLastMessage = index === history.length - 1;
          const isLastBotReply =
            index === history.length - 1 && props.role === "assistant";

          // Kurskarten über der Antwort: stabiler Block je Antwort (Name,
          // Karten, Antwort). Die Karten bleiben beim Wechsel PromptReply ->
          // HistoricalMessage am Stream-Ende im DOM (kein Neuaufbau).
          const above = cardsAbove && props.role === "assistant";
          const live = isLastBotReply && !!props.animate;

          const body = live ? (
            <PromptReply
              key={props.uuid}
              ref={isLastMessage ? replyRef : null}
              uuid={props.uuid}
              reply={props.content}
              pending={props.pending}
              sources={props.sources}
              error={props.error}
              closed={props.closed}
              nameInWrapper={above}
            />
          ) : (
            <HistoricalMessage
              key={index}
              ref={isLastMessage ? replyRef : null}
              message={props.content}
              sentAt={props.sentAt}
              role={props.role}
              sources={props.sources}
              courseSources={props.courseSources}
              courseCards={settings?.courseCards}
              courseCardsPosition={above ? "above" : "below"}
              courseCardsAnnounced={props.courseCardsAnnounced}
              chatId={props.chatId}
              feedbackScore={props.feedbackScore}
              sessionId={sessionId}
              error={props.error}
              errorMsg={props.errorMsg}
              nameInWrapper={above}
            />
          );
          if (!above) return body;
          return (
            <AssistantTurnAbove
              key={index}
              message={props}
              live={live}
              courseCards={settings?.courseCards}
            >
              {body}
            </AssistantTurnAbove>
          );
        })}
      </div>
      {!isAtBottom &&
        (arrowSlot ? createPortal(scrollArrow, arrowSlot) : scrollArrow)}
    </div>
  );
}

// Assistenten-Antwort mit Kurskarten oben (courseCardsPosition "above"):
// [Name] [Karten] [Antwortblase]. Ohne Karten pixelgleich zur normalen
// Antwort (Name + 5px Polsterung wandern nur in den umgebenden Block).
// Die Karten erscheinen, sobald der Server sie ankündigt (Chunk
// "courseSources", vor dem ersten Text-Token); bis zum ersten Token zeigt
// PromptReply den Tipp-Indikator. Ergänzungen am Stream-Ende werden angehängt.
function AssistantTurnAbove({ message: props, live, courseCards, children }) {
  const hasCards =
    !props.error &&
    Array.isArray(props.courseSources) &&
    props.courseSources.length > 0;
  return (
    <div className="allm-pt-[5px]" data-assistant-turn="">
      <div className={MESSAGE_NAME_CLASS}>
        {embedderSettings.settings.assistantName ||
          "Anything LLM Chat Assistant"}
      </div>
      {hasCards && (
        <CourseCards
          reply={stripCardsMarker(
            String(props.content || "").replace(
              /<think>[\s\S]*?<\/think>/g,
              "",
            ),
            { partial: live },
          )}
          courseSources={props.courseSources}
          courseCards={courseCards}
          position="above"
          part="cards"
          announced={props.courseCardsAnnounced}
        />
      )}
      {children}
    </div>
  );
}

export function ChatHistoryLoading() {
  return (
    <div className="allm-h-full allm-w-full allm-relative">
      <div className="allm-h-full allm-max-h-[82vh] allm-pb-[100px] allm-pt-[5px] allm-bg-[color:var(--allmi-bg,#f3f4f6)] allm-rounded-lg allm-px-2 allm-h-full allm-mt-2 allm-gap-y-2 allm-overflow-y-scroll allm-flex allm-flex-col allm-justify-start allm-no-scroll">
        <div className="allm-flex allm-h-full allm-flex-col allm-items-center allm-justify-center">
          <CircleNotch
            size={14}
            className="allm-text-[color:var(--allmi-text-muted,#94a3b8)] allm-animate-spin"
          />
        </div>
      </div>
    </div>
  );
}

function SuggestedMessages({ settings }) {
  if (!settings?.defaultMessages?.length) return null;

  return (
    <div className="allm-flex allm-flex-col allm-gap-y-2 allm-w-[75%]">
      {settings.defaultMessages.map((content, i) => (
        <button
          key={i}
          style={{
            opacity: 0,
            wordBreak: "break-word",
            backgroundColor: `var(--allmi-user-bg, ${embedderSettings.USER_STYLES.msgBg})`,
            color: `var(--allmi-user-text, ${embedderSettings.USER_STYLES.msgText || "#FFFFFF"})`,
            fontSize: suggestionFontSize(settings.textSize),
          }}
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent(SEND_TEXT_EVENT, {
                detail: { command: content },
              }),
            );
          }}
          className={`msg-suggestion allm-font-sans allm-border-none hover:allm-shadow-[0_4px_14px_rgba(0,0,0,0.5)] allm-cursor-pointer allm-px-2 allm-py-2 allm-rounded-lg allm-w-full allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)]`}
        >
          {content}
        </button>
      ))}
    </div>
  );
}
