import { useState } from 'react';
import { useLocation } from 'wouter';
import type { GameResult, RoomInfo } from '@party/shared';
import { backToLobby, closeRoom, leaveRoom, playAgain } from '../socket/actions';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export function Results({ room, result, me }: { room: RoomInfo; result: GameResult; me: string }) {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'again' | 'lobby' | null>(null);
  const isHost = room.members.some((m) => m.id === me && m.isHost);
  const host = room.members.find((m) => m.isHost);
  const won = result.winners.includes(me);
  const points = new Map(result.scores.map((s) => [s.playerId, s.points]));

  async function run(kind: 'again' | 'lobby') {
    setBusy(kind);
    const res = kind === 'again' ? await playAgain() : await backToLobby();
    setBusy(null);
    if (!res.ok) setError(res.error.message);
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pt-4 pb-10">
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="text-5xl" aria-hidden>
          {result.gameId === 'pictionary' ? '🎨' : result.endedBy === 'host' ? '🛑' : won ? '🎉' : '🎭'}
        </p>
        <h1 className="text-3xl font-black">{result.headline}</h1>
        {result.detail && <p className="text-muted">{result.detail}</p>}
        {result.endedBy === 'game' && (
          <p className={`mt-1 font-semibold ${won ? 'text-good' : 'text-muted'}`}>{won ? 'You won!' : 'Better luck next time.'}</p>
        )}
      </header>

      {result.reveals.length > 0 && (
        <Card>
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
            {result.reveals.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-sm text-muted">{r.label}</dt>
                <dd className="text-xl font-bold">{r.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {result.roles.length > 0 && (
        <Card title="Roles">
          <ul className="flex flex-col divide-y divide-line">
            {result.roles.map((r) => (
              <li key={r.playerId} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span className="truncate font-semibold">
                  {r.name}
                  {r.playerId === me && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="flex items-center gap-2">
                  {points.has(r.playerId) && <span className="text-sm text-good">+{points.get(r.playerId)}</span>}
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      r.team === 'evil' ? 'bg-bad/15 text-bad' : 'bg-good/15 text-good'
                    }`}
                  >
                    {r.role}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-bad">
          {error}
        </p>
      )}

      {isHost ? (
        <div className="flex flex-col gap-2">
          <Button block busy={busy === 'again'} onClick={() => run('again')}>
            Play again
          </Button>
          <Button variant="secondary" block busy={busy === 'lobby'} onClick={() => run('lobby')}>
            Change game
          </Button>
          <Button
            variant="danger"
            block
            onClick={async () => {
              if (window.confirm('Close the room for everyone?')) await closeRoom();
            }}
          >
            Close room
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-center text-muted">
            Waiting for <span className="font-semibold text-fg">{host?.name ?? 'the host'}</span>…
          </p>
          <Button
            variant="ghost"
            onClick={async () => {
              if (!window.confirm('Leave this room?')) return;
              await leaveRoom(room.code);
              navigate('/');
            }}
          >
            Leave room
          </Button>
        </div>
      )}
    </main>
  );
}
