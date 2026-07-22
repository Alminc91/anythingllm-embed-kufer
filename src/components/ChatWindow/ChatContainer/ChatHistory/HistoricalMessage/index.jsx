import React, { memo, forwardRef, useState, useEffect, useRef } from "react";
import { Warning, CaretDown, SpeakerHigh, Stop, CircleNotch, ThumbsUp, ThumbsDown } from "@phosphor-icons/react";
import renderMarkdown from "@/utils/chat/markdown";
import DOMPurify from "@/utils/chat/purify";
import { embedderSettings } from "@/main";
import { v4 } from "uuid";
import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import { formatDate } from "@/utils/date";
import ChatService from "@/models/chatService";

const ThoughtBubble = ({ thought }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!thought || !embedderSettings.settings.showThoughts) return null;

  return (
    <div className="allm-mb-2">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="allm-cursor-pointer allm-flex allm-items-center allm-gap-x-1.5 allm-text-gray-400 hover:allm-text-gray-500"
      >
        <CaretDown
          size={14}
          weight="bold"
          className={`allm-transition-transform ${isExpanded ? "allm-rotate-180" : ""}`}
        />
        <span className="allm-text-xs allm-font-medium">View thoughts</span>
      </div>
      {isExpanded && (
        <div className="allm-mt-2 allm-mb-3 allm-pl-0 allm-border-l-2 allm-border-gray-200">
          <div className="allm-text-xs allm-text-gray-600 allm-font-mono allm-whitespace-pre-wrap">
            {thought.trim()}
          </div>
        </div>
      )}
    </div>
  );
};

// TTS Button Component
const TTSButton = ({ text, size = 14 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [streamComplete, setStreamComplete] = useState(false);
  const audioRef = React.useRef(null);
  const mediaSourceRef = React.useRef(null);

  // Check if TTS is available on mount (only if enabled via attribute)
  useEffect(() => {
    async function checkTTSStatus() {
      const settings = embedderSettings.settings;
      // Skip if TTS is disabled via widget attribute
      if (settings?.enableTts === false || settings?.enableTts === "false") {
        setTtsAvailable(false);
        return;
      }
      if (!settings?.baseApiUrl || !settings?.embedId) return;
      const status = await ChatService.getAudioStatus(settings);
      setTtsAvailable(status.tts === true);
    }
    checkTTSStatus();
  }, []);

  // Setup audio event listeners
  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      // Only set isPlaying to false if user paused, not if stream ended
      // Check if we're at the end of the audio
      const isAtEnd = audio.duration &&
        (audio.currentTime >= audio.duration - 0.5 || audio.ended);
      if (isAtEnd) {
        console.log("[TTS] Audio paused at end");
        setIsPlaying(false);
      } else {
        console.log("[TTS] Audio paused by user");
        setIsPlaying(false);
      }
    };
    const handleEnded = () => {
      console.log("[TTS] Audio ended event");
      setIsPlaying(false);
    };
    const handleError = (e) => {
      console.error("[TTS] Audio error:", e);
      setIsLoading(false);
      setIsPlaying(false);
      setIsReady(false);
    };
    // For MediaSource: detect end via timeupdate when near duration
    // Also handle when stream is complete and playback catches up
    const handleTimeUpdate = () => {
      const audio = audioRef.current;
      if (!audio) return;

      // Check if we're at the end (duration is finite and we're close to it)
      if (audio.duration && isFinite(audio.duration) &&
          audio.currentTime >= audio.duration - 0.1) {
        console.log("[TTS] Audio reached end via timeupdate");
        setIsPlaying(false);
      }

      // For MediaSource with Infinity duration: check if stream is complete
      // and we've played past the buffered range
      if (streamComplete && audio.buffered.length > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        if (audio.currentTime >= bufferedEnd - 0.1) {
          console.log("[TTS] Audio reached end of buffer (stream complete)");
          setIsPlaying(false);
        }
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [streamComplete]);

  const handleClick = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      return;
    }

    // If already played before, replay from beginning
    if (isReady && audioRef.current) {
      audioRef.current.currentTime = 0;
      try {
        await audioRef.current.play();
      } catch (e) {
        console.error("[TTS] Replay error:", e);
      }
      return;
    }

    // Start streaming TTS
    setIsLoading(true);
    setIsReady(false);
    setStreamComplete(false);
    try {
      const settings = embedderSettings.settings;

      const success = await ChatService.textToSpeechStream(
        settings,
        text,
        audioRef.current,
        () => {
          // onStart - audio started playing
          setIsLoading(false);
          setIsReady(true);
          setIsPlaying(true);
        },
        (error) => {
          console.error("[TTS] Streaming error:", error);
          setIsLoading(false);
        },
        () => {
          // onComplete - stream finished downloading
          console.log("[TTS] Stream complete");
          setStreamComplete(true);
        }
      );

      if (!success) {
        setIsLoading(false);
      }
    } catch (e) {
      console.error("[TTS] Error:", e);
      setIsLoading(false);
    }
  };

  // No auto-play needed - streaming handles playback directly

  if (!ttsAvailable || !text) return null;

  return (
    <div className="allm-flex allm-justify-end allm-mt-1">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="allm-bg-transparent allm-border-none allm-cursor-pointer allm-text-gray-400 hover:allm-text-gray-600 disabled:allm-opacity-50 allm-p-0"
        aria-label={isPlaying ? "Stop speaking" : "Speak message"}
        title={isPlaying ? "Stop" : "Speak"}
      >
        {isLoading ? (
          <CircleNotch size={size} className="allm-animate-spin" />
        ) : isPlaying ? (
          <Stop size={size} weight="fill" className="allm-text-red-500" />
        ) : (
          <SpeakerHigh size={size} weight="fill" />
        )}
      </button>
      {/* Audio element always exists for streaming support */}
      <audio ref={audioRef} preload="auto" hidden />
    </div>
  );
};

