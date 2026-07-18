/**
 * Translate @convex-dev/auth failures into player-facing `ConvexError`s.
 *
 * WHY THIS EXISTS — the "Server Error" problem:
 * Convex only forwards an error's message to the browser when it is a
 * `ConvexError`. Anything else is REDACTED on a production deployment and the
 * client receives the opaque envelope:
 *
 *     [CONVEX A(auth:signIn)] [Request ID: 9f2…] Server Error
 *
 * `@convex-dev/auth` signals every credential failure by throwing a PLAIN
 * `Error` whose message is a bare sentinel string — `retrieveAccount` does
 * `throw new Error("InvalidSecret")`, `createAccount` does
 * `throw new Error("Account bob already exists")`. So a simple wrong password
 * surfaced to players as that unreadable "Server Error" blob instead of
 * "Incorrect username or password."
 *
 * Every call into the auth library must therefore be wrapped so its sentinel is
 * mapped to a `ConvexError` carrying a real message. `authFailureMessage`
 * returns that message, or `null` when the throw is genuinely unexpected (a bug,
 * a DB fault) — those SHOULD stay redacted rather than leak internals, and the
 * caller re-throws them untouched so they still reach the Convex logs.
 */

/** Sentinel strings thrown by the auth library's credential mutations. */
const INVALID_CREDENTIALS = /^(InvalidAccountId|InvalidSecret)$/;
const TOO_MANY_ATTEMPTS = /TooManyFailedAttempts/;
const ACCOUNT_EXISTS = /already exists/i;

export const MSG_INVALID_CREDENTIALS = "Incorrect username or password.";
export const MSG_TOO_MANY_ATTEMPTS =
  "Too many failed attempts. Please wait an hour before trying again.";
export const MSG_USERNAME_TAKEN = "Choose another username.";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Map a thrown auth-library error to a player-facing message.
 *
 * @param onInvalidCredentials message to use for a bad id/secret. Callers phrase
 *   this for their own flow ("Incorrect username or password." at sign-in vs.
 *   "Current password is incorrect." when re-authenticating).
 * @returns the message, or `null` when the error is not a known auth failure.
 */
export function authFailureMessage(
  error: unknown,
  onInvalidCredentials: string = MSG_INVALID_CREDENTIALS,
): string | null {
  const message = messageOf(error);
  // Checked BEFORE the credential match: the library returns this sentinel in
  // place of InvalidSecret once the per-account attempt limit trips, and
  // reporting it as "wrong password" would leave the player retrying a correct
  // password for an hour with no idea they were locked out.
  if (TOO_MANY_ATTEMPTS.test(message)) return MSG_TOO_MANY_ATTEMPTS;
  if (INVALID_CREDENTIALS.test(message)) return onInvalidCredentials;
  if (ACCOUNT_EXISTS.test(message)) return MSG_USERNAME_TAKEN;
  return null;
}
