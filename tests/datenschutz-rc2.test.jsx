import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Datenschutz in der Fußzeile, Korrekturen nach rc1
// (issues/datenschutz-fusszeile/fixliste-rc1.md, Widget W2 bis W10,
// Entscheidungen R1-D1 bis R1-D3 vom 23.10.2026).

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
const historyState = vi.hoisted(() => ({ value: [] }));
vi.mock("@/hooks/chat/useChatHistory", () => ({
  default: () => ({
    chatHistory: historyState.value,
    setChatHistory: () => {},
    loading: false,
  }),
}));

import { embedderSettings } from "../src/main.jsx";
import * as theme from "../src/utils/theme.js";
import { contrastRatio } from "../src/utils/contrast.js";
import ChatWindow from "../src/components/ChatWindow/index.jsx";
import { EmbedModeContext } from "../src/hooks/useEmbedMode.js";
import * as layout from "../src/utils/layout.js";
import {
  DEFAULT_SETTINGS,
  loadEmbedSettings,
} from "../src/hooks/useScriptAttributes.js";

const BASE = {
  embedId: "78eda2c6-5bd0-44b5-b097-30d694a56677",
  baseApiUrl: "https://praesentation.ki.kufer.de/api/embed",
};
const OWN = {
  ...BASE,
  privacyTitle: "Datenschutz bei der VHS",
  privacyText: "• Punkt A\n• Punkt B\nAbsatz C",
  privacyUrl: "https://vhs.example/datenschutz",
};

let container;
let root;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  embedderSettings.settings = {};
  historyState.value = [];
  chatService.streamChat.mockClear();
  window.localStorage.clear();
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
const click = (el) =>
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const link = () => $("#anything-llm-privacy-link");
const dialog = () => $("[role=dialog]");
function renderWindow(settings, props = {}) {
  render(
    <ChatWindow
      closeChat={() => {}}
      settings={{ ...settings, enableStt: false }}
      sessionId="s-1"
      conversationId="c-1"
      {...props}
    />,
  );
}
function openDialog(settings = OWN) {
  renderWindow(settings);
  link().focus();
  click(link());
  return dialog();
}
const closeButton = (d = dialog()) =>
  [...d.querySelectorAll("button")].find((b) => !b.getAttribute("aria-label"));
// Regel des Theme-Stylesheets zu einem Selektor (eine Zeile je Regel)
const rule = (css, sel) =>
  css.split("\n").find((l) => l.startsWith(`${sel} {`)) || "";
const valueOf = (decl, prop) =>
  new RegExp(`(?:^|[\\s{;])${prop}: ([^;!]+) !important`)
    .exec(decl)?.[1]
    ?.trim();
