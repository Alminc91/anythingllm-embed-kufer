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

Gruppe A in den Suiten (Fixliste 7.22-rc18 W65): Seit rc17 verwirft das Widget Einbau-Angaben zu Feldern des Design Centers (`data-display-mode`, `data-theme`, `data-button-color` …). `open_page` in `tests/visual/theme_visual.py` gibt solche Angaben aus `attrs` deshalb als Antwort des gemockten Servers (`/config`) weiter; gibt die Mock-config denselben Schlüssel vor, gilt ihr Wert (wie vor rc17). `"script_attrs": true` im Seiten-Objekt lässt sie am Skript (Prüfung, dass sie nicht wirken). Die Liste der Schlüssel liest das Skript aus `DC_COVERED`.

Feste Farben gegen Seiten-CSS und `@property` (KI-Hinweis, Datenschutz-Blase, Akzent der Gruppe A; E24, E25, W62) sowie Begrüßungsstil mit Datenschutz-Hinweis (E26): `python3 tests/visual/rc18_farben.py [--out DIR] [--dist DIR --label vorher --no-assert]`.

Leiste als Eingabefeld (`data-inline-input`): `python3 tests/visual/inline_input.py` (Pixel-Vergleich Bestand/neue Zustände, Enter/Button/Chips mit gezählten `stream-chat`-Anfragen, Tastatur, Mobil-Vollbild; alle Aufrufe gemockt). Dazu die Leisten-Variante (Prüfungen „LV …“, Zustand `ii-focus-open`): Öffnen bei Zeiger-Klick (Maus/Touch, nicht per Tab); „LV Rückbau“ prüft, dass die entfernten Attribute `data-inline-close-on` und `data-inline-resume-hint` wirkungslos bleiben (keine Anfrage, kein Chip, keine Warnung). Tastenübergabe (`type-during-morph`, `type-field-below-fold`): Seite wie die Demo (Leiste 600 px, offen 760 px per Seiten-Transition), Öffnen bei Klick + `overlay` + `morph`, Verlauf lädt 250 ms; nach 0/200/500/1000 ms getipptes „abcdefgh“ steht vollständig im Chatfeld, Enter sendet genau diese Frage, `scrollY` je Frame des Laufs unverändert; Feld unter dem Viewport (1280×900): Text kommt an, gescrollt wird erst nach dem Lauf; „abcdefgh“ + Enter ≈ 300 ms nach dem Klick (Chatfeld bereit, Lauf läuft) sendet genau eine Frage; ohne Tippen liegt der Fokus nach dem Lauf im Chatfeld (nie im Auffangfeld, kein Scroll); je Frame des Laufs `scrollTop`/`scrollLeft` von `#anything-llm-chat` und `.allm-inline-content` = 0. Ergebnisse: `tests/visual/results/inline-input-*.png`, `summary-inline-input.json`.

Kurskarten (`data-course-cards`): `python3 tests/visual/course_cards.py` (gemockter Stream mit `courseSources` im Abschluss-Chunk; Pixel-Vergleich ohne Option gegen den Bestand, Karten hell/dunkel/mobil/Kompaktliste/Rückfrage, Stream ohne Flackern, Theme-Variablen + Kontrast, 360 px, keine zusätzlichen Server-Aufrufe; Kurskarten v2: Zustände `cc-above-*`, `above` ohne Karten und explizites `below` pixelgleich zur Referenz, Karten vor dem ersten Text-Token mit genau einer Einfügung (MutationObserver) und ohne Verschiebung, ganze Karte klickbar inkl. Tab/Enter, durchgereichter Marker nie sichtbar; Zustand `cc-fallback`: Kurslink ohne Serverdaten als Karte nur mit Titel). Ergebnisse: `tests/visual/results/course-cards-*.png`, `summary-course-cards.json`. Reale Trefferquote (AK-11, Reviewer, erst mit Fork-Image ≥ 7.9 und `visual_config.courseCards = "auto"` sinnvoll): `EMBED_LIVE_TESTS=1 python3 tests/visual/course_cards_ak11.py --base-api … --embed-id …` stellt 20 Kursfragen (Zeit/Thema, HybridSearch v2) als **echte Chats** und schreibt Protokoll + Screenshots nach `tests/visual/results/ak11/`. Kurskarten v2 (AK-8, Fork ≥ 7.10): zusätzlich `--position above --out tests/visual/results/ak8` — Spalte „AK-8“ prüft, dass jeder verlinkte Kurs eine Karte hat (Soll ≥ 18), protokolliert vorab angekündigte Karten und rohe Marker; `--from-json <protokoll.json>` bewertet ein vorhandenes Protokoll offline neu. Kurskarten v3: Zustände `cc-v3-meta` (Dauer/Ort), `cc-v3-teaser` und `cc-v3-teaser-mobile` (KI-Teaser, 360 px) plus DOM-Prüfung (Teaser nach den Karten, dieselben Kartenknoten ohne Verschiebung, bis zu 3 Zeilen, Teaser mit 20 Wörtern bei 330 px vollständig, Verlauf-Reload, durchgereichte Teaserzeilen nie sichtbar); neue Referenzen nur gezielt: `--baseline --new-states --only cc-v3-meta cc-v3-teaser cc-v3-teaser-mobile`. Zeilen-Karten und Teaser-Platzhalter: Zustände `cc-rows-light`, `cc-rows-dark` (Kartenbreite 700 px), `cc-rows-mobile` (390 px, Rasterkarte einspaltig), `cc-teaser-pending`, `cc-rows-pending` plus DOM-Prüfungen (Anordnung/Farben der Zeilen-Karte, drei Teaser à 18–20 Wörter bei 700 px ≤ 2 Zeilen, bei 640 und 480 px ≤ 3 Zeilen ohne Kappung, Kartenhöhe vor/nach dem Teaser-Chunk je Frame gleich, Platzhalter weg ohne Teaser, kein Puls bei reduzierter Bewegung).

Schwebende Box und Aufklapp-Effekte (`data-inline-layout`, `data-inline-effect`): `python3 tests/visual/overlay.py` (Pixel-Vergleich Standard gegen main und neue Zustände; Messungen: Inhalt unter dem Platzhalter bleibt stehen, Außenklick/Escape/Fokus, Links der Seite werden ausgelöst, computed `animation` je Effekt, Standard ohne Animation, Mobil-Vollbild, reduzierte Bewegung, `--allm-overlay-z` gegen Banner per `elementFromPoint`, kein Scroll-Lock, erster Frame positioniert, `overflow:hidden`-Fallback, Link neben verbreitertem Platzhalter, nur linke Maustaste, Touch-Tippen/-Wischen außerhalb, Escape im Seitenfeld, Wiedereintritt nach Resize/Drehen, Scrollen zur Box nach Absenden aus der Leiste; Effekt `morph`: Zustände `ov-morph-mid` (alle Transitionen bei 50 % der Dauer angehalten) und `ov-morph-end`, Start-/Zwischen-/Endgeometrie, Zuklappen rückwärts (Timing wie Mockup: 720 ms / 480 ms nach 80 ms, Inhalt bei 50 % der Schließdauer schon aus), Chips blenden aus/ein, Zuklappen auf einer Demo-ähnlichen Seite (Fläche zentriert 600/760 px, Umschalten per MutationObserver mit Seiten-Transition): `morph-close-geometry` (Button, Außenklick, Escape — bei ≈ 350 ms 610 < Breite < 740, letzter Frame = Leiste ± 1 px inkl. x, Host danach ruhig, Kanten monoton) und `morph-close-after-resize` (1280 → 900 px: Ende auf der neuen, schmaleren Leiste), `morph-close-after-scroll` (nach 300 px Mausrad endet der Lauf auf der Leiste ± 1 px, keine Nachbewegung), Aufklappen auf derselben Seite mit und ohne Seiten-Transition: `morph-open-first-frame` (erster Frame mit Leistenform = Leiste ± 1 px), `morph-open-geometry` / `morph-open-geometry-page-transition` (linke Kante monoton fallend, rechte steigend, Höhe steigend, Toleranz 0,6 px/Frame; keine Kante springt, ≤ 14 px/Frame; Ende = Panel ohne Sprung, ≤ 1 px; Breite/Höhe am Ziel wie bisher; `scrollY` konstant; Inhaltsbreite `.allm-inline-content` im Lauf = Ruhelage), dieselben Prüfungen bei verzögerter Reaktion der Seite (`morph-open-geometry-raf[-page-transition]`, `morph-open-geometry-timeout30[-page-transition]`: MutationObserver-Callback schaltet per rAF bzw. `setTimeout` 30 ms um), `morph-open-resize[-page-transition]` (Fenster 1280 → 1100 px im Lauf: Endlage nachgeführt, kein Sprung), Zuklappen mitten im Aufklappen ohne Sprung (auch bei verzögerter Seite), `morph-close-delayed-page` (Zuklappen bei verzögert reagierender Seite ohne Transition: kein Ein-Frame-Sprung), gemessen im Task nach jedem Frame (gemalter Stand), `ov-morph-frames` (rAF-Intervalle über Öffnen und Schließen, 3 Läufe, Median ≥ 90 % ≤ 20 ms, keine Long Tasks > 50 ms; pro Frame nur Zeitstempel, `scrollY` und Klassen, Geometrie/Opacity nur an festen Messpunkten, damit die Messung kein Layout erzwingt), `scrollY` konstant während des Laufs, Box weit unten: `overlay` scrollt gar nicht und setzt keinen Fokus ins unsichtbare Feld, `flow` einmal vor dem ersten Frame ohne Animation, auch mit nur 100 px Inhalt darunter ohne Klemmen (alles mit `scroll-behavior: smooth` der Seite), Chips-Umkehr ohne Deckkraft-Sprung, reduzierte Bewegung, mobil, Klick auf halbem Weg, Seitenfluss monoton; alle Aufrufe gemockt). Ergebnisse: `tests/visual/results/overlay-*.png`, `summary-overlay.json`.

Panel-Optik, Datenschutz- und KI-Hinweis (`data-suggestion-style`, `data-greeting-style`, `data-privacy-notice`, `data-disclaimer` …): `python3 tests/visual/panel_privacy.py` (neue Zustände `panel-pills`, `panel-pills-dark`, `panel-pills-inline`, `panel-pills-text`, `panel-pills-mobile`, `privacy-modal`, `privacy-modal-dark`, `privacy-modal-mobile`, `privacy-bubble`, `disclaimer-footer`, `panel-greeting-persist` — Referenzen aus dem Branch per `--baseline --new-states [--only …]`; Pillen ≤ 34 px/Rand/Umbruch bei 360 und 390 px, Klick sendet genau eine Frage, Blase/Avatar/Hinweis klein, Titelleiste mit Untertitel und Punkt (Ring in der Kopfzeilen-Farbe), Karte: Optik, Fokus, Tab-Falle, Escape, `localStorage`, Neuladen, gesperrter Speicher, Body-Styles unverändert + Seite scrollbar, mobil im Vollbild, Frage aus der Leiste wartet auf „Start“, Scroll-Pfeil liegt unter dem Hinweis; Datenschutz in der Blase ohne Sperre; KI-Hinweis unter dem Eingabefeld in Blase/Inline/mobil; alle Aufrufe gemockt). Ergebnisse: `tests/visual/results/panel-*.png`, `summary-panel-privacy.json`.

Folgefragen (`data-follow-ups`): `python3 tests/visual/follow_ups.py` (Zustände `fu-pills`, `fu-pills-dark`, `fu-pills-mobile`, `fu-pills-history`, `fu-pills-above`, `fu-pills-hover` — Referenzen aus dem Branch per `--baseline --new-states [--only …]`; ohne Attribut pixelgleich zu `bubble-open-answer`/`bubble-streamed` trotz Folgefragen-Daten, Pillen unter der letzten Antwort mit Akzent-Rand/-Schrift, Klick sendet genau eine Anfrage (Doppelklick) mit vollem Verlauf, Verlauf-Reload nur unter der letzten Nachricht, keine Pillen während des Streamings, durchgereichte Endzeile nie sichtbar, Umbruch bei 360 px, Kurskarten oben mit langer Antwort: Pillen nach dem Eintreffen im Bild (Desktop/360 px); alle Aufrufe gemockt). Ergebnisse: `tests/visual/results/follow-ups-*.png`, `summary-follow-ups.json`.

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

**Rangfolge der Einbau-Angaben (Fixliste 7.22-rc17, E23 und E24)**

Vollständige Tabellen: [ATTRIBUTES.md](ATTRIBUTES.md).

