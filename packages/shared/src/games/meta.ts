import type { GameId } from '../types';

export interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  rules: string[];
}

export const GAME_META: Record<GameId, GameMeta> = {
  imposter: {
    id: 'imposter',
    name: 'Imposter',
    tagline: 'Everyone knows the word, except the imposter.',
    minPlayers: 3,
    maxPlayers: 12,
    rules: [
      'Crewmates see a secret word. The imposter only sees its genre.',
      'Take turns saying one word related to it, then discuss out loud.',
      'Vote out the imposter. If caught, they get one guess at the word.',
    ],
  },
  traitor: {
    id: 'traitor',
    name: 'Traitor',
    tagline: 'Traitors strike at night. Find them by day.',
    minPlayers: 5,
    maxPlayers: 15,
    rules: [
      'Traitors know each other. Civilians know nothing.',
      'At night, the traitors agree on a victim.',
      'By day, discuss and vote to evict a suspect.',
    ],
  },
  pictionary: {
    id: 'pictionary',
    name: 'Pictionary',
    tagline: 'Draw it. Guess it.',
    minPlayers: 3,
    maxPlayers: 12,
    rules: [
      'Take turns drawing a word on your phone.',
      'Everyone else guesses by typing, or shouting out loud.',
      'Points for every correct guess, for the guesser and the drawer.',
    ],
  },
};

/** Why the host can't start yet, or null if they can. */
export function startBlockedReason(gameId: GameId, playerCount: number): string | null {
  const meta = GAME_META[gameId];
  if (playerCount < meta.minPlayers) {
    const missing = meta.minPlayers - playerCount;
    return `Need ${missing} more player${missing === 1 ? '' : 's'}`;
  }
  if (playerCount > meta.maxPlayers) {
    return `${meta.name} allows at most ${meta.maxPlayers} players`;
  }
  return null;
}
