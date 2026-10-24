import { GAME_IDS, GAME_META, type AdminOverview } from '@party/shared';
import { Panel } from './Panel';
import { duration } from './format';

/** Every figure in the panel uses the same label/value row, at the same size. */
const LIST = 'grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm';

export function ServerPanel({ data }: { data: AdminOverview }) {
  const { health, usage } = data;
  const started = Math.max(1, ...GAME_IDS.map((id) => usage.gamesStarted[id]));

  return (
    <Panel title="Server">
      <p className="text-sm text-muted">
        Up for {duration(health.now - health.startedAt)}. These numbers reset when the server restarts.
      </p>

      <dl className={LIST}>
        <Row label="Rooms created" value={String(usage.roomsCreated)} />
        <Row label="Games finished" value={String(usage.gamesFinished)} />
        <Row label="Most players at once" value={String(usage.peakOnlinePlayers)} />
        <Row label="Most rooms at once" value={String(usage.peakRooms)} />
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Games started</h3>
        <ul className="flex flex-col gap-2">
          {GAME_IDS.map((id) => (
            <li key={id} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm">
              <span>{GAME_META[id].name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-panel-2" aria-hidden>
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${(usage.gamesStarted[id] / started) * 100}%` }}
                />
              </span>
              <span className="text-right font-medium tabular-nums">{usage.gamesStarted[id]}</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className={`${LIST} border-t border-line pt-3`}>
        <Row label="Average game" value={usage.avgGameMs === null ? 'No games yet' : duration(usage.avgGameMs)} />
        <Row label="Ended early by host" value={String(usage.gamesEndedByHost)} />
        <Row label="Connections" value={String(health.sockets)} />
        <Row label="Memory" value={`${health.memoryMb.rss} MB`} />
        <Row label="Node" value={health.nodeVersion} />
      </dl>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </>
  );
}
