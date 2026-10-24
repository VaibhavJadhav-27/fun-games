import { useState, type FormEvent } from 'react';
import { ANNOUNCEMENT_MAX_LENGTH, type AdminOverview } from '@party/shared';
import { Button } from '../ui/Button';
import { adminApi } from './api';
import { Panel } from './Panel';

interface Props {
  data: AdminOverview;
  act(fn: () => Promise<unknown>): Promise<void>;
}

export function ControlsPanel({ data, act }: Props) {
  return (
    <>
      <Panel title="Maintenance">
        <div className="flex items-start justify-between gap-4">
          <p id="maintenance-help" className="text-sm text-muted">
            Stops anyone creating a new room. Games already running, and people joining them, carry on.
          </p>
          <Switch
            on={data.maintenance}
            label="Maintenance mode"
            describedBy="maintenance-help"
            onToggle={() => act(() => adminApi.setMaintenance(!data.maintenance))}
          />
        </div>
      </Panel>
      <Announcement data={data} act={act} />
    </>
  );
}

function Announcement({ data, act }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const draft = text.trim();

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    await act(() => adminApi.announce(draft));
    setBusy(false);
    setText('');
  }

  return (
    <Panel title="Announcement">
      <form onSubmit={send} className="flex flex-col gap-3">
        <p className="text-sm text-muted">A banner on every phone that has the game open. Players can dismiss it.</p>

        {data.announcement && (
          <div className="flex flex-col gap-2 rounded-2xl bg-panel-2 p-3">
            <p className="text-xs text-muted">Showing now</p>
            <BannerPreview text={data.announcement.text} />
            <button
              type="button"
              onClick={() => void act(() => adminApi.announce(null))}
              className="min-h-11 self-start rounded-full px-3 text-sm font-semibold text-bad hover:bg-bad/10"
            >
              Remove announcement
            </button>
          </div>
        )}

        <label htmlFor="announcement" className="text-sm font-semibold">
          {data.announcement ? 'Replace it with' : 'Message'}
        </label>
        <textarea
          id="announcement"
          rows={3}
          maxLength={ANNOUNCEMENT_MAX_LENGTH}
          value={text}
          placeholder="Server restarting in 5 minutes. Finish your round!"
          onChange={(e) => setText(e.target.value)}
          className="resize-none rounded-2xl border border-line bg-panel-2 px-4 py-3 text-fg outline-none placeholder:text-muted/70 focus:border-accent"
        />
        {draft && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">Players will see</p>
            <BannerPreview text={draft} />
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted tabular-nums">
            {text.length} / {ANNOUNCEMENT_MAX_LENGTH}
          </span>
          <Button type="submit" busy={busy} disabled={!draft} className="min-h-11 px-5 text-sm">
            {data.announcement ? 'Replace announcement' : 'Send announcement'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/** Mirrors the player-side banner (ui/ServerBanner) so the admin sees exactly what goes out. */
function BannerPreview({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/15 px-4 py-3">
      <span aria-hidden="true">📣</span>
      <p className="flex-1 text-sm font-medium break-words">{text}</p>
    </div>
  );
}

function Switch({
  on,
  label,
  describedBy,
  onToggle,
}: {
  on: boolean;
  label: string;
  describedBy: string;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={onToggle}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? 'bg-warn' : 'bg-line'}`}
    >
      <span
        className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition-[left] motion-reduce:transition-none ${
          on ? 'left-7' : 'left-1'
        }`}
      />
    </button>
  );
}
