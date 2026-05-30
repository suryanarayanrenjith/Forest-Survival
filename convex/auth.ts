import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount, convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { ConvexError } from "convex/values";
import { Scrypt } from "lucia";

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,18}[a-z0-9])?$/;
const RESERVED_USERNAMES = new Set([
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

function readStringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

function normalizeUsername(rawUsername: string): string {
  return rawUsername.trim().toLowerCase();
}

function validateUsername(username: string) {
  if (username.length < 3 || username.length > 20) {
    throw new ConvexError("Username must be 3 to 20 characters long.");
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new ConvexError("Use letters, numbers, dots, underscores, or dashes.");
  }
  if (RESERVED_USERNAMES.has(username)) {
    throw new ConvexError("Choose a different username.");
  }
  if (
    username.includes("http") ||
    username.includes("www") ||
    username.includes("@") ||
    username.includes("://")
  ) {
    throw new ConvexError("Username looks invalid.");
  }
  if (/[._-]{2,}/.test(username)) {
    throw new ConvexError("Username looks spammy.");
  }
  if (/(.)\1{4,}/.test(username)) {
    throw new ConvexError("Username looks spammy.");
  }
  const digitCount = (username.match(/\d/g) ?? []).length;
  if (digitCount > Math.max(4, Math.floor(username.length * 0.6))) {
    throw new ConvexError("Username looks spammy.");
  }
}

function validatePasswordRequirements(password: string) {
  if (password.length < 8) {
    throw new ConvexError("Password must be at least 8 characters.");
  }
  // Cap length so an oversized password can't burn CPU on Scrypt hashing (DoS).
  if (password.length > 128) {
    throw new ConvexError("Password is too long (max 128 characters).");
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new ConvexError("Password must include letters and numbers.");
  }
}

function validateDisplayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 30) {
    throw new ConvexError("Name must be 2 to 30 characters long.");
  }
  if (!/^[\p{L}][\p{L}\p{M}'.\- ]*$/u.test(trimmed)) {
    throw new ConvexError("Name contains invalid characters.");
  }
  return trimmed;
}

/** Validate a YYYY-MM-DD date of birth; returns the normalized string. */
function validateDob(dob: string): string {
  const value = dob.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConvexError("Enter a valid date of birth.");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ConvexError("Enter a valid date of birth.");
  }
  const now = Date.now();
  if (date.getTime() > now) {
    throw new ConvexError("Date of birth cannot be in the future.");
  }
  const ageYears = (now - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 13) {
    throw new ConvexError("You must be at least 13 years old to play.");
  }
  if (ageYears > 120) {
    throw new ConvexError("Enter a valid date of birth.");
  }
  return value;
}

/**
 * Collect every client-supplied device signal (hardware + persistent
 * fingerprints) into a deduped, non-empty list. The server caps accounts
 * against ALL of them, so clearing storage no longer mints a fresh identity.
 */
function getFingerprints(params: Record<string, unknown>, fallback: string): string[] {
  const list = readStringParam(params, "fingerprints")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const single = (
    readStringParam(params, "fingerprint") ||
    readStringParam(params, "deviceFingerprint") ||
    readStringParam(params, "clientFingerprint")
  ).trim();
  if (single) list.push(single);

  const deduped = Array.from(new Set(list));
  return deduped.length > 0 ? deduped : [`user:${fallback}`];
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials({
      id: "password",
      crypto: {
        async hashSecret(secret: string) {
          return await new Scrypt().hash(secret);
        },
        async verifySecret(secret: string, hash: string) {
          return await new Scrypt().verify(hash, secret);
        },
      },
      authorize: async (credentials, ctx) => {
        const flow = readStringParam(credentials, "flow") || "signIn";
        const rawUsername =
          readStringParam(credentials, "username") || readStringParam(credentials, "email");
        const displayUsername = rawUsername.trim();

        if (!displayUsername) {
          throw new ConvexError("Enter a username.");
        }

        const normalizedUsername = normalizeUsername(displayUsername);
        const password = readStringParam(credentials, "password");

        if (!password) {
          throw new ConvexError("Enter a password.");
        }

        // Guard both flows: an oversized password would burn CPU on Scrypt
        // hash/verify (mild DoS) before any other validation runs.
        if (password.length > 128) {
          throw new ConvexError("Password is too long (max 128 characters).");
        }

        if (flow === "signUp") {
          validateUsername(normalizedUsername);
          validatePasswordRequirements(password);

          // Onboarding fields collected interactively during sign-up.
          const displayName = validateDisplayName(
            readStringParam(credentials, "name") || displayUsername,
          );
          const dob = validateDob(readStringParam(credentials, "dob"));

          if (password.toLowerCase().includes(normalizedUsername)) {
            throw new ConvexError("Password should not include your username.");
          }

          const usernameTaken = await ctx.runQuery(api.profile.usernameExists, {
            username: normalizedUsername,
          });
          if (usernameTaken) {
            throw new ConvexError("Choose another username.");
          }

          // Anti-abuse gate: rate limit + per-device cap + hard global cap.
          // Reserves a slot atomically; we roll it back if creation fails.
          const fingerprints = getFingerprints(credentials, normalizedUsername);
          const reservation = await ctx.runMutation(internal.signupGuard.reserveSignup, {
            fingerprints,
            username: normalizedUsername,
          });
          if (!reservation.ok) {
            throw new ConvexError(
              reservation.reason ?? "Unable to create this account right now.",
            );
          }

          try {
            const created = await createAccount(ctx, {
              provider: "password",
              account: { id: normalizedUsername, secret: password },
              profile: {
                email: normalizedUsername,
                name: displayName,
                username: normalizedUsername,
                dob,
                createdAt: Date.now(),
              },
              shouldLinkViaEmail: false,
              shouldLinkViaPhone: false,
            });

            return { userId: created.user._id };
          } catch (creationError) {
            // Give back the reserved slot so a failed creation never burns one.
            await ctx.runMutation(internal.signupGuard.rollbackSignup, {
              fingerprints,
              username: normalizedUsername,
            });
            throw creationError;
          }
        }

        if (flow === "signIn") {
          const existing = await retrieveAccount(ctx, {
            provider: "password",
            account: { id: normalizedUsername, secret: password },
          });

          return { userId: existing.user._id };
        }

        throw new ConvexError("Unsupported authentication flow.");
      },
    }),
  ],
  signIn: {
    maxFailedAttempsPerHour: 8,
  },
  callbacks: {
    beforeSessionCreation: async (ctx, { userId }) => {
      await ctx.db.patch(userId, {
        lastLoginAt: Date.now(),
      });
    },
  },
});
