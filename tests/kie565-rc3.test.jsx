import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// KIE-565, Korrekturrunde 7.22-rc3 (Fixliste issues/rollout-721/
// fixliste-7.22-rc3.md, Teil Widget): Escape schließt die Chatblase,
// inlineInput-Warnung nur bei Script-Attribut, Standardname je Sprache,
// Altlisten der Begrüßung, feste Randabstände/Max. Breite, inheritFont
// Inline, „Kopiert!“ je Sprache, Pillen und Logo im dunklen Theme, Verlauf
// ohne Überhang unter der Eingabe, Kartenantwort: Frage bleibt oben,
// Teaser in der Chatblase 2 Zeilen, Konsolenmeldungen ohne Gedankenstrich.

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
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
  I18nextProvider: ({ children }) => children,
}));
vi.mock("@/i18n", () => ({ default: {} }));
// Chatfenster der Blase: schlanker Ersatz mit Eingabefeld (Fokus-Test)
vi.mock("@/components/ChatWindow", () => ({
  default: () => (
    <div id="chat-window-stub">
      <textarea id="message-input" />
    </div>
  ),
}));

import { embedderSettings } from "../src/main.jsx";
import App from "../src/App.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import {
  INLINE_STANDARDS,
  LEGACY_DEFAULT_TEXTS,
  dropLegacyDefaults,
  greetingText,
  warnIfInlineInputIgnored,
} from "../src/utils/layout.js";
import {
  DARK,
  INLINE_RADIUS,
  buildThemeCss,
  resolveThemeVars,
} from "../src/utils/theme.js";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import Pill from "../src/components/ChatWindow/ChatContainer/ChatHistory/Pill/index.jsx";
import { EmbedModeContext } from "../src/hooks/useEmbedMode.js";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
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
  embedderSettings.settings = {};
  embedderSettings.shadowRoot = null;
  embedderSettings.hostElement = null;
  window.sessionStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render(el) {
  act(() => root.render(el));
}
const $ = (sel) => container.querySelector(sel);

// App mit gemocktem /config; Script-Attribute = embedderSettings.settings
async function mountApp(script, config = {}) {
  embedderSettings.settings = { ...BASE, ...script };
  embedderSettings.shadowRoot = document;
  // Shadow-Host-Ersatz: Ereignisse aus dem Widget tragen ihn im composedPath
  embedderSettings.hostElement = container;
  vi.stubGlobal("fetch", fetchConfig(config));
  await act(async () => root.render(<App />));
  // Settings laden, Status prüfen, Darstellung festlegen
  for (let i = 0; i < 5; i++) await act(async () => {});
}
const escape = (target = document) =>
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
      }),
    );
  });

