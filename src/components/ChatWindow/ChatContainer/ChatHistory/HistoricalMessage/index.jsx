import React, { memo, forwardRef, useState, useEffect } from "react";
import { Warning, CaretDown, SpeakerHigh, Stop, CircleNotch } from "@phosphor-icons/react";
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
  const [audioUrl, setAudioUrl] = useState(null);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const audioRef = React.useRef(null);

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
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      audio.currentTime = 0;
    };
    // Use canplay (not canplaythrough) for earlier playback with streaming
    const handleCanPlay = () => {
      setIsReady(true);
      setIsLoading(false);
    };
    const handleError = (e) => {
      console.error("[TTS] Audio error:", e);
      setIsLoading(false);
      setIsReady(false);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
    };
  }, [audioUrl]);

  const handleClick = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      return;
    }

    // If audio is ready and cached, just play it
    if (audioUrl && audioRef.current && isReady) {
      audioRef.current.play();
      return;
    }

    // Use streaming TTS with MediaSource API for progressive playback
    setIsLoading(true);
    setIsReady(false);
    try {
      const settings = embedderSettings.settings;

      // Try streaming first (MediaSource API with MP3)
      const success = await ChatService.textToSpeechStream(
        settings,
        text,
        audioRef.current,
        () => {
          // onStart callback - audio is playing
          setIsLoading(false);
          setIsReady(true);
          setIsPlaying(true);
          setAudioUrl("streaming"); // Mark as streaming (not a real URL)
        },
        (error) => {
          // onError callback
          console.error("[TTS] Streaming error:", error);
          setIsLoading(false);
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

  // Auto-play when audio can start (only for non-streaming mode)
  useEffect(() => {
    // Skip for streaming mode - it handles its own playback
    if (audioUrl === "streaming") return;
    if (audioUrl && audioRef.current && isReady && !isPlaying) {
      audioRef.current.play().catch(console.error);
    }
  }, [audioUrl, isReady]);

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
      <audio
        ref={audioRef}
        src={audioUrl && audioUrl !== "streaming" ? audioUrl : undefined}
        preload="auto"
        hidden
      />
    </div>
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
                src={embedderSettings.settings.assistantIcon || AnythingLLMIcon}
                alt="Anything LLM Icon"
                className="allm-w-9 allm-h-9"
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
            className={`allm-font-sans allm-text-[10px] allm-text-gray-400 allm-ml-[54px] allm-mr-6 allm-mt-2 ${role === "user" ? "allm-text-right" : "allm-text-left"}`}
          >
            {formatDate(sentAt)}
          </div>
        )}
      </div>
    );
  },
);

export default memo(HistoricalMessage);
