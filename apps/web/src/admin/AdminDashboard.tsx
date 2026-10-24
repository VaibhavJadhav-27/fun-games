import { useCallback, useEffect, useState } from 'react';
import { ADMIN_API_PREFIX, type AdminOverview, type AdminRoom } from '@party/shared';
import { Spinner } from '../ui/Screen';
import { ThemeToggle } from '../ui/ThemeToggle';
import { adminApi, AdminApiError } from './api';
import { ControlsPanel } from './ControlsPanel';
import { plural } from './format';
import { RoomBoard, stateOf } from './RoomBoard';
import { ServerPanel } from './ServerPanel';

/** Live updates come from the event stream; this slow poll only backs it up. */
const BACKSTOP_MS = 30_000;

export function AdminDashboard({ onLoggedOut, onLogout }: { onLoggedOut(): void; onLogout(): void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const refresh = useCallback(
    () =>
      adminApi.overview().then(
        (next) => {
          setData(next);
          setError(null);
        },
        (e: unknown) => {
          if (e instanceof AdminApiError && e.status === 401) return onLoggedOut();
          setError(e instanceof Error ? e.message : 'Could not load the dashboard. Check the server is running.');
        },
      ),
    [onLoggedOut],
  );

  useEffect(() => {
    // One fetch at a time; pings that arrive meanwhile collapse into one more fetch.
    let inFlight = false;
    let again = false;
    const load = () => {
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      void refresh().finally(() => {
        inFlight = false;
        if (again) {
          again = false;
          load();
        }
      });
    };

    // The server pings "changed" (no data) and we fetch the snapshot. The slow poll is
    // a backstop, and it notices an expired login.
    const events = new EventSource(`${ADMIN_API_PREFIX}/events`);
    events.onopen = () => {
      setLive(true);
      load(); // catch up on anything missed while disconnected
    };
    events.onerror = () => setLive(false);
    events.addEventListener('changed', load);
    events.addEventListener('logout', () => {
      events.close();
      onLoggedOut();
    });

    const first = setTimeout(load, 0);
    const backstop = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, BACKSTOP_MS);
    return () => {
      events.close();
      clearTimeout(first);
      clearInterval(backstop);
    };
  }, [refresh, onLoggedOut]);

  /** Run an admin action, then reload. */
  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await refresh();
      } catch (e) {
        if (e instanceof AdminApiError && e.status === 401) return onLoggedOut();
        setError(e instanceof Error ? e.message : 'That action failed. Try again.');
      }
    },
    [refresh, onLoggedOut],
  );

  const closeRoom = (room: AdminRoom) => {
    if (window.confirm(`Close room ${room.code}? Everyone in it is sent back to the start screen.`)) {
      void act(() => adminApi.closeRoom(room.code));
    }
  };
  const closeStale = (count: number) => {
    if (window.confirm(`Close ${plural(count, 'stale room')}? Nobody is connected to them.`)) {
      void act(adminApi.closeStale);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar live={live} onLogout={onLogout} />
      {data?.maintenance && <MaintenanceStrip onTurnOff={() => act(() => adminApi.setMaintenance(false))} />}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
        {error && (
          <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
            {error}
          </p>
        )}

        {!data ? (
          !error && <Spinner label="Loading rooms…" />
        ) : (
          <>
            <Summary data={data} />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              <RoomBoard rooms={data.rooms} now={data.health.now} onClose={closeRoom} onCloseStale={closeStale} />
              <aside className="flex flex-col gap-4 lg:sticky lg:top-6" aria-label="Server controls">
                <ControlsPanel data={data} act={act} />
                <ServerPanel data={data} />
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function TopBar({ live, onLogout }: { live: boolean; onLogout(): void }) {
  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <h1 className="text-base font-bold">Party Games admin</h1>
        <p className="flex items-center gap-1.5 text-xs text-muted" role="status">
          <span className={`size-2 rounded-full ${live ? 'bg-good' : 'bg-warn motion-safe:animate-pulse'}`} />
          {live ? 'Live' : 'Reconnecting'}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onLogout}
            className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted hover:text-fg"
          >
            Log out
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function MaintenanceStrip({ onTurnOff }: { onTurnOff(): void }) {
  return (
    <div className="bg-warn text-black" role="status">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6">
        <p className="text-sm font-semibold">Maintenance is on. Nobody can create a new room.</p>
        <button
          type="button"
          onClick={onTurnOff}
          className="min-h-11 rounded-full px-3 text-sm font-bold underline underline-offset-4 sm:ml-auto"
        >
          Turn it off
        </button>
      </div>
    </div>
  );
}

/** The state of the house in one sentence, instead of a row of number tiles. */
function Summary({ data }: { data: AdminOverview }) {
  const rooms = data.rooms;
  const count = (s: ReturnType<typeof stateOf>) => rooms.filter((r) => stateOf(r) === s).length;
  const online = rooms.reduce((n, r) => n + r.members.filter((m) => m.presence === 'online').length, 0);
  const parts = [
    `${count('playing')} playing`,
    `${count('lobby')} in the lobby`,
    count('results') > 0 ? `${count('results')} on results` : null,
    count('stale') > 0 ? `${count('stale')} stale` : null,
  ].filter(Boolean);

  return (
    <section aria-label="Summary" className="max-w-3xl">
      <p className="text-3xl leading-tight font-black tracking-tight text-balance sm:text-4xl">
        {rooms.length === 0
          ? 'No rooms open right now.'
          : `${plural(rooms.length, 'room')} open: ${parts.join(', ')}.`}
      </p>
      <p className="mt-2 text-lg text-muted">
        {online === 0
          ? 'Nobody is connected.'
          : `${plural(online, 'person', 'people')} connected across all rooms.`}
      </p>
    </section>
  );
}
