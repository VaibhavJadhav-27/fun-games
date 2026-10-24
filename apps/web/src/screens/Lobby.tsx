import { useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  GAME_IDS,
  GAME_META,
  MAX_MEMBERS,
  type AnyGameSettingsUpdate,
  type GameId,
  type ImposterPublicSettings,
  type MemberInfo,
  type RoomInfo,
  type TraitorSettings,
} from '@party/shared';
import { ImposterSettingsPanel } from '../games/imposter/ImposterSettingsPanel';
import { TraitorSettingsPanel } from '../games/traitor/TraitorSettingsPanel';
import { closeRoom, kickPlayer, leaveRoom, setGame, setSettings, startGame } from '../socket/actions';
import { useStore } from '../socket/store';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PlayerList } from '../ui/PlayerList';
import { SharePanel } from '../ui/SharePanel';

/**
 * The host sets up in two steps: first invite and pick a game, then (Next) the game's
 * settings and Start. Everyone else sees one read-only screen.
 */
export function Lobby({ room, me }: { room: RoomInfo; me: string }) {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [step, setStep] = useState<'game' | 'settings'>('game');
  const isHost = room.members.some((m) => m.id === me && m.isHost);
  const host = room.members.find((m) => m.isHost);
  const active = room.members.filter((m) => m.presence !== 'left');
  const game = GAME_META[room.gameId];
  const released = useStore((s) => s.server.released);
  /** Built and released by the admin; anything else shows "Coming soon" and can't start. */
  const playable = (id: GameId) => GAME_META[id].available && released.includes(id);

  function goTo(next: 'game' | 'settings') {
    setStep(next);
    setError(null);
    window.scrollTo({ top: 0 });
  }

  async function pickGame(gameId: GameId) {
    if (gameId === room.gameId) return;
    const res = await setGame(gameId);
    setError(res.ok ? null : res.error.message);
  }

  async function onSettings(next: AnyGameSettingsUpdate): Promise<string | null> {
    const res = await setSettings(next);
    const message = res.ok ? null : res.error.message;
    setError(message);
    return message;
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
    setError(res.ok ? null : res.error.message);
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

  const settingsPanel =
    room.gameId === 'imposter' ? (
      <ImposterSettingsPanel
        settings={room.settings as ImposterPublicSettings}
        playerCount={active.length - ((room.settings as ImposterPublicSettings).source === 'custom' ? 1 : 0)}
        editable={isHost}
        onChange={onSettings}
      />
    ) : room.gameId === 'traitor' ? (
      <TraitorSettingsPanel
        settings={room.settings as TraitorSettings}
        playerCount={active.length}
        editable={isHost}
        onChange={onSettings}
      />
    ) : (
      <p className="text-sm text-muted">No settings for this game.</p>
    );

  const header = (
    <header className="text-center">
      <p className="text-sm font-semibold tracking-widest text-muted uppercase">Room</p>
      <h1 className="font-mono text-5xl font-black tracking-[0.2em]">{room.code}</h1>
    </header>
  );

  const players = (
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
  );

  const roomButtons = (
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
  );

  if (!isHost) {
    return (
      <main className="flex flex-1 flex-col gap-4 pt-6 pb-32">
        {header}
        <Card title="Invite friends">
          <SharePanel code={room.code} />
        </Card>
        <Card title="Game">
          <p className="text-xl font-bold">{game.name}</p>
          <p className="text-sm text-muted">{game.tagline}</p>
          <Rules rules={game.rules} />
        </Card>
        <Card title="Settings">{settingsPanel}</Card>
        {players}
        {roomButtons}
        <Footer error={error}>
          <p className="py-3 text-center text-muted">
            Waiting for <span className="font-semibold text-fg">{host?.name ?? 'the host'}</span> to start…
          </p>
        </Footer>
      </main>
    );
  }

  if (step === 'settings') {
    return (
      <main className="flex flex-1 flex-col gap-4 pt-4 pb-40">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" className="min-h-11 px-2" onClick={() => goTo('game')}>
            ← Back
          </Button>
          <span className="font-mono text-sm tracking-widest text-muted">ROOM {room.code}</span>
        </div>
        <header>
          <p className="text-sm font-semibold tracking-widest text-muted uppercase">Settings</p>
          <h1 className="text-3xl font-black">{game.name}</h1>
        </header>
        <Card>{settingsPanel}</Card>
        <Footer error={error}>
          <Button block onClick={onStart} busy={starting} disabled={room.startBlockedReason !== null}>
            Start {game.name}
          </Button>
          {room.startBlockedReason && <p className="text-center text-sm text-muted">{room.startBlockedReason}</p>}
        </Footer>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pt-6 pb-32">
      {header}
      <Card title="Invite friends">
        <SharePanel code={room.code} />
      </Card>

      <Card title="Pick a game">
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
                  <span className="text-lg font-bold">
                    {meta.name}
                    {!playable(id) && (
                      <span className="ml-2 rounded-full bg-panel px-2 py-0.5 align-middle text-xs font-semibold text-muted">
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted">
                    {meta.minPlayers}–{meta.maxPlayers} players
                  </span>
                </span>
                <span className="text-sm text-muted">{meta.tagline}</span>
              </button>
            );
          })}
        </div>
        <Rules rules={game.rules} />
      </Card>

      {players}
      {roomButtons}

      <Footer error={error}>
        <Button block onClick={() => goTo('settings')} disabled={!playable(room.gameId)}>
          Next
        </Button>
        {!playable(room.gameId) && <p className="text-center text-sm text-muted">{game.name} is coming soon</p>}
      </Footer>
    </main>
  );
}

function Rules({ rules }: { rules: string[] }) {
  return (
    <ol className="mt-4 flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
      {rules.map((rule) => (
        <li key={rule}>{rule}</li>
      ))}
    </ol>
  );
}

function Footer({ error, children }: { error: string | null; children: ReactNode }) {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-ink/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-md flex-col gap-2">
        {error && (
          <p role="alert" className="text-center text-sm text-bad">
            {error}
          </p>
        )}
        {children}
      </div>
    </footer>
  );
}
