import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Korrekturrunde Design Center 2.0, Fixliste 7.22-rc10, Teil Widget
// (issues/rollout-721/fixliste-7.22-rc10.md):
// W1 Untertitel-Kollision in der Titelleiste des Chatfensters: Knopfgruppe
//    (⋮, X) im Fluss statt absolut, Titelblock darf schrumpfen (min-width 0).
//    Seit Fixliste 7.22-rc13 N3 (Nutzerentscheidung) brechen Name und
//    Untertitel um statt mit Ellipse zu enden; die Fälle unten prüfen das
//    (weitere N3-Fälle in rc13-fixes.test.jsx). Die Maße (Abstand zu ⋮
//    >= 8 px, nichts abgeschnitten bei 360/390/420 px) misst
//    .test-storage/rc13/probe_n3.py mit gebautem dist und Playwright; hier
//    nur die Struktur, die jsdom prüfen kann.
// W2 Konsolenwarnungen „Chatfenster“ statt „Chat-Blase“.

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
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
  I18nextProvider: ({ children }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

import { embedderSettings } from "../src/main.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import {
  findMountTarget,
  warnIfInlineInputIgnored,
} from "../src/utils/layout.js";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => config }));
const load = (script, server = {}) =>
  loadEmbedSettings({ ...BASE, ...script }, fetchConfig(server));
const DE_SUBTITLE = "Online-Berater mit künstlicher Intelligenz";
const NAME = "KI-Berater der Volkshochschule";

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.querySelectorAll("#kufer-assistent").forEach((el) => el.remove());
  vi.restoreAllMocks();
});
const render = (el) => act(() => root.render(el));
const $ = (sel) => container.querySelector(sel);
const hasClass = (el, cls) =>
  el.className.split(/\s+/).includes(cls) ? true : el.className;

// ---------------------------------------------------------------------------
describe("W1: Untertitel in der Titelleiste läuft nicht unter das Menü", () => {
  it("Knopfgruppe (⋮, X) steht im Fluss und schrumpft nicht; Titelteil darf schrumpfen", async () => {
    render(<ChatWindowHeader settings={await load({ brandText: NAME })} />);
    const menu = $('button[aria-label="Optionen"]');
    expect(menu).not.toBe(null);
    const group = menu.parentElement;
    expect(hasClass(group, "allm-absolute")).not.toBe(true);
    expect(hasClass(group, "allm-flex-shrink-0")).toBe(true);
    const left = $("#anything-llm-header").firstElementChild;
    expect(hasClass(left, "allm-flex-1")).toBe(true);
    expect(hasClass(left, "allm-min-w-0")).toBe(true);
  });

  it("Name und Untertitel: umbrechen statt Ellipse, kein title (N3), Titelblock min-width 0", async () => {
    render(<ChatWindowHeader settings={await load({ brandText: NAME })} />);
    const sub = $("#anything-llm-header-subtitle");
    expect(sub.textContent).toBe(DE_SUBTITLE);
    expect(sub.hasAttribute("title")).toBe(false);
    expect(hasClass(sub, "allm-truncate")).not.toBe(true);
    expect(sub.style.overflowWrap).toBe("anywhere");
    const name = sub.previousElementSibling;
    expect(name.textContent).toBe(NAME);
    expect(name.hasAttribute("title")).toBe(false);
    expect(hasClass(name, "allm-truncate")).not.toBe(true);
    expect(sub.parentElement.style.minWidth).toMatch(/^0(px)?$/);
  });

  it("eigener Untertitel vom Server: voller Text, umbrechend", async () => {
    render(
      <ChatWindowHeader
        settings={await load(
          { brandText: NAME },
          { assistantSubtitle: "durchsucht 1.243 Kurse" },
        )}
      />,
    );
    const sub = $("#anything-llm-header-subtitle");
    expect(sub.textContent).toBe("durchsucht 1.243 Kurse");
    expect(sub.hasAttribute("title")).toBe(false);
    expect(sub.style.overflowWrap).toBe("anywhere");
  });

  it('ohne Untertitel ("" vom Server): Name umbrechend, ⋮ und ✕ im Fluss', async () => {
    render(
      <ChatWindowHeader
        settings={await load({ brandText: NAME }, { assistantSubtitle: "" })}
      />,
    );
    expect($("#anything-llm-header-subtitle")).toBe(null);
    const name = [...container.querySelectorAll("span")].find(
      (s) => s.textContent === NAME,
    );
    expect(name).not.toBe(undefined);
    expect(name.hasAttribute("title")).toBe(false);
    expect(hasClass(name, "allm-truncate")).not.toBe(true);
    expect(name.style.overflowWrap).toBe("anywhere");
    const group = $('button[aria-label="Optionen"]').parentElement;
    expect(hasClass(group, "allm-absolute")).not.toBe(true);
  });

  it("kompakt (mobile Tastatur): kein Untertitel, Name umbrechend", async () => {
    render(
      <ChatWindowHeader settings={await load({ brandText: NAME })} compact />,
    );
    expect($("#anything-llm-header-subtitle")).toBe(null);
    const name = [...container.querySelectorAll("span")].find(
      (s) => s.textContent === NAME,
    );
    expect(hasClass(name, "allm-truncate")).not.toBe(true);
    expect(name.style.overflowWrap).toBe("anywhere");
  });
});

// ---------------------------------------------------------------------------
describe("W2: Konsolenwarnungen sagen „Chatfenster“, nicht „Chat-Blase“", () => {
  const warnings = () => console.warn.mock.calls.map((c) => String(c[0]));

  it("Platzhalter nicht gefunden", () => {
    expect(findMountTarget("#kufer-assistent")).toBe(null);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain("Das Chatfenster wird verwendet.");
    expect(warnings()[0]).not.toMatch(/Blase/);
  });

  it("Platzhalter ungeeignet (fremder Namensraum)", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "kufer-assistent";
    document.body.appendChild(svg);
    expect(findMountTarget("#kufer-assistent")).toBe(null);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain("ungeeignet");
    expect(warnings()[0]).toContain("Das Chatfenster wird verwendet.");
    expect(warnings()[0]).not.toMatch(/Blase/);
  });

  it("inlineInput am Skript außerhalb von In der Seite", () => {
    expect(warnIfInlineInputIgnored({ inlineInput: true }, false)).toBe(true);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain("im Chatfenster ignoriert");
    expect(warnings()[0]).not.toMatch(/Blase/);
    expect(warnIfInlineInputIgnored({ inlineInput: true }, true)).toBe(false);
    expect(warnings()).toHaveLength(1);
  });

  it("kein Quelltext unter src/ gibt „Chat-Blase“ aus (Kommentare ausgenommen)", () => {
    const hits = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(jsx?|css)$/.test(name)) {
          readFileSync(p, "utf8")
            .split("\n")
            .forEach((line, i) => {
              const code = line.replace(/\/\/.*$/, "");
              if (code.includes("Chat-Blase")) hits.push(`${p}:${i + 1}`);
            });
        }
      }
    };
    walk(`${process.cwd()}/src`);
    expect(hits).toEqual([]);
  });
});
