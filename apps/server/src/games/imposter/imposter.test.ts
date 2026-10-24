import { describe, expect, it } from 'vitest';
import { IMPOSTER_GUESS_MS, IMPOSTER_VOTE_MS } from '@party/shared';
import { imposter } from './index';
import { ImposterHarness, MODERATOR } from './testing';

describe('setup', () => {
  it('assigns the configured number of imposters and a word from the chosen genres', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const one = new ImposterHarness(5, { genres: ['fruits-vegetables'], difficulty: 'easy' }, seed);
      expect(one.imposters).toHaveLength(1);
      expect(one.state.genreId).toBe('fruits-vegetables');
      const two = new ImposterHarness(8, { imposters: 2 }, seed);
      expect(new Set(two.imposters).size).toBe(2);
    }
  });

  it('starts untimed in discussion', () => {
    const h = new ImposterHarness(4);
    expect(h.state.phase).toEqual({ name: 'discussion', seq: 1, deadline: null });
    expect(imposter.nextWakeup(h.state)).toBeNull();
  });
});

describe('voting', () => {
  it('only the host can start the vote; it then runs for 60s', () => {
    const h = new ImposterHarness(4);
    expect(h.act('p2', { type: 'startVote' })).toEqual({ ok: false, error: 'NOT_HOST' });
    h.do('p1', { type: 'startVote' });
    expect(h.state.phase.name).toBe('vote');
    expect(h.state.phase.deadline).toBe(h.now + IMPOSTER_VOTE_MS);
  });

  it('closes as soon as everyone has voted, with live counts until then', () => {
    const h = new ImposterHarness(4);
    const [imp] = h.imposters as [string];
    h.do('p1', { type: 'startVote' });
    const voters = h.crew;
    h.do(voters[0] as string, { type: 'vote', target: imp });
    const view = imposter.getPlayerView(h.state, 'p1');
    expect(view.vote?.voted).toBe(1);
    expect(view.vote?.counts.find((c) => c.target === imp)?.count).toBe(1);
    expect(view.result).toBeNull();
    h.voteAll(imp);
    expect(h.state.phase.name).toBe('lastGuess');
    expect(h.state.lastResult).toMatchObject({ outcome: 'caught', evictedId: imp });
  });

  it('closes at the deadline, counting missing votes as skip', () => {
    const h = new ImposterHarness(5);
    const innocent = h.crew[0] as string;
    h.do('p1', { type: 'startVote' });
    for (const id of h.crew.slice(1, 3)) h.do(id, { type: 'vote', target: innocent });
    h.advance(IMPOSTER_VOTE_MS - 1);
    expect(h.state.phase.name).toBe('vote');
    h.advance(1);
    // 2 votes for innocent vs 3 missing (= skip): nobody evicted.
    expect(h.state.lastResult).toMatchObject({ outcome: 'nobody', reason: 'skip' });
    expect(h.state.phase.name).toBe('result');
  });

  it('treats away players as already voted (skip) for early close', () => {
    const h = new ImposterHarness(5);
    const [imp] = h.imposters as [string];
    h.do('p1', { type: 'startVote' });
    const away = h.crew.find((id) => id !== 'p1') as string;
    h.input({ kind: 'presence', playerId: away, online: false });
    for (const id of h.state.players.map((p) => p.id).filter((id) => id !== away)) {
      h.do(id, { type: 'vote', target: id === imp ? 'skip' : imp });
    }
    expect(h.state.phase.name).toBe('lastGuess');
  });

  it('rejects stale and invalid votes', () => {
    const h = new ImposterHarness(4);
    expect(h.act('p2', { type: 'vote', target: 'p3' })).toEqual({ ok: false, error: 'WRONG_PHASE' });
    h.do('p1', { type: 'startVote' });
    expect(h.act('p2', { type: 'vote', target: 'p2' })).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(h.act('p2', { type: 'vote', target: 'nobody' })).toEqual({ ok: false, error: 'INVALID_TARGET' });
  });
});

