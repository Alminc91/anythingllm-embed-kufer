import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Widget-Teil von issues/widget-grenzen-kontakt.md: Fehlerblase je errorCode
// mit Kontaktsatz (AK-7 bis AK-10, AK-12, AK-13), kein HTML und mailto nur
// mit gültiger Adresse (NAK-3), andere Fehler nie mit dem Grenzentext
// (NAK-4), Kontakt im Menü der Titelleiste nur mit Adresse und mit
// unverändertem Betreff (AK-15, §7). Texte aus der Vertrags-Fixture
// tests/fixtures/embedLimitWidgetCases.json (texts). Der Weg der 429-
// Antwort bis in die Nachricht: tests/widget-grenzen-kontakt-vertrag.test.js.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

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
vi.mock("@/models/chatService", () => ({
  default: {
    getAudioStatus: vi.fn(async () => ({ stt: false, tts: false })),
    sendFeedback: vi.fn(async () => true),
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
  I18nextProvider: ({ children }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

import { embedderSettings } from "../src/main.jsx";
import HistoricalMessage from "../src/components/ChatWindow/ChatContainer/ChatHistory/HistoricalMessage/index.jsx";
import PromptReply from "../src/components/ChatWindow/ChatContainer/ChatHistory/PromptReply/index.jsx";
import ChatHistory from "../src/components/ChatWindow/ChatContainer/ChatHistory/index.jsx";
import ChatWindowHeader from "../src/components/ChatWindow/Header/index.jsx";
import { loadEmbedSettings } from "../src/hooks/useScriptAttributes.js";
import { UI_TEXTS } from "../src/utils/layout.js";

const contract = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "embedLimitWidgetCases.json"),
    "utf8",
  ),
);
const TEXTS = contract.texts;
const KINDS = ["session_limit", "daily_limit", "technical"];
const EMAIL = "info@vhs-beispiel.de";
const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const fetchConfig = (config) =>
  vi.fn(async () => ({ ok: true, json: async () => structuredClone(config) }));

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  embedderSettings.settings = {};
});
function render(el) {
  act(() => root.render(el));
}
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => [...container.querySelectorAll(sel)];
const norm = (s) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim();
const expected = (lang, kind, email) =>
  email
    ? TEXTS[lang][kind].withEmail.replace("<E-Mail>", email)
    : TEXTS[lang][kind].withoutEmail;
// errorCode der Fixture je Art (technical = ohne Kennung)
const codeOf = (kind) => (kind === "technical" ? undefined : kind);

function historical(settings, errorCode, error = "Rate limit exceeded") {
  render(
    <HistoricalMessage
      uuid="m-1"
      message={null}
      role="assistant"
      error={error}
      errorCode={errorCode}
      sentAt={1760000000}
      sessionId="s-1"
      settings={settings}
    />,
  );
  return $("[data-error-notice]");
}
function live(settings, errorCode, error = "Rate limit exceeded") {
  embedderSettings.settings = settings;
  render(
    <PromptReply
      reply={null}
      pending={false}
      error={error}
      errorCode={errorCode}
      settings={settings}
    />,
  );
  return $("[data-error-notice]");
}

// Prüft Wortlaut, Link und Art einer Fehlerblase
function expectNotice(el, lang, kind, email) {
  expect(el, `${lang} ${kind}`).not.toBeNull();
  expect(el.getAttribute("data-error-notice")).toBe(kind);
  expect(norm(el.textContent)).toBe(expected(lang, kind, email));
  const links = [...el.querySelectorAll("a")];
  if (!email) {
    expect(links).toHaveLength(0);
    expect(el.textContent).not.toMatch(/kufer|@/i);
    return;
  }
  expect(links).toHaveLength(1);
  // mailto ohne Betreff, Linktext = Adresse, nichts dahinter
  expect(links[0].getAttribute("href")).toBe(`mailto:${email}`);
  expect(links[0].textContent).toBe(email);
  expect(norm(el.textContent).endsWith(email)).toBe(true);
}

