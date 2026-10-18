import { GAME_META, type RoomInfo } from '@party/shared';
import { Card } from '../ui/Card';
import { PlayerList } from '../ui/PlayerList';

/** Shown to members who joined while a game was already running. */
export function Waiting({ room, me }: { room: RoomInfo; me: string }) {
  return (
    <main className="flex flex-1 flex-col gap-4 py-8">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold">{GAME_META[room.gameId].name} is in progress</h1>
        <p className="text-muted">You're in the room. You'll join the next game.</p>
      </header>
      <Card title="Players">
        <PlayerList members={room.members} me={me} />
      </Card>
    </main>
  );
}
