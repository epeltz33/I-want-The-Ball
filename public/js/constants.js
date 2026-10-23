// Shared by the browser and the server, so both agree on what a valid throw looks like.
//
// All distances are in "world units" where 1 unit = the viewport's height. That makes a
// throw's y position and velocity meaningful on any screen size: a ball leaving halfway up
// a phone arrives halfway up a monitor, travelling the same number of screen-heights/sec.

export const BALL_RADIUS = 0.15;

// Exponential velocity damping per second. Low = air hockey glide.
export const FRICTION = 0.35;

// Fraction of speed kept after bouncing off a wall.
export const RESTITUTION = 0.85;

// Speed limits in screen-heights per second.
export const MAX_SPEED = 6;
export const MIN_ENTRY_SPEED = 0.4;

// Below this the ball is considered at rest.
export const REST_SPEED = 0.01;

// Physics runs at a fixed rate regardless of display refresh rate.
export const FIXED_DT = 1 / 120;

export const ROOM_CODE_PATTERN = /^[a-z0-9]{4,12}$/;
