/**
 * SINGLE source of truth for the Daily Challenge catalogue and the rotation
 * that picks each UTC day's challenge. Imported by BOTH the Convex server
 * (convex/daily.ts — validates ids, goals and claims) and the client
 * (src/utils/DailyChallengeRegistry.ts re-exports it; App.tsx tracks the event
 * channels; DailyChallengeCard.tsx renders it) — same pattern as
 * `convex/achievementRegistry.ts` and `convex/authValidation.ts`.
 *
 * ── ROTATION ──
 * Days are numbered from the Unix epoch. Each block of N consecutive days
 * (N = catalogue size) is a CYCLE: the catalogue is deterministically shuffled
 * per cycle (Fisher–Yates seeded from the cycle number), and day `d` inside
 * the cycle takes the shuffled list's d-th entry. So:
 *   • every challenge appears EXACTLY ONCE per ~N-day cycle (no redundancy),
 *   • the order re-shuffles every cycle (no predictable repetition),
 *   • a seam guard stops the last pick of one cycle repeating as the first
 *     pick of the next,
 *   • it's pure math on the shared list — client and server always agree,
 *     with zero storage.
 *
 * ── EDITING RULES ──
 * • APPENDING challenges is always safe (future cycles pick them up).
 * • NEVER DELETE an id: historical `dailyProgress` rows reference ids forever
 *   (the profile activity heatmap + an in-flight day's claim both resolve
 *   goals through this registry).
 * • Reordering/goal-tweaks only affect future days — the server re-validates
 *   everything per day, so nothing a client stores can exploit a change.
 * • Every challenge must be completable in SOLO play (dailies are disabled in
 *   tutorial + multiplayer) and trackable by an existing channel below.
 */

// ── Event channels ───────────────────────────────────────────────────────────
// Each challenge progresses on exactly ONE channel, ticked by the App.tsx game
// loop. `add` channels accumulate across every run of the day (flush sends
// serverBase + runCount); `max` channels report a per-run best (flush sends
// max(serverBase, runBest)) — the server keeps max() of whatever arrives, so
// both modes are idempotent under duplicate/late writes.
export type DailyEventChannel =
  | 'kill'            // any enemy kill
  | 'headshot'        // headshot (critical) kills
  | 'wave'            // highest wave REACHED in a single run  (max mode)
  | 'flawless_wave'   // waves cleared without taking damage
  | 'boss_kill'       // Goliath-class boss kills
  | 'rapid_kill'      // triple-kills (3 kills within a 4s window)
  | 'melee_hit'       // melee strikes that connected with ≥1 enemy
  | 'powerup'         // power-ups looted
  | 'score'           // total score earned today
  | 'survive_min'     // whole minutes survived today (alive + unpaused)
  | 'ability_use'     // character ability casts (Engineer: detonations)
  | 'perfect_reload'  // perfect active-reload hits
  | 'hack'            // Subverter intrusion chips deployed
  | 'pistol_kill' | 'rifle_kill' | 'shotgun_kill' | 'smg_kill'
  | 'sniper_kill' | 'minigun_kill' | 'launcher_kill' | 'subverter_kill';

export type DailyChannelMode = 'add' | 'max';

/** How a channel's per-run count folds into the day's server total. */
export const DAILY_CHANNEL_MODE: Record<DailyEventChannel, DailyChannelMode> = {
  kill: 'add', headshot: 'add', wave: 'max', flawless_wave: 'add',
  boss_kill: 'add', rapid_kill: 'add', melee_hit: 'add', powerup: 'add',
  score: 'add', survive_min: 'add', ability_use: 'add', perfect_reload: 'add',
  hack: 'add',
  pistol_kill: 'add', rifle_kill: 'add', shotgun_kill: 'add', smg_kill: 'add',
  sniper_kill: 'add', minigun_kill: 'add', launcher_kill: 'add', subverter_kill: 'add',
};

