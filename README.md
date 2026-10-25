# Party Games

Real-time multiplayer party games, played in phone browsers while sitting in the same room. One person creates a room and shares the link or QR code; everyone else joins with just a name. No app, no accounts.

**Play:** https://fun-games-6cdb.onrender.com

> The server is on Render's free plan and sleeps after ~15 minutes idle. The first visit after a break can take up to a minute to load.

## Games

| Game | Players | In short |
| --- | --- | --- |
| **Imposter** | 3–12 | Everyone gets a secret word except the imposter. Go round saying a linked word, then vote out whoever is bluffing. A caught imposter gets one guess at the word. |
| **Traitor** | 5–15 | Hidden traitors pick a victim each night; by day the group discusses and votes to evict. Civilians win by evicting every traitor. |
| **Pictionary** (offline mode) | 3–12 | Each round a random player gets a secret word and draws it on paper while everyone shouts guesses. The host reveals the word and moves on. No points. |

Words come from 10 genres (Bollywood and Hollywood movies, Bollywood songs, food, animals, places and more), each with Easy, Medium and Hard words.

Full rules are in [docs/SPEC.md](docs/SPEC.md).

## How it works

- **The server holds all game state.** Phones send intents ("vote for Ravi") and receive only their own view of the game. Secrets such as the word or someone's role are never sent to a phone that shouldn't see them. Every game has a leak test that plays hundreds of random games and checks every message.
- **Games are plugins.** Each game is a set of pure functions (`setup`, `reduce`, `getPlayerView`, …) with no I/O, clock or randomness of its own. Rooms, lobby, reconnection, timers and voting are shared code.
- **Reconnects are seamless.** A session token in the browser restores your seat after a refresh or a dropped connection.
- **Host controls:** pick the game and settings, start, end at any time, kick players, and hand an away player's seat to someone who rejoined.
- **Admin page** at `/admin` (when credentials are set): live rooms, maintenance mode, an announcement banner for every phone, and switches to release or hide each game.

Design decisions are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

TypeScript (strict) in a pnpm workspace:

| Package | What |
| --- | --- |
| `apps/web` | React + Vite + Tailwind, mobile-first |
| `apps/server` | Node + Socket.IO; serves the built web app too |
| `packages/shared` | Socket event types, zod schemas, per-game view and action types. Used by both sides; no secrets. |
| `packages/content` | Genre word lists. Server-only: the web app never imports it. |

Tests use Vitest.

## Getting started

Requires **Node 22+** and **pnpm** (`corepack enable` gives you the right version).

```bash
pnpm install
pnpm dev
```

This runs the web app on http://localhost:5173 and the server on port 3001. The dev server is reachable from phones on the same Wi-Fi: use the "Network" address Vite prints. Open a few browser tabs (or a normal and a private window) to play as several people.

### Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Web + server with hot reload |
| `pnpm test` | All tests |
| `pnpm typecheck` | TypeScript across every package |
| `pnpm lint` | ESLint, including the architecture boundaries |
| `pnpm build` | Production build of web and server |
| `pnpm start` | Run the production server (serves the built web app) |

### Configuration

The server reads these environment variables (all optional in development). For local use, put them in `apps/server/.env`, which is git-ignored.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP and Socket.IO port |
| `NODE_ENV` | | `production` serves the built web app and marks the admin cookie Secure (use an admin password of 12+ characters) |
| `RELEASED_GAMES` | every built game | Comma-separated games players can start, e.g. `imposter,traitor,pictionary`. Others show as "Coming soon". |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | unset | Both set = the admin page is on |
| `TRUST_PROXY` | `0` | Proxies in front of the server, so per-visitor limits use the real IP (Render: `1`) |
| `ALLOWED_ORIGIN` | unset | CORS origin for sockets, only needed if the web app is hosted on a different domain |
| `WEB_DIST` | `apps/web/dist` | Where the built web app is served from (production only) |

## Deployment

[render.yaml](render.yaml) is a Render Blueprint for the whole service: build, start, health check (`/health`), region and environment. Every push to `main` redeploys automatically.

- Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the Render dashboard, never in the file.
- Rooms live in memory on a single instance, so **a deploy ends any running games**. Avoid merging during a game night.
- After a deploy, phones that still have the old page open see "New version available. Tap to reload". Reloading keeps their seat.

## Contributing

- Product rules live in [docs/SPEC.md](docs/SPEC.md); its §7 decisions log is the source of truth for rule changes.
- Adding a game: follow the checklist in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §18. Every game needs unit tests and a leak test.
- Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before opening a PR.
