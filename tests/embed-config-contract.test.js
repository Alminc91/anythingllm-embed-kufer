import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Vertrag Fork und Widget für GET /embed/:id/config (Fixliste 7.22-rc13,
// F01 bis F03 mit E10 bis E12): tests/fixtures/embedConfigContract.json.
// Hier die Widget-Seite: Abruf mit ?language= und Auflösung der Antwort des
// Servers samt Skript-Attributen (Startvorschläge, Willkommensblasen, seit
// Fixliste AK-12 A4 auch privacyNotice und privacyStartBubble). Mit
// KUFER_FORK_DIR (Checkout des Forks anythingllm-kufer, Branch
// feat/design-center-standard) zusätzlich die Gegenprobe gegen den Fork
// selbst: Standard-Startvorschläge und Sprachwahl
// aus server/utils/chats/embedDefaults.js und die Fixture-Kopie im Fork
// (wortgleich; fehlt sie, scheitert der Test, Fixliste 7.22-rc16 W45), dazu
// die Standardtexte der Panel-Optik (PANEL_TEXTS) gegen embedDefaultTexts()
// und die Fork-Fixture embedPanelTexts.json (Fixliste 7.22-rc19 E30). Ohne
// die Variable wird übersprungen (wie KUFER_EMBED_DIR im Fork), mit dem Grund
// im Namen des Blocks; im rc-Build laufen beide Seiten mit gesetzten
// Variablen.

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

import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import { courseCountWordValue, PANEL_TEXTS } from "../src/utils/layout.js";
import { courseCountTexts } from "../src/utils/courseCount.js";

const FIXTURE = join(__dirname, "fixtures", "embedConfigContract.json");
const contract = JSON.parse(readFileSync(FIXTURE, "utf8"));
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const CONFIG_PATH = `${BASE.baseApiUrl}/${BASE.embedId}/config`;

const fetchJson = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));

