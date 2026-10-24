import type { PlayerId, TraitorRole, TraitorView } from '@party/shared';
import { liveCounts } from '../../engine/voting';
import { deathOf, isAlive, isTraitor, nightOptions, type TraitorState } from './state';

/**
 * Builds one player's view field by field (never spreads state).
 * - Civilians, dead or alive, never get traitor names, roles, or anyone else's night pick.
 * - Traitors see the other traitors; the team's live night picks go to living traitors only.
 * - A dead player's role shows only if the matching reveal setting is on.
 * - Votes in progress are counts only; ballots appear in the reveal phase.
 */
export function getPlayerView(state: TraitorState, viewer: PlayerId): TraitorView {
  if (!state.players.some((p) => p.id === viewer)) throw new Error('Viewer is not in this game');

  const base = {
    game: 'traitor' as const,
    phase: state.phase.name,
    phaseSeq: state.phase.seq,
    deadline: state.phase.deadline,
    round: state.round,
    players: state.players.map((p) => {
      const how = deathOf(state, p.id);
      return {
        id: p.id,
        name: p.name,
        status: how === null ? ('alive' as const) : how,
        revealedRole: revealedRole(state, p.id, how),
      };
    }),
    victimId: state.phase.name === 'morning' ? state.victimId : null,
    vote: state.phase.name === 'vote' && state.vote ? liveCounts(state.vote, viewer) : null,
    dayResult:
      state.phase.name === 'reveal' && state.dayResult
        ? {
            evictedId: state.dayResult.evictedId,
            reason: state.dayResult.reason,
            counts: state.dayResult.counts.map((c) => ({ target: c.target, count: c.count })),
            ballots: state.dayResult.ballots.map((b) => ({ voter: b.voter, target: b.target })),
          }
        : null,
  };
  const alive = isAlive(state, viewer);
  const mine = state.night?.[viewer];
  const ownPick = mine ? { target: mine.target, locked: mine.locked } : null;

  if (isTraitor(state, viewer)) {
    return {
      ...base,
      you: { id: viewer, role: 'traitor', alive },
      fellowTraitors: state.traitorIds.filter((id) => id !== viewer),
      night:
        ownPick && alive
          ? {
              options: nightOptions(state, viewer),
              mine: ownPick,
              team: state.traitorIds
                .filter((id) => id !== viewer && isAlive(state, id))
                .map((id) => ({ id, target: state.night?.[id]?.target ?? null, locked: state.night?.[id]?.locked ?? false })),
            }
          : null,
    };
  }
  return {
    ...base,
    you: { id: viewer, role: 'civilian', alive },
    night: ownPick && alive ? { options: nightOptions(state, viewer), mine: ownPick } : null,
  };
}

function revealedRole(state: TraitorState, id: PlayerId, how: 'killed' | 'evicted' | null): TraitorRole | null {
  if (how === null) return null;
  const shown = how === 'killed' ? state.settings.revealVictimRole : state.settings.revealEvictedRole;
  if (!shown) return null;
  return isTraitor(state, id) ? 'traitor' : 'civilian';
}
