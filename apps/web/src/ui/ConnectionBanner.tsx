import { useStore } from '../socket/store';

export function ConnectionBanner() {
  const connection = useStore((s) => s.connection);
  const everConnected = useStore((s) => s.everConnected);
  if (connection === 'connected' || !everConnected) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-20 -mx-4 bg-warn px-4 py-2 text-center text-sm font-semibold text-black/85"
    >
      Reconnecting…
    </div>
  );
}