// ── Catalogue ────────────────────────────────────────────────────────────────
// The five ORIGINAL ids (kill_100, reach_wave_10, headshot_25,
// flawless_3_waves, survive_pistol_only) are preserved verbatim so historical
// rows and the deploy-transition day keep resolving.
//
// Weapon-specific goals are calibrated to the unlock ladder (rifle 100 →
// subverter 2200 score, × difficulty): late-arsenal days are deliberately the
// "hard days" of a cycle, cheapest to attempt on Easy.
const CHALLENGE_DEFS = {
  // ── Elimination volume ──
  kill_40:   { name: "Skirmisher's Quota",    blurb: 'Eliminate 40 enemies today.',  goal: 40,  event: 'kill' },
  kill_60:   { name: 'Cull Order',            blurb: 'Eliminate 60 enemies today.',  goal: 60,  event: 'kill' },
  kill_75:   { name: 'Field Day',             blurb: 'Eliminate 75 enemies today.',  goal: 75,  event: 'kill' },
  kill_100:  { name: 'Daily Cull',            blurb: 'Eliminate 100 enemies today.', goal: 100, event: 'kill' },
  kill_125:  { name: 'Relentless',            blurb: 'Eliminate 125 enemies today.', goal: 125, event: 'kill' },
  kill_150:  { name: 'Extermination Order',   blurb: 'Eliminate 150 enemies today.', goal: 150, event: 'kill' },
  kill_200:  { name: 'Scorched Earth',        blurb: 'Eliminate 200 enemies today.', goal: 200, event: 'kill' },

  // ── Precision ──
  headshot_10: { name: 'Clean Hits',           blurb: 'Land 10 headshot kills today.', goal: 10, event: 'headshot' },
  headshot_15: { name: "Marksman's Morning",   blurb: 'Land 15 headshot kills today.', goal: 15, event: 'headshot' },
  headshot_25: { name: 'Skull Splitter',       blurb: 'Land 25 headshot kills today.', goal: 25, event: 'headshot' },
  headshot_40: { name: 'Surgical Precision',   blurb: 'Land 40 headshot kills today.', goal: 40, event: 'headshot' },
  headshot_60: { name: 'Dead-Centre Doctrine', blurb: 'Land 60 headshot kills today.', goal: 60, event: 'headshot' },

  // ── Survival depth (single-run best) ──
  reach_wave_5:  { name: 'Foothold',         blurb: 'Reach wave 5 in a single run.',  goal: 5,  event: 'wave' },
  reach_wave_7:  { name: 'Hold the Line',    blurb: 'Reach wave 7 in a single run.',  goal: 7,  event: 'wave' },
  reach_wave_8:  { name: 'Dug In',           blurb: 'Reach wave 8 in a single run.',  goal: 8,  event: 'wave' },
  reach_wave_10: { name: 'Long Watch',       blurb: 'Reach wave 10 in a single run.', goal: 10, event: 'wave' },
  reach_wave_12: { name: 'Deep Defence',     blurb: 'Reach wave 12 in a single run.', goal: 12, event: 'wave' },
  reach_wave_15: { name: 'Against the Tide', blurb: 'Reach wave 15 in a single run.', goal: 15, event: 'wave' },

  // ── Flawless play ──
  flawless_1_wave:  { name: 'Clean Sheet',        blurb: 'Clear a wave without taking damage.',    goal: 1, event: 'flawless_wave' },
  flawless_2_waves: { name: 'Untouched Twice',    blurb: 'Clear 2 waves without taking damage.',   goal: 2, event: 'flawless_wave' },
  flawless_3_waves: { name: 'Untouchable',        blurb: 'Clear 3 waves without taking damage.',   goal: 3, event: 'flawless_wave' },
  flawless_4_waves: { name: 'Phantom Discipline', blurb: 'Clear 4 waves without taking damage.',   goal: 4, event: 'flawless_wave' },
  flawless_5_waves: { name: 'Ghost Protocol',     blurb: 'Clear 5 waves without taking damage.',   goal: 5, event: 'flawless_wave' },

  // ── Bosses ──
  boss_1: { name: 'Giant Slayer',  blurb: 'Destroy a Goliath-class boss today.',    goal: 1, event: 'boss_kill' },
  boss_2: { name: 'Double Goliath', blurb: 'Destroy 2 Goliath-class bosses today.', goal: 2, event: 'boss_kill' },
  boss_3: { name: 'Boss Rush',     blurb: 'Destroy 3 Goliath-class bosses today.',  goal: 3, event: 'boss_kill' },
  boss_5: { name: 'Titanfall',     blurb: 'Destroy 5 Goliath-class bosses today.',  goal: 5, event: 'boss_kill' },

  // ── Burst damage ──
  rapid_3:  { name: 'Chain Reaction', blurb: 'Score 3 triple-kills today (3 kills within 4 seconds).',  goal: 3,  event: 'rapid_kill' },
  rapid_5:  { name: 'Bloodrush',      blurb: 'Score 5 triple-kills today (3 kills within 4 seconds).',  goal: 5,  event: 'rapid_kill' },
  rapid_8:  { name: 'Overkill Engine', blurb: 'Score 8 triple-kills today (3 kills within 4 seconds).', goal: 8,  event: 'rapid_kill' },
  rapid_12: { name: 'Killing Frenzy', blurb: 'Score 12 triple-kills today (3 kills within 4 seconds).', goal: 12, event: 'rapid_kill' },

  // ── Melee ──
  melee_8:  { name: 'Up Close',   blurb: 'Land 8 melee strikes on enemies today.',  goal: 8,  event: 'melee_hit' },
  melee_15: { name: 'Brawler',    blurb: 'Land 15 melee strikes on enemies today.', goal: 15, event: 'melee_hit' },
  melee_25: { name: 'Iron Fists', blurb: 'Land 25 melee strikes on enemies today.', goal: 25, event: 'melee_hit' },

  // ── Looting ──
  powerup_5:  { name: 'Scavenger',     blurb: 'Loot 5 power-ups today.',  goal: 5,  event: 'powerup' },
  powerup_8:  { name: 'Loot Runner',   blurb: 'Loot 8 power-ups today.',  goal: 8,  event: 'powerup' },
  powerup_12: { name: 'Well Supplied', blurb: 'Loot 12 power-ups today.', goal: 12, event: 'powerup' },
  powerup_18: { name: 'Hoarder',       blurb: 'Loot 18 power-ups today.', goal: 18, event: 'powerup' },

  // ── Score ──
  score_4000:  { name: 'Point Maker',         blurb: 'Earn 4,000 total score today.',  goal: 4000,  event: 'score' },
  score_8000:  { name: 'High Scorer',         blurb: 'Earn 8,000 total score today.',  goal: 8000,  event: 'score' },
  score_15000: { name: 'Score Baron',         blurb: 'Earn 15,000 total score today.', goal: 15000, event: 'score' },
  score_25000: { name: 'Legend of the Board', blurb: 'Earn 25,000 total score today.', goal: 25000, event: 'score' },

  // ── Time survived ──
  survive_10: { name: 'Enduring',       blurb: 'Survive a total of 10 minutes today.', goal: 10, event: 'survive_min' },
  survive_15: { name: 'Steadfast',      blurb: 'Survive a total of 15 minutes today.', goal: 15, event: 'survive_min' },
  survive_20: { name: 'Marathon Watch', blurb: 'Survive a total of 20 minutes today.', goal: 20, event: 'survive_min' },
  survive_30: { name: 'Iron Vigil',     blurb: 'Survive a total of 30 minutes today.', goal: 30, event: 'survive_min' },

  // ── Abilities ──
  ability_3:  { name: 'Signature Move', blurb: 'Use your character ability 3 times today.',  goal: 3,  event: 'ability_use' },
  ability_5:  { name: 'Practised Hand', blurb: 'Use your character ability 5 times today.',  goal: 5,  event: 'ability_use' },
  ability_8:  { name: 'Well Drilled',   blurb: 'Use your character ability 8 times today.',  goal: 8,  event: 'ability_use' },
  ability_12: { name: 'Ability Master', blurb: 'Use your character ability 12 times today.', goal: 12, event: 'ability_use' },

  // ── Active reload ──
  perfect_reload_4:  { name: 'Quick Hands',     blurb: 'Hit 4 perfect active reloads today.',  goal: 4,  event: 'perfect_reload' },
  perfect_reload_8:  { name: 'Active Hands',    blurb: 'Hit 8 perfect active reloads today.',  goal: 8,  event: 'perfect_reload' },
  perfect_reload_14: { name: 'Drilled Reloads', blurb: 'Hit 14 perfect active reloads today.', goal: 14, event: 'perfect_reload' },
  perfect_reload_20: { name: 'Reload Savant',   blurb: 'Hit 20 perfect active reloads today.', goal: 20, event: 'perfect_reload' },

  // ── Subverter ──
  hack_4: { name: 'Intrusion Ops',    blurb: 'Deploy 4 Subverter intrusion chips today.', goal: 4, event: 'hack' },
  hack_8: { name: 'Network Dominion', blurb: 'Deploy 8 Subverter intrusion chips today.', goal: 8, event: 'hack' },

  // ── Weapon mastery days ──
  survive_pistol_only: { name: 'Pistols at Dawn',    blurb: '30 enemy kills with the starter pistol.',   goal: 30, event: 'pistol_kill' },
  pistol_25:   { name: 'Sidearm Specialist',  blurb: 'Kill 25 enemies with the Pistol today.',   goal: 25, event: 'pistol_kill' },
  pistol_45:   { name: 'Pistolero',           blurb: 'Kill 45 enemies with the Pistol today.',   goal: 45, event: 'pistol_kill' },
  rifle_40:    { name: 'Rifleman',            blurb: 'Kill 40 enemies with the Rifle today.',    goal: 40, event: 'rifle_kill' },
  rifle_70:    { name: 'Rifle Doctrine',      blurb: 'Kill 70 enemies with the Rifle today.',    goal: 70, event: 'rifle_kill' },
  shotgun_30:  { name: 'Scattergun',          blurb: 'Kill 30 enemies with the Shotgun today.',  goal: 30, event: 'shotgun_kill' },
  shotgun_55:  { name: 'Point-Blank Prophet', blurb: 'Kill 55 enemies with the Shotgun today.',  goal: 55, event: 'shotgun_kill' },
  smg_40:      { name: 'Spray Control',       blurb: 'Kill 40 enemies with the SMG today.',      goal: 40, event: 'smg_kill' },
  smg_70:      { name: 'Bullet Hose',         blurb: 'Kill 70 enemies with the SMG today.',      goal: 70, event: 'smg_kill' },
  sniper_20:   { name: 'Long Shot',           blurb: 'Kill 20 enemies with the Sniper today.',   goal: 20, event: 'sniper_kill' },
  sniper_35:   { name: 'Ghillie Discipline',  blurb: 'Kill 35 enemies with the Sniper today.',   goal: 35, event: 'sniper_kill' },
  minigun_30:  { name: 'Spin-Up',             blurb: 'Kill 30 enemies with the Minigun today.',  goal: 30, event: 'minigun_kill' },
  minigun_50:  { name: 'Lead Storm',          blurb: 'Kill 50 enemies with the Minigun today.',  goal: 50, event: 'minigun_kill' },
  launcher_12: { name: 'Demolitionist',       blurb: 'Kill 12 enemies with the Launcher today.', goal: 12, event: 'launcher_kill' },
  launcher_25: { name: 'Splash Doctrine',     blurb: 'Kill 25 enemies with the Launcher today.', goal: 25, event: 'launcher_kill' },
} satisfies Record<string, { name: string; blurb: string; goal: number; event: DailyEventChannel }>;

