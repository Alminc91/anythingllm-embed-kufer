import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";

// KIE-567 „Antworten mit Kursen“ (Reiter Aussehen): courseCards "auto"
// (Kurskarten, Standard) | "off" (Nur Text mit Links); courseCardsPosition
// "above" (Karten zuerst, Standard) | "below" (Text zuerst). Der Server
// liefert beide immer mit gültigem Wert; bei "below" kündigt er die Kurse
// wie bei "above" über den Marker an, der kurze Text nennt sie nicht.
// KIE-568 „Willkommensblasen anzeigen“ (Reiter Inhalt, nur Chatblase):
// welcomeBubblesDesktop / welcomeBubblesMobile je "off" | "first" | "every",
// fehlend/ungültig = "first"; allein der Server-Wert zählt.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/main.jsx", () => ({
  embedderSettings: {
    settings: { assistantName: "KI-Berater", enableTts: false },
    USER_STYLES: {},
    ASSISTANT_STYLES: {},
  },
}));
vi.mock("@/models/chatService", () => ({
  default: { getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })) },
}));
vi.mock("@/components/ChatWindow", () => ({ SEND_TEXT_EVENT: "send-text" }));

import fixtures from "./fixtures/praesentationCourseSources.json";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import {
  DEFAULT_WELCOME_BUBBLES,
  WELCOME_BUBBLES_VALUES,
  applyFixedStandards,
  welcomeBubblesMode,
} from "../src/utils/layout.js";
import { isPhoneViewport } from "../src/utils/platform.js";
import { selectBelowCourseCards } from "../src/utils/courseCards.js";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import OpenButton, {
  BUBBLES_SHOWN_AFTER_MS,
  resetPhoneAtLoad,
} from "../src/components/OpenButton/index.jsx";
import { resetShownOnThisPage } from "../src/hooks/useBubbleDismissal.js";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => config }));
const load = (script, server) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));
const clone = (v) => JSON.parse(JSON.stringify(v));
const BY = fixtures.bergischYoga;

let container;
let root;
let scrollCalls;
const realScrollTo = Element.prototype.scrollTo;
const realRect = Element.prototype.getBoundingClientRect;
const realInnerWidth = window.innerWidth;

