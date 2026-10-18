import { Route, Switch } from 'wouter';
import { Landing } from './screens/Landing';
import { RoomPage } from './screens/RoomPage';
import { ConnectionBanner } from './ui/ConnectionBanner';
import { ThemeToggle } from './ui/ThemeToggle';

export function App() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[env(safe-area-inset-bottom)]">
      <ConnectionBanner />
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
  );
}
