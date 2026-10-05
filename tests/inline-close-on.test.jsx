import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Inline-Box, Variante B (inlineCloseOn "leave"): schwebende Box klappt ein,
// wenn der Zeiger Box + Leiste verlässt, nach --allm-leave-delay; Sperren bei
// laufender Antwort, Tastatur-Fokus bzw. Entwurf im fokussierten Feld, offenem
// Menü/„Frühere Chats“ (ohne Timer-Nachprüfung, Neustart bei Sperr-Ende); nur
// overlay, feiner Zeiger, ab 768px. Echtes ChatWindow/ChatContainer (meldet
// den Antwort-Zustand), Backend ersetzt, Fake-Timer.
// Browser-Prüfung: tests/visual/inline_input.py (ii-leave-close).

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
  embedHistorySummary: vi.fn(async () => ({ count: 0, lastAt: null })),
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
import {
  DEFAULT_INLINE_CLOSE_ON,
  DEFAULT_LEAVE_DELAY_MS,
  closesOnLeave,
  cssTimeMs,
} from "../src/utils/layout.js";
import { buildThemeCss } from "../src/utils/theme.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};

// jsdom kennt keinen Zeiger: :hover (Zeiger über der Inline-Fläche) und
// optional :focus-visible werden gesteuert. Standard: Zeiger steht auf der
// Leiste (geöffnet per Klick).
const nativeMatches = Element.prototype.matches;
let pointerOnBox;
let focusVisible;

let container;
let root;
let warn;
let matchMediaBefore;
let innerWidthBefore;
beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Object.values(chatService).forEach((f) => f.mockClear());
  chatService.streamChat.mockImplementation(() => new Promise(() => {}));
  chatService.embedSessionHistory.mockImplementation(async () => []);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  pointerOnBox = true;
  focusVisible = null; // null = jsdom (trifft wie :focus)
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (sel) {
    if (sel === ":hover")
      return pointerOnBox && this.id === "anything-llm-embed-inline";
    if (sel === ":focus-visible" && focusVisible !== null) return focusVisible;
    return nativeMatches.call(this, sel);
  });
  matchMediaBefore = window.matchMedia;
  innerWidthBefore = window.innerWidth;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  window.matchMedia = matchMediaBefore;
  window.innerWidth = innerWidthBefore;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = () => act(async () => {});