- **Gruppe A, im Design Center einstellbar** (je ein Feld im Design Center 2.0: Darstellung, Farbschema, Akzentfarbe, Schrift auf der Akzentfarbe, Logo, Chat-Icon, Position, Kurse anzeigen als, Reihenfolge, Name, Untertitel, Begrüßung, Datenschutz-Hinweis mit Texten und Link, Startvorschläge, Platzhalter, Willkommensblasen, Support-E-Mail): Es gilt nur das Design Center, gespeichert oder sein Standard. Die zugehörigen Einbau-Angaben (`data-display-mode`, `data-theme`, `data-button-color` …) **und** CSS-Variablen der Seite (`--allm-accent`, `--allm-on-accent`, `--allm-user-bg`, `--allm-user-text`, `--allm-link`) wirken nicht, auch wenn nichts gespeichert ist. Das Widget verwirft solche Einbau-Angaben vor dem Zusammenführen und meldet jede einmal (`console.warn`, deutsch: „Einbau-Angabe data-… wirkt nicht.“; `src/hooks/useScriptAttributes.js` `DC_COVERED`).
- **Gruppe B, feste Standards ohne Feld** (`FIXED_STANDARDS`, `INLINE_STANDARDS` und die übrige Optik: Inline-Layout, Effekt, Höhe, Startzustand, Öffnen, Eingabeleiste, Texte der Leiste, Schrift der Seite, Begrüßungs- und Vorschlagsstil, Folgefragen, Kartenlayout, Randabstände, Max. Breite und Stil der Leiste, Kopffarben, Icon-Stil, Textgröße, Radien, Schatten, Flächen- und Textfarben): Standard, den Entwickler per Einbau-Angabe oder CSS-Variable verfeinern dürfen. Die Einbau-Angabe schlägt den vom Server gelieferten festen Standard; ohne Einbau-Angabe gilt der Standard (ein Altwert aus `visual_config` wirkt nicht; Ausnahme: ein früher im Design Center gespeicherter Text der Eingabeleiste, `inlineInputPlaceholder`, gilt ohne Einbau-Angabe weiter). Ausnahme Begrüßungsstil (E26, Fixliste 7.22-rc18): Ist der Datenschutz-Hinweis im Design Center an, gilt `bubble`, auch gegen `data-greeting-style="text"`; `text` wirkt nur bei abgeschaltetem Hinweis.
- **Gruppe C, Technik und Verhalten** (`data-embed-id`, `data-base-api-url`, `data-language`, `data-mount`, `data-username`, KI-Overrides, Audio, `data-open-on-load`, Menütexte, Sponsor-Zeile): wirken immer.
- **KI-Hinweis (E24)**: auf keinem Weg abschaltbar oder änderbar, weder per Einbau-Angabe (`data-disclaimer`, `data-disclaimer-text` mit Warnzeile ohne Wirkung) noch per CSS-Variable: Schrift und Fläche hinter dem Satz sind je Farbschema fest (hell `#6b7280` auf `#FFFFFF`, dunkel `#A6A8AD` auf `#1D1D21`), als Regel direkt am Element im Shadow-Root ohne Variable; so ändert sie auch eine per `@property` registrierte Variable der Seite nicht (Fixliste 7.22-rc18 W62). Setzt die Seite `--allm-surface`, steht der Satz auf seiner eigenen Fläche. Der Datenschutz-Hinweis gehört zu Gruppe A: ein- und ausschalten nur über den Schalter im Design Center.
- **Datenschutz-Blase (E25, Fixliste 7.22-rc18)**: Text, Überschrift und Fläche sind wie beim KI-Hinweis je Farbschema fest und direkt am Element gesetzt (hell Text `#57534e`, Überschrift `#222628` auf `#FFFFFF`; dunkel `#A6A8AD` und `#F4F2EF` auf `#2A2A2F`; Kontrast mindestens 6:1). Weder Einbau-Angaben (`data-assistant-bg-color`) noch CSS-Variablen der Seite (`--allm-text-muted`, `--allm-assistant-text`, `--allm-assistant-bg`, auch per `@property`) machen den Text unsichtbar. Setzt die Seite eine eigene Farbe der Antwortblasen, behält die Datenschutz-Blase ihre eigene Fläche. Der Link zur Datenschutzerklärung hat die Linkfarbe aus dem Design Center.
- Ohne Wirkung, mit Warnzeile, außerdem `data-window-width`/`data-window-height` (Fenstergröße fest) und `data-online-dot` (kein Online-Punkt mehr).

**Feste Standards (Design Center vereinfacht, 10/2026)**

Das neue Design ist eingebaut; `visual_config` ändert daran nichts mehr (alte Werte bleiben gespeichert, wirken aber nicht; der Server liefert dieselben Werte, `src/utils/layout.js` `FIXED_STANDARDS` und `INLINE_STANDARDS`). Entwickler verfeinern die Standards ohne Feld im Design Center per Einbau-Angabe (Gruppe B oben):

- Begrüßung als Blase (`greetingStyle` `bubble`, Gruppe B; bei eingeschaltetem Datenschutz-Hinweis immer, E26), Text: `greetingBubbleText`, sonst `greeting`, sonst Standard „Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?“. Texte über 300 Zeichen werden auf ein Wortende gekürzt (mit „…“), nicht verworfen. Der Text kommt nur aus dem Design Center; `data-greeting` und `data-greeting-bubble-text` am Skript wirken nicht (Gruppe A).
- Datenschutz-Hinweis als eigene zweite Blase darunter (`privacyNotice` `bubble`, Standard). Im Design Center abschaltbar (Schalter „Datenschutz-Hinweis anzeigen“, KIE-565 Nachtrag): Nur `privacyNotice` `none` vom Server blendet die Blase aus (keine Lücke, kein Rahmen); jeder andere oder fehlende Wert, auch das frühere `modal`, ergibt die Blase. `data-privacy-notice` am Skript wirkt nicht (E24, Gruppe A). Überschrift `privacyTitle` (leer = keine, Standard „Datenschutz“), freier Text `privacyText` (Zeilen mit „•“ oder „-“ werden Aufzählungspunkte, andere Zeilen Absätze; Text ohne solche Zeilen = altes Format, ein Punkt je Zeile bzw. `|`), Link `privacyUrl` („Datenschutzerklärung“), alle nur aus dem Design Center.
- Startvorschläge und Folgefragen als Pillen (`suggestionStyle`/`followUps` `pills`, Gruppe B).
- Startvorschläge (Fixliste 7.22-rc13, Entscheidungen E10 bis E12; E10 neu mit Fixliste 7.22-rc17): Vorrang **im Design Center gespeicherte Liste (auch leer) vor dem Standard der Sprache vom Server**; `data-default-messages` am Skript wirkt nicht (Gruppe A), auch ohne gespeicherte Liste und ohne Liste vom Server (dann keine Startvorschläge). Ein gespeichertes `[]` (alle gelöscht und gespeichert) heißt „keine Startvorschläge“. Standard: „Ich suche einen Deutschkurs.“, „Gibt es Excel-Kurse am Abend?“ bzw. englisch. Das Widget ruft `GET /embed/:id/config?language=<Sprache des Widgets>` ab (`data-language`, sonst `de`); der Server wählt damit den Standard (fehlend oder unbekannt: deutsch). Der Server liefert `defaultMessages` und `chatbotBubblesMessages` als Array von Strings, jeder Eintrag bleibt ganz (auch mit Komma); kommagetrennt sind nur die Skript-Attribute (und die Antwort älterer Server). Kennzeichen vom Server: `defaultMessagesSaved: true` beim gespeicherten `[]`, `defaultMessagesStandard: true` beim Standard. Vertrag mit dem Fork: `tests/fixtures/embedConfigContract.json`.
- KI-Hinweis immer unter der Eingabe (E24, auf keinem Weg abschaltbar), Text fest „Unsere KI kann Fehler machen. Bitte prüfen Sie die Antworten.“ (`en`: „Our AI can make mistakes. Please double-check the answers.“). Fixliste 7.22-rc8 R1: Kurzfassung „prüfen“, weil die Langfassung „überprüfen“ im Chatfenster bei 1280 px (320 px breit) unter 10 px Schrift bräuchte (Messung `tests/visual/disclaimer_measure.py`). Genau eine Zeile: 11 px, in schmalen Fenstern bis 10 px kleiner.
- Kein Online-Punkt (`onlineDot` wird ignoriert, `data-online-dot` mit Warnzeile).
- Randabstände des Chatfensters und Max. Breite der Inline-Box: Standard 16 px bzw. volle Breite des Platzhalters; die Inline-Leiste folgt ohne Angabe dem Farbschema aus dem Design Center (Fixliste 7.22-rc7). Seit Fixliste 7.22-rc17 (E23, Gruppe B) verfeinern `data-offset-x`, `data-offset-y`, `data-inline-max-width` und `data-inline-theme` diese Standards wieder; ein Serverwert wirkt nicht. Ebenso wirksam (eigener Text): `data-inline-input-placeholder`, `data-inline-send-text`, `data-inline-collapsed-text`.
- Standard (der Server liefert die festen Werte): Antworten mit Kursen ohne gespeicherte Wahl **nach der tatsächlichen Darstellung** (Fixliste 7.22-rc8 R4): In der Seite (Platzhalter gefunden) Kurskarten (`courseCards` `auto`), Chatfenster (auch der Rückfall ohne Platzhalter) Nur Text mit Links (`off`). `GET /embed/:id/config` liefert `courseCards` nur, wenn im Design Center gespeichert; dieser Wert gewinnt immer. Das Widget schickt seine tatsächliche Darstellung mit jeder Chat-Anfrage mit (`displayMode` `"inline"` | `"bubble"` im JSON-Body von `stream-chat`); der Server nutzt das Feld ausschließlich für diesen Standard (`courseSources`). Ein `data-course-cards` am Skript wirkt nicht mehr. Reihenfolge: zuerst die Karten, danach der kurze Text (`courseCardsPosition` `above`, im Design Center „Reihenfolge“), Zeilen-Karten (`courseCardsLayout` `rows`, Gruppe B; im schmalen Fenster Rasterkarten). Im Chatfenster steht der KI-Teaser je Karte ganz da, ohne Zeilenbegrenzung (KIE-565 Nachtrag; Karten dort nur 200 bis 390 px breit, 15 bis 20 Wörter brauchen 3 bis 7 Zeilen; Inline bis 3 Zeilen), und nach einer Kartenantwort bleibt die Frage oben im Blick (die Folgefragen scrollen nicht über sie hinaus). Inline ohne eigene Angabe wie die Demo: Eingabe-Leiste (`inlineInput`), Öffnen beim Klick (`inlineOpenOn` `focus`), schwebend (`inlineLayout` `overlay`), Effekt `morph`, Höhe `520px`, eingeklappt, Schrift der Webseite (`inheritFont` `true`), Rundungen der Demo (Panel 40 px, Karten 14 px, Blasen 18 px, Leiste und Pillen 999 px). Diese Inline-Rundungen sind fest und folgen **nicht** einem `--allm-radius` der Seite; wer sie ändern will, setzt die einzelnen Variablen (`--allm-radius-card`, `--allm-radius-bubble`, `--allm-bar-radius`). Hinweis für bestehende Inline-Kunden: Eine Seite, die nur `--allm-radius` setzt (z. B. `12px` oder `0`), bekommt ein eckiges Panel, aber runde Karten, Blasen und Leiste.
- Eingeklappte Inline-Leiste: ohne eigenen Text die Demo-Texte in der Sprache des Widgets („Stellen Sie hier Ihre Frage …“ / „Chatten“, englisch „Ask your question here …“ / „Chat“). Der Platzhalter aus dem Design Center (`sendMessageText`) gilt für das Chat-Eingabefeld (Standard „Ihre Frage eingeben“); ein früher gespeicherter eigener `inlineInputPlaceholder` bleibt für die Leiste wirksam.
- Name ohne eigene Angabe je Sprache: „KI-Berater“ bzw. „AI Advisor“ (`brandText`, `assistantName`). Untertitel ohne Server-Wert ebenso der Standard der Sprache: „Online-Berater mit künstlicher Intelligenz“ bzw. „Online advisor powered by artificial intelligence“ (`assistantSubtitle`, Fixliste 7.22-rc8 R5). Im Design Center leer gespeichert liefert der Server `assistantSubtitle: ""` = kein Untertitel; `data-assistant-subtitle` am Skript wirkt nicht (Gruppe A).
- Sprache: ohne `data-language` deutsch (auch die i18n-Texte; das Widget schreibt kein `allm_embed_language` mehr in den `localStorage` der Seite und entfernt einen alten Eintrag). Menüeinträge („Chat zurücksetzen“, „Frühere Chats“, „E-Mail Support“, „Chat-ID“), Standard-Willkommensblasen und die Beschriftungen für Screenreader (`aria-label`) gibt es deutsch und englisch (`data-language="en"`); eigene Menütexte (`data-reset-burger-text` usw.) und eigene Willkommensblasen gewinnen, die früheren festen Menütexte gelten als nicht gesetzt.
- Willkommensblasen (KIE-568): Allein der Server-Wert zählt (`welcomeBubblesDesktop`/`welcomeBubblesMobile`, „Aus“, „Beim ersten Besuch“, „Bei jedem Besuch“), Texte nur aus dem Design Center. `data-bubble-persistence`, `data-display-chatbot-bubbles` und `data-chatbot-bubbles-messages` wirken nicht (Gruppe A; die Warnzeile zu `data-bubble-persistence` nennt den Ersatz „Bei jedem Besuch“). Das Gerät (Handy unter 768 px) gilt für den ganzen Seitenaufruf; auf Touch-Geräten ist das Schließen-X der Blasen immer sichtbar.
- Farbschema: nur aus dem Design Center (`visual_config.theme`, sonst `light`); `data-theme` am Script wirkt nicht (Gruppe A), auch wenn dort nichts gespeichert ist.
- Chatfenster: Escape schließt es (auch ohne Fokus im Widget, nicht aus einem Texteingabefeld der Webseite, auch nicht in einer Web-Komponente mit offenem Shadow Root; Checkboxen, Buttons und Schieberegler zählen nicht als Feld), der Fokus geht zurück auf den Chat-Button. Ist ein Zwischenschritt offen, schließt Escape nur diesen: „Frühere Chats“ bei jedem Escape, das Kommentarfeld nach „Daumen runter“ nur bei Escape aus dem Kommentarfeld, von den Daumen oder ohne Fokus (aus dem Eingabefeld schließt Escape weiter das Fenster, auch wenn weiter oben ein Kommentarfeld offen ist). Danach steht der Fokus auf dem Öffner (⋮ bzw. „Daumen runter“). Ein Escape der Webseite (z. B. auf einem Button in einem Dialog der Seite) wird nie abgefangen (kein `preventDefault`), der Dialog der Seite schließt also auch (Fixliste 7.22-rc13 W01 bis W03). Während einer IME-Eingabe (z. B. Japanisch) schließt Escape nichts. Beim Öffnen bleibt die Begrüßungsblase oben im Blick; passen nicht alle Startvorschläge darunter, sind sie per Scrollen erreichbar.
- Frühere Standardtexte (alter Datenschutzsatz bzw. Design-Center-Begrüßung in `greeting`, alter Text der Begrüßungsblase, „Datenschutz:“, Platzhalter „Wie kann ich Ihnen helfen?“) gelten als nicht gesetzt (`LEGACY_DEFAULT_TEXTS`); der neue Standard greift.

