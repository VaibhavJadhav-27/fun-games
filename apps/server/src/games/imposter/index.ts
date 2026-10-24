import {
  GAME_META,
  IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS,
  genreName,
  imposterActionSchema,
  imposterDefaultSettings,
  imposterSettingsSchema,
  imposterSettingsUpdateSchema,
  imposterViewSchema,
  type GameResult,
  type ImposterAction,
  type ImposterPublicSettings,
  type ImposterSettings,
  type ImposterView,
} from '@party/shared';
import type { GameDefinition } from '../../engine/game';
import { nextWakeup, reduce, setup } from './reduce';
import { isImposter, type ImposterState } from './state';
import { getPlayerView } from './views';

const meta = GAME_META.imposter;

export const imposter: GameDefinition<ImposterState, ImposterAction, ImposterView, ImposterSettings> = {
  id: 'imposter',
  minPlayers: meta.minPlayers,
  maxPlayers: meta.maxPlayers,
  settings: {
    schema: imposterSettingsSchema,
    defaults: imposterDefaultSettings,
    clamp(cfg, playerCount) {
      return cfg.imposters === 2 && playerCount < IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS ? { ...cfg, imposters: 1 } : cfg;
    },
    validate(cfg, playerCount) {
      if (cfg.source === 'custom' && !cfg.customWord) return 'Enter the custom word';
      if (cfg.imposters === 2 && playerCount < IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS) {
        return `2 imposters need at least ${IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS} players`;
      }
      return null;
    },
    update(prev, raw) {
      const parsed = imposterSettingsUpdateSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid settings' };
      const { customWord, ...rest } = parsed.data;
      return { ok: true, value: { ...rest, customWord: customWord === undefined ? prev.customWord : customWord } };
    },
    toPublic: (cfg): ImposterPublicSettings => ({
      source: cfg.source,
      genres: [...cfg.genres],
      difficulty: cfg.difficulty,
      imposters: cfg.imposters,
      maxRounds: cfg.maxRounds,
      customWordSet: cfg.customWord !== null,
    }),
    hostModerates: (cfg) => cfg.source === 'custom',
    forgetSecrets: (cfg) => (cfg.customWord === null ? cfg : { ...cfg, customWord: null }),
  },
  actionSchema: imposterActionSchema,
  viewSchema: imposterViewSchema,
  setup,
  reduce,
  nextWakeup,
  getPlayerView,
  result: (state) => (state.outcome ? summarize(state, 'game') : null),
  abort: (state) => summarize(state, 'host'),
};

function summarize(state: ImposterState, endedBy: 'game' | 'host'): GameResult {
  const plural = state.imposterIds.length > 1;
  const roles = state.players.map((p) => {
    const evil = isImposter(state, p.id);
    return { playerId: p.id, name: p.name, role: evil ? 'Imposter' : 'Crewmate', team: evil ? ('evil' as const) : ('good' as const) };
  });
  const reveals = [
    { label: 'Word', value: state.word },
    { label: 'Genre', value: state.genreId ? genreName(state.genreId) : 'Custom word' },
  ];

  if (endedBy === 'host' || !state.outcome) {
    return { gameId: 'imposter', endedBy: 'host', headline: 'Game ended by host', detail: null, winners: [], roles, reveals, scores: [] };
  }

  const crewWins = state.outcome.winner === 'crew';
  const winners = state.players.map((p) => p.id).filter((id) => isImposter(state, id) !== crewWins);
  return {
    gameId: 'imposter',
    endedBy: 'game',
    headline: crewWins ? 'Crewmates win!' : plural ? 'Imposters win!' : 'Imposter wins!',
    detail: state.outcome.detail,
    winners,
    roles,
    reveals,
    scores: winners.map((playerId) => ({ playerId, points: crewWins ? 1 : 3 })),
  };
}
