import HistoricalMessage from "./HistoricalMessage";
import PromptReply from "./PromptReply";
import CourseCards from "./CourseCards";
import AssistantName from "./AssistantName";
import PanelWelcome, { PanelGreeting, SuggestedPills } from "./PanelWelcome";
import {
  cardsAnnounced,
  courseCardsAbove,
  courseCardsEnabled,
  courseCardsLayout,
  entryCourseCards,
  followUpsList,
  selectAnnouncedCourseCards,
  teaserMap,
} from "@/utils/courseCards";
import { stripThink } from "@/utils/chat/think";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowDown, CircleNotch } from "@phosphor-icons/react";
import { embedderSettings } from "@/main";
import { suggestionFontSize } from "@/utils/theme";
import { greetingText, panelTexts, uiTexts } from "@/utils/layout";
import debounce from "lodash.debounce";
import { sendSuggestion } from "..";

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
  // Folgefragen: Eingabe frei (keine Antwort lädt, kein Datenschutz-Hinweis)
  canSend = true,
}) {
  const replyRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const chatHistoryRef = useRef(null);
  const arrowSlot = useContext(ScrollArrowSlotContext);
  // Mit Kurskarten (oben wie unten, KIE-567): beim Antworten höchstens so weit
  // nachführen, dass die Frage oben steht (Anker je Turn). Ohne Karten ("Nur
  // Text mit Links") wie früher immer ans Ende.
  const anchorScroll = courseCardsEnabled(settings);
  // Kurskarten an: Nachführen zum Anker je Turn (length = Verlaufslänge des
  // Turns, follow = noch nachführen, top = zuletzt selbst gesetzte Position,
  // scrolled = Nutzer hat in diesem Turn selbst gescrollt, pillsAt = schon ins
  // Bild geholte Folgefragen)
  const anchorRef = useRef({
    length: -1,
    follow: false,
    top: null,
    scrolled: false,
    pillsAt: null,
  });
  // Folgefragen-Pillen (followUps "pills"): nur unter der letzten, fertigen
  // Antwort und nur, wenn ein Klick sofort senden kann; hier einmal geprüft
  // (followUpsList), FollowUps bekommt die fertige Liste
  const last = history[history.length - 1];
  const showFollowUps =
    settings.followUps === "pills" &&
    canSend &&
    last?.role === "assistant" &&
    !last.animate &&
    !last.error;
  const rawFollowUps = showFollowUps ? last.followUps : null;
  const followUps = useMemo(
    () => (rawFollowUps ? followUpsList(rawFollowUps) : []),
    [rawFollowUps],
  );
  // Gerade angekommene Folgefragen (nicht beim Verlauf-Laden)
  const pillsAt = followUps.length > 0 ? last.followUpsArrivedAt : undefined;

  useEffect(() => {
    if (!anchorScroll) {
      scrollToBottom();
      return;
    }
    const a = anchorRef.current;
    // Neuer Turn (Frage gesendet, Verlauf geladen): wieder nachführen. Stream-
    // Chunks ersetzen nur den letzten Eintrag (gleiche Länge).
    if (history.length !== a.length) {
      a.length = history.length;
      a.follow = true;
      a.scrolled = false;
    }
    if (a.follow) a.follow = scrollToLatestTurn();
  }, [history]);

  // Kurskarten an (oben oder unten): Folgefragen kommen nach der (oft
  // langen) Antwort und lägen unter dem sichtbaren Bereich -> sanft ans Ende
  // scrollen, aber nur, wenn der Nutzer seit Beginn der Antwort nicht selbst
  // gescrollt hat. Karten unten (Text zuerst): Karten und Folgefragen kommen
  // am Ende, die Frage bleibt oben stehen, der Pfeil führt weiter nach unten.
  // Antwort mit Kurskarten (KIE-565, K-1): höchstens so weit, dass die Frage
  // oben steht. Der Antwortbeginn (Frage, Karten) bleibt im Blick, wie im
  // Inline-Panel; passt der ganze Turn, kommen die Folgefragen trotzdem ins
  // Bild. Nie nach oben scrollen.
  // Ohne Kurskarten („Nur Text mit Links“, KIE-567): Die Pillen erscheinen
  // erst, wenn die Antwort fertig ist (canSend), also nach dem letzten
  // Scrollen ans Ende -> einmal ans Ende nachziehen (ohne Animation, wie
  // der Verlauf in diesem Modus sonst auch).
  useEffect(() => {
    const a = anchorRef.current;
    const el = chatHistoryRef.current;
    if (!pillsAt || !el || a.pillsAt === pillsAt) return;
    if (!anchorScroll) {
      a.pillsAt = pillsAt;
      scrollToBottom();
      return;
    }
    if (a.scrolled) return;
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    a.pillsAt = pillsAt;
    a.follow = false;
    const anchorTop = latestTurnHasCards(el) ? latestTurnAnchorTop(el) : null;
    const top =
      anchorTop === null
        ? el.scrollHeight
        : Math.min(el.scrollHeight, Math.max(0, anchorTop - 8));
    if (anchorTop !== null && top <= el.scrollTop + 1) return;
    el.scrollTo({ top, behavior });
  }, [pillsAt, anchorScroll]);

  // Eigenes Scrollen des Nutzers (Rad, Wischen, Tastatur, Pfeil) beendet das
  // Nachführen für diesen Turn — kein Zurückspringen mehr.
  const stopFollow = () => {
    anchorRef.current.follow = false;
    anchorRef.current.scrolled = true;
  };
  const handleUserScroll = () => {
    const a = anchorRef.current;
    const el = chatHistoryRef.current;
    if (a.top !== null && el && Math.abs(el.scrollTop - a.top) > 1)
      stopFollow();
  };

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
  // Scroll-Listener am Verlauf. Den Scroll-Container gibt es erst ab der
  // ersten Nachricht (leerer Chat: Begrüßung ohne #chat-history); früher hing
  // der Listener nur beim ersten Einhängen an und fehlte deshalb in jedem
  // neu begonnenen Chat (Pfeil verschwand nach dem Scrollen nicht).
  const hasHistory = history.length > 0;
  useEffect(() => {
    const el = chatHistoryRef.current;
    if (!el) return;
    el.addEventListener("scroll", debouncedScroll);
    return () => {
      el.removeEventListener("scroll", debouncedScroll);
      debouncedScroll.cancel?.();
    };
  }, [hasHistory]);

  // Der Pfeil richtet sich nicht nur nach dem Scrollen des Nutzers: Wächst
  // der Inhalt unter dem sichtbaren Bereich, ohne dass gescrollt wird (Text
  // zuerst: die Frage bleibt oben stehen, darunter kommen Text, Karten und
  // Folgefragen; Teaser, Bilder), muss er ebenfalls erscheinen (Fixliste
  // 7.22-rc7 Nr. 36). Darum nach jeder Änderung des Verlaufs und bei jeder
  // Größenänderung des Inhalts neu prüfen.
  const contentRef = useRef(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => handleScroll());
    return () => cancelAnimationFrame(id);
  }, [history, followUps]);
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => debouncedScroll());
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasHistory]);

  const scrollToBottom = () => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTo({
        top: chatHistoryRef.current.scrollHeight,
        behavior: "auto",
      });
    }
  };

  // Kurskarten über der Antwort: mit dem wachsenden Turn nach unten scrollen,
  // aber höchstens bis die letzte Frage (Anker) oben steht — sonst schöbe der
  // wachsende Text die Karten aus dem Bild. Ist der Anker oben, endet das
  // Nachführen (Rückgabe false); der Pfeil führt weiter ganz nach unten.
  const scrollToLatestTurn = () => {
    const el = chatHistoryRef.current;
    if (!el) return false;
    let top = el.scrollHeight;
    const anchorTop = latestTurnAnchorTop(el);
    if (anchorTop !== null) top = Math.min(top, Math.max(0, anchorTop - 8));
    el.scrollTo({ top, behavior: "auto" });
    anchorRef.current.top = el.scrollTop;
    return el.scrollTop < top - 1;
  };

  // Klickfläche ist der ganze Kreis (32 px), nicht nur das Icon
  const scrollArrow = (
    <div className="allm-absolute allm-bottom-[5.5rem] allm-right-4 allm-z-50 allm-cursor-pointer allm-animate-pulse">
      <div className="allm-flex allm-flex-col allm-items-center">
        <button
          type="button"
          id="scroll-to-bottom-button"
          aria-label={uiTexts(settings).scrollToBottom}
          onClick={() => {
            stopFollow();
            scrollToBottom();
          }}
          className="allm-p-0 allm-m-0 allm-cursor-pointer allm-rounded-full allm-border-none allm-bg-black/20 hover:allm-bg-black/50 allm-w-8 allm-h-8 allm-flex allm-items-center allm-justify-center"
        >
          <ArrowDown
            weight="bold"
            className="allm-text-white/50 allm-w-4 allm-h-4"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );

  if (history.length === 0) {
    // Panel-Optik: Pillen statt Balken, Begrüßung als Blase. Ist der
    // Datenschutz-Hinweis an, steht greetingStyle immer auf "bubble"
    // (utils/layout.js applyFixedStandards, E26): nur die Begrüßungsblase
    // trägt die Datenschutz-Blase. "text" nur bei abgeschaltetem Hinweis.
    const bubble = settings?.greetingStyle === "bubble";
    const suggestions =
      settings?.suggestionStyle === "pills" ? (
        <SuggestedPills
          settings={settings}
          align={bubble ? "start" : "center"}
        />
      ) : (
        <SuggestedMessages settings={settings} />
      );
    if (bubble)
      return <PanelWelcome settings={settings} suggestions={suggestions} />;
    return (
      <div className="allm-h-full allm-box-border allm-overflow-y-auto allm-px-2 allm-py-4 allm-flex allm-flex-col allm-justify-start allm-no-scroll">
        <div className="allm-flex allm-h-full allm-flex-col allm-items-center allm-justify-center">
          <p className="allm-text-[color:var(--allmi-text-muted,#94a3b8)] allm-text-sm allm-font-sans allm-py-4 allm-text-center">
            {/* Begrüßung wie in der Blase: gespeichert (gekürzt) oder
                Standard der Sprache (Fixliste 7.22-rc18 W61) */}
            {greetingText(settings)}
          </p>
          {suggestions}
        </div>
      </div>
    );
  }

  // allm-box-border: Höhe inklusive Polsterung (im Shadow DOM gilt kein
  // globales box-sizing). Sonst ragte der Verlauf um die Polsterung (48 px)
  // unter die Eingabe, und die Zeitstempelzeile der letzten Antwort lag am
  // Scroll-Ende teils darunter (Browser-Fund B-08). Unten 8 px statt 32 px:
  // der Abstand zur Eingabe kommt jetzt sichtbar aus dem Rand des Verlaufs
  // (allm-mb-8 im ChatContainer), nicht mehr aus verdeckter Polsterung.
  return (
    <div
      className="allm-h-full allm-box-border allm-overflow-y-auto allm-px-2 allm-pt-4 allm-pb-2 allm-flex allm-flex-col allm-justify-start allm-no-scroll"
      id="chat-history"
      ref={chatHistoryRef}
      {...(anchorScroll && {
        onScroll: handleUserScroll,
        onWheel: stopFollow,
        onTouchMove: stopFollow,
      })}
    >
      <div ref={contentRef} className="allm-flex allm-flex-col allm-gap-y-4">
        {/* Begrüßungsblase (greetingStyle "bubble") bleibt als festes erstes
            Element über dem Verlauf — kein Chat-Eintrag; die Vorschläge
            darunter gibt es nur im leeren Chat. Mit greetingStyle "text"
            unverändert. */}
        {settings?.greetingStyle === "bubble" && (
          <PanelGreeting settings={settings} />
        )}
        {history.map((props, index) => {
          const isLastMessage = index === history.length - 1;
          const live =
            isLastMessage && props.role === "assistant" && !!props.animate;
          // Kurskarten über der Antwort: stabiler Block je Antwort (Name,
          // Karten, Antwort). Die Karten bleiben beim Wechsel PromptReply ->
          // HistoricalMessage am Stream-Ende im DOM (kein Neuaufbau).
          // Kurskarten dieser Antwort: Einstellung, bei vom Server
          // angekündigten Karten immer an (W07, utils/courseCards.js)
          const courseCards = entryCourseCards(settings, props);
          const above =
            props.role === "assistant" &&
            courseCardsAbove({ ...settings, courseCards });

          // selection: Kurskarten-Auswahl des Blocks oben (nur "above") ->
          // HistoricalMessage zeigt damit nur den Abschlusslink
          const renderBody = (selection = null, teasers = null) =>
            live ? (
              <PromptReply
                key={props.uuid}
                ref={isLastMessage ? replyRef : null}
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
                courseSources={above ? null : props.courseSources}
                // oben: Teaser (schon geprüft im Block darüber) nur für die
                // Sprachausgabe; der Fuß zeigt keine Teaser
                courseTeasers={above ? null : props.courseTeasers}
                courseTeaserMap={teasers}
                courseCards={courseCards}
                courseCardsFinal={!above && replyFinal(props)}
                // Karten unten: angekündigte Kurse wie oben auswählen
                courseCardsAnnounced={above ? null : props.courseCardsAnnounced}
                courseCardsSelection={selection}
                chatId={props.chatId}
                feedbackScore={props.feedbackScore}
                sessionId={sessionId}
                error={props.error}
                errorMsg={props.errorMsg}
                nameInWrapper={above}
                followUps={
                  isLastMessage && followUps.length > 0 ? followUps : null
                }
                settings={settings}
              />
            );

          // Karten unten (Text zuerst): Antwort als Turn markieren (Anker
          // für das Nachführen, latestTurn); Aufbau sonst wie bisher
          if (!above)
            return anchorScroll && props.role === "assistant" ? (
              <div key={index} data-answer-turn="below">
                {renderBody()}
              </div>
            ) : (
              renderBody()
            );
          return (
            <AssistantTurnAbove
              key={index}
              message={props}
              courseCards={courseCards}
              layout={courseCardsLayout(settings)}
              pendingText={panelTexts(settings).teaserPending}
              renderBody={renderBody}
            />
          );
        })}
      </div>
      {!isAtBottom &&
        (arrowSlot ? createPortal(scrollArrow, arrowSlot) : scrollArrow)}
    </div>
  );
}

