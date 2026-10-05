# AnythingLLM Embedded Chat Widget

**This is a submodule of [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) - the all-in-one AI Application**

**Please report any issues or feature requests to the [main repo](https://github.com/Mintplex-Labs/anything-llm)**

> [!WARNING]
> The core AnythingLLM team publishes a pre-built version of the script that is bundled
> with the main application. You can find [it in the main repo here.](https://github.com/Mintplex-Labs/anything-llm/tree/master/frontend/public/embed)
> You should only be working in this repo if you are wanting to build your own custom embed widget for AnythingLLM

This folder of AnythingLLM contains the source code for how the embedded version of AnythingLLM works to provide a public facing interface of your workspace.

The AnythingLLM Embedded chat widget allows you to expose a workspace and its embedded knowledge base as a chat bubble via a `<script>` or `<iframe>` element that you can embed in a website or HTML.

### Security

- Users will _not_ be able to view or read context snippets like they can in the core AnythingLLM application
- Users are assigned a random session ID that they use to persist a chat session.
- **Recommended** You can limit both the number of chats an embedding can process **and** per-session.

_by using the AnythingLLM embedded chat widget you are responsible for securing and configuration of the embed as to not allow excessive chat model abuse of your instance_

### Developer Setup

- `cd embed` from the root of the repo
- `yarn` to install all dev and script dependencies
- `yarn dev` to boot up an example HTML page to use the chat embed widget.

While in development mode (`yarn dev`) the script will rebuild on any changes to files in the `src` directory. Ensure that the required keys for the development embed are accurate and set.

`yarn build` will compile and minify your build of the script. You can then host and link your built script wherever you like.

### Visuelle Tests ausführen

Die Theme-/CSS-Variablen-Tests (`tests/visual/theme_visual.py`) laden den gebauten Widget-Build in Chromium (Playwright), vergleichen Screenshots mit `tests/visual/baseline/` und prüfen berechnete Styles. Einmalig einrichten und dann ausführen:

```bash
pip install -r tests/visual/requirements.txt   # numpy, Pillow, playwright
playwright install chromium
npm run build                                  # Tests prüfen dist/
python3 tests/visual/theme_visual.py           # bzw. npm run test:visual
```

Ergebnisse (Screenshots, Diff-Bilder, `summary.json`) landen in `tests/visual/results/`. Die Unit-Tests laufen mit `npm test` (Vitest).

Leiste als Eingabefeld (`data-inline-input`): `python3 tests/visual/inline_input.py` (Pixel-Vergleich Bestand/neue Zustände, Enter/Knopf/Chips mit gezählten `stream-chat`-Anfragen, Tastatur, Mobil-Vollbild; alle Aufrufe gemockt). Ergebnisse: `tests/visual/results/inline-input-*.png`, `summary-inline-input.json`.

Kurskarten (`data-course-cards`): `python3 tests/visual/course_cards.py` (gemockter Stream mit `courseSources` im Abschluss-Chunk; Pixel-Vergleich ohne Option gegen den Bestand, Karten hell/dunkel/mobil/Kompaktliste/Rückfrage, Stream ohne Flackern, Theme-Variablen + Kontrast, 360 px, keine zusätzlichen Server-Aufrufe). Ergebnisse: `tests/visual/results/course-cards-*.png`, `summary-course-cards.json`. Reale Trefferquote (AK-11, Reviewer, erst mit Fork-Image ≥ 7.9 und `visual_config.courseCards = "auto"` sinnvoll): `EMBED_LIVE_TESTS=1 python3 tests/visual/course_cards_ak11.py --base-api … --embed-id …` stellt 20 Kursfragen (Zeit/Thema, HybridSearch v2) als **echte Chats** und schreibt Protokoll + Screenshots nach `tests/visual/results/ak11/`.

Live-Prüfung (optional): `EMBED_LIVE_TESTS=1 python3 tests/visual/inline_input.py --live-demo` stellt zusätzlich **eine echte Frage** auf demo.ki.kufer.de und gleicht den serverseitigen Verlauf ab. Dabei entsteht ein echter Chat auf dem Demo-Container (Kontingent, Verlauf) — deshalb bricht `--live-demo` ohne `EMBED_LIVE_TESTS=1` mit einem Hinweis ab. Nur gezielt und sparsam einsetzen.

## Integrations & Embed Types

### `<script>` tag HTML embed

The primary way of embedding a workspace as a chat widget is via a simple `<script>`

```html
<!--
An example of a script tag embed
REQUIRED data attributes:
  data-embed-id // The unique id of your embed with its default settings
  data-base-api-url // The URL of your anythingLLM instance backend
-->
<script
  data-embed-id="5fc05aaf-2f2c-4c84-87a3-367a4692c1ee"
  data-base-api-url="http://localhost:3001/api/embed"
  src="http://localhost:3000/embed/anythingllm-chat-widget.min.js"
></script>
```

## `<script>` Customization Options

**LLM Overrides**

- `data-prompt` — Override the chat window with a custom system prompt. This is not visible to the user. If undefined it will use the embeds attached workspace system prompt.

- `data-model` — Override the chat model used for responses. This must be a valid model string for your AnythingLLM LLM provider. If unset it will use the embeds attached workspace model selection or the system setting.

- `data-temperature` — Override the chat model temperature. This must be a valid value for your AnythingLLM LLM provider. If unset it will use the embeds attached workspace model temperature or the system setting.

**Language & Localization**

- `data-language` — Set the language for the chat interface. If not specified, it will default to English (en). [Currently supported languages are available here](https://github.com/Mintplex-Labs/anythingllm-embed/main/src/locales/resources.js). (PR's welcome)

**Style Overrides**

- `data-chat-icon` — The chat bubble icon show when chat is closed. Options are `plus`, `chatBubble`, `support`, `search2`, `search`, `magic`.

- `data-button-color` — The chat bubble background color shown when chat is closed. Value must be hex color code.

- `data-user-bg-color` — The background color of the user chat bubbles when chatting. Value must be hex color code.

- `data-assistant-bg-color` — The background color of the assistant response chat bubbles when chatting. Value must be hex color code.

- `data-brand-image-url` — URL to image that will be show at the top of the chat when chat is open.

- `data-greeting` — Default text message to be shown when chat is opened and no previous message history is found.

- `data-no-sponsor` — Setting this attribute to anything will hide the custom or default sponsor at the bottom of an open chat window.

- `data-no-header` — Setting this attribute hides the header above the chat window.

- `data-sponsor-link` — A clickable link in the sponsor section in the footer of an open chat window.

- `data-sponsor-text` — The text displays in sponsor text in the footer of an open chat window.

- `data-position` - Adjust the positioning of the embed chat widget and open chat button. Default `bottom-right`. Options are `bottom-right`, `bottom-left`, `top-right`, `top-left`.

- `data-assistant-name` - Set the chat assistant name that appears above each chat message. Default `AnythingLLM Chat Assistant`

- `data-assistant-icon` - Set the icon of the chat assistant.

- `data-window-height` / `data-window-width` - **Ohne Wirkung** (werden ignoriert, auch wenn sie in bestehenden Snippets stehen). Die Fenstergröße der Blase (nur Tablet/Desktop ≥768px; mobil bleibt Vollbild) wird ausschließlich im Design Center eingestellt (Erscheinungsbild → Aussehen). Ohne Einstellung: bisherige Standardgröße (40 % bzw. 25 % ab 1280px Breite, 77 % Höhe).

- `data-offset-x` / `data-offset-y` - Randabstand von Button und Fenster in px (Ganzzahl 0–200, optional mit `px`). Ohne Angabe: 16px.

- `data-display-mode` - `bubble` (Standard) oder `inline`. Inline zeigt den Chat mitten in der Seite im Platzhalter `<div id="kufer-assistent"></div>` als breite Leiste; ab 768px klappt sie an Ort und Stelle zur Chat-Box auf, mobil (<768px) öffnet Tippen immer direkt den Vollbild-Chat. Fehlt der Platzhalter (oder ist er ungeeignet), erscheint weiterhin die Chat-Blase. Eine Einstellung im Design Center hat Vorrang (auch „Chat-Blase“).

- `data-mount` - CSS-Selektor des Platzhalters für den Inline-Modus. Standard `#kufer-assistent`. Ungültige Selektoren oder ungeeignete Elemente (z. B. `input`, `img`, `button`, `iframe`, `svg`, `body`) werden ignoriert (Fallback Blase); bei mehreren Treffern gilt der erste.

- `data-inline-collapsed-text` - Text der eingeklappten Leiste (max. 120 Zeichen, reiner Text). Standard „Jetzt mit unserem KI-Assistenten schreiben“.

- `data-inline-height` - Höhe der aufgeklappten Inline-Box ab 768px (`px` oder `vh`, geklemmt 400–1200px). Standard `600px`.

- `data-inline-max-width` - Maximalbreite der Inline-Darstellung in px (zentriert). Standard: volle Container-Breite.

- `data-inline-start-state` - `collapsed` (Standard) oder `expanded` (nur ab 768px; mobil wird immer die Leiste gezeigt).

- `data-inline-input` - `true`: die eingeklappte Inline-Leiste wird zum **Eingabefeld mit Absende-Knopf** (Standard `false` = Klickfläche wie bisher). Enter oder Klick auf den Knopf klappt auf **und** sendet die Frage sofort (gleicher Weg wie aus dem Chatfenster: Kontingent, Verlauf, Konversation); mobil (<768px) öffnet sich dabei wie gewohnt der Vollbild-Chat mit der bereits gesendeten Frage. Leeres Feld → nur aufklappen, Fokus im Chat-Eingabefeld. Klick in die Leiste neben das Feld → aufklappen, der getippte Text steht unversendet im Chat-Eingabefeld (an dort schon Getipptes mit Leerzeichen angehängt, nichts wird überschrieben). Wird der Chat zugeklappt, bevor die abgeschickte Frage gesendet werden konnte (Verlauf lädt noch bzw. eine vorherige Antwort läuft), wird sie verworfen und steht wieder im Leisten-Feld; ein erneutes Absenden ersetzt eine noch wartende Frage. Auf Touch-Geräten öffnet das Absenden aus der Leiste keine Bildschirmtastatur über der laufenden Antwort. Unter der Leiste erscheinen die `data-default-messages` als Chips (höchstens 6, umbrechen bei schmaler Breite); ein Klick sendet die Frage wie Enter — steht schon Text im Feld, wird der Chip-Text stattdessen angehängt (nicht gesendet). Im aufgeklappten Chat stehen die Vorschläge wie bisher (die Chips sind dann ausgeblendet). Auch im Design Center (`visual_config.inlineInput`, Boolean; Vorrang wie üblich). Nur im Inline-Modus: in der Chat-Blase wird das Attribut ignoriert (eine `console.warn`-Zeile). Farben/Rundung über die Leisten-Variablen (`--allm-bar-*`, `--allm-accent`, `--allm-radius`/`--allm-bar-radius`, Fokusring `--allm-focus-ring`), siehe [Styling per CSS-Variablen](#styling-per-css-variablen).

- `data-inline-input-placeholder` - Platzhalter des Eingabefelds bei `data-inline-input` (max. 120 Zeichen, reiner Text). Standard „Stellen Sie hier Ihre Frage …“. Design Center: `visual_config.inlineInputPlaceholder`.

- `data-inline-send-text` - Text des Absende-Knopfs bei `data-inline-input` (max. 40 Zeichen, reiner Text). Standard „Chatten“. Design Center: `visual_config.inlineSendText`.

  ```html
  <div id="kufer-assistent"></div>
  <script
    data-embed-id="…"
    data-base-api-url="https://<kunde>.ki.kufer.de/api/embed"
    data-display-mode="inline"
    data-inline-input="true"
    data-inline-input-placeholder="Stellen Sie hier Ihre Frage …"
    data-inline-send-text="Chatten"
    data-default-messages="Spanisch A1,Yoga,KI-Basics,Töpfern"
    src="https://<kunde>.ki.kufer.de/embed/anythingllm-chat-widget.min.js"
  ></script>
  ```

- `data-inline-theme` - Stil der eingeklappten Leiste: `light` oder `dark`. Ohne Angabe folgt die Leiste dem Theme (`data-theme`, Standard hell); ein explizit gesetzter Wert gewinnt.

- `data-inherit-font` - `true`: im Inline-Modus die Schrift der Webseite übernehmen.

- `data-theme` - `light` (Standard), `dark` oder `auto` (folgt der Hell/Dunkel-Einstellung des Systems): Theme des ganzen Chatfensters. Details und alle Farb-/Form-Variablen: [Styling per CSS-Variablen](#styling-per-css-variablen).

- `data-course-cards` - `auto`: unter einer Antwort, die Kurse nennt, erscheinen die genannten Kurse als **Kurskarten** (Wochentag + Uhrzeit, Titel als Link zur Kursseite, Beginn, Ort bzw. „online“/„vor Ort“, Preis, Status „buchbar“/„nicht buchbar“). Standard `off` = keine Karten, Aussehen unverändert. Auch im Design Center (`visual_config.courseCards`, `"off"` | `"auto"`; Vorrang wie üblich). **Server-Teil ab Image ≥ 7.9:** Der Server liefert die Kurs-Metadaten (`courseSources`, nur Metadaten, nie Kontexttext) nur bei `visual_config.courseCards = "auto"` und erst ab Image 7.9 — mit älteren Images oder ohne die Server-Einstellung bleibt das Attribut ohne Wirkung. Verhalten:
  - Die Antwort bestimmt die Auswahl: Karten nur für Kurse, deren Kursseite in der Antwort verlinkt ist oder deren Titel genannt wird (normalisiert, ≥ 90 % ähnlich; nur eindeutige Titel mit mindestens zwei Wörtern — gleichnamige Termine ohne Link bekommen keine Karte). Der Antworttext bleibt unverändert.
  - Jeder Kurs höchstens einmal (gleiche Kurs-URL), sortiert nach Beginn. Höchstens 5 Karten; ab 6 genannten Kursen eine **Kompaktliste** (eine Zeile je Kurs: Wochentag/Uhrzeit · Titel · Ort, höchstens 10 Zeilen, danach „weitere Kurse im Programm“).
  - Enthält die Antwort einen Link auf eine Programm-/Kategorieseite derselben Domain (keine Kursseite), steht er als Abschlusslink unter den Karten (Linktext aus der Antwort + „→“).
  - Rückfragen, Antworten ohne Kurse und reine Info-Seiten (Anmeldung, Kontakt) bleiben reiner Text, ohne leere Kartenfläche. Fehlende Angaben (z. B. Preis, Ort) entfallen; Preis 0 wird nicht angezeigt; Terminanzahl und freie Plätze gibt es nicht (nicht im Feed).
  - Kurse auf fremden Domains (nicht die Domain der Webseite und nicht die der meisten Kurse) werden weggelassen.
  - Bei einer laufenden Antwort erscheinen die Karten einmal nach dem letzten Wort (Abschluss-Chunk), auch im gespeicherten Verlauf.
  - Optik über `--allm-surface`, `--allm-text`, `--allm-text-muted`, `--allm-border`, `--allm-accent` (Rand links, Unterstreichung), `--allm-radius`; erbt hell/dunkel. Schmale Breite (z. B. 360 px): einspaltig, Titel bricht um.

- `data-text-size` - Set the text size of the chats in pixels.

- `data-username` - A specific readable name or identifier for the client for your reference. Will be shown in AnythingLLM chat logs. If empty it will not be reported.

- `data-default-messages` - A string of comma-separated messages you want to display to the user when the chat widget has no history. Example: `"How are you?, What is so interesting about this project?, Tell me a joke."`

- `data-send-message-text` — Override the placeholder text in the message input field.

- `data-reset-chat-text` — Override the text shown on the reset chat button.

**Behavior Overrides**

- `data-open-on-load` — Once loaded, open the chat as default. It can still be closed by the user. To enable set this attribute to `on`. All other values will be ignored.

- `data-show-thoughts` — Allow users to see the AI's thought process, if applicable, in responses. If set to "false", users will only see a static "Thinking" indication without the explict thought content. If "true" the user will see the full thought content as well as the real response. Defaults to "false".

- `data-support-email` — Shows a support email that the user can used to draft an email via the "three dot" menu in the top right. Option will not appear if it is not set.

## Styling per CSS-Variablen

Das Widget rendert in einem **geschlossenen Shadow DOM**: Seiten-CSS erreicht keine Klasse und kein Element im Widget (`#anythingllm-embed-widget * { … }` oder fremde Stylesheets wirken nicht). Anpassbar ist es ausschließlich über die unten aufgeführten **CSS-Variablen `--allm-*`** — es gibt kein `data-custom-css`.

**Wo setzen?** Nur auf dem Host-Element `#anythingllm-embed-widget` **oder einem Vorfahren** (`body`, `:root`, im Inline-Modus auch der Platzhalter `#kufer-assistent`) wirksam. Auf einem Geschwister- oder sonstigen fremden Element gesetzt, hat eine Variable keine Wirkung (und verursacht keinen Fehler). Empfehlung: `#anythingllm-embed-widget` — im Inline-Modus hängt das Widget mobil (<768px) für das Vollbild direkt an `<body>`; nur am Platzhalter gesetzte Variablen gelten dort dann nicht.

```css
#anythingllm-embed-widget {
  --allm-accent: #b45309;
  --allm-radius: 12px;
}
```

### Vorrangregel

```
Standard  <  Script-Attribut (data-*)  <  Design Center (visual_config)  <  Seiten-CSS (--allm-*)
```

Die bisherigen Einstellungen (`buttonColor`, `userBgColor`, `userTextColor`, `assistantBgColor`, `linkColor`, `headerBgColor`, `headerTextColor`, `inlineTheme`, `inheritFont`, `textSize`) bleiben gültig und liefern die Standardwerte der Variablen. Eine per Seiten-CSS gesetzte Variable gewinnt **immer** — auch gegen das Design Center und gegen das dunkle Theme.

Technisch setzt das Widget die Standardwerte nicht unter dem öffentlichen Namen, sondern als interne Variable auf `:host` (`--allmi-accent: var(--allm-accent, <Standard>)`). Deshalb wird eine öffentliche Variable von Vorfahren normal vererbt bzw. gilt direkt auf dem Host und schlägt den Standard. Die `--allmi-*`-Namen sind **keine** Schnittstelle.

### Theme: hell, dunkel, automatisch

- Script-Attribut `data-theme="light" | "dark" | "auto"` oder im Design Center `visual_config.theme` (gleiche Werte, Vorrang wie oben). Standard `light`.
- **Hinweis Server:** `visual_config.theme` wirkt erst mit der AnythingLLM-Fork-Version, deren Endpunkt `/embed/:embedId/config` diesen Schlüssel ausliefert (Image ≥ 7.9). Bis dahin lässt sich das Theme nur per Script-Attribut `data-theme` bzw. über Seiten-CSS (`--allm-*`) setzen; ein auf älteren Servern gespeichertes `theme` wird ignoriert (kein Fehler, das Script-Attribut gilt).
- `dark` schaltet den vollständigen dunklen Satz für das **ganze** Chatfenster (Fenster, Header, Verlauf, Eingabefeld, Menü, „Frühere Chats“, Willkommensblasen) und die Inline-Leiste. Kontrast geprüft (WCAG AA): Text ≥ 4,5:1, Rahmen ≥ 3:1.
- `auto` folgt `prefers-color-scheme` des Systems und wechselt **ohne Neuladen**.
- Ungültige Werte (z. B. `data-theme="blau"`) → eine `console.warn`-Zeile, es gilt `light`.
- `data-inline-theme="dark"` (Bestand) färbt weiterhin nur die eingeklappte Leiste; das geöffnete Fenster bleibt hell. Ohne `inlineTheme` folgt die Leiste dem Theme (bei `theme: dark` also dunkel); ein explizites `inlineTheme` (`light` oder `dark`) gewinnt auch im dunklen Theme.
- Marken-Header im dunklen Theme: `headerBgColor` ohne `headerTextColor` → Name im Header in `#F4F2EF` (im hellen Theme wie bisher `#1f2937`), Icons weiß.
- Brand-Farben (`buttonColor`, `userBgColor`, `userTextColor`, `headerBgColor`/`headerTextColor`) gelten auch im dunklen Theme; `assistantBgColor` und `linkColor` sind auf eine weiße Antwortblase abgestimmt und werden im dunklen Theme durch den dunklen Satz ersetzt (per Seiten-CSS weiterhin überschreibbar).
- `prefers-reduced-motion: reduce` setzt `--allm-transition` wirksam auf `0ms` (auch wenn das Seiten-CSS eine Dauer setzt).

### Variablenliste

„—“ = im hellen Theme **kein** einheitlicher Standard: jedes Element behält seinen bisherigen Wert (in Klammern), bis die Seite die Variable setzt. So bleibt das Aussehen für Bestandskunden pixelgleich. „folgt X“ = ohne eigenen Wert übernimmt die Variable den Wert von X (sofern X gesetzt ist). Mit * markiert: Ergänzungen über die ursprüngliche Liste hinaus.

| Variable | Wirkt auf | Standard hell | Standard dunkel |
|---|---|---|---|
| `--allm-bg` | Grundfläche hinter Listen: „Frühere Chats“, Ladeanzeige | — (`#f9fafb` Liste, `#f3f4f6` Laden) | `#131316` |
| `--allm-surface` | Fensterfläche (Blase, Inline-Box, Vollbild), Eingabezeile, Menü, Karten, Willkommensblasen | `#FFFFFF` | `#1D1D21` |
| `--allm-text` | Grundtext (Fenster, Listentitel, Willkommensblasen) | — (`#222628` Inline, `#1f2937` Titel, `#2d3748` Willkommensblasen; Blase erbt die Seitenfarbe) | `#F4F2EF` |
| `--allm-text-muted` | gedämpfter Text/Icons: Begrüßung, Name, Zeitstempel, Menüeinträge, Platzhalter, Senden-Icon, Bewertung | — (`#94a3b8`, `#9ca3af`, `#7A7D7E`, `#1e293b99`, `#22262899` …) | `#A6A8AD` |
| `--allm-border` | Header-Linie (entfällt, sobald eine Header-Farbe wirkt: `headerBgColor` oder `--allm-header-bg`), Rahmen der Inline-Box, Karten in „Frühere Chats“ | — (`#E9E9E9` Header, `#d1d5db` Box, `#e5e7eb` Karten) | `#787B82` |
| `--allm-accent` | Chat-Button, Icon der Leiste, Absende-Knopf und Fokusring (Standard) der Eingabe-Leiste, Akzente („Frühere Chats“, Senden im Feedback) | `buttonColor` (`#01a5a9`) | `buttonColor` |
| `--allm-user-bg` | Nutzer-Blase, Vorschlags-Buttons | `userBgColor` (`#01a5a9`) | `userBgColor` |
| `--allm-user-text` | Text der Nutzer-Blase/Vorschläge | `userTextColor` (`#FFFFFF`) | `userTextColor` |
| `--allm-assistant-bg` | Antwortblase | `assistantBgColor` (`#FFFFFF`) | `#2A2A2F` |
| `--allm-assistant-text` | Text der Antwortblase, folgt `--allm-text` | `#222628` | `#F4F2EF` |
| `--allm-link` | Links in Antworten | `linkColor` (`#01a5a9`) | `#5CC8CB` |
| `--allm-header-bg` | Header (Chat + „Frühere Chats“) | `headerBgColor`, sonst `transparent` | `headerBgColor`, sonst `#18181B` |
| `--allm-header-text` | Name im Header, folgt `--allm-text` | `headerTextColor`, sonst `#1f2937` | `headerTextColor`, sonst `#F4F2EF` (auch mit `headerBgColor`) |
| `--allm-header-icon` * | Menü-/Schließen-/Zurück-Icons im Header (Chat + „Frühere Chats“), folgt `--allm-text-muted` | `headerTextColor`; mit `headerBgColor` `#FFFFFF`; sonst — (`#1e293b99`) | wie hell, sonst `#A6A8AD` |
| `--allm-input-bg` | Eingabefeld | `transparent` | `#26262B` |
| `--allm-input-border` | Rahmen des Eingabefelds (1,5px), folgt `--allm-border` | `#22262833` | `#787B82` |
| `--allm-input-text` | Eingabetext, Mikrofon/Senden-Spinner, Mikrofon/Senden-Icon beim Hover; folgt `--allm-text` | `#000000` (Hover-Icon `#222628e6`) | `#F4F2EF` |
| `--allm-radius` | Fenster (ab 768px), Inline-Box, Header oben, Eingabefeld, „Frühere Chats“ | `16px` | `16px` |
| `--allm-radius-bubble` | Sprechblasen (drei Ecken; Zipfel-Ecke `min(4px, Wert/4,5)`) | `--allm-radius` × 1,125 = `18px` | wie hell |
| `--allm-shadow` | Schatten von Fenster/Inline-Box | — (Blase `0 4px 14px rgba(0,0,0,.25)`, Inline-Box `…0.12`) | `0 4px 14px rgba(0,0,0,.5)` |
| `--allm-bubble-shadow` * | Schatten der Sprechblasen | `0 4px 14px rgba(0,0,0,.25)` | `0 4px 14px rgba(0,0,0,.35)` |
| `--allm-font` | Schrift (alle Widget-Texte) | Widget-Schrift (`plus-jakarta-sans, ui-sans-serif, system-ui, …`); mit `inheritFont` die Seitenschrift | wie hell |
| `--allm-font-size` | Text der Nachrichten (laufende Antwort, Verlauf und Vorschläge gleich) | `textSize` (`14px`; wie bisher nur 10–14 und 16 wirksam, sonst erbt die Schrift) | wie hell |
| `--allm-transition` | Dauer der Übergänge (Button, Leiste, Header, Willkommensblasen ×1,5/×2) | `200ms` (`0ms` bei reduzierter Bewegung) | `200ms` |
| `--allm-easing` * | Zeitfunktion der Übergänge | `cubic-bezier(0.4, 0, 0.2, 1)` | wie hell |
| `--allm-hover-bg` | Hover-Fläche (Menü, Header-Buttons, ×-Button) | — (`#f3f4f6`) | `rgba(255,255,255,.08)` |
| `--allm-focus-ring` | Tastatur-Fokus von Buttons/Links und der Eingabe-Leiste (`outline`-Kurzform, z. B. `2px solid #F3A04C`; ohne Wert: Leisten-Feld 2px Akzent) | — (Browser-Standard) | `2px solid` + Akzent |
| `--allm-bar-bg` | eingeklappte Inline-Leiste, Chips (`data-inline-input`) | `#FFFFFF` (`inlineTheme: dark`: `rgba(17,24,39,.78)` + Weichzeichner) | `rgba(17,24,39,.78)` (`inlineTheme: light`: `#FFFFFF`) |
| `--allm-bar-text` | Text der Leiste und der Chips, Platzhalter (70 %) | `#1f2937` (dark: `#FFFFFF`) | `#FFFFFF` |
| `--allm-bar-border` | Rahmen der Leiste und der Chips (1px; Chips beim Hover `--allm-accent`) | `#d1d5db` (dark: `rgba(255,255,255,.16)`) | `rgba(255,255,255,.16)` |
| `--allm-bar-shadow` * | Schatten der Leiste | `0 1px 3px rgba(0,0,0,.06)` (dark: `0 4px 16px rgba(0,0,0,.18)`) | `0 4px 16px rgba(0,0,0,.18)` |
| `--allm-bar-radius` * | Rundung der Leiste und der Chips, Absende-Knopf 6px kleiner; folgt `--allm-radius` | `16px` | `16px` |

Nicht über Variablen gesteuert (bewusst): Fehler-/Hinweisboxen (rot/amber), das Feedback-Kommentarfeld, Code-Blöcke (eigenes dunkles Schema), die Icon-Kachel im Marken-Header (`iconStyle`). Die Tönung der Icons in „Frühere Chats“ folgt `--allm-accent` (10 %, per `color-mix()`; ältere Browser ohne `color-mix()`: wie bisher aus `buttonColor`).

### Beispiel hell/dunkel (Mockup „vhs Rhein Suchfeld“)

Zuordnung der Mockup-Tokens (`THEMES.light` / `THEMES.dark`) zu den Variablen:

| Mockup | Variable |
|---|---|
| `panel` | `--allm-surface` |
| `base` | `--allm-bg` |
| `ink` | `--allm-text` |
| `muted` / `muted2` | `--allm-text-muted` |
| `line` | `--allm-border` |
| `bubble` | `--allm-assistant-bg` |
| `inputSoft` | `--allm-input-bg` |
| `accentInk` | `--allm-accent` |
| `shadowOpen` | `--allm-shadow` |
| `header` | `--allm-header-bg` |
| `shadowClosed` | `--allm-bar-shadow` |
| `pill` / `line2` | `--allm-bar-bg` / `--allm-bar-border` |
| `accentInk` (Links) | `--allm-link` |
| Pille 999px / Panel 12px | `--allm-bar-radius` / `--allm-radius` |
| Übergang 260 ms, `cubic-bezier(.16,1,.3,1)` | `--allm-transition` / `--allm-easing` |
| Archivo | `--allm-font` (Schrift stellt die Seite bereit) |

```css
/* hell */
#anythingllm-embed-widget {
  --allm-bg: #F7F5F2;
  --allm-surface: #FFFFFF;
  --allm-header-bg: #FFFFFF;
  --allm-text: #17181B;
  --allm-text-muted: #5E6167;
  --allm-border: rgba(23, 24, 27, .07);
  --allm-assistant-bg: #F5F3F0;
  --allm-input-bg: #F6F4F1;
  --allm-accent: #B45309;
  --allm-link: #B45309;
  --allm-shadow: 0 40px 90px -30px rgba(64, 36, 8, .45), 0 4px 14px rgba(23, 24, 27, .06);
  --allm-bar-bg: rgba(255, 255, 255, .82);
  --allm-bar-text: #17181B;
  --allm-bar-border: rgba(23, 24, 27, .14);
  --allm-bar-shadow: 0 18px 40px -22px rgba(23, 24, 27, .45);
  --allm-radius: 12px;
  --allm-bar-radius: 999px;
  --allm-transition: 260ms;
  --allm-easing: cubic-bezier(.16, 1, .3, 1);
  --allm-font: Archivo, system-ui, sans-serif;
}

/* dunkel — hier per Klasse der Seite; alternativ denselben Block in
   @media (prefers-color-scheme: dark) { … } setzen */
html.dark #anythingllm-embed-widget {
  --allm-bg: #131316;
  --allm-surface: #1D1D21;
  --allm-header-bg: #18181B;
  --allm-text: #F4F2EF;
  --allm-text-muted: #A6A8AD;
  --allm-border: rgba(255, 255, 255, .07);
  --allm-assistant-bg: #2A2A2F;
  --allm-input-bg: #26262B;
  --allm-accent: #F3A04C;
  --allm-link: #F3A04C;
  --allm-shadow: 0 40px 100px -30px rgba(0, 0, 0, .8), 0 0 0 1px rgba(240, 130, 26, .10);
  --allm-bar-bg: rgba(34, 34, 38, .8);
  --allm-bar-text: #F4F2EF;
  --allm-bar-border: rgba(255, 255, 255, .14);
  --allm-bar-shadow: 0 18px 40px -20px rgba(0, 0, 0, .8);
}
```

Hinweise: Setzt die Seite nur einen Teil der Variablen, gelten für den Rest die Standardwerte des eingestellten Themes. Für eine dunkle Seite also entweder alle relevanten Variablen setzen oder zusätzlich `data-theme="dark"` (bzw. `auto`, wenn die Seite dem System folgt). Die Mockup-Linie `line` (`.07`) unterschreitet den 3:1-Rahmenkontrast — der eingebaute dunkle Satz nutzt deshalb `#787B82`.

Bekannte Abweichungen zum Mockup: Nutzer-Blase als Verlauf (`linear-gradient`) ist nicht abbildbar (`--allm-user-bg` ist eine Hintergrundfarbe); die Zipfel-Ecke der Blasen ist höchstens 4px (Mockup 6px); das Panel schwebt nicht (eigenes Issue). Die Leiste als Suchfeld mit „Beliebt gerade“-Chips: `data-inline-input="true"` + `data-default-messages` (ohne die Beschriftung „Beliebt gerade“). Schrift auf Akzentflächen (Icon, Absende-Knopf) ist fest weiß.

### `<iframe>` tag HTML embed

_work in progress_

### `<iframe>` Customization Options

_work in progress_