**LLM Overrides**

- `data-prompt` — Override the chat window with a custom system prompt. This is not visible to the user. If undefined it will use the embeds attached workspace system prompt.

- `data-model` — Override the chat model used for responses. This must be a valid model string for your AnythingLLM LLM provider. If unset it will use the embeds attached workspace model selection or the system setting.

- `data-temperature` — Override the chat model temperature. This must be a valid value for your AnythingLLM LLM provider. If unset it will use the embeds attached workspace model temperature or the system setting.

**Language & Localization**

- `data-language` — Sprache des Widgets. Ohne Angabe deutsch (`de`). Eigene Panel-, Menü- und Bedientexte gibt es deutsch und englisch, andere Sprachen nutzen dafür die deutschen Texte. [Currently supported languages are available here](https://github.com/Mintplex-Labs/anythingllm-embed/main/src/locales/resources.js). (PR's welcome)

**Style Overrides**

- `data-chat-icon` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Chat-Icon“, Warnzeile). Werte im Design Center: `plus`, `chatBubble`, `support`, `search2`, `search`, `magic`.

- `data-button-color` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Akzentfarbe“, Warnzeile). Die Akzentfarbe gilt für Chat-Button, Nutzerblasen und Links.

- `data-user-bg-color` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Akzentfarbe“, Warnzeile). Farbe der Nutzerblasen.

- `data-assistant-bg-color` — The background color of the assistant response chat bubbles when chatting. Value must be hex color code. Gruppe B (kein Feld im Design Center): wirkt; im dunklen Farbschema ersetzt der dunkle Satz sie.

- `data-brand-image-url` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Logo“, Warnzeile). Bild im Kopf des Chats.

- `data-greeting` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Begrüßungstext“, Warnzeile). Text der Begrüßungsblase.

- `data-no-sponsor` — Setting this attribute to anything will hide the custom or default sponsor at the bottom of an open chat window.

- `data-no-header` — Setting this attribute hides the header above the chat window.

- `data-sponsor-link` — A clickable link in the sponsor section in the footer of an open chat window.

- `data-sponsor-text` — The text displays in sponsor text in the footer of an open chat window.

- `data-position` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Position des Chat-Buttons“, Warnzeile). Standard `bottom-left`.

- `data-assistant-name` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Name“, Warnzeile). Standard `KI-Berater` (`en`: `AI Advisor`).

- `data-assistant-icon` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Logo“, Warnzeile). Avatar neben den Antworten.

- `data-window-height` / `data-window-width` - **Ohne Wirkung** (werden ignoriert, auch wenn sie in bestehenden Snippets stehen). Die Fenstergröße des Chatfensters (nur Tablet/Desktop ≥768px; mobil bleibt Vollbild) ist fest, es gibt kein Feld im Design Center (ein früher gespeicherter Wert wirkt nicht): 40 % bzw. 25 % ab 1280px Breite, 77 % Höhe. Seit Fixliste 7.22-rc17 meldet eine `console.warn`-Zeile das Attribut.

- `data-offset-x` / `data-offset-y` - Standard 16 px (fest seit Design Center vereinfacht). Seit Fixliste 7.22-rc17 verfeinert das Attribut den Standard wieder (Gruppe B): Randabstand von Button und Fenster in px (Ganzzahl 0 bis 200, optional mit `px`).

- `data-display-mode` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Darstellung“, Warnzeile). Die Werte im Design Center: `bubble` (Standard, **Chatfenster**: Button unten in der Ecke, öffnet ein Chatfenster) oder `inline` (**In der Seite**: Eingabeleiste direkt im Seiteninhalt, an der Stelle des Platzhalters `<div id="kufer-assistent"></div>`; ab 768px klappt sie an Ort und Stelle zur Chat-Box auf, mobil (<768px) öffnet Tippen immer direkt den Vollbild-Chat). Fehlt der Platzhalter auf einer Seite (oder ist er ungeeignet), erscheint dort automatisch das Chatfenster. Die tatsächliche Darstellung geht mit jeder Chat-Anfrage an den Server (`displayMode` im Body von `stream-chat`, nur für den Standard von „Antworten mit Kursen“).

- `data-mount` - CSS-Selektor des Platzhalters für den Inline-Modus. Standard `#kufer-assistent`. Ungültige Selektoren oder ungeeignete Elemente (z. B. `input`, `img`, `button`, `iframe`, `svg`, `body`) werden ignoriert (Rückfall auf das Chatfenster); bei mehreren Treffern gilt der erste.

- `data-inline-collapsed-text` - Text der eingeklappten Leiste (max. 120 Zeichen, reiner Text). Standard „Jetzt mit unserem KI-Assistenten schreiben“.

- `data-inline-height` - Höhe der aufgeklappten Inline-Box ab 768px (`px` oder `vh`, geklemmt 400–1200px). Standard seit Design Center vereinfacht `520px` (Inline-Standard wie die Demo, der Server liefert ihn fest; früher `600px`).

- `data-inline-max-width` - Standard: volle Breite des Platzhalters (fest seit Design Center vereinfacht). Seit Fixliste 7.22-rc17 verfeinert das Attribut den Standard wieder (Gruppe B): Maximalbreite der Inline-Darstellung in px (zentriert).

- `data-inline-start-state` - `collapsed` (Standard) oder `expanded` (nur ab 768px; mobil wird immer die Leiste gezeigt).

- `data-inline-layout` - Standard seit Design Center vereinfacht `overlay` (Inline-Standard, der Server liefert ihn fest). Wohin die Box ab 768px aufklappt: `flow` (früherer Standard: die Box steht im Seitenfluss und schiebt den Inhalt darunter nach unten) oder `overlay` (die Box **schwebt über dem nachfolgenden Inhalt**, nichts verschiebt sich). Bei `overlay` bleibt die eingeklappte Leiste unsichtbar im Seitenfluss (gleiche Höhe), die Box liegt oben an der Leiste, so breit wie der Platzhalter bzw. `data-inline-max-width`, Höhe wie `data-inline-height`. Klick außerhalb des Widgets (nur linke Maustaste; Rechts-/Mittelklick lassen die Box offen) bzw. Tippen außerhalb (Wischen zum Scrollen zählt nicht) oder Escape klappt ein. Eingeklappt wird erst **nach** dem Klick: ein Link oder Feld der Seite bekommt ihn normal, auch wenn die Seite den Platzhalter per `data-allm-expanded` verbreitert und beim Einklappen alles zurückrückt. Der Fokus geht zurück auf die Leiste — außer der Klick bzw. Escape fand in einem Feld/Link der Seite statt, dann bleibt er dort. Kein Scroll-Lock, keine Abdunkelung, keine Styles an `body`/`html`. Stapelhöhe über `--allm-overlay-z` (Standard `1000`) — liegt der Platzhalter in einem eigenen Stapelkontext der Seite (z. B. Vorfahre mit `position` + `z-index`, `transform`), gilt die Höhe nur innerhalb davon. **Fallback:** schneidet ein Vorfahre des Platzhalters die Box ab (`overflow: hidden`/`clip` oder `contain: paint` und die Box ragt über seine Unterkante), klappt die Box im Seitenfluss auf (eine `console.warn`-Zeile); geprüft bei jedem Aufklappen, auch wenn die Box ohne Klick wieder erscheint (Gerät gedreht, Fenster wieder ≥ 768px). Mobil (<768px) gilt unabhängig davon immer das Vollbild. Ungültiger Wert → Standard mit einer `console.warn`-Zeile. Kein Feld im Design Center (Gruppe B): Der Server liefert den festen Standard, das Attribut schlägt ihn.

