import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import tailwindConfig from "../tailwind.config.js";

// Korrekturrunde 7.22-rc18, Teil Widget (issues/rollout-721/
// fixliste-7.22-rc18.md, Details review-7.22-nachreview-rc17.md):
// W60/E26 Datenschutz-Hinweis an: Begrüßung als Blase auch gegen
//   data-greeting-style="text", die Datenschutz-Blase ist sichtbar (leerer
//   Chat und Verlauf); Hinweis aus: "text" wirkt.
// W61 Textzweig mit dem Begrüßungsstandard der Sprache.
// W62/E25 feste Farben des KI-Hinweises und der Datenschutz-Blase direkt am
//   Element, Gruppe A auf jedem Element (gegen @property der Seite; der
//   Browser-Beleg steht in tests/visual/rc18_farben.py).
// W64 Logo-Rahmen mit Rand im kompakten Kopf: border-box, 57 px (seit
//   Fixliste 7.22-rc20 E34 nur kompakt, normal content-box wie rc14).
// N17 CSS-weite Schlüsselwörter in cssValue abgelehnt.
// C18 eine Regel für FIXED_STANDARDS und INLINE_STANDARDS.
// E29 historyEnabled bleibt vom Server bestimmt.
// Neue Funktionen über Namensraum-Importe: am alten Stand scheitert der
// einzelne Test an seiner Prüfung, nicht die Datei am Import.

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

import { embedderSettings } from "../src/main.jsx";
import * as scriptAttrs from "../src/hooks/useScriptAttributes.js";
import * as layout from "../src/utils/layout.js";
import * as theme from "../src/utils/theme.js";
import { contrastRatio } from "../src/utils/contrast.js";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";

const { loadEmbedSettings } = scriptAttrs;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// Antwort eines Servers ab 7.22 ohne gespeicherte Werte (wie
// rc17-rangfolge.test.jsx)
const SERVER_STANDARDS = {
  greetingStyle: "bubble",
  suggestionStyle: "pills",
  followUps: "pills",
  disclaimer: "footer",
  onlineDot: false,
  courseCardsAnswerStyle: "short",
  courseCardsLayout: "rows",
  inlineInput: true,
  inlineOpenOn: "focus",
  inlineEffect: "morph",
  inlineLayout: "overlay",
  inlineStartState: "collapsed",
  inlineHeight: "520px",
  inheritFont: true,
  privacyNotice: "bubble",
  courseCardsPosition: "above",
  welcomeBubblesDesktop: "first",
  welcomeBubblesMobile: "first",
  defaultMessages: ["Ich suche einen Deutschkurs."],
  defaultMessagesStandard: true,
};
const PRIVACY_OFF = { ...SERVER_STANDARDS, privacyNotice: "none" };
const HISTORY = [
  { role: "user", content: "Gibt es Yoga?", sentAt: 1 },
  { role: "assistant", content: "Ja, montags.", sentAt: 2, chatId: 1 },
];

const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server = SERVER_STANDARDS) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
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
function rerender(el) {
  act(() => root.unmount());
  root = createRoot(container);
  render(el);
}
const $ = (sel) => container.querySelector(sel);

