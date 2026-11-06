import {
  GAME_META,
  pictionaryActionSchema,
  pictionaryDefaultSettings,
  pictionarySettingsSchema,
  pictionaryStreamOpSchema,
  pictionaryViewSchema,
  type GameResult,
  type PictionaryAction,
  type PictionarySettings,
  type PictionaryView,
} from '@party/shared';
import type { GameDefinition } from '../../engine/game';
import { nextWakeup, reduce, setup } from './reduce';
import { playerName, type PictionaryState } from './state';
import { channelKey, getPlayerView } from './views';

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
  // Board mode strokes: public; only the drawer sends, only while drawing.
  stream: {
    schema: pictionaryStreamOpSchema,
    channelKey,
    canSend: (state, by) => state.phase.name === 'drawing' && by === state.drawerId,
  },
};

const OUTCOME_SUFFIX = { guessed: '', nobody: ' (not guessed)', timeUp: " (time's up)" } as const;

function summarize(state: PictionaryState): GameResult {
  const played = state.history.length;
  const guessed = state.history.filter((h) => h.outcome === 'guessed').length;
  return {
    gameId: 'pictionary',
    endedBy: 'host',
    headline: 'Thanks for playing!',
    detail: played === 0 ? 'No rounds were played.' : `${guessed} of ${played} word${played === 1 ? '' : 's'} guessed.`,
    winners: [],
    roles: [],
    reveals: state.history.map((h) => ({
      label: `${h.round}. ${playerName(state, h.drawerId)}`,
      value: `${h.word}${OUTCOME_SUFFIX[h.outcome]}`,
    })),
    scores: [],
  };
}
