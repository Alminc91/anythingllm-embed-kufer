import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";

// Kurskarten (courseCards "auto"): Auswahl, Dedupe, Kompaktliste,
// Kategorie-Link, Rückfrage, fehlende Felder, Info-Seiten, fremde Domains und
// unveränderter Antworttext. courseSources = echte Kurs-Metadaten von
// praesentation (Donau + Bergisch-Land-Klon), erzeugt mit der Fork-Funktion
// buildCourseSources (tests/fixtures/praesentationCourseSources.json).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

import fixtures from "./fixtures/praesentationCourseSources.json";
import {
  extractLinks,
  formatCourse,
  formatPlace,
  formatPrice,
  formatTime,
  formatWeekdays,
  normalizeUrl,
  selectCourseCards,
  titleSimilarity,
  normalizeText,
  MORE_COURSES_TEXT,
} from "../src/utils/courseCards.js";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import handleChat from "../src/utils/chat/index.js";
import HistoricalMessage from "../src/components/ChatWindow/ChatContainer/ChatHistory/HistoricalMessage/index.jsx";

const AUTO = { courseCards: "auto" };
const DONAU = { pageHost: "demo.ki.kufer.de" };
const BERGISCH = { pageHost: "www.vhs-bergisch-land.de" };
const clone = (v) => JSON.parse(JSON.stringify(v));
const byTitle = (list, title) => list.find((c) => c.title === title);
const link = (c, text = c.title) => `[${text}](${c.url})`;

const [englishA, englishB, englishC, englishI] = fixtures.donauEnglish;
const [backSchool, aerobic, strength, yogaAdvanced, talk] =
  fixtures.donauHealth;
const BY = fixtures.bergischYoga;

describe("Settings: courseCards", () => {
  const fetchJson = (body) => async () => ({
    ok: true,
    json: async () => body,
  });
  const base = { embedId: "e", baseApiUrl: "https://x.test/api/embed" };

  it("Standard off; data-course-cards=auto; visual_config gewinnt; ungültig verworfen", async () => {
    expect((await loadEmbedSettings(base, fetchJson({}))).courseCards).toBe(
      "off",
    );
    expect(
      (await loadEmbedSettings({ ...base, courseCards: "AUTO" }, fetchJson({})))
        .courseCards,
    ).toBe("auto");
    expect(
      (await loadEmbedSettings(base, fetchJson({ courseCards: "auto" })))
        .courseCards,
    ).toBe("auto");
    expect(
      (
        await loadEmbedSettings(
          { ...base, courseCards: "auto" },
          fetchJson({ courseCards: "off" }),
        )
      ).courseCards,
    ).toBe("off");
    expect(
      (await loadEmbedSettings({ ...base, courseCards: "yes" }, fetchJson({})))
        .courseCards,
    ).toBe("off");
  });
});

