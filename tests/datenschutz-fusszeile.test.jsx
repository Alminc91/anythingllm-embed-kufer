import { describe, expect, it } from "vitest";

// Datenschutz als Link in der Fußzeile (issues/datenschutz-fusszeile.md,
// Nutzerentscheidungen 23.10.2026): Vertrag der Texte mit dem Fork
// (server/utils/chats/embedDefaults.js, Fixture embedPanelTexts.json; die
// Gegenprobe läuft im Fork mit KUFER_EMBED_DIR und hier mit KUFER_FORK_DIR in
// tests/embed-config-contract.test.js).

import { PANEL_TEXTS, panelTexts } from "../src/utils/layout.js";

// ---------------------------------------------------------------------------
describe("Vertrag: Texte de/en wortgleich mit dem Fork", () => {
  const CONTRACT = {
    de: {
      aiDisclaimer: "Unsere KI kann Fehler machen",
      privacyLinkText: "Datenschutz",
      privacyAiTitle: "Hinweis zur KI",
      privacyAiText:
        "Unser KI-Berater ist auf richtige Auskünfte aus unserem Kursangebot optimiert. Wie jede KI kann er sich dennoch einmal irren. Wichtige Angaben wie Termine und Preise finden Sie zur Sicherheit immer auch auf der Kursseite.",
      privacyCloseText: "Schließen",
      privacyCloseLabel: "Datenschutz schließen",
      privacyTitle: "Datenschutz",
      privacyBubbleLink: "Datenschutzerklärung",
    },
    en: {
      aiDisclaimer: "Our AI can make mistakes",
      privacyLinkText: "Privacy",
      privacyAiTitle: "About the AI",
      privacyAiText:
        "Our AI advisor is optimised for accurate information about our courses. Like any AI, it can still make the occasional mistake. For safety, you can always find important details such as dates and prices on the course page.",
      privacyCloseText: "Close",
      privacyCloseLabel: "Close privacy notice",
      privacyTitle: "Privacy",
      privacyBubbleLink: "Privacy statement",
    },
  };

  it.each(["de", "en"])(
    "%s: KI-Hinweis, Linktext, KI-Punkt, Schließen",
    (lang) => {
      for (const [key, value] of Object.entries(CONTRACT[lang]))
        expect(PANEL_TEXTS[lang][key], `${lang}.${key}`).toBe(value);
      expect(panelTexts({ language: lang }).privacyLinkText).toBe(
        CONTRACT[lang].privacyLinkText,
      );
    },
  );

  it("Datenschutz-Punkte unverändert (Standardtext bleibt)", () => {
    expect(PANEL_TEXTS.de.privacyPoints).toEqual([
      "Ihre Anfragen bleiben auf Servern in Deutschland und werden nicht an Dritte weitergegeben.",
      "Mitarbeiter der Einrichtung können Gespräche zur Qualitätssicherung einsehen.",
      "Bitte teilen Sie nur Angaben, die für Ihre Anfrage nötig sind.",
    ]);
    expect(PANEL_TEXTS.en.privacyPoints).toEqual([
      "Your requests stay on servers in Germany and are not passed on to third parties.",
      "Staff of the institution may view conversations for quality assurance.",
      "Please only share information that is necessary for your request.",
    ]);
  });

  it("Textregeln: keine Gedankenstriche, keine Gendersprache, Sie-Form", () => {
    for (const lang of ["de", "en"])
      for (const value of Object.values(CONTRACT[lang])) {
        expect(value).not.toMatch(/[–—]/);
        expect(value).not.toMatch(/\*innen|:innen|Innen\b|_innen/);
      }
    // nur Sie-Form, kein Du
    expect(CONTRACT.de.privacyAiText).toMatch(/finden Sie/);
    expect(CONTRACT.de.privacyAiText).not.toMatch(/\b(du|dein|dich|dir)\b/i);
  });

  // Der Fork liest PANEL_TEXTS per Regex (embedDefaults.test.js,
  // KUFER_EMBED_DIR): je Feld ein einfacher Text in Anführungszeichen
  it("Quelltext: jedes Vertragsfeld als einfacher Text-Wert in PANEL_TEXTS", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(__dirname, "..", "src", "utils", "layout.js"),
      "utf8",
    );
    const start = source.indexOf("PANEL_TEXTS = {");
    for (const lang of ["de", "en"]) {
      const from = source.indexOf(`${lang}: {`, start);
      expect(from).toBeGreaterThan(start);
      for (const [key, value] of Object.entries(CONTRACT[lang])) {
        const m = new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(
          source.slice(from),
        );
        expect(m, `${lang}.${key}`).not.toBeNull();
        expect(JSON.parse(`"${m[1]}"`), `${lang}.${key}`).toBe(value);
      }
    }
  });
});
