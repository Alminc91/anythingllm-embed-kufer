import { CircleNotch, PaperPlaneRight, Microphone, Stop } from "@phosphor-icons/react";
import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ChatService from "@/models/chatService";
import { isIOS, isTouchDevice } from "@/utils/platform";
import useEmbedMode from "@/hooks/useEmbedMode";

// iOS-only: sticky-Eingabezeile auf eigene Compositing-Ebene zwingen (WebKit-Fix).
// Auf Desktop weggelassen, da es dort ein Paint-Flackern beim Streaming verursacht.
const COMPOSITING_HACK_STYLE = isIOS()
  ? { transform: "translateZ(0)", WebkitTransform: "translateZ(0)", willChange: "transform" }
  : undefined;

export default function PromptInput({
  settings,
  message,
  submit,
  onChange,
  inputDisabled,
  buttonDisabled,
}) {
  const { t } = useTranslation();
  const embedMode = useEmbedMode();
  const formRef = useRef(null);
  // Inline-Modus: nach einer Antwort nur re-fokussieren, wenn der Nutzer vorher
  // im Eingabefeld war (Enter bzw. Klick auf Senden aus dem Feld heraus).
  const refocusRef = useRef(false);
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [_, setFocused] = useState(false);
  const [sttAvailable, setSttAvailable] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Check if STT is available on mount (only if enabled via attribute)
  useEffect(() => {
    async function checkAudioStatus() {
      // Skip if STT is disabled via widget attribute
      if (settings?.enableStt === false || settings?.enableStt === "false") {
        setSttAvailable(false);
        return;
      }
      if (!settings?.baseApiUrl || !settings?.embedId) return;
      const status = await ChatService.getAudioStatus(settings);
      setSttAvailable(status.stt === true);
    }
    checkAudioStatus();
  }, [settings?.baseApiUrl, settings?.embedId, settings?.enableStt]);

  // Fokus nach jeder Antwort (inputDisabled-Wechsel) bzw. beim Mount.
  // preventScroll: ein Fokus darf nie die Webseite zum Eingabefeld scrollen.
  // Blase: wie bisher immer. Inline (mitten in der Seite): nur wenn der Nutzer
  // gerade tippt (Fokus lag im Feld) oder die Leiste per Klick geöffnet hat —
  // auf Touch/Mobil nie automatisch (öffnet sonst Tastatur + scrollt die Seite).
  useEffect(() => {
    if (!inputDisabled && textareaRef.current) {
      if (!embedMode.inline) {
        textareaRef.current.focus({ preventScroll: true });
      } else {
        const wanted =
          refocusRef.current || embedMode.consumeFocusRequest?.() === true;
        if (wanted && !isTouchDevice())
          textareaRef.current.focus({ preventScroll: true });
      }
      refocusRef.current = false;
    }
    resetTextAreaHeight();
  }, [inputDisabled]);

  const textareaHasFocus = () => {
    const el = textareaRef.current;
    if (!el) return false;
    const root = el.getRootNode?.();
    return (root?.activeElement ?? document.activeElement) === el;
  };

  const handleSubmit = (e) => {
    setFocused(false);
    submit(e);
  };

  const resetTextAreaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const captureEnter = (event) => {
    if (event.keyCode == 13) {
      if (!event.shiftKey) {
        refocusRef.current = true; // Nutzer tippt gerade -> nach Antwort weiter
        submit(event);
      }
    }
  };

  const adjustTextArea = (event) => {
    const element = event.target;
    // Only grow if content exceeds single line (~44px with padding)
    element.style.height = "auto";
    const singleLineHeight = 44;
    if (element.scrollHeight > singleLineHeight) {
      element.style.height = element.scrollHeight + "px";
    }
  };

  // STT Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        if (audioChunksRef.current.length === 0) {
          setIsRecording(false);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        });

        await transcribeAudio(audioBlob);
        setIsRecording(false);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (e) {
      console.error("[STT] Failed to start recording:", e);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const transcribeAudio = async (audioBlob) => {
    setIsTranscribing(true);
    try {
      // Don't send language parameter - let Whisper auto-detect
      // This ensures transcription in the original spoken language (not translation)
      console.log("[STT] Transcribing audio, blob size:", audioBlob.size);

      const result = await ChatService.transcribeAudio(settings, audioBlob, null);
      console.log("[STT] Transcription result:", result);

      if (result.success && result.text) {
        // Update the message input with transcribed text
        const newValue = message ? `${message} ${result.text}` : result.text;
        console.log("[STT] Setting message to:", newValue);
        onChange({ target: { value: newValue } });
      } else {
        console.warn("[STT] No text returned:", result);
      }
    } catch (e) {
      console.error("[STT] Transcription error:", e);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleMicrophoneClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div
      style={COMPOSITING_HACK_STYLE}
      className="allm-w-full allm-sticky allm-bottom-0 allm-z-10 allm-flex allm-justify-center allm-items-center allm-bg-white"
    >
      {/* Inline mobil (aufgeklappte Box in der Seite): Tippen aufs Eingabefeld
          öffnet das Vollbild-Overlay statt das Feld in der Seite zu fokussieren. */}
      {embedMode.requestFullscreen && (
        <button
          type="button"
          onClick={embedMode.requestFullscreen}
          aria-label={settings.sendMessageText || t("chat.send-message")}
          className="allm-absolute allm-inset-0 allm-z-20 allm-w-full allm-h-full allm-bg-transparent allm-border-none allm-cursor-text allm-p-0 allm-m-0"
        />
      )}
      <form
        onPointerDownCapture={() => {
          // Klick auf Senden/Mikro, während im Feld getippt wird -> Fokus merken
          refocusRef.current = textareaHasFocus();
        }}
        onSubmit={handleSubmit}
        className="allm-flex allm-flex-col allm-gap-y-1 allm-rounded-t-lg allm-w-full allm-items-center allm-justify-center"
      >
        <div className="allm-flex allm-items-center allm-w-full">
          <div className="allm-bg-white allm-flex allm-flex-col allm-px-4 allm-overflow-hidden allm-w-full">
            <div
              style={{ border: "1.5px solid #22262833" }}
              className="allm-flex allm-items-center allm-w-full allm-rounded-2xl"
            >
              <textarea
                ref={textareaRef}
                onKeyUp={adjustTextArea}
                onKeyDown={captureEnter}
                onChange={onChange}
                required={true}
                disabled={inputDisabled}
                onFocus={() => setFocused(true)}
                onBlur={(e) => {
                  setFocused(false);
                  adjustTextArea(e);
                }}
                value={message}
                rows={1}
                style={{
                  height: '20px',
                  minHeight: '20px',
                  lineHeight: '20px',
                  padding: '12px 12px',
                  margin: '0',
                }}
                className="allm-font-sans allm-border-none allm-cursor-text allm-max-h-[100px] allm-text-[16px] allm-w-full allm-text-black allm-bg-transparent placeholder:allm-text-slate-800/60 allm-resize-none active:allm-outline-none focus:allm-outline-none allm-flex-grow"
                placeholder={settings.sendMessageText || t("chat.send-message")}
                id="message-input"
              />

              {/* Microphone Button (STT) - matches send button style */}
              {sttAvailable && (
                <button
                  type="button"
                  onClick={handleMicrophoneClick}
                  disabled={inputDisabled || isTranscribing}
                  className="allm-bg-transparent allm-border-none allm-inline-flex allm-justify-center allm-rounded-2xl allm-cursor-pointer allm-text-black group allm-flex-shrink-0"
                  aria-label={isRecording ? "Stop recording" : "Start recording"}
                  title={isRecording ? t("chat.stop-recording") : t("chat.start-recording")}
                >
                  {isTranscribing ? (
                    <CircleNotch size={24} className="allm-my-3 allm-animate-spin allm-text-[#22262899]/60" />
                  ) : isRecording ? (
                    <Stop size={24} weight="fill" className="allm-my-3 allm-text-red-500 allm-animate-pulse" />
                  ) : (
                    <Microphone size={24} weight="fill" className="allm-my-3 allm-text-[#22262899]/60 group-hover:allm-text-[#22262899]/90" />
                  )}
                </button>
              )}

              <button
                ref={formRef}
                type="submit"
                disabled={buttonDisabled}
                className="allm-bg-transparent allm-border-none allm-inline-flex allm-justify-center allm-rounded-2xl allm-cursor-pointer allm-text-black group allm-flex-shrink-0"
                id="send-message-button"
                aria-label="Send message"
              >
                {buttonDisabled ? (
                  <CircleNotch className="allm-w-4 allm-h-4 allm-animate-spin" />
                ) : (
                  <PaperPlaneRight
                    size={24}
                    className="allm-my-3 allm-text-[#22262899]/60 group-hover:allm-text-[#22262899]/90"
                    weight="fill"
                  />
                )}
                <span className="allm-sr-only">Send message</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
