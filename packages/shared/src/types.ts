export type PlayerId = string;

export const GAME_IDS = ['imposter', 'traitor', 'pictionary'] as const;
export type GameId = (typeof GAME_IDS)[number];

export type RoomStatus = 'lobby' | 'playing' | 'results';
export type Presence = 'online' | 'away' | 'left';
export type Seat = 'playing' | 'waiting';

/** Public information about one room member. Sent to everyone in the room. */
export interface MemberInfo {
  id: PlayerId;
  name: string;
  isHost: boolean;
  presence: Presence;
  seat: Seat;
  joinedAt: number;
}

/** Public room state. Never contains game state or secrets. */
export interface RoomInfo {
  rev: number;
  code: string;
  status: RoomStatus;
  members: MemberInfo[];
  gameId: GameId;
  startBlockedReason: string | null;
}

export type SessionEndReason = 'kicked' | 'closed' | 'expired' | 'replaced';
