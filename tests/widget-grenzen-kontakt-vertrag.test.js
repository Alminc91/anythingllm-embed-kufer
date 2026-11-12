import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Vertrag Server und Widget für die Grenzen des Widgets
// (issues/widget-grenzen-kontakt.md, AK-11, AK-16, NAK-3, NAK-4, §11 E5):
// tests/fixtures/embedChatLimitContract.json. Hier die Widget-Seite:
// 429-Antwort des Servers -> ChatService.streamChat (echtes
// fetch-event-source, fetch gemockt) -> handleChat -> Nachricht im Verlauf
// mit errorCode; andere Fehler ohne errorCode; supportEmail aus /config
// ohne Standard. Mit KUFER_FORK_DIR (Checkout des Forks) zusätzlich die
// Gegenprobe: wortgleiche Fixture-Kopie im Fork und beide Kennungen in
// server/utils/middleware/embedMiddleware.js. Ohne die Variable übersprungen
// (wie tests/embed-config-contract.test.js).
// Neue Funktionen (src/utils/chatLimits.js) werden je Test dynamisch
// geladen: Am alten Stand scheitert dann der einzelne Test an seiner
// Prüfung, nicht die ganze Datei am Import.

vi.mock("../src/main.jsx", () => ({
  embedderSettings: {
    settings: {},
    USER_STYLES: {},
    ASSISTANT_STYLES: {},
    shadowRoot: null,
    hostElement: null,
  },
  inlineTailwindStyles: () => Promise.resolve(false),
}));

import ChatService from "../src/models/chatService.js";
import handleChat from "../src/utils/chat/index.js";
import {
  DEFAULT_SETTINGS,
  loadEmbedSettings,
} from "../src/hooks/useScriptAttributes.js";

const FIXTURE = join(__dirname, "fixtures", "embedChatLimitContract.json");
const contract = JSON.parse(readFileSync(FIXTURE, "utf8"));
const CODES = [contract.errorCodes.session, contract.errorCodes.daily];
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const LIMITS_PATH = "../src/utils/chatLimits.js";
const limits = () => import(/* @vite-ignore */ LIMITS_PATH);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Antwort des Servers wie fetch sie liefert: Fehler mit JSON-Körper (body
// null = kein JSON), Erfolg als SSE-Stream mit den Chunks
function errorResponse(status, body) {
  return {
    ok: false,
    status,
    headers: { get: () => "application/json" },
    json: async () => {
      if (body === null) throw new SyntaxError("Unexpected token <");
      return structuredClone(body);
    },
  };
}
function streamResponse(chunks) {
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("");
  return {
    ok: true,
    status: 200,
    headers: { get: () => "text/event-stream" },
    body: new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(text));
        ctrl.close();
      },
    }),
  };
}

// Eine Frage senden wie ChatContainer (eigenes AbortSignal, Verlauf mit der
// Frage und der wartenden Antwort) und den Verlauf nach dem Ende liefern
async function ask(fetchImpl, { signal = true } = {}) {
  const fetchFn = vi.fn(fetchImpl);
  vi.stubGlobal("fetch", fetchFn);
  window.fetch = fetchFn;
  const question = {
    content: "Gibt es Yogakurse?",
    role: "user",
    userMessage: "Gibt es Yogakurse?",
  };
  const remHistory = [question];
  const _chatHistory = [...remHistory];
  const states = [];
  const results = [];
  const setChatHistory = (h) => states.push(h);
  const setLoading = vi.fn();
  const controller = new AbortController();
  let rejected = null;
  await ChatService.streamChat(
    "s-1",
    BASE,
    question.userMessage,
    (chatResult) => {
      results.push(chatResult);
      handleChat(chatResult, setLoading, setChatHistory, remHistory, _chatHistory);
    },
    "c-1",
    signal ? controller.signal : null,
  ).catch((e) => {
    rejected = e;
  });
  const last = states[states.length - 1] || [];
  return {
    fetchFn,
    results,
    states,
    message: last[last.length - 1],
    rejected,
    setLoading,
  };
}

