import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";

// Inline-Leiste als Eingabefeld (inlineInput): Settings, Warnung im
// Blasen-Modus und Zustandsübergabe pendingFirstMessage Leiste -> ChatWindow
// -> ChatContainer (Ticket: genau eine Sendung über den bestehenden
// Sende-Pfad), Zuklappen, Fokus, Barrierefreiheit, Chips.

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
import ChatContainer, {
  appendDraft,
} from "../src/components/ChatWindow/ChatContainer/index.jsx";
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

describe("ChatContainer verbraucht pendingFirstMessage (Ticket)", () => {
  const settings = { ...BASE, enableStt: false };
  const props = {
    sessionId: "s-1",
    conversationId: "c-1",
    settings,
    knownHistory: [],
  };

  it("send: genau eine Anfrage über streamChat, inkl. conversationId", () => {
    const consumed = vi.fn();
    const pending = {
      ticket: 1,
      text: "Gibt es Yogakurse am Abend?",
      send: true,
    };
    render(
      <StrictMode>
        <ChatContainer
          {...props}
          pendingFirstMessage={pending}
          onPendingFirstMessageConsumed={consumed}
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
    expect(consumed).toHaveBeenCalledTimes(1);
    expect(consumed).toHaveBeenCalledWith(pending);
  });

  it("NAK-1: dasselbe Ticket erneut übergeben -> keine zweite Anfrage", () => {
    const consumed = vi.fn();
    const pending = { ticket: 7, text: "Yoga", send: true };
    render(
      <ChatContainer
        {...props}
        pendingFirstMessage={pending}
        onPendingFirstMessageConsumed={consumed}
      />,
    );
    // neues Objekt, gleiches Ticket (z. B. erneutes Rendern vor der Freigabe)
    render(
      <ChatContainer
        {...props}
        pendingFirstMessage={{ ...pending }}
        onPendingFirstMessageConsumed={consumed}
      />,
    );
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it("Entwurf (send: false), Chat-Feld leer: Entwurf steht im Feld, keine Anfrage", () => {
    render(
      <ChatContainer
        {...props}
        pendingFirstMessage={{ ticket: 1, text: "Yoga am Abend", send: false }}
        onPendingFirstMessageConsumed={vi.fn()}
      />,
    );
    expect(chatService.streamChat).not.toHaveBeenCalled();
    expect(container.querySelector("#message-input").value).toBe(
      "Yoga am Abend",
    );
    expect(container.querySelectorAll("#history li")).toHaveLength(0);
  });

  it("Entwurf (send: false), Chat-Feld nicht leer: angehängt statt überschrieben", () => {
    render(
      <ChatContainer {...props} onPendingFirstMessageConsumed={vi.fn()} />,
    );
    typeInto(container.querySelector("#message-input"), "Ich suche ");
    render(
      <ChatContainer
        {...props}
        pendingFirstMessage={{ ticket: 2, text: "Yoga am Abend", send: false }}
        onPendingFirstMessageConsumed={vi.fn()}
      />,
    );
    expect(container.querySelector("#message-input").value).toBe(
      "Ich suche Yoga am Abend",
    );
    expect(chatService.streamChat).not.toHaveBeenCalled();
    expect(appendDraft("", "A")).toBe("A");
    expect(appendDraft("  ", "A")).toBe("A");
    expect(appendDraft("X", "A")).toBe("X A");
  });

  it("ohne pendingFirstMessage: nichts gesendet (Bestand)", () => {
    render(<ChatContainer {...props} />);
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });

  it("läuft noch eine Antwort, wird die Frage erst danach gesendet", () => {
    const consumed = vi.fn();
    render(
      <ChatContainer
        {...props}
        pendingFirstMessage={{ ticket: 1, text: "Erste", send: true }}
        onPendingFirstMessageConsumed={consumed}
      />,
    );
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    // zweite Frage, während "Erste" noch läuft (Antwort bleibt aus)
    render(
      <ChatContainer
        {...props}
        pendingFirstMessage={{ ticket: 2, text: "Zweite", send: true }}
        onPendingFirstMessageConsumed={consumed}
      />,
    );
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    expect(consumed).toHaveBeenCalledTimes(1);
  });
});

describe("InlineChat: Leiste -> pendingFirstMessage", () => {
  let matchMediaBefore;
  let innerWidthBefore;
  beforeEach(() => {
    matchMediaBefore = window.matchMedia;
    innerWidthBefore = window.innerWidth;
  });
  afterEach(() => {
    window.matchMedia = matchMediaBefore;
    window.innerWidth = innerWidthBefore;
  });

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
      pending: () => chatWindowProps.current?.pendingFirstMessage ?? null,
      close: () => act(() => chatWindowProps.current.closeChat()),
      // wie der ChatContainer: Ticket verbrauchen und zurückmelden
      consume: () => {
        const p = chatWindowProps.current.pendingFirstMessage;
        act(() => chatWindowProps.current.onPendingFirstMessageConsumed(p));
        return p;
      },
    };
  }

  // matchMedia-Attrappe: nur die genannten Abfragen treffen zu
  function fakeMatchMedia(matching) {
    window.matchMedia = (q) => ({
      matches: matching.includes(q),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    });
  }

  it("Standard ohne inlineInput: Klick-Leiste wie bisher, kein Feld, keine Chips", () => {
    setup({ inlineInput: false });
    const bar = container.querySelector("#anything-llm-inline-bar");
    expect(bar.tagName).toBe("BUTTON");
    expect(container.querySelector("input:not([aria-hidden])")).toBeNull();
    expect(container.querySelectorAll(".allm-inline-chip")).toHaveLength(0);
  });

  it("Klick-Leiste: Text aus Settings, Standardtext wenn leer", () => {
    setup({ inlineInput: false, inlineCollapsedText: "Fragen Sie uns" });
    expect(
      container.querySelector("#anything-llm-inline-bar").textContent,
    ).toBe("Fragen Sie uns");
    act(() => root.unmount());
    root = createRoot(container);
    setup({ inlineInput: false, inlineCollapsedText: "" });
    expect(
      container.querySelector("#anything-llm-inline-bar").textContent,
    ).toBe("Jetzt mit unserem KI-Assistenten schreiben");
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

  it("Barrierefreiheit: role=search, aria-expanded/aria-controls am Knopf", () => {
    const ui = setup();
    expect(ui.form().getAttribute("role")).toBe("search");
    expect(ui.form().getAttribute("aria-label")).toBe(
      "Stellen Sie hier Ihre Frage …",
    );
    expect(ui.send().getAttribute("aria-expanded")).toBe("false");
    expect(ui.send().getAttribute("aria-controls")).toBe("anything-llm-chat");
    submit(ui.form()); // leer: nur aufklappen
    // aufgeklappt: Leiste samt Knopf ist durch das Chatfenster ersetzt, das
    // gesteuerte Element existiert und ist sichtbar
    expect(ui.send()).toBeNull();
    const chat = container.querySelector("#anything-llm-chat");
    expect(chat).not.toBeNull();
    ui.close();
    expect(ui.send().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#anything-llm-chat")).not.toBeNull();
  });

  it("AK-3 + NAK-1: Enter -> aufgeklappt, Frage mit Ticket übergeben, nach Verbrauch frei", () => {
    const ui = setup();
    typeInto(ui.input(), "  Gibt es Yogakurse am Abend?  ");
    submit(ui.form());
    expect(ui.pending()).toMatchObject({
      text: "Gibt es Yogakurse am Abend?",
      send: true,
      suppressAutoFocus: false,
    });
    expect(typeof ui.pending().ticket).toBe("number");
    expect(container.querySelector("#anything-llm-inline-bar")).toBeNull();
    ui.consume();
    expect(ui.pending()).toBeNull();
  });

  it("NAK-1: zweites Absenden derselben Übergabe erzeugt kein zweites Ticket", () => {
    const ui = setup();
    typeInto(ui.input(), "Erste Frage");
    const form = ui.form();
    const send = ui.send();
    // Enter + Knopf im selben Takt (die Leiste ist danach schon abgebaut)
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      send.click();
    });
    const first = ui.pending();
    submit(form); // abgehängte Form erneut absenden -> keine Wirkung
    expect(ui.pending()).toBe(first);
    expect(chatWindowProps.mounts).toBe(1);
  });

  it("B nach Zuklappen bei noch nicht verbrauchter A: A verfällt, B wird übergeben", () => {
    const ui = setup();
    typeInto(ui.input(), "Frage A");
    submit(ui.form());
    const a = ui.pending();
    ui.close(); // vor dem Verbrauch
    expect(ui.pending()).toBeNull();
    typeInto(ui.input(), "Frage B");
    submit(ui.form());
    // aufgeklappt, B übergeben (neues Ticket), A ist weg
    expect(container.querySelector("#anything-llm-inline-bar")).toBeNull();
    expect(ui.pending()).toMatchObject({ text: "Frage B", send: true });
    expect(ui.pending().ticket).not.toBe(a.ticket);
    expect(chatWindowProps.mounts).toBe(1); // ChatWindow bleibt gemountet
  });

  it("Zuklappen vor dem Verbrauch: Frage verworfen, Text wieder im Feld", () => {
    const ui = setup();
    typeInto(ui.input(), "Gibt es Yogakurse am Abend?");
    submit(ui.form());
    ui.close();
    expect(ui.pending()).toBeNull();
    expect(ui.input().value).toBe("Gibt es Yogakurse am Abend?");
  });

  it("Zuklappen nach dem Verbrauch: Feld bleibt leer", () => {
    const ui = setup();
    typeInto(ui.input(), "Gibt es Yogakurse am Abend?");
    submit(ui.form());
    ui.consume();
    ui.close();
    expect(ui.input().value).toBe("");
  });

  it("Touch (pointer: coarse): Übergabe mit suppressAutoFocus, Entwurf ohne", () => {
    fakeMatchMedia(["(pointer: coarse)", "(min-width: 768px)"]);
    const ui = setup();
    typeInto(ui.input(), "Yoga");
    submit(ui.form());
    expect(ui.pending()).toMatchObject({ send: true, suppressAutoFocus: true });
    ui.close();
    typeInto(ui.input(), "Töpfern");
    click(ui.form());
    expect(ui.pending()).toMatchObject({
      send: false,
      suppressAutoFocus: false,
    });
  });

  it("Fokus nach Zuklappen: schmales Desktop-Fenster (700 px) -> Leisten-Feld", () => {
    window.innerWidth = 700; // isTouchDevice() wäre true, Zeiger ist aber fein
    fakeMatchMedia([]);
    const ui = setup();
    submit(ui.form());
    ui.close();
    expect(document.activeElement).toBe(ui.input());
  });

  it("Fokus nach Zuklappen: pointer: coarse -> kein Fokus (keine Tastatur)", () => {
    fakeMatchMedia(["(pointer: coarse)", "(min-width: 768px)"]);
    const ui = setup();
    submit(ui.form());
    ui.close();
    expect(document.activeElement).not.toBe(ui.input());
  });

  it("AK-5: leeres Feld/Leerzeichen -> nur aufklappen, nichts übergeben", () => {
    const ui = setup();
    typeInto(ui.input(), "   ");
    submit(ui.form());
    expect(container.querySelector("#chat-window-stub")).not.toBeNull();
    expect(ui.pending()).toBeNull();
  });

  it("AK-6: Chip-Klick bei leerem Feld sendet den Chip-Text", () => {
    const ui = setup();
    typeInto(ui.input(), "  "); // nur Leerzeichen = leer
    click(ui.chips()[1]);
    expect(ui.pending()).toMatchObject({ text: "Yoga", send: true });
  });

  it("Chip-Klick bei Text im Feld: angehängt, nichts gesendet, bleibt eingeklappt", () => {
    const ui = setup();
    typeInto(ui.input(), "Ich suche ");
    click(ui.chips()[1]);
    expect(ui.input().value).toBe("Ich suche Yoga");
    expect(container.querySelector("#chat-window-stub")).toBeNull();
    expect(chatWindowProps.current).toBeNull();
    expect(document.activeElement).toBe(ui.input());
  });

  it("NAK-2: Klick in die Leiste neben das Feld -> Entwurf, nicht gesendet", () => {
    const ui = setup();
    typeInto(ui.input(), "Töpfern am Wochenende");
    // Klick auf die Leiste selbst (Rand neben Feld/Knopf)
    click(ui.form());
    expect(ui.pending()).toMatchObject({
      text: "Töpfern am Wochenende",
      send: false,
    });
  });

  it("Eingabe-Leiste hat kein Chat-Icon links (Absende-Knopf ist der Einstieg)", () => {
    const ui = setup();
    expect(ui.form().querySelector("svg")).toBeNull();
    expect(ui.form().firstElementChild).toBe(ui.input());
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
