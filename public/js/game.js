/* global io */
import { BALL_RADIUS, MIN_ENTRY_SPEED } from './constants.js';
import { FlingTracker } from './fling.js';
import { advance, clampSpeed, createBall, interpolationAlpha } from './physics.js';

const GRAB_RADIUS = BALL_RADIUS * 1.6; // a little forgiving for fingers
const EDGE_WIDTH = 0.035;
const PULSE_SECONDS = 0.6;
// Spawn just inside the seam so the receiver doesn't immediately re-detect an exit.
const SEAM_INSET = 0.001;

const roomCode = decodeURIComponent(location.pathname.split('/').pop() ?? '').toLowerCase();

const canvas = document.getElementById('court');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const shareButton = document.getElementById('share');
document.getElementById('room-code').textContent = roomCode;

const state = {
  connected: false,
  error: null,
  side: null,
  partnerConnected: false,
  ball: null,
  drag: null, // { pointerId, offsetX, offsetY } while the ball is held
  pulse: 0, // seconds left on the edge glow after a throw or catch
};

// World units: 1 = viewport height. world.width is therefore the aspect ratio.
const world = { width: 1, openEdge: null };
const clock = { accumulator: 0 };
const fling = new FlingTracker();
let pixelsPerUnit = 1;

const sharedEdge = () => (state.side === 'left' ? 'right' : 'left');

function updateOpenEdge() {
  world.openEdge = state.side && state.partnerConnected ? sharedEdge() : null;
}

// ---------------------------------------------------------------------------- layout

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  pixelsPerUnit = height;
  world.width = width / height;
  // Draw directly in world units; the transform handles both DPR and the unit scale.
  ctx.setTransform(dpr * pixelsPerUnit, 0, 0, dpr * pixelsPerUnit, 0, 0);

  const ball = state.ball;
  if (ball) {
    ball.x = Math.min(ball.x, world.width - BALL_RADIUS);
    ball.prevX = ball.x;
  }
}

window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------- ball lifecycle

function spawnCenter() {
  state.ball = createBall(world.width / 2, 0.5);
  clock.accumulator = 0;
}

function spawnFromSeam({ y, vx, vy }) {
  const inward = state.side === 'left' ? -1 : 1;
  const x = state.side === 'left' ? world.width - SEAM_INSET : SEAM_INSET;
  state.ball = createBall(x, y, inward * Math.max(Math.abs(vx), MIN_ENTRY_SPEED), vy);
  clock.accumulator = 0;
  state.pulse = PULSE_SECONDS;
  navigator.vibrate?.(20);
}

function throwBall() {
  const { y, vx, vy } = state.ball;
  socket.emit('throw', { y, vx, vy });
  state.ball = null;
  state.drag = null;
  state.pulse = PULSE_SECONDS;
  updateHud();
}

// ---------------------------------------------------------------------------- input

function toWorld(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / pixelsPerUnit,
    y: (event.clientY - rect.top) / pixelsPerUnit,
  };
}

canvas.addEventListener('pointerdown', (event) => {
  const ball = state.ball;
  if (!ball || state.drag) return;
  const p = toWorld(event);
  if (Math.hypot(p.x - ball.x, p.y - ball.y) > GRAB_RADIUS) return;

  canvas.setPointerCapture(event.pointerId);
  state.drag = { pointerId: event.pointerId, offsetX: ball.x - p.x, offsetY: ball.y - p.y };
  ball.vx = 0;
  ball.vy = 0;
  fling.reset();
  fling.add(ball.x, ball.y, event.timeStamp);
});

canvas.addEventListener('pointermove', (event) => {
  const { ball, drag } = state;
  if (!ball || !drag || event.pointerId !== drag.pointerId) return;

  // Coalesced events recover the samples the browser merged between frames, which matters
  // for fast flicks where a whole throw can happen in a couple of frames.
  const coalesced = event.getCoalescedEvents?.();
  for (const e of coalesced?.length ? coalesced : [event]) {
    const p = toWorld(e);
    fling.add(p.x + drag.offsetX, p.y + drag.offsetY, e.timeStamp);
  }

  // Track velocity from the raw pointer, but keep the ball itself on-screen while held.
  const p = toWorld(event);
  const r = BALL_RADIUS;
  ball.x = Math.min(world.width - r, Math.max(r, p.x + drag.offsetX));
  ball.y = Math.min(1 - r, Math.max(r, p.y + drag.offsetY));
  ball.prevX = ball.x;
  ball.prevY = ball.y;
});

