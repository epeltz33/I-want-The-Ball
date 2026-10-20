import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SPEED, MIN_ENTRY_SPEED } from '../public/js/constants.js';
import { RoomManager, sanitizeThrow } from '../server/rooms.js';

const goodThrow = { y: 0.5, vx: 2, vy: 0.3 };

test('first player gets the left side and the ball; second gets the right', () => {
  const rooms = new RoomManager();
  assert.deepEqual(rooms.join('abcd', 'a'), {
    ok: true,
    side: 'left',
    hasBall: true,
    partnerId: null,
  });
  assert.deepEqual(rooms.join('abcd', 'b'), {
    ok: true,
    side: 'right',
    hasBall: false,
    partnerId: 'a',
  });
});

test('rejects a third player and invalid codes', () => {
  const rooms = new RoomManager();
  rooms.join('abcd', 'a');
  rooms.join('abcd', 'b');
  assert.deepEqual(rooms.join('abcd', 'c'), { ok: false, error: 'room-full' });
  assert.deepEqual(rooms.join('../etc', 'd'), { ok: false, error: 'invalid-room' });
  assert.deepEqual(rooms.join(undefined, 'd'), { ok: false, error: 'invalid-room' });
});

test('a throw moves ownership to the partner', () => {
  const rooms = new RoomManager();
  rooms.join('abcd', 'a');
  rooms.join('abcd', 'b');
  const result = rooms.throwBall('a', goodThrow);
  assert.equal(result.action, 'pass');
  assert.equal(result.to, 'b');
  assert.equal(rooms.holderOf('abcd'), 'b');
});

test('only the holder can throw, so the ball cannot be duplicated', () => {
  const rooms = new RoomManager();
  rooms.join('abcd', 'a');
  rooms.join('abcd', 'b');
  assert.deepEqual(rooms.throwBall('b', { ...goodThrow, vx: -2 }), { action: 'ignore' });
  rooms.throwBall('a', goodThrow);
  // A second throw from 'a' (e.g. a duplicated packet) is ignored.
  assert.deepEqual(rooms.throwBall('a', goodThrow), { action: 'ignore' });
});

test('a throw with no partner bounces back through the same edge', () => {
  const rooms = new RoomManager();
  rooms.join('abcd', 'a');
  const result = rooms.throwBall('a', goodThrow);
  assert.equal(result.action, 'return');
  assert.equal(result.to, 'a');
  assert.ok(result.ball.vx < 0);
  assert.equal(rooms.holderOf('abcd'), 'a');
});

test('a garbage payload respawns the ball for the thrower instead of losing it', () => {
  const rooms = new RoomManager();
  rooms.join('abcd', 'a');
  rooms.join('abcd', 'b');
  assert.deepEqual(rooms.throwBall('a', { y: 'nope' }), { action: 'reset', to: 'a' });
  assert.equal(rooms.holderOf('abcd'), 'a');
});

test('when the holder leaves, the ball goes to the remaining player', () => {
  const rooms = new RoomManager();
  rooms.join('abcd', 'a');
  rooms.join('abcd', 'b');
  assert.deepEqual(rooms.leave('a'), { code: 'abcd', remainingId: 'b', ballReassigned: true });
  assert.equal(rooms.holderOf('abcd'), 'b');
});

test('a ball in flight to a player who leaves goes back to the thrower', () => {
  const rooms = new RoomManager();
  rooms.join('abcd', 'a');
  rooms.join('abcd', 'b');
  rooms.throwBall('a', goodThrow); // now owned by b
  assert.equal(rooms.leave('b').ballReassigned, true);
  assert.equal(rooms.holderOf('abcd'), 'a');
});

test('a new player fills the vacated side', () => {
  const rooms = new RoomManager();
  rooms.join('abcd', 'a');
  rooms.join('abcd', 'b');
  rooms.leave('a');
  assert.equal(rooms.join('abcd', 'c').side, 'left');
});

test('empty rooms are deleted', () => {
  const rooms = new RoomManager();
  rooms.join('abcd', 'a');
  rooms.leave('a');
  assert.equal(rooms.rooms.size, 0);
});

test('sanitizeThrow clamps values and forces direction', () => {
  const left = sanitizeThrow({ y: 5, vx: -100, vy: -100 }, 'left');
  assert.ok(left.y < 1);
  assert.equal(left.vx, MAX_SPEED);
  assert.equal(left.vy, -MAX_SPEED);

  const right = sanitizeThrow({ y: 0.5, vx: 0, vy: 0 }, 'right');
  assert.equal(right.vx, -MIN_ENTRY_SPEED);

  assert.equal(sanitizeThrow({ y: 0.5, vx: Infinity, vy: 0 }, 'left'), null);
  assert.equal(sanitizeThrow(null, 'left'), null);
});
