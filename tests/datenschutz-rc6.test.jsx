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
