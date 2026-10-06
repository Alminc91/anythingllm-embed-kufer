import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Inline-Eingabe-Leiste, Variante A (inlineOpenOn "focus"): Zeiger-Klick ins
// Leisten-Feld klappt auf (Ticket-Übergabe send: false), Tab-Fokus nie.
// Echtes ChatWindow/ChatContainer/PromptInput, Backend (ChatService) und die
// Nachrichtenliste ersetzt. Browser-Prüfung: tests/visual/inline_input.py.

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
const chatService = vi.hoisted(() => ({
  streamChat: vi.fn(() => new Promise(() => {})),
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
  embedSessionHistory: vi.fn(async () => []),
  listConversations: vi.fn(async () => []),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
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
import { DEFAULT_INLINE_OPEN_ON, opensOnPointer } from "../src/utils/layout.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};

let container;
let root;
let warn;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Object.values(chatService).forEach((f) => f.mockClear());
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const flush = () => act(async () => {});

function typeInto(input, text) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  ).set;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// jsdom kennt kein PointerEvent: MouseEvent mit pointerType
function pointer(el, type, pointerType = "mouse", button = 0) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  act(() => el.dispatchEvent(ev));
}
function click(el) {
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
// Zeiger-Klick wie im Browser: pointerdown -> Fokus -> click
function pointerClick(el, pointerType = "mouse", button = 0) {
  pointer(el, "pointerdown", pointerType, button);
  act(() => el.focus());
  click(el);
}

function setup(extra = {}) {
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
    defaultMessages: ["Spanisch A1", "Yoga"],
    enableStt: false,
    ...extra,
  };
  act(() =>
    root.render(
      <InlineChat
        settings={settings}
        mountTarget={mountTarget}
        sessionId="s-1"
        conversationId="c-1"
        newConversation={vi.fn()}
        switchConversation={vi.fn()}
        justCreatedRef={{ current: false }}
      />,
    ),
  );
  return {
    input: () => container.querySelector("#anything-llm-inline-input"),
    form: () => container.querySelector("#anything-llm-inline-bar"),
    chips: () => [...container.querySelectorAll(".allm-inline-chip")],
    open: () =>
      !container.querySelector("#anything-llm-inline-bar") &&
      !!container.querySelector("#anything-llm-chat"),
    message: () => container.querySelector("#message-input"),
    collapse: () =>
      click(container.querySelector('button[aria-label="Einklappen"]')),
  };
}

describe("Settings inlineOpenOn", () => {
  it('Standard "submit"; Script-Attribut und visual_config (Vorrang Server)', async () => {
    const fetchConfig = (c) =>
      vi.fn(async () => ({ ok: true, json: async () => c }));
    let s = await loadEmbedSettings({ ...BASE }, fetchConfig({}));
    expect(s.inlineOpenOn).toBe("submit");
    expect(DEFAULT_INLINE_OPEN_ON).toBe("submit");
    s = await loadEmbedSettings(
      { ...BASE, inlineOpenOn: " Focus " },
      fetchConfig({}),
    );
    expect(s.inlineOpenOn).toBe("focus");
    s = await loadEmbedSettings(
      { ...BASE, inlineOpenOn: "focus" },
      fetchConfig({ inlineOpenOn: "submit" }),
    );
    expect(s.inlineOpenOn).toBe("submit");
    expect(warn).not.toHaveBeenCalled();
  });

  it('NAK-6: data-inline-open-on="hover" -> Standard + genau eine Warnung', async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineOpenOn: "hover" },
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    expect(s.inlineOpenOn).toBe("submit");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(
      /inlineOpenOn-Wert "hover" \(Script-Attribut\).*es gilt "submit" \(Standard\)/,
    );
  });

  it("wirkt nur mit Eingabe-Leiste", () => {
    expect(opensOnPointer({ inlineInput: true, inlineOpenOn: "focus" })).toBe(
      true,
    );
    expect(opensOnPointer({ inlineInput: false, inlineOpenOn: "focus" })).toBe(
      false,
    );
    expect(opensOnPointer({ inlineInput: true })).toBe(false);
  });
});

describe("AK-1: Standard ohne inlineOpenOn", () => {
  it("Zeiger-Klick ins Feld klappt nicht auf, Fokus bleibt im Feld", () => {
    const ui = setup();
    pointerClick(ui.input());
    expect(ui.open()).toBe(false);
    expect(document.activeElement).toBe(ui.input());
  });
});