describe("Vertrag Grenzen: Fixture (AK-11)", () => {
  it("Kennungen wörtlich, Grenzen mit 429 und den Feldern von heute plus errorCode", () => {
    expect(CODES).toEqual(["session_limit", "daily_limit"]);
    expect(contract.limitResponses.map((c) => c.body.errorCode)).toEqual(
      CODES,
    );
    for (const c of contract.limitResponses) {
      expect(c.status, c.name).toBe(429);
      expect(c.notice, c.name).toBe(c.body.errorCode);
      expect(c.body, c.name).toMatchObject({
        type: "abort",
        textResponse: null,
        sources: [],
        close: true,
      });
      expect(typeof c.body.id, c.name).toBe("string");
      expect(typeof c.body.error, c.name).toBe("string");
    }
    expect(contract.limitResponses.map((c) => c.limit)).toEqual([
      "max_chats_per_session",
      "max_chats_per_day",
    ]);
  });

  it("andere Fehler des Servers tragen keine Kennung der Grenzen (Vertrag 5)", () => {
    const forkCases = [
      ...contract.otherErrors,
      ...contract.streamErrors.map((c) => ({ ...c, body: c.chunk })),
    ].filter((c) => c.fork !== false);
    expect(forkCases.length).toBeGreaterThanOrEqual(3);
    for (const c of forkCases) {
      expect(CODES, c.name).not.toContain(c.body?.errorCode);
      expect(c.notice, c.name).toBe("technical");
    }
  });

  it("Texte de und en: Kontaktsatz am Ende ohne Punkt, keine Gedankenstriche, Sie-Form", () => {
    for (const lang of ["de", "en"])
      for (const kind of [...CODES, "technical"]) {
        const t = contract.texts[lang][kind];
        expect(t.withEmail.endsWith(": <E-Mail>"), `${lang} ${kind}`).toBe(
          true,
        );
        expect(t.withEmail.startsWith(`${t.withoutEmail} `)).toBe(true);
        expect(`${t.withEmail}${t.withoutEmail}`).not.toMatch(/[–—]/);
        expect(t.withoutEmail).not.toMatch(/kufer/i);
        if (lang === "de") expect(t.withEmail).not.toMatch(/\b(du|dich|dir|dein)\b/i);
      }
  });
});

describe("Vertrag Grenzen: Kennung und E-Mail-Prüfung (chatLimits)", () => {
  it("limitErrorCode: nur die beiden Kennungen wörtlich", async () => {
    const { LIMIT_ERROR_CODES, limitErrorCode } = await limits();
    expect(LIMIT_ERROR_CODES).toEqual(CODES);
    for (const code of CODES) expect(limitErrorCode(code)).toBe(code);
    for (const other of [
      undefined,
      null,
      "",
      "rate_limit",
      "SESSION_LIMIT",
      " session_limit",
      ["session_limit"],
      { code: "daily_limit" },
      42,
    ])
      expect(limitErrorCode(other), JSON.stringify(other)).toBeNull();
  });

  it("supportEmailValue: gültige Adressen (getrimmt), sonst null (NAK-3)", async () => {
    const { supportEmailValue } = await limits();
    for (const [input, output] of contract.supportEmailValues.valid)
      expect(supportEmailValue(input), JSON.stringify(input)).toBe(output);
    for (const input of contract.supportEmailValues.invalid)
      expect(supportEmailValue(input), JSON.stringify(input)).toBeNull();
    for (const other of [undefined, null, 42, ["info@vhs.de"], {}])
      expect(supportEmailValue(other)).toBeNull();
    expect(supportEmailValue(`${"a".repeat(250)}@vhs.de`)).toBeNull();
  });
});