- `data-inline-effect` - Aufklapp-Effekt der Box ab 768px. **Ohne Angabe** klappt die Box im Seitenfluss (`flow`) wie bisher **ohne Animation** auf; bei `data-inline-layout="overlay"` gilt dann `expand`. Ausdrücklich wählbar: `expand` („Nach unten aufklappen“: die Box rollt sich von oben aus, nur die Höhe), `grow` („Größer werden“: Skalierung 0,96 → 1 + Einblenden), `spring` („Federnd“: Skalierung 0,9 → 1 + Einblenden mit federnder Kurve `cubic-bezier(.34,1.56,.64,1)`), `float` („Schweben“: 8 px Versatz nach oben + Einblenden + Schatten, Kurve `cubic-bezier(.16,1,.3,1)`), `morph` (wie im Mockup: die eingeklappte **Leiste wächst zum Panel** — Breite, Höhe, Position und Rundung gehen von der Leistenform (Pille; Rundung aus `--allm-bar-radius` in px oder % — % bezogen auf die kleinere Seite der Leiste, bei zwei Werten der kleinere —, höchstens halbe Leistenhöhe) zum Panel mit `--allm-radius`, der Schatten von `--allm-bar-shadow` zu `--allm-shadow`; der Inhalt steht in Panelgröße bereit (kein Umbruch, keine Skalierung) und blendet nach 22 % der Dauer (≈ 160 ms) in der halben Dauer per Opacity ein; der Schatten wechselt wie im Mockup in Dauer + 100 ms (`ease`). Timing wie das Mockup („Schweben“): Aufklappen `720ms` mit `cubic-bezier(.16,1,.3,1)`, Zuklappen per Escape, Außenklick oder Button läuft rückwärts in `480ms` mit `cubic-bezier(.65,0,.35,1)` — der Inhalt blendet sofort in einem Drittel der Schließdauer (≈ 160 ms) aus, die Box schrumpft nach einem Sechstel (≈ 80 ms) zur Leiste, zusammen ≈ 560 ms; erst dann ist die Leiste wieder da. Beim Aufklappen startet das Fenster **pixelgenau auf der Leiste**: die Leistenform wird im ersten Frame gegen das Panel **nach** der Reaktion der Seite auf `data-allm-expanded` gemessen — das gilt für Seiten-CSS und für einen MutationObserver, der **synchron** im Callback umschaltet; läuft dabei eine Seiten-Transition am Platzhalter oder einem Vorfahren (z. B. `max-width`), zählt deren Endlage (der Browser spult sie dafür ohne Paint kurz ans Ende und wieder zurück, ihr Lauf bleibt unverändert). Das Panel steht während des Laufs fest in dieser Endlage (feste Breite, Versatz der Fläche wird je Frame ausgeglichen) — die Box wächst von der Leiste gleichmäßig in beide Richtungen, nur mit eigener Dauer/Kurve: linke Kante nur nach links, rechte nur nach rechts, Höhe nur nach unten, auch wenn die Seite den Platzhalter mit eigener Transition verbreitert; der Inhalt steht dabei schon in der Endbreite. Reagiert die Seite **verzögert** (MutationObserver-Callback schaltet erst per `requestAnimationFrame`, `setTimeout` oder Framework-Scheduler um), startet sie ihre Transition erst danach oder ändert sich das Fenster während des Laufs, wird die Endlage **nachgeführt**: vor dem Laufstart (Reaktion im ersten Frame, auch nach dem eigenen Frame-Callback — ein ResizeObserver korrigiert noch vor dem Malen) startet der Lauf gleich von der neuen Lage aus; im Lauf gleitet das Ziel (Lage und Breite) über den Rest der Kurve zur neuen Endlage — kein Sprung, beide Kanten weiter monoton (zieht sich das Ziel zurück, z. B. weil das Fenster schmaler wird, kann eine Kante um wenige px überschwingen), Ende ohne Nachsprung; kommt die Änderung erst im letzten Rest der Kurve, schließt ein Nachlauf von 120 ms mit derselben Kurve die Lücke (das Laufende wartet ihn ab, auch einen weiteren nach erneuter Änderung, aber höchstens 410 ms; bewegt die Seite die Fläche je Frame per Script, gilt nach 4 Nachläufen die aktuelle Lage sofort). Zuklappen mitten im Aufklappen kehrt an Ort und Stelle um (nach einer Nachführung läuft die Box dabei zur Lage der Leiste zurück). Beim Zuklappen laufen **Breite, Höhe, Lage und Rundung in einem Lauf** zur Leistenform, wie im Original: Ziel ist die beim Aufklappen gemessene Leiste (echter eingeklappter Zustand, Seitenkoordinaten — Scrollen des Fensters ändert nichts); hat sich die Inline-Fläche seit dem Ende des Aufklappens verschoben (Scroll-Container der Seite, Layoutverschiebung; mehr als 1 px oder andere Breite), wird die Leiste vor dem Rückweg frisch gemessen (Signal `data-allm-expanded` dafür kurz weg, ohne Paint); das Signal `data-allm-expanded` fällt schon beim **Start** des Zuklappens, damit eine Seiten-Transition der Fläche (z. B. `max-width`) parallel läuft; das Panel bleibt dafür während des Laufs an seiner Stelle im Dokument (feste Breite, Versatz der Fläche wird je Frame ausgeglichen), der Lauf folgt also immer der eigenen Dauer/Kurve. Nach dem Lauf bewegt sich nichts mehr (sofern die Seiten-Transition nicht länger als ≈ 560 ms beim Zuklappen bzw. ≈ 820 ms beim Aufklappen dauert; ohne `Element.getAnimations` — sehr alte Browser — folgt das Panel beim Aufklappen der Seite wie früher). Wurde das Fenster seit dem Aufklappen in Breite oder Höhe verändert, endet der Lauf auf der Leiste in der aktuellen Fläche (Breite 100 % der mitlaufenden Fläche, Höhe/Rundung frisch gemessen). Chips unter der Leiste (`overlay`) blenden beim Aufklappen in der halben Dauer weich aus und beim Zuklappen wieder ein (auch beim Umkehren mitten im Ausblenden ohne Sprung, ab der aktuellen Deckkraft). Der Lauf endet erst mit dem längsten Übergang (Schatten). Scrollen: mit `overlay` scrollt die Seite während des Laufs nie (wie im Mockup; die Box darf unten aus dem Viewport ragen) — getippte Zeichen gehen trotzdem nie verloren (**Tastenübergabe**, siehe `data-inline-open-on`): liegt das Chat-Eingabefeld in seiner Endlage ganz im Viewport, hat es den Fokus schon ab dem Klick, sonst sammelt ein unsichtbares Auffangfeld die Zeichen; am Ende des Laufs kommt der Fokus immer (ohne Scroll) ins Chat-Eingabefeld, und nur wenn schon getippt wurde, scrollt die Seite einmal zum Feld; im Seitenfluss scrollt sie, wenn die Box in ihrer Endgröße nach einem Klick nicht ganz im Viewport läge, einmal **vor** dem Lauf ohne Animation (`block: nearest`, auch bei `scroll-behavior: smooth` der Seite), nie währenddessen; steht unter dem Widget zu wenig Inhalt, hält die Inline-Fläche bis zum Ende des Laufs ihre Endhöhe, damit der Browser die Scrollposition nicht klemmt. Im Seitenfluss wächst die Box im Fluss — der Inhalt darunter wandert mit —, mit `overlay` schwebt sie. Zuklappen: Dauer `--allm-effect-close-duration`, Kurve `--allm-effect-close-easing`). `expand`/`grow`/`spring`/`float` animieren nur `transform`/`opacity` (`float` zusätzlich den Schatten); der Platz der Box steht vom ersten Frame an fest. Gilt für `flow` und `overlay`, nur wenn der Nutzer aufklappt — nicht für den Startzustand `expanded` beim Laden, nicht beim Wiedererscheinen der Box nach Drehen/Fenstergröße und nicht im mobilen Vollbild. Dauer `--allm-effect-duration` (Standard `320ms`, `morph` `720ms`), Kurve `--allm-effect-easing` (Standard je Effekt; `expand`/`grow` folgen `--allm-easing`); bei `prefers-reduced-motion: reduce` keine Bewegung (Endzustand sofort, auch beim Zuklappen). Ungültiger Wert → wie ohne Angabe, mit einer `console.warn`-Zeile, die den tatsächlich geltenden Wert nennt (auch wenn ein ungültiger Server-Wert verworfen wird und das Script-Attribut gilt). Kein Feld im Design Center (Gruppe B): Der Server liefert den festen Standard `morph`, das Attribut schlägt ihn.

  Signal für die Seite: Solange die Box aufgeklappt ist (ab 768px), trägt der Platzhalter das Attribut `data-allm-expanded="true"` (beim Einklappen entfernt; mobil im Vollbild nicht gesetzt). Damit kann die Seite z. B. die Fläche beim Aufklappen verbreitern: `.ask:has(#kufer-assistent[data-allm-expanded]) { max-width: 760px; }`. Mit `data-inline-effect="morph"` am besten **ohne eigene Breiten-/Positions-Transition** am Platzhalter (der Effekt animiert die Box selbst) und mit synchroner Reaktion auf das Signal; eine Seiten-Transition bis ≈ 560 ms und eine verzögerte Reaktion gleicht das Widget beim Auf- und Zuklappen aus, eine längere Transition bzw. eine Reaktion nach dem Ende des Laufs bewegt die Fläche nach dem Lauf noch nach. Weitere Eingriffe in die Seite gibt es nicht.

```html
<div id="kufer-assistent"></div>
<script
  data-embed-id="…"
  data-base-api-url="https://ihre-instanz.ki.kufer.de/api/embed"
  data-inline-layout="overlay"
  data-inline-effect="float"
  src="https://ihre-instanz.ki.kufer.de/embed/anythingllm-chat-widget.min.js"
></script>
```

(„In der Seite“ wird im Design Center gewählt; die Beispiele hier zeigen nur Entwickler-Attribute.)