describe('results', () => {
  it('an innocent evicted: game continues; evicted player can no longer vote', () => {
    const h = new ImposterHarness(5);
    const innocent = h.crew[1] as string;
    h.do('p1', { type: 'startVote' });
    h.voteAll(innocent);
    expect(h.state.lastResult).toMatchObject({ outcome: 'innocent', evictedId: innocent });
    expect(h.state.phase.name).toBe('result');
    h.do('p1', { type: 'continue' });
    expect(h.state.round).toBe(2);
    expect(h.state.phase.name).toBe('discussion');
    h.do('p1', { type: 'startVote' });
    expect(h.act(innocent, { type: 'vote', target: 'skip' })).toEqual({ ok: false, error: 'NOT_ALLOWED' });
  });

  it('caught imposter guessing the word wins', () => {
    const h = new ImposterHarness(4);
    const [imp] = h.imposters as [string];
    h.do('p1', { type: 'startVote' });
    h.voteAll(imp);
    expect(h.act(h.crew[0] as string, { type: 'guess', text: 'x' })).toEqual({ ok: false, error: 'NOT_ALLOWED' });
    h.do(imp, { type: 'guess', text: `  ${h.state.word.toUpperCase()} ` });
    const result = imposter.result(h.state);
    expect(result?.headline).toBe('Imposter wins!');
    expect(result?.winners).toEqual([imp]);
    expect(result?.reveals).toContainEqual({ label: 'Word', value: h.state.word });
  });

  it('caught imposter guessing wrong: crew wins', () => {
    const h = new ImposterHarness(4);
    const [imp] = h.imposters as [string];
    h.do('p1', { type: 'startVote' });
    h.voteAll(imp);
    h.do(imp, { type: 'guess', text: 'definitely not it' });
    const result = imposter.result(h.state);
    expect(result?.headline).toBe('Crewmates win!');
    expect(result?.winners.sort()).toEqual(h.crew.sort());
    expect(result?.scores.every((s) => s.points === 1)).toBe(true);
  });

  it('caught imposter timing out on the guess: crew wins', () => {
    const h = new ImposterHarness(4);
    const [imp] = h.imposters as [string];
    h.do('p1', { type: 'startVote' });
    h.voteAll(imp);
    h.advance(IMPOSTER_GUESS_MS);
    expect(imposter.result(h.state)?.headline).toBe('Crewmates win!');
  });

  it('imposters win when they match the crew in number', () => {
    const h = new ImposterHarness(3);
    h.do('p1', { type: 'startVote' });
    h.voteAll(h.crew[0] as string);
    expect(imposter.result(h.state)?.headline).toBe('Imposter wins!');
  });

  it('imposters win by surviving the max rounds', () => {
    const h = new ImposterHarness(6, { maxRounds: 2 });
    for (let round = 1; round <= 2; round++) {
      h.do('p1', { type: 'startVote' });
      h.advance(IMPOSTER_VOTE_MS); // nobody votes: skip
      if (round < 2) h.do('p1', { type: 'continue' });
    }
    expect(imposter.result(h.state)?.detail).toMatch(/survived 2 rounds/);
  });

  it('with 2 imposters, catching one keeps the game going', () => {
    const h = new ImposterHarness(8, { imposters: 2 });
    const [first, second] = h.imposters as [string, string];
    h.do('p1', { type: 'startVote' });
    h.voteAll(first);
    h.do(first, { type: 'guess', text: 'wrong' });
    expect(imposter.result(h.state)).toBeNull();
    expect(h.state.phase.name).toBe('result');
    h.do('p1', { type: 'continue' });
    h.do('p1', { type: 'startVote' });
    h.voteAll(second);
    h.do(second, { type: 'guess', text: 'wrong again' });
    expect(imposter.result(h.state)?.headline).toBe('Crewmates win!');
  });

  it('abort reveals every role with no winner', () => {
    const h = new ImposterHarness(4);
    const result = imposter.abort(h.state);
    expect(result).toMatchObject({ endedBy: 'host', winners: [], headline: 'Game ended by host' });
    expect(result.roles.filter((r) => r.role === 'Imposter').map((r) => r.playerId)).toEqual(h.imposters);
  });
});

describe('settings', () => {
  it('needs 8+ players for 2 imposters', () => {
    const cfg = { ...imposter.settings.defaults(), imposters: 2 as const };
    expect(imposter.settings.validate(cfg, 7)).toMatch(/8/);
    expect(imposter.settings.validate(cfg, 8)).toBeNull();
    expect(imposter.settings.clamp(cfg, 5).imposters).toBe(1);
  });
});

describe('hints', () => {
  it('shows the imposter the genre on Easy only', () => {
    for (const difficulty of ['easy', 'medium', 'hard', 'mixed'] as const) {
      const h = new ImposterHarness(4, { genres: ['animals'], difficulty });
      const view = imposter.getPlayerView(h.state, h.imposters[0] as string);
      expect(view.genre).toBe(difficulty === 'easy' ? 'Animals' : null);
      // Crewmates know the word anyway, so they always see its genre.
      expect(imposter.getPlayerView(h.state, h.crew[0] as string).genre).toBe('Animals');
    }
  });
});

describe('custom word', () => {
  const custom = { source: 'custom' as const, customWord: 'Mango', difficulty: 'easy' as const };

  it("uses the host's word, gives no hint, and keeps the moderator out of the game", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const h = new ImposterHarness(3, custom, seed);
      expect(h.state.word).toBe('Mango');
      expect(h.state.players.map((p) => p.id)).not.toContain(MODERATOR);
      expect(h.imposters).not.toContain(MODERATOR);
      const impView = imposter.getPlayerView(h.state, h.imposters[0] as string);
      expect(impView.genre).toBeNull();
      expect(imposter.getPlayerView(h.state, MODERATOR)).toMatchObject({
        you: { id: MODERATOR, role: 'moderator' },
        word: 'Mango',
        genre: null,
      });
    }
  });

  it('lets the moderator run the game but not vote', () => {
    const h = new ImposterHarness(3, custom);
    h.do(MODERATOR, { type: 'startVote' });
    expect(h.act(MODERATOR, { type: 'vote', target: 'p1' })).toEqual({ ok: false, error: 'NOT_ALLOWED' });
    expect(imposter.getPlayerView(h.state, MODERATOR).vote).toMatchObject({ canVote: false, total: 3 });
    h.voteAll(h.imposters[0] as string);
    expect(h.state.phase.name).toBe('lastGuess');
  });

  it('reveals "Custom word" as the genre in the result, without listing the moderator', () => {
    const h = new ImposterHarness(3, custom);
    const result = imposter.abort(h.state);
    expect(result.reveals).toContainEqual({ label: 'Genre', value: 'Custom word' });
    expect(result.roles.map((r) => r.playerId)).not.toContain(MODERATOR);
  });
});
