import type { PictionaryAction, PictionaryPhase, PictionarySettings, PlayerId } from '@party/shared';
import type { GameContext, GameInput, SetupInput, Step } from '../../engine/game';
import { shuffle } from '../../engine/rng';
import { normalizeGuess, pickWords, type PickedWord } from '../../engine/words';
import type { PictionaryState } from './state';

export function setup(input: SetupInput<PictionarySettings>, ctx: GameContext): PictionaryState {
  const { players, settings } = input;
  const start: PictionaryState = {
    phase: { name: 'drawing', seq: 1, deadline: null },
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name })),
    online: Object.fromEntries(players.map((p) => [p.id, p.online])),
    gone: [],
    queue: [],
    round: 1,
    drawerId: '',
    word: '',
    genreId: settings.genres[0] ?? 'random',
    usedWords: [],
    history: [],
  };
  return dealWord(nextDrawer(start, ctx), ctx);
}

export function reduce(state: PictionaryState, input: GameInput<PictionaryAction>, ctx: GameContext): Step<PictionaryState> {
  switch (input.kind) {
    case 'presence':
    case 'left': {
      const { playerId } = input;
      const online = input.kind === 'presence' ? input.online : false;
      const gone = input.kind === 'left' && !state.gone.includes(playerId) ? [...state.gone, playerId] : state.gone;
      if (state.online[playerId] === online && gone === state.gone) return { ok: true, state };
      const next = { ...state, online: { ...state.online, [playerId]: online }, gone };
      // The drawer dropped out mid-round: that round is skipped and someone else draws.
      if (!online && playerId === state.drawerId && state.phase.name === 'drawing') {
        return { ok: true, state: newRound(next, ctx, state.round) };
      }
      return { ok: true, state: next };
    }

    case 'tick':
      return { ok: true, state };

    case 'action': {
      const { by, isHost, action } = input;
      switch (action.type) {
        case 'skip':
          if (state.phase.name !== 'drawing') return { ok: false, error: 'WRONG_PHASE' };
          if (by !== state.drawerId) return { ok: false, error: 'NOT_ALLOWED' };
          return { ok: true, state: dealWord(enter(state, 'drawing'), ctx) };

        case 'guessed':
          if (!isHost) return { ok: false, error: 'NOT_HOST' };
          if (state.phase.name !== 'drawing') return { ok: false, error: 'WRONG_PHASE' };
          return {
            ok: true,
            state: {
              ...enter(state, 'reveal'),
              history: [...state.history, { round: state.round, drawerId: state.drawerId, word: state.word }],
            },
          };

        case 'next':
          if (!isHost) return { ok: false, error: 'NOT_HOST' };
          if (state.phase.name !== 'reveal') return { ok: false, error: 'WRONG_PHASE' };
          return { ok: true, state: newRound(state, ctx, state.round + 1) };
      }
    }
  }
}

/** Untimed: rounds move on only when the host (or drawer) taps. */
export function nextWakeup(): number | null {
  return null;
}

// ── Transitions ─────────────────────────────────────────────────────────────

function enter(state: PictionaryState, name: PictionaryPhase): PictionaryState {
  return { ...state, phase: { name, seq: state.phase.seq + 1, deadline: null } };
}

function newRound(state: PictionaryState, ctx: GameContext, round: number): PictionaryState {
  return dealWord(nextDrawer({ ...enter(state, 'drawing'), round }, ctx), ctx);
}

/**
 * The next online player from this cycle's queue. Once nobody in the queue is online, a new
 * cycle starts with everyone still in the game, reshuffled (avoiding the same drawer twice
 * in a row when there's a choice).
 */
function nextDrawer(state: PictionaryState, ctx: GameContext): PictionaryState {
  const canDraw = (id: PlayerId) => state.online[id] === true && !state.gone.includes(id);
  let queue = state.queue.filter((id) => !state.gone.includes(id));
  if (!queue.some(canDraw)) {
    queue = shuffle(
      state.players.map((p) => p.id).filter((id) => !state.gone.includes(id)),
      ctx.rng,
    );
    const first = queue.findIndex(canDraw);
    if (queue[first] === state.drawerId) {
      const swap = queue.findIndex((id, i) => i > first && canDraw(id));
      if (swap !== -1) [queue[first], queue[swap]] = [queue[swap] as PlayerId, queue[first] as PlayerId];
    }
  }
  // Nobody online at all: keep the current drawer (or, at setup, the first seat) until someone comes back.
  const drawerId = queue.find(canDraw) ?? (state.drawerId || state.players[0]?.id || '');
  return { ...state, drawerId, queue: queue.filter((id) => id !== drawerId) };
}

/** A fresh word the group hasn't had this game (the list starts over if a game uses them all). */
function dealWord(state: PictionaryState, ctx: GameContext): PictionaryState {
  const { genres, difficulty } = state.settings;
  const used = new Set(state.usedWords);
  let picked: PickedWord | undefined;
  try {
    picked = pickWords(ctx.bank, genres, difficulty, 1, ctx.rng, used)[0];
  } catch {
    picked = pickWords(ctx.bank, genres, difficulty, 1, ctx.rng)[0];
    used.clear();
  }
  if (!picked) return state;
  used.add(normalizeGuess(picked.text));
  return { ...state, word: picked.text, genreId: picked.genreId, usedWords: [...used] };
}
