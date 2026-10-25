import { describe, expect, it } from 'vitest';
import { pictionaryDefaultSettings, pictionaryViewSchema } from '@party/shared';
import { normalizeGuess } from '../../engine/words';
import { pictionary } from './index';
import { PictionaryHarness } from './testing';

describe('pictionary settings', () => {
  const { settings } = pictionary;

  it('defaults to offline mode, which can start', () => {
    expect(settings.defaults()).toMatchObject({ mode: 'offline', difficulty: 'medium' });
    expect(settings.validate(pictionaryDefaultSettings(), 3)).toBeNull();
  });

  it('blocks online mode as coming soon', () => {
    expect(settings.validate({ ...pictionaryDefaultSettings(), mode: 'online' }, 3)).toMatch(/coming soon/);
  });

  it('accepts movie and song genres', () => {
    expect(settings.schema.safeParse({ ...pictionaryDefaultSettings(), genres: ['bollywood-movies'] }).success).toBe(true);
    expect(settings.schema.safeParse({ ...pictionaryDefaultSettings(), genres: [] }).success).toBe(false);
  });
});

describe('pictionary setup', () => {
  it('starts drawing with one drawer and a word from the chosen genres', () => {
    const h = new PictionaryHarness(4, { genres: ['animals'] });
    expect(h.state.phase).toMatchObject({ name: 'drawing', deadline: null });
    expect(h.ids).toContain(h.drawer);
    expect(h.state.genreId).toBe('animals');
    expect(h.state.word).not.toBe('');
    expect(pictionary.nextWakeup(h.state)).toBeNull();
  });

  it('picks a random first drawer', () => {
    const firsts = new Set(Array.from({ length: 30 }, (_, seed) => new PictionaryHarness(4, {}, seed + 1).drawer));
    expect(firsts.size).toBeGreaterThan(1);
  });
});

describe('fair drawer picking', () => {
  it('everyone draws once per cycle, and nobody draws twice in a row across cycles', () => {
    const h = new PictionaryHarness(5, {}, 7);
    const order = [h.drawer];
    for (let i = 0; i < 14; i++) {
      h.completeRound();
      order.push(h.drawer);
    }
    for (let c = 0; c < 3; c++) {
      expect(new Set(order.slice(c * 5, c * 5 + 5)).size).toBe(5);
    }
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });

  it('skips away players, and they draw in a later cycle once back', () => {
    const h = new PictionaryHarness(4, {}, 3);
    const away = h.ids.find((id) => id !== h.drawer) as string;
    h.input({ kind: 'presence', playerId: away, online: false });
    const drawers = [h.drawer];
    for (let i = 0; i < 2; i++) {
      h.completeRound();
      drawers.push(h.drawer);
    }
    expect(drawers).not.toContain(away);
    expect(new Set(drawers).size).toBe(3);

    h.input({ kind: 'presence', playerId: away, online: true });
    h.completeRound();
    expect(h.drawer).toBe(away);
  });

  it('never picks a player who left', () => {
    const h = new PictionaryHarness(3, {}, 5);
    const gone = h.ids.find((id) => id !== h.drawer) as string;
    h.input({ kind: 'left', playerId: gone });
    for (let i = 0; i < 6; i++) {
      h.completeRound();
      expect(h.drawer).not.toBe(gone);
    }
  });
});

