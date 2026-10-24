import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Datenschutz in der Fußzeile, Korrekturen nach dem Nachreview rc3
// (issues/datenschutz-fusszeile/fixliste-rc3.md, Widget W15 bis W17).
// W15 (NW-1, NW-2): Doku-Tests prüfen Fakten aus dem Code statt Prosa: die
//   Gruppentabellen in ATTRIBUTES.md gegen DC_COVERED, IGNORED_HINTS,
//   FIXED_STANDARDS, INLINE_STANDARDS und LOCKED_STANDARDS, die Rangfolge
//   gegen dieselbe Zuordnung, die Symbolnamen der Zeile „Umsetzung“ gegen
//   die Exporte der Module.
// W16 (NW-3, NW-4): Das Messskript tests/visual/datenschutz_fenster.py kann
//   am Fehler scheitern: --only allein wählt die Prüfungen (setzt
//   --rc2-only), eine Prüfung ohne Ergebnis und eine leere oder kaputte
//   W6-Messung sind Fehler. Geprüft ohne Browser über python3 (Planung,
//   Auswertung und Zähler des Skripts).
// W17 (NW-6, NW-7, NW-8): Kommentare nach dem Stand des Codes: die
//   Merge-Schleife nennt nur Schlüssel aus EMPTY_MEANS_NONE, BUBBLE_STYLE
//   nennt das Fenster mit festen Farben (R1-D1), die Mindestbreite verspricht
//   keine Wirkung über ein älteres Design Center.
// Neue Exporte über Namensraum-Importe: am alten Stand scheitert der
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

import * as scriptAttrs from "../src/hooks/useScriptAttributes.js";
import * as layout from "../src/utils/layout.js";
import * as theme from "../src/utils/theme.js";

const ROOT = resolve(__dirname, "..");
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

// data-greeting-bubble-text -> greetingBubbleText
const keyOf = (attr) =>
  attr.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// Abschnitt von der Zeile, die mit start beginnt, bis vor die erste
// folgende Zeile, die mit einem der Enden beginnt
function section(lines, start, ends) {
  const from = lines.findIndex((l) => l.startsWith(start));
  expect(from, `Abschnitt „${start}“ fehlt`).toBeGreaterThanOrEqual(0);
  let to = lines.length;
  for (let i = from + 1; i < lines.length; i++)
    if (ends.some((e) => lines[i].startsWith(e))) {
      to = i;
      break;
    }
  return lines.slice(from + 1, to);
}

// Schlüssel der Attribute in der ersten Spalte der Tabellenzeilen
function keysOfTable(rows) {
  const keys = new Set();
  for (const row of rows) {
    if (!row.startsWith("| `data-")) continue;
    const first = row.split("|")[1];
    for (const m of first.matchAll(/`(data-[a-z-]+)`/g)) keys.add(keyOf(m[1]));
  }
  return keys;
}

function attributeTables() {
  const lines = read("ATTRIBUTES.md").split("\n");
  return {
    A: keysOfTable(
      section(lines, "## Vom Design Center abgedeckt", [
        "Ebenfalls ohne Wirkung",
      ]),
    ),
    ignored: keysOfTable(
      section(lines, "Ebenfalls ohne Wirkung", ["---", "## "]),
    ),
    B: keysOfTable(
      section(lines, "## Feste Standards verfeinern", ["### ", "---", "## "]),
    ),
    C: keysOfTable(
      section(lines, "## Entwickler-Attribute (wirken immer)", ["---", "## "]),
    ),
  };
}

// Gruppen nach dem Code
function codeGroups() {
  const A = new Set(scriptAttrs.DC_COVERED);
  const ignored = new Set(Object.keys(scriptAttrs.IGNORED_HINTS || {}));
  const B = new Set(
    [
      ...Object.keys(layout.FIXED_STANDARDS),
      ...Object.keys(layout.INLINE_STANDARDS),
    ].filter((k) => !A.has(k) && !ignored.has(k)),
  );
  const locked = new Set(Object.keys(layout.LOCKED_STANDARDS));
  return { A, ignored, B, locked };
}

