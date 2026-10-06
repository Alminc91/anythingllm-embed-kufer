import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";

// Kurskarten v3: Dauer (sessions) und Ort (venue) aus den Kopfzeilen der
// Kursdokumente, KI-Teaser je Karte (Chunk type "courseTeasers") als
// Untertext unter dem Titel, Teaserzeilen nie als Text.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

vi.mock("../src/main.jsx", () => ({
  embedderSettings: {
    settings: { assistantName: "Ihr Online-Berater", enableTts: false },
    USER_STYLES: {},
    ASSISTANT_STYLES: {},
  },
}));
vi.mock("@/models/chatService", () => ({
  default: { getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })) },
}));
vi.mock("@/components/ChatWindow", () => ({ SEND_TEXT_EVENT: "send-text" }));

import {
  appendReplyText,
  formatCourse,
  formatPlace,
  selectAnnouncedCourseCards,
  stripCardsMarker,
  stripTeaserLines,
  teaserMap,
} from "../src/utils/courseCards.js";
import handleChat from "../src/utils/chat/index.js";
import HistoricalMessage from "../src/components/ChatWindow/ChatContainer/ChatHistory/HistoricalMessage/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";

const AUTO = { courseCards: "auto" };
const ABOVE = { courseCards: "auto", courseCardsPosition: "above" };
const clone = (v) => JSON.parse(JSON.stringify(v));
const link = (c, text = c.title) => `[${text}](${c.url})`;
const BASE = "https://aw.donau.kufer.de/kurssuche/kurs";
const YOGA = {
  url: `${BASE}/yoga-aufbaukurs/262-3103`,
  title: "Yoga (Aufbaukurs)",
  start_date: "2026-09-14",
  start_minutes: 1080,
  weekdays: ",mon,",
  price: 60,
  bookable: true,
  format: "onsite",
  sessions: "16 Abende",
  venue: "Realschule",
};
const ENGLISH = {
  url: `${BASE}/englisch-1/262-4601A`,
  title: "Englisch 1",
  start_date: "2026-09-16",
  start_minutes: 1110,
  weekdays: ",wed,",
  price: 90,
  bookable: true,
  format: "online",
};
const TEASER_YOGA =
  "Für alle mit Yoga-Erfahrung: kräftigende Haltungen und ruhige Atemübungen am Montagabend.";
const TEASER_EN =
  "Online-Einstieg in Englisch mit viel Sprechpraxis für den Alltag.";
const TEASERS = { [YOGA.url]: TEASER_YOGA, [ENGLISH.url]: TEASER_EN };

// ---------------------------------------------------------------------------
// Formatierung (AK-2)
// ---------------------------------------------------------------------------
describe("Dauer und Ort in der Karte (AK-2)", () => {
  it("::v3-meta — Kopfzeile 'Mo · 18:00 Uhr · 16 Abende', Metazeile 'ab 14.09.2026 · Realschule · 60 €'", () => {
    const card = formatCourse(YOGA);
    expect(card.schedule).toBe("Mo · 18:00 Uhr · 16 Abende");
    expect([card.start, card.place, card.price].join(" · ")).toBe(
      "ab 14.09.2026 · Realschule · 60 €",
    );
  });

  it("format online ohne venue bleibt 'online'; Ort ersetzt 'vor Ort'", () => {
    expect(formatPlace("online", null, null)).toBe("online");
    expect(formatPlace("online", "lingen", "Realschule")).toBe("online");
    expect(formatPlace("onsite", null, null)).toBe("vor Ort");
    expect(formatPlace("onsite", "demohausen", "Bildungszentrum")).toBe(
      "Bildungszentrum",
    );
    expect(formatPlace("hybrid", null, "Realschule")).toBe(
      "Realschule · auch online",
    );
    expect(formatPlace(undefined, undefined, "Realschule")).toBe("Realschule");
  });

  it("ohne sessions/venue: Karte wie bisher (NAK-3)", () => {
    const { sessions: _s, venue: _v, ...old } = YOGA;
    const card = formatCourse(old);
    expect(card.schedule).toBe("Mo · 18:00 Uhr");
    expect(card.place).toBe("vor Ort");
  });

  it("Werte werden gekürzt und ohne HTML gezeigt (Abwehr in der Tiefe)", () => {
    const card = formatCourse({
      ...YOGA,
      sessions: `<b>${"12 Termine ".repeat(6)}</b>`,
      venue: "x".repeat(90),
    });
    expect(card.schedule).not.toMatch(/[<>]/);
    expect(card.schedule.split(" · ")[2].length).toBeLessThanOrEqual(30);
    expect(card.place.length).toBeLessThanOrEqual(60);
  });
});