describe("Formatierung (deutsch)", () => {
  it("Wochentage, Uhrzeit, Preis, Ort", () => {
    expect(formatWeekdays(",mon,")).toBe("Mo");
    expect(formatWeekdays(",wed,mon,sun,")).toBe("Mo, Mi, So");
    expect(formatWeekdays("montag")).toBeNull();
    expect(formatTime(1110)).toBe("18:30");
    expect(formatTime(540)).toBe("09:00");
    expect(formatTime(undefined)).toBeNull();
    expect(formatPrice(60)).toBe("60 €");
    expect(formatPrice(175.9)).toBe("175,90 €");
    expect(formatPrice(89)).toBe("89 €");
    expect(formatPrice(0)).toBeNull();
    expect(formatPlace("onsite", "leichlingen")).toBe("Leichlingen");
    expect(formatPlace("onsite", undefined)).toBe("vor Ort");
    expect(formatPlace("online", "online")).toBe("online");
    expect(formatPlace("hybrid", "bad boll")).toBe("Bad Boll · auch online");
    expect(formatPlace(undefined, undefined)).toBeNull();
  });

  it("Karte aus echten Metadaten (Hatha Yoga, Bergisch-Land)", () => {
    expect(formatCourse(BY[0])).toMatchObject({
      title: "Hatha Yoga",
      url: "https://www.vhs-bergisch-land.de/kurssuche/kurs/hatha-yoga/26266236W",
      schedule: "Do · 18:30 Uhr",
      start: "ab 10.09.2026",
      place: "Leichlingen",
      price: "138,80 €",
      status: "nicht buchbar",
    });
  });

  it("Links der Antwort: Markdown, HTML, nackt; URL-Vergleich tolerant", () => {
    const links = extractLinks(
      `Siehe [Kurs](${englishA.url}), <a href="https://aw.donau.kufer.de/programm/gesundheit">Gesundheit</a> und https://aw.donau.kufer.de/kontakt.`,
    );
    expect(links.map((l) => l.text)).toEqual(["Kurs", "Gesundheit", ""]);
    expect(links[2].url).toBe("https://aw.donau.kufer.de/kontakt");
    expect(normalizeUrl("http://WWW.vhs-bergisch-land.de/Kurs/A/")).toBe(
      normalizeUrl("https://vhs-bergisch-land.de/kurs/a"),
    );
  });

  it("Titelvergleich: >= 90 % normalisiert", () => {
    const t = normalizeText(
      "Kundalini-Yoga für Anfänger/innen mit und ohne Vorkenntnisse",
    );
    expect(
      titleSimilarity(
        t,
        normalizeText(
          "Der Kurs Kundalini Yoga fuer Anfaenger innen mit und ohne Vorkenntnisse startet",
        ),
      ),
    ).toBe(1);
    expect(
      titleSimilarity(
        t,
        normalizeText(
          "Kundalini-Yoga für Anfängerinnen mit und ohne Vorkenntnis",
        ),
      ),
    ).toBeGreaterThanOrEqual(0.9);
    expect(titleSimilarity(t, normalizeText("Yoga für Anfänger"))).toBeLessThan(
      0.9,
    );
  });
});

