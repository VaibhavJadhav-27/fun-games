import { useEffect, useState } from 'react';
import { isRoomCode, normalizeRoomCode, type SessionEndReason } from '@party/shared';
import { resumeRoom } from '../socket/actions';
import { loadSession } from '../socket/session';
import { useStore } from '../socket/store';
import { MessageScreen, Spinner } from '../ui/Screen';
import { JoinForm } from './JoinForm';
import { Lobby } from './Lobby';
import { Waiting } from './Waiting';

const ENDED_COPY: Record<SessionEndReason, { title: string; body: string }> = {
  kicked: { title: 'You were removed', body: 'The host removed you from this room.' },
  closed: { title: 'Room closed', body: 'The host closed this room. Thanks for playing!' },
  expired: { title: 'Room expired', body: 'This room ended after being inactive.' },
  replaced: { title: 'Opened elsewhere', body: 'This seat is now open in another tab or device.' },
};

export function RoomPage({ rawCode }: { rawCode: string }) {
  const code = normalizeRoomCode(rawCode);
  const valid = isRoomCode(code);
  const connection = useStore((s) => s.connection);
  const socketId = useStore((s) => s.socketId);
  const boundSocketId = useStore((s) => s.boundSocketId);
  const room = useStore((s) => s.room);
  const playerId = useStore((s) => s.playerId);
  const ended = useStore((s) => s.ended);
  const [resumeFailed, setResumeFailed] = useState(false);
  const hasSession = valid && loadSession(code) !== null;

  // (Re)bind this socket to our stored seat on every new connection.
  useEffect(() => {
    if (!hasSession || connection !== 'connected' || socketId === null) return;
    if (boundSocketId === socketId) return;
    let cancelled = false;
    void resumeRoom(code).then((res) => {
      if (!cancelled && res && !res.ok && res.error.code === 'SESSION_INVALID') setResumeFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hasSession, code, connection, socketId, boundSocketId]);

  if (!valid) {
    return <MessageScreen title="Invalid room code" body="Room codes are 4 letters, like ABCD." />;
  }

  if (ended?.code === code) {
    const copy = ENDED_COPY[ended.reason];
    return <MessageScreen title={copy.title} body={copy.body} />;
  }

  if (room?.code === code && playerId) {
    const me = room.members.find((m) => m.id === playerId);
    if (me?.seat === 'waiting' && room.status !== 'lobby') return <Waiting room={room} me={playerId} />;
    return <Lobby room={room} me={playerId} />;
  }

  if (!hasSession || resumeFailed) return <JoinForm code={code} />;

  return <Spinner label={connection === 'connected' ? 'Rejoining your seat…' : 'Connecting…'} />;
}
