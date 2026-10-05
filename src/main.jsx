import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { parseStylesSrc } from "./utils/constants.js";
import { initI18n } from "./i18n.js";
import { THEME_STYLE_ID } from "./utils/theme.js";

// CSS Strings für Shadow DOM (von Head.jsx übernommen)
const hljsCss = `
pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}/*!
  Theme: GitHub Dark Dimmed
  Description: Dark dimmed theme as seen on github.com
  Author: github.com
  Maintainer: @Hirse
  Updated: 2021-05-15

  Colors taken from GitHub's CSS
*/.hljs{color:#adbac7;background:#22272e}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#f47067}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#dcbdfb}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#6cb6ff}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#96d0ff}.hljs-built_in,.hljs-symbol{color:#f69d50}.hljs-code,.hljs-comment,.hljs-formula{color:#768390}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#8ddb8c}.hljs-subst{color:#adbac7}.hljs-section{color:#316dca;font-weight:700}.hljs-bullet{color:#eac55f}.hljs-emphasis{color:#adbac7;font-style:italic}.hljs-strong{color:#adbac7;font-weight:700}.hljs-addition{color:#b4f1b4;background-color:#1b4721}.hljs-deletion{color:#ffd8d3;background-color:#78191b}
`;

// Kurskarten (.allm-course-card/-row): ganze Karte bzw. Kompaktzeile ist ein
// Link; Hover-Fläche --allm-hover-bg (Hintergrund steht inline ->
// !important), Tastatur-Fokus --allm-focus-ring, sonst 2px Akzent
// (!important gegen die allgemeine a:focus-visible-Regel mit ID-Selektor).
// Kommentare im CSS-String landen im Bundle, deshalb hier.
const customCss = `
  /**
   * ==============================================
   * Dot Falling
   * ==============================================
   */
  .allm-dot-falling {
    --allmi-dot: var(--allmi-text, #000000);
    position: relative;
    left: -9999px;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: var(--allmi-dot);
    color: #5fa4fa;
    box-shadow: 9999px 0 0 0 var(--allmi-dot);
    animation: dot-falling 1.5s infinite linear;
    animation-delay: 0.1s;
  }

  .allm-dot-falling::before,
  .allm-dot-falling::after {
    content: "";
    display: inline-block;
    position: absolute;
    top: 0;
  }

  .allm-dot-falling::before {
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: var(--allmi-dot);
    color: var(--allmi-dot);
    animation: dot-falling-before 1.5s infinite linear;
    animation-delay: 0s;
  }

  .allm-dot-falling::after {
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: var(--allmi-dot);
    color: var(--allmi-dot);
    animation: dot-falling-after 1.5s infinite linear;
    animation-delay: 0.2s;
  }

  @keyframes dot-falling {
    0% {
      box-shadow: 9999px -15px 0 0 rgba(152, 128, 255, 0);
    }
    25%,
    50%,
    75% {
      box-shadow: 9999px 0 0 0 var(--allmi-dot);
    }
    100% {
      box-shadow: 9999px 15px 0 0 rgba(152, 128, 255, 0);
    }
  }

  @keyframes dot-falling-before {
    0% {
      box-shadow: 9984px -15px 0 0 rgba(152, 128, 255, 0);
    }
    25%,
    50%,
    75% {
      box-shadow: 9984px 0 0 0 var(--allmi-dot);
    }
    100% {
      box-shadow: 9984px 15px 0 0 rgba(152, 128, 255, 0);
    }
  }

  @keyframes dot-falling-after {
    0% {
      box-shadow: 10014px -15px 0 0 rgba(152, 128, 255, 0);
    }
    25%,
    50%,
    75% {
      box-shadow: 10014px 0 0 0 var(--allmi-dot);
    }
    100% {
      box-shadow: 10014px 15px 0 0 rgba(152, 128, 255, 0);
    }
  }

  #chat-history::-webkit-scrollbar,
  #chat-container::-webkit-scrollbar,
  .allm-no-scroll::-webkit-scrollbar {
    display: none !important;
  }

  /* Hide scrollbar for IE, Edge and Firefox */
  #chat-history,
  #chat-container,
  .allm-no-scroll {
    -ms-overflow-style: none !important; /* IE and Edge */
    scrollbar-width: none !important; /* Firefox */
  }

  span.allm-whitespace-pre-line>p {
    margin: 0px;
  }

  /* Inline-Modus: Scroll-Verkettung verhindern — am Ende des Chat-Verlaufs darf
     das Scrollen nicht auf die Webseite durchschlagen. Nur Inline (Blase unverändert). */
  #anything-llm-embed-inline #chat-history,
  #anything-llm-embed-inline #chat-container,
  #anything-llm-embed-inline .allm-no-scroll {
    overscroll-behavior: contain;
  }

  /* Inline-Modus "Schrift der Webseite übernehmen": font-family vererbt sich in
     den Shadow DOM — dafür die widget-eigene Schrift (allm-font-sans) neutralisieren. */
  .allm-inherit-font,
  .allm-inherit-font .allm-font-sans {
    font-family: inherit !important;
  }

  /* Links in Assistenten-Antworten (historisch + Streaming): --allm-link
     (Standard = linkColor). Ersetzt die frühere Link-Farb-Injektion. */
  .allm-anything-llm-assistant-message a,
  .allm-reply a {
    color: var(--allmi-link, #01a5a9) !important;
  }
  .allm-anything-llm-assistant-message a:hover,
  .allm-reply a:hover {
    color: var(--allmi-link, #01a5a9) !important;
    opacity: 0.8;
  }

  /* Tastatur-Fokus: --allm-focus-ring (z. B. "2px solid #F3A04C"). Ohne Wert
     (helles Theme) gilt wie bisher der Browser-Standard (revert). */
  #anythingllm-embed-root button:focus-visible,
  #anythingllm-embed-root a:focus-visible {
    outline: var(--allmi-focus-ring, revert);
  }

  .allm-course-card:hover,.allm-course-row:hover{background-color:var(--allmi-hover-bg,#f3f4f6)!important}
  .allm-course-card:focus-visible,.allm-course-row:focus-visible{outline:var(--allmi-focus-ring,2px solid var(--allmi-accent,#01a5a9))!important;outline-offset:2px}

  /* Inline-Leiste als Eingabefeld (inlineInput): Fokusring um die ganze Pille
     (--allm-focus-ring, sonst 2px Akzent), Platzhalter in Leisten-Textfarbe,
     Hover von Knopf und Chips. Nur Variablen, keine festen Farben. */
  #anything-llm-inline-input {
    outline: none;
  }
  #anything-llm-inline-input::placeholder {
    color: currentColor;
    opacity: 0.7;
  }
  #anything-llm-inline-bar:has(#anything-llm-inline-input:focus-visible) {
    outline: var(--allmi-focus-ring, 2px solid var(--allmi-accent));
    outline-offset: 2px;
  }
  @supports not selector(:has(*)) {
    #anything-llm-inline-input:focus-visible {
      outline: var(--allmi-focus-ring, 2px solid var(--allmi-accent));
    }
  }
  #anything-llm-inline-send:hover {
    opacity: 0.9;
  }
  .allm-inline-chip {
    transition: border-color var(--allmi-transition, 200ms) var(--allmi-easing, ease);
  }
  .allm-inline-chip:hover {
    border-color: var(--allmi-accent);
  }

  /* Inline-Box: Aufklapp-Effekte (inlineEffect, utils/layout.js
     inlineEffectClass; nur bei ausdrücklich gewähltem Effekt bzw. overlay).
     Nur transform/opacity (float zusätzlich der Schatten), keine
     Layout-Eigenschaft: der Seiteninhalt springt sofort an seinen Platz (flow)
     bzw. bleibt stehen (overlay). Läuft nur beim Aufklappen durch den Nutzer
     (die Box war display:none). Dauer --allm-effect-duration, Kurve
     --allm-effect-easing, sonst die des Effekts. Reduzierte Bewegung: einzige
     Stelle ist die Media Query unten (animation: none, Endzustand sofort).
     Hier statt in index.css: steht ohne Tailwind-Ladezeit bereit. */
  .allm-effect {
    animation-duration: var(--allmi-effect-duration, 320ms);
    animation-timing-function: var(--allmi-effect-easing, var(--allmi-fx-ease));
    transform-origin: 50% 0;
  }
  .allm-effect-expand {
    --allmi-fx-ease: var(--allmi-easing, cubic-bezier(0.4, 0, 0.2, 1));
    animation-name: allm-fx-expand;
  }
  .allm-effect-grow {
    --allmi-fx-ease: var(--allmi-easing, cubic-bezier(0.4, 0, 0.2, 1));
    animation-name: allm-fx-grow;
  }
  .allm-effect-spring {
    --allmi-fx-ease: cubic-bezier(0.34, 1.56, 0.64, 1);
    animation-name: allm-fx-spring;
  }
  .allm-effect-float {
    --allmi-fx-ease: cubic-bezier(0.16, 1, 0.3, 1);
    animation-name: allm-fx-float;
  }
  @keyframes allm-fx-expand {
    from { transform: scaleY(0); }
  }
  @keyframes allm-fx-grow {
    from { transform: scale(0.96); opacity: 0; }
  }
  @keyframes allm-fx-spring {
    from { transform: scale(0.9); opacity: 0; }
  }
  @keyframes allm-fx-float {
    from { transform: translateY(8px); opacity: 0; box-shadow: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .allm-effect { animation: none; }
  }

  /* Effekt "morph" (InlineChat runMorph): keine Keyframes, sondern
     Transitionen von width/height/transform/border-radius/box-shadow des
     Chat-Fensters zwischen Leistenform (allm-morph-from, Maße als --allmi-m*)
     und Panel. Inhalt in fester Panelgröße (kein Umbruch, keine Skalierung),
     blendet nach 35 % der Dauer ein (Zuklappen: zuerst aus). Seitenfluss:
     die äußere Box wächst in der Höhe mit (allm-morph-flow). Dauer
     --allmi-effect-duration (utils/theme.js; ohne Seiten-CSS ungültig ->
     Standard 460ms). */
  .allm-morph,.allm-morph-flow{--allmi-fx-d:var(--allmi-effect-duration,460ms);--allmi-fx-e:var(--allmi-effect-easing,cubic-bezier(.16,1,.3,1))}
  .allm-morph{transition:width var(--allmi-fx-d) var(--allmi-fx-e),height var(--allmi-fx-d) var(--allmi-fx-e),transform var(--allmi-fx-d) var(--allmi-fx-e),border-radius var(--allmi-fx-d) var(--allmi-fx-e),box-shadow var(--allmi-fx-d) var(--allmi-fx-e)}
  .allm-morph-from{width:var(--allmi-mw)!important;height:var(--allmi-mh)!important;transform:var(--allmi-mt);border-radius:var(--allmi-mr)!important;box-shadow:var(--allmi-bar-shadow,none)!important}
  .allm-morph>*,.allm-morph-from>*{width:var(--allmi-cw)!important;height:var(--allmi-ch)!important;flex:none;transition:opacity calc(var(--allmi-fx-d)*.65) var(--allmi-fx-e) calc(var(--allmi-fx-d)*.35)}
  .allm-morph-from>*{opacity:0}
  .allm-morph-close>*{transition-duration:calc(var(--allmi-fx-d)*.35);transition-delay:0s}
  .allm-morph-flow{transition:height var(--allmi-fx-d) var(--allmi-fx-e)}
  .allm-morph-flow-from{height:var(--allmi-bh)!important}
  @media (prefers-reduced-motion: reduce) {
    .allm-morph,.allm-morph-flow,.allm-morph>*{transition:none!important}
  }
`;

