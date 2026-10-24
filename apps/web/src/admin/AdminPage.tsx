import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { ThemeToggle } from '../ui/ThemeToggle';
import { AdminDashboard } from './AdminDashboard';
import { adminApi, AdminApiError } from './api';

type Gate = 'checking' | 'login' | 'in' | 'off';

/** /admin: not linked anywhere. Login first, then the dashboard. */
export function AdminPage() {
  const [gate, setGate] = useState<Gate>('checking');

  useEffect(() => {
    document.title = 'Party Games admin';
    adminApi
      .session()
      .then((s) => setGate(s.loggedIn ? 'in' : 'login'))
      .catch((e: unknown) => setGate(e instanceof AdminApiError && e.status === 404 ? 'off' : 'login'));
  }, []);

  const logout = async () => {
    await adminApi.logout().catch(() => {});
    setGate('login');
  };

  if (gate === 'in') return <AdminDashboard onLoggedOut={() => setGate('login')} onLogout={logout} />;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10">
      <div className="flex justify-end pt-3">
        <ThemeToggle />
      </div>
      {gate === 'checking' && <Spinner label="Loading…" />}
      {gate === 'off' && <p className="py-20 text-center text-muted">Page not found.</p>}
      {gate === 'login' && <Login onDone={() => setGate('in')} />}
    </div>
  );
}

function Login({ onDone }: { onDone(): void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminApi.login(username.trim(), password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in. Check the server is running.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mt-16 flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Party Games admin</h1>
        <p className="mt-1 text-muted">Log in to see open rooms and manage the server.</p>
      </div>
      <div className="rounded-3xl border border-line bg-panel p-5">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField
            label="Username"
            value={username}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            autoComplete="current-password"
            error={error}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
          <Button type="submit" block busy={busy} disabled={!username.trim() || !password}>
            Log in
          </Button>
        </form>
      </div>
    </main>
  );
}
