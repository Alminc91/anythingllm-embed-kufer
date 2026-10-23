import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Fixliste 7.22-rc17, W50 und W51 nach E23 und E24 (Rangfolge der
// Einbau-Angaben):
// - Gruppe A, im Design Center einstellbar: nur das Design Center
//   (gespeichert oder Standard); Skript-Angaben und CSS-Variablen der Seite
//   wirken nicht, eine Konsolenwarnung je Angabe.
// - Gruppe B, feste Standards ohne Feld: die Skript-Angabe schlägt den vom
//   Server gelieferten festen Standard.
// - Gruppe C, Technik und Verhalten: wirkt immer.
// - E24: KI-Hinweis auf keinem Weg abschalt- oder änderbar; Datenschutz-
//   Hinweis nur über den Schalter im Design Center.
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
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";

const { loadEmbedSettings } = scriptAttrs;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// Antwort eines Servers ab 7.22 ohne gespeicherte Werte: feste Standards
// (Fork server/utils/chats/embedStandards.js applyEmbedStandards) und die
// Standard-Startvorschläge mit Kennzeichen. Bewusste Änderung E42
// (7.22-rc23): der Standard ist leer, der Fork liefert [] mit Kennzeichen
// (bis 7.22-rc22 zwei Beispiele); auch dann wirkt data-default-messages nicht
const STANDARD_SUGGESTIONS = [];
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
  defaultMessages: STANDARD_SUGGESTIONS,
  defaultMessagesStandard: true,
};

const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server = SERVER_STANDARDS) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let warn;
let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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
const warnLines = () => warn.mock.calls.map(([m]) => String(m));
const $ = (sel) => container.querySelector(sel);

