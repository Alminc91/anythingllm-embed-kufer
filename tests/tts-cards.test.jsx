import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";

// Sprachausgabe (Vorlesen-Knopf) einer Antwort mit Kurskarten: immer erst
// der Antworttext, danach die Karten als Sätze (auch bei Karten oben), ohne
// Folgefragen, Marker oder Teaserzeilen; ohne Karten unverändert. Text +
// Karten höchstens 1.400 Zeichen (Server kürzt auf 1.500).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

vi.mock("../src/main.jsx", () => ({
  embedderSettings: {
    settings: {},
    USER_STYLES: {},
    ASSISTANT_STYLES: {},
  },
}));
const chatService = vi.hoisted(() => ({
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: true })),
  textToSpeechStream: vi.fn(async () => true),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("@/components/ChatWindow", () => ({ SEND_TEXT_EVENT: "send-text" }));

import { embedderSettings } from "../src/main.jsx";
import {
  courseCardSpeech,
  formatCourse,
  replySpeechText,
  selectCourseCards,
  SPEECH_MAX_LEN,
  teaserMap,
} from "../src/utils/courseCards.js";
import handleChat from "../src/utils/chat/index.js";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";

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
const TEASER_YOGA = "Hatha-Yoga am Abend mit kräftigenden Haltungen";
const TEASER_EN = "Online-Einstieg in Englisch mit viel Sprechpraxis.";
const TEASERS = { [YOGA.url]: TEASER_YOGA, [ENGLISH.url]: TEASER_EN };
const TEASER_MAP = teaserMap(TEASERS);
const FU = ["Gibt es auch B1-Kurse?", "Gibt es Yoga am Wochenende?"];
const SAY_YOGA =
  "Kurs 1: Yoga Aufbaukurs, montags 18 Uhr, 16 Abende, ab 14. September 2026, Realschule, 60 Euro, buchbar. Hatha-Yoga am Abend mit kräftigenden Haltungen.";
const SAY_EN =
  "Kurs 2: Englisch 1, mittwochs 18:30 Uhr, ab 16. September 2026, online, 90 Euro, buchbar. Online-Einstieg in Englisch mit viel Sprechpraxis.";