function release(event) {
  const { ball, drag } = state;
  if (!drag || event.pointerId !== drag.pointerId) return;
  state.drag = null;
  if (!ball) return;
  const thrown = fling.velocity(event.timeStamp);
  const { vx, vy } = clampSpeed(thrown.vx, thrown.vy);
  ball.vx = vx;
  ball.vy = vy;
  clock.accumulator = 0;
}

canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// ---------------------------------------------------------------------------- rendering

function drawEdgeGlow() {
  if (!world.openEdge) return;
  const strength = 0.25 + 0.6 * (state.pulse / PULSE_SECONDS);
  const atRight = world.openEdge === 'right';
  const x0 = atRight ? world.width : 0;
  const x1 = atRight ? world.width - EDGE_WIDTH : EDGE_WIDTH;
  const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0, `rgba(255, 92, 92, ${strength})`);
  gradient.addColorStop(1, 'rgba(255, 92, 92, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(Math.min(x0, x1), 0, EDGE_WIDTH, 1);
}

function drawBall() {
  const ball = state.ball;
  if (!ball) return;
  const alpha = state.drag ? 1 : interpolationAlpha(clock);
  const x = ball.prevX + (ball.x - ball.prevX) * alpha;
  const y = ball.prevY + (ball.y - ball.prevY) * alpha;
  const r = BALL_RADIUS;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.15, y + r * 0.25, r, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();

  const shade = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  shade.addColorStop(0, '#ff8a80');
  shade.addColorStop(0.45, '#e53935');
  shade.addColorStop(1, '#8e1414');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(x, y, state.drag ? r * 1.06 : r, 0, Math.PI * 2);
  ctx.fill();
}

let lastFrame = performance.now();

function frame(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  state.pulse = Math.max(0, state.pulse - dt);

  if (state.ball && !state.drag && advance(state.ball, world, clock, dt) === 'exit') {
    throwBall();
  }

  ctx.clearRect(0, 0, world.width, 1);
  drawEdgeGlow();
  drawBall();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// ---------------------------------------------------------------------------- HUD

function updateHud() {
  let text;
  if (state.error) text = state.error;
  else if (!state.connected) text = 'Connecting…';
  else if (!state.partnerConnected) text = 'Waiting for a partner. Send them the invite link.';
  else if (state.ball) text = state.side === 'left' ? 'Throw it right →' : '← Throw it left';
  else text = 'Your partner has the ball.';

  statusEl.textContent = text;
  shareButton.hidden = Boolean(state.error) || state.partnerConnected;
}

shareButton.addEventListener('click', async () => {
  const url = location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'I Want The Ball', url });
      return;
    }
    await navigator.clipboard.writeText(url);
    shareButton.textContent = 'Copied!';
    setTimeout(() => (shareButton.textContent = 'Copy invite link'), 1500);
  } catch {
    // User dismissed the share sheet or clipboard access was denied; nothing to do.
  }
});

// ---------------------------------------------------------------------------- networking

const socket = io();

socket.on('connect', () => {
  socket.emit('join', { room: roomCode }, (res) => {
    if (!res.ok) {
      state.error =
        res.error === 'room-full'
          ? 'This room already has two players.'
          : 'That room code isn’t valid.';
      socket.disconnect(); // stop auto-reconnecting into a room we can't join
      updateHud();
      return;
    }
    state.connected = true;
    state.side = res.side;
    state.partnerConnected = res.partnerConnected;
    updateOpenEdge();
    if (res.hasBall) spawnCenter();
    updateHud();
  });
});

socket.on('disconnect', () => {
  // While we're offline the server hands the ball to our partner, so drop our copy; the join
  // ack after reconnecting tells us whether we hold it again.
  state.connected = false;
  state.partnerConnected = false;
  state.ball = null;
  state.drag = null;
  updateOpenEdge();
  updateHud();
});

socket.on('partner', ({ connected }) => {
  state.partnerConnected = connected;
  updateOpenEdge();
  updateHud();
});

socket.on('ball', (msg) => {
  if (msg.mode === 'center') spawnCenter();
  else spawnFromSeam(msg);
  updateHud();
});
