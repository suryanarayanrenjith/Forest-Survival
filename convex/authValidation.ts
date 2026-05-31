/**
 * Shared, dependency-free auth validation — the SINGLE source of truth for the
 * sign-up rules, imported by BOTH the Convex auth server (`convex/auth.ts`,
 * `convex/account.ts`) and the client sign-up form (`src/components/AuthMenu.tsx`).
 *
 * Same pattern as `convex/gameLimits.ts` (pure module imported by server + client).
 *
 * Why this exists: the client used to mirror only a SUBSET of the server's rules
 * in its step-1 gate, so errors like a reserved/spammy username or a password
 * that contains the username only surfaced AFTER the user had filled in step 2
 * (Name + DOB) and pressed "Create Account". Funnelling both sides through the
 * identical `check*` functions guarantees every signup error is caught up-front,
 * in step 1, before the profile step is ever shown.
 *
 * Convention: every `check*` function returns a human-readable error string when
 * the value is invalid, or `null` when it's acceptable. The server wraps a
 * non-null result in a `ConvexError`; the client shows it inline.
 */

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,18}[a-z0-9])?$/;

export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 20;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 30;
export const MIN_AGE_YEARS = 13;
export const MAX_AGE_YEARS = 120;

export const RESERVED_USERNAMES = new Set([
  "admin",
  "anonymous",
  "demo",
  "guest",
  "null",
  "official",
  "owner",
  "root",
  "security",
  "staff",
  "support",
  "system",
  "test",
  "undefined",
]);

export function normalizeUsername(rawUsername: string): string {
  return rawUsername.trim().toLowerCase();
}

/** Collapse internal whitespace runs and trim — used for display names. */
export function normalizeDisplayName(rawName: string): string {
  return rawName.trim().replace(/\s+/g, " ");
}

export function normalizeDob(rawDob: string): string {
  return rawDob.trim();
}

/**
 * Validate a normalized (lowercased, trimmed) username.
 * Pass the output of `normalizeUsername` in.
 */
export function checkUsername(username: string): string | null {
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    return `Username must be ${MIN_USERNAME_LENGTH} to ${MAX_USERNAME_LENGTH} characters long.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Use letters, numbers, dots, underscores, or dashes.";
  }
  if (RESERVED_USERNAMES.has(username)) {
    return "Choose a different username.";
  }
  if (
    username.includes("http") ||
    username.includes("www") ||
    username.includes("@") ||
    username.includes("://")
  ) {
    return "Username looks invalid.";
  }
  if (/[._-]{2,}/.test(username)) {
    return "Username looks spammy.";
  }
  if (/(.)\1{4,}/.test(username)) {
    return "Username looks spammy.";
  }
  const digitCount = (username.match(/\d/g) ?? []).length;
  if (digitCount > Math.max(4, Math.floor(username.length * 0.6))) {
    return "Username looks spammy.";
  }
  return null;
}

export function checkPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  // Cap length so an oversized password can't burn CPU on Scrypt hashing (DoS).
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password is too long (max ${MAX_PASSWORD_LENGTH} characters).`;
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include letters and numbers.";
  }
  return null;
}

/** A password must not embed the account username. */
export function checkPasswordAgainstUsername(
  password: string,
  normalizedUsername: string,
): string | null {
  if (normalizedUsername && password.toLowerCase().includes(normalizedUsername)) {
    return "Password should not include your username.";
  }
  return null;
}

/** Validate a whitespace-normalized display name (output of `normalizeDisplayName`). */
export function checkDisplayName(name: string): string | null {
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    return `Name must be ${MIN_NAME_LENGTH} to ${MAX_NAME_LENGTH} characters long.`;
  }
  if (!/^[\p{L}][\p{L}\p{M}'.\- ]*$/u.test(name)) {
    return "Name contains invalid characters.";
  }
  return null;
}

/** Validate a YYYY-MM-DD date of birth (output of `normalizeDob`). */
export function checkDob(dob: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return "Enter a valid date of birth.";
  }
  const date = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "Enter a valid date of birth.";
  }
  const now = Date.now();
  if (date.getTime() > now) {
    return "Date of birth cannot be in the future.";
  }
  const ageYears = (now - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < MIN_AGE_YEARS) {
    return `You must be at least ${MIN_AGE_YEARS} years old to play.`;
  }
  if (ageYears > MAX_AGE_YEARS) {
    return "Enter a valid date of birth.";
  }
  return null;
}

/**
 * The latest DOB (YYYY-MM-DD) that still satisfies the minimum age — used as the
 * `max` attribute on the client's date input so the picker can't offer an
 * under-age date. Calendar-year based; `checkDob` is the authoritative gate.
 */
export function maxDobString(now: Date = new Date()): string {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - MIN_AGE_YEARS);
  return d.toISOString().slice(0, 10);
}