// Script-Settings vor Shadow DOM Erstellung lesen
const scriptSettings = Object.assign(
  {},
  document?.currentScript?.dataset || {},
);

const stylesSrc = parseStylesSrc(document?.currentScript?.src);

// Shadow DOM Host erstellen. Zunächst immer an <body> (Chat-Blase). Im
// Inline-Modus hängt App.jsx den Host nach dem Config-Load in den Platzhalter
// (<div id="kufer-assistent">) um — ein Shadow-Host lässt sich per appendChild
// verschieben, React-State und Shadow-Inhalt bleiben dabei erhalten.
const hostElement = document.createElement("div");
hostElement.id = "anythingllm-embed-widget";
document.body.appendChild(hostElement);

// Shadow DOM anhängen (closed = CSS komplett isoliert, nicht von außen zugreifbar)
const shadow = hostElement.attachShadow({ mode: "closed" });

// Inline Styles in Shadow DOM laden
const inlineStyles = document.createElement("style");
inlineStyles.textContent = hljsCss + customCss;
shadow.appendChild(inlineStyles);

// CSS-Variablen/Theme (utils/theme.js): ":host { --allmi-…: var(--allm-…, …) }".
// Wird nach dem Config-Load von useScriptAttributes synchron vor dem ersten
// Render gefüllt; "auto" aktualisiert es bei prefers-color-scheme-Wechsel.
const themeStyle = document.createElement("style");
themeStyle.id = THEME_STYLE_ID;
shadow.appendChild(themeStyle);

