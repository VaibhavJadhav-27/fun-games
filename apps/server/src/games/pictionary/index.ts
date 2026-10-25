import {
  GAME_META,
  pictionaryActionSchema,
  pictionaryDefaultSettings,
  pictionarySettingsSchema,
  pictionaryViewSchema,
  type GameResult,
  type PictionaryAction,
  type PictionarySettings,
  type PictionaryView,
} from '@party/shared';
import type { GameDefinition } from '../../engine/game';
import { nextWakeup, reduce, setup } from './reduce';
import { playerName, type PictionaryState } from './state';
import { getPlayerView } from './views';

const meta = GAME_META.pictionary;

export const pictionary: GameDefinition<PictionaryState, PictionaryAction, PictionaryView, PictionarySettings> = {
  id: 'pictionary',
  minPlayers: meta.minPlayers,
  maxPlayers: meta.maxPlayers,
  settings: {
    schema: pictionarySettingsSchema,
    defaults: pictionaryDefaultSettings,
    clamp: (cfg) => cfg,
    validate: (cfg) => (cfg.mode === 'online' ? 'Online mode is coming soon' : null),
  },
  actionSchema: pictionaryActionSchema,
  viewSchema: pictionaryViewSchema,
  setup,
  reduce,
  nextWakeup,
  getPlayerView,
  // No scores and no winner: the game runs until the host taps End game.
  result: () => null,
  abort: summarize,
};

function summarize(state: PictionaryState): GameResult {
  const guessed = state.history.length;
  return {
    gameId: 'pictionary',
    endedBy: 'host',
    headline: 'Thanks for playing!',
    detail: guessed === 0 ? 'No words were guessed.' : `${guessed} word${guessed === 1 ? '' : 's'} guessed.`,
    winners: [],
    roles: [],
    reveals: state.history.map((h) => ({ label: `${h.round}. ${playerName(state, h.drawerId)}`, value: h.word })),
    scores: [],
  };
}
