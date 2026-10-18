import type { ErrorInfo } from './errors';
import type { ClientEventName, ClientPayload } from './schemas';
import type { PlayerId, RoomInfo, SessionEndReason } from '../types';

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
  'game:start': null;
}

export type ClientToServerEvents = {
  [E in ClientEventName]: (payload: ClientPayload<E>, ack: (res: Ack<AckData[E]>) => void) => void;
};

export interface ServerToClientEvents {
  'room:state': (info: RoomInfo) => void;
  'session:ended': (payload: { reason: SessionEndReason }) => void;
}
