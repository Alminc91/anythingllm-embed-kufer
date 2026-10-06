import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Security-Sweep Widget: lineare Link-Regexe + Kappung (ReDoS/Client-DoS bei
// Karten oben), Rohlängen vor dem Bereinigen, Sende-Ereignis nur an das
// eigene Widget, Escape im Datenschutz-Hinweis (Blasen-Modus) ohne Falle.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

vi.mock("../src/main.jsx", () => ({
  embedderSettings: {
    settings: {},
    USER_STYLES: { msgBg: "#01a5a9", msgText: "#FFFFFF" },
    ASSISTANT_STYLES: {},
    shadowRoot: null,
    hostElement: null,
  },
  inlineTailwindStyles: () => Promise.resolve(false),
}));
const chatService = vi.hoisted(() => ({
  streamChat: vi.fn(() => new Promise(() => {})),
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

import {
  extractLinks,
  followUpsList,
  followUpText,
  selectAnnouncedCourseCards,
  selectCourseCards,
  teaserMap,
} from "../src/utils/courseCards.js";
import handleChat from "../src/utils/chat/index.js";
import { privacyAckKey, _resetPrivacyMemory } from "../src/utils/privacy.js";
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import { EmbedModeContext } from "../src/hooks/useEmbedMode.js";

const BASE = "https://aw.donau.kufer.de/kurssuche/kurs";
const YOGA = {
  url: `${BASE}/yoga-aufbaukurs/262-3103`,
  title: "Yoga Aufbaukurs",
  start_date: "2026-09-14",
};
const ENGLISH = {
  url: `${BASE}/englisch-1/262-4601A`,
  title: "Englisch 1",
  start_date: "2026-09-16",
};
const AUTO = { courseCards: "auto" };
const ABOVE = { courseCards: "auto", courseCardsPosition: "above" };
const clone = (v) => JSON.parse(JSON.stringify(v));

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  chatService.streamChat.mockClear();
  window.localStorage.clear();
  _resetPrivacyMemory();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => [...container.querySelectorAll(sel)];

// ---------------------------------------------------------------------------
describe("1 · ReDoS/Client-DoS: Karten oben, viele „[“ bzw. „<a href“ im Stream", () => {
  // Stream durch ChatHistory: tests/security-stream.test.jsx
  it("Funktionen: 20.000+ Zeichen Flut je Aufruf < 50 ms; nur die ersten 20.000 Zeichen zählen", () => {
    for (const flood of [
      "[".repeat(50000),
      "<a href=".repeat(10000),
      "<".repeat(50000),
      `[${"x".repeat(50000)}`,
    ]) {
      for (const run of [
        () => extractLinks(flood),
        () => selectCourseCards(flood, clone([YOGA]), AUTO),
        () =>
          selectAnnouncedCourseCards(flood, clone([YOGA]), AUTO, {
            announced: 1,
          }),
      ]) {
        const t0 = performance.now();
        run();
        expect(performance.now() - t0).toBeLessThan(50);
      }
    }
    // Link hinter der Grenze wird ignoriert, davor gefunden
    const late = `${" ".repeat(20000)}[Yoga](${YOGA.url})`;
    expect(extractLinks(late)).toEqual([]);
    expect(extractLinks(`[Yoga](${YOGA.url})`)).toHaveLength(1);
    // normale Links/Anker unverändert erkannt (Text, Anker-Text ohne Tags)
    expect(
      extractLinks(
        `Siehe [Yoga **Aufbau**](${YOGA.url}) und <a class="x" href="${ENGLISH.url}"><b>Englisch</b> 1</a>.`,
      ).map((l) => [l.url, l.text]),
    ).toEqual([
      [YOGA.url, "Yoga **Aufbau**"],
      [ENGLISH.url, "Englisch 1"],
    ]);
  });

  it("während des Streamings nur die angekündigten Karten; verlinkte weitere erst am Ende", () => {
    const user = { role: "user", content: "Yoga?", sentAt: 1 };
    const msg = {
      role: "assistant",
      content: `Siehe [Englisch 1](${ENGLISH.url}).`,
      courseSources: clone([YOGA, ENGLISH]),
      courseCardsAnnounced: 1,
      animate: true,
      pending: false,
      sentAt: 2,
    };
    act(() =>
      root.render(<ChatHistory settings={ABOVE} history={[user, msg]} />),
    );
    expect(
      $$(".allm-course-card .allm-course-title").map((t) => t.textContent),
    ).toEqual(["Yoga Aufbaukurs"]);
    act(() =>
      root.render(
        <ChatHistory
          settings={ABOVE}
          history={[user, { ...msg, animate: false, closed: true, chatId: 9 }]}
        />,
      ),
    );
    expect(
      $$(".allm-course-card .allm-course-title").map((t) => t.textContent),
    ).toEqual(["Yoga Aufbaukurs", "Englisch 1"]);
  });
});

// ---------------------------------------------------------------------------
describe("2 · Rohlängen vor dem Bereinigen gekappt", () => {
  it("100k-Werte: followUpText, followUpsList, teaserMap je < 50 ms", () => {
    const big = [
      "<".repeat(100000),
      "[".repeat(100000),
      "*a".repeat(50000),
      " _x".repeat(33000),
    ];
    for (const v of big) {
      let t0 = performance.now();
      followUpText(v);
      followUpsList([v, v, v]);
      expect(performance.now() - t0).toBeLessThan(50);
      t0 = performance.now();
      teaserMap({ [YOGA.url]: v });
      expect(performance.now() - t0).toBeLessThan(50);
    }
    // 100k Einträge: nur die ersten werden geprüft
    const t0 = performance.now();
    expect(followUpsList(Array(100000).fill("–"))).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(50);
    // gültige Werte unverändert
    expect(followUpsList(["Gibt es B1?", "Auch online?"])).toEqual([
      "Gibt es B1?",
      "Auch online?",
    ]);
    expect(teaserMap({ [YOGA.url]: "Kräftigend am **Abend**." })).toEqual(
      new Map([
        [
          "aw.donau.kufer.de/kurssuche/kurs/yoga-aufbaukurs/262-3103",
          "Kräftigend am Abend.",
        ],
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
describe("3 · Sende-Ereignis nur an das eigene Widget", () => {
  const settings = (embedId) => ({
    embedId,
    baseApiUrl: "https://x.test/api/embed",
    enableStt: false,
    suggestionStyle: "pills",
    defaultMessages: ["Yoga", "Englisch"],
  });

  it("zwei Instanzen: Klick auf eine Pille sendet nur in der eigenen", async () => {
    const other = document.createElement("div");
    document.body.appendChild(other);
    const root2 = createRoot(other);
    try {
      act(() =>
        root.render(
          <ChatContainer
            sessionId="s-A"
            knownHistory={[]}
            settings={settings("a")}
          />,
        ),
      );
      act(() =>
        root2.render(
          <ChatContainer
            sessionId="s-B"
            knownHistory={[]}
            settings={settings("b")}
          />,
        ),
      );
      const pillB = other.querySelectorAll(
        "#anything-llm-suggestion-pills button",
      )[1];
      await act(async () => pillB.click());
      expect(chatService.streamChat).toHaveBeenCalledTimes(1);
      expect(chatService.streamChat.mock.calls[0][0]).toBe("s-B");
      expect(chatService.streamChat.mock.calls[0][2]).toBe("Englisch");
      // Instanz A unverändert: Vorschläge noch da, keine Frage
      expect($("#anything-llm-suggestion-pills")).not.toBe(null);
      expect($$(".allm-anything-llm-user-message")).toHaveLength(0);
      // Balken (bars) ebenso
      chatService.streamChat.mockClear();
      act(() =>
        root.render(
          <ChatContainer
            sessionId="s-A2"
            conversationId="c-2"
            knownHistory={[]}
            settings={{ ...settings("a"), suggestionStyle: "bars" }}
          />,
        ),
      );
      await act(async () => $$(".msg-suggestion")[0].click());
      expect(chatService.streamChat).toHaveBeenCalledTimes(1);
      expect(chatService.streamChat.mock.calls[0][0]).toBe("s-A2");
    } finally {
      act(() => root2.unmount());
      other.remove();
    }
  });

  it("Ereignis direkt auf window (von außen) wirkt weiterhin", async () => {
    act(() =>
      root.render(
        <ChatContainer
          sessionId="s-A"
          knownHistory={[]}
          settings={settings("a")}
        />,
      ),
    );
    await act(async () =>
      window.dispatchEvent(
        new CustomEvent("anythingllm-embed-send-prompt", {
          detail: { command: "Yoga" },
        }),
      ),
    );
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
describe("4 · Datenschutz-Karte: Escape ohne Tastaturfalle", () => {
  const settings = {
    embedId: "e-1",
    baseApiUrl: "https://x.test/api/embed",
    enableStt: false,
    privacyNotice: "modal",
  };
  const escape = () =>
    act(() => {
      $("#anything-llm-privacy-notice button").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

  it("Blasen-Modus: Escape schließt das Fenster (onClose), ohne zu bestätigen", () => {
    const onClose = vi.fn();
    act(() =>
      root.render(
        <ChatContainer
          sessionId="s"
          knownHistory={[]}
          settings={settings}
          onClose={onClose}
        />,
      ),
    );
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect($("#anything-llm-privacy-notice")).not.toBe(null);
    expect(window.localStorage.getItem(privacyAckKey("e-1"))).toBe(null);
    expect($("#message-input").disabled).toBe(true);
  });

  it("Inline-Modus: Escape bleibt beim Bestehenden (kein onClose, nicht verhindert)", () => {
    const onClose = vi.fn();
    const seen = [];
    const spy = (e) => seen.push(e.defaultPrevented);
    window.addEventListener("keydown", spy);
    try {
      act(() =>
        root.render(
          <EmbedModeContext.Provider
            value={{
              inline: true,
              overlay: false,
              consumeFocusRequest: () => false,
            }}
          >
            <ChatContainer
              sessionId="s"
              knownHistory={[]}
              settings={settings}
              onClose={onClose}
            />
          </EmbedModeContext.Provider>,
        ),
      );
      escape();
    } finally {
      window.removeEventListener("keydown", spy);
    }
    expect(onClose).not.toHaveBeenCalled();
    // das Ereignis erreicht den Escape-Listener der Leiste (InlineChat)
    expect(seen).toEqual([false]);
    expect(window.localStorage.getItem(privacyAckKey("e-1"))).toBe(null);
  });
});