describe("Fehlerblase je errorCode im Verlauf (HistoricalMessage, AK-7 bis AK-10, AK-12, AK-13)", () => {
  for (const lang of ["de", "en"])
    for (const kind of KINDS) {
      it(`${lang} ${kind} mit E-Mail für Besucher`, () => {
        const el = historical(
          { language: lang, supportEmail: EMAIL },
          codeOf(kind),
        );
        expectNotice(el, lang, kind, EMAIL);
      });
      it(`${lang} ${kind} ohne E-Mail: kein Kontaktsatz, keine Kufer-Adresse`, () => {
        const el = historical(
          { language: lang, supportEmail: "" },
          codeOf(kind),
        );
        expectNotice(el, lang, kind, null);
      });
    }

  it("Sprache ohne eigene Texte (fr) und ohne Angabe: deutsch", () => {
    expectNotice(
      historical({ language: "fr", supportEmail: EMAIL }, "daily_limit"),
      "de",
      "daily_limit",
      EMAIL,
    );
    expectNotice(
      historical({ supportEmail: EMAIL }, "session_limit"),
      "de",
      "session_limit",
      EMAIL,
    );
  });

  it("Standard des Widgets (nichts gespeichert): kein Kontaktsatz (AK-10, AK-16)", async () => {
    const settings = await loadEmbedSettings(BASE, fetchConfig({}));
    for (const kind of KINDS)
      expectNotice(historical(settings, codeOf(kind)), "de", kind, null);
  });

  it("fehlende settings: Standard der Sprache aus embedderSettings, ohne Adresse", () => {
    embedderSettings.settings = { language: "en", supportEmail: EMAIL };
    render(
      <HistoricalMessage
        uuid="m-1"
        message={null}
        role="assistant"
        error="x"
        errorCode="daily_limit"
      />,
    );
    expectNotice($("[data-error-notice]"), "en", "daily_limit", EMAIL);
  });
});

describe("Fehlerblase während der Antwort (PromptReply, AK-7 bis AK-10, AK-13)", () => {
  for (const lang of ["de", "en"])
    for (const kind of KINDS)
      it(`${lang} ${kind} mit und ohne E-Mail`, () => {
        expectNotice(
          live({ language: lang, supportEmail: EMAIL }, codeOf(kind)),
          lang,
          kind,
          EMAIL,
        );
        expectNotice(
          live({ language: lang, supportEmail: "" }, codeOf(kind)),
          lang,
          kind,
          null,
        );
      });
});

describe("ChatHistory reicht errorCode und settings an beide Blasen (AK-11 Widget-Seite)", () => {
  const question = { role: "user", content: "Gibt es Yogakurse?", uuid: "u" };
  it("Antwort nach 429 (abort, nicht animiert): HistoricalMessage mit Grenzentext", () => {
    render(
      <ChatHistory
        settings={{ language: "de", supportEmail: EMAIL }}
        history={[
          question,
          {
            role: "assistant",
            content: null,
            closed: true,
            error: "Rate limit exceeded",
            errorCode: "daily_limit",
            animate: false,
            pending: false,
          },
        ]}
      />,
    );
    expectNotice($("[data-error-notice]"), "de", "daily_limit", EMAIL);
  });

  it("noch animierte Antwort mit Fehler: PromptReply mit Grenzentext", () => {
    render(
      <ChatHistory
        settings={{ language: "en", supportEmail: EMAIL }}
        history={[
          question,
          {
            role: "assistant",
            uuid: "a",
            content: "",
            error: "x",
            errorCode: "session_limit",
            animate: true,
            pending: false,
          },
        ]}
      />,
    );
    expectNotice($("[data-error-notice]"), "en", "session_limit", EMAIL);
  });
});

describe("Kein HTML, mailto nur mit gültiger Adresse (NAK-3)", () => {
  it.each(
    contract.supportEmailValues.invalid.map((v) => [JSON.stringify(v), v]),
  )(
    "supportEmail %s: kein Link, kein Kontaktsatz, kein Element aus der Eingabe",
    (_label, value) => {
      for (const kind of KINDS) {
        const el = historical(
          { language: "de", supportEmail: value },
          codeOf(kind),
        );
        expect(norm(el.textContent)).toBe(expected("de", kind, null));
        expect(el.querySelectorAll("a, img, b, script, iframe")).toHaveLength(
          0,
        );
      }
    },
  );

  it("Adresse mit Apostroph erscheint als Text, href unverändert", () => {
    const email = "o'brien@vhs.de";
    const el = historical(
      { language: "de", supportEmail: email },
      "session_limit",
    );
    expectNotice(el, "de", "session_limit", email);
    expect(el.innerHTML).toContain("o'brien@vhs.de");
  });

  it("Text des Servers (error, errorMsg) erscheint nie in der Blase", () => {
    const el = historical(
      { language: "de", supportEmail: EMAIL },
      "daily_limit",
      "<img src=x onerror=alert(1)> Rate limit exceeded",
    );
    expect(el.textContent).not.toMatch(/Rate limit|img/);
    expect(el.querySelectorAll("img")).toHaveLength(0);
  });
});

