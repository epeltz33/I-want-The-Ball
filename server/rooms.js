import {
  BALL_RADIUS,
  MAX_SPEED,
  MIN_ENTRY_SPEED,
  ROOM_CODE_PATTERN,
} from '../public/js/constants.js';

const SIDES = ['left', 'right'];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Turn a client's throw payload into something safe to forward. Clients are untrusted, so
 * every number is clamped. The horizontal direction is forced to match the thrower's side
 * (the left player can only throw rightward), which also guarantees the ball actually moves
 * onto the receiver's screen instead of sitting on the seam.
 *
 * Returns null for payloads that can't be repaired (missing or non-finite numbers).
 */
export function sanitizeThrow(payload, side) {
  if (!payload || typeof payload !== 'object') return null;
  const { y, vx, vy } = payload;
  if (![y, vx, vy].every(Number.isFinite)) return null;

  const direction = side === 'left' ? 1 : -1;
  return {
    y: clamp(y, BALL_RADIUS, 1 - BALL_RADIUS),
    vx: direction * clamp(Math.abs(vx), MIN_ENTRY_SPEED, MAX_SPEED),
    vy: clamp(vy, -MAX_SPEED, MAX_SPEED),
  };
}

/**
 * Tracks rooms and, crucially, who holds the ball. The server is the single authority on
 * ownership: a throw is only accepted from the current holder, and ownership moves to the
 * receiver the instant the throw is accepted. That makes it impossible to end up with two
 * balls (both clients throwing at once) or zero (a throw lost mid-flight to a disconnect).
 *
 * Methods return the messages to send rather than sending them, so this stays testable
 * without sockets.
 */
export class RoomManager {
  constructor() {
    /** code -> { players: Map<playerId, side>, holder: playerId | null } */
    this.rooms = new Map();
    /** playerId -> code */
    this.playerRooms = new Map();
  }

  join(code, playerId) {
    if (typeof code !== 'string' || !ROOM_CODE_PATTERN.test(code)) {
      return { ok: false, error: 'invalid-room' };
    }
    if (this.playerRooms.has(playerId)) this.leave(playerId);

    let room = this.rooms.get(code);
    if (!room) {
      room = { players: new Map(), holder: null };
      this.rooms.set(code, room);
    }
    if (room.players.size >= SIDES.length) return { ok: false, error: 'room-full' };

    const taken = new Set(room.players.values());
    const side = SIDES.find((s) => !taken.has(s));
    const partnerId = this.#partnerOf(room, playerId);

    room.players.set(playerId, side);
    this.playerRooms.set(playerId, code);
    if (room.holder === null) room.holder = playerId;

    return {
      ok: true,
      side,
      hasBall: room.holder === playerId,
      partnerId,
    };
  }

  /**
   * Remove a player. If they were holding the ball (or it was in flight to them), it goes to
   * whoever is left so the ball is never lost.
   */
  leave(playerId) {
    const code = this.playerRooms.get(playerId);
    if (code === undefined) return null;
    const room = this.rooms.get(code);
    this.playerRooms.delete(playerId);
    room.players.delete(playerId);

    const remainingId = this.#partnerOf(room, playerId);
    if (remainingId === null) {
      this.rooms.delete(code);
      return { code, remainingId: null, ballReassigned: false };
    }

    const ballReassigned = room.holder === playerId;
    if (ballReassigned) room.holder = remainingId;
    return { code, remainingId, ballReassigned };
  }

  /**
   * Handle a throw from `playerId`. Possible outcomes:
   *  - { action: 'ignore' }                      not in a room, or not holding the ball
   *  - { action: 'pass', to, ball }              ball now belongs to the partner
   *  - { action: 'return', to, ball }            no partner to catch it; bounce it back
   *  - { action: 'reset', to }                   payload was garbage; respawn for the thrower
   */
  throwBall(playerId, payload) {
    const code = this.playerRooms.get(playerId);
    if (code === undefined) return { action: 'ignore' };
    const room = this.rooms.get(code);
    if (room.holder !== playerId) return { action: 'ignore' };

    const side = room.players.get(playerId);
    const ball = sanitizeThrow(payload, side);
    if (!ball) return { action: 'reset', to: playerId };

    const partnerId = this.#partnerOf(room, playerId);
    if (partnerId === null) {
      // The thrower saw an open edge but the partner left in the meantime. Send it back
      // through the same edge, reversed, rather than dropping it.
      return { action: 'return', to: playerId, ball: { ...ball, vx: -ball.vx } };
    }

    room.holder = partnerId;
    return { action: 'pass', to: partnerId, ball };
  }

  holderOf(code) {
    return this.rooms.get(code)?.holder ?? null;
  }

  #partnerOf(room, playerId) {
    for (const id of room.players.keys()) if (id !== playerId) return id;
    return null;
  }
}
