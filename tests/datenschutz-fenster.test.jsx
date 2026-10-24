import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Datenschutz als Link in der Fußzeile (issues/datenschutz-fusszeile.md,
// Nutzerentscheidungen 23.10.2026): eine Zeile „Unsere KI kann Fehler machen
// · Datenschutz“ unter der Eingabe, „Datenschutz“ öffnet ein Fenster über dem
// ganzen Chat (role dialog), keine Datenschutz-Blase beim Start, der Link ist
// immer da (privacyNotice wirkt nicht mehr, nur noch „link“).

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
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
// Verlauf ohne Server (ChatWindow lädt ihn über useChatHistory)
const historyState = vi.hoisted(() => ({ value: [] }));
vi.mock("@/hooks/chat/useChatHistory", () => ({
  default: () => ({
    chatHistory: historyState.value,
    setChatHistory: () => {},
    loading: false,
  }),
}));

import { embedderSettings } from "../src/main.jsx";
import {
  DEFAULT_SETTINGS,
  loadEmbedSettings,
} from "../src/hooks/useScriptAttributes.js";
import * as layout from "../src/utils/layout.js";
import * as theme from "../src/utils/theme.js";
import { contrastRatio } from "../src/utils/contrast.js";
import { closeEscapeLayerFor, escapeLayerCount } from "../src/utils/escape.js";
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import ChatWindow from "../src/components/ChatWindow/index.jsx";

const { PANEL_TEXTS } = layout;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const HISTORY = [
  { role: "user", content: "Gibt es Yoga?", sentAt: 1 },
  {
    role: "assistant",
    content: "Ja, montags um 18 Uhr.",
    sentAt: 2,
    chatId: 1,
  },
];
// gespeicherte Altwerte und kein Wert
const SAVED_VALUES = [undefined, "bubble", "none", "modal", "link"];

const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script = {}, server = {}) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));
const serverWith = (privacyNotice, extra = {}) =>
  privacyNotice === undefined ? { ...extra } : { privacyNotice, ...extra };

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
  historyState.value = [];
  chatService.streamChat.mockClear();
  window.localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
function render(el) {
  act(() => root.render(el));
}
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => [...container.querySelectorAll(sel)];
const click = (el) =>
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const tab = (shiftKey = false) => {
  const e = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  act(() => document.activeElement.dispatchEvent(e));
  return e;
};
// Eingabe wie ein Nutzer (React-kontrolliertes Feld)
function typeInto(el, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  ).set;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const link = () => $("#anything-llm-privacy-link");
const dialog = () => $("[role=dialog]");

function renderWindow(settings, props = {}) {
  render(
    <ChatWindow
      closeChat={() => {}}
      settings={{ ...settings, enableStt: false }}
      sessionId="s-1"
      conversationId="c-1"
      {...props}
    />,
  );
}

// ---------------------------------------------------------------------------
describe("AK-10, AK-7: privacyNotice ist immer „link“", () => {
  it.each([
    undefined,
    null,
    "",
    "none",
    " NONE ",
    "bubble",
    "modal",
    "link",
    "popup",
    false,
  ])("gespeichert %j -> link (AI_NOTICE, W8)", (value) => {
    expect(
      layout.applyFixedStandards({ privacyNotice: value }).privacyNotice,
    ).toBe("link");
  });

  it("Standard des Widgets ohne Server-Antwort: link", () => {
    expect(DEFAULT_SETTINGS.privacyNotice).toBe("link");
  });

  it("gespeicherter Wert vom Server und Script-Attribut ändern nichts, auch offline", async () => {
    for (const saved of SAVED_VALUES)
      for (const script of [
        {},
        { privacyNotice: "none" },
        { privacyNotice: "bubble" },
        { privacyNotice: "modal" },
      ])
        expect(
          (await load(script, serverWith(saved))).privacyNotice,
          `${saved} / ${script.privacyNotice}`,
        ).toBe("link");
    const offline = await loadEmbedSettings(
      { ...BASE, privacyNotice: "none" },
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(offline.privacyNotice).toBe("link");
  });

  it("„link“ vom Server ist gültig (keine Warnung), Altwerte ebenso", async () => {
    for (const saved of ["link", "bubble", "none", "modal"]) {
      console.warn.mockClear();
      await load({}, { privacyNotice: saved });
      const warned = console.warn.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes("privacyNotice"));
      expect(warned, saved).toEqual([]);
    }
  });

  // Die Datenschutz-Blase brauchte die Begrüßungsblase (E26); ohne Blase gilt
  // wieder die Regel der festen Standards (Gruppe B): eine Skript-Angabe
  // verfeinert greetingStyle
  it("E26 entfällt: data-greeting-style=text wirkt wieder (Gruppe B), ohne Angabe Blase", async () => {
    expect((await load({ greetingStyle: "text" })).greetingStyle).toBe("text");
    expect((await load({})).greetingStyle).toBe("bubble");
  });
});

