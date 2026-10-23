import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Korrekturrunde 7.22-rc21, Teil Widget (issues/rollout-721/
// fixliste-7.22-rc21.md, Details review-7.22-nachreview-rc20.md):
// W90 dc-Variablen: gültige Farbfunktionen (rgb()/rgba() auch mit Prozent,
//   hsl()/hsla()) und #rgba bleiben, Farbnamen nur aus der festen Liste der
//   CSS-Farbnamen plus transparent; Tippfehler und Systemfarben ergeben den
//   Standard. Bewusste Änderung E41 (Fixliste 7.22-rc22): Die Erweiterung
//   entfällt, die dc-Variablen nehmen nur, was parseColor liest; die Werte
//   aus VALID ergeben jetzt den Standard (tests/rc22-widget.test.jsx).
// W91 parseColor: in rgb() nur Kommas oder nur Leerzeichen, Alpha als
//   strenge Zahl (gemischte Trenner lehnt CSS ab).
// W92 Herkunft in der Warnzeile für courseCardsLayout und die Inline-
//   Schlüssel im Chatfenster: „Standard“ statt „Design Center“.
// Namensraum-Importe wie rc20-widget.test.jsx: am alten Stand scheitert der
// einzelne Test an seiner Prüfung, nicht die Datei am Import.

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

import * as scriptAttrs from "../src/hooks/useScriptAttributes.js";
import * as theme from "../src/utils/theme.js";
import * as contrast from "../src/utils/contrast.js";

const { loadEmbedSettings } = scriptAttrs;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// Antwort eines Servers ab 7.22 ohne gespeicherte Werte (wie
// rc20-widget.test.jsx)
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

const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server = SERVER_STANDARDS) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});
const warnings = () => warn.mock.calls.map((c) => String(c[0]));

