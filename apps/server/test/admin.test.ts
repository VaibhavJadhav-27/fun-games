import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  AdminOverview,
  ClientToServerEvents,
  RoomInfo,
  ServerStatus,
  ServerToClientEvents,
  SessionEndReason,
} from '@party/shared';
import { startApp, type App } from '../src/app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const ADMIN = { username: 'admin', password: 'correct horse battery' };
let app: App;
let off: App;
const clients: Client[] = [];

beforeAll(async () => {
  app = await startApp({ port: 0, roomCreatesPerMinute: 1000, admin: ADMIN, adminLoginsPerMinute: 1000 });
  off = await startApp({ port: 0 });
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  await app.close();
  await off.close();
});

function api(path: string, init: { method?: string; body?: unknown; cookie?: string; csrf?: boolean } = {}, target = app) {
  const method = init.method ?? 'GET';
  return fetch(`http://localhost:${target.port}/admin/api${path}`, {
    method,
    headers: {
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(method !== 'GET' && init.csrf !== false ? { 'x-party-admin': '1' } : {}),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function login(): Promise<string> {
  const res = await api('/login', { method: 'POST', body: ADMIN });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  expect(setCookie).toMatch(/HttpOnly/);
  expect(setCookie).toMatch(/SameSite=Strict/);
  return setCookie.split(';')[0] as string;
}

function client() {
  const socket: Client = connect(`http://localhost:${app.port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(socket);
  const state: { room: RoomInfo | null; ended: SessionEndReason | null; status: ServerStatus | null } = {
    room: null,
    ended: null,
    status: null,
  };
  socket.on('room:state', (info) => (state.room = info));
  socket.on('session:ended', ({ reason }) => (state.ended = reason));
  socket.on('server:status', (status) => (state.status = status));
  const call = (event: string, payload: unknown) =>
    (socket.timeout(2000) as unknown as { emitWithAck(e: string, p: unknown): Promise<{ ok: boolean; data?: unknown; error?: { code: string } }> }).emitWithAck(event, payload);
  return { socket, state, call };
}

/** Opens the admin event stream and collects everything it sends. */
async function openStream(cookie: string) {
  const res = await fetch(`http://localhost:${app.port}/admin/api/events`, { headers: { cookie } });
  let text = '';
  let done = false;
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  void (async () => {
    for (;;) {
      const chunk = await reader?.read().catch(() => undefined);
      if (!chunk || chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
    done = true;
  })();
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    text: () => text,
    count: (needle: string) => text.split(needle).length - 1,
    done: () => done,
  };
}

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('admin API', () => {
  it('is switched off without credentials', async () => {
    expect((await api('/session', {}, off)).status).toBe(404);
    expect((await api('/login', { method: 'POST', body: ADMIN }, off)).status).toBe(404);
  });

  it('requires a login, the right password, and the CSRF header', async () => {
    expect((await api('/overview')).status).toBe(401);
    expect(await (await api('/session')).json()).toEqual({ loggedIn: false });
    expect((await api('/login', { method: 'POST', body: { ...ADMIN, password: 'nope' } })).status).toBe(401);
    expect((await api('/login', { method: 'POST', body: ADMIN, csrf: false })).status).toBe(403);
    expect((await api('/login', { method: 'POST', body: { username: 'admin' } })).status).toBe(400);
    const cookie = await login();
    expect(await (await api('/session', { cookie })).json()).toEqual({ loggedIn: true });
    expect((await api('/maintenance', { method: 'PUT', body: { enabled: true }, cookie, csrf: false })).status).toBe(403);
    await api('/logout', { method: 'POST', body: {}, cookie });
    expect((await api('/overview', { cookie })).status).toBe(401);
  });

  it('rate-limits login attempts', async () => {
    const strict = await startApp({ port: 0, admin: ADMIN, adminLoginsPerMinute: 2 });
    const attempt = () => api('/login', { method: 'POST', body: { ...ADMIN, password: 'x' } }, strict);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
    await strict.close();
  });

  it('lists rooms with names but no secrets, and closes a room', async () => {
    const cookie = await login();
    const host = client();
    const created = await host.call('room:create', { name: 'Asha', gameId: 'imposter' });
    const code = (created.data as { code: string; sessionToken: string }).code;
    const token = (created.data as { sessionToken: string }).sessionToken;
    await host.call('lobby:setSettings', {
      settings: { source: 'custom', genres: ['animals'], difficulty: 'easy', imposters: 1, maxRounds: 3, customWord: 'Zebracorn' },
    });

    const res = await api('/overview', { cookie });
    const raw = await res.text();
    expect(raw).not.toContain('Zebracorn');
    expect(raw).not.toContain(token);
    const overview = JSON.parse(raw) as AdminOverview;
    const room = overview.rooms.find((r) => r.code === code);
    expect(room).toMatchObject({ gameId: 'imposter', status: 'lobby', emptySince: null });
    expect(room?.members).toEqual([{ name: 'Asha', isHost: true, presence: 'online', seat: 'playing' }]);
    expect(overview.usage.roomsCreated).toBeGreaterThan(0);

    expect((await api('/rooms/ZZZZ', { method: 'DELETE', cookie })).status).toBe(404);
    expect((await api(`/rooms/${code}`, { method: 'DELETE', cookie })).status).toBe(200);
    await until(() => host.state.ended === 'closed');
  });

  it('maintenance blocks new rooms and tells every socket', async () => {
    const cookie = await login();
    const c = client();
    await until(() => c.state.status !== null);
    await api('/maintenance', { method: 'PUT', body: { enabled: true }, cookie });
    await until(() => c.state.status?.maintenance === true);
    expect(await c.call('room:create', { name: 'Ravi', gameId: 'imposter' })).toMatchObject({
      ok: false,
      error: { code: 'MAINTENANCE' },
    });
    await api('/maintenance', { method: 'PUT', body: { enabled: false }, cookie });
    await until(() => c.state.status?.maintenance === false);
    expect(await c.call('room:create', { name: 'Ravi', gameId: 'imposter' })).toMatchObject({ ok: true });
  });

  it('streams "changed" pings (with no room data) when a host creates and closes a room', async () => {
    expect((await api('/events')).status).toBe(401);
    const cookie = await login();
    const stream = await openStream(cookie);
    expect(stream.status).toBe(200);
    expect(stream.contentType).toContain('text/event-stream');

    const host = client();
    const created = await host.call('room:create', { name: 'Kiran', gameId: 'imposter' });
    const code = (created.data as { code: string }).code;
    await until(() => stream.count('event: changed') >= 1);

    const before = stream.count('event: changed');
    await host.call('room:close', {});
    await until(() => stream.count('event: changed') > before);
    expect(stream.text()).not.toContain(code);
    expect(stream.text()).not.toContain('Kiran');

    // After logout, the next ping tells the page and the stream ends.
    await api('/logout', { method: 'POST', body: {}, cookie });
    await client().call('room:create', { name: 'Late', gameId: 'imposter' });
    await until(() => stream.text().includes('event: logout') && stream.done());
  });

  it('sends announcements to every socket, including new ones', async () => {
    const cookie = await login();
    const c = client();
    await until(() => c.state.status !== null);
    expect((await api('/announcement', { method: 'PUT', body: { text: '' }, cookie })).status).toBe(400);
    await api('/announcement', { method: 'PUT', body: { text: 'Restarting in 5 minutes' }, cookie });
    await until(() => c.state.status?.announcement?.text === 'Restarting in 5 minutes');
    const late = client();
    await until(() => late.state.status?.announcement?.text === 'Restarting in 5 minutes');
    await api('/announcement', { method: 'PUT', body: { text: null }, cookie });
    await until(() => c.state.status?.announcement === null);
  });
});