describe("Vertrag /config: Sprache im Abruf (F01, E12)", () => {
  it.each(contract.languageQuery.map((c) => [c.scriptLanguage, c.query]))(
    "data-language %j -> ?language=%s",
    async (scriptLanguage, query) => {
      const fetchFn = fetchJson({});
      const script =
        scriptLanguage === null ? {} : { language: scriptLanguage };
      await loadEmbedSettings({ ...BASE, ...script }, fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const url = new URL(fetchFn.mock.calls[0][0]);
      expect(`${url.origin}${url.pathname}`).toBe(CONFIG_PATH);
      expect([...url.searchParams.keys()]).toEqual(["language"]);
      expect(url.searchParams.get("language")).toBe(query);
    },
  );
});

describe("Vertrag /config: Antwort des Servers -> Startvorschläge, Willkommensblasen und Datenschutz (F02, F03, E10, E11, AF-6)", () => {
  it.each(contract.cases.map((c) => [c.name, c]))("%s", async (_name, c) => {
    const s = await loadEmbedSettings(
      { ...BASE, ...c.script },
      fetchJson(c.config),
    );
    for (const [key, value] of Object.entries(c.widget))
      expect(s[key], key).toEqual(value);
    // Kennzeichen sind nur Transport, nicht Teil der Settings
    expect(s).not.toHaveProperty("defaultMessagesSaved");
    expect(s).not.toHaveProperty("defaultMessagesStandard");
  });

  it("Fixture: Standards wortgleich in den Fällen, keine Gedankenstriche", () => {
    const { de, en } = contract.standardSuggestions;
    const standards = { de, en };
    for (const c of contract.cases) {
      if (c.config?.defaultMessagesStandard !== true) continue;
      const q = contract.languageQuery.find(
        (l) => l.query === c.request.language,
      );
      expect(q, c.name).toBeTruthy();
      expect(c.config.defaultMessages, c.name).toEqual(standards[q.standards]);
    }
    expect(JSON.stringify(contract)).not.toMatch(/[–—]/);
  });

  // A4 (Fixliste AK-12, Review AF-6): Der Vertrag deckt auch den Schalter
  // privacyStartBubble (AK-12) und den festen Datenschutz-Hinweis
  // privacyNotice "link" (AK-10) ab, nicht nur die Tests je Seite. Gespeichert
  // genau true, als Text "true", false und nicht gespeichert (mit
  // Skript-Attribut); ein Altwert von privacyNotice schaltet nichts ein.
  it("Fixture: Fälle für privacyStartBubble (true, Text, false, fehlt) und privacyNotice link (AF-6)", () => {
    const forkCases = contract.cases.filter((c) => c.fork !== false);
    const bubbleCases = forkCases.filter(
      (c) => "privacyStartBubble" in c.widget,
    );
    const stored = bubbleCases.map((c) =>
      "privacyStartBubble" in c.visualConfig
        ? c.visualConfig.privacyStartBubble
        : "fehlt",
    );
    for (const value of [true, "true", false, "fehlt"])
      expect(stored, String(value)).toContainEqual(value);
    for (const c of bubbleCases) {
      const on = c.visualConfig.privacyStartBubble === true;
      expect([c.name, c.config.privacyStartBubble]).toEqual([
        c.name,
        on ? true : undefined,
      ]);
      if (!on) expect(c.configAbsent, c.name).toContain("privacyStartBubble");
      expect([c.name, c.widget.privacyStartBubble]).toEqual([c.name, on]);
      // der Link „Datenschutz“ bleibt in jedem Fall (D1)
      expect([c.name, c.config.privacyNotice, c.widget.privacyNotice]).toEqual([
        c.name,
        "link",
        "link",
      ]);
    }
    // Skript-Attribut ohne Wirkung (Gruppe A) und Altwert privacyNotice (D2)
    expect(
      bubbleCases.some(
        (c) =>
          c.script.privacyStartBubble === "true" &&
          !("privacyStartBubble" in c.visualConfig),
      ),
    ).toBe(true);
    expect(
      bubbleCases.some(
        (c) =>
          c.visualConfig.privacyNotice === "bubble" &&
          c.widget.privacyStartBubble === false,
      ),
    ).toBe(true);
  });
});

// KIE-576 Paket 3: courseCount nach dem Vertrag (issues/KIE-576/
// KIE-576-kursanzahl.md, „Vertrag (wörtlich)“). Der Server liefert das Feld
// nur mit gültiger Kursliste und Anzeige an, sonst fehlt es ganz; das
// Widget übernimmt es geprüft (utils/layout.js courseCountValue), sonst null.
describe("Vertrag /config: courseCount (KIE-576)", () => {
  const EXAMPLE = {
    count: 812,
    offered: 837,
    hidden: 14,
    stand: "2026-10-24T08:00:00.000Z",
    word: "Kurse",
  };
  const withCount = contract.cases.filter(
    (c) => c.config?.courseCount && c.fork !== false,
  );
  // D-K5: älterer Server ohne hidden, das Widget nimmt 0
  const olderServer = contract.cases.filter(
    (c) => c.config?.courseCount && c.fork === false,
  );
  const without = contract.cases.filter((c) =>
    (c.configAbsent || []).includes("courseCount"),
  );

  it("Fixture: ein Fall mit courseCount (Beispielwerte des Vertrags) und einer ohne", () => {
    expect(withCount.length).toBeGreaterThanOrEqual(1);
    expect(without.length).toBeGreaterThanOrEqual(1);
    for (const c of withCount) {
      expect(c.config.courseCount, c.name).toEqual(EXAMPLE);
      expect(Object.keys(c.config.courseCount).sort(), c.name).toEqual([
        "count",
        "hidden",
        "offered",
        "stand",
        "word",
      ]);
      expect(c.widget.courseCount, c.name).toEqual(EXAMPLE);
    }
    expect(olderServer.length).toBeGreaterThanOrEqual(1);
    for (const c of olderServer) {
      expect(c.config.courseCount, c.name).not.toHaveProperty("hidden");
      expect(c.widget.courseCount, c.name).toEqual({ ...EXAMPLE, hidden: 0 });
    }
    for (const c of without) {
      expect(c.config, c.name).not.toHaveProperty("courseCount");
      expect(c.widget.courseCount, c.name).toBeNull();
    }
  });

  // Fixliste r2b Nr. 2: Bezeichnung ein Wort, dieselbe Liste prüft der
  // Server (Fixture wortgleich); ungültig = Standard der Sprache (word null)
  it("Bezeichnung: gültige und ungültige Eingaben der Fixture", async () => {
    const { valid, invalid } = contract.courseCountWords;
    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
    for (const [input, output] of valid) {
      expect(courseCountWordValue(input), JSON.stringify(input)).toBe(output);
      const s = await loadEmbedSettings(
        BASE,
        fetchJson({ courseCount: { ...EXAMPLE, word: input } }),
      );
      expect(s.courseCount.word, JSON.stringify(input)).toBe(output);
    }
    for (const input of invalid) {
      expect(
        courseCountWordValue(input),
        JSON.stringify(input),
      ).toBeUndefined();
      const s = await loadEmbedSettings(
        BASE,
        fetchJson({ courseCount: { ...EXAMPLE, word: input } }),
      );
      expect(s.courseCount.word, JSON.stringify(input)).toBeNull();
    }
  });

  // D-K5: Zeilen der Info-Karte wortgleich mit der Fixture (dieselben Texte
  // zeigt die Vorschau im Design Center)
  it.each(contract.courseCountTexts.cases.map((c) => [c.name, c]))(
    "Info-Karte: %s",
    async (_name, c) => {
      const s = await loadEmbedSettings(
        { ...BASE, language: c.language },
        fetchJson({ courseCount: c.courseCount }),
      );
      expect(s.courseCount).toEqual(c.courseCount);
      const t = courseCountTexts(s, Date.parse(contract.courseCountTexts.now));
      expect(
        [
          t.head,
          t.scope,
          t.hiddenLine,
          t.missingLine,
          t.gapHint,
          t.stand,
        ].filter(Boolean),
      ).toEqual(c.lines);
    },
  );

  it("weitere Schlüssel im Feld fallen weg, ein Skript-Attribut wirkt nicht", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await loadEmbedSettings(
      { ...BASE, courseCount: '{"count":5000}' },
      fetchJson({ courseCount: { ...EXAMPLE, extra: "<b>x</b>" } }),
    );
    expect(s.courseCount).toEqual(EXAMPLE);
    const none = await loadEmbedSettings(
      { ...BASE, courseCount: '{"count":5000}' },
      fetchJson({}),
    );
    expect(none.courseCount).toBeNull();
    expect(warn.mock.calls.some(([m]) => /data-course-count/.test(m))).toBe(
      true,
    );
    warn.mockRestore();
  });
});

