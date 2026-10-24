import {
  TRAITOR_AWAY_CUTOFF_MS,
  TRAITOR_NIGHT_MS,
  TRAITOR_VOTE_MS,
  traitorCountFor,
  type PlayerId,
  type TraitorAction,
  type TraitorPhase,
  type TraitorSettings,
} from '@party/shared';
import type { GameContext, GameInput, SetupInput, Step } from '../../engine/game';
import { shuffle } from '../../engine/rng';
import { castVote, isComplete, openVote, tally } from '../../engine/voting';
import { alivePlayers, isAlive, isTraitor, nightOptions, playerName, type NightPick, type TraitorState } from './state';

export function setup(input: SetupInput<TraitorSettings>, ctx: GameContext): TraitorState {
  const { players, settings } = input;
  const count = Math.min(traitorCountFor(settings, players.length), players.length - 1);
  const traitorIds = shuffle(
    players.map((p) => p.id),
    ctx.rng,
  ).slice(0, count);

  return {
    phase: { name: 'roles', seq: 1, deadline: null },
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name })),
    online: Object.fromEntries(players.map((p) => [p.id, p.online])),
    awaySince: Object.fromEntries(players.filter((p) => !p.online).map((p) => [p.id, ctx.now])),
    traitorIds,
    dead: [],
    round: 0,
    night: null,
    victimId: null,
    vote: null,
    dayResult: null,
    outcome: null,
  };
}

export function reduce(state: TraitorState, input: GameInput<TraitorAction>, ctx: GameContext): Step<TraitorState> {
  if (state.outcome) return { ok: false, error: 'WRONG_PHASE' };

  switch (input.kind) {
    case 'presence':
    case 'left': {
      const online = input.kind === 'presence' ? input.online : false;
      if (state.online[input.playerId] === online) return { ok: true, state };
      const awaySince = { ...state.awaySince };
      if (online) delete awaySince[input.playerId];
      else awaySince[input.playerId] = ctx.now;
      const next = { ...state, online: { ...state.online, [input.playerId]: online }, awaySince };
      return { ok: true, state: settle(next, ctx) };
    }

    case 'tick':
      return { ok: true, state: onTick(state, ctx) };

    case 'action': {
      const { by, isHost, action } = input;
      const phase = state.phase.name;
      switch (action.type) {
        case 'continue': {
          if (!isHost) return { ok: false, error: 'NOT_HOST' };
          if (phase === 'roles' || phase === 'reveal') return { ok: true, state: startNight(state, ctx) };
          if (phase === 'morning') return { ok: true, state: enter(state, 'day', null) };
          return { ok: false, error: 'WRONG_PHASE' };
        }

        case 'startVote': {
          if (!isHost) return { ok: false, error: 'NOT_HOST' };
          if (phase !== 'day') return { ok: false, error: 'WRONG_PHASE' };
          return {
            ok: true,
            state: { ...enter(state, 'vote', ctx.now + TRAITOR_VOTE_MS), vote: openVote(alivePlayers(state)) },
          };
        }

        case 'vote': {
          if (phase !== 'vote' || !state.vote) return { ok: false, error: 'WRONG_PHASE' };
          const vote = castVote(state.vote, by, action.target);
          if (vote === 'NOT_ALLOWED' || vote === 'INVALID_TARGET') return { ok: false, error: vote };
          return { ok: true, state: settle({ ...state, vote }, ctx) };
        }

        case 'pick':
        case 'lock':
        case 'unlock': {
          if (phase !== 'night' || !state.night) return { ok: false, error: 'WRONG_PHASE' };
          const mine = state.night[by];
          if (!mine) return { ok: false, error: 'NOT_ALLOWED' }; // dead, or not in the game
          let next: NightPick;
          if (action.type === 'pick') {
            if (!nightOptions(state, by).includes(action.target)) return { ok: false, error: 'INVALID_TARGET' };
            // Changing your pick releases your lock, so the team re-agrees deliberately.
            next = { target: action.target, locked: false };
          } else if (action.type === 'lock') {
            if (mine.target === null) return { ok: false, error: 'NOT_ALLOWED' };
            next = { ...mine, locked: true };
          } else {
            next = { ...mine, locked: false };
          }
          return { ok: true, state: settle({ ...state, night: { ...state.night, [by]: next } }, ctx) };
        }
      }
    }
  }
}

/** The earliest deadline: the phase timer, or a traitor reaching the 15s away cutoff at night. */
export function nextWakeup(state: TraitorState): number | null {
  if (state.outcome) return null;
  const times: number[] = [];
  if (state.phase.deadline !== null) times.push(state.phase.deadline);
  if (state.phase.name === 'night') {
    for (const id of state.traitorIds) {
      const since = state.awaySince[id];
      if (since !== undefined && isAlive(state, id)) times.push(since + TRAITOR_AWAY_CUTOFF_MS);
    }
  }
  return times.length ? Math.min(...times) : null;
}