// Position der letzten Frage (Anker des letzten Assistenten-Turns bei
// Kurskarten oben oder unten) im Inhalt des Scroll-Containers in px, null
// ohne Turn.
function latestTurn(el) {
  const turns = el.querySelectorAll(
    "[data-assistant-turn], [data-answer-turn]",
  );
  return turns[turns.length - 1] || null;
}
function latestTurnAnchorTop(el) {
  const turn = latestTurn(el);
  const anchor = turn?.previousElementSibling || turn;
  if (!anchor) return null;
  return (
    anchor.getBoundingClientRect().top -
    el.getBoundingClientRect().top +
    el.scrollTop
  );
}
// Zeigt der letzte Turn Kurskarten (über oder unter der Antwort)?
function latestTurnHasCards(el) {
  return !!latestTurn(el)?.querySelector("[data-course-cards]");
}

// Antwort fertig (Abschluss-Chunk mit chatId verarbeitet bzw. aus dem
// Verlauf geladen): erst dann sind die courseSources vollständig ->
// Fallback-Karten für Kursseiten ohne Serverdaten.
function replyFinal(message) {
  return message?.role === "assistant" && message.chatId !== undefined;
}

// Assistenten-Antwort mit Kurskarten oben (courseCardsPosition "above"):
// [Name] [Karten] [Antwortblase]. Ohne Karten pixelgleich zur normalen
// Antwort (Name + 5px Polsterung wandern nur in den umgebenden Block).
// Die Karten erscheinen, sobald der Server sie ankündigt (Chunk
// "courseSources", vor dem ersten Text-Token); bis zum ersten Token zeigt
// PromptReply den Tipp-Indikator. Ergänzungen am Stream-Ende werden angehängt.
// Die Auswahl und die Teaser werden hier einmal berechnet; die Antwort
// darunter bekommt beide für den Abschlusslink bzw. die Sprachausgabe
// (renderBody). Fallback-Karten (Kursseiten ohne
// Serverdaten) erst bei fertiger Antwort: mit Ankündigung unter der Antwort
// (footerCards), ohne Ankündigung zusammen mit den übrigen Karten oben.
// Teaser-Platzhalter (teaserPending): solange zu den angekündigten Karten
// noch ein Teaser erwartet wird — Karten angekündigt (courseSources-Chunk),
// Antwort streamt, kein Fehler, noch kein courseTeasers-Chunk und noch kein
// Antworttext (der Server schickt die Teaser vor dem ersten Textchunk). Nie
// im geladenen Verlauf, nie unter der Antwort, nie für Fallback-Karten
// (CourseCards). Ein Teaser-Chunk ohne Eintrag für eine Karte beendet deren
// Platzhalter ebenso wie das Stream-Ende.
export function teasersExpected(message) {
  if (!message || message.error || !cardsAnnounced(message)) return false;
  const streaming = message.animate === true || message.pending === true;
  if (!streaming) return false;
  const t = message.courseTeasers;
  if (t && typeof t === "object" && !Array.isArray(t)) return false;
  return !(typeof message.content === "string" && message.content.trim());
}

