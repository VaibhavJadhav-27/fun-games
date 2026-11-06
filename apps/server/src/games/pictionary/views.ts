import { genreName, type PictionaryView, type PlayerId } from '@party/shared';
import { isBoard, type PictionaryState } from './state';

/**
 * Builds one player's view field by field (never spreads state). While drawing, only the
 * drawer gets the word; guessers get the genre as a hint only on Easy. On reveal, everyone
 * sees the word.
 */
export function getPlayerView(state: PictionaryState, viewer: PlayerId): PictionaryView {
  if (!state.players.some((p) => p.id === viewer)) throw new Error('Viewer is not in this game');

  const base = {
    game: 'pictionary' as const,
    phaseSeq: state.phase.seq,
    deadline: state.phase.name === 'drawing' ? state.phase.deadline : null,
    mode: isBoard(state) ? ('board' as const) : ('offline' as const),
    channelKey: channelKey(state),
    round: state.round,
    players: state.players.map((p) => ({ id: p.id, name: p.name })),
    drawerId: state.drawerId,
  };
  const genre = genreName(state.genreId);
  const role = viewer === state.drawerId ? ('drawer' as const) : ('guesser' as const);

  if (state.phase.name === 'reveal') {
    return {
      ...base,
      phase: 'reveal',
      you: { id: viewer, role },
      word: state.word,
      genre,
      guessed: state.history.at(-1)?.outcome === 'guessed',
      guessedBy: state.guessedBy,
      timeUp: state.history.at(-1)?.outcome === 'timeUp',
      upNextId: state.upNextId,
    };
  }
  if (role === 'drawer') {
    return { ...base, phase: 'drawing', you: { id: viewer, role }, word: state.word, genre };
  }
  return {
    ...base,
    phase: 'drawing',
    you: { id: viewer, role },
    // The genre is the guessers' only hint, and only on Easy (SPEC §7, 2026-10-25).
    genre: state.settings.difficulty === 'easy' ? genre : null,
  };
}

/** Board mode: the current drawing's stream channel (kept through the reveal so it stays on screen). */
export function channelKey(state: PictionaryState): string | null {
  return isBoard(state) ? `w${state.wordSeq}` : null;
}