function mount(el) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(el));
  return container;
}
function unmount() {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
}
function setWidth(px) {
  Object.defineProperty(window, "innerWidth", {
    value: px,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  scrollCalls = [];
  Element.prototype.scrollTo = function (opts) {
    scrollCalls.push({ id: this.id, ...(opts || {}) });
  };
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  unmount();
  Element.prototype.scrollTo = realScrollTo;
  Element.prototype.getBoundingClientRect = realRect;
  setWidth(realInnerWidth);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// KIE-567: Einstellungen
// ---------------------------------------------------------------------------
describe("KIE-567 Antworten mit Kursen: Einstellungen", () => {
  // Bewusste Änderung (Fixliste 7.22-rc8 R4): ohne gespeicherten Wert liefert
  // der Server courseCards nicht mehr; beim Laden bleibt null, der Standard
  // folgt der tatsächlichen Darstellung (App.jsx, applyDisplayed: In der
  // Seite "auto", Chatfenster "off"; tests/rc8-fixes.test.jsx)
  it("ohne neue Schlüssel: Kurskarten nach Darstellung (null), Karten zuerst", async () => {
    const s = await load({}, {});
    expect(s.courseCards).toBe(null);
    expect(s.courseCardsPosition).toBe("above");
    expect(s.courseCardsLayout).toBe("rows");
  });

  it("Server-Wahl gilt (Nur Text, Text zuerst), Script-Attribute heben sie nicht aus", async () => {
    const s = await load(
      { courseCards: "auto", courseCardsPosition: "above" },
      { courseCards: "off", courseCardsPosition: "below" },
    );
    expect(s.courseCards).toBe("off");
    expect(s.courseCardsPosition).toBe("below");
    const t = await load(
      { courseCards: "off", courseCardsPosition: "below" },
      { courseCards: "auto", courseCardsPosition: "above" },
    );
    expect(t.courseCards).toBe("auto");
    expect(t.courseCardsPosition).toBe("above");
  });

  it("ungültige Werte fallen auf den Standard zurück", async () => {
    const s = await load({}, { courseCards: "karten", courseCardsPosition: 3 });
    // courseCards ungültig = nicht gespeichert (rc8 R4: Standard nach
    // Darstellung, hier noch null)
    expect(s.courseCards).toBe(null);
    expect(s.courseCardsPosition).toBe("above");
  });
});

// ---------------------------------------------------------------------------
// KIE-567: Darstellung im Verlauf
// ---------------------------------------------------------------------------
const USER = { role: "user", content: "Gibt es Yoga am Abend?", sentAt: 1 };
// Kurzer Antworttext wie im Karten-Modus „Suche“: weder Titel noch Links
const SHORT =
  "Ja, zwei Kurse am Abend passen: einer zum Einstieg, einer zum Vertiefen.";
const FOLLOW = ["Gibt es Kurse am Wochenende?", "Was kostet ein Kurs?"];
const announcedAnswer = (extra = {}) => ({
  role: "assistant",
  content: SHORT,
  sentAt: 2,
  chatId: 7,
  sources: [],
  courseSources: clone(BY.slice(0, 2)),
  courseCardsAnnounced: 2,
  courseTeasers: {
    [BY[0].url]: "Für Einsteiger, die ruhig und bewusst üben möchten.",
  },
  followUps: FOLLOW,
  ...extra,
});
const settingsFor = (courseCards, courseCardsPosition) => ({
  courseCards,
  courseCardsPosition,
  courseCardsLayout: "rows",
  followUps: "pills",
  greetingStyle: "bubble",
});
const follows = (a, b) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const parts = (el) => ({
  text: el.querySelector(".allm-anything-llm-assistant-message"),
  cards: el.querySelector("[data-course-cards]"),
  pills: el.querySelector("#anything-llm-follow-ups"),
});

describe("KIE-567 Darstellung: Text zuerst, Karten zuerst, Nur Text", () => {
  it("Text zuerst (below): Text, dann die angekündigten Karten, dann Folgefragen", () => {
    const el = mount(
      h(ChatHistory, {
        settings: settingsFor("auto", "below"),
        history: [USER, announcedAnswer()],
      }),
    );
    const { text, cards, pills } = parts(el);
    expect(text.textContent).toContain("zwei Kurse am Abend");
    expect(cards).not.toBeNull();
    expect(cards.getAttribute("data-position")).toBe("below");
    expect(cards.querySelectorAll(".allm-course-card")).toHaveLength(2);
    // Teaser des angekündigten Kurses steht auf der Karte
    expect(cards.textContent).toContain("ruhig und bewusst");
    expect(pills).not.toBeNull();
    expect(follows(text, cards)).toBe(true);
    expect(follows(cards, pills)).toBe(true);
  });

  it("Karten zuerst (above, Standard): Karten vor dem Text, Folgefragen am Ende", () => {
    const el = mount(
      h(ChatHistory, {
        settings: settingsFor("auto", "above"),
        history: [USER, announcedAnswer()],
      }),
    );
    const { text, cards, pills } = parts(el);
    expect(cards.getAttribute("data-position")).toBe("above");
    expect(cards.querySelectorAll(".allm-course-card")).toHaveLength(2);
    expect(follows(cards, text)).toBe(true);
    expect(follows(text, pills)).toBe(true);
  });

  it("Nur Text mit Links (off): keine Karten, Links im Text bleiben", () => {
    const withLinks = `Ja: [${BY[0].title}](${BY[0].url}) und [${BY[1].title}](${BY[1].url}).`;
    for (const position of ["above", "below"]) {
      const el = mount(
        h(ChatHistory, {
          settings: settingsFor("off", position),
          history: [
            USER,
            announcedAnswer({ content: withLinks, courseCardsAnnounced: 0 }),
          ],
        }),
      );
      expect(el.querySelector("[data-course-cards]")).toBeNull();
      const links = [
        ...el.querySelectorAll(".allm-anything-llm-assistant-message a"),
      ];
      expect(links.map((a) => a.getAttribute("href"))).toEqual([
        BY[0].url,
        BY[1].url,
      ]);
      expect(el.querySelector("#anything-llm-follow-ups")).not.toBeNull();
      unmount();
    }
  });

  it("selectBelowCourseCards: angekündigte Kurse in Server-Reihenfolge, ohne Ankündigung wie bisher", () => {
    const sel = selectBelowCourseCards(
      SHORT,
      clone([BY[1], BY[0]]),
      { courseCards: "auto" },
      { announced: 2, fallback: true },
    );
    expect(sel.cards.map((c) => c.url)).toEqual([BY[1].url, BY[0].url]);
    expect(sel.footerCards).toBeUndefined();
    // ohne Ankündigung: Auswahl nur aus dem Text (keine Nennung -> keine Karte)
    const none = selectBelowCourseCards(
      SHORT,
      clone(BY.slice(0, 2)),
      { courseCards: "auto" },
      { fallback: true },
    );
    expect(none.cards).toHaveLength(0);
    // Karten aus: nie Karten
    expect(
      selectBelowCourseCards(
        SHORT,
        clone(BY.slice(0, 2)),
        { courseCards: "off" },
        { announced: 2 },
      ).cards,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// KIE-567: Scrollen nach der Antwort
// ---------------------------------------------------------------------------
describe("KIE-567 Scrollen: Frage bleibt oben, Nur Text wie bisher", () => {
  // Verlauf 2000 px hoch, die letzte Frage steht 300 px unter dem Anfang
  function fakeLayout() {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.id === "chat-history" ? 2000 : 0;
      },
    });
    Element.prototype.getBoundingClientRect = function () {
      const top = this.id === "chat-history" ? 0 : 300;
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0 };
    };
  }
  afterEach(() => {
    delete HTMLElement.prototype.scrollHeight;
  });
  const lastHistoryScroll = () =>
    scrollCalls.filter((c) => c.id === "chat-history").pop();

  it("Text zuerst (below): höchstens bis die Frage oben steht (nicht ans Ende)", () => {
    fakeLayout();
    const el = mount(
      h(ChatHistory, {
        settings: settingsFor("auto", "below"),
        history: [USER, announcedAnswer()],
      }),
    );
    expect(el.querySelector("[data-answer-turn]")).not.toBeNull();
    expect(lastHistoryScroll().top).toBe(292);
  });

  it("Karten zuerst (above): unverändert bis zur Frage", () => {
    fakeLayout();
    mount(
      h(ChatHistory, {
        settings: settingsFor("auto", "above"),
        history: [USER, announcedAnswer()],
      }),
    );
    expect(lastHistoryScroll().top).toBe(292);
  });

  it("Nur Text (off): wie früher ans Ende, kein Turn-Rahmen", () => {
    fakeLayout();
    const el = mount(
      h(ChatHistory, {
        settings: settingsFor("off", "below"),
        history: [USER, announcedAnswer({ courseCardsAnnounced: 0 })],
      }),
    );
    expect(el.querySelector("[data-answer-turn]")).toBeNull();
    expect(lastHistoryScroll().top).toBe(2000);
  });

  it("Nur Text (off): Folgefragen nach dem Ende der Antwort ins Bild holen", () => {
    fakeLayout();
    const history = [
      USER,
      announcedAnswer({ courseCardsAnnounced: 0, followUpsArrivedAt: 123 }),
    ];
    const settings = settingsFor("off", "below");
    const el = mount(h(ChatHistory, { settings, history, canSend: false }));
    expect(el.querySelector("#anything-llm-follow-ups")).toBeNull();
    scrollCalls = [];
    // Antwort fertig (canSend): die Pillen erscheinen, der Verlauf bleibt gleich
    act(() =>
      root.render(h(ChatHistory, { settings, history, canSend: true })),
    );
    expect(el.querySelector("#anything-llm-follow-ups")).not.toBeNull();
    expect(lastHistoryScroll()).toMatchObject({ top: 2000 });
  });
});

// ---------------------------------------------------------------------------
// KIE-568: Einstellungen
// ---------------------------------------------------------------------------
describe("KIE-568 Willkommensblasen: Einstellungen", () => {
  it("Werte und Standard", () => {
    expect(WELCOME_BUBBLES_VALUES).toEqual(["off", "first", "every"]);
    expect(DEFAULT_WELCOME_BUBBLES).toBe("first");
  });

  it("ohne Server-Wert: beim ersten Besuch (wie bisher)", async () => {
    const s = await load({}, {});
    expect(s.welcomeBubblesDesktop).toBe("first");
    expect(s.welcomeBubblesMobile).toBe("first");
  });

  it('Server-Werte gelten, ungültige werden zu "first"', async () => {
    const s = await load(
      {},
      { welcomeBubblesDesktop: "off", welcomeBubblesMobile: "Every" },
    );
    expect(s.welcomeBubblesDesktop).toBe("off");
    expect(s.welcomeBubblesMobile).toBe("every");
    const t = await load(
      {},
      { welcomeBubblesDesktop: "immer", welcomeBubblesMobile: 1 },
    );
    expect(t.welcomeBubblesDesktop).toBe("first");
    expect(t.welcomeBubblesMobile).toBe("first");
  });

  it("Script-Attribute heben den Server-Wert nicht aus (Server gewinnt)", async () => {
    const s = await load(
      { welcomeBubblesDesktop: "every", welcomeBubblesMobile: "every" },
      { welcomeBubblesDesktop: "off", welcomeBubblesMobile: "first" },
    );
    expect(s.welcomeBubblesDesktop).toBe("off");
    expect(s.welcomeBubblesMobile).toBe("first");
    // ohne Server-Wert wirkt das Attribut auch nicht
    const t = await load({ welcomeBubblesDesktop: "off" }, {});
    expect(t.welcomeBubblesDesktop).toBe("first");
  });

  // Bewusste Änderung (Fixliste 7.22-rc17 E23): Willkommensblasen stellt
  // das Design Center ein (Gruppe A), das Altattribut wirkt auch ohne
  // Server-Wert nicht mehr
  it("altes data-bubble-persistence wirkt nicht, auch ohne Server-Wert", async () => {
    const legacy = await load({ bubblePersistence: "sessionStorage" }, {});
    expect(legacy.bubblePersistence).toBeUndefined();
    const neu = await load(
      { bubblePersistence: "sessionStorage" },
      { welcomeBubblesDesktop: "first", welcomeBubblesMobile: "first" },
    );
    expect(neu.bubblePersistence).toBeUndefined();
  });

  it("applyFixedStandards setzt immer beide Schlüssel", () => {
    const out = applyFixedStandards({}, new Set(), {
      welcomeBubblesMobile: "off",
    });
    expect(out.welcomeBubblesDesktop).toBe("first");
    expect(out.welcomeBubblesMobile).toBe("off");
  });

  it("Gerät: Handy unter 768 px, Modus je Gerät", () => {
    setWidth(390);
    expect(isPhoneViewport()).toBe(true);
    setWidth(767);
    expect(isPhoneViewport()).toBe(true);
    setWidth(768);
    expect(isPhoneViewport()).toBe(false);
    const s = { welcomeBubblesDesktop: "off", welcomeBubblesMobile: "every" };
    expect(welcomeBubblesMode(s, false)).toBe("off");
    expect(welcomeBubblesMode(s, true)).toBe("every");
    expect(welcomeBubblesMode({}, true)).toBe("first");
  });
});

// ---------------------------------------------------------------------------
// KIE-568: Chat-Button mit Willkommensblasen
// ---------------------------------------------------------------------------
const KEY = `anythingllm-embed-bubbles-dismissed-${window.location.origin}-e1`;
const button = (extra = {}) =>
  h(OpenButton, {
    settings: {
      embedId: "e1",
      displayChatbotBubbles: true,
      chatbotBubblesMessages: [],
      position: "bottom-right",
      ...extra,
    },
    isOpen: false,
    toggleOpen: () => {},
  });
const bubbles = (el) => el.querySelector("[data-welcome-bubbles]");
// neue Seite (Unterseite im selben Tab): Widget neu laden (Gerät und „auf
// dieser Seite gezeigt“ gelten je Seitenaufruf, Modulebene)
function reload(el) {
  unmount();
  resetPhoneAtLoad();
  resetShownOnThisPage();
  return mount(el);
}

describe("KIE-568 Willkommensblasen je Gerät", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPhoneAtLoad();
    resetShownOnThisPage();
  });
  afterEach(() => vi.useRealTimers());

  it("Aus: keine Blasen, nur der Chat-Button (auch ohne eigene Blasentexte)", () => {
    setWidth(1440);
    const el = mount(
      button({ welcomeBubblesDesktop: "off", welcomeBubblesMobile: "first" }),
    );
    expect(bubbles(el)).toBeNull();
    expect(el.querySelector("#anything-llm-embed-chat-button")).not.toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("Desktop aus, Handy an: Gerät nach der Breite beim Laden", () => {
    setWidth(390);
    const el = mount(
      button({ welcomeBubblesDesktop: "off", welcomeBubblesMobile: "first" }),
    );
    expect(bubbles(el)).not.toBeNull();
    expect(bubbles(el).getAttribute("data-welcome-bubbles")).toBe("first");
    expect(el.textContent).toContain("Hallo! Ich bin Ihr KI-Berater.");
  });

  it("Beim ersten Besuch (Standard): localStorage wie bisher", () => {
    setWidth(1440);
    let el = mount(button());
    expect(bubbles(el)).not.toBeNull();
    // ohne Interaktion: nächste Seite zeigt sie wieder
    el = reload(button());
    expect(bubbles(el)).not.toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    // Schließen -> gespeichert, auch neuer Tab (sessionStorage leer) ohne
    act(() =>
      el
        .querySelector('[aria-label="Willkommensblasen schließen"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(bubbles(el)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(KEY))).toEqual({
      manuallyDismissed: true,
      chatOpened: false,
    });
    window.sessionStorage.clear();
    el = reload(button());
    expect(bubbles(el)).toBeNull();
  });

  it("Bei jedem Besuch: einmal je Tab (sessionStorage), Unterseiten nicht erneut", () => {
    setWidth(1440);
    const settings = {
      welcomeBubblesDesktop: "every",
      welcomeBubblesMobile: "off",
    };
    let el = mount(button(settings));
    expect(bubbles(el)).not.toBeNull();
    expect(bubbles(el).getAttribute("data-welcome-bubbles")).toBe("every");
    // als gezeigt gemerkt, sobald sie kurz zu sehen waren
    act(() => vi.advanceTimersByTime(BUBBLES_SHOWN_AFTER_MS));
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(KEY)).shown).toBe(true);
    // Unterseite im selben Tab: nicht erneut
    el = reload(button(settings));
    expect(bubbles(el)).toBeNull();
    // neuer Tab bzw. erneuter Besuch (sessionStorage leer): wieder da
    window.sessionStorage.clear();
    el = reload(button(settings));
    expect(bubbles(el)).not.toBeNull();
    // Chat öffnen blendet sie aus, localStorage bleibt leer
    act(() =>
      el
        .querySelector("#anything-llm-embed-chat-button")
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(bubbles(el)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("Bei jedem Besuch ignoriert ein früheres Schließen im localStorage", () => {
    setWidth(390);
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ manuallyDismissed: true, chatOpened: true }),
    );
    const el = mount(
      button({ welcomeBubblesDesktop: "first", welcomeBubblesMobile: "every" }),
    );
    expect(bubbles(el)).not.toBeNull();
  });

  it("ohne neue Schlüssel und mit altem bubblePersistence: Verhalten wie bisher", () => {
    setWidth(1440);
    let el = mount(button({ bubblePersistence: "sessionStorage" }));
    expect(bubbles(el)).not.toBeNull();
    // ohne Interaktion bleibt nichts gespeichert (kein "shown")
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    el = reload(button({ bubblePersistence: "sessionStorage" }));
    expect(bubbles(el)).not.toBeNull();
  });
});