export type DailyChallengeId = keyof typeof CHALLENGE_DEFS;

export interface DailyChallenge {
  id: DailyChallengeId;
  name: string;
  blurb: string;
  /** Target progress value — completion = `progress >= goal`. */
  goal: number;
  /** Event channel the App.tsx loop emits on. */
  event: DailyEventChannel;
}

/** id → full challenge (with `id` folded in, matching the original shape). */
export const DAILY_CHALLENGES: Record<DailyChallengeId, DailyChallenge> = Object.fromEntries(
  Object.entries(CHALLENGE_DEFS).map(([id, def]) => [id, { id, ...def }]),
) as Record<DailyChallengeId, DailyChallenge>;

/** Catalogue in definition order — the rotation's base list. */
export const DAILY_CHALLENGE_IDS = Object.keys(CHALLENGE_DEFS) as DailyChallengeId[];

/**
 * Prototype-safe catalogue lookup (see convex/skillRegistry.ts for why direct
 * indexing with an untrusted id is unsafe). Also shape-checks the goal so a
 * malformed entry reads as "unknown" instead of poisoning progress math.
 */
export function getDailyChallenge(id: string): DailyChallenge | null {
  if (!Object.prototype.hasOwnProperty.call(DAILY_CHALLENGES, id)) return null;
  const def = DAILY_CHALLENGES[id as DailyChallengeId];
  return def && typeof def.goal === 'number' && Number.isFinite(def.goal) && def.goal > 0
    ? def
    : null;
}

