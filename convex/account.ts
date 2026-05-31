import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { checkPassword } from "./authValidation";

function validatePasswordRequirements(password: string) {
  const error = checkPassword(password);
  if (error !== null) {
    throw new ConvexError(error);
  }
}

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
    dob: v.string(),
  },
  handler: async (
    ctx,
    { currentPassword, newPassword, dob },
  ): Promise<{ userId: string; username: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("You need to sign in before changing your password.");
    }

    const authRecord = await ctx.runQuery(internal.profile.getAuthRecord, {});
    if (authRecord === null) {
      throw new ConvexError("We could not find your account.");
    }

    // Verify date of birth as a second factor (when one is on file — legacy
    // accounts created before DOB collection are allowed through on password).
    if (authRecord.dob) {
      if (dob.trim() !== authRecord.dob) {
        throw new ConvexError("Date of birth does not match our records.");
      }
    }

    validatePasswordRequirements(newPassword);

    if (currentPassword === newPassword) {
      throw new ConvexError("Choose a new password that is different from the current one.");
    }

    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: {
          id: authRecord.username.toLowerCase(),
          secret: currentPassword,
        },
      });
    } catch {
      throw new ConvexError("Current password is incorrect.");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: {
        id: authRecord.username.toLowerCase(),
        secret: newPassword,
      },
    });

    const currentSessionId = await getAuthSessionId(ctx);
    if (currentSessionId !== null) {
      await invalidateSessions(ctx, {
        userId,
        except: [currentSessionId],
      });
    }

    return {
      userId,
      username: authRecord.username,
    };
  },
});