// Gegenprobe gegen den Fork (KUFER_FORK_DIR)
const forkDir = process.env.KUFER_FORK_DIR;
const describeFork = forkDir ? describe : describe.skip;
// sichtbar im Log statt still übersprungen (W45)
if (!forkDir)
  console.warn(
    "[embed-config-contract] KUFER_FORK_DIR nicht gesetzt: Gegenprobe gegen den Fork übersprungen (4 Tests). Im rc-Build mit gesetzter Variable laufen lassen.",
  );
describeFork(
  forkDir
    ? "Vertrag /config: Gegenprobe gegen den Fork (KUFER_FORK_DIR)"
    : "Vertrag /config: Gegenprobe gegen den Fork (übersprungen: KUFER_FORK_DIR nicht gesetzt)",
  () => {
    const require = createRequire(import.meta.url);
    const defaults = () =>
      require(join(forkDir, "server/utils/chats/embedDefaults.js"));

    it("Standard-Startvorschläge je Sprache wortgleich mit embedDefaults.js", () => {
      const { defaultSuggestions } = defaults();
      for (const [lang, list] of Object.entries(contract.standardSuggestions))
        expect(defaultSuggestions(lang)).toEqual(list);
    });

    it("Wert von ?language= wählt im Fork dieselbe Sprache der Standards", () => {
      const { embedDefaultsLanguage } = defaults();
      for (const { query, standards } of contract.languageQuery)
        expect(embedDefaultsLanguage(query), query).toBe(standards);
      // fehlender Parameter
      expect(embedDefaultsLanguage(undefined)).toBe("de");
    });

    it("Fixture-Kopie im Fork vorhanden und wortgleich", () => {
      const copy = join(
        forkDir,
        "server/__tests__/utils/chats/fixtures/embedConfigContract.json",
      );
      // kein stilles Bestehen, wenn die Kopie fehlt oder umbenannt wurde (W45)
      expect(existsSync(copy), `Fixture-Kopie im Fork fehlt: ${copy}`).toBe(
        true,
      );
      expect(JSON.parse(readFileSync(copy, "utf8"))).toEqual(contract);
    });

    // E30 (Fixliste 7.22-rc19): Standardtexte der Panel-Optik wortgleich im
    // Fork (Standard und Vorbelegung des Design Centers) und in dessen
    // Vertragsfixture; bisher prüfte nur der Fork (KUFER_EMBED_DIR) und dort
    // ohne die Datenschutz-Punkte
    it("Standardtexte der Panel-Optik wortgleich mit embedDefaultTexts() und embedPanelTexts.json", () => {
      const { embedDefaultTexts } = defaults();
      const copy = join(
        forkDir,
        "server/__tests__/utils/chats/fixtures/embedPanelTexts.json",
      );
      expect(existsSync(copy), `Fixture im Fork fehlt: ${copy}`).toBe(true);
      const fixture = JSON.parse(readFileSync(copy, "utf8"));
      for (const lang of ["de", "en"]) {
        const w = PANEL_TEXTS[lang];
        const { defaultMessages, ...texts } = embedDefaultTexts(lang);
        expect(texts, lang).toEqual({
          name: w.assistantName,
          assistantSubtitle: w.assistantSubtitle,
          greeting: w.greetingBubble,
          sendMessageText: w.inputPlaceholder,
          privacyTitle: w.privacyTitle,
          privacyText: w.privacyText,
          disclaimerText: w.aiDisclaimer,
          // Datenschutz in der Fußzeile (23.10.2026): Linktext, Punkt
          // „Hinweis zur KI“ und Button im Datenschutz-Fenster
          privacyLinkText: w.privacyLinkText,
          privacyAiTitle: w.privacyAiTitle,
          privacyAiText: w.privacyAiText,
          privacyCloseText: w.privacyCloseText,
          inlineInputPlaceholder: w.inlineBarPlaceholder,
          inlineSendText: w.inlineSendText,
        });
        expect(Array.isArray(defaultMessages), lang).toBe(true);
        for (const [key, value] of Object.entries(fixture[lang]))
          expect(value, `${lang}.${key}`).toEqual(w[key]);
      }
    });
  },
);
