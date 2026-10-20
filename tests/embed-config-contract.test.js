import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Vertrag Fork und Widget für GET /embed/:id/config (Fixliste 7.22-rc13,
// F01 bis F03 mit E10 bis E12): tests/fixtures/embedConfigContract.json.
// Hier die Widget-Seite: Abruf mit ?language= und Auflösung der Antwort des
// Servers samt Skript-Attributen. Mit KUFER_FORK_DIR (Checkout des Forks
// anythingllm-kufer, Branch feat/design-center-standard) zusätzlich die
// Gegenprobe gegen den Fork selbst: Standard-Startvorschläge und Sprachwahl
// aus server/utils/chats/embedDefaults.js und, falls vorhanden, die
// Fixture-Kopie im Fork (wortgleich). Ohne die Variable wird übersprungen
// (wie KUFER_EMBED_DIR im Fork).

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

describe("Vertrag /config: Antwort des Servers -> Startvorschläge und Willkommensblasen (F02, F03, E10, E11)", () => {
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
});

// Gegenprobe gegen den Fork (KUFER_FORK_DIR)
const forkDir = process.env.KUFER_FORK_DIR;
const describeFork = forkDir ? describe : describe.skip;
describeFork("Vertrag /config: Gegenprobe gegen den Fork (KUFER_FORK_DIR)", () => {
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

  it("Fixture-Kopie im Fork (falls vorhanden) wortgleich", () => {
    const copy = join(
      forkDir,
      "server/__tests__/utils/chats/fixtures/embedConfigContract.json",
    );
    if (!existsSync(copy)) return;
    expect(JSON.parse(readFileSync(copy, "utf8"))).toEqual(contract);
  });
});
