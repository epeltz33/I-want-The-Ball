import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALL_RADIUS, FIXED_DT, MAX_SPEED } from '../public/js/constants.js';
import { advance, clampSpeed, createBall, step } from '../public/js/physics.js';
import { FlingTracker } from '../public/js/fling.js';

const closedWorld = { width: 1.6, openEdge: null };

function simulate(frameHz, seconds) {
  const ball = createBall(0.8, 0.5, 2.3, -1.7);
  const clock = { accumulator: 0 };
  const frames = Math.round(frameHz * seconds);
  for (let i = 0; i < frames; i++) advance(ball, closedWorld, clock, 1 / frameHz);
  return ball;
}

test('ball moves the same distance on 60Hz and 144Hz displays', () => {
  const at60 = simulate(60, 2);
  const at144 = simulate(144, 2);
  // Both run the same number of fixed steps; allow for float noise in the accumulator.
  assert.ok(Math.abs(at60.x - at144.x) < 0.02, `x: ${at60.x} vs ${at144.x}`);
  assert.ok(Math.abs(at60.y - at144.y) < 0.02, `y: ${at60.y} vs ${at144.y}`);
});

test('friction slows the ball but it keeps gliding', () => {
  const ball = createBall(0.8, 0.5, 1, 0);
  step(ball, { width: 100, openEdge: null }, 1);
  assert.ok(ball.vx < 1 && ball.vx > 0.5, `vx after 1s: ${ball.vx}`);
});

test('bounces off a closed edge and loses some speed', () => {
  const ball = createBall(1.6 - BALL_RADIUS - 0.001, 0.5, 2, 0);
  step(ball, closedWorld, FIXED_DT);
  assert.ok(ball.vx < 0, 'reversed direction');
  assert.ok(Math.abs(ball.vx) < 2, 'lost energy');
  assert.ok(ball.x + BALL_RADIUS <= closedWorld.width);
});

test('bounces off top and bottom even when a side edge is open', () => {
  const ball = createBall(0.8, BALL_RADIUS + 0.001, 0, -2);
  step(ball, { width: 1.6, openEdge: 'right' }, FIXED_DT);
  assert.ok(ball.vy > 0);
});

test('reports exit once the center crosses the open edge', () => {
  const world = { width: 1.6, openEdge: 'right' };
  const ball = createBall(1.6 - 0.01, 0.5, 3, 0);
  let result = null;
  for (let i = 0; i < 10 && !result; i++) result = step(ball, world, FIXED_DT);
  assert.equal(result, 'exit');
});

test('the closed side still bounces when the other side is open', () => {
  const ball = createBall(BALL_RADIUS + 0.001, 0.5, -2, 0);
  const result = step(ball, { width: 1.6, openEdge: 'right' }, FIXED_DT);
  assert.equal(result, null);
  assert.ok(ball.vx > 0);
});

test('a huge frame (backgrounded tab) is capped instead of teleporting the ball', () => {
  const ball = createBall(0.8, 0.5, 0.5, 0);
  advance(ball, { width: 100, openEdge: null }, { accumulator: 0 }, 30);
  assert.ok(ball.x < 0.8 + 0.5 * 0.11);
});

test('clampSpeed caps magnitude and keeps direction', () => {
  const { vx, vy } = clampSpeed(30, 40);
  assert.ok(Math.abs(Math.hypot(vx, vy) - MAX_SPEED) < 1e-9);
  assert.ok(Math.abs(vx / vy - 0.75) < 1e-9);
});

test('fling velocity uses only the last 100ms of movement', () => {
  const fling = new FlingTracker();
  fling.add(0, 0, 0);
  fling.add(0.1, 0, 500); // slow drag
  fling.add(0.4, 0, 550); // quick flick: 0.3 units in 50ms
  const { vx } = fling.velocity(550);
  assert.ok(Math.abs(vx - 6) < 1e-9, `vx: ${vx}`);
});

test('fling velocity is zero if the pointer stopped before release', () => {
  const fling = new FlingTracker();
  fling.add(0, 0, 0);
  fling.add(0.5, 0, 50);
  assert.deepEqual(fling.velocity(400), { vx: 0, vy: 0 });
});
