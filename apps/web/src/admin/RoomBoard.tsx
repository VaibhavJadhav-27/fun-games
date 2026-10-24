import { useEffect, useRef, useState } from 'react';
import { GAME_META, type AdminRoom } from '@party/shared';
import { ago, duration, plural } from './format';

type Filter = 'all' | 'playing' | 'lobby' | 'stale';
type State = 'playing' | 'lobby' | 'results' | 'stale';

const STATE: Record<State, { label: string; edge: string; text: string }> = {
  playing: { label: 'Playing', edge: 'bg-accent', text: 'text-accent' },
  lobby: { label: 'In the lobby', edge: 'bg-good', text: 'text-good' },
  results: { label: 'On results', edge: 'bg-muted', text: 'text-muted' },
  stale: { label: 'Stale: nobody connected', edge: 'bg-warn', text: 'text-warn' },
};

const PRESENCE_DOT = { online: 'bg-good', away: 'bg-warn', left: 'bg-line' } as const;

export function stateOf(room: AdminRoom): State {
  return room.emptySince !== null ? 'stale' : room.status;
}

interface Props {
  rooms: AdminRoom[];
  now: number;
  onClose(room: AdminRoom): void;
  onCloseStale(count: number): void;
}

export function RoomBoard({ rooms, now, onClose, onCloseStale }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const fresh = useFreshCodes(rooms);
  const counts = {
    all: rooms.length,
    playing: rooms.filter((r) => stateOf(r) === 'playing').length,
    lobby: rooms.filter((r) => stateOf(r) === 'lobby').length,
    stale: rooms.filter((r) => stateOf(r) === 'stale').length,
  };
  const shown = filter === 'all' ? rooms : rooms.filter((r) => stateOf(r) === filter);
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'playing', label: 'Playing' },
    { id: 'lobby', label: 'Lobby' },
    { id: 'stale', label: 'Stale' },
  ];

  return (
    <section aria-labelledby="rooms-heading" className="flex flex-col gap-4">
      <h2 id="rooms-heading" className="sr-only">
        Rooms
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Filter rooms">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
                filter === f.id ? 'border-fg bg-fg text-ink' : 'border-line bg-panel text-fg hover:border-muted'
              }`}
            >
              {f.label}
              <span className={`tabular-nums ${filter === f.id ? 'opacity-70' : 'text-muted'}`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        {counts.stale > 0 && (
          <button
            type="button"
            onClick={() => onCloseStale(counts.stale)}
            className="ml-auto min-h-11 rounded-full px-4 text-sm font-semibold text-bad hover:bg-bad/10"
          >
            Close {plural(counts.stale, 'stale room')}
          </button>
        )}
      </div>

      {filter === 'stale' && counts.stale > 0 && (
        <p className="text-sm text-muted">
          Nobody is connected to these rooms. Each one closes by itself when its timer runs out.
        </p>
      )}

      {shown.length === 0 ? (
        <Empty filter={filter} />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((room) => (
            <RoomPlate key={room.code} room={room} now={now} fresh={fresh.has(room.code)} onClose={() => onClose(room)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RoomPlate({ room, now, fresh, onClose }: { room: AdminRoom; now: number; fresh: boolean; onClose(): void }) {
  const state = stateOf(room);
  const style = STATE[state];
  const members = room.members.filter((m) => m.presence !== 'left');
  const online = members.filter((m) => m.presence === 'online').length;

  return (
    <li
      className={`relative grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 overflow-hidden rounded-2xl border border-line bg-panel py-4 pr-4 pl-6 sm:grid-cols-[9.5rem_1fr_auto] sm:items-start ${
        fresh ? 'motion-safe:animate-[admin-arrive_1.6s_ease-out]' : ''
      }`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${style.edge}`} />

      <div className="col-start-1 row-start-1">
        <p className="text-[2rem] leading-none font-black tracking-[0.16em] tabular-nums">{room.code}</p>
        <p className="mt-1.5 text-sm text-muted">{GAME_META[room.gameId].name}</p>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label={`Close room ${room.code}`}
        className="col-start-2 row-start-1 min-h-11 self-start rounded-full border border-line px-4 text-sm font-semibold text-bad hover:border-bad/60 hover:bg-bad/10 sm:col-start-3"
      >
        Close
      </button>

      <div className="col-span-2 flex min-w-0 flex-col gap-3 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <p className="text-sm">
          <span className={`font-semibold ${style.text}`}>{style.label}</span>
          <span className="text-muted">
            {', '}
            {online} of {plural(members.length, 'member')} online
          </span>
        </p>

        {members.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={`Members of ${room.code}`}>
            {members.map((m) => (
              <li
                key={`${m.name}-${m.seat}`}
                className="flex min-h-7 items-center gap-1.5 rounded-full bg-panel-2 px-2.5 text-xs font-medium"
              >
                <span className={`size-2 rounded-full ${PRESENCE_DOT[m.presence]}`} />
                <span className="sr-only">{m.presence}</span>
                {m.name}
                {m.isHost && <span className="text-muted">host</span>}
                {m.seat === 'waiting' && <span className="text-muted">waiting</span>}
              </li>
            ))}
          </ul>
        )}

        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <div className="flex gap-1">
            <dt>Opened</dt>
            <dd className="text-fg">{ago(now - room.createdAt)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Last activity</dt>
            <dd className="text-fg">{ago(now - room.lastActiveAt)}</dd>
          </div>
          {state !== 'stale' && (
            <div className="flex gap-1">
              <dt>Closes at the latest in</dt>
              <dd className="text-fg">{duration(room.expiresAt - now)}</dd>
            </div>
          )}
        </dl>

        {state === 'stale' && room.emptySince !== null && <ExpiryBar room={room} emptySince={room.emptySince} now={now} />}
      </div>
    </li>
  );
}

/** How much of the empty-room grace period is left before the room closes itself. */
function ExpiryBar({ room, emptySince, now }: { room: AdminRoom; emptySince: number; now: number }) {
  const total = Math.max(1, room.expiresAt - emptySince);
  const left = Math.max(0, room.expiresAt - now);
  const pct = Math.round((left / total) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted">Empty for {duration(now - emptySince)}</span>
        <span className="font-semibold text-warn">Closes in {duration(left)}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-panel-2"
        role="progressbar"
        aria-label={`Time until ${room.code} closes`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-warn" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Empty({ filter }: { filter: Filter }) {
  const text = {
    all: "No rooms are open. New rooms appear here as soon as someone creates one.",
    playing: 'No games are running right now.',
    lobby: 'No rooms are waiting in the lobby.',
    stale: 'No stale rooms. Every open room has someone connected.',
  }[filter];
  return <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{text}</p>;
}

/** Codes that appeared since the last update (not on first load), for a short highlight. */
function useFreshCodes(rooms: AdminRoom[]): Set<string> {
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const codes = rooms.map((r) => r.code).join(',');

  useEffect(() => {
    const current = new Set(codes ? codes.split(',') : []);
    const before = known.current;
    known.current = current;
    if (!before) return;
    const added = [...current].filter((c) => !before.has(c));
    if (added.length === 0) return;
    const show = setTimeout(() => setFresh(new Set(added)), 0);
    const hide = setTimeout(() => setFresh(new Set()), 1700);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [codes]);

  return fresh;
}
