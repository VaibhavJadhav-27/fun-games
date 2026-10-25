import type { GenreId, PictionaryPhase, PictionarySettings, PlayerId } from '@party/shared';
import type { BaseState, Phase } from '../../engine/game';

/** Server-only state. Never sent to clients; views are built from it in views.ts. */
export interface PictionaryState extends BaseState {
  phase: Phase<PictionaryPhase>;
  settings: PictionarySettings;
  /** Seat order. */
  players: readonly { id: PlayerId; name: string }[];
  online: Readonly<Record<PlayerId, boolean>>;
  /** Kicked or left: never drawn again. */
  gone: readonly PlayerId[];
  /** Who still has to draw this cycle (fair picking: nobody draws twice until everyone has). */
  queue: readonly PlayerId[];
  round: number;
  drawerId: PlayerId;
  word: string;
  genreId: GenreId;
  /** Normalised words already dealt this game, so none repeats. */
  usedWords: readonly string[];
  /** Rounds the host marked as guessed, for the end-of-game summary. */
  history: readonly { round: number; drawerId: PlayerId; word: string }[];
}

export function playerName(state: PictionaryState, id: PlayerId): string {
  return state.players.find((p) => p.id === id)?.name ?? 'Someone';
}
