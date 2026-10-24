import {
  TRAITOR_MAX_PLAYERS,
  autoTraitorCount,
  maxTraitorCount,
  traitorCountFor,
  type TraitorSettings,
} from '@party/shared';
import { Segmented } from '../../ui/Segmented';
import { Toggle } from '../../ui/Toggle';

interface Props {
  settings: TraitorSettings;
  playerCount: number;
  editable: boolean;
  /** Resolves to an error message, or null on success. */
  onChange(next: TraitorSettings): Promise<string | null>;
}

export function TraitorSettingsPanel({ settings, playerCount, editable, onChange }: Props) {
  const count = traitorCountFor(settings, playerCount);
  const plural = count === 1 ? 'traitor' : 'traitors';

  if (!editable) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Traitors</dt>
        <dd>
          {count} {settings.traitors === 'auto' && '(auto)'}
        </dd>
        <dt className="text-muted">Night victim's role</dt>
        <dd>{settings.revealVictimRole ? 'Revealed' : 'Hidden'}</dd>
        <dt className="text-muted">Voted-out player's role</dt>
        <dd>{settings.revealEvictedRole ? 'Revealed' : 'Hidden'}</dd>
      </dl>
    );
  }

  const change = (patch: Partial<TraitorSettings>) => void onChange({ ...settings, ...patch });
  const max = maxTraitorCount(Math.max(playerCount, 1));
  const choices = Array.from({ length: maxTraitorCount(TRAITOR_MAX_PLAYERS) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Traitors</legend>
        <Segmented
          options={[
            { value: 'auto' as const, label: `Auto (${autoTraitorCount(playerCount)})` },
            ...choices.map((n) => ({ value: n, label: String(n), disabled: n > max })),
          ]}
          value={settings.traitors}
          onChange={(traitors) => change({ traitors })}
        />
        <p className="mt-1.5 text-xs text-muted">
          {count} {plural} among {playerCount} players. Up to {max} allowed with this many.
        </p>
      </fieldset>

      <Toggle
        label="Reveal the night victim's role"
        hint="Victims are always civilians, so this is off by default."
        on={settings.revealVictimRole}
        onChange={(revealVictimRole) => change({ revealVictimRole })}
      />
      <Toggle
        label="Reveal the voted-out player's role"
        hint="Off makes the day harder: nobody learns if they got a traitor."
        on={settings.revealEvictedRole}
        onChange={(revealEvictedRole) => change({ revealEvictedRole })}
      />
    </div>
  );
}