// alle Variablen, die Inline-Stile im Fenster lesen
const varsInDialog = (d) => {
  const used = new Set();
  for (const el of [d, ...d.querySelectorAll("*")])
    for (const m of (el.getAttribute("style") || "").matchAll(
      /var\(\s*(--[\w-]+)/g,
    ))
      used.add(m[1]);
  return [...used].sort();
};

// ---------------------------------------------------------------------------
describe("W2, W3 (R1-D1): Datenschutz-Fenster mit festen Farben je Farbschema", () => {
  const D = `#${theme.PRIVACY_DIALOG_ID}`;

  it("Inline-Stile lesen keine Variable der Seite; nur „Schließen“ nutzt Akzent und Schrift darauf (Gruppe A)", () => {
    const d = openDialog();
    expect(varsInDialog(d)).toEqual(["--allmi-accent", "--allmi-on-accent"]);
    const close = closeButton(d);
    expect(close.style.backgroundColor).toContain("--allmi-accent");
    expect(close.style.color).toContain("--allmi-on-accent");
    // Rückfall ohne Theme-Stylesheet: die hellen festen Werte
    expect(d.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(d.style.color).toBe("rgb(34, 38, 40)");
  });

  it("Schriftgrößen fest: Fenster und Text 14 px, Überschrift 17 px (kein --allmi-font-size)", () => {
    const d = openDialog();
    expect(d.style.fontSize).toBe("14px");
    expect($(`#${theme.PRIVACY_DIALOG_BODY_ID}`).style.fontSize).toBe("14px");
    expect(d.querySelector("h2").style.fontSize).toBe("17px");
  });

  it("W3: Trennlinien mit eigener fester Linie statt --allmi-header-border", () => {
    const d = openDialog();
    const lines = [...d.querySelectorAll(".allm-privacy-dialog-line")];
    expect(lines).toHaveLength(2);
    expect(lines[0].style.borderBottom).toBe("1px solid rgb(233, 233, 233)");
    expect(lines[1].style.borderTop).toBe("1px solid rgb(233, 233, 233)");
    for (const el of lines)
      expect(el.getAttribute("style")).not.toContain("header-border");
  });

  it.each(["light", "dark"])(
    "%s: Regeln direkt am Fenster ohne var(), Fläche und Schrift lesbar",
    (mode) => {
      const css = theme.buildThemeCss({}, mode);
      const c = theme.PRIVACY_DIALOG_COLORS[mode];
      const decl = rule(css, D);
      expect(valueOf(decl, "color")).toBe(c.text);
      expect(valueOf(decl, "background-color")).toBe(c.bg);
      expect(contrastRatio(c.text, c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(
        valueOf(rule(css, `${D} .allm-privacy-dialog-line`), "border-color"),
      ).toBe(c.line);
      const dialogRules = css
        .split("\n")
        .filter((l) => l.includes(theme.PRIVACY_DIALOG_ID));
      expect(dialogRules.length).toBeGreaterThanOrEqual(5);
      for (const l of dialogRules) expect(l, l).not.toContain("var(");
    },
  );

  it("hell wie die Standard-Antwortblase, dunkel deren Fläche (D4)", () => {
    expect(theme.PRIVACY_DIALOG_COLORS.light).toMatchObject({
      text: "#222628",
      bg: "#FFFFFF",
    });
    expect(theme.PRIVACY_DIALOG_COLORS.dark).toMatchObject({
      text: theme.DARK.text,
      bg: theme.DARK.assistantBg,
    });
  });

  // Werte der Seite in modernen Farbformaten (oklch, color-mix) und
  // data-assistant-bg-color: das Theme-Stylesheet des Fensters bleibt gleich
  it.each(["light", "dark"])(
    "%s: data-assistant-bg-color, Blasenfarben und Schriftgröße ändern nichts am Fenster",
    (mode) => {
      const plain = theme.buildThemeCss({}, mode);
      const other = theme.buildThemeCss(
        {
          assistantBgColor: "oklch(0.98 0 0)",
          headerBgColor: "color-mix(in srgb, red 50%, blue)",
          textSize: 10,
        },
        mode,
      );
      const dialogRules = (css) =>
        css.split("\n").filter((l) => l.includes(theme.PRIVACY_DIALOG_ID));
      expect(dialogRules(plain).length).toBeGreaterThanOrEqual(5);
      expect(dialogRules(other)).toEqual(dialogRules(plain));
    },
  );

  it.each([
    ["Standard", {}],
    ["helle Linkfarbe #FFA102", { linkColor: "#FFA102" }],
    ["helle Linkfarbe #63b4e3", { linkColor: "#63b4e3" }],
    ["Linkfarbe wie die Fläche", { linkColor: "#FFFFFF" }],
  ])(
    "%s: Link im Fenster mindestens 4,5:1, Fokusrahmen mindestens 3:1 (hell und dunkel)",
    (_n, settings) => {
      for (const mode of ["light", "dark"]) {
        const css = theme.buildThemeCss(settings, mode);
        const bg = theme.PRIVACY_DIALOG_COLORS[mode].bg;
        const color = valueOf(rule(css, `${D} a`), "color");
        expect(color, mode).toBe(theme.privacyLinkColor(settings, mode));
        expect(contrastRatio(color, bg), mode).toBeGreaterThanOrEqual(4.5);
        for (const sel of [
          `${D} a:focus-visible, ${D} button:focus-visible`,
          `#${theme.PRIVACY_DIALOG_BODY_ID}:focus-visible, ${D} .allm-privacy-dialog-close:focus-visible`,
        ]) {
          const outline = valueOf(rule(css, sel), "outline");
          expect(outline, `${mode} ${sel}`).toBe(`2px solid ${color}`);
          expect(
            contrastRatio(outline.replace("2px solid ", ""), bg),
            `${mode} ${sel}`,
          ).toBeGreaterThanOrEqual(3);
        }
        // derselbe Wert wie der Link „Datenschutz“ in der Fußzeile, der
        // auch auf dessen Fläche reicht
        expect(
          valueOf(rule(css, `#${theme.PRIVACY_LINK_ID}`), "color"),
          mode,
        ).toBe(color);
        expect(
          contrastRatio(color, theme.AI_NOTICE_COLORS[mode].bg),
          mode,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("Fokusrahmen mit Abstand, damit er nur an die Fensterfläche grenzt; Textbereich und Schließen-Symbol innen (Panel-Rundung schneidet nicht)", () => {
    const css = theme.buildThemeCss({}, "light");
    expect(
      valueOf(
        rule(css, `${D} a:focus-visible, ${D} button:focus-visible`),
        "outline-offset",
      ),
    ).toBe("2px");
    expect(
      valueOf(
        rule(
          css,
          `#${theme.PRIVACY_DIALOG_BODY_ID}:focus-visible, ${D} .allm-privacy-dialog-close:focus-visible`,
        ),
        "outline-offset",
      ),
    ).toBe("-2px");
  });

  it("Hover des Schließen-Symbols fest je Farbschema", () => {
    for (const mode of ["light", "dark"])
      expect(theme.buildThemeCss({}, mode)).toContain(
        `@media (hover: hover) { ${D} .allm-privacy-dialog-close:hover { background-color: ${theme.PRIVACY_DIALOG_COLORS[mode].hover} !important; } }`,
      );
  });
});

// ---------------------------------------------------------------------------
describe("W4: Fokusfalle gibt den Fokus an das Element im Fenster zurück", () => {
  it("Fokus auf „Schließen“, die Antwort endet (Eingabefeld holt den Fokus): Fokus bleibt auf „Schließen“", () => {
    const d = openDialog();
    const close = closeButton(d);
    act(() => close.focus());
    expect(document.activeElement).toBe(close);
    // PromptInput fokussiert nach dem Ende einer Antwort das Textfeld
    act(() => $("#message-input").focus());
    expect(document.activeElement).toBe(close);
  });

  it("ebenso Link und Schließen-Symbol", () => {
    const d = openDialog();
    for (const el of [
      d.querySelector("a"),
      d.querySelector("button[aria-label='Datenschutz schließen']"),
    ]) {
      act(() => el.focus());
      act(() => $("#message-input").focus());
      expect(document.activeElement, el.tagName).toBe(el);
    }
  });

  it("Fokus von außerhalb des Widgets (Seite, Tab zurück): auf die Überschrift", () => {
    openDialog();
    const field = document.createElement("input");
    document.body.appendChild(field);
    try {
      act(() => field.focus());
      act(() => $("#message-input").focus());
      expect(document.activeElement).toBe(dialog().querySelector("h2"));
    } finally {
      field.remove();
    }
  });

  it("nichts wird im Hintergrund gesendet (NAK-4 bleibt)", () => {
    const d = openDialog();
    act(() => closeButton(d).focus());
    const input = $("#message-input");
    act(() => input.focus());
    expect(d.contains(document.activeElement)).toBe(true);
    expect(chatService.streamChat).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("W5: Tab im langen Text zeigt das fokussierte Element", () => {
  const LONG = {
    ...OWN,
    privacyText: Array.from(
      { length: 12 },
      (_, i) =>
        `• Punkt ${i + 1}: Ihre Anfragen werden nur für die Antwort genutzt.`,
    ).join("\n"),
  };
  const tab = (shiftKey = false) => {
    const e = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    act(() => document.activeElement.dispatchEvent(e));
    return e;
  };
  let scrolled;
  beforeEach(() => {
    scrolled = [];
    // jsdom kennt scrollIntoView nicht; aufgezeichnet wird, welches Element
    // mit welcher Ausrichtung sichtbar gemacht wird
    Element.prototype.scrollIntoView = function (opts) {
      scrolled.push({ el: this, opts });
    };
  });
  afterEach(() => {
    delete Element.prototype.scrollIntoView;
  });

  it("Tab auf den Link „Datenschutzerklärung“: der Link wird im Textbereich sichtbar, nur so weit wie nötig", () => {
    const d = openDialog(LONG);
    const a = d.querySelector("a");
    tab();
    tab();
    expect(document.activeElement).toBe(a);
    const last = scrolled.at(-1);
    expect(last?.el).toBe(a);
    expect(last?.opts).toEqual({ block: "nearest", inline: "nearest" });
  });

  it("Umschalt+Tab von „Schließen“ zurück auf den Link: ebenso", () => {
    const d = openDialog(LONG);
    const a = d.querySelector("a");
    act(() => closeButton(d).focus());
    scrolled = [];
    tab(true);
    expect(document.activeElement).toBe(a);
    expect(scrolled.map((s) => s.el)).toEqual([a]);
    expect(scrolled[0].opts).toEqual({ block: "nearest", inline: "nearest" });
  });

  it("jeder Tab-Schritt macht sein Ziel sichtbar (Text, Link, Schließen, Symbol)", () => {
    const d = openDialog(LONG);
    const targets = [];
    for (let i = 0; i < 5; i++) {
      tab();
      targets.push(document.activeElement);
    }
    expect(scrolled.map((s) => s.el)).toEqual(targets);
    expect(d.contains(targets.at(-1))).toBe(true);
  });

  it("Textbereich mit Abstand zum Rand für den Fokusrahmen (scroll-padding)", () => {
    openDialog(LONG);
    const body = $(`#${theme.PRIVACY_DIALOG_BODY_ID}`);
    expect(body.style.scrollPaddingBlock).toBe("8px");
  });
});

// ---------------------------------------------------------------------------
describe("W6 (R1-D2): Textbreite im Fenster bei „In der Seite“", () => {
  const mode = (inline, overlay = false) => ({
    inline,
    overlay,
    consumeFocusRequest: () => false,
  });
  function openIn(value) {
    render(
      <EmbedModeContext.Provider value={value}>
        <ChatWindow
          closeChat={() => {}}
          settings={{ ...OWN, enableStt: false }}
          sessionId="s-1"
          conversationId="c-1"
        />
      </EmbedModeContext.Provider>,
    );
    link().focus();
    click(link());
    return dialog();
  }
  const column = (d) => d.querySelector(".allm-privacy-dialog-text");

  it("In der Seite: Textspalte höchstens 70 Zeichen (70ch wie die Vorschau im Design Center), linksbündig", () => {
    const d = openIn(mode(true));
    const col = column(d);
    expect(col).not.toBeNull();
    expect(col.style.maxWidth).toBe("70ch");
    expect(theme.PRIVACY_TEXT_MAX_WIDTH).toBe("70ch");
    // linksbündig: keine automatische Zentrierung
    expect(col.style.marginLeft).not.toBe("auto");
    expect(col.style.marginRight).not.toBe("auto");
    // Text, KI-Punkt und Link stehen in der Spalte
    expect(col.textContent).toContain("Punkt A");
    expect(col.textContent).toContain("Hinweis zur KI");
    expect(col.querySelector("a")?.textContent).toBe("Datenschutzerklärung");
  });

  it("Kopfzeile, Button-Zeile und Bildlauf bleiben über die ganze Breite", () => {
    const d = openIn(mode(true));
    const body = $(`#${theme.PRIVACY_DIALOG_BODY_ID}`);
    expect(body.contains(column(d))).toBe(true);
    for (const el of [body, ...d.querySelectorAll(".allm-privacy-dialog-line")])
      expect(el.style.maxWidth).toBe("");
  });

  it.each([
    ["Chatfenster", mode(false)],
    ["mobil (In der Seite als Vollbild)", mode(true, true)],
  ])("%s: keine Grenze", (_n, value) => {
    const d = openIn(value);
    expect(column(d)).not.toBeNull();
    expect(column(d).style.maxWidth).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Bewusste Änderung (rc3, W13, Nutzer 24.10.2026): den Textzweig der
// Begrüßung (W7, R1-D3: normale Schriftfarbe statt gedämpft) gibt es nicht
// mehr; die Begrüßung ist immer eine Blase (tests/datenschutz-rc3.test.jsx).
describe("W7 entfällt mit W13: Begrüßung immer als Blase", () => {
  it.each(["text", "bubble"])(
    "greetingStyle %s: Begrüßungsblase, kein Text mittig",
    (value) => {
      renderWindow({ ...BASE, greetingStyle: value });
      expect($("#anything-llm-greeting-bubble")).not.toBeNull();
      expect($("#anything-llm-greeting-text")).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
describe("W8: Reste des Einmal-Hinweises entfernt", () => {
  it("keine Texte des Einmal-Hinweises mehr (de und en)", () => {
    for (const lang of ["de", "en"])
      for (const key of ["privacyButton", "privacyMoreLead", "privacyMoreLink"])
        expect(layout.PANEL_TEXTS[lang], `${lang}.${key}`).not.toHaveProperty(
          key,
        );
  });

  it("keine Konstanten, Helfer und Prüfregel des Einmal-Hinweises", () => {
    for (const name of [
      "PRIVACY_BUTTON_TEXT_MAX_LEN",
      "DEFAULT_PRIVACY_BUTTON_TEXT",
      "splitPrivacyPoints",
      "privacyPoints",
      "privacyNoticeSetting",
    ])
      expect(layout, name).not.toHaveProperty(name);
    expect(layout.layoutValidations).not.toHaveProperty("privacyButtonText");
    expect(DEFAULT_SETTINGS).not.toHaveProperty("privacyButtonText");
  });

  // seit rc3 (W13) heißt die Tabelle LOCKED_STANDARDS und enthält auch die
  // Begrüßung als Blase
  it("ein Weg für feste Werte: privacyNotice „link“ steht in LOCKED_STANDARDS", () => {
    expect(layout.LOCKED_STANDARDS).toEqual({
      disclaimer: "footer",
      disclaimerText: null,
      privacyNotice: "link",
      greetingStyle: "bubble",
    });
    for (const value of ["none", "bubble", "modal", undefined])
      expect(
        layout.applyFixedStandards({ privacyNotice: value }).privacyNotice,
      ).toBe("link");
  });

  it("data-privacy-button-text bleibt ohne Wirkung und ohne Warnung", async () => {
    const s = await loadEmbedSettings(
      { ...BASE, privacyButtonText: "Los" },
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    expect(s.privacyNotice).toBe("link");
    expect(
      console.warn.mock.calls.flat().join("\n").toLowerCase(),
    ).not.toContain("privacy-button-text");
    renderWindow(s);
    click(link());
    expect(dialog().textContent).not.toContain("Los");
    expect(closeButton().textContent).toBe("Schließen");
  });
});

// ---------------------------------------------------------------------------
describe("W10: leere Überschrift gilt wie der Standard", () => {
  const server = (config) =>
    vi.fn(async () => ({ ok: true, json: async () => config }));

  it.each(["", "   "])(
    "Server liefert privacyTitle %j: kein eigener Zustand, Standard der Sprache",
    async (value) => {
      const s = await loadEmbedSettings(BASE, server({ privacyTitle: value }));
      expect(s.privacyTitle).toBe(null);
      expect(layout.privacyDialogTitle(s)).toBe("Datenschutz");
      expect(layout.privacyDialogTitle({ ...s, language: "en" })).toBe(
        "Privacy",
      );
    },
  );

  it("Prüfregel verwirft leeren Text wie beim Datenschutz-Text", () => {
    expect(layout.layoutValidations.privacyTitle("")).toBe(undefined);
    expect(layout.layoutValidations.privacyTitle("   ")).toBe(undefined);
    expect(layout.layoutValidations.privacyText("   ")).toBe(undefined);
    expect(layout.layoutValidations.privacyTitle(" Hinweise ")).toBe(
      "Hinweise",
    );
  });

  it("ein Weg zur Überschrift: privacyDialogTitle, kein Sonderfall für leer", () => {
    expect(layout).not.toHaveProperty("privacyTitleText");
    expect(layout.privacyDialogTitle({ privacyTitle: "" })).toBe("Datenschutz");
    expect(layout.privacyDialogTitle({ privacyTitle: " Eigene " })).toBe(
      "Eigene",
    );
  });

  it("Fenster zeigt bei leerer Überschrift vom Server „Datenschutz“", async () => {
    const s = await loadEmbedSettings(BASE, server({ privacyTitle: "" }));
    renderWindow(s);
    click(link());
    expect(dialog().querySelector("h2").textContent).toBe("Datenschutz");
  });

  it("Untertitel bleibt: leer vom Server = bewusst keiner (R5 unverändert)", async () => {
    const s = await loadEmbedSettings(BASE, server({ assistantSubtitle: "" }));
    expect(s.assistantSubtitle).toBe("");
  });
});
