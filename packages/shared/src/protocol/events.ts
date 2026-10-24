import type { ErrorInfo } from './errors';
import type { ClientEventName, ClientPayload } from './schemas';
import type { GameView } from '../games';
import type { PlayerId, RoomInfo, ServerStatus, SessionEndReason } from '../types';

export type Ack<T = null> = { ok: true; data: T } | { ok: false; error: ErrorInfo };

export interface SessionGrant {
  code: string;
  playerId: PlayerId;
  sessionToken: string;
}

/** Data returned in each client → server ack. */
export interface AckData {
  'time:sync': { serverNow: number };
  'room:create': SessionGrant;
  'room:join': SessionGrant;
  'room:resume': { code: string; playerId: PlayerId };
  'room:leave': null;
  'room:close': null;
  'lobby:setGame': null;
  'lobby:kick': null;
  'lobby:setSettings': null;
  'host:reassignSeat': null;
  'game:start': null;
  'game:action': null;
  'game:end': null;
  'results:playAgain': null;
  'results:toLobby': null;
}

export type ClientToServerEvents = {
  [E in ClientEventName]: (payload: ClientPayload<E>, ack: (res: Ack<AckData[E]>) => void) => void;
};

export interface ServerToClientEvents {
  'room:state': (info: RoomInfo) => void;
  'session:ended': (payload: { reason: SessionEndReason }) => void;
  /** Sent only to the player's own socket. `rev` increases with every game change. */
  'game:view': (payload: { rev: number; view: GameView }) => void;
  /** The host moved this socket into another seat (lost-token recovery). */
  'session:updated': (payload: { playerId: PlayerId }) => void;
  /** Maintenance mode and the admin's announcement. Sent on connect and on every change. */
  'server:status': (status: ServerStatus) => void;
}
