import type { ImposterSettings, ImposterView } from './imposter';

export type EmptySettings = Record<string, never>;

/** Settings per game. Games not built yet have none. */
export interface GameSettingsMap {
  imposter: ImposterSettings;
  traitor: EmptySettings;
  pictionary: EmptySettings;
}
export type AnyGameSettings = GameSettingsMap[keyof GameSettingsMap];

/** Every game's per-player view. Discriminated by `game`. */
export type GameView = ImposterView;
