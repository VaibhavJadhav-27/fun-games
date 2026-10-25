import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import type { ServerStatus } from '@party/shared';
import { startApp, type App } from '../src/app';

/** The new-version prompt: the server tells clients which web build it serves. */

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn();
});

async function statusFrom(app: App): Promise<ServerStatus> {
  const socket = connect(`http://localhost:${app.port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  cleanup.push(() => void socket.disconnect());
  return new Promise((resolve) => socket.once('server:status', resolve));
}

function webDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'party-web-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function start(dist?: string): Promise<App> {
  const app = await startApp({ port: 0, ...(dist ? { webDist: dist } : {}) });
  cleanup.push(() => app.close());
  return app;
}

describe('build version in server:status', () => {
  it('sends the id from the served build’s version.json', async () => {
    const app = await start(webDist({ 'index.html': '<!doctype html>', 'version.json': '{"id":"abc123"}' }));
    expect((await statusFrom(app)).version).toBe('abc123');
  });

  it('sends null when nothing is served (dev) or the file is missing or bad', async () => {
    expect((await statusFrom(await start())).version).toBeNull();
    expect((await statusFrom(await start(webDist({ 'index.html': '' })))).version).toBeNull();
    expect((await statusFrom(await start(webDist({ 'index.html': '', 'version.json': '{"id":42}' })))).version).toBeNull();
  });
});
