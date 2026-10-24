import { randomUUID } from 'node:crypto';
import type { WordBank } from '@party/content';
import {
  GAME_IDS,
  MAX_MEMBERS,
  type AdminRoom,
  startBlockedReason,
  type AnyGameSettings,
  type GameId,
  type GameResult,
  type GameView,
  type MemberInfo,
  type PlayerId,
  type Presence,
  type RoomInfo,
  type RoomStatus,
  type Seat,
  type SessionEndReason,
  type SessionGrant,
} from '@party/shared';
import { GameRunner } from '../engine/runner';
import { cryptoRng, type Rng } from '../engine/rng';
import { errorFields, log } from '../log';
import { gameFor } from '../games/registry';
import { err, ok, type Result } from './result';
import { hashSessionToken, newSessionToken } from './sessions';
import type { UsageStats } from './stats';

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
  /** The game state changed: send each playing member their view. */
  gameChanged(room: Room): void;
  sessionEnded(room: Room, playerId: PlayerId, reason: SessionEndReason): void;
  /** A waiting member's socket now speaks for another seat (host seat reassign). */
  seatMoved(room: Room, fromId: PlayerId, toId: PlayerId): void;
  closed(room: Room): void;
}

export interface RoomDeps {
  bank: WordBank;
  /** A fresh rng per game. Seeded in tests. */
  rng?: () => Rng;
  stats?: UsageStats;
}

/**
 * One room: members, host, sessions, presence, and the running game. Socket-agnostic:
 * the transport layer calls attach/detach and learns about changes through hooks.
 * The room never special-cases a game; it talks to the GameRunner.
 */
export class Room {
  readonly createdAt: number;
  private rev = 0;
  private status: RoomStatus = 'lobby';
  private gameId: GameId;
  private readonly settings = new Map<GameId, unknown>();
  private runner: GameRunner | null = null;
  private result: GameResult | null = null;
  private hostId: PlayerId = '';
  private readonly members = new Map<PlayerId, Member>();
  private readonly sessions = new Map<string, PlayerId>();
  private readonly graceTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();
  private hostTimer: ReturnType<typeof setTimeout> | null = null;
  private emptySince: number | null = null;
  private lastActiveAt = Date.now();
  private gameStartedAt = 0;
  private closed = false;
  private joinSeq = 0;

  constructor(
    readonly code: string,
    gameId: GameId,
    private readonly hooks: RoomHooks,
    private readonly deps: RoomDeps,
  ) {
    this.gameId = gameId;
    this.createdAt = Date.now();
    for (const id of GAME_IDS) this.settings.set(id, gameFor(id)?.settings.defaults() ?? {});
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get host(): PlayerId {
    return this.hostId;
  }

  get statusNow(): RoomStatus {
    return this.status;
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
    this.clampSettings();
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

  /**
   * Lost-token recovery: a waiting member takes over an away/left seat in the running
   * game. The seat keeps its PlayerId and name, so game state needs no change.
   */
  reassignSeat(by: PlayerId, fromSeatId: PlayerId, toWaitingId: PlayerId): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    if (this.status !== 'playing') return err('WRONG_STATUS');
    const seat = this.members.get(fromSeatId);
    const waiting = this.members.get(toWaitingId);
    if (!seat || seat.seat !== 'playing' || seat.presence === 'online') return err('INVALID_TARGET');
    if (!waiting || waiting.seat !== 'waiting' || waiting.presence === 'left') return err('INVALID_TARGET');

    this.sessions.delete(seat.tokenHash);
    this.sessions.set(waiting.tokenHash, seat.id);
    seat.tokenHash = waiting.tokenHash;
    seat.presence = waiting.presence === 'online' ? 'online' : 'away';
    seat.awaySince = seat.presence === 'away' ? Date.now() : null;
    seat.attached = waiting.attached;
    this.clearGrace(waiting.id);
    this.members.delete(waiting.id);
    this.hooks.seatMoved(this, waiting.id, seat.id);
    if (!seat.attached) this.detach(seat.id);

    this.gameInput({ kind: 'presence', playerId: seat.id, online: seat.presence === 'online' });
    this.checkHost();
    this.touch();
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

  /** The admin closed the room: everyone sees "Room closed". */
  adminClose(): void {
    this.end('closed');
  }

  /** No member is connected; the room will expire unless someone comes back. */
  get isStale(): boolean {
    return this.emptySince !== null;
  }

  onlineCount(): number {
    return this.activeMembers().filter((m) => m.presence === 'online').length;
  }

  /** For the admin dashboard: public room information only, never game state. */
  adminSummary(): AdminRoom {
    const maxAge = this.createdAt + ROOM_MAX_AGE_MS;
    return {
      code: this.code,
      gameId: this.gameId,
      status: this.status,
      members: [...this.members.values()]
        .sort((a, b) => a.joinOrder - b.joinOrder)
        .map((m) => ({ name: m.name, isHost: m.id === this.hostId, presence: m.presence, seat: m.seat })),
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      emptySince: this.emptySince,
      expiresAt: this.emptySince === null ? maxAge : Math.min(maxAge, this.emptySince + EMPTY_ROOM_TTL_MS),
    };
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
      this.gameInput({ kind: 'presence', playerId, online: true });
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
        this.gameInput({ kind: 'presence', playerId, online: false });
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
      this.clampSettings();
      this.touch();
    }
    return ok(null);
  }

  setSettings(by: PlayerId, raw: unknown): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    if (this.status !== 'lobby') return err('WRONG_STATUS');
    const def = gameFor(this.gameId);
    if (!def) return err('GAME_UNAVAILABLE');
    const prev = this.settings.get(this.gameId);
    let next: unknown;
    if (def.settings.update) {
      const updated = def.settings.update(prev, raw);
      if (!updated.ok) return err('INVALID_SETTINGS', updated.message);
      next = updated.value;
    } else {
      const parsed = def.settings.schema.safeParse(raw);
      if (!parsed.success) return err('INVALID_SETTINGS', parsed.error.issues[0]?.message);
      next = parsed.data;
    }
    this.settings.set(this.gameId, def.settings.clamp(next, this.playerCount(next)));
    this.touch();
    return ok(null);
  }

