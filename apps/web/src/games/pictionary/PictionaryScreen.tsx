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
        <>
          <RoleCard hint="Hold to see your word">
            <span className="text-sm font-semibold tracking-widest text-good uppercase">Draw · {view.genre}</span>
            <span className="text-4xl leading-tight font-black break-words">{view.word}</span>
          </RoleCard>
          <Card title="You're drawing">
            <div className="flex flex-col gap-4">
              <p className="text-muted">
                Draw it on paper: no letters, numbers or talking. Everyone else shouts out guesses.
              </p>
              <ActionButton action={{ type: 'skip' }} variant="secondary">
                Skip this word
              </ActionButton>
            </div>
          </Card>
        </>
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

function ActionButton({
  action,
  variant,
  children,
}: {
  action: PictionaryAction;
  variant?: 'secondary';
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
        await gameAction(action);
        setBusy(false);
      }}
    >
      {children}
    </Button>
  );
}