// ---------------------------------------------------------------------------
describe("W60/E26: Datenschutz-Hinweis an, Begrüßung als Blase auch gegen data-greeting-style=text", () => {
  it("leerer Chat und Verlauf: Datenschutz-Blase sichtbar unter der Begrüßungsblase", async () => {
    const s = await load({ greetingStyle: "text" });
    expect(s.privacyNotice).toBe("bubble");
    expect(s.greetingStyle).toBe("bubble");
    // leerer Chat (PanelWelcome)
    render(<ChatHistory settings={s} history={[]} />);
    const greeting = $("#anything-llm-greeting-bubble");
    const privacy = $("#anything-llm-privacy-bubble");
    expect(greeting).not.toBeNull();
    expect(privacy).not.toBeNull();
    expect(greeting.nextElementSibling).toBe(privacy);
    expect(privacy.textContent).toContain(
      layout.PANEL_TEXTS.de.privacyPoints[0],
    );
    // mit Verlauf (PanelGreeting): Blase bleibt erstes Element
    rerender(<ChatHistory settings={s} history={HISTORY} />);
    const list = $("#chat-history").firstElementChild;
    const welcome = list.firstElementChild;
    expect(welcome.id).toBe("anything-llm-panel-welcome");
    expect(welcome.querySelector("#anything-llm-privacy-bubble")).not.toBe(
      null,
    );
  });

  it("auch ohne Antwort vom Server (Hinweis bleibt an) und im ganzen Chatfenster", async () => {
    const offline = await loadEmbedSettings(
      { ...BASE, greetingStyle: "text" },
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(offline.privacyNotice).toBe("bubble");
    expect(offline.greetingStyle).toBe("bubble");
    render(
      <ChatContainer
        sessionId="s-1"
        conversationId="c-1"
        knownHistory={[]}
        settings={{ ...offline, enableStt: false }}
      />,
    );
    expect($("#anything-llm-privacy-bubble")).not.toBeNull();
  });

  it("Gegenprobe: Datenschutz-Hinweis aus, dann wirkt data-greeting-style=text", async () => {
    const s = await load({ greetingStyle: "text" }, PRIVACY_OFF);
    expect(s.privacyNotice).toBe("none");
    expect(s.greetingStyle).toBe("text");
    render(<ChatHistory settings={s} history={[]} />);
    expect($("#anything-llm-greeting-bubble")).toBeNull();
    expect($("#anything-llm-privacy-bubble")).toBeNull();
    // ohne Skript-Angabe weiter die Blase (ohne Datenschutz-Blase)
    const t = await load({}, PRIVACY_OFF);
    expect(t.greetingStyle).toBe("bubble");
    rerender(<ChatHistory settings={t} history={[]} />);
    expect($("#anything-llm-greeting-bubble")).not.toBeNull();
    expect($("#anything-llm-privacy-bubble")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("W61: Textzweig mit dem Begrüßungsstandard der Sprache", () => {
  const textOf = () => $("p.allm-text-center")?.textContent;

  it("ohne gespeicherte Begrüßung: Standard der Sprache statt „Send a chat to get started.“", async () => {
    const de = await load({ greetingStyle: "text" }, PRIVACY_OFF);
    expect(de.greeting).toBe(null);
    render(<ChatHistory settings={de} history={[]} />);
    expect(textOf()).toBe(layout.PANEL_TEXTS.de.greetingBubble);
    expect(container.textContent).not.toContain("Send a chat");
    const en = await load(
      { greetingStyle: "text", language: "en" },
      PRIVACY_OFF,
    );
    rerender(<ChatHistory settings={en} history={[]} />);
    expect(textOf()).toBe(layout.PANEL_TEXTS.en.greetingBubble);
  });

  it("gespeicherte Begrüßung wie in der Blase (gekürzt)", async () => {
    const long = `${"Willkommen bei der Volkshochschule ".repeat(12)}Ende`;
    const s = await load(
      { greetingStyle: "text" },
      { ...PRIVACY_OFF, greeting: long },
    );
    render(<ChatHistory settings={s} history={[]} />);
    expect(textOf()).toBe(layout.greetingText(s));
    expect(textOf().length).toBeLessThanOrEqual(
      layout.GREETING_BUBBLE_TEXT_MAX_LEN,
    );
    expect(textOf().endsWith("…")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regeln im Theme-Stylesheet: Blöcke und Element-Regeln einzeln
function rules(css) {
  return css
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
function ruleFor(css, selector) {
  return rules(css).find((r) => r.startsWith(`${selector} {`)) || "";
}

describe("W62/E25: feste Farben direkt am Element, Gruppe A auf jedem Element", () => {
  const settings = { buttonColor: "#0b5f8a", userTextColor: "#FFFFFF" };

  it("Gruppe A und feste Farben als Block für :host und jedes Element, mit !important", () => {
    for (const mode of ["light", "dark"]) {
      const css = theme.buildThemeCss(settings, mode);
      const block = ruleFor(css, ":host, :host *");
      expect(block, mode).not.toBe("");
      for (const name of [
        "accent",
        "user-bg",
        "user-text",
        "on-accent",
        "link",
      ])
        expect(block, `${mode} ${name}`).toMatch(
          new RegExp(`--allmi-${name}: [^;]+ !important;`),
        );
      expect(block).toContain("--allmi-accent: #0b5f8a !important;");
      expect(block).not.toContain("var(");
    }
  });

  it("KI-Hinweis: Schrift und Fläche als Regel am Element, ohne Variable, lesbar hell und dunkel", () => {
    for (const mode of ["light", "dark"]) {
      const css = theme.buildThemeCss(settings, mode);
      const { text, bg } = theme.AI_NOTICE_COLORS[mode];
      const p = ruleFor(css, "#anything-llm-ai-disclaimer");
      const span = ruleFor(css, "#anything-llm-ai-disclaimer > span");
      expect(p, mode).toBe(
        `#anything-llm-ai-disclaimer { color: ${text} !important; }`,
      );
      expect(span, mode).toBe(
        `#anything-llm-ai-disclaimer > span { background-color: ${bg} !important; }`,
      );
      expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("E25 Datenschutz-Blase: Text, Überschrift und Fläche fest je Farbschema, Kontrast mindestens 4,5:1", () => {
    const colors = theme.PRIVACY_NOTICE_COLORS;
    expect(colors).toBeTruthy();
    for (const mode of ["light", "dark"]) {
      // auch mit Einbau-Angabe data-assistant-bg-color gleich der Textfarbe
      const css = theme.buildThemeCss(
        { ...settings, assistantBgColor: colors[mode].text },
        mode,
      );
      const { text, title, bg } = colors[mode];
      expect(ruleFor(css, "#anything-llm-privacy-bubble"), mode).toBe(
        `#anything-llm-privacy-bubble { color: ${text} !important; background-color: ${bg} !important; }`,
      );
      expect(ruleFor(css, "#anything-llm-bubble-privacy-title"), mode).toBe(
        `#anything-llm-bubble-privacy-title { color: ${title} !important; }`,
      );
      expect(contrastRatio(text, bg), mode).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(title, bg), mode).toBeGreaterThanOrEqual(4.5);
    }
    // Fläche = Standard der Antwortblase (kein sichtbarer Unterschied ohne
    // Seiten-CSS)
    expect(colors.light.bg).toBe(
      theme.resolveThemeVars({}, "light")["--allm-assistant-bg"],
    );
    expect(colors.dark.bg).toBe(theme.DARK.assistantBg);
  });

  it("E25: Datenschutz-Blase im DOM ohne öffentliche Variable der Seite", async () => {
    const s = await load({});
    render(<ChatHistory settings={s} history={[]} />);
    const privacy = $("#anything-llm-privacy-bubble");
    const title = $("#anything-llm-bubble-privacy-title");
    expect(privacy.style.color).toBe(theme.PRIVACY_TEXT);
    expect(privacy.style.backgroundColor).toBe(theme.PRIVACY_BG);
    expect(title.style.color).toBe(theme.PRIVACY_TITLE);
    for (const el of [privacy, title])
      expect(el.getAttribute("style")).not.toMatch(
        /--allm-|--allmi-text-muted|--allmi-assistant-/,
      );
  });
});

// ---------------------------------------------------------------------------
describe("N17: CSS-weite Schlüsselwörter in cssValue abgelehnt", () => {
  it("inherit, initial, unset, revert, revert-layer (auch groß, mit Leerraum) -> Rückfall", () => {
    for (const v of [
      "inherit",
      "initial",
      "unset",
      "revert",
      "revert-layer",
      "INHERIT",
      " Unset ",
    ])
      expect(theme.cssValue(v, "#01a5a9"), v).toBe("#01a5a9");
    // übliche Werte bleiben
    for (const v of ["#0b5f8a", "teal", "transparent", "rgb(1, 2, 3)"])
      expect(theme.cssValue(v), v).toBe(v);
    const css = theme.buildThemeCss({ buttonColor: "inherit" }, "light");
    expect(css).toContain(`--allmi-accent: ${theme.DEFAULT_ACCENT} !important;`);
    expect(css).not.toMatch(/:\s*inherit\b/);
  });
});

// ---------------------------------------------------------------------------
// W64: Höhe des Logo-Rahmens wie der Browser sie rechnet (content-box im
// Shadow Root: der Rand kommt auf die Höhe drauf, border-box nicht)
const SPACING = tailwindConfig.theme.spacing;
function frameOuterHeight(frame) {
  const h = Number.parseFloat(frame.style.height);
  const border = /(\d+(?:\.\d+)?)px/.exec(frame.style.border || "");
  const width = border ? Number(border[1]) : 0;
  return frame.style.boxSizing === "border-box" ? h : h + 2 * width;
}
function titleHeight(className, contentPx) {
  const classes = className.split(/\s+/);
  const minH = Number(
    classes.map((c) => /^allm-min-h-\[(\d+)px\]$/.exec(c)?.[1]).find(Boolean),
  );
  const py = classes.map((c) => /^allm-py-(.+)$/.exec(c)?.[1]).find(Boolean);
  const pad = 2 * Number.parseFloat(SPACING[py]);
  expect(classes).toContain("allm-box-border");
  return Math.max(minH, contentPx + pad);
}

describe("W64: Logo-Rahmen mit Rand im kompakten Kopf", () => {
  for (const iconStyle of ["border", "border-dark", "glass", "pill"])
    it(`Icon-Stil ${iconStyle}: kompakt Rahmen border-box und 56 px (mit Linie 57), sonst content-box und 76 px`, async () => {
      const s = await load({ iconStyle, headerBgColor: "#8B1A1A" });
      expect(s.iconStyle).toBe(iconStyle);
      for (const [compact, soll] of [
        [true, 56],
        [false, 76],
      ]) {
        rerender(
          <ChatWindowHeader
            settings={{ ...s, loaded: true }}
            compact={compact}
          />,
        );
        const header = $("#anything-llm-header");
        const frame = header.firstElementChild.firstElementChild;
        // E34 (Fixliste 7.22-rc20): border-box nur im kompakten Kopf
        expect(frame.style.boxSizing, `compact=${compact}`).toBe(
          compact ? "border-box" : "",
        );
        expect(
          titleHeight(
            header.firstElementChild.className,
            frameOuterHeight(frame),
          ),
          `compact=${compact}`,
        ).toBe(soll);
      }
    });
});

// ---------------------------------------------------------------------------
describe("C18: eine Regel für feste Standards und Inline-Standards", () => {
  it("ohne Skript-Angabe gilt der Inline-Standard auch gegen einen Altwert vom Server, die Skript-Angabe schlägt ihn", async () => {
    const inline = {
      ...SERVER_STANDARDS,
      displayMode: "inline",
      inlineLayout: "flow",
      inlineHeight: "640px",
    };
    const s = await load({}, inline);
    expect(s.inlineLayout).toBe("overlay");
    expect(s.inlineHeight).toBe("520px");
    const t = await load({ inlineLayout: "flow" }, inline);
    expect(t.inlineLayout).toBe("flow");
    expect(t.inlineHeight).toBe("520px");
    // Signatur ohne den Parameter given: (settings, server, scriptKeys)
    const out = layout.applyFixedStandards(
      { displayMode: "inline", inlineEffect: "grow" },
      { privacyNotice: "none" },
      new Set(["inlineEffect"]),
    );
    expect(out.privacyNotice).toBe("none");
    expect(out.inlineEffect).toBe("grow");
    expect(out.inlineLayout).toBe("overlay");
  });
});

// ---------------------------------------------------------------------------
// E29 (N18): Bestandsverhalten, bewusst so bestätigt. Der Test schützt es
// gegen spätere Änderungen; er besteht deshalb auch am alten Stand
// (Gegenprobe: ohne SERVER_WINS scheitert er).
describe("E29: historyEnabled bleibt vom Server bestimmt", () => {
  it("Admin hat „Frühere Chats“ abgeschaltet: data-history-enabled=true holt es nicht zurück", async () => {
    const s = await load(
      { historyEnabled: "true" },
      { ...SERVER_STANDARDS, historyEnabled: false },
    );
    expect(s.historyEnabled).toBe(false);
    // ohne Abschaltung im Server wirkt das Skript (auch "false")
    const t = await load({ historyEnabled: "false" });
    expect(String(t.historyEnabled)).toBe("false");
    const u = await load({});
    expect(u.historyEnabled).toBe(true);
  });
});
