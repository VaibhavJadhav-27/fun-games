import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { PICTIONARY_ERASER, type GameStreamOp } from '@party/shared';
import { sendStreamOp } from '../../socket/actions';
import { useStore } from '../../socket/store';
import { PEN_COLORS, PEN_SIZES, lastStrokeId, newStrokeId, toGrid, toSegments, type Point } from './drawing';
import { drawAll, drawSeg } from './strokeRenderer';

/** How often the drawer's points are batched and sent (SPEC §6: ~50ms). */
const FLUSH_MS = 50;

interface Stroke {
  id: string;
  color: number;
  size: number;
  /** Last point already sent, so the next segment joins on. */
  sent: Point | null;
  pending: Point[];
}

/**
 * The shared drawing board: a square of white paper. Everyone sees the strokes live; only the
 * drawer (`canDraw`) gets the pen and toolbar. Rendering is incremental: appended segments are
 * drawn on top, anything else (undo, clear, reset, resize) redraws from scratch.
 */
export function Board({ canDraw }: { canDraw: boolean }) {
  const ops = useStore((s) => s.board?.ops);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(0);
  const drawn = useRef<{ ops: readonly GameStreamOp[]; px: number }>({ ops: [], px: 0 });
  const stroke = useRef<Stroke | null>(null);
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(1);

  // Match the canvas to its on-screen size in device pixels.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => setPx(Math.round(wrap.clientWidth * (window.devicePixelRatio || 1)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Draw what's new, or everything when the board changed in any other way (undo, clear,
  // reset, or a resize, which also wipes the bitmap).
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || px === 0) return;
    const next = ops ?? [];
    const prev = drawn.current.ops;
    const appended =
      drawn.current.px === px &&
      prev.length > 0 &&
      next.length >= prev.length &&
      next[prev.length - 1] === prev[prev.length - 1];
    if (appended) {
      for (let i = prev.length; i < next.length; i++) {
        const op = next[i];
        if (op?.t === 'seg') drawSeg(ctx, op, px);
      }
    } else {
      drawAll(ctx, next, px);
    }
    drawn.current = { ops: next, px };
  }, [ops, px]);

  // Send the drawer's pending points in batches.
  useEffect(() => {
    if (!canDraw) return;
    const id = setInterval(() => flush(), FLUSH_MS);
    return () => {
      clearInterval(id);
      flush();
      stroke.current = null;
    };
  }, [canDraw]);

  function flush(): void {
    const s = stroke.current;
    if (!s || s.pending.length === 0) return;
    for (const pts of toSegments(s.sent, s.pending)) sendStreamOp({ t: 'seg', id: s.id, color: s.color, size: s.size, pts });
    s.sent = s.pending.at(-1) ?? s.sent;
    s.pending = [];
  }

  function pointAt(e: PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return toGrid(e.clientX - rect.left, e.clientY - rect.top, rect.width);
  }

  /** Draw locally right away, so the pen feels instant before the batch goes out. */
  function preview(from: Point | null, to: Point): void {
    const ctx = canvasRef.current?.getContext('2d');
    const s = stroke.current;
    if (!ctx || !s || px === 0) return;
    drawSeg(ctx, { color: s.color, size: s.size, pts: from ? [from, to] : [to] }, px);
  }

  function onDown(e: PointerEvent<HTMLCanvasElement>): void {
    if (!canDraw || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    flush();
    const p = pointAt(e);
    stroke.current = { id: newStrokeId(), color, size, sent: null, pending: [p] };
    preview(null, p);
  }

  function onMove(e: PointerEvent<HTMLCanvasElement>): void {
    const s = stroke.current;
    if (!canDraw || !s || !e.isPrimary) return;
    const p = pointAt(e);
    const last = s.pending.at(-1) ?? s.sent;
    if (last && last[0] === p[0] && last[1] === p[1]) return;
    s.pending.push(p);
    preview(last, p);
  }

  function onUp(): void {
    flush();
    stroke.current = null;
  }

  const empty = !ops || ops.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div ref={wrapRef} className="relative aspect-square w-full overflow-hidden rounded-3xl border border-line bg-white">
        <canvas
          ref={canvasRef}
          width={px}
          height={px}
          className={`block h-full w-full touch-none select-none ${canDraw ? 'cursor-crosshair' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label={canDraw ? 'Drawing board: draw here' : 'Drawing board'}
          role="img"
        />
        {empty && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
            {canDraw ? 'Draw here' : 'Waiting for the first stroke…'}
          </p>
        )}
      </div>

      {canDraw && (
        <Toolbar
          color={color}
          size={size}
          canUndo={!empty}
          onColor={setColor}
          onSize={setSize}
          onUndo={() => {
            flush();
            const id = ops ? lastStrokeId(ops) : null;
            if (id) sendStreamOp({ t: 'undo', id });
          }}
          onClear={() => {
            if (!window.confirm('Clear the whole board?')) return;
            stroke.current = null;
            sendStreamOp({ t: 'clear' });
          }}
        />
      )}
    </div>
  );
}

function Toolbar(props: {
  color: number;
  size: number;
  canUndo: boolean;
  onColor(c: number): void;
  onSize(s: number): void;
  onUndo(): void;
  onClear(): void;
}) {
  const { color, size, canUndo, onColor, onSize, onUndo, onClear } = props;
  const ring = (on: boolean) => (on ? 'ring-3 ring-accent ring-offset-2 ring-offset-ink' : '');
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-9 gap-1.5" role="radiogroup" aria-label="Colour">
        {PEN_COLORS.map((hex, i) => (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={color === i}
            aria-label={`Colour ${i + 1}`}
            onClick={() => onColor(i)}
            className={`aspect-square min-h-9 rounded-full border border-line ${ring(color === i)}`}
            style={{ backgroundColor: hex }}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={color === PICTIONARY_ERASER}
          aria-label="Eraser"
          onClick={() => onColor(PICTIONARY_ERASER)}
          className={`flex aspect-square min-h-9 items-center justify-center rounded-full border border-line bg-white text-lg ${ring(color === PICTIONARY_ERASER)}`}
        >
          🧽
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-2xl bg-panel-2 p-1" role="radiogroup" aria-label="Pen size">
          {PEN_SIZES.map((_, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={size === i}
              aria-label={['Thin', 'Medium', 'Thick'][i]}
              onClick={() => onSize(i)}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl ${size === i ? 'bg-accent' : 'active:bg-line'}`}
            >
              <span
                className={`rounded-full ${size === i ? 'bg-white' : 'bg-fg'}`}
                style={{ width: 4 + i * 6, height: 4 + i * 6 }}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="min-h-11 flex-1 rounded-2xl bg-panel-2 px-3 text-sm font-semibold active:bg-line disabled:opacity-40"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canUndo}
          className="min-h-11 flex-1 rounded-2xl bg-panel-2 px-3 text-sm font-semibold text-bad active:bg-line disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
