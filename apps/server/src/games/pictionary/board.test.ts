import { describe, expect, it } from 'vitest';
import { pictionaryDefaultSettings, pictionaryViewSchema } from '@party/shared';
import { pictionary } from './index';
import { PictionaryHarness } from './testing';

const TWO_MIN = 120_000;

function board(n = 4, extra: ConstructorParameters<typeof PictionaryHarness>[1] = {}, seed = 1) {
  return new PictionaryHarness(n, { mode: 'board', ...extra }, seed);
}

function guesserOf(h: PictionaryHarness, nth = 0): string {
  return h.ids.filter((id) => id !== h.drawer)[nth] as string;
}

function view(h: PictionaryHarness, id: string) {
  const v = pictionary.getPlayerView(h.state, id);
  expect(pictionaryViewSchema.safeParse(v).success).toBe(true);
  return v;
}

describe('board mode settings', () => {
  const { settings } = pictionary;

  it('can start, with 2 minutes by default', () => {
    expect(settings.validate({ ...pictionaryDefaultSettings(), mode: 'board' }, 3)).toBeNull();
    expect(settings.defaults().drawSeconds).toBe(120);
  });

  it('fills in the draw time for settings from an older client, and rejects other times', () => {
    const old: Record<string, unknown> = { ...pictionaryDefaultSettings() };
    delete old.drawSeconds;
    expect(settings.schema.parse({ ...old, mode: 'board' }).drawSeconds).toBe(120);
    expect(settings.schema.safeParse({ ...old, drawSeconds: 150 }).success).toBe(true);
    expect(settings.schema.safeParse({ ...old, drawSeconds: 100 }).success).toBe(false);
  });
});

describe('board mode timer', () => {
  it('each round gets the chosen draw time, shown to everyone', () => {
    const h = board(4, { drawSeconds: 180 });
    expect(h.state.phase.deadline).toBe(h.now + 180_000);
    expect(pictionary.nextWakeup(h.state)).toBe(h.state.phase.deadline);
    for (const id of h.ids) expect(view(h, id)).toMatchObject({ mode: 'board', deadline: h.now + 180_000 });
  });

  it('offline mode stays untimed', () => {
    const h = new PictionaryHarness(4);
    expect(h.state.phase.deadline).toBeNull();
    expect(pictionary.nextWakeup(h.state)).toBeNull();
    expect(view(h, h.ids[0] as string)).toMatchObject({ mode: 'offline', deadline: null, channelKey: null });
    const before = h.state;
    expect(h.advance(10 * TWO_MIN).ok).toBe(true);
    expect(h.state).toBe(before);
  });

  it('an early tick changes nothing', () => {
    const h = board();
    const before = h.state;
    h.advance(TWO_MIN - 1);
    expect(h.state).toBe(before);
  });

  it("time's up reveals the word as not guessed, and the summary says so", () => {
    const h = board();
    const { word } = h.state;
    h.advance(TWO_MIN);
    expect(h.state.phase).toMatchObject({ name: 'reveal', deadline: null });
    expect(pictionary.nextWakeup(h.state)).toBeNull();
    expect(view(h, guesserOf(h))).toMatchObject({ phase: 'reveal', word, guessed: false, timeUp: true, guessedBy: null, deadline: null });
    expect(pictionary.abort(h.state).reveals.at(-1)?.value).toBe(`${word} (time's up)`);
  });

  it('Skip gives a new word, a blank board and a full new countdown', () => {
    const h = board();
    const key = view(h, h.drawer).channelKey;
    h.now += 90_000;
    h.do(h.drawer, { type: 'skip' });
    expect(h.state.phase.deadline).toBe(h.now + TWO_MIN);
    expect(view(h, h.drawer).channelKey).not.toBe(key);
  });

  it('Next round starts a full countdown on a new board', () => {
    const h = board();
    const key = view(h, h.drawer).channelKey;
    h.do(h.host, { type: 'giveUp' });
    h.now += 30_000;
    h.do(h.host, { type: 'next' });
    expect(h.state.phase).toMatchObject({ name: 'drawing', deadline: h.now + TWO_MIN });
    expect(view(h, h.drawer).channelKey).not.toBe(key);
  });

  it('a drawer who drops out: new drawer, new word, blank board, full countdown', () => {
    const h = board(4);
    const first = h.drawer;
    const key = view(h, first).channelKey;
    h.now += 50_000;
    h.input({ kind: 'presence', playerId: first, online: false });
    expect(h.drawer).not.toBe(first);
    expect(h.state.phase.deadline).toBe(h.now + TWO_MIN);
    expect(view(h, h.drawer).channelKey).not.toBe(key);
  });

  it('the stale wakeup after a reveal does nothing', () => {
    const h = board();
    h.do(h.host, { type: 'guessed' });
    const before = h.state;
    h.advance(TWO_MIN);
    expect(h.state).toBe(before);
  });
});

