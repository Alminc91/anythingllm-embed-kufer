import { afterEach, describe, expect, it, vi } from "vitest";

// CLAUDE.md: Zeitstempel deutsch "DD.MM.YYYY, HH:MM:SS Uhr" über formatDate
vi.mock("../src/main.jsx", () => ({ embedderSettings: { settings: {} } }));

import { embedderSettings } from "../src/main.jsx";
import { formatDate } from "../src/utils/date.js";

// 23.04.2025, 12:30:57 Ortszeit (sentAt in Sekunden)
const TS = new Date(2025, 3, 23, 12, 30, 57).getTime() / 1000;

afterEach(() => {
  embedderSettings.settings = {};
});

describe("formatDate", () => {
  it("deutsch ohne Option: Uhrzeit HH:MM Uhr", () => {
    embedderSettings.settings = { language: "de" };
    expect(formatDate(TS)).toBe("12:30 Uhr");
  });

  it("deutsch mit { withDate: true }: DD.MM.YYYY, HH:MM:SS Uhr", () => {
    embedderSettings.settings = { language: "de" };
    expect(formatDate(TS, { withDate: true })).toBe("23.04.2025, 12:30:57 Uhr");
    expect(formatDate(TS, null, { withDate: true })).toBe(
      "23.04.2025, 12:30:57 Uhr",
    );
  });

  it("ohne Zeitstempel bzw. ungültig: leer", () => {
    embedderSettings.settings = { language: "de" };
    expect(formatDate(null, { withDate: true })).toBe("");
    expect(formatDate("x", { withDate: true })).toBe("");
  });

  it("nicht deutsch: Datum ohne „Uhr“", () => {
    embedderSettings.settings = { language: "en" };
    const out = formatDate(TS, { withDate: true });
    expect(out).toMatch(/2025/);
    expect(out).toMatch(/30:57/);
    expect(out).not.toMatch(/Uhr/);
  });
});
