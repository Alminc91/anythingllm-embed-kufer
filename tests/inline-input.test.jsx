import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";

// Inline-Leiste als Eingabefeld (inlineInput): Settings, Warnung im
// Blasen-Modus und Zustandsübergabe pendingFirstMessage Leiste -> ChatWindow
// -> ChatContainer (genau eine Sendung über den bestehenden Sende-Pfad).

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
  streamChat: vi.fn(() => new Promise(() => {})), // Antwort bleibt aus
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
// Verlauf/Antworten sind hier nicht Gegenstand -> schlanker Ersatz
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
}));
// InlineChat-Tests: ChatWindow ersetzen und die übergebenen Props mitschneiden
const chatWindowProps = vi.hoisted(() => ({ current: null, mounts: 0 }));
vi.mock("@/components/ChatWindow", async () => {
  const { useEffect } = await import("react");
  return {
    default: function ChatWindowStub(props) {
      chatWindowProps.current = props;
      useEffect(() => {
        chatWindowProps.mounts += 1;
      }, []);
      return <div id="chat-window-stub" />;
    },
  };
});

import { embedderSettings } from "../src/main.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import {
  DEFAULT_INLINE_INPUT_PLACEHOLDER,
  DEFAULT_INLINE_SEND_TEXT,
  INLINE_CHIPS_MAX,
  inlineChips,
  layoutValidations,
  warnIfInlineInputIgnored,
} from "../src/utils/layout.js";
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};

function fetchConfig(config) {
  return vi.fn(async () => ({ ok: true, json: async () => config }));
}

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  chatService.streamChat.mockClear();
  chatWindowProps.current = null;
  chatWindowProps.mounts = 0;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(el) {
  act(() => root.render(el));
}

// React-kontrolliertes Feld befüllen (wie Tippen)
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

function submit(form) {
  act(() => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

function click(el) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Settings inlineInput / inlineInputPlaceholder / inlineSendText", () => {
  it("Standard: aus, deutsche Texte", async () => {
    const s = await loadEmbedSettings({ ...BASE }, fetchConfig({}));
    expect(s.inlineInput).toBe(false);
    expect(s.inlineInputPlaceholder).toBe("Stellen Sie hier Ihre Frage …");
    expect(s.inlineSendText).toBe("Chatten");
    expect(DEFAULT_INLINE_INPUT_PLACEHOLDER).toBe(s.inlineInputPlaceholder);
    expect(DEFAULT_INLINE_SEND_TEXT).toBe(s.inlineSendText);
  });

  it('Script-Attribut data-inline-input="true" schaltet ein', async () => {
    const s = await loadEmbedSettings(
      {
        ...BASE,
        inlineInput: "true",
        inlineInputPlaceholder: "Ihre Frage?",
        inlineSendText: "Los",
      },
      fetchConfig({}),
    );
    expect(s.inlineInput).toBe(true);
    expect(s.inlineInputPlaceholder).toBe("Ihre Frage?");
    expect(s.inlineSendText).toBe("Los");
  });

  it("AK-9: visual_config.inlineInput = true ohne Script-Attribut", async () => {
    const fetchFn = fetchConfig({
      inlineInput: true,
      inlineInputPlaceholder: "Fragen Sie uns …",
      inlineSendText: "Fragen",
    });
    const s = await loadEmbedSettings({ ...BASE }, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith(
      `${BASE.baseApiUrl}/${BASE.embedId}/config`,
    );
    expect(s.inlineInput).toBe(true);
    expect(s.inlineInputPlaceholder).toBe("Fragen Sie uns …");
    expect(s.inlineSendText).toBe("Fragen");
  });

  it("Design Center (false) schlägt das Script-Attribut (Vorrangregel)", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineInput: "true" },
      fetchConfig({ inlineInput: false }),
    );
    expect(s.inlineInput).toBe(false);
  });

  it("ungültige Werte fallen auf den nächstniedrigeren Wert zurück", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineInput: "vielleicht", inlineSendText: "Absenden" },
      fetchConfig({
        inlineSendText: "x".repeat(41), // > 40 Zeichen
        inlineInputPlaceholder: "y".repeat(121), // > 120 Zeichen
      }),
    );
    expect(s.inlineInput).toBe(false);
    expect(s.inlineSendText).toBe("Absenden");
    expect(s.inlineInputPlaceholder).toBe(DEFAULT_INLINE_INPUT_PLACEHOLDER);
  });

  it("Validatoren", () => {
    expect(layoutValidations.inlineInput("true")).toBe(true);
    expect(layoutValidations.inlineInput("")).toBe(true); // Attribut ohne Wert
    expect(layoutValidations.inlineInput("off")).toBe(false);
    expect(layoutValidations.inlineInput(1)).toBeUndefined();
    expect(layoutValidations.inlineSendText("  Chatten ")).toBe("Chatten");
    expect(layoutValidations.inlineSendText("   ")).toBeUndefined();
    expect(layoutValidations.inlineInputPlaceholder(7)).toBeUndefined();
  });

  it("Chips: defaultMessages, höchstens 6, leere verworfen", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `Frage ${i + 1}`);
    expect(inlineChips({ defaultMessages: ten })).toEqual(ten.slice(0, 6));
    expect(INLINE_CHIPS_MAX).toBe(6);
    expect(
      inlineChips({ defaultMessages: [" Yoga ", "", 3, "Töpfern"] }),
    ).toEqual(["Yoga", "Töpfern"]);
    expect(inlineChips({})).toEqual([]);
  });
});

