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
   * @param {Object} embedSettings - The embed settings containing baseApiUrl and embedId
   * @param {string} text - The text to convert to speech
   * @param {HTMLAudioElement} audioElement - Audio element to play the stream
   * @param {Function} onStart - Callback when audio starts playing
   * @param {Function} onError - Callback on error
   * @returns {Promise<boolean>} - True if streaming started successfully
   */
  textToSpeechStream: async function (embedSettings, text, audioElement, onStart, onError) {
    const { embedId, baseApiUrl } = embedSettings;

    // Check MediaSource support
    if (!window.MediaSource || !MediaSource.isTypeSupported('audio/mpeg')) {
      console.warn("MediaSource API not supported, falling back to blob");
      const url = await this.textToSpeech(embedSettings, text);
      if (url) {
        audioElement.src = url;
        audioElement.play();
        onStart?.();
        return true;
      }
      onError?.("TTS failed");
      return false;
    }

    try {
      const mediaSource = new MediaSource();
      audioElement.src = URL.createObjectURL(mediaSource);

      await new Promise((resolve, reject) => {
        mediaSource.addEventListener('sourceopen', async () => {
          try {
            const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
            let isFirstChunk = true;

            const res = await fetch(`${baseApiUrl}/${embedId}/audio/tts-stream`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text }),
            });

            if (!res.ok || res.status === 204) {
              reject(new Error("TTS request failed"));
              return;
            }

            const reader = res.body.getReader();

            const appendChunk = async () => {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  // Signal end of stream
                  if (mediaSource.readyState === 'open') {
                    mediaSource.endOfStream();
                  }
                  resolve();
                  return;
                }

                // Wait if buffer is updating
                if (sourceBuffer.updating) {
                  await new Promise(r => sourceBuffer.addEventListener('updateend', r, { once: true }));
                }

                // Append chunk to buffer
                sourceBuffer.appendBuffer(value);

                // Start playback on first chunk
                if (isFirstChunk) {
                  isFirstChunk = false;
                  audioElement.play().catch(console.error);
                  onStart?.();
                }

                // Wait for append to complete
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
    } catch (e) {
      console.error("AnythingLLM Embed: TTS streaming error", e);
      onError?.(e.message);
      return false;
    }
  },
};

export default ChatService;
