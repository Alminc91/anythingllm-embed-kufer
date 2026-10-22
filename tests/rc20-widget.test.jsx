import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import tailwindConfig from "../tailwind.config.js";

// Korrekturrunde 7.22-rc20, Teil Widget (issues/rollout-721/
// fixliste-7.22-rc20.md, Details review-7.22-nachreview-rc19.md):
// W80 dc-Variablen (Gruppe A) nur mit Farben, die parseColor lesen kann, und
//   Farbnamen; var(), env(), attr() und currentcolor ergeben den Standard.
//   Seit Fixliste 7.22-rc22 E41 auch Farbnamen (Bewusste Änderung E41).
// W81 eine Warnzeile, wenn data-greeting-style="text" wegen des
//   Datenschutz-Hinweises nicht wirkt (E26).
// W82 Herkunft in der Warnzeile bei festen Standards: „Standard“ statt
//   „Design Center“.
// W84/E34 border-box am Logo-Rahmen nur im kompakten Kopf, im normalen Kopf
//   behält das 40-px-Logo seinen Abstand zum Rand (Stand rc14).
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
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

import { embedderSettings } from "../src/main.jsx";
import * as scriptAttrs from "../src/hooks/useScriptAttributes.js";
import * as theme from "../src/utils/theme.js";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";

const { loadEmbedSettings } = scriptAttrs;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// Antwort eines Servers ab 7.22 ohne gespeicherte Werte (wie
// rc18-widget.test.jsx)
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

const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server = SERVER_STANDARDS) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let container;
let root;
let warn;
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
function rerender(el) {
  act(() => root.unmount());
  root = createRoot(container);
  act(() => root.render(el));
}
const $ = (sel) => container.querySelector(sel);
const warnings = () => warn.mock.calls.map((c) => String(c[0]));

