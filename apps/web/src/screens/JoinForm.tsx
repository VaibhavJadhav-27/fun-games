import { useState, type FormEvent } from 'react';
import { NAME_MAX_LENGTH, nameSchema } from '@party/shared';
import { joinRoom } from '../socket/actions';
import { loadLastName } from '../socket/session';
import { useStore } from '../socket/store';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { MessageScreen } from '../ui/Screen';
import { TextField } from '../ui/TextField';

export function JoinForm({ code }: { code: string }) {
  const connected = useStore((s) => s.connection === 'connected');
  const [name, setName] = useState(loadLastName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a name');
      return;
    }
    setBusy(true);
    const res = await joinRoom(code, parsed.data);
    setBusy(false);
    if (res.ok) return;
    if (res.error.code === 'ROOM_NOT_FOUND') setNotFound(true);
    else setError(res.error.message);
  }

  if (notFound) {
    return <MessageScreen title="Room not found" body={`Room ${code} doesn't exist or has ended. Check the code with your host.`} />;
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 py-10">
      <header className="text-center">
        <p className="text-sm font-semibold tracking-widest text-muted uppercase">Joining room</p>
        <h1 className="font-mono text-5xl font-black tracking-[0.2em]">{code}</h1>
      </header>
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Your name"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="nickname"
            autoFocus
            placeholder="e.g. Ravi"
            error={error}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          <Button type="submit" block busy={busy} disabled={!connected}>
            Join
          </Button>
        </form>
      </Card>
    </main>
  );
}
