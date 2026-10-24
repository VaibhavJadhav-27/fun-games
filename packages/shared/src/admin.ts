import { z } from 'zod';
import type { GameId, Presence, RoomStatus, Seat } from './types';

/**
 * Admin dashboard API (HTTP, not the game socket). Room summaries carry public room
 * information only: never game state, words or roles.
 */

export const ADMIN_API_PREFIX = '/admin/api';
export const ANNOUNCEMENT_MAX_LENGTH = 200;

export const adminLoginSchema = z.strictObject({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});
export type AdminLogin = z.infer<typeof adminLoginSchema>;

export const adminMaintenanceSchema = z.strictObject({ enabled: z.boolean() });

export const adminAnnouncementSchema = z.strictObject({
  /** Null clears the banner. */
  text: z.string().trim().min(1).max(ANNOUNCEMENT_MAX_LENGTH).nullable(),
});

export interface AdminRoomMember {
  name: string;
  isHost: boolean;
  presence: Presence;
  seat: Seat;
}

export interface AdminRoom {
  code: string;
  gameId: GameId;
  status: RoomStatus;
  members: AdminRoomMember[];
  createdAt: number;
  lastActiveAt: number;
  /** Set while nobody is connected: the room is stale and will expire. */
  emptySince: number | null;
  expiresAt: number;
}

export interface AdminUsage {
  since: number;
  roomsCreated: number;
  gamesStarted: Record<GameId, number>;
  gamesFinished: number;
  gamesEndedByHost: number;
  /** Average length of finished games, or null if none yet. */
  avgGameMs: number | null;
  peakOnlinePlayers: number;
  peakRooms: number;
}

export interface AdminHealth {
  startedAt: number;
  now: number;
  nodeVersion: string;
  memoryMb: { rss: number; heapUsed: number };
  sockets: number;
}

export interface AdminOverview {
  health: AdminHealth;
  usage: AdminUsage;
  maintenance: boolean;
  announcement: { id: number; text: string; at: number } | null;
  rooms: AdminRoom[];
}
