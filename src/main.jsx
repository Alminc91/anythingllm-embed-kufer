import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { parseStylesSrc } from "./utils/constants.js";
import { initI18n } from "./i18n.js";

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

const customCss = `
  /**
   * ==============================================
   * Dot Falling
   * ==============================================
   */
  .allm-dot-falling {
    position: relative;
    left: -9999px;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: #000000;
    color: #5fa4fa;
    box-shadow: 9999px 0 0 0 #000000;
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
    background-color: #000000;
    color: #000000;
    animation: dot-falling-before 1.5s infinite linear;
    animation-delay: 0s;
  }

  .allm-dot-falling::after {
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: #000000;
    color: #000000;
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
      box-shadow: 9999px 0 0 0 #000000;
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
      box-shadow: 9984px 0 0 0 #000000;
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
      box-shadow: 10014px 0 0 0 #000000;
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
`;

// Script-Settings vor Shadow DOM Erstellung lesen
const scriptSettings = Object.assign(
  {},
  document?.currentScript?.dataset || {},
);

const stylesSrc = parseStylesSrc(document?.currentScript?.src);

// Accent Color CSS generieren (für Links und Titel)
const getAccentColorCss = (accentColor) => {
  if (!accentColor) return '';
  return `
    /* Accent Color für Links und Titel */
    .allm-anything-llm-assistant-message a {
      color: ${accentColor} !important;
    }
    .allm-anything-llm-assistant-message a:hover {
      color: ${accentColor} !important;
      opacity: 0.8;
    }
    .allm-anything-llm-assistant-message strong,
    .allm-anything-llm-assistant-message b {
      color: ${accentColor};
    }
  `;
};

// Shadow DOM Host erstellen
const hostElement = document.createElement("div");
hostElement.id = "anythingllm-embed-widget";
document.body.appendChild(hostElement);

// Shadow DOM anhängen (closed = CSS komplett isoliert, nicht von außen zugreifbar)
const shadow = hostElement.attachShadow({ mode: "closed" });

// Inline Styles in Shadow DOM laden (inkl. Accent Color)
const accentColorCss = getAccentColorCss(scriptSettings?.accentColor);
const inlineStyles = document.createElement("style");
inlineStyles.textContent = hljsCss + customCss + accentColorCss;
shadow.appendChild(inlineStyles);

// External CSS (Tailwind) in Shadow DOM laden
const linkElement = document.createElement("link");
linkElement.rel = "stylesheet";
linkElement.href = stylesSrc;
shadow.appendChild(linkElement);

// React Container in Shadow DOM erstellen
const appElement = document.createElement("div");
appElement.id = "anythingllm-embed-root";
shadow.appendChild(appElement);

// Embedder Settings exportieren (für andere Komponenten)
export const embedderSettings = {
  settings: scriptSettings,
  stylesSrc: stylesSrc,
  shadowRoot: shadow, // Export Shadow Root for event listeners
  USER_STYLES: {
    msgBg: scriptSettings?.userBgColor ?? "#3DBEF5",
    base: `allm-text-white allm-rounded-t-[18px] allm-rounded-bl-[18px] allm-rounded-br-[4px] allm-mx-[20px]`,
  },
  ASSISTANT_STYLES: {
    msgBg: scriptSettings?.assistantBgColor ?? "#FFFFFF",
    base: `allm-text-[#222628] allm-rounded-t-[18px] allm-rounded-br-[18px] allm-rounded-bl-[4px] allm-mr-[37px] allm-ml-[9px]`,
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
