import { describe, expect, it } from 'vitest';
import { PICTIONARY_MAX_POINTS_PER_OP, pictionaryStreamOpSchema, type GameStreamOp } from '@party/shared';
import { applyOp } from '../../socket/stream';
import { lastStrokeId, newStrokeId, toGrid, toSegments, type Point } from './drawing';

const seg = (id: string): GameStreamOp => ({ t: 'seg', id, color: 0, size: 0, pts: [[0, 0]] });

describe('applyOp', () => {
  it('appends segments, undo drops a whole stroke, clear empties', () => {
    let ops = applyOp([], seg('a'));
    ops = applyOp(ops, seg('b'));
    ops = applyOp(ops, seg('a'));
    expect(applyOp(ops, { t: 'undo', id: 'a' })).toEqual([seg('b')]);
    expect(applyOp(ops, { t: 'clear' })).toEqual([]);
  });

  it('keeps earlier ops by reference when appending (the canvas draws only the new ones)', () => {
    const first = [seg('a')];
    const next = applyOp(first, seg('b'));
    expect(next[0]).toBe(first[0]);
  });
});

describe('lastStrokeId', () => {
  it('finds the newest stroke still on the board', () => {
    expect(lastStrokeId([])).toBeNull();
    expect(lastStrokeId([seg('a'), seg('b')])).toBe('b');
  });
});

describe('toGrid', () => {
  it('normalises to the 0–1000 grid and clamps outside points', () => {
    expect(toGrid(50, 100, 200)).toEqual([250, 500]);
    expect(toGrid(-5, 400, 200)).toEqual([0, 1000]);
  });
});

describe('toSegments', () => {
  const pts = (n: number, from = 0): Point[] => Array.from({ length: n }, (_, i) => [from + i, 0]);

  it('starts with the last sent point so segments join up', () => {
    expect(toSegments([9, 9], [[1, 1]])).toEqual([[[9, 9], [1, 1]]]);
    expect(toSegments(null, [[1, 1]])).toEqual([[[1, 1]]]);
    expect(toSegments([9, 9], [])).toEqual([]);
  });

  it('splits long runs into valid ops that overlap by one point', () => {
    const chunks = toSegments(null, pts(150));
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(PICTIONARY_MAX_POINTS_PER_OP);
      expect(pictionaryStreamOpSchema.safeParse({ t: 'seg', id: newStrokeId(), color: 1, size: 2, pts: c }).success).toBe(true);
    }
    for (let i = 1; i < chunks.length; i++) expect(chunks[i]?.[0]).toEqual(chunks[i - 1]?.at(-1));
    expect(chunks.at(-1)?.at(-1)).toEqual([149, 0]);
  });
});
