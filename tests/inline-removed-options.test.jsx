import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Rückbau „Schließt bei Verlassen“ (inlineCloseOn) und „Hinweis Unterhaltung“
// (inlineResumeHint + Texte): gesetzte Attribute bzw. visual_config-Werte sind
// wirkungslos — keine Warnung, keine Verlaufsabfrage beim Laden, kein
// Hinweis-Chip, keine Leave-Listener. Browser-Prüfung: inline_input.py
// („LV Rückbau“).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
const chatService = vi.hoisted(() => ({
  streamChat: vi.fn(() => new Promise(() => {})),
  getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
  embedSessionHistory: vi.fn(async () => []),
  listConversations: vi.fn(async () => []),
}));
vi.mock("@/models/chatService", () => ({ default: chatService }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

import { embedderSettings } from "../src/main.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import * as layout from "../src/utils/layout.js";
import InlineChat from "../src/components/InlineChat/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
// Stand vor dem Rückbau (Script-Attribute bzw. visual_config)
const OLD = {
  inlineCloseOn: "leave",
  inlineResumeHint: true,
  inlineResumePlaceholder: "Weiter fragen …",
  inlineResumeText: "Unterhaltung fortsetzen",
  inlineRestartText: "Neu starten",
};

let container;
let root;
let warn;
let fetchSpy;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Object.values(chatService).forEach((f) => f.mockClear());
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Rückbau inlineCloseOn / inlineResumeHint", () => {
  it("Script-Attribute und visual_config: keine Warnung, nichts validiert", async () => {
    const fetchConfig = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...OLD, inlineCloseOn: "hover" }),
    }));
    const s = await loadEmbedSettings(
      { ...BASE, ...OLD, inlineCloseOn: "nie" },
      fetchConfig,
    );
    expect(warn).not.toHaveBeenCalled();
    expect(s.inlineOpenOn).toBe("submit");
  });

  it("keine Exporte der entfernten Funktionen", () => {
    for (const name of [
      "closesOnLeave",
      "resumeHintEnabled",
      "cssTimeMs",
      "INLINE_CLOSE_ON_VALUES",
      "DEFAULT_INLINE_CLOSE_ON",
      "DEFAULT_INLINE_RESUME_PLACEHOLDER",
      "INLINE_CHIPS_MAX_WITH_HINT",
      "DEFAULT_LEAVE_DELAY_MS",
    ])
      expect(layout[name]).toBeUndefined();
    expect(chatService.embedHistorySummary).toBeUndefined();
  });

  it("Leiste mit alten Werten: kein Chip, normaler Platzhalter, 0 Netzwerk-Aufrufe, keine Zeiger-Listener", async () => {
    const add = vi.spyOn(document, "addEventListener");
    const mountTarget = document.createElement("div");
    document.body.appendChild(mountTarget);
    const host = document.createElement("div");
    mountTarget.appendChild(host);
    embedderSettings.hostElement = host;
    act(() =>
      root.render(
        <InlineChat
          settings={{
            ...BASE,
            ...OLD,
            loaded: true,
            displayMode: "inline",
            inlineInput: true,
            inlineLayout: "overlay",
            defaultMessages: ["Spanisch A1", "Yoga", "KI", "Töpfern"],
          }}
          mountTarget={mountTarget}
          sessionId="s-1"
          conversationId="c-1"
          newConversation={vi.fn()}
          switchConversation={vi.fn()}
          justCreatedRef={{ current: false }}
        />,
      ),
    );
    await act(async () => {});
    expect(container.querySelector("#anything-llm-inline-resume")).toBeNull();
    expect(container.querySelector("#anything-llm-inline-restart")).toBeNull();
    expect(container.querySelectorAll(".allm-inline-chip")).toHaveLength(4);
    expect(
      container.querySelector("#anything-llm-inline-input").placeholder,
    ).toBe("Stellen Sie hier Ihre Frage …");
    expect(fetchSpy).not.toHaveBeenCalled();
    Object.values(chatService).forEach((f) => expect(f).not.toHaveBeenCalled());
    const types = add.mock.calls.map((c) => c[0]);
    expect(types).not.toContain("pointermove");
    expect(warn).not.toHaveBeenCalled();
  });
});
