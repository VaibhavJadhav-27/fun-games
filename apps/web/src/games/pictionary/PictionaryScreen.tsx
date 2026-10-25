import { useState } from 'react';
import type { PictionaryAction, PictionaryView } from '@party/shared';
import { gameAction } from '../../socket/actions';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { RoleCard } from '../../ui/RoleCard';

export function PictionaryScreen({ view, isHost }: { view: PictionaryView; isHost: boolean }) {
  const drawer = view.players.find((p) => p.id === view.drawerId)?.name ?? 'Someone';
  const drawing = view.you.role === 'drawer';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm font-semibold tracking-wide text-muted uppercase">Round {view.round}</p>

      {view.phase === 'reveal' ? (
        <div className="rounded-3xl bg-good/15 p-5 text-center" role="status">
          <p className="text-sm font-semibold tracking-widest text-good uppercase">Guessed it! · {view.genre}</p>
          <p className="mt-1 text-4xl leading-tight font-black break-words">{view.word}</p>
          <p className="mt-2 text-muted">{drawing ? 'You drew it.' : `${drawer} drew it.`}</p>
        </div>
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

      {isHost ? (
        view.phase === 'drawing' ? (
          <ActionButton action={{ type: 'guessed' }}>Guessed it!</ActionButton>
        ) : (
          <ActionButton action={{ type: 'next' }}>Next round</ActionButton>
        )
      ) : (
        <p className="text-center text-sm text-muted">
          {view.phase === 'drawing'
            ? 'The host taps "Guessed it!" when someone gets it.'
            : 'Waiting for the host to start the next round…'}
        </p>
      )}
    </div>
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