describe("W15 (NW-1): ATTRIBUTES.md folgt der Gruppenzuordnung im Code", () => {
  it("IGNORED_HINTS ist exportiert (eine Quelle für die Tabelle „Ebenfalls ohne Wirkung“)", () => {
    expect(Object.keys(scriptAttrs.IGNORED_HINTS || {})).toEqual(
      expect.arrayContaining(["disclaimer", "disclaimerText", "windowWidth"]),
    );
  });

  it("Gruppe A: die Tabelle enthält genau DC_COVERED", () => {
    const doc = attributeTables();
    const { A } = codeGroups();
    expect(
      [...A].filter((k) => !doc.A.has(k)),
      "fehlt in Gruppe A",
    ).toEqual([]);
    expect(
      [...doc.A].filter((k) => !A.has(k)),
      "steht in Gruppe A, ist nicht in DC_COVERED",
    ).toEqual([]);
  });

  it("Ohne Wirkung (nicht aus dem Design Center): die Tabelle enthält genau IGNORED_HINTS", () => {
    const doc = attributeTables();
    const { ignored } = codeGroups();
    expect(ignored.size).toBeGreaterThan(0);
    expect([...doc.ignored].sort()).toEqual([...ignored].sort());
  });

  it("Gruppe B: jeder feste Standard steht dort, kein Schlüssel aus A, ohne Wirkung oder LOCKED_STANDARDS", () => {
    const doc = attributeTables();
    const { A, ignored, B, locked } = codeGroups();
    expect(B.size).toBeGreaterThan(5);
    expect(
      [...B].filter((k) => !doc.B.has(k)),
      "fehlt in Gruppe B",
    ).toEqual([]);
    expect(
      [...doc.B].filter((k) => A.has(k) || ignored.has(k) || locked.has(k)),
      "steht in Gruppe B, wirkt laut Code aber nicht",
    ).toEqual([]);
  });

  it("LOCKED_STANDARDS: verworfen (DC_COVERED oder IGNORED_HINTS) und in Gruppe A oder „ohne Wirkung“, nie in B oder C", () => {
    const doc = attributeTables();
    const { A, ignored, locked } = codeGroups();
    expect(locked.size).toBeGreaterThan(0);
    for (const key of locked) {
      expect(A.has(key) || ignored.has(key), `${key} im Code`).toBe(true);
      expect(doc.A.has(key) || doc.ignored.has(key), `${key} in der Doku`).toBe(
        true,
      );
      expect(doc.B.has(key) || doc.C.has(key), `${key} in B oder C`).toBe(
        false,
      );
    }
  });

  it("Gruppe C enthält keinen Schlüssel ohne Wirkung", () => {
    const doc = attributeTables();
    const { A, ignored, B } = codeGroups();
    expect(doc.C.size).toBeGreaterThan(3);
    expect(
      [...doc.C].filter((k) => A.has(k) || ignored.has(k) || B.has(k)),
    ).toEqual([]);
  });

  // Bezeichnung in der Tabelle „Rangfolge“ je Schlüssel; die Gruppe kommt
  // aus dem Code (codeGroups)
  const RANG_LABELS = {
    greetingStyle: /Begrüßungs(stil|-)/,
    privacyNotice: /Datenschutz-Hinweis/,
    suggestionStyle: /Vorschlagsstil/,
    followUps: /Folgefragen/,
    offsetX: /Randabstände/,
  };
  it.each(Object.entries(RANG_LABELS))(
    "Rangfolge: %s steht in der Zeile seiner Gruppe und nur dort",
    (key, label) => {
      const lines = read("ATTRIBUTES.md").split("\n");
      const row = (g) => lines.find((l) => l.startsWith(`| **${g} ·`)) || "";
      const { A, B } = codeGroups();
      const group = A.has(key) ? "A" : B.has(key) ? "B" : null;
      expect(group, `${key} ohne Gruppe im Code`).not.toBeNull();
      const other = group === "A" ? "B" : "A";
      expect(row(group)).toMatch(label);
      expect(row(other)).not.toMatch(label);
    },
  );

  it("Zeile „Umsetzung“: jeder genannte Name ist ein Export des genannten Moduls", () => {
    const modules = {
      "src/hooks/useScriptAttributes.js": scriptAttrs,
      "src/utils/layout.js": layout,
      "src/utils/theme.js": theme,
    };
    const line = read("ATTRIBUTES.md")
      .split("\n")
      .find((l) => l.startsWith("Umsetzung:"));
    expect(line).toBeTruthy();
    const named = [];
    for (const m of line.matchAll(/`(src\/[^`]+\.jsx?)` \(([^)]*)\)/g)) {
      expect(Object.keys(modules), m[1]).toContain(m[1]);
      for (const n of m[2].matchAll(/`([^`]+)`/g)) named.push([m[1], n[1]]);
    }
    expect(named.length).toBeGreaterThan(5);
    expect(
      named.filter(([file, name]) => !(name in modules[file])),
      "kein Export",
    ).toEqual([]);
  });
});