describe("Andere Fehler nie mit dem Grenzentext (NAK-4)", () => {
  const limitWords =
    /für heute|Morgen ist er|today's limit|no longer available today/i;
  it.each([
    ["ohne errorCode", undefined],
    ["unbekannte Kennung", "rate_limit"],
    ["andere Schreibweise", "Daily_Limit"],
    ["Liste", ["daily_limit"]],
    ["Zahl", 429],
  ])("%s: technischer Text (Verlauf und während der Antwort)", (_n, code) => {
    for (const lang of ["de", "en"]) {
      const settings = { language: lang, supportEmail: EMAIL };
      for (const el of [historical(settings, code)]) {
        expectNotice(el, lang, "technical", EMAIL);
        expect(el.textContent).not.toMatch(limitWords);
      }
      expectNotice(live(settings, code), lang, "technical", EMAIL);
    }
  });
});

describe("Kontakt im Menü der Titelleiste nur mit Adresse (AK-15, §7 Betreff)", () => {
  function header(settings) {
    render(
      <ChatWindowHeader
        sessionId="s-1"
        conversationId="c-1"
        settings={{ ...settings, loaded: true }}
        closeChat={() => {}}
        setChatHistory={() => {}}
        openHistory={() => {}}
      />,
    );
    const options = $('[aria-label="Optionen"], [aria-label="Options"]');
    act(() => options.click());
    return $$('a[href^="mailto:"]');
  }

  it("nichts gespeichert (Standard des Widgets): kein Kontakt-Link", async () => {
    const settings = await loadEmbedSettings(BASE, fetchConfig({}));
    expect(header(settings)).toHaveLength(0);
    expect(container.textContent).not.toContain("E-Mail Support");
    expect(container.innerHTML).not.toMatch(/kufer\.de/);
    // übrige Einträge wie bisher
    for (const t of ["Chat zurücksetzen", "Frühere Chats", "Chat-ID"])
      expect(container.textContent).toContain(t);
  });

  it("ungültige Adresse: kein Kontakt-Link", () => {
    expect(header({ supportEmail: "kontakt(at)vhs.de" })).toHaveLength(0);
    act(() => root.unmount());
    root = createRoot(container);
    expect(
      header({ supportEmail: "a@vhs.de?bcc=fremd@example.org" }),
    ).toHaveLength(0);
  });

  it("mit Adresse wie bisher: Betreff und Text der Mail unverändert", async () => {
    const settings = await loadEmbedSettings(
      BASE,
      fetchConfig({ supportEmail: EMAIL, brandText: "vhs Beispiel" }),
    );
    const links = header(settings);
    expect(links).toHaveLength(1);
    const subject = 'Anfrage zum Chatbot "vhs Beispiel" von localhost';
    const body = "\n\n---\nChat-ID: c-1";
    expect(links[0].getAttribute("href")).toBe(
      `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    );
    expect(links[0].textContent).toBe("E-Mail Support");
  });

  it("Betreff je Sprache wörtlich wie bisher (layout.js mailSubject)", () => {
    expect(UI_TEXTS.de.mailSubject("Name", "host.de")).toBe(
      'Anfrage zum Chatbot "Name" von host.de',
    );
    expect(UI_TEXTS.en.mailSubject("Name", "host.de")).toBe(
      'Question about the chatbot "Name" from host.de',
    );
  });
});

describe("Texte im Code (Textregeln)", () => {
  it("de und en gepflegt, wortgleich mit der Fixture, keine Gedankenstriche", () => {
    for (const lang of ["de", "en"]) {
      const t = UI_TEXTS[lang];
      for (const key of [
        "errorSessionLimit",
        "errorDailyLimit",
        "errorTechnical",
      ]) {
        expect(Array.isArray(t[key]), `${lang} ${key}`).toBe(true);
        expect(t[key].join(" ")).not.toMatch(/[–—]/);
      }
      expect(typeof t.errorContact).toBe("string");
      expect(t.errorContact.endsWith(":")).toBe(true);
      expect(
        `${t.errorSessionLimit.join(" ")} ${t.errorContact} <E-Mail>`,
      ).toBe(TEXTS[lang].session_limit.withEmail);
      expect(`${t.errorDailyLimit.join(" ")} ${t.errorContact} <E-Mail>`).toBe(
        TEXTS[lang].daily_limit.withEmail,
      );
      expect(`${t.errorTechnical.join(" ")} ${t.errorContact} <E-Mail>`).toBe(
        TEXTS[lang].technical.withEmail,
      );
    }
  });
});