// ---------------------------------------------------------------------------
describe("W80: dc-Variablen nur mit Farben, die nichts von der Seite holen", () => {
  const PAGE_VALUES = [
    "var(--allm-accent)",
    "var(--allm-accent, #ff00ff)",
    "env(safe-area-inset-top)",
    "attr(data-color)",
    "currentcolor",
    "CurrentColor",
  ];
  const DC_KEYS = [
    ["buttonColor", "accent", "#01a5a9"],
    ["userBgColor", "user-bg", "#01a5a9"],
    ["linkColor", "link", "#01a5a9"],
  ];

  for (const value of PAGE_VALUES)
    it(`${value} ergibt in jeder dc-Variable den Standard, hell und dunkel`, () => {
      for (const mode of ["light", "dark"]) {
        for (const [key, name, def] of DC_KEYS) {
          const css = theme.buildThemeCss({ [key]: value }, mode);
          // Link dunkel: fester Wert des dunklen Satzes
          if (!(name === "link" && mode === "dark"))
            expect(css, `${key} ${mode}`).toContain(
              `--allmi-${name}: ${def} !important;`,
            );
        }
        const all = theme.buildThemeCss(
          {
            buttonColor: value,
            userBgColor: value,
            linkColor: value,
            userTextColor: value,
          },
          mode,
        );
        const fixedBlock = all.split("\n")[1];
        expect(fixedBlock, mode).toMatch(/^:host, :host \* \{/);
        expect(fixedBlock, mode).not.toMatch(/var\(--allm-|env\(|attr\(/);
        expect(fixedBlock.toLowerCase(), mode).not.toContain("currentcolor");
        // Schrift auf der Kundenfarbe: Empfehlung aus dem Standard
        expect(fixedBlock, mode).toMatch(
          /--allmi-user-text: (#FFFFFF|#222628) !important;/,
        );
        expect(fixedBlock, mode).toMatch(
          /--allmi-on-accent: (#FFFFFF|#222628) !important;/,
        );
      }
      expect(
        theme.resolveThemeVars({ buttonColor: value })["--allm-accent"],
      ).toBe("#01a5a9");
    });

  it("über die Antwort des Servers: var(--allm-accent) als Akzentfarbe wirkt nicht, Farbcodes bleiben, Farbnamen ergeben den Standard (E41)", async () => {
    const s = await load(
      {},
      {
        ...SERVER_STANDARDS,
        buttonColor: "var(--allm-accent)",
        userBgColor: "var(--allm-accent)",
        linkColor: "var(--allm-accent)",
      },
    );
    const page = theme.buildThemeCss(s, "light");
    expect(page).toContain("--allmi-accent: #01a5a9 !important;");
    expect(page).toContain("--allmi-user-bg: #01a5a9 !important;");
    expect(page).toContain("--allmi-link: #01a5a9 !important;");
    expect(page).not.toContain("var(--allm-accent)");
    // Farbcodes wie im Design Center bleiben
    for (const value of [
      "#0b5f8a",
      "#FFA102",
      "#abc",
      "#0b5f8aff",
      "rgb(1, 2, 3)",
      "rgba(1, 2, 3, 0.5)",
    ]) {
      const css = theme.buildThemeCss({ buttonColor: value }, "light");
      expect(css, value).toContain(`--allmi-accent: ${value} !important;`);
    }
    // Bewusste Änderung E41 (Fixliste 7.22-rc22): Farbnamen ergeben den
    // Standard (rc20 bis rc21: blieben)
    for (const value of ["teal", "RebeccaPurple"]) {
      const css = theme.buildThemeCss({ buttonColor: value }, "light");
      expect(css, value).toContain("--allmi-accent: #01a5a9 !important;");
    }
    // Schrift auf der Kundenfarbe wie im Design Center gewählt
    const css = theme.buildThemeCss(
      { buttonColor: "#FFA102", userTextColor: "#222628" },
      "light",
    );
    expect(css).toContain("--allmi-user-text: #222628 !important;");
    expect(css).toContain("--allmi-on-accent: #222628 !important;");
  });
});

// ---------------------------------------------------------------------------
const GREETING_HINT = 'data-greeting-style="text" wirkt nur bei abgeschaltetem';
describe("W81: Warnzeile, wenn data-greeting-style=text wegen des Datenschutz-Hinweises nicht wirkt", () => {
  it("Datenschutz-Hinweis an (Server und ohne Antwort): genau eine Warnzeile, es gilt bubble; Hinweis aus, ohne Angabe oder bubble: keine", async () => {
    const s = await load({ greetingStyle: "text" });
    expect(s.greetingStyle).toBe("bubble");
    const hits = warnings().filter((w) => w.includes(GREETING_HINT));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^\[AnythingLLM Embed\] Einbau-Angabe /);
    expect(hits[0]).toContain('es gilt "bubble"');
    expect(hits[0]).not.toMatch(/[–—]/);
    warn.mockClear();
    // ohne Antwort vom Server bleibt der Hinweis an
    const t = await loadEmbedSettings(
      { ...BASE, greetingStyle: "text" },
      vi.fn(async () => ({ ok: false })),
    );
    expect(t.greetingStyle).toBe("bubble");
    expect(warnings().filter((w) => w.includes(GREETING_HINT))).toHaveLength(1);
    warn.mockClear();
    // keine Warnzeile: Hinweis aus, ohne Angabe oder mit bubble
    const off = await load({ greetingStyle: "text" }, PRIVACY_OFF);
    expect(off.greetingStyle).toBe("text");
    await load({});
    await load({ greetingStyle: "bubble" });
    expect(warnings().filter((w) => w.includes(GREETING_HINT))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("W82: Herkunft in der Warnzeile bei festen Standards", () => {
  const INLINE = { ...SERVER_STANDARDS, displayMode: "inline" };
  const lineFor = (key, source) =>
    warnings().find(
      (w) => w.includes(`Ungültiger ${key}-Wert`) && w.includes(`(${source})`),
    );

  it("ungültiges Skript bei Altwert vom Server: es gilt der Inline-Standard (Standard), nicht „Design Center“", async () => {
    const s = await load(
      { inlineLayout: "foo", inlineOpenOn: "foo", inlineEffect: "foo" },
      {
        ...INLINE,
        inlineLayout: "flow",
        inlineOpenOn: "submit",
        inlineEffect: "grow",
      },
    );
    expect(s.inlineLayout).toBe("overlay");
    expect(lineFor("inlineLayout", "Script-Attribut")).toContain(
      'es gilt "overlay" (Standard).',
    );
    expect(lineFor("inlineOpenOn", "Script-Attribut")).toContain(
      'es gilt "focus" (Standard).',
    );
    expect(lineFor("inlineEffect", "Script-Attribut")).toContain(
      'es gilt "morph" (Standard).',
    );
    expect(warnings().join("\n")).not.toContain("(Design Center).");
  });

  it("feste Standards (FIXED_STANDARDS): Standard, mit gültigem Skript das Script-Attribut", async () => {
    await load(
      { suggestionStyle: "foo", followUps: "foo" },
      { ...SERVER_STANDARDS, suggestionStyle: "bars", followUps: "none" },
    );
    expect(lineFor("suggestionStyle", "Script-Attribut")).toContain(
      'es gilt "pills" (Standard).',
    );
    expect(lineFor("followUps", "Script-Attribut")).toContain(
      'es gilt "pills" (Standard).',
    );
    warn.mockClear();
    const s = await load(
      { inlineLayout: "flow" },
      { ...INLINE, inlineLayout: "bogus" },
    );
    expect(s.inlineLayout).toBe("flow");
    expect(lineFor("inlineLayout", "Design Center")).toContain(
      'es gilt "flow" (Script-Attribut).',
    );
  });

  it("Datenschutz-Hinweis an: gültiges text am Skript, ungültiger Server-Wert, es gilt bubble (Standard)", async () => {
    await load(
      { greetingStyle: "text" },
      { ...SERVER_STANDARDS, greetingStyle: "foo" },
    );
    expect(lineFor("greetingStyle", "Design Center")).toContain(
      'es gilt "bubble" (Standard).',
    );
  });
});

// ---------------------------------------------------------------------------
// W84/E34: Logo im Rahmen mit Rand. Abstand Logo zum Rand je Seite = (Innen-
// fläche - Logo) / 2; Innenfläche bei border-box 44 px minus zweimal der
// Rand, sonst 44 px (content-box, Rahmen außen 44 px plus Rand).
const SPACING = tailwindConfig.theme.spacing;
function borderWidth(frame) {
  const m = /(\d+(?:\.\d+)?)px/.exec(frame.style.border || "");
  return m ? Number(m[1]) : 0;
}
function logoGap(frame, img) {
  const size = Number.parseFloat(frame.style.height);
  const inner =
    frame.style.boxSizing === "border-box"
      ? size - 2 * borderWidth(frame)
      : size;
  return (inner - Number.parseFloat(img.style.maxHeight)) / 2;
}
function frameOuterHeight(frame) {
  const h = Number.parseFloat(frame.style.height);
  return frame.style.boxSizing === "border-box"
    ? h
    : h + 2 * borderWidth(frame);
}
function titleHeight(className, contentPx) {
  const classes = className.split(/\s+/);
  const minH = Number(
    classes.map((c) => /^allm-min-h-\[(\d+)px\]$/.exec(c)?.[1]).find(Boolean),
  );
  const py = classes.map((c) => /^allm-py-(.+)$/.exec(c)?.[1]).find(Boolean);
  return Math.max(minH, contentPx + 2 * Number.parseFloat(SPACING[py]));
}

describe("W84/E34: border-box am Logo-Rahmen nur im kompakten Kopf", () => {
  for (const iconStyle of ["border", "border-dark", "glass"])
    it(`Icon-Stil ${iconStyle}: normal content-box mit 2 px Abstand und 76 px, kompakt border-box und 56 px`, async () => {
      const s = await load({ iconStyle, headerBgColor: "#8B1A1A" });
      expect(s.iconStyle).toBe(iconStyle);
      for (const [compact, box, gap, soll] of [
        [false, "", 2, 76],
        [
          true,
          "border-box",
          (44 - 2 * (iconStyle === "glass" ? 1 : 2) - 28) / 2,
          56,
        ],
      ]) {
        rerender(
          <ChatWindowHeader
            settings={{ ...s, loaded: true }}
            compact={compact}
          />,
        );
        const header = $("#anything-llm-header");
        const frame = header.firstElementChild.firstElementChild;
        const img = frame.querySelector("img");
        expect(borderWidth(frame), iconStyle).toBe(
          iconStyle === "glass" ? 1 : 2,
        );
        expect(frame.style.boxSizing, `compact=${compact}`).toBe(box);
        expect(logoGap(frame, img), `compact=${compact}`).toBe(gap);
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
