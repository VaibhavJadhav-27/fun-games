import { useState, type ReactNode } from 'react';
import { TRAITOR_NIGHT_MS, TRAITOR_VOTE_MS, type PlayerId, type TraitorAction, type TraitorView } from '@party/shared';
import { gameAction } from '../../socket/actions';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Countdown } from '../../ui/Countdown';
import { RoleCard } from '../../ui/RoleCard';
import { VoteBreakdown } from '../../ui/VoteBreakdown';
import { VotePanel } from '../../ui/VotePanel';

export function TraitorScreen({ view, isHost }: { view: TraitorView; isHost: boolean }) {
  const nameOf = (id: PlayerId) => view.players.find((p) => p.id === id)?.name ?? 'Someone';

  if (view.phase === 'night') return <Night view={view} nameOf={nameOf} />;

  return (
    <div className="flex flex-col gap-4">
      {view.round > 0 && (
        <p className="text-center text-sm font-semibold text-muted">
          {view.phase === 'morning' ? `Morning after night ${view.round}` : `Day ${view.round}`}
        </p>
      )}

      {!view.you.alive && (
        <p className="rounded-2xl bg-panel-2 px-4 py-3 text-center text-sm text-muted">
          You're out. Watch the rest of the game, but no hints out loud!
        </p>
      )}

      <Role view={view} nameOf={nameOf} />

      {view.phase === 'roles' && (
        <Card title="Get ready">
          <div className="flex flex-col gap-4">
            <p className="text-muted">
              Hold the card to check your role, and keep it to yourself. When everyone has looked, the host starts the
              first night.
            </p>
            <HostOr isHost={isHost} waiting="Waiting for the host to begin the night…">
              <ActionButton action={{ type: 'continue' }}>Begin the night</ActionButton>
            </HostOr>
          </div>
        </Card>
      )}

      {view.phase === 'morning' && <Morning view={view} isHost={isHost} />}

      {view.phase === 'day' && (
        <Card title="Discuss">
          <div className="flex flex-col gap-4">
            <p className="text-muted">Talk it through out loud. Who's been acting strangely? When you're ready, vote.</p>
            <Survivors view={view} />
            <HostOr isHost={isHost} waiting="The host starts the vote when everyone's ready.">
              <ActionButton action={{ type: 'startVote' }}>Start voting</ActionButton>
            </HostOr>
          </div>
        </Card>
      )}

      {view.phase === 'vote' && view.vote && (
        <Card title="Vote: who is a traitor?">
          <div className="flex flex-col gap-4">
            <Countdown deadline={view.deadline} total={TRAITOR_VOTE_MS / 1000} />
            <VotePanel vote={view.vote} me={view.you.id} nameOf={nameOf} />
          </div>
        </Card>
      )}

      {view.phase === 'reveal' && view.dayResult && <Reveal view={view} isHost={isHost} nameOf={nameOf} />}
    </div>
  );
}

function Role({ view, nameOf }: { view: TraitorView; nameOf(id: PlayerId): string }) {
  return (
    <RoleCard>
      {'fellowTraitors' in view ? (
        <>
          <span className="text-sm font-semibold text-bad">You are a</span>
          <span className="text-4xl font-black text-bad">TRAITOR</span>
          <span className="text-sm text-muted">
            {view.fellowTraitors.length === 0 ? (
              'You work alone.'
            ) : (
              <>
                With <span className="font-semibold text-fg">{view.fellowTraitors.map(nameOf).join(' and ')}</span>
              </>
            )}
          </span>
        </>
      ) : (
        <>
          <span className="text-sm font-semibold text-good">You are a</span>
          <span className="text-4xl font-black text-good">CIVILIAN</span>
          <span className="text-sm text-muted">Find the traitors before they outnumber you.</span>
        </>
      )}
    </RoleCard>
  );
}

/**
 * Every living player gets this same dark screen, heading and Lock button, so nobody can
 * tell roles apart by watching phones. Traitors choose a victim (and see their team's
 * picks); civilians choose a suspect, which changes nothing.
 */
