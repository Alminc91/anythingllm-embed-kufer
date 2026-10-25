import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Datenschutz-Blase beim Start (AK-12), Korrekturen nach Review und
// Browser-Abnahme AK-12 (issues/datenschutz-fusszeile/fixliste-ak12.md,
// Widget A5 bis A7; A4 steht in tests/embed-config-contract.test.js).
// A5 (AW-1): ATTRIBUTES.md sagt für den Link in der Blase nur zu, was der
//   Code hält: mindestens 4,5:1 zur Standardfläche der Blase (Werte aus
//   theme.js PRIVACY_BUBBLE_BG), eine Blasenfläche aus der Seite zählt nicht.
// A6 (AW-3, C1): Die Laufzahl von tests/visual/datenschutz_blase.py in der
//   README folgt dem Plan des Skripts (planned_count), und je Prüfskript
//   steht der Build des Laufs dabei.
// A7 (AW-5): datenschutz_blase.py prüft die Ansichten aus Abschnitt 8 der
//   Spezifikation (Chatfenster 768, 1280, 1440; In der Seite 1024, 1440,
//   1920; mobil 390), und ein Lauf mit weniger Ergebnissen als geplant ist
//   ein Fehler. Geprüft ohne Browser über python3.

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

import * as theme from "../src/utils/theme.js";

const ROOT = resolve(__dirname, "..");
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

// ---------------------------------------------------------------------------
describe("A5 (AW-1): Kontrast des Links in der Blase zur Standardfläche", () => {
  const { light, dark } = theme.PRIVACY_BUBBLE_BG;

  it("ATTRIBUTES.md: Standardfläche der Blase mit den Werten aus PRIVACY_BUBBLE_BG, Fläche aus der Seite zählt nicht", () => {
    const line = read("ATTRIBUTES.md")
      .split("\n")
      .find((l) => l.startsWith("**KI-Hinweis (E24):**"));
    expect(line).toBeTruthy();
    // die frühere Zusage galt jeder Fläche der Blase, auch einer aus der Seite
    expect(line).not.toMatch(/4,5:1 zu ihrer Fläche/);
    expect(line).toContain(
      `zur Standardfläche der Blase (hell ${light}, dunkel ${dark}); eine Blasenfläche aus der Seite zählt dafür nicht`,
    );
  });

  it("README nennt dieselben Werte", () => {
    const readme = read("README.md");
    expect(readme).toContain(
      `mindestens 4,5:1 auch zur Standardfläche der Blase, hell \`${light}\`, dunkel \`${dark}\``,
    );
  });
});

// ---------------------------------------------------------------------------
// A7 und A6: Prüfskript ohne Browser über python3 (Playwright wie für die
// Browser-Prüfungen; ohne python3 übersprungen, wie W16 in
// datenschutz-rc4.test.jsx)
const PY_OK =
  spawnSync("python3", ["-c", "import playwright, numpy, PIL"], {
    cwd: ROOT,
    encoding: "utf8",
  }).status === 0;
