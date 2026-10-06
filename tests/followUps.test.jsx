import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Folgefragen (followUps "pills"): Chunk "followUps" -> Pillen unter der
// letzten, fertigen Antwort; Klick sendet genau eine Anfrage; Verlauf;
// Übergangs-Abwehr der Endzeile "[[FRAGEN: …]]"; Settings/Validierung.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  streamChat: vi.fn(() => new Promise(() => {})), // Antwort bleibt aus
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

import { embedderSettings } from "../src/main.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import { layoutValidations } from "../src/utils/layout.js";
import {
  followUpsList,
  followUpText,
  holdFollowUpsLine,
  splitFollowUpsLine,
} from "../src/utils/courseCards.js";
import handleChat from "../src/utils/chat/index.js";
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import { SuggestedPills } from "../src/components/ChatWindow/ChatContainer/ChatHistory/PanelWelcome/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const FU = ["Gibt es B1-Kurse?", "Auch online?"];
const LINE = "[[FRAGEN: Gibt es B1-Kurse? | Auch online?]]";
const BODY = "Ja, es gibt passende Englischkurse.";

function fetchConfig(config) {
  return vi.fn(async () => ({ ok: true, json: async () => config }));
}

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  chatService.streamChat.mockReset();
  chatService.streamChat.mockImplementation(() => new Promise(() => {}));
  embedderSettings.settings = {};
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(el) {
  act(() => root.render(el));
}
const $$ = (sel) => [...container.querySelectorAll(sel)];
const pills = () => $$("#anything-llm-follow-ups button");

const user = (content) => ({ role: "user", content, sentAt: 1 });
const answer = (content, extra = {}) => ({
  role: "assistant",
  content,
  sentAt: 1,
  chatId: 7,
  ...extra,
});
const PILLS = { followUps: "pills" };

