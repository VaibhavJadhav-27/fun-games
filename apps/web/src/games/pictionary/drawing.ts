import {
  PICTIONARY_ERASER,
  PICTIONARY_GRID,
  PICTIONARY_MAX_POINTS_PER_OP,
  type GameStreamOp,
  type PictionaryStreamOp,
} from '@party/shared';

/** Pen colours by index (PICTIONARY_COLORS of them); the board is always white paper. */
export const PEN_COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#92400e'];
export const PAPER = '#ffffff';
/** Line width as a fraction of the board's width, per size index. */
export const PEN_SIZES = [0.008, 0.018, 0.04];
const ERASER_SCALE = 2.5;

export type Point = [number, number];
export type Seg = Extract<PictionaryStreamOp, { t: 'seg' }>;

export function colorOf(color: number): string {
  return color === PICTIONARY_ERASER ? PAPER : (PEN_COLORS[color] ?? PEN_COLORS[0] as string);
}

export function widthOf(seg: Pick<Seg, 'color' | 'size'>, boardPx: number): number {
  const base = (PEN_SIZES[seg.size] ?? PEN_SIZES[1] as number) * boardPx;
  return seg.color === PICTIONARY_ERASER ? base * ERASER_SCALE : base;
}

/** The most recent stroke still on the board, for Undo. */
export function lastStrokeId(ops: readonly GameStreamOp[]): string | null {
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    if (op?.t === 'seg') return op.id;
  }
  return null;
}

/** A pointer position inside the board (0–1 of its size) on the shared grid. */
export function toGrid(x: number, y: number, size: number): Point {
  const q = (v: number) => Math.round(Math.min(1, Math.max(0, v / size)) * PICTIONARY_GRID);
  return [q(x), q(y)];
}

/**
 * Split pending points into segments of at most the allowed size. Each segment starts with
 * the previous one's last point (or `from`, the last point already sent), so it draws on its own.
 */
export function toSegments(from: Point | null, pending: readonly Point[]): Point[][] {
  const pts = from ? [from, ...pending] : [...pending];
  if (pts.length === 0) return [];
  const out: Point[][] = [];
  let start = 0;
  while (start < pts.length) {
    const chunk = pts.slice(start, start + PICTIONARY_MAX_POINTS_PER_OP);
    out.push(chunk);
    if (start + chunk.length >= pts.length) break;
    start += chunk.length - 1; // overlap one point so chunks join up
  }
  // A lone `from` point with nothing new is not worth sending.
  return from && pending.length === 0 ? [] : out;
}

export function newStrokeId(): string {
  return Math.random().toString(36).slice(2, 12) || 's';
}
