import { ADMIN_API_PREFIX, type AdminOverview, type GameId } from '@party/shared';

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${ADMIN_API_PREFIX}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      // The server rejects changes without this header (CSRF guard).
      ...(method === 'GET' ? {} : { 'x-party-admin': '1' }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new AdminApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const adminApi = {
  session: () => call<{ loggedIn: boolean }>('GET', '/session'),
  login: (username: string, password: string) => call<{ ok: true }>('POST', '/login', { username, password }),
  logout: () => call<{ ok: true }>('POST', '/logout', {}),
  overview: () => call<AdminOverview>('GET', '/overview'),
  closeRoom: (code: string) => call<{ ok: true }>('DELETE', `/rooms/${code}`),
  closeStale: () => call<{ closed: number }>('POST', '/rooms/close-stale', {}),
  setMaintenance: (enabled: boolean) => call<{ ok: true }>('PUT', '/maintenance', { enabled }),
  announce: (text: string | null) => call<{ ok: true }>('PUT', '/announcement', { text }),
  setReleased: (gameId: GameId, released: boolean) => call<{ ok: true }>('PUT', `/games/${gameId}`, { released }),
};
