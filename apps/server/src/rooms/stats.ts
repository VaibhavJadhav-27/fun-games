import { GAME_IDS, type AdminUsage, type GameId, type GameResult } from '@party/shared';

/** Usage counters since the server started. In memory only, no personal data. */
export class UsageStats {
  private readonly since = Date.now();
  private roomsCreated = 0;
  private readonly started = Object.fromEntries(GAME_IDS.map((id) => [id, 0])) as Record<GameId, number>;
  private finished = 0;
  private endedByHost = 0;
  private totalGameMs = 0;
  private peakOnline = 0;
  private peakRooms = 0;

  roomCreated(): void {
    this.roomsCreated++;
  }

  gameStarted(gameId: GameId): void {
    this.started[gameId]++;
  }

  gameFinished(result: GameResult, durationMs: number): void {
    this.finished++;
    if (result.endedBy === 'host') this.endedByHost++;
    this.totalGameMs += durationMs;
  }

  observe(onlinePlayers: number, rooms: number): void {
    this.peakOnline = Math.max(this.peakOnline, onlinePlayers);
    this.peakRooms = Math.max(this.peakRooms, rooms);
  }

  snapshot(): AdminUsage {
    return {
      since: this.since,
      roomsCreated: this.roomsCreated,
      gamesStarted: { ...this.started },
      gamesFinished: this.finished,
      gamesEndedByHost: this.endedByHost,
      avgGameMs: this.finished > 0 ? Math.round(this.totalGameMs / this.finished) : null,
      peakOnlinePlayers: this.peakOnline,
      peakRooms: this.peakRooms,
    };
  }
}
