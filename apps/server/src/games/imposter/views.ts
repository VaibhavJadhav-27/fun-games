import { genreName, type ImposterView, type PlayerId } from '@party/shared';
import { liveCounts } from '../../engine/voting';
import { isEvicted, isImposter, type ImposterState } from './state';

/**
 * Builds one player's view field by field (never spreads state). The imposter variant
 * has no `word`; crewmates and the moderator never get `fellowImposters`; other players' roles appear only
 * once they've been evicted; votes in progress are counts only.
 */
export function getPlayerView(state: ImposterState, viewer: PlayerId): ImposterView {
  const moderator = viewer === state.moderatorId;
  if (!moderator && !state.players.some((p) => p.id === viewer)) throw new Error('Viewer is not in this game');

  const base = {
    game: 'imposter' as const,
    phase: state.phase.name,
    phaseSeq: state.phase.seq,
    deadline: state.phase.deadline,
    round: state.round,
    maxRounds: state.settings.maxRounds,
    players: state.players.map((p) => {
      const evicted = isEvicted(state, p.id);
      return {
        id: p.id,
        name: p.name,
        evicted,
        revealedRole: evicted ? (isImposter(state, p.id) ? ('imposter' as const) : ('crewmate' as const)) : null,
      };
    }),
    vote: state.phase.name === 'vote' && state.vote ? liveCounts(state.vote, viewer) : null,
    result: state.lastResult
      ? {
          outcome: state.lastResult.outcome,
          evictedId: state.lastResult.evictedId,
          reason: state.lastResult.reason,
          counts: state.lastResult.counts.map((c) => ({ target: c.target, count: c.count })),
          ballots: state.lastResult.ballots.map((b) => ({ voter: b.voter, target: b.target })),
        }
      : null,
    lastGuess: state.lastGuess
      ? { by: state.lastGuess.by, status: state.lastGuess.status, text: state.lastGuess.text }
      : null,
  };
  const genre = state.genreId ? genreName(state.genreId) : null;

  if (moderator) {
    return { ...base, you: { id: viewer, role: 'moderator' }, word: state.word, genre };
  }
  const evicted = isEvicted(state, viewer);
  if (isImposter(state, viewer)) {
    return {
      ...base,
      you: { id: viewer, role: 'imposter', evicted },
      // The genre is the imposter's only hint, and only on Easy (SPEC §7, 2026-10-24).
      genre: state.settings.difficulty === 'easy' ? genre : null,
      fellowImposters: state.imposterIds.filter((id) => id !== viewer),
    };
  }
  return {
    ...base,
    you: { id: viewer, role: 'crewmate', evicted },
    word: state.word,
    genre,
  };
}
