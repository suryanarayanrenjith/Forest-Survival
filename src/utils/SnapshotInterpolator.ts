/**
 * SnapshotInterpolator
 * ====================
 * A tiny, allocation-light timestamped transform buffer used to render
 * networked entities (remote players, host-authoritative enemies) with
 * smooth, constant-velocity motion — instead of the "race to the packet
 * then freeze" stutter you get from chasing the newest snapshot every
 * frame ("lerp-to-latest").
 *
 * Why the old approach stuttered
 * ------------------------------
 * Exponentially easing toward the *latest* received position converges in
 * ~50ms, but packets only arrive every ~66–100ms. So the entity sprints to
 * the target, sits still until the next packet lands, then sprints again —
 * the classic "moving in frames" look that makes multiplayer feel laggy
 * even when the framerate is fine.
 *
 * The fix — snapshot interpolation (render the past)
 * --------------------------------------------------
 * Standard technique from Valve's Source engine / Gabriel Gambetta's
 * "Fast-Paced Multiplayer": keep the last few authoritative samples with
 * the wall-clock time they arrived, then play the entity back at
 * `renderTime = now - delay`, interpolating between the two samples that
 * bracket that instant. As long as `delay` covers the gap between packets
 * (plus jitter), the rendered motion is perfectly smooth and at a steady
 * speed no matter when packets actually land.
 *
 * On stream starvation (packet loss) we briefly extrapolate from the last
 * segment, then hold — so a dropped packet glides to a stop rather than
 * snapping. Yaw is interpolated along the shortest arc.
 */

/** Output slot filled by {@link SnapshotInterpolator.sample}. Reuse one instance to stay allocation-free. */
export interface TransformSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const TWO_PI = Math.PI * 2;

/** Shortest-arc angular interpolation (radians). */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return a + d * t;
}

export class SnapshotInterpolator {
  private readonly cap: number;
  private readonly maxExtrapMs: number;

  // Parallel arrays (oldest → newest). Kept small (<= cap), so the linear
  // bracket search is cheaper than the bookkeeping a ring buffer would add.
  private readonly times: number[] = [];
  private readonly xs: number[] = [];
  private readonly ys: number[] = [];
  private readonly zs: number[] = [];
  private readonly yaws: number[] = [];

  /**
   * @param capacity         Max samples retained (≈1–1.5s of history is plenty).
   * @param maxExtrapolationMs  How far past the newest sample we extrapolate
   *                            before holding (covers a dropped packet or two).
   */
  constructor(opts: { capacity?: number; maxExtrapolationMs?: number } = {}) {
    this.cap = Math.max(2, opts.capacity ?? 16);
    this.maxExtrapMs = opts.maxExtrapolationMs ?? 130;
  }

  /** Append an authoritative sample stamped with the time it was received. */
  push(time: number, x: number, y: number, z: number, yaw: number): void {
    const n = this.times.length;
    // Drop stale / out-of-order packets — they would corrupt the timeline.
    if (n > 0 && time <= this.times[n - 1]) return;
    this.times.push(time);
    this.xs.push(x);
    this.ys.push(y);
    this.zs.push(z);
    this.yaws.push(yaw);
    if (this.times.length > this.cap) {
      this.times.shift();
      this.xs.shift();
      this.ys.shift();
      this.zs.shift();
      this.yaws.shift();
    }
  }

  /**
   * Resolve the entity transform at `renderTime` (= now − interpolation
   * delay) into `out`. Returns false only when the buffer is empty.
   */
  sample(renderTime: number, out: TransformSample): boolean {
    const n = this.times.length;
    if (n === 0) return false;

    // Only one sample, or render time predates our history → hold oldest.
    if (n === 1 || renderTime <= this.times[0]) {
      out.x = this.xs[0];
      out.y = this.ys[0];
      out.z = this.zs[0];
      out.yaw = this.yaws[0];
      return true;
    }

    const last = n - 1;

    // Render time is ahead of the newest sample → the stream has starved.
    // Extrapolate along the last segment for a short window, then hold.
    if (renderTime >= this.times[last]) {
      const t0 = this.times[last - 1];
      const t1 = this.times[last];
      const seg = t1 - t0;
      const over = renderTime - t1;
      if (seg > 0 && over <= this.maxExtrapMs) {
        const k = over / seg;
        out.x = this.xs[last] + (this.xs[last] - this.xs[last - 1]) * k;
        out.z = this.zs[last] + (this.zs[last] - this.zs[last - 1]) * k;
        out.y = this.ys[last]; // vertical is computed locally — never extrapolate
        out.yaw = this.yaws[last]; // hold facing rather than risk over-spinning
      } else {
        out.x = this.xs[last];
        out.y = this.ys[last];
        out.z = this.zs[last];
        out.yaw = this.yaws[last];
      }
      return true;
    }

    // Common case — find the segment [i-1, i] bracketing renderTime and lerp.
    for (let i = last; i > 0; i--) {
      const t0 = this.times[i - 1];
      const t1 = this.times[i];
      if (t0 <= renderTime && renderTime <= t1) {
        const a = t1 > t0 ? (renderTime - t0) / (t1 - t0) : 0;
        out.x = this.xs[i - 1] + (this.xs[i] - this.xs[i - 1]) * a;
        out.y = this.ys[i - 1] + (this.ys[i] - this.ys[i - 1]) * a;
        out.z = this.zs[i - 1] + (this.zs[i] - this.zs[i - 1]) * a;
        out.yaw = lerpAngle(this.yaws[i - 1], this.yaws[i], a);
        return true;
      }
    }

    // Unreachable in practice — defensively hold the newest sample.
    out.x = this.xs[last];
    out.y = this.ys[last];
    out.z = this.zs[last];
    out.yaw = this.yaws[last];
    return true;
  }

  /** Forget all history (e.g. on respawn / teleport). */
  reset(): void {
    this.times.length = 0;
    this.xs.length = 0;
    this.ys.length = 0;
    this.zs.length = 0;
    this.yaws.length = 0;
  }
}
