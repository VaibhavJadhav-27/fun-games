import type { ImposterPublicSettings, ImposterSettingsUpdate, ImposterView } from './imposter';
import type { PictionaryGuessReply, PictionarySettings, PictionaryStreamOp, PictionaryView } from './pictionary';
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

/** Ack data a game action can return to its sender only (e.g. a Pictionary guess result). */
export type GameActionReply = PictionaryGuessReply;

/** Every game's public stream op (ARCHITECTURE §7.4). */
export type GameStreamOp = PictionaryStreamOp;
