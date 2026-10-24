import { useState, type FormEvent } from 'react';
import {
  CUSTOM_WORD_MAX,
  DIFFICULTIES,
  IMPOSTER_GENRES,
  IMPOSTER_MAX_ROUNDS,
  IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS,
  genreName,
  type Difficulty,
  type ImposterGenreId,
  type ImposterPublicSettings,
  type ImposterSettingsUpdate,
} from '@party/shared';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', mixed: 'Mixed' };

interface Props {
  settings: ImposterPublicSettings;
  /** Players who would get a role (the host isn't counted when moderating). */
  playerCount: number;
  editable: boolean;
  /** Resolves to an error message, or null on success. */
  onChange(next: ImposterSettingsUpdate): Promise<string | null>;
}

/** The current settings as an update that leaves the (hidden) custom word as it is. */
function asUpdate(s: ImposterPublicSettings): ImposterSettingsUpdate {
  return { source: s.source, genres: [...s.genres], difficulty: s.difficulty, imposters: s.imposters, maxRounds: s.maxRounds };
}

export function ImposterSettingsPanel({ settings, playerCount, editable, onChange }: Props) {
  const custom = settings.source === 'custom';

  if (!editable) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Word</dt>
        <dd>{custom ? 'Custom word from the host (they moderate)' : settings.genres.map(genreName).join(', ')}</dd>
        {!custom && (
          <>
            <dt className="text-muted">Difficulty</dt>
            <dd>{DIFFICULTY_LABEL[settings.difficulty]}</dd>
          </>
        )}
        <dt className="text-muted">Imposters</dt>
        <dd>{settings.imposters}</dd>
        <dt className="text-muted">Max rounds</dt>
        <dd>{settings.maxRounds}</dd>
      </dl>
    );
  }

  const base = asUpdate(settings);
  const change = (patch: Partial<ImposterSettingsUpdate>) => void onChange({ ...base, ...patch });
  const toggleGenre = (id: ImposterGenreId) => {
    if (custom) return change({ source: 'genres', genres: [id] });
    const has = settings.genres.includes(id);
    if (has && settings.genres.length === 1) return; // keep at least one
    change({ genres: has ? settings.genres.filter((g) => g !== id) : [...settings.genres, id] });
  };
  const twoAllowed = playerCount >= IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS;

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-muted">Word from (pick one or more)</legend>
        <div className="flex flex-wrap gap-2">
          {IMPOSTER_GENRES.map((id) => (
            <Chip key={id} on={!custom && settings.genres.includes(id)} onClick={() => toggleGenre(id)}>
              {genreName(id)}
            </Chip>
          ))}
          <Chip on={custom} onClick={() => !custom && change({ source: 'custom' })}>
            ✏️ Custom word
          </Chip>
        </div>
      </fieldset>

      {custom ? (
        <CustomWord set={settings.customWordSet} onSave={(customWord) => onChange({ ...base, customWord })} />
      ) : (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">Difficulty</legend>
          <Segmented
            options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
            value={settings.difficulty}
            onChange={(difficulty) => change({ difficulty })}
          />
          <p className="mt-1.5 text-xs text-muted">
            {settings.difficulty === 'easy'
              ? 'On Easy, the imposter sees the genre as a hint.'
              : 'The imposter gets no hint. (On Easy they see the genre.)'}
          </p>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Imposters</legend>
        <Segmented
          options={[
            { value: 1 as const, label: '1' },
            { value: 2 as const, label: '2', disabled: !twoAllowed },
          ]}
          value={settings.imposters}
          onChange={(imposters) => change({ imposters })}
        />
        {!twoAllowed && (
          <p className="mt-1.5 text-xs text-muted">
            2 imposters need {IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS}+ players{custom ? ' besides you' : ''}.
          </p>
        )}
      </fieldset>

      <fieldset className="flex items-center justify-between gap-4">
        <legend className="sr-only">Max rounds</legend>
        <span className="text-sm font-medium text-muted">Max rounds</span>
        <div className="flex items-center gap-3">
          <StepButton
            label="Fewer rounds"
            disabled={settings.maxRounds <= 1}
            onClick={() => change({ maxRounds: settings.maxRounds - 1 })}
          >
            −
          </StepButton>
          <span className="w-6 text-center text-xl font-bold tabular-nums">{settings.maxRounds}</span>
          <StepButton
            label="More rounds"
            disabled={settings.maxRounds >= IMPOSTER_MAX_ROUNDS}
            onClick={() => change({ maxRounds: settings.maxRounds + 1 })}
          >
            +
          </StepButton>
        </div>
      </fieldset>
    </div>
  );
}

/** The host types the word. Once saved it's hidden, since others may be looking at this phone. */
function CustomWord({ set, onSave }: { set: boolean; onSave(word: string): Promise<string | null> }) {
  const [editing, setEditing] = useState(!set);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const problem = await onSave(text.trim());
    setBusy(false);
    setError(problem);
    if (!problem) {
      setText('');
      setEditing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-panel-2 p-4">
      {set && !editing ? (
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-good">✓ Word set (hidden)</p>
          <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <TextField
            label="Your secret word"
            value={text}
            maxLength={CUSTOM_WORD_MAX}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="e.g. Mango"
            error={error}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
          />
          <Button type="submit" block busy={busy} disabled={!text.trim()}>
            Use this word
          </Button>
        </form>
      )}
      <p className="text-xs text-muted">
        You know the word, so you'll moderate: you run the game but don't get a role or a vote. The imposter gets no
        hint.
      </p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick(): void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
        on ? 'border-accent bg-accent text-white' : 'border-line bg-panel-2 text-fg active:bg-line'
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange(v: T): void;
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-panel-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`min-h-11 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${
            o.value === value ? 'bg-accent text-white' : 'text-fg active:bg-line'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick(): void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full border border-line bg-panel-2 text-xl font-bold disabled:opacity-40"
    >
      {children}
    </button>
  );
}