function AssistantTurnAbove({
  message: props,
  courseCards,
  layout = "grid",
  pendingText = null,
  renderBody,
}) {
  const { content, courseSources, courseCardsAnnounced, error } = props;
  const final = replyFinal(props);
  // Security (Client-DoS): während des Streamings (animate bzw. pending) nur
  // die angekündigten Karten (Text ""), Links/Titel der Antwort erst, wenn
  // sie nicht mehr streamt — nicht pro Chunk die ganze Antwort durchsuchen.
  // Verlauf-Einträge (ohne animate, auch ohne chatId) gelten als fertig.
  const streaming = props.animate === true || props.pending === true;
  const done = final || !streaming;
  const replyText = done ? stripThink(content) : "";
  const hasCards =
    !error &&
    ((Array.isArray(courseSources) && courseSources.length > 0) ||
      (final && courseCardsEnabled({ courseCards })));
  const selection = useMemo(
    () =>
      hasCards
        ? selectAnnouncedCourseCards(
            replyText,
            courseSources,
            { courseCards },
            { announced: courseCardsAnnounced, fallback: final },
          )
        : null,
    [
      hasCards,
      replyText,
      courseSources,
      courseCards,
      courseCardsAnnounced,
      final,
    ],
  );
  const teasers = useMemo(
    () => teaserMap(props.courseTeasers),
    [props.courseTeasers],
  );
  return (
    <div className="allm-pt-[5px]" data-assistant-turn="">
      <AssistantName />
      {selection && (
        <CourseCards
          selection={selection}
          teasers={teasers}
          teaserArrivedAt={props.teaserArrivedAt}
          position="above"
          part="cards"
          layout={layout}
          teaserPending={teasersExpected(props) ? pendingText : null}
        />
      )}
      {renderBody(selection, teasers)}
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
          onClick={(e) => sendSuggestion(content, e.currentTarget)}
          className={`msg-suggestion allm-font-sans allm-border-none hover:allm-shadow-[0_4px_14px_rgba(0,0,0,0.5)] allm-cursor-pointer allm-px-2 allm-py-2 allm-rounded-lg allm-w-full allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)]`}
        >
          {content}
        </button>
      ))}
    </div>
  );
}
