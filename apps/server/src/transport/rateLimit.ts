export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.last = Date.now();
  }

  take(now = Date.now()): boolean {
    const elapsed = (now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  isFull(now = Date.now()): boolean {
    return this.tokens + ((now - this.last) / 1000) * this.refillPerSecond >= this.capacity;
  }
}

/** One bucket per key (e.g. per IP), pruned once full again. */
export class KeyedRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  take(key: string): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillPerSecond);
      this.buckets.set(key, bucket);
    }
    return bucket.take();
  }

  prune(): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.isFull()) this.buckets.delete(key);
    }
  }
}
