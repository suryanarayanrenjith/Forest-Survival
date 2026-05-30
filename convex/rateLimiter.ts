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

  // Photo Mode upload throttle (keyed by userId). The hard 5-photo cap already
  // bounds total storage; this stops a delete→reupload loop from hammering the
  // storage API while still allowing a normal photoshoot session.
  photoUpload: { kind: "token bucket", rate: 15, period: HOUR, capacity: 6 },
});