// ── Transitions ─────────────────────────────────────────────────────────────

function enter(state: TraitorState, name: TraitorPhase, deadline: number | null): TraitorState {
  return { ...state, phase: { name, seq: state.phase.seq + 1, deadline } };
}

function finish(state: TraitorState, winner: 'civilians' | 'traitors', detail: string): TraitorState {
  return { ...enter(state, 'over', null), night: null, vote: null, outcome: { winner, detail } };
}

function startNight(state: TraitorState, ctx: GameContext): TraitorState {
  const night = Object.fromEntries(alivePlayers(state).map((id) => [id, { target: null, locked: false }]));
  const next: TraitorState = {
    ...enter(state, 'night', ctx.now + TRAITOR_NIGHT_MS),
    round: state.round + 1,
    night,
    victimId: null,
    dayResult: null,
  };
  return settle(next, ctx);
}

function onTick(state: TraitorState, ctx: GameContext): TraitorState {
  const { deadline, name } = state.phase;
  if (deadline !== null && ctx.now >= deadline) {
    if (name === 'night') return endNight(state, null);
    if (name === 'vote') return closeVote(state);
  }
  // Not a phase deadline: maybe an away traitor just passed the cutoff.
  return settle(state, ctx);
}

/**
 * After any change: end the night once everyone has locked in and the traitors agree, or
 * the vote once everyone has voted.
 */
function settle(state: TraitorState, ctx: GameContext): TraitorState {
  if (state.phase.name === 'night') {
    if (!everyoneLocked(state)) return state;
    const victim = unanimousTarget(state, ctx);
    return victim === null ? state : endNight(state, victim);
  }
  if (state.phase.name === 'vote' && state.vote && isComplete(state.vote, (id) => state.online[id] === true)) {
    return closeVote(state);
  }
  return state;
}

/**
 * Every living, connected player has locked a pick. The night waits for this so that it
 * always ends on whoever locks last, not the moment the traitors agree, which would point
 * at whoever just tapped (SPEC §7, 2026-10-24). Away players aren't waited for.
 */
function everyoneLocked(state: TraitorState): boolean {
  return alivePlayers(state)
    .filter((id) => state.online[id] === true)
    .every((id) => state.night?.[id]?.locked === true);
}

/**
 * The victim, once every eligible traitor has locked the same living civilian. Eligible:
 * alive, and not away for 15s or more. If no traitor is eligible, the night waits for the cap.
 */
function unanimousTarget(state: TraitorState, ctx: GameContext): PlayerId | null {
  if (!state.night) return null;
  const eligible = state.traitorIds.filter((id) => {
    if (!isAlive(state, id)) return false;
    const since = state.awaySince[id];
    return since === undefined || ctx.now - since < TRAITOR_AWAY_CUTOFF_MS;
  });
  if (eligible.length === 0) return null;
  const picks = eligible.map((id) => state.night?.[id]);
  const target = picks[0]?.target ?? null;
  if (target === null || isTraitor(state, target) || !isAlive(state, target)) return null;
  return picks.every((p) => p?.locked && p.target === target) ? target : null;
}

function endNight(state: TraitorState, victim: PlayerId | null): TraitorState {
  const base: TraitorState = { ...state, night: null, victimId: victim };
  if (victim === null) return enter(base, 'morning', null);
  const next: TraitorState = { ...base, dead: [...state.dead, { id: victim, how: 'killed' }] };
  return checkWin(next, `${playerName(state, victim)} was killed in the night.`) ?? enter(next, 'morning', null);
}

function closeVote(state: TraitorState): TraitorState {
  if (!state.vote) return state;
  const { outcome, counts, ballots } = tally(state.vote);
  const evictedId = outcome.kind === 'out' ? outcome.id : null;
  const next: TraitorState = {
    ...state,
    vote: null,
    dead: evictedId ? [...state.dead, { id: evictedId, how: 'evicted' }] : state.dead,
    dayResult: { evictedId, reason: outcome.kind === 'none' ? outcome.reason : null, counts, ballots },
  };
  const detail = evictedId ? `${playerName(state, evictedId)} was voted out.` : 'Nobody was voted out.';
  return checkWin(next, detail) ?? enter(next, 'reveal', null);
}

/** SPEC §3.2: civilians win when every traitor is out; traitors when they match the civilians. */
function checkWin(state: TraitorState, lastEvent: string): TraitorState | null {
  const alive = alivePlayers(state);
  const traitors = alive.filter((id) => isTraitor(state, id)).length;
  const civilians = alive.length - traitors;
  const names = state.traitorIds.map((id) => playerName(state, id)).join(' and ');
  if (traitors === 0) {
    return finish(state, 'civilians', `${lastEvent} Every traitor is out. The traitor${state.traitorIds.length > 1 ? 's were' : ' was'} ${names}.`);
  }
  if (traitors >= civilians) {
    return finish(state, 'traitors', `${lastEvent} The traitors now match the civilians in number.`);
  }
  return null;
}
