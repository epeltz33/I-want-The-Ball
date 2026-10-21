import {
  BALL_RADIUS,
  FIXED_DT,
  FRICTION,
  MAX_SPEED,
  RESTITUTION,
  REST_SPEED,
} from './constants.js';

export function createBall(x, y, vx = 0, vy = 0) {
  return { x, y, vx, vy, prevX: x, prevY: y };
}

export function clampSpeed(vx, vy, max = MAX_SPEED) {
  const speed = Math.hypot(vx, vy);
  if (speed <= max) return { vx, vy };
  const scale = max / speed;
  return { vx: vx * scale, vy: vy * scale };
}

/**
 * Advance the ball by one fixed timestep.
 *
 * `world.width` is the viewport's aspect ratio (height is always 1). `world.openEdge` is the
 * side that leads to the partner's screen ('left' | 'right'), or null when playing alone, in
 * which case every edge is a wall.
 *
 * Returns 'exit' once the ball's center crosses the open edge, otherwise null.
 */
export function step(ball, world, dt = FIXED_DT) {
  const r = BALL_RADIUS;
  ball.prevX = ball.x;
  ball.prevY = ball.y;

  const damping = Math.exp(-FRICTION * dt);
  ball.vx *= damping;
  ball.vy *= damping;
  if (Math.hypot(ball.vx, ball.vy) < REST_SPEED) {
    ball.vx = 0;
    ball.vy = 0;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.y - r < 0) {
    ball.y = r;
    ball.vy = Math.abs(ball.vy) * RESTITUTION;
  } else if (ball.y + r > 1) {
    ball.y = 1 - r;
    ball.vy = -Math.abs(ball.vy) * RESTITUTION;
  }

  // The open edge has no wall: the ball slides partly off-screen and is handed off once its
  // center crosses, so the sender sees it leave and the receiver sees it arrive half-visible.
  if (world.openEdge === 'left') {
    if (ball.x < 0) return 'exit';
  } else if (ball.x - r < 0) {
    ball.x = r;
    ball.vx = Math.abs(ball.vx) * RESTITUTION;
  }

  if (world.openEdge === 'right') {
    if (ball.x > world.width) return 'exit';
  } else if (ball.x + r > world.width) {
    ball.x = world.width - r;
    ball.vx = -Math.abs(ball.vx) * RESTITUTION;
  }

  return null;
}

/**
 * Consume a variable-length frame time in fixed steps. The leftover time is kept in
 * `clock.accumulator` so it carries into the next frame, which is what keeps the simulation
 * identical on 60Hz and 144Hz displays.
 *
 * Returns 'exit' as soon as any step reports one (remaining time is dropped, since the ball
 * now belongs to the other screen).
 */
export function advance(ball, world, clock, frameDt) {
  // A backgrounded tab can hand us a multi-second frame; don't simulate it all at once.
  clock.accumulator += Math.min(frameDt, 0.1);
  while (clock.accumulator >= FIXED_DT) {
    clock.accumulator -= FIXED_DT;
    if (step(ball, world, FIXED_DT) === 'exit') {
      clock.accumulator = 0;
      return 'exit';
    }
  }
  return null;
}

/** How far between the last two physics steps the current frame is, for smooth rendering. */
export function interpolationAlpha(clock) {
  return clock.accumulator / FIXED_DT;
}
