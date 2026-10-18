# Party Games

Real-time multiplayer party games (Imposter, Traitor, Pictionary) played in phone browsers. One person creates a room and shares a link; friends join with a name. **Product rules live in `docs/SPEC.md` (its §7 decisions log is the source of truth for rule changes). Read it before working on any game logic.** Architecture decisions live in `docs/ARCHITECTURE.md`.

## How to work
- Act as a senior engineer and architect. Make technical decisions yourself and state them in a line. Ask me only about product or rule ambiguities not covered by the spec.
- Plan before large changes. Build one milestone at a time (milestones are in `docs/ARCHITECTURE.md`).
- Keep summaries short: what changed, and what I need to decide.
- Don't add dependencies without a one-line reason.

## Stack
- TypeScript everywhere, strict mode. pnpm workspaces monorepo.
- `apps/web`: React + Vite + Tailwind. Mobile-first.
- `apps/server`: Node + Socket.IO.
- `packages/shared`: socket event types, zod schemas, per-game view/action types, genre metadata. Imported by web and server; must contain no secrets.
- `packages/content`: genre word lists (difficulty-tagged JSON). **Server-only**; `apps/web` must never import it.
- Tests: Vitest.

## Commands
- `pnpm install`: install everything
- `pnpm dev`: run web + server
- `pnpm test`: run all tests
- `pnpm lint` / `pnpm typecheck`

## Architecture rules (non-negotiable)
1. **Server-authoritative.** All game state lives on the server. Clients send intents ("vote for X"), never state.
2. **Per-player views.** Each game exposes `getPlayerView(state, playerId)`, built field by field (never spread state). Only that view is sent to that player, after passing the game's strict zod `viewSchema`. Hiding things in the UI is not security.
3. **One way out.** Only `apps/server/src/transport/broadcaster.ts` may emit to sockets; only `transport/` may import socket.io (lint-enforced). Never emit game data to a Socket.IO room.
4. **Games are plugins.** Each game in `apps/server/src/games/<game>/` implements the shared `GameDefinition` interface (`setup`, `reduce`, `nextWakeup`, `getPlayerView`, `result`, `abort`, optional `stream`). They are pure: no I/O, no `Date`, no `Math.random` (use `ctx.now` / `ctx.rng`), no mutation. Rooms, lobby, reconnection, scheduling and voting are shared code. Never special-case a game inside room or transport code.
5. **Time lives in state.** Deadlines are stored in game state; the room scheduler wakes the game with a `tick`. Clients get deadline timestamps and only render countdowns. Discussion and turns are untimed: every waiting phase has either a deadline or a host action that moves it on.
6. **Validate every action:** zod-parse the payload, check `phaseSeq`, then the game checks phase, turn, target and `isHost`. Return `{ ok: false }` in the ack; never throw inside a room.
7. **Reconnection:** a session token in localStorage maps to the player. Rejoining restores their seat and view.
8. Socket event names and payloads are defined once in `packages/shared` and imported by both sides.

## Testing
- Game logic is pure functions and must have unit tests: role assignment, phase transitions, voting/ties, win conditions, host actions/end game, away handling, and visibility. Every game has a secret oracle and a leak test that runs `simulate` over many seeds and checks every player's payload at every step (ARCHITECTURE §8).
- Run `pnpm test` and `pnpm typecheck` before saying a task is done.

## Conventions
- Functional React components and hooks. Server state on the client comes from one socket store.
- Small files, named exports, no default exports.
- No `any`. Use zod to validate incoming socket payloads.

## Token hygiene
- Don't read `node_modules`, `dist`, `build`, `coverage` or lockfiles.
- Read only the files relevant to the task. Ask if unsure where something lives.