import type { GameStreamOp } from '@party/shared';

/** Caps per channel so one room can't grow without bound (a 3-minute drawing is far below). */
export const STREAM_MAX_OPS = 4_000;
export const STREAM_MAX_POINTS = 40_000;

/**
 * The current stream channel's ops, kept compacted as they arrive: `undo` removes that
 * stroke's segments and `clear` empties the buffer, so a late joiner replays only what is
 * on the board (ARCHITECTURE §7.4). A new channel key starts an empty buffer.
 * Game-agnostic: it only understands the seg / undo / clear op shapes.
 */
export class StreamBuffer {
  private key: string | null = null;
  private ops: GameStreamOp[] = [];
  private points = 0;

  get channelKey(): string | null {
    return this.key;
  }

  /** Drop everything if the channel moved on. */
  sync(channelKey: string | null): void {
    if (channelKey === this.key) return;
    this.key = channelKey;
    this.ops = [];
    this.points = 0;
  }

  /** Apply one op. Returns false when it's dropped (over the cap, or undo of an unknown stroke). */
  append(op: GameStreamOp): boolean {
    switch (op.t) {
      case 'seg':
        if (this.ops.length >= STREAM_MAX_OPS || this.points + op.pts.length > STREAM_MAX_POINTS) return false;
        this.ops.push(op);
        this.points += op.pts.length;
        return true;
      case 'undo': {
        const kept = this.ops.filter((o) => !(o.t === 'seg' && o.id === op.id));
        if (kept.length === this.ops.length) return false;
        this.ops = kept;
        this.points = countPoints(kept);
        return true;
      }
      case 'clear':
        this.ops = [];
        this.points = 0;
        return true;
    }
  }

  snapshot(): GameStreamOp[] {
    return [...this.ops];
  }
}

function countPoints(ops: readonly GameStreamOp[]): number {
  return ops.reduce((n, o) => n + (o.t === 'seg' ? o.pts.length : 0), 0);
}
