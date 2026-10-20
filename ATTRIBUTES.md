# AnythingLLM Embed Widget - Attribute Reference

Alle verfügbaren `data-*` Attribute für das Embed-Script.

## Verwendung

```html
<script
  data-embed-id="your-embed-id"
  data-base-api-url="https://your-instance.domain.de/api/embed"
  data-button-color="#607D8B"
  ...
  src="https://your-instance.domain.de/embed/anythingllm-chat-widget.min.js">
</script>
```

---

## Pflicht-Attribute

| Attribut | Beschreibung |
|----------|--------------|
| `data-embed-id` | Eindeutige Embed-ID aus AnythingLLM |
| `data-base-api-url` | API-URL der AnythingLLM Instanz |

---

## Styling

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-button-color` | `#607D8B` | Farbe des Chat-Buttons (Hex) |
| `data-button-outline` | `null` | Rahmen um Chat-Button: `none`, `white`, `black`. Nützlich wenn Button-Farbe dem Hintergrund ähnelt. |
| `data-user-bg-color` | `#607D8B` | Hintergrundfarbe User-Nachrichten |
| `data-user-text-color` | `null` | Schrift auf der Akzentfarbe: `#FFFFFF` oder „Schwarz“ `#222628` (Design Center; ein früher gespeichertes `#000000` liefert der Server als `#222628` aus). Gilt wie gewählt für Nutzer-Sprechblasen und alle Flächen in Akzentfarbe (Chat-Button, Senden-Button, gefüllte Pillen beim Hover). Ohne Wert die Empfehlung nach WCAG-Kontrast aus der Akzentfarbe (höherer Kontrast zu `#FFFFFF` bzw. `#222628`, Gleichstand Weiß). Ein am Skript gesetztes `#000000` gilt wie gesetzt |
| `data-assistant-bg-color` | `#2563eb` | Hintergrundfarbe Bot-Nachrichten |
| `data-link-color` | `null` | Farbe für Links in Bot-Nachrichten (z.B. `#8B0000` für VHS-Rot). Wird sofort während Streaming angezeigt. |
| `data-header-bg-color` | `null` | Header-Hintergrundfarbe (z.B. `#8B1A1A`). Wenn gesetzt, wird Border entfernt, Ecken bleiben rund. |
| `data-header-text-color` | `null` | Textfarbe für Chatbot-Namen im Header (z.B. `#FFFFFF` für weiß auf dunklem Header) |
| `data-icon-style` | `rounded` | Icon-Hintergrund im Header. Optionen: `none`, `rounded`, `circle`, `border`, `border-dark`, `soft`, `glass`, `adaptive`, `shadow`, `pill`. Nur aktiv wenn `header-bg-color` gesetzt. Siehe Tabelle unten. |
| `data-brand-image-url` | Kufer Logo | Logo im Chat-Header (100x50px) |
| `data-brand-text` | `KI-Berater` (`en`: `AI Advisor`) | Text neben dem Logo |
| `data-assistant-name` | `KI-Berater` (`en`: `AI Advisor`) | Name des Assistenten |
| `data-assistant-icon` | Kufer Logo | Avatar-Icon des Assistenten |
| `data-chat-icon` | `chatBubble` | Icon für den Chat-Button |
| `data-position` | `bottom-left` | Position: `bottom-left`, `bottom-right`, `top-left`, `top-right` |
| `data-window-height` | – | **Ohne Wirkung** (wird ignoriert). Die Fenstergröße wird ausschließlich im Design Center eingestellt (Erscheinungsbild → Aussehen → Fensterhöhe). |
| `data-window-width` | – | **Ohne Wirkung** (wird ignoriert). Die Fenstergröße wird ausschließlich im Design Center eingestellt (Erscheinungsbild → Aussehen → Fensterbreite). |
| `data-text-size` | `14` | Textgröße in px (nur Zahl) |
| `data-no-header` | `null` | Header ausblenden wenn gesetzt |
| `data-theme` | `light` | Theme des ganzen Chatfensters: `light`, `dark`, `auto` (folgt `prefers-color-scheme`). Ein im Design Center gespeichertes Farbschema gewinnt gegen das Attribut (alle Einstellungen kommen aus dem Design Center). Auch per Design Center (`visual_config.theme`) — wirkt erst mit der Fork-Version, die diesen Schlüssel ausliefert (Image ≥ 7.9); bis dahin nur Script-Attribut bzw. Seiten-CSS. Feinsteuerung per Seiten-CSS über `--allm-*`-Variablen, siehe README „Styling per CSS-Variablen“. |

