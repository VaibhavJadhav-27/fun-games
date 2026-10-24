import type { WordBank } from '@party/content';
import type { GameResult, GameView, PlayerId } from '@party/shared';
import { errorFields, log } from '../log';
import { err, ok, type Result } from '../rooms/result';
import { deepFreeze } from './freeze';
import type { AnyGame, BaseState, GameContext, GameInput, SetupInput } from './game';
import type { Rng } from './rng';

export interface RunnerDeps {
  bank: WordBank;
  rng: Rng;
  /** Called after a scheduler tick changed the state (not after direct dispatches). */
  onTick(): void;
  /** For logs only. */
  roomCode: string;
}

/**
 * Runs one game instance: applies inputs through the pure reducer, rolls back on
 * failure, keeps the single wakeup timer armed, and produces validated views.
 */
export class GameRunner {
  private state: BaseState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private epoch = 0;
  private disposed = false;
  /** Increases on every state change; sent with views so clients drop stale ones. */
  rev = 0;

  constructor(
    readonly def: AnyGame,
    input: SetupInput<unknown>,
    private readonly deps: RunnerDeps,
  ) {
    this.state = deepFreeze(def.setup(input, this.ctx()));
    this.arm();
  }

  get phaseSeq(): number {
    return this.state.phase.seq;
  }

  /** Apply a player action: schema-checked and guarded against stale phases. */
  action(by: PlayerId, isHost: boolean, phaseSeq: number, rawAction: unknown): Result<null> {
    const parsed = this.def.actionSchema.safeParse(rawAction);
    if (!parsed.success) return err('BAD_REQUEST');
    if (phaseSeq !== this.state.phase.seq) return err('STALE_PHASE');
    return this.dispatch({ kind: 'action', by, isHost, action: parsed.data });
  }

  dispatch(input: GameInput<unknown>): Result<null> {
    if (this.disposed) return err('WRONG_STATUS');
    let step;
    try {
      step = this.def.reduce(this.state, input, this.ctx());
    } catch (error) {
      // Rollback is free: the previous state is untouched (and frozen).
      log.error('game reduce threw', { room: this.deps.roomCode, game: this.def.id, input: input.kind, ...errorFields(error) });
      return err('INTERNAL');
    }
    if (!step.ok) return err(step.error);
    if (step.state !== this.state) {
      this.state = deepFreeze(step.state);
      this.rev++;
      this.arm();
    }
    return ok(null);
  }

  /** The player's view, validated against the game's strict schema. Null = do not send. */
  view(viewer: PlayerId): GameView | null {
    try {
      const view = this.def.getPlayerView(this.state, viewer);
      const checked = this.def.viewSchema.safeParse(view);
      if (!checked.success) {
        log.error('view failed schema; not sent', {
          room: this.deps.roomCode,
          game: this.def.id,
          issues: checked.error.issues.map((i) => `${i.path.join('.')}: ${i.code}`),
        });
        return null;
      }
      return checked.data as GameView;
    } catch (error) {
      log.error('getPlayerView threw', { room: this.deps.roomCode, game: this.def.id, ...errorFields(error) });
      return null;
    }
  }

  result(): GameResult | null {
    return this.def.result(this.state);
  }

  abort(): GameResult {
    return this.def.abort(this.state);
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  /** Test hook: the current (frozen) state. */
  peek(): BaseState {
    return this.state;
  }

  private ctx(): GameContext {
    return { now: Date.now(), rng: this.deps.rng, bank: this.deps.bank };
  }

  /** One timer per game, re-armed after every change. Stale callbacks are ignored by epoch. */
  private arm(): void {
    this.clearTimer();
    const wake = this.def.nextWakeup(this.state);
    if (wake === null || this.disposed) return;
    const epoch = ++this.epoch;
    this.timer = setTimeout(
      () => {
        if (epoch !== this.epoch || this.disposed) return;
        this.timer = null;
        const before = this.rev;
        this.dispatch({ kind: 'tick' });
        if (this.rev !== before) this.deps.onTick();
        else this.arm();
      },
      Math.max(0, wake - Date.now()),
    );
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