const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

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
function click(el) {
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
// pointerenter/-leave (bubbeln nicht) mit pointerType
function pointer(el, type, pointerType = "mouse", init = {}) {
  const ev = new MouseEvent(type, { cancelable: true, ...init });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  act(() => el.dispatchEvent(ev));
}
function fakeMatchMedia(matching) {
  window.matchMedia = (q) => ({
    matches: matching.includes(q),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
}
// Karenz im Test: 200 ms (Seiten-CSS --allm-leave-delay -> --allmi-leave-delay)
function setDelay(value = "200ms") {
  const st = document.createElement("style");
  st.textContent = `#anything-llm-embed-inline { --allmi-leave-delay: ${value}; }`;
  document.head.appendChild(st);
}
// Stream bleibt offen; chunk() liefert Ereignisse wie der Server, end() schließt
function openStream() {
  const stream = { push: null, end: null };
  chatService.streamChat.mockImplementation((_s, _settings, _msg, handle) => {
    stream.push = handle;
    return new Promise((resolve) => (stream.end = resolve));
  });
  stream.chunk = (c) =>
    act(() => stream.push({ uuid: "u", sources: [], ...c }));
  return stream;
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
    inlineLayout: "overlay",
    inlineCloseOn: "leave",
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
  const q = (sel) => container.querySelector(sel);
  const isOpen = () => {
    const chat = q("#anything-llm-chat");
    return !!chat && !chat.parentElement.className.includes("allm-hidden");
  };
  return {
    root: () => q("#anything-llm-embed-inline"),
    input: () => q("#anything-llm-inline-input"),
    message: () => q("#message-input"),
    // Chat-Fenster sichtbar (eingeklappt: Wrapper allm-hidden; die schwebende
    // Box lässt eine unsichtbare Kopie der Leiste im Seitenfluss)
    open: () => isOpen(),
    collapsed: () => !isOpen() && !!q("#anything-llm-inline-bar"),
    history: () => [...container.querySelectorAll("#history li")],
    submit: (text = "") => {
      if (text) typeInto(q("#anything-llm-inline-input"), text);
      act(() =>
        q("#anything-llm-inline-bar").dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    },
    blur: () => act(() => document.activeElement?.blur?.()),
    leave: (type = "mouse") =>
      pointer(q("#anything-llm-embed-inline"), "pointerleave", type),
    enter: (type = "mouse") =>
      pointer(q("#anything-llm-embed-inline"), "pointerenter", type),
    options: () => click(q('button[aria-label="Options"]')),
    mountTarget,
  };
}

// Box offen (leer abgeschickt), Verlauf geladen, Eingabe nicht fokussiert
async function openUnfocused(ui) {
  ui.submit();
  await flush();
  ui.blur();
  expect(ui.open()).toBe(true);
}

describe("Settings inlineCloseOn / --allm-leave-delay", () => {
  it('Standard "outside"; visual_config schlägt Script-Attribut', async () => {
    const cfg = (c) => vi.fn(async () => ({ ok: true, json: async () => c }));
    let s = await loadEmbedSettings({ ...BASE }, cfg({}));
    expect(s.inlineCloseOn).toBe("outside");
    expect(DEFAULT_INLINE_CLOSE_ON).toBe("outside");
    s = await loadEmbedSettings(
      { ...BASE, inlineCloseOn: "outside" },
      cfg({ inlineCloseOn: "LEAVE" }),
    );
    expect(s.inlineCloseOn).toBe("leave");
  });

  it('NAK-6: data-inline-close-on="never" -> Standard + genau eine Warnung', async () => {
    const s = await loadEmbedSettings(
      { ...BASE, inlineCloseOn: "never" },
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    expect(s.inlineCloseOn).toBe("outside");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(
      /inlineCloseOn-Wert "never" \(Script-Attribut\).*es gilt "outside" \(Standard\)/,
    );
  });

  it("nur bei overlay; Karenz-Variable mit Standard 600ms im Theme", () => {
    expect(
      closesOnLeave({ inlineLayout: "overlay", inlineCloseOn: "leave" }),
    ).toBe(true);
    expect(
      closesOnLeave({ inlineLayout: "flow", inlineCloseOn: "leave" }),
    ).toBe(false);
    expect(buildThemeCss({}, "light")).toContain(
      "--allmi-leave-delay: var(--allm-leave-delay, 600ms);",
    );
    expect(DEFAULT_LEAVE_DELAY_MS).toBe(600);
    expect(cssTimeMs("200ms")).toBe(200);
    expect(cssTimeMs(" 0.8s ")).toBe(800);
    expect(cssTimeMs("")).toBe(600);
    expect(cssTimeMs("calc(1s)")).toBe(600);
    expect(cssTimeMs("99s")).toBe(10000);
  });
});

describe("AK-1: Standard (outside)", () => {
  it("Zeiger verlässt die Box -> bleibt offen", async () => {
    const ui = setup({ inlineCloseOn: undefined });
    await openUnfocused(ui);
    ui.leave();
    await advance(5000);
    expect(ui.open()).toBe(true);
  });
});

describe('AK-5: inlineCloseOn "leave" mit Karenz', () => {
  it("Standard-Karenz 600 ms", async () => {
    const ui = setup();
    await openUnfocused(ui);
    ui.leave();
    await advance(599);
    expect(ui.open()).toBe(true);
    await advance(1);
    expect(ui.collapsed()).toBe(true);
    expect(ui.mountTarget.hasAttribute("data-allm-expanded")).toBe(false);
    // Fokus lag nicht im Widget: bleibt, wo er ist (kein Fokusring auf der Leiste)
    expect(document.activeElement).not.toBe(ui.input());
  });

  it("Fokus lag auf einem (per Maus geklickten) Knopf im Panel -> gelöst, nicht auf die Leiste", async () => {
    setDelay();
    const ui = setup();
    await openUnfocused(ui);
    // jsdom wertet :focus-visible wie :focus; im Browser trifft es nach einem
    // Mausklick auf einen Knopf nicht zu
    focusVisible = false;
    act(() => container.querySelector('button[aria-label="Options"]').focus());
    ui.leave();
    await advance(200);
    expect(ui.collapsed()).toBe(true);
    expect(document.activeElement).not.toBe(ui.input());
    expect(container.contains(document.activeElement)).toBe(false);
  });

  it("Enter-Öffnen bei Zeiger außerhalb (kein pointerleave): Karenz läuft sofort", async () => {
    setDelay();
    pointerOnBox = false;
    const ui = setup();
    ui.submit(); // Enter in der Leiste, leer
    await flush();
    expect(document.activeElement).toBe(ui.message()); // automatisch, leer
    await advance(199);
    expect(ui.open()).toBe(true);
    await advance(1);
    expect(ui.collapsed()).toBe(true);
  });

  it("Zeiger über der Box beim Öffnen: bleibt offen bis zum Verlassen", async () => {
    setDelay();
    const ui = setup();
    ui.submit();
    await flush();
    await advance(3000);
    expect(ui.open()).toBe(true);
  });

  it(":hover trägt nicht -> letzte Zeigerposition (elementFromPoint) entscheidet", async () => {
    setDelay();
    pointerOnBox = false;
    const ui = setup();
    // Zeiger bewegt sich über die Leiste (vor dem Öffnen)
    act(() =>
      document.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 40, clientY: 20 }),
      ),
    );
    document.elementFromPoint = vi.fn(() => ui.input());
    ui.submit();
    await flush();
    await advance(3000);
    expect(document.elementFromPoint).toHaveBeenCalledWith(40, 20);
    expect(ui.open()).toBe(true);
    delete document.elementFromPoint;
  });

  it("Karenz aus --allm-leave-delay (200 ms); Rückkehr innerhalb der Karenz -> bleibt offen", async () => {
    setDelay("200ms");
    const ui = setup();
    await openUnfocused(ui);
    ui.leave();
    await advance(150);
    ui.enter(); // zurück
    await advance(1000);
    expect(ui.open()).toBe(true);
    ui.leave();
    await advance(199);
    expect(ui.open()).toBe(true);
    await advance(1);
    expect(ui.collapsed()).toBe(true);
  });

  it("Touch-pointerleave zählt nicht", async () => {
    setDelay();
    const ui = setup();
    await openUnfocused(ui);
    ui.leave("touch");
    await advance(2000);
    expect(ui.open()).toBe(true);
  });
});

describe("AK-6: Sperren", () => {
  it("(a) leeres, automatisch fokussiertes Feld sperrt nicht; Entwurf sperrt", async () => {
    setDelay();
    const ui = setup();
    ui.submit();
    await flush();
    expect(document.activeElement).toBe(ui.message()); // Fokus nach dem Öffnen
    ui.leave();
    await advance(200);
    expect(ui.collapsed()).toBe(true); // leer -> keine Sperre
    ui.submit(); // wieder öffnen (jsdom ohne Shadow-Root: Fokus von Hand)
    await flush();
    act(() => ui.message().focus());
    typeInto(ui.message(), "Und am Morgen?");
    ui.enter();
    ui.leave();
    await advance(3000);
    expect(ui.open()).toBe(true); // Entwurf im fokussierten Feld
    // keine Nachprüfung per Timer während der Sperre
    expect(vi.getTimerCount()).toBe(0);
    // Entwurf geleert (input) -> volle Karenz ab jetzt, ohne erneutes Verlassen
    typeInto(ui.message(), "");
    await advance(199);
    expect(ui.open()).toBe(true);
    await advance(1);
    expect(ui.collapsed()).toBe(true);
  });

  it("(a) Entwurf: Fokus verlässt das Feld (focusout) -> volle Karenz, Entwurf bleibt", async () => {
    setDelay();
    const ui = setup();
    ui.submit();
    await flush();
    typeInto(ui.message(), "Und am Morgen?");
    ui.leave();
    await advance(3000);
    expect(ui.open()).toBe(true);
    ui.blur();
    await advance(199);
    expect(ui.open()).toBe(true);
    await advance(1);
    expect(ui.collapsed()).toBe(true);
    ui.submit();
    await flush();
    expect(ui.message().value).toBe("Und am Morgen?");
  });

  it("(a) per Tab erreichtes (leeres) Feld sperrt; Zeiger-Klick hebt das auf", async () => {
    setDelay();
    const ui = setup();
    await openUnfocused(ui);
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      ),
    );
    act(() => ui.message().focus());
    ui.leave();
    await advance(3000);
    expect(ui.open()).toBe(true);
    // Klick (Zeiger) ins Feld: kein Tastatur-Fokus mehr
    pointer(ui.message(), "pointerdown", "mouse", { bubbles: true, button: 0 });
    ui.enter();
    ui.leave();
    await advance(200);
    expect(ui.collapsed()).toBe(true);
  });

  it("(a) Tastatur-Fokus (:focus-visible) auf einem Knopf im Panel sperrt ebenfalls", async () => {
    setDelay();
    const ui = setup();
    await openUnfocused(ui);
    // jsdom: ein fokussierter Knopf trifft :focus-visible (wie nach Tab)
    act(() => container.querySelector('button[aria-label="Options"]').focus());
    ui.leave();
    await advance(3000);
    expect(ui.open()).toBe(true);
  });

  it("(b) + NAK-1: während der Antwort offen, bis Karenz nach Stream-Ende (finalizeResponseStream)", async () => {
    setDelay();
    const stream = openStream();
    const ui = setup();
    ui.submit("Gibt es Yogakurse?");
    await flush();
    expect(chatService.streamChat).toHaveBeenCalledTimes(1);
    ui.leave();
    await advance(1000);
    expect(ui.open()).toBe(true); // wartet auf erstes Wort
    stream.chunk({
      type: "textResponseChunk",
      textResponse: "Ja, ",
      close: false,
    });
    await advance(1000);
    expect(ui.open()).toBe(true); // Tokens laufen
    stream.chunk({
      type: "textResponseChunk",
      textResponse: "gern.",
      close: true,
    });
    stream.chunk({ type: "finalizeResponseStream", close: true, chatId: 9 });
    await advance(1100);
    expect(ui.open()).toBe(true); // Verbindung noch offen
    await act(async () => stream.end()); // Stream zu Ende
    // Fokus liegt jetzt automatisch im leeren Chat-Feld: sperrt nicht
    await advance(199);
    expect(ui.open()).toBe(true); // mindestens die Karenz nach Ende
    await advance(1);
    expect(ui.collapsed()).toBe(true);
  });

  it("(c) Menü offen -> bleibt offen; Menü zu + erneutes Verlassen -> schließt", async () => {
    setDelay();
    const ui = setup();
    await openUnfocused(ui);
    ui.options();
    expect(container.querySelector('[data-allm-layer="menu"]')).not.toBeNull();
    ui.blur();
    ui.leave();
    await advance(3000);
    expect(ui.open()).toBe(true);
    ui.options(); // Menü zu
    ui.blur();
    ui.enter();
    ui.leave();
    await advance(200);
    expect(ui.collapsed()).toBe(true);
  });

  it("(c) „Frühere Chats“ offen -> bleibt offen", async () => {
    setDelay();
    const ui = setup();
    await openUnfocused(ui);
    ui.options();
    click(
      [...container.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Frühere Chats"),
      ),
    );
    await flush();
    expect(
      container.querySelector('[data-allm-layer="history"]'),
    ).not.toBeNull();
    ui.blur();
    ui.leave();
    await advance(3000);
    expect(ui.open()).toBe(true);
  });
});