### Icon Style Optionen

| Wert | Beschreibung |
|------|--------------|
| `none` | Transparent, kein Hintergrund |
| `rounded` | Weißes abgerundetes Rechteck (Standard) |
| `circle` | Weißer Kreis |
| `border` | Weißer Rahmen, transparenter Hintergrund |
| `border-dark` | Dunkler Rahmen, transparenter Hintergrund |
| `soft` | Semi-transparenter weißer Hintergrund (rgba 0.2) |
| `glass` | Glasmorphismus-Effekt mit Blur |
| `adaptive` | Subtil heller als Header-Farbe |
| `shadow` | Weißer Glüh-Schatten um das Icon |
| `pill` | Pill-Form (breiter als hoch, weiß) |

---

## Texte & Sprache

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-language` | `de` | Sprache: `de`, `en`, etc. Ohne Angabe deutsch, auch die i18n-Texte (kein `allm_embed_language` im `localStorage` mehr). Panel-, Menü- und Bedientexte (`aria-label`) gibt es deutsch und englisch, andere Sprachen nutzen dafür Deutsch. |
| `data-greeting` | `Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?` (en: englisch) | Begrüßungstext = Text der Begrüßungsblase (`data-greeting-bubble-text` hat Vorrang). Frühere Standardtexte gelten als nicht gesetzt |
| `data-send-message-text` | `Ihre Frage eingeben` (en: `Enter your question`) | Placeholder im Input-Feld (der frühere Standard „Wie kann ich Ihnen helfen?“ gilt als nicht gesetzt) |
| `data-reset-chat-text` | `Chat zurücksetzen` | Text für Reset-Link |
| `data-reset-burger-text` | Sprache (`Chat zurücksetzen` / `Reset chat`) | Text im Burger-Menü. Der frühere feste Text gilt als nicht gesetzt (die Sprache des Widgets greift) |
| `data-email-burger-text` | Sprache (`E-Mail Support` / `Email support`) | E-Mail Option im Menü |
| `data-session-burger-text` | Sprache (`Chat-ID` / `Chat ID`) | Option im Menü, kopiert die Chat-ID |
| `data-history-burger-text` | Sprache (`Frühere Chats` / `Previous chats`) | Option „Frühere Chats“ im Menü |

---

## Verhalten

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-open-on-load` | `off` | Chat automatisch öffnen: `on` / `off` |
| `data-support-email` | `info@kufer.de` | E-Mail für Support-Anfragen |
| `data-username` | `null` | Anzeigename des Benutzers |
| `data-default-messages` | `[]` | Startvorschläge (kommagetrennt). Vorrang: im Design Center gespeicherte Liste (auch leer = keine Startvorschläge) vor diesem Attribut vor dem Standard der Sprache vom Server (`GET /embed/:id/config?language=…`, Fixliste 7.22-rc13 F01 bis F03). Der Server liefert die Liste als Array, ein Vorschlag mit Komma bleibt dort ganz; per Attribut trennt jedes Komma |
| `data-course-cards` | nach Darstellung (`auto` In der Seite, `off` Chatfenster) | **Ohne Wirkung** am Skript (Fixliste 7.22-rc8 R4). Antworten mit Kursen: `auto` = Kurskarten unter Antworten, die Kurse nennen (nur die in der Antwort verlinkten bzw. genannten Kurse; ≤ 5 Karten, ab 6 Kompaktliste), `off` = Nur Text mit Links (KIE-567, Design Center „Antworten mit Kursen“). Ohne gespeicherte Wahl entscheidet die tatsächliche Darstellung: In der Seite (Platzhalter gefunden, auch nur per `data-display-mode`) Kurskarten, Chatfenster (auch der Rückfall ohne Platzhalter) Nur Text. `GET /embed/:id/config` liefert `visual_config.courseCards` nur, wenn gespeichert; dieser Wert gewinnt immer. Das Widget schickt seine Darstellung mit jeder Chat-Anfrage (`displayMode` `"inline"` \| `"bubble"` im JSON-Body von `stream-chat`); der Server nutzt sie nur für diesen Standard (`courseSources`, ab Image ≥ 7.9). Im Chatfenster Teaser ganz (ohne Zeilenbegrenzung), In der Seite bis 3 Zeilen. Details: README |
| `data-course-cards-position` | `above` | `below` \| `above`: Kurskarten unter bzw. über der Antwort (KIE-567, Design Center „Reihenfolge“: Text zuerst bzw. Karten zuerst). Bei `below` erscheinen Text, dann die vom Server angekündigten Kurse als Karten, dann die Folgefragen. Bei `above` stehen vom Server vorab angekündigte Kurse (Image ≥ 7.10, Prompt „Course Cards Mode“) schon vor dem ersten Wort über der Antwort; ganze Karte klickbar. Auch `visual_config.courseCardsPosition`. Details: README |
| `data-suggestion-style` | `pills` (fest) | Seit Design Center vereinfacht (10/2026) fest `pills`: Vorschläge im leeren Chat als kleine Pillen (max. 6, > 60 Zeichen gekürzt); Attribut und `visual_config` wirken nicht mehr |
| `data-greeting-style` | `bubble` (fest) | Begrüßung immer als Assistenten-Blase (Text: `data-greeting-bubble-text`, sonst `data-greeting`, sonst Standard; über 300 Zeichen auf ein Wortende gekürzt). Eine Begrüßung aus dem Design Center gewinnt gegen beide Attribute |
| `data-assistant-subtitle` | `Online-Berater mit künstlicher Intelligenz` (`en`: `Online advisor powered by artificial intelligence`) | Untertitel unter dem Namen in der Titelleiste des Chats (max. 60 Zeichen). Ohne Server-Wert der Standard der Sprache (Fixliste 7.22-rc8 R5); im Design Center leer gespeichert (`visual_config.assistantSubtitle` `""`) = kein Untertitel. Das Attribut wirkt nur, solange im Design Center nichts gespeichert ist; leer (`""`) = kein Untertitel. Name und Untertitel werden nie gekürzt: Bei Platzmangel (schmales Chatfenster, In der Seite, mobil) brechen sie um, die Titelleiste wird höher, ⋮ und ✕ bleiben frei (Fixliste 7.22-rc13 N3, ersetzt die Ellipse aus rc10 W1) |
| `data-online-dot` | `false` (fest) | Entfällt: kein Online-Punkt mehr, der Wert wird ignoriert |
| `data-privacy-notice` | `bubble` (nur Design Center) | Datenschutz-Hinweis als eigene zweite Blase unter der Begrüßungsblase. Das Attribut wirkt nicht: Ein- und ausgeschaltet wird der Hinweis nur im Design Center (Schalter „Datenschutz-Hinweis anzeigen“, `visual_config.privacyNotice` `none` = aus, jeder andere Wert und das frühere `modal` = Blase). Texte: `data-privacy-title` (leer = keine Überschrift, Standard „Datenschutz“), `data-privacy-text` (freier Text, ≤ 12 Zeilen × 500 Zeichen: Zeilen mit „•“ oder „-“ werden Aufzählungspunkte, andere Absätze; ohne solche Zeilen altes Format, ein Punkt je Zeile bzw. `\|`), `data-privacy-url` (Link „Datenschutzerklärung“) |
| `data-disclaimer` | `footer` (fest) | KI-Hinweis immer unter dem Eingabefeld, genau eine Zeile (11 px, in schmalen Fenstern bis 10 px; reicht das nicht, mit „…“ gekürzt, voller Text im Tooltip), Text fest „Unsere KI kann Fehler machen. Bitte prüfen Sie die Antworten.“ (`en`: „Our AI can make mistakes. Please double-check the answers.“); `data-disclaimer-text` wird ignoriert |

