import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Inline-Eingabe-Leiste, Variante C (inlineResumeHint): Chip „Unterhaltung
// fortsetzen (n)“ + „Neu starten“ + eigener Platzhalter, wenn die Konversation
// Nachrichten hat. Echte ChatService-/useConversationId-/ChatWindow-Pfade,
// nur fetch und die Nachrichtenliste sind ersetzt. Dazu AK-10 (visual_config
// aller drei Varianten). Browser: tests/visual/inline_input.py (ii-resume-hint).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
vi.mock("@/components/ChatWindow/ChatContainer/ChatHistory", () => ({
  default: ({ history }) => (
    <ol id="history">
      {history.map((m, i) => (
        <li key={i} data-role={m.role}>
          {m.content}
        </li>
      ))}
    </ol>
  ),
  ChatHistoryLoading: () => <div id="history-loading" />,
  ScrollArrowSlotContext: { Provider: ({ children }) => children },
}));

import { embedderSettings } from "../src/main.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import useConversationId from "../src/hooks/useConversationId.js";
import ChatService from "../src/models/chatService.js";
import {
  DEFAULT_INLINE_RESUME_PLACEHOLDER,
  resumeHintEnabled,
} from "../src/utils/layout.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const CONV_KEY = `allm_${BASE.embedId}_conversation_id`;
const SENT_AT = 1759651200; // 05.10.2025 10:00 Uhr (Europe/Berlin)
// Verlauf mit Quellen samt Text (dürfte der Server nach Hotfix #32 nicht
// liefern) — der Hinweis darf davon nichts verwenden
const HISTORY_4 = [
  { role: "user", content: "Gibt es Yoga?", sentAt: SENT_AT },
  {
    role: "assistant",
    content: "Ja, am Abend.",
    sentAt: SENT_AT + 5,
    sources: [{ title: "yoga.pdf", text: "GEHEIMER KONTEXT" }],
  },
  { role: "user", content: "Und Töpfern?", sentAt: SENT_AT + 60 },
  {
    role: "assistant",
    content: "Samstags.",
    sentAt: SENT_AT + 65,
    sources: [{ title: "toepfern.pdf", text: "GEHEIMER KONTEXT" }],
  },
];

