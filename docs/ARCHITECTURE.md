# Party Games: Architecture

This document covers how the system is built: its structure, protocol, interfaces and milestones. **Product rules** (what each game does) live in `docs/SPEC.md`. If the two disagree, the spec wins on behaviour and this file wins on structure. Flag any conflict instead of guessing.

> Status: approved plan for v1 · Last updated: 2026-10-18

---

## 1. Overview

```
 Phones (React SPA)                         Node server (single process)
 ┌──────────────────┐   Socket.IO           ┌──────────────────────────────────────────┐
 │ apps/web         │ ◄───────────────────► │ transport/  (the only code that touches   │
 │  socket/ store   │   intents  →          │              sockets)                     │
 │  screens/        │   ← room info         │   ├─ parse (zod) · rate-limit · identify  │
 │  games/<id>/     │   ← MY view only      │   └─ Broadcaster (the only emit path)     │
 └──────────────────┘                       │ rooms/      RoomManager → Room            │
                                            │              members, host, sessions,     │
                                            │              lifecycle, expiry            │
                                            │ engine/     GameRunner, Scheduler,        │
                                            │              StreamRelay, voting, rng     │
                                            │ games/      imposter · traitor ·          │
                                            │              pictionary (pure plugins)    │
                                            └──────────────────────────────────────────┘
```

**Core principle:** clients send **intents** ("I vote for Ravi"). The server validates each one, applies it to the authoritative state through a pure game reducer, and sends every player a **view** computed only for them. A secret that isn't in a player's view never reaches their device.

---

