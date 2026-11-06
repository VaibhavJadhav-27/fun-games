import type { PictionaryAction, PictionaryPhase, PictionarySettings, PlayerId } from '@party/shared';
import type { GameContext, GameInput, SetupInput, Step } from '../../engine/game';
import { shuffle } from '../../engine/rng';
import { isCloseGuess, isCorrectGuess, normalizeGuess, pickWords, type PickedWord } from '../../engine/words';
import { isBoard, type PictionaryState, type RoundOutcome } from './state';

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
    wordSeq: 0,
    history: [],
    guessedBy: null,
    upNextId: null,
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
      // Whoever was up next dropped out during the reveal: pick someone else.
      if (!online && playerId === state.upNextId) {
        return { ok: true, state: pickUpNext(next, ctx) };
      }
      return { ok: true, state: next };
    }

    case 'tick':
      // Board mode: the countdown ran out before anyone got it.
      if (timeIsUp(state, ctx)) return { ok: true, state: reveal(state, 'timeUp', null, ctx) };
      return { ok: true, state };

    case 'action': {
      const { by, isHost, action } = input;
      switch (action.type) {
        case 'skip':
          if (state.phase.name !== 'drawing') return { ok: false, error: 'WRONG_PHASE' };
          if (by !== state.drawerId) return { ok: false, error: 'NOT_ALLOWED' };
          return { ok: true, state: dealWord(enter(state, 'drawing'), ctx) };

        case 'guessed':
        case 'giveUp':
          if (!isHost) return { ok: false, error: 'NOT_HOST' };
          if (state.phase.name !== 'drawing') return { ok: false, error: 'WRONG_PHASE' };
          return { ok: true, state: reveal(state, action.type === 'guessed' ? 'guessed' : 'nobody', null, ctx) };

        case 'guess': {
          if (!isBoard(state)) return { ok: false, error: 'NOT_ALLOWED' };
          if (state.phase.name !== 'drawing') return { ok: false, error: 'WRONG_PHASE' };
          if (by === state.drawerId) return { ok: false, error: 'NOT_ALLOWED' };
          // Time is up but the tick hasn't landed yet: the guess no longer counts.
          if (timeIsUp(state, ctx)) return { ok: true, state: reveal(state, 'timeUp', null, ctx) };
          // The guess text only ever comes back in this player's ack (SPEC section 4).
          if (isCorrectGuess(action.text, state.word)) {
            return { ok: true, state: reveal(state, 'guessed', by, ctx), reply: { guess: 'correct' } };
          }
          return { ok: true, state, reply: { guess: isCloseGuess(action.text, state.word) ? 'close' : 'wrong' } };
        }

        case 'next': {
          if (!isHost) return { ok: false, error: 'NOT_HOST' };
          if (state.phase.name !== 'reveal') return { ok: false, error: 'WRONG_PHASE' };
          const ready = state.upNextId !== null && canDraw(state, state.upNextId);
          const next = { ...enter(state, 'drawing'), round: state.round + 1, upNextId: null, guessedBy: null };
          return {
            ok: true,
            state: dealWord(ready ? { ...next, drawerId: state.upNextId as PlayerId } : nextDrawer(next, ctx), ctx),
          };
        }
      }
    }
  }
}

/** Board mode wakes up when the round's time runs out. Offline mode is untimed (no deadline). */
export function nextWakeup(state: PictionaryState): number | null {
  return state.phase.name === 'drawing' ? state.phase.deadline : null;
}

// ── Transitions ─────────────────────────────────────────────────────────────

function enter(state: PictionaryState, name: PictionaryPhase): PictionaryState {
  return { ...state, phase: { name, seq: state.phase.seq + 1, deadline: null } };
}

function newRound(state: PictionaryState, ctx: GameContext, round: number): PictionaryState {
  return dealWord(nextDrawer({ ...enter(state, 'drawing'), round }, ctx), ctx);
}

function timeIsUp(state: PictionaryState, ctx: GameContext): boolean {
  return state.phase.name === 'drawing' && state.phase.deadline !== null && ctx.now >= state.phase.deadline;
}

/** Show the word to everyone, and pick who draws next so they can get ready. */
function reveal(state: PictionaryState, outcome: RoundOutcome, guessedBy: PlayerId | null, ctx: GameContext): PictionaryState {
  return pickUpNext(
    {
      ...enter(state, 'reveal'),
      guessedBy,
      history: [...state.history, { round: state.round, drawerId: state.drawerId, word: state.word, outcome }],
    },
    ctx,
  );
}

function pickUpNext(state: PictionaryState, ctx: GameContext): PictionaryState {
  const { drawerId, queue } = pickDrawer(state, ctx);
  return { ...state, upNextId: drawerId, queue };
}

function canDraw(state: PictionaryState, id: PlayerId): boolean {
  return state.online[id] === true && !state.gone.includes(id);
}

function nextDrawer(state: PictionaryState, ctx: GameContext): PictionaryState {
  const { drawerId, queue } = pickDrawer(state, ctx);
  return { ...state, drawerId, queue };
}

/**
 * The next online player from this cycle's queue. Once nobody in the queue is online, a new
 * cycle starts with everyone still in the game, reshuffled (avoiding the same drawer twice
 * in a row when there's a choice).
 */
function pickDrawer(state: PictionaryState, ctx: GameContext): { drawerId: PlayerId; queue: PlayerId[] } {
  const can = (id: PlayerId) => canDraw(state, id);
  let queue = state.queue.filter((id) => !state.gone.includes(id));
  if (!queue.some(can)) {
    queue = shuffle(
      state.players.map((p) => p.id).filter((id) => !state.gone.includes(id)),
      ctx.rng,
    );
    const first = queue.findIndex(can);
    if (queue[first] === state.drawerId) {
      const swap = queue.findIndex((id, i) => i > first && can(id));
      if (swap !== -1) [queue[first], queue[swap]] = [queue[swap] as PlayerId, queue[first] as PlayerId];
    }
  }
  // Nobody online at all: keep the current drawer (or, at setup, the first seat) until someone comes back.
  const drawerId = queue.find(can) ?? (state.drawerId || state.players[0]?.id || '');
  return { drawerId, queue: queue.filter((id) => id !== drawerId) };
}

/**
 * A fresh word the group hasn't had this game (the list starts over if a game uses them all).
 * Board mode: a new word also means a blank board and a full countdown.
 */
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
  const deadline = isBoard(state) ? ctx.now + state.settings.drawSeconds * 1000 : null;
  return {
    ...state,
    phase: { ...state.phase, deadline },
    word: picked.text,
    genreId: picked.genreId,
    usedWords: [...used],
    wordSeq: state.wordSeq + 1,
  };
}
