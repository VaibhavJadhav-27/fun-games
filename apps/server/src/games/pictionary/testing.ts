import { loadWordBank } from '@party/content';
import { pictionaryDefaultSettings, type PictionaryAction, type PictionarySettings } from '@party/shared';
import type { GameContext, GameInput, Step } from '../../engine/game';
import { deepFreeze } from '../../engine/freeze';
import { seededRng, type Rng } from '../../engine/rng';
import { pictionary } from './index';
import type { PictionaryState } from './state';

/** Test harness: a seeded rng around the pure Pictionary reducer. */
export const BANK = loadWordBank();

export function playerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

export class PictionaryHarness {
  now = 1_000_000;
  readonly rng: Rng;
  state: PictionaryState;
  readonly host: string;
  readonly ids: string[];

  constructor(n: number, settings: Partial<PictionarySettings> = {}, seed = 1) {
    this.rng = seededRng(seed);
    this.ids = playerIds(n);
    this.host = this.ids[0] as string;
    this.state = deepFreeze(
      pictionary.setup(
        {
          players: this.ids.map((id) => ({ id, name: `Player ${id.slice(1)}`, online: true })),
          settings: { ...pictionaryDefaultSettings(), ...settings },
          moderator: null,
        },
        this.ctx(),
      ),
    );
  }

  ctx(): GameContext {
    return { now: this.now, rng: this.rng, bank: BANK };
  }

  get drawer(): string {
    return this.state.drawerId;
  }

  input(input: GameInput<PictionaryAction>): Step<PictionaryState> {
    const step = pictionary.reduce(this.state, input, this.ctx());
    if (step.ok) this.state = deepFreeze(step.state);
    return step;
  }

  act(by: string, action: PictionaryAction): Step<PictionaryState> {
    return this.input({ kind: 'action', by, isHost: by === this.host, action });
  }

  /** Must succeed. */
  do(by: string, action: PictionaryAction): void {
    const step = this.act(by, action);
    if (!step.ok) throw new Error(`${by} ${action.type}: ${step.error}`);
  }

  /** Host marks it guessed, then starts the next round. */
  completeRound(): void {
    this.do(this.host, { type: 'guessed' });
    this.do(this.host, { type: 'next' });
  }
}
