/**
 * Turn a thrown Convex error into something a player can actually read.
 *
 * Convex delivers server failures to the browser in two very different shapes:
 *
 *  1. `ConvexError` — the intentional, user-facing kind. Its payload survives
 *     the trip and arrives on `error.data`. This is what every validation
 *     failure in `convex/` throws, and it's what we want to show verbatim.
 *
 *  2. Anything else (a bug, a library throwing a plain `Error`) — the message is
 *     REDACTED on production deployments and `error.message` is left as the raw
 *     envelope, e.g.
 *
 *         [CONVEX M(playerStats:unlockSkill)] [Request ID: 9f2…] Server Error
 *
 * Showing that envelope to a player is the bug this module exists to prevent.
 * `extractConvexError` returns the ConvexError payload when there is one, and
 * otherwise falls back to the caller's own wording — never the envelope.
 *
 * The regexes below deliberately match the envelope only, so a genuine
 * client-side `Error` (network failure, aborted request) still shows its own
 * message, which is useful and safe.
 */

/** `[CONVEX M(module:fn)] [Request ID: …] ` prefix Convex prepends to messages. */
const CONVEX_ENVELOPE = /^\s*\[CONVEX [^\]]*\]\s*(?:\[Request ID:[^\]]*\]\s*)?/;
/** What's left once the envelope is stripped from a redacted server failure.
 *  Production sends exactly "Server Error"; dev deployments append the real
 *  cause ("Server Error Uncaught Error: …"), so match the prefix — both are
 *  server-side bodies that must never be shown in place of the fallback. */
const REDACTED_BODY = /^(server error\b[\s\S]*|uncaught [\s\S]*)$/i;

/**
 * @param error    the caught value
 * @param fallback shown when the failure carries no player-facing message
 */
export function extractConvexError(error: unknown, fallback: string): string {
  // 1. A ConvexError's payload — the intended user-facing path.
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === 'string' && data.trim()) return data;
    // Structured payloads: accept a `message` field if one was thrown.
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }

  // 2. A plain Error — usable ONLY if it isn't a redacted server envelope.
  if (error instanceof Error && error.message) {
    const stripped = error.message.replace(CONVEX_ENVELOPE, '').trim();
    // Nothing but the envelope, or an explicitly redacted body → the real cause
    // is server-side and deliberately hidden. Show the caller's wording.
    if (!stripped || REDACTED_BODY.test(stripped)) return fallback;
    // A message that still carries the envelope marker is a server throw we
    // can't safely surface either.
    if (stripped.includes('[CONVEX')) return fallback;
    return stripped;
  }

  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}
