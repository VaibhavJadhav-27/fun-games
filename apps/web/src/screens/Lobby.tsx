import { useState } from 'react';
import { useLocation } from 'wouter';
import { GAME_IDS, GAME_META, MAX_MEMBERS, type GameId, type MemberInfo, type RoomInfo } from '@party/shared';
import { closeRoom, kickPlayer, leaveRoom, setGame, startGame } from '../socket/actions';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PlayerList } from '../ui/PlayerList';
import { SharePanel } from '../ui/SharePanel';

export function Lobby({ room, me }: { room: RoomInfo; me: string }) {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const isHost = room.members.some((m) => m.id === me && m.isHost);
  const host = room.members.find((m) => m.isHost);
  const active = room.members.filter((m) => m.presence !== 'left');
  const game = GAME_META[room.gameId];

  async function pickGame(gameId: GameId) {
    if (gameId === room.gameId) return;
    const res = await setGame(gameId);
    setError(res.ok ? null : res.error.message);
  }

  async function onKick(member: MemberInfo) {
    if (!window.confirm(`Remove ${member.name} from the room?`)) return;
    const res = await kickPlayer(member.id);
    setError(res.ok ? null : res.error.message);
  }

  async function onStart() {
    setStarting(true);
    const res = await startGame();
    setStarting(false);
    if (!res.ok) {
      setError(res.error.code === 'GAME_UNAVAILABLE' ? 'Games are coming in the next update.' : res.error.message);
    }
  }

  async function onLeave() {
    if (!window.confirm('Leave this room?')) return;
    await leaveRoom(room.code);
    navigate('/');
  }

  async function onClose() {
    if (!window.confirm('Close the room for everyone?')) return;
    const res = await closeRoom();
    if (!res.ok) setError(res.error.message);
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pt-6 pb-32">
      <header className="text-center">
        <p className="text-sm font-semibold tracking-widest text-muted uppercase">Room</p>
        <h1 className="font-mono text-5xl font-black tracking-[0.2em]">{room.code}</h1>
      </header>

      <Card title="Invite friends">
        <SharePanel code={room.code} />
      </Card>

      <Card title={isHost ? 'Pick a game' : 'Game'}>
        {isHost ? (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Game">
            {GAME_IDS.map((id) => {
              const meta = GAME_META[id];
              const selected = id === room.gameId;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => pickGame(id)}
                  className={`flex min-h-16 flex-col items-start rounded-2xl border px-4 py-3 text-left transition-colors ${
                    selected ? 'border-accent bg-accent/15' : 'border-line bg-panel-2 active:bg-line'
                  }`}
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="text-lg font-bold">{meta.name}</span>
                    <span className="text-xs text-muted">
                      {meta.minPlayers}–{meta.maxPlayers} players
                    </span>
                  </span>
                  <span className="text-sm text-muted">{meta.tagline}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <p className="text-xl font-bold">{game.name}</p>
            <p className="text-sm text-muted">{game.tagline}</p>
          </div>
        )}
        <ol className="mt-4 flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
          {game.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </Card>

      <Card
        title="Players"
        aside={
          <span className="text-sm text-muted">
            {active.length} / {MAX_MEMBERS}
          </span>
        }
      >
        <PlayerList members={room.members} me={me} onKick={isHost ? onKick : undefined} />
      </Card>

      <div className="flex justify-center gap-2">
        <Button variant="ghost" onClick={onLeave}>
          Leave room
        </Button>
        {isHost && (
          <Button variant="danger" onClick={onClose}>
            Close room
          </Button>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-ink/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          {error && (
            <p role="alert" className="text-center text-sm text-bad">
              {error}
            </p>
          )}
          {isHost ? (
            <>
              <Button block onClick={onStart} busy={starting} disabled={room.startBlockedReason !== null}>
                Start {game.name}
              </Button>
              {room.startBlockedReason && <p className="text-center text-sm text-muted">{room.startBlockedReason}</p>}
            </>
          ) : (
            <p className="py-3 text-center text-muted">
              Waiting for <span className="font-semibold text-fg">{host?.name ?? 'the host'}</span> to start…
            </p>
          )}
        </div>
      </footer>
    </main>
  );
}
