import type { PlayerId } from '@party/shared';
import type { AppSocket } from './types';

/** Which socket currently speaks for each (room, player). At most one. */
export class SocketRegistry {
  private readonly sockets = new Map<string, AppSocket>();

  get(code: string, playerId: PlayerId): AppSocket | undefined {
    return this.sockets.get(key(code, playerId));
  }

  set(code: string, playerId: PlayerId, socket: AppSocket): void {
    this.sockets.set(key(code, playerId), socket);
  }

  delete(code: string, playerId: PlayerId): void {
    this.sockets.delete(key(code, playerId));
  }
}

function key(code: string, playerId: PlayerId): string {
  return `${code}:${playerId}`;
}