---

## Audio (STT/TTS)

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-enable-stt` | `true` | Speech-to-Text Mikrofon anzeigen: `true` / `false`. Nur wenn Server STT unterstützt. |
| `data-enable-tts` | `true` | Text-to-Speech Lautsprecher anzeigen: `true` / `false`. Nur wenn Server TTS unterstützt. |
| `data-tts-position` | `bottom-right` | Position des TTS-Icons: `bottom-right` (unten rechts in Bubble) oder `icon-left` (unter dem Avatar, wie AnythingLLM App) |

**Hinweis:** STT und TTS müssen serverseitig konfiguriert sein (`.env`). Die Buttons erscheinen nur, wenn:
1. Der Server STT/TTS unterstützt (`/embed/:embedId/audio/status` gibt `stt: true` / `tts: true` zurück)
2. Das entsprechende Attribut nicht auf `false` gesetzt ist

---

## Welcome Bubbles

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-display-chatbot-bubbles` | `true` | Welcome-Bubbles anzeigen |
| `data-chatbot-bubbles-messages` | `[]` | Texte der Willkommensblasen (kommagetrennt). Eine im Design Center gespeicherte Liste gewinnt (der Server liefert sie als Array, eine Blase mit Komma bleibt ganz) |
| `data-bubble-persistence` | `localStorage` | **Ohne Wirkung** mit einem Server ab 7.22 (er liefert `welcomeBubbles*` immer, Standard „Beim ersten Besuch“). Ersatz für `sessionStorage` (1x pro Tab): im Design Center „Bei jedem Besuch“ wählen. Das Widget schreibt dann eine `console.warn`-Zeile. Nur bei einem älteren Server bzw. ohne Antwort vom Server wirkt es noch |

