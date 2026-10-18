import type { GenreId, ImposterPhase, ImposterSettings, PlayerId, VoteResult } from '@party/shared';
import type { BaseState, Phase } from '../../engine/game';
import type { VoteState } from '../../engine/voting';

/** Server-only state. Never sent to clients; views are built from it in views.ts. */
export interface ImposterState extends BaseState {
  phase: Phase<ImposterPhase>;
  settings: ImposterSettings;
  /** Seat order. */
  players: readonly { id: PlayerId; name: string }[];
  online: Readonly<Record<PlayerId, boolean>>;
  word: string;
  genreId: GenreId;
  imposterIds: readonly PlayerId[];
  /** In eviction order. Evicted players are spectators for the rest of the game. */
  evicted: readonly PlayerId[];
  round: number;
  vote: VoteState | null;
  /** The most recent vote's result, shown until the next round starts. */
  lastResult: VoteResult | null;
  lastGuess: { by: PlayerId; status: 'pending' | 'wrong' | 'timeout'; text: string | null } | null;
  outcome: { winner: 'crew' | 'imposters'; detail: string } | null;
}

export function isImposter(state: ImposterState, id: PlayerId): boolean {
  return state.imposterIds.includes(id);
}

export function isEvicted(state: ImposterState, id: PlayerId): boolean {
  return state.evicted.includes(id);
}

export function alivePlayers(state: ImposterState): PlayerId[] {
  return state.players.map((p) => p.id).filter((id) => !isEvicted(state, id));
}

export function playerName(state: ImposterState, id: PlayerId): string {
  return state.players.find((p) => p.id === id)?.name ?? 'Someone';
}
