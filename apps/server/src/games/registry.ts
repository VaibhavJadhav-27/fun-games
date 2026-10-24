import type { GameId } from '@party/shared';
import { eraseGame, type AnyGame } from '../engine/game';
import { imposter } from './imposter';

/** Games not listed here are "coming soon" (see GAME_META.available). */
export const GAMES: Partial<Record<GameId, AnyGame>> = {
  imposter: eraseGame(imposter),
};

export function gameFor(id: GameId): AnyGame | undefined {
  return GAMES[id];
}
