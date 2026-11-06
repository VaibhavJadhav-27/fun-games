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
  /** +1 for every word dealt. Board mode: names the drawing's stream channel, so a new word gets a blank board. */
  wordSeq: number;
  /** Finished rounds, for the end-of-game summary. */
  history: readonly { round: number; drawerId: PlayerId; word: string; outcome: RoundOutcome }[];
  /** Board mode, during the reveal: who typed the correct guess (null if the host tapped). */
  guessedBy: PlayerId | null;
  /** During the reveal: who draws next, so they can get ready. Null while drawing. */
  upNextId: PlayerId | null;
}

/** guessed: someone got it; nobody: the host gave up; timeUp: board mode's countdown ran out. */
export type RoundOutcome = 'guessed' | 'nobody' | 'timeUp';

export function isBoard(state: PictionaryState): boolean {
  return state.settings.mode === 'board';
}

export function playerName(state: PictionaryState, id: PlayerId): string {
  return state.players.find((p) => p.id === id)?.name ?? 'Someone';
}
