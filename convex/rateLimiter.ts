import { RateLimiter, HOUR, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

/**
 * Application-layer rate limits backed by the official Convex rate-limiter
 * component (transactional + type-safe). Keyed limits use a `key` argument
 * (device fingerprint / username); the unkeyed global limit guards against
 * sign-up floods on top of the hard 100-account cap.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Per-device signup throttle. Token bucket allows a small burst then refills
  // slowly, so a single device can't spin up accounts in a loop.
  signupPerDevice: { kind: "token bucket", rate: 3, period: HOUR, capacity: 3 },

  // Global flood protection across all devices.
  signupGlobal: { kind: "fixed window", rate: 20, period: HOUR },

  // ── Progression write limits (keyed by userId) ──────────────────────────
  // Stop scripted farming of stats/skill points. Capacities allow a normal
  // burst (e.g. several quick restarts) but throttle automated loops. A real
  // solo run takes minutes, so 20/hour is generous for legit play.
  soloRun: { kind: "token bucket", rate: 20, period: HOUR, capacity: 5 },
  mpResult: { kind: "token bucket", rate: 30, period: HOUR, capacity: 6 },
  achievementSync: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 12 },

  // A normal run flushes daily challenge progress at most once every few
  // seconds. This leaves that path comfortably below the ceiling while
  // preventing a scripted client from hammering the progress mutation.
  dailyProgress: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },

  // Claiming the daily reward is a once-per-day action; this only exists to stop
  // a scripted client from hammering the skill-point grant path.
  dailyClaim: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },

  // Photo Mode upload throttle (keyed by userId). The hard 5-photo cap already
  // bounds total storage; this stops a delete→reupload loop from hammering the
  // storage API while still allowing a normal photoshoot session.
  photoUpload: { kind: "token bucket", rate: 15, period: HOUR, capacity: 6 },

  // ── Quota-protection limits (keyed by userId) ───────────────────────────
  // Every mutation below is a DB write reachable from the browser console, so
  // an unthrottled one can be looped to burn the Convex free plan's function /
  // bandwidth budget even though the VALUES it writes are already clamped.
  // Ceilings are set far above any human interaction rate.

  // Per-weapon mastery XP. A real run grants a handful of these per minute
  // (batched client-side), and only 20 grants at the per-call cap can max a
  // weapon out — so 120/min is orders of magnitude above legitimate play.
  masteryXp: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60 },

  // Profile / preference writes (avatar, privacy, leaderboard opt-in, equipped
  // title, display name). These are discrete UI clicks: a burst of 30 covers
  // rapid fiddling, and 60/min is unreachable by hand but stops a scripted
  // write loop dead.
  profileWrite: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },

  // The settings blob has its OWN, roomier ceiling because it is debounced at
  // 1200ms rather than click-driven: a player dragging sliders continuously can
  // legitimately emit ~50 writes/minute, so this sits at 2.4× that worst case.
  settingsSync: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 40 },

  // Skill-tree unlocks. Spending is already bounded by the point economy, but
  // a rejected unlock (not enough points) still costs a read; cap the loop.
  skillUnlock: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
});
