import { loadWordBank } from '@party/content';
import { traitorDefaultSettings, type TraitorAction, type TraitorSettings } from '@party/shared';
import { deepFreeze } from '../../engine/freeze';
import type { GameContext, GameInput, Step } from '../../engine/game';
import { seededRng, type Rng } from '../../engine/rng';
import { traitor } from './index';
import { alivePlayers, type TraitorState } from './state';

/** Test harness: a fake clock and a seeded rng around the pure Traitor reducer. */
const BANK = loadWordBank();

export class TraitorHarness {
  now = 1_000_000;
  readonly rng: Rng;
  state: TraitorState;
  readonly host = 'p1';

  constructor(n: number, settings: Partial<TraitorSettings> = {}, seed = 1) {
    this.rng = seededRng(seed);
    const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
    this.state = deepFreeze(
      traitor.setup(
        {
          players: ids.map((id) => ({ id, name: `Player ${id.slice(1)}`, online: true })),
          settings: { ...traitorDefaultSettings(), ...settings },
          moderator: null,
        },
        this.ctx(),
      ),
    );
  }

  ctx(): GameContext {
    return { now: this.now, rng: this.rng, bank: BANK };
  }

  get traitors(): string[] {
    return [...this.state.traitorIds];
  }

  get civilians(): string[] {
    return this.state.players.map((p) => p.id).filter((id) => !this.state.traitorIds.includes(id));
  }

  get alive(): string[] {
    return alivePlayers(this.state);
  }

  input(input: GameInput<TraitorAction>): Step<TraitorState> {
    const step = traitor.reduce(this.state, input, this.ctx());
    if (step.ok) this.state = deepFreeze(step.state);
    return step;
  }

  act(by: string, action: TraitorAction): Step<TraitorState> {
    return this.input({ kind: 'action', by, isHost: by === this.host, action });
  }

  /** Must succeed. */
  do(by: string, action: TraitorAction): void {
    const step = this.act(by, action);
    if (!step.ok) throw new Error(`${by} ${action.type}: ${step.error}`);
  }

  advance(ms: number): void {
    this.now += ms;
    this.input({ kind: 'tick' });
  }

  continue(): void {
    this.do(this.host, { type: 'continue' });
  }

  /** Every living traitor picks and locks `victim`, then the civilians lock a suspect. */
  kill(victim: string): void {
    for (const id of this.traitors.filter((t) => this.alive.includes(t))) {
      this.do(id, { type: 'pick', target: victim });
      this.do(id, { type: 'lock' });
    }
    this.lockCivilians();
  }

  /** Every living civilian who hasn't locked yet picks a suspect and locks it. */
  lockCivilians(except: string[] = []): void {
    for (const id of this.civilians.filter((c) => this.alive.includes(c) && !except.includes(c))) {
      if (this.state.phase.name !== 'night' || this.state.night?.[id]?.locked) continue;
      const suspect = this.alive.find((other) => other !== id) as string;
      this.do(id, { type: 'pick', target: suspect });
      this.do(id, { type: 'lock' });
    }
  }

  /** From the day: open the vote and have every living player vote for `target` (target votes skip). */
  voteOut(target: string | 'skip'): void {
    this.do(this.host, { type: 'startVote' });
    for (const id of this.alive) this.do(id, { type: 'vote', target: id === target ? 'skip' : target });
  }
}