- `data-inline-input` - `true` (Standard seit Design Center vereinfacht, der Server liefert ihn fest; früher `false` = Klickfläche): die eingeklappte Inline-Leiste wird zum **Eingabefeld mit Absende-Button**. Enter oder Klick auf den Button klappt auf **und** sendet die Frage sofort (gleicher Weg wie aus dem Chatfenster: Kontingent, Verlauf, Konversation); mobil (<768px) öffnet sich dabei wie gewohnt der Vollbild-Chat mit der bereits gesendeten Frage. Leeres Feld → nur aufklappen, Fokus im Chat-Eingabefeld. Klick in die Leiste neben das Feld → aufklappen, der getippte Text steht unversendet im Chat-Eingabefeld (an dort schon Getipptes mit Leerzeichen angehängt, nichts wird überschrieben). Wird der Chat zugeklappt, bevor die abgeschickte Frage gesendet werden konnte (Verlauf lädt noch bzw. eine vorherige Antwort läuft), wird sie verworfen und steht wieder im Leisten-Feld; ein erneutes Absenden ersetzt eine noch wartende Frage. Auf Touch-Geräten öffnet das Absenden aus der Leiste keine Bildschirmtastatur über der laufenden Antwort. Unter der Leiste erscheinen die Startvorschläge (`defaultMessages`: Design Center, sonst Standard der Sprache) als Chips in derselben Optik wie die Pillen im Panel (Rand und Text in Akzentfarbe, Hover und Tastaturfokus gefüllt; höchstens 6, umbrechen bei schmaler Breite); ein Klick sendet die Frage wie Enter — steht schon Text im Feld, wird der Chip-Text stattdessen angehängt (nicht gesendet). Im aufgeklappten Chat stehen die Vorschläge wie bisher (die Chips sind dann ausgeblendet). Kein Feld im Design Center (Gruppe B): Der Server liefert den festen Standard `true`, das Attribut schlägt ihn. Nur im Inline-Modus: im Chatfenster wird das Attribut ignoriert (eine `console.warn`-Zeile). Farben/Rundung über die Leisten-Variablen (`--allm-bar-*`, `--allm-radius`/`--allm-bar-radius`, Fokusring `--allm-focus-ring`; Akzent aus dem Design Center), siehe [Styling per CSS-Variablen](#styling-per-css-variablen).

- `data-inline-input-placeholder` - Platzhalter des Eingabefelds bei `data-inline-input` (max. 120 Zeichen, reiner Text). Standard „Stellen Sie hier Ihre Frage …“ (englisch „Ask your question here …“). Gruppe B: ein früher im Design Center gespeicherter Text (`visual_config.inlineInputPlaceholder`) gilt ohne Attribut, das Attribut schlägt ihn.

- `data-inline-send-text` - Text des Absende-Buttons bei `data-inline-input` (max. 40 Zeichen, reiner Text). Standard „Chatten“ (englisch „Chat“). Gruppe B.

  ```html
  <div id="kufer-assistent"></div>
  <script
    data-embed-id="…"
    data-base-api-url="https://<kunde>.ki.kufer.de/api/embed"
    data-inline-input="true"
    data-inline-input-placeholder="Stellen Sie hier Ihre Frage …"
    data-inline-send-text="Chatten"
    src="https://<kunde>.ki.kufer.de/embed/anythingllm-chat-widget.min.js"
  ></script>
  ```

- `data-inline-open-on` - Standard seit Design Center vereinfacht `focus` (Inline-Standard, der Server liefert ihn fest). Wann die Eingabe-Leiste (`data-inline-input`) aufklappt: `submit` (früherer Standard: erst mit Enter, „Chatten“, Chip oder Klick neben das Feld) oder `focus` (**Öffnen bei Klick**: schon ein Klick bzw. Tippen mit Maus, Finger oder Stift in das Leisten-Feld klappt den Chat auf, Fokus im Chat-Eingabefeld; bereits getippter Text steht dort unversendet, Chips senden wie bisher). **Tastenübergabe** (Desktop, alle Effekte; nicht bei Touch, nicht beim Absenden): Zeichen, die ab dem Klick getippt werden, kommen vollständig im Chat-Eingabefeld an — auch während der Chat noch lädt oder `morph` läuft: der Fokus geht in der Klick-Geste (ohne Scroll) in ein unsichtbares Auffangfeld, dessen Text ans Ende des Chat-Eingabefelds wandert, sobald es bereit ist (ein Entwurf aus der Leiste steht davor); Enter sendet wie im Chat (lädt der Chat noch, als Frage — danach Getipptes kommt nach dem Laden ins Chat-Eingabefeld). Während einer IME-/Dead-Key-Komposition wird nie übergeben, erst nach deren Ende. Zuklappen vor der Übergabe legt die Zeichen zurück in die Leiste. **Barrierefreiheit:** Fokus per Tastatur (Tab-Navigation über die Seite) öffnet **nie** — Tastatur- und Screenreader-Nutzer fallen nicht unvermittelt in ein Overlay; Enter öffnet wie gewohnt. Ungültiger Wert → Standard mit einer `console.warn`-Zeile. Kein Feld im Design Center (Gruppe B): Der Server liefert den festen Standard `focus`, das Attribut schlägt ihn.

  ```html
  <div id="kufer-assistent"></div>
  <script
    data-embed-id="…"
    data-base-api-url="https://<kunde>.ki.kufer.de/api/embed"
    data-inline-input="true"
    data-inline-layout="overlay"
    data-inline-open-on="focus"
    src="https://<kunde>.ki.kufer.de/embed/anythingllm-chat-widget.min.js"
  ></script>
  ```

- `data-inline-theme` - Ohne Angabe folgt die eingeklappte Leiste dem Farbschema aus dem Design Center (Fixliste 7.22-rc7). Seit Fixliste 7.22-rc17 verfeinert das Attribut den Standard wieder (Gruppe B): Stil der Leiste `light` oder `dark`; ein Serverwert wirkt nicht.

- `data-inherit-font` - `true`: im Inline-Modus die Schrift der Webseite übernehmen.

- `data-theme` - `light` (Standard), `dark` oder `auto` (folgt der Hell/Dunkel-Einstellung des Systems): Theme des ganzen Chatfensters. Details und alle Farb-/Form-Variablen: [Styling per CSS-Variablen](#styling-per-css-variablen). **Ohne Wirkung** am Skript (Gruppe A, Design Center „Farbschema“, Warnzeile). Es gilt das Farbschema aus dem Design Center, sonst `light`.

- `data-course-cards` - `auto`: unter einer Antwort, die Kurse nennt, erscheinen die genannten Kurse als **Kurskarten** (Wochentag + Uhrzeit, Titel als Link zur Kursseite, Beginn, Ort bzw. „online“/„vor Ort“, Preis, Status „buchbar“/„nicht buchbar“). **Das Skript-Attribut wirkt nicht mehr** (Fixliste 7.22-rc8 R4). Standard ohne gespeicherte Wahl nach der tatsächlichen Darstellung: In der Seite `auto`, Chatfenster `off` (= Nur Text mit Links). Im Design Center wählbar („Antworten mit Kursen“, `visual_config.courseCards` `"off"` | `"auto"`): der Server liefert den Schlüssel nur, wenn gespeichert, und dieser Wert gewinnt. Das Widget schickt seine Darstellung mit jeder Chat-Anfrage (`displayMode` im Body von `stream-chat`); der Server entscheidet damit über `courseSources` nach demselben Standard. **Server-Teil ab Image ≥ 7.9:** Der Server liefert die Kurs-Metadaten (`courseSources`, nur Metadaten, nie Kontexttext) nur bei wirksamem `courseCards` `auto` (gespeichert oder Standard der Darstellung) und erst ab Image 7.9; mit älteren Images gibt es keine Karten. Verhalten:
  - Die Antwort bestimmt die Auswahl: Karten nur für Kurse, deren Kursseite in der Antwort verlinkt ist oder deren Titel genannt wird (normalisiert, ≥ 90 % ähnlich; nur eindeutige Titel mit mindestens zwei Wörtern — gleichnamige Termine ohne Link bekommen keine Karte). Der Antworttext bleibt unverändert.
  - Jeder Kurs höchstens einmal (gleiche Kurs-URL), sortiert nach Beginn. Höchstens 5 Karten; ab 6 genannten Kursen eine **Kompaktliste** (eine Zeile je Kurs: Wochentag/Uhrzeit · Titel · Ort, höchstens 10 Zeilen, danach „weitere Kurse im Programm“).
  - Enthält die Antwort einen Link auf eine Programm-/Kategorieseite derselben Domain (keine Kursseite), steht er als Abschlusslink unter den Karten (Linktext aus der Antwort ohne Markdown-Zeichen wie `**`, `_`, Backticks + „→“). Kursseite = Link unter dem Kurs-Pfadpräfix: gemeinsamer Pfadanfang der Kurs-URLs ohne ihre letzten zwei Segmente (Slug + Kursnummer), mindestens das erste Segment (z. B. `/kurssuche/kurs/`). Kursseiten werden nie Abschlusslink, auch wenn zu ihnen keine Metadaten vorliegen. Die Wortliste (`/kurs/…`, `?kursnr=` …) gilt nur ohne Kurs-URL der Domain.
  - **Ganze Karte klickbar:** Jede Karte (und jede Zeile der Kompaktliste) ist ein einziger Link auf die Kursseite (neuer Tab, `rel="noopener noreferrer"`), zugänglicher Name = Kurstitel, Zeit/Ort/Preis/Status als Beschreibung. Hover über `--allm-hover-bg`, Tastatur-Fokus über `--allm-focus-ring` (sonst 2 px Akzent).
  - Rückfragen, Antworten ohne Kurse und reine Info-Seiten (Anmeldung, Kontakt) bleiben reiner Text, ohne leere Kartenfläche. Was ein Kurs ist, entscheidet der Server (Kurs-URL aus der Kopfzeile „Kurs-Link:“ + Titel); das Widget braucht je Eintrag nur `url` und `title`. Datum, Wochentage, Uhrzeit, Preis, Ort und Status sind optional — fehlende Angaben (z. B. Preis, Ort, Datum) entfallen, eine Karte ohne Datumsfelder zeigt keine Datumszeile; Preis 0 wird nicht angezeigt; Terminanzahl und freie Plätze gibt es nicht (nicht im Feed).
  - Kurse auf fremden Domains (nicht die Domain der Webseite und nicht die der meisten Kurse) werden weggelassen.
  - Verlinkt die Antwort eine Kursseite der eigenen Domain, zu der der Server keine Daten geliefert hat, erscheint nach Antwortende trotzdem eine schlanke Karte nur mit Titel (Linktext ohne Markdown) und Link, ohne Zeit/Preis/Ort — Reihenfolge und Limit wie bei den anderen Karten (ohne Datum hinter den datierten), bei `above` mit Ankündigung unter der Antwort.
  - Bei einer laufenden Antwort erscheinen die Karten einmal nach dem letzten Wort (Abschluss-Chunk), auch im gespeicherten Verlauf.
  - **Server ab Image ≥ 7.10:** Verlinkt die Antwort einen Kurs, dessen Kursdokument nicht unter den Treffern war, schlägt der Server ihn nach (Dateiname im Workspace, höchstens 5 je Antwort) — jeder verlinkte Kurs bekommt eine Karte. Mit dem Prompt-Abschnitt „Course Cards Mode“ kündigt der Bot die empfohlenen Kurse in der ersten Zeile an (`[[KARTEN: 0, 2]]`); der Server entfernt diese Zeile und schickt die Kurse vorab (Chunk `type: "courseSources"`). Das Widget entfernt einen durchgereichten Marker zusätzlich selbst (ältere Server).
  - **Kurskarten v3 (Server ab Image ≥ 7.13):** Dauer und Ort kommen aus den Kopfzeilen des Kursdokuments (`courseSources`-Felder `sessions` aus „Dauer:“, z. B. „16 Abende“, ≤ 30 Zeichen, und `venue` aus „Kursort:“, nur der Teil vor dem ersten „;“, ≤ 60 Zeichen). Kopfzeile der Karte „Mo · 18:00 Uhr · 16 Abende“, Metazeile „ab 14.09.2026 · Realschule · 60 €“ — ein Ort ersetzt „vor Ort“, „online“ bleibt; ohne die Felder sieht die Karte aus wie bisher. Dazu ein **KI-Teaser** je angekündigtem Kurs (15–20 Wörter, Prompt-Zeile `[[TEASER n: …]]` direkt nach dem Marker): Der Server entfernt diese Zeilen aus dem Text und schickt sie gesammelt als Chunk `{ type: "courseTeasers", teasers: { "<url>": "<text>" } }` nach den angekündigten Karten und vor dem ersten Textchunk; gespeichert als `courseTeasers` (Verlauf). Die Karte zeigt den Teaser als Untertext unter dem Titel (13 px, `--allm-text`, bis zu 3 Zeilen ohne Ellipse — 15–20 Wörter passen bei ≈ 330 px Kartenbreite; nur längere Teaser enden als letzter Ausweg mit „…“, blendet beim Eintreffen ein, ohne Bewegung bei `prefers-reduced-motion`); die Karten erscheinen weiterhin sofort und bleiben beim Nachfüllen an ihrem Platz. Fallback-Karten und Kompaktliste ohne Teaser. Teaserzeilen, die ein älterer Server im Text durchreicht, entfernt das Widget selbst. **Teaser-Platzhalter** (nur Karten oben, `above`): Solange zu den angekündigten Karten noch ein Teaser erwartet wird (Karten angekündigt, Antwort streamt, noch kein `courseTeasers`-Chunk und noch kein Antworttext — der Server schickt die Teaser vor dem ersten Textchunk), steht an der Teaser-Stelle gedämpft (`--allm-text-muted`) „KI-Beschreibung wird erstellt …“ (englisch „AI description is being written …“, Sprache wie die Panel-Texte) mit sanftem Puls (Opacity 0,45 ↔ 0,9 in 1,6 s, ruhig bei `prefers-reduced-motion`). Der Platzhalter reserviert die Höhe des Teasers (Raster 3 Zeilen, Zeilen-Karte 2 Zeilen ab 680 px Kartenbreite, sonst 3); der Teaser ersetzt ihn an Ort und Stelle (Einblenden wie bisher), die Karte ändert ihre Höhe dabei nicht. Endet der Stream, kommt Text oder ein Teaser-Chunk ohne Eintrag für eine Karte, verschwindet der Platzhalter. Nie bei Karten unten, Fallback-Karten, fertigen Antworten oder im geladenen Verlauf.
- `data-course-cards-layout` - `grid` (Raster) | `rows` (Standard seit Design Center vereinfacht): **Zeilen-Karten** — je Kurs eine Karte über die volle Breite (Entwurf der Designerin): links Wochentag + Uhrzeit in `--allm-accent` mit Tabellenziffern („Di 18:30“, mehrere Tage „Mo, Mi 18:30“), in der Mitte der Titel (14 px, 600) und darunter die Meta-Zeile „ab 22.09.2026 · 6 Termine · Raum 2.11 · 60 €“ (12 px, `--allm-text-muted`; Beginn, Dauer, Ort, Preis — nur vorhandene Felder), darunter der Teaser (13 px; ab 680 px Kartenbreite höchstens 2 Zeilen — 15–20 Wörter passen ab ≈ 500 px Textbreite —, bei 480–679 px höchstens 3 Zeilen) bzw. der Platzhalter; rechts die Status-Pille („buchbar“ mit Akzentrahmen, „nicht buchbar“ neutral). Rahmen 1 px `--allm-border`, Rundung `--allm-radius-card`, Polsterung 12 px 14 px, 8 px Abstand; die ganze Karte ist ein Link (Name = Titel, Hover/Fokus wie die Rasterkarten). Nur ab 480 px Kartenbreite — schmaler (Mobil, schmale Spalten) erscheint die bekannte Rasterkarte einspaltig (Teaser bis 3 Zeilen). Kompaktliste (ab 6 Kursen) unverändert. Die Sprachausgabe liest beide Layouts gleich. Ungültig → Standard mit einer `console.warn`-Zeile. Kein Feld im Design Center (Gruppe B): Der Server liefert den festen Standard `rows`, das Attribut schlägt ihn.
- `data-course-cards-position` - `below` | `above` (Standard seit Design Center vereinfacht): Position der Kurskarten. **Ohne Wirkung** am Skript (Gruppe A, Design Center „Reihenfolge“, Warnzeile). Wert aus `visual_config.courseCardsPosition`. `below` = wie bisher (Karten unter der Antwort, nach dem letzten Wort). `above` = Karten **über** der Antwortblase (unter dem Namen): Hat der Server Kurse vorab angekündigt (Image ≥ 7.10 + Prompt „Course Cards Mode“), stehen die Karten, bevor das erste Wort kommt — bis dahin läuft der Tipp-Indikator, danach streamt der Text darunter; am Ende verlinkte weitere Kurse werden angehängt (Reihenfolge stabil, nie Kompaktliste: höchstens 5 Karten, Rest „weitere Kurse im Programm“). Der Abschlusslink steht unter der Antwort. Ohne Ankündigung (älterer Server, Marker fehlt) erscheinen die Karten wie bei `below` erst am Ende, dann aber über dem Text (einmaliges Einfügen). Während des Streamings stehen oben nur die angekündigten Karten; Links und Titel der Antwort werden erst bei fertiger Antwort ausgewertet (nicht pro Chunk; Security: Links nur in den ersten 20.000 Zeichen, begrenzte Muster gegen ReDoS). Der Verlauf scrollt bei `above` mit der wachsenden Antwort höchstens bis die aktuelle Frage oben steht und bleibt dann stehen, damit die Karten im Bild bleiben (der Pfeil führt ganz nach unten); scrollt der Nutzer im laufenden Turn selbst (Rad, Wischen, Pfeil), springt der Verlauf nicht mehr zurück. Ein durchgereichter Marker wird schon beim Empfang entfernt (auch beim Laden des Verlaufs) — Anzeige, Vorlesen, Kopieren und Bewertung sehen nur den sauberen Text. Stream, Kontingent, Verlauf und Abbruch sind unverändert.
- `data-follow-ups` - Standard `pills` seit Design Center vereinfacht; seit Fixliste 7.22-rc17 verfeinert `none` den Standard wieder (Gruppe B), ein Serverwert wirkt nicht: **Folgefragen** — zwei (im ausführlichen Antwortmodus bis drei) Vorschläge des Modells für die nächste Frage erscheinen als Pillen unter der **letzten** Antwort (unter Blase und Kurskarten, über Datum/Bewertung; Einzug bündig mit der Blase). Dieselbe Pille wie die Startvorschläge (≈ 30 px hoch, `--allm-bar-radius`, Fläche `--allm-pill-bg`), 1 px Rand in Akzentfarbe, Schrift `--allm-pill-accent-text`; Hover und Tastaturfokus füllen die Pille in `--allm-accent` mit der Schrift auf der Akzentfarbe (`--allm-on-accent`) (Übergang `--allm-transition`, Fokusring `--allm-focus-ring`, sonst 2 px Akzent); lange Texte brechen um (keine Kürzung, höchstens 60 Zeichen). Ein Klick sendet den Text als nächste Frage (wie ein Vorschlag im leeren Chat), die Pillen verschwinden sofort; weitere Klicks senden nichts. Vorschläge und Folgefragen senden nur im eigenen Widget (das Sende-Ereignis bleibt im Shadow DOM des Widgets; bei zwei Widgets auf einer Seite sendet nur das angeklickte; ein Sende-Ereignis der Webseite auf `window`, `document` oder einem Seitenelement wirkt weiterhin). Keine Pillen während des Streamings, solange die Eingabe gesperrt ist (Antwort lädt, Datenschutz-Hinweis) und unter älteren Nachrichten — auch nach dem Neuladen des Verlaufs nur unter der letzten. Mit Kurskarten oben (`data-course-cards-position="above"`) scrollt das Fenster beim Eintreffen der Vorschläge sanft ans Ende (Pillen im Bild; bei reduzierter Bewegung ohne Animation), außer der Nutzer hat seit Beginn der Antwort selbst gescrollt. **Server ab Image ≥ 7.14 + Prompt:** Das Modell hängt am Antwortende eine Zeile `[[FRAGEN: Frage eins? | Frage zwei?]]` an; der Server entfernt sie immer aus Stream, gespeichertem Text und `/history` (auch ohne dieses Attribut), schickt die Vorschläge (nur bei `followUps: "pills"`) als Chunk `{ type: "followUps", followUps: ["…", "…"] }` nach dem letzten Textchunk und vor `finalizeResponseStream` und speichert sie als `followUps` (Verlauf; das Widget übernimmt sie beim Laden nur bei `pills`). Endzeile = letzte Zeile, beginnt mit `[[FRAGEN:`, Schluss am ersten `]]` innerhalb von 300 Zeichen, danach nur Leerraum: sie wird immer entfernt; Einträge (durch `|` getrennt) werden bereinigt wie die Teaser (URLs, führende `- • > #`, `**`/`__`/Backticks, gepaartes `*x*`/`_x_` am Wortrand raus, `[[`/`]]` → `[`/`]`), leere bzw. nur aus Satzzeichen bestehende und solche über 60 Zeichen verworfen, die ersten 3 gültigen gesammelt (0 → keine Pillen). Ohne `]]`, mit Text dahinter (auch eine zweite Gruppe) oder über 300 Zeichen bleibt die Zeile Text. Eine Zeile, die ein älterer Server durchreicht, hält das Widget beim Streamen zurück (ab `[[F…` am Zeilenanfang bis zum Antwortende, weiterem Text oder 300 Zeichen) und entfernt sie am Antwortende selbst (gleiche Regeln) — Anzeige, Vorlesen und Kopieren sehen sie nie.
  - Optik über `--allm-surface`, `--allm-text`, `--allm-text-muted`, `--allm-border`, Akzentfarbe aus dem Design Center (Rand links, Unterstreichung), `--allm-radius-card` (Standard 0,75 × `--allm-radius`); erbt hell/dunkel. Schmale Breite (z. B. 360 px): einspaltig, Titel bricht um.
  - **Sprachausgabe:** Der Vorlesen-Knopf einer Antwort mit Karten liest nach dem Antworttext zusätzlich die Karten als Sätze vor — „Kurs 1: Yoga Aufbaukurs, montags 18 Uhr, 16 Abende, ab 14. September 2026, Realschule, 60 Euro, buchbar. <Teaser>“ (nur vorhandene Felder; Kompaktliste und Fallback-Karten ohne Teaser) —, immer **zuerst der Antworttext, dann die Karten** (auch bei `above`; Fallback-Karten unter der Antwort zuletzt); Nummerierung durchgehend. Folgefragen, Marker und Teaserzeilen werden nie vorgelesen; ohne Karten bleibt der Vorlesen-Text unverändert. Screenreader lesen die Karten wie bisher aus dem DOM (Reihenfolge unverändert). Länge: Der Server kürzt den Vorlesen-Text auf 1.500 Zeichen; das Widget hält Text + Karten bei höchstens 1.400 Zeichen — Teaser nur, solange Platz ist (in Kartenreihenfolge), sonst die Karten ohne Teaser; reicht der Platz auch dafür nicht, entfallen die letzten Karten mit „Und n weitere Kurse.“ Der Antworttext wird nie gekürzt.

- **Panel-Optik (Mockup „Wunschfragen im Panel“)**: Seit Design Center vereinfacht eingebaut (siehe „Feste Standards“ oben). `data-suggestion-style` und `data-greeting-style` verfeinern den Standard seit Fixliste 7.22-rc17 wieder (Gruppe B; `data-greeting-style="text"` nur bei abgeschaltetem Datenschutz-Hinweis, E26); `data-online-dot` wirkt nicht; Texte (Begrüßung, Untertitel) nur im Design Center. Alle Texte werden als Text gerendert, nie als HTML.
  - `data-suggestion-style` - Standard `pills` (früher `bars`, per Attribut wählbar, Gruppe B): die `defaultMessages` im leeren Chat als kleine Pillen, dieselbe Komponente wie die Folgefragen (KIE-565 Nachtrag): Fläche `--allm-pill-bg`, Rand `--allm-pill-border` und Text `--allm-pill-accent-text` in Akzentfarbe (Text mit mindestens 4,5:1), Rundung `--allm-bar-radius`, ≈ 30 px hoch; Hover und Tastaturfokus füllen die Pille in `--allm-accent` mit der Schrift auf der Akzentfarbe (`--allm-on-accent`); umbrechend, höchstens 6; Texte über 60 Zeichen werden mit „…“ gekürzt angezeigt (Tooltip und gesendet: voller Text). Klick sendet die Frage wie bisher.
  - `data-greeting-style` - Standard `bubble` (früher `text`, per Attribut wählbar, Gruppe B; ist der Datenschutz-Hinweis im Design Center an, gilt `bubble` auch gegen `text`, E26, Fixliste 7.22-rc18 W60, denn nur die Begrüßungsblase trägt die Datenschutz-Blase): Begrüßung als Assistenten-Blase mit Avatar (`assistantIcon`, sonst `brandImageUrl`) und dem Text aus `data-greeting-bubble-text` bzw. `greeting` (längere Texte auf 300 Zeichen gekürzt; die Begrüßung kommt nur aus dem Design Center, beide Skript-Attribute wirken nicht; Standard „Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?“, englisch „Hello! I am your AI advisor. How can I help you?“; Blase höchstens 80 % breit wie die Antwortblasen); darunter die Vorschläge (Pillen links eingerückt unter der Blase) und der `greeting`-Text klein (11,5 px, `--allm-text-muted`). Die Blase (samt Datenschutz-Absatz bzw. kleinem `greeting`-Text) **bleibt** nach der ersten Frage als erste Nachricht im Verlauf stehen, auch nach dem Neuladen eines vorhandenen Verlaufs; sie ist kein Chat-Eintrag (wird weder gesendet noch gespeichert). Die Vorschläge darunter verschwinden mit der ersten Frage wie bisher. Mit `text` (nur ohne Datenschutz-Hinweis) steht die Begrüßung mittig als Text im leeren Chat (gespeicherter Text bzw. Standard der Sprache, auf 300 Zeichen gekürzt), der Verlauf bleibt unverändert. Farben der Blase: `--allm-assistant-bg`, `--allm-assistant-text`, `--allm-radius-bubble`, `--allm-bubble-shadow`.
  - `data-assistant-subtitle` - Untertitel unter dem Namen in der Titelleiste des Chats (max. 60 Zeichen, z. B. „durchsucht 1.243 Kurse“, `--allm-text-muted`). Ohne Server-Wert zeigt das Widget den Standard der Sprache („Online-Berater mit künstlicher Intelligenz“, `en` „Online advisor powered by artificial intelligence“; Fixliste 7.22-rc8 R5); im Design Center leer gespeichert (`visual_config.assistantSubtitle` `""`) = kein Untertitel. Das Attribut wirkt nicht (Gruppe A, Warnzeile). Name = `brandText` (Design Center: Feld „Name“). Name und Untertitel stehen immer ausgeschrieben, der Standard wie ein eigener Text: Bei Platzmangel (z. B. Chatfenster 360 px breit bei 1440 px Desktop, In der Seite, mobil) brechen sie um, die Titelleiste wird höher und der Text endet mindestens 8 px vor dem Menü ⋮; ⋮ und ✕ bleiben frei, das Menü klappt unter ⋮ auf (Nutzerentscheidung N3, Fixliste 7.22-rc13; ersetzt die Ellipse aus rc10 W1). Ohne Umbruch bleibt die Höhe wie bisher: 76 px, kompakt 56 px, Innenabstand eingerechnet, dazu 1 px Unterlinie (Fixliste 7.22-rc16 W40). Kompakt heißt mobil bei offener Bildschirmtastatur: Dann zeigt die Titelleiste nur den Namen (er bricht ebenfalls um), der Untertitel ist ausgeblendet und erscheint wieder, sobald die Tastatur schließt (Fixliste 7.22-rc16 E21).
  - `data-online-dot` - **Ohne Wirkung** seit Design Center vereinfacht (kein Online-Punkt, Warnzeile). Früher `true`: grüner Punkt (8 px) am Icon der Titelleiste, Tooltip „online“, 2 px Ring in der Farbe der Kopfzeile (`--allm-header-bg`, ohne Header-Farbe die Fensterfläche `--allm-surface`). Rein dekorativ (kein Status-Abruf), für Screenreader verborgen (`aria-hidden`). Bewusst nicht Standard: Der Punkt suggeriert, dass ein Mensch online ist — nur setzen, wenn das gewollt ist.
  - Icon: Die Kopfzeile zeigt wie bisher `brandImageUrl`, die Antwortblasen `assistantIcon` (beides Bild-URLs; nur im Design Center per Logo-Upload bzw. Logo-URL, die Skript-Attribute wirken nicht). Ein eigenes `assistantIconUrl` ist dafür nicht nötig.

  ```html
  <script
    data-embed-id="…"
    data-base-api-url="https://<kunde>.ki.kufer.de/api/embed"
    data-suggestion-style="bars"
    data-greeting-style="text"
    src="https://<kunde>.ki.kufer.de/embed/anythingllm-chat-widget.min.js"
  ></script>
  ```

  `data-greeting-style="text"` wirkt in diesem Beispiel nur, wenn der Datenschutz-Hinweis im Design Center abgeschaltet ist (E26).

- **Datenschutz-Hinweis** (Standard seit Design Center vereinfacht: eigene zweite Blase unter der Begrüßung)
  - `data-privacy-notice` - **Ohne Wirkung**. Ein- und ausgeschaltet wird der Hinweis nur im Design Center (Schalter „Datenschutz-Hinweis anzeigen“, `visual_config.privacyNotice` `none` = aus, sonst an); das frühere `modal` ergibt ebenfalls die Blase. Die Beschreibungen von `bubble` und `modal` unten sind der frühere Stand.
    - `bubble`: Die Datenschutz-Punkte stehen ohne Bestätigung **in der Begrüßungsblase** (setzt die Begrüßungsblase voraus: Ist der Hinweis im Design Center an, gilt `greetingStyle` `bubble`, auch gegen `data-greeting-style="text"`, E26): die Blase hat zwei Absätze: den Begrüßungstext und darunter eine **fette Überschrift** in eigener Zeile (`data-privacy-title`, derselbe Schlüssel wie die Karte, Standard „Datenschutz“, englisch „Privacy“), danach die Punkte als **ein** Fließtext (ein Punkt ohne Satzzeichen am Ende bekommt einen Punkt), am Ende der Link „Datenschutz“ (`data-privacy-url`, nur wenn gesetzt). Keine Sperre, kein `localStorage`; der kleine `greeting`-Text unter den Vorschlägen entfällt dann (sonst doppelt). Ist die Blase länger als das Fenster (kleines Blasenfenster), steht der leere Chat beim Öffnen am Ende (ohne Animation), damit die Vorschläge sichtbar sind.
    - `modal`: Beim ersten Öffnen liegt im Chatfenster (nicht über der Webseite, kein Scroll-Lock) eine Karte über dem Chat: Überschrift „Datenschutz:“ (links, 20 px fett), die Punkte als Liste (14 px), bei gesetzter URL die Zeile „Weitere Informationen in der Erklärung zum Datenschutz“, mittig der Button „Start“ (Akzentfarbe, mind. 44 px hoch). Karte ≈ 90 % der Panelbreite, 24 px Rundung, Farben über `--allm-surface`, `--allm-text`, `--allm-text-muted`, `--allm-link`, `--allm-accent` (dunkles Theme folgt). Bis zur Bestätigung ist die Eingabe gesperrt; eine aus der Leiste abgeschickte Frage wartet und wird mit „Start“ gesendet (Entwurf landet im Eingabefeld). Die Bestätigung wird je Embed in `localStorage` gespeichert (`allm-privacy-ack-<embedId>`, Zeitstempel); danach erscheint der Hinweis nicht mehr. Ist `localStorage` gesperrt (privates Fenster), gilt die Bestätigung bis zum Neuladen der Seite (einmal pro Sitzung). Tastatur: Fokus einmalig auf „Start“ — nach derselben Regel wie das Eingabefeld (nie einem Element der Webseite den Fokus wegnehmen, im Inline-Seitenfluss auf Touch kein Auto-Fokus, nicht nach einer per Touch aus der Leiste abgeschickten Frage); Tab bleibt in der Karte; Escape bestätigt nicht: im Inline-Modus klappt es wie gewohnt ein, als Chatfenster schließt es dieses wie der Schließen-Button, auch wenn der Fokus auf der Webseite liegt (keine Tastaturfalle); der Hinweis kommt beim nächsten Öffnen wieder.
  - `data-privacy-text` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Datenschutz-Hinweis: Text“, Warnzeile). Freier Text: Zeilen, die mit „•“ oder „-“ beginnen, werden Aufzählungspunkte, andere Zeilen Absätze; ohne solche Zeilen altes Format (ein Punkt je Zeile bzw. `|`). Höchstens 12 Zeilen mit je höchstens 500 Zeichen, 1000 Zeichen gesamt, nur Text (sonst verworfen → Standard). Standard (neutral für alle Kundenarten, kurz, ohne Speicherdauer, keine Rechtsberatung, bitte an die eigene Situation anpassen): „Ihre Anfragen bleiben auf Servern in Deutschland und werden nicht an Dritte weitergegeben.“ | „Mitarbeitende der Einrichtung können Gespräche zur Qualitätssicherung einsehen.“ | „Bitte teilen Sie nur Angaben, die für Ihre Anfrage nötig sind.“ **Hinweis für das Design Center:** Tragen Sie Ihre eigene Datenschutzerklärung als Link ein und nennen Sie bei Bedarf Ihre Speicherdauer im Text.
  - `data-privacy-title` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Datenschutz-Hinweis: Überschrift“, Warnzeile). Überschrift der Karte (`modal`) bzw. fette Überschrift des Datenschutz-Absatzes in der Begrüßungsblase (`bubble`), max. 120 Zeichen, nur Text, Standard „Datenschutz“ (leer = keine Überschrift).
  - `data-privacy-button-text` - Knopf der Karte (max. 40 Zeichen, Standard „Start“).
  - `data-privacy-url` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Link zur Datenschutzerklärung“, Warnzeile). Link zur Datenschutzerklärung (neuer Tab): `https://…` oder Pfad der eigenen Seite (`/datenschutz`), max. 512 Zeichen; leer bzw. ungültig → kein Link (Standard: kein Link, jeder Kunde trägt seine eigene Erklärung ein).
  - Sprache der Standardtexte (Begrüßungsblase, Datenschutz, KI-Hinweis, Menü, Willkommensblasen, Beschriftungen für Screenreader; eine Regel für alle): `data-language="en"` (auch `en-GB`) → englisch, alles andere (fehlend, ungültig oder eine Sprache ohne eigene Texte wie `fr`) → deutsch.

