import type { PlayerId } from '@party/shared';

export interface StoredSession {
  playerId: PlayerId;
  sessionToken: string;
}

const sessionKey = (code: string) => `pg:session:${code}`;
const NAME_KEY = 'pg:name';

// localStorage can throw (private mode, blocked storage); the app must work without it.

export function loadSession(code: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return typeof parsed.playerId === 'string' && typeof parsed.sessionToken === 'string'
      ? { playerId: parsed.playerId, sessionToken: parsed.sessionToken }
      : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: StoredSession): void {
  try {
    localStorage.setItem(sessionKey(code), JSON.stringify(session));
  } catch {
    // Reconnection won't survive a refresh, but play continues.
  }
}

/** The host moved us into another seat: same token, new player id. */
export function updateSessionPlayer(code: string, playerId: PlayerId): void {
  const session = loadSession(code);
  if (session) saveSession(code, { ...session, playerId });
}

export function clearSession(code: string): void {
  try {
    localStorage.removeItem(sessionKey(code));
  } catch {
    // ignore
  }
}

export function loadLastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}
