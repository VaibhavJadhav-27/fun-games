import {
  DEFAULT_ERROR_MESSAGES,
  clientSchemas,
  type Ack,
  type AckData,
  type ClientEventName,
  type ErrorCode,
  type ParsedClientPayload,
  type PlayerId,
} from '@party/shared';
import { errorFields, log } from '../log';
import { err, ok, type Result } from '../rooms/result';
import type { ServerControls } from '../admin/controls';
import type { Room } from '../rooms/room';
import type { RoomManager } from '../rooms/roomManager';
import type { Broadcaster } from './broadcaster';
import { registerGameHandlers } from './handlers/game';
import { registerLobbyHandlers } from './handlers/lobby';
import { registerRoomHandlers } from './handlers/room';
import { KeyedRateLimiter, TokenBucket } from './rateLimit';
import type { SocketRegistry } from './registry';
import type { AppServer, AppSocket } from './types';

export const EVENTS_PER_SECOND = 20;
export const ROOM_CREATES_PER_MINUTE = 5;

export interface Membership {
  room: Room;
  playerId: PlayerId;
}

export interface Gateway {
  manager: RoomManager;
  registry: SocketRegistry;
  broadcaster: Broadcaster;
  controls: ServerControls;
  createLimiter: KeyedRateLimiter;
  /** Bind a socket to a player, replacing any older socket for that player. */
  bind(socket: AppSocket, room: Room, playerId: PlayerId): void;
  /** Release the socket's membership. `detach` marks the player as disconnected. */
  unbind(socket: AppSocket, opts: { detach: boolean }): void;
  membership(socket: AppSocket): Result<Membership>;
}

export type Handler<E extends ClientEventName> = (payload: ParsedClientPayload<E>) => Result<AckData[E]>;
export type On = <E extends ClientEventName>(event: E, handler: Handler<E>) => void;

export function createGateway(
  manager: RoomManager,
  registry: SocketRegistry,
  broadcaster: Broadcaster,
  controls: ServerControls,
  roomCreatesPerMinute = ROOM_CREATES_PER_MINUTE,
): Gateway {
  const gateway: Gateway = {
    manager,
    registry,
    broadcaster,
    controls,
    createLimiter: new KeyedRateLimiter(roomCreatesPerMinute, roomCreatesPerMinute / 60),

    bind(socket, room, playerId) {
      const { code, playerId: current } = socket.data;
      if (code !== room.code || current !== playerId) gateway.unbind(socket, { detach: true });

      const previous = registry.get(room.code, playerId);
      if (previous && previous !== socket) {
        previous.data = {};
        broadcaster.sessionEnded(previous, 'replaced');
      }
      registry.set(room.code, playerId, socket);
      socket.data = { code: room.code, playerId };
      room.attach(playerId);
      broadcaster.roomStateTo(socket, room);
    },

    unbind(socket, { detach }) {
      const { code, playerId } = socket.data;
      socket.data = {};
      if (code === undefined || playerId === undefined) return;
      if (registry.get(code, playerId) !== socket) return;
      registry.delete(code, playerId);
      if (detach) manager.get(code)?.detach(playerId);
    },

    membership(socket) {
      const { code, playerId } = socket.data;
      if (code === undefined || playerId === undefined) return err('NOT_IN_ROOM');
      const room = manager.get(code);
      if (!room || !room.has(playerId) || registry.get(code, playerId) !== socket) {
        return err('NOT_IN_ROOM');
      }
      return ok({ room, playerId });
    },
  };
  return gateway;
}

export function attachGateway(io: AppServer, gateway: Gateway): void {
  io.on('connection', (socket) => {
    const limiter = new TokenBucket(EVENTS_PER_SECOND, EVENTS_PER_SECOND);
    const on: On = (event, handler) => listen(socket, limiter, event, handler);
    gateway.broadcaster.serverStatus([socket], gateway.controls.status());

    on('time:sync', () => ok({ serverNow: Date.now() }));
    registerRoomHandlers(socket, gateway, on);
    registerLobbyHandlers(socket, gateway, on);
    registerGameHandlers(socket, gateway, on);

    socket.on('disconnect', () => gateway.unbind(socket, { detach: true }));
  });
}

/** Rate-limit, zod-parse, run and ack one client event. Never throws. */
function listen<E extends ClientEventName>(
  socket: AppSocket,
  limiter: TokenBucket,
  event: E,
  handler: Handler<E>,
): void {
  const listener = (raw: unknown, ack: unknown): void => {
    const reply = typeof ack === 'function' ? (ack as (res: Ack<unknown>) => void) : () => {};
    if (!limiter.take()) return reply(failure('RATE_LIMITED'));
    const parsed = clientSchemas[event].safeParse(raw);
    if (!parsed.success) return reply(failure('BAD_REQUEST'));
    try {
      const result = handler(parsed.data as ParsedClientPayload<E>);
      reply(result.ok ? { ok: true, data: result.value } : failure(result.code, result.message));
    } catch (error) {
      log.error('handler failed', { event, room: socket.data.code, ...errorFields(error) });
      reply(failure('INTERNAL'));
    }
  };
  // Payloads are untrusted until parsed, so the listener takes `unknown`.
  (socket as unknown as { on(event: string, fn: (raw: unknown, ack: unknown) => void): void }).on(
    event,
    listener,
  );
}

function failure(code: ErrorCode, message?: string): Ack<never> {
  return { ok: false, error: { code, message: message ?? DEFAULT_ERROR_MESSAGES[code] } };
}
