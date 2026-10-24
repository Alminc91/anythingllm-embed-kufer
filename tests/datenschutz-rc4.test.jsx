import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Datenschutz in der Fußzeile, Korrekturen nach dem Nachreview rc3
// (issues/datenschutz-fusszeile/fixliste-rc3.md, Widget W15 bis W17).
// W15 (NW-1, NW-2): Doku-Tests prüfen Fakten aus dem Code statt Prosa: die
//   Gruppentabellen in ATTRIBUTES.md gegen DC_COVERED, IGNORED_HINTS,
//   FIXED_STANDARDS, INLINE_STANDARDS und LOCKED_STANDARDS, die Rangfolge
//   gegen dieselbe Zuordnung, die Symbolnamen der Zeile „Umsetzung“ gegen
//   die Exporte der Module.
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