function py(code) {
  const r = spawnSync(
    "python3",
    [
      "-c",
      [
        "import sys, json",
        "sys.path.insert(0, 'tests/visual')",
        "import datenschutz_blase as b",
        code,
      ].join("\n"),
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 60000 },
  );
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

describe.skipIf(!PY_OK)(
  "A7 (AW-5): datenschutz_blase.py prüft die Ansichten aus Abschnitt 8",
  () => {
    // Abschnitt 8: Chatfenster 768, 1280 und 1440; In der Seite aufgeklappt
    // 1024, 1440 und 1920; mobil 390 als Chatfenster und als Vollbild In der
    // Seite
    const SECTION_8 = [
      ["fenster-768", "bubble", 768],
      ["fenster-1280", "bubble", 1280],
      ["fenster-1440", "bubble", 1440],
      ["seite-1024", "inline", 1024],
      ["seite-1440", "inline", 1440],
      ["seite-1920", "inline", 1920],
      ["mobil-fenster-390", "bubble", 390],
      ["mobil-seite-390", "inline", 390],
    ];

    it("VIEWS und die Standardauswahl von --views", () => {
      const out = py(
        "print(json.dumps({'views': [list(v[:3]) for v in b.VIEWS], 'args': b.parse_args([]).views}))",
      );
      expect(out.views).toEqual(SECTION_8);
      expect(out.args).toEqual(SECTION_8.map((v) => v[0]));
    });

    it("geplante Zahl der Prüfungen je Auswahl", () => {
      const plan = (argv) =>
        py(
          `print(json.dumps(b.planned_count(b.parse_args(${JSON.stringify(argv)}))))`,
        );
      // je Ansicht, Sprache und Farbschema 9 Prüfungen mit und 4 ohne
      // Schalter, einmalig 6, L1 Linkfarbe 2 Ansichten x Farbschemata x 3
      // Linkfarben
      expect(plan([])).toBe(8 * 2 * 2 * 13 + 6 + 2 * 2 * 3);
      expect(
        plan([
          "--views",
          "seite-1024",
          "--lang",
          "de",
          "--themes",
          "light",
          "--skip-once",
          "--skip-links",
        ]),
      ).toBe(13);
      expect(plan(["--themes", "dark", "--skip-once"])).toBe(
        8 * 2 * 13 + 2 * 3,
      );
    });

    it("Ausstieg 1 bei Fehlern, ohne Ergebnis und wenn die Zahl der Ergebnisse nicht zum Plan passt", () => {
      const code = (results, planned) =>
        py(
          `print(json.dumps(b.exit_code(json.loads(${JSON.stringify(JSON.stringify(results))}), ${planned})))`,
        );
      const ok = { key: "x", ok: true, detail: {} };
      const bad = { key: "y", ok: false, detail: {} };
      expect(code([ok, ok, ok], 3)).toBe(0);
      expect(code([ok, bad], 2)).toBe(1);
      expect(code([], 0)).toBe(1);
      // weniger als geplant (abgebrochene Ansicht) und mehr als geplant
      // (neue Prüfung ohne angepassten Plan)
      expect(code([ok, ok], 3)).toBe(1);
      expect(code([ok, ok, ok, ok], 3)).toBe(1);
    });
  },
);

describe.skipIf(!PY_OK)(
  "A6 (AW-3, C1): Laufangabe der README zu datenschutz_blase.py",
  () => {
    const para = () =>
      read("README.md")
        .split("\n")
        .find((l) => l.startsWith("Datenschutz-Blase beim Start (7.23-rc5"));

    it("die Zahl des Laufs ist die geplante Zahl eines vollständigen Laufs", () => {
      const planned = py(
        "print(json.dumps(b.planned_count(b.parse_args([]))))",
      );
      const m = para().match(
        /Lauf am \d\d\.\d\d\.\d{4} gegen den Build von [0-9a-f]{7}\b[^:]*: `datenschutz_blase\.py` (\d+) von (\d+)/,
      );
      expect(m, "Laufangabe mit Build fehlt").toBeTruthy();
      expect([Number(m[1]), Number(m[2])]).toEqual([planned, planned]);
    });

    it("je Prüfskript der Laufangabe ist der Build genannt", () => {
      const run = para().slice(para().indexOf("Lauf am "));
      for (const script of [
        "datenschutz_blase.py",
        "datenschutz_fenster.py",
        "rc18_farben.py",
        "fensterbreite.py",
      ])
        expect(run, script).toMatch(
          new RegExp(`\`${script.replace(".", "\\.")}\` \\d+ von \\d+`),
        );
      // eine Angabe „mit demselben Build“ ohne den Build selbst reicht nicht
      expect(run).not.toMatch(/mit demselben Build\./);
    });
  },
);
