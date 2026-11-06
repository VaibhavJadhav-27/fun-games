import { PICTIONARY_GRID, type GameStreamOp } from '@party/shared';
import { PAPER, colorOf, widthOf, type Point, type Seg } from './drawing';

/** Draw one segment. `boardPx` is the canvas's width (and height) in device pixels. */
export function drawSeg(ctx: CanvasRenderingContext2D, seg: Pick<Seg, 'color' | 'size' | 'pts'>, boardPx: number): void {
  const scale = boardPx / PICTIONARY_GRID;
  const width = widthOf(seg, boardPx);
  ctx.strokeStyle = ctx.fillStyle = colorOf(seg.color);
  const first = seg.pts[0];
  if (!first) return;
  if (seg.pts.length === 1) {
    ctx.beginPath();
    ctx.arc(first[0] * scale, first[1] * scale, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(first[0] * scale, first[1] * scale);
  for (let i = 1; i < seg.pts.length; i++) {
    const p = seg.pts[i] as Point;
    ctx.lineTo(p[0] * scale, p[1] * scale);
  }
  ctx.stroke();
}

/** Blank paper, then every op (already compacted, so only segments remain). */
export function drawAll(ctx: CanvasRenderingContext2D, ops: readonly GameStreamOp[], boardPx: number): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, boardPx, boardPx);
  for (const op of ops) if (op.t === 'seg') drawSeg(ctx, op, boardPx);
}
