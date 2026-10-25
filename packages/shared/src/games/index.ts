import type { ImposterPublicSettings, ImposterSettingsUpdate, ImposterView } from './imposter';
import type { PictionarySettings, PictionaryView } from './pictionary';
import type { TraitorSettings, TraitorView } from './traitor';

/** Settings per game, as everyone in the room sees them (secrets removed). */
export interface GameSettingsMap {
  imposter: ImposterPublicSettings;
  traitor: TraitorSettings;
  pictionary: PictionarySettings;
}
export type AnyGameSettings = GameSettingsMap[keyof GameSettingsMap];

/** What the host sends to change settings (games may accept partial secrets, e.g. keep the custom word). */
export type AnyGameSettingsUpdate = ImposterSettingsUpdate | TraitorSettings | PictionarySettings;

/** Every game's per-player view. Discriminated by `game`. */
export type GameView = ImposterView | TraitorView | PictionaryView;
