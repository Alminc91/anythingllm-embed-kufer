import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Security-Sweep 1 (Client-DoS, Karten oben): 8k „[“ bzw. „<a href“ im
// Stream, Chunks à 8 Zeichen, durch handleChat + ChatHistory wie im Widget.
// Gemessen wird die Zeit der Kartenauswahl (selectAnnouncedCourseCards /
// selectCourseCards, hier umhüllt) über den ganzen Stream; Markdown ist
// gemockt (das Rendern der wachsenden Antwort ist nicht Gegenstand).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

vi.mock("../src/main.jsx", () => ({
  embedderSettings: { settings: {}, USER_STYLES: {}, ASSISTANT_STYLES: {} },
}));
vi.mock("@/models/chatService", () => ({
  default: { getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })) },
}));
vi.mock("@/utils/chat/markdown", () => ({
  default: (t) => String(t).replace(/[<>&]/g, " "),
}));
const stats = vi.hoisted(() => ({ ms: 0, withText: 0, calls: 0 }));
vi.mock("@/utils/courseCards", async (importOriginal) => {
  const real = await importOriginal();
  const wrap =
    (fn) =>
    (text, ...rest) => {
      const t0 = performance.now();
      try {
        return fn(text, ...rest);
      } finally {
        stats.ms += performance.now() - t0;
        stats.calls++;
        if (text) stats.withText++;
      }
    };
  return {
    ...real,
    selectAnnouncedCourseCards: wrap(real.selectAnnouncedCourseCards),
    selectCourseCards: wrap(real.selectCourseCards),
  };
});

import handleChat from "../src/utils/chat/index.js";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";

const BASE = "https://aw.donau.kufer.de/kurssuche/kurs";
const SOURCES = [
  { url: `${BASE}/yoga-aufbaukurs/262-3103`, title: "Yoga Aufbaukurs" },
  { url: `${BASE}/englisch-1/262-4601A`, title: "Englisch 1" },
];
const ABOVE = { courseCards: "auto", courseCardsPosition: "above" };

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Object.assign(stats, { ms: 0, withText: 0, calls: 0 });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function streamAbove(text) {
  const user = { role: "user", content: "Yoga?", sentAt: 1 };
  const hist = [];
  let shown = [];
  const set = (h) => (shown = h);
  const chunk = (c) => {
    handleChat(c, vi.fn(), set, [user], hist);
    act(() =>
      root.render(<ChatHistory settings={ABOVE} history={[...shown]} />),
    );
  };
  chunk({
    uuid: "u",
    type: "courseSources",
    courseSources: JSON.parse(JSON.stringify(SOURCES)),
    close: false,
  });
  for (let i = 0; i < text.length; i += 8)
    chunk({
      uuid: "u",
      type: "textResponseChunk",
      textResponse: text.slice(i, i + 8),
    });
  chunk({
    uuid: "u",
    type: "textResponseChunk",
    textResponse: "",
    close: true,
  });
  chunk({ uuid: "u", type: "finalizeResponseStream", close: true, chatId: 9 });
}

describe("Security-Sweep 1: Karten oben, Flut im Stream", () => {
  for (const [label, flood] of [
    ["8k „[“", "Text " + "[".repeat(8000)],
    ["8k „<a href“", "Text " + '<a href="'.repeat(1000)],
  ])
    it(`${label}: Kartenauswahl über den ganzen Stream < 500 ms, Text erst am Ende`, () => {
      streamAbove(flood);
      expect(stats.ms).toBeLessThan(500);
      // nicht pro Chunk: mit Antworttext nur nach close bzw. chatId
      expect(stats.withText).toBeGreaterThanOrEqual(1);
      expect(stats.withText).toBeLessThanOrEqual(2);
      expect(stats.calls).toBeLessThan(10);
      expect(container.querySelectorAll(".allm-course-card")).toHaveLength(2);
    });
});