describe("selectCourseCards", () => {
  it("only-mentioned-courses: zwei verlinkte von fünf Quellen, sortiert nach Beginn (AK-2)", () => {
    const reply =
      `Für Ihre Gesundheit passen zum Beispiel ${link(aerobic)} (mittwochs) ` +
      `und ${link(backSchool)}. Beide finden vor Ort statt.`;
    const r = selectCourseCards(
      reply,
      clone(fixtures.donauHealth),
      AUTO,
      DONAU,
    );
    expect(r.compact).toBe(false);
    expect(r.cards.map((c) => c.title)).toEqual([
      "Rückenschule",
      "Leichtes Aerobic",
    ]);
    const [first] = r.cards;
    expect(first).toMatchObject({
      url: backSchool.url,
      schedule: expect.stringMatching(/^Mi · \d\d:\d\d Uhr$/),
      start: "ab 16.09.2026",
      place: "vor Ort",
      price: "24 €",
    });
  });

  it("dedupe-by-url: drei Einträge derselben Kurs-URL -> eine Karte (AK-3)", () => {
    const reply = `Ja: ${link(englishB)} montags ab 18 Uhr.`;
    const sources = [
      clone(englishB),
      clone(englishB),
      { ...clone(englishB), price: 99 },
    ];
    const r = selectCourseCards(reply, sources, AUTO, DONAU);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].price).toBe("50 €");
    // auch doppelt verlinkt (Titel + "Zur Anmeldung") nur einmal
    const twice = `${link(englishB)} – [zur Anmeldung](${englishB.url.toLowerCase()}/)`;
    expect(selectCourseCards(twice, sources, AUTO, DONAU).cards).toHaveLength(
      1,
    );
  });

  it("compact-above-five: 8 genannte Kurse -> keine Karten, 8 Kompaktzeilen (AK-4)", () => {
    const named = BY.slice(0, 8);
    const reply =
      "Wir haben einige Yogakurse:\n" +
      named.map((c) => `- ${link(c)}`).join("\n");
    const r = selectCourseCards(reply, clone(BY), AUTO, BERGISCH);
    expect(r.compact).toBe(true);
    expect(r.cards).toHaveLength(8);
    expect(r.more).toBe(0);
    // sortiert nach Beginn
    const dates = r.cards.map(
      (c) => BY.find((b) => b.url === c.url).start_date,
    );
    expect([...dates].sort()).toEqual(dates);
  });

  it("Kompaktliste höchstens 10 Zeilen, danach 'weitere Kurse im Programm'", () => {
    const reply = BY.map((c) => link(c)).join(", ");
    const r = selectCourseCards(reply, clone(BY), AUTO, BERGISCH);
    expect(r.compact).toBe(true);
    expect(r.cards).toHaveLength(10);
    expect(r.more).toBe(2);
    expect(r.categoryLink).toBeNull();
  });

  it("category-link-footer: Kategorie-Link + zwei Kurslinks -> zwei Karten + Abschlusslink (AK-5)", () => {
    const reply =
      `Am Abend gibt es ${link(yogaAdvanced)} und ${link(englishB)}. ` +
      `Mehr finden Sie unter [Alle Gesundheitskurse](https://aw.donau.kufer.de/programm/gesundheit).`;
    const sources = [...clone(fixtures.donauHealth), clone(englishB)];
    const r = selectCourseCards(reply, sources, AUTO, DONAU);
    expect(r.cards.map((c) => c.title)).toEqual([
      "Yoga (Aufbaukurs)",
      "Englisch 1",
    ]);
    expect(r.categoryLink).toEqual({
      url: "https://aw.donau.kufer.de/programm/gesundheit",
      text: "Alle Gesundheitskurse",
    });
    // Info-Seite (Kontakt) ist kein Kategorie-Link
    const contact = reply.replace("programm/gesundheit", "kontakt");
    expect(
      selectCourseCards(contact, sources, AUTO, DONAU).categoryLink,
    ).toBeNull();
    // fremde Domain auch nicht
    const foreign = reply.replace(
      "aw.donau.kufer.de/programm",
      "www.example.org/programm",
    );
    expect(
      selectCourseCards(foreign, sources, AUTO, DONAU).categoryLink,
    ).toBeNull();
  });

  it("clarifying-question-no-cards: Rückfrage ohne Kurslink/-titel bei vier Kursquellen (AK-6)", () => {
    const reply = "Meinen Sie Yoga für Anfänger oder Fortgeschrittene?";
    const sources = [
      ...clone(fixtures.donauYoga),
      clone(englishA),
      clone(backSchool),
    ];
    expect(sources).toHaveLength(4);
    const r = selectCourseCards(reply, sources, AUTO, DONAU);
    expect(r.cards).toEqual([]);
    expect(r.categoryLink).toBeNull();
  });

  it("missing-fields-omitted: ohne price/location kein Preis, kein Ort, kein 'undefined' (AK-7)", () => {
    const src = { ...clone(BY[4]) };
    delete src.price;
    delete src.location;
    delete src.format;
    const r = selectCourseCards(`Tipp: ${link(src)}`, [src], AUTO, BERGISCH);
    const [card] = r.cards;
    expect(card.price).toBeNull();
    expect(card.place).toBeNull();
    expect(JSON.stringify(card)).not.toMatch(/undefined|NaN|null €/);
    expect(card.schedule).toBe("Di · 09:30 Uhr");
  });

  it("NAK-1: ohne start_date kein Datum und keine Wochentage aus anderen Quellen", () => {
    const noDate = { ...clone(englishC) };
    delete noDate.start_date;
    delete noDate.end_date;
    noDate.weekdays = ",mon,";
    delete noDate.start_minutes;
    const r = selectCourseCards(
      `${link(noDate)} oder ${link(englishI)}`,
      [noDate, clone(englishI)],
      AUTO,
      DONAU,
    );
    const card = r.cards.find((c) => c.url === noDate.url);
    expect(card.start).toBeNull();
    expect(card.schedule).toBe("Mo");
    // English I (Mi, 18:00) liefert nichts an die andere Karte
    expect(r.cards.find((c) => c.url === englishI.url).schedule).toBe(
      "Mi · 18:00 Uhr",
    );
    // ohne start_date UND ohne weekdays ist es kein Kurs
    const none = { ...noDate };
    delete none.weekdays;
    expect(selectCourseCards(link(none), [none], AUTO, DONAU).cards).toEqual(
      [],
    );
  });

  it("info-pages-no-cards: nur Info-Seiten -> 0 Karten, auch bei auto (NAK-2)", () => {
    const info = [
      { url: "https://aw.donau.kufer.de/kontakt", title: "Kontakt" },
      { url: "https://aw.donau.kufer.de/kontakt/agb", title: "AGB" },
      {
        url: "https://aw.donau.kufer.de/kurse/gesundheit",
        title: "Gesundheit",
      },
    ];
    const reply =
      "Sie erreichen uns über die [Kontaktseite](https://aw.donau.kufer.de/kontakt), die [AGB](https://aw.donau.kufer.de/kontakt/agb) gelten.";
    expect(selectCourseCards(reply, info, AUTO, DONAU).cards).toEqual([]);
    expect(selectCourseCards(reply, [], AUTO, DONAU).cards).toEqual([]);
  });

  it("NAK-3: Quelle auf fremder Domain wird nicht verlinkt (weggelassen)", () => {
    const foreign = {
      ...clone(englishA),
      url: "https://www.fremde-akademie.de/kurs/englisch-1/4711",
      title: "Englisch 1 bei der Akademie",
    };
    const reply = `${link(englishB)} und ${link(foreign)}`;
    const r = selectCourseCards(
      reply,
      [clone(englishB), clone(englishC), foreign],
      AUTO,
      DONAU,
    );
    expect(r.cards.map((c) => c.url)).toEqual([englishB.url]);
    expect(JSON.stringify(r)).not.toMatch(/fremde-akademie/);
  });

  it("Titel-Match als Fallback, nur eindeutig; URL-Match hat Vorrang", () => {
    const kundalini = BY[6];
    const reply =
      "Für Einsteiger empfehle ich Kundalini-Yoga für Anfänger/innen mit und ohne Vorkenntnisse. " +
      "Hatha Yoga gibt es ebenfalls.";
    const sources = [clone(BY[6]), clone(BY[0]), clone(BY[1])];
    // Kundalini-Titel kommt doppelt vor? Nein, hier nur einmal -> Karte.
    // "Hatha Yoga" gibt es zweimal (verschiedene Termine) -> mehrdeutig, keine Karte.
    const r = selectCourseCards(reply, sources, AUTO, BERGISCH);
    expect(r.cards.map((c) => c.url)).toEqual([kundalini.url]);
    // Englisch 1 A verlinkt: die gleichnamigen B/C kommen NICHT per Titel dazu
    const r2 = selectCourseCards(
      `Ja, ${link(englishA)} am Mittwoch. Englisch 1 gibt es auch montags.`,
      clone(fixtures.donauEnglish),
      AUTO,
      DONAU,
    );
    expect(r2.cards.map((c) => c.url)).toEqual([englishA.url]);
    // zu kurzer Titel ("Yoga") nie per Titel
    const r3 = selectCourseCards(
      "Yoga ist toll.",
      clone(fixtures.donauYoga),
      AUTO,
      DONAU,
    );
    expect(r3.cards).toEqual([]);
  });

  it("höchstens 5 Karten", () => {
    const named = [BY[0], BY[4], BY[6], BY[8], BY[9]];
    const r = selectCourseCards(
      named.map((c) => link(c)).join(" "),
      clone(BY),
      AUTO,
      BERGISCH,
    );
    expect(r.compact).toBe(false);
    expect(r.cards).toHaveLength(5);
  });

  it("Option aus oder ungültig -> nie Karten", () => {
    const reply = link(englishA);
    for (const s of [
      {},
      { courseCards: "off" },
      { courseCards: "on" },
      { courseCards: true },
    ])
      expect(
        selectCourseCards(reply, clone(fixtures.donauEnglish), s, DONAU).cards,
      ).toEqual([]);
  });
});