  start(by: PlayerId): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    if (this.status !== 'lobby') return err('WRONG_STATUS');
    return this.launch();
  }

  // ── Game ──────────────────────────────────────────────────────────────────

  gameAction(by: PlayerId, phaseSeq: number, action: unknown): Result<null> {
    if (this.status !== 'playing' || !this.runner) return err('WRONG_STATUS');
    const member = this.members.get(by);
    if (!member || member.seat !== 'playing' || member.presence === 'left') return err('NOT_ALLOWED');
    const result = this.runner.action(by, by === this.hostId, phaseSeq, action);
    if (result.ok) this.afterGameStep();
    return result;
  }

  endGame(by: PlayerId): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    if (this.status !== 'playing' || !this.runner) return err('WRONG_STATUS');
    this.finish(this.runner.abort());
    return ok(null);
  }

  playAgain(by: PlayerId): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    if (this.status !== 'results') return err('WRONG_STATUS');
    return this.launch();
  }

  toLobby(by: PlayerId): Result<null> {
    if (by !== this.hostId) return err('NOT_HOST');
    if (this.status !== 'results') return err('WRONG_STATUS');
    this.status = 'lobby';
    this.result = null;
    this.resetSeats();
    this.clampSettings();
    this.touch();
    return ok(null);
  }

  /** This player's validated view, or null if they shouldn't get one (or it failed validation). */
  gameViewFor(playerId: PlayerId): { rev: number; view: GameView } | null {
    if (this.status !== 'playing' || !this.runner) return null;
    const member = this.members.get(playerId);
    if (!member || member.seat !== 'playing' || member.presence === 'left') return null;
    const view = this.runner.view(playerId);
    return view ? { rev: this.runner.rev, view } : null;
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
      settings: this.publicSettings(),
      startBlockedReason: this.status === 'playing' ? null : this.blockedReason(),
      result: this.status === 'results' ? this.result : null,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private activeMembers(): Member[] {
    return [...this.members.values()].filter((m) => m.presence !== 'left');
  }

  /** Settings as everyone sees them: the game strips anything secret (e.g. a custom word). */
  private publicSettings(): AnyGameSettings {
    const cfg = this.settings.get(this.gameId);
    const def = gameFor(this.gameId);
    return (def?.settings.toPublic ? def.settings.toPublic(cfg) : cfg) as AnyGameSettings;
  }

  private hostModerates(cfg: unknown = this.settings.get(this.gameId)): boolean {
    return gameFor(this.gameId)?.settings.hostModerates?.(cfg) ?? false;
  }

  /** How many members would play: everyone, minus the host when they moderate. */
  private playerCount(cfg?: unknown): number {
    return this.activeMembers().length - (this.hostModerates(cfg) ? 1 : 0);
  }

  /** Why a game can't start: player count, availability, then the game's own settings rules. */
  private blockedReason(): string | null {
    const count = this.playerCount();
    const reason = startBlockedReason(this.gameId, count);
    if (reason) return reason;
    const def = gameFor(this.gameId);
    return def ? def.settings.validate(this.settings.get(this.gameId), count) : null;
  }

  private forgetSecrets(): void {
    const def = gameFor(this.gameId);
    if (def?.settings.forgetSecrets) this.settings.set(this.gameId, def.settings.forgetSecrets(this.settings.get(this.gameId)));
  }

  /** The host knew any secret they typed in, so it can't outlive their time as host. */
  private setHost(id: PlayerId): void {
    if (id === this.hostId) return;
    this.hostId = id;
    this.forgetSecrets();
  }

  private launch(): Result<null> {
    const reason = this.blockedReason();
    if (reason) return err('START_BLOCKED', reason);
    const def = gameFor(this.gameId);
    if (!def) return err('GAME_UNAVAILABLE');

    this.resetSeats();
    const moderator = this.hostModerates() ? this.hostId : null;
    const players = this.activeMembers()
      .filter((m) => m.id !== moderator)
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((m) => ({ id: m.id, name: m.name, online: m.presence === 'online' }));
    try {
      this.runner = new GameRunner(
        def,
        { players, settings: this.settings.get(this.gameId), moderator },
        {
          bank: this.deps.bank,
          rng: (this.deps.rng ?? cryptoRng)(),
          onTick: () => this.afterGameStep(),
          roomCode: this.code,
        },
      );
    } catch (error) {
      log.error('game setup failed', { room: this.code, game: this.gameId, ...errorFields(error) });
      return err('INTERNAL');
    }
    this.status = 'playing';
    this.result = null;
    this.gameStartedAt = Date.now();
    this.deps.stats?.gameStarted(this.gameId);
    this.touch();
    this.hooks.gameChanged(this);
    return ok(null);
  }

  /** Before a new game or the lobby: drop departed members, seat everyone who waited. */
  private resetSeats(): void {
    for (const m of [...this.members.values()]) {
      if (m.presence === 'left') this.members.delete(m.id);
      else m.seat = 'playing';
    }
  }

  private gameInput(input: { kind: 'presence'; playerId: PlayerId; online: boolean } | { kind: 'left'; playerId: PlayerId }): void {
    if (!this.runner || this.members.get(input.playerId)?.seat !== 'playing') return;
    const result = this.runner.dispatch(input);
    if (result.ok) this.afterGameStep();
  }

  private afterGameStep(): void {
    if (!this.runner || this.closed) return;
    this.lastActiveAt = Date.now();
    const result = this.runner.result();
    if (result) this.finish(result);
    else this.hooks.gameChanged(this);
  }

  private finish(result: GameResult): void {
    this.runner?.dispose();
    this.runner = null;
    this.status = 'results';
    this.result = result;
    this.deps.stats?.gameFinished(result, Date.now() - this.gameStartedAt);
    this.forgetSecrets();
    this.touch();
  }

  private clampSettings(): void {
    const def = gameFor(this.gameId);
    if (!def || this.status !== 'lobby') return;
    this.settings.set(this.gameId, def.settings.clamp(this.settings.get(this.gameId), this.playerCount()));
  }

  /** Lobby: the member is deleted. During a game or results: kept as 'left'. */
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
      this.gameInput({ kind: 'left', playerId });
    }
    if (this.activeMembers().length === 0) {
      this.shutdown();
      return;
    }
    if (!this.activeMembers().some((m) => m.presence === 'online')) {
      this.emptySince ??= Date.now();
    }
    this.clampSettings();
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
      if (next) this.setHost(next.id);
      this.clearHostTimer();
      return;
    }
    const due = (host.awaySince ?? Date.now()) + HOST_AWAY_TRANSFER_MS;
    if (Date.now() >= due) {
      const next = this.earliest((m) => m.presence === 'online' && m.id !== host.id);
      if (next) {
        this.setHost(next.id);
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
    this.runner?.dispose();
    this.runner = null;
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
    this.lastActiveAt = Date.now();
    this.rev++;
    this.hooks.changed(this);
  }
}
