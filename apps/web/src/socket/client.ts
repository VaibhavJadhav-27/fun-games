import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@party/shared';
import { clearSession, updateSessionPlayer } from './session';
import { useStore } from './store';
import { syncClock } from './actions';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** The one socket for the app's lifetime. Same origin: Vite proxies it in dev. */
export const socket: AppSocket = io({ autoConnect: false });

export function startSocket(): void {
  socket.on('connect', () => {
    useStore.setState({
      connection: 'connected',
      everConnected: true,
      socketId: socket.id ?? null,
      boundSocketId: null,
    });
    void syncClock();
  });

  socket.on('disconnect', () => {
    useStore.setState({ connection: 'disconnected', socketId: null, boundSocketId: null });
  });

  socket.on('connect_error', () => {
    useStore.setState({ connection: 'disconnected' });
  });

  socket.on('room:state', (info) => {
    const { room } = useStore.getState();
    if (room && room.code === info.code && info.rev < room.rev) return;
    // A new game (or no game) means any old view is stale.
    const leftGame = info.status !== 'playing' || room?.status !== 'playing' || room.code !== info.code;
    useStore.setState(leftGame ? { room: info, view: null, viewRev: -1 } : { room: info });
  });

  socket.on('game:view', ({ rev, view }) => {
    const state = useStore.getState();
    if (state.view && rev < state.viewRev) return;
    useStore.setState({ view, viewRev: rev });
  });

  socket.on('session:updated', ({ playerId }) => {
    const { room } = useStore.getState();
    if (room) updateSessionPlayer(room.code, playerId);
    useStore.setState({ playerId, view: null, viewRev: -1 });
  });

  socket.on('session:ended', ({ reason }) => {
    const { room } = useStore.getState();
    if (room) clearSession(room.code);
    useStore.setState({
      ended: room ? { code: room.code, reason } : null,
      room: null,
      view: null,
      viewRev: -1,
      playerId: null,
      boundSocketId: null,
    });
  });

  socket.connect();
}
