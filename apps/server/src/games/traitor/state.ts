import type { PlayerId, TraitorPhase, TraitorSettings, VoteTarget } from '@party/shared';
import type { BaseState, Phase } from '../../engine/game';
import type { VoteState } from '../../engine/voting';

export interface NightPick {
  target: PlayerId | null;
  locked: boolean;
}

/** Server-only state. Never sent to clients; views are built from it in views.ts. */
export interface TraitorState extends BaseState {
  phase: Phase<TraitorPhase>;
  settings: TraitorSettings;
  /** Seat order. */
  players: readonly { id: PlayerId; name: string }[];
  online: Readonly<Record<PlayerId, boolean>>;
  /** When each away player went away (epoch ms); absent while online. */
  awaySince: Readonly<Record<PlayerId, number>>;
  traitorIds: readonly PlayerId[];
  /** In order of death. Dead players are spectators for the rest of the game. */
  dead: readonly { id: PlayerId; how: 'killed' | 'evicted' }[];
  round: number;
  /**
   * Night picks for every living player: traitors choose a victim, civilians a suspect
   * (cover only). Null outside the night.
   */
  night: Readonly<Record<PlayerId, NightPick>> | null;
  /** The last night's victim (null = nobody), shown in the morning. */
  victimId: PlayerId | null;
  vote: VoteState | null;
  dayResult: {
    evictedId: PlayerId | null;
    reason: 'tie' | 'skip' | null;
    counts: { target: VoteTarget; count: number }[];
    ballots: { voter: PlayerId; target: VoteTarget }[];
  } | null;
  outcome: { winner: 'civilians' | 'traitors'; detail: string } | null;
}

export function isTraitor(state: TraitorState, id: PlayerId): boolean {
  return state.traitorIds.includes(id);
}

export function deathOf(state: TraitorState, id: PlayerId): 'killed' | 'evicted' | null {
  return state.dead.find((d) => d.id === id)?.how ?? null;
}

export function isAlive(state: TraitorState, id: PlayerId): boolean {
  return deathOf(state, id) === null;
}

export function alivePlayers(state: TraitorState): PlayerId[] {
  return state.players.map((p) => p.id).filter((id) => isAlive(state, id));
}

export function playerName(state: TraitorState, id: PlayerId): string {
  return state.players.find((p) => p.id === id)?.name ?? 'Someone';
}

/** Who a player may tap at night: traitors pick living civilians; civilians anyone else alive. */
export function nightOptions(state: TraitorState, viewer: PlayerId): PlayerId[] {
  const alive = alivePlayers(state).filter((id) => id !== viewer);
  return isTraitor(state, viewer) ? alive.filter((id) => !isTraitor(state, id)) : alive;
}
