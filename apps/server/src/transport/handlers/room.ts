import { err, ok } from '../../rooms/result';
import type { Gateway, On } from '../gateway';
import type { AppSocket } from '../types';

export function registerRoomHandlers(socket: AppSocket, gateway: Gateway, on: On): void {
  const { manager } = gateway;

  on('room:create', ({ name, gameId }) => {
    if (gateway.controls.maintenance) return err('MAINTENANCE');
    if (!gateway.createLimiter.take(gateway.ipOf(socket))) return err('RATE_LIMITED');
    const created = manager.create(name, gameId);
    if (!created.ok) return created;
    const { room, grant } = created.value;
    gateway.bind(socket, room, grant.playerId);
    return ok(grant);
  });

  on('room:join', ({ code, name }) => {
    const room = manager.get(code);
    if (!room) return err('ROOM_NOT_FOUND');
    const joined = room.join(name);
    if (!joined.ok) return joined;
    gateway.bind(socket, room, joined.value.playerId);
    return ok(joined.value);
  });

  on('room:resume', ({ code, sessionToken }) => {
    const room = manager.get(code);
    if (!room) return err('SESSION_INVALID');
    const resumed = room.resume(sessionToken);
    if (!resumed.ok) return resumed;
    gateway.bind(socket, room, resumed.value);
    return ok({ code, playerId: resumed.value });
  });

  on('room:leave', () => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    gateway.unbind(socket, { detach: false });
    return member.value.room.leave(member.value.playerId);
  });

  on('room:close', () => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    return member.value.room.close(member.value.playerId);
  });
}
