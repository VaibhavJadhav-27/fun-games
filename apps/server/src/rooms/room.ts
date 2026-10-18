import { randomUUID } from 'node:crypto';
import {
  MAX_MEMBERS,
  startBlockedReason,
  type GameId,
  type MemberInfo,
  type PlayerId,
  type Presence,
  type RoomInfo,
  type RoomStatus,
  type Seat,
  type SessionEndReason,
  type SessionGrant,
} from '@party/shared';
import { err, ok, type Result } from './result';
import { hashSessionToken, newSessionToken } from './sessions';

export const PRESENCE_GRACE_MS = 5_000;
export const HOST_AWAY_TRANSFER_MS = 60_000;
export const EMPTY_ROOM_TTL_MS = 30 * 60_000;
export const ROOM_MAX_AGE_MS = 3 * 60 * 60_000;

interface Member {
  id: PlayerId;
  name: string;
  joinedAt: number;
  /** Strict join order; breaks same-millisecond ties for "longest connected". */
  joinOrder: number;
  presence: Presence;
  seat: Seat;
  tokenHash: string;
  /** True while a socket is bound. Presence stays 'online' through the grace period. */
  attached: boolean;
  awaySince: number | null;
}

export interface RoomHooks {
  changed(room: Room): void;
  sessionEnded(room: Room, playerId: PlayerId, reason: SessionEndReason): void;
  closed(room: Room): void;
}

/**
 * One room: members, host, sessions and presence. Socket-agnostic: the transport layer
 * calls attach/detach, and learns about changes through hooks.
 */
export class Room {
  readonly createdAt: number;
  private rev = 0;
  private status: RoomStatus = 'lobby';
  private gameId: GameId;
  private hostId: PlayerId = '';
  private readonly members = new Map<PlayerId, Member>();
  private readonly sessions = new Map<string, PlayerId>();
  private readonly graceTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();
  private hostTimer: ReturnType<typeof setTimeout> | null = null;
  private emptySince: number | null = null;
  private closed = false;
  private joinSeq = 0;

  constructor(
    readonly code: string,
    gameId: GameId,
    private readonly hooks: RoomHooks,
  ) {
    this.gameId = gameId;
    this.createdAt = Date.now();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get host(): PlayerId {
    return this.hostId;
  }

  has(playerId: PlayerId): boolean {
    const member = this.members.get(playerId);
    return member !== undefined && member.presence !== 'left';
  }

  // ── Membership ────────────────────────────────────────────────────────────

  join(name: string): Result<SessionGrant> {
    if (this.closed) return err('ROOM_NOT_FOUND');
    const active = this.activeMembers();
    if (active.length >= MAX_MEMBERS) return err('ROOM_FULL');
    const lower = name.toLocaleLowerCase();
    if (active.some((m) => m.name.toLocaleLowerCase() === lower)) return err('NAME_TAKEN');

    const { token, hash } = newSessionToken();
    const member: Member = {
      id: randomUUID(),
      name,
      joinedAt: Date.now(),
      joinOrder: this.joinSeq++,
      presence: 'online',
      seat: this.status === 'lobby' ? 'playing' : 'waiting',
      tokenHash: hash,
      attached: false,
      awaySince: null,
    };
    this.members.set(member.id, member);
    this.sessions.set(hash, member.id);
    if (this.members.size === 1) this.hostId = member.id;
    this.emptySince = null;
    this.touch();
    return ok({ code: this.code, playerId: member.id, sessionToken: token });
  }

  resume(sessionToken: string): Result<PlayerId> {
    if (this.closed) return err('SESSION_INVALID');
    const id = this.sessions.get(hashSessionToken(sessionToken));
    if (id === undefined || !this.has(id)) return err('SESSION_INVALID');
    return ok(id);
  }

  leave(playerId: PlayerId): Result<null> {
    if (!this.has(playerId)) return err('NOT_IN_ROOM');
    this.remove(playerId);
    return ok(null);
  }

  kick(by: PlayerId, target: PlayerId): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    if (target === by || !this.has(target)) return err('INVALID_TARGET');
    this.remove(target);
    this.hooks.sessionEnded(this, target, 'kicked');
    return ok(null);
  }

