import { describe, expect, it } from 'vitest';
import { clientSchemas, nameSchema, roomCodeSchema } from './schemas';
import { startBlockedReason } from '../games/meta';

describe('nameSchema', () => {
  it('trims and collapses whitespace', () => {
    expect(nameSchema.parse('  Ravi   K  ')).toBe('Ravi K');
  });

  it('strips invisible characters', () => {
    expect(nameSchema.parse('A\u200bnu\u0007')).toBe('Anu');
  });

  it('rejects empty and too-long names', () => {
    expect(nameSchema.safeParse('   ').success).toBe(false);
    expect(nameSchema.safeParse('\u200b').success).toBe(false);
    expect(nameSchema.safeParse('x'.repeat(17)).success).toBe(false);
    expect(nameSchema.safeParse('x'.repeat(16)).success).toBe(true);
  });
});

describe('roomCodeSchema', () => {
  it('normalises case and whitespace', () => {
    expect(roomCodeSchema.parse(' abcd ')).toBe('ABCD');
  });

  it('rejects ambiguous letters, digits and wrong lengths', () => {
    for (const bad of ['ABCI', 'ABCO', 'AB1D', 'ABC', 'ABCDE']) {
      expect(roomCodeSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('clientSchemas', () => {
  it('rejects unknown keys', () => {
    expect(clientSchemas['room:join'].safeParse({ code: 'ABCD', name: 'A', isHost: true }).success).toBe(false);
  });
});

describe('startBlockedReason', () => {
  it('explains missing players', () => {
    expect(startBlockedReason('traitor', 3)).toBe('Need 2 more players');
    expect(startBlockedReason('imposter', 2)).toBe('Need 1 more player');
  });

  it('enforces the max', () => {
    expect(startBlockedReason('imposter', 13)).toMatch(/at most 12/);
    expect(startBlockedReason('imposter', 12)).toBeNull();
  });
});
