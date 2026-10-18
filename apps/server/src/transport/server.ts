import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { RoomManager } from '../rooms/roomManager';
import { Broadcaster } from './broadcaster';
import { attachGateway, createGateway } from './gateway';
import { SocketRegistry } from './registry';
import type { AppServer } from './types';

export interface SocketLayer {
  io: AppServer;
  manager: RoomManager;
  socketCount(): number;
  pruneRateLimits(): void;
}

export interface SocketLayerOptions {
  allowedOrigin?: string;
  roomCreatesPerMinute?: number;
}

export function createSocketLayer(httpServer: HttpServer, options: SocketLayerOptions): SocketLayer {
  const io: AppServer = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    cors: options.allowedOrigin ? { origin: options.allowedOrigin } : undefined,
  });

  const registry = new SocketRegistry();
  const broadcaster = new Broadcaster(registry);
  const manager = new RoomManager({
    changed: (room) => broadcaster.roomChanged(room),
    sessionEnded: (room, playerId, reason) => {
      const socket = registry.get(room.code, playerId);
      if (!socket) return;
      registry.delete(room.code, playerId);
      socket.data = {};
      broadcaster.sessionEnded(socket, reason);
    },
    closed: () => {},
  });

  const gateway = createGateway(manager, registry, broadcaster, options.roomCreatesPerMinute);
  attachGateway(io, gateway);

  return {
    io,
    manager,
    socketCount: () => io.engine.clientsCount,
    pruneRateLimits: () => gateway.createLimiter.prune(),
  };
}
