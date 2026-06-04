// Daily Challenges — rotating "do X today, earn +1 skill point" goals.
//
// Each UTC day every player sees ONE challenge picked from this registry by a
// deterministic UTC-day-seeded roll (same dial as RunModifierSystem.getDailyTrio).
// Mid-run the App.tsx loop ticks the relevant event channels (kills,
// headshots, waves, flawless waves, pistol-only kills) on the local tracker,
// which flushes throttled writes to convex/daily.ts. When the player returns
// to the main menu the daily card shows progress/claim state.

export type DailyChallengeId =
  | 'kill_100'
  | 'reach_wave_10'
  | 'headshot_25'
  | 'flawless_3_waves'
  | 'survive_pistol_only';

export interface DailyChallenge {
  id: DailyChallengeId;
  name: string;
  blurb: string;
  /** Target progress value — completion = `progress >= goal`. */
  goal: number;
  /** Event channel the App.tsx loop emits on. */
  event: 'kill' | 'wave' | 'headshot' | 'flawless_wave' | 'pistol_kill';
}

export const DAILY_CHALLENGES: Record<DailyChallengeId, DailyChallenge> = {
  kill_100: {
    id: 'kill_100',
    name: 'Daily Cull',
    blurb: 'Eliminate 100 enemies today.',
    goal: 100,
    event: 'kill',
  },
  reach_wave_10: {
    id: 'reach_wave_10',
    name: 'Long Watch',
    blurb: 'Reach wave 10 in a single run.',
    goal: 10,
    event: 'wave',
  },
  headshot_25: {
    id: 'headshot_25',
    name: 'Skull Splitter',
    blurb: 'Land 25 headshots today.',
    goal: 25,
    event: 'headshot',
  },
  flawless_3_waves: {
    id: 'flawless_3_waves',
    name: 'Untouchable',
    blurb: 'Clear 3 waves without taking damage.',
    goal: 3,
    event: 'flawless_wave',
  },
  survive_pistol_only: {
    id: 'survive_pistol_only',
    name: 'Pistols at Dawn',
    blurb: '30 enemy kills with the starter pistol.',
    goal: 30,
    event: 'pistol_kill',
  },
};

/**
 * Deterministic UTC-day-seeded pick of today's challenge id. Same `utcDay`
 * input always returns the same challenge — so a player who reloads gets
 * the same daily, and the previous day's daily rotates out at UTC midnight.
 */
export function getTodayChallengeId(utcDay: string = new Date().toISOString().slice(0, 10)): DailyChallengeId {
  let h = 0x811c9dc5;
  for (let i = 0; i < utcDay.length; i++) {
    h ^= utcDay.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const ids = Object.keys(DAILY_CHALLENGES) as DailyChallengeId[];
  const idx = (h >>> 0) % ids.length;
  return ids[idx];
}

/** Helper — UTC calendar day string for "now". */
export function todayUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}
