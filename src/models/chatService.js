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
    const { baseApiUrl } = embedSettings;
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");

      // STT endpoint is public at /api/audio/transcribe
      const url = new URL(`${baseApiUrl}/audio/transcribe`.replace("/embed", "").replace("/api/embed", "/api"));
      if (language) url.searchParams.set("language", language);

      const res = await fetch(url.toString(), {
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
};

export default ChatService;
