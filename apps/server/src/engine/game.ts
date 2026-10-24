import type { ZodType } from 'zod';
import type { WordBank } from '@party/content';
import type { GameId, GameResult, PlayerId } from '@party/shared';
import type { Rng } from './rng';

/** Everything impure a game may use, injected so games stay pure and testable. */
export interface GameContext {
  now: number;
  rng: Rng;
  bank: WordBank;
}

export interface Phase<Name extends string = string> {
  name: Name;
  /** +1 on every phase change; clients echo it to reject stale actions. */
  seq: number;
  /** Epoch ms, or null for untimed phases. */
  deadline: number | null;
}

export interface BaseState {
  phase: Phase;
}

export interface SetupPlayer {
  id: PlayerId;
  name: string;
  online: boolean;
}

export interface SetupInput<Cfg> {
  /** Players in seat order. Never includes the moderator. */
  players: SetupPlayer[];
  settings: Cfg;
  /** The host, when `settings.hostModerates` says they run the game instead of playing it. */
  moderator: PlayerId | null;
}

export type GameInput<A> =
  | { kind: 'action'; by: PlayerId; isHost: boolean; action: A }
  | { kind: 'presence'; playerId: PlayerId; online: boolean }
  | { kind: 'left'; playerId: PlayerId }
  | { kind: 'tick' };

export type GameErrorCode = 'WRONG_PHASE' | 'NOT_ALLOWED' | 'INVALID_TARGET' | 'NOT_HOST';

export type Step<S> = { ok: true; state: S } | { ok: false; error: GameErrorCode };

/**
 * A game plugin (ARCHITECTURE §6). Pure: no I/O, no Date, no Math.random, no mutation.
 * Invalid input returns { ok: false }; it must never throw.
 */
export interface GameDefinition<S extends BaseState, A, V, Cfg> {
  id: GameId;
  minPlayers: number;
  maxPlayers: number;
  settings: {
    schema: ZodType<Cfg>;
    defaults(): Cfg;
    /** Adjust settings after the player count changes (e.g. too few for 2 imposters). */
    clamp(cfg: Cfg, playerCount: number): Cfg;
    /** Human-readable reason the settings can't be used with this many players. */
    validate(cfg: Cfg, playerCount: number): string | null;
    /** Parse a host's change against the current settings. Default: `schema` replaces them. */
    update?(prev: Cfg, raw: unknown): { ok: true; value: Cfg } | { ok: false; message: string };
    /** What everyone in the room sees (RoomInfo). Default: the settings as they are. */
    toPublic?(cfg: Cfg): unknown;
    /** True when the host runs the game instead of playing it (and isn't counted as a player). */
    hostModerates?(cfg: Cfg): boolean;
    /** Drop secrets the host entered, once a game has used them or the host changes. */
    forgetSecrets?(cfg: Cfg): Cfg;
  };
  actionSchema: ZodType<A>;
  /** Strict schema every outgoing view must pass (fails closed). */
  viewSchema: ZodType<V>;

  setup(input: SetupInput<Cfg>, ctx: GameContext): S;
  reduce(state: S, input: GameInput<A>, ctx: GameContext): Step<S>;
  /** Earliest pending deadline, or null. The room scheduler sends `tick` then. */
  nextWakeup(state: S): number | null;
  getPlayerView(state: S, viewer: PlayerId): V;
  /** Non-null means the game is over. */
  result(state: S): GameResult | null;
  /** Host ended the game early: every role revealed, no winner. */
  abort(state: S): GameResult;
}

/** Type-erased definition, so the registry and runner can hold any game. */
export type AnyGame = GameDefinition<BaseState, unknown, unknown, unknown>;

export function eraseGame<S extends BaseState, A, V, Cfg>(def: GameDefinition<S, A, V, Cfg>): AnyGame {
  return def as unknown as AnyGame;
}