// ---------------------------------------------------------------------------
describe("AK-1, AK-7: keine Datenschutz-Blase beim Start, Begrüßung und Vorschläge bleiben", () => {
  it.each(SAVED_VALUES)(
    "gespeichert %j: leerer Chat und Verlauf ohne Datenschutz-Blase",
    async (saved) => {
      const s = await load(
        {},
        serverWith(saved, {
          privacyTitle: "Datenschutz bei uns",
          privacyText: "• Punkt eins der Einrichtung",
          privacyUrl: "https://vhs.example/datenschutz",
          defaultMessages: ["Gibt es Yoga?", "Kurse am Abend?"],
        }),
      );
      render(<ChatHistory settings={s} history={[]} />);
      expect($("#anything-llm-greeting-bubble")).not.toBe(null);
      expect($("#anything-llm-privacy-bubble")).toBe(null);
      expect(container.textContent).not.toContain("Punkt eins der Einrichtung");
      expect(container.textContent).not.toContain("Datenschutz bei uns");
      expect($$("#anything-llm-suggestion-pills button")).toHaveLength(2);
      // Begrüßung bleibt im Verlauf, ohne Datenschutz
      render(<ChatHistory settings={s} history={HISTORY} />);
      const welcome = $("#anything-llm-panel-welcome");
      expect(welcome.querySelector("#anything-llm-greeting-bubble")).not.toBe(
        null,
      );
      expect(welcome.textContent).not.toContain("Punkt eins der Einrichtung");
    },
  );

  it("Standardpunkte erscheinen beim Start nirgends im Chat", async () => {
    const s = await load({});
    render(
      <ChatContainer
        sessionId="s-1"
        knownHistory={[]}
        settings={{ ...s, enableStt: false }}
      />,
    );
    for (const point of PANEL_TEXTS.de.privacyPoints)
      expect(container.textContent).not.toContain(point);
  });
});

