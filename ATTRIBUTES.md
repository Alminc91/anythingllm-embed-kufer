# AnythingLLM Embed Widget - Attribute Reference

Alle `data-*` Attribute für das Embed-Script und ihre Wirkung ab Widget 7.22 (Fixliste 7.22-rc17, Rangfolge E23 und E24).

## Rangfolge

| Gruppe | Was | Wirkung |
|---|---|---|
| **A · Design Center** | Alles, was der Kunde im Design Center 2.0 einstellen kann (je ein Feld im Reiter Aussehen oder Inhalt) | Es gilt nur das Design Center: der gespeicherte Wert, sonst sein Standard. Einbau-Angaben **und** CSS-Variablen der Seite für diese Eigenschaften wirken nicht, auch wenn im Design Center nichts gespeichert ist. Das Widget meldet jede solche Einbau-Angabe einmal in der Browser-Konsole. |
| **B · Feste Standards** | Was es im Design Center nicht zum Einstellen gibt: Inline-Design (Layout, Effekt, Höhe, Startzustand, Öffnen, Eingabeleiste, Texte der Leiste, Schrift der Seite), Begrüßungs- und Vorschlagsstil, Folgefragen, Kartenlayout, Randabstände, Kopffarben, Icon-Stil, Textgröße, Radien, Schatten, Flächen- und Textfarben | Es gilt der feste Standard (der Server liefert ihn mit). Entwickler dürfen ihn per Einbau-Angabe oder CSS-Variable verfeinern; die Einbau-Angabe schlägt den vom Server gelieferten Standard. |
| **C · Technik** | Widget-ID, Adresse, Sprache, Einhängepunkt, Besuchername, KI-Overrides, Audio, Öffnen beim Laden, Menütexte, Sponsor-Zeile | Wirken immer. |

**KI-Hinweis (E24):** Der KI-Hinweis unter dem Eingabefeld lässt sich auf keinem Weg abschalten oder ändern, weder im Design Center noch per Einbau-Angabe oder CSS-Variable (Schrift und Fläche hinter dem Satz sind je Farbschema fest). Seit 7.23 steht in derselben Zeile immer der Link „Datenschutz“ (en „Privacy“, feste Farben wie der KI-Hinweis, Kontrast mindestens 4,5:1); er öffnet das Datenschutz-Fenster über dem ganzen Chat. Den Datenschutz-Hinweis gibt es nur noch so: keine Datenschutz-Blase beim Start, kein Pop-up mit Bestätigung, keine Auswahl im Design Center. Die Begrüßung ist immer eine Blase (seit 7.23, Nutzer 24.10.2026); `data-greeting-style` wirkt nicht. Das Datenschutz-Fenster hat wie der KI-Hinweis feste Farben je Farbschema (seit 7.23-rc2); `data-assistant-bg-color` und die Variablen der Seite wirken darauf nicht. Link und Fokusrahmen im Fenster haben die Farbe des Links „Datenschutz“ (mindestens 4,5:1).

Umsetzung: `src/hooks/useScriptAttributes.js` (`DC_COVERED`, `dropIneffectiveAttributes`, `loadEmbedSettings`), `src/utils/layout.js` (`FIXED_STANDARDS`, `INLINE_STANDARDS`, `AI_NOTICE`), `src/utils/theme.js` (Variablen mit `dc`, `AI_NOTICE_COLORS`).

---

## Einbau-Code

Kunden brauchen nur den Einbau-Code aus dem Reiter Einbau im Design Center:

```html
<script
  data-embed-id="WIDGET-ID"
  data-base-api-url="https://KUNDE.ki.kufer.de/api/embed"
  src="https://KUNDE.ki.kufer.de/embed/anythingllm-chat-widget.min.js">
</script>
```

Für „In der Seite“ (im Design Center gewählt) zusätzlich der Platzhalter `<div id="kufer-assistent"></div>` an der Stelle im Inhalt. Englischsprachige Seite: `data-language="en"` ergänzen.

Signal für Seiten-CSS: Solange die Box aufgeklappt ist (ab 768 px), trägt der Platzhalter `data-allm-expanded="true"`, z. B. für `#kufer-assistent[data-allm-expanded] { … }`. Im mobilen Vollbild (unter 768 px) setzt das Widget das Signal nicht, weil das Vollbild über der Seite liegt und die Fläche darunter unverändert bleibt (Fixliste 7.22-rc20 E36). Details README.

### Pflicht-Attribute