describe('board mode typed guesses', () => {
  it('a wrong guess is answered privately and changes nothing', () => {
    const h = board();
    const before = h.state;
    const step = h.act(guesserOf(h), { type: 'guess', text: 'definitely not it 123' });
    expect(step).toMatchObject({ ok: true, reply: { guess: 'wrong' } });
    expect(h.state).toBe(before);
  });

  it('one character off is "close" and changes nothing', () => {
    const h = board(4, { genres: ['animals'] });
    const before = h.state;
    const step = h.act(guesserOf(h), { type: 'guess', text: `${h.state.word}x` });
    expect(step).toMatchObject({ ok: true, reply: { guess: 'close' } });
    expect(h.state).toBe(before);
  });

  it('the first correct guess (any case, extra spaces) ends the round for everyone', () => {
    const h = board();
    const guesser = guesserOf(h, 1);
    const { word } = h.state;
    const step = h.act(guesser, { type: 'guess', text: `  ${word.toUpperCase().replace(/ /g, '   ')} ` });
    expect(step).toMatchObject({ ok: true, reply: { guess: 'correct' } });
    expect(h.state.history.at(-1)).toMatchObject({ word, outcome: 'guessed' });
    for (const id of h.ids) expect(view(h, id)).toMatchObject({ phase: 'reveal', word, guessed: true, guessedBy: guesser, timeUp: false });
  });

  it('the host can still tap Guessed it for a shouted answer', () => {
    const h = board();
    h.do(h.host, { type: 'guessed' });
    expect(view(h, guesserOf(h))).toMatchObject({ phase: 'reveal', guessed: true, guessedBy: null });
  });

  it('the drawer cannot guess, nobody can guess at the reveal, and offline mode has no typed guesses', () => {
    const h = board();
    expect(h.act(h.drawer, { type: 'guess', text: h.state.word })).toEqual({ ok: false, error: 'NOT_ALLOWED' });
    h.do(h.host, { type: 'giveUp' });
    expect(h.act(guesserOf(h), { type: 'guess', text: h.state.word })).toEqual({ ok: false, error: 'WRONG_PHASE' });

    const off = new PictionaryHarness(4);
    expect(off.act(guesserOf(off), { type: 'guess', text: off.state.word })).toEqual({ ok: false, error: 'NOT_ALLOWED' });
  });

  it("a guess that arrives after time's up (before the tick) doesn't count", () => {
    const h = board();
    h.now += TWO_MIN;
    const step = h.act(guesserOf(h), { type: 'guess', text: h.state.word });
    expect(step.ok && 'reply' in step ? step.reply : undefined).toBeUndefined();
    expect(h.state.history.at(-1)?.outcome).toBe('timeUp');
  });

  it('a new round clears who guessed it', () => {
    const h = board();
    h.do(guesserOf(h), { type: 'guess', text: h.state.word });
    h.do(h.host, { type: 'next' });
    expect(h.state.guessedBy).toBeNull();
  });
});

describe('board mode stream', () => {
  const stream = pictionary.stream;

  it('is open only in board mode, and only the drawer may draw, only while drawing', () => {
    if (!stream) throw new Error('pictionary has no stream');
    const off = new PictionaryHarness(4);
    expect(stream.channelKey(off.state)).toBeNull();

    const h = board();
    expect(stream.channelKey(h.state)).toBe(view(h, h.drawer).channelKey);
    expect(stream.canSend(h.state, h.drawer)).toBe(true);
    expect(stream.canSend(h.state, guesserOf(h))).toBe(false);
    h.do(h.host, { type: 'guessed' });
    // The drawing stays on screen through the reveal, but nobody can add to it.
    expect(stream.channelKey(h.state)).not.toBeNull();
    expect(stream.canSend(h.state, h.drawer)).toBe(false);
  });
});
