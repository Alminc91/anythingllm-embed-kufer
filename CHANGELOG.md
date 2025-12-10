# Changelog - AnythingLLM Embed Widget (Kufer Fork)

Alle wichtigen Änderungen am Embed Widget werden hier dokumentiert.

## [2.6.0] - 2024-12-10

### Hinzugefügt
- **🎤 Speech-to-Text (STT)**: Mikrofon-Button im Chat-Input
  - MediaRecorder API für Audio-Aufnahme
  - Server-seitige Transkription via `/api/audio/transcribe`
  - Automatische Spracherkennung basierend auf Browser-Sprache
  - Button erscheint nur wenn Server-STT konfiguriert ist

- **🔊 Text-to-Speech (TTS)**: Speaker-Button bei Assistant-Nachrichten
  - Konvertiert Nachrichtentext zu Sprache via Server
  - Ruft `POST /embed/:embedId/audio/tts` auf
  - Play/Pause-Funktionalität mit Audio-Caching
  - Button erscheint nur wenn Server-TTS konfiguriert ist

- **Audio-Status Lazy Loading**:
  - `GET /embed/:embedId/audio/status` beim Mount
  - Zeigt/versteckt Buttons basierend auf Server-Konfiguration

- **Widget Attribute für Audio**:
  - `data-enable-stt="true|false"` - STT-Mikrofon ein/ausschalten
  - `data-enable-tts="true|false"` - TTS-Lautsprecher ein/ausschalten
  - Default: beide `true` (wenn Server unterstützt)

### Technisch
- Neue Audio-Service-Funktionen in `chatService.js`:
  - `getAudioStatus()` - Prüft STT/TTS Verfügbarkeit
  - `transcribeAudio()` - STT via Server
  - `textToSpeech()` - TTS via Server
- Übersetzungen für DE/EN hinzugefügt

---

## [2.5.0] - 2024-12-03

### Hinzugefügt
- **Status-Emojis**: Visuelle Kursverfügbarkeit via System-Prompt (✅ frei, ❌ ausgebucht, ⚠️ eingeschränkt, 📞 Kontakt nötig)
- **Shadow DOM**: Widget ist jetzt CSS-isoliert von der Host-Website
- **Accent Color**: Neues Attribut `data-accent-color` für Brand-Farben (Links + Titel)
- **Responsive Layout**:
  - Mobile (<768px): 100% Fullscreen, keine Ecken
  - Tablet (768-1279px): 40% Breite, 77% Höhe
  - Desktop (≥1280px): 25% Breite, 77% Höhe
- **ATTRIBUTES.md**: Vollständige Dokumentation aller Script-Attribute
- **DEV_SETUP.md**: Anleitung für lokale Entwicklung mit Hot-Reload
- **Prompt Evaluation Framework**: Test-Suite für System-Prompt Regression-Tests (`tests/prompt-evaluation/`)

### Geändert
- **Tailwind px statt rem**: Alle Größen in festen px-Werten für konsistente Darstellung
- **z-index auf 9999**: Widget liegt immer über anderen Elementen
- **Welcome Bubbles**: Default auf `localStorage` (nur 1x pro Browser statt 1x pro Session)
- **Input-Feld**: Text/Cursor jetzt vertikal zentriert

### Entfernt
- **Reset-Link unten**: "Chat zurücksetzen" nur noch im Burger-Menü (cleaner)

### Technisch
- Shadow DOM `mode: "closed"` für maximale Isolation
- Responsive via Tailwind @media statt JavaScript
- Accent Color CSS dynamisch ins Shadow DOM injiziert

---

## [2.3.0] - 2024-11-XX

### Bestehende Features
- Embed Widget für Kunden-Websites
- Internationalisierung (i18n)
- Welcome Bubbles
- Burger-Menü (Reset, E-Mail, Session-ID)
- Markdown-Rendering für Bot-Antworten
- Streaming-Unterstützung
