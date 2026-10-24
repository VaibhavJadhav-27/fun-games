import {
  GAME_META,
  maxTraitorCount,
  traitorActionSchema,
  traitorDefaultSettings,
  traitorSettingsSchema,
  traitorViewSchema,
  type GameResult,
  type TraitorAction,
  type TraitorSettings,
  type TraitorView,
} from '@party/shared';
import type { GameDefinition } from '../../engine/game';
import { nextWakeup, reduce, setup } from './reduce';
import { isTraitor, type TraitorState } from './state';
import { getPlayerView } from './views';

const meta = GAME_META.traitor;

export const traitor: GameDefinition<TraitorState, TraitorAction, TraitorView, TraitorSettings> = {
  id: 'traitor',
  minPlayers: meta.minPlayers,
  maxPlayers: meta.maxPlayers,
  settings: {
    schema: traitorSettingsSchema,
    defaults: traitorDefaultSettings,
    clamp(cfg, playerCount) {
      if (cfg.traitors === 'auto') return cfg;
      const max = maxTraitorCount(playerCount);
      return cfg.traitors > max ? { ...cfg, traitors: max } : cfg;
    },
    validate(cfg, playerCount) {
      if (cfg.traitors !== 'auto' && cfg.traitors > maxTraitorCount(playerCount)) {
        return `${playerCount} players allow at most ${maxTraitorCount(playerCount)} traitor${maxTraitorCount(playerCount) > 1 ? 's' : ''}`;
      }
      return null;
    },
  },
  actionSchema: traitorActionSchema,
  viewSchema: traitorViewSchema,
  setup,
  reduce,
  nextWakeup,
  getPlayerView,
  result: (state) => (state.outcome ? summarize(state, 'game') : null),
  abort: (state) => summarize(state, 'host'),
};

function summarize(state: TraitorState, endedBy: 'game' | 'host'): GameResult {
  const roles = state.players.map((p) => {
    const evil = isTraitor(state, p.id);
    return { playerId: p.id, name: p.name, role: evil ? 'Traitor' : 'Civilian', team: evil ? ('evil' as const) : ('good' as const) };
  });
  const nights = state.round;
  const reveals = [{ label: 'Nights played', value: String(nights) }];

  if (endedBy === 'host' || !state.outcome) {
    return { gameId: 'traitor', endedBy: 'host', headline: 'Game ended by host', detail: null, winners: [], roles, reveals, scores: [] };
  }

  // The whole team wins, including members who died along the way (SPEC §7, 2026-10-24).
  const civiliansWin = state.outcome.winner === 'civilians';
  const winners = state.players.map((p) => p.id).filter((id) => isTraitor(state, id) !== civiliansWin);
  return {
    gameId: 'traitor',
    endedBy: 'game',
    headline: civiliansWin ? 'Civilians win!' : state.traitorIds.length > 1 ? 'Traitors win!' : 'The traitor wins!',
    detail: state.outcome.detail,
    winners,
    roles,
    reveals,
    scores: winners.map((playerId) => ({ playerId, points: civiliansWin ? 1 : 3 })),
  };
}