describe('inlineOpenOn "focus"', () => {
  it("AK-2: öffnet bei Pointer-Klick (Maus): offen < 500 ms, Fokus in der Panel-Eingabe, leer", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    const t0 = performance.now();
    pointerClick(ui.input());
    expect(ui.open()).toBe(true);
    await flush(); // Verlauf geladen -> ChatContainer/PromptInput gemountet
    expect(performance.now() - t0).toBeLessThan(500);
    expect(ui.message()).not.toBeNull();
    expect(document.activeElement).toBe(ui.message());
    expect(ui.message().value).toBe("");
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  it("öffnet auch bei Touch und Stift", () => {
    for (const type of ["touch", "pen"]) {
      const ui = setup({ inlineOpenOn: "focus" });
      pointerClick(ui.input(), type);
      expect(ui.open()).toBe(true);
      act(() => root.unmount());
      root = createRoot(container);
    }
  });

  it("rechte Maustaste öffnet nicht", () => {
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.input(), "mouse", 2);
    expect(ui.open()).toBe(false);
  });

  it("AK-3: getippter Text wandert per Übergabe ins Panel, nichts gesendet", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.input()); // öffnet (leer)
    await flush();
    ui.collapse(); // wie Escape: einklappen, Fokus zurück aufs Leisten-Feld
    expect(ui.open()).toBe(false);
    expect(document.activeElement).toBe(ui.input()); // Fokus per Code öffnet nicht
    typeInto(ui.input(), "Yoga");
    expect(ui.open()).toBe(false); // Tippen öffnet nicht
    pointerClick(ui.input());
    expect(ui.open()).toBe(true);
    await flush();
    expect(ui.message().value).toBe("Yoga");
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  it("AK-4: Tastaturfokus (ohne pointerdown) öffnet nicht; Enter öffnet wie bisher", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    act(() => ui.input().focus()); // Tab
    expect(document.activeElement).toBe(ui.input());
    click(ui.input()); // click ohne Zeiger (z. B. per Script/Label)
    expect(ui.open()).toBe(false);
    typeInto(ui.input(), "Töpfern");
    act(() =>
      ui
        .form()
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(ui.open()).toBe(true);
    await flush();
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(chatService.streamChat.mock.calls[0][2]).toBe("Töpfern");
  });

  it("nur ein Öffnungspfad je Zeiger-Ereignis: ein Klick = eine Übergabe, kein Absenden", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    typeInto(ui.input(), "Spanisch");
    pointerClick(ui.input());
    await flush();
    expect(ui.message().value).toBe("Spanisch"); // nicht doppelt angehängt
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  it("Chips bleiben klickbar (senden wie bisher)", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.chips()[1]);
    expect(ui.open()).toBe(true);
    await flush();
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(chatService.streamChat.mock.calls[0][2]).toBe("Yoga");
  });
});