- **Fester KI-Hinweis unter dem Eingabefeld**
  - `data-disclaimer` - **Ohne Wirkung** seit Design Center vereinfacht (Warnzeile; E24: auf keinem Weg abschaltbar, auch nicht per CSS-Variable): Der KI-Hinweis steht immer als eine kleine Zeile (11 px, in schmalen Fenstern bis 10 px, Schrift und Fläche fest je Farbschema, hell `#6b7280` auf `#FFFFFF`, dunkel `#A6A8AD` auf `#1D1D21`, mittig) direkt unter dem Eingabefeld, in allen Darstellungen (Chatfenster, In der Seite, mobil Vollbild); nicht anklickbar, `role="note"`. Text fest „Unsere KI kann Fehler machen. Bitte prüfen Sie die Antworten.“ (`en`: „Our AI can make mistakes. Please double-check the answers.“). Immer genau eine Zeile: reicht auch 10 px nicht (sehr breite Schrift), endet sie mit „…“ (voller Text im Tooltip).
  - `data-disclaimer-text` - **Ohne Wirkung** (Warnzeile). Text fest in der Sprache des Widgets, wie oben: „Unsere KI kann Fehler machen. Bitte prüfen Sie die Antworten.“ (en: „Our AI can make mistakes. Please double-check the answers.“).
  - **Prompt:** Mit `disclaimer: "footer"` kann der bisher vom Modell erzeugte Pflicht-Footer (KI-Hinweis am Antwortende) im System-Prompt entfallen. **Reihenfolge:** zuerst das Image mit diesem Widget-Build (und der Fork-Whitelist) ausrollen und `disclaimer` setzen, erst danach den Footer aus dem Prompt nehmen — sonst gibt es eine Zeit ohne Hinweis.

