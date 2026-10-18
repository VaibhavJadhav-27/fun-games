import {
  DIFFICULTIES,
  GENRES,
  IMPOSTER_MAX_ROUNDS,
  IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS,
  genreName,
  type Difficulty,
  type GenreId,
  type ImposterSettings,
} from '@party/shared';

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', mixed: 'Mixed' };

interface Props {
  settings: ImposterSettings;
  playerCount: number;
  editable: boolean;
  onChange(next: ImposterSettings): void;
}

export function ImposterSettingsPanel({ settings, playerCount, editable, onChange }: Props) {
  if (!editable) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Genres</dt>
        <dd>{settings.genres.map(genreName).join(', ')}</dd>
        <dt className="text-muted">Difficulty</dt>
        <dd>{DIFFICULTY_LABEL[settings.difficulty]}</dd>
        <dt className="text-muted">Imposters</dt>
        <dd>{settings.imposters}</dd>
        <dt className="text-muted">Max rounds</dt>
        <dd>{settings.maxRounds}</dd>
      </dl>
    );
  }

  const toggleGenre = (id: GenreId) => {
    const has = settings.genres.includes(id);
    if (has && settings.genres.length === 1) return; // keep at least one
    onChange({ ...settings, genres: has ? settings.genres.filter((g) => g !== id) : [...settings.genres, id] });
  };
  const twoAllowed = playerCount >= IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS;

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-muted">Genres (pick one or more)</legend>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => {
            const on = settings.genres.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleGenre(g.id)}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
                  on ? 'border-accent bg-accent text-white' : 'border-line bg-panel-2 text-fg active:bg-line'
                }`}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Difficulty</legend>
        <Segmented
          options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
          value={settings.difficulty}
          onChange={(difficulty) => onChange({ ...settings, difficulty })}
        />
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Imposters</legend>
        <Segmented
          options={[
            { value: 1 as const, label: '1' },
            { value: 2 as const, label: '2', disabled: !twoAllowed },
          ]}
          value={settings.imposters}
          onChange={(imposters) => onChange({ ...settings, imposters })}
        />
        {!twoAllowed && (
          <p className="mt-1.5 text-xs text-muted">2 imposters need {IMPOSTER_TWO_IMPOSTERS_MIN_PLAYERS}+ players.</p>
        )}
      </fieldset>

      <fieldset className="flex items-center justify-between gap-4">
        <legend className="sr-only">Max rounds</legend>
        <span className="text-sm font-medium text-muted">Max rounds</span>
        <div className="flex items-center gap-3">
          <StepButton
            label="Fewer rounds"
            disabled={settings.maxRounds <= 1}
            onClick={() => onChange({ ...settings, maxRounds: settings.maxRounds - 1 })}
          >
            −
          </StepButton>
          <span className="w-6 text-center text-xl font-bold tabular-nums">{settings.maxRounds}</span>
          <StepButton
            label="More rounds"
            disabled={settings.maxRounds >= IMPOSTER_MAX_ROUNDS}
            onClick={() => onChange({ ...settings, maxRounds: settings.maxRounds + 1 })}
          >
            +
          </StepButton>
        </div>
      </fieldset>
    </div>
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