// ---------------------------------------------------------------------------
describe("Settings (AK-6, NAK-4)", () => {
  it("Standard none; Script-Attribut und Design Center wirken", async () => {
    expect((await loadEmbedSettings(BASE, fetchConfig({}))).followUps).toBe(
      "none",
    );
    expect(
      (
        await loadEmbedSettings(
          { ...BASE, followUps: "Pills" },
          fetchConfig({}),
        )
      ).followUps,
    ).toBe("pills");
    // visual_config (Design Center) gewinnt über das Script-Attribut
    expect(
      (
        await loadEmbedSettings(
          { ...BASE, followUps: "none" },
          fetchConfig({ followUps: "pills" }),
        )
      ).followUps,
    ).toBe("pills");
  });

  it("NAK-4: ungültiges data-follow-ups -> none + genau eine console.warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await loadEmbedSettings(
      { ...BASE, followUps: "chips" },
      fetchConfig({}),
    );
    expect(s.followUps).toBe("none");
    const mine = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes("Ungültiger followUps-Wert"));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toContain('es gilt "none"');
    expect(layoutValidations.followUps(" PILLS ")).toBe("pills");
    expect(layoutValidations.followUps(1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("followUpsList / splitFollowUpsLine (Regeln wie Server)", () => {
  it("followUpsList: Strings, bereinigt, ≤ 60, ohne Dubletten, max. 3", () => {
    expect(
      followUpsList([
        " **Gibt es B1?** ",
        42,
        "x".repeat(61),
        "gibt es b1?",
        "<b>Online?</b>",
        "[Abends?](https://x.de)",
        "Viertens?",
      ]),
    ).toEqual(["Gibt es B1?", "Online?", "Abends?"]);
    expect(followUpsList("a")).toEqual([]);
    expect(followUpsList(null)).toEqual([]);
  });

  it("followUpText: Regeln wie cleanTeaserText im Fork", () => {
    for (const [raw, clean] of [
      ["- Wie melde ich mich an?", "Wie melde ich mich an?"],
      [
        "https://www.vhs.de/anmeldung Was kostet der Kurs?",
        "Was kostet der Kurs?",
      ],
      ["Gibt es den *Kurs* auch online ?", "Gibt es den Kurs auch online?"],
      ["_Abends_?", "Abends?"],
      ["(*neu*) Kurse?", "(neu) Kurse?"],
      ["snake_case und 2*3 und C#?", "snake_case und 2*3 und C#?"],
      ["**Fett** und `Code`?", "Fett und Code?"],
      ["# Titel?", "Titel?"],
      ["> Zitat?", "Zitat?"],
      ["• Punkt?", "Punkt?"],
      ["Gibt es [[B1]]?", "Gibt es [B1]?"],
      ["<b>Online?</b>", "Online?"],
      ["[Abends?](https://x.de)", "Abends?"],
    ])
      expect(followUpText(raw)).toBe(clean);
    // nur Satzzeichen/Striche/Leerraum = leer
    for (const raw of ["-", "–", "—", "•", "·", "*", "...", " - – ", "", 3])
      expect(followUpText(raw)).toBe("");
  });

  it("Endzeile: erstes ]] am Zeilenende -> immer entfernt, bis zu 3 gültige Einträge", () => {
    const split = (line) => splitFollowUpsLine(`${BODY}\n\n${line}\n`);
    expect(split(LINE)).toEqual({ text: BODY, followUps: FU });
    // Review-Beispiel: führender Strich, URL vor dem Text
    expect(
      split(
        "[[FRAGEN: - Wie melde ich mich an? | https://www.vhs.de/anmeldung Was kostet der Kurs?]]",
      ).followUps,
    ).toEqual(["Wie melde ich mich an?", "Was kostet der Kurs?"]);
    expect(
      split("[[FRAGEN: Gibt es den *Kurs* auch abends?]]").followUps,
    ).toEqual(["Gibt es den Kurs auch abends?"]);
    // zu lange Einträge verworfen (nicht die Zeile), mehr als 3 -> die ersten 3
    expect(split(`[[FRAGEN: a? | ${"x".repeat(61)} | b?]]`).followUps).toEqual([
      "a?",
      "b?",
    ]);
    expect(split("[[FRAGEN: a? | b? | – | c? | d?]]").followUps).toEqual([
      "a?",
      "b?",
      "c?",
    ]);
    // 0 gültige Einträge: Zeile weg, keine Vorschläge
    for (const line of [
      "[[FRAGEN: -]]",
      "[[FRAGEN: –]]",
      "[[FRAGEN: ]]",
      "[[fragen: — | · | *]]",
      `[[FRAGEN: ${"x".repeat(61)}]]`,
    ])
      expect(split(line)).toEqual({ text: BODY, followUps: [] });
  });

  it("Endzeile kaputt -> Text unverändert (zwei Gruppen, Text dahinter, offen, > 300 Zeichen)", () => {
    for (const text of [
      `${BODY}\n[[FRAGEN: a? | b?]] [[FRAGEN: c?]]`,
      `${BODY}\n[[FRAGEN: Gibt es [[B1]]-Kurse?]]`,
      `${BODY}\n[[FRAGEN: ${"Frage ".repeat(60)}]]`,
      `${BODY}\n${LINE}\nNoch ein Satz.`,
      `${BODY}\n[[FRAGEN: a? | b?`,
      `${BODY} ${LINE}`,
      BODY,
    ])
      expect(splitFollowUpsLine(text)).toEqual({ text, followUps: null });
  });

  it("Stream: begonnene Endzeile zurückgehalten, sonst durchgereicht", () => {
    for (const tail of ["[", "[[", "[[F", "[[FRAG", LINE.slice(0, 20), LINE])
      expect(holdFollowUpsLine(`${BODY}\n${tail}`)).toEqual({
        text: BODY,
        hold: `\n${tail}`,
      });
    for (const text of [
      `${BODY}\n[Kursseite](https://x.de)`,
      `${BODY}\n${LINE} und mehr`,
      `${BODY}\n[[FRAGEN: ${"x".repeat(300)}`,
      `${BODY}\n[[KARTEN: 1]]`,
      BODY,
      "",
    ])
      expect(holdFollowUpsLine(text)).toEqual({ text });
  });
});

// ---------------------------------------------------------------------------
describe("handleChat: Chunk followUps", () => {
  function stream(chunks) {
    const hist = [];
    let shown = [];
    const set = (h) => (shown = h);
    for (const c of chunks) handleChat(c, vi.fn(), set, [], hist);
    return shown;
  }

  it("Text -> followUps -> finalize: Vorschläge an der Antwort (geprüft erst beim Anzeigen), Text unverändert", () => {
    const raw = [...FU, "x".repeat(61)];
    const shown = stream([
      { uuid: "u", type: "textResponseChunk", textResponse: BODY },
      { uuid: "u", type: "textResponseChunk", textResponse: "", close: true },
      { uuid: "u", type: "followUps", followUps: raw },
      { uuid: "u", type: "finalizeResponseStream", chatId: 9 },
    ]);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({
      content: BODY,
      followUps: raw,
      chatId: 9,
    });
    expect(shown[0].followUpsArrivedAt).toEqual(expect.any(Number));
  });

  it("followUps ohne Antwort bzw. leer: ignoriert", () => {
    const shown = stream([
      { uuid: "x", type: "followUps", followUps: FU },
      { uuid: "u", type: "textResponseChunk", textResponse: BODY, close: true },
      { uuid: "u", type: "followUps", followUps: [] },
    ]);
    expect(shown[0]).not.toHaveProperty("followUps");
  });

  it("NAK-3/Übergang: Endzeile älterer Server nie im Text, als Vorschläge übernommen", () => {
    const shown = stream([
      { uuid: "u", type: "textResponseChunk", textResponse: `${BODY}\n` },
      { uuid: "u", type: "textResponseChunk", textResponse: LINE },
      { uuid: "u", type: "textResponseChunk", textResponse: "", close: true },
    ]);
    expect(shown[0].content).toBe(BODY);
    expect(shown[0].followUps).toEqual(FU);
    const full = stream([
      {
        uuid: "v",
        type: "textResponse",
        textResponse: `${BODY}\n${LINE}`,
        close: true,
      },
    ]);
    expect(full[0].content).toBe(BODY);
    expect(full[0].followUps).toEqual(FU);
  });

  it("Befund 2: tokenweises Streamen (älterer Server) zeigt nie [[FRAGEN", () => {
    for (const size of [1, 2, 3, 7]) {
      const text = `${BODY}\n\n${LINE}\n`;
      const hist = [];
      const seen = [];
      const set = (h) => seen.push(h[h.length - 1]);
      for (let i = 0; i < text.length; i += size)
        handleChat(
          {
            uuid: "u",
            type: "textResponseChunk",
            textResponse: text.slice(i, i + size),
          },
          vi.fn(),
          set,
          [],
          hist,
        );
      handleChat(
        { uuid: "u", type: "textResponseChunk", textResponse: "", close: true },
        vi.fn(),
        set,
        [],
        hist,
      );
      for (const e of seen) expect(e.content).not.toContain("[");
      const end = seen[seen.length - 1];
      expect(end).toMatchObject({ content: BODY, followUps: FU, closed: true });
      expect(end.followUpsHold).toBeUndefined();
    }
  });

  it("Befund 2: keine Endzeile -> zurückgehaltener Text kommt vollständig zurück", () => {
    const run = (chunks) => {
      const hist = [];
      let last;
      for (const c of chunks)
        handleChat(
          { uuid: "u", ...c },
          vi.fn(),
          (h) => (last = h[h.length - 1]),
          [],
          hist,
        );
      return last;
    };
    const tail = "[[FRAGEN: a?]] und mehr Text.";
    let e = run([
      { type: "textResponseChunk", textResponse: `${BODY}\n[[FRA` },
    ]);
    expect(e.content).toBe(BODY);
    e = run([
      { type: "textResponseChunk", textResponse: `${BODY}\n[[FRA` },
      { type: "textResponseChunk", textResponse: tail.slice(5) },
    ]);
    expect(e.content).toBe(`${BODY}\n${tail}`);
    // 300-Zeichen-Grenze ohne "]]": Zeile ist Text, schon vor dem Ende
    const long = `[[FRAGEN: ${"x".repeat(300)}`;
    e = run([{ type: "textResponseChunk", textResponse: `${BODY}\n${long}` }]);
    expect(e.content).toBe(`${BODY}\n${long}`);
    // Endzeile mit Text dahinter, dann Abschluss: alles Text
    e = run([
      { type: "textResponseChunk", textResponse: `${BODY}\n${LINE}` },
      {
        type: "textResponseChunk",
        textResponse: "\nNoch ein Satz.",
        close: true,
      },
    ]);
    expect(e.content).toBe(`${BODY}\n${LINE}\nNoch ein Satz.`);
    expect(e).not.toHaveProperty("followUps");
    // Antwort nur aus der begonnenen Zeile: wartend statt leerer Blase
    e = run([{ type: "textResponseChunk", textResponse: "[[FRAG" }]);
    expect(e).toMatchObject({ content: "", pending: true });
  });
});

// ---------------------------------------------------------------------------
describe("ChatHistory: Pillen nur unter der letzten, fertigen Antwort (AK-2, NAK-2, AK-5)", () => {
  const HISTORY = [
    user("Englisch?"),
    answer("Erste Antwort.", { followUps: ["Alt?"] }),
    user("Und B1?"),
    answer(BODY, { followUps: FU }),
  ];

  it("Verlauf: nur unter der letzten Nachricht, max. 3, Text als Text", () => {
    render(<ChatHistory settings={PILLS} history={HISTORY} />);
    expect($$("#anything-llm-follow-ups")).toHaveLength(1);
    expect(pills().map((b) => b.textContent)).toEqual(FU);
    expect(container.textContent).not.toContain("Alt?");
    // unter der letzten Antwortblase
    const bubbles = $$(".allm-anything-llm-assistant-message");
    const last = bubbles[bubbles.length - 1];
    expect(
      last.compareDocumentPosition($$("#anything-llm-follow-ups")[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('AK-5: ohne followUps "pills" keine Pillen (none/ohne Attribut)', () => {
    for (const settings of [{}, { followUps: "none" }]) {
      render(<ChatHistory settings={settings} history={HISTORY} />);
      expect(pills()).toHaveLength(0);
    }
  });

  it("NAK-2: keine Pillen während des Streamings, bei gesperrter Eingabe, unter Fehlern oder Nutzernachrichten", () => {
    const streaming = [
      ...HISTORY.slice(0, 3),
      answer(BODY, { followUps: FU, animate: true, closed: false }),
    ];
    render(<ChatHistory settings={PILLS} history={streaming} />);
    expect(pills()).toHaveLength(0);
    render(<ChatHistory settings={PILLS} history={HISTORY} canSend={false} />);
    expect(pills()).toHaveLength(0);
    render(
      <ChatHistory
        settings={PILLS}
        history={[
          ...HISTORY.slice(0, 3),
          answer(BODY, { followUps: FU, error: "x" }),
        ]}
      />,
    );
    expect(pills()).toHaveLength(0);
    render(
      <ChatHistory settings={PILLS} history={[...HISTORY, user("Weiter?")]} />,
    );
    expect(pills()).toHaveLength(0);
  });

  it("Befund 6: Liste einmal geprüft (bereinigt, ≤ 60, max. 3) durchgereicht", () => {
    render(
      <ChatHistory
        settings={PILLS}
        history={[
          user("Englisch?"),
          answer(BODY, {
            followUps: [
              " **Gibt es B1?** ",
              42,
              "x".repeat(61),
              "–",
              "b?",
              "c?",
              "d?",
            ],
          }),
        ]}
      />,
    );
    expect(pills().map((b) => b.textContent)).toEqual([
      "Gibt es B1?",
      "b?",
      "c?",
    ]);
    render(
      <ChatHistory
        settings={PILLS}
        history={[user("Englisch?"), answer(BODY, { followUps: ["–", 3] })]}
      />,
    );
    expect($$("#anything-llm-follow-ups")).toHaveLength(0);
  });

  it("Befund 5: gemeinsame Pill — Folgefragen im Akzent mit Umbruch, Panel-Pillen neutral mit …", () => {
    render(<ChatHistory settings={PILLS} history={HISTORY} />);
    for (const b of pills()) {
      expect(b.className).toContain("allm-inline-chip");
      expect(b.style.color).toContain("--allmi-accent");
      expect(b.style.border).toContain("--allmi-accent");
      expect(b.style.wordBreak).toBe("break-word");
      expect(b.style.textOverflow).toBe("");
    }
    render(
      <SuggestedPills
        settings={{ suggestionStyle: "pills", defaultMessages: ["Kurse?"] }}
      />,
    );
    const [p] = $$("#anything-llm-suggestion-pills button");
    expect(p.className).toContain("allm-inline-chip");
    expect(p.style.border).toContain("--allmi-pill-border");
    expect(p.style.color).toContain("--allmi-bar-text");
    expect(p.style.textOverflow).toBe("ellipsis");
    expect(p.style.whiteSpace).toBe("nowrap");
  });

  it("AK-1: Hover/Fokus füllt im Akzent, Text weiß — Klasse nur an Folgefragen-Pillen, Regel im Widget-CSS", async () => {
    render(<ChatHistory settings={PILLS} history={HISTORY} />);
    for (const b of pills())
      expect(b.className.split(" ")).toEqual(
        expect.arrayContaining(["allm-inline-chip", "allm-pill-accent"]),
      );
    render(
      <SuggestedPills
        settings={{ suggestionStyle: "pills", defaultMessages: ["Kurse?"] }}
      />,
    );
    expect(
      $$("#anything-llm-suggestion-pills button")[0].className,
    ).not.toContain("allm-pill-accent");
    // CSS-Regel (main.jsx, customCss im Shadow DOM): Hover + Tastaturfokus
    // Hintergrund/Rand Akzent, Text weiß, Übergang --allmi-transition,
    // Fokusring sichtbar
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/src/main.jsx`, "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(css).toContain(
      ".allm-pill-accent:hover, .allm-pill-accent:focus-visible { background-color: var(--allmi-accent, #01a5a9) !important; border-color: var(--allmi-accent, #01a5a9) !important; color: ${ON_ACCENT_TEXT} !important; }",
    );
    // Textfarbe aus utils/theme.js (ON_ACCENT_TEXT, weiß), nicht fest
    const { ON_ACCENT_TEXT } = await import("../src/utils/theme.js");
    expect(ON_ACCENT_TEXT).toBe("#FFFFFF");
    expect(css).toContain(
      'import { ON_ACCENT_TEXT, THEME_STYLE_ID } from "./utils/theme.js";',
    );
    expect(css).toMatch(
      /\.allm-inline-chip\.allm-pill-accent \{ transition: background-color var\(--allmi-transition, 200ms\)[^}]*color var\(--allmi-transition, 200ms\)/,
    );
    expect(css).toContain(
      ".allm-pill-accent:focus-visible { outline: var(--allmi-focus-ring, 2px solid var(--allmi-accent, #01a5a9)) !important;",
    );
  });

  it("Kurskarten oben: Pillen ebenfalls unter der letzten Antwort", () => {
    render(
      <ChatHistory
        settings={{
          ...PILLS,
          courseCards: "auto",
          courseCardsPosition: "above",
        }}
        history={HISTORY}
      />,
    );
    expect(pills().map((b) => b.textContent)).toEqual(FU);
  });
});

// ---------------------------------------------------------------------------
describe("Befund 3: Kurskarten oben — Pillen ins Bild scrollen", () => {
  const ABOVE = { ...PILLS, courseCards: "auto", courseCardsPosition: "above" };
  const streaming = [
    user("Englisch?"),
    answer(BODY, { animate: true, closed: false }),
  ];
  const done = (extra = {}) => [
    user("Englisch?"),
    answer(BODY, { followUps: FU, followUpsArrivedAt: 1, ...extra }),
  ];
  const smooth = (spy) =>
    spy.mock.calls.filter(([o]) => o && o.behavior === "smooth");

  it("Chunk followUps kommt, Nutzer hat nicht gescrollt -> sanft ans Ende", () => {
    const spy = vi.spyOn(Element.prototype, "scrollTo");
    render(<ChatHistory settings={ABOVE} history={streaming} />);
    expect(smooth(spy)).toHaveLength(0);
    render(<ChatHistory settings={ABOVE} history={done()} />);
    expect(pills()).toHaveLength(2);
    expect(smooth(spy)).toHaveLength(1);
    // weitere Chunks (finalize) scrollen nicht erneut
    render(<ChatHistory settings={ABOVE} history={done({ chatId: 8 })} />);
    expect(smooth(spy)).toHaveLength(1);
  });

  it("Nutzer hat seit Beginn der Antwort gescrollt -> nichts", () => {
    const spy = vi.spyOn(Element.prototype, "scrollTo");
    render(<ChatHistory settings={ABOVE} history={streaming} />);
    act(() => {
      container
        .querySelector("#chat-history")
        .dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    });
    render(<ChatHistory settings={ABOVE} history={done()} />);
    expect(pills()).toHaveLength(2);
    expect(smooth(spy)).toHaveLength(0);
  });

  it("Verlauf geladen (ohne Ankunftszeit), Karten unten oder ohne Pillen -> nichts", () => {
    const spy = vi.spyOn(Element.prototype, "scrollTo");
    render(
      <ChatHistory
        settings={ABOVE}
        history={done({ followUpsArrivedAt: undefined })}
      />,
    );
    render(<ChatHistory settings={PILLS} history={done()} />);
    render(
      <ChatHistory
        settings={{ ...ABOVE, followUps: "none" }}
        history={done()}
      />,
    );
    expect(smooth(spy)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("ChatContainer: Klick sendet genau eine Anfrage (AK-2)", () => {
  const settings = { ...BASE, ...PILLS };
  const HISTORY = [user("Englisch?"), answer(BODY, { followUps: FU })];

  it("Klick -> eine Anfrage mit dem Text, Pillen weg, Verlauf bleibt", async () => {
    render(
      <ChatContainer
        sessionId="s"
        settings={settings}
        knownHistory={HISTORY}
      />,
    );
    expect(pills()).toHaveLength(2);
    const [first] = pills();
    await act(async () => {
      first.click();
      first.click(); // Doppelklick: nichts Zusätzliches
    });
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(chatService.streamChat.mock.calls[0][2]).toBe(FU[0]);
    expect(pills()).toHaveLength(0);
    // Verlauf bleibt (aktueller Verlauf, nicht der beim Einhängen)
    const texts = $$(".allm-anything-llm-user-message").map((n) =>
      n.textContent.trim(),
    );
    expect(texts).toEqual(["Englisch?", FU[0]]);
  });

  it("Folgefragen nach einer gestreamten Antwort: Pillen erscheinen erst nach dem Text, Klick sendet mit vollem Verlauf", async () => {
    let handler;
    chatService.streamChat.mockImplementation(
      (_s, _set, _msg, onChunk) =>
        new Promise((resolve) => {
          handler = (c) => onChunk(c);
          handler.resolve = resolve;
        }),
    );
    render(
      <ChatContainer sessionId="s" settings={settings} knownHistory={[]} />,
    );
    // erste Frage über das Sende-Ereignis (wie ein Vorschlag)
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("anythingllm-embed-send-prompt", {
          detail: { command: "Englisch?" },
        }),
      );
    });
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    await act(async () => {
      handler({ uuid: "u", type: "textResponseChunk", textResponse: BODY });
    });
    expect(pills()).toHaveLength(0); // streamt noch
    await act(async () => {
      handler({
        uuid: "u",
        type: "textResponseChunk",
        textResponse: "",
        close: true,
      });
      handler({ uuid: "u", type: "followUps", followUps: FU });
      handler({ uuid: "u", type: "finalizeResponseStream", chatId: 3 });
      handler.resolve();
    });
    expect(pills().map((b) => b.textContent)).toEqual(FU);
    await act(async () => pills()[1].click());
    expect(chatService.streamChat).toHaveBeenCalledTimes(2);
    expect(chatService.streamChat.mock.calls[1][2]).toBe(FU[1]);
    const texts = $$(".allm-anything-llm-user-message").map((n) =>
      n.textContent.trim(),
    );
    expect(texts).toEqual(["Englisch?", FU[1]]);
    expect(container.textContent).not.toContain("FRAGEN");
  });
});

// ---------------------------------------------------------------------------
describe("Verlauf laden (embedSessionHistory)", () => {
  const history = [
    { role: "user", content: "Englisch?" },
    {
      role: "assistant",
      content: "Antwort eins.",
      followUps: [" **Gibt es B1-Kurse?** ", 3, "x".repeat(61)],
    },
    { role: "user", content: "Und B1?" },
    { role: "assistant", content: `${BODY}\n${LINE}` },
  ];
  async function load(settings) {
    const { default: realService } = await vi.importActual(
      "../src/models/chatService.js",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ history }),
    });
    return realService.embedSessionHistory(settings, "s", "c");
  }

  it("pills: followUps vom Server übernommen; Endzeile älterer Server abgetrennt", async () => {
    const loaded = await load({ ...BASE, ...PILLS });
    expect(loaded[1].followUps).toEqual(history[1].followUps);
    expect(loaded[3].content).toBe(BODY);
    expect(loaded[3].textResponse).toBe(BODY);
    expect(loaded[3].followUps).toEqual(FU);
    expect(loaded[0]).not.toHaveProperty("followUps");
    expect(JSON.stringify(loaded)).not.toContain("FRAGEN");
    expect(loaded[3]).not.toHaveProperty("followUpsArrivedAt");
    // angezeigt: geprüft, nur unter der letzten Antwort
    render(<ChatHistory settings={PILLS} history={loaded} />);
    expect(pills().map((b) => b.textContent)).toEqual(FU);
  });

  it("none (Standard): /history liefert followUps trotzdem -> verworfen, Endzeile trotzdem weg", async () => {
    for (const settings of [BASE, { ...BASE, followUps: "none" }]) {
      const loaded = await load(settings);
      expect(loaded.some((m) => "followUps" in m)).toBe(false);
      expect(loaded[3].content).toBe(BODY);
      expect(JSON.stringify(loaded)).not.toContain("FRAGEN");
    }
  });
});
