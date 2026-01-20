import { fetchEventSource } from "@microsoft/fetch-event-source";
import { v4 } from "uuid";

const ChatService = {
  // Check if embed is enabled (returns true if enabled, false if disabled)
  checkEmbedStatus: async function (embedSettings) {
    const { embedId, baseApiUrl } = embedSettings;
    try {
      const res = await fetch(`${baseApiUrl}/${embedId}/status`);
      if (!res.ok) return true; // If endpoint doesn't exist, assume enabled
      const data = await res.json();
      return data.enabled !== false;
    } catch (e) {
      console.error("AnythingLLM Embed: Could not check embed status", e);
      return true; // On error, assume enabled
    }
  },

  embedSessionHistory: async function (embedSettings, sessionId) {
    const { embedId, baseApiUrl } = embedSettings;
    return await fetch(`${baseApiUrl}/${embedId}/${sessionId}`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Invalid response from server");
      })
      .then((res) => {
        return res.history.map((msg) => ({
          ...msg,
          id: v4(),
          sender: msg.role === "user" ? "user" : "system",
          textResponse: msg.content,
          close: false,
        }));
      })
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  resetEmbedChatSession: async function (embedSettings, sessionId) {
    const { baseApiUrl, embedId } = embedSettings;
    return await fetch(`${baseApiUrl}/${embedId}/${sessionId}`, {
      method: "DELETE",
    })
      .then((res) => res.ok)
      .catch(() => false);
  },
  streamChat: async function (sessionId, embedSettings, message, handleChat) {
    const { baseApiUrl, embedId, username } = embedSettings;
    const overrides = {
      prompt: embedSettings?.prompt ?? null,
      model: embedSettings?.model ?? null,
      temperature: embedSettings?.temperature ?? null,
    };

    const ctrl = new AbortController();
    await fetchEventSource(`${baseApiUrl}/${embedId}/stream-chat`, {
      method: "POST",
      body: JSON.stringify({
        message,
        sessionId,
        username,
        ...overrides,
      }),
      signal: ctrl.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (response.ok) {
          return; // everything's good
        } else if (response.status >= 400) {
          await response
            .json()
            .then((serverResponse) => {
              handleChat(serverResponse);
            })
            .catch(() => {
              handleChat({
                id: v4(),
                type: "abort",
                textResponse: null,
                sources: [],
                close: true,
                error: `An error occurred while streaming response. Code ${response.status}`,
              });
            });
          ctrl.abort();
          throw new Error();
        } else {
          handleChat({
            id: v4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: `An error occurred while streaming response. Unknown Error.`,
          });
          ctrl.abort();
          throw new Error("Unknown Error");
        }
      },
      async onmessage(msg) {
        try {
          const chatResult = JSON.parse(msg.data);
          handleChat(chatResult);
        } catch {}
      },
      onerror(err) {
        handleChat({
          id: v4(),
          type: "abort",
          textResponse: null,
          sources: [],
          close: true,
          error: `An error occurred while streaming response. ${err.message}`,
        });
        ctrl.abort();
        throw new Error();
      },
    });
  },

  // ============================================
  // Audio Services (STT/TTS)
  // ============================================

  /**
   * Check if STT and TTS are available on the server
   * @param {Object} embedSettings - The embed settings containing baseApiUrl and embedId
   * @returns {Promise<{stt: boolean, tts: boolean}>}
   */
  getAudioStatus: async function (embedSettings) {
    const { embedId, baseApiUrl } = embedSettings;
    try {
      const res = await fetch(`${baseApiUrl}/${embedId}/audio/status`);
      if (!res.ok) return { stt: false, tts: false };
      return await res.json();
    } catch (e) {
      console.error("AnythingLLM Embed: Could not check audio status", e);
      return { stt: false, tts: false };
    }
  },

  /**
   * Transcribe audio to text using server-side STT
   * @param {Object} embedSettings - The embed settings
   * @param {Blob} audioBlob - The audio blob to transcribe
   * @param {string} language - Optional language hint (e.g., 'de', 'en')
   * @returns {Promise<{success: boolean, text?: string, error?: string}>}
   */
  transcribeAudio: async function (embedSettings, audioBlob, language = null) {
    const { embedId, baseApiUrl } = embedSettings;
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");

      // Use embed-specific STT endpoint
      let url = `${baseApiUrl}/${embedId}/audio/stt`;
      if (language) url += `?language=${encodeURIComponent(language)}`;

      const res = await fetch(url, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Transcription failed" }));
        return { success: false, error: error.error || "Transcription failed" };
      }

      const data = await res.json();
      return { success: true, text: data.text };
    } catch (e) {
      console.error("AnythingLLM Embed: Transcription error", e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Convert text to speech using server-side TTS
   * @param {Object} embedSettings - The embed settings containing baseApiUrl and embedId
   * @param {string} text - The text to convert to speech
   * @returns {Promise<string|null>} - Audio URL (blob URL) or null on error
   */
  textToSpeech: async function (embedSettings, text) {
    const { embedId, baseApiUrl } = embedSettings;
    try {
      const res = await fetch(`${baseApiUrl}/${embedId}/audio/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok || res.status === 204) return null;

      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error("AnythingLLM Embed: TTS error", e);
      return null;
    }
  },

  /**
   * Convert text to speech using streaming endpoint with MediaSource API
   * Audio starts playing as MP3 chunks arrive from the server
   * Falls back to blob mode if streaming endpoint not available
   * @param {Object} embedSettings - The embed settings containing baseApiUrl and embedId
   * @param {string} text - The text to convert to speech
   * @param {HTMLAudioElement} audioElement - Audio element to play the stream
   * @param {Function} onStart - Callback when audio starts playing
   * @param {Function} onError - Callback on error
   * @returns {Promise<boolean>} - True if streaming started successfully
   */
  /**
   * Detect best audio format for current browser's MediaSource support
   * @returns {{format: string, mimeType: string, canStream: boolean}}
   */
  _detectBestAudioFormat: function () {
    const hasMediaSource = typeof MediaSource !== 'undefined';
    if (!hasMediaSource) {
      return { format: 'mp3', mimeType: 'audio/mpeg', canStream: false };
    }

    // Firefox: WebM/Opus works best (MP3 MediaSource is buggy)
    const isFirefox = navigator.userAgent.includes('Firefox');
    if (isFirefox && MediaSource.isTypeSupported('audio/webm; codecs=opus')) {
      return { format: 'webm', mimeType: 'audio/webm; codecs=opus', canStream: true };
    }

    // Chrome/Edge/Brave: MP3 works great
    if (MediaSource.isTypeSupported('audio/mpeg')) {
      return { format: 'mp3', mimeType: 'audio/mpeg', canStream: true };
    }

    // Safari or unknown: fallback to mp3 blob mode
    return { format: 'mp3', mimeType: 'audio/mpeg', canStream: false };
  },

  textToSpeechStream: async function (embedSettings, text, audioElement, onStart, onError, onComplete) {
    const { embedId, baseApiUrl } = embedSettings;

    // Detect best format for this browser
    const { format, mimeType, canStream } = this._detectBestAudioFormat();
    console.log("[TTS Stream] Browser detection:", { format, mimeType, canStream });

    // Try streaming endpoint with format parameter
    try {
      const streamRes = await fetch(`${baseApiUrl}/${embedId}/audio/tts-stream?format=${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      console.log("[TTS Stream] Response:", { status: streamRes.status, ok: streamRes.ok });

      // If streaming endpoint exists and returns audio, use MediaSource API if supported
      if (streamRes.ok && streamRes.status !== 204) {
        const contentType = streamRes.headers.get('content-type');
        console.log("[TTS Stream] Content-Type:", contentType, "Can stream:", canStream);

        if (canStream && window.MediaSource && MediaSource.isTypeSupported(mimeType)) {
          // Use MediaSource API for progressive playback
          console.log("[TTS Stream] Using MediaSource with mimeType:", mimeType);
          const mediaSource = new MediaSource();
          audioElement.src = URL.createObjectURL(mediaSource);

          await new Promise((resolve, reject) => {
            mediaSource.addEventListener('sourceopen', async () => {
              try {
                const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
                const reader = streamRes.body.getReader();
                let isFirstChunk = true;

                const appendChunk = async () => {
                  while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                      if (mediaSource.readyState === 'open') {
                        mediaSource.endOfStream();
                      }
                      console.log("[TTS Stream] Stream download complete");
                      onComplete?.();
                      resolve();
                      return;
                    }

                    if (sourceBuffer.updating) {
                      await new Promise(r => sourceBuffer.addEventListener('updateend', r, { once: true }));
                    }

                    sourceBuffer.appendBuffer(value);

                    if (isFirstChunk) {
                      isFirstChunk = false;
                      console.log("[TTS Stream] First chunk received, starting playback");
                      audioElement.play().catch(e => console.error("[TTS Stream] Play error:", e));
                      onStart?.();
                    }

                    await new Promise(r => sourceBuffer.addEventListener('updateend', r, { once: true }));
                  }
                };

                appendChunk().catch(reject);
              } catch (e) {
                reject(e);
              }
            }, { once: true });

            mediaSource.addEventListener('error', () => reject(new Error("MediaSource error")), { once: true });
          });

          return true;
        } else {
          // Server returned audio but not MP3 - use blob
          console.log("[TTS Stream] Using blob fallback (no MediaSource or not MP3)");
          const blob = await streamRes.blob();
          console.log("[TTS Stream] Blob size:", blob.size);
          audioElement.src = URL.createObjectURL(blob);
          audioElement.play().catch(e => console.error("[TTS Stream] Blob play error:", e));
          onStart?.();
          onComplete?.(); // Blob is fully loaded immediately
          return true;
        }
      }
    } catch (e) {
      console.log("Streaming endpoint not available, falling back to standard TTS");
    }

    // Fallback: Use standard TTS endpoint (blob mode)
    try {
      const url = await this.textToSpeech(embedSettings, text);
      if (url) {
        audioElement.src = url;
        audioElement.play().catch(console.error);
        onStart?.();
        onComplete?.(); // Blob is fully loaded immediately
        return true;
      }
    } catch (e) {
      console.error("AnythingLLM Embed: TTS error", e);
    }

    onError?.("TTS failed");
    return false;
  },
};

export default ChatService;
