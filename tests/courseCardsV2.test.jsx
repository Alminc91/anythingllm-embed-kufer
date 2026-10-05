import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";

// Kurskarten v2: Präfixregel (Slug + Kursnummer), Linktexte ohne Markdown,
// ganze Karte als ein Link, Position "above" mit vorab angekündigten Kursen
// (Chunk type "courseSources", courseCardsAnnounced), Karten-Marker nie im
// Text. Kurs-Metadaten = echte Fixture von praesentation.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom: kein Element.scrollTo (ChatHistory scrollt nach unten)
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

import fixtures from "./fixtures/praesentationCourseSources.json";
import {
  appendReplyText,
  selectAnnouncedCourseCards,
  selectCourseCards,
  stripCardsMarker,
  stripMarkdown,
} from "../src/utils/courseCards.js";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import handleChat from "../src/utils/chat/index.js";
import HistoricalMessage from "../src/components/ChatWindow/ChatContainer/ChatHistory/HistoricalMessage/index.jsx";
import PromptReply from "../src/components/ChatWindow/ChatContainer/ChatHistory/PromptReply/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";

const AUTO = { courseCards: "auto" };
const DONAU = { pageHost: "demo.ki.kufer.de" };
const clone = (v) => JSON.parse(JSON.stringify(v));
const link = (c, text = c.title) => `[${text}](${c.url})`;
const BASE = "https://aw.donau.kufer.de/kurssuche/kurs";
const course = (slug, nr, title, extra = {}) => ({
  url: `${BASE}/${slug}/${nr}`,
  title,
  start_date: "2026-10-12",
  weekdays: ",mon,",
  start_minutes: 1080,
  price: 60,
  bookable: true,
  format: "onsite",
  ...extra,
});
const SPAN_14 = course(
  "spanisch-fuer-anfaengerinnen",
  "262-4M14",
  "Spanisch für AnfängerInnen",
);
const SPAN_15 = course(
  "spanisch-fuer-anfaengerinnen",
  "262-4M15",
  "Spanisch für AnfängerInnen",
  {
    start_date: "2027-01-11",
  },
);
const URLAUB = `${BASE}/spanisch-als-urlaubsvorbereitung/262-4M20`;
const BY = fixtures.bergischYoga;

describe("Kurs-Pfadpräfix ohne die letzten zwei Segmente", () => {
  it("::course-prefix-two-segments — dritter Kurslink ohne Metadaten ist Kursseite, kein Abschlusslink (AK-2)", () => {
    const reply = [
      "Für Anfänger passen:",
      `1. ${link(SPAN_14, `**${SPAN_14.title}**`)}`,
      `2. ${link(SPAN_15, `**${SPAN_15.title}**`)}`,
      `3. [**Spanisch als Urlaubsvorbereitung**](${URLAUB})`,
    ].join("\n");
    const r = selectCourseCards(
      reply,
      [clone(SPAN_14), clone(SPAN_15)],
      AUTO,
      DONAU,
    );
    expect(r.cards.map((c) => c.url)).toEqual([SPAN_14.url, SPAN_15.url]);
    expect(r.categoryLink).toBeNull();
    // echter Kategorie-Link außerhalb von /kurssuche/kurs/ bleibt Abschlusslink
    const withCategory = `${reply}\nAlle Kurse: [Sprachen](https://aw.donau.kufer.de/programm/sprachen)`;
    expect(
      selectCourseCards(
        withCategory,
        [clone(SPAN_14), clone(SPAN_15)],
        AUTO,
        DONAU,
      ).categoryLink,
    ).toEqual({
      url: "https://aw.donau.kufer.de/programm/sprachen",
      text: "Sprachen",
    });
  });

  it("schon eine Kurs-URL genügt; Präfix mindestens das erste Segment", () => {
    const r = selectCourseCards(
      `${link(SPAN_14)} und [Urlaub](${URLAUB}) — mehr unter [Programm](https://aw.donau.kufer.de/programm)`,
      [clone(SPAN_14)],
      AUTO,
      DONAU,
    );
    expect(r.cards).toHaveLength(1);
    expect(r.categoryLink.url).toBe("https://aw.donau.kufer.de/programm");
    // Kurs-URL mit nur zwei Segmenten: Präfix = erstes Segment
    const shortA = {
      url: "https://www.vhs-x.de/kurse/26H-40123",
      title: "Englisch A1",
    };
    const r2 = selectCourseCards(
      `${link(shortA)} oder [A2](https://www.vhs-x.de/kurse/26H-40124)`,
      [shortA],
      AUTO,
      { pageHost: "www.vhs-x.de" },
    );
    expect(r2.categoryLink).toBeNull();
  });
});

