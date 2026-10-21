import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

/**
 * Build the HTTP + Socket.IO server without listening, so tests can start it on a random port.
 *
 * Wire protocol:
 *   client -> server  'join'    { room }            ack: { ok, side, hasBall, partnerConnected } | { ok: false, error }
 *   client -> server  'throw'   { y, vx, vy }
 *   server -> client  'partner' { connected }
 *   server -> client  'ball'    { mode: 'enter', y, vx, vy } | { mode: 'center' }
 */
export function createGameServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const rooms = new RoomManager();

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/r/:code', (_req, res) => res.sendFile('room.html', { root: publicDir }));
  app.use(express.static(publicDir));

  io.on('connection', (socket) => {
    socket.on('join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const result = rooms.join(payload?.room, socket.id);
      if (!result.ok) return ack(result);

      if (result.partnerId) io.to(result.partnerId).emit('partner', { connected: true });

      ack({
        ok: true,
        side: result.side,
        hasBall: result.hasBall,
        partnerConnected: result.partnerId !== null,
      });
    });

    socket.on('throw', (payload) => {
      const result = rooms.throwBall(socket.id, payload);
      switch (result.action) {
        case 'pass':
        case 'return':
          io.to(result.to).emit('ball', { mode: 'enter', ...result.ball });
          break;
        case 'reset':
          io.to(result.to).emit('ball', { mode: 'center' });
          break;
      }
    });

    socket.on('disconnect', () => {
      const result = rooms.leave(socket.id);
      if (!result?.remainingId) return;
      io.to(result.remainingId).emit('partner', { connected: false });
      if (result.ballReassigned) io.to(result.remainingId).emit('ball', { mode: 'center' });
    });
  });

  return { app, httpServer, io, rooms };
}
