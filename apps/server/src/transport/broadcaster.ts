import type { PlayerId, ServerStatus, SessionEndReason } from '@party/shared';
import type { Room } from '../rooms/room';
import type { SocketRegistry } from './registry';
import type { AppSocket } from './types';

/**
 * The ONLY module allowed to emit to sockets (lint-enforced). Every message goes to one
 * member's own socket; nothing is ever emitted to a Socket.IO room. Game views are
 * computed per player and only ever sent to that player's socket.
 *
 * Updates are coalesced per microtask, so several changes in one handler (and the ack
 * for it) go out before a single room:state / game:view.
 */
export class Broadcaster {
  private readonly pendingRooms = new Set<Room>();
  private readonly pendingGames = new Set<Room>();
  private readonly pendingDirect = new Map<AppSocket, Room>();
  private scheduled = false;

  constructor(private readonly registry: SocketRegistry) {}

  /** Send room:state to every member of the room. */
  roomChanged(room: Room): void {
    this.pendingRooms.add(room);
    this.schedule();
  }

  /** Send each playing member their own game view. */
  gameChanged(room: Room): void {
    this.pendingGames.add(room);
    this.schedule();
  }

  /** Send room:state (and game:view, if playing) to one socket after join/resume. */
  roomStateTo(socket: AppSocket, room: Room): void {
    this.pendingDirect.set(socket, room);
    this.schedule();
  }

  sessionEnded(socket: AppSocket, reason: SessionEndReason): void {
    this.pendingDirect.delete(socket);
    socket.emit('session:ended', { reason });
  }

  sessionUpdated(socket: AppSocket, playerId: PlayerId): void {
    socket.emit('session:updated', { playerId });
  }

  /** Server-wide status (maintenance, announcement). Public; contains no room data. */
  serverStatus(sockets: Iterable<AppSocket>, status: ServerStatus): void {
    for (const socket of sockets) socket.emit('server:status', status);
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  private flush(): void {
    this.scheduled = false;

    const sent = new Set<AppSocket>();
    for (const room of this.pendingRooms) {
      if (room.isClosed) continue;
      const info = room.info();
      for (const member of info.members) {
        const socket = this.registry.get(room.code, member.id);
        if (!socket || sent.has(socket)) continue;
        socket.emit('room:state', info);
        sent.add(socket);
      }
    }
    for (const [socket, room] of this.pendingDirect) {
      if (sent.has(socket) || room.isClosed || socket.data.code !== room.code) continue;
      socket.emit('room:state', room.info());
    }

    const viewed = new Set<AppSocket>();
    for (const room of this.pendingGames) {
      if (room.isClosed) continue;
      for (const member of room.info().members) {
        const socket = this.registry.get(room.code, member.id);
        if (socket) this.sendView(socket, room, member.id, viewed);
      }
    }
    for (const [socket, room] of this.pendingDirect) {
      const { code, playerId } = socket.data;
      if (code === room.code && playerId !== undefined && !room.isClosed) {
        this.sendView(socket, room, playerId, viewed);
      }
    }

    this.pendingRooms.clear();
    this.pendingGames.clear();
    this.pendingDirect.clear();
  }

  private sendView(socket: AppSocket, room: Room, playerId: PlayerId, viewed: Set<AppSocket>): void {
    if (viewed.has(socket)) return;
    viewed.add(socket);
    const payload = room.gameViewFor(playerId);
    if (payload) socket.emit('game:view', payload);
  }
}
