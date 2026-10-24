import { GAME_IDS, GAME_META, type AdminOverview } from '@party/shared';
import { Toggle } from '../ui/Toggle';
import { adminApi } from './api';
import { Panel } from './Panel';

interface Props {
  data: AdminOverview;
  act(fn: () => Promise<unknown>): Promise<void>;
}

/** Release switches: an unreleased game stays in the picker as "Coming soon". */
export function GamesPanel({ data, act }: Props) {
  return (
    <Panel title="Games">
      <p className="text-sm text-muted">
        Off keeps a game in the list as "Coming soon". Games already running finish normally. Switches reset to the
        server's defaults when it restarts.
      </p>
      <div className="flex flex-col gap-4">
        {GAME_IDS.map((id) => {
          const meta = GAME_META[id];
          const on = data.released[id];
          return (
            <Toggle
              key={id}
              label={meta.name}
              hint={!meta.available ? 'Not built yet' : on ? 'Released: anyone can play' : 'Coming soon: nobody can start it'}
              on={on}
              disabled={!meta.available}
              onChange={(next) => {
                const sure =
                  next || window.confirm(`Turn ${meta.name} off? New games can't start it; running games finish.`);
                if (sure) void act(() => adminApi.setReleased(id, next));
              }}
            />
          );
        })}
      </div>
    </Panel>
  );
}
