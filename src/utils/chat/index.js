import { appendReplyText, stripCardsMarker } from "@/utils/courseCards";

// For handling of synchronous chats that are not utilizing streaming or chat requests.
// Karten-Marker ("[[KARTEN: …]]", ältere Server) wird hier bei der Aufnahme
// entfernt — Anzeige, Vorlesen, Kopieren und Feedback sehen nur sauberen Text.
export default function handleChat(
  chatResult,
  setLoadingResponse,
  setChatHistory,
  remHistory,
  _chatHistory,
) {
  const {
    uuid,
    textResponse,
    type,
    sources = [],
    error,
    close,
    chatId = null, // KIE-504: DB-id der Antwort für die 👍/👎-Bewertung
    errorMsg = null,
    // Kurskarten: Kurs-Metadaten (nie Kontexttext), kommen mit dem
    // Abschluss-Chunk; ohne Feld bleibt die Nachricht unverändert.
    courseSources = null,
    // Kurskarten v2: Anzahl vorab angekündigter Kurse am Listenanfang
    courseCardsAnnounced = null,
  } = chatResult;
  const courseExtra = Array.isArray(courseSources)
    ? {
        courseSources,
        ...(Number.isInteger(courseCardsAnnounced) && courseCardsAnnounced > 0
          ? { courseCardsAnnounced }
          : {}),
      }
    : {};

  // Preserve the sentAt from the last message in the chat history
  const lastMessage = _chatHistory[_chatHistory.length - 1];
  const sentAt = lastMessage?.sentAt;

  if (type === "abort") {
    setLoadingResponse(false);
    setChatHistory([
      ...remHistory,
      {
        uuid,
        content: textResponse,
        role: "assistant",
        sources,
        closed: true,
        error,
        errorMsg,
        animate: false,
        pending: false,
        sentAt,
      },
    ]);
    _chatHistory.push({
      uuid,
      content: textResponse,
      role: "assistant",
      sources,
      closed: true,
      error,
      errorMsg,
      animate: false,
      pending: false,
      sentAt,
    });
  } else if (type === "textResponse") {
    const content = stripCardsMarker(textResponse);
    setLoadingResponse(false);
    setChatHistory([
      ...remHistory,
      {
        uuid,
        content,
        role: "assistant",
        sources,
        closed: close,
        error,
        errorMsg,
        animate: !close,
        pending: false,
        sentAt,
        ...courseExtra,
      },
    ]);
    _chatHistory.push({
      uuid,
      content,
      role: "assistant",
      sources,
      closed: close,
      error,
      errorMsg,
      animate: !close,
      pending: false,
      sentAt,
      ...courseExtra,
    });
  } else if (type === "textResponseChunk") {
    const chatIdx = _chatHistory.findIndex((chat) => chat.uuid === uuid);
    const existing = chatIdx !== -1 ? _chatHistory[chatIdx] : null;
    // Offener Karten-Marker am Anfang: gepuffert, Antwort bleibt wartend
    const { content, markerBuffer } = appendReplyText(
      existing,
      textResponse,
      close,
    );
    const entry = {
      ...(existing || { uuid, role: "assistant" }),
      content,
      markerBuffer,
      sources,
      error,
      errorMsg,
      closed: close,
      animate: !close,
      pending: markerBuffer !== undefined,
      sentAt,
      ...courseExtra,
    };
    if (existing) _chatHistory[chatIdx] = entry;
    else _chatHistory.push(entry);
    setChatHistory([..._chatHistory]);
  } else if (type === "courseSources") {
    // Kurskarten v2: vom Server vorab angekündigte Kurse (Karten-Marker),
    // kommen VOR dem ersten Text-Token. Existiert die Nachricht noch nicht,
    // wird sie als wartende Antwort (Tipp-Indikator) angelegt; der Text
    // hängt sich danach wie gewohnt an. Stream/Kontingent/Abbruch unberührt.
    if (!Array.isArray(courseSources) || courseSources.length === 0) return;
    const announced = {
      courseSources,
      courseCardsAnnounced: courseSources.length,
    };
    const chatIdx = _chatHistory.findIndex((chat) => chat.uuid === uuid);
    if (chatIdx !== -1) {
      _chatHistory[chatIdx] = { ..._chatHistory[chatIdx], ...announced };
    } else {
      _chatHistory.push({
        uuid,
        content: "",
        role: "assistant",
        animate: true,
        pending: true,
        sentAt,
        ...announced,
      });
    }
    setChatHistory([..._chatHistory]);
  } else if (type === "finalizeResponseStream") {
    // KIE-504: Die chatId der gerade gestreamten Antwort nachtragen, damit
    // 👍/👎 sofort (ohne History-Reload) zugeordnet werden kann. Rein additiv —
    // closed/animate bleiben unangetastet, daher keine Flicker-Regression.
    // Kurskarten: courseSources reisen im selben Abschluss-Chunk mit; die
    // Karten erscheinen damit erst nach Stream-Ende, genau einmal.
    const chatIdx = _chatHistory.findIndex((chat) => chat.uuid === uuid);
    if (chatIdx !== -1) {
      _chatHistory[chatIdx] = {
        ..._chatHistory[chatIdx],
        chatId,
        ...courseExtra,
      };
      setChatHistory([..._chatHistory]);
    }
  }
}

export function chatPrompt(workspace) {
  return (
    workspace?.openAiPrompt ??
    "Given the following conversation, relevant context, and a follow up question, reply with an answer to the current question the user is asking. Return only your response to the question given the above information following the users instructions as needed."
  );
}

// Hinweis „Unterhaltung fortsetzen (n)“: n = Anzahl der Fragen (user-Einträge)
// mit gespeicherter Antwort; lastAt = sentAt der letzten gespeicherten
// Nachricht. Gilt für den Server-Verlauf und die Chat-Liste im Widget: lokale
// Platzhalter (pending) und Fehler-Blasen (error) zählen nicht — eine Frage,
// deren Antwort noch läuft oder fehlschlug, ebenfalls nicht.
export function summarizeHistory(history = []) {
  let count = 0;
  let lastAt = null;
  history.forEach((msg, i) => {
    if (msg?.role !== "user" && msg?.role !== "assistant") return;
    if (msg.pending || msg.error) return;
    if (msg.role === "user") {
      const reply = history[i + 1];
      if (reply?.role === "assistant" && (reply.pending || reply.error)) return;
      count += 1;
    }
    const at = Number(msg.sentAt);
    if (Number.isFinite(at) && at > 0) lastAt = at;
  });
  return { count, lastAt: count > 0 ? lastAt : null };
}
