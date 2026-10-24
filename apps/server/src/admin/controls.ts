import type { ServerStatus } from '@party/shared';

/** Server-wide switches the admin controls: maintenance mode and the announcement banner. */
export class ServerControls {
  private maintenanceOn = false;
  private current: { id: number; text: string; at: number } | null = null;
  private nextId = 1;
  private readonly listeners = new Set<(status: ServerStatus) => void>();

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
