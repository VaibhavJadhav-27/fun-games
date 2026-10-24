import { Suspense, lazy } from 'react';
import { Route, Switch } from 'wouter';
import { Landing } from './screens/Landing';
import { RoomPage } from './screens/RoomPage';
import { ConnectionBanner } from './ui/ConnectionBanner';
import { Spinner } from './ui/Screen';
import { ServerBanner } from './ui/ServerBanner';
import { ThemeToggle } from './ui/ThemeToggle';

// Not linked from anywhere; loaded only when someone opens /admin.
const AdminPage = lazy(() => import('./admin/AdminPage').then((m) => ({ default: m.AdminPage })));

export function App() {
  return (
    <Switch>
      <Route path="/admin">
        <Suspense fallback={<Spinner label="Loading…" />}>
          <AdminPage />
        </Suspense>
      </Route>
      <Route>
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[env(safe-area-inset-bottom)]">
          <ConnectionBanner />
          <ServerBanner />
          <div className="flex justify-end pt-3">
            <ThemeToggle />
          </div>
          <Switch>
            <Route path="/r/:code">{(params) => <RoomPage rawCode={params.code} />}</Route>
            <Route>
              <Landing />
            </Route>
          </Switch>
        </div>
      </Route>
    </Switch>
  );
}