// ---------------------------------------------------------------------------
describe("Escape schließt die Chatblase (Nr. 26, D7)", () => {
  it("Escape im Textfeld des Chats: Fenster zu, Fokus auf dem Chat-Knopf", async () => {
    await mountApp({ openOnLoad: "on" });
    expect($("#chat-window-stub")).not.toBeNull();
    $("#message-input").focus();
    escape($("#message-input"));
    expect($("#chat-window-stub")).toBeNull();
    const button = $("#anything-llm-embed-chat-button");
    expect(button).not.toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("Escape ohne Fokus im Widget (Seite) schließt ebenfalls", async () => {
    await mountApp({ openOnLoad: "on" });
    escape(document.body);
    expect($("#chat-window-stub")).toBeNull();
  });

  it("Escape in einem Eingabefeld der Seite und bereits verarbeitetes Escape: bleibt offen", async () => {
    await mountApp({ openOnLoad: "on" });
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    escape(field);
    expect($("#chat-window-stub")).not.toBeNull();
    field.remove();
    act(() => {
      const e = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      e.preventDefault();
      document.dispatchEvent(e);
    });
    expect($("#chat-window-stub")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("inlineInput-Warnung nur bei Script-Attribut (Nr. 14, W03)", () => {
  const inlineWarnings = (warn) =>
    warn.mock.calls.filter(([m]) => String(m).includes("inlineInput"));

  it("Server liefert inlineInput (fester Inline-Standard) an eine Chatblase: keine Warnung", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mountApp({}, { inlineInput: true, inlineOpenOn: "focus" });
    expect($("#anything-llm-embed-chat-button")).not.toBeNull();
    expect(inlineWarnings(warn)).toHaveLength(0);
  });

  it('data-inline-input="true" am Script einer Chatblase: genau eine Warnung, ohne Gedankenstrich', async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mountApp({ inlineInput: "true" }, { inlineInput: true });
    const calls = inlineWarnings(warn);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatch(/inlineInput.*ignoriert/);
    expect(calls[0][0]).not.toMatch(/[–—]/);
    // Prüfung über die rohen Attribute (Strings wie am Script-Tag)
    expect(warnIfInlineInputIgnored({ inlineInput: "" }, false)).toBe(true);
    expect(warnIfInlineInputIgnored({ inlineInput: "false" }, false)).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
describe("Konsolenmeldungen ohne Gedankenstrich (Nr. 24, D8)", () => {
  // Alle console.warn/error/log/info-Aufrufe in src: die Textliterale im
  // Aufruf (bis zur schließenden Klammer) enthalten weder – noch —
  function files(dir) {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return f === "locales" ? [] : files(p);
      return /\.(jsx?|mjs)$/.test(f) ? [p] : [];
    });
  }
  it("keine – oder — in Konsolenmeldungen des Widgets", () => {
    const bad = [];
    for (const file of files(join(__dirname, "..", "src"))) {
      const src = readFileSync(file, "utf8");
      const re = /console\.(warn|error|log|info)\(/g;
      let m;
      while ((m = re.exec(src))) {
        let depth = 1;
        let i = m.index + m[0].length;
        for (; i < src.length && depth > 0; i++) {
          if (src[i] === "(") depth += 1;
          else if (src[i] === ")") depth -= 1;
        }
        const call = src.slice(m.index, i);
        if (/[–—]/.test(call)) bad.push(`${file}: ${call.slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("ungültiger Wert: Warnung nennt den Wert ohne Gedankenstrich", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadEmbedSettings({ ...BASE, theme: "blau" }, fetchConfig({}));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).not.toMatch(/[–—]/);
  });
});

// ---------------------------------------------------------------------------
describe("Standardname je Sprache (Nr. 16, W05)", () => {
  it("ohne Namen: de „KI-Berater“, en „AI Advisor“; eigener Name bleibt", async () => {
    const de = await loadEmbedSettings(BASE, fetchConfig({}));
    expect(de.brandText).toBe("KI-Berater");
    expect(de.assistantName).toBe("KI-Berater");
    const en = await loadEmbedSettings(
      { ...BASE, language: "en" },
      fetchConfig({}),
    );
    expect(en.brandText).toBe("AI Advisor");
    expect(en.assistantName).toBe("AI Advisor");
    const own = await loadEmbedSettings(
      { ...BASE, language: "en" },
      fetchConfig({ brandText: "Kursberater", assistantName: "Kursberater" }),
    );
    expect(own.brandText).toBe("Kursberater");
    expect(own.assistantName).toBe("Kursberater");
  });
});

// ---------------------------------------------------------------------------
describe("Altlisten der Begrüßung (Nr. 19, W08)", () => {
  it("greeting und greetingBubbleText: dieselben vier früheren Standardtexte", () => {
    expect(LEGACY_DEFAULT_TEXTS.greeting).toEqual(
      LEGACY_DEFAULT_TEXTS.greetingBubbleText,
    );
    expect(LEGACY_DEFAULT_TEXTS.greeting).toHaveLength(4);
    const bubble =
      "Hallo! Ich bin Ihr digitaler Berater mit künstlicher Intelligenz (KI). Beschreiben Sie einfach, was Sie suchen.";
    const s = dropLegacyDefaults({ greeting: bubble });
    expect(s.greeting).toBeUndefined();
    expect(greetingText(s)).toBe(
      "Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?",
    );
    expect(
      dropLegacyDefaults({
        greetingBubbleText: LEGACY_DEFAULT_TEXTS.greeting[0],
      }).greetingBubbleText,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("Feste Randabstände und Max. Breite, inheritFont Inline (Nr. 15, 18)", () => {
  it("data-offset-x/-y und data-inline-max-width wirken nicht mehr; inlineTheme bleibt", async () => {
    const s = await loadEmbedSettings(
      {
        ...BASE,
        displayMode: "inline",
        offsetX: "120",
        offsetY: "40",
        inlineMaxWidth: "600px",
        inlineTheme: "dark",
      },
      fetchConfig({}),
    );
    expect(s.offsetX).toBe(null);
    expect(s.offsetY).toBe(null);
    expect(s.inlineMaxWidth).toBe(null);
    expect(s.inlineTheme).toBe("dark");
  });

  it("Inline ohne Angabe: Seitenschrift (inheritFont true), Chatblase nicht", async () => {
    expect(INLINE_STANDARDS.inheritFont).toBe(true);
    const inline = await loadEmbedSettings(
      { ...BASE, displayMode: "inline" },
      fetchConfig({}),
    );
    expect(inline.inheritFont).toBe(true);
    const bubble = await loadEmbedSettings(BASE, fetchConfig({}));
    expect(bubble.inheritFont).toBe(false);
    const off = await loadEmbedSettings(
      { ...BASE, displayMode: "inline", inheritFont: "false" },
      fetchConfig({}),
    );
    expect(off.inheritFont).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("„Kopiert!“ je Sprache (Nr. 34, B-09)", () => {
  function copyId(settings) {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn() },
    });
    render(
      <ChatWindowHeader
        sessionId="s-1"
        conversationId="c-1"
        settings={{ loaded: true, ...settings }}
        closeChat={() => {}}
        setChatHistory={() => {}}
      />,
    );
    act(() => $('[aria-label="Options"]').click());
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Chat-ID",
    );
    act(() => button.click());
    return container.textContent;
  }
  it("deutsch „Kopiert!“, englisch „Copied!“", () => {
    expect(copyId({ sessionBurgerText: "Chat-ID" })).toContain("Kopiert!");
    act(() => root.unmount());
    root = createRoot(container);
    expect(copyId({ sessionBurgerText: "Chat-ID", language: "en" })).toContain(
      "Copied!",
    );
  });
});

// ---------------------------------------------------------------------------
describe("Dunkel: Pillen im Panelton, Folgefragen lesbar, Logo-Kachel (Nr. 30, B-04)", () => {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const l = c.map((v) =>
      v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  };
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it("Theme: dunkel Pillen transparent, Folgefragen-Text im Text des dunklen Satzes (≥ 4,5:1), Logo gerundet; hell unverändert", () => {
    const dark = resolveThemeVars({}, "dark");
    expect(dark["--allm-pill-bg"]).toBe("transparent");
    expect(dark["--allm-pill-accent-text"]).toBe(DARK.text);
    expect(contrast(DARK.text, DARK.surface)).toBeGreaterThanOrEqual(4.5);
    expect(dark["--allm-logo-radius"]).toBe("22%");
    const light = resolveThemeVars({}, "light");
    expect(light["--allm-pill-bg"]).toBe("var(--allmi-bar-bg)");
    expect(light["--allm-pill-accent-text"]).toBe("var(--allmi-accent)");
    expect(light["--allm-logo-radius"]).toBe(null);
    expect(buildThemeCss({}, "light")).toContain(
      "--allmi-logo-radius: var(--allm-logo-radius);",
    );
  });

  it("Start- und Folgefragen-Pille: gleiche Fläche, Folgefragen-Text über --allmi-pill-accent-text", () => {
    render(
      <div>
        <Pill text="Start" onClick={() => {}} />
        <Pill text="Folge" variant="accent" onClick={() => {}} />
      </div>,
    );
    const [start, follow] = [...container.querySelectorAll("button")];
    expect(start.style.backgroundColor).toBe(follow.style.backgroundColor);
    expect(start.style.backgroundColor).toContain("--allmi-pill-bg");
    expect(follow.style.color).toContain("--allmi-pill-accent-text");
  });

  it("Logo im Kopf und Avatar der Begrüßung: Rundung --allmi-logo-radius", () => {
    render(
      <ChatWindowHeader
        settings={{ loaded: true }}
        iconUrl="https://x.test/logo.png"
        closeChat={() => {}}
        setChatHistory={() => {}}
      />,
    );
    expect($('img[alt="Brand"]').style.borderRadius).toBe(
      "var(--allmi-logo-radius)",
    );
    act(() => root.unmount());
    root = createRoot(container);
    render(
      <ChatHistory
        settings={{
          greetingStyle: "bubble",
          suggestionStyle: "pills",
          privacyNotice: "bubble",
        }}
        history={[]}
      />,
    );
    expect($("#anything-llm-panel-welcome img").style.borderRadius).toBe(
      "var(--allmi-logo-radius)",
    );
  });
});

// ---------------------------------------------------------------------------
const COURSE_BASE = "https://aw.donau.kufer.de/kurssuche/kurs";
const YOGA = {
  url: `${COURSE_BASE}/yoga-aufbaukurs/262-3103`,
  title: "Yoga (Aufbaukurs)",
  start_date: "2026-09-14",
  start_minutes: 1080,
  weekdays: ",mon,",
  price: 60,
  bookable: true,
  format: "onsite",
};
const ENGLISH = {
  url: `${COURSE_BASE}/englisch-1/262-4601A`,
  title: "Englisch 1",
  start_date: "2026-09-16",
  start_minutes: 1110,
  weekdays: ",wed,",
  price: 90,
  bookable: true,
  format: "online",
};
const TEASERS = {
  [YOGA.url]: "Für alle mit Yoga-Erfahrung: kräftigende Haltungen am Abend.",
  [ENGLISH.url]: "Online-Einstieg in Englisch mit viel Sprechpraxis.",
};
const ABOVE = {
  courseCards: "auto",
  courseCardsPosition: "above",
  followUps: "pills",
};
const user = { role: "user", content: "Yoga am Abend?", sentAt: 1759651200 };
const reply = `Ja: [${YOGA.title}](${YOGA.url}) und [${ENGLISH.title}](${ENGLISH.url}).`;
const answer = (extra = {}) => ({
  role: "assistant",
  content: reply,
  sentAt: 1759651205,
  chatId: 3,
  sources: [],
  courseSources: [{ ...YOGA }, { ...ENGLISH }],
  courseCardsAnnounced: 2,
  courseTeasers: TEASERS,
  ...extra,
});

describe("Kurskarten in der Chatblase: Teaser 2 Zeilen (Nr. 35, K-1)", () => {
  it("Chatblase (ohne Inline-Kontext): Rasterkarte mit Teaser höchstens 2 Zeilen; Inline 3", () => {
    render(<ChatHistory settings={ABOVE} history={[user, answer()]} />);
    const t = [...container.querySelectorAll(".allm-course-teaser")];
    expect(t).toHaveLength(2);
    for (const el of t)
      expect(el.style.webkitLineClamp || el.style.WebkitLineClamp).toBe("2");
    act(() => root.unmount());
    root = createRoot(container);
    render(
      <EmbedModeContext.Provider
        value={{
          inline: true,
          overlay: false,
          consumeFocusRequest: () => false,
        }}
      >
        <ChatHistory settings={ABOVE} history={[user, answer()]} />
      </EmbedModeContext.Provider>,
    );
    for (const el of container.querySelectorAll(".allm-course-teaser"))
      expect(el.style.webkitLineClamp || el.style.WebkitLineClamp).toBe("3");
  });
});

describe("Kartenantwort: Folgefragen scrollen nicht über die Frage hinaus (Nr. 35, K-1)", () => {
  // Layout-Ersatz wie courseCardsV2 (jsdom rechnet nicht): Frage = Anker bei
  // anchorTop px im Inhalt, Inhaltshöhe scrollHeight, sichtbare Höhe
  // clientHeight
  let layout;
  let scrollTo;
  const tops = new WeakMap();
  beforeEach(() => {
    layout = { scrollHeight: 500, clientHeight: 400, anchorTop: 300 };
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get() {
        return tops.get(this) || 0;
      },
      set(v) {
        tops.set(this, v);
      },
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      () => layout.scrollHeight,
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      () => layout.clientHeight,
    );
    scrollTo = vi
      .spyOn(Element.prototype, "scrollTo")
      .mockImplementation(function ({ top }) {
        const max = layout.scrollHeight - layout.clientHeight;
        this.scrollTop = Math.max(0, Math.min(top, max));
      });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function () {
        if (this.id === "chat-history") return { top: 0 };
        const sc = this.closest("#chat-history");
        return { top: layout.anchorTop - (sc ? sc.scrollTop : 0) };
      },
    );
  });
  afterEach(() => {
    delete HTMLElement.prototype.scrollTop;
  });
  const scroller = () => $("#chat-history");
  const streaming = (extra = {}) =>
    answer({
      content: "",
      chatId: undefined,
      animate: true,
      pending: true,
      ...extra,
    });

  it("Karten + lange Antwort: Frage bleibt oben, kein Sprung ans Ende", () => {
    render(<ChatHistory settings={ABOVE} history={[user, streaming()]} />);
    layout.scrollHeight = 1600;
    render(
      <ChatHistory
        settings={ABOVE}
        history={[user, streaming({ content: "Ja, am Abend." })]}
      />,
    );
    expect(scroller().scrollTop).toBe(292); // Frage oben
    render(
      <ChatHistory
        settings={ABOVE}
        history={[
          user,
          answer({ followUps: ["Auch online?"], followUpsArrivedAt: 1 }),
        ]}
      />,
    );
    expect($("#anything-llm-follow-ups")).not.toBeNull();
    expect(scroller().scrollTop).toBe(292);
    expect(
      scrollTo.mock.calls.filter(
        ([o]) => o.top > 292 && o.behavior === "smooth",
      ),
    ).toHaveLength(0);
  });

  it("Karten + kurzer Turn: Folgefragen kommen trotzdem ins Bild", () => {
    layout.anchorTop = 600;
    layout.scrollHeight = 900; // Ende (500) liegt vor der Frage (592)
    render(<ChatHistory settings={ABOVE} history={[user, answer()]} />);
    tops.set(scroller(), 300);
    render(
      <ChatHistory
        settings={ABOVE}
        history={[
          user,
          answer({ followUps: ["Auch online?"], followUpsArrivedAt: 2 }),
        ]}
      />,
    );
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 592, behavior: "smooth" });
    expect(scroller().scrollTop).toBe(500);
  });

  it("Verlauf ohne Überhang: Höhe inklusive Polsterung (box-border)", () => {
    render(<ChatHistory settings={ABOVE} history={[user, answer()]} />);
    expect(scroller().className).toContain("allm-box-border");
    expect(scroller().className).toContain("allm-h-full");
  });
});

// Rundungen der Demo als Werte (Nr. 4, W02)
describe("Inline-Rundungen (Nr. 4, W02)", () => {
  it("Panel 40, Karten 14, Blasen 18, Leiste/Pille 999 px", () => {
    expect(INLINE_RADIUS).toEqual({
      panel: "40px",
      card: "14px",
      bubble: "18px",
      bar: "999px",
    });
  });
});
