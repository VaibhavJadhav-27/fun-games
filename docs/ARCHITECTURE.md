# fun-games — Architecture

> Status: Draft · Last updated: 2026-10-18

## 1. Overview

<!-- TODO: high-level description of how the app is built. -->

## 2. Tech stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | | |
| Rendering | | <!-- DOM, Canvas, WebGL, terminal --> |
| Build tool | | |
| Testing | | |
| Hosting / distribution | | |

## 3. High-level structure

```
fun-games/
├── src/
│   ├── shell/        # app entry, game menu, routing between games
│   ├── shared/       # reusable engine pieces: input, loop, audio, storage, UI
│   └── games/
│       └── <game>/   # one folder per game
│           ├── logic   # pure rules/state (no rendering) — unit tested
│           ├── view    # rendering + input wiring
│           └── index   # exports the game to the shell
├── tests/
└── docs/
```

<!-- Adjust to the actual layout once code exists. -->

## 4. Core concepts

### 4.1 Game contract

Every game exposes the same interface to the shell so games can be added without changing shell code:

```
interface Game {
  id: string
  title: string
  mount(container): void   // start and render
  unmount(): void          // stop loop, release listeners
}
```

### 4.2 State & logic separation

- Game rules and state live in pure functions/modules with no rendering or I/O.
- The view layer reads state, renders it, and turns user input into actions.
- This keeps logic deterministic and easy to test.

### 4.3 Game loop

<!-- Describe: turn-based (event driven) vs real-time (requestAnimationFrame / tick loop), fixed vs variable timestep. -->

### 4.4 Input

<!-- Keyboard / mouse / touch handling and how it maps to game actions. -->

### 4.5 Persistence

<!-- Where high scores and settings are stored (e.g. localStorage) and the data shape. -->

## 5. Data flow

```
user input → view → action → logic (next state) → view re-render
```

## 6. Adding a new game

1. Create `src/games/<game>/`.
2. Implement the logic module and its tests.
3. Implement the view and the `Game` contract.
4. Register the game with the shell menu.
5. Add the game to `docs/SPEC.md`.

## 7. Testing strategy

- **Unit:** game logic (rules, scoring, win conditions).
- **Integration:** shell loads and switches games.
- **Manual:** playtesting checklist per game.

## 8. Decisions log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-10-18 | Docs scaffolded | Project kickoff |