describe("Linktexte ohne Markdown (AK-3)", () => {
  it("::strip-markdown-link-text — Abschlusslink 'Umwelt und Gesundheit →' ohne Sternchen", () => {
    const sources = clone(BY.slice(0, 2));
    const reply =
      `${link(BY[0])} und ${link(BY[1])}.\n` +
      "Alle: [**Umwelt und Gesundheit**](https://www.vhs-bergisch-land.de/kurse/umwelt-und-gesundheit)";
    const r = selectCourseCards(reply, sources, AUTO, {
      pageHost: "www.vhs-bergisch-land.de",
    });
    expect(r.categoryLink.text).toBe("Umwelt und Gesundheit");
  });

  it.each([
    ["**Umwelt und Gesundheit**", "Umwelt und Gesundheit"],
    ["__Yoga__ am Abend", "Yoga am Abend"],
    ["`Excel` Grundkurs", "Excel Grundkurs"],
    ["*Hatha* Yoga", "Hatha Yoga"],
    ["Kurs_Nr_12", "Kurs_Nr_12"],
  ])("stripMarkdown(%p) -> %p", (input, output) => {
    expect(stripMarkdown(input)).toBe(output);
  });

  it("Kartentitel und Kompaktzeilen ohne Markdown", () => {
    const entry = {
      ...clone(SPAN_14),
      title: "**Spanisch für AnfängerInnen**",
    };
    const r = selectCourseCards(link(SPAN_14), [entry], AUTO, DONAU);
    expect(r.cards[0].title).toBe("Spanisch für AnfängerInnen");
  });
});

describe("Karten-Marker im Text (Abwehr in der Tiefe)", () => {
  it.each([
    ["[[KARTEN: 0, 2]]\n\nJa, gern.", false, "Ja, gern."],
    ["[[KARTEN: -]]\nHallo", false, "Hallo"],
    ["[[KARTEN: kaputt\nHallo", false, "Hallo"],
    ["[[KAR", true, ""],
    ["[[KARTEN: 1, ", true, ""],
    ["[[KAR", false, "[[KAR"],
    ["Ja [[KARTEN: 1]]", false, "Ja [[KARTEN: 1]]"],
  ])("stripCardsMarker(%p, partial=%p) -> %p", (input, partial, output) => {
    expect(stripCardsMarker(input, { partial })).toBe(output);
  });
});

describe("Settings: courseCardsPosition", () => {
  const ok = (json) => ({ ok: true, json: async () => json });
  it("Standard below; data-course-cards-position=above; visual_config gewinnt; ungültig verworfen", async () => {
    const base = { embedId: "e", baseApiUrl: "https://x/api/embed" };
    expect(
      (await loadEmbedSettings(base, async () => ok({}))).courseCardsPosition,
    ).toBe("below");
    expect(
      (
        await loadEmbedSettings(
          { ...base, courseCardsPosition: "above" },
          async () => ok({}),
        )
      ).courseCardsPosition,
    ).toBe("above");
    expect(
      (
        await loadEmbedSettings(
          { ...base, courseCardsPosition: "below" },
          async () => ok({ courseCardsPosition: "above" }),
        )
      ).courseCardsPosition,
    ).toBe("above");
    expect(
      (
        await loadEmbedSettings(
          { ...base, courseCardsPosition: "oben" },
          async () => ok({}),
        )
      ).courseCardsPosition,
    ).toBe("below");
  });
});

describe("selectAnnouncedCourseCards (Position above)", () => {
  const sources = [clone(BY[6]), clone(BY[0]), clone(BY[9]), clone(BY[3])];
  const host = { pageHost: "www.vhs-bergisch-land.de" };

  it("angekündigte Kurse in Server-Reihenfolge, schon ohne Text", () => {
    const r = selectAnnouncedCourseCards("", sources, AUTO, {
      ...host,
      announced: 2,
    });
    expect(r.cards.map((c) => c.url)).toEqual([BY[6].url, BY[0].url]);
    expect(r.compact).toBe(false);
  });

  it("verlinkte weitere Kurse werden in Link-Reihenfolge angehängt, unverlinkte nicht", () => {
    const reply = `${link(BY[3])} und ${link(BY[0])}`;
    const r = selectAnnouncedCourseCards(reply, sources, AUTO, {
      ...host,
      announced: 2,
    });
    expect(r.cards.map((c) => c.url)).toEqual([
      BY[6].url,
      BY[0].url,
      BY[3].url,
    ]);
  });

  it("nie Kompaktliste: höchstens 5 Karten, Rest = weitere Kurse", () => {
    const eight = clone(BY.slice(0, 8));
    const r = selectAnnouncedCourseCards("", eight, AUTO, {
      ...host,
      announced: 8,
    });
    expect(r.compact).toBe(false);
    expect(r.cards).toHaveLength(5);
    expect(r.more).toBe(3);
  });

  it("ohne Ankündigung = selectCourseCards; Option aus = nichts", () => {
    const reply = link(BY[0]);
    expect(selectAnnouncedCourseCards(reply, sources, AUTO, host)).toEqual(
      selectCourseCards(reply, sources, AUTO, host),
    );
    expect(
      selectAnnouncedCourseCards("", sources, {}, { ...host, announced: 2 })
        .cards,
    ).toEqual([]);
  });
});

