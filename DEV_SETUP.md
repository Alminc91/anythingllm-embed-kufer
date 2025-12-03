# Lokale Entwicklung mit Hot-Reload (WSL2)

## Voraussetzungen

- Windows mit WSL2 (Ubuntu)
- Node.js 18+ in WSL2
- Git konfiguriert mit SSH-Key für GitHub
- Docker Hub Account (für Image Push)

## 1. Repos klonen (einmalig)

```bash
# In WSL2 Terminal
cd ~
mkdir -p dev && cd dev

# AnythingLLM Embed Widget
git clone git@github.com:Kufer-DE/anythingllm-embed.git
cd anythingllm-embed
npm install

# Haupt AnythingLLM (für build:publish)
cd ..
git clone git@github.com:Kufer-DE/anything-llm.git
```

## 2. Entwickeln mit Hot-Reload

```bash
cd ~/dev/anythingllm-embed

# Dev Server starten
npm run dev
```

**Output:**
```
[nodemon] watching path(s): src/**/*
[nodemon] starting `yarn run dev:preview`
Serving on http://localhost:3080
```

**Im Windows Browser öffnen:** `http://localhost:3080`

### Test-HTML erstellen

Erstelle `~/dev/anythingllm-embed/test.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Embed Test</title>
    <style>
        body { font-family: Arial; padding: 20px; }
        /* Test: Überschreibt das Widget diese Styles? */
        * { font-size: 10px !important; }
    </style>
</head>
<body>
    <h1>AnythingLLM Embed Test</h1>
    <p>Das Widget sollte unten rechts erscheinen.</p>

    <!-- Embed Widget -->
    <script
        data-embed-id="test-embed-id"
        data-base-api-url="https://DEINE-INSTANZ.ki.kufer.de/api/embed"
        src="http://localhost:3080/dist/anythingllm-chat-widget.min.js">
    </script>
</body>
</html>
```

Öffne `test.html` im Browser (Datei → Öffnen oder `file:///...`).

## 3. Code ändern

Bearbeite Dateien in `src/`:
- `src/App.jsx` - Hauptkomponente, Responsive Layout
- `src/main.jsx` - Shadow DOM Setup
- `src/components/` - UI Komponenten
- `tailwind.config.js` - Styles (px statt rem)

**Hot-Reload:** Nach dem Speichern automatisch neu gebaut!

## 4. Wenn fertig: Build & Publish

```bash
cd ~/dev/anythingllm-embed

# Build + kopiert nach anything-llm/frontend/public/embed
npm run build:publish
```

## 5. Commit & Push

```bash
# Embed Repo
cd ~/dev/anythingllm-embed
git add .
git commit -m "feat: Shadow DOM + px + Responsive"
git push

# Haupt Repo (enthält jetzt neue embed files)
cd ~/dev/anything-llm
git add frontend/public/embed/
git commit -m "feat: Updated embed widget"
git push
```

## 6. Auf Server deployen

```bash
# SSH zum Server
ssh srvadmin@server

# Code pullen
cd /home/srvadmin/KI_Apps_Pipelines/Apps/anything-llm
git pull

# Docker Image bauen
docker build -f docker/Dockerfile -t kufer/anythingllm-kufer:2.4 .

# Zu Docker Hub pushen
docker push kufer/anythingllm-kufer:2.4

# Container aktualisieren
docker compose pull
docker compose up -d
```

## Schnellreferenz

| Aufgabe | Befehl |
|---------|--------|
| Dev Server starten | `npm run dev` |
| Build erstellen | `npm run build` |
| Build + Publish | `npm run build:publish` |
| Nur CSS minifizieren | `npm run styles` |

## Ordnerstruktur

```
~/dev/
├── anythingllm-embed/          # Widget Source
│   ├── src/
│   │   ├── App.jsx             # Responsive Layout
│   │   ├── main.jsx            # Shadow DOM
│   │   └── components/
│   ├── dist/                   # Build Output
│   └── tailwind.config.js      # px statt rem
│
└── anything-llm/               # Haupt App
    └── frontend/
        └── public/
            └── embed/          # ← build:publish kopiert hierhin
                ├── anythingllm-chat-widget.min.js
                └── anythingllm-chat-widget.min.css
```

## Tipps

### Port ändern
```bash
# In package.json "dev:preview" Script
yarn serve . -p 3080  # ← Port hier ändern
```

### Browser Cache leeren
Nach Änderungen: `Strg+Shift+R` (Hard Reload)

### DevTools für Shadow DOM
1. F12 → Elements
2. Widget finden: `#anythingllm-embed-widget`
3. `#shadow-root (closed)` aufklappen

### Responsive testen
DevTools → Toggle Device Toolbar (Strg+Shift+M)
- Mobile: < 768px
- Tablet: 768-1024px
- Desktop: > 1024px
