# Party Games

Real-time multiplayer party games (Imposter, Traitor, Pictionary) played in phone browsers. One person creates a room and shares a link; friends join with a name. **Product rules live in `docs/SPEC.md`. Read it before working on any game logic.** Architecture decisions live in `docs/ARCHITECTURE.md`.

## How to work
- Act as a senior engineer and architect. Make technical decisions yourself and state them in a line. Ask me only about product or rule ambiguities not covered by the spec.
- Plan before large changes. Build one milestone at a time (milestones are in `docs/ARCHITECTURE.md`).
- Keep summaries short: what changed, and what I need to decide.
- Don't add dependencies without a one-line reason.

## Stack
- TypeScript everywhere, strict mode. pnpm workspaces monorepo.
- `apps/web`: React + Vite + Tailwind. Mobile-first.
- `apps/server`: Node + Socket.IO.
- `packages/shared`: socket event types, game state types, word packs.
- Tests: Vitest.

## Commands
- `pnpm install`: install everything
- `pnpm dev`: run web + server
- `pnpm test`: run all tests
- `pnpm lint` / `pnpm typecheck`

## Architecture rules (non-negotiable)
1. **Server-authoritative.** All game state lives on the server. Clients send intents ("vote for X"), never state.
2. **Per-player views.** Each game exposes `getPlayerView(state, playerId)`. Only that view is sent to that player. Never emit full state or other players' secrets. Hiding things in the UI is not security.
3. **Games are plugins.** Each game in `apps/server/src/games/<game>/` implements the shared `Game` interface (setup, phases, handleAction, getPlayerView, checkWin). Rooms, lobby, reconnection, timers and voting are shared code. Never special-case a game inside room logic.
4. **Server-side timers.** Send deadlines (timestamps); clients only render countdowns.
5. **Validate every action:** correct phase, player's turn, valid target. Reject with an error event; never throw inside a room.
6. **Reconnection:** a session token in localStorage maps to the player. Rejoining restores their seat and view.
7. Socket event names and payloads are defined once in `packages/shared` and imported by both sides.

## Testing
- Game logic is pure functions and must have unit tests: role assignment, phase transitions, voting/ties, win conditions, and visibility (assert that a player's view contains no secrets they shouldn't see).
- Run `pnpm test` and `pnpm typecheck` before saying a task is done.

## Conventions
- Functional React components and hooks. Server state on the client comes from one socket store.
- Small files, named exports, no default exports.
- No `any`. Use zod to validate incoming socket payloads.

## Token hygiene
- Don't read `node_modules`, `dist`, `build`, `coverage` or lockfiles.
- Read only the files relevant to the task. Ask if unsure where something lives.