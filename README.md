# I Want The Ball

A real-time web app where two people share one red ball. Put two screens side by side, fling the
ball off the edge of yours, and it slides onto your partner's screen.

Built with HTML5 Canvas and vanilla JavaScript on the front end, and Node.js + Express +
Socket.IO on the back end.

## How to play

1. Open the site and click **Create a room**.
2. Send the invite link (or the room code) to your partner.
3. The first person in the room is on the **left** and starts with the ball. Grab it, fling it
   off the glowing right edge, and it appears on your partner's screen.

## How it works

### The ball is handed off, not streamed

The obvious approach, having the server simulate the ball and broadcast its position every frame,
makes every frame arrive 50–150ms late, which looks choppy. Instead, **whoever holds the ball
simulates it locally**, so dragging and bouncing feel instant. When the ball crosses the shared
edge, that client sends a single `throw` event with the exit position and velocity, and the
receiving client continues the motion from its side.

Network latency only shows up as a brief gap while the ball is "between screens," which reads as
travel time rather than lag.

### The server is the authority on who holds the ball

`server/rooms.js` tracks a `holder` per room. A throw is only accepted from the current holder,
and ownership moves to the receiver the moment it's accepted. That rules out two balls (both
players throwing at once, or a duplicated packet) and zero balls (a disconnect mid-flight):

- If the holder disconnects, the ball respawns for the remaining player.
- If the ball is in flight to someone who disconnects, it goes back to the thrower.
- If a throw arrives after the partner left, it bounces back through the same edge.

Every throw payload is clamped and validated server-side; clients are never trusted.

### Screen-size independent units

All physics uses **world units where 1 = the viewport's height**. A throw's `y` is therefore a
fraction of screen height and its velocity is in screen-heights per second, so a ball leaving
halfway up a laptop arrives halfway up a phone at the same apparent speed.

### Frame-rate independent physics

Physics runs on a fixed 120Hz timestep with an accumulator (`public/js/physics.js`), and rendering
interpolates between steps. The ball moves identically on 60Hz and 144Hz displays, which matters
because both screens have to agree on what a velocity means.

### Throwing

`public/js/fling.js` estimates release velocity from only the last 100ms of pointer movement, so a
quick flick throws hard and a drag that stops before release doesn't throw at all. Pointer Events
handle mouse, touch, and pen with one code path.

## Wire protocol

| Direction       | Event     | Payload                                                                              |
| --------------- | --------- | ------------------------------------------------------------------------------------ |
| client → server | `join`    | `{ room }` → ack `{ ok, side, hasBall, partnerConnected }` or `{ ok: false, error }` |
| client → server | `throw`   | `{ y, vx, vy }`                                                                      |
| server → client | `partner` | `{ connected }`                                                                      |
| server → client | `ball`    | `{ mode: 'enter', y, vx, vy }` or `{ mode: 'center' }`                               |

## Running locally

Requires Node.js 20+ (22 recommended, see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:3000, restarts on server changes
```

Open two browser windows side by side on the same room URL to play against yourself.

```bash
npm test           # unit + Socket.IO integration tests (node:test)
npm run lint
npm run format:check
```

## Deploying to Render

The repo includes a `render.yaml` blueprint. In the Render dashboard choose **New → Blueprint**,
point it at this repository, and it creates a free web service with a `/healthz` health check.
Render supports WebSockets on web services with no extra configuration.

Free Render instances sleep after about 15 minutes of inactivity, so the first visit after a
break takes 30–60 seconds while the server wakes up. Room state lives in memory, which is fine for
a single instance; running several instances would need the Socket.IO Redis adapter.

## Project structure

```
public/
  index.html        landing page (create or join a room)
  room.html         game page
  css/style.css
  js/constants.js   tuning values shared by the browser and the server
  js/physics.js     fixed-timestep simulation (no DOM, unit tested)
  js/fling.js       pointer velocity estimation
  js/game.js        canvas rendering, input, and networking
  js/landing.js
server/
  app.js            Express + Socket.IO wiring
  rooms.js          room membership and ball ownership (no sockets, unit tested)
  index.js          entry point
test/               node:test suites
```

## Ideas for later

- Rally counter and catch streaks
- Sound effects on throw and catch
- Configurable layout (any edge, or more than two players in a ring)
- Spin and curve on throws
