import { useStore } from '../socket/store';

/** The admin's announcement (dismissable) and the maintenance notice, on every screen. */
export function ServerBanner() {
  const { maintenance, announcement } = useStore((s) => s.server);
  const dismissed = useStore((s) => s.dismissedAnnouncement);
  const showAnnouncement = announcement !== null && announcement.id !== dismissed;
  if (!maintenance && !showAnnouncement) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {showAnnouncement && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/15 px-4 py-3">
          <span aria-hidden="true">📣</span>
          <p className="flex-1 text-sm font-medium break-words">{announcement.text}</p>
          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={() => useStore.setState({ dismissedAnnouncement: announcement.id })}
            className="-m-2 flex size-11 shrink-0 items-center justify-center text-lg text-muted"
          >
            ×
          </button>
        </div>
      )}
      {maintenance && (
        <p role="status" className="rounded-2xl bg-warn/15 px-4 py-3 text-sm font-medium">
          🛠️ Maintenance: new rooms are paused for a bit. Games in progress carry on.
        </p>
      )}
    </div>
  );
}
