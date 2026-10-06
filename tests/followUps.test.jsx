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
import { followUpsList, splitFollowUpsLine } from "../src/utils/courseCards.js";
import handleChat from "../src/utils/chat/index.js";
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";

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

  it("Endzeile am Antwortende abgetrennt, sonst Text unverändert", () => {
    expect(splitFollowUpsLine(`${BODY}\n\n${LINE}\n`)).toEqual({
      text: BODY,
      followUps: FU,
    });
    expect(splitFollowUpsLine(`${BODY}\n[[FRAGEN: -]]`)).toEqual({
      text: BODY,
      followUps: [],
    });
    for (const text of [
      `${BODY}\n[[FRAGEN: a? | ${"x".repeat(61)}]]`,
      `${BODY}\n[[FRAGEN: a? | b? | c? | d?]]`,
      `${BODY}\n[[FRAGEN: ${"Frage ".repeat(60)}]]`,
      `${BODY}\n${LINE}\nNoch ein Satz.`,
      `${BODY}\n[[FRAGEN: a? | b?`,
      BODY,
    ])
      expect(splitFollowUpsLine(text)).toEqual({ text, followUps: null });
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

  it("Text -> followUps -> finalize: Vorschläge an der Antwort, Text unverändert", () => {
    const shown = stream([
      { uuid: "u", type: "textResponseChunk", textResponse: BODY },
      { uuid: "u", type: "textResponseChunk", textResponse: "", close: true },
      { uuid: "u", type: "followUps", followUps: [...FU, "x".repeat(61)] },
      { uuid: "u", type: "finalizeResponseStream", chatId: 9 },
    ]);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ content: BODY, followUps: FU, chatId: 9 });
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
  it("followUps vom Server bereinigt übernommen; Endzeile älterer Server abgetrennt", async () => {
    const { default: realService } = await vi.importActual(
      "../src/models/chatService.js",
    );
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ history }),
    });
    const loaded = await realService.embedSessionHistory(BASE, "s", "c");
    expect(loaded[1].followUps).toEqual(["Gibt es B1-Kurse?"]);
    expect(loaded[3].content).toBe(BODY);
    expect(loaded[3].textResponse).toBe(BODY);
    expect(loaded[3].followUps).toEqual(FU);
    expect(loaded[0]).not.toHaveProperty("followUps");
    expect(JSON.stringify(loaded)).not.toContain("FRAGEN");
  });
});
