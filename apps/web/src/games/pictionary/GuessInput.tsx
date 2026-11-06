import { useState, type FormEvent } from 'react';
import { PICTIONARY_GUESS_MAX_LENGTH } from '@party/shared';
import { gameAction } from '../../socket/actions';
import { Button } from '../../ui/Button';

type Feedback = { kind: 'wrong' | 'close'; text: string } | { kind: 'error'; text: string } | null;

/** Board mode: type a guess. The result comes back only to us; a correct one ends the round. */
export function GuessInput() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const guess = text.trim();
    if (!guess || busy) return;
    setBusy(true);
    const res = await gameAction({ type: 'guess', text: guess });
    setBusy(false);
    if (!res.ok) return setFeedback({ kind: 'error', text: res.error.message });
    const result = res.data?.guess;
    if (result === 'close') {
      // Keep the text so it can be fixed.
      setFeedback({ kind: 'close', text: guess });
    } else if (result === 'wrong') {
      setFeedback({ kind: 'wrong', text: guess });
      setText('');
    }
    // 'correct' (or no reply, when time just ran out): the reveal replaces this screen.
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (feedback?.kind === 'error') setFeedback(null);
          }}
          maxLength={PICTIONARY_GUESS_MAX_LENGTH}
          placeholder="Type your guess"
          aria-label="Your guess"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-panel-2 px-4 text-lg text-fg outline-none placeholder:text-muted/60 focus:border-accent"
        />
        <Button type="submit" busy={busy} disabled={!text.trim()} className="min-h-12 px-5">
          Guess
        </Button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {feedback?.kind === 'close' && (
          <span className="font-semibold text-warn">So close! “{feedback.text}” is one letter off.</span>
        )}
        {feedback?.kind === 'wrong' && <span className="text-muted">“{feedback.text}” isn't it. Keep going!</span>}
        {feedback?.kind === 'error' && <span className="text-bad">{feedback.text}</span>}
      </p>
    </form>
  );
}
