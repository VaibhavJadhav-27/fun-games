import { getRandomValues } from 'node:crypto';

/** Returns a float in [0, 1). Injected into games so tests are deterministic. */
export type Rng = () => number;

export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return () => {
    getRandomValues(buf);
    return (buf[0] ?? 0) / 2 ** 32;
  };
}

/** mulberry32: small, fast, good enough for shuffles in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

export function randomIndex(length: number, rng: Rng): number {
  return Math.floor(rng() * length);
}

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rng);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('pickRandom: empty list');
  return items[randomIndex(items.length, rng)] as T;
}
