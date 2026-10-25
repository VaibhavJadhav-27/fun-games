import { create } from 'zustand';
import { GAME_IDS, GAME_META, type GameView, type PlayerId, type RoomInfo, type ServerStatus, type SessionEndReason } from '@party/shared';

export type Connection = 'connecting' | 'connected' | 'disconnected';

export interface StoreState {
  connection: Connection;
  /** True once the first connection succeeded; drives the "Reconnecting…" banner. */
  everConnected: boolean;
  socketId: string | null;
  /** serverNow − clientNow, for rendering server deadlines. */
  clockOffset: number;
  room: RoomInfo | null;
  /** This player's own game view (only while a game is running). */
  view: GameView | null;
  viewRev: number;
  playerId: PlayerId | null;
  /** The socket the server has bound to our player; differs from socketId after a reconnect. */
  boundSocketId: string | null;
  ended: { code: string; reason: SessionEndReason } | null;
  /** Maintenance mode and the admin's announcement. */
  server: ServerStatus;
  /** The announcement the player closed; a new one shows again. */
  dismissedAnnouncement: number | null;
}

export const useStore = create<StoreState>()(() => ({
  connection: 'connecting',
  everConnected: false,
  socketId: null,
  clockOffset: 0,
  room: null,
  view: null,
  viewRev: -1,
  playerId: null,
  boundSocketId: null,
  ended: null,
  // Until the server says otherwise, assume every built game is released (it corrects this on connect).
  server: { maintenance: false, announcement: null, released: GAME_IDS.filter((id) => GAME_META[id].available), version: null },
  dismissedAnnouncement: null,
}));

/** Server time now, corrected for clock skew. */
export function serverNow(): number {
  return Date.now() + useStore.getState().clockOffset;
}
