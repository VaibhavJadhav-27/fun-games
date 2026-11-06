import type { ErrorInfo } from './errors';
import type { ClientEventName, ClientPayload, GameStreamPayload } from './schemas';
import type { GameActionReply, GameStreamOp, GameView } from '../games';
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
  /** Null unless the game replies to the sender (e.g. a Pictionary guess result). */
  'game:action': GameActionReply | null;
  'game:end': null;
  'results:playAgain': null;
  'results:toLobby': null;
}

export type ClientToServerEvents = {
  [E in ClientEventName]: (payload: ClientPayload<E>, ack: (res: Ack<AckData[E]>) => void) => void;
} & {
  /** High-frequency public drawing data. No ack. */
  'game:stream': (payload: GameStreamPayload) => void;
};

export interface ServerToClientEvents {
  'room:state': (info: RoomInfo) => void;
  'session:ended': (payload: { reason: SessionEndReason }) => void;
  /** Sent only to the player's own socket. `rev` increases with every game change. */
  'game:view': (payload: { rev: number; view: GameView }) => void;
  /** One op on the game's stream channel, relayed from the sender to every other player. */
  'game:stream': (payload: { channelKey: string; op: GameStreamOp }) => void;
  /** The whole (compacted) channel, sent to one socket on join or resume mid-round. */
  'game:streamReset': (payload: { channelKey: string; ops: GameStreamOp[] }) => void;
  /** The host moved this socket into another seat (lost-token recovery). */
  'session:updated': (payload: { playerId: PlayerId }) => void;
  /** Maintenance mode and the admin's announcement. Sent on connect and on every change. */
  'server:status': (status: ServerStatus) => void;
}