// ---------------------------------------------------------------------------
describe("AK-1, AK-2: eine Zeile „Unsere KI kann Fehler machen · Datenschutz“", () => {
  const renderLine = (settings = {}) =>
    render(
      <ChatContainer
        sessionId="s-1"
        knownHistory={[]}
        settings={{ ...BASE, enableStt: false, ...settings }}
      />,
    );

  it("deutsch: KI-Hinweis, Trenner, Link als echter Button", () => {
    renderLine();
    const note = $("#anything-llm-ai-disclaimer");
    expect(note.getAttribute("role")).toBe("note");
    expect(note.textContent).toBe("Unsere KI kann Fehler machen · Datenschutz");
    expect($("#anything-llm-ai-disclaimer-text").textContent).toBe(
      "Unsere KI kann Fehler machen",
    );
    const button = link();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.textContent).toBe("Datenschutz");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    // nur der Linktext ist klickbar
    expect(
      note.querySelectorAll("a, button, [role=button], [tabindex], [onclick]"),
    ).toHaveLength(1);
    // unter dem Eingabefeld
    const input = $("#message-input");
    expect(
      input.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("englisch: „Our AI can make mistakes · Privacy“; französisch deutsch", () => {
    renderLine({ language: "en" });
    expect($("#anything-llm-ai-disclaimer").textContent).toBe(
      "Our AI can make mistakes · Privacy",
    );
    renderLine({ language: "fr" });
    expect($("#anything-llm-ai-disclaimer").textContent).toBe(
      "Unsere KI kann Fehler machen · Datenschutz",
    );
  });

  it("immer eine Zeile: kein Umbruch, der KI-Text kürzt sich notfalls, der Link nie", () => {
    renderLine();
    const note = $("#anything-llm-ai-disclaimer");
    const text = $("#anything-llm-ai-disclaimer-text");
    expect(note.style.whiteSpace).toBe("nowrap");
    expect(note.style.display).toBe("flex");
    expect(text.style.overflow).toBe("hidden");
    expect(text.style.textOverflow).toBe("ellipsis");
    expect(text.getAttribute("title")).toBe("Unsere KI kann Fehler machen");
    expect(link().style.flex).toMatch(/^(none|0 0 auto)$/);
    expect(link().style.whiteSpace).toBe("nowrap");
  });

  it("Linkstil: Linkfarbe, unterstrichen, Trefferfläche mindestens 24 px hoch", () => {
    renderLine();
    const s = link().style;
    expect(s.color).toContain("--allmi-link");
    expect(s.textDecoration).toContain("underline");
    expect(s.minHeight).toBe("24px");
    expect(s.cursor).toBe("pointer");
    expect(link().classList.contains("allm-privacy-link")).toBe(true);
  });

  it("mobil (Viewport < 768 px) und Touch: Trefferfläche mindestens 44 px hoch (Regel in main.jsx)", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/src/main.jsx`, "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(css).toMatch(
      /@media \(max-width: 767px\), \(pointer: coarse\) \{ \.allm-privacy-link \{ min-height: 44px !important;/,
    );
  });

  it("KI-Hinweis und Link bleiben bei disclaimer none, disclaimerText und privacyNotice none", async () => {
    const s = await load(
      {
        disclaimer: "none",
        disclaimerText: "Kein Hinweis",
        privacyNotice: "none",
      },
      { privacyNotice: "none", disclaimer: "none", disclaimerText: "x" },
    );
    renderLine(s);
    expect($("#anything-llm-ai-disclaimer").textContent).toBe(
      "Unsere KI kann Fehler machen · Datenschutz",
    );
    expect(link()).not.toBe(null);
  });
});

// ---------------------------------------------------------------------------
describe("AK-2, NAK-2: Farben des Links fest, Kontrast mindestens 4,5:1", () => {
  const rule = (css, sel) =>
    css.split("\n").find((l) => l.startsWith(`${sel} {`)) || "";
  const valueOf = (decl, prop) =>
    new RegExp(`${prop}: ([^;!]+) !important`).exec(decl)?.[1]?.trim();

  it.each(["light", "dark"])(
    "%s: Regel direkt am Element (Farbe und Fläche)",
    (mode) => {
      const css = theme.buildThemeCss({}, mode);
      const decl = rule(css, `#${theme.PRIVACY_LINK_ID}`);
      const color = valueOf(decl, "color");
      const bg = valueOf(decl, "background-color");
      expect(bg).toBe(theme.AI_NOTICE_COLORS[mode].bg);
      expect(contrastRatio(color, bg)).toBeGreaterThanOrEqual(4.5);
      // Standard: die Linkfarbe des Widgets selbst
      expect(color.toLowerCase()).toBe(
        (mode === "dark"
          ? theme.DARK.link
          : theme.DEFAULT_ACCENT
        ).toLowerCase(),
      );
    },
  );

  it("zu helle Linkfarbe aus dem Design Center wird für den Link abgedunkelt", () => {
    for (const linkColor of [
      "#FFFF00",
      "#7fd3d6",
      "#cccccc",
      "rgb(250, 250, 250)",
    ]) {
      const css = theme.buildThemeCss({ linkColor }, "light");
      const decl = rule(css, `#${theme.PRIVACY_LINK_ID}`);
      expect(
        contrastRatio(valueOf(decl, "color"), "#FFFFFF"),
        linkColor,
      ).toBeGreaterThanOrEqual(4.5);
    }
    // ausreichende Kundenfarbe bleibt unverändert
    const css = theme.buildThemeCss({ linkColor: "#0b5f8a" }, "light");
    expect(valueOf(rule(css, `#${theme.PRIVACY_LINK_ID}`), "color")).toBe(
      "#0b5f8a",
    );
  });

  it("theme.privacyLinkColor: dieselbe Regel als Funktion", () => {
    expect(theme.privacyLinkColor({}, "light").toLowerCase()).toBe(
      theme.DEFAULT_ACCENT,
    );
    expect(theme.privacyLinkColor({ linkColor: "#FFFF00" }, "dark")).toBe(
      theme.DARK.link,
    );
  });
});

// ---------------------------------------------------------------------------
describe("AK-3, AK-5: Datenschutz-Fenster über dem ganzen Chat", () => {
  const OWN = {
    ...BASE,
    privacyTitle: "Datenschutz bei der VHS",
    privacyText: "• Punkt A\n• Punkt B\nAbsatz C",
    privacyUrl: "https://vhs.example/datenschutz",
  };

  it("geschlossen beim Start; Klick auf den Link öffnet das Fenster mit allen Teilen", () => {
    renderWindow(OWN);
    expect(dialog()).toBe(null);
    click(link());
    const d = dialog();
    expect(d).not.toBe(null);
    expect(d.getAttribute("aria-modal")).toBe("true");
    const title = container.querySelector(
      `#${d.getAttribute("aria-labelledby")}`,
    );
    expect(title.tagName).toBe("H2");
    expect(title.textContent).toBe("Datenschutz bei der VHS");
    expect([...d.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Punkt A",
      "Punkt B",
    ]);
    expect(d.textContent).toContain("Absatz C");
    expect(d.textContent).toContain("Hinweis zur KI");
    expect(d.textContent).toContain(PANEL_TEXTS.de.privacyAiText);
    const a = d.querySelector("a");
    expect(a.getAttribute("href")).toBe("https://vhs.example/datenschutz");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.textContent).toBe("Datenschutzerklärung");
    const buttons = [...d.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent.trim())).toContain("Schließen");
    expect(
      d.querySelector("button[aria-label='Datenschutz schließen']"),
    ).not.toBe(null);
  });

  it("deckt das ganze Fenster ab (auch den Kopf), über dem Scroll-Pfeil", () => {
    renderWindow(OWN);
    click(link());
    const d = dialog();
    const header = $("#anything-llm-header");
    expect(d.parentElement.contains(header)).toBe(true);
    expect(d.style.position).toBe("absolute");
    expect(["0", "0px"]).toContain(d.style.inset);
    expect(Number(d.style.zIndex)).toBeGreaterThanOrEqual(60);
    // Bewusste Änderung (R1-D1, 7.23-rc2): Fläche und Schrift fest je
    // Farbschema statt aus den Variablen der Antwortblasen (D2); Regeln im
    // Theme-Stylesheet, inline der helle Rückfall (tests/datenschutz-rc2)
    expect(d.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(d.style.color).toBe("rgb(34, 38, 40)");
  });

  it("Enter auf dem Link (Tastatur) öffnet ebenfalls: echter Button ohne eigene Tastenlogik", () => {
    renderWindow(OWN);
    // Ein <button type=button> löst bei Enter/Leertaste im Browser click aus
    expect(link().tagName).toBe("BUTTON");
    expect(link().disabled).toBe(false);
  });

  it("ohne gespeicherte Werte: Standardüberschrift, Standardpunkte, kein Link zur Erklärung; leere Überschrift = Standard", () => {
    renderWindow(BASE);
    click(link());
    const d = dialog();
    expect(d.querySelector("h2").textContent).toBe("Datenschutz");
    expect([...d.querySelectorAll("li")].map((li) => li.textContent)).toEqual(
      PANEL_TEXTS.de.privacyPoints,
    );
    expect(d.querySelector("a")).toBe(null);
    act(() => root.unmount());
    root = createRoot(container);
    renderWindow({ ...BASE, privacyTitle: "" });
    click(link());
    expect(dialog().querySelector("h2").textContent).toBe("Datenschutz");
  });

  it("englisch: Überschrift, KI-Punkt, Schließen und Symbol", () => {
    renderWindow({ ...BASE, language: "en", privacyUrl: "/privacy" });
    click(link());
    const d = dialog();
    expect(d.querySelector("h2").textContent).toBe("Privacy");
    expect(d.textContent).toContain("About the AI");
    expect(d.textContent).toContain(PANEL_TEXTS.en.privacyAiText);
    expect(d.querySelector("a").textContent).toBe("Privacy statement");
    expect(
      [...d.querySelectorAll("button")].map((b) => b.textContent.trim()),
    ).toContain("Close");
    expect(
      d.querySelector("button[aria-label='Close privacy notice']"),
    ).not.toBe(null);
  });

  it("Fokus beim Öffnen auf der Überschrift; Tab-Reihenfolge Überschrift, Text, Link, Schließen; Tab bleibt im Fenster", () => {
    renderWindow(OWN);
    link().focus();
    click(link());
    const d = dialog();
    const title = d.querySelector("h2");
    expect(document.activeElement).toBe(title);
    const body = $("#anything-llm-privacy-dialog-body");
    const a = d.querySelector("a");
    const close = [...d.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Schließen",
    );
    const icon = d.querySelector("button[aria-label='Datenschutz schließen']");
    // Reihenfolge im Dokument
    const order = [title, body, a, close, icon];
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        `${i}`,
      ).toBeTruthy();
    expect(body.getAttribute("tabindex")).toBe("0");
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(body);
    tab();
    expect(document.activeElement).toBe(a);
    tab();
    expect(document.activeElement).toBe(close);
    tab();
    expect(document.activeElement).toBe(icon);
    tab();
    expect(document.activeElement).toBe(body);
    tab(true);
    expect(document.activeElement).toBe(icon);
  });

  it("langer Text scrollt im Fenster (nur der Textbereich)", () => {
    const long = Array.from(
      { length: 12 },
      (_, i) => `• Punkt ${i + 1} ${"x".repeat(400)}`,
    ).join("\n");
    const s = { ...BASE, privacyText: long };
    renderWindow(s);
    click(link());
    const body = $("#anything-llm-privacy-dialog-body");
    expect(body.style.overflowY).toBe("auto");
    expect(["0", "0px"]).toContain(body.style.minHeight);
    expect(dialog().style.display).toBe("flex");
    expect(dialog().style.flexDirection).toBe("column");
  });
});

