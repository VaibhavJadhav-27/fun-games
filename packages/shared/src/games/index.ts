import type { ImposterPublicSettings, ImposterSettingsUpdate, ImposterView } from './imposter';
import type { TraitorSettings, TraitorView } from './traitor';

export type EmptySettings = Record<string, never>;

/** Settings per game, as everyone in the room sees them (secrets removed). Games not built yet have none. */
export interface GameSettingsMap {
  imposter: ImposterPublicSettings;
  traitor: TraitorSettings;
  pictionary: EmptySettings;
}
export type AnyGameSettings = GameSettingsMap[keyof GameSettingsMap];

/** What the host sends to change settings (games may accept partial secrets, e.g. keep the custom word). */
export type AnyGameSettingsUpdate = ImposterSettingsUpdate | TraitorSettings | EmptySettings;

/** Every game's per-player view. Discriminated by `game`. */
export type GameView = ImposterView | TraitorView;