- `data-text-size` - Set the text size of the chats in pixels.

- `data-username` - A specific readable name or identifier for the client for your reference. Will be shown in AnythingLLM chat logs. If empty it will not be reported.

- `data-default-messages` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Startvorschläge“, Warnzeile). Startvorschläge im leeren Chat (und als Chips unter der eingeklappten Inline-Leiste) kommen nur aus dem Design Center: gespeicherte Liste (auch leer = keine) vor dem Standard der Sprache vom Server (E10 neu, Fixliste 7.22-rc17). Siehe „Startvorschläge“ unter Feste Standards.

- `data-send-message-text` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Platzhalter im Eingabefeld“, Warnzeile). Standard „Ihre Frage eingeben“.

- `data-reset-chat-text` — Override the text shown on the reset chat button.

**Behavior Overrides**

- `data-open-on-load` — Once loaded, open the chat as default. It can still be closed by the user. To enable set this attribute to `on`. All other values will be ignored.

- `data-show-thoughts` — Allow users to see the AI's thought process, if applicable, in responses. If set to "false", users will only see a static "Thinking" indication without the explict thought content. If "true" the user will see the full thought content as well as the real response. Defaults to "false".

- `data-support-email` - **Ohne Wirkung** am Skript (Gruppe A, Design Center „Support-E-Mail“, Warnzeile). Adresse für den Menüpunkt „E-Mail Support“ (Standard `info@kufer.de`).

## Styling per CSS-Variablen

Das Widget rendert in einem **geschlossenen Shadow DOM**: Seiten-CSS erreicht keine Klasse und kein Element im Widget (`#anythingllm-embed-widget * { … }` oder fremde Stylesheets wirken nicht). Anpassbar ist es ausschließlich über die unten aufgeführten **CSS-Variablen `--allm-*`** — es gibt kein `data-custom-css`.

**Wo setzen?** Nur auf dem Host-Element `#anythingllm-embed-widget` **oder einem Vorfahren** (`body`, `:root`, im Inline-Modus auch der Platzhalter `#kufer-assistent`) wirksam. Auf einem Geschwister- oder sonstigen fremden Element gesetzt, hat eine Variable keine Wirkung (und verursacht keinen Fehler). Empfehlung: `#anythingllm-embed-widget` — im Inline-Modus hängt das Widget mobil (<768px) für das Vollbild direkt an `<body>`; nur am Platzhalter gesetzte Variablen gelten dort dann nicht.

```css
#anythingllm-embed-widget {
  --allm-radius: 12px;
  --allm-effect-duration: 320ms;
}
```

### Vorrangregel

Seit Fixliste 7.22-rc17 (E23 und E24) je Gruppe:

```
Gruppe A (im Design Center einstellbar):  Standard  <  Design Center (visual_config)
                                          Script-Attribut und Seiten-CSS ohne Wirkung
Gruppe B (feste Standards ohne Feld):     Standard  <  Server (fester Standard)  <  Script-Attribut  <  Seiten-CSS (--allm-*)
Gruppe C (Technik und Verhalten):         Script-Attribut wirkt immer
KI-Hinweis, Farben der Datenschutz-Blase: fest, auf keinem Weg änderbar
```

CSS-Variablen der Gruppe A, also ohne Wirkung: `--allm-accent`, `--allm-on-accent`, `--allm-user-bg`, `--allm-user-text` und `--allm-link` (Akzentfarbe und Schrift auf der Akzentfarbe aus dem Design Center; die Farbe der Nutzerblasen und der Links leitet der Server aus der Akzentfarbe ab). Alle übrigen Variablen verfeinern die Standards und gewinnen wie bisher, auch gegen das dunkle Theme. Abgeleitete Werte wie `--allm-pill-border`, `--allm-pill-accent-text` oder `--allm-focus-ring` folgen ohne eigenen Wert der Akzentfarbe aus dem Design Center und bleiben als eigene Variablen verfeinerbar.

Die bisherigen Einstellungen ohne Feld im Design Center (`assistantBgColor`, `headerBgColor`, `headerTextColor`, `inheritFont`, `textSize`) bleiben gültig und liefern die Standardwerte der Variablen.

Technisch setzt das Widget die Standardwerte der Gruppe B nicht unter dem öffentlichen Namen, sondern als interne Variable auf `:host` (`--allmi-radius: var(--allm-radius, <Standard>)`). Deshalb wird eine öffentliche Variable von Vorfahren normal vererbt bzw. gilt direkt auf dem Host und schlägt den Standard. Die Werte der Gruppe A stehen direkt und mit `!important` auf dem Host und auf jedem Element im Shadow-Root (`:host, :host * { --allmi-accent: #01a5a9 !important; }`): kein Rückgriff auf `--allm-*`, ein wichtiger Wert im Shadow-Root schlägt jede Angabe der Seite am Host, und eine per `@property … { inherits: false }` registrierte Variable der Seite ändert sie nicht, weil jedes Element den Wert selbst trägt (Fixliste 7.22-rc18 W62). Die Farben des KI-Hinweises und der Datenschutz-Blase gelten zusätzlich als Regel direkt am Element, ohne Variable (`#anything-llm-ai-disclaimer { color: #6b7280 !important; }`). Die `--allmi-*`-Namen sind **keine** Schnittstelle.

### Theme: hell, dunkel, automatisch

