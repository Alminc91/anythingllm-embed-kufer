import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// KIE-565 Nachtrag (Nutzer 15.10.2026): Datenschutz-Hinweis im Design Center
// abschaltbar (Schalter, privacyNotice "none" oder "bubble").
// Bewusste Änderung (7.23, Nutzerentscheidung 23.10.2026 „ob wir diese
// Option im Backend gar nicht erst anbieten … er ist immer dabei“): kein
// Schalter mehr, der Datenschutz-Hinweis ist immer der Link „Datenschutz“
// unter der Eingabe (privacyNotice "link"). Kein gespeicherter Wert, kein
// Script-Attribut und kein fehlender Server zeigt eine Datenschutz-Blase oder
// schaltet den Link ab. Weitere Fälle: tests/datenschutz-fenster.test.jsx.

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
    ["none", "link"],
    [" NONE ", "link"],
    ["bubble", "link"],
    ["modal", "link"],
    ["popup", "link"],
    [undefined, "link"],
    [null, "link"],
    ["", "link"],
    [false, "link"],
  ])("privacyNoticeSetting(%j) -> %s", (value, expected) => {
    expect(privacyNoticeSetting(value)).toBe(expected);
  });

  it("Server none -> link (kein Abschalten mehr)", async () => {
    expect((await load({}, { privacyNotice: "none" })).privacyNotice).toBe(
      "link",
    );
  });

  it("Wert fehlt, bubble oder Altwert modal vom Server -> link", async () => {
    for (const server of [
      {},
      { privacyNotice: "bubble" },
      { privacyNotice: "modal" },
      { privacyNotice: "kaputt" },
      { privacyNotice: "" },
    ])
      expect((await load({}, server)).privacyNotice).toBe("link");
  });

  it("Script-Attribut ändert nichts, in beide Richtungen", async () => {
    for (const privacyNotice of ["bubble", "modal"])
      expect(
        (await load({ privacyNotice }, { privacyNotice: "none" }))
          .privacyNotice,
      ).toBe("link");
    expect(
      (await load({ privacyNotice: "none" }, { privacyNotice: "bubble" }))
        .privacyNotice,
    ).toBe("link");
    expect((await load({ privacyNotice: "none" }, {})).privacyNotice).toBe(
      "link",
    );
  });

  it("Server nicht erreichbar: Hinweis bleibt an, auch mit data-privacy-notice none", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, privacyNotice: "none" },
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(s.privacyNotice).toBe("link");
  });

  it("applyFixedStandards: immer link", () => {
    expect(applyFixedStandards({ privacyNotice: "none" }).privacyNotice).toBe(
      "link",
    );
    expect(
      applyFixedStandards({}, { privacyNotice: "none" }).privacyNotice,
    ).toBe("link");
  });
});

describe("Darstellung: nie eine Datenschutz-Blase, Link immer da", () => {
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

  // Bewusste Änderung (7.23): auch ohne Wert und mit Altwert keine Blase
  it("Wert fehlt, bubble oder Altwert modal: keine Blase, keine Karte mit Sperre, Link da", async () => {
    for (const server of [
      {},
      { privacyNotice: "bubble" },
      { privacyNotice: "modal" },
    ]) {
      const settings = await load({}, server);
      render(
        <ChatContainer
          sessionId="s-1"
          conversationId="c-1"
          knownHistory={[]}
          settings={{ ...settings, enableStt: false }}
        />,
      );
      expect($("#anything-llm-privacy-bubble")).toBe(null);
      expect($("#anything-llm-privacy-notice")).toBe(null);
      expect($("#anything-llm-privacy-link")).not.toBe(null);
      expect($("#message-input").disabled).toBe(false);
    }
  });
});
