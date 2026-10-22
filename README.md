# TI4 Web - React + Vite + TypeScript

This is a Twilight Imperium 4 web application built with React, Vite, and TypeScript.

## Eigener lokaler Spielserver

Diese Variante verbindet Spielzustand, Login und Aktionen mit dem eigenen Java-Bot.
Es gibt keinen automatischen Rückfall auf den offiziellen AsyncTI4-Spielserver.

1. Den eigenen Java-Bot mit API auf `http://127.0.0.1:8081` starten.
2. `.env.example` nach `.env.local` kopieren. Eigene öffentliche Discord-OAuth-Client-ID
   in `VITE_DISCORD_CLIENT_ID` eintragen. Niemals ein Client-Secret in VITE-Variablen schreiben.
3. Im Discord-OAuth-Client `http://localhost:5173/login` als Redirect registrieren.
   Beim Java-Bot denselben Wert als `DISCORD_REDIRECT_URI` konfigurieren.
4. `npm ci` und `npm run dev` ausführen.
   Die Oberfläche über `http://localhost:5173` öffnen.

Entwicklung: `/bot/api` wird durch Vite an den eigenen Bot weitergeleitet.
Für Produktion ohne VITE-Overrides verwendet die App `/api` und `/ws` auf derselben
Domain. Der Reverse Proxy muss beide Pfade zum eigenen Java-Bot weiterleiten.
In der Produktion `VITE_API_URL` und `VITE_WEBSOCKET_URL` aus dem lokalen Beispiel
entfernen oder ausdrücklich auf das eigene Ziel setzen.

Das Panel **Deine Aktionen** lädt Angebote nur nach Anmeldung und Öffnen.
Es sendet ausschließlich das angebotene Aktionstoken und eine Request-ID.
Veraltete Angebote werden neu geladen. Angebotene Auswahllisten und Textformulare
können bestätigt werden; Anzahl, Pflichtfelder und Textlängen werden vor dem Senden
geprüft. Veraltete Formulare behalten ihre Eingaben und lassen sich ohne Absenden schließen.
Nicht unterstützte Interaktionen bleiben ausdrücklich offene Schritte.
Private Daten werden nicht auf die
öffentlichen Websocket-Themen geschrieben.

Der optionale Kartenindex `/maps.json` muss selbst bereitgestellt werden;
**Meine Spiele** verwendet die authentifizierte API des eigenen Bots.
Ein FoW-Bildanbieter wird nur genutzt, wenn `VITE_FROG_MAP_URL` ausdrücklich gesetzt ist.
Grafiken und statische Spieldaten bleiben von den Spielserver-URLs getrennt.
Ein erfolgreicher Build ersetzt keinen Nachweis mit einer echten Partie.

Prüfung: `node --test scripts/check-own-wrapper.mjs` kontrolliert eigene Endpunkte
und OAuth-State inklusive Ablauf und Wiederverwendung sowie Select-/Formulargrenzen.
`scripts/browser-own-wrapper.js` und `scripts/browser-components.js` sind
Playwright-CLI-Prüfabläufe mit abgefangenen lokalen HTTP-Testantworten für
das Aktionenpanel; diese Testantworten beweisen keinen echten Spielzug.

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and development server
- **TypeScript** - Type safety and better developer experience
- **Mantine** - UI component library
- **ESLint** - Code linting with TypeScript support

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type checking
npm run type-check

# Build for production
npm run build

# Preview production build
npm run preview
```

## Repository Structure

Dependencies point downward: `pages` → `layout` → `domains` → `shared`/`hooks` → `state` → `api` → `entities` → `utils`. `game-shell` composes the other domains; `cards` sits below them.

```
ti4_web_new/
├── public/                    # Static assets
│   ├── cardback/             # Card background images
│   ├── font/                 # Custom fonts
│   ├── leaders/              # Faction leader images
│   ├── planet_attributes/    # Planet trait icons
│   └── ...                   # Game assets (tokens, icons, etc.)
├── src/
│   ├── main.tsx             # Entry point and routes
│   ├── config.ts            # Environment config
│   ├── pages/               # Route-level pages (landing, games, dashboard, game map, image map)
│   ├── layout/              # Site chrome shared by pages (PageShell, SiteHeader, GamesBar)
│   ├── domains/             # Feature areas
│   │   ├── game-shell/      # In-game shell: layouts, sidebars, panels, event log
│   │   ├── map/             # Board rendering: tiles, layers, unit stacks, tooltips
│   │   ├── player/          # Player area cards and composition
│   │   ├── cards/           # Details cards, card backs and deck modals for every card type
│   │   ├── objectives/      # Scoring, public objectives, laws in play
│   │   ├── tabs/            # Game tab bar and tab management
│   │   ├── dashboard/ auth/ settings/ image-map/
│   ├── shared/ui/           # Reusable, domain-agnostic UI
│   ├── hooks/               # Generic hooks
│   ├── state/               # App settings store and game context provider
│   ├── api/                 # Fetching, sockets and auth session
│   ├── entities/            # Pure game model
│   │   ├── data/            # Static game data
│   │   ├── lookup/          # Map-backed getters over the data
│   │   ├── game/            # GameData types and buildGameContext
│   │   ├── geometry/        # Hex and tile geometry
│   │   ├── positioning/     # Unit placement on tiles
│   │   └── replay/          # Map replay planning
│   ├── styles/              # Global styles, themes, z-index variables
│   └── utils/               # Generic helpers
├── build/                   # Production build output
├── dist/                    # Vite build output
├── CLAUDE.md               # AI assistant coding guidelines
├── eslint.config.js        # ESLint configuration
├── postcss.config.cjs      # PostCSS configuration
├── tsconfig.json           # TypeScript configuration
├── tsconfig.app.json       # App-specific TypeScript config
├── tsconfig.node.json      # Node-specific TypeScript config
├── vite.config.ts          # Vite configuration
└── package.json            # Dependencies and scripts
```

## TypeScript Configuration

The project uses two TypeScript configurations:

- `tsconfig.json` - Main configuration for source code
- `tsconfig.node.json` - Configuration for build tools (Vite config, etc.)

### Key TypeScript Features Enabled

- Strict type checking
- Path mapping with `@/*` alias for `src/*`
- React JSX support
- JSON module resolution
- Unused variable detection

### Adding Types

- Game model types live in `src/entities/game/types.ts`; static data types in `src/entities/data/types.ts`
- Component-specific types should be defined in the same file or nearby
- Third-party library types are automatically included when available

## ESLint Configuration

ESLint is configured to work with both JavaScript and TypeScript files:

- JavaScript/JSX files: Standard React rules
- TypeScript/TSX files: Additional TypeScript-specific rules
- Automatic unused variable detection
- React hooks rules enforcement
