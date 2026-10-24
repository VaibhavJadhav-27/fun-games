import { createHash, timingSafeEqual } from 'node:crypto';
import { hashSessionToken, newSessionToken } from '../rooms/sessions';

export const ADMIN_SESSION_MS = 8 * 60 * 60_000;

export interface AdminCredentials {
  username: string;
  password: string;
}

/**
 * One admin account from the environment. Sessions are random tokens held in memory
 * (as hashes), so a server restart logs the admin out.
 */
export class AdminAuth {
  /** token hash → expiry (epoch ms) */
  private readonly sessions = new Map<string, number>();

  constructor(
    private readonly credentials: AdminCredentials,
    private readonly now: () => number = Date.now,
  ) {}

  /** A session token on success, or null. Both fields are always compared (no early exit). */
  login(username: string, password: string): string | null {
    const userOk = safeEqual(username, this.credentials.username);
    const passOk = safeEqual(password, this.credentials.password);
    if (!userOk || !passOk) return null;
    this.prune();
    const { token, hash } = newSessionToken();
    this.sessions.set(hash, this.now() + ADMIN_SESSION_MS);
    return token;
  }

  verify(token: string | undefined): boolean {
    if (!token) return false;
    const hash = hashSessionToken(token);
    const expiresAt = this.sessions.get(hash);
    if (expiresAt === undefined) return false;
    if (this.now() >= expiresAt) {
      this.sessions.delete(hash);
      return false;
    }
    return true;
  }

  logout(token: string | undefined): void {
    if (token) this.sessions.delete(hashSessionToken(token));
  }

  private prune(): void {
    const now = this.now();
    for (const [hash, expiresAt] of this.sessions) if (now >= expiresAt) this.sessions.delete(hash);
  }
}

/** Constant-time comparison: hashing first makes the lengths equal. */
function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}