let container;
let root;
let fetchMock;
let history;
let warn;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  history = HISTORY_4;
  embedderSettings.settings = { embedId: BASE.embedId };
  localStorage.clear();
  localStorage.setItem(CONV_KEY, "c-1");
  fetchMock = vi.fn(async (url) => {
    const u = String(url);
    const json = (body) => ({ ok: true, json: async () => body });
    if (u.endsWith("/audio/status")) return json({ stt: false, tts: false });
    if (u.endsWith("/conversations")) return json({ conversations: [] });
    if (u.includes(`/${BASE.embedId}/s-1`)) return json({ history });
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flush = () => act(async () => {});
const historyCalls = () =>
  fetchMock.mock.calls
    .map(([u]) => String(u))
    .filter((u) => u.includes(`/${BASE.embedId}/s-1`) && !u.endsWith("s"));

function click(el) {
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function Harness({ settings, mountTarget }) {
  const {
    conversationId,
    newConversation,
    switchConversation,
    justCreatedRef,
  } = useConversationId("s-1");
  return (
    <InlineChat
      settings={settings}
      mountTarget={mountTarget}
      sessionId="s-1"
      conversationId={conversationId}
      newConversation={newConversation}
      switchConversation={switchConversation}
      justCreatedRef={justCreatedRef}
    />
  );
}

async function setup(extra = {}) {
  const mountTarget = document.createElement("div");
  document.body.appendChild(mountTarget);
  const host = document.createElement("div");
  mountTarget.appendChild(host);
  embedderSettings.hostElement = host;
  const settings = {
    ...BASE,
    loaded: true,
    displayMode: "inline",
    inlineInput: true,
    inlineResumeHint: true,
    inlineInputPlaceholder: "Stellen Sie hier Ihre Frage …",
    defaultMessages: ["Spanisch A1", "Yoga"],
    enableStt: false,
    ...extra,
  };
  act(() =>
    root.render(<Harness settings={settings} mountTarget={mountTarget} />),
  );
  await flush();
  const q = (sel) => container.querySelector(sel);
  return {
    chip: () => q("#anything-llm-inline-resume"),
    restart: () => q("#anything-llm-inline-restart"),
    input: () => q("#anything-llm-inline-input"),
    chipRow: () => q("#anything-llm-inline-chips"),
    open: () => {
      const chat = q("#anything-llm-chat");
      return !!chat && !chat.parentElement.className.includes("allm-hidden");
    },
    messages: () =>
      [...container.querySelectorAll("#history li")].map((l) => l.textContent),
    collapse: () => click(q('button[aria-label="Einklappen"]')),
  };
}

describe("Settings inlineResumeHint / inlineResumePlaceholder", () => {
  it("Standard aus, Platzhalter „Weiter fragen …“; Script-Attribut", async () => {
    const cfg = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    let s = await loadEmbedSettings({ ...BASE }, cfg);
    expect(s.inlineResumeHint).toBe(false);
    expect(s.inlineResumePlaceholder).toBe("Weiter fragen …");
    expect(DEFAULT_INLINE_RESUME_PLACEHOLDER).toBe("Weiter fragen …");
    s = await loadEmbedSettings(
      {
        ...BASE,
        inlineResumeHint: "true",
        inlineResumePlaceholder: " Weiter … ",
      },
      cfg,
    );
    expect(s.inlineResumeHint).toBe(true);
    expect(s.inlineResumePlaceholder).toBe("Weiter …");
  });

  it("AK-10: visual_config mit allen drei Varianten, ohne Script-Attribute", async () => {
    const cfg = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        inlineOpenOn: "focus",
        inlineCloseOn: "leave",
        inlineResumeHint: true,
        inlineResumePlaceholder: "Gespräch fortsetzen …",
      }),
    }));
    const s = await loadEmbedSettings({ ...BASE }, cfg);
    expect(cfg).toHaveBeenCalledWith(
      `${BASE.baseApiUrl}/${BASE.embedId}/config`,
    );
    expect(s.inlineOpenOn).toBe("focus");
    expect(s.inlineCloseOn).toBe("leave");
    expect(s.inlineResumeHint).toBe(true);
    expect(s.inlineResumePlaceholder).toBe("Gespräch fortsetzen …");
    expect(warn).not.toHaveBeenCalled();
  });

  it("Server schlägt Script-Attribut (auch false)", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineResumeHint: "true", inlineOpenOn: "focus" },
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ inlineResumeHint: false, inlineOpenOn: "submit" }),
      })),
    );
    expect(s.inlineResumeHint).toBe(false);
    expect(s.inlineOpenOn).toBe("submit");
  });

  it("nur mit Eingabe-Leiste und Verlauf (historyEnabled)", () => {
    const on = { inlineInput: true, inlineResumeHint: true };
    expect(resumeHintEnabled(on)).toBe(true);
    expect(resumeHintEnabled({ ...on, inlineInput: false })).toBe(false);
    expect(resumeHintEnabled({ ...on, historyEnabled: false })).toBe(false);
    expect(resumeHintEnabled({ ...on, historyEnabled: "false" })).toBe(false);
    expect(resumeHintEnabled({ inlineInput: true })).toBe(false);
  });
});

