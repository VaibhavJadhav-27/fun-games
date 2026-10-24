import type { ServerResponse } from 'node:http';

/** Bundle a burst of changes (e.g. 10 players joining) into one ping. */
export const CHANGE_COALESCE_MS = 300;
/** Keeps proxies from closing an idle stream, and re-checks the session. */
export const HEARTBEAT_MS = 25_000;
export const MAX_STREAMS = 10;

interface Stream {
  res: ServerResponse;
  token: string;
}

/**
 * Server-Sent Events for the admin dashboard. A ping says only "something changed":
 * no room data travels here, so the dashboard re-fetches the snapshot itself.
 */
export class AdminChangeFeed {
  private readonly streams = new Set<Stream>();
  private pending: ReturnType<typeof setTimeout> | null = null;
  private readonly heartbeat: ReturnType<typeof setInterval>;

  constructor(private readonly isValid: (token: string) => boolean) {
    this.heartbeat = setInterval(() => this.send(': heartbeat\n\n'), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  get size(): number {
    return this.streams.size;
  }

  /** Takes over the response. Returns false if there are already too many streams. */
  open(res: ServerResponse, token: string): boolean {
    if (this.streams.size >= MAX_STREAMS) return false;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const stream = { res, token };
    this.streams.add(stream);
    res.on('close', () => this.streams.delete(stream));
    return true;
  }

  /** Something changed. Pings go out at most once per CHANGE_COALESCE_MS. */
  changed(): void {
    if (this.pending || this.streams.size === 0) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      this.send('event: changed\ndata: {}\n\n');
    }, CHANGE_COALESCE_MS);
    this.pending.unref();
  }

  close(): void {
    clearInterval(this.heartbeat);
    if (this.pending) clearTimeout(this.pending);
    for (const { res } of this.streams) res.end();
    this.streams.clear();
  }

  private send(frame: string): void {
    for (const stream of this.streams) {
      if (!this.isValid(stream.token)) {
        // Logged out or expired: tell the page, then hang up.
        stream.res.end('event: logout\ndata: {}\n\n');
        this.streams.delete(stream);
        continue;
      }
      stream.res.write(frame);
    }
  }
}
