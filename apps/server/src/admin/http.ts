import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ZodType } from 'zod';
import {
  ADMIN_API_PREFIX,
  adminAnnouncementSchema,
  adminLoginSchema,
  adminMaintenanceSchema,
  isRoomCode,
  type AdminOverview,
} from '@party/shared';
import { clientIp } from '../clientIp';
import { log } from '../log';
import type { RoomManager } from '../rooms/roomManager';
import { KeyedRateLimiter } from '../transport/rateLimit';
import { ADMIN_SESSION_MS, type AdminAuth } from './auth';
import type { ServerControls } from './controls';
import { AdminChangeFeed } from './events';

export const ADMIN_COOKIE = 'pg_admin';
export const ADMIN_LOGINS_PER_MINUTE = 5;
/** Mutating requests must carry this header: a cross-site form can't set it (CSRF). */
export const ADMIN_CSRF_HEADER = 'x-party-admin';
const MAX_BODY_BYTES = 4 * 1024;

export interface AdminDeps {
  /** Null when no credentials are configured: the admin API is switched off. */
  auth: AdminAuth | null;
  manager: RoomManager;
  controls: ServerControls;
  socketCount(): number;
  /** Adds `Secure` to the cookie. */
  secureCookie: boolean;
  loginsPerMinute?: number;
  /** Proxies in front of the server (see clientIp). */
  trustProxy?: number;
}

type Reply = { status: number; body: unknown; headers?: Record<string, string> };

export interface AdminHandler {
  /** Answers `/admin/api/*`; returns false for any other URL. */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
  /** Ends open event streams (so the HTTP server can shut down). */
  close(): void;
}

export function createAdminHandler(deps: AdminDeps): AdminHandler {
  const perMinute = deps.loginsPerMinute ?? ADMIN_LOGINS_PER_MINUTE;
  const loginLimiter = new KeyedRateLimiter(perMinute, perMinute / 60);
  const startedAt = Date.now();
  const { auth } = deps;
  const feed = auth ? new AdminChangeFeed((token) => auth.verify(token)) : null;
  const unsubscribe = feed
    ? [deps.manager.onChange(() => feed.changed()), deps.controls.onChange(() => feed.changed())]
    : [];

  /** GET /events: a Server-Sent Events stream of "changed" pings. */
  function openEvents(req: IncomingMessage, res: ServerResponse): boolean {
    const token = readCookie(req, ADMIN_COOKIE);
    if (!auth || !feed || !token || !auth.verify(token)) return false;
    if (!feed.open(res, token)) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many open dashboards' }));
    }
    return true;
  }

  async function route(req: IncomingMessage, path: string): Promise<Reply> {
    const { auth } = deps;
    if (!auth) return { status: 404, body: { error: 'Not found' } };
    const method = req.method ?? 'GET';
    const token = readCookie(req, ADMIN_COOKIE);

    if (method !== 'GET' && req.headers[ADMIN_CSRF_HEADER] !== '1') {
      return { status: 403, body: { error: 'Missing admin header' } };
    }

    if (path === '/login' && method === 'POST') {
      loginLimiter.prune();
      if (!loginLimiter.take(clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], deps.trustProxy ?? 0))) {
        return { status: 429, body: { error: 'Too many attempts. Wait a minute and try again.' } };
      }
      const body = await readJson(req, adminLoginSchema);
      if (!body) return { status: 400, body: { error: 'Bad request' } };
      const session = auth.login(body.username, body.password);
      if (!session) {
        log.warn('admin login failed');
        return { status: 401, body: { error: 'Wrong username or password' } };
      }
      log.info('admin logged in');
      return { status: 200, body: { ok: true }, headers: { 'set-cookie': cookie(session, ADMIN_SESSION_MS / 1000) } };
    }

    if (path === '/logout' && method === 'POST') {
      auth.logout(token);
      return { status: 200, body: { ok: true }, headers: { 'set-cookie': cookie('', 0) } };
    }

    if (path === '/session' && method === 'GET') {
      return { status: 200, body: { loggedIn: auth.verify(token) } };
    }

    if (!auth.verify(token)) return { status: 401, body: { error: 'Log in first' } };

    if (path === '/overview' && method === 'GET') return { status: 200, body: overview() };

    if (path === '/rooms/close-stale' && method === 'POST') {
      const closed = deps.manager.closeStale();
      log.info('admin closed stale rooms', { closed });
      return { status: 200, body: { closed } };
    }

    const roomMatch = /^\/rooms\/([A-Z]{4})$/.exec(path);
    if (roomMatch && method === 'DELETE') {
      const code = roomMatch[1] as string;
      const room = isRoomCode(code) ? deps.manager.get(code) : undefined;
      if (!room) return { status: 404, body: { error: 'Room not found' } };
      room.adminClose();
      log.info('admin closed room', { room: code });
      return { status: 200, body: { ok: true } };
    }

    if (path === '/maintenance' && method === 'PUT') {
      const body = await readJson(req, adminMaintenanceSchema);
      if (!body) return { status: 400, body: { error: 'Bad request' } };
      deps.controls.setMaintenance(body.enabled);
      log.info('admin set maintenance', { enabled: body.enabled });
      return { status: 200, body: { ok: true } };
    }

    if (path === '/announcement' && method === 'PUT') {
      const body = await readJson(req, adminAnnouncementSchema);
      if (!body) return { status: 400, body: { error: 'Announcements are 1–200 characters' } };
      deps.controls.announce(body.text);
      return { status: 200, body: { ok: true } };
    }

    return { status: 404, body: { error: 'Not found' } };
  }

  function overview(): AdminOverview {
    const memory = process.memoryUsage();
    const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
    return {
      health: {
        startedAt,
        now: Date.now(),
        nodeVersion: process.version,
        memoryMb: { rss: mb(memory.rss), heapUsed: mb(memory.heapUsed) },
        sockets: deps.socketCount(),
      },
      usage: deps.manager.stats.snapshot(),
      maintenance: deps.controls.maintenance,
      announcement: deps.controls.announcement,
      rooms: deps.manager
        .list()
        .map((r) => r.adminSummary())
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt),
    };
  }

  function cookie(value: string, maxAgeSeconds: number): string {
    const secure = deps.secureCookie ? '; Secure' : '';
    return `${ADMIN_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=${ADMIN_API_PREFIX}; Max-Age=${maxAgeSeconds}${secure}`;
  }

  function handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url = req.url ?? '';
    if (url !== ADMIN_API_PREFIX && !url.startsWith(`${ADMIN_API_PREFIX}/`)) return false;
    const path = url.slice(ADMIN_API_PREFIX.length).split('?')[0] ?? '';
    if (path === '/events' && req.method === 'GET' && openEvents(req, res)) return true;
    route(req, path)
      .catch((error: unknown): Reply => {
        log.error('admin request failed', { path, error: error instanceof Error ? error.message : String(error) });
        return { status: 500, body: { error: 'Internal error' } };
      })
      .then((reply) => {
        res.writeHead(reply.status, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          ...reply.headers,
        });
        res.end(JSON.stringify(reply.body));
      });
    return true;
  }

  return {
    handle,
    close() {
      for (const off of unsubscribe) off();
      feed?.close();
    },
  };
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || undefined;
  }
  return undefined;
}

/** Reads and validates a small JSON body. Null if it's too big, not JSON, or invalid. */
async function readJson<T>(req: IncomingMessage, schema: ZodType<T>): Promise<T | null> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buf);
  }
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
