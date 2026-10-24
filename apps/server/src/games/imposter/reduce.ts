import {
  IMPOSTER_GUESS_MS,
  IMPOSTER_VOTE_MS,
  type ImposterAction,
  type ImposterPhase,
  type ImposterSettings,
  type VoteResult,
} from '@party/shared';
import type { GameContext, GameInput, SetupInput, Step } from '../../engine/game';
import { shuffle } from '../../engine/rng';
import { castVote, isComplete, openVote, tally } from '../../engine/voting';
import { isCorrectGuess, pickWords } from '../../engine/words';
import { alivePlayers, isImposter, playerName, type ImposterState } from './state';

export function setup(input: SetupInput<ImposterSettings>, ctx: GameContext): ImposterState {
  const { players, settings, moderator } = input;
  const picked =
    settings.source === 'custom'
      ? { text: settings.customWord, genreId: null }
      : pickWords(ctx.bank, settings.genres, settings.difficulty, 1, ctx.rng)[0];
  if (!picked?.text) throw new Error('No word available');
  const imposterIds = shuffle(
    players.map((p) => p.id),
    ctx.rng,
  ).slice(0, settings.imposters);

  return {
    phase: { name: 'discussion', seq: 1, deadline: null },
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name })),
    online: Object.fromEntries(players.map((p) => [p.id, p.online])),
    word: picked.text,
    genreId: picked.genreId,
    moderatorId: moderator,
    imposterIds,
    evicted: [],
    round: 1,
    vote: null,
    lastResult: null,
    lastGuess: null,
    outcome: null,
  };
}

export function reduce(state: ImposterState, input: GameInput<ImposterAction>, ctx: GameContext): Step<ImposterState> {
  if (state.outcome) return { ok: false, error: 'WRONG_PHASE' };

  switch (input.kind) {
    case 'presence':
    case 'left': {
      const online = input.kind === 'presence' ? input.online : false;
      if (state.online[input.playerId] === online) return { ok: true, state };
      const next = { ...state, online: { ...state.online, [input.playerId]: online } };
      return { ok: true, state: maybeCloseVote(next, ctx) };
    }

    case 'tick':
      return { ok: true, state: onTick(state, ctx) };

    case 'action': {
      const { by, isHost, action } = input;
      switch (action.type) {
        case 'startVote': {
          if (!isHost) return { ok: false, error: 'NOT_HOST' };
          if (state.phase.name !== 'discussion') return { ok: false, error: 'WRONG_PHASE' };
          return {
            ok: true,
            state: {
              ...enter(state, 'vote', ctx.now + IMPOSTER_VOTE_MS),
              vote: openVote(alivePlayers(state)),
            },
          };
        }

        case 'vote': {
          if (state.phase.name !== 'vote' || !state.vote) return { ok: false, error: 'WRONG_PHASE' };
          const vote = castVote(state.vote, by, action.target);
          if (vote === 'NOT_ALLOWED' || vote === 'INVALID_TARGET') return { ok: false, error: vote };
          return { ok: true, state: maybeCloseVote({ ...state, vote }, ctx) };
        }

        case 'guess': {
          if (state.phase.name !== 'lastGuess' || !state.lastGuess) return { ok: false, error: 'WRONG_PHASE' };
          if (state.lastGuess.by !== by) return { ok: false, error: 'NOT_ALLOWED' };
          if (isCorrectGuess(action.text, state.word)) {
            return {
              ok: true,
              state: finish(state, 'imposters', `${playerName(state, by)} guessed the word: ${state.word}`),
            };
          }
          const next = { ...state, lastGuess: { by, status: 'wrong' as const, text: action.text } };
          return { ok: true, state: afterCaughtImposter(next) };
        }

        case 'continue': {
          if (!isHost) return { ok: false, error: 'NOT_HOST' };
          if (state.phase.name !== 'result') return { ok: false, error: 'WRONG_PHASE' };
          return {
            ok: true,
            state: {
              ...enter(state, 'discussion', null),
              round: state.round + 1,
              lastResult: null,
              lastGuess: null,
            },
          };
        }
      }
    }
  }
}

export function nextWakeup(state: ImposterState): number | null {
  return state.outcome ? null : state.phase.deadline;
}

// ── Transitions ─────────────────────────────────────────────────────────────

function enter(state: ImposterState, name: ImposterPhase, deadline: number | null): ImposterState {
  return { ...state, phase: { name, seq: state.phase.seq + 1, deadline } };
}

function finish(state: ImposterState, winner: 'crew' | 'imposters', detail: string): ImposterState {
  return { ...enter(state, 'over', null), vote: null, outcome: { winner, detail } };
}

function onTick(state: ImposterState, ctx: GameContext): ImposterState {
  const { deadline, name } = state.phase;
  if (deadline === null || ctx.now < deadline) return state;
  if (name === 'vote') return closeVote(state, ctx);
  if (name === 'lastGuess' && state.lastGuess) {
    return afterCaughtImposter({ ...state, lastGuess: { ...state.lastGuess, status: 'timeout' } });
  }
  return state;
}

function maybeCloseVote(state: ImposterState, ctx: GameContext): ImposterState {
  if (state.phase.name !== 'vote' || !state.vote) return state;
  return isComplete(state.vote, (id) => state.online[id] === true) ? closeVote(state, ctx) : state;
}

function closeVote(state: ImposterState, ctx: GameContext): ImposterState {
  if (!state.vote) return state;
  const { outcome, counts, ballots } = tally(state.vote);
  const base = { ...state, vote: null };

  if (outcome.kind === 'none') {
    const lastResult: VoteResult = { outcome: 'nobody', evictedId: null, reason: outcome.reason, counts, ballots };
    return afterRound({ ...base, lastResult });
  }

  const caught = isImposter(state, outcome.id);
  const lastResult: VoteResult = {
    outcome: caught ? 'caught' : 'innocent',
    evictedId: outcome.id,
    reason: null,
    counts,
    ballots,
  };
  const evictedState = { ...base, evicted: [...state.evicted, outcome.id], lastResult };
  if (caught) {
    return {
      ...enter(evictedState, 'lastGuess', ctx.now + IMPOSTER_GUESS_MS),
      lastGuess: { by: outcome.id, status: 'pending', text: null },
    };
  }
  return afterRound(evictedState);
}

/** A caught imposter failed (or timed out) their guess: they're out for good. */
function afterCaughtImposter(state: ImposterState): ImposterState {
  const remaining = state.imposterIds.filter((id) => !state.evicted.includes(id));
  if (remaining.length === 0) {
    const caught = state.imposterIds.map((id) => playerName(state, id)).join(' and ');
    return finish(state, 'crew', `${caught} ${state.imposterIds.length > 1 ? 'were' : 'was'} caught. The word was ${state.word}.`);
  }
  return afterRound(state);
}

/** End of a round with imposters still in: check the win conditions, else show the result. */
function afterRound(state: ImposterState): ImposterState {
  const alive = alivePlayers(state);
  const imposters = alive.filter((id) => isImposter(state, id)).length;
  const crew = alive.length - imposters;
  if (imposters >= crew) {
    return finish(state, 'imposters', 'The imposters now match the crew in number.');
  }
  if (state.round >= state.settings.maxRounds) {
    return finish(
      state,
      'imposters',
      `The imposter${state.imposterIds.length > 1 ? 's' : ''} survived ${state.settings.maxRounds} round${state.settings.maxRounds > 1 ? 's' : ''}.`,
    );
  }
  return enter(state, 'result', null);
}
