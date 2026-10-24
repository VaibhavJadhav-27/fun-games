import { loadWordBank } from '@party/content';
import { imposterDefaultSettings, type ImposterAction, type ImposterSettings } from '@party/shared';
import type { GameContext, GameInput, Step } from '../../engine/game';
import { deepFreeze } from '../../engine/freeze';
import { seededRng, type Rng } from '../../engine/rng';
import { imposter } from './index';
import type { ImposterState } from './state';

/** Test harness: a fake clock and a seeded rng around the pure Imposter reducer. */
export const BANK = loadWordBank();

export const MODERATOR = 'mod';

export function playerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

export class ImposterHarness {
  now = 1_000_000;
  readonly rng: Rng;
  state: ImposterState;
  readonly host: string;

  constructor(n: number, settings: Partial<ImposterSettings> = {}, seed = 1) {
    this.rng = seededRng(seed);
    const ids = playerIds(n);
    const cfg = { ...imposterDefaultSettings(), ...settings };
    // A custom word means the host moderates: they aren't one of the n players.
    const moderator = imposter.settings.hostModerates?.(cfg) ? MODERATOR : null;
    this.host = moderator ?? (ids[0] as string);
    this.state = deepFreeze(
      imposter.setup(
        {
          players: ids.map((id) => ({ id, name: `Player ${id.slice(1)}`, online: true })),
          settings: cfg,
          moderator,
        },
        this.ctx(),
      ),
    );
  }

  ctx(): GameContext {
    return { now: this.now, rng: this.rng, bank: BANK };
  }

  get imposters(): string[] {
    return [...this.state.imposterIds];
  }

  get crew(): string[] {
    return this.state.players.map((p) => p.id).filter((id) => !this.state.imposterIds.includes(id));
  }

  input(input: GameInput<ImposterAction>): Step<ImposterState> {
    const step = imposter.reduce(this.state, input, this.ctx());
    if (step.ok) this.state = deepFreeze(step.state);
    return step;
  }

  act(by: string, action: ImposterAction): Step<ImposterState> {
    return this.input({ kind: 'action', by, isHost: by === this.host, action });
  }

  /** Must succeed. */
  do(by: string, action: ImposterAction): void {
    const step = this.act(by, action);
    if (!step.ok) throw new Error(`${by} ${action.type}: ${step.error}`);
  }

  advance(ms: number): void {
    this.now += ms;
    this.input({ kind: 'tick' });
  }

  /** Everyone alive votes for `target` (target votes skip). */
  voteAll(target: string): void {
    const alive = this.state.players.map((p) => p.id).filter((id) => !this.state.evicted.includes(id));
    for (const id of alive) this.do(id, { type: 'vote', target: id === target ? 'skip' : target });
  }
}
