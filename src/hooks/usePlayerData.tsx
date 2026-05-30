import { createContext, useContext, type ReactNode } from 'react';
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

const PlayerDataContext = createContext<PlayerData | null>(null);

export function PlayerDataProvider({ children }: { children: ReactNode }) {
  const currentUser = useQuery(api.profile.currentUser);
  const playerStats = useQuery(api.playerStats.getPlayerStats);
  return (
    <PlayerDataContext.Provider value={{ currentUser, playerStats }}>
      {children}
    </PlayerDataContext.Provider>
  );
}

export function usePlayerData(): PlayerData {
  const ctx = useContext(PlayerDataContext);
  // Defensive fallback for any component rendered outside the provider.
  return ctx ?? { currentUser: undefined, playerStats: undefined };
}