// ---------------------------------------------------------------------------
describe("W50: Gruppe A (im Design Center einstellbar) nur aus dem Design Center", () => {
  it("data-button-color wirkt nicht, auch ohne gespeicherten Wert; gespeichert gilt der Wert vom Server", async () => {
    const none = await load({ buttonColor: "#ff0000", userBgColor: "#ff0000" });
    expect(none.buttonColor).toBe(theme.DEFAULT_ACCENT);
    expect(none.userBgColor).toBe(theme.DEFAULT_ACCENT);
    const saved = await load(
      { buttonColor: "#ff0000" },
      { ...SERVER_STANDARDS, buttonColor: "#0b5f8a" },
    );
    expect(saved.buttonColor).toBe("#0b5f8a");
    // kein Server erreichbar: Standard, nicht das Skript
    const offline = await loadEmbedSettings(
      { ...BASE, buttonColor: "#ff0000" },
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(offline.buttonColor).toBe(theme.DEFAULT_ACCENT);
  });

  it("data-default-messages und data-theme ohne Wirkung, auch wenn nichts gespeichert ist", async () => {
    const script = { defaultMessages: "Spanisch A1,Yoga", theme: "dark" };
    // Standard vom Server
    const a = await load(script);
    expect(a.defaultMessages).toEqual(STANDARD_SUGGESTIONS);
    expect(a.theme).toBe("light");
    // Server ohne Startvorschläge (älterer Server): keine, nicht das Skript
    const b = await load(script, {});
    expect(b.defaultMessages).toEqual([]);
    expect(b.theme).toBe("light");
    // gespeichert gilt
    const c = await load(script, {
      ...SERVER_STANDARDS,
      defaultMessages: ["Töpfern"],
      defaultMessagesStandard: undefined,
      theme: "dark",
    });
    expect(c.defaultMessages).toEqual(["Töpfern"]);
    expect(c.theme).toBe("dark");
  });

  it("alle Felder des Design Centers stehen in DC_COVERED, wirken nicht und melden sich je einmal", async () => {
    const { DC_COVERED } = scriptAttrs;
    expect(Array.isArray(DC_COVERED)).toBe(true);
    for (const key of [
      "displayMode",
      "theme",
      "buttonColor",
      "userBgColor",
      "linkColor",
      "userTextColor",
      "brandImageUrl",
      "assistantIcon",
      "chatIcon",
      "position",
      "courseCards",
      "courseCardsPosition",
      "brandText",
      "assistantName",
      "assistantSubtitle",
      "greeting",
      "greetingBubbleText",
      "privacyNotice",
      "privacyTitle",
      "privacyText",
      "privacyUrl",
      "defaultMessages",
      "sendMessageText",
      "chatbotBubblesMessages",
      "supportEmail",
    ])
      expect(DC_COVERED, key).toContain(key);
    const script = {
      displayMode: "inline",
      position: "top-right",
      chatIcon: "magic",
      brandText: "Skript-Name",
      assistantSubtitle: "Skript-Untertitel",
      greetingBubbleText: "Skript-Begrüßung",
      sendMessageText: "Skript-Platzhalter",
      supportEmail: "skript@example.org",
      brandImageUrl: "https://example.org/logo.png",
      courseCardsPosition: "below",
    };
    const s = await load(script);
    expect(s).toMatchObject({
      displayMode: "bubble",
      position: "bottom-left",
      chatIcon: "chatBubble",
      brandText: "KI-Berater",
      assistantSubtitle: "Online-Berater mit künstlicher Intelligenz",
      greetingBubbleText: null,
      sendMessageText: null,
      supportEmail: "info@kufer.de",
      brandImageUrl: scriptAttrs.DEFAULT_SETTINGS.brandImageUrl,
      courseCardsPosition: "above",
    });
    const lines = warnLines();
    for (const attr of [
      "data-display-mode",
      "data-position",
      "data-chat-icon",
      "data-brand-text",
      "data-assistant-subtitle",
      "data-greeting-bubble-text",
      "data-send-message-text",
      "data-support-email",
      "data-brand-image-url",
      "data-course-cards-position",
    ]) {
      const mine = lines.filter((l) => l.includes(`${attr} wirkt nicht`));
      expect(mine, attr).toHaveLength(1);
      expect(mine[0]).toContain("Design Center");
    }
    // deutsch, ohne Gedankenstriche
    for (const l of lines) expect(l).not.toMatch(/[–—]/);
  });

  it("Gruppe C wirkt immer (data-mount, data-language, data-username), Gruppe A daneben nicht", async () => {
    const fetchFn = fetchConfig(SERVER_STANDARDS);
    const s = await loadEmbedSettings(
      {
        ...BASE,
        mount: "#mein-platz",
        language: "en",
        username: "Kursportal",
        displayMode: "inline",
      },
      fetchFn,
    );
    expect(s.mount).toBe("#mein-platz");
    expect(s.language).toBe("en");
    expect(s.username).toBe("Kursportal");
    expect(new URL(fetchFn.mock.calls[0][0]).searchParams.get("language")).toBe(
      "en",
    );
    expect(s.displayMode).toBe("bubble");
    const lines = warnLines();
    for (const attr of ["data-mount", "data-language", "data-username"])
      expect(lines.some((l) => l.includes(attr)), attr).toBe(false);
    expect(lines.filter((l) => l.includes("data-display-mode"))).toHaveLength(
      1,
    );
  });

  it("Datenschutz-Hinweis nur über den Schalter im Design Center (data-privacy-notice ohne Wirkung)", async () => {
    const off = await load({ privacyNotice: "none" });
    expect(off.privacyNotice).toBe("bubble");
    const line = warnLines().find((l) => l.includes("data-privacy-notice"));
    expect(line).toContain("wirkt nicht");
    expect(line).toContain("Schalter im Design Center");
    const on = await load(
      { privacyNotice: "bubble" },
      { ...SERVER_STANDARDS, privacyNotice: "none" },
    );
    expect(on.privacyNotice).toBe("none");
  });
});

// ---------------------------------------------------------------------------
describe("W50: Gruppe B (feste Standards ohne Feld) per Skript-Angabe verfeinerbar", () => {
  it("data-inline-effect schlägt den festen Standard vom Server", async () => {
    const inline = { ...SERVER_STANDARDS, displayMode: "inline" };
    expect((await load({}, inline)).inlineEffect).toBe("morph");
    const s = await load(
      { inlineEffect: "grow", inlineLayout: "flow", inlineHeight: "640px" },
      inline,
    );
    expect(s.inlineEffect).toBe("grow");
    expect(s.inlineLayout).toBe("flow");
    expect(s.inlineHeight).toBe("640px");
    expect(layout.resolveInlineEffect(s)).toBe("grow");
    expect(warnLines().some((l) => l.includes("wirkt nicht"))).toBe(false);
  });

  // Bewusste Änderung (Fixliste 7.22-rc18 E26): data-greeting-style="text"
  // wirkt nur bei abgeschaltetem Datenschutz-Hinweis (Fälle in
  // rc18-widget.test.jsx)
  it("Optik ohne Feld (Kopffarbe, Begrüßungsstil) wirkt, ein Altwert vom Server bei festen Standards nicht", async () => {
    const off = { ...SERVER_STANDARDS, privacyNotice: "none" };
    const s = await load(
      { headerBgColor: "#0b5f8a", greetingStyle: "text" },
      off,
    );
    expect(s.headerBgColor).toBe("#0b5f8a");
    expect(s.greetingStyle).toBe("text");
    const t = await load({}, { ...off, greetingStyle: "text" });
    expect(t.greetingStyle).toBe("bubble");
  });
});

// ---------------------------------------------------------------------------
describe("W50: CSS-Variablen der Seite wirken nicht für Gruppe A", () => {
  it("--allm-accent gegen gespeicherte Akzentfarbe und gegen den Akzent-Standard", async () => {
    const saved = await load({}, { ...SERVER_STANDARDS, buttonColor: "#0b5f8a" });
    const standard = await load({});
    for (const [s, accent] of [
      [saved, "#0b5f8a"],
      [standard, theme.DEFAULT_ACCENT],
    ])
      for (const mode of ["light", "dark"]) {
        const css = theme.buildThemeCss(s, mode);
        expect(css).toContain(`--allmi-accent: ${accent} !important;`);
        for (const name of ["accent", "on-accent", "user-bg", "user-text"])
          expect(css).not.toContain(`var(--allm-${name}`);
      }
    // im Shadow-Root: eine Akzentfarbe am Host ändert das Stylesheet nicht
    const host = document.createElement("div");
    host.style.setProperty("--allm-accent", "#b45309");
    host.style.setProperty("--allm-on-accent", "#000000");
    document.body.appendChild(host);
    const styleEl = document.createElement("style");
    host.attachShadow({ mode: "open" }).appendChild(styleEl);
    theme.applyTheme(styleEl, standard);
    expect(styleEl.textContent).toBe(theme.buildThemeCss(standard, "light"));
    expect(styleEl.textContent).toContain(
      `--allmi-accent: ${theme.DEFAULT_ACCENT} !important;`,
    );
    host.remove();
    // übrige Variablen (Gruppe B) bleiben über --allm-* verfeinerbar
    const css = theme.buildThemeCss(standard, "light");
    for (const name of ["radius", "surface", "text", "bar-radius", "pill-border"])
      expect(css).toContain(`--allmi-${name}: var(--allm-${name}`);
  });
});

// ---------------------------------------------------------------------------
describe("E24: KI-Hinweis auf keinem Weg abschalt- oder änderbar", () => {
  const props = { sessionId: "s-1", conversationId: "c-1", knownHistory: [] };

  it("mit jeder Einbau-Angabe sichtbar, Text fest, eine Warnung je Angabe", async () => {
    const s = await load({
      disclaimer: "none",
      disclaimerText: "Kein Hinweis",
      noHeader: "true",
      textSize: "10",
      theme: "dark",
      displayMode: "inline",
      privacyNotice: "none",
      greetingStyle: "text",
      inheritFont: "true",
    });
    expect(s.disclaimer).toBe("footer");
    expect(s.disclaimerText).toBe(null);
    const lines = warnLines();
    expect(lines.filter((l) => l.includes("data-disclaimer "))).toHaveLength(1);
    expect(
      lines.filter((l) => l.includes("data-disclaimer-text ")),
    ).toHaveLength(1);
    expect(lines.find((l) => l.includes("data-disclaimer "))).toContain(
      "KI-Hinweis",
    );
    act(() =>
      root.render(
        <ChatContainer {...props} settings={{ ...s, enableStt: false }} />,
      ),
    );
    const note = $("#anything-llm-ai-disclaimer");
    expect(note).not.toBeNull();
    expect(note.textContent).toBe(layout.PANEL_TEXTS.de.aiDisclaimer);
  });

  it("mit gesetzten CSS-Variablen lesbar: Farben fest je Farbschema, ohne --allm-*", () => {
    act(() =>
      root.render(
        <ChatContainer {...props} settings={{ ...BASE, enableStt: false }} />,
      ),
    );
    const note = $("#anything-llm-ai-disclaimer");
    // Schrift und eigene Fläche hinter dem Satz aus internen Variablen
    expect(note.style.color).toBe(theme.AI_NOTICE_TEXT);
    const span = note.querySelector("span");
    expect(span.textContent).toBe(note.textContent);
    expect(span.style.backgroundColor).toBe(theme.AI_NOTICE_BG);
    for (const el of [note, span])
      expect(el.getAttribute("style")).not.toMatch(/--allm-/);
    // die internen Variablen stehen fest und mit !important im Stylesheet
    // (schlägt jede Angabe der Seite am Host), lesbar in beiden Schemata
    for (const mode of ["light", "dark"]) {
      const { text, bg } = theme.AI_NOTICE_COLORS[mode];
      const css = theme.buildThemeCss(
        { buttonColor: "#01a5a9", theme: mode },
        mode,
      );
      expect(css).toContain(`--allmi-ai-notice-text: ${text} !important;`);
      expect(css).toContain(`--allmi-ai-notice-bg: ${bg} !important;`);
      expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
    }
    // Fläche = Standard der Fensterfläche (kein sichtbarer Kasten ohne
    // Seiten-CSS)
    expect(theme.AI_NOTICE_COLORS.light.bg).toBe(
      theme.resolveThemeVars({}, "light")["--allm-surface"],
    );
    expect(theme.AI_NOTICE_COLORS.dark.bg).toBe(theme.DARK.surface);
  });
});

// ---------------------------------------------------------------------------
// Gegenprobe gegen den Fork (KUFER_FORK_DIR, wie tests/embed-config-
// contract.test.js): Jeder Schlüssel, den GET /embed/:id/config ausliefert,
// ist entweder ein Feld des Design Centers (DC_COVERED) oder ein fester
// Standard bzw. Transport ohne Feld.
const forkDir = process.env.KUFER_FORK_DIR;
const describeFork = forkDir ? describe : describe.skip;
// sichtbar im Log statt still übersprungen (wie embed-config-contract,
// Fixliste 7.22-rc18 W66)
if (!forkDir)
  console.warn(
    "[rc17-rangfolge] KUFER_FORK_DIR nicht gesetzt: Gegenprobe /config gegen DC_COVERED übersprungen (1 Test). Im rc-Build mit gesetzter Variable laufen lassen.",
  );
describeFork(
  forkDir
    ? "Gegenprobe: Schlüssel von /config gegen DC_COVERED (KUFER_FORK_DIR)"
    : "Gegenprobe: Schlüssel von /config gegen DC_COVERED (übersprungen: KUFER_FORK_DIR nicht gesetzt)",
  () => {
    it("Schlüssel aus Feldern des Design Centers stehen in DC_COVERED, feste Standards nicht", () => {
      const require = createRequire(import.meta.url);
      const standards = require(
        join(forkDir, "server/utils/chats/embedStandards.js"),
      );
      const fixed = new Set([
        ...Object.keys(standards.EMBED_FIXED_STANDARDS),
        ...Object.keys(standards.INLINE_FIXED_STANDARDS),
      ]);
      const endpoint = readFileSync(
        join(forkDir, "server/endpoints/embed/index.js"),
        "utf8",
      );
      const standardsSrc = readFileSync(
        join(forkDir, "server/utils/chats/embedStandards.js"),
        "utf8",
      );
      const objectKeys = (name) => {
        const m = new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(endpoint);
        return m ? [...m[1].matchAll(/^\s*(\w+):/gm)].map((x) => x[1]) : [];
      };
      const sent = new Set([
        ...[...endpoint.matchAll(/\bmapped\.(\w+)\s*=/g)].map((m) => m[1]),
        ...[...standardsSrc.matchAll(/\bout\.(\w+)\s*=/g)].map((m) => m[1]),
        ...objectKeys("LAYOUT_ENUMS"),
        ...objectKeys("WIDGET_TEXT_MAX"),
        "privacyNotice",
        "courseCardsPosition",
        "welcomeBubblesDesktop",
        "welcomeBubblesMobile",
        "courseCards",
      ]);
      // ohne Feld im Design Center: Transport, Widget-Einstellung und der
      // früher gespeicherte Text der Inline-Leiste (Gruppe B)
      const noField = new Set([
        "defaultMessagesSaved",
        "defaultMessagesStandard",
        "historyEnabled",
        "inlineInputPlaceholder",
      ]);
      expect(sent.has("buttonColor")).toBe(true);
      expect(sent.has("displayMode")).toBe(true);
      const { DC_COVERED } = scriptAttrs;
      for (const key of sent) {
        if (fixed.has(key)) {
          expect(DC_COVERED, `fester Standard ${key}`).not.toContain(key);
          continue;
        }
        if (noField.has(key)) continue;
        expect(DC_COVERED, `Feld des Design Centers ${key}`).toContain(key);
      }
    });
  },
);
