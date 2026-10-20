// Estimates release velocity from recent pointer movement. Using only the last ~100ms means a
// slow drag followed by a quick flick throws hard, and a drag that stops before release doesn't.

const WINDOW_MS = 100;
const MIN_SPAN_MS = 10;

export class FlingTracker {
  constructor() {
    this.samples = [];
  }

  reset() {
    this.samples = [];
  }

  add(x, y, t) {
    this.samples.push({ x, y, t });
    const cutoff = t - WINDOW_MS;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
  }

  /** Velocity in units per second as of time `now`. */
  velocity(now) {
    const recent = this.samples.filter((s) => s.t >= now - WINDOW_MS);
    if (recent.length < 2) return { vx: 0, vy: 0 };
    const first = recent[0];
    const last = recent[recent.length - 1];
    const spanMs = last.t - first.t;
    if (spanMs < MIN_SPAN_MS) return { vx: 0, vy: 0 };
    return {
      vx: ((last.x - first.x) / spanMs) * 1000,
      vy: ((last.y - first.y) / spanMs) * 1000,
    };
  }
}
