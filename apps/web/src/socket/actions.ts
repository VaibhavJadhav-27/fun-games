import {
  DEFAULT_ERROR_MESSAGES,
  type Ack,
  type AckData,
  type AnyGameSettingsUpdate,
  type ClientEventName,
  type ImposterAction,
  type TraitorAction,
  type ClientPayload,
  type GameId,
  type PlayerId,
  type SessionGrant,
} from '@party/shared';
import { socket } from './client';
import { clearSession, loadSession, saveLastName, saveSession } from './session';
import { useStore } from './store';

const ACK_TIMEOUT_MS = 8000;

/** Every client → server call goes through here. Never throws; failures come back as acks. */
async function request<E extends ClientEventName>(event: E, payload: ClientPayload<E>): Promise<Ack<AckData[E]>> {
  if (!socket.connected) {
    return { ok: false, error: { code: 'TIMEOUT', message: DEFAULT_ERROR_MESSAGES.TIMEOUT } };
  }
  try {
    const timed = socket.timeout(ACK_TIMEOUT_MS) as unknown as {
      emitWithAck(e: E, p: ClientPayload<E>): Promise<Ack<AckData[E]>>;
    };
    return await timed.emitWithAck(event, payload);
  } catch {
    return { ok: false, error: { code: 'TIMEOUT', message: DEFAULT_ERROR_MESSAGES.TIMEOUT } };
  }
}

function adoptGrant(grant: SessionGrant, name: string): void {
  saveSession(grant.code, { playerId: grant.playerId, sessionToken: grant.sessionToken });
  saveLastName(name);
  useStore.setState({ playerId: grant.playerId, boundSocketId: socket.id ?? null, ended: null });
}

export async function syncClock(): Promise<void> {
  const sentAt = Date.now();
  const res = await request('time:sync', {});
  if (!res.ok) return;
  const rtt = Date.now() - sentAt;
  useStore.setState({ clockOffset: res.data.serverNow - (sentAt + rtt / 2) });
}

export async function createRoom(name: string, gameId: GameId) {
  const res = await request('room:create', { name, gameId });
  if (res.ok) adoptGrant(res.data, name);
  return res;
}

export async function joinRoom(code: string, name: string) {
  const res = await request('room:join', { code, name });
  if (res.ok) adoptGrant(res.data, name);
  return res;
}

/** Re-bind this socket to our stored seat. Returns null when there is no stored session. */
export async function resumeRoom(code: string) {
  const session = loadSession(code);
  if (!session) return null;
  const res = await request('room:resume', { code, sessionToken: session.sessionToken });
  if (res.ok) {
    useStore.setState({ playerId: res.data.playerId, boundSocketId: socket.id ?? null, ended: null });
  } else if (res.error.code === 'SESSION_INVALID') {
    clearSession(code);
  }
  return res;
}

export async function leaveRoom(code: string) {
  const res = await request('room:leave', {});
  clearSession(code);
  useStore.setState({ room: null, playerId: null, boundSocketId: null });
  return res;
}

export const closeRoom = () => request('room:close', {});
export const setGame = (gameId: GameId) => request('lobby:setGame', { gameId });
export const setSettings = (settings: AnyGameSettingsUpdate) => request('lobby:setSettings', { settings });
export const kickPlayer = (playerId: PlayerId) => request('lobby:kick', { playerId });
export const startGame = () => request('game:start', {});
export const endGame = () => request('game:end', {});
export const playAgain = () => request('results:playAgain', {});
export const backToLobby = () => request('results:toLobby', {});
export const reassignSeat = (fromPlayerId: PlayerId, toPlayerId: PlayerId) =>
  request('host:reassignSeat', { fromPlayerId, toPlayerId });

/** Send a game action for the phase currently on screen (stale taps are rejected server-side). */
export function gameAction(action: ImposterAction | TraitorAction) {
  const phaseSeq = useStore.getState().view?.phaseSeq ?? 0;
  return request('game:action', { phaseSeq, action });
}

export function clearEnded(): void {
  useStore.setState({ ended: null });
}
