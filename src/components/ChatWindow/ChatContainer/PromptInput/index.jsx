import { CircleNotch, PaperPlaneRight, Microphone, Stop } from "@phosphor-icons/react";
import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ChatService from "@/models/chatService";

export default function PromptInput({
  settings,
  message,
  submit,
  onChange,
  inputDisabled,
  buttonDisabled,
}) {
  const { t } = useTranslation();
  const formRef = useRef(null);
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

  useEffect(() => {
    if (!inputDisabled && textareaRef.current) {
      textareaRef.current.focus();
    }
    resetTextAreaHeight();
  }, [inputDisabled]);

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
        submit(event);
      }
    }
  };

  const adjustTextArea = (event) => {
    const element = event.target;
    // Only grow when content exceeds one line
    if (element.scrollHeight > 32) {
      element.style.height = element.scrollHeight + "px";
    } else {
      element.style.height = "auto";
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
    <div className="allm-w-full allm-sticky allm-bottom-0 allm-z-10 allm-flex allm-justify-center allm-items-center allm-bg-white">
      <form
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
                className="allm-font-sans allm-border-none allm-cursor-text allm-max-h-[100px] allm-h-[32px] allm-text-[14px] allm-leading-[32px] allm-px-3 allm-w-full allm-text-black allm-bg-transparent placeholder:allm-text-slate-800/60 allm-resize-none active:allm-outline-none focus:allm-outline-none allm-flex-grow"
                placeholder={settings.sendMessageText || t("chat.send-message")}
                id="message-input"
              />

              {/* Buttons container - fixed height, always centered */}
              <div className="allm-flex allm-items-center allm-h-[32px] allm-flex-shrink-0 allm-pr-2 allm-gap-1">
                {/* Microphone Button (STT) */}
                {sttAvailable && (
                  <button
                    type="button"
                    onClick={handleMicrophoneClick}
                    disabled={inputDisabled || isTranscribing}
                    className="allm-bg-transparent allm-border-none allm-cursor-pointer allm-text-[#22262899]/60 hover:allm-text-[#22262899]/90 disabled:allm-opacity-50 allm-p-1"
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    title={isRecording ? t("chat.stop-recording") : t("chat.start-recording")}
                  >
                    {isTranscribing ? (
                      <CircleNotch size={20} className="allm-animate-spin" />
                    ) : isRecording ? (
                      <Stop size={20} weight="fill" className="allm-text-red-500 allm-animate-pulse" />
                    ) : (
                      <Microphone size={20} weight="fill" />
                    )}
                  </button>
                )}

                <button
                  ref={formRef}
                  type="submit"
                  disabled={buttonDisabled}
                  className="allm-bg-transparent allm-border-none allm-inline-flex allm-justify-center allm-items-center allm-cursor-pointer allm-text-black group allm-p-1"
                  id="send-message-button"
                  aria-label="Send message"
                >
                  {buttonDisabled ? (
                    <CircleNotch className="allm-w-5 allm-h-5 allm-animate-spin" />
                  ) : (
                    <PaperPlaneRight
                      size={20}
                      className="allm-text-[#22262899]/60 group-hover:allm-text-[#22262899]/90"
                      weight="fill"
                    />
                  )}
                  <span className="allm-sr-only">Send message</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
