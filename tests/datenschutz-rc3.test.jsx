import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Datenschutz in der Fußzeile, Korrekturen nach rc2
// (issues/datenschutz-fusszeile/fixliste-rc2.md, Widget W12 und W13,
// Nutzerrückmeldung vom 24.10.2026).
// W13 D2 gekippt: die Begrüßung ist immer eine Blase. data-greeting-style
//   wirkt nicht (Gruppe A wie data-privacy-notice, verworfen mit Hinweis),
//   greetingStyle fest "bubble"; den Textzweig gibt es nicht mehr.
// Neue Funktionen über Namensraum-Importe: am alten Stand scheitert der
// einzelne Test an seiner Prüfung, nicht die Datei am Import.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
const chatService = vi.hoisted(() => ({
  streamChat: vi.fn(() => new Promise(() => {})),
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

import { embedderSettings } from "../src/main.jsx";
import * as scriptAttrs from "../src/hooks/useScriptAttributes.js";
import * as layout from "../src/utils/layout.js";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";

const { loadEmbedSettings } = scriptAttrs;
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// Antwort eines Servers ab 7.23 ohne gespeicherte Werte (fest "bubble")
const SERVER_STANDARDS = {
  greetingStyle: "bubble",
  suggestionStyle: "pills",
  followUps: "pills",
  disclaimer: "footer",
  privacyNotice: "link",
  defaultMessages: ["Ich suche einen Deutschkurs."],
  defaultMessagesStandard: true,
};
const HISTORY = [
  { role: "user", content: "Gibt es Yoga?", sentAt: 1 },
  { role: "assistant", content: "Ja, montags.", sentAt: 2, chatId: 1 },
];
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));
const load = (script, server = SERVER_STANDARDS) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let container;
let root;
let warn;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
function render(el) {
  act(() => root.render(el));
}
const $ = (sel) => container.querySelector(sel);
const warnings = () => warn.mock.calls.map(([m]) => String(m));
const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

// ---------------------------------------------------------------------------
describe("W13: Begrüßung immer als Blase, data-greeting-style wirkt nicht", () => {
  it("Gruppe A: data-greeting-style wird verworfen, eine Warnzeile mit Hinweis", async () => {
    expect(scriptAttrs.DC_COVERED).toContain("greetingStyle");
    const s = await load({ greetingStyle: "text" });
    expect(s.greetingStyle).toBe("bubble");
    const mine = warnings().filter((w) => w.includes("data-greeting-style"));
    expect(mine).toEqual([
      "[AnythingLLM Embed] Einbau-Angabe data-greeting-style wirkt nicht. Die Begrüßung erscheint immer als Blase.",
    ]);
  });

  it.each([
    ["Standards des Servers", SERVER_STANDARDS],
    [
      "gespeicherter Altwert text",
      { ...SERVER_STANDARDS, greetingStyle: "text" },
    ],
    ["leere Antwort", {}],
  ])("fest bubble mit %s, auch mit Skript-Angabe", async (_n, server) => {
    for (const script of [
      {},
      { greetingStyle: "text" },
      { greetingStyle: "bubble" },
    ])
      expect((await load(script, server)).greetingStyle).toBe("bubble");
  });

  it("fest bubble ohne Antwort vom Server", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, greetingStyle: "text" },
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(s.greetingStyle).toBe("bubble");
  });

  it("ein Weg für feste Werte: greetingStyle bei KI-Hinweis und Link, nicht bei den verfeinerbaren Standards", () => {
    expect(layout.FIXED_STANDARDS).not.toHaveProperty("greetingStyle");
    expect(layout.LOCKED_STANDARDS).toEqual({
      disclaimer: "footer",
      disclaimerText: null,
      privacyNotice: "link",
      greetingStyle: "bubble",
    });
    // auch dann, wenn die Angabe als Skript-Angabe gemeldet wäre
    const out = layout.applyFixedStandards(
      { greetingStyle: "text" },
      {},
      new Set(["greetingStyle"]),
    );
    expect(out.greetingStyle).toBe("bubble");
  });

  it("ungültiger Server-Wert: Warnzeile nennt bubble (Standard)", async () => {
    await load({}, { ...SERVER_STANDARDS, greetingStyle: "foo" });
    const line = warnings().find((w) =>
      w.includes("Ungültiger greetingStyle-Wert"),
    );
    expect(line).toContain('es gilt "bubble" (Standard).');
  });

  it.each([
    ["text", "text"],
    ["ohne Angabe", undefined],
  ])(
    "ChatHistory zeigt die Blase auch mit greetingStyle %s (Textzweig entfällt)",
    (_n, value) => {
      const settings = { suggestionStyle: "pills", greetingStyle: value };
      render(<ChatHistory settings={settings} history={[]} />);
      expect($("#anything-llm-greeting-bubble")).not.toBeNull();
      expect($("#anything-llm-greeting-text")).toBeNull();
      expect($("p.allm-text-center")).toBeNull();
      act(() => root.unmount());
      root = createRoot(container);
      render(<ChatHistory settings={settings} history={HISTORY} />);
      const welcome = $("#chat-history").firstElementChild.firstElementChild;
      expect(welcome.id).toBe("anything-llm-panel-welcome");
    },
  );

  it("Quelltext: kein Textzweig der Begrüßung mehr", () => {
    const src = read(
      "src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx",
    );
    expect(src).not.toContain("anything-llm-greeting-text");
    expect(src).not.toMatch(/greetingStyle\s*===/);
  });

  it("Doku: data-greeting-style wirkt nicht (ATTRIBUTES.md, README.md)", () => {
    const row = read("ATTRIBUTES.md")
      .split("\n")
      .find((l) => l.startsWith("| `data-greeting-style`"));
    expect(row).toContain("wirkt nicht");
    for (const file of ["ATTRIBUTES.md", "README.md"]) {
      const doc = read(file);
      expect(doc, file).not.toMatch(
        /data-greeting-style="text"`? wirkt (wieder|immer|seit)/,
      );
      expect(doc, file).not.toContain('data-greeting-style="text"\n');
    }
  });
});

// ---------------------------------------------------------------------------
// W12 Chatfenster ab 768 px nie schmaler als 360 px (Nutzer 24.10.2026:
// „Ja, machen wir gerne 360px“): bis 7.23-rc2 40 % bzw. ab 1280 px 25 %,
// also 307 px bei 768, 320 px bei 1280, 342 px bei 1366; der Platzhalter
// brach um (mit Mikrofon-Button). Die Messung im Browser steht in
// tests/visual/fensterbreite.py.
describe("W12: Chatfenster mindestens 360 px", () => {
  const classes = () => String(layout.BUBBLE_WINDOW_CLASSES || "").split(/\s+/);

  it("eine Mindestbreite für Standard und Fenstergröße aus dem Design Center", () => {
    expect(layout.WINDOW_MIN_WIDTH_PX).toBe(360);
    expect(layout.bubbleWindowCss({ windowWidth: "300px" })).toContain(
      "width: min(max(360px, 300px), calc(100vw - 32px)) !important;",
    );
  });

  it("Klassen: max(40 %, 360 px) ab 768 px, max(25 %, 360 px) ab 1280 px, mobil Vollbild", () => {
    const min = layout.WINDOW_MIN_WIDTH_PX;
    expect(classes()).toEqual(
      expect.arrayContaining([
        "allm-w-full",
        "allm-h-full",
        "allm-inset-0",
        `md:allm-max-w-[max(40%,${min}px)]`,
        `xl:allm-max-w-[max(25%,${min}px)]`,
        "md:allm-max-h-[77%]",
      ]),
    );
    expect(classes()).not.toContain("md:allm-max-w-[40%]");
    expect(classes()).not.toContain("xl:allm-max-w-[25%]");
  });

  it("App.jsx nutzt die Klassen aus layout.js (eine Quelle), keine eigene Fensterbreite", () => {
    const src = read("src/App.jsx");
    expect(src).toContain("BUBBLE_WINDOW_CLASSES");
    expect(src).not.toMatch(/allm-max-w-\[/);
  });

  // Rechnung wie im Browser: Breite = min(100 %, max(Anteil, 360 px)); der
  // Randabstand (16 px je Seite, mit data-offset-x höchstens 200 px) bleibt
  // ab 768 px immer frei
  it.each([
    [768, 360],
    [1024, 409.6],
    [1279, 511.6],
    [1280, 360],
    [1366, 360],
    [1440, 360],
    [1920, 480],
  ])("bei %i px Breite %f px", (vw, want) => {
    const share = vw >= 1280 ? 0.25 : 0.4;
    const width = Math.min(
      vw,
      Math.max(share * vw, layout.WINDOW_MIN_WIDTH_PX),
    );
    expect(width).toBeCloseTo(want, 1);
    expect(width + 2 * 16).toBeLessThanOrEqual(vw);
    expect(width + 200).toBeLessThanOrEqual(vw);
  });
});