// KIE-504: Daumen 👍/👎 unter jeder Assistant-Antwort. Dezent in der
// Zeitstempel-Zeile ("HH:MM Uhr | 👍 👎"), gedämpftes Grau wie der TTS-Button,
// aktiver Zustand gefüllt + farbig (👍 grün / 👎 rot). Toggle: erneuter Klick auf
// die aktive Wertung entfernt sie. Tooltip via natives title (wie TTS-Button).
const FEEDBACK_REASONS = ["Zu ungenau", "Falsch", "Unvollständig", "Anderes"];

const FeedbackButtons = ({ chatId, feedbackScore, sessionId }) => {
  const initial = typeof feedbackScore === "boolean" ? feedbackScore : null;
  const [score, setScore] = useState(initial);
  const [busy, setBusy] = useState(false);
  // KIE-507: optionales Kommentarfeld bei 👎 (Grund-Chips + Freitext).
  const [showComment, setShowComment] = useState(false);
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const boxRef = useRef(null);

  // Beim Aufklappen die GANZE Box in den sichtbaren Bereich scrollen — sonst
  // verschwindet sie bei der letzten Antwort hinter dem Eingabefeld. Sauber
  // gerechnet: um wie viel ragt die Box-Unterkante unter den sichtbaren Rand des
  // Chat-Containers (#chat-history) hinaus → genau um diesen Betrag + Luft scrollen.
  // Der Timeout lässt Layout (Chips-Umbruch, Textarea-Höhe) erst fertig rechnen.
  useEffect(() => {
    if (!showComment) return;
    const t = setTimeout(() => {
      const el = boxRef.current;
      const scroller = el?.closest("#chat-history");
      if (!el || !scroller) {
        el?.scrollIntoView({ behavior: "smooth", block: "end" });
        return;
      }
      const GAP = 16; // Luft unter der Box
      // Sichtbare Untergrenze = Oberkante des Eingabefelds, falls es den Chat
      // überlappt; sonst die Unterkante des Scrollers. So sitzt die Box immer
      // vollständig ÜBER dem Eingabefeld.
      const inputWrap = scroller.parentElement?.nextElementSibling;
      const boundaryBottom = inputWrap
        ? inputWrap.getBoundingClientRect().top
        : scroller.getBoundingClientRect().bottom;
      const overflowBelow = el.getBoundingClientRect().bottom - boundaryBottom;
      if (overflowBelow > -GAP) {
        scroller.scrollTo({
          top: scroller.scrollTop + overflowBelow + GAP,
          behavior: "smooth",
        });
      }
    }, 100);
    return () => clearTimeout(t);
  }, [showComment]);

  const submit = async (value) => {
    if (busy) return;
    const next = score === value ? null : value; // Toggle
    const prev = score;
    setScore(next); // optimistisch
    if (next === false) {
      // Frische 👎-Box: alte Eingaben zurücksetzen (kein Vorbefüllen).
      setReason(null);
      setComment("");
      setSent(false);
      setShowComment(true); // bei 👎 Kommentarfeld zeigen
    } else {
      setShowComment(false); // 👍 oder Entfernen: Box schließen
    }
    setBusy(true);
    const ok = await ChatService.sendFeedback(
      embedderSettings.settings,
      sessionId,
      chatId,
      next,
    );
    if (!ok) setScore(prev); // bei Fehler zurücksetzen
    setBusy(false);
  };

  // KIE-507: Freitext + Grund speichern (feedback bleibt 👎). Danach kurze
  // Danke-Bestätigung und Einklappen.
  const sendComment = async () => {
    if (sending) return;
    setSending(true);
    const ok = await ChatService.sendFeedback(
      embedderSettings.settings,
      sessionId,
      chatId,
      false,
      comment.trim() || null,
      reason || null,
    );
    setSending(false);
    if (ok) {
      setSent(true);
      setTimeout(() => setShowComment(false), 1500);
    }
  };

  const dismissComment = () => {
    setShowComment(false);
    setReason(null);
    setComment("");
  };

  const btnBase =
    "allm-bg-transparent allm-border-none allm-cursor-pointer allm-p-1.5 allm-flex allm-items-center allm-transition-colors disabled:allm-opacity-60";
  const accent = embedderSettings.settings.buttonColor || "#01a5a9";

  return (
    <>
      <div className="allm-flex allm-items-center allm-gap-x-1.5">
        <span
          className="allm-text-gray-300 allm-select-none"
          aria-hidden="true"
        >
          |
        </span>
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={busy}
          aria-label="Antwort war hilfreich"
          title="Hilfreich"
          className={`${btnBase} ${
            score === true
              ? "allm-text-green-600"
              : "allm-text-gray-400 hover:allm-text-gray-600"
          }`}
        >
          <ThumbsUp size={16} weight={score === true ? "fill" : "regular"} />
        </button>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={busy}
          aria-label="Antwort war nicht hilfreich"
          title="Nicht hilfreich"
          className={`${btnBase} ${
            score === false
              ? "allm-text-red-600"
              : "allm-text-gray-400 hover:allm-text-gray-600"
          }`}
        >
          <ThumbsDown size={16} weight={score === false ? "fill" : "regular"} />
        </button>
      </div>

      {/* KIE-507: inline aufklappendes Kommentarfeld bei 👎 (Grund-Chips + Freitext) */}
      {showComment && (
        <div
          ref={boxRef}
          className="allm-box-border allm-basis-full allm-w-full allm-mt-2 allm-rounded-lg allm-border allm-border-red-200 allm-bg-red-50 allm-p-2.5 allm-normal-case"
        >
          {sent ? (
            <div className="allm-flex allm-items-center allm-gap-x-1.5 allm-text-[12px] allm-font-medium allm-text-red-700 allm-py-1">
              <span aria-hidden="true">✓</span> Danke für Ihr Feedback!
            </div>
          ) : (
            <>
              <div className="allm-text-[11px] allm-font-medium allm-text-red-700 allm-mb-2">
                Was war das Problem?{" "}
                <span className="allm-font-normal allm-text-gray-400">
                  (optional)
                </span>
              </div>
              <div className="allm-flex allm-flex-wrap allm-gap-1.5 allm-mb-2">
                {FEEDBACK_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(reason === r ? null : r)}
                    className={`allm-text-[11px] allm-px-2 allm-py-[3px] allm-rounded-full allm-border allm-cursor-pointer allm-transition-colors ${
                      reason === r
                        ? "allm-border-red-400 allm-bg-red-100 allm-text-red-700"
                        : "allm-border-gray-200 allm-bg-white allm-text-gray-500 hover:allm-border-gray-300"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional: kurz beschreiben – z. B. die richtige Antwort…"
                className="allm-box-border allm-w-full allm-resize-none allm-text-[13px] allm-px-2 allm-py-1.5 allm-rounded-md allm-border allm-border-gray-200 allm-bg-white allm-text-gray-700 allm-outline-none focus:allm-border-gray-300"
              />
              <div className="allm-flex allm-justify-end allm-items-center allm-gap-x-3 allm-mt-2">
                <button
                  type="button"
                  onClick={dismissComment}
                  className="allm-bg-transparent allm-border-none allm-cursor-pointer allm-text-[11px] allm-text-gray-400 hover:allm-text-gray-600"
                >
                  Überspringen
                </button>
                <button
                  type="button"
                  onClick={sendComment}
                  disabled={sending}
                  style={{ backgroundColor: accent }}
                  className="allm-border-none allm-cursor-pointer allm-text-[11px] allm-text-white allm-px-3 allm-py-1 allm-rounded-md disabled:allm-opacity-60"
                >
                  {sending ? "Senden…" : "Senden"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

const HistoricalMessage = forwardRef(
  (
    {
      uuid = v4(),
      message,
      role,
      sources = [],
      error = false,
      errorMsg = null,
      sentAt,
      chatId = null,
      feedbackScore = null,
      sessionId = null,
    },
    ref,
  ) => {
    const textSize = !!embedderSettings.settings.textSize
      ? `allm-text-[${embedderSettings.settings.textSize}px]`
      : "allm-text-sm";
    if (error) console.error(`ANYTHING_LLM_CHAT_WIDGET_ERROR: ${error}`);

    // Extract content between think tags if they exist
    const thinkMatches = message?.match(/<think>([\s\S]*?)<\/think>/g) || [];
    const thoughts = thinkMatches.map((match) =>
      match.replace(/<think>|<\/think>/g, "").trim(),
    );

    // Get the response content without the think tags
    const responseContent = message
      ?.replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();

    // Clean text for TTS (remove markdown, HTML, etc.)
    const plainTextForTTS = responseContent
      ?.replace(/[#*_`~\[\]()]/g, "") // Remove markdown
      ?.replace(/<[^>]*>/g, "") // Remove HTML tags
      ?.trim();

    const ttsPosition = embedderSettings.settings.ttsPosition || "bottom-right";

    return (
      <div className="allm-py-[5px]">
        {role === "assistant" && (
          <div className="allm-text-[10px] allm-text-gray-400 allm-ml-[54px] allm-mr-6 allm-mb-2 allm-text-left allm-font-sans">
            {embedderSettings.settings.assistantName ||
              "Anything LLM Chat Assistant"}
          </div>
        )}
        <div
          key={uuid}
          ref={ref}
          className={`allm-flex allm-items-start allm-w-full allm-h-fit ${
            role === "user" ? "allm-justify-end" : "allm-justify-start"
          }`}
        >
          {role === "assistant" && (
            <div className="allm-flex allm-flex-col allm-items-center allm-ml-2 allm-flex-shrink-0">
              <img
                src={
                  embedderSettings.settings.assistantIcon ||
                  embedderSettings.settings.brandImageUrl ||
                  AnythingLLMIcon
                }
                alt="Anything LLM Icon"
                className="allm-w-9 allm-h-9 allm-object-contain"
                id="anything-llm-icon"
              />
              {/* TTS Button under avatar (icon-left position) */}
              {ttsPosition === "icon-left" && !error && plainTextForTTS && (
                <div className="allm-mt-1">
                  <TTSButton text={plainTextForTTS} size={16} />
                </div>
              )}
            </div>
          )}
          <div
            style={{
              wordBreak: "break-word",
              backgroundColor:
                role === "user"
                  ? embedderSettings.USER_STYLES.msgBg
                  : embedderSettings.ASSISTANT_STYLES.msgBg,
              ...(role === "user" && embedderSettings.USER_STYLES.msgText
                ? { color: embedderSettings.USER_STYLES.msgText }
                : {}),
            }}
            className={`allm-py-[11px] allm-px-4 allm-flex allm-flex-col allm-font-sans ${
              error
                ? "allm-bg-red-200 allm-rounded-lg allm-mr-[37px] allm-ml-[9px]"
                : role === "user"
                  ? `${embedderSettings.USER_STYLES.base} allm-anything-llm-user-message`
                  : `${embedderSettings.ASSISTANT_STYLES.base} allm-anything-llm-assistant-message`
            } allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)]`}
          >
            <div className="allm-flex allm-flex-col">
              {error ? (
                <div className="allm-p-2 allm-rounded-lg allm-bg-amber-50 allm-text-amber-700">
                  <span className="allm-inline-block">
                    <Warning className="allm-h-4 allm-w-4 allm-mb-1 allm-inline-block" />{" "}
                    Unser Chatbot ist vorübergehend nicht verfügbar.
                  </span>
                  <p className="allm-text-xs allm-mt-2">
                    Bitte versuchen Sie es später erneut.
                  </p>
                </div>
              ) : (
                <>
                  {role === "assistant" && thoughts.length > 0 && (
                    <ThoughtBubble thought={thoughts.join("\n\n")} />
                  )}
                  <span
                    className={`allm-whitespace-pre-line allm-flex allm-flex-col allm-gap-y-1 ${textSize} allm-leading-[20px]`}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(
                        renderMarkdown(responseContent || message),
                      ),
                    }}
                  />
                  {/* TTS Button for assistant messages (bottom-right position) */}
                  {role === "assistant" && !error && plainTextForTTS && ttsPosition !== "icon-left" && (
                    <TTSButton text={plainTextForTTS} size={14} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {sentAt && (
          <div
            className={`allm-font-sans allm-text-[10px] allm-text-gray-400 allm-ml-[54px] allm-mr-6 allm-mt-2 allm-flex allm-flex-wrap allm-items-center allm-gap-x-1.5 ${role === "user" ? "allm-justify-end" : "allm-justify-start"}`}
          >
            <span>{formatDate(sentAt)}</span>
            {role === "assistant" && !error && chatId && (
              <FeedbackButtons
                chatId={chatId}
                feedbackScore={feedbackScore}
                sessionId={sessionId}
              />
            )}
          </div>
        )}
      </div>
    );
  },
);

export default memo(HistoricalMessage);
