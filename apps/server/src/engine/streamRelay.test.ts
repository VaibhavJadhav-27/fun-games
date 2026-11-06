import { afterEach, describe, expect, it } from 'vitest';
import { pictionaryDefaultSettings, type GameStreamOp } from '@party/shared';
import { pictionary } from '../games/pictionary';
import { BANK, playerIds } from '../games/pictionary/testing';
import { eraseGame } from './game';
import { seededRng } from './rng';
import { GameRunner } from './runner';
import { STREAM_MAX_OPS, StreamBuffer } from './streamRelay';

const seg = (id: string, pts: [number, number][] = [[1, 1]]): GameStreamOp => ({ t: 'seg', id, color: 0, size: 1, pts });

describe('StreamBuffer', () => {
  it('keeps segments, and undo removes every segment of that stroke', () => {
    const b = new StreamBuffer();
    b.sync('w1');
    expect(b.append(seg('a'))).toBe(true);
    expect(b.append(seg('b'))).toBe(true);
    expect(b.append(seg('a'))).toBe(true);
    expect(b.append({ t: 'undo', id: 'a' })).toBe(true);
    expect(b.snapshot()).toEqual([seg('b')]);
    expect(b.append({ t: 'undo', id: 'nope' })).toBe(false);
  });

  it('clear empties the board; a new channel starts empty', () => {
    const b = new StreamBuffer();
    b.sync('w1');
    b.append(seg('a'));
    b.append({ t: 'clear' });
    expect(b.snapshot()).toEqual([]);
    b.append(seg('b'));
    b.sync('w1');
    expect(b.snapshot()).toHaveLength(1);
    b.sync('w2');
    expect(b.channelKey).toBe('w2');
    expect(b.snapshot()).toEqual([]);
  });

  it('caps a channel, and undo or clear make room again', () => {
    const b = new StreamBuffer();
    b.sync('w1');
    for (let i = 0; i < STREAM_MAX_OPS; i++) expect(b.append(seg(`s${i}`))).toBe(true);
    expect(b.append(seg('over'))).toBe(false);
    b.append({ t: 'undo', id: 's0' });
    expect(b.append(seg('fits'))).toBe(true);
  });
});

describe('GameRunner stream', () => {
  const runners: GameRunner[] = [];
  afterEach(() => runners.splice(0).forEach((r) => r.dispose()));

  function start(mode: 'offline' | 'board') {
    const ids = playerIds(4);
    const runner = new GameRunner(
      eraseGame(pictionary),
      {
        players: ids.map((id) => ({ id, name: id, online: true })),
        settings: { ...pictionaryDefaultSettings(), mode },
        moderator: null,
      },
      { bank: BANK, rng: seededRng(3), onTick: () => {}, roomCode: 'TEST' },
    );
    runners.push(runner);
    const drawer = (runner.peek() as unknown as { drawerId: string }).drawerId;
    const guesser = ids.find((id) => id !== drawer) as string;
    return { runner, ids, drawer, guesser, host: ids[0] as string };
  }

  it('offline mode has no channel and drops every op', () => {
    const { runner, drawer } = start('offline');
    expect(runner.streamSnapshot()).toBeNull();
    expect(runner.stream(drawer, 'w1', seg('a'))).toBeNull();
  });

  it('relays the drawer’s valid ops on the current channel only', () => {
    const { runner, drawer, guesser } = start('board');
    const key = runner.streamSnapshot()?.channelKey as string;
    expect(runner.stream(drawer, key, seg('a'))).toEqual(seg('a'));
    expect(runner.stream(guesser, key, seg('b'))).toBeNull();
    expect(runner.stream(drawer, 'stale', seg('c'))).toBeNull();
    expect(runner.stream(drawer, key, { t: 'seg', id: 'x', color: 99, size: 0, pts: [[0, 0]] })).toBeNull();
    expect(runner.stream(drawer, key, { t: 'seg', id: 'x', color: 0, size: 0, pts: [[0, 0]], word: 'leak' })).toBeNull();
    expect(runner.streamSnapshot()).toEqual({ channelKey: key, ops: [seg('a')] });
  });

  it('a new word wipes the board; the reveal keeps it but stops drawing', () => {
    const { runner, drawer, host } = start('board');
    const key = runner.streamSnapshot()?.channelKey as string;
    runner.stream(drawer, key, seg('a'));

    expect(runner.action(host, true, runner.phaseSeq, { type: 'guessed' }).ok).toBe(true);
    expect(runner.streamSnapshot()).toEqual({ channelKey: key, ops: [seg('a')] });
    expect(runner.stream(drawer, key, seg('b'))).toBeNull();

    expect(runner.action(host, true, runner.phaseSeq, { type: 'next' }).ok).toBe(true);
    const next = runner.streamSnapshot();
    expect(next?.channelKey).not.toBe(key);
    expect(next?.ops).toEqual([]);
  });

  it('returns a typed guess result in the ack only', () => {
    const { runner, guesser } = start('board');
    const rev = runner.rev;
    expect(runner.action(guesser, false, runner.phaseSeq, { type: 'guess', text: 'zzz not it' })).toEqual({
      ok: true,
      value: { guess: 'wrong' },
    });
    // A wrong guess changes nothing, so nobody gets a new view.
    expect(runner.rev).toBe(rev);
  });
});
