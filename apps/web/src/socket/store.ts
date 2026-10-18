import { create } from 'zustand';
import type { PlayerId, RoomInfo, SessionEndReason } from '@party/shared';

export type Connection = 'connecting' | 'connected' | 'disconnected';

export interface StoreState {
  connection: Connection;
  /** True once the first connection succeeded; drives the "Reconnecting…" banner. */
  everConnected: boolean;
  socketId: string | null;
  /** serverNow − clientNow, for rendering server deadlines. */
  clockOffset: number;
  room: RoomInfo | null;
  playerId: PlayerId | null;
  /** The socket the server has bound to our player; differs from socketId after a reconnect. */
  boundSocketId: string | null;
  ended: { code: string; reason: SessionEndReason } | null;
}

export const useStore = create<StoreState>()(() => ({
  connection: 'connecting',
  everConnected: false,
  socketId: null,
  clockOffset: 0,
  room: null,
  playerId: null,
  boundSocketId: null,
  ended: null,
}));
