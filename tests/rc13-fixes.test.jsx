import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Korrekturrunde 7.22-rc13, Teil Widget (issues/rollout-721/
// fixliste-7.22-rc13.md, Details review-7.22-nachreview-rc12.md):
// F01 bis F03 Widget-Seite (E10 bis E12): /config mit ?language=, Vorrang
//   gespeichert vor Skript-Attribut vor Standard, Listen als Array.
// W01 bis W03 Escape-Ebenen: kein preventDefault für Escape der Webseite,
//   Kommentarfeld nimmt Escape nur aus sich selbst, Fokus zurück zum Öffner.
// W04 Kurskarten-Beschriftung je Sprache, Logos dekorativ.
// W06 Pillenschrift bei nicht auswertbarer Seitenfarbe.
// W07 Verlauf mit angekündigten Karten zeigt sie auch im Chatfenster.
// W08 Gerät der Willkommensblasen beim Laden, auch mit offenem Chat.
// W09 Rückfallsprache Deutsch, Tooltip wie aria-label.
// W10 isContentEditable entscheidet im Browser.
// N3 Kopfzeile: Name und Untertitel brechen um, nie gekürzt (Nutzer-
//   entscheidung); Maße im Browser: tests/visual/n3_header.py.
// Der Fall Inline-Box (W01, schwebend) steht in rc13-inline-escape.test.jsx,
// der Vertrag mit dem Fork in embed-config-contract.test.js.
// Neue Funktionen werden je Test dynamisch gelesen: Am alten Stand scheitert
// dann der einzelne Test an seiner Prüfung, nicht die ganze Datei am Import.

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
  streamChat: vi.fn(() => new Promise(() => {})),
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
  checkEmbedStatus: vi.fn(async () => true),
  sendFeedback: vi.fn(async () => true),
  embedSessionHistory: vi.fn(async () => []),
  listConversations: vi.fn(async () => []),
  resetEmbedChatSession: vi.fn(async () => true),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
  I18nextProvider: ({ children }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

import i18next from "i18next";
import { embedderSettings } from "../src/main.jsx";
import App from "../src/App.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import * as escapeModule from "../src/utils/escape.js";
import * as theme from "../src/utils/theme.js";
import { contrastRatio } from "../src/utils/contrast.js";
import * as openButtonModule from "../src/components/OpenButton/index.jsx";
import * as dismissal from "../src/hooks/useBubbleDismissal.js";
import { CHAT_UI_REOPEN } from "../src/utils/constants.js";
import { initI18n } from "../src/i18n.js";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";
import PromptInput from "../src/components/ChatWindow/ChatContainer/PromptInput/index.jsx";
import InlineChat from "../src/components/InlineChat/index.jsx";

const OpenButton = openButtonModule.default;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const CONFIG_URL = `${BASE.baseApiUrl}/${BASE.embedId}/config`;
const STANDARD = {
  de: ["Ich suche einen Deutschkurs.", "Gibt es Excel-Kurse am Abend?"],
  en: [
    "I am looking for a German course.",
    "Are there Excel courses in the evening?",
  ],
};
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server = {}) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

const realInnerWidth = window.innerWidth;
function setWidth(px) {
  Object.defineProperty(window, "innerWidth", {
    value: px,
    configurable: true,
    writable: true,
  });
}

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
if (!Element.prototype.scrollIntoView)
  Element.prototype.scrollIntoView = () => {};
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
  embedderSettings.shadowRoot = null;
  embedderSettings.hostElement = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  openButtonModule.resetPhoneAtLoad?.();
  dismissal.resetShownOnThisPage?.();
  chatService.embedSessionHistory.mockImplementation(async () => []);
  chatService.getAudioStatus.mockImplementation(async () => ({
    stt: false,
    tts: false,
  }));
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.querySelectorAll("[data-rc13-page]").forEach((el) => el.remove());
  setWidth(realInnerWidth);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render(el) {
  act(() => root.render(el));
}
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => [...container.querySelectorAll(sel)];
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await act(async () => {});
};
// Escape am Ziel (bubbles, composed, abbrechbar); gibt das Ereignis zurück
const escapeAt = (target) => {
  const e = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  act(() => target.dispatchEvent(e));
  return e;
};
// Element der Webseite (außerhalb des Widgets)
function pageElement(tag, attrs = {}) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute("data-rc13-page", "");
  document.body.appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