| Attribut | Beschreibung |
|----------|--------------|
| `data-embed-id` | Eindeutige Embed-ID aus AnythingLLM |
| `data-base-api-url` | API-URL der AnythingLLM Instanz (endet auf `/api/embed`) |

---

## Vom Design Center abgedeckt (Attribut ohne Wirkung)

Gruppe A. Diese Attribute wirken nicht, auch wenn im Design Center nichts gespeichert ist; es gilt der Wert aus dem Design Center bzw. dessen Standard. Je Attribut eine `console.warn`-Zeile (deutsch): `[AnythingLLM Embed] Einbau-Angabe data-… wirkt nicht. …`.

| Attribut | Feld im Design Center | Standard ohne gespeicherten Wert |
|----------|-----------------------|----------------------------------|
| `data-display-mode` | Aussehen: Darstellung | `bubble` (Chatfenster) |
| `data-theme` | Aussehen: Farbschema | `light` |
| `data-button-color`, `data-user-bg-color`, `data-link-color` | Aussehen: Akzentfarbe (gilt für Chat-Button, Nutzerblasen und Links) | `#01a5a9` |
| `data-user-text-color` | Aussehen: Schrift auf der Akzentfarbe | Empfehlung nach WCAG-Kontrast (`#FFFFFF` oder `#222628`) |
| `data-brand-image-url`, `data-assistant-icon` | Aussehen: Logo | Kufer-Logo |
| `data-chat-icon` | Aussehen: Chat-Icon | `chatBubble` |
| `data-position` | Aussehen: Position des Chat-Buttons | `bottom-left` |
| `data-course-cards` | Aussehen: Kurse anzeigen als | nach Darstellung: In der Seite Kurskarten, Chatfenster Nur Text mit Links |
| `data-course-cards-position` | Aussehen: Reihenfolge | `above` (Karten zuerst) |
| `data-brand-text`, `data-assistant-name` | Inhalt: Name | `KI-Berater` (`en`: `AI Advisor`) |
| `data-assistant-subtitle` | Inhalt: Untertitel | `Online-Berater mit künstlicher Intelligenz` (`en`: `Online advisor powered by artificial intelligence`) |
| `data-greeting`, `data-greeting-bubble-text` | Inhalt: Begrüßungstext | `Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?` |
| `data-privacy-notice` | keine Auswahl mehr (seit 7.23) | immer der Link „Datenschutz“ unter der Eingabe; gespeicherte Altwerte wirken nicht |
| `data-privacy-title`, `data-privacy-text`, `data-privacy-url` | Inhalt: Datenschutz-Hinweis (Überschrift, Text, Link zur Datenschutzerklärung im Datenschutz-Fenster) | `Datenschutz` (auch bei leerer Überschrift), Standardtext der Sprache, kein Link |
| `data-default-messages` | Inhalt: Startvorschläge | keine: der Standard vom Server ist leer (E42, 7.22-rc23); es gilt nur eine im Design Center gespeicherte Liste (E10 neu: gespeichert, auch leer, vor Standard) |
| `data-send-message-text` | Inhalt: Platzhalter im Eingabefeld | `Ihre Frage eingeben` (`en`: `Enter your question`) |
| `data-chatbot-bubbles-messages`, `data-display-chatbot-bubbles`, `data-bubble-persistence`, `data-welcome-bubbles-desktop`, `data-welcome-bubbles-mobile` | Inhalt: Willkommensblasen und „Willkommensblasen anzeigen“ (je Gerät Aus, Erster Besuch, Jeder Besuch) | Standardblasen der Sprache, beim ersten Besuch |
| `data-support-email` | Inhalt: Support-E-Mail | `info@kufer.de` |

Ebenfalls ohne Wirkung (mit Warnzeile), aber nicht aus dem Design Center:

| Attribut | Grund |
|----------|-------|
| `data-disclaimer`, `data-disclaimer-text` | KI-Hinweis fest (E24): immer unter dem Eingabefeld, genau eine Zeile (11 px, in schmalen Fenstern bis 10 px, sonst mit „…“ gekürzt, voller Text im Tooltip), Text „Unsere KI kann Fehler machen“ (`en`: „Our AI can make mistakes“), daneben der Link „Datenschutz“ („Privacy“); gekürzt wird nur der Satz, nie der Link |
| `data-window-width`, `data-window-height` | Fenstergröße fest (Tablet 40 %, Desktop ab 1280 px 25 % Breite, jeweils mindestens 360 px, 77 % Höhe; mobil Vollbild) |
| `data-online-dot` | Den Online-Punkt gibt es nicht mehr |

---

## Feste Standards verfeinern (Entwickler-Attribute)