describe("NAK-3: Blasen-Modus ignoriert inlineInput mit einer Warnung", () => {
  it("warnt genau einmal in der Blase, nie im Inline-Modus", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(warnIfInlineInputIgnored({ inlineInput: true }, false)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/inlineInput.*ignoriert/);
    expect(warnIfInlineInputIgnored({ inlineInput: true }, true)).toBe(false);
    expect(warnIfInlineInputIgnored({ inlineInput: false }, false)).toBe(false);
    expect(warnIfInlineInputIgnored({}, false)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("ChatContainer verbraucht pendingFirstMessage", () => {
  const settings = { ...BASE, enableStt: false };

  function pending(value) {
    const ref = { current: value, calls: 0 };
    const consume = vi.fn(() => {
      ref.calls += 1;
      const v = ref.current;
      ref.current = null;
      return v;
    });
    return { ref, consume };
  }

  it("send: genau eine Anfrage über streamChat, inkl. conversationId", () => {
    const p = pending({ text: "Gibt es Yogakurse am Abend?", send: true });
    render(
      <StrictMode>
        <ChatContainer
          sessionId="s-1"
          conversationId="c-1"
          settings={settings}
          knownHistory={[]}
          pendingFirstMessage={{ ...p.ref.current }}
          consumePendingFirstMessage={p.consume}
        />
      </StrictMode>,
    );
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    const [sessionId, , message, , conversationId] =
      chatService.streamChat.mock.calls[0];
    expect(sessionId).toBe("s-1");
    expect(message).toBe("Gibt es Yogakurse am Abend?");
    expect(conversationId).toBe("c-1");
    const items = [...container.querySelectorAll("#history li")];
    expect(items[0].dataset.role).toBe("user");
    expect(items[0].textContent).toBe("Gibt es Yogakurse am Abend?");
    expect(p.ref.current).toBeNull();
  });

  it("Entwurf (send: false): steht im Chat-Eingabefeld, keine Anfrage", () => {
    const p = pending({ text: "Yoga am Abend", send: false });
    render(
      <ChatContainer
        sessionId="s-1"
        conversationId="c-1"
        settings={settings}
        knownHistory={[]}
        pendingFirstMessage={{ ...p.ref.current }}
        consumePendingFirstMessage={p.consume}
      />,
    );
    expect(chatService.streamChat).not.toHaveBeenCalled();
    expect(container.querySelector("#message-input").value).toBe(
      "Yoga am Abend",
    );
    expect(container.querySelectorAll("#history li")).toHaveLength(0);
  });

  it("ohne pendingFirstMessage: nichts gesendet (Bestand)", () => {
    render(
      <ChatContainer
        sessionId="s-1"
        conversationId="c-1"
        settings={settings}
        knownHistory={[]}
      />,
    );
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  it("läuft noch eine Antwort, wird die Frage erst danach gesendet", () => {
    const p = pending({ text: "Erste", send: true });
    const props = {
      sessionId: "s-1",
      conversationId: "c-1",
      settings,
      knownHistory: [],
    };
    render(
      <ChatContainer
        {...props}
        pendingFirstMessage={{ ...p.ref.current }}
        consumePendingFirstMessage={p.consume}
      />,
    );
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    // zweite Frage, während "Erste" noch läuft (Antwort bleibt aus)
    const p2 = pending({ text: "Zweite", send: true });
    render(
      <ChatContainer
        {...props}
        pendingFirstMessage={{ ...p2.ref.current }}
        consumePendingFirstMessage={p2.consume}
      />,
    );
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(p2.consume).not.toHaveBeenCalled();
  });
});

describe("InlineChat: Leiste -> pendingFirstMessage", () => {
  function setup(extra = {}) {
    const mountTarget = document.createElement("div");
    document.body.appendChild(mountTarget);
    const host = document.createElement("div");
    mountTarget.appendChild(host);
    embedderSettings.hostElement = host;
    const settings = {
      ...BASE,
      displayMode: "inline",
      inlineInput: true,
      inlineInputPlaceholder: "Stellen Sie hier Ihre Frage …",
      inlineSendText: "Chatten",
      defaultMessages: ["Spanisch A1", "Yoga", "KI-Basics", "Töpfern"],
      ...extra,
    };
    render(
      <InlineChat
        settings={settings}
        mountTarget={mountTarget}
        sessionId="s-1"
        conversationId="c-1"
      />,
    );
    return {
      form: () => container.querySelector("#anything-llm-inline-bar"),
      input: () => container.querySelector("#anything-llm-inline-input"),
      send: () => container.querySelector("#anything-llm-inline-send"),
      chips: () => [...container.querySelectorAll(".allm-inline-chip")],
    };
  }

  it("Standard ohne inlineInput: Klick-Leiste wie bisher, kein Feld, keine Chips", () => {
    setup({ inlineInput: false });
    const bar = container.querySelector("#anything-llm-inline-bar");
    expect(bar.tagName).toBe("BUTTON");
    expect(container.querySelector("input:not([aria-hidden])")).toBeNull();
    expect(container.querySelectorAll(".allm-inline-chip")).toHaveLength(0);
  });

  it("AK-2/AK-6: Feld mit Platzhalter, Knopf, 4 Chips; eingeklappt", () => {
    const ui = setup();
    expect(ui.form().tagName).toBe("FORM");
    expect(ui.input().placeholder).toBe("Stellen Sie hier Ihre Frage …");
    expect(ui.send().textContent).toBe("Chatten");
    expect(ui.chips().map((c) => c.textContent)).toEqual([
      "Spanisch A1",
      "Yoga",
      "KI-Basics",
      "Töpfern",
    ]);
    expect(container.querySelector("#chat-window-stub")).toBeNull();
  });

  it("AK-3 + NAK-1: Enter -> aufgeklappt, Frage einmal übergeben und verbraucht", () => {
    const ui = setup();
    typeInto(ui.input(), "  Gibt es Yogakurse am Abend?  ");
    submit(ui.form());
    const props = chatWindowProps.current;
    expect(props.pendingFirstMessage).toEqual({
      text: "Gibt es Yogakurse am Abend?",
      send: true,
    });
    expect(container.querySelector("#anything-llm-inline-bar")).toBeNull();
    let first;
    act(() => {
      first = props.consumePendingFirstMessage();
    });
    expect(first).toEqual({ text: "Gibt es Yogakurse am Abend?", send: true });
    expect(props.consumePendingFirstMessage()).toBeNull(); // nur einmal
    expect(chatWindowProps.current.pendingFirstMessage).toBeNull();
  });

  it("NAK-1: zweites Absenden vor dem Verbrauchen ersetzt/verdoppelt nichts", () => {
    const ui = setup();
    typeInto(ui.input(), "Erste Frage");
    const form = ui.form();
    submit(form);
    // abgehängte Form erneut absenden (zweites Enter) -> keine Wirkung
    submit(form);
    // einklappen, bevor der Chat die Frage verbraucht hat, und erneut senden
    act(() => chatWindowProps.current.closeChat());
    typeInto(ui.input(), "Zweite Frage");
    submit(ui.form());
    const props = chatWindowProps.current;
    let got;
    act(() => {
      got = props.consumePendingFirstMessage();
    });
    expect(got.text).toBe("Erste Frage");
    expect(props.consumePendingFirstMessage()).toBeNull();
    expect(chatWindowProps.mounts).toBe(1); // ChatWindow bleibt gemountet
  });

  it("AK-5: leeres Feld/Leerzeichen -> nur aufklappen, nichts übergeben", () => {
    const ui = setup();
    typeInto(ui.input(), "   ");
    submit(ui.form());
    expect(container.querySelector("#chat-window-stub")).not.toBeNull();
    expect(chatWindowProps.current.pendingFirstMessage).toBeNull();
    expect(chatWindowProps.current.consumePendingFirstMessage()).toBeNull();
  });

  it("AK-6: Chip-Klick sendet den Chip-Text", () => {
    const ui = setup();
    click(ui.chips()[1]);
    expect(chatWindowProps.current.pendingFirstMessage).toEqual({
      text: "Yoga",
      send: true,
    });
  });

  it("NAK-2: Klick in die Leiste neben das Feld -> Entwurf, nicht gesendet", () => {
    const ui = setup();
    typeInto(ui.input(), "Töpfern am Wochenende");
    const icon = ui.form().querySelector("span");
    click(icon);
    expect(chatWindowProps.current.pendingFirstMessage).toEqual({
      text: "Töpfern am Wochenende",
      send: false,
    });
  });

  it("Klick ins Feld selbst klappt nicht auf", () => {
    const ui = setup();
    click(ui.input());
    expect(container.querySelector("#chat-window-stub")).toBeNull();
  });

  it("AK-7: höchstens 6 Chips", () => {
    const ui = setup({
      defaultMessages: Array.from({ length: 10 }, (_, i) => `F${i}`),
    });
    expect(ui.chips()).toHaveLength(6);
  });
});
