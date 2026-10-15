import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// KIE-565 Nachtrag (Nutzer 15.10.2026): Datenschutz-Hinweis im Design Center
// abschaltbar. Allein der Server-Wert zählt: privacyNotice "none" = keine
// zweite Blase (Chatblase und Inline, leerer Chat und Verlauf), jeder andere
// und ein fehlender Wert = Blase, auch das frühere "modal". Ein Script-
// Attribut kann den Hinweis weder ab- noch einschalten (Server gewinnt wie
// beim Farbschema, D5).

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
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import {
  FIXED_STANDARDS,
  applyFixedStandards,
  privacyNoticeSetting,
} from "../src/utils/layout.js";
import { _resetPrivacyMemory } from "../src/utils/privacy.js";
import ChatContainer from "../src/components/ChatWindow/ChatContainer/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import { EmbedModeContext } from "../src/hooks/useEmbedMode.js";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const HIST = [
  { role: "user", content: "Gibt es Yoga?", sentAt: 1 },
  { role: "assistant", content: "Ja, montags.", sentAt: 2, chatId: 1 },
];

function fetchConfig(config) {
  return vi.fn(async () => ({ ok: true, json: async () => config }));
}
const load = (script, server) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.localStorage.clear();
  _resetPrivacyMemory();
  embedderSettings.settings = {};
  vi.spyOn(console, "warn").mockImplementation(() => {});
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

describe("Einstellungen: privacyNotice aus dem Design Center", () => {
  it("nicht mehr unter den festen Standards", () => {
    expect("privacyNotice" in FIXED_STANDARDS).toBe(false);
  });

  it.each([
    ["none", "none"],
    [" NONE ", "none"],
    ["bubble", "bubble"],
    ["modal", "bubble"],
    ["popup", "bubble"],
    [undefined, "bubble"],
    [null, "bubble"],
    ["", "bubble"],
    [false, "bubble"],
  ])("privacyNoticeSetting(%j) -> %s", (value, expected) => {
    expect(privacyNoticeSetting(value)).toBe(expected);
  });

  it("Server none -> none", async () => {
    expect((await load({}, { privacyNotice: "none" })).privacyNotice).toBe(
      "none",
    );
  });

  it("Wert fehlt, bubble oder Altwert modal vom Server -> bubble", async () => {
    for (const server of [
      {},
      { privacyNotice: "bubble" },
      { privacyNotice: "modal" },
      { privacyNotice: "kaputt" },
      { privacyNotice: "" },
    ])
      expect((await load({}, server)).privacyNotice).toBe("bubble");
  });

  it("Script-Attribut hebelt den Server-Wert nicht aus, in beide Richtungen", async () => {
    // Script will an, Design Center sagt aus
    for (const privacyNotice of ["bubble", "modal"])
      expect(
        (await load({ privacyNotice }, { privacyNotice: "none" }))
          .privacyNotice,
      ).toBe("none");
    // Script will aus, Design Center sagt an bzw. nichts
    expect(
      (await load({ privacyNotice: "none" }, { privacyNotice: "bubble" }))
        .privacyNotice,
    ).toBe("bubble");
    expect((await load({ privacyNotice: "none" }, {})).privacyNotice).toBe(
      "bubble",
    );
  });

  it("Server nicht erreichbar: Hinweis bleibt an, auch mit data-privacy-notice none", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, privacyNotice: "none" },
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(s.privacyNotice).toBe("bubble");
  });

  it("applyFixedStandards ohne Server-Angabe: bubble", () => {
    expect(applyFixedStandards({ privacyNotice: "none" }).privacyNotice).toBe(
      "bubble",
    );
    expect(
      applyFixedStandards({}, new Set(), { privacyNotice: "none" })
        .privacyNotice,
    ).toBe("none");
  });
});

describe("Darstellung: Schalter aus = keine Datenschutz-Blase", () => {
  it("leerer Chat: nur die Begrüßungsblase, keine leere Hülle, kein Abstand", async () => {
    const settings = await load(
      {},
      { privacyNotice: "none", privacyUrl: "/datenschutz", privacyTitle: "X" },
    );
    render(<ChatHistory settings={settings} history={[]} />);
    const greeting = $("#anything-llm-greeting-bubble");
    expect(greeting).not.toBe(null);
    expect($("#anything-llm-privacy-bubble")).toBe(null);
    expect($("#anything-llm-bubble-privacy-title")).toBe(null);
    expect(container.textContent).not.toContain("privacyBubbleLink");
    // die Spalte enthält nur die Begrüßungsblase: kein leerer Rahmen
    expect(greeting.parentElement.children).toHaveLength(1);
    expect(greeting.nextElementSibling).toBe(null);
    // Pillen folgen wie bisher direkt unter dem Blasenblock
    expect($("#anything-llm-panel-welcome")).not.toBe(null);
  });

  it("Verlauf (Begrüßung bleibt stehen): keine Datenschutz-Blase", async () => {
    const settings = await load({}, { privacyNotice: "none" });
    render(<ChatHistory settings={settings} history={HIST} />);
    const welcome = $("#anything-llm-panel-welcome");
    expect(welcome.hasAttribute("data-persistent")).toBe(true);
    expect(welcome.querySelector("#anything-llm-greeting-bubble")).not.toBe(
      null,
    );
    expect(welcome.querySelector("#anything-llm-privacy-bubble")).toBe(null);
  });

  it("Chatblase und Inline: keine Blase, keine Karte, Eingabe frei", async () => {
    for (const displayMode of ["bubble", "inline"]) {
      const settings = await load(
        { displayMode },
        { privacyNotice: "none", displayMode },
      );
      render(
        <EmbedModeContext.Provider value={displayMode}>
          <ChatContainer
            sessionId="s-1"
            conversationId={`c-${displayMode}`}
            knownHistory={[]}
            settings={{ ...settings, enableStt: false }}
          />
        </EmbedModeContext.Provider>,
      );
      expect($("#anything-llm-greeting-bubble")).not.toBe(null);
      expect($("#anything-llm-privacy-bubble")).toBe(null);
      expect($("#anything-llm-privacy-notice")).toBe(null);
      expect($("#message-input").disabled).toBe(false);
    }
  });

  it("Wert fehlt oder Altwert modal: Blase da, keine Karte mit Sperre", async () => {
    for (const server of [{}, { privacyNotice: "modal" }]) {
      const settings = await load({}, server);
      render(
        <ChatContainer
          sessionId="s-1"
          conversationId="c-1"
          knownHistory={[]}
          settings={{ ...settings, enableStt: false }}
        />,
      );
      expect($("#anything-llm-privacy-bubble")).not.toBe(null);
      expect($("#anything-llm-privacy-notice")).toBe(null);
      expect($("#message-input").disabled).toBe(false);
    }
  });
});