const clone = (v) => JSON.parse(JSON.stringify(v));
const link = (c) => `[${c.title}](${c.url})`;
const REPLY = `Passend sind ${link(YOGA)} und ${link(ENGLISH)}.`;
// Bereinigung des Antworttexts wie bisher (HistoricalMessage)
const clean = (t) =>
  t
    .replace(/[#*_`~\[\]()]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();

// ---------------------------------------------------------------------------
describe("Karten als Sätze (courseCardSpeech, replySpeechText)", () => {
  it("eine Karte: Titel, Zeit, Dauer, Beginn, Ort, Preis, Status, Teaser", () => {
    expect(courseCardSpeech(formatCourse(YOGA), TEASER_YOGA)).toBe(
      SAY_YOGA.replace("Kurs 1: ", ""),
    );
    // fehlende Felder entfallen, kein "undefined", Satz bleibt rund
    expect(
      courseCardSpeech(
        formatCourse({
          url: YOGA.url,
          title: "Töpfern",
          weekdays: ",tue,thu,sat,",
          start_minutes: 510,
          price: 175.9,
          format: "hybrid",
          venue: "Werkstatt",
        }),
      ),
    ).toBe(
      "Töpfern, dienstags, donnerstags und samstags 8:30 Uhr, Werkstatt, auch online, 175,90 Euro.",
    );
    expect(courseCardSpeech({ title: "Aerobic", fallback: true }, "nie")).toBe(
      "Aerobic.",
    );
  });

  it("AK-7: Text, danach beide Karten (unabhängig von der Kartenposition)", () => {
    const sel = selectCourseCards(REPLY, clone([YOGA, ENGLISH]), {
      courseCards: "auto",
    });
    expect(sel.cards).toHaveLength(2);
    const text = clean(REPLY);
    expect(replySpeechText(text, sel, TEASER_MAP)).toBe(
      `${text}\n\n${SAY_YOGA} ${SAY_EN}`,
    );
  });

  it("NAK-2: ohne Karten unverändert", () => {
    const text = "Ja, montags um 18 Uhr.";
    expect(replySpeechText(text, null)).toBe(text);
    expect(replySpeechText(text, { cards: [], footerCards: [] })).toBe(text);
  });

  it("Kompaktliste ohne Teaser; Fallback-Karten (above) zuletzt, Nummerierung durchgehend", () => {
    const compact = {
      cards: [formatCourse(YOGA)],
      compact: true,
    };
    expect(replySpeechText("T", compact, TEASER_MAP)).toBe(
      "T\n\nKurs 1: Yoga Aufbaukurs, montags 18 Uhr, 16 Abende, ab 14. September 2026, Realschule, 60 Euro, buchbar.",
    );
    const above = {
      cards: [formatCourse(YOGA)],
      footerCards: [{ title: "Aerobic", fallback: true, key: "x" }],
    };
    expect(replySpeechText("T", above, TEASER_MAP)).toBe(
      `T\n\n${SAY_YOGA} Kurs 2: Aerobic.`,
    );
  });

  // Fünf Karten mit Teasern: je Karte ≈ 107 Zeichen + Teaser ≈ 80
  const five = Array.from({ length: 5 }, (_, i) =>
    formatCourse({ ...YOGA, url: `${BASE}/kurs-${i + 1}/262-${i + 1}` }),
  );
  const fiveTeasers = new Map(
    five.map((c, i) => [c.key, `${"Teaser ".repeat(10)}Nummer ${i + 1}`]),
  );
  const cardOnly = (i) => `Kurs ${i}: ${courseCardSpeech(five[0])}`;

  it("Länge: Text zuerst und vollständig, Text + Karten ≤ 1.400 Zeichen", () => {
    expect(SPEECH_MAX_LEN).toBe(1400);
    const text = "Antwort. ".repeat(80).trim(); // 719 Zeichen
    const sel = { cards: five, footerCards: [] };
    const out = replySpeechText(text, sel, fiveTeasers);
    expect(out.length).toBeLessThanOrEqual(1400);
    expect(out.startsWith(`${text}\n\n`)).toBe(true);
    // alle Karten ohne Teaser passen (5 × ≈ 107), Teaser nur solange Platz
    for (let i = 1; i <= 5; i++) expect(out).toContain(`Kurs ${i}: Yoga`);
    expect(out).toContain("Nummer 1.");
    expect(out).not.toContain("Nummer 5");
    expect(out).not.toContain("weitere Kurs");
    // Teaser in Kartenreihenfolge: nach dem ersten fehlenden keiner mehr
    const n = [1, 2, 3, 4, 5].filter((i) => out.includes(`Nummer ${i}.`));
    expect(n).toEqual([1, 2, 3, 4, 5].slice(0, n.length));
    // kurzer Text: alle Teaser passen
    const short = replySpeechText(
      "Kurz.",
      { cards: five.slice(0, 2) },
      fiveTeasers,
    );
    expect(short).toContain("Nummer 2.");
  });

  it("Länge: reicht der Platz nicht für alle Karten ohne Teaser, entfallen die letzten mit „Und n weitere Kurse.“", () => {
    const text = "x".repeat(1100);
    const out = replySpeechText(text, { cards: five }, fiveTeasers);
    expect(out.length).toBeLessThanOrEqual(1400);
    expect(out.startsWith(text)).toBe(true);
    expect(out).not.toContain("Nummer");
    expect(out).toBe(
      `${text}\n\n${cardOnly(1)} ${cardOnly(2)} Und 3 weitere Kurse.`,
    );
    // nur eine Karte zu viel: Einzahl
    const out4 = replySpeechText("y".repeat(890), { cards: five }, null);
    expect(out4.length).toBeLessThanOrEqual(1400);
    expect(out4.endsWith("Und ein weiterer Kurs.")).toBe(true);
    // Antworttext allein schon zu lang: nur der Text (nie gekürzt)
    const long = "z".repeat(1500);
    expect(replySpeechText(long, { cards: five }, fiveTeasers)).toBe(long);
  });
});

// ---------------------------------------------------------------------------
// Vorlesen-Knopf (HistoricalMessage über ChatHistory)
// ---------------------------------------------------------------------------
let container;
let root;
beforeEach(() => {
  embedderSettings.settings = {
    baseApiUrl: "https://demo-inline.ki.kufer.de/api/embed",
    embedId: "e-1",
  };
  chatService.textToSpeechStream.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
});

async function mount(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(element));
  await act(async () => {}); // Audio-Status (TTS verfügbar)
  return container;
}

async function speak(el) {
  const btns = [...el.querySelectorAll('button[aria-label="Speak message"]')];
  const btn = btns[btns.length - 1];
  await act(async () => btn.click());
  return chatService.textToSpeechStream.mock.calls.at(-1)[1];
}

const user = { role: "user", content: "Yoga oder Englisch?", sentAt: 1 };
const answer = (extra = {}) => ({
  role: "assistant",
  content: REPLY,
  sentAt: 2,
  chatId: 3,
  sources: [],
  courseSources: clone([YOGA, ENGLISH]),
  courseTeasers: TEASERS,
  followUps: FU,
  ...extra,
});

describe("Vorlesen-Knopf mit Karten (AK-7, NAK-2, NAK-3)", () => {
  it("AK-7 above: Text, danach beide Karten in Satzform, keine Folgefragen", async () => {
    const el = await mount(
      h(ChatHistory, {
        settings: {
          courseCards: "auto",
          courseCardsPosition: "above",
          followUps: "pills",
        },
        history: [user, answer({ courseCardsAnnounced: 2 })],
      }),
    );
    // Karten und Folgefragen sind sichtbar, die Reihenfolge im DOM bleibt
    expect(el.querySelectorAll(".allm-course-card")).toHaveLength(2);
    expect(el.querySelectorAll("#anything-llm-follow-ups button")).toHaveLength(
      2,
    );
    const text = await speak(el);
    expect(text).toBe(`${clean(REPLY)}\n\n${SAY_YOGA} ${SAY_EN}`);
    for (const f of FU) expect(text).not.toContain(f);
  });

  it("AK-7 below: Text, danach beide Karten", async () => {
    const el = await mount(
      h(ChatHistory, {
        settings: { courseCards: "auto", followUps: "pills" },
        history: [user, answer()],
      }),
    );
    expect(el.querySelectorAll(".allm-course-card")).toHaveLength(2);
    const text = await speak(el);
    expect(text).toBe(`${clean(REPLY)}\n\n${SAY_YOGA} ${SAY_EN}`);
    for (const f of FU) expect(text).not.toContain(f);
  });

  it("::rows-same-speech — Zeilen-Karten (courseCardsLayout rows) lesen genau wie das Raster vor (AK-12)", async () => {
    const texts = [];
    for (const layout of ["grid", "rows"])
      for (const position of ["above", "below"]) {
        const el = await mount(
          h(ChatHistory, {
            settings: {
              courseCards: "auto",
              courseCardsPosition: position,
              courseCardsLayout: layout,
            },
            history: [
              user,
              answer(position === "above" ? { courseCardsAnnounced: 2 } : {}),
            ],
          }),
        );
        expect(el.querySelectorAll(".allm-course-card")).toHaveLength(2);
        expect(el.querySelectorAll("[data-course-row]")).toHaveLength(
          layout === "rows" ? 2 : 0,
        );
        texts.push(await speak(el));
        act(() => root.unmount());
        container.remove();
        root = null;
      }
    expect(texts[0]).toBe(`${clean(REPLY)}\n\n${SAY_YOGA} ${SAY_EN}`);
    expect(new Set(texts).size).toBe(1);
  });

  it("NAK-2: ohne Karten (Option aus bzw. keine courseSources) Vorlesen-Text wie bisher", async () => {
    for (const [settings, extra] of [
      [{}, {}],
      [{ courseCards: "auto" }, { courseSources: null, courseTeasers: null }],
    ]) {
      const el = await mount(
        h(ChatHistory, { settings, history: [user, answer(extra)] }),
      );
      expect(el.querySelectorAll(".allm-course-card")).toHaveLength(0);
      expect(await speak(el)).toBe(clean(REPLY));
      act(() => root.unmount());
      container.remove();
      root = null;
    }
  });

  it("NAK-3: kein Marker, keine Teaserzeile, kein Fragen-Text im Vorlesen-Text", async () => {
    // Server mit angekündigten Karten + Teasern + Folgefragen-Chunk, dazu
    // (älterer Server) Teaserzeilen und Endzeile im Text — alles läuft
    // durch handleChat wie im Widget
    const hist = [];
    let shown = [];
    const set = (h) => (shown = h);
    const raw = `[[TEASER 0: roh]]\n${REPLY}\n[[FRAGEN: ${FU[0]} | ${FU[1]}]]`;
    for (const c of [
      {
        uuid: "u",
        type: "courseSources",
        courseSources: clone([YOGA, ENGLISH]),
        close: false,
      },
      { uuid: "u", type: "courseTeasers", teasers: clone(TEASERS) },
      ...raw.match(/[\s\S]{1,9}/g).map((t) => ({
        uuid: "u",
        type: "textResponseChunk",
        textResponse: t,
      })),
      { uuid: "u", type: "textResponseChunk", textResponse: "", close: true },
      { uuid: "u", type: "followUps", followUps: FU },
      { uuid: "u", type: "finalizeResponseStream", close: true, chatId: 9 },
    ])
      handleChat(c, vi.fn(), set, [user], hist);
    const last = shown[shown.length - 1];
    expect(last.content).toBe(REPLY);
    const el = await mount(
      h(ChatHistory, {
        settings: {
          courseCards: "auto",
          courseCardsPosition: "above",
          followUps: "pills",
        },
        history: [user, { ...last, animate: false }],
      }),
    );
    const text = await speak(el);
    expect(text).toBe(`${clean(REPLY)}\n\n${SAY_YOGA} ${SAY_EN}`);
    expect(text).not.toMatch(/\[\[|\]\]|KARTEN|TEASER|FRAGEN|roh/);
    for (const f of FU) expect(text).not.toContain(f);
  });
});
