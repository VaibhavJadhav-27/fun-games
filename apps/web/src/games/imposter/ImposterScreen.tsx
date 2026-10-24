import { useState, type FormEvent } from 'react';
import { IMPOSTER_GUESS_MS, IMPOSTER_VOTE_MS, type ImposterView, type PlayerId } from '@party/shared';
import { gameAction } from '../../socket/actions';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Countdown } from '../../ui/Countdown';
import { RoleCard } from '../../ui/RoleCard';
import { TextField } from '../../ui/TextField';
import { VoteBreakdown } from '../../ui/VoteBreakdown';
import { VotePanel } from '../../ui/VotePanel';

export function ImposterScreen({ view, isHost }: { view: ImposterView; isHost: boolean }) {
  const nameOf = (id: PlayerId) => view.players.find((p) => p.id === id)?.name ?? 'Someone';
  const alive = view.players.filter((p) => !p.evicted);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm font-semibold tracking-wide text-muted uppercase">
        Round {view.round} of {view.maxRounds}
      </p>

      {view.you.role !== 'moderator' && view.you.evicted && (
        <p className="rounded-2xl bg-panel-2 px-4 py-3 text-center text-sm text-muted">
          You've been evicted. You're watching until the game ends, so no hints out loud!
        </p>
      )}

      {view.you.role === 'moderator' && (
        <p className="rounded-2xl bg-panel-2 px-4 py-3 text-center text-sm text-muted">
          You're the moderator: you chose the word, so you run the game but don't vote. Keep a straight face!
        </p>
      )}

      <RoleCard>
        {'fellowImposters' in view ? (
          <>
            <span className="text-sm font-semibold tracking-widest text-bad uppercase">You are the</span>
            <span className="text-4xl font-black text-bad">IMPOSTER</span>
            <span className="text-muted">
              {view.genre ? (
                <>
                  Genre: <span className="font-semibold text-fg">{view.genre}</span>
                </>
              ) : (
                'No hint this time. Listen closely and blend in.'
              )}
            </span>
            {view.fellowImposters.length > 0 && (
              <span className="text-sm text-muted">
                Fellow imposter: <span className="font-semibold text-fg">{view.fellowImposters.map(nameOf).join(', ')}</span>
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-sm font-semibold tracking-widest text-good uppercase">
              {view.you.role === 'moderator' ? 'Moderator' : 'Crewmate'}
              {view.genre ? ` · ${view.genre}` : ''}
            </span>
            <span className="text-4xl leading-tight font-black break-words">{view.word}</span>
          </>
        )}
      </RoleCard>

      {view.phase === 'discussion' && <Discussion view={view} isHost={isHost} alive={alive.map((p) => p.name)} />}

      {view.phase === 'vote' && view.vote && (
        <Card title="Vote: who is the imposter?">
          <div className="flex flex-col gap-4">
            <Countdown deadline={view.deadline} total={IMPOSTER_VOTE_MS / 1000} />
            <VotePanel vote={view.vote} me={view.you.id} nameOf={nameOf} />
          </div>
        </Card>
      )}

      {(view.phase === 'lastGuess' || view.phase === 'result') && view.result && (
        <Outcome view={view} isHost={isHost} nameOf={nameOf} />
      )}
    </div>
  );
}

function Discussion({ view, isHost, alive }: { view: ImposterView; isHost: boolean; alive: string[] }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Discuss">
      <div className="flex flex-col gap-4">
        <p className="text-muted">
          Go round the group out loud: everyone says one word linked to the secret word. Then discuss who's bluffing.
        </p>
        <p className="text-sm">
          <span className="text-muted">Still in: </span>
          {alive.join(', ')}
        </p>
        {isHost ? (
          <Button
            block
            busy={busy}
            onClick={async () => {
              setBusy(true);
              await gameAction({ type: 'startVote' });
              setBusy(false);
            }}
          >
            Start voting
          </Button>
        ) : (
          <p className="text-center text-sm text-muted">The host starts the vote when everyone's ready.</p>
        )}
        {view.round > 1 && <p className="text-center text-xs text-muted">Same word as last round.</p>}
      </div>
    </Card>
  );
}

function Outcome({ view, isHost, nameOf }: { view: ImposterView; isHost: boolean; nameOf(id: PlayerId): string }) {
  const result = view.result;
  if (!result) return null;
  const evicted = result.evictedId ? nameOf(result.evictedId) : null;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`rounded-3xl p-5 text-center ${
          result.outcome === 'caught' ? 'bg-good/15' : result.outcome === 'innocent' ? 'bg-bad/15' : 'bg-panel-2'
        }`}
        role="status"
      >
        {result.outcome === 'caught' && (
          <>
            <p className="text-3xl font-black text-good">Imposter caught!</p>
            <p className="mt-1 text-lg">{evicted} was the imposter.</p>
          </>
        )}
        {result.outcome === 'innocent' && (
          <>
            <p className="text-3xl font-black text-bad">{evicted} was innocent</p>
            <p className="mt-1 text-muted">The imposter is still among you.</p>
          </>
        )}
        {result.outcome === 'nobody' && (
          <>
            <p className="text-2xl font-black">Nobody was evicted</p>
            <p className="mt-1 text-muted">{result.reason === 'tie' ? 'It was a tie.' : 'Skip won the vote.'}</p>
          </>
        )}
      </div>

      {view.phase === 'lastGuess' && view.lastGuess && <LastGuess view={view} nameOf={nameOf} />}

      {view.phase === 'result' && view.lastGuess && view.lastGuess.status !== 'pending' && (
        <p className="text-center text-muted">
          {nameOf(view.lastGuess.by)}{' '}
          {view.lastGuess.status === 'timeout'
            ? "ran out of time to guess the word."
            : `guessed "${view.lastGuess.text ?? ''}", which was wrong.`}
        </p>
      )}

      <Card title="Votes">
        <VoteBreakdown result={result} nameOf={nameOf} />
      </Card>

      {view.phase === 'result' &&
        (isHost ? (
          <ContinueButton />
        ) : (
          <p className="text-center text-sm text-muted">Waiting for the host to start the next round…</p>
        ))}
    </div>
  );
}

function LastGuess({ view, nameOf }: { view: ImposterView; nameOf(id: PlayerId): string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = view.lastGuess?.by === view.you.id;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const res = await gameAction({ type: 'guess', text: text.trim() });
    setBusy(false);
    if (!res.ok && res.error.code !== 'STALE_PHASE') setError(res.error.message);
  }

  return (
    <Card title="Last chance">
      <div className="flex flex-col gap-4">
        <Countdown deadline={view.deadline} total={IMPOSTER_GUESS_MS / 1000} />
        {mine ? (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <TextField
              label="Guess the secret word to steal the win"
              value={text}
              maxLength={60}
              autoFocus
              autoComplete="off"
              error={error}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
            />
            <Button type="submit" block busy={busy} disabled={!text.trim()}>
              Submit guess
            </Button>
          </form>
        ) : (
          <p className="text-center text-muted">
            {nameOf(view.lastGuess?.by ?? '')} gets one guess at the word. If they get it, the imposters win!
          </p>
        )}
      </div>
    </Card>
  );
}

function ContinueButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      block
      busy={busy}
      onClick={async () => {
        setBusy(true);
        await gameAction({ type: 'continue' });
        setBusy(false);
      }}
    >
      Next round
    </Button>
  );
}