describe("selectCourseCards — Review-Funde", () => {
  const X = { pageHost: "www.vhs-x.de" };
  const course = (path, title, extra = {}) => ({
    url: `https://www.vhs-x.de${path}`,
    title,
    start_date: "2026-10-06",
    weekdays: ",tue,",
    ...extra,
  });
  const hatha = course("/kurssuche/kurs/hatha-yoga/100", "Hatha Yoga");
  const senior = course(
    "/kurssuche/kurs/hatha-yoga-fuer-senioren/200",
    "Hatha Yoga für Senioren",
  );

  it("Titel-Präfix: nur der längere genannte Titel bekommt eine Karte", () => {
    const reply =
      "Für Sie passt Hatha Yoga für Senioren am Dienstagvormittag in Burscheid.";
    const r = selectCourseCards(reply, [hatha, senior], AUTO, X);
    expect(r.cards.map((c) => c.title)).toEqual(["Hatha Yoga für Senioren"]);
    // auch als Linktext eines verlinkten Kurses
    const linked = `Tipp: [Hatha Yoga für Senioren](${senior.url}).`;
    expect(
      selectCourseCards(linked, [hatha, senior], AUTO, X).cards.map(
        (c) => c.title,
      ),
    ).toEqual(["Hatha Yoga für Senioren"]);
    // Gegenprobe: beide getrennt genannt -> zwei Karten
    const both =
      "Es gibt Hatha Yoga am Montag und außerdem Hatha Yoga für Senioren am Dienstag.";
    expect(
      selectCourseCards(both, [hatha, senior], AUTO, X).cards,
    ).toHaveLength(2);
  });

  it("Rückfrage 'Meinen Sie den Kurs Hatha Yoga für Senioren …?' -> keine Karte", () => {
    const reply = "Meinen Sie den Kurs Hatha Yoga für Senioren …?";
    expect(selectCourseCards(reply, [hatha, senior], AUTO, X).cards).toEqual(
      [],
    );
    expect(selectCourseCards(reply, [hatha], AUTO, X).cards).toEqual([]);
    // Titel, der selbst mit "?" endet, bleibt zuordenbar
    const question = course(
      "/kurssuche/kurs/achtsamkeit/300",
      "Was ist Achtsamkeit?",
    );
    expect(
      selectCourseCards(
        "Neu im Programm: Was ist Achtsamkeit? Der Kurs beginnt im Oktober.",
        [question],
        AUTO,
        X,
      ).cards,
    ).toHaveLength(1);
  });

  it("Kategorie-Erkennung über den Kurs-Pfadpräfix der courseSources", () => {
    const a1 = course("/kurse/26H-40123-englisch-a1", "Englisch A1 am Abend");
    const b1 = course("/kurse/26H-40125-englisch-b1", "Englisch B1 am Abend");
    const reply =
      `Ja: [Englisch A1 am Abend](${a1.url}) oder ` +
      `[Englisch A2](https://www.vhs-x.de/kurse/26H-40124-englisch-a2).`;
    const r = selectCourseCards(reply, [a1, b1], AUTO, X);
    expect(r.cards.map((c) => c.url)).toEqual([a1.url]);
    expect(r.categoryLink).toBeNull();
    // auch mit nur einer Kursquelle (Präfix = Elternverzeichnis)
    expect(selectCourseCards(reply, [a1], AUTO, X).categoryLink).toBeNull();
    // echter Kategorie-Link außerhalb des Präfixes bleibt Abschlusslink
    const withCategory = `${reply} Alle Sprachkurse: [Sprachen](https://www.vhs-x.de/programm/sprachen)`;
    expect(
      selectCourseCards(withCategory, [a1, b1], AUTO, X).categoryLink,
    ).toEqual({
      url: "https://www.vhs-x.de/programm/sprachen",
      text: "Sprachen",
    });
  });

  it("Markdown-Link mit Klammern in der URL", () => {
    const evening = course("/kurs/123-(abend)", "Yoga am Abend kompakt");
    const reply = `Siehe [Kurs](https://www.vhs-x.de/kurs/123-(abend)).`;
    expect(extractLinks(reply)).toEqual([
      { url: "https://www.vhs-x.de/kurs/123-(abend)", text: "Kurs", index: 6 },
    ]);
    expect(
      selectCourseCards(reply, [evening], AUTO, X).cards.map((c) => c.url),
    ).toEqual(["https://www.vhs-x.de/kurs/123-(abend)"]);
    // Klammer um eine nackte URL gehört nicht zur URL
    expect(extractLinks("(siehe https://www.vhs-x.de/kurs/9)")[0].url).toBe(
      "https://www.vhs-x.de/kurs/9",
    );
  });

  it("gleicher Beginn: Reihenfolge der Fundstellen im Text (Titel vor Link)", () => {
    const pilates = course(
      "/kurssuche/kurs/pilates/1",
      "Pilates Grundkurs Montag",
    );
    const zumba = course("/kurssuche/kurs/zumba/2", "Zumba Fitness");
    const reply = `Zuerst Pilates Grundkurs Montag, danach [Zumba Fitness](${zumba.url}).`;
    expect(
      selectCourseCards(reply, [zumba, pilates], AUTO, X).cards.map(
        (c) => c.title,
      ),
    ).toEqual(["Pilates Grundkurs Montag", "Zumba Fitness"]);
  });

  it("Laufzeit: 1500-Wort-Antwort x 12 Titel unter 50 ms", () => {
    const titles = [
      "Hatha Yoga für Senioren",
      "Kundalini-Yoga für Anfänger/innen mit und ohne Vorkenntnisse",
      "Goldenes Yoga 55+",
      "Aerial Flying Yoga luftiges Training im Tuch",
      "Entspannt ins Wochenende mit Yoga Nidra und Atementspannung",
      "Orthopädische Yoga-Therapie für reifere Erwachsene",
      "Englisch A2 am Abend",
      "Spanisch für die Reise",
      "Pilates Grundkurs Montag",
      "Fotografie mit dem Smartphone",
      "Excel Grundlagen kompakt",
      "Italienisch Konversation B1",
    ];
    const sources = titles.map((t, i) =>
      course(`/kurssuche/kurs/k${i}/${i}`, t),
    );
    // gleiche Antwort wie die Messung im Review (Zufallsfolge, fester Seed)
    const vocab =
      "die der und Kurs Yoga am Abend wir bieten Ihnen viele Angebote im Herbst Anmeldung über Kursseite Termine Entspannung Gesundheit Sprache Programm finden Sie hier mit ohne für Anfänger Fortgeschrittene Woche".split(
        " ",
      );
    let seed = 7;
    const rnd = () =>
      (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const reply = Array.from(
      { length: 1500 },
      () => vocab[Math.floor(rnd() * vocab.length)],
    ).join(" ");
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      selectCourseCards(reply, sources, AUTO, X);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(50);
  });
});

describe("Stream-Verarbeitung (handleChat)", () => {
  it("courseSources kommen mit dem Abschluss-Chunk an die Nachricht, Text bleibt", () => {
    const set = vi.fn();
    const hist = [];
    const chunk = (c) => handleChat(c, vi.fn(), set, [], hist);
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
      textResponse: link(englishA),
      close: true,
      sources: [],
    });
    expect(hist[0].courseSources).toBeUndefined();
    expect(hist[0].closed).toBe(true);
    chunk({
      uuid: "u",
      type: "finalizeResponseStream",
      close: true,
      chatId: 9,
      courseSources: clone(fixtures.donauEnglish),
    });
    expect(hist[0]).toMatchObject({
      chatId: 9,
      content: `Ja, ${link(englishA)}`,
      closed: true,
      animate: false,
    });
    expect(hist[0].courseSources).toHaveLength(4);
    // finalize ohne courseSources (Option aus / Server < 7.9): Feld fehlt weiter
    const hist2 = [];
    handleChat(
      { uuid: "v", type: "textResponseChunk", textResponse: "x", close: true },
      vi.fn(),
      vi.fn(),
      [],
      hist2,
    );
    handleChat(
      { uuid: "v", type: "finalizeResponseStream", close: true, chatId: 1 },
      vi.fn(),
      vi.fn(),
      [],
      hist2,
    );
    expect(hist2[0]).not.toHaveProperty("courseSources");
  });
});