function Night({ view, nameOf }: { view: TraitorView; nameOf(id: PlayerId): string }) {
  const night = view.night;
  const team = 'fellowTraitors' in view && view.night ? view.night.team : [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: TraitorAction) {
    setBusy(true);
    const res = await gameAction(action);
    setBusy(false);
    setError(res.ok || res.error.code === 'STALE_PHASE' || res.error.code === 'WRONG_PHASE' ? null : res.error.message);
  }

  return (
    <section
      aria-label={`Night ${view.round}`}
      className="-mx-4 flex min-h-[80dvh] flex-col gap-5 rounded-3xl bg-[#05050c] px-5 py-6 text-[#e8e8f4]"
    >
      <header className="text-center">
        <p aria-hidden className="text-4xl">
          🌙
        </p>
        <h2 className="mt-1 text-3xl font-black">Night {view.round}</h2>
        <p className="mt-1 text-sm text-[#9b9bb8]">Keep your eyes on your own screen.</p>
      </header>

      <Countdown deadline={view.deadline} total={TRAITOR_NIGHT_MS / 1000} />

      {!night ? (
        <p className="py-10 text-center text-[#9b9bb8]">You're out. Stay quiet while the night plays out.</p>
      ) : (
        <>
          <p className="text-center text-sm text-[#9b9bb8]">Tap a name, then lock it in.</p>
          <ul className="flex flex-col gap-2">
            {night.options.map((id) => {
              const mine = night.mine.target === id;
              const backers = team.filter((t) => t.target === id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={busy || night.mine.locked}
                    onClick={() => send({ type: 'pick', target: id })}
                    aria-pressed={mine}
                    className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left font-semibold transition-colors disabled:cursor-default ${
                      mine ? 'border-[#8b5cf6] bg-[#8b5cf6]/20' : 'border-[#2a2a42] bg-[#151523] enabled:active:bg-[#1e1e31]'
                    }`}
                  >
                    <span className="truncate">{nameOf(id)}</span>
                    {backers.length > 0 && (
                      <span className="flex shrink-0 gap-1 text-xs font-medium text-[#c4b5fd]">
                        {backers.map((b) => (
                          <span key={b.id} className="rounded-full bg-[#8b5cf6]/25 px-2 py-0.5">
                            {nameOf(b.id)}
                            {b.locked ? ' ✓' : ''}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <Button
            block
            busy={busy}
            disabled={night.mine.target === null}
            onClick={() => send({ type: night.mine.locked ? 'unlock' : 'lock' })}
          >
            {night.mine.locked ? 'Locked in. Tap to change' : 'Lock it in'}
          </Button>
          <p className="text-center text-sm text-[#9b9bb8]" aria-live="polite">
            {night.mine.locked
              ? 'Waiting for everyone to lock in. The night ends when the last person does.'
              : 'The night ends once everyone has locked in.'}
          </p>
          {error && (
            <p role="alert" className="text-center text-sm text-[#f87171]">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Morning({ view, isHost }: { view: TraitorView; isHost: boolean }) {
  const victim = view.players.find((p) => p.id === view.victimId);
  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-3xl p-5 text-center ${victim ? 'bg-bad/15' : 'bg-panel-2'}`} role="status">
        <p aria-hidden className="text-3xl">
          ☀️
        </p>
        {victim ? (
          <>
            <p className="mt-1 text-3xl font-black">{victim.id === view.you.id ? 'You were' : `${victim.name} was`} killed</p>
            <p className="mt-1 text-muted">
              {victim.revealedRole ? `They were a ${victim.revealedRole}.` : 'Their role stays secret.'}
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-3xl font-black">Nobody was killed</p>
            <p className="mt-1 text-muted">The traitors couldn't agree in time.</p>
          </>
        )}
      </div>
      <HostOr isHost={isHost} waiting="Waiting for the host to start the day…">
        <ActionButton action={{ type: 'continue' }}>Start the day</ActionButton>
      </HostOr>
    </div>
  );
}

function Reveal({ view, isHost, nameOf }: { view: TraitorView; isHost: boolean; nameOf(id: PlayerId): string }) {
  const result = view.dayResult;
  if (!result) return null;
  const out = view.players.find((p) => p.id === result.evictedId);
  const tone = out?.revealedRole === 'traitor' ? 'bg-good/15' : out ? 'bg-bad/15' : 'bg-panel-2';

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-3xl p-5 text-center ${tone}`} role="status">
        {out ? (
          <>
            <p className="text-3xl font-black">{out.id === view.you.id ? 'You were' : `${out.name} was`} voted out</p>
            <p className="mt-1 text-lg">
              {out.revealedRole === 'traitor'
                ? 'They were a traitor!'
                : out.revealedRole === 'civilian'
                  ? 'They were a civilian.'
                  : 'Their role stays secret.'}
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl font-black">Nobody was voted out</p>
            <p className="mt-1 text-muted">{result.reason === 'tie' ? 'It was a tie.' : 'Skip won the vote.'}</p>
          </>
        )}
      </div>
      <Card title="Votes">
        <VoteBreakdown result={result} nameOf={nameOf} />
      </Card>
      <HostOr isHost={isHost} waiting="Waiting for the host to begin the next night…">
        <ActionButton action={{ type: 'continue' }}>Begin the next night</ActionButton>
      </HostOr>
    </div>
  );
}

function Survivors({ view }: { view: TraitorView }) {
  const alive = view.players.filter((p) => p.status === 'alive');
  const dead = view.players.filter((p) => p.status !== 'alive');
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        <span className="text-muted">Still in: </span>
        {alive.map((p) => p.name).join(', ')}
      </p>
      {dead.length > 0 && (
        <p className="text-muted">
          Out:{' '}
          {dead
            .map((p) => `${p.name} (${p.status === 'killed' ? 'killed' : 'voted out'}${p.revealedRole ? `, ${p.revealedRole}` : ''})`)
            .join(', ')}
        </p>
      )}
    </div>
  );
}

function HostOr({ isHost, waiting, children }: { isHost: boolean; waiting: string; children: ReactNode }) {
  return isHost ? <>{children}</> : <p className="text-center text-sm text-muted">{waiting}</p>;
}

function ActionButton({ action, children }: { action: TraitorAction; children: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      block
      busy={busy}
      onClick={async () => {
        setBusy(true);
        await gameAction(action);
        setBusy(false);
      }}
    >
      {children}
    </Button>
  );
}
