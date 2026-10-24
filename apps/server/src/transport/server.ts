import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { WordBank } from '@party/content';
import type { ServerControls } from '../admin/controls';
import type { Rng } from '../engine/rng';
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
  controls: ServerControls;
  bank: WordBank;
  rng?: () => Rng;
}

export function createSocketLayer(httpServer: HttpServer, options: SocketLayerOptions): SocketLayer {
  const io: AppServer = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    cors: options.allowedOrigin ? { origin: options.allowedOrigin } : undefined,
  });

  const registry = new SocketRegistry();
  const broadcaster = new Broadcaster(registry);
  const manager = new RoomManager(
    {
      changed: (room) => broadcaster.roomChanged(room),
      gameChanged: (room) => broadcaster.gameChanged(room),
      sessionEnded: (room, playerId, reason) => {
        const socket = registry.get(room.code, playerId);
        if (!socket) return;
        registry.delete(room.code, playerId);
        socket.data = {};
        broadcaster.sessionEnded(socket, reason);
      },
      seatMoved: (room, fromId, toId) => {
        const socket = registry.get(room.code, fromId);
        if (!socket) return;
        registry.delete(room.code, fromId);
        registry.set(room.code, toId, socket);
        socket.data = { code: room.code, playerId: toId };
        broadcaster.sessionUpdated(socket, toId);
        broadcaster.roomStateTo(socket, room);
      },
      closed: () => {},
    },
    { bank: options.bank, rng: options.rng },
  );

  const gateway = createGateway(manager, registry, broadcaster, options.controls, options.roomCreatesPerMinute);
  attachGateway(io, gateway);
  options.controls.onChange((status) => broadcaster.serverStatus(io.sockets.sockets.values(), status));

  return {
    io,
    manager,
    socketCount: () => io.engine.clientsCount,
    pruneRateLimits: () => gateway.createLimiter.prune(),
  };
}
