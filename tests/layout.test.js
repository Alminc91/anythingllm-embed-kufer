import { describe, expect, it } from "vitest";
import { layoutValidations } from "@/utils/layout";

// Bestandsverhalten der Whitelist-Validierung (Grundlage für theme, s. theme.test.js)
describe("layoutValidations", () => {
  it("inlineTheme akzeptiert nur light/dark (Groß-/Kleinschreibung egal)", () => {
    expect(layoutValidations.inlineTheme("Dark")).toBe("dark");
    expect(layoutValidations.inlineTheme("light")).toBe("light");
    expect(layoutValidations.inlineTheme("blau")).toBeUndefined();
    expect(layoutValidations.inlineTheme(7)).toBeUndefined();
  });

  it("inheritFont versteht Attribut ohne Wert als an", () => {
    expect(layoutValidations.inheritFont("")).toBe(true);
    expect(layoutValidations.inheritFont("false")).toBe(false);
  });
});