Gruppe B. Ohne Angabe gilt der feste Standard (Inline-Design wie die Demo-Seite). Eine Angabe hier schlägt den Wert, den der Server als festen Standard liefert. Ungültige Werte: eine `console.warn`-Zeile, es gilt der Standard. Nicht für Kunden gedacht; im Zweifel gehört der Wunsch ins Design Center.

| Attribut | Standard | Beschreibung |
|----------|----------|--------------|
| `data-inline-layout` | `overlay` | Box schwebt über dem Inhalt (`overlay`) oder schiebt ihn nach unten (`flow`), ab 768 px. Details README |
| `data-inline-effect` | `morph` | Aufklapp-Effekt ab 768 px: `expand`, `grow`, `spring`, `float`, `morph`. Details README |
| `data-inline-height` | `520px` | Höhe der aufgeklappten Box ab 768 px (`px` oder `vh`, geklemmt 400 bis 1200 px) |
| `data-inline-start-state` | `collapsed` | `collapsed` oder `expanded` (nur ab 768 px) |
| `data-inline-open-on` | `focus` | `focus` (Klick ins Feld öffnet) oder `submit` (erst beim Absenden) |
| `data-inline-input` | `true` | Leiste als Eingabefeld mit Absende-Button (`false` = Klickfläche) |
| `data-inline-input-placeholder` | `Stellen Sie hier Ihre Frage …` | Platzhalter der Leiste (max. 120 Zeichen) |
| `data-inline-send-text` | `Chatten` | Text des Absende-Buttons der Leiste (max. 40 Zeichen) |
| `data-inline-collapsed-text` | `Jetzt mit unserem KI-Assistenten schreiben` | Text der Leiste als Klickfläche (max. 120 Zeichen) |
| `data-inline-max-width` | volle Breite | Maximalbreite der Inline-Darstellung in px (zentriert) |
| `data-inline-theme` | folgt dem Farbschema | Stil der Leiste `light` oder `dark` |
| `data-inherit-font` | `true` (In der Seite) | Schrift der Webseite übernehmen |
| `data-greeting-style` | `bubble` | wirkt nicht (Warnzeile): die Begrüßung ist seit 7.23 immer eine Blase, ohne Feld im Design Center (Nutzer 24.10.2026); bis 7.22.2 wählte `text` einen zentrierten Text, wirkte wegen E26 aber nur bei abgeschaltetem Datenschutz-Hinweis |
| `data-suggestion-style` | `pills` | Startvorschläge als Pillen (`pills`) oder Balken (`bars`) |
| `data-follow-ups` | `pills` | Folgefragen als Pillen (`pills`) oder keine (`none`) |
| `data-course-cards-layout` | `rows` | Kurskarten als Zeilen (`rows`) oder Raster (`grid`) |
| `data-offset-x`, `data-offset-y` | `16` | Randabstand von Chat-Button und Chatfenster in px (0 bis 200) |
| `data-header-bg-color` | leer | Farbe der Kopfzeile; mit Farbe entfällt die Trennlinie |
| `data-header-text-color` | leer | Farbe des Namens in der Kopfzeile |
| `data-icon-style` | `rounded` | Hintergrund des Logos in der Kopfzeile, nur mit Kopffarbe (Tabelle unten) |
| `data-assistant-bg-color` | `#FFFFFF` | Farbe der Antwortblasen; im dunklen Farbschema ersetzt der dunkle Satz sie |
| `data-text-size` | `14` | Textgröße der Nachrichten in px (wirksam 10 bis 14 und 16) |
| `data-no-header` | aus | Kopfzeile ausblenden |
| `data-button-outline` | leer | Rahmen um den Chat-Button: `none`, `white`, `black` |

Dazu die CSS-Variablen `--allm-*` (Radien, Schatten, Flächen- und Textfarben, Übergänge, Leiste), siehe README „Styling per CSS-Variablen“. Ohne Wirkung sind dort nur die Variablen der Gruppe A (`--allm-accent`, `--allm-on-accent`, `--allm-user-bg`, `--allm-user-text`, `--allm-link`).

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

## Entwickler-Attribute (wirken immer)

