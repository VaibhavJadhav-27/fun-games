import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH, isRoomCode, nameSchema, normalizeRoomCode } from '@party/shared';
import { clearEnded, createRoom } from '../socket/actions';
import { loadLastName } from '../socket/session';
import { useStore } from '../socket/store';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { TextField } from '../ui/TextField';

export function Landing() {
  const [, navigate] = useLocation();
  const connected = useStore((s) => s.connection === 'connected');
  const [name, setName] = useState(loadLastName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => clearEnded(), []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Enter a name');
      return;
    }
    setCreating(true);
    const res = await createRoom(parsed.data, 'imposter');
    setCreating(false);
    if (res.ok) navigate(`/r/${res.data.code}`);
    else setNameError(res.error.message);
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    if (isRoomCode(code)) navigate(`/r/${code}`);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 py-10">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-black tracking-tight">
          Party <span className="text-accent">Games</span>
        </h1>
        <p className="text-muted">Imposter · Traitor · Pictionary</p>
        <p className="text-sm text-muted">Same room, one phone each. No install.</p>
      </header>

      <Card title="Host a game">
        <form onSubmit={onCreate} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Your name"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="nickname"
            placeholder="e.g. Asha"
            error={nameError}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
          <Button type="submit" block busy={creating} disabled={!connected}>
            Create room
          </Button>
        </form>
      </Card>

      <Card title="Join a game">
        <form onSubmit={onJoin} className="flex flex-col gap-4">
          <TextField
            label="Room code"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="ABCD"
            className="text-center font-mono text-2xl tracking-[0.5em] uppercase"
            onChange={(e) => setCode(normalizeRoomCode(e.target.value).replace(/[^A-Z]/g, ''))}
          />
          <Button type="submit" variant="secondary" block disabled={!isRoomCode(code)}>
            Join room
          </Button>
        </form>
      </Card>
    </main>
  );
}
