import type { Gateway, On } from '../gateway';
import type { AppSocket } from '../types';

export function registerGameHandlers(socket: AppSocket, gateway: Gateway, on: On): void {
  on('game:action', ({ phaseSeq, action }) => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    return member.value.room.gameAction(member.value.playerId, phaseSeq, action);
  });

  on('game:end', () => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    return member.value.room.endGame(member.value.playerId);
  });

  on('results:playAgain', () => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    return member.value.room.playAgain(member.value.playerId);
  });

  on('results:toLobby', () => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    return member.value.room.toLobby(member.value.playerId);
  });

  on('host:reassignSeat', ({ fromPlayerId, toPlayerId }) => {
    const member = gateway.membership(socket);
    if (!member.ok) return member;
    return member.value.room.reassignSeat(member.value.playerId, fromPlayerId, toPlayerId);
  });
}