Gruppe C, Technik und Verhalten.

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-embed-id` | Pflicht | ID des Widgets aus dem Design Center |
| `data-base-api-url` | Pflicht | Adresse der Instanz, endet auf `/api/embed` |
| `data-language` | `de` | Sprache des Widgets und der Standardtexte (auch Startvorschläge vom Server, `?language=`). Panel-, Menü- und Bedientexte gibt es deutsch und englisch, andere Sprachen nutzen dafür Deutsch |
| `data-mount` | `#kufer-assistent` | CSS-Selektor des Platzhalters für „In der Seite“. Ungeeignete Elemente werden ignoriert, dann erscheint das Chatfenster |
| `data-username` | leer | Lesbarer Name oder Kennung des Besuchers, erscheint in den Chat-Protokollen |
| `data-prompt` | leer | System-Prompt überschreiben (nur wenn der Server es erlaubt) |
| `data-model` | leer | LLM-Modell überschreiben (nur wenn der Server es erlaubt) |
| `data-temperature` | leer | Temperatur überschreiben, 0.0 bis 1.0 (nur wenn der Server es erlaubt) |
| `data-show-thoughts` | `false` | Denkprozess des Modells anzeigen, sofern es einen liefert |
| `data-open-on-load` | `off` | Mit `on` öffnet sich das Chatfenster beim Laden |
| `data-enable-stt` | `true` | Mikrofon zur Spracheingabe zeigen, wenn der Server sie anbietet |
| `data-enable-tts` | `true` | Vorlesen anbieten, wenn der Server es kann |
| `data-tts-position` | `bottom-right` | Platz des Vorlese-Symbols: `bottom-right` (in der Blase) oder `icon-left` (unter dem Avatar) |
| `data-reset-burger-text` | Sprache (`Chat zurücksetzen` / `Reset chat`) | Menüpunkt „Chat zurücksetzen“. Der frühere feste Text gilt als nicht gesetzt |
| `data-history-burger-text` | Sprache (`Frühere Chats` / `Previous chats`) | Menüpunkt „Frühere Chats“ |
| `data-session-burger-text` | Sprache (`Chat-ID` / `Chat ID`) | Menüpunkt, kopiert die Chat-ID |
| `data-email-burger-text` | Sprache (`E-Mail Support` / `Email support`) | Menüpunkt für die Support-E-Mail |
| `data-reset-chat-text` | `Chat zurücksetzen` | Text des Zurücksetzen-Links |
| `data-history-enabled` | `true` | `false` blendet „Frühere Chats“ aus; ist es in den Widget-Einstellungen abgeschaltet, gilt das |
| `data-no-sponsor` | `true` | Sponsor-Zeile ausblenden |
| `data-sponsor-text` | `Ein Dienst der Kufer Software GmbH` | Text der Sponsor-Zeile |
| `data-sponsor-link` | `https://kufer.de` | Link der Sponsor-Zeile |

**Hinweis Audio:** STT und TTS müssen serverseitig konfiguriert sein (`.env`). Die Buttons erscheinen nur, wenn der Server sie unterstützt (`/embed/:embedId/audio/status` gibt `stt: true` bzw. `tts: true` zurück) und das Attribut nicht auf `false` steht.

---

## Beispiel: Einbau-Code mit Entwickler-Attributen

Nur Pflicht- und Entwickler-Attribute; Aussehen und Texte kommen aus dem Design Center. Technik (Gruppe C): `data-language` bis `data-tts-position`; feste Standards verfeinern (Gruppe B, nur bei Bedarf): `data-inline-effect` bis `data-icon-style`.

```html
<div id="kufer-assistent"></div>
<script
  data-embed-id="abc123-def456"
  data-base-api-url="https://chatbot.example.de/api/embed"
  data-language="de"
  data-username="Kursportal"
  data-enable-stt="true"
  data-enable-tts="true"
  data-tts-position="icon-left"
  data-inline-effect="float"
  data-inline-height="600px"
  data-header-bg-color="#8B1A1A"
  data-header-text-color="#FFFFFF"
  data-icon-style="rounded"
  src="https://chatbot.example.de/embed/anythingllm-chat-widget.min.js">
</script>
```

---

## Hinweise

### Responsive Verhalten (eingebaut)
Das Widget passt sich automatisch an:
- **Mobile** (<768px): Fullscreen, 100% Breite/Höhe
- **Tablet** (768-1279px): 40% Breite, mindestens 360 px, 77% Höhe
- **Desktop** (≥1280px): 25% Breite, mindestens 360 px (seit 7.23; 1280 px ergibt 360 px, 1920 px 480 px), 77% Höhe

### Shadow DOM
Das Widget verwendet Shadow DOM für CSS-Isolation. Styles der Host-Seite beeinflussen das Widget nicht, nur die CSS-Variablen `--allm-*` (README).

### z-index
Das Widget hat `z-index: 9999` und liegt immer über anderen Elementen.