// ---------------------------------------------------------------------------
describe("AK-4: Schließen mit Button, Symbol und Escape; Fokus zurück, Eingabe und Verlauf bleiben", () => {
  const openWithDraft = () => {
    historyState.value = HISTORY;
    renderWindow(BASE);
    typeInto($("#message-input"), "Meine halbe Frage");
    link().focus();
    click(link());
    expect(dialog()).not.toBe(null);
  };
  const expectClosed = () => {
    expect(dialog()).toBe(null);
    expect(document.activeElement).toBe(link());
    expect($("#message-input").value).toBe("Meine halbe Frage");
    expect(container.textContent).toContain("Ja, montags um 18 Uhr.");
    expect(escapeLayerCount()).toBe(0);
  };

  it("Button „Schließen“", () => {
    openWithDraft();
    click(
      [...dialog().querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Schließen",
      ),
    );
    expectClosed();
  });

  it("Schließen-Symbol", () => {
    openWithDraft();
    click(dialog().querySelector("button[aria-label='Datenschutz schließen']"));
    expectClosed();
  });

  it("Escape (über die Escape-Ebene wie Chatfenster und In der Seite): nur das Fenster schließt", () => {
    openWithDraft();
    expect(escapeLayerCount()).toBe(1);
    const e = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    let taken;
    act(() => {
      taken = closeEscapeLayerFor(e, { origin: "widget" });
    });
    expect(taken).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expectClosed();
  });

  it("Escape der Webseite schließt das Fenster ohne Fokus-Sprung ins Widget", () => {
    openWithDraft();
    const field = document.createElement("input");
    document.body.appendChild(field);
    try {
      field.focus();
      const e = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        closeEscapeLayerFor(e, { origin: "page" });
      });
      expect(dialog()).toBe(null);
      expect(document.activeElement).toBe(field);
      expect(e.defaultPrevented).toBe(false);
    } finally {
      field.remove();
    }
  });

  it("erneut öffnen und schließen: wieder genau eine Escape-Ebene", () => {
    openWithDraft();
    click(dialog().querySelector("button[aria-label='Datenschutz schließen']"));
    click(link());
    expect(escapeLayerCount()).toBe(1);
    click(dialog().querySelector("button[aria-label='Datenschutz schließen']"));
    expect(escapeLayerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("NAK-4: Fokus gefangen, kein Absenden im Hintergrund per Tastatur", () => {
  it("Fokus auf ein Element hinter dem Fenster springt zurück ins Fenster", () => {
    renderWindow(BASE);
    click(link());
    const input = $("#message-input");
    act(() => input.focus());
    expect(dialog().contains(document.activeElement)).toBe(true);
    // Enter im Eingabefeld erreicht es nicht: kein Senden
    expect(chatService.streamChat).not.toHaveBeenCalled();
    // Knöpfe im Kopf ebenso
    const headerButton = $("#anything-llm-header button");
    act(() => headerButton.focus());
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("nach dem Schließen ist das Eingabefeld wieder fokussierbar", () => {
    renderWindow(BASE);
    click(link());
    click(dialog().querySelector("button[aria-label='Datenschutz schließen']"));
    const input = $("#message-input");
    act(() => input.focus());
    expect(document.activeElement).toBe(input);
  });

  it("In der Seite: Einklappen (collapsed) schließt ein offenes Fenster", () => {
    renderWindow(BASE, { collapsed: false });
    click(link());
    expect(dialog()).not.toBe(null);
    renderWindow(BASE, { collapsed: true });
    expect(dialog()).toBe(null);
    expect(escapeLayerCount()).toBe(0);
    renderWindow(BASE, { collapsed: false });
    expect(dialog()).toBe(null);
  });
});

// ---------------------------------------------------------------------------
describe("NAK-1: Titel und Text aus dem Design Center nie als HTML", () => {
  it("<img onerror> und <a href=javascript:> erscheinen als Text", async () => {
    const s = await load(
      {},
      {
        privacyTitle: '<img src=x onerror="alert(1)">',
        privacyText:
          '• <img src=x onerror="alert(1)">\n<a href="javascript:alert(1)">klick</a>',
      },
    );
    renderWindow(s);
    click(link());
    const d = dialog();
    expect(d.querySelector("img")).toBe(null);
    expect(d.querySelector("a")).toBe(null);
    expect(d.querySelector("h2").textContent).toBe(
      '<img src=x onerror="alert(1)">',
    );
    expect(d.textContent).toContain('<a href="javascript:alert(1)">klick</a>');
  });
});

// ---------------------------------------------------------------------------
describe("NAK-3: privacyUrl nur als http(s)-Link", () => {
  it.each([
    ["javascript:alert(1)", null],
    ["JavaScript:alert(1)", null],
    ["data:text/html,<b>x</b>", null],
    ["vbscript:msgbox(1)", null],
    ["//evil.example/datenschutz", null],
    ["/\\evil.example/datenschutz", null],
    ["ftp://vhs.example/datenschutz", null],
    ["https://vhs.example/datenschutz", "https://vhs.example/datenschutz"],
    ["/datenschutz", "/datenschutz"],
  ])("Server liefert %j -> Link %j", async (url, expected) => {
    const s = await load({}, { privacyUrl: url });
    renderWindow(s);
    click(link());
    const a = dialog().querySelector("a");
    if (expected === null) expect(a).toBe(null);
    else {
      expect(a.getAttribute("href")).toBe(expected);
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("auch ungeprüft übergebene Werte (ohne loadEmbedSettings): nur http(s)", () => {
    expect(layout.privacyHref("javascript:alert(1)")).toBe(null);
    expect(layout.privacyHref(" javascript:alert(1)")).toBe(null);
    expect(layout.privacyHref("data:text/html,x")).toBe(null);
    expect(layout.privacyHref("https://vhs.example/ds")).toBe(
      "https://vhs.example/ds",
    );
    expect(layout.privacyHref("/ds")).toBe("/ds");
    expect(layout.privacyHref(null)).toBe(null);
    renderWindow({ ...BASE, privacyUrl: "javascript:alert(1)" });
    click(link());
    expect(dialog().querySelector("a")).toBe(null);
  });
});

// ---------------------------------------------------------------------------
describe("NAK-2: Script-Attribute blenden Link, Fenster und KI-Hinweis nicht aus", () => {
  it("data-privacy-notice, data-privacy-text, data-privacy-title, data-privacy-url, data-disclaimer wirken nicht", async () => {
    const s = await load({
      privacyNotice: "none",
      privacyText: "Nur vom Skript",
      privacyTitle: "Skript-Titel",
      privacyUrl: "https://skript.example/ds",
      disclaimer: "none",
      disclaimerText: "Skript-Hinweis",
    });
    expect(s.privacyNotice).toBe("link");
    renderWindow(s);
    expect($("#anything-llm-ai-disclaimer").textContent).toBe(
      "Unsere KI kann Fehler machen · Datenschutz",
    );
    click(link());
    const d = dialog();
    expect(d.querySelector("h2").textContent).toBe("Datenschutz");
    expect(d.textContent).not.toContain("Nur vom Skript");
    expect(d.querySelector("a")).toBe(null);
  });
});

// ---------------------------------------------------------------------------
describe("Datenschutz-Text im Fenster: Absätze und Punkte, Link am Ende", () => {
  it("gemischter Text: Absatz, Liste, Absatz, KI-Punkt, Link in eigener Zeile", () => {
    renderWindow({
      ...BASE,
      privacyText:
        "Wir nehmen Datenschutz ernst.\n• Server in Deutschland\n- Keine Weitergabe\nFragen? Schreiben Sie uns.",
      privacyUrl: "https://vhs.example/datenschutz",
    });
    click(link());
    // Bewusste Änderung (W6, R1-D2): die Blöcke stehen in der Textspalte im
    // Textbereich (In der Seite höchstens 70 Zeichen breit)
    const body = $(
      "#anything-llm-privacy-dialog-body > .allm-privacy-dialog-text",
    );
    expect([...body.children].map((el) => el.tagName)).toEqual([
      "P",
      "UL",
      "P",
      "DIV",
      "A",
    ]);
    expect([...body.querySelectorAll("li")].map((l) => l.textContent)).toEqual([
      "Server in Deutschland",
      "Keine Weitergabe",
    ]);
    expect(body.lastElementChild.textContent).toBe("Datenschutzerklärung");
    expect(body.textContent).not.toMatch(/[–—]/);
  });

  it("altes Format (|) wird zur Aufzählung", () => {
    renderWindow({ ...BASE, privacyText: "Erstens. | Zweitens! | Drittens" });
    click(link());
    expect(
      [...dialog().querySelectorAll("li")].map((l) => l.textContent),
    ).toEqual(["Erstens.", "Zweitens!", "Drittens"]);
  });
});

// ---------------------------------------------------------------------------
// NAK-2, Seiten-CSS: bis 7.23-rc1 prüfte readableGuard die berechneten
// Farben (nur rgb()) und fiel auf feste Werte zurück. Bewusste Änderung
// (R1-D1): das Fenster hat immer feste Farben je Farbschema, keine Variable
// der Seite wirkt darauf; Tests in tests/datenschutz-rc2.test.jsx, im
// Browser tests/visual/datenschutz_fenster.py (Fallen mit oklch() und
// color-mix()).
