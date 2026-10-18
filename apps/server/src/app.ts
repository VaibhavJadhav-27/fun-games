import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import sirv from 'sirv';
import { loadWordBank } from '@party/content';
import type { Rng } from './engine/rng';
import { createSocketLayer, type SocketLayer } from './transport/server';

export interface AppOptions {
  port: number;
  /** Built SPA to serve. Omitted in dev, where Vite serves the client. */
  webDist?: string;
  allowedOrigin?: string;
  /** Per-IP limit on room creation. Raised in tests, where every client shares one IP. */
  roomCreatesPerMinute?: number;
  /** Seeded rng per game, for tests. */
  rng?: () => Rng;
}

export interface App {
  port: number;
  sockets: SocketLayer;
  close(): Promise<void>;
}

export async function startApp(options: AppOptions): Promise<App> {
  const serveStatic =
    options.webDist && existsSync(options.webDist)
      ? sirv(options.webDist, { single: true, etag: true, gzip: true, brotli: true })
      : null;

  let sockets: SocketLayer | null = null;
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: sockets?.manager.size ?? 0, sockets: sockets?.socketCount() ?? 0 }));
      return;
    }
    if (serveStatic) {
      serveStatic(req, res, () => {
        res.writeHead(404);
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  sockets = createSocketLayer(httpServer, {
    allowedOrigin: options.allowedOrigin,
    roomCreatesPerMinute: options.roomCreatesPerMinute,
    bank: loadWordBank(),
    rng: options.rng,
  });
  sockets.manager.startSweeper();
  const pruner = setInterval(() => sockets?.pruneRateLimits(), 60_000);
  pruner.unref();

  await new Promise<void>((resolve) => httpServer.listen(options.port, resolve));
  const { port } = httpServer.address() as AddressInfo;
  const layer = sockets;

  return {
    port,
    sockets: layer,
    close: async () => {
      clearInterval(pruner);
      layer.manager.stopSweeper();
      await layer.io.close();
    },
  };
}