const DC_KEYS = [
  ["buttonColor", "accent"],
  ["userBgColor", "user-bg"],
  ["linkColor", "link"],
];
// Kufer-Standard (Petrol seit 23.10.2026, Literal in theme.test.js)
const STANDARD = theme.DEFAULT_ACCENT;
// Wert in der dc-Variable (hell), sonst null
function dcValue(key, name, value) {
  const css = theme.buildThemeCss({ [key]: value }, "light");
  const m = new RegExp(`--allmi-${name}: ([^;]+) !important;`).exec(css);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
describe("W90: dc-Variablen mit gültigen Farbfunktionen und festen Farbnamen (Bewusste Änderung E41: ergeben den Standard)", () => {
  // bis rc21 angenommen; seit E41 (Fixliste 7.22-rc22) der Standard
  const VALID = [
    "hsl(180, 100%, 33%)",
    "hsla(180, 100%, 33%, 0.5)",
    "hsl(180deg 100% 33%)",
    "hsl(180 100% 33% / .5)",
    "HSL(-30, 50%, 50%)",
    "rgb(10%, 20%, 30%)",
    "rgb(10% 20% 30% / 50%)",
    "rgb(1.5, 2, 3)",
    "#abcd",
    "transparent",
    "Grey",
    "aliceblue",
    "lightgoldenrodyellow",
    "darkslategrey",
    "yellowgreen",
  ];
  // Tippfehler, Nicht-Farben, Systemfarben (hängen vom Farbschema der Seite
  // ab) und ungültige Funktionen
  const INVALID = [
    "blau",
    "tuerkis",
    "none",
    "auto",
    "Canvas",
    "CanvasText",
    "LinkText",
    "AccentColor",
    "ButtonFace",
    "hsl(180, 100, 33)",
    "hsl(180 100% 33%, 1)",
    "rgb(10%, 2, 3)",
    "#abcde",
  ];

  for (const value of VALID)
    it(`${value} ergibt in jeder dc-Variable den Standard (Bewusste Änderung E41, bis rc21: blieb)`, () => {
      for (const [key, name] of DC_KEYS)
        expect(dcValue(key, name, value), key).toBe(STANDARD);
      expect(theme.dcColor(value, "STANDARD")).toBe("STANDARD");
    });

  for (const value of INVALID)
    it(`${value} ergibt in jeder dc-Variable den Standard`, () => {
      for (const [key, name] of DC_KEYS)
        expect(dcValue(key, name, value), key).toBe(STANDARD);
      expect(theme.dcColor(value, "STANDARD")).toBe("STANDARD");
    });

  it("über die Antwort des Servers: hsl() und ein Tippfehler ergeben den Standard (Bewusste Änderung E41, bis rc21: hsl() blieb)", async () => {
    const hsl = await load(
      {},
      { ...SERVER_STANDARDS, buttonColor: "hsl(180, 100%, 33%)" },
    );
    expect(theme.buildThemeCss(hsl, "light")).toContain(
      `--allmi-accent: ${STANDARD} !important;`,
    );
    const typo = await load({}, { ...SERVER_STANDARDS, buttonColor: "blau" });
    const css = theme.buildThemeCss(typo, "light");
    expect(css).toContain(`--allmi-accent: ${STANDARD} !important;`);
    expect(css).not.toContain("blau");
  });

  it("passt zum Design Center: alles, was parseColor liest (accentColorError), bleibt", () => {
    for (const value of [
      "#0b5f8a",
      "#ABC",
      "#0b5f8aff",
      "rgb(1, 2, 3)",
      "rgb(1 2 3)",
      "rgba(1, 2, 3, 1)",
      "rgb(1 2 3 / 100%)",
    ]) {
      expect(contrast.parseColor(value), value).not.toBeNull();
      expect(theme.dcColor(value), value).toBe(value);
    }
  });
});

// ---------------------------------------------------------------------------
describe("W91: parseColor nur mit Kommas oder nur mit Leerzeichen, Alpha als Zahl", () => {
  const MIXED = [
    "rgb(1, 2 3)",
    "rgb(1 2 3, 1)",
    "rgba(1, 2, 3 / 1)",
    "rgb(1,2,3,1.2.3)",
    "rgb(1,2,3,1.)",
    "rgb(1 2 3 / .)",
  ];
  it("gemischte Trenner und ungültiges Alpha: keine Farbe, in den dc-Variablen der Standard", () => {
    for (const value of MIXED) {
      expect(contrast.parseColor(value), value).toBeNull();
      expect(contrast.contrastRatio(value, "#FFFFFF"), value).toBeNull();
      for (const [key, name] of DC_KEYS)
        expect(dcValue(key, name, value), `${key} ${value}`).toBe(STANDARD);
    }
  });

  it("gültige Schreibweisen bleiben lesbar", () => {
    for (const value of [
      "rgb(1, 2, 3)",
      "rgb(1,2,3)",
      "rgb( 1 , 2 , 3 )",
      "RGB(1 2 3)",
      "rgb(1 2 3 / 50%)",
      "rgba(1, 2, 3, .5)",
      "rgba(1,2,3,0.5)",
      "rgba(1 2 3 / 0.5)",
    ])
      expect(contrast.parseColor(value), value).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
describe("W92: Herkunft „Standard“ für courseCardsLayout und die Inline-Schlüssel im Chatfenster", () => {
  const lineFor = (key) =>
    warnings().find((w) => w.includes(`Ungültiger ${key}-Wert`));

  it('data-course-cards-layout="foo": es gilt "rows" (Standard)', async () => {
    const s = await load({ courseCardsLayout: "foo" });
    expect(s.courseCardsLayout).toBe("rows");
    expect(lineFor("courseCardsLayout")).toContain("(Script-Attribut)");
    expect(lineFor("courseCardsLayout")).toContain(
      'es gilt "rows" (Standard).',
    );
    expect(warnings().join("\n")).not.toContain("(Design Center).");
  });

  it("Inline-Schlüssel im Chatfenster: Standard, nicht Design Center", async () => {
    const s = await load({
      inlineLayout: "foo",
      inlineOpenOn: "foo",
      inlineEffect: "foo",
    });
    expect(s.displayMode).not.toBe("inline");
    expect(lineFor("inlineLayout")).toContain('es gilt "overlay" (Standard).');
    expect(lineFor("inlineOpenOn")).toContain('es gilt "focus" (Standard).');
    expect(lineFor("inlineEffect")).toMatch(/\(Standard\)\.$/);
    expect(warnings().join("\n")).not.toContain("(Design Center).");
  });

  it("Gegenprobe: gültiges Skript bei ungültigem Server-Wert nennt das Script-Attribut", async () => {
    const s = await load(
      { courseCardsLayout: "grid", inlineLayout: "flow" },
      { ...SERVER_STANDARDS, courseCardsLayout: "bogus", inlineLayout: "x" },
    );
    expect(s.courseCardsLayout).toBe("grid");
    expect(lineFor("courseCardsLayout")).toContain(
      'es gilt "grid" (Script-Attribut).',
    );
    expect(lineFor("inlineLayout")).toContain(
      'es gilt "flow" (Script-Attribut).',
    );
  });
});