describe("Stream-Verarbeitung: Chunk type courseSources", () => {
  it("kommt vor dem ersten Text-Token: wartende Antwort mit Karten, Text hängt sich an, Abschluss ergänzt", () => {
    const set = vi.fn();
    const hist = [];
    const chunk = (c) => handleChat(c, vi.fn(), set, [], hist);
    chunk({
      uuid: "u",
      type: "courseSources",
      courseSources: clone(BY.slice(0, 2)),
      close: false,
    });
    expect(hist[0]).toMatchObject({
      uuid: "u",
      role: "assistant",
      content: "",
      pending: true,
      animate: true,
      courseCardsAnnounced: 2,
    });
    expect(hist[0].closed).toBeFalsy();
    expect(hist[0].courseSources).toHaveLength(2);
    chunk({
      uuid: "u",
      type: "textResponseChunk",
      textResponse: "Ja, ",
      close: false,
      sources: [],
    });
    chunk({
      uuid: "u",
      type: "textResponseChunk",
      textResponse: link(BY[3]),
      close: true,
      sources: [],
    });
    expect(hist[0]).toMatchObject({
      content: `Ja, ${link(BY[3])}`,
      pending: false,
      closed: true,
    });
    expect(hist[0].courseSources).toHaveLength(2);
    chunk({
      uuid: "u",
      type: "finalizeResponseStream",
      close: true,
      chatId: 7,
      courseSources: clone([BY[0], BY[1], BY[3]]),
      courseCardsAnnounced: 2,
    });
    expect(hist[0]).toMatchObject({ chatId: 7, courseCardsAnnounced: 2 });
    expect(hist[0].courseSources).toHaveLength(3);
    expect(hist).toHaveLength(1);
  });

  it("leerer/kaputter courseSources-Chunk ändert nichts", () => {
    const set = vi.fn();
    const hist = [];
    handleChat(
      { uuid: "u", type: "courseSources", courseSources: [] },
      vi.fn(),
      set,
      [],
      hist,
    );
    handleChat({ uuid: "u", type: "courseSources" }, vi.fn(), set, [], hist);
    expect(hist).toHaveLength(0);
    expect(set).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rendering
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

describe("Ganze Karte klickbar (AK-4c)", () => {
  it("genau ein <a> je Karte, Name = Titel, neuer Tab, keine verschachtelten Links", () => {
    const reply = `${link(BY[0])}, ${link(BY[6])} und ${link(BY[9])}`;
    const el = mount(
      h(HistoricalMessage, {
        role: "assistant",
        message: reply,
        courseSources: clone(BY),
        courseCards: "auto",
      }),
    );
    const cards = el.querySelectorAll(".allm-course-card");
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.tagName).toBe("A");
      expect(card.querySelectorAll("a")).toHaveLength(0);
      expect(card.closest("li").querySelectorAll("a")).toHaveLength(1);
      expect(card.getAttribute("target")).toBe("_blank");
      expect(card.getAttribute("rel")).toBe("noopener noreferrer");
      const title = card.querySelector(".allm-course-title").textContent;
      expect(card.getAttribute("aria-label")).toBe(title);
      // Beschreibung = sichtbare Zeilen der Karte
      const ids = card.getAttribute("aria-describedby").split(" ");
      expect(ids.length).toBeGreaterThanOrEqual(2);
      for (const id of ids)
        expect(card.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
    // Zeit, Ort, Badge liegen IN dem einen Link
    expect(cards[0].querySelector(".allm-course-schedule")).not.toBeNull();
    expect(cards[0].querySelector(".allm-course-details")).not.toBeNull();
    expect(cards[0].querySelector(".allm-course-status")).not.toBeNull();
  });
});

const assistantText = (el) =>
  el.querySelector(".allm-anything-llm-assistant-message");
const cardsSection = (el) => el.querySelector("[data-course-cards]");
const follows = (a, b) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Position der Karten (AK-4)", () => {
  const user = { role: "user", content: "Yoga am Abend?", sentAt: 1759651200 };
  const reply = `Ja: ${link(BY[0])} und ${link(BY[6])}.`;
  const answer = {
    role: "assistant",
    content: reply,
    sentAt: 1759651205,
    chatId: 3,
    sources: [],
    courseSources: clone(BY),
  };

  it("above: Karten vor der Antwortblase, Name davor; below/ohne: dahinter", () => {
    const above = mount(
      h(ChatHistory, {
        settings: { courseCards: "auto", courseCardsPosition: "above" },
        history: [user, answer],
      }),
    );
    const turn = above.querySelector("[data-assistant-turn]");
    expect(turn).not.toBeNull();
    expect(cardsSection(above).getAttribute("data-position")).toBe("above");
    expect(follows(cardsSection(above), assistantText(above))).toBe(true);
    expect(follows(turn.firstChild, cardsSection(above))).toBe(true);
    expect(turn.firstChild.textContent).toBe("Ihr Online-Berater");
    expect(above.querySelectorAll(".allm-course-card")).toHaveLength(2);
    act(() => root.unmount());
    container.remove();

    for (const settings of [
      { courseCards: "auto", courseCardsPosition: "below" },
      { courseCards: "auto" },
    ]) {
      const below = mount(
        h(ChatHistory, { settings, history: [user, answer] }),
      );
      expect(below.querySelector("[data-assistant-turn]")).toBeNull();
      expect(follows(assistantText(below), cardsSection(below))).toBe(true);
      act(() => root.unmount());
      container.remove();
    }
  });

  it("above, Antwort ohne Karten: gleiche Struktur wie normal (Name + Blase)", () => {
    const plain = {
      ...answer,
      content: "Meinen Sie Yoga für Anfänger?",
      courseSources: undefined,
    };
    const above = mount(
      h(ChatHistory, {
        settings: { courseCards: "auto", courseCardsPosition: "above" },
        history: [user, plain],
      }),
    );
    expect(cardsSection(above)).toBeNull();
    expect(above.textContent).toContain("Ihr Online-Berater");
    expect(above.textContent.match(/Ihr Online-Berater/g)).toHaveLength(1);
  });

  it("above: Abschlusslink unter der Antwort, nicht über ihr", () => {
    const withCat = {
      ...answer,
      content: `${reply} Alle: [**Umwelt und Gesundheit**](https://www.vhs-bergisch-land.de/kurse/umwelt-und-gesundheit)`,
    };
    const el = mount(
      h(ChatHistory, {
        settings: { courseCards: "auto", courseCardsPosition: "above" },
        history: [user, withCat],
      }),
    );
    const footer = el.querySelector(
      "[data-course-cards-footer] .allm-course-category",
    );
    expect(footer.textContent).toBe("Umwelt und Gesundheit →");
    expect(follows(assistantText(el), footer)).toBe(true);
    expect(cardsSection(el).querySelector(".allm-course-category")).toBeNull();
  });
});

describe("Karten oben ohne Sprung (AK-4b, React-Ebene)", () => {
  it("Karten vor dem ersten Text-Token, genau eine Einfügung, am Ende nur Anhang", () => {
    const settings = { courseCards: "auto", courseCardsPosition: "above" };
    const user = {
      role: "user",
      content: "Yoga am Abend?",
      sentAt: 1759651200,
    };
    const placeholder = {
      role: "assistant",
      content: "",
      pending: true,
      animate: true,
      userMessage: "x",
    };
    const el = mount(
      h(ChatHistory, { settings, history: [user, placeholder] }),
    );

    const log = [];
    const collect = (records) => {
      for (const r of records) {
        for (const n of r.addedNodes)
          if (
            n.nodeType === 1 &&
            (n.matches("[data-course-cards]") ||
              n.querySelector("[data-course-cards]"))
          )
            log.push("add");
        for (const n of r.removedNodes)
          if (
            n.nodeType === 1 &&
            (n.matches("[data-course-cards]") ||
              n.querySelector("[data-course-cards]"))
          )
            log.push("remove");
      }
    };
    const mo = new MutationObserver(collect);
    mo.observe(el, { childList: true, subtree: true });

    const hist = [];
    const render = () =>
      act(() =>
        root.render(
          h(ChatHistory, { settings, history: [user, ...clone(hist)] }),
        ),
      );
    const chunk = (c) => {
      handleChat(c, vi.fn(), vi.fn(), [user], hist);
      render();
    };

    chunk({
      uuid: "u",
      type: "courseSources",
      courseSources: clone([BY[6], BY[0]]),
      close: false,
    });
    const section = cardsSection(el);
    expect(section).not.toBeNull();
    expect(assistantText(el)).toBeNull(); // noch kein Text, nur Tipp-Indikator
    expect(el.querySelector(".allm-dot-falling")).not.toBeNull();
    const firstCard = el.querySelector(".allm-course-card");

    for (const t of ["Ja, ", `am Abend ${link(BY[0])} `, `und ${link(BY[9])}.`])
      chunk({
        uuid: "u",
        type: "textResponseChunk",
        textResponse: t,
        close: false,
        sources: [],
      });
    chunk({
      uuid: "u",
      type: "textResponseChunk",
      textResponse: "",
      close: true,
      sources: [],
    });
    chunk({
      uuid: "u",
      type: "finalizeResponseStream",
      close: true,
      chatId: 5,
      courseSources: clone([BY[6], BY[0], BY[9]]),
      courseCardsAnnounced: 2,
    });
    collect(mo.takeRecords());
    mo.disconnect();

    expect(log).toEqual(["add"]);
    expect(cardsSection(el)).toBe(section); // derselbe Knoten, kein Neuaufbau
    expect(el.querySelector(".allm-course-card")).toBe(firstCard);
    expect(
      [...el.querySelectorAll(".allm-course-title")].map((n) => n.textContent),
    ).toEqual([BY[6].title, BY[0].title, BY[9].title]);
    expect(follows(section, assistantText(el))).toBe(true);
  });
});

describe("Marker nie sichtbar (Widget-Abwehr, einmal bei der Aufnahme)", () => {
  // Stream über handleChat (wie ChatContainer) und Anzeige über ChatHistory
  function streamInto(settings = {}) {
    const user = { role: "user", content: "Yoga?", sentAt: 1759651200 };
    const hist = [];
    mount(h(ChatHistory, { settings, history: [user] }));
    const chunk = (c) => {
      handleChat(c, vi.fn(), vi.fn(), [user], hist);
      act(() =>
        root.render(
          h(ChatHistory, { settings, history: [user, ...clone(hist)] }),
        ),
      );
    };
    const text = (t, close = false) =>
      chunk({
        uuid: "u",
        type: "textResponseChunk",
        textResponse: t,
        close,
        sources: [],
      });
    return { hist, text };
  }

  it("Stream: offener Marker = Tipp-Indikator, fertiger Marker entfernt (PromptReply + Verlauf)", () => {
    for (const settings of [
      {},
      { courseCards: "auto", courseCardsPosition: "above" },
    ]) {
      const { hist, text } = streamInto(settings);
      text("[[KAR");
      text("TEN: 1,");
      expect(container.textContent).not.toContain("KARTEN");
      expect(container.querySelector(".allm-dot-falling")).not.toBeNull();
      expect(hist[0]).toMatchObject({ content: "", pending: true });
      text(" 2]]\n\nJa, ");
      text("gern.");
      expect(container.textContent).toContain("Ja, gern.");
      expect(container.textContent).not.toContain("KARTEN");
      text("", true);
      // gespeicherter Inhalt ist sauber (Vorlesen, Kopieren, Feedback)
      expect(hist[0]).toMatchObject({
        content: "Ja, gern.",
        pending: false,
        closed: true,
      });
      expect(hist[0].markerBuffer).toBeUndefined();
      expect(assistantText(container).textContent).toContain("Ja, gern.");
      expect(container.textContent).not.toContain("KARTEN");
      act(() => root.unmount());
      container.remove();
    }
  });

  it("Nur-Marker-Antwort bleibt leer; offener Marker über 120 Zeichen wird Text (wie Server-Filter)", () => {
    const a = streamInto();
    a.text("[[KARTEN: -]]");
    expect(a.hist[0].pending).toBe(true);
    a.text("", true);
    expect(a.hist[0]).toMatchObject({ content: "", pending: false });
    expect(container.textContent).not.toContain("KARTEN");
    act(() => root.unmount());
    container.remove();

    const b = streamInto();
    const long = `[[KARTEN: ${"1, ".repeat(40)}`;
    b.text(long);
    expect(long.length).toBeGreaterThan(120);
    expect(b.hist[0]).toMatchObject({ content: long, pending: false });
  });

  it("Text vor/ohne Marker unverändert; Marker mitten im Text bleibt", () => {
    expect(appendReplyText(null, "Ja [[KARTEN: 1]]", false)).toEqual({
      content: "Ja [[KARTEN: 1]]",
    });
    expect(appendReplyText({ content: "Ja" }, " [[KARTEN: 1]]", false)).toEqual(
      { content: "Ja [[KARTEN: 1]]" },
    );
    expect(appendReplyText(null, "[[KAR", false)).toEqual({
      content: "",
      markerBuffer: "[[KAR",
    });
    expect(
      appendReplyText({ content: "", markerBuffer: "[[KAR" }, "", true),
    ).toEqual({ content: "[[KAR" });
  });

  it("Verlauf laden: Marker entfernt, Nur-Marker-Antwort leer, Nutzer-Text unverändert", async () => {
    const { default: RealChatService } = await vi.importActual(
      "@/models/chatService",
    );
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        history: [
          { role: "user", content: "[[KARTEN: 1]] Was ist das?", sentAt: 1 },
          { role: "assistant", content: "[[KARTEN: 0]]\nHallo", sentAt: 2 },
          { role: "user", content: "Und?", sentAt: 3 },
          { role: "assistant", content: "[[KARTEN: -]]", sentAt: 4 },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const history = await RealChatService.embedSessionHistory(
        { embedId: "e", baseApiUrl: "https://x/api/embed" },
        "s",
      );
      expect(history.map((m) => m.content)).toEqual([
        "[[KARTEN: 1]] Was ist das?",
        "Hallo",
        "Und?",
        "",
      ]);
      const el = mount(h(ChatHistory, { settings: {}, history }));
      const answers = el.querySelectorAll(
        ".allm-anything-llm-assistant-message",
      );
      expect(answers[0].textContent).toContain("Hallo");
      for (const n of answers) expect(n.textContent).not.toContain("KARTEN");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("Nutzer-Nachricht mit Marker-Text wird unverändert angezeigt (Review-Fund 3)", () => {
    const el = mount(
      h(HistoricalMessage, {
        role: "user",
        message: "[[KARTEN: 1]] Was ist das?",
      }),
    );
    expect(
      el.querySelector(".allm-anything-llm-user-message").textContent,
    ).toContain("[[KARTEN: 1]] Was ist das?");
  });
});

describe("Kurskarten oben: Anker-Scroll einmal je Turn (Review-Fund 1)", () => {
  const settings = { courseCards: "auto", courseCardsPosition: "above" };
  const user = { role: "user", content: "Yoga am Abend?", sentAt: 1759651200 };
  const placeholder = {
    role: "assistant",
    content: "",
    pending: true,
    animate: true,
    userMessage: "Yoga am Abend?",
  };
  // Layout-Ersatz (jsdom rechnet nicht): Frage = Anker bei anchorTop px im
  // Inhalt, Inhaltshöhe scrollHeight, sichtbare Höhe clientHeight
  let layout;
  let scrollTo;
  const scrollTops = new WeakMap();
  beforeEach(() => {
    layout = { scrollHeight: 500, clientHeight: 400, anchorTop: 300 };
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get() {
        return scrollTops.get(this) || 0;
      },
      set(v) {
        scrollTops.set(this, v);
      },
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      () => layout.scrollHeight,
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      () => layout.clientHeight,
    );
    scrollTo = vi
      .spyOn(Element.prototype, "scrollTo")
      .mockImplementation(function ({ top }) {
        const max = layout.scrollHeight - layout.clientHeight;
        this.scrollTop = Math.max(0, Math.min(top, max));
      });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function () {
        if (this.id === "chat-history") return { top: 0 };
        const sc = this.closest("#chat-history");
        return { top: layout.anchorTop - (sc ? sc.scrollTop : 0) };
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete HTMLElement.prototype.scrollTop;
  });

  const scroller = () => container.querySelector("#chat-history");
  function startTurn() {
    mount(h(ChatHistory, { settings, history: [user, placeholder] }));
    const hist = [];
    const chunk = (c) => {
      handleChat(c, vi.fn(), vi.fn(), [user], hist);
      act(() =>
        root.render(
          h(ChatHistory, { settings, history: [user, ...clone(hist)] }),
        ),
      );
    };
    const text = (t, close = false) =>
      chunk({
        uuid: "u",
        type: "textResponseChunk",
        textResponse: t,
        close,
        sources: [],
      });
    return { hist, chunk, text };
  }

  it("folgt dem wachsenden Turn, bis die Frage oben steht — danach kein Scroll mehr, auch nicht am Stream-Ende", () => {
    const { chunk, text } = startTurn();
    // Inhalt noch kurz: so weit wie möglich (100), Anker noch nicht oben
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 292, behavior: "auto" });
    expect(scroller().scrollTop).toBe(100);
    chunk({
      uuid: "u",
      type: "courseSources",
      courseSources: clone([BY[6], BY[0]]),
      close: false,
    });
    layout.scrollHeight = 900; // Karten + erster Text
    text("Ja, ");
    expect(scroller().scrollTop).toBe(292); // Frage steht oben
    const calls = scrollTo.mock.calls.length;
    layout.scrollHeight = 1600;
    text(`am Abend ${link(BY[0])} `);
    text("und mehr.", true);
    chunk({
      uuid: "u",
      type: "finalizeResponseStream",
      close: true,
      chatId: 5,
      courseSources: clone([BY[6], BY[0]]),
      courseCardsAnnounced: 2,
    });
    expect(scrollTo.mock.calls.length).toBe(calls);
    expect(scroller().scrollTop).toBe(292);
  });

  it("Nutzer scrollt unter den Anker (oder per Rad): kein Zurückspringen", () => {
    const { text } = startTurn();
    expect(scroller().scrollTop).toBe(100);
    layout.scrollHeight = 1400;
    // Nutzer scrollt selbst weiter nach unten, bevor der Anker erreicht ist
    act(() => {
      scroller().scrollTop = 700;
      scroller().dispatchEvent(new Event("scroll"));
    });
    const calls = scrollTo.mock.calls.length;
    text("Ja, ");
    text("gern.");
    expect(scrollTo.mock.calls.length).toBe(calls);
    expect(scroller().scrollTop).toBe(700);
    act(() => root.unmount());
    container.remove();

    // Mausrad beendet das Nachführen sofort
    layout.scrollHeight = 500;
    const second = startTurn();
    act(() => {
      scroller().dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    });
    const before = scrollTo.mock.calls.length;
    layout.scrollHeight = 1400;
    second.text("Ja.");
    expect(scrollTo.mock.calls.length).toBe(before);
  });

  it("neuer Turn (neue Frage) führt wieder nach", () => {
    const { hist, text } = startTurn();
    layout.scrollHeight = 900;
    text("Ja.", true);
    expect(scroller().scrollTop).toBe(292);
    const calls = scrollTo.mock.calls.length;
    layout.scrollHeight = 1300;
    layout.anchorTop = 950;
    act(() =>
      root.render(
        h(ChatHistory, {
          settings,
          history: [
            user,
            ...clone(hist),
            { role: "user", content: "Und am Morgen?", sentAt: 1759651300 },
            placeholder,
          ],
        }),
      ),
    );
    expect(scrollTo.mock.calls.length).toBe(calls + 1);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 942, behavior: "auto" });
  });
});

// ---------------------------------------------------------------------------
// Schlanke Fallback-Karte: Kursseiten-Links ohne courseSources-Eintrag
// ---------------------------------------------------------------------------
describe("Fallback-Karten: Auswahl", () => {
  const FB = { ...DONAU, fallback: true };
  const fb = (path, nr) => `${BASE}/${path}/${nr}`;
  const BIKE = fb("radfahren-fuer-erwachsene", "262-9X01");
  const COOK = fb("indisch-kochen", "262-7K03");

  it("::fallback-card — Kurslink ohne Metadaten: Karte nur mit Titel (Linktext ohne Markdown) und Link", () => {
    const reply = [
      "Für Anfänger passen:",
      `1. ${link(SPAN_15, `**${SPAN_15.title}**`)}`,
      `2. [**Spanisch als Urlaubsvorbereitung**](${URLAUB})`,
      `3. ${link(SPAN_14, `**${SPAN_14.title}**`)}`,
    ].join("\n");
    const sources = [clone(SPAN_14), clone(SPAN_15)];
    // ohne Option fallback (Antwort streamt noch): wie bisher
    expect(
      selectCourseCards(reply, sources, AUTO, DONAU).cards.map((c) => c.url),
    ).toEqual([SPAN_14.url, SPAN_15.url]);
    const r = selectCourseCards(reply, sources, AUTO, FB);
    expect(r.cards.map((c) => c.url)).toEqual([
      SPAN_14.url,
      SPAN_15.url,
      URLAUB,
    ]);
    expect(r.categoryLink).toBeNull();
    const card = r.cards[2];
    expect(card).toMatchObject({
      title: "Spanisch als Urlaubsvorbereitung",
      url: URLAUB,
      fallback: true,
      schedule: null,
      weekdays: null,
      time: null,
      start: null,
      place: null,
      price: null,
      status: null,
    });
    expect(r.cards[0].fallback).toBeUndefined();
  });

  it("Reihenfolge der Links, Dedupe per URL (Schreibweise egal), Karten ohne Datum hinter datierten", () => {
    const reply = [
      `[Radfahren für Erwachsene](${BIKE})`,
      link(SPAN_14),
      `[Indisch kochen](${COOK})`,
      `Nochmals: [Radfahren für Erwachsene](${BIKE.toUpperCase().replace("HTTPS://AW", "https://www.aw")}/)`,
    ].join("\n");
    const r = selectCourseCards(reply, [clone(SPAN_14)], AUTO, FB);
    expect(r.cards.map((c) => c.title)).toEqual([
      SPAN_14.title,
      "Radfahren für Erwachsene",
      "Indisch kochen",
    ]);
  });

  it("keine Fallback-Karte: nackte URL, Linktext 'hier', fremde Domain, Kategorie-Seite, Option aus", () => {
    const reply = [
      link(SPAN_14),
      `Mehr: ${BIKE}`,
      `Details [hier](${COOK})`,
      `[Yoga extern](https://www.andere-vhs.de/kurssuche/kurs/yoga/1)`,
      `[Sprachen](https://aw.donau.kufer.de/programm/sprachen)`,
    ].join("\n");
    const r = selectCourseCards(reply, [clone(SPAN_14)], AUTO, FB);
    expect(r.cards.map((c) => c.url)).toEqual([SPAN_14.url]);
    expect(r.categoryLink.url).toBe(
      "https://aw.donau.kufer.de/programm/sprachen",
    );
    expect(
      selectCourseCards(`[Radfahren](${BIKE})`, [clone(SPAN_14)], {}, FB),
    ).toEqual(selectCourseCards("", [], AUTO, FB));
    expect(selectCourseCards(`[Radfahren](${BIKE})`, [], {}, FB).cards).toEqual(
      [],
    );
  });

  it("gleicher Kurs mit anderer URL (Titel-Treffer) ergibt keine zweite Karte", () => {
    const wrong = `${BASE}/spanisch-fuer-anfaengerinnen/262-4M99`;
    const r = selectCourseCards(
      `[${SPAN_14.title}](${wrong})`,
      [clone(SPAN_14)],
      AUTO,
      FB,
    );
    expect(r.cards.map((c) => c.url)).toEqual([SPAN_14.url]);
  });

  it("ohne courseSources: nur Links auf der Domain der Webseite (Wortliste /kurs/…)", () => {
    const reply = `[Radfahren für Erwachsene](${BIKE})`;
    expect(
      selectCourseCards(reply, undefined, AUTO, FB).cards.map((c) => c.url),
    ).toEqual([BIKE]);
    expect(
      selectCourseCards(reply, [], AUTO, {
        pageHost: "www.vhs-x.de",
        fallback: true,
      }).cards,
    ).toEqual([]);
  });

  it("Limit wie bei vollwertigen Karten: ab 6 Kompaktliste, höchstens 10 Zeilen, Rest = more", () => {
    const many = (n) =>
      Array.from(
        { length: n },
        (_, i) =>
          `- [Kurs Nummer ${i + 1}](${fb(`kurs-${i + 1}`, `262-${i + 1}`)})`,
      ).join("\n");
    const five = selectCourseCards(many(5), [], AUTO, FB);
    expect(five.compact).toBe(false);
    expect(five.cards).toHaveLength(5);
    const twelve = selectCourseCards(many(12), [], AUTO, FB);
    expect(twelve.compact).toBe(true);
    expect(twelve.cards).toHaveLength(10);
    expect(twelve.more).toBe(2);
    expect(twelve.cards[0].title).toBe("Kurs Nummer 1");
  });

  it("above mit Ankündigung: Karten oben unverändert, Fallback-Karten unter der Antwort (footerCards), zusammen höchstens 5", () => {
    const sources = [clone(SPAN_14), clone(SPAN_15)];
    const reply = `${link(SPAN_14)}, [Urlaub](${URLAUB}), [Radfahren für Erwachsene](${BIKE}) und [Indisch kochen](${COOK})`;
    const opts = { ...DONAU, announced: 2 };
    const plain = selectAnnouncedCourseCards(reply, sources, AUTO, opts);
    expect(plain.footerCards).toBeUndefined();
    const r = selectAnnouncedCourseCards(reply, sources, AUTO, {
      ...opts,
      fallback: true,
    });
    expect(r.cards).toEqual(plain.cards);
    expect(r.more).toBe(0);
    expect(r.footerCards.map((c) => c.title)).toEqual([
      "Urlaub",
      "Radfahren für Erwachsene",
      "Indisch kochen",
    ]);
    expect(r.footerMore).toBe(0);
    // 4 Karten oben -> nur noch ein Platz unten, Rest footerMore
    const four = [
      ...sources,
      clone(course("a-kurs", "262-A1", "Kurs Alpha")),
      clone(course("b-kurs", "262-B1", "Kurs Beta")),
    ];
    const r4 = selectAnnouncedCourseCards(reply, four, AUTO, {
      ...DONAU,
      announced: 4,
      fallback: true,
    });
    expect(r4.cards).toHaveLength(4);
    expect(r4.footerCards.map((c) => c.title)).toEqual(["Urlaub"]);
    expect(r4.footerMore).toBe(2);
  });
});

describe("Fallback-Karten: Darstellung", () => {
  const reply = `Ja: ${link(BY[0])} und [**Yoga am Morgen**](https://www.vhs-bergisch-land.de/kurssuche/kurs/yoga-am-morgen/27160001).`;
  const user = { role: "user", content: "Yoga?", sentAt: 1759651200 };
  const answer = {
    role: "assistant",
    content: reply,
    sentAt: 1759651205,
    chatId: 3,
    sources: [],
    courseSources: [clone(BY[0])],
  };

  it("Karte nur mit Titel, ganze Karte ein Link, sonst gleiche Karte", () => {
    const el = mount(
      h(HistoricalMessage, {
        role: "assistant",
        message: reply,
        courseSources: [clone(BY[0])],
        courseCards: "auto",
        courseCardsFinal: true,
      }),
    );
    const cards = el.querySelectorAll(".allm-course-card");
    expect(cards).toHaveLength(2);
    const fbCard = cards[1];
    expect(fbCard.hasAttribute("data-course-fallback")).toBe(true);
    expect(cards[0].hasAttribute("data-course-fallback")).toBe(false);
    expect(fbCard.tagName).toBe("A");
    expect(fbCard.getAttribute("href")).toBe(
      "https://www.vhs-bergisch-land.de/kurssuche/kurs/yoga-am-morgen/27160001",
    );
    expect(fbCard.getAttribute("target")).toBe("_blank");
    expect(fbCard.getAttribute("aria-label")).toBe("Yoga am Morgen");
    expect(fbCard.hasAttribute("aria-describedby")).toBe(false);
    expect(fbCard.textContent).toBe("Yoga am Morgen");
    expect(fbCard.querySelector(".allm-course-schedule")).toBeNull();
    expect(fbCard.querySelector(".allm-course-details")).toBeNull();
    expect(fbCard.querySelector(".allm-course-status")).toBeNull();
    expect(fbCard.className).toBe(cards[0].className);
    expect(fbCard.getAttribute("style")).toBe(cards[0].getAttribute("style"));
  });

  it("Antwort noch nicht fertig (ohne chatId) bzw. Option aus: keine Fallback-Karte", () => {
    for (const props of [
      { courseCards: "auto", courseCardsFinal: false },
      { courseCards: "off", courseCardsFinal: true },
    ]) {
      const el = mount(
        h(HistoricalMessage, {
          role: "assistant",
          message: reply,
          courseSources: [clone(BY[0])],
          ...props,
        }),
      );
      expect(el.querySelector("[data-course-fallback]")).toBeNull();
      act(() => root.unmount());
      container.remove();
    }
    // Verlauf ohne chatId (Abschluss-Chunk fehlt noch)
    const el = mount(
      h(ChatHistory, {
        settings: { courseCards: "auto" },
        history: [user, { ...answer, chatId: undefined }],
      }),
    );
    expect(el.querySelectorAll(".allm-course-card")).toHaveLength(1);
  });

  it("below: Fallback-Karte in der Kartenfläche unter der Antwort", () => {
    const el = mount(
      h(ChatHistory, {
        settings: { courseCards: "auto" },
        history: [user, answer],
      }),
    );
    const sec = cardsSection(el);
    expect(sec.querySelectorAll(".allm-course-card")).toHaveLength(2);
    expect(sec.querySelector("[data-course-fallback]")).not.toBeNull();
    expect(follows(assistantText(el), sec)).toBe(true);
  });

  it("above mit Ankündigung: Fallback-Karte unter der Antwort, Karten oben unverändert", () => {
    const settings = { courseCards: "auto", courseCardsPosition: "above" };
    const announced = { ...answer, courseCardsAnnounced: 1 };
    const el = mount(h(ChatHistory, { settings, history: [user, announced] }));
    const top = cardsSection(el);
    expect(top.querySelectorAll(".allm-course-card")).toHaveLength(1);
    expect(top.querySelector("[data-course-fallback]")).toBeNull();
    const footer = el.querySelector("[data-course-cards-footer]");
    expect(footer.querySelectorAll("[data-course-fallback]")).toHaveLength(1);
    expect(follows(assistantText(el), footer)).toBe(true);
    act(() => root.unmount());
    container.remove();
    // vor dem Abschluss-Chunk (ohne chatId): kein Fallback unten
    const early = mount(
      h(ChatHistory, {
        settings,
        history: [user, { ...announced, chatId: undefined }],
      }),
    );
    expect(early.querySelector("[data-course-cards-footer]")).toBeNull();
    expect(early.querySelectorAll(".allm-course-card")).toHaveLength(1);
  });
});
