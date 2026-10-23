import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import tailwindConfig from "../tailwind.config.js";

// Korrekturrunde 7.22-rc18, Teil Widget (issues/rollout-721/
// fixliste-7.22-rc18.md, Details review-7.22-nachreview-rc17.md):
// W60/E26 Datenschutz-Hinweis an: Begrüßung als Blase auch gegen
//   data-greeting-style="text", die Datenschutz-Blase ist sichtbar (leerer
//   Chat und Verlauf); Hinweis aus: "text" wirkt. Bewusste Änderung (7.23):
//   die Datenschutz-Blase entfällt (Link „Datenschutz“ in der Fußzeile),
//   damit auch E26; "text" wirkt immer.
// W61 Textzweig mit dem Begrüßungsstandard der Sprache.
// W62 feste Farben des KI-Hinweises direkt am Element, Gruppe A auf jedem
//   Element (gegen @property der Seite; der Browser-Beleg steht in
//   tests/visual/rc18_farben.py).
// E25 (feste Farben der Datenschutz-Blase) ist seit 23.10.2026 ersetzt
//   (Nutzerentscheidung): die Datenschutz-Blase sah aus wie die
//   Begrüßungsblase. Seit 7.23 gibt es sie nicht mehr; das Datenschutz-
//   Fenster folgt denselben Variablen (Fläche, Schrift, Schriftgröße, D2),
//   --allm-text-muted erreicht es nicht.
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
import PrivacyDialog from "../src/components/ChatWindow/PrivacyNotice/index.jsx";

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
// Bewusste Änderung (7.23): die Datenschutz-Blase entfällt, damit E26
describe("W60/E26 entfällt: keine Datenschutz-Blase, data-greeting-style=text wirkt", () => {
  it("leerer Chat und Verlauf: keine Datenschutz-Blase, Begrüßungsblase ohne Skript-Angabe", async () => {
    const s = await load({});
    expect(s.privacyNotice).toBe("link");
    expect(s.greetingStyle).toBe("bubble");
    render(<ChatHistory settings={s} history={[]} />);
    const greeting = $("#anything-llm-greeting-bubble");
    expect(greeting).not.toBeNull();
    expect($("#anything-llm-privacy-bubble")).toBeNull();
    expect(greeting.nextElementSibling).toBe(null);
    rerender(<ChatHistory settings={s} history={HISTORY} />);
    const welcome = $("#chat-history").firstElementChild.firstElementChild;
    expect(welcome.id).toBe("anything-llm-panel-welcome");
    expect(welcome.querySelector("#anything-llm-privacy-bubble")).toBe(null);
  });

  it("ohne Antwort vom Server und im ganzen Chatfenster: keine Blase, Link in der Fußzeile", async () => {
    const offline = await loadEmbedSettings(
      { ...BASE, greetingStyle: "text" },
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(offline.privacyNotice).toBe("link");
    expect(offline.greetingStyle).toBe("text");
    render(
      <ChatContainer
        sessionId="s-1"
        conversationId="c-1"
        knownHistory={[]}
        settings={{ ...offline, enableStt: false }}
      />,
    );
    expect($("#anything-llm-privacy-bubble")).toBeNull();
    expect($("#anything-llm-privacy-link")).not.toBeNull();
  });

  it("data-greeting-style=text wirkt mit jeder Server-Antwort (auch Altwert none oder bubble)", async () => {
    for (const server of [SERVER_STANDARDS, PRIVACY_OFF]) {
      const s = await load({ greetingStyle: "text" }, server);
      expect(s.greetingStyle).toBe("text");
      rerender(<ChatHistory settings={s} history={[]} />);
      expect($("#anything-llm-greeting-bubble")).toBeNull();
      expect($("#anything-llm-privacy-bubble")).toBeNull();
    }
    const t = await load({}, PRIVACY_OFF);
    expect(t.greetingStyle).toBe("bubble");
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

describe("W62: feste Farben direkt am Element, Gruppe A auf jedem Element", () => {
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
});

// ---------------------------------------------------------------------------
// Wirksamer Wert einer Stilangabe mit var(), wie im Browser: Deklarationen des
// Theme-Stylesheets (:host, dazu :host * mit Gruppe A und KI-Hinweis), davor
// die öffentlichen Variablen --allm-* der Seite (page). Innerstes var()
// zuerst; ohne Wert und ohne Rückfall ungültig (null).
function themeDecls(css) {
  const out = {};
  for (const sel of [":host", ":host, :host *"]) {
    const r = ruleFor(css, sel);
    for (const d of r
      .slice(r.indexOf("{") + 1, r.lastIndexOf("}"))
      .split(";")) {
      const i = d.indexOf(":");
      if (i > 0)
        out[d.slice(0, i).trim()] = d
          .slice(i + 1)
          .replace("!important", "")
          .trim();
    }
  }
  return out;
}
const INNER_VAR =
  /var\(\s*(--[\w-]+)\s*(?:,\s*((?:(?!var\()[^()]|\([^()]*\))*?))?\s*\)/;
function resolveCss(value, decls, page = {}) {
  let v = value;
  for (let n = 0; n < 50; n++) {
    const m = v.match(INNER_VAR);
    if (!m) return v;
    const [all, name, fallback] = m;
    let rep = name.startsWith("--allm-")
      ? (page[name] ?? null)
      : decls[name] != null
        ? resolveCss(decls[name], decls, page)
        : null;
    if (rep == null) rep = fallback != null ? fallback.trim() : null;
    if (rep == null) return null;
    v = v.replace(all, rep);
  }
  return v;
}

// Bewusste Änderung (7.23): statt der Datenschutz-Blase das Datenschutz-
// Fenster; es nutzt Fläche, Schrift und Schriftgröße der Antwortblasen wie
// die Begrüßungsblase (D2)
describe("Datenschutz-Fenster wie die Begrüßungsblase (Fläche, Schrift, Schriftgröße; ersetzt E25)", () => {
  const settings = { buttonColor: "#0b5f8a", userTextColor: "#FFFFFF" };
  const dialogParts = () => ({
    dialog: $("#anything-llm-privacy-dialog"),
    body: $("#anything-llm-privacy-dialog-body"),
  });

  it("keine festen Farben des Fensters im Theme-Stylesheet, KI-Hinweis und Link fest (hell und dunkel)", () => {
    for (const name of [
      "PRIVACY_NOTICE_COLORS",
      "PRIVACY_TEXT",
      "PRIVACY_TITLE",
      "PRIVACY_BG",
      "PRIVACY_BUBBLE_ID",
      "PRIVACY_TITLE_ID",
    ])
      expect(theme[name], name).toBeUndefined();
    for (const mode of ["light", "dark"]) {
      const css = theme.buildThemeCss(
        { ...settings, assistantBgColor: "#fde68a" },
        mode,
      );
      expect(ruleFor(css, "#anything-llm-privacy-dialog"), mode).toBe("");
      expect(css, mode).not.toContain("privacy-dialog");
      expect(css, mode).not.toContain("privacy-bubble");
      expect(ruleFor(css, "#anything-llm-ai-disclaimer"), mode).toBe(
        `#anything-llm-ai-disclaimer { color: ${theme.AI_NOTICE_COLORS[mode].text} !important; }`,
      );
      // Link „Datenschutz“ neben dem KI-Hinweis: feste Regel am Element
      expect(ruleFor(css, "#anything-llm-privacy-link"), mode).toBe(
        `#anything-llm-privacy-link { color: ${theme.privacyLinkColor(settings, mode)} !important; background-color: ${theme.AI_NOTICE_COLORS[mode].bg} !important; }`,
      );
    }
    expect(theme.PRIVACY_DIALOG_ID).toBe("anything-llm-privacy-dialog");
    expect(theme.PRIVACY_DIALOG_TITLE_ID).toBe(
      "anything-llm-privacy-dialog-title",
    );
  });

  it("im DOM: Fläche, Textfarbe und Schriftgröße der Begrüßungsblase; Überschrift fett ohne eigene Farbe", async () => {
    const s = await load({});
    render(
      <>
        <ChatHistory settings={s} history={[]} />
        <PrivacyDialog settings={s} onClose={() => {}} />
      </>,
    );
    const greeting = $("#anything-llm-greeting-bubble");
    const { dialog, body } = dialogParts();
    expect(dialog.style.backgroundColor).toBe(greeting.style.backgroundColor);
    expect(dialog.style.color).toBe(greeting.style.color);
    expect(dialog.style.backgroundColor).toContain("--allmi-assistant-bg");
    expect(dialog.style.color).toContain("--allmi-assistant-text");
    expect(body.style.fontSize).toBe(greeting.style.fontSize);
    const title = dialog.querySelector("h2");
    expect(title.style.fontWeight).toBe("700");
    expect(title.style.color).toBe("");
    // kein Element des Fensters greift auf --allmi-text-muted oder eine
    // eigene Datenschutz-Farbe zurück
    for (const el of [dialog, ...dialog.querySelectorAll("*")])
      expect(el.getAttribute("style") || "", el.tagName).not.toMatch(
        /text-muted|--allmi-privacy-/,
      );
  });

  it("hell und dunkel: folgt data-assistant-bg-color und --allm-assistant-bg der Seite wie die Begrüßung; --allm-text-muted: transparent ändert es nicht", async () => {
    const s = await load({ assistantBgColor: "#fde68a" });
    expect(s.assistantBgColor).toBe("#fde68a");
    render(
      <>
        <ChatHistory settings={s} history={[]} />
        <PrivacyDialog settings={s} onClose={() => {}} />
      </>,
    );
    const greeting = $("#anything-llm-greeting-bubble");
    const { dialog, body } = dialogParts();
    const cases = [
      // [Seiten-CSS, Fläche hell, Fläche dunkel, Text hell, Text dunkel]
      [{}, "#fde68a", theme.DARK.assistantBg, "#222628", theme.DARK.text],
      [
        { "--allm-assistant-bg": "#123456" },
        "#123456",
        "#123456",
        "#222628",
        theme.DARK.text,
      ],
      [
        { "--allm-text-muted": "transparent" },
        "#fde68a",
        theme.DARK.assistantBg,
        "#222628",
        theme.DARK.text,
      ],
    ];
    for (const [page, bgLight, bgDark, textLight, textDark] of cases)
      for (const mode of ["light", "dark"]) {
        const decls = themeDecls(theme.buildThemeCss(s, mode));
        const at = (el, prop) => resolveCss(el.style[prop], decls, page);
        const key = `${mode} ${JSON.stringify(page)}`;
        for (const prop of ["backgroundColor", "color"])
          expect(at(dialog, prop), `${key} ${prop}`).toBe(at(greeting, prop));
        expect(at(dialog, "backgroundColor"), key).toBe(
          mode === "dark" ? bgDark : bgLight,
        );
        expect(at(dialog, "color"), key).toBe(
          mode === "dark" ? textDark : textLight,
        );
        expect(at(body, "fontSize"), key).toBe("14px");
        if (Object.keys(page).length === 0)
          expect(
            contrastRatio(at(dialog, "color"), at(dialog, "backgroundColor")),
            key,
          ).toBeGreaterThanOrEqual(4.5);
      }
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
    expect(css).toContain(
      `--allmi-accent: ${theme.DEFAULT_ACCENT} !important;`,
    );
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
    // Bewusste Änderung (7.23): privacyNotice immer "link"
    expect(out.privacyNotice).toBe("link");
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