## 2. Key decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | TypeScript, pnpm workspaces monorepo | One language, and protocol and view types are shared by the client and server, so a protocol mismatch fails at compile time. |
| D2 | Socket.IO | It provides built-in auto-reconnect, acks (request/response over sockets) and a long-polling fallback for office networks that block WebSockets. Raw `ws` would mean building all of that ourselves. |
| D3 | Server-authoritative state, plus a separate view per player | This is the only model in which secrets can't leak through the network. Hiding data on the client is trivially cheatable. |
| D4 | Games are **pure reducer plugins** (`reduce(state, input, ctx) → state`) | They can be tested without sockets or real time, a game that throws can be rolled back for free, and adding a game doesn't change any room code. |
| D5 | **Time lives in state.** Each game reports its `nextWakeup(state)`, and one scheduler per room sends a `tick` input | This handles several concurrent deadlines (phase timer, Pictionary hints, Traitor's 15-second away rule) with one timer. Tests advance time by calling `reduce`, and no callback can fire against an old state. It replaces the old "one timer + `onExpire` string" design. |
| D6 | The server sends the **full view on every change** (no diffs), stamped with a `rev` | Views are small (under 2 KB). Full views make reconnection trivial and leave no diff logic to get wrong. Pictionary strokes are the one high-frequency exception (D7). |
| D7 | A generic **stream channel** (`game:stream`) that the plugin can opt into | Strokes need about 20 messages per second at low latency and are public data. They skip the reducer and go through a relay that the plugin authorizes. This is generic, so the gateway has no Pictionary-specific code (CLAUDE.md rule 3). |
| D8 | A **single emit chokepoint** (`Broadcaster`), enforced by lint | Leaks happen at emit sites. If one module can emit and it only accepts typed `RoomInfo` / `PlayerView` / addressed notices, a leak needs a type error plus a lint bypass. |
| D9 | Views are **validated at runtime against strict zod schemas** before they're sent | `.strict()` rejects unknown keys, so a stray `imposterId` added to a view fails closed in development, tests and production. |
| D10 | Word lists live in a **server-only** `packages/content`, organised by genre, with a difficulty tag on each word | Clients never need the word lists. Keeping them out saves bundle size and stops anyone reading candidate words in DevTools. Genre metadata (id, name, word counts per difficulty) is in `shared` for the lobby picker. Imposter and Pictionary share one `pickWords(genres, difficulty, n, rng)` function. |
| D18 | TypeScript pinned to **6.0.x** | typescript-eslint (which provides linting and the boundary rules) supports TypeScript below 6.1 only. Revisit when it supports TS 7. |
| D17 | **Host controls are game actions** with an `isHost` flag. Ending a game early is a generic room command | The game decides what Start vote, Next or End turn mean in its current phase, so the room code stays game-agnostic. Every game supports ending early the same way through `def.abort()`. |
| D11 | In-memory rooms, single process, synchronous dispatch per room | Node is single-threaded and each dispatch runs without awaiting, so there are no locks or races. Rooms are short-lived. Redis isn't needed until there's more than one instance. |
| D12 | Immutable state, deep-frozen in development and tests (no immer) | Mutations throw during tests, which keeps rollback correct. Hand-written spreads are fine at this state size, so we avoid a dependency. |
| D13 | React + Vite + Tailwind, `zustand` (one socket store), `wouter` (routing), `qrcode` (lobby QR) | Fast development, a small bundle, and each library does one job. Two routes don't justify React Router. |
| D14 | `node:http` + `sirv` serve the built SPA plus Socket.IO on one port | One deployable unit with persistent sockets and no framework that we'd barely use. |
| D15 | Deploy on Render, Railway or Fly.io (one instance) | They keep long-lived WebSockets open. Serverless platforms like Vercel can't. |
| D16 | IDs and tokens come from `node:crypto`. Game randomness comes from an injected `rng` (crypto-seeded in production, fixed seed in tests) | Unguessable tokens and deterministic tests, with no extra dependency. |

---

## 3. Repository layout

```
party-games/
├── CLAUDE.md
├── docs/  SPEC.md · ARCHITECTURE.md
├── package.json · pnpm-workspace.yaml · tsconfig.base.json (strict) · eslint.config.js
├── apps/
│   ├── server/src/
│   │   ├── index.ts                  # http + sirv + socket.io bootstrap, /health
│   │   ├── config.ts                 # env: PORT, ALLOWED_ORIGIN, NODE_ENV
│   │   ├── transport/                # ONLY place that imports socket.io
│   │   │   ├── gateway.ts            # binds events → room commands
│   │   │   ├── broadcaster.ts        # ONLY place that calls emit (lint-enforced)
│   │   │   ├── rateLimit.ts          # token bucket per socket
│   │   │   └── handlers/             # room.ts, lobby.ts, game.ts, chat.ts
│   │   ├── rooms/
│   │   │   ├── roomManager.ts        # code → Room, create/lookup/expiry sweep
│   │   │   ├── room.ts               # members, host, status, dispatch()
│   │   │   ├── members.ts            # join/leave/kick/presence/host transfer
│   │   │   ├── sessions.ts           # token ↔ playerId
│   │   │   └── codes.ts              # room code generation
│   │   ├── engine/
│   │   │   ├── game.ts               # GameDefinition interface (§6)
│   │   │   ├── runner.ts             # GameRunner: apply input, rollback, result
│   │   │   ├── scheduler.ts          # one wakeup timer per room
│   │   │   ├── streamRelay.ts        # generic stream buffer + relay (§7.4)
│   │   │   ├── voting.ts             # shared vote phase: live counts, 60s / all-voted close, evictions
│   │   │   ├── words.ts              # pickWords, normalizeGuess, isCloseGuess (Levenshtein ≤ 1)
│   │   │   ├── rng.ts                # seeded rng, shuffle, pickRandom
│   │   │   └── testing/              # simulate(), leakCheck(), fake clock
│   │   └── games/
│   │       ├── registry.ts           # GameId → GameDefinition
│   │       └── <imposter|traitor|pictionary>/
│   │           ├── index.ts          # the GameDefinition
│   │           ├── state.ts          # server-only state type
│   │           ├── reduce.ts         # phases + transitions
│   │           ├── views.ts          # getPlayerView (allow-list construction)
│   │           ├── result.ts         # GameResult
│   │           └── *.test.ts         # reducer, timeout, win, leak tests
│   └── web/src/
│       ├── main.tsx · App.tsx        # routes: "/" and "/r/:code"
│       ├── socket/                   # client.ts, store.ts (zustand), actions.ts, session.ts, clock.ts
│       ├── screens/                  # Landing, JoinForm, Lobby, Waiting, Results, Ended
│       ├── games/<id>/               # GameScreen.tsx + phase components
│       │   └── pictionary/           # Canvas, Toolbar, GuessInput, strokeRenderer.ts
│       └── ui/                       # Button, Countdown, PlayerList, VotePanel, RoleCard (hold-to-reveal)
└── packages/
    ├── shared/src/                   # imported by web AND server: no secrets, no word lists
    │   ├── protocol/
    │   │   ├── events.ts             # event names + payload/ack types (§7)
    │   │   ├── schemas.ts            # zod schemas for every client → server payload
    │   │   └── errors.ts             # ErrorCode enum
    │   ├── types.ts                  # PlayerId, GameId, RoomInfo, MemberInfo, GameResult
    │   ├── games/<id>.ts             # Settings, Action, PlayerView (+ zod schemas), Notice
    │   └── genres.ts                 # genre metadata only: { id, name, counts: { easy, medium, hard } }
    └── content/                      # server-only (web must not depend on it)
        └── genres/<id>.json          # { id, name, easy[], medium[], hard[] }; validated by zod at boot
```

**Boundary rules (lint-enforced):** `apps/web` must not import `packages/content`. Only `transport/` may import `socket.io`. Only `transport/broadcaster.ts` may call `.emit` or `.to(`. `games/` must not import `rooms/`, `transport/`, `Date`, or `Math.random`.

---

## 4. Domain model

```ts
// packages/shared/src/types.ts
type PlayerId = string;                         // crypto.randomUUID(), unrelated to role or seat
type GameId = 'imposter' | 'traitor' | 'pictionary';

interface MemberInfo {                          // public
  id: PlayerId;
  name: string;
  isHost: boolean;
  presence: 'online' | 'away' | 'left';         // left = kicked/left mid-game, kept for results
  seat: 'playing' | 'waiting';                  // waiting = joined during a game
  joinedAt: number;
}

interface RoomInfo {                            // public, sent to everyone in the room
  rev: number;
  code: string;
  status: 'lobby' | 'playing' | 'results';
  members: MemberInfo[];
  gameId: GameId;
  settings: GameSettings[GameId];
  chatEnabled: boolean;
  startBlockedReason: string | null;            // "Need 2 more players"
  result: GameResult | null;                    // only when status = 'results'
  expiresAt: number;
}
```

On the server, a `Room` also holds: `sessions: Map<tokenHash, PlayerId>`, `game: { def, state, streamBuffer } | null`, its scheduler handle, and timestamps for expiry. `Room` is socket-agnostic: the transport layer's `SocketRegistry` maps (room, player) to the one live socket and calls `room.attach` / `room.detach`, and the room reports changes through hooks. Fields marked for later milestones (`settings`, `chatEnabled`, `result`) are added to `RoomInfo` when they're built. `RoomInfo` is built by one function (`toRoomInfo(room)`) that never reads `room.game.state`.

---

## 5. Room lifecycle

### 5.1 Room states

```
  room:create ──► LOBBY ──game:start──► PLAYING ──result(state) ≠ null──► RESULTS
                    ▲  ▲                                                   │  │
                    │  └──────────────── results:toLobby ──────────────────┘  │
                    │                    results:playAgain ──► PLAYING ◄──────┘
                    │
  any state ──room:close (host) / expiry──► CLOSED (room deleted, all sockets get session:ended)
```

| Transition | Guard | Effect |
| --- | --- | --- |
| `game:start` | host; status `lobby`; `min ≤ playing-eligible members ≤ max`; settings valid for this count | All non-`left` members become `seat: 'playing'`. `setup()` runs, the scheduler is armed, and views are sent. |
| game ends | `def.result(state)` returns non-null after any input | `status = 'results'`, `result` stored in RoomInfo, scheduler cleared, stream buffer dropped. |
| `game:end` | host; status `playing` | `result = def.abort(state)` (every role revealed, `winner: null`, `endedBy: 'host'`), then the same as "game ends". |
| `results:playAgain` | host | Same game and settings with every current non-`left` member, including former waiting players. `left` members are removed. |
| `results:toLobby` | host | `status = 'lobby'`, game dropped, `left` members removed, waiting players promoted. |
| `room:close` | host | All members get `session:ended {reason: 'closed'}`. Tokens are revoked and the room is deleted. |
| expiry | sweep every 60s | Deleted if no member has been online for 30 minutes, or the room is more than 3 hours old. |

Settings are revalidated whenever the member count changes. If a setting becomes invalid (for example 2 imposters with fewer than 8 players), it's clamped to the nearest valid value, and `startBlockedReason` explains anything that still blocks the start.

### 5.2 Member lifecycle

```
  join ─► ONLINE ◄──resume──► (disconnect + 5s grace) AWAY
            │                                        │
            └─ leave / kick ─► lobby: removed;  in game: LEFT (permanently away, seat kept until results)
```

- **Joining during a game** is allowed. The spec's "blocked" means the player can't enter the current game. They become `seat: 'waiting'`, see a Waiting screen (game name, player list, "You'll join the next game"), receive `room:state` but no `game:view`, and are included in the next game.
- **Names:** trimmed, 1–16 characters, unique within the room (case-insensitive) among all non-`left` members. `left` names are freed.
- **Room cap:** 15 members including waiting players. A join beyond that gets `ROOM_FULL`.
- **Presence goes to the game as an input** (`{kind: 'presence'}`), and each game applies its own away rules (§8).
- **Host transfer:** if the host has been `away` for 60s, the host role passes to the online member with the earliest `joinedAt`. If the host leaves or is kicked, the transfer happens immediately. The old host doesn't get the role back on return.
- **Kick:** the host can kick in the lobby or mid-game, but not themselves. The token is revoked, the socket gets `session:ended {reason: 'kicked'}`, and during a game the player is treated as `left`.
- **Seat reassign (a player lost their token):** the player rejoins under a new name as a waiting member. The host taps an `away`/`left` player and chooses "Give this seat to <new>". The server moves the old `PlayerId`'s seat to the new socket. The waiting member record is deleted and the new token maps to the **old** PlayerId, so game state needs no change. The seat keeps its original display name, so the game and the room list stay consistent.

---

## 6. Game plugin interface

```ts
// apps/server/src/engine/game.ts
interface GameContext {
  now: number;                 // injected: Date.now() in prod, fake clock in tests
  rng: () => number;           // injected: seeded in tests
}

interface Phase<Name extends string> {
  name: Name;
  seq: number;                 // +1 on every phase change; guards stale actions
  deadline: number | null;     // epoch ms; sent to clients for countdowns
}

interface BaseState { phase: Phase<string>; }

interface SetupInput<Cfg> {
  players: { id: PlayerId; name: string; online: boolean }[];  // seat order
  settings: Cfg;
  moderator: PlayerId | null;  // the host, when settings.hostModerates(cfg); never in `players`
  chatEnabled: boolean;        // optional remote-play chat (M5)
}

type GameInput<A> =
  | { kind: 'action'; by: PlayerId; isHost: boolean; action: A } // host-only actions: startVote, continue, skipTurn…
  | { kind: 'presence'; playerId: PlayerId; online: boolean }
  | { kind: 'left'; playerId: PlayerId }             // kicked / left: permanent
  | { kind: 'tick' };                                // ctx.now passed nextWakeup()

type Addressed<N> = { to: 'all' | PlayerId[]; notice: N };   // "So close!" → [guesser]

type Step<S, N> =
  | { ok: true; state: S; notices?: Addressed<N>[] }   // notices arrive with Pictionary (M4); Imposter needs none
  | { ok: false; error: GameErrorCode };             // NOT_YOUR_TURN, WRONG_PHASE, INVALID_TARGET…

interface GameDefinition<S extends BaseState, A, V extends BaseView, Cfg, N> {
  id: GameId;
  minPlayers: number;
  maxPlayers: number;

  settings: {
    schema: ZodType<Cfg>;
    defaults(playerCount: number): Cfg;
    clamp(cfg: Cfg, playerCount: number): Cfg;              // after member-count changes
    validate(cfg: Cfg, playerCount: number): string | null; // human-readable reason
    update?(prev: Cfg, raw: unknown): Result<Cfg>;          // host change merged with current (keeps secrets)
    toPublic?(cfg: Cfg): PublicCfg;                         // what RoomInfo carries (secrets stripped)
    hostModerates?(cfg: Cfg): boolean;                      // host runs the game, isn't a player
    forgetSecrets?(cfg: Cfg): Cfg;                          // after a game, or when the host changes
  };
  actionSchema: ZodType<A>;      // zod for game:action payloads (shared package)
  viewSchema: ZodType<V>;        // strict union of every role's view (shared package)

  setup(input: SetupInput<Cfg>, ctx: GameContext): S;
  reduce(state: S, input: GameInput<A>, ctx: GameContext): Step<S, N>;
  nextWakeup(state: S): number | null;   // earliest pending deadline of any kind
  getPlayerView(state: S, viewer: PlayerId): V;
  result(state: S): GameResult | null;   // non-null ⇒ game over
  abort(state: S): GameResult;           // host ended early: all roles revealed, winner: null

  stream?: {                             // opt-in high-frequency public channel (§7.4)
    schema: ZodType<StreamOp>;
    canSend(state: S, by: PlayerId): boolean;
    channelKey(state: S): number | null; // buffer resets when this changes (e.g. turn #)
  };
}

interface BaseView {
  phase: string;
  phaseSeq: number;
  deadline: number | null;
  you: { id: PlayerId; status: 'alive' | 'spectator' };
}
```

**The contract every plugin must follow:**
1. **Pure and total.** No I/O, no `Date`, no `Math.random`, and no mutation of its input (deep-freeze catches this in tests). Invalid input returns `{ok: false}`; it must never throw. If it throws anyway, the runner rolls back (§6.1).
2. **Time is in state.** Every deadline the game cares about (vote deadline, last-chance guess, Traitor night cap, traitor away cutoff) is stored in state. `nextWakeup` returns the minimum, and on `tick` the game handles every deadline `≤ ctx.now`, possibly several.
3. **Phases never stall.** Discussion and turns are **untimed** (SPEC §3). Every phase that waits on someone has either a deadline with a defined timeout outcome (vote, last-chance guess, Traitor night cap) or a host action that moves it on (Start voting, Continue, Skip turn, End turn, Next turn). Away players are skipped automatically wherever a turn would wait on them. The host can always end the game as a last resort.
4. **Views are allow-lists.** `getPlayerView` builds a fresh object field by field. It never spreads or copies state (`...state`, `...player`). See §8.
5. **Results are the only reveal-all.** `result()` contains all roles, the word and scores, and the runner only reads it once the game is over.

### 6.1 GameRunner (shared, game-agnostic)

```
dispatch(input):
  1. if input is an action:
       zod-parse with def.actionSchema; check client phaseSeq == state.phase.seq (else STALE_PHASE)
  2. step = try def.reduce(state, input, ctx) catch → log, keep old state, return INTERNAL
  3. if !step.ok → ack error to sender only; nothing else changes
  4. state = step.state; room.rev++
  5. if def.result(state) → room → RESULTS (§5.1)
     else scheduler.arm(def.nextWakeup(state))
  6. broadcaster.flush(room, step.notices)  ← coalesced once per microtask
```

**Scheduler:** one `setTimeout` per room, re-armed after every step to `nextWakeup`. When it fires, it dispatches `{kind: 'tick'}`. Each arm carries an epoch number, so a stale callback is a no-op. Ticks that fire early or late are harmless because the game compares deadlines with `ctx.now`.

**Shared helpers** that plugins use, implemented once with their own tests:
- `voting.ts` implements SPEC's *Shared: voting* once for Imposter and Traitor. `openVote(eligible, now)` sets a 60s deadline; `castVote` allows changing the vote and no self-votes; `isComplete` is true when every eligible *online* player has voted (this closes the vote immediately); `liveCounts` returns `{ counts: Record<candidateId | 'skip', number>, voted, total }` (**counts only, never voter→target pairs**); and `tally` returns `{ outcome: {kind: 'out', id} | {kind: 'none', reason: 'tie' | 'skip'}, counts, ballots }`, where `ballots` (who voted for whom) appears only in the result view. Missing and away votes count as skip. Eligible means living, not evicted.
- `words.ts`: `pickWords(genres, difficulty, n, rng, exclude)` (no repeats within a game), `normalizeGuess` (lowercase, trim, collapse spaces) and `isCloseGuess` (Levenshtein distance 1 on the normalised strings, about 15 lines, no dependency).
- `rng.ts`: `shuffle` and `pickRandom`.

---

## 7. Socket protocol

All names, payloads and ack types are defined once in `packages/shared/src/protocol/` and imported by both sides. Every client → server payload is zod-parsed before anything else runs.

### 7.1 Conventions
- **Identity comes from the socket, not the payload.** `socket.data = { roomCode, playerId }` is set by create/join/resume. No client event carries a `playerId` that means "me", and no event can request another player's view.
- **One socket, one membership.** A resume for a player who already has a live socket **replaces** it: the old socket gets `session:ended {reason: 'replaced'}` and is disconnected. This covers a second tab or a stale phone tab.
- **Acks:** every client → server event except `game:stream` and `chat:send` acks with `{ ok: true, data? } | { ok: false, error: { code: ErrorCode, message } }`.
- **Ordering:** `room:state` and `game:view` carry the room `rev`. The client drops anything older than what it has.
- **Stale guard:** `game:action` carries the `phaseSeq` the client was looking at. A vote tapped as the phase changed gets `STALE_PHASE`, which the client ignores silently.

### 7.2 Client → Server

| Event | Payload | Who | Ack data / notes |
| --- | --- | --- | --- |
| `time:sync` | `{}` | anyone | `{ serverNow }`, sent on every (re)connect for clock offset |
| `room:create` | `{ name, gameId }` | anyone | `{ code, playerId, sessionToken }` |
| `room:join` | `{ code, name }` | anyone | `{ playerId, sessionToken }`. Errors: `ROOM_NOT_FOUND`, `NAME_TAKEN`, `ROOM_FULL` |
| `room:resume` | `{ code, sessionToken }` | anyone | `{ playerId }`, then state is pushed (§9). Errors: `SESSION_INVALID` |
| `room:leave` | `{}` | member | |
| `room:close` | `{}` | host | |
| `lobby:setGame` | `{ gameId }` | host | Settings reset to that game's defaults |
| `lobby:setSettings` | `{ settings }` | host | Validated by `def.settings.schema` and `validate()` |
| `lobby:setChat` | `{ enabled }` | host | Lobby only |
| `lobby:kick` | `{ playerId }` | host | Any status (§5.2) |
| `host:reassignSeat` | `{ fromPlayerId, toPlayerId }` | host | `from` must be away/left and playing; `to` must be waiting |
| `game:start` | `{}` | host | |
| `game:action` | `{ phaseSeq, action }` | playing member | `action` is parsed by the game's `actionSchema`. Host-only actions (`startVote`, `continue`, `skipTurn`, `endTurn`, `nextTurn`) go through here too, and the game checks `isHost`. The ack may carry a **private** result (e.g. a guess result: `'correct' \| 'close' \| 'wrong'`) |
| `game:end` | `{}` | host | Ends the game early through `def.abort()` (§5.1) |
| `game:stream` | `{ channelKey, op }` | playing member | No ack. Dropped unless `def.stream.canSend` |
| `results:playAgain` · `results:toLobby` | `{}` | host | |
| `chat:send` | `{ text }` (1–200 characters) | member | Only when `chatEnabled` |

### 7.3 Server → Client

| Event | Payload | Sent to |
| --- | --- | --- |
| `room:state` | `RoomInfo` | Every member's socket. It contains no game state |
| `game:view` | `{ rev, view: PlayerView }` | **Each playing member's own socket, individually** |
| `game:notice` | `{ notice }` | Exactly the sockets in the notice's `to` list |
| `game:stream` | `{ channelKey, op }` | Every member except the sender |
| `game:streamReset` | `{ channelKey, ops }` | One socket, on resume or join mid-turn |
| `chat:message` | `{ from, text, at }` | Every member |
| `session:ended` | `{ reason: 'kicked' \| 'closed' \| 'expired' \| 'replaced' }` | One socket, which is then disconnected |

The game result is delivered inside `room:state` (`status: 'results'`, `result`), so there is no separate `game:over` event, and reconnecting players on the results screen get it for free.

### 7.4 The stream channel (Pictionary strokes)

```ts
type StreamOp =
  | { t: 'seg'; strokeId: string; color: number; size: 0 | 1 | 2; pts: [number, number][] } // 0–1 normalised, ≤ 64 pts
  | { t: 'undo'; strokeId: string }
  | { t: 'clear' };
```

- The drawer's client batches points every ~50ms and sends `game:stream`.
- `StreamRelay` checks `def.stream.canSend(state, by)` and that `channelKey` matches the current `def.stream.channelKey(state)`. It appends the op to the room's buffer and relays it to everyone else. The reducer isn't involved, so there's no state copy or view rebuild at 20 Hz.
- When `channelKey` changes (a new turn), the buffer is cleared. Clients clear the canvas when they see a new key in their view.
- **Limits:** 40 ops per second per socket, 64 points per op, and 20,000 points per buffer. Excess ops are dropped. Coordinates are clamped to 0–1.
- **Late joiners and reconnects** get `game:streamReset` with the buffer compacted (undone strokes removed, everything before the last `clear` removed).
- Strokes are public by definition (everyone sees the drawing), so the relay can't leak a secret. The word never goes through it.

---

## 8. Per-player secret state: how it's enforced

The rule from the spec: *if it's in the network payload, it counts as visible.* Enforcement is layered so that no single mistake leaks anything.

**Layer 1: one way out (structural).** `Broadcaster` is the only module allowed to emit, and ESLint fails on `.emit(` or `.to(` anywhere else in the server. Its API accepts only:
- `roomState(room)`, which builds `RoomInfo` through `toRoomInfo()`. That function has no access to `game.state`.
- `view(member, view)`, which goes to one member's socket ID and never to a Socket.IO room.
- `notices(room, addressed[])`. Every notice must carry an explicit audience.
- `stream(room, except, op)` for public stream ops only.

There is no "emit to room with a game payload" function to misuse.

**Layer 2: views are allow-lists (by construction).** `getPlayerView(state, viewer)` builds each field explicitly from what *that viewer* may know. Secrets are guarded by role checks inside the view function (e.g. `word: isCrewmate || phase === 'reveal' ? state.word : null`). Spreading state or player records into a view is banned by code review and caught by Layer 3.

**Layer 3: strict runtime schemas (fail closed).** Every view is parsed against the game's `.strict()` zod `viewSchema` before it's sent. The schema is a discriminated union per role (e.g. `ImposterView = CrewmateView | ImposterRoleView`), so the imposter's variant has **no `word` key at all**, not even an optional one. An unknown or disallowed field throws in development and tests. In production, that view is not sent, the error is logged, and the player keeps their previous view. A frozen screen is better than a leak.

**Layer 4: leak tests (automated proof).** `engine/testing/leakCheck.ts` provides:
- `simulate(def, seed, players)` plays full random games with a fake clock: random legal actions, random timeouts, disconnects and reconnects.
- At **every step, for every player**, the test serialises everything that player would receive (`JSON.stringify` of the view plus notices addressed to them) and runs the game's **secret oracle**, `secretsFor(state, viewer): { forbiddenStrings: string[]; check(view): string | null }`. For example:
  - Imposter: a crewmate's payload never contains the imposter IDs in any role-bearing field. An imposter's payload never contains the word before reveal (string search on the serialised payload).
  - Traitor: a civilian's payload never has another player's role or night picks. A traitor's payload has the other traitors' identities but no civilian's role field. Who voted for whom never appears before the result (only per-name counts).
  - Pictionary: word options appear only for the drawer. The word appears only for the drawer and for guessers who have already guessed it. Correct guess text never reaches anyone.
- This runs over 200 seeds per game in CI.
- **Integration (the real wire):** a socket test connects clients with `socket.io-client`, records every raw incoming frame per client, plays a scripted game and runs the same oracle on the raw frames.

**Layer 5: side channels (rules the views must follow).**
- **Votes in progress:** views contain only per-name counts plus `{voted, total}` (SPEC decision: live counts are public). They never contain voter→target pairs, so a phone shows *how many* voted for Ravi but not *who*; the ballots appear only in the result phase view. The player's own current vote is in their own view only.
- **Traitor night:** every living player gets a view with the same phase name and the same safety-cap deadline. The night ends early when the traitors agree (SPEC decision). That ending tells everyone the traitors agreed, but not who they are, so it's an accepted, identity-free signal. Picks and lock status are only in traitors' views. The web app renders the same full-screen night layout for both roles, so a civilian screen looks the same as a traitor screen to someone watching.
- **Dead players (Traitor spectators)** get civilian-level information only. They don't learn the traitors, so they can't hint out loud.
- **Pictionary guesses:** a guess goes in a `game:action`, and the result comes back **only in the sender's ack**. Others get `{to: 'all', notice: 'guessed', name}`. Close guesses are notified to the guesser only. Guesses never go through chat.
- **Identifiers carry no information:** PlayerIds are random UUIDs, seat order is shuffled independently of role assignment, and roles are assigned by `rng` after seats are fixed.
- **Tokens:** session tokens appear only in the create/join ack to their owner. The server stores a SHA-256 hash, and tokens never appear in RoomInfo, logs or errors.
- **Client store:** the zustand store holds only what the server sent, so nothing beyond the player's own view is ever present.

---

## 9. Reconnection

1. On create/join, the server returns `sessionToken` (32 random bytes, base64url). The client stores `{ playerId, sessionToken }` in localStorage under `pg:session:<CODE>`.
2. When `/r/:code` opens, if a stored session exists, the client connects, sends `time:sync` and `room:resume` **before** showing the name form. If resume fails with `SESSION_INVALID`, it deletes the entry and shows the join form.
3. On a successful resume, the server binds the socket (replacing any old one), sets presence to `online` (dispatching `presence` to the game if one is running), and pushes `room:state`, `game:view` (if playing) and `game:streamReset` (if a stream channel is active).
4. Socket.IO auto-reconnects through network blips. Each `connect` event repeats step 2 automatically. The UI shows a "Reconnecting…" bar while it's disconnected.
5. A disconnect starts a **5-second grace period**. If the player comes back within it, nothing is broadcast. After it, presence becomes `away` and the game gets `{kind: 'presence', online: false}`.
6. A player who lost their token gets their seat back through host seat reassignment (§5.2).

---

## 10. Timers and clock

- Deadlines are absolute epoch milliseconds from the server clock and are stored in state (D5).
- The client computes `offset = serverNow − (sentAt + rtt/2)` from `time:sync` and renders `deadline − (Date.now() + offset)`. Countdowns are display only, and clients never decide when time runs out.
- Remaining time is computed from deadlines, so a phone waking from sleep shows the correct time straight away.

---

## 11. Game designs (state and visibility)

Behaviour follows SPEC §3 and the SPEC decisions log. Phases marked ⏱ have a deadline; every other phase is untimed and moved on by a player or host action (`[host]` = host-only action). Away handling is listed for each game.

### 11.1 Imposter
- **Phases:** `discussion → vote ⏱60s (or all voted) → result → lastGuess ⏱30s? → (discussion of next round | over)`.
- **Server state:** `word`, `wordGenreId`, `imposterIds`, `evicted`, `vote`, `lastResult`, `round`, `maxRounds`, `lastGuess`.
- **Discussion:** no app turns; the group goes round robin out loud. `[host] startVote` opens the shared vote (§6.1).
- **Vote:** `vote(targetId | 'skip')` from any eligible player, changeable until the vote closes. Every vote change rebroadcasts views, so live counts update on every screen.
- **Result:** the final counts, ballots, and the outcome (`imposterCaught` / `innocentEvicted` / `nobody`) with the evicted player's role. If an imposter was caught, the next phase is `lastGuess`. Otherwise `[host] continue` checks the win conditions and starts the next round with the same word.
- **Custom word:** settings carry a secret `customWord`. `toPublic` swaps it for `customWordSet`, `update` keeps it when the host omits it, and `hostModerates` makes the host a moderator: excluded from `players`, the player count and the vote, with a `role: 'moderator'` view (word + genre, no roles). `forgetSecrets` clears it after the game and on host change.
- **Views:** a crewmate gets `word` and `genre` (null for a custom word). An imposter gets `role: 'imposter'` and `genre` only on Easy (otherwise null), plus `fellowImposters` when there are 2 imposters. Everyone gets the public player list (with evicted marks), live vote counts during the vote, and revealed evictions with their roles.
- **Away:** an away player's vote counts as skip. An away imposter at `lastGuess` fails when the deadline passes.

### 11.2 Traitor
- **Phases:** `night ⏱60s cap → morning → day → vote ⏱60s → voteReveal → (night | over)`.
- **Server state:** `roles`, `evicted`, `nightPicks: Map<traitorId, {target, locked}>`, `awaySince`, `vote`, `lastVictim`, `lastEvicted`, settings.
- **Night:** a traitor can `pick(target)` (a living civilian) and `lock()` / `unlock()`. After every input, including `tick`, the game checks for unanimity. When every *eligible* traitor has locked the same target, the night ends immediately and that target is killed. At the 60s cap, the night ends with no kill. **Eligible** means a living traitor who hasn't been away for 15 seconds or more. The 15-second cutoff is a stored deadline (`awaySince + 15s`), so it's rechecked on `tick`. If no traitor is eligible, the night waits for the cap.
- **Morning:** `[host] continue` moves to `day`. **Day:** `[host] startVote` opens the shared vote. **voteReveal:** `[host] continue` checks the win conditions, then starts the next `night`.
- **Views:** a civilian gets `role: 'civilian'` and nothing else private. A traitor gets `fellowTraitors` and, at night only, the live `nightPicks` (with lock status) of the other traitors. Spectators (evicted players) get civilian-level views (§8).
- **Win** is checked after `morning` and after `voteReveal`.
- **Away:** an away player's vote counts as skip, and the night eligibility rule above applies.

### 11.3 Pictionary
- **Phases:** `choosing → drawing → turnEnd → (choosing | over)`. There are no deadlines at all, so `nextWakeup` returns `null`.
- **Server state:** `turnOrder` (rounds × players, shuffled per round), `turnIndex`, `options` (3 words from `pickWords`, each with its genre), `word`, `revealedIdx`, `guessed: Set<id>`, `scores`, `usedWords`.
- **Actions:** `choose(i)` by the drawer; `revealLetter()` by the drawer (max 2 per word, random unrevealed letter that isn't a space); `guess(text)` by a guesser who hasn't guessed yet; `award(playerId)` by the drawer; `endTurn()` by the drawer or `[host]`; `[host] skipTurn` while choosing; `[host] next` at `turnEnd`.
- **Scoring:** a correct guess or award gives the guesser +100 and the drawer +25.
- **Turn end:** the turn ends when every *online* guesser has guessed, or on `endTurn`. If the drawer goes away during `choosing` or `drawing`, the turn ends immediately and points already earned are kept. An away drawer's future turns are skipped.
- **Views:** the drawer gets `options` (while choosing) and `word`. A guesser gets `genre`, `hint` (blanks plus revealed letters) and, after guessing correctly, `word`. Everyone gets scores, who has guessed, and `channelKey`.

---

## 12. Frontend

- **Routes:** `/` (create, or join with a code) and `/r/:code`. Everything under `/r/:code` is `screen = f(room.status, mySeat, view.phase)`: join form, lobby, waiting, game, results or ended.
- **State:** one zustand store holds `{ connection, clockOffset, room, view, streamOps }`. Components call `socket/actions.ts` and never call the socket directly. Actions return the ack, so the UI can show the error, close, or wrong-guess feedback.
- **Game UI:** each `games/<id>/GameScreen.tsx` switches on `view.phase`. Views are typed by the shared discriminated unions, so role-specific UI is checked exhaustively.
- **Mobile-first:** minimum width 360px, tap targets of 44px or more, and a bottom-anchored primary action. Secret words appear on a **hold-to-reveal RoleCard** so neighbours can't peek.
- **Canvas:** fixed 1:1 aspect ratio, pointer events, and points normalised to 0–1. Rendering is incremental from stream ops, with a full redraw only on `undo`/`clear`/`streamReset`.
- **Share:** a Copy button, `navigator.share` when available, and a QR code (`qrcode` library) of the room URL.

---

## 13. Security and robustness

- zod parses every inbound payload. Unknown events are ignored, and a bad payload gets `BAD_REQUEST`.
- Authorization order: the socket must be bound to a member of this room; host-only events require the current host; the game then checks phase, turn and target.
- **Rate limits** use a token bucket per socket: 20 events per second in general, 40 per second for `game:stream`, and 1 per second for `chat:send`. Excess events are dropped. Room creation is limited to 5 per minute per IP.
- **Fault isolation:** each room's dispatch is wrapped in try/catch. If something throws, the state rolls back, the event is logged with the room code (no names), and the sender gets `INTERNAL`. One bad room never takes down the process. `process.on('unhandledRejection')` logs the error without exiting.
- **Rendering:** React escapes all text. `dangerouslySetInnerHTML` is banned by lint.
- CORS and the Socket.IO `cors.origin` are limited to `ALLOWED_ORIGIN`.
- **Privacy:** only display names are stored, in memory, for the room's lifetime. There's no analytics, and logs contain no names or tokens.

---

## 13a. Admin dashboard

- **Route:** the SPA serves `/admin` (lazy-loaded, linked from nowhere). Its API is plain HTTP under `/admin/api/*`, handled by `apps/server/src/admin/http.ts` before static files. It's switched off (404) unless `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set. Locally they come from `apps/server/.env` (git-ignored; see `.env.example`).
- **Auth:** credentials are compared in constant time (SHA-256, then `timingSafeEqual`). Logins are limited to 5 per minute per IP. A session is a random token in an `HttpOnly; SameSite=Strict; Path=/admin/api` cookie (`Secure` in production), stored hashed in memory for 8 hours. Every request except GET must carry `x-party-admin: 1` (CSRF guard).
- **Data:** `Room.adminSummary()` returns public room fields only (code, game, status, member names/presence/seat, timestamps). It never reads game state, so words and roles can't reach the dashboard. `UsageStats` (in `rooms/`) counts rooms, games and peaks in memory.
- **Live updates (push a ping, then fetch):** `GET /admin/api/events` is a Server-Sent Events stream (`admin/events.ts`). `RoomManager.onChange` (any room's public info changed, created or closed) and `ServerControls.onChange` trigger an `event: changed` ping. Pings carry **no data** and are coalesced to at most one per 300ms. The dashboard answers each ping by fetching `/overview`, the same full snapshot as before, so the push can't drift or leak anything. A 25s heartbeat keeps proxies from closing the stream and re-checks the session (`event: logout` once it's invalid). There are at most 10 streams. The dashboard also polls every 30s as a backstop.
- **Controls:** `ServerControls` holds maintenance mode and the announcement. Changes go out as `server:status` to every socket through the Broadcaster, which also sends it on connect. In maintenance mode, `room:create` fails with `MAINTENANCE`.

## 14. Testing strategy

| Layer | What | Where |
| --- | --- | --- |
| Unit: engine | voting tally, ties and skips; `isCloseGuess`; scheduler epoch; runner rollback on throw | `engine/*.test.ts` |
| Unit: games | role counts per player count, every phase transition, every timeout default, away rules, every win path, scoring math | `games/<id>/*.test.ts` |
| Leak (property) | `simulate` over 200 seeds × player counts, running the secret oracle on every player at every step (§8, Layer 4) | `games/<id>/leak.test.ts` |
| Schema | every view produced by the simulations passes the strict `viewSchema` | same |
| Rooms | join/name rules, waiting players, kick, seat reassign, host transfer at 60s, expiry | `rooms/*.test.ts` |
| Integration | real server + `socket.io-client`: create → join ×3 → start → full Imposter game; resume mid-game; raw-frame leak check; `game:view` only reaches its owner's socket | `apps/server/test/` |
| Manual | 4 windows (normal + incognito + a second browser) plus two real phones on the LAN (`vite --host`) | — |

All time in tests comes from a fake clock passed through `ctx.now`, plus Vitest fake timers for the scheduler. Nothing sleeps.

---

## 15. Rule clarifications

All product decisions are recorded in the **SPEC.md §7 decisions log**, which is the single source of truth. This file only records how they're implemented.

---

## 16. Deployment

- `pnpm build` produces `apps/web/dist` and `apps/server/dist`. The server serves the SPA, with a fallback to `index.html` for `/r/*`, plus Socket.IO on `PORT`.
- Host on Render, Railway or Fly.io as a single instance. Environment variables: `NODE_ENV=production`, `PORT`, `ALLOWED_ORIGIN`, `TRUST_PROXY`, and `ADMIN_USERNAME` / `ADMIN_PASSWORD` (admin page, §13a).
- **Render:** `render.yaml` at the repo root is a Blueprint for the whole service (build, start, health check, env). The build installs with `NODE_ENV=development` because pnpm skips devDependencies (Vite, tsup) when `NODE_ENV=production`. Admin credentials are set in the Render dashboard, never in the file.
- **Behind a proxy**, the socket address is the proxy's, so per-IP limits (room creation, admin login) would apply to everyone at once. `TRUST_PROXY=<hops>` makes them read the client IP from `X-Forwarded-For`: the entry `hops` places from the end, which the trusted proxy wrote. Earlier entries can be forged by the client and are ignored (`clientIp.ts`). Render is 1 hop.
- `/health` returns `{ ok, rooms, sockets }` for the platform health check.
- **Scaling later (not v1):** the Socket.IO Redis adapter, room state in Redis keyed by code, and sticky sessions. The pure-reducer design means state is already serialisable.

---

## 17. Milestones

Each milestone is one session. It's done only when its acceptance criteria pass, plus `pnpm test`, `pnpm typecheck` and `pnpm lint`.

**M1: Foundation**
- Monorepo, tooling, and the lint boundaries from §3; shared protocol types and schemas; `transport/` with the Broadcaster; `rooms/`.
- Create, join by link or code, the live lobby, host controls, kick, copy/share/QR, waiting players, reconnection and resume, session replacement, host transfer, expiry.
- ✅ Four windows create and join one room. Refreshing any of them keeps the seat. Kicked and closed screens work. Room tests pass.

**M2: Engine + Imposter**
- `GameDefinition`, the runner with rollback, the scheduler, `voting`/`words`/`rng`, `simulate` + `leakCheck`, `packages/content` with the 10 genres (difficulty-tagged), the lobby genre and difficulty picker, host End game, the results screen, play again and back to lobby.
- The full Imposter game, including 2 imposters, untimed out-loud discussion, host Start voting, live vote counts, and the caught/innocent result with the last-chance guess.
- ✅ A full game is playable end to end on phones. Leak tests over 200 seeds and the raw-frame integration test prove the imposter's identity and the word never leak.

**M3: Traitor**
- Scaled roles with a host override, pick and lock-in with the night ending on unanimity, the 60s safety cap, the 15-second away cutoff, the host-started day vote, spectators, and win checks.
- ✅ Night screens look the same for every role. Every win path and away case is tested. Leak tests pass.

**M4: Pictionary**
- The stream channel and relay, the canvas and tools, word choice from genre and difficulty, drawer-revealed hints, guess, close, award and End turn, flat scoring, and stream reset on resume.
- ✅ Drawing feels live across two phones. A player who reconnects mid-turn sees the current drawing. Correct guesses never appear in anyone else's frames.

**M5: Polish + deploy**
- A mobile UX pass, the optional chat toggle, error and empty states, and optional sounds and haptics. Production build and deploy.
- ✅ A real group plays all 3 games on the deployed URL.

---

## 18. Adding a new game (checklist)

1. `packages/shared/src/games/<id>.ts`: Settings, Action union and zod schemas, per-role strict PlayerView schemas, Notice union.
2. `apps/server/src/games/<id>/`: implement `GameDefinition` and register it in `registry.ts`.
3. Write the secret oracle plus reducer, timeout, away, win and leak tests.
4. `apps/web/src/games/<id>/GameScreen.tsx`, and add the game to the lobby's game picker.

You shouldn't need to change `rooms/`, `transport/` or `engine/runner.ts`. If you do, fix the abstraction instead.
