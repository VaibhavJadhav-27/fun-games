import type { MemberInfo, PlayerId } from '@party/shared';

interface PlayerListProps {
  members: MemberInfo[];
  me: PlayerId | null;
  onKick?: (member: MemberInfo) => void;
}

const AVATAR_COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#a855f7'];

function avatarColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? '#8b5cf6';
}

export function PlayerList({ members, me, onKick }: PlayerListProps) {
  const visible = members.filter((m) => m.presence !== 'left');
  return (
    <ul className="flex flex-col divide-y divide-line">
      {visible.map((m) => (
        <li key={m.id} className="flex min-h-14 items-center gap-3 py-2">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
            style={{ backgroundColor: avatarColor(m.id), opacity: m.presence === 'away' ? 0.4 : 1 }}
          >
            {m.name.charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">
              {m.name}
              {m.id === me && <span className="font-normal text-muted"> (you)</span>}
            </span>
            <span className="flex gap-2 text-xs text-muted">
              {m.isHost && <span className="font-semibold text-warn">Host</span>}
              {m.presence === 'away' && <span>Away</span>}
              {m.seat === 'waiting' && <span>Joins next game</span>}
            </span>
          </div>
          {onKick && m.id !== me && (
            <button
              type="button"
              onClick={() => onKick(m)}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-bad active:bg-bad/10"
              aria-label={`Remove ${m.name}`}
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
