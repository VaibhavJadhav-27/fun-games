import { useState } from 'react';
import { GAME_META, type GameView, type RoomInfo } from '@party/shared';
import { ImposterScreen } from '../games/imposter/ImposterScreen';
import { endGame, reassignSeat } from '../socket/actions';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Screen';

/** Shared chrome around any running game: header, host controls, then the game's own screen. */
export function GameRoom({ room, view, me }: { room: RoomInfo; view: GameView | null; me: string }) {
  const isHost = room.members.some((m) => m.id === me && m.isHost);
  const [error, setError] = useState<string | null>(null);

  async function onEnd() {
    if (!window.confirm('End the game for everyone? All roles will be revealed.')) return;
    const res = await endGame();
    if (!res.ok) setError(res.error.message);
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pt-2 pb-10">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">{GAME_META[room.gameId].name}</h1>
          <p className="font-mono text-xs tracking-widest text-muted">ROOM {room.code}</p>
        </div>
        {isHost && (
          <Button variant="danger" className="min-h-11 px-4 text-sm" onClick={onEnd}>
            End game
          </Button>
        )}
      </header>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      {!view ? (
        <Spinner label="Loading game…" />
      ) : view.game === 'imposter' ? (
        <ImposterScreen view={view} isHost={isHost} />
      ) : null}

      {isHost && <SeatReassign room={room} />}
    </main>
  );
}

/** Host-only: give an away seat to someone who rejoined without their session (lost token). */
function SeatReassign({ room }: { room: RoomInfo }) {
  const awaySeats = room.members.filter((m) => m.seat === 'playing' && m.presence !== 'online');
  const waiting = room.members.filter((m) => m.seat === 'waiting' && m.presence !== 'left');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (awaySeats.length === 0 || waiting.length === 0) return null;

  async function onGive() {
    if (!from || !to) return;
    const res = await reassignSeat(from, to);
    setError(res.ok ? null : res.error.message);
    if (res.ok) {
      setFrom('');
      setTo('');
    }
  }

  const select = 'min-h-12 w-full rounded-2xl border border-line bg-panel-2 px-3 text-fg';
  return (
    <Card title="Lost seat?">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          If someone rejoined on another browser, give them their old seat. They keep their role.
        </p>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Away seat
          <select className={select} value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Choose…</option>
            {awaySeats.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Give it to
          <select className={select} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose…</option>
            {waiting.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" block onClick={onGive} disabled={!from || !to}>
          Give seat
        </Button>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}
