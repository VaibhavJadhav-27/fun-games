import { fileURLToPath } from 'node:url';
import { GAME_IDS, type GameId } from '@party/shared';

export interface Config {
  port: number;
  production: boolean;
  allowedOrigin: string | undefined;
  webDist: string;
  /** Both ADMIN_USERNAME and ADMIN_PASSWORD must be set, or the admin page is off. */
  admin: { username: string; password: string } | undefined;
  /** How many proxies sit in front of the server (TRUST_PROXY). 0 = none. Render: 1. */
  trustProxy: number;
  /** RELEASED_GAMES (comma-separated). Unset = every built game is released. */
  releasedGames: GameId[] | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid PORT: ${env.PORT}`);
  return {
    port,
    production: env.NODE_ENV === 'production',
    allowedOrigin: env.ALLOWED_ORIGIN || undefined,
    webDist: env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    releasedGames: parseGameList(env.RELEASED_GAMES),
    admin:
      env.ADMIN_USERNAME && env.ADMIN_PASSWORD
        ? { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }
        : undefined,
  };
}

function parseTrustProxy(raw: string | undefined): number {
  if (!raw) return 0;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw new Error(`Invalid TRUST_PROXY: ${raw}`);
  return hops;
}

function parseGameList(raw: string | undefined): GameId[] | undefined {
  if (raw === undefined) return undefined;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!(GAME_IDS as readonly string[]).includes(id)) throw new Error(`Unknown game in RELEASED_GAMES: ${id}`);
  }
  return ids as GameId[];
}
