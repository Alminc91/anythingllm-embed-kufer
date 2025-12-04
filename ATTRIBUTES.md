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
| `data-assistant-bg-color` | `#2563eb` | Hintergrundfarbe Bot-Nachrichten |
| `data-link-color` | `null` | Farbe für Links in Bot-Nachrichten (z.B. `#8B0000` für VHS-Rot). Wird sofort während Streaming angezeigt. |
| `data-header-bg-color` | `null` | Header-Hintergrundfarbe (z.B. `#8B1A1A`). Wenn gesetzt, wird Border entfernt, Ecken bleiben rund. |
| `data-header-text-color` | `null` | Textfarbe für Chatbot-Namen im Header (z.B. `#FFFFFF` für weiß auf dunklem Header) |
| `data-icon-style` | `rounded` | Icon-Hintergrund im Header. Optionen: `none`, `rounded`, `circle`, `border`, `border-dark`, `soft`, `glass`, `adaptive`, `shadow`, `pill`. Nur aktiv wenn `header-bg-color` gesetzt. Siehe Tabelle unten. |
| `data-brand-image-url` | Kufer Logo | Logo im Chat-Header (100x50px) |
| `data-brand-text` | `Ihr Online-Berater` | Text neben dem Logo |
| `data-assistant-name` | `Ihr Online-Berater` | Name des Assistenten |
| `data-assistant-icon` | Kufer Logo | Avatar-Icon des Assistenten |
| `data-chat-icon` | `chatBubble` | Icon für den Chat-Button |
| `data-position` | `bottom-left` | Position: `bottom-left`, `bottom-right`, `top-left`, `top-right` |
| `data-window-height` | `80%` | Höhe des Chat-Fensters (CSS-Wert) |
| `data-window-width` | `25%` | Breite des Chat-Fensters (CSS-Wert) |
| `data-text-size` | `14` | Textgröße in px (nur Zahl) |
| `data-no-header` | `null` | Header ausblenden wenn gesetzt |

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
| `data-language` | `de` | Sprache: `de`, `en`, etc. |
| `data-greeting` | Willkommensnachricht | Begrüßungstext im Chat |
| `data-send-message-text` | `Wie kann ich Ihnen helfen?` | Placeholder im Input-Feld |
| `data-reset-chat-text` | `Chat zurücksetzen` | Text für Reset-Link |
| `data-reset-burger-text` | `Chat zurücksetzen` | Text im Burger-Menü |
| `data-email-burger-text` | `E-Mail Support` | E-Mail Option im Menü |
| `data-session-burger-text` | `Sitzungs-ID` | Session-ID Option im Menü |

---

## Verhalten

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-open-on-load` | `off` | Chat automatisch öffnen: `on` / `off` |
| `data-support-email` | `info@kufer.de` | E-Mail für Support-Anfragen |
| `data-username` | `null` | Anzeigename des Benutzers |
| `data-default-messages` | `[]` | Vordefinierte Schnellantworten (kommagetrennt) |

---

## Welcome Bubbles

| Attribut | Default | Beschreibung |
|----------|---------|--------------|
| `data-display-chatbot-bubbles` | `true` | Welcome-Bubbles anzeigen |
| `data-chatbot-bubbles-messages` | `[]` | Bubble-Texte (kommagetrennt) |
| `data-bubble-persistence` | `localStorage` | Speicherart: `localStorage` (1x pro Browser) oder `sessionStorage` (1x pro Tab) |

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
  data-window-height="77%"
  data-window-width="25%"
  data-brand-text="Mein Assistent"
  data-assistant-name="Mein Assistent"

  <!-- Texte -->
  data-language="de"
  data-greeting="Willkommen! Wie kann ich helfen?"
  data-send-message-text="Ihre Frage..."

  <!-- Verhalten -->
  data-open-on-load="off"
  data-support-email="support@example.de"

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