describe("Vertrag Grenzen: 429 -> streamChat -> handleChat -> Nachricht (AK-11)", () => {
  it.each(contract.limitResponses.map((c) => [c.name, c]))(
    "%s: errorCode in der Nachricht, eine einzige Fehlerblase",
    async (_name, c) => {
      const { noticeKind } = await limits();
      const r = await ask(async () => errorResponse(c.status, c.body));
      expect(r.fetchFn).toHaveBeenCalledTimes(1);
      expect(r.fetchFn.mock.calls[0][0]).toBe(
        `${BASE.baseApiUrl}/${BASE.embedId}/stream-chat`,
      );
      // genau einmal an handleChat: die zweite, technische Meldung aus
      // onerror überschrieb bisher die Antwort des Servers
      expect(r.results).toHaveLength(1);
      expect(r.results[0].errorCode).toBe(c.notice);
      expect(r.message).toMatchObject({
        role: "assistant",
        closed: true,
        error: c.body.error,
        errorCode: c.notice,
      });
      expect(noticeKind(r.message)).toBe(c.notice);
      expect(r.setLoading).toHaveBeenLastCalledWith(false);
    },
  );

  it("ohne eigenes Signal (Rückfall-Controller) ebenso", async () => {
    const c = contract.limitResponses[0];
    const r = await ask(async () => errorResponse(c.status, c.body), {
      signal: false,
    });
    expect(r.results).toHaveLength(1);
    expect(r.message.errorCode).toBe(c.notice);
  });

  it.each(contract.otherErrors.map((c) => [c.name, c]))(
    "%s: technischer Text, kein errorCode (NAK-4)",
    async (_name, c) => {
      const { noticeKind } = await limits();
      const r = await ask(async () => errorResponse(c.status, c.body));
      expect(r.results).toHaveLength(1);
      expect(r.message.error).toBeTruthy();
      expect(r.message).not.toHaveProperty("errorCode");
      expect(noticeKind(r.message)).toBe("technical");
    },
  );

  it("Netzfehler: technischer Text, kein errorCode (NAK-4)", async () => {
    const { noticeKind } = await limits();
    const r = await ask(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r.results).toHaveLength(1);
    expect(r.message.error).toMatch(/Failed to fetch/);
    expect(r.message).not.toHaveProperty("errorCode");
    expect(noticeKind(r.message)).toBe("technical");
  });

  it.each(contract.streamErrors.map((c) => [c.name, c]))(
    "%s: technischer Text, kein errorCode (NAK-4)",
    async (_name, c) => {
      const { noticeKind } = await limits();
      const r = await ask(async () => streamResponse([c.chunk]));
      expect(r.results).toHaveLength(1);
      expect(r.results[0]).not.toHaveProperty("errorCode");
      expect(r.message.error).toBe(c.chunk.error);
      expect(r.message).not.toHaveProperty("errorCode");
      expect(noticeKind(r.message)).toBe("technical");
    },
  );

  it("handleChat übernimmt nur die beiden Kennungen in die Nachricht", async () => {
    const run = (extra) => {
      const states = [];
      const hist = [];
      handleChat(
        {
          type: "abort",
          textResponse: null,
          sources: [],
          close: true,
          error: "x",
          ...extra,
        },
        () => {},
        (h) => states.push(h),
        [],
        hist,
      );
      return { state: states[0][0], pushed: hist[0] };
    };
    for (const code of CODES) {
      const { state, pushed } = run({ errorCode: code });
      expect(state.errorCode).toBe(code);
      expect(pushed.errorCode).toBe(code);
    }
    const { state } = run({ errorCode: "rate_limit" });
    expect(state).not.toHaveProperty("errorCode");
    const { noticeKind } = await limits();
    expect(noticeKind(state)).toBe("technical");
  });
});

describe("Vertrag Grenzen: supportEmail aus /config ohne Standard (AK-16)", () => {
  const fetchJson = (config) =>
    vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));

  it("Standard des Widgets ist leer", () => {
    expect(DEFAULT_SETTINGS.supportEmail).toBe("");
  });

  it.each(contract.supportEmailConfig.map((c) => [c.name, c]))(
    "%s",
    async (_name, c) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const config = {
        ...(c.config || {}),
      };
      const s = await loadEmbedSettings(
        { ...BASE, ...(c.script || {}) },
        fetchJson(config),
      );
      expect(s.supportEmail).toBe(c.widget);
    },
  );

  it("ungültige gespeicherte Adresse gilt als nicht gesetzt (leer, kein Link)", async () => {
    for (const input of ["kontakt(at)vhs.de", "info@vhs.de, kurse@vhs.de"]) {
      const s = await loadEmbedSettings(
        BASE,
        fetchJson({ supportEmail: input }),
      );
      expect(s.supportEmail, input).toBe("");
    }
    const s = await loadEmbedSettings(
      BASE,
      fetchJson({ supportEmail: "  info@vhs-beispiel.de " }),
    );
    expect(s.supportEmail).toBe("info@vhs-beispiel.de");
  });
});

// Gegenprobe gegen den Fork (KUFER_FORK_DIR)
const forkDir = process.env.KUFER_FORK_DIR;
const describeFork = forkDir ? describe : describe.skip;
if (!forkDir)
  console.info(
    "[widget-grenzen-kontakt-vertrag] KUFER_FORK_DIR nicht gesetzt: Gegenprobe gegen den Fork übersprungen (2 Tests). Im rc-Build mit gesetzter Variable laufen lassen.",
  );
describeFork(
  forkDir
    ? "Vertrag Grenzen: Gegenprobe gegen den Fork (KUFER_FORK_DIR)"
    : "Vertrag Grenzen: Gegenprobe gegen den Fork (übersprungen: KUFER_FORK_DIR nicht gesetzt)",
  () => {
    it("Fixture-Kopie im Fork wortgleich", () => {
      const copy = join(
        forkDir,
        "server/__tests__/utils/chats/fixtures/embedChatLimitContract.json",
      );
      expect(existsSync(copy), `Fixture-Kopie im Fork fehlt: ${copy}`).toBe(
        true,
      );
      expect(JSON.parse(readFileSync(copy, "utf8"))).toEqual(contract);
    });

    it("beide Kennungen als Text in der Middleware des Forks", () => {
      const src = readFileSync(
        join(forkDir, "server/utils/middleware/embedMiddleware.js"),
        "utf8",
      );
      for (const code of CODES)
        expect(src, code).toMatch(new RegExp(`["'\`]${code}["'\`]`));
    });
  },
);
