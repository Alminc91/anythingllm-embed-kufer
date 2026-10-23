// @vitest-environment node
// (Umgebung node: nur so lädt Vitest die Datei des Forks außerhalb des
// Projekts, Gegenprobe unten; theme.js und contrast.js brauchen kein DOM)
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Korrekturrunde 7.22-rc22, Teil Widget (issues/rollout-721/
// fixliste-7.22-rc22.md, Nachtrag „Bewertung des Sicherheitsdurchgangs
// rc21“; Details review-7.22-rc21-security.md W100, F100):
// E41 Eine Regel für gültige Farben, die von parseColor: Die dc-Variablen
//   (Gruppe A) nehmen genau die Werte, die das Design Center annimmt
//   (accentColorError), und die Kontrastrechnung kann jeden davon lesen.
//   hsl(), Farbnamen, Prozent und #rgba ergeben den Standard; Schrift auf
//   der Akzentfarbe, Schrift der Nutzerblase und Pillenschrift folgen damit
//   immer dem berechneten Kontrast (W100).
// E41 parseColor: Leerraum in rgb() nur wie in CSS ([ \t\n\r\f]); U+00A0
//   und andere Unicode-Leerzeichen sind kein Trenner (F100).
// E41 Ergänzung (a): Deckkraft wie im Design Center: rgba() mit Alpha unter
//   1 und #rrggbbaa unter ff ergeben den Standard (N50).
// Namensraum-Importe wie rc21-widget.test.jsx: am alten Stand scheitert der
// einzelne Test an seiner Prüfung, nicht die Datei am Import.

import * as theme from "../src/utils/theme.js";
import * as contrast from "../src/utils/contrast.js";

// Kufer-Standard (Petrol seit 23.10.2026, Literal in theme.test.js)
const STANDARD = theme.DEFAULT_ACCENT;
// Werte mit Unicode-Zeichen lesbar in der Meldung (U+00A0 statt Leerzeichen)
const show = (value) =>
  value.replace(
    /[^\x20-\x7e]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
  );
const KEYS = [
  "--allm-accent",
  "--allm-user-bg",
  "--allm-link",
  "--allm-on-accent",
  "--allm-user-text",
  "--allm-pill-accent-text",
];
const pick = (vars) => Object.fromEntries(KEYS.map((k) => [k, vars[k]]));
const colorVars = (value, mode) =>
  pick(
    theme.resolveThemeVars(
      { buttonColor: value, userBgColor: value, linkColor: value },
      mode,
    ),
  );

// Formate, die parseColor nicht liest (bis rc21 teils angenommen, W90)
const OTHER_FORMATS = [
  "hsl(180, 100%, 33%)",
  "hsla(180, 100%, 33%, 1)",
  "hsl(60 100% 50%)",
  "teal",
  "yellow",
  "RebeccaPurple",
  "transparent",
  "rgb(80%, 40%, 0%)",
  "rgb(10% 20% 30% / 50%)",
  "rgb(1.5, 2, 3)",
  "#c60f",
  "#abcd",
  "Canvas",
  "LinkText",
  "currentcolor",
  "var(--allm-accent)",
  "blau",
];
// Unicode-Leerraum in rgb(): CSS liest ihn nicht als Trenner, der Button
// wäre durchsichtig (F100)
const UNICODE_SPACE = [
  "rgb(1, 165, 169)",
  "rgb(1 165 169)",
  "rgba(1, 165, 169, 1)",
  "rgb(1 165 169 / 1)",
  "rgb(1 165 169)",
  "rgb(　1, 165, 169)",
  "rgb(1,﻿165, 169)",
];
// Farbcodes wie im Design Center: wirken, auch mit CSS-Leerraum
const ACCEPTED = [
  "#00a8a8",
  "#0AA",
  "#00a8a8ff",
  "rgb(0, 168, 168)",
  "rgb(0 168 168)",
  "rgba(0, 168, 168, 1)",
  "rgb(0 168 168 / 100%)",
  "rgb(0,\t168,\n168)",
  "rgb(0\f168\r168)",
  "#ffff00",
  "rgb(26, 26, 26)",
];

// Deckkraft unter 1: parseColor liest sie, das Design Center lehnt sie ab
// (eigene Meldung), das Widget nimmt den Standard (E41 Ergänzung (a))
const TRANSLUCENT = [
  "rgba(1, 2, 3, 0.5)",
  "#01a5a980",
  "#00a8a8fe",
  "#00a8a800",
  "rgba(0, 168, 168, .99)",
  "rgba(0, 168, 168, 0)",
  "rgba(0,168,168,0.999)",
  "rgb(0, 168, 168, 0.5)",
  "rgb(0 168 168 / 50%)",
  "rgba(0 168 168 / 99.9%)",
  "rgb(0 168 168 / 0%)",
  "rgba(0, 168, 168, 0%)",
  "  rgba(0, 168, 168, 0.5)\n",
];
// Alpha angegeben, aber deckend: wirkt (wie im Design Center); nur der
// vierte Kanal zählt, ein dritter Kanal 0 ist kein Alpha
const OPAQUE_WITH_ALPHA = [
  "#00a8a8FF",
  "#000000ff",
  "rgba(0, 168, 168, 1)",
  "rgba(0, 168, 168, 1.0)",
  "rgb(0 168 168 / 1)",
  "rgb(0 168 168 / 100%)",
  "rgba(0, 168, 168, 1.5)",
  "rgb(0 168 168 / 150%)",
  "rgb(0, 0, 0)",
  "rgb(0 0 0)",
  "rgba(0, 0, 0, 1)",
];

// ---------------------------------------------------------------------------
describe("E41: dc-Variablen nehmen genau, was parseColor liest", () => {
  for (const value of OTHER_FORMATS)
    it(`${value}: Standard in jeder dc-Variable, Schrift und Pille wie beim Standard`, () => {
      expect(contrast.parseColor(value), value).toBeNull();
      expect(theme.dcColor(value), value).toBeNull();
      for (const mode of ["light", "dark"])
        expect(colorVars(value, mode), mode).toEqual(colorVars(null, mode));
      expect(colorVars(value, "light")["--allm-accent"]).toBe(STANDARD);
    });

  it("W100: hsl() ohne gewählte Schrift ergibt die Schrift nach Kontrast zum Standard, nicht mehr Weiß auf der hsl()-Farbe", () => {
    // Beispiel aus dem Bericht: hsl(180, 100%, 33%) ist #00a8a8; rc21 zeigte
    // Weiß (2,93:1) und die Pillenschrift ungeprüft in der Akzentfarbe.
    // Seit E41 gilt der Standard; beim Petrol ist die Empfehlung Weiß
    // (4,99:1), die Pillenschrift bleibt die Akzentfarbe (4,99:1 auf Weiß).
    // Bis 23.10.2026 beim Türkis: #222628 und abgedunkelt #018487.
    const shown = (vars) =>
      vars["--allm-pill-accent-text"] === "var(--allmi-accent)"
        ? vars["--allm-accent"]
        : vars["--allm-pill-accent-text"];
    const v = theme.resolveThemeVars({ buttonColor: "hsl(180, 100%, 33%)" });
    expect(v["--allm-accent"]).toBe(STANDARD);
    expect(v["--allm-on-accent"]).toBe("#FFFFFF");
    expect(v["--allm-user-text"]).toBe("#FFFFFF");
    expect(v["--allm-pill-accent-text"]).toBe("var(--allmi-accent)");
    expect(
      contrast.contrastRatio(v["--allm-on-accent"], v["--allm-accent"]),
    ).toBeGreaterThanOrEqual(contrast.MIN_TEXT_CONTRAST);
    expect(
      contrast.contrastRatio(shown(v), "#FFFFFF"),
    ).toBeGreaterThanOrEqual(contrast.MIN_TEXT_CONTRAST);
    // Gelb: rc21 Weiß auf Gelb (1,07:1) und gelbe Pillenschrift; jetzt der
    // Standard, Schrift und Pillenschrift lesbar
    const y = theme.resolveThemeVars({ buttonColor: "hsl(60, 100%, 50%)" });
    expect(y["--allm-accent"]).toBe(STANDARD);
    expect(y["--allm-on-accent"]).toBe(
      contrast.recommendedTextColor(STANDARD),
    );
    expect(
      contrast.contrastRatio(y["--allm-on-accent"], y["--allm-accent"]),
    ).toBeGreaterThanOrEqual(contrast.MIN_TEXT_CONTRAST);
    expect(
      contrast.contrastRatio(shown(y), "#FFFFFF"),
    ).toBeGreaterThanOrEqual(contrast.MIN_TEXT_CONTRAST);
  });

  it("Hex und rgb() wirken, Schrift auf der Akzentfarbe nach berechnetem Kontrast", () => {
    for (const value of ACCEPTED) {
      const accent = value.trim();
      const v = theme.resolveThemeVars({ buttonColor: value });
      expect(v["--allm-accent"], value).toBe(accent);
      expect(v["--allm-on-accent"], value).toBe(
        contrast.recommendedTextColor(accent),
      );
      expect(v["--allm-user-text"], value).toBe(
        contrast.recommendedTextColor(accent),
      );
      const pill = v["--allm-pill-accent-text"];
      const shown = pill === "var(--allmi-accent)" ? accent : pill;
      expect(
        contrast.contrastRatio(shown, "#FFFFFF"),
        value,
      ).toBeGreaterThanOrEqual(contrast.MIN_TEXT_CONTRAST);
    }
    // Beispiele aus dem Bericht (W100)
    const teal = theme.resolveThemeVars({ buttonColor: "#00a8a8" });
    expect(teal["--allm-on-accent"]).toBe("#222628");
    expect(teal["--allm-pill-accent-text"]).toBe("#008383");
    const dark = theme.resolveThemeVars({ buttonColor: "rgb(26, 26, 26)" });
    expect(dark["--allm-on-accent"]).toBe("#FFFFFF");
    // Ränder werden gekürzt, wie im Design Center (cleanConfig)
    expect(theme.dcColor("  #00a8a8\n")).toBe("#00a8a8");
  });

  it("nur Zeichen einer Farbangabe: Angehängtes ergibt den Standard", () => {
    for (const value of [
      "#00a8a8;color:red",
      "rgb(0, 168, 168)}:host{color:red",
      "#00a8a8 !important",
      "rgb(0, 168, 168) url(x)",
    ]) {
      expect(theme.dcColor(value), value).toBeNull();
      expect(theme.buildThemeCss({ buttonColor: value }, "light")).toContain(
        `--allmi-accent: ${STANDARD} !important;`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
describe("E41 Ergänzung (a): Deckkraft unter 1 ergibt den Standard wie im Design Center", () => {
  for (const value of TRANSLUCENT)
    it(`${show(value)}: Standard in jeder dc-Variable, Schrift und Pille wie beim Standard`, () => {
      // parseColor liest die Farbe (Kontrastrechnung unverändert), dcColor
      // verwirft sie
      expect(contrast.parseColor(value), value).not.toBeNull();
      expect(theme.dcColor(value), value).toBeNull();
      expect(theme.dcColor(value, STANDARD), value).toBe(STANDARD);
      for (const mode of ["light", "dark"])
        expect(colorVars(value, mode), mode).toEqual(colorVars(null, mode));
      expect(
        theme.buildThemeCss({ buttonColor: value }, "light"),
        value,
      ).toContain(`--allmi-accent: ${STANDARD} !important;`);
    });

  it("deckende Farben mit Alpha wirken, Schrift auf der Akzentfarbe nach berechnetem Kontrast", () => {
    for (const value of OPAQUE_WITH_ALPHA) {
      const accent = value.trim();
      expect(theme.dcColor(value), value).toBe(accent);
      const v = theme.resolveThemeVars({ buttonColor: value });
      expect(v["--allm-accent"], value).toBe(accent);
      expect(v["--allm-on-accent"], value).toBe(
        contrast.recommendedTextColor(accent),
      );
    }
    // dritter Kanal 0 ist kein Alpha (Restpunkt 5, rc7): Schwarz bleibt
    // Schwarz, Schrift darauf Weiß
    const black = theme.resolveThemeVars({ buttonColor: "rgb(0, 0, 0)" });
    expect(black["--allm-accent"]).toBe("rgb(0, 0, 0)");
    expect(black["--allm-on-accent"]).toBe("#FFFFFF");
  });

  it("gilt für jede Farbe der Gruppe A: einzeln Nutzerblase, Link, gewählte Schrift", () => {
    // Nutzerblase und Link einzeln durchscheinend (der Server schickt sie
    // sonst gleich der Akzentfarbe, Fälle oben): Standard
    const bg = theme.resolveThemeVars({
      userBgColor: "rgba(255, 255, 0, 0.5)",
    });
    expect(bg["--allm-user-bg"]).toBe(STANDARD);
    expect(bg["--allm-user-text"]).toBe(
      contrast.recommendedTextColor(STANDARD),
    );
    const link = theme.resolveThemeVars({ linkColor: "#ff000080" });
    expect(link["--allm-link"]).toBe(theme.resolveThemeVars({})["--allm-link"]);
    // gewählte Schrift durchscheinend: es gilt die Empfehlung nach Kontrast
    const text = theme.resolveThemeVars({
      buttonColor: "#003366",
      userTextColor: "#FFFFFF80",
    });
    expect(text["--allm-on-accent"]).toBe("#FFFFFF");
    expect(text["--allm-user-text"]).toBe("#FFFFFF");
    const yellow = theme.resolveThemeVars({
      buttonColor: "#ffff00",
      userTextColor: "rgba(255, 255, 255, 0.9)",
    });
    expect(yellow["--allm-on-accent"]).toBe("#222628");
    expect(yellow["--allm-user-text"]).toBe("#222628");
  });
});

// ---------------------------------------------------------------------------
describe("E41: parseColor mit Leerraum nur wie in CSS", () => {
  it("U+00A0 und andere Unicode-Leerzeichen in rgb(): keine Farbe, in den dc-Variablen der Standard", () => {
    for (const value of UNICODE_SPACE) {
      expect(contrast.parseColor(value), show(value)).toBeNull();
      expect(theme.dcColor(value), show(value)).toBeNull();
      expect(colorVars(value, "light")["--allm-accent"]).toBe(STANDARD);
    }
  });

  it("Leerzeichen, Tab, Zeilenumbruch und Seitenvorschub bleiben Trenner", () => {
    for (const value of [
      "rgb(1, 165, 169)",
      "rgb(1,\t165,\t169)",
      "rgb(\n1\n165\n169\n)",
      "rgb(1\r165\f169)",
      "rgba(1, 165, 169,\t0.5)",
      "rgb(1 165 169\t/\t50%)",
    ])
      expect(contrast.parseColor(value), show(value)).toEqual([1, 165, 169]);
  });
});

// ---------------------------------------------------------------------------
// Gegenprobe gegen das Design Center im Fork (KUFER_FORK_DIR, wie
// tests/embed-config-contract.test.js): accentColorError lehnt genau die
// Werte ab, die das Widget durch den Standard ersetzt. Für Deckkraft unter 1
// hat das Design Center eine eigene Meldung; auch sie ist eine Ablehnung
// (E41 Ergänzung (a)).
const forkDir = process.env.KUFER_FORK_DIR;
const describeFork = forkDir ? describe : describe.skip;
if (!forkDir)
  console.warn(
    "[rc22-widget] KUFER_FORK_DIR nicht gesetzt: Gegenprobe gegen accentColorError übersprungen (3 Tests). Im rc-Build mit gesetzter Variable laufen lassen.",
  );
const WIDGET_KEYS = join(
  forkDir || "",
  "frontend/src/pages/GeneralSettings/ChatEmbedWidgets/EmbedAppearance/widgetKeys.js",
);
const FORMAT_ERROR = "Bitte einen Farbcode wie #01A5A9 angeben.";
const OPACITY_ERROR = "Bitte eine deckende Farbe ohne Transparenz angeben.";
describeFork(
  forkDir
    ? "E41 Gleichlauf: Design Center lehnt dieselben Werte ab (KUFER_FORK_DIR)"
    : "E41 Gleichlauf: Design Center lehnt dieselben Werte ab (übersprungen: KUFER_FORK_DIR nicht gesetzt)",
  () => {
    const accentColorError = async () => {
      // kein stilles Bestehen, wenn die Datei fehlt oder umbenannt wurde
      expect(existsSync(WIDGET_KEYS), WIDGET_KEYS).toBe(true);
      return (await import(/* @vite-ignore */ pathToFileURL(WIDGET_KEYS).href))
        .accentColorError;
    };

    it("Formate und Deckkraft: Fehlermeldung im Design Center genau dann, wenn das Widget den Standard nimmt", async () => {
      const error = await accentColorError();
      for (const value of [
        ...OTHER_FORMATS,
        ...ACCEPTED,
        ...TRANSLUCENT,
        ...OPAQUE_WITH_ALPHA,
        ...UNICODE_SPACE,
      ])
        expect(error(value) !== null, show(value)).toBe(
          theme.dcColor(value) === null,
        );
    });

    it("Deckkraft unter 1: das Design Center meldet Transparenz, das Widget nimmt den Standard", async () => {
      const error = await accentColorError();
      for (const value of TRANSLUCENT) {
        expect(error(value), show(value)).toBe(OPACITY_ERROR);
        expect(theme.dcColor(value), show(value)).toBeNull();
      }
    });

    it("Unicode-Leerraum in rgb(): das Design Center lehnt ihn ab wie das Widget (Fork-Kopie von contrast.js)", async () => {
      const error = await accentColorError();
      for (const value of UNICODE_SPACE)
        expect(error(value), show(value)).toBe(FORMAT_ERROR);
    });
  },
);