describe("NAK-4: Verlaufsabfrage liefert nur Anzahl und Zeitstempel", () => {
  it("Mock mit Quellen-Text -> nur { count, lastAt }", async () => {
    const summary = await ChatService.embedHistorySummary(BASE, "s-1", "c-1");
    expect(summary).toEqual({ count: 4, lastAt: SENT_AT + 65 });
    expect(Object.keys(summary)).toEqual(["count", "lastAt"]);
    expect(JSON.stringify(summary)).not.toContain("GEHEIM");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${BASE.baseApiUrl}/${BASE.embedId}/s-1?conversationId=c-1`,
    );
  });

  it("Fehler/leer -> 0, ohne Ausnahme", async () => {
    history = [];
    expect(await ChatService.embedHistorySummary(BASE, "s-1", "c-1")).toEqual({
      count: 0,
      lastAt: null,
    });
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    expect(await ChatService.embedHistorySummary(BASE, "s-1", "c-1")).toEqual({
      count: 0,
      lastAt: null,
    });
    expect(await ChatService.embedHistorySummary(BASE, "", "c-1")).toEqual({
      count: 0,
      lastAt: null,
    });
  });
});

describe("AK-8: Hinweis auf Unterhaltung", () => {
  it("Chip „Unterhaltung fortsetzen (4)“ vor den Wunschfragen, Link „Neu starten“, Platzhalter „Weiter fragen …“", async () => {
    const ui = await setup();
    expect(ui.chip().textContent).toBe("Unterhaltung fortsetzen (4)");
    expect(ui.chipRow().firstElementChild).toBe(ui.chip());
    expect(ui.chip().nextElementSibling).toBe(ui.restart());
    expect(ui.restart().textContent).toBe("Neu starten");
    expect(ui.restart().nextElementSibling.textContent).toBe("Spanisch A1");
    expect(ui.input().placeholder).toBe("Weiter fragen …");
    // Formular-Beschriftung bleibt (Landmark)
    expect(
      container
        .querySelector("#anything-llm-inline-bar")
        .getAttribute("aria-label"),
    ).toBe("Stellen Sie hier Ihre Frage …");
    // deutsches Format DD.MM.YYYY, HH:MM:SS Uhr (Ortszeit des Browsers)
    expect(ui.chip().title).toMatch(
      /^Letzte Nachricht: 0[45]\.10\.2025, \d{2}:01:05 Uhr$/,
    );
    expect(ui.chip().style.border).toContain("var(--allmi-accent");
    expect(historyCalls()).toEqual([
      `${BASE.baseApiUrl}/${BASE.embedId}/s-1?conversationId=c-1`,
    ]);
    expect(ui.open()).toBe(false);
  });

  it("Klick auf den Chip öffnet das Panel mit den 4 Nachrichten; nach dem Einklappen bleibt der Hinweis", async () => {
    const ui = await setup();
    click(ui.chip());
    expect(ui.open()).toBe(true);
    await flush();
    expect(ui.messages()).toEqual([
      "Gibt es Yoga?",
      "Ja, am Abend.",
      "Und Töpfern?",
      "Samstags.",
    ]);
    ui.collapse();
    expect(ui.open()).toBe(false);
    expect(ui.chip().textContent).toBe("Unterhaltung fortsetzen (4)");
  });

  it("eigener Platzhalter inlineResumePlaceholder", async () => {
    const ui = await setup({
      inlineResumePlaceholder: "Gespräch fortsetzen …",
    });
    expect(ui.input().placeholder).toBe("Gespräch fortsetzen …");
  });
});

describe("AK-9: Neu starten", () => {
  it("neue conversationId (localStorage), Chip weg, Standard-Platzhalter, Panel bleibt zu", async () => {
    const ui = await setup();
    expect(ui.chip()).not.toBeNull();
    const before = historyCalls().length;
    click(ui.restart());
    await flush();
    const fresh = localStorage.getItem(CONV_KEY);
    expect(fresh).not.toBe("c-1");
    expect(fresh).toMatch(/^[0-9a-f-]{36}$/);
    expect(ui.chip()).toBeNull();
    expect(ui.restart()).toBeNull();
    expect(ui.input().placeholder).toBe("Stellen Sie hier Ihre Frage …");
    expect(ui.open()).toBe(false);
    // frische Konversation: keine weitere Verlaufsabfrage
    expect(historyCalls()).toHaveLength(before);
  });

  it("nach Neu starten ist das Panel leer", async () => {
    const ui = await setup();
    click(ui.restart());
    await flush();
    act(() =>
      container
        .querySelector("#anything-llm-inline-bar")
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    await flush();
    expect(ui.open()).toBe(true);
    expect(ui.messages()).toEqual([]);
  });
});

describe("NAK-3 / NAK-5: keine Abfrage, kein Hinweis", () => {
  it("NAK-3/AK-1: ohne inlineResumeHint keine Verlaufsabfrage beim Laden, kein Chip", async () => {
    const ui = await setup({ inlineResumeHint: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ui.chip()).toBeNull();
    expect(ui.input().placeholder).toBe("Stellen Sie hier Ihre Frage …");
  });

  it("NAK-5: 0 Nachrichten -> kein Chip, kein Link", async () => {
    history = [];
    const ui = await setup();
    expect(historyCalls()).toHaveLength(1);
    expect(ui.chip()).toBeNull();
    expect(ui.restart()).toBeNull();
    expect(ui.input().placeholder).toBe("Stellen Sie hier Ihre Frage …");
  });

  it("NAK-5: historyEnabled false (auch als String) -> keine Abfrage, kein Chip", async () => {
    for (const historyEnabled of [false, "false"]) {
      const ui = await setup({ historyEnabled });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(ui.chip()).toBeNull();
      act(() => root.unmount());
      root = createRoot(container);
    }
  });

  it("ohne Eingabe-Leiste: keine Abfrage", async () => {
    await setup({ inlineInput: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
