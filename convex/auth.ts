import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount, convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { ConvexError } from "convex/values";
import { Scrypt } from "lucia";
import {
  MAX_PASSWORD_LENGTH,
  checkDisplayName,
  checkDob,
  checkPassword,
  checkPasswordAgainstUsername,
  checkUsername,
  normalizeDisplayName,
  normalizeDob,
  normalizeUsername,
} from "./authValidation";
import { getOrCreateStats } from "./playerStats";
import { authFailureMessage } from "./authErrors";

// Device signals come from an untrusted browser. Keep the registration path
// bounded before it reaches the transactional anti-abuse records.
const MAX_FINGERPRINTS = 4;
const MAX_FINGERPRINT_LENGTH = 128;

function readStringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/** Throw the shared validator's message as a ConvexError when one is returned. */
function assertValid(error: string | null): void {
  if (error !== null) {
    throw new ConvexError(error);
  }
}

/**
 * Collect every client-supplied device signal (hardware + persistent
 * fingerprints) into a deduped, non-empty list. The server caps accounts
 * against ALL of them, so clearing storage no longer mints a fresh identity.
 */
function getFingerprints(params: Record<string, unknown>, fallback: string): string[] {
  const valid = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= MAX_FINGERPRINT_LENGTH
      ? trimmed
      : null;
  };

  // A malicious comma-delimited value must not create an unbounded array or
  // fan out into unbounded database queries. Ignore an oversized list and let
  // the stable fallback below cover storage-disabled browsers.
  const rawList = readStringParam(params, "fingerprints");
  const list = rawList.length <= MAX_FINGERPRINTS * (MAX_FINGERPRINT_LENGTH + 1)
    ? rawList
      .split(",")
      .map(valid)
      .filter((value): value is string => value !== null)
    : [];

  const single = valid(
    readStringParam(params, "fingerprint") ||
    readStringParam(params, "deviceFingerprint") ||
    readStringParam(params, "clientFingerprint"),
  );
  if (single) list.push(single);

  const deduped = Array.from(new Set(list)).slice(0, MAX_FINGERPRINTS);
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
        if (password.length > MAX_PASSWORD_LENGTH) {
          throw new ConvexError(`Password is too long (max ${MAX_PASSWORD_LENGTH} characters).`);
        }

        if (flow === "signUp") {
          assertValid(checkUsername(normalizedUsername));
          assertValid(checkPassword(password));
          assertValid(checkPasswordAgainstUsername(password, normalizedUsername));

          const displayName = normalizeDisplayName(
            readStringParam(credentials, "name") || displayUsername,
          );
          assertValid(checkDisplayName(displayName));
          const dob = normalizeDob(readStringParam(credentials, "dob"));
          assertValid(checkDob(dob));

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
            // `usernameExists` above is a best-effort pre-check — two sign-ups
            // for the same name can still race past it, and `createAccount`
            // then throws a PLAIN Error ("Account x already exists") that
            // production redacts to "Server Error". Re-raise it as the same
            // friendly message the pre-check would have produced.
            const friendly = authFailureMessage(creationError);
            if (friendly !== null) throw new ConvexError(friendly);
            throw creationError; // genuinely unexpected — keep it redacted + logged
          }
        }

        if (flow === "signIn") {
          // `retrieveAccount` reports a bad username, a bad password, and a
          // tripped attempt-limit by throwing a plain Error with a bare
          // sentinel message, which production redacts to "Server Error". Map
          // them to real messages (see convex/authErrors.ts).
          let existing;
          try {
            existing = await retrieveAccount(ctx, {
              provider: "password",
              account: { id: normalizedUsername, secret: password },
            });
          } catch (signInError) {
            const friendly = authFailureMessage(signInError);
            if (friendly !== null) throw new ConvexError(friendly);
            throw signInError;
          }

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
      // Materialise the player's progression doc at first sign-in (i.e. right
      // after registration). This is what assigns a brand-new account its
      // RANDOM starting avatar (see getOrCreateStats). No-op for returning
      // users — their doc already exists, so their chosen avatar is untouched.
      await getOrCreateStats(ctx, userId);
    },
  },
});