**Willkommensblasen je Gerät (KIE-568, nur Design Center):** `visual_config.welcomeBubblesDesktop` und `visual_config.welcomeBubblesMobile`, je `off` (keine Blasen, nur der Chat-Button) \| `first` (Standard, beim ersten Besuch: `localStorage`, nach Schließen der Blasen oder Öffnen des Chats nicht mehr) \| `every` (bei jedem Besuch: einmal je Browser-Tab per `sessionStorage`, Unterseiten im selben Tab zeigen sie nicht erneut). Fehlend oder ungültig = `first`. Handy = Fensterbreite < 768 px beim Laden. Kein Script-Attribut: allein der Server-Wert zählt.

---

## LLM Overrides

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-prompt` | `null` | System-Prompt überschreiben |
| `data-model` | `null` | LLM-Modell überschreiben |
| `data-temperature` | `null` | Temperatur überschreiben (0.0-1.0) |
| `data-show-thoughts` | `false` | KI-Denkprozess anzeigen |

---

## Sponsor/Footer

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-no-sponsor` | `true` | Sponsor-Footer ausblenden |
| `data-sponsor-text` | `Ein Dienst der Kufer Software GmbH` | Sponsor-Text |
| `data-sponsor-link` | `https://kufer.de` | Sponsor-Link |

---

## Beispiel: Vollständige Konfiguration

```html
<script
  data-embed-id="abc123-def456"
  data-base-api-url="https://chatbot.example.de/api/embed"

  <!-- Styling -->
  data-button-color="#E63946"
  data-user-bg-color="#E63946"
  data-assistant-bg-color="#1D3557"
  data-link-color="#8B0000"
  data-header-bg-color="#8B1A1A"
  data-header-text-color="#FFFFFF"
  data-icon-style="rounded"
  data-position="bottom-right"
  data-brand-text="Mein Assistent"
  data-assistant-name="Mein Assistent"

  <!-- Texte -->
  data-language="de"
  data-greeting="Willkommen! Wie kann ich helfen?"
  data-send-message-text="Ihre Frage..."

  <!-- Verhalten -->
  data-open-on-load="off"
  data-support-email="support@example.de"

  <!-- Audio (optional - Default ist "true") -->
  data-enable-stt="true"
  data-enable-tts="true"
  data-tts-position="icon-left"

  <!-- Welcome Bubbles -->
  data-display-chatbot-bubbles="true"
  data-chatbot-bubbles-messages="Hallo!,Kann ich helfen?"
  data-bubble-persistence="localStorage"

  src="https://chatbot.example.de/embed/anythingllm-chat-widget.min.js">
</script>
```

---

## Hinweise

### Responsive Verhalten (eingebaut)
Das Widget passt sich automatisch an:
- **Mobile** (<768px): Fullscreen, 100% Breite/Höhe
- **Tablet** (768-1279px): 40% Breite, 77% Höhe
- **Desktop** (≥1280px): 25% Breite, 77% Höhe

Die `data-window-*` Attribute überschreiben diese Defaults nicht mehr (TODO: konfigurierbar machen).

### Shadow DOM
Das Widget verwendet Shadow DOM für CSS-Isolation. Styles der Host-Seite beeinflussen das Widget nicht.

### z-index
Das Widget hat `z-index: 9999` und liegt immer über anderen Elementen.