describe("W15 (NW-2): README zum Datenschutz-Fenster", () => {
  it("das Fenster folgt keinen Variablen der Seite (feste Farben je Farbschema, R1-D1)", () => {
    const readme = read("README.md");
    expect(readme).not.toMatch(/Datenschutz-Fenster folgt[^.]*Variablen/);
    const para = readme
      .split("\n")
      .find((l) => l.startsWith("Nicht über Variablen gesteuert"));
    expect(para).toMatch(/Datenschutz-Fenster hat[^.]*feste Farben/);
  });
});

// ---------------------------------------------------------------------------
// W16: Messskript ohne Browser prüfen (python3 mit Playwright wie für die
// Browser-Prüfungen; ohne python3 übersprungen)
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
        "import sys, json, math",
        "sys.path.insert(0, 'tests/visual')",
        "import datenschutz_fenster as d",
        code,
      ].join("\n"),
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 60000 },
  );
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

describe.skipIf(!PY_OK)("W16 (NW-3, NW-4): datenschutz_fenster.py", () => {
  const ALL = ["w13", "w2", "w4", "w5", "w6"];
  const VIEWS = [
    "fenster-1280",
    "fenster-1440",
    "seite-1024",
    "seite-1440",
    "seite-1920",
    "mobil-fenster-390",
    "mobil-seite-390",
  ];
  const plan = (argv) =>
    py(
      `p = d.plan(d.parse_args(${JSON.stringify(argv)}))\n` +
        "print(json.dumps({**p, 'rc2': sorted(p['rc2'])}))",
    );

  it.each([
    [
      ["--only", "w13", "--skip-once"],
      { views: [], once: false, rc2: ["w13"] },
    ],
    [["--only", "w13"], { views: [], once: false, rc2: ["w13"] }],
    [
      ["--rc2-only", "--only", "w6", "w2"],
      { views: [], once: false, rc2: ["w2", "w6"] },
    ],
    [["--rc2-only"], { views: [], once: false, rc2: ALL }],
    [[], { views: VIEWS, once: true, rc2: ALL }],
    [["--skip-once"], { views: VIEWS, once: false, rc2: [] }],
  ])("Plan für %j", (argv, want) => {
    expect(plan(argv)).toEqual(want);
  });

  it("eine Prüfung ohne Ergebnis ist ein Fehler („nichts gemessen“)", () => {
    const out = py(
      [
        "d.RC2_CHECKS['leer'] = lambda browser, base_url: None",
        "d.RC2_CHECKS['voll'] = lambda browser, base_url: d.record('voll', True, {})",
        "d.run_rc2(None, None, ['leer', 'voll'])",
        "print(json.dumps([[r['key'], r['ok']] for r in d.RESULTS]))",
      ].join("\n"),
    );
    expect(out).toEqual([
      ["leer: nichts gemessen", false],
      ["voll", true],
    ]);
  });

  // gültige W6-Messung (In der Seite 1440, breit) und Abwandlungen ohne
  // Messwert: keine Zeichen gemessen (rows 0, maxChars -inf oder null),
  // Innenbreite 0 oder NaN (null), keine Textspalte, keine Linien
  const GOOD = {
    dialog: 1060,
    body: 1060,
    bodyInner: 1020,
    column: 640,
    maxWidth: "640.3px",
    ch70: "640.3px",
    left: 20,
    lines: [1060, 1060],
    maxChars: 86,
    rows: 4,
  };
  const problems = (m, limited) =>
    py(
      `m = json.loads(${JSON.stringify(JSON.stringify(m))})\n` +
        "m = {k: (float('-inf') if v == '-inf' else v) for k, v in m.items()}\n" +
        `print(json.dumps(d.w6_problems(m, ${limited ? "True" : "False"})))`,
    );

  it("gültige Messung ohne Befund, mit und ohne Grenze", () => {
    expect(problems(GOOD, true)).toEqual([]);
    expect(
      problems(
        { ...GOOD, column: 1020, maxWidth: "none", maxChars: 140 },
        false,
      ),
    ).toEqual([]);
  });

  it.each([
    ["rows 0", { rows: 0 }],
    ["maxChars -inf", { maxChars: "-inf", rows: 0 }],
    ["maxChars null", { maxChars: null }],
    ["bodyInner null", { bodyInner: null }],
    ["column null", { column: null }],
    ["keine Linien", { lines: [] }],
    ["zu viele Zeichen", { maxChars: 150 }],
  ])("%s ist ein Befund (mit Grenze), ohne Absturz", (_, change) => {
    expect(problems({ ...GOOD, ...change }, true).length).toBeGreaterThan(0);
  });

  it.each([
    ["rows 0", { rows: 0 }],
    ["bodyInner null", { bodyInner: null }],
    ["column null", { column: null }],
  ])("%s ist ein Befund (ohne Grenze), ohne Absturz", (_, change) => {
    const m = { ...GOOD, column: 1020, maxWidth: "none", ...change };
    expect(problems(m, false).length).toBeGreaterThan(0);
  });

  it("README: --only nennt, dass es --rc2-only setzt", () => {
    expect(read("README.md")).toMatch(/`--only[^`]*`[^.]*setzt `--rc2-only`/);
  });
});

// ---------------------------------------------------------------------------
// W17: Kommentare folgen dem Code
// Kommentarzeilen direkt über der ersten Zeile, die marker enthält
function commentAbove(src, marker) {
  const lines = src.split("\n");
  const at = lines.findIndex((l) => l.includes(marker));
  expect(at, marker).toBeGreaterThan(0);
  const out = [];
  for (let i = at - 1; i >= 0 && lines[i].trim().startsWith("//"); i--)
    out.unshift(lines[i]);
  return out.join("\n");
}

describe("W17: Kommentare nach dem Stand des Codes", () => {
  it("NW-6: die Merge-Schleife nennt als Ausnahme nur Schlüssel aus EMPTY_MEANS_NONE", () => {
    const src = read("src/hooks/useScriptAttributes.js");
    const list = src.match(/const EMPTY_MEANS_NONE = \[([^\]]*)\]/);
    expect(list).toBeTruthy();
    const allowed = [...list[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(allowed).toEqual(["assistantSubtitle"]);
    const comment = commentAbove(src, "const mergedServerConfig = {}");
    expect(comment).toContain("EMPTY_MEANS_NONE");
    const named = Object.keys(scriptAttrs.DEFAULT_SETTINGS).filter((k) =>
      new RegExp(`\\b${k}\\b`).test(comment),
    );
    expect(named.filter((k) => !allowed.includes(k))).toEqual([]);
  });

  it("NW-7: BUBBLE_STYLE koppelt das Datenschutz-Fenster nicht an die Blase (R1-D1)", () => {
    const src = read(
      "src/components/ChatWindow/ChatContainer/ChatHistory/PanelWelcome/index.jsx",
    );
    const comment = commentAbove(src, "const BUBBLE_STYLE = {");
    expect(comment).not.toMatch(/Datenschutz-Fenster nutzt dieselbe/);
    expect(comment).toContain("PRIVACY_DIALOG_COLORS");
    expect(theme.PRIVACY_DIALOG_COLORS).toBeTruthy();
  });

  it("NW-8: Mindestbreite ohne Versprechen einer Fenstergröße aus einem älteren Design Center", () => {
    const comment = commentAbove(
      read("src/utils/layout.js"),
      "export const WINDOW_MIN_WIDTH_PX",
    );
    expect(comment).not.toMatch(/älteren Design Center/);
    expect(comment).toContain("IGNORED_HINTS");
    expect(read("tests/visual/fensterbreite.py")).not.toMatch(
      /älteren Design Center/,
    );
  });
});