- Nur im Design Center (`visual_config.theme`, `light`, `dark`, aus älteren Konfigurationen auch `auto`), Gruppe A. Standard `light`. `data-theme` am Script wirkt nicht (Warnzeile, Fixliste 7.22-rc17 E23); Flächen- und Textfarben lassen sich über Seiten-CSS (`--allm-*`) verfeinern.
- **Hinweis Server:** `visual_config.theme` wirkt erst mit der AnythingLLM-Fork-Version, deren Endpunkt `/embed/:embedId/config` diesen Schlüssel ausliefert (Image ≥ 7.9); ein Widget ab 7.22 kommt mit diesem Server.
- `dark` schaltet den vollständigen dunklen Satz für das **ganze** Chatfenster (Fenster, Header, Verlauf, Eingabefeld, Menü, „Frühere Chats“, Willkommensblasen) und die Inline-Leiste. Kontrast geprüft (WCAG AA): Text ≥ 4,5:1, Rahmen ≥ 3:1.
- `auto` folgt `prefers-color-scheme` des Systems und wechselt **ohne Neuladen**.
- Ungültige Werte vom Server → eine `console.warn`-Zeile, es gilt `light`.
- Die eingeklappte Inline-Leiste folgt dem Theme (bei `theme: dark` also dunkel). `data-inline-theme` verfeinert das seit Fixliste 7.22-rc17 wieder (Gruppe B).
- Marken-Header im dunklen Theme: `headerBgColor` ohne `headerTextColor` → Name im Header in `#F4F2EF` (im hellen Theme wie bisher `#1f2937`), Icons weiß.
- Brand-Farben (`buttonColor`, `userBgColor`, `userTextColor`, `headerBgColor`/`headerTextColor`) gelten auch im dunklen Theme; `assistantBgColor` und `linkColor` sind auf eine weiße Antwortblase abgestimmt und werden im dunklen Theme durch den dunklen Satz ersetzt (`assistantBgColor` per Seiten-CSS weiterhin überschreibbar, `linkColor` als Gruppe A nicht).
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
| `--allm-accent` | Chat-Button, Icon der Leiste, Absende-Button und Fokusring (Standard) der Eingabe-Leiste, Rand der Pillen, Akzente („Frühere Chats“, Senden im Feedback) | **Gruppe A: nur Design Center, die Variable wirkt nicht.** Akzentfarbe `buttonColor` (`#01a5a9`) | `buttonColor` |
| `--allm-on-accent` | **Schrift auf der Akzentfarbe**: Schrift und Icons auf allen Flächen in `--allm-accent` (Chat-Button, Icon-Kreis und Senden-Button der Leiste, gefüllte Pillen beim Hover/Fokus, Senden im Feedback) | **Gruppe A: nur Design Center, die Variable wirkt nicht.** `userTextColor`; ohne Wert die Empfehlung nach WCAG-Kontrast aus der Akzentfarbe `buttonColor` (`#FFFFFF` oder „Schwarz“ `#222628`, höherer Kontrast, Gleichstand Weiß; Standard `#01a5a9`: `#222628`) | wie hell |
| `--allm-user-bg` | Nutzer-Blase, Vorschlags-Buttons | **Gruppe A: nur Design Center, die Variable wirkt nicht.** `userBgColor` = Akzentfarbe (`#01a5a9`) | `userBgColor` |
| `--allm-user-text` | Text der Nutzer-Blase | **Gruppe A: nur Design Center, die Variable wirkt nicht.** `userTextColor` (Wahl im Design Center, gilt wie gewählt); ohne Wert die Empfehlung nach WCAG-Kontrast aus `userBgColor` (`#FFFFFF` oder `#222628`) | wie hell |
| `--allm-assistant-bg` | Antwortblase | `assistantBgColor` (`#FFFFFF`) | `#2A2A2F` |
| `--allm-assistant-text` | Text der Antwortblase, folgt `--allm-text` | `#222628` | `#F4F2EF` |
| `--allm-link` | Links in Antworten | **Gruppe A: nur Design Center, die Variable wirkt nicht.** `linkColor` = Akzentfarbe (`#01a5a9`) | `#5CC8CB` |
| `--allm-header-bg` | Header (Chat + „Frühere Chats“) | `headerBgColor`, sonst `transparent` | `headerBgColor`, sonst `#18181B` |
| `--allm-header-text` | Name im Header, folgt `--allm-text` | `headerTextColor`, sonst `#1f2937` | `headerTextColor`, sonst `#F4F2EF` (auch mit `headerBgColor`) |
| `--allm-header-icon` * | Menü-/Schließen-/Zurück-Icons im Header (Chat + „Frühere Chats“), folgt `--allm-text-muted` | `headerTextColor`; mit `headerBgColor` `#FFFFFF`; sonst — (`#1e293b99`) | wie hell, sonst `#A6A8AD` |
| `--allm-input-bg` | Eingabefeld | `transparent` | `#26262B` |
| `--allm-input-border` | Rahmen des Eingabefelds (1,5px), folgt `--allm-border` | `#22262833` | `#787B82` |
| `--allm-input-text` | Eingabetext, Mikrofon/Senden-Spinner, Mikrofon/Senden-Icon beim Hover; folgt `--allm-text` | `#000000` (Hover-Icon `#222628e6`) | `#F4F2EF` |
| `--allm-radius` | Fenster (ab 768px), Inline-Box, Header oben, Eingabefeld, „Frühere Chats“ | `16px` (Inline: `40px`) | `16px` (Inline: `40px`) |
| `--allm-radius-bubble` | Sprechblasen (drei Ecken; Zipfel-Ecke `min(4px, Wert/4,5)`) | `--allm-radius` × 1,125 = `18px` (Inline: fest `18px`, folgt nicht `--allm-radius`) | wie hell |
| `--allm-radius-card` | Kurskarten (`data-course-cards`), getrennt vom Panel rundbar (Mockup: Panel `40px`, Karten `14px`) | `--allm-radius` × 0,75 = `12px` (Inline: fest `14px`, folgt nicht `--allm-radius`) | wie hell |
| `--allm-shadow` | Schatten von Fenster/Inline-Box | — (Chatfenster `0 4px 14px rgba(0,0,0,.25)`, Inline-Box `…0.12`) | `0 4px 14px rgba(0,0,0,.5)` |
| `--allm-bubble-shadow` * | Schatten der Sprechblasen | `0 4px 14px rgba(0,0,0,.25)` | `0 4px 14px rgba(0,0,0,.35)` |
| `--allm-font` | Schrift (alle Widget-Texte) | Widget-Schrift (`plus-jakarta-sans, ui-sans-serif, system-ui, …`); mit `inheritFont` die Seitenschrift | wie hell |
| `--allm-font-size` | Text der Nachrichten (laufende Antwort, Verlauf und Vorschläge gleich) | `textSize` (`14px`; wie bisher nur 10–14 und 16 wirksam, sonst erbt die Schrift) | wie hell |
| `--allm-transition` | Dauer der Übergänge (Button, Leiste, Header, Willkommensblasen ×1,5/×2) | `200ms` (`0ms` bei reduzierter Bewegung) | `200ms` |
| `--allm-easing` * | Zeitfunktion der Übergänge | `cubic-bezier(0.4, 0, 0.2, 1)` | wie hell |
| `--allm-effect-duration` | Dauer des Aufklapp-Effekts der Inline-Box (`data-inline-effect`) | `320ms`, `morph` `720ms` (bei reduzierter Bewegung keine Animation) | wie hell |
| `--allm-effect-easing` | Kurve des Aufklapp-Effekts | — (je Effekt: `expand`/`grow` `--allm-easing`, `spring` `cubic-bezier(.34,1.56,.64,1)`, `float`/`morph` `cubic-bezier(.16,1,.3,1)`) | wie hell |
| `--allm-effect-close-duration` | Nur `morph`: Dauer des Zuklappens (die Box schrumpft nach einem Sechstel davon, der Inhalt blendet in einem Drittel aus) | `480ms` | wie hell |
| `--allm-effect-close-easing` | Nur `morph`: Kurve des Zuklappens | `cubic-bezier(.65,0,.35,1)` | wie hell |
| `--allm-overlay-z` | Stapelhöhe (`z-index`) der schwebenden Inline-Box (`data-inline-layout="overlay"`); unter Cookie-Bannern/Modalen der Seite bleiben: kleiner als deren `z-index` setzen | `1000` | wie hell |
| `--allm-hover-bg` | Hover-Fläche (Menü, Header-Buttons, ×-Button) | — (`#f3f4f6`) | `rgba(255,255,255,.08)` |
| `--allm-focus-ring` | Tastatur-Fokus von Buttons/Links und der Eingabe-Leiste (`outline`-Kurzform, z. B. `2px solid #F3A04C`; ohne Wert: Leisten-Feld 2px Akzent) | — (Browser-Standard) | `2px solid` + Akzent |
| `--allm-bar-bg` | eingeklappte Inline-Leiste | `#FFFFFF` | `rgba(17,24,39,.78)` + Weichzeichner |
| `--allm-bar-text` | Text der Leiste, Platzhalter (70 %) | `#1f2937` | `#FFFFFF` |
| `--allm-bar-border` | Rahmen der Leiste (1px) | `#d1d5db` | `rgba(255,255,255,.16)` |
| `--allm-pill-border` | Rahmen der Pillen im Panel und der Chips unter der eingeklappten Leiste (Startvorschläge und Folgefragen, 1px); folgt der Akzentfarbe aus dem Design Center | Akzentfarbe | Akzentfarbe |
| `--allm-pill-bg` | Fläche der Pillen im Panel (Startvorschläge und Folgefragen) | `#FFFFFF` | `transparent` (Panelton) |
| `--allm-pill-accent-text` | Text der Pillen im Panel und der Chips unter der eingeklappten Leiste (Startvorschläge und Folgefragen; Chips: Fläche hell `#FFFFFF`, dunkel `#131316`) | `buttonColor` (Akzentfarbe aus dem Design Center) mit mindestens 4,5:1 auf Weiß (sonst schrittweise abgedunkelt; reicht die Farbe, die Akzentfarbe selbst) | `buttonColor` mit mindestens 4,5:1 auf `#131316` und `#1D1D21` (sonst schrittweise aufgehellt) |
| `--allm-logo-radius` | Rundung von Logo (Kopf) und Avatar (Blasen) | — (keine Rundung) | `22%` (Logo mit weißem Hintergrund wirkt als Kachel) |
| `--allm-bar-shadow` * | Schatten der Leiste | `0 1px 3px rgba(0,0,0,.06)` (dark: `0 4px 16px rgba(0,0,0,.18)`) | `0 4px 16px rgba(0,0,0,.18)` |
| `--allm-bar-radius` * | Rundung der Leiste, der Chips und der Pillen, Absende-Button 6px kleiner; folgt `--allm-radius` (Inline nicht: fest `999px`) | `16px` (Inline: `999px`) | `16px` (Inline: `999px`) |

Nicht über Variablen gesteuert (bewusst): Fehler-/Hinweisboxen (rot/amber), das Feedback-Kommentarfeld, Code-Blöcke (eigenes dunkles Schema), die Icon-Kachel im Marken-Header (`iconStyle`). Die Tönung der Icons in „Frühere Chats“ folgt der Akzentfarbe (10 %, per `color-mix()`; ältere Browser ohne `color-mix()`: wie bisher aus `buttonColor`). Der KI-Hinweis unter dem Eingabefeld und die Datenschutz-Blase folgen keiner Variable (E24, E25, Farben fest je Farbschema).

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
| `accentInk` | Akzentfarbe im Design Center (`--allm-accent` wirkt nicht) |
| `shadowOpen` | `--allm-shadow` |
| `header` | `--allm-header-bg` |
| `shadowClosed` | `--allm-bar-shadow` |
| `pill` / `line2` | `--allm-bar-bg` / `--allm-bar-border` (Pillen im Panel: `--allm-pill-border`) |
| `accentInk` (Links) | Akzentfarbe im Design Center (`--allm-link` wirkt nicht) |
| Pille 999px / Panel 40px / Karten 14px / Blasen 18px | `--allm-bar-radius` / `--allm-radius` / `--allm-radius-card` / `--allm-radius-bubble` |
| Übergang 260 ms, `cubic-bezier(.16,1,.3,1)` | `--allm-transition` / `--allm-easing` |
| Leiste wächst zum Panel (720 ms, `cubic-bezier(.16,1,.3,1)`; zurück 480 ms nach 80 ms, `cubic-bezier(.65,0,.35,1)`), Panel über dem Inhalt, kein Scroll | `data-inline-layout="overlay"` + `data-inline-effect="morph"`, Dauer `--allm-effect-duration` / `--allm-effect-close-duration` |
| Verbreiterung 600 → 760 px beim Öffnen | Seiten-CSS über `#kufer-assistent[data-allm-expanded]` |
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
  --allm-shadow: 0 40px 90px -30px rgba(64, 36, 8, .45), 0 4px 14px rgba(23, 24, 27, .06);
  --allm-bar-bg: rgba(255, 255, 255, .82);
  --allm-bar-text: #17181B;
  --allm-bar-border: rgba(23, 24, 27, .14);
  --allm-bar-shadow: 0 18px 40px -22px rgba(23, 24, 27, .45);
  --allm-radius: 40px;
  --allm-radius-card: 14px;
  --allm-radius-bubble: 18px;
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
  --allm-shadow: 0 40px 100px -30px rgba(0, 0, 0, .8), 0 0 0 1px rgba(240, 130, 26, .10);
  --allm-bar-bg: rgba(34, 34, 38, .8);
  --allm-bar-text: #F4F2EF;
  --allm-bar-border: rgba(255, 255, 255, .14);
  --allm-bar-shadow: 0 18px 40px -20px rgba(0, 0, 0, .8);
}
```

Hinweise: Setzt die Seite nur einen Teil der Variablen, gelten für den Rest die Standardwerte des eingestellten Themes. Für eine dunkle Seite also entweder alle relevanten Variablen setzen oder im Design Center das Farbschema „Dunkel“ wählen. Die Akzentfarbe (Mockup hell `#B45309`, dunkel `#F3A04C`) kommt aus dem Design Center; dort gibt es eine Akzentfarbe für beide Schemata. Die Mockup-Linie `line` (`.07`) unterschreitet den 3:1-Rahmenkontrast — der eingebaute dunkle Satz nutzt deshalb `#787B82`.

Bekannte Abweichungen zum Mockup: Nutzer-Blase als Verlauf (`linear-gradient`) ist nicht abbildbar (`--allm-user-bg` ist eine Hintergrundfarbe); die Zipfel-Ecke der Blasen ist höchstens 4px (Mockup 6px); die Effekte animieren nur `transform`/`opacity` (das Mockup animiert Breite/Höhe des Panels und hebt es beim Schweben um 18 px an). Die Leiste als Suchfeld mit „Beliebt gerade“-Chips: Eingabeleiste (Standard) + Startvorschläge im Design Center (ohne die Beschriftung „Beliebt gerade“). Schrift auf Akzentflächen (Icon, Absende-Button, gefüllte Pillen) ist die Schrift auf der Akzentfarbe aus dem Design Center (ohne Wahl die Empfehlung nach Kontrast, Weiß oder `#222628`).

### `<iframe>` tag HTML embed

_work in progress_

### `<iframe>` Customization Options

_work in progress_
