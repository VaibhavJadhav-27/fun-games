import type { GameStreamOp } from '@party/shared';

/**
 * Apply one stream op with the same compaction as the server's buffer (undo drops that
 * stroke, clear empties), so our own board always matches everyone else's. Earlier ops keep
 * their identity on append, so the canvas can draw only what's new.
 */
export function applyOp(ops: readonly GameStreamOp[], op: GameStreamOp): GameStreamOp[] {
  switch (op.t) {
    case 'seg':
      return [...ops, op];
    case 'undo':
      return ops.filter((o) => !(o.t === 'seg' && o.id === op.id));
    case 'clear':
      return [];
  }
}