describe('a round', () => {
  it('host marks it guessed: everyone sees the word, then Next starts a new round', () => {
    const h = new PictionaryHarness(4);
    const word = h.state.word;
    h.do(h.host, { type: 'guessed' });
    expect(h.state.phase.name).toBe('reveal');
    for (const id of h.ids) {
      expect(pictionary.getPlayerView(h.state, id)).toMatchObject({ phase: 'reveal', word });
    }
    h.do(h.host, { type: 'next' });
    expect(h.state.phase.name).toBe('drawing');
    expect(h.state.round).toBe(2);
    expect(h.state.word).not.toBe(word);
    expect(h.state.history).toEqual([{ round: 1, drawerId: expect.any(String), word, guessed: true }]);
  });

  it('only the host can mark guessed or start the next round', () => {
    const h = new PictionaryHarness(4);
    const other = h.ids[1] as string;
    expect(h.act(other, { type: 'guessed' })).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(h.act(h.host, { type: 'next' })).toEqual({ ok: false, error: 'WRONG_PHASE' });
    h.do(h.host, { type: 'guessed' });
    expect(h.act(other, { type: 'next' })).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(h.act(h.host, { type: 'guessed' })).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('host taps Nobody got it: the word is revealed as not guessed', () => {
    const h = new PictionaryHarness(4);
    const word = h.state.word;
    expect(h.act(h.ids[1] as string, { type: 'giveUp' })).toEqual({ ok: false, error: 'NOT_HOST' });
    h.do(h.host, { type: 'giveUp' });
    expect(pictionary.getPlayerView(h.state, h.ids[1] as string)).toMatchObject({ phase: 'reveal', word, guessed: false });
    expect(h.act(h.host, { type: 'giveUp' })).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(h.state.history.at(-1)).toMatchObject({ word, guessed: false });
  });

  it('the reveal shows who draws next, and Next round makes them the drawer', () => {
    const h = new PictionaryHarness(4);
    const drawer = h.drawer;
    expect(h.state.upNextId).toBeNull();
    h.do(h.host, { type: 'guessed' });
    const upNext = h.state.upNextId as string;
    expect(upNext).not.toBeNull();
    expect(upNext).not.toBe(drawer);
    for (const id of h.ids) expect(pictionary.getPlayerView(h.state, id)).toMatchObject({ upNextId: upNext });
    h.do(h.host, { type: 'next' });
    expect(h.drawer).toBe(upNext);
    expect(h.state.upNextId).toBeNull();
  });

  it('if whoever is up next drops out during the reveal, someone else is picked', () => {
    const h = new PictionaryHarness(4);
    h.do(h.host, { type: 'guessed' });
    const upNext = h.state.upNextId as string;
    h.input({ kind: 'presence', playerId: upNext, online: false });
    expect(h.state.upNextId).not.toBe(upNext);
    expect(h.state.upNextId).not.toBeNull();
    const replacement = h.state.upNextId;
    h.do(h.host, { type: 'next' });
    expect(h.drawer).toBe(replacement);
  });

  it('the drawer can skip to a new word; nobody else can', () => {
    const h = new PictionaryHarness(4);
    const { drawer, word } = { drawer: h.drawer, word: h.state.word };
    const notDrawer = h.ids.find((id) => id !== drawer) as string;
    expect(h.act(notDrawer, { type: 'skip' })).toEqual({ ok: false, error: 'NOT_ALLOWED' });

    const seq = h.state.phase.seq;
    h.do(drawer, { type: 'skip' });
    expect(h.drawer).toBe(drawer);
    expect(h.state.word).not.toBe(word);
    expect(h.state.round).toBe(1);
    expect(h.state.phase.seq).toBe(seq + 1); // a stale "guessed" for the old word is rejected

    h.do(h.host, { type: 'guessed' });
    expect(h.act(drawer, { type: 'skip' })).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('never repeats a word within a game', () => {
    const h = new PictionaryHarness(3, { genres: ['animals'], difficulty: 'easy' });
    const seen = [normalizeGuess(h.state.word)];
    for (let i = 0; i < 30; i++) {
      if (i % 2) h.do(h.drawer, { type: 'skip' });
      else h.completeRound();
      seen.push(normalizeGuess(h.state.word));
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('starts the word list over once every word has been used', () => {
    const h = new PictionaryHarness(3, { genres: ['animals'], difficulty: 'easy' });
    for (let i = 0; i < 80; i++) h.do(h.drawer, { type: 'skip' });
    expect(h.state.word).not.toBe('');
  });
});

describe('away drawer', () => {
  it('skips the round and picks someone else with a new word', () => {
    const h = new PictionaryHarness(4);
    const { drawer, word } = { drawer: h.drawer, word: h.state.word };
    h.input({ kind: 'presence', playerId: drawer, online: false });
    expect(h.state.phase.name).toBe('drawing');
    expect(h.drawer).not.toBe(drawer);
    expect(h.state.word).not.toBe(word);
    expect(h.state.round).toBe(1);
    expect(h.state.history).toEqual([]);
  });

  it('leaves the reveal alone', () => {
    const h = new PictionaryHarness(4);
    const drawer = h.drawer;
    h.do(h.host, { type: 'guessed' });
    h.input({ kind: 'presence', playerId: drawer, online: false });
    expect(h.state.phase.name).toBe('reveal');
    expect(h.drawer).toBe(drawer);
  });
});

describe('views', () => {
  it('only the drawer sees the word while drawing', () => {
    const h = new PictionaryHarness(4, { difficulty: 'medium' });
    for (const id of h.ids) {
      const view = pictionary.getPlayerView(h.state, id);
      expect(pictionaryViewSchema.safeParse(view).success).toBe(true);
      if (id === h.drawer) expect(view).toMatchObject({ you: { role: 'drawer' }, word: h.state.word });
      else {
        expect(view).toMatchObject({ you: { role: 'guesser' }, genre: null });
        expect('word' in view).toBe(false);
      }
    }
  });

  it('guessers get the genre hint only on Easy', () => {
    const h = new PictionaryHarness(4, { difficulty: 'easy', genres: ['animals'] });
    const guesser = h.ids.find((id) => id !== h.drawer) as string;
    expect(pictionary.getPlayerView(h.state, guesser)).toMatchObject({ genre: 'Animals' });
  });
});

describe('ending', () => {
  it('only ends when the host ends it, with a summary of guessed words', () => {
    const h = new PictionaryHarness(3);
    const first = h.state.word;
    h.completeRound();
    const second = h.state.word;
    h.do(h.host, { type: 'giveUp' });
    h.do(h.host, { type: 'next' });
    h.do(h.drawer, { type: 'skip' });
    expect(pictionary.result(h.state)).toBeNull();

    const result = pictionary.abort(h.state);
    expect(result).toMatchObject({ gameId: 'pictionary', endedBy: 'host', winners: [], roles: [], scores: [] });
    expect(result.detail).toBe('1 of 2 words guessed.');
    expect(result.reveals).toEqual([
      { label: expect.stringMatching(/^1\. Player \d$/), value: first },
      { label: expect.stringMatching(/^2\. Player \d$/), value: `${second} (not guessed)` },
    ]);
  });
});