describe("F01 (E12): /config mit der Sprache des Widgets", () => {
  it("Abruf mit ?language=: ohne data-language de, sonst die Sprache des Widgets (kodiert)", async () => {
    for (const [script, query] of [
      [{}, "de"],
      [{ language: "en" }, "en"],
      [{ language: " EN-GB " }, "en-gb"],
      [{ language: "en&x=1" }, "en%26x%3D1"],
    ]) {
      const fetchFn = fetchConfig({});
      await loadEmbedSettings({ ...BASE, ...script }, fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(`${CONFIG_URL}?language=${query}`);
    }
  });

  it("englisches Widget ohne gespeicherte Liste: englische Standard-Startvorschläge", async () => {
    // Server wie der Fork: Standard nach ?language= (fehlend = de)
    const server = vi.fn(async (url) => {
      const lang =
        new URL(url).searchParams.get("language") === "en" ? "en" : "de";
      return {
        ok: true,
        json: async () => ({
          defaultMessages: [...STANDARD[lang]],
          defaultMessagesStandard: true,
        }),
      };
    });
    const en = await loadEmbedSettings({ ...BASE, language: "en" }, server);
    expect(en.defaultMessages).toEqual(STANDARD.en);
    const de = await loadEmbedSettings({ ...BASE }, server);
    expect(de.defaultMessages).toEqual(STANDARD.de);
  });
});

// ---------------------------------------------------------------------------
describe("F02 (E10): gespeichert (auch leer) vor Skript-Attribut vor Standard", () => {
  const SCRIPT = { defaultMessages: "Spanisch A1,Yoga" };

  it("Standard vom Server weicht data-default-messages; ohne Attribut gilt der Standard", async () => {
    const standard = {
      defaultMessages: [...STANDARD.de],
      defaultMessagesStandard: true,
    };
    expect((await load(SCRIPT, standard)).defaultMessages).toEqual([
      "Spanisch A1",
      "Yoga",
    ]);
    expect((await load({}, standard)).defaultMessages).toEqual(STANDARD.de);
  });

  it("gespeicherte Liste gewinnt gegen data-default-messages", async () => {
    const s = await load(SCRIPT, { defaultMessages: ["Töpfern", "Excel"] });
    expect(s.defaultMessages).toEqual(["Töpfern", "Excel"]);
  });

  it("gespeichertes []: keine Startvorschläge trotz Skript-Attribut, Kennzeichen nicht in den Settings", async () => {
    const s = await load(SCRIPT, {
      defaultMessages: [],
      defaultMessagesSaved: true,
    });
    expect(s.defaultMessages).toEqual([]);
    expect(s).not.toHaveProperty("defaultMessagesSaved");
    expect(s).not.toHaveProperty("defaultMessagesStandard");
    // Kennzeichen ohne Liste: ebenso leer
    const t = await load(SCRIPT, { defaultMessagesSaved: true });
    expect(t.defaultMessages).toEqual([]);

    // keine Pillen im leeren Chat
    embedderSettings.settings = s;
    render(<ChatHistory settings={s} history={[]} />);
    expect($("#anything-llm-suggestion-pills")).toBeNull();
    act(() => root.unmount());

    // keine Chips unter der eingeklappten Leiste
    root = createRoot(container);
    const mountTarget = pageElement("div");
    const host = document.createElement("div");
    mountTarget.appendChild(host);
    embedderSettings.hostElement = host;
    render(
      <InlineChat
        settings={{ ...s, displayMode: "inline", inlineInput: true }}
        mountTarget={mountTarget}
        sessionId="s-1"
        conversationId="c-1"
      />,
    );
    expect(
      container.querySelectorAll("#anything-llm-inline-chips button"),
    ).toHaveLength(0);
    // Gegenprobe: mit Skript-Attribut und Standard vom Server erscheinen sie
    const withScript = await load(SCRIPT, {
      defaultMessages: [...STANDARD.de],
      defaultMessagesStandard: true,
    });
    render(
      <InlineChat
        settings={{ ...withScript, displayMode: "inline", inlineInput: true }}
        mountTarget={mountTarget}
        sessionId="s-1"
        conversationId="c-1"
      />,
    );
    expect(
      [...container.querySelectorAll("#anything-llm-inline-chips button")].map(
        (b) => b.textContent,
      ),
    ).toEqual(["Spanisch A1", "Yoga"]);
  });
});

// ---------------------------------------------------------------------------
describe("F03 (E11): Listen vom Server als Array", () => {
  it("Array vom Server: Einträge mit Komma bleiben ganz; Skript-Attribute weiter kommagetrennt", async () => {
    const question = "Gibt es Kurse, die abends stattfinden?";
    const bubble = "Hallo, schön, dass Sie da sind!";
    const s = await load(
      {},
      {
        defaultMessages: [` ${question} `, "", 3, null, "Yoga"],
        chatbotBubblesMessages: [bubble],
      },
    );
    expect(s.defaultMessages).toEqual([question, "Yoga"]);
    expect(s.chatbotBubblesMessages).toEqual([bubble]);

    // eine Pille mit der ganzen Frage
    embedderSettings.settings = s;
    render(<ChatHistory settings={s} history={[]} />);
    expect(
      $$("#anything-llm-suggestion-pills button").map((b) => b.textContent),
    ).toEqual([question, "Yoga"]);
    act(() => root.unmount());

    // eine Willkommensblase mit dem ganzen Satz
    root = createRoot(container);
    setWidth(1440);
    render(
      <OpenButton
        settings={{ ...s, embedId: "e-f03", position: "bottom-right" }}
        isOpen={false}
        toggleOpen={() => {}}
      />,
    );
    const bubbles = $("[data-welcome-bubbles]");
    expect(bubbles).not.toBeNull();
    expect(bubbles.textContent).toContain(bubble);

    // Bestand: Skript-Attribute (Strings) trennen weiter an Kommas
    const t = await load(
      {
        defaultMessages: "Spanisch A1, Yoga,,Töpfern",
        chatbotBubblesMessages: "Hallo,Willkommen",
      },
      {},
    );
    expect(t.defaultMessages).toEqual(["Spanisch A1", "Yoga", "Töpfern"]);
    expect(t.chatbotBubblesMessages).toEqual(["Hallo", "Willkommen"]);
  });
});

// ---------------------------------------------------------------------------
// App mit echtem Chatfenster; Script-Attribute = embedderSettings.settings,
// Shadow Root = document, Host = container (wie rc7-fixes)
async function mountApp(script = {}, config = {}) {
  embedderSettings.settings = { ...BASE, openOnLoad: "on", ...script };
  embedderSettings.shadowRoot = document;
  embedderSettings.hostElement = container;
  vi.stubGlobal("fetch", fetchConfig(config));
  await act(async () => root.render(<App />));
  await flush(10);
}
const HISTORY_WITH_ANSWER = [
  { role: "user", content: "Gibt es Yoga?", sentAt: 1760000000 },
  {
    role: "assistant",
    content: "Ja, es gibt Yoga am Abend.",
    chatId: 42,
    sentAt: 1760000060,
  },
];
const optionsButton = () => $('button[aria-label="Optionen"]');
const historyItem = () =>
  $$("button").find((b) => b.textContent.includes("Frühere Chats"));
async function openHistoryView() {
  act(() => optionsButton().click());
  const item = historyItem();
  expect(item).toBeTruthy();
  await act(async () => item.click());
  await flush();
}
const historyOpen = () =>
  !!$$("button").find((b) => b.textContent.includes("Zurück")) ||
  !!container.querySelector(".allm-z-\\[60\\]");

describe("W01 bis W03: Escape-Ebenen im Chatfenster", () => {
  it("W01: Escape der Webseite (Button in einem Dialog) schließt die Ebene ohne preventDefault; ohne Fokus mit", async () => {
    await mountApp();
    await openHistoryView();
    expect(historyOpen()).toBe(true);
    const dialog = pageElement("dialog");
    const pageButton = document.createElement("button");
    dialog.appendChild(pageButton);
    const e = escapeAt(pageButton);
    expect(e.defaultPrevented).toBe(false);
    expect(historyOpen()).toBe(false);
    expect($("#anything-llm-chat")).not.toBeNull();
    // Escape ohne Fokus (body): Ebene schließt, preventDefault wie bisher
    await openHistoryView();
    const f = escapeAt(document.body);
    expect(f.defaultPrevented).toBe(true);
    expect(historyOpen()).toBe(false);
  });

  it("W02: Kommentarfeld offen, Escape im Haupt-Eingabefeld schließt das Fenster; im Kommentarfeld nur das Feld", async () => {
    chatService.embedSessionHistory.mockImplementation(async () =>
      structuredClone(HISTORY_WITH_ANSWER),
    );
    await mountApp();
    const down = $('button[aria-label="Antwort war nicht hilfreich"]');
    expect(down).not.toBeNull();
    await act(async () => down.click());
    const comment = () => $$("textarea").find((t) => t.id !== "message-input");
    expect(comment()).toBeTruthy();
    // Escape im Kommentarfeld: nur das Feld schließt
    comment().focus();
    escapeAt(comment());
    await flush(2);
    expect(comment()).toBeFalsy();
    expect($("#message-input")).not.toBeNull();
    // erneut öffnen, dann Escape aus dem Haupt-Eingabefeld: Fenster zu
    await act(async () =>
      $('button[aria-label="Antwort war nicht hilfreich"]').click(),
    );
    await act(async () =>
      $('button[aria-label="Antwort war nicht hilfreich"]').click(),
    );
    expect(comment()).toBeTruthy();
    const input = $("#message-input");
    input.focus();
    escapeAt(input);
    await flush(2);
    expect($("#message-input")).toBeNull();
    expect($("#anything-llm-embed-chat-button")).not.toBeNull();
  });

  it("W03: nach Escape steht der Fokus auf dem Öffner (Daumen runter bzw. ⋮), nicht auf <body>", async () => {
    chatService.embedSessionHistory.mockImplementation(async () =>
      structuredClone(HISTORY_WITH_ANSWER),
    );
    await mountApp();
    const down = $('button[aria-label="Antwort war nicht hilfreich"]');
    await act(async () => down.click());
    const comment = $$("textarea").find((t) => t.id !== "message-input");
    comment.focus();
    escapeAt(comment);
    await flush(2);
    expect(document.activeElement).toBe(
      $('button[aria-label="Antwort war nicht hilfreich"]'),
    );

    // „Frühere Chats“: Fokus zurück auf ⋮
    await openHistoryView();
    expect(historyOpen()).toBe(true);
    escapeAt(document.body);
    await flush(2);
    expect(historyOpen()).toBe(false);
    expect(document.activeElement).toBe(optionsButton());

    // Escape der Webseite: Fokus bleibt auf der Seite
    await openHistoryView();
    const pageButton = pageElement("button");
    pageButton.focus();
    escapeAt(pageButton);
    await flush(2);
    expect(historyOpen()).toBe(false);
    expect(document.activeElement).toBe(pageButton);
  });
});

// ---------------------------------------------------------------------------
describe("W04: Kurskarten-Beschriftung in der Sprache des Widgets, Logos dekorativ", () => {
  const COURSE = {
    url: "https://aw.donau.kufer.de/kurssuche/kurs/yoga-am-abend/262-4M14",
    title: "Yoga am Abend",
    start_date: "2026-10-12",
    weekdays: ",mon,",
    start_minutes: 1080,
    price: 60,
    bookable: true,
    format: "onsite",
  };
  const answer = (extra = {}) => ({
    role: "assistant",
    content: `Passend: [Yoga am Abend](${COURSE.url})`,
    chatId: 7,
    sentAt: 1760000060,
    courseSources: [structuredClone(COURSE)],
    ...extra,
  });

  it("englisches Widget: „Courses mentioned“, deutsches: „Genannte Kurse“", () => {
    for (const [language, label] of [
      ["en", "Courses mentioned"],
      ["de", "Genannte Kurse"],
    ]) {
      const settings = {
        ...BASE,
        language,
        courseCards: "auto",
        courseCardsPosition: "below",
      };
      embedderSettings.settings = settings;
      render(
        <ChatHistory
          settings={settings}
          history={[{ role: "user", content: "Yoga?" }, answer()]}
        />,
      );
      const section = $("[data-course-cards]");
      expect(section).not.toBeNull();
      expect(section.getAttribute("aria-label")).toBe(label);
      act(() => root.unmount());
      root = createRoot(container);
    }
  });

  it("Logo im Kopf und Avatar der Antwort: alt leer (Name steht als Text daneben)", () => {
    const settings = {
      ...BASE,
      loaded: true,
      language: "en",
      brandText: "AI Advisor",
      courseCards: "off",
    };
    embedderSettings.settings = settings;
    render(
      <>
        <ChatWindowHeader settings={settings} iconUrl="https://x.test/l.png" />
        <ChatHistory
          settings={settings}
          history={[{ role: "user", content: "Hallo" }, answer()]}
        />
      </>,
    );
    const imgs = $$("img");
    expect(imgs.length).toBeGreaterThan(1);
    for (const img of imgs) expect(img.getAttribute("alt")).toBe("");
  });
});

// ---------------------------------------------------------------------------
describe("W06: Pillenschrift bei nicht auswertbarer Seitenfarbe", () => {
  it("--allm-accent der Seite nicht auswertbar: Farbe aus dem Design Center mit mindestens 4,5:1, als fester Wert", () => {
    for (const buttonColor of ["#FFD700", "#01a5a9", "#0b5f8a"]) {
      const text = theme.pillTextColor({ buttonColor }, "light", {
        accent: "unparsed",
      });
      expect(text).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrastRatio(text, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      const dark = theme.pillTextColor({ buttonColor }, "dark", {
        accent: "unparsed",
      });
      expect(contrastRatio(dark, theme.DARK.bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      theme.buildThemeCss({ buttonColor: "#FFD700" }, "light", {
        accent: "unparsed",
      }),
    ).not.toContain("--allmi-pill-accent-text: var(--allmi-accent)");
    // auswertbare Seitenfarbe unverändert: reicht sie, folgt die Pille ihr
    expect(
      theme.pillTextColor({ buttonColor: "#FFD700" }, "light", {
        accent: "#0b5f8a",
      }),
    ).toBe("var(--allmi-accent)");
  });
});

// ---------------------------------------------------------------------------
describe("W07: Verlauf mit angekündigten Karten im Chatfenster", () => {
  const COURSE = {
    url: "https://aw.donau.kufer.de/kurssuche/kurs/yoga-am-abend/262-4M14",
    title: "Yoga am Abend",
    start_date: "2026-10-12",
    weekdays: ",mon,",
    start_minutes: 1080,
    price: 60,
    bookable: true,
    format: "onsite",
  };
  const entry = (extra = {}) => ({
    role: "assistant",
    content: "Hier sind passende Kurse.",
    chatId: 9,
    sentAt: 1760000060,
    courseSources: [structuredClone(COURSE)],
    ...extra,
  });

  it("Antwort aus dem Kartenmodus (courseCardsAnnounced) zeigt ihre Karten auch bei „Nur Text“; andere nicht", () => {
    const settings = {
      ...BASE,
      courseCards: "off",
      courseCardsPosition: "above",
      courseCardsLayout: "rows",
    };
    embedderSettings.settings = settings;
    render(
      <ChatHistory
        settings={settings}
        history={[
          { role: "user", content: "Yoga?" },
          entry({ courseCardsAnnounced: 1 }),
        ]}
      />,
    );
    const section = $("[data-course-cards]");
    expect(section).not.toBeNull();
    expect(section.textContent).toContain("Yoga am Abend");
    act(() => root.unmount());

    // ohne Ankündigung: „Nur Text mit Links“ wie eingestellt
    root = createRoot(container);
    render(
      <ChatHistory
        settings={settings}
        history={[{ role: "user", content: "Yoga?" }, entry()]}
      />,
    );
    expect($("[data-course-cards]")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("W08: Gerät der Willkommensblasen beim Laden, auch wenn der Chat offen startet", () => {
  it("Chat offen wiederhergestellt bei 1440 px, Fenster auf 700 px, Chat schließen: Desktop-Modus gilt", async () => {
    setWidth(1440);
    window.sessionStorage.setItem(CHAT_UI_REOPEN, "1");
    await mountApp(
      { openOnLoad: "off" },
      { welcomeBubblesDesktop: "off", welcomeBubblesMobile: "every" },
    );
    expect($("#anything-llm-embed-chat-button")).toBeNull();
    setWidth(700);
    escapeAt(document.body);
    await flush(4);
    expect($("#anything-llm-embed-chat-button")).not.toBeNull();
    expect($("[data-welcome-bubbles]")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("W09: Rückfallsprache Deutsch, Tooltip wie aria-label", () => {
  it("i18next: fehlt Französisch ein Text, gilt Deutsch (nicht Englisch)", () => {
    initI18n({ language: "fr" });
    expect(i18next.t("chat.start-recording")).toBe("Aufnahme starten");
    expect(i18next.t("chat.reset-chat")).toBe("Réinitialiser la conversation");
  });

  it("Mikrofon-Button: title gleich aria-label, auch bei data-language=fr", async () => {
    chatService.getAudioStatus.mockImplementation(async () => ({
      stt: true,
      tts: false,
    }));
    const settings = { ...BASE, language: "fr", enableStt: true };
    embedderSettings.settings = settings;
    await act(async () =>
      root.render(
        <PromptInput
          settings={settings}
          message=""
          submit={() => {}}
          onChange={() => {}}
          inputDisabled={false}
          buttonDisabled={false}
        />,
      ),
    );
    await flush();
    const mic = $('button[aria-label="Aufnahme starten"]');
    expect(mic).not.toBeNull();
    expect(mic.getAttribute("title")).toBe("Aufnahme starten");
  });
});

// ---------------------------------------------------------------------------
describe("W10: contenteditable im Browser nach isContentEditable", () => {
  it("contenteditable=inherit bzw. ungültiger Wert ohne editierbaren Vorfahren: kein Textfeld, Escape schließt", async () => {
    for (const value of ["inherit", "yes"]) {
      const el = document.createElement("div");
      el.setAttribute("contenteditable", value);
      // wie im Browser: kein editierbarer Vorfahre -> false
      Object.defineProperty(el, "isContentEditable", { value: false });
      expect(escapeModule.isTextField(el), value).toBe(false);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(escapeModule.isTextField(editable)).toBe(true);

    // im Chatfenster: Escape auf einem solchen Element der Seite schließt
    await mountApp();
    const page = pageElement("div", { contenteditable: "inherit" });
    Object.defineProperty(page, "isContentEditable", { value: false });
    escapeAt(page);
    await flush(2);
    expect($("#anything-llm-chat #message-input")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("N3: Kopfzeile umbricht Name und Untertitel, nie gekürzt", () => {
  const LONG_NAME =
    "KI-Berater der Volkshochschule Rhein-Sieg-Kreis und Umgebung";
  // 59 Zeichen (Höchstlänge 60, ASSISTANT_SUBTITLE_MAX_LEN)
  const LONG_SUBTITLE =
    "durchsucht über 1.243 Kurse in Bonn, Siegburg und Troisdorf";
  // Kopf: keine Ellipse, kein abgeschnittener Text, kein title-Ersatz
  function expectNothingCut(header) {
    for (const el of header.querySelectorAll("*")) {
      expect(el.className?.split?.(/\s+/) || []).not.toContain("allm-truncate");
      expect(el.style.textOverflow).not.toBe("ellipsis");
      expect(el.style.whiteSpace).not.toBe("nowrap");
    }
    const title = header.firstElementChild;
    expect(title.className).not.toMatch(/(^|\s)allm-h-\[/);
    expect(title.className).toMatch(/allm-min-h-\[(76|56)px\]/);
  }

  for (const [name, server, subtitle] of [
    [
      "Standard-Untertitel deutsch",
      {},
      "Online-Berater mit künstlicher Intelligenz",
    ],
    [
      "Standard-Untertitel englisch",
      { language: "en" },
      "Online advisor powered by artificial intelligence",
    ],
    [
      "langer eigener Untertitel",
      { assistantSubtitle: LONG_SUBTITLE },
      LONG_SUBTITLE,
    ],
  ]) {
    it(`langer Name, ${name}: voller Text, umbrechend, kein title`, async () => {
      const { language, ...config } = server;
      const settings = await load(
        { brandText: LONG_NAME, ...(language ? { language } : {}) },
        config,
      );
      embedderSettings.settings = settings;
      render(<ChatWindowHeader settings={{ ...settings, loaded: true }} />);
      const header = $("#anything-llm-header");
      expectNothingCut(header);
      const sub = $("#anything-llm-header-subtitle");
      expect(sub.textContent).toBe(subtitle);
      const nameEl = sub.previousElementSibling;
      expect(nameEl.textContent).toBe(LONG_NAME);
      for (const el of [nameEl, sub]) {
        expect(el.hasAttribute("title")).toBe(false);
        expect(el.style.overflowWrap).toBe("anywhere");
        expect(el.style.whiteSpace).toBe("normal");
      }
      // ⋮ und ✕ im Fluss, schrumpfen nicht; Titelteil mit 8 px Abstand (pr-2)
      const group = $(
        'button[aria-label="Optionen"], button[aria-label="Options"]',
      ).parentElement;
      expect(group.className).toMatch(/allm-flex-shrink-0/);
      expect(header.firstElementChild.className).toMatch(
        /(^|\s)allm-pr-2(\s|$)/,
      );
    });
  }

  it("ohne Untertitel und kompakt: Name umbrechend, Mindesthöhe statt fester Höhe", async () => {
    const settings = await load(
      { brandText: LONG_NAME },
      { assistantSubtitle: "" },
    );
    render(<ChatWindowHeader settings={settings} />);
    expectNothingCut($("#anything-llm-header"));
    expect($("#anything-llm-header-subtitle")).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    render(<ChatWindowHeader settings={settings} compact />);
    const header = $("#anything-llm-header");
    expectNothingCut(header);
    expect(header.firstElementChild.className).toMatch(/allm-min-h-\[56px\]/);
    const nameEl = [...header.querySelectorAll("span")].find(
      (el) => el.textContent === LONG_NAME,
    );
    expect(nameEl.style.overflowWrap).toBe("anywhere");
  });

  it("Menü unter ⋮ wandert mit einem höheren Kopf mit (bei 76 px wie bisher 64 px)", async () => {
    const settings = await load({ brandText: LONG_NAME });
    render(<ChatWindowHeader settings={{ ...settings, loaded: true }} />);
    act(() => $('button[aria-label="Optionen"]').click());
    const menu = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Chat zurücksetzen"),
    )?.parentElement;
    expect(menu).toBeTruthy();
    expect(menu.className).not.toMatch(/allm-top-\[64px\]/);
    // jsdom gibt max() verfälscht wieder („max(64px * , * calc(…))“), im
    // Browser misst tests/visual/n3_header.py die Lage
    const style = menu.getAttribute("style") || "";
    expect(style).toMatch(/top:\s*max\(64px/);
    expect(style).toMatch(/calc\(50% \+ 26px\)/);
  });
});