describe("Sperr-Ende ohne erneutes Verlassen (Zeiger bleibt draußen)", () => {
  it("Menü schließt -> volle Karenz, dann zu; kein Timer während der Sperre", async () => {
    setDelay();
    const ui = setup();
    await openUnfocused(ui);
    ui.options();
    ui.blur();
    ui.leave();
    await advance(3000);
    expect(ui.open()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    ui.options(); // Menü zu (MutationObserver)
    await flush();
    await advance(199);
    expect(ui.open()).toBe(true);
    await advance(1);
    expect(ui.collapsed()).toBe(true);
  });
});

describe("AK-7: Verlauf und Entwurf bleiben nach leave", () => {
  it("2 Nachrichten + Entwurf nach Wiederöffnen erhalten", async () => {
    setDelay();
    chatService.embedSessionHistory.mockImplementation(async () => [
      { role: "user", content: "Gibt es Yoga?", sentAt: 1 },
      { role: "assistant", content: "Ja, am Abend.", sentAt: 2 },
    ]);
    const ui = setup();
    await openUnfocused(ui);
    expect(ui.history()).toHaveLength(2);
    typeInto(ui.message(), "Und am Morgen?");
    ui.blur();
    ui.leave();
    await advance(200);
    expect(ui.collapsed()).toBe(true);
    ui.submit(); // wieder öffnen
    await flush();
    expect(ui.open()).toBe(true);
    expect(ui.history().map((li) => li.textContent)).toEqual([
      "Gibt es Yoga?",
      "Ja, am Abend.",
    ]);
    expect(ui.message().value).toBe("Und am Morgen?");
    expect(chatService.embedSessionHistory).toHaveBeenCalledTimes(1);
  });
});

describe("NAK-2: kein leave bei Touch, mobil, im Seitenfluss", () => {
  it("pointer: coarse (Tablet ab 768 px)", async () => {
    setDelay();
    fakeMatchMedia(["(pointer: coarse)", "(min-width: 768px)"]);
    const ui = setup();
    await openUnfocused(ui);
    ui.leave();
    await advance(3000);
    expect(ui.open()).toBe(true);
  });

  it("mobil (< 768 px): Vollbild bleibt", async () => {
    setDelay();
    fakeMatchMedia([]);
    window.innerWidth = 390;
    const ui = setup();
    ui.submit();
    await flush();
    const chat = container.querySelector("#anything-llm-chat");
    expect(chat.className).toContain("allm-fixed");
    ui.blur();
    pointer(
      document.querySelector("#anything-llm-embed-inline"),
      "pointerleave",
    );
    await advance(3000);
    expect(container.querySelector("#anything-llm-chat").className).toContain(
      "allm-fixed",
    );
  });

  it("inlineLayout flow: kein Schließen beim Verlassen", async () => {
    setDelay();
    const ui = setup({ inlineLayout: "flow" });
    await openUnfocused(ui);
    ui.leave();
    await advance(3000);
    expect(ui.open()).toBe(true);
  });
});

describe("NAK-7: Außenklick und Escape wirken bei leave weiter sofort", () => {
  it("Außenklick (linke Taste) klappt sofort nach dem click ein", async () => {
    setDelay("5s");
    const ui = setup();
    await openUnfocused(ui);
    const outside = document.createElement("a");
    document.body.appendChild(outside);
    pointer(outside, "pointerdown", "mouse", { bubbles: true, button: 0 });
    pointer(outside, "pointerup", "mouse", { bubbles: true, button: 0 });
    await advance(0);
    expect(ui.collapsed()).toBe(true);
  });

  it("Escape auf der Seite klappt sofort ein", async () => {
    setDelay("5s");
    const ui = setup();
    await openUnfocused(ui);
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(ui.collapsed()).toBe(true);
  });
});
