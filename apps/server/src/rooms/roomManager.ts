import type { GameId, PlayerId, SessionEndReason, SessionGrant } from '@party/shared';
import { generateRoomCode } from './codes';
import { err, ok, type Result } from './result';
import { Room, type RoomDeps } from './room';

export interface RoomEvents {
  changed(room: Room): void;
  gameChanged(room: Room): void;
  sessionEnded(room: Room, playerId: PlayerId, reason: SessionEndReason): void;
  seatMoved(room: Room, fromId: PlayerId, toId: PlayerId): void;
  closed(room: Room): void;
}

export const SWEEP_INTERVAL_MS = 60_000;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly events: RoomEvents,
    private readonly deps: RoomDeps,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  create(hostName: string, gameId: GameId): Result<{ room: Room; grant: SessionGrant }> {
    const code = generateRoomCode((c) => this.rooms.has(c));
    const room = new Room(
      code,
      gameId,
      {
        changed: (r) => this.events.changed(r),
        gameChanged: (r) => this.events.gameChanged(r),
        sessionEnded: (r, id, reason) => this.events.sessionEnded(r, id, reason),
        seatMoved: (r, from, to) => this.events.seatMoved(r, from, to),
        closed: (r) => {
          this.rooms.delete(r.code);
          this.events.closed(r);
        },
      },
      this.deps,
    );
    this.rooms.set(code, room);
    const joined = room.join(hostName);
    if (!joined.ok) {
      this.rooms.delete(code);
      return err(joined.code);
    }
    return ok({ room, grant: joined.value });
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  sweep(now = Date.now()): void {
    for (const room of [...this.rooms.values()]) {
      if (room.isExpired(now)) room.expire();
    }
  }

  startSweeper(intervalMs = SWEEP_INTERVAL_MS): void {
    this.sweeper ??= setInterval(() => this.sweep(), intervalMs);
    this.sweeper.unref();
  }

  stopSweeper(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }
}
