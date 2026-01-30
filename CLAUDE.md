# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the AnythingLLM Embedded Chat Widget - a submodule of the main AnythingLLM application that provides a customizable chat widget that can be embedded in websites via `<script>` or `<iframe>` tags. The widget connects to an AnythingLLM backend instance to provide AI-powered chat functionality.

## Development Commands

### Primary Development
- `yarn dev` - Start development server with live reload (builds and serves on port 3080)
- `yarn build` - Create production build with minification
- `yarn lint` - Format code with prettier

### Build Variations  
- `yarn dev:build` - Build for development without serving
- `yarn dev:preview` - Build and serve development version
- `yarn build:publish` - Build and copy files to main AnythingLLM frontend
- `yarn styles` - Compile and minify CSS only

### Translation Management
- `yarn verify:translations` - Check translation file consistency
- `yarn normalize:translations` - Normalize English translation keys

## Architecture

### Entry Point & Build Configuration
- **Entry**: `src/main.jsx` - Initializes React app and configures embed settings from script attributes
- **Build**: Vite configured to output UMD bundle as `anythingllm-chat-widget.js` with inlined assets
- **CSS**: TailwindCSS with `allm-` prefix to avoid conflicts with host site styles

### Core Structure
- **App Component** (`src/App.jsx`): Main application with positioning logic and chat window management
- **Chat System**: `src/components/ChatWindow/` contains the complete chat interface with history, input, and responses
- **State Management**: React hooks in `src/hooks/` handle chat history, session management, and embed settings
- **Services**: `src/models/chatService.js` manages API communication with AnythingLLM backend

### Key Components
- **OpenButton** (`src/components/OpenButton/`): Chat bubble button with customizable icons and welcome message popups
- **ChatWindow**: Full chat interface with header, message history, and input
- **Internationalization**: i18next integration with 20+ language support in `src/locales/`

### Styling & Customization
- All CSS classes prefixed with `allm-` to prevent conflicts
- Extensive customization via script data attributes (colors, positioning, behavior)
- Responsive design with mobile-first approach
- Custom CSS injection for animations and dynamic styling

### API Integration
- Communicates with AnythingLLM backend via `/api/embed` endpoints
- Session-based chat persistence with UUID generation
- Streaming response support using Server-Sent Events
- Configurable model parameters (temperature, prompt, model selection)

## Modified Files

Currently modified: `src/components/OpenButton/index.jsx` - Contains welcome message bubble functionality with German default messages.

## Coding Standards

### Datumsformatierung
Alle Zeitstempel müssen im deutschen Format angezeigt werden:
- **Format**: `DD.MM.YYYY, HH:MM:SS Uhr` (z.B. "23.04.2025, 12:30:57 Uhr")
- **Funktion**: Verwende `formatDate()` aus `src/utils/date.js` für das Embed-Widget
- **Beispiel**:
  ```javascript
  import { formatDate } from "@/utils/date";
  // Verwendung: formatDate(isoTimestamp)
  ```

### Icons für Kunden
- Icons müssen **quadratisch (1:1)** sein
- Empfohlene Größe: 256x256px
- Format: PNG mit Transparenz oder SVG
- Fallback: `object-fit: contain` verhindert Verzerrung bei nicht-quadratischen Icons

### Position-Attribut
Gültige Werte für `data-position`:
- `bottom-left`, `bottom-right`, `top-left`, `top-right`
- Ungültige Werte fallen automatisch auf `bottom-right` zurück

## Important Notes

- This is a submodule - main development happens in the parent AnythingLLM repository
- The widget is designed to be embedded as a standalone script with minimal dependencies
- Security consideration: Users cannot view context snippets, only chat responses
- Session management uses random UUIDs for user privacy
- CSS conflicts are prevented through prefixed class names (`allm-`)