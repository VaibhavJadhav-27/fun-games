import { Fragment, useState } from 'react';
import { PICTIONARY_DEFAULT_DRAW_SECONDS, type PictionaryAction, type PictionarySettings, type PictionaryView } from '@party/shared';
import { gameAction } from '../../socket/actions';
import { useStore } from '../../socket/store';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Countdown } from '../../ui/Countdown';
import { RoleCard } from '../../ui/RoleCard';
import { Board } from './Board';
import { GuessInput } from './GuessInput';

export function PictionaryScreen({ view, isHost }: { view: PictionaryView; isHost: boolean }) {
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? 'Someone';
  const drawer = nameOf(view.drawerId);
  const drawing = view.you.role === 'drawer';
  if (view.mode === 'board') return <BoardScreen view={view} isHost={isHost} nameOf={nameOf} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm font-semibold tracking-wide text-muted uppercase">Round {view.round}</p>

      {view.phase === 'reveal' ? (
        <>
          <div className={`rounded-3xl p-5 text-center ${view.guessed ? 'bg-good/15' : 'bg-panel-2'}`} role="status">
            <p
              className={`text-sm font-semibold tracking-widest uppercase ${view.guessed ? 'text-good' : 'text-muted'}`}
            >
              {view.guessed ? 'Guessed it!' : 'Nobody got it'} · {view.genre}
            </p>
            <p className="mt-1 text-4xl leading-tight font-black break-words">{view.word}</p>
            <p className="mt-2 text-muted">{drawing ? 'You drew it.' : `${drawer} drew it.`}</p>
          </div>
          <UpNext upNextId={view.upNextId} me={view.you.id} nameOf={nameOf} ready="✏️ You're up next. Grab the paper!" />
        </>
      ) : 'word' in view ? (
        <DrawerPanel key={view.round} word={view.word} genre={view.genre} />
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-3xl bg-panel p-6 text-center">
          <span aria-hidden className="text-4xl">
            ✏️
          </span>
          <p className="text-2xl font-black">{drawer} is drawing</p>
          <p className="text-muted">
            {view.genre ? (
              <>
                Genre: <span className="font-semibold text-fg">{view.genre}</span>
              </>
            ) : (
              'Shout out your guesses!'
            )}
          </p>
        </div>
      )}

      <HostControls
        isHost={isHost}
        phase={view.phase}
        waitingText='The host taps "Guessed it!" when someone gets it, or "Nobody got it" to reveal the word.'
      />
    </div>
  );
}

/** Draw board mode: the shared canvas, a countdown, and typed guesses. */
function BoardScreen({ view, isHost, nameOf }: { view: PictionaryView; isHost: boolean; nameOf(id: string): string }) {
  const total = useStore((s) => (s.room?.settings as PictionarySettings | undefined)?.drawSeconds ?? PICTIONARY_DEFAULT_DRAW_SECONDS);
  const drawer = nameOf(view.drawerId);
  const drawing = view.you.role === 'drawer';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm font-semibold tracking-wide text-muted uppercase">Round {view.round}</p>

      {/* Keyed per phase and per word, so a new round always starts from a fresh screen. */}
      {view.phase === 'reveal' ? (
        <Fragment key={`reveal-${view.channelKey}`}>
          <div className={`rounded-3xl p-5 text-center ${view.guessed ? 'bg-good/15' : 'bg-panel-2'}`} role="status">
            <p className={`text-sm font-semibold tracking-widest uppercase ${view.guessed ? 'text-good' : 'text-muted'}`}>
              {view.guessedBy
                ? view.guessedBy === view.you.id
                  ? 'You guessed it!'
                  : `${nameOf(view.guessedBy)} guessed it!`
                : view.guessed
                  ? 'Guessed it!'
                  : view.timeUp
                    ? "Time's up!"
                    : 'Nobody got it'}{' '}
              · {view.genre}
            </p>
            <p className="mt-1 text-4xl leading-tight font-black break-words">{view.word}</p>
            <p className="mt-2 text-muted">{drawing ? 'You drew it.' : `${drawer} drew it.`}</p>
          </div>
          <UpNext upNextId={view.upNextId} me={view.you.id} nameOf={nameOf} ready="✏️ You're up next. Get ready to draw!" />
          {/* The finished drawing, as a small thumbnail so the reveal stays compact. */}
          <div className="mx-auto w-2/5 max-w-40">
            <Board canDraw={false} />
          </div>
        </Fragment>
      ) : (
        <Fragment key={`draw-${view.channelKey}`}>
          <Countdown deadline={view.deadline} total={total} />
          {'word' in view ? (
            <BoardDrawerWord key={view.channelKey} word={view.word} genre={view.genre} />
          ) : (
            <p className="text-center">
              <span className="font-semibold">{drawer}</span> <span className="text-muted">is drawing</span>
              {view.genre && (
                <>
                  <span className="text-muted"> · </span>
                  <span className="font-semibold">{view.genre}</span>
                </>
              )}
            </p>
          )}
          {/* Capped by screen height, so the board, tools and guess box fit without scrolling. */}
          <div className="mx-auto w-full max-w-[min(100%,52vh)]">
            <Board canDraw={drawing} />
          </div>
          {drawing ? (
            <ActionButton action={{ type: 'skip' }} variant="secondary">
              Skip this word
            </ActionButton>
          ) : (
            <GuessInput />
          )}
        </Fragment>
      )}

      <HostControls
        isHost={isHost}
        phase={view.phase}
        waitingText='Type your guess or shout it out. The host can tap "Guessed it!" for a shouted answer.'
      />
    </div>
  );
}

/** The drawer's word stays on screen while drawing, small enough to leave room for the board. */
function BoardDrawerWord({ word, genre }: { word: string; genre: string }) {
  const [shown, setShown] = useState(true);
  return (
    <button
      type="button"
      onClick={() => setShown((v) => !v)}
      className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-good/15 px-4 py-2 text-left"
      aria-label={shown ? 'Hide your word' : 'Show your word'}
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold tracking-widest text-good uppercase">Draw · {genre}</span>
        <span className="block text-xl leading-tight font-black break-words">{shown ? word : '••••••'}</span>
      </span>
      <span className="shrink-0 text-xs text-muted">{shown ? 'Tap to hide' : 'Tap to show'}</span>
    </button>
  );
}

function UpNext({ upNextId, me, nameOf, ready }: { upNextId: string | null; me: string; nameOf(id: string): string; ready: string }) {
  if (!upNextId) return null;
  return (
    <p className={`rounded-2xl px-4 py-3 text-center ${upNextId === me ? 'bg-accent/15 font-semibold' : 'bg-panel-2'}`}>
      {upNextId === me ? (
        ready
      ) : (
        <>
          <span className="text-muted">Up next: </span>
          <span className="font-semibold">{nameOf(upNextId)}</span>
        </>
      )}
    </p>
  );
}

function HostControls({ isHost, phase, waitingText }: { isHost: boolean; phase: PictionaryView['phase']; waitingText: string }) {
  if (!isHost) {
    return (
      <p className="text-center text-sm text-muted">
        {phase === 'drawing' ? waitingText : 'Waiting for the host to start the next round…'}
      </p>
    );
  }
  return phase === 'drawing' ? (
    <div className="flex flex-col gap-2">
      <ActionButton action={{ type: 'guessed' }}>Guessed it!</ActionButton>
      <ActionButton action={{ type: 'giveUp' }} variant="secondary">
        Nobody got it
      </ActionButton>
    </div>
  ) : (
    <ActionButton action={{ type: 'next' }}>Next round</ActionButton>
  );
}

/** The word sits behind a hold-to-reveal card, so a skip needs visible feedback. */
function DrawerPanel({ word, genre }: { word: string; genre: string }) {
  const [skips, setSkips] = useState(0);
  return (
    <>
      <RoleCard hint={skips > 0 ? 'New word! Hold to see it' : 'Hold to see your word'}>
        <span className="text-sm font-semibold tracking-widest text-good uppercase">Draw · {genre}</span>
        <span className="text-4xl leading-tight font-black break-words">{word}</span>
      </RoleCard>
      <Card title="You're drawing">
        <div className="flex flex-col gap-4">
          <p className="text-muted">Draw it on paper: no letters, numbers or talking. Everyone else shouts out guesses.</p>
          {skips > 0 && (
            <p role="status" className="rounded-2xl bg-good/15 px-4 py-3 text-center text-sm font-semibold text-good">
              You got a new word{skips > 1 ? ` (skipped ${skips})` : ''}. Hold the card above to see it.
            </p>
          )}
          <ActionButton action={{ type: 'skip' }} variant="secondary" onDone={() => setSkips((n) => n + 1)}>
            Skip this word
          </ActionButton>
        </div>
      </Card>
    </>
  );
}

function ActionButton({
  action,
  variant,
  onDone,
  children,
}: {
  action: PictionaryAction;
  variant?: 'secondary';
  onDone?: () => void;
  children: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      block
      variant={variant ?? 'primary'}
      busy={busy}
      onClick={async () => {
        setBusy(true);
        const res = await gameAction(action);
        setBusy(false);
        if (res.ok) onDone?.();
      }}
    >
      {children}
    </Button>
  );
}
