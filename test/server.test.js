import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../server/app.js';

let server;
let url;
const clients = [];

before(async () => {
  server = createGameServer();
  server.httpServer.listen(0);
  await once(server.httpServer, 'listening');
  url = `http://localhost:${server.httpServer.address().port}`;
});

after(() => {
  for (const c of clients) c.disconnect();
  server.io.close();
});

function client() {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return socket;
}

const join = (socket, room) => socket.emitWithAck('join', { room });

test('serves the room page and health check', async () => {
  const page = await fetch(`${url}/r/abcd`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<canvas id="court"/);
  assert.deepEqual(await (await fetch(`${url}/healthz`)).json(), { ok: true });
});

test('two players pass the ball back and forth', async () => {
  const left = client();
  const right = client();

  const a = await join(left, 'pass1');
  assert.deepEqual(a, { ok: true, side: 'left', hasBall: true, partnerConnected: false });

  const partnerJoined = once(left, 'partner');
  const b = await join(right, 'pass1');
  assert.deepEqual(b, { ok: true, side: 'right', hasBall: false, partnerConnected: true });
  assert.deepEqual(await partnerJoined, [{ connected: true }]);

  const caught = once(right, 'ball');
  left.emit('throw', { y: 0.25, vx: 3, vy: -1 });
  assert.deepEqual(await caught, [{ mode: 'enter', y: 0.25, vx: 3, vy: -1 }]);

  const returned = once(left, 'ball');
  right.emit('throw', { y: 0.7, vx: -2, vy: 0 });
  assert.deepEqual(await returned, [{ mode: 'enter', y: 0.7, vx: -2, vy: 0 }]);
});

test('a third player is turned away', async () => {
  await join(client(), 'full1');
  await join(client(), 'full1');
  assert.deepEqual(await join(client(), 'full1'), { ok: false, error: 'room-full' });
});

test('if the holder disconnects, the partner gets the ball', async () => {
  const holder = client();
  const partner = client();
  await join(holder, 'drop1');
  await join(partner, 'drop1');

  const events = [];
  partner.on('partner', (m) => events.push(['partner', m]));
  const gotBall = once(partner, 'ball');
  holder.disconnect();

  assert.deepEqual(await gotBall, [{ mode: 'center' }]);
  assert.deepEqual(events, [['partner', { connected: false }]]);
});
