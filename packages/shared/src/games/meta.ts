import type { GameId } from '../types';

export interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  /** False until the game is built. Built games also need releasing in the admin to be playable. */
  available: boolean;
  rules: string[];
}

export const GAME_META: Record<GameId, GameMeta> = {
  imposter: {
    id: 'imposter',
    name: 'Imposter',
    tagline: 'Everyone knows the word, except the imposter.',
    minPlayers: 3,
    maxPlayers: 12,
    available: true,
    rules: [
      'Crewmates see a secret word. The imposter only sees its genre.',
      'Go round the group out loud: everyone says a word linked to it, then discuss.',
      'Vote out the imposter. If caught, they get one guess at the word.',
    ],
  },
  traitor: {
    id: 'traitor',
    name: 'Traitor',
    tagline: 'Traitors strike at night. Find them by day.',
    minPlayers: 5,
    maxPlayers: 15,
    available: true,
    rules: [
      'Traitors know each other. Civilians only know they are civilians.',
      'At night everyone taps a name: traitors agree on a victim, civilians pick a suspect.',
      'By day, discuss and vote to evict someone. Civilians win by evicting every traitor.',
    ],
  },
  pictionary: {
    id: 'pictionary',
    name: 'Pictionary',
    tagline: 'Draw it. Guess it.',
    minPlayers: 3,
    maxPlayers: 12,
    available: true,
    rules: [
      'Each round, one random player gets a secret word on their phone.',
      'They draw it on paper while everyone else shouts out guesses.',
      'When someone gets it, the host reveals the word and starts the next round.',
    ],
  },
};

/** Why the host can't start yet, or null if they can. Unbuilt or unreleased games are "coming soon". */
export function startBlockedReason(gameId: GameId, playerCount: number, released = true): string | null {
  const meta = GAME_META[gameId];
  if (!meta.available || !released) return `${meta.name} is coming soon`;
  if (playerCount < meta.minPlayers) {
    const missing = meta.minPlayers - playerCount;
    return `Need ${missing} more player${missing === 1 ? '' : 's'}`;
  }
  if (playerCount > meta.maxPlayers) {
    return `${meta.name} allows at most ${meta.maxPlayers} players`;
  }
  return null;
}