// Tastenübergabe (Issue embed-zeilenkarten-tasten-morph-datenschutz, AK-6):
// Zeichen ab dem Klick in die Leiste gehen nie verloren — erst ins
// Auffangfeld (Chat lädt noch), dann ins Chat-Eingabefeld; Enter sendet.
// Wie im Browser landet getipptes im jeweils fokussierten Feld.
function typeFocused(text) {
  const el = document.activeElement;
  typeInto(el, el.value + text);
  return el;
}
function enterFocused() {
  const el = document.activeElement;
  act(() =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
const sink = () => container.querySelector("#anything-llm-key-sink");

describe("::keystrokes-during-open — Tastenübergabe beim Aufklappen", () => {
  it("Fokus sofort im Auffangfeld; Zeichen vor und nach dem Laden landen vollständig im Chatfeld, Enter sendet", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.input());
    expect(ui.open()).toBe(true);
    // Chat lädt noch: kein Eingabefeld, Fokus im Auffangfeld (unsichtbar)
    expect(ui.message()).toBeNull();
    expect(document.activeElement).toBe(sink());
    expect(sink().getAttribute("aria-hidden")).toBe("true");
    expect(sink().tabIndex).toBe(-1);
    typeFocused("abc");
    await flush(); // Verlauf geladen -> PromptInput gemountet -> Übergabe
    await flush();
    expect(ui.message().value).toBe("abc");
    expect(document.activeElement).toBe(ui.message());
    expect(sink().value).toBe("");
    typeFocused("defgh");
    expect(ui.message().value).toBe("abcdefgh");
    enterFocused();
    await flush();
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(chatService.streamChat.mock.calls[0][2]).toBe("abcdefgh");
  });

  it("Enter noch vor dem Laden: genau eine Frage mit dem getippten Text", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.input());
    typeFocused("abcdefgh");
    enterFocused();
    expect(sink().value).toBe("");
    await flush();
    await flush();
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(chatService.streamChat.mock.calls[0][2]).toBe("abcdefgh");
  });

  it("Befund 2: Entwurf „Yoga“ + „ am Abend“ getippt, Enter vor dem Laden: genau eine Anfrage „Yoga am Abend“", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    typeInto(ui.input(), "Yoga");
    pointerClick(ui.input());
    expect(ui.message()).toBeNull(); // Chat lädt noch
    expect(document.activeElement).toBe(sink());
    typeFocused(" am Abend");
    enterFocused();
    expect(sink().value).toBe("");
    await flush();
    await flush();
    await flush();
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(chatService.streamChat.mock.calls[0][2]).toBe("Yoga am Abend");
    // der Entwurf landet nicht zusätzlich im Chatfeld
    expect(ui.message().value).toBe("");
  });

  it("Befund 7: Enter vor dem Laden, danach weiter getippt -> nach der Antwort steht das Neue im Chatfeld (Fokus dort), nur eine Anfrage", async () => {
    chatService.streamChat.mockImplementation(
      async (_s, _settings, _msg, handle) => {
        handle({
          uuid: "u",
          sources: [],
          type: "textResponse",
          textResponse: "Ja.",
          close: true,
        });
      },
    );
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.input());
    typeFocused("abc");
    enterFocused();
    // Fokus bleibt im (leeren) Auffangfeld, die Übergabe läuft weiter
    expect(document.activeElement).toBe(sink());
    typeFocused("xyz");
    expect(sink().value).toBe("xyz");
    await flush();
    await flush();
    await flush();
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(chatService.streamChat.mock.calls[0][2]).toBe("abc");
    expect(ui.message().disabled).toBe(false);
    expect(ui.message().value).toBe("xyz");
    expect(document.activeElement).toBe(ui.message());
    expect(sink().value).toBe("");
  });

  it("Befund 6: IME-Komposition, während der Chat lädt -> Übergabe (consumeFocusRequest) wartet bis compositionend, genau einmal", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.input());
    const s = sink();
    const blur = vi.fn();
    s.addEventListener("blur", blur);
    act(() =>
      s.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
      ),
    );
    typeFocused("ka"); // Zwischenstand der Komposition
    await flush(); // Verlauf geladen -> PromptInput gemountet
    await flush();
    expect(ui.message()).not.toBeNull();
    expect(ui.message().value).toBe("");
    expect(document.activeElement).toBe(s);
    expect(blur).not.toHaveBeenCalled();
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(s, "か");
      s.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: "か" }),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(ui.message().value).toBe("か");
    expect(document.activeElement).toBe(ui.message());
    await flush();
    expect(ui.message().value).toBe("か");
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  it("Entwurf aus der Leiste + weiter getippt: Entwurf zuerst, dann die neuen Zeichen", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    typeInto(ui.input(), "Yoga");
    pointerClick(ui.input());
    typeFocused(" am Abend");
    await flush();
    await flush();
    expect(ui.message().value).toBe("Yoga am Abend");
    expect(document.activeElement).toBe(ui.message());
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  it("zweites Öffnen (Chat schon geladen): Fokus direkt im Chatfeld", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.input());
    await flush();
    ui.collapse();
    pointerClick(ui.input());
    await flush();
    expect(document.activeElement).toBe(ui.message());
    typeFocused("xy");
    expect(ui.message().value).toBe("xy");
  });

  it("Zuklappen vor der Übergabe: aufgefangene Zeichen zurück ins Leisten-Feld, nichts gesendet", async () => {
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.input());
    typeFocused("Spa");
    expect(sink().value).toBe("Spa");
    // Einklappen-Knopf (Kopfzeile, schon während der Chat lädt)
    const btn = container.querySelector('button[aria-label="Einklappen"]');
    expect(btn).not.toBeNull();
    click(btn);
    expect(ui.open()).toBe(false);
    expect(ui.input().value).toBe("Spa");
    await flush();
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  it("Touch-Tablet (Desktop-Breite, grober Zeiger): keine Übergabe, kein Auto-Fokus (wie bisher)", async () => {
    const mm = vi.spyOn(window, "matchMedia").mockImplementation((q) => ({
      matches: q !== "(prefers-reduced-motion: reduce)",
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    const ui = setup({ inlineOpenOn: "focus" });
    pointerClick(ui.input(), "touch");
    expect(ui.open()).toBe(true);
    expect(container.querySelector("#anything-llm-chat").className).not.toContain(
      "allm-fixed",
    ); // Box, kein Vollbild
    expect(document.activeElement).not.toBe(sink());
    await flush();
    expect(document.activeElement).not.toBe(ui.message());
    mm.mockRestore();
  });
});