// External CSS (Tailwind) in Shadow DOM laden
const linkElement = document.createElement("link");
linkElement.rel = "stylesheet";
linkElement.href = stylesSrc;
shadow.appendChild(linkElement);

// Inline-Modus: Tailwind-CSS einmal als Text laden und das <link> durch ein
// <style> gleichen Inhalts an derselben Stelle ersetzen (Kaskaden-Reihenfolge
// bleibt). Grund: beim Umhängen des Hosts (Platzhalter <-> body) wird ein <link>
// neu verbunden -> Stylesheet ist kurz weg und wird (max-age=0) neu angefragt ->
// ungestylter Frame. Ein <style> wird beim Einhängen synchron geparst.
// Blase: nie aufgerufen, <link> bleibt wie bisher. Fehler/Timeout -> <link> bleibt.
let tailwindInlined = null;
export function inlineTailwindStyles(timeoutMs = 4000) {
  if (tailwindInlined) return tailwindInlined;
  tailwindInlined = (async () => {
    if (!stylesSrc || typeof fetch !== "function") return false;
    const ctrl =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
    try {
      const res = await fetch(stylesSrc, {
        credentials: "omit",
        signal: ctrl?.signal,
      });
      if (!res.ok) return false;
      const css = await res.text();
      if (!css || !linkElement.isConnected) return false;
      const styleEl = document.createElement("style");
      styleEl.textContent = css;
      linkElement.replaceWith(styleEl);
      return true;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();
  return tailwindInlined;
}

// React Container in Shadow DOM erstellen
const appElement = document.createElement("div");
appElement.id = "anythingllm-embed-root";
shadow.appendChild(appElement);

// Embedder Settings exportieren (für andere Komponenten)
export const embedderSettings = {
  settings: scriptSettings,
  stylesSrc: stylesSrc,
  shadowRoot: shadow, // Export Shadow Root for event listeners
  hostElement, // Shadow-Host (Inline-Modus: wird in den Platzhalter umgehängt)
  themeStyle, // <style> mit den CSS-Variablen (utils/theme.js)
  USER_STYLES: {
    msgBg: scriptSettings?.userBgColor ?? "#3DBEF5",
    msgText: scriptSettings?.userTextColor ?? "#FFFFFF",
    // Rundung/Textfarbe kommen aus den CSS-Variablen (bubbleRadius in utils/theme.js)
    base: `allm-mx-[20px]`,
  },
  ASSISTANT_STYLES: {
    msgBg: scriptSettings?.assistantBgColor ?? "#FFFFFF",
    base: `allm-mr-[37px] allm-ml-[9px]`,
  },
};

// Initialize i18n after settings are available
initI18n(scriptSettings);

// React App in Shadow DOM rendern
const root = ReactDOM.createRoot(appElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