// ── Rotation ────────────────────────────────────────────────────────────────

/** FNV-1a over a number's decimal digits — the per-cycle shuffle seed. */
function hash32(n: number): number {
  let h = 0x811c9dc5;
  const s = String(n);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG; integer ops only, so every JS engine
 *  (browser + Convex runtime) produces the identical sequence. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** The catalogue, Fisher–Yates-shuffled deterministically for one cycle. */
function shuffledIds(cycle: number): DailyChallengeId[] {
  const rand = mulberry32(hash32(cycle));
  const ids = [...DAILY_CHALLENGE_IDS];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/**
 * Deterministic challenge pick for a UTC day ("YYYY-MM-DD"). Same input →
 * same output on client and server. Each challenge appears exactly once per
 * catalogue-length cycle; cycles reshuffle; the seam guard prevents the same
 * challenge running two days in a row across a cycle boundary.
 */
export function challengeIdForDay(utcDay: string): DailyChallengeId {
  const n = DAILY_CHALLENGE_IDS.length;
  const parsed = Date.parse(`${utcDay}T00:00:00Z`);
  // Malformed input can't happen from our own callers (both sides format the
  // day themselves) — but fail safe to a stable hash pick, never a throw.
  const day = Number.isFinite(parsed)
    ? Math.floor(parsed / 86_400_000)
    : hash32(utcDay.length);
  const cycle = Math.floor(day / n);
  const pos = ((day % n) + n) % n;
  const perm = shuffledIds(cycle);
  // Seam guard: if this cycle would OPEN with the id the previous cycle CLOSED
  // on, swap slots 0↔1. Only slots 0/1 are ever swapped, so the previous
  // cycle's closing id (slot n-1) is always stable to recompute here.
  if (pos <= 1 && n > 2) {
    const prevLast = shuffledIds(cycle - 1)[n - 1];
    if (perm[0] === prevLast) {
      [perm[0], perm[1]] = [perm[1], perm[0]];
    }
  }
  return perm[pos];
}

export function todayUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Today's challenge id (client convenience wrapper; the server passes its own
 * `utcDay` through `challengeIdForDay` directly).
 */
export function getTodayChallengeId(utcDay: string = todayUtcDay()): DailyChallengeId {
  return challengeIdForDay(utcDay);
}