  close(by: PlayerId): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    this.end('closed');
    return ok(null);
  }

  /** Called by the room manager's sweeper. */
  isExpired(now: number): boolean {
    if (now - this.createdAt >= ROOM_MAX_AGE_MS) return true;
    return this.emptySince !== null && now - this.emptySince >= EMPTY_ROOM_TTL_MS;
  }

  expire(): void {
    this.end('expired');
  }

  // ── Presence ──────────────────────────────────────────────────────────────

  /** A socket is now bound to this player. */
  attach(playerId: PlayerId): void {
    const member = this.members.get(playerId);
    if (!member || member.presence === 'left') return;
    member.attached = true;
    this.clearGrace(playerId);
    if (member.presence === 'away') {
      member.presence = 'online';
      member.awaySince = null;
      this.emptySince = null;
      this.checkHost();
      this.touch();
    }
  }

  /** The player's socket went away. They become 'away' after a short grace period. */
  detach(playerId: PlayerId): void {
    const member = this.members.get(playerId);
    if (!member || member.presence === 'left') return;
    member.attached = false;
    this.clearGrace(playerId);
    this.graceTimers.set(
      playerId,
      setTimeout(() => {
        this.graceTimers.delete(playerId);
        if (member.attached || member.presence !== 'online' || this.closed) return;
        member.presence = 'away';
        member.awaySince = Date.now();
        if (!this.activeMembers().some((m) => m.presence === 'online')) {
          this.emptySince = Date.now();
        }
        this.checkHost();
        this.touch();
      }, PRESENCE_GRACE_MS),
    );
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────

  setGame(by: PlayerId, gameId: GameId): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    if (this.status !== 'lobby') return err('WRONG_STATUS');
    if (gameId !== this.gameId) {
      this.gameId = gameId;
      this.touch();
    }
    return ok(null);
  }

  start(by: PlayerId): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    if (this.status !== 'lobby') return err('WRONG_STATUS');
    if (this.blockedReason() !== null) return err('START_BLOCKED');
    // Game engine arrives in M2.
    return err('GAME_UNAVAILABLE');
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  info(): RoomInfo {
    const members: MemberInfo[] = [...this.members.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((m) => ({
        id: m.id,
        name: m.name,
        isHost: m.id === this.hostId,
        presence: m.presence,
        seat: m.seat,
        joinedAt: m.joinedAt,
      }));
    return {
      rev: this.rev,
      code: this.code,
      status: this.status,
      members,
      gameId: this.gameId,
      startBlockedReason: this.status === 'lobby' ? this.blockedReason() : null,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private activeMembers(): Member[] {
    return [...this.members.values()].filter((m) => m.presence !== 'left');
  }

  private blockedReason(): string | null {
    const players = this.activeMembers().filter((m) => m.seat === 'playing').length;
    return startBlockedReason(this.gameId, players);
  }

  /** Lobby: the member is deleted. During a game (M2+): kept as 'left' for results. */
  private remove(playerId: PlayerId): void {
    const member = this.members.get(playerId);
    if (!member) return;
    this.clearGrace(playerId);
    this.sessions.delete(member.tokenHash);
    if (this.status === 'lobby') {
      this.members.delete(playerId);
    } else {
      member.presence = 'left';
      member.attached = false;
    }
    if (this.activeMembers().length === 0) {
      this.shutdown();
      return;
    }
    if (!this.activeMembers().some((m) => m.presence === 'online')) {
      this.emptySince ??= Date.now();
    }
    this.checkHost();
    this.touch();
  }

  /**
   * Host rules: a missing or departed host is replaced immediately; a host who has been
   * away for 60s is replaced by the online member who joined earliest.
   */
  private checkHost(): void {
    const host = this.members.get(this.hostId);
    if (host?.presence === 'online') {
      this.clearHostTimer();
      return;
    }
    if (!host || host.presence === 'left') {
      const next =
        this.earliest((m) => m.presence === 'online') ?? this.earliest((m) => m.presence !== 'left');
      if (next) this.hostId = next.id;
      this.clearHostTimer();
      return;
    }
    const due = (host.awaySince ?? Date.now()) + HOST_AWAY_TRANSFER_MS;
    if (Date.now() >= due) {
      const next = this.earliest((m) => m.presence === 'online' && m.id !== host.id);
      if (next) {
        this.hostId = next.id;
        this.clearHostTimer();
      }
      // Nobody online to take over: re-checked when someone comes back.
      return;
    }
    if (this.hostTimer === null) {
      this.hostTimer = setTimeout(() => {
        this.hostTimer = null;
        if (this.closed) return;
        const before = this.hostId;
        this.checkHost();
        if (this.hostId !== before) this.touch();
      }, due - Date.now());
    }
  }

  private earliest(pred: (m: Member) => boolean): Member | undefined {
    let best: Member | undefined;
    for (const m of this.members.values()) {
      if (pred(m) && (!best || m.joinOrder < best.joinOrder)) best = m;
    }
    return best;
  }

  private end(reason: SessionEndReason): void {
    if (this.closed) return;
    for (const m of this.activeMembers()) this.hooks.sessionEnded(this, m.id, reason);
    this.shutdown();
  }

  private shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
    this.clearHostTimer();
    this.sessions.clear();
    this.hooks.closed(this);
  }

  private clearGrace(playerId: PlayerId): void {
    const t = this.graceTimers.get(playerId);
    if (t) clearTimeout(t);
    this.graceTimers.delete(playerId);
  }

  private clearHostTimer(): void {
    if (this.hostTimer) clearTimeout(this.hostTimer);
    this.hostTimer = null;
  }

  private touch(): void {
    if (this.closed) return;
    this.rev++;
    this.hooks.changed(this);
  }
}
