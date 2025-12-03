# Changelog - AnythingLLM Embed Widget (Kufer Fork)

Alle wichtigen Änderungen am Embed Widget werden hier dokumentiert.

## Geplant (Roadmap)

### Status-Emojis für Kursverfügbarkeit
Einheitliche visuelle Darstellung der Kursverfügbarkeit durch Emoji-Normalisierung.

**Datenfluss-Architektur:**
```
Backend (Kunde)          Normalisierung           LLM/RAG              Frontend
─────────────────────────────────────────────────────────────────────────────────
"freie Plätze"     →                         →                    →
"noch buchbar"     →     status: "AVAILABLE" →  "✅ Plätze frei"  →  grün
"verfügbar"        →                         →                    →

"Warteliste"       →                         →                    →
"fast ausgebucht"  →     status: "WAITLIST"  →  "⚠️ Warteliste"   →  gelb
"wenige Plätze"    →                         →                    →

"ausgebucht"       →                         →                    →
"keine Plätze"     →     status: "FULL"      →  "❌ Ausgebucht"   →  rot
"belegt"           →                         →                    →
```

**Mapping-Tabelle:**

| Backend-Status (variiert je Kunde) | Normalisiert | LLM-Ausgabe |
|------------------------------------|--------------|-------------|
| "freie Plätze", "noch buchbar", "verfügbar" | `AVAILABLE` | ✅ Plätze frei |
| "Warteliste", "fast ausgebucht", "wenige Plätze" | `WAITLIST` | ⚠️ Warteliste |
| "ausgebucht", "keine Plätze", "belegt" | `FULL` | ❌ Ausgebucht |

**Umsetzung:**
1. Normalisierung beim Daten-Import (kundenspezifische Begriffe → Standard)
2. System-Prompt Anweisung für einheitliche Emoji-Ausgabe
3. Kompakt, barrierefrei, universal verständlich

---

## [2.4.0] - 2024-12-03

### Hinzugefügt
- **Shadow DOM**: Widget ist jetzt CSS-isoliert von der Host-Website
- **Accent Color**: Neues Attribut `data-accent-color` für Brand-Farben (Links + Titel)
- **Responsive Layout**:
  - Mobile (<768px): 100% Fullscreen, keine Ecken
  - Tablet (768-1279px): 40% Breite, 77% Höhe
  - Desktop (≥1280px): 25% Breite, 77% Höhe
- **ATTRIBUTES.md**: Vollständige Dokumentation aller Script-Attribute
- **DEV_SETUP.md**: Anleitung für lokale Entwicklung mit Hot-Reload

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