describe("teaserMap", () => {
  it("normalisierte URL -> Text; ungültig entfällt, Markdown/HTML raus, ≤ 200", () => {
    const map = teaserMap({
      [YOGA.url.replace("https://", "http://www.")]:
        "**Sanft** <i>starten</i>.",
      [ENGLISH.url]: 5,
      "kein-link": "x",
      [`${BASE}/lang/1`]: "Wort ".repeat(80),
    });
    expect(
      map.get("aw.donau.kufer.de/kurssuche/kurs/yoga-aufbaukurs/262-3103"),
    ).toBe("Sanft starten.");
    expect(map.size).toBe(2);
    expect(
      map.get("aw.donau.kufer.de/kurssuche/kurs/lang/1").length,
    ).toBeLessThanOrEqual(200);
    expect(teaserMap(null).size).toBe(0);
    expect(teaserMap(["x"]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Stream (AK-5)
// ---------------------------------------------------------------------------
describe("Stream-Verarbeitung: Chunk type courseTeasers", () => {
  it("nach courseSources: Teaser an die Antwort, Text und Wartezustand unverändert", () => {
    const set = vi.fn();
    const hist = [];
    const chunk = (c) => handleChat(c, vi.fn(), set, [], hist);
    chunk({
      uuid: "u",
      type: "courseSources",
      courseSources: clone([YOGA, ENGLISH]),
      close: false,
    });
    chunk({ uuid: "u", type: "courseTeasers", teasers: clone(TEASERS) });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({
      content: "",
      pending: true,
      animate: true,
      courseCardsAnnounced: 2,
      courseTeasers: TEASERS,
    });
    chunk({
      uuid: "u",
      type: "textResponseChunk",
      textResponse: "Ja, zwei Kurse.",
      close: true,
      sources: [],
    });
    chunk({
      uuid: "u",
      type: "finalizeResponseStream",
      close: true,
      chatId: 9,
    });
    expect(hist[0]).toMatchObject({
      content: "Ja, zwei Kurse.",
      chatId: 9,
      courseTeasers: TEASERS,
    });
  });

  it("ohne bestehende Antwort / leer / kaputt: nichts", () => {
    const set = vi.fn();
    const hist = [];
    handleChat(
      { uuid: "u", type: "courseTeasers", teasers: TEASERS },
      vi.fn(),
      set,
      [],
      hist,
    );
    handleChat({ uuid: "u", type: "courseTeasers" }, vi.fn(), set, [], hist);
    handleChat(
      { uuid: "u", type: "courseTeasers", teasers: ["x"] },
      vi.fn(),
      set,
      [],
      hist,
    );
    expect(hist).toHaveLength(0);
    expect(set).not.toHaveBeenCalled();
  });

  it("courseSources -> courseTeasers -> textResponse -> finalize: genau eine Blase mit Karten, Teasern und Text", () => {
    const set = vi.fn();
    const loading = vi.fn();
    const rem = [{ role: "user", content: "Yoga?" }];
    const hist = [...rem];
    const chunk = (c) => handleChat(c, loading, set, rem, hist);
    chunk({
      uuid: "u",
      type: "courseSources",
      courseSources: clone([YOGA, ENGLISH]),
      close: false,
    });
    chunk({ uuid: "u", type: "courseTeasers", teasers: clone(TEASERS) });
    chunk({
      uuid: "u",
      type: "textResponse",
      textResponse: "Ja, zwei Kurse.",
      sources: [],
      close: true,
    });
    chunk({
      uuid: "u",
      type: "finalizeResponseStream",
      close: true,
      chatId: 7,
    });
    const shown = set.mock.calls.at(-1)[0];
    for (const list of [hist, shown]) {
      const answers = list.filter((m) => m.role === "assistant");
      expect(answers).toHaveLength(1);
      expect(answers[0]).toMatchObject({
        uuid: "u",
        content: "Ja, zwei Kurse.",
        pending: false,
        closed: true,
        chatId: 7,
        courseCardsAnnounced: 2,
        courseTeasers: TEASERS,
      });
      expect(answers[0].courseSources).toHaveLength(2);
    }
    expect(loading).toHaveBeenCalledWith(false);
  });

  it("textResponse ohne vorherige Antwort: neu angehängt; courseTeasers im Payload übernommen", () => {
    const set = vi.fn();
    const hist = [];
    handleChat(
      {
        uuid: "n",
        type: "textResponse",
        textResponse: "[[KARTEN: 0]]\n[[TEASER 0: A.]]\nJa.",
        courseSources: clone([YOGA]),
        courseTeasers: { [YOGA.url]: TEASER_YOGA },
        close: true,
      },
      vi.fn(),
      set,
      [],
      hist,
    );
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({
      content: "Ja.",
      courseTeasers: { [YOGA.url]: TEASER_YOGA },
    });
    expect(set.mock.calls.at(-1)[0]).toHaveLength(1);
  });
});

describe("Teaserzeilen nie als Text (Abwehr in der Tiefe, ältere Server)", () => {
  it.each([
    // ohne Marker: unverändert (wie der Server)
    [
      "[[TEASER 0: A.]]\n[[TEASER 2: B.]]\nJa, zwei.",
      "[[TEASER 0: A.]]\n[[TEASER 2: B.]]\nJa, zwei.",
    ],
    [
      "[[TEASER 0: Sanft starten.]]\nJa, gern.",
      "[[TEASER 0: Sanft starten.]]\nJa, gern.",
    ],
    ["[[KARTEN: 0, 2]]\n[[TEASER 0: A.]]\n\nJa.", "Ja."],
    ["[[KARTEN: 0, 2]]\n[[TEASER 0: A.]]\n[[TEASER 2: B.]]\nJa.", "Ja."],
    ["[[KARTEN: 0]]\n[[TEASER 0: kaputt\nText", "[[TEASER 0: kaputt\nText"],
    ["Ja. [[TEASER 0: A.]]", "Ja. [[TEASER 0: A.]]"],
    ["[[TEASER 0: kaputt\nText", "[[TEASER 0: kaputt\nText"],
    ["[[TEASER x: A.]]\nText", "[[TEASER x: A.]]\nText"],
    ["[Yoga](https://x.de/k/1) passt.", "[Yoga](https://x.de/k/1) passt."],
  ])("%p -> %p", (input, output) => {
    expect(stripCardsMarker(input)).toBe(output);
  });

  it("afterMarker (Server hat den Marker schon verarbeitet): Teaserzeilen entfernt", () => {
    const text = "[[TEASER 0: A.]]\n[[TEASER 2: B.]]\nJa, zwei.";
    expect(stripCardsMarker(text, { afterMarker: true })).toBe("Ja, zwei.");
    // appendReplyText: Zustand aus dem Eintrag (Karten angekündigt)
    let entry = { content: "", courseCardsAnnounced: 2 };
    for (const p of ["[[TEASER 0: A.]]", "\n", "Ja, zwei."]) {
      entry = { ...entry, ...appendReplyText(entry, p, false) };
    }
    expect(entry.content).toBe("Ja, zwei.");
    // ohne Ankündigung: Text vollständig
    let plain = null;
    for (const p of ["[[TEASER 0: A.]]", "\n", "Ja, zwei."]) {
      plain = appendReplyText(plain, p, false);
    }
    expect(plain.content).toBe("[[TEASER 0: A.]]\nJa, zwei.");
  });

  it("Stream: offene Teaserzeile = weiter puffern (Tipp-Indikator), danach nur Text", () => {
    let entry = null;
    const pieces = [
      "[[KARTEN: 0]]\n",
      "[[TEA",
      "SER 0: Sanft ",
      "starten.]]",
      "\n",
      "Ja",
      ", gern.",
    ];
    const seen = [];
    pieces.forEach((p) => {
      entry = appendReplyText(entry, p, false);
      seen.push(entry.content);
    });
    expect(seen.slice(0, 5)).toEqual(["", "", "", "", ""]);
    expect(entry.content).toBe("Ja, gern.");
    // überlange Zeile (> 240 ohne "]]") wird Text
    const long = `[[TEASER 0: ${"x".repeat(250)}`;
    expect(stripTeaserLines(long, { partial: true })).toBe(long);
    // höchstens 5 Zeilen
    const six = Array.from({ length: 6 }, (_, i) => `[[TEASER ${i}: a]]`);
    expect(stripTeaserLines(`${six.join("\n")}\nT`)).toBe(`${six[5]}\nT`);
  });
});

// ---------------------------------------------------------------------------
// Rendering (AK-2, AK-5, NAK-3)
// ---------------------------------------------------------------------------
let container;
let root;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
});

function mount(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
  return container;
}

const user = { role: "user", content: "Yoga am Abend?", sentAt: 1759651200 };
const reply = `Ja: ${link(YOGA)} und ${link(ENGLISH)}.`;
const answer = (extra = {}) => ({
  role: "assistant",
  content: reply,
  sentAt: 1759651205,
  chatId: 3,
  sources: [],
  courseSources: clone([YOGA, ENGLISH]),
  ...extra,
});
const cards = (el) => [...el.querySelectorAll(".allm-course-card")];

describe("Teaser als Untertext (AK-5)", () => {
  it("::v3-teaser — unter dem Titel, 13 px, Textfarbe, max. 2 Zeilen, in der Beschreibung", () => {
    const el = mount(
      h(ChatHistory, {
        settings: ABOVE,
        history: [
          user,
          answer({ courseTeasers: TEASERS, courseCardsAnnounced: 2 }),
        ],
      }),
    );
    const [first] = cards(el);
    const teaser = first.querySelector(".allm-course-teaser");
    expect(teaser.textContent).toBe(TEASER_YOGA);
    expect(teaser.previousElementSibling.className).toContain(
      "allm-course-title",
    );
    expect(teaser.style.fontSize).toBe("13px");
    expect(teaser.style.color).toContain("--allmi-text");
    expect(teaser.style.webkitLineClamp || teaser.style.WebkitLineClamp).toBe(
      "2",
    );
    expect(first.getAttribute("aria-describedby")).toContain(teaser.id);
    expect(first.querySelector(".allm-course-schedule").textContent).toBe(
      "Mo · 18:00 Uhr · 16 Abende",
    );
    expect(first.querySelector(".allm-course-details").textContent).toBe(
      "ab 14.09.2026 · Realschule · 60 €",
    );
    // Online-Kurs ohne venue: "online" bleibt
    expect(cards(el)[1].querySelector(".allm-course-details").textContent).toBe(
      "ab 16.09.2026 · online · 90 €",
    );
  });

  it("Teaser kommen nach: Karten bleiben dieselben DOM-Knoten in derselben Reihenfolge", () => {
    const base = answer({
      content: "",
      chatId: undefined,
      animate: true,
      pending: true,
      courseCardsAnnounced: 2,
      uuid: "u",
    });
    const el = mount(
      h(ChatHistory, { settings: ABOVE, history: [user, base] }),
    );
    const before = cards(el);
    expect(before).toHaveLength(2);
    expect(el.querySelector(".allm-course-teaser")).toBeNull();
    act(() =>
      root.render(
        h(ChatHistory, {
          settings: ABOVE,
          history: [user, { ...base, courseTeasers: TEASERS }],
        }),
      ),
    );
    const after = cards(el);
    expect(after).toEqual(before); // dieselben Knoten, gleiche Reihenfolge
    expect(
      after.map((c) => c.querySelector(".allm-course-teaser").textContent),
    ).toEqual([TEASER_YOGA, TEASER_EN]);
  });

  it("below + Verlauf: Teaser auch nach Reload (courseTeasers aus /history)", () => {
    const el = mount(
      h(ChatHistory, {
        settings: AUTO,
        history: [user, answer({ courseTeasers: TEASERS })],
      }),
    );
    expect(
      cards(el).map((c) => c.querySelector(".allm-course-teaser")?.textContent),
    ).toEqual([TEASER_YOGA, TEASER_EN]);
  });

  it("NAK-3: ohne courseTeasers kein Untertext; Option aus: keine Karten trotz Teaser", () => {
    const el = mount(
      h(HistoricalMessage, {
        message: reply,
        role: "assistant",
        courseSources: clone([YOGA]),
        courseCards: "auto",
      }),
    );
    expect(el.querySelector(".allm-course-teaser")).toBeNull();
    act(() => root.unmount());
    container.remove();
    const off = mount(
      h(HistoricalMessage, {
        message: reply,
        role: "assistant",
        courseSources: clone([YOGA]),
        courseTeasers: TEASERS,
        courseCards: "off",
      }),
    );
    expect(off.querySelector("[data-course-cards]")).toBeNull();
    expect(off.textContent).not.toContain(TEASER_YOGA);
  });

  it("Teaser nur für Karten, deren URL passt; Fallback-Karte ohne Teaser", () => {
    const fallbackUrl = `${BASE}/aerobic/262-3208`;
    const sel = selectAnnouncedCourseCards(
      `${link(YOGA)} und [Aerobic](${fallbackUrl})`,
      clone([YOGA]),
      AUTO,
      { announced: 1, fallback: true, pageHost: "aw.donau.kufer.de" },
    );
    expect(sel.footerCards).toHaveLength(1);
    const el = mount(
      h(ChatHistory, {
        settings: ABOVE,
        history: [
          user,
          answer({
            content: `${link(YOGA)} und [Aerobic](${fallbackUrl})`,
            courseSources: clone([YOGA]),
            courseCardsAnnounced: 1,
            courseTeasers: { [fallbackUrl]: "nie", [YOGA.url]: TEASER_YOGA },
          }),
        ],
      }),
    );
    const teasers = [...el.querySelectorAll(".allm-course-teaser")].map(
      (t) => t.textContent,
    );
    expect(teasers).toEqual([TEASER_YOGA]);
  });
});
