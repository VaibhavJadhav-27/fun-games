import type { SessionEndReason } from '@party/shared';
import type { Room } from '../rooms/room';
import type { SocketRegistry } from './registry';
import type { AppSocket } from './types';

/**
 * The ONLY module allowed to emit to sockets (lint-enforced). Every message goes to one
 * member's own socket; nothing is ever emitted to a Socket.IO room.
 *
 * Room updates are coalesced per microtask, so several changes in one handler (and the
 * ack for it) go out before a single room:state.
 */
export class Broadcaster {
  private readonly pendingRooms = new Set<Room>();
  private readonly pendingDirect = new Map<AppSocket, Room>();
  private scheduled = false;

  constructor(private readonly registry: SocketRegistry) {}

  /** Send room:state to every member of the room. */
  roomChanged(room: Room): void {
    this.pendingRooms.add(room);
    this.schedule();
  }

  /** Send room:state to one socket (after join/resume), even if nothing changed. */
  roomStateTo(socket: AppSocket, room: Room): void {
    this.pendingDirect.set(socket, room);
    this.schedule();
  }

  sessionEnded(socket: AppSocket, reason: SessionEndReason): void {
    this.pendingDirect.delete(socket);
    socket.emit('session:ended', { reason });
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
    this.pendingRooms.clear();
    this.pendingDirect.clear();
  }
}
