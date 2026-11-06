import {
  DIFFICULTIES,
  PICTIONARY_DRAW_SECONDS,
  PICTIONARY_GENRES,
  genreName,
  type Difficulty,
  type GenreId,
  type PictionaryDrawSeconds,
  type PictionaryMode,
  type PictionarySettings,
} from '@party/shared';
import { Chip } from '../../ui/Chip';
import { Segmented } from '../../ui/Segmented';

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', mixed: 'Mixed' };
const MODE_LABEL: Record<PictionaryMode, string> = {
  offline: 'Offline (paper)',
  board: 'Draw board',
  online: 'Online · soon',
};
const MODE_HELP: Record<PictionaryMode, string> = {
  offline: 'Draw on paper and shout your guesses.',
  board: 'The drawer draws on their phone and everyone watches live. Type or shout guesses before time runs out.',
  online: 'Coming soon.',
};

function timeLabel(seconds: PictionaryDrawSeconds): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  settings: PictionarySettings;
  editable: boolean;
  /** Resolves to an error message, or null on success. */
  onChange(next: PictionarySettings): Promise<string | null>;
}

export function PictionarySettingsPanel({ settings, editable, onChange }: Props) {
  if (!editable) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Mode</dt>
        <dd>{MODE_LABEL[settings.mode]}</dd>
        {settings.mode === 'board' && (
          <>
            <dt className="text-muted">Draw time</dt>
            <dd>{timeLabel(settings.drawSeconds)}</dd>
          </>
        )}
        <dt className="text-muted">Words from</dt>
        <dd>{settings.genres.map(genreName).join(', ')}</dd>
        <dt className="text-muted">Difficulty</dt>
        <dd>{DIFFICULTY_LABEL[settings.difficulty]}</dd>
      </dl>
    );
  }

  const change = (patch: Partial<PictionarySettings>) => void onChange({ ...settings, ...patch });
  const toggleGenre = (id: GenreId) => {
    const has = settings.genres.includes(id);
    if (has && settings.genres.length === 1) return; // keep at least one
    change({ genres: has ? settings.genres.filter((g) => g !== id) : [...settings.genres, id] });
  };

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Mode</legend>
        <Segmented
          options={[
            { value: 'offline' as const, label: 'Offline' },
            { value: 'board' as const, label: 'Draw board' },
            { value: 'online' as const, label: 'Online · soon', disabled: true },
          ]}
          value={settings.mode}
          onChange={(mode) => change({ mode })}
        />
        <p className="mt-1.5 text-xs text-muted">{MODE_HELP[settings.mode]}</p>
      </fieldset>

      {settings.mode === 'board' && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">Draw time</legend>
          <Segmented
            options={PICTIONARY_DRAW_SECONDS.map((s) => ({ value: s, label: timeLabel(s) }))}
            value={settings.drawSeconds}
            onChange={(drawSeconds) => change({ drawSeconds })}
          />
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-muted">Words from (pick one or more)</legend>
        <div className="flex flex-wrap gap-2">
          {PICTIONARY_GENRES.map((id) => (
            <Chip key={id} on={settings.genres.includes(id)} onClick={() => toggleGenre(id)}>
              {genreName(id)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Difficulty</legend>
        <Segmented
          options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
          value={settings.difficulty}
          onChange={(difficulty) => change({ difficulty })}
        />
        <p className="mt-1.5 text-xs text-muted">
          {settings.difficulty === 'easy'
            ? 'On Easy, guessers see the genre as a hint.'
            : 'Guessers get no hint. (On Easy they see the genre.)'}
        </p>
      </fieldset>
    </div>
  );
}
