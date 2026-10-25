import { GAME_IDS, type GameId, type ServerStatus } from '@party/shared';

/**
 * Server-wide switches the admin controls: maintenance mode, the announcement banner, and
 * which games are released. In memory: a restart goes back to the defaults it was built with.
 */
export class ServerControls {
  private maintenanceOn = false;
  private readonly releasedGames: Set<GameId>;
  private current: { id: number; text: string; at: number } | null = null;
  private nextId = 1;
  private readonly listeners = new Set<(status: ServerStatus) => void>();

  /**
   * @param built games that exist on this server (only these can be released)
   * @param released games released at startup
   * @param version build id of the web app being served (null in dev)
   */
  constructor(
    private readonly built: readonly GameId[] = GAME_IDS,
    released: readonly GameId[] = built,
    private readonly version: string | null = null,
  ) {
    this.releasedGames = new Set(released.filter((id) => built.includes(id)));
  }

  isReleased(gameId: GameId): boolean {
    return this.releasedGames.has(gameId);
  }

  /** Returns false for a game that isn't built yet. */
  setReleased(gameId: GameId, released: boolean): boolean {
    if (!this.built.includes(gameId)) return false;
    if (released === this.releasedGames.has(gameId)) return true;
    if (released) this.releasedGames.add(gameId);
    else this.releasedGames.delete(gameId);
    this.notify();
    return true;
  }

  releasedMap(): Record<GameId, boolean> {
    return Object.fromEntries(GAME_IDS.map((id) => [id, this.releasedGames.has(id)])) as Record<GameId, boolean>;
  }

  get maintenance(): boolean {
    return this.maintenanceOn;
  }

  get announcement(): { id: number; text: string; at: number } | null {
    return this.current;
  }

  status(): ServerStatus {
    return {
      maintenance: this.maintenanceOn,
      announcement: this.current ? { id: this.current.id, text: this.current.text } : null,
      released: GAME_IDS.filter((id) => this.releasedGames.has(id)),
      version: this.version,
    };
  }

  setMaintenance(enabled: boolean): void {
    if (enabled === this.maintenanceOn) return;
    this.maintenanceOn = enabled;
    this.notify();
  }

  /** Null clears the banner. */
  announce(text: string | null): void {
    this.current = text === null ? null : { id: this.nextId++, text, at: Date.now() };
    this.notify();
  }

  onChange(listener: (status: ServerStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }
}
