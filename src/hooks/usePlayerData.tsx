import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { type FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';

/**
 * Single source of truth for the signed-in player's account + progression.
 *
 * The two queries are subscribed ONCE here, at the app root, so they stay warm
 * for the whole session. Menu screens (main menu, profile, multiplayer lobby)
 * and the game all read from this context instead of opening their own
 * subscriptions — so navigating between the menu and a match never re-runs the
 * Convex functions (the previous behaviour, visible in the deployment logs,
 * was every screen mounting its own `currentUser` / `getPlayerStats` query).
 *
 * Both queries are identity-scoped on the server, so when a different account
 * signs in they automatically re-run and return that user's data — one user's
 * cached values can never leak into another's session.
 */
type CurrentUser = FunctionReturnType<typeof api.profile.currentUser>;
type PlayerStats = FunctionReturnType<typeof api.playerStats.getPlayerStats>;

export interface PlayerData {
  /** `undefined` while loading, `null` when signed out. */
  currentUser: CurrentUser | undefined;
  playerStats: PlayerStats | undefined;
}

// ── Live-match pause for the progression subscription ────────────────────────
// A running match flushes weapon-mastery XP + achievement merges to Convex,
// and every one of those mutations patches the `playerStats` row — which the
// subscription then pushed straight back, re-rendering the provider and every
// consumer (the whole App tree) mid-combat. Nobody consumes LIVE stats during
// a match (the game loop reads a ref snapshotted at run start; the menus are
// unmounted), so the App pauses the subscription for the duration of the run
// and resubscribes the moment it ends — fresh data for the post-game menus.
//
// `currentUser` stays subscribed: nothing patches it during a match.
let statsPaused = false;
const pauseListeners = new Set<() => void>();

/** Pause/resume the playerStats subscription (called by App on match start/end). */
export function setPlayerStatsPaused(paused: boolean): void {
  if (statsPaused === paused) return;
  statsPaused = paused;
  pauseListeners.forEach((listener) => listener());
}

function subscribeToPause(callback: () => void): () => void {
  pauseListeners.add(callback);
  return () => { pauseListeners.delete(callback); };
}

const PlayerDataContext = createContext<PlayerData | null>(null);

export function PlayerDataProvider({ children }: { children: ReactNode }) {
  const paused = useSyncExternalStore(subscribeToPause, () => statsPaused);
  const currentUser = useQuery(api.profile.currentUser);
  const playerStats = useQuery(api.playerStats.getPlayerStats, paused ? 'skip' : {});
  // Memoised so a provider re-render with unchanged data can't cascade a new
  // context identity into every consumer.
  const value = useMemo(() => ({ currentUser, playerStats }), [currentUser, playerStats]);
  return (
    <PlayerDataContext.Provider value={value}>
      {children}
    </PlayerDataContext.Provider>
  );
}

export function usePlayerData(): PlayerData {
  const ctx = useContext(PlayerDataContext);
  // Defensive fallback for any component rendered outside the provider.
  return ctx ?? { currentUser: undefined, playerStats: undefined };
}
