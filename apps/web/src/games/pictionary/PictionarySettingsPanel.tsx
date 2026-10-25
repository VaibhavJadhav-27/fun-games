import {
  DIFFICULTIES,
  PICTIONARY_GENRES,
  genreName,
  type Difficulty,
  type GenreId,
  type PictionaryMode,
  type PictionarySettings,
} from '@party/shared';
import { Chip } from '../../ui/Chip';
import { Segmented } from '../../ui/Segmented';

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', mixed: 'Mixed' };
const MODE_LABEL: Record<PictionaryMode, string> = { offline: 'Offline (paper)', online: 'Online · soon' };

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
            { value: 'online' as const, label: 'Online · soon', disabled: true },
          ]}
          value={settings.mode}
          onChange={(mode) => change({ mode })}
        />
        <p className="mt-1.5 text-xs text-muted">
          Draw on paper and shout your guesses. Drawing on the phone is coming soon.
        </p>
      </fieldset>

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
