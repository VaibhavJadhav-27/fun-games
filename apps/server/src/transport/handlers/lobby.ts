import type { Gateway, On } from '../gateway';
import type { AppSocket } from '../types';

export function registerLobbyHandlers(socket: AppSocket, gateway: Gateway, on: On): void {
  on('lobby:setGame', ({ gameId }) => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    return member.value.room.setGame(member.value.playerId, gameId);
  });

  on('lobby:kick', ({ playerId }) => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    return member.value.room.kick(member.value.playerId, playerId);
  });

  on('game:start', () => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    return member.value.room.start(member.value.playerId);
  });
}
