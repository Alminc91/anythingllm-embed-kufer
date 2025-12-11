# Roadmap - AnythingLLM Embed Widget (Kufer Fork)

## Status-Legende
- ✅ Fertig
- 🔄 In Arbeit
- 📋 Geplant
- 💡 Idee

---

## Audio Features (STT/TTS)

### ✅ Speech-to-Text (STT) - v2.6.0
- [x] Mikrofon-Button im Chat-Input
- [x] MediaRecorder API für Audio-Aufnahme
- [x] Server-Endpoint `/embed/:embedId/audio/stt`
- [x] Groq Whisper Integration
- [x] Auto-Spracherkennung (kein Language-Parameter)
- [x] Widget-Attribut `data-enable-stt`

### ✅ Text-to-Speech (TTS) - v2.6.0
- [x] Speaker-Button bei Assistant-Nachrichten
- [x] Server-Endpoint `/embed/:embedId/audio/tts`
- [x] Piper/OpenAI-compatible TTS
- [x] In-Memory Audio-Caching
- [x] Widget-Attribut `data-enable-tts`
- [x] Widget-Attribut `data-tts-position` (bottom-right, icon-left)

### ✅ TTS Normalizer - v2.6.0 Server
- [x] Multilingual (30+ Sprachen)
- [x] Zahlen zu Wörtern (n2words)
- [x] Datumsformatierung (Intl.DateTimeFormat)
- [x] Abkürzungen expandieren
- [x] Kursnummern buchstabieren
- [x] Unicode-Spracherkennung (Arabisch, Hebräisch, etc.)

### 📋 Geplant: GPU-Beschleunigung
- [ ] Piper ONNX mit CUDA/ROCm
- [ ] Schnellere TTS-Generierung
- [ ] Batch-Processing für lange Texte

### 📋 Geplant: Chatterbox TTS
- [ ] Emotionalere, natürlichere Stimmen
- [ ] Voice Cloning möglich
- [ ] Höhere Audioqualität

### 💡 Idee: Streaming TTS
- [ ] Audio-Chunks während Generierung
- [ ] Schnellere erste Audio-Ausgabe
- [ ] WebSocket oder Chunked Response

### 💡 Idee: Persistentes Audio-Caching
- [ ] IndexedDB für Audio-Blobs
- [ ] Cache-Invalidierung nach Zeit
- [ ] Reduzierte Server-Last

---

## UI/UX

### ✅ Fertig - v2.7.0
- [x] TextArea ohne Springen
- [x] Mikrofon/Send-Button Alignment
- [x] Responsive Layout (Mobile/Tablet/Desktop)
- [x] Shadow DOM Isolation

### 📋 Geplant: TTS Normalizer Optimierung
- [ ] Kursdaten-spezifische Patterns
- [ ] Mehr Abkürzungen (VHS-spezifisch)
- [ ] Bessere Pausen bei Listen

---

## Server Features

### ✅ Fertig - v2.8.0
- [x] Embed Audio Endpoints
- [x] Audio-Format Auto-Detection (Magic Bytes)
- [x] Native FormData für Groq STT
- [x] Unicode-Spracherkennung

### 📋 Geplant
- [ ] Audio-Caching auf Server-Seite
- [ ] Rate-Limiting für Audio-Endpoints
- [ ] Audio-Qualität Konfiguration

---

## Dokumentation

### ✅ Fertig
- [x] ATTRIBUTES.md - Alle Widget-Attribute
- [x] CHANGELOG.md - Versions-Historie
- [x] DEV_SETUP.md - Entwickler-Anleitung

---

*Letzte Aktualisierung: 2024-12-11*
