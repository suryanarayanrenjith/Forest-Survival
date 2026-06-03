/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as auth from "../auth.js";
import type * as authValidation from "../authValidation.js";
import type * as gameLimits from "../gameLimits.js";
import type * as http from "../http.js";
import type * as leaderboard from "../leaderboard.js";
import type * as photos from "../photos.js";
import type * as playerStats from "../playerStats.js";
import type * as profile from "../profile.js";
import type * as rankSystem from "../rankSystem.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as signupGuard from "../signupGuard.js";
import type * as skillRegistry from "../skillRegistry.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  authValidation: typeof authValidation;
  gameLimits: typeof gameLimits;
  http: typeof http;
  leaderboard: typeof leaderboard;
  photos: typeof photos;
  playerStats: typeof playerStats;
  profile: typeof profile;
  rankSystem: typeof rankSystem;
  rateLimiter: typeof rateLimiter;
  signupGuard: typeof signupGuard;
  skillRegistry: typeof skillRegistry;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