describe("HistoricalMessage mit Kurskarten", () => {
  let container;
  let root;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  function render(props) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        h(HistoricalMessage, {
          role: "assistant",
          sentAt: 1759651200,
          chatId: 1,
          ...props,
        }),
      );
    });
    return container;
  }

  const reply =
    `Am Abend passen ${link(yogaAdvanced)} und ${link(backSchool)}. ` +
    `Alle Angebote: [Gesundheitskurse](https://aw.donau.kufer.de/programm/gesundheit).`;

  it("AK-1: ohne Option 0 Karten im DOM (auch mit courseSources)", () => {
    const el = render({
      message: reply,
      courseSources: clone(fixtures.donauHealth),
    });
    expect(el.querySelectorAll("[data-course-cards]")).toHaveLength(0);
    expect(el.querySelectorAll(".allm-course-card")).toHaveLength(0);
  });

  it("NAK-5: mit Karten bleibt der Antworttext identisch; Links öffnen neu mit noopener noreferrer", () => {
    const without = render({
      message: reply,
      courseSources: clone(fixtures.donauHealth),
    });
    const textWithout = without.querySelector(
      ".allm-anything-llm-assistant-message",
    ).innerHTML;
    act(() => root.unmount());
    container.remove();

    const el = render({
      message: reply,
      courseSources: clone(fixtures.donauHealth),
      courseCards: "auto",
    });
    expect(
      el.querySelector(".allm-anything-llm-assistant-message").innerHTML,
    ).toBe(textWithout);
    const cards = el.querySelectorAll(".allm-course-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Yoga (Aufbaukurs)");
    expect(cards[0].textContent).toContain("Mo · 18:00 Uhr");
    expect(cards[0].textContent).toContain("ab 14.09.2026 · vor Ort · 60 €");
    expect(cards[0].textContent).toContain("buchbar");
    expect(el.textContent).not.toMatch(/undefined|NaN/);
    for (const a of el.querySelectorAll("[data-course-cards] a")) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
    const footer = el.querySelector(".allm-course-category");
    expect(footer.textContent).toBe("Gesundheitskurse →");
    // Karten stehen unter der Antwortblase, vor dem Zeitstempel
    const section = el.querySelector("[data-course-cards]");
    expect(
      el
        .querySelector(".allm-anything-llm-assistant-message")
        .compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Rückfrage / Nutzer-Nachricht / Fehler: keine leere Kartenfläche", () => {
    const q = render({
      message: "Meinen Sie Yoga für Anfänger oder Fortgeschrittene?",
      courseSources: clone(fixtures.donauYoga),
      courseCards: "auto",
    });
    expect(q.querySelector("[data-course-cards]")).toBeNull();
    act(() => root.unmount());
    container.remove();
    const u = render({
      role: "user",
      message: reply,
      courseSources: clone(fixtures.donauHealth),
      courseCards: "auto",
    });
    expect(u.querySelector("[data-course-cards]")).toBeNull();
  });

  it("Kompaktliste: 8 Zeilen, Titel als Link, Ort", () => {
    const named = BY.slice(0, 8);
    const el = render({
      message: named.map((c) => link(c)).join("\n"),
      courseSources: clone(BY),
      courseCards: "auto",
    });
    // jsdom: Seite läuft auf localhost -> Kundendomain = häufigste Quellen-Domain
    expect(el.querySelectorAll(".allm-course-card")).toHaveLength(0);
    const rows = el.querySelectorAll(".allm-course-row");
    expect(rows).toHaveLength(8);
    expect(rows[0].querySelector("a").getAttribute("href")).toMatch(
      /^https:\/\/www\.vhs-bergisch-land\.de\//,
    );
    expect(rows[0].textContent).toMatch(
      /· (Leichlingen|Wermelskirchen|Burscheid)$/,
    );
    expect(el.textContent).not.toContain(MORE_COURSES_TEXT);
  });
});
