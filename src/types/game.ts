import * as THREE from 'three';
import { AIBehaviorSystem, type AIDecision } from '../utils/AIBehaviorSystem';
import { EnemyPerception, type PerceptionResult } from '../utils/EnemyPerception';
import { AttackSystem } from '../utils/AttackSystem';
import { BulletDodging, type DodgeResult } from '../utils/BulletDodging';
import type { EnemyType } from '../utils/SmartEnemyManager';

export interface Weapon {
  name: string;
  damage: number;
  fireRate: number;
  maxAmmo: number;
  reloadTime: number;
  bulletSpeed: number;
  bulletColor: number;
  spread: number;
  unlockScore: number;
  autoFire?: boolean;
  weight: number;
  canAim?: boolean;
  /** Over-penetration: how many ADDITIONAL enemies a round can punch through
   *  after its first hit (0/undefined = stops in the first body). Each pass
   *  retains `pierceRetain` of the remaining damage. Solid terrain always
   *  stops the round regardless. */
  pierce?: number;
  /** Damage fraction KEPT per body punched through (e.g. 0.55 → 55%). */
  pierceRetain?: number;
  /** Single-shot weapons that reload the instant they run dry, without
   *  waiting for a trigger pull on an empty chamber — a rocket launcher holds
   *  one round and the operator starts loading the next immediately. */
  autoReload?: boolean;
}

export const WEAPONS: Record<string, Weapon> = {
  pistol: {
    name: 'Pistol',
    damage: 25,
    fireRate: 300,
    maxAmmo: 12,
    reloadTime: 1000,
    bulletSpeed: 2,
    bulletColor: 0xffff00,
    spread: 0.02,
    unlockScore: 0,
    weight: 1.0, // Light weapon - full speed
    canAim: true
  },
  rifle: {
    name: 'Rifle',
    damage: 35,
    fireRate: 150,
    maxAmmo: 30,
    reloadTime: 1500,
    bulletSpeed: 3,
    bulletColor: 0xff6600,
    spread: 0.01,
    unlockScore: 100,
    weight: 1.5, // Medium weight
    canAim: true
  },
  shotgun: {
    name: 'Shotgun',
    damage: 15,
    fireRate: 800,
    maxAmmo: 8,
    reloadTime: 2000,
    bulletSpeed: 1.5,
    bulletColor: 0xff0000,
    spread: 0.15,
    unlockScore: 250,
    weight: 1.7, // Heavy weapon
    canAim: true
  },
  smg: {
    name: 'SMG',
    // Restricted fire rate: 100ms (10 shots/s, ~200 DPS held) was an
    // overpowered hold-to-mulch hose for a tier-4 weapon. 165ms (~6 shots/s,
    // ~121 DPS) keeps the spray identity but brings it back in line — below
    // the rifle's potential and meaningfully tactical rather than a win button.
    damage: 20,
    fireRate: 165,
    maxAmmo: 40,
    reloadTime: 1200,
    bulletSpeed: 2.5,
    bulletColor: 0x00ffff,
    spread: 0.03,
    unlockScore: 450,
    autoFire: true,
    weight: 1.2, // Light-medium weight
    canAim: true
  },
  sniper: {
    name: 'Sniper',
    damage: 100,
    fireRate: 1200,
    maxAmmo: 5,
    reloadTime: 2500,
    bulletSpeed: 5,
    bulletColor: 0x00ff00,
    spread: 0.005,
    unlockScore: 700,
    autoFire: false,
    weight: 2.0, // Heavy weapon - slower movement
    canAim: true,
    // A high-velocity anti-materiel round OVER-PENETRATES: it can punch
    // through up to two robots and still wound whatever stands behind them,
    // losing ~45% of its remaining energy per body. Lining up a lane of
    // enemies is now the sniper's signature skill play.
    pierce: 2,
    pierceRetain: 0.55
  },
  minigun: {
    name: 'Minigun',
    damage: 30,
    fireRate: 50,
    maxAmmo: 100,
    reloadTime: 3000,
    bulletSpeed: 3,
    bulletColor: 0xffaa00, // Realistic yellow-orange fire
    spread: 0.05,
    unlockScore: 1100,
    autoFire: true,
    weight: 3.0, // Very heavy - significantly slower
    canAim: true
  },
  launcher: {
    name: 'Launcher',
    damage: 150,
    fireRate: 2000,
    // ONE rocket in the tube. The launcher is muzzle-loaded a round at a time
    // (see GunModel.animateRocketReload) and `autoReload` starts the next load
    // the moment the tube is empty, so it plays like the RPG in GTA IV rather
    // than magically holding three rockets. reloadTime is the single-round
    // load, cut from the old three-rocket 3.5s so the cadence stays usable.
    maxAmmo: 1,
    reloadTime: 2600,
    autoReload: true,
    bulletSpeed: 1.8,
    bulletColor: 0xff4400,
    spread: 0.01,
    unlockScore: 1600,
    autoFire: false,
    weight: 2.5, // Very heavy
    canAim: true
  },
  // ── SUBVERTER — robot-hacking deck (8th loadout slot) ──────────────────
  // Not a gun: a rugged combat tablet loaded with intrusion chips. The
  // player gets in close and "fires" a chip into a nearby enemy, which
  // overclocks its AI — it turns on its own kind, goes unstable, and burns
  // out in an EMP blast after a few seconds. `damage` is 0 (no projectile);
  // the hack is resolved entirely in App's shoot()/enemy loop. `maxAmmo` is
  // the chip count. Short range, no ADS. Unlocks AFTER the launcher (4800).
  subverter: {
    name: 'Subverter',
    damage: 0,
    fireRate: 850,        // brief cooldown between chip deploys
    maxAmmo: 4,           // 4 intrusion chips per cartridge
    reloadTime: 2800,     // swap the chip cartridge
    bulletSpeed: 0,
    bulletColor: 0x39ff14, // cyber-green virus glow
    spread: 0,
    unlockScore: 2200,
    autoFire: false,
    weight: 1.0,          // light tablet — full movement speed
    canAim: false         // it's a deploy tool, not a sighted weapon
  }
};

export interface Enemy {
  mesh: THREE.Group;
  health: number;
  maxHealth: number;
  speed: number;
  dead: boolean;
  // Aliased, NOT re-spelled: a hardcoded copy of the union here (and in
  // App.tsx) is what let four new archetypes compile cleanly while silently
  // missing every per-type table. Keep this pointing at the single source.
  type: EnemyType;
  damage: number;
  scoreValue: number;
  // Recomputed each frame: is the enemy on-screen-within-draw-distance OR close
  // enough to engage? Bullets only damage it, and it only attacks, when true —
  // so neither side can fight through the fog/cull horizon. Undefined ≙ engageable
  // (safe default for the first frame before the cull pass has run).
  engageable?: boolean;
  // Recomputed each frame: has the enemy's DETAILED model streamed in (HIGH or
  // MEDIUM LOD)? Bullets only register when true, so the player can't kill the
  // distant single-box "minimal" stand-in (LOW LOD) — the enemy must close to a
  // believable range first. Undefined means detail-ready (safe first-frame default).
  detailReady?: boolean;
  // Animation state
  walkTime: number;
  damageFlashTime: number;
  deathTime: number;
  // ── Lightweight physics (ragdoll-lite) ──
  // On death the enemy is launched as a simple rigid body: deathVel is metres/s
  // (gravity-integrated, bounces off the ground), deathSpin is rad/s tumble.
  // hitImpulse is a short-lived positional knockback applied while still alive
  // (decays each frame). All optional + reset on (re)spawn for pooled meshes.
  deathVel?: THREE.Vector3;
  deathSpin?: THREE.Vector3;
  deathStarted?: boolean;
  // Engine-grade ragdoll (Rapier) handle, set on death when the physics world
  // is ready (solo only). While set, the death loop drives the corpse transform
  // from the rigid body instead of the lightweight deathVel integrator above;
  // released back to the physics world when the corpse finishes fading.
  ragdollBodyId?: number;
  hitImpulse?: THREE.Vector3;
  leftLeg?: THREE.Mesh;
  rightLeg?: THREE.Mesh;
  leftArm?: THREE.Object3D;  // shoulder-pivot group (arm mesh hangs inside)
  rightArm?: THREE.Object3D;
  torso?: THREE.Mesh;
  head?: THREE.Mesh;
  // AI state
  targetPosition: THREE.Vector3;
  spreadOffset: THREE.Vector2;
  lastPathUpdate: number;
  stuckTimer: number;
  lastPosition: THREE.Vector3;
  behaviorState: 'chase' | 'flank' | 'retreat' | 'attack';
  aggroRange: number;
  // Advanced AI
  dodgeSkill: number; // 0-1, higher = better at dodging
  reactionTime: number; // milliseconds
  lastDodgeTime: number;
  dodgeCooldown: number;
  detectedBullets: Set<THREE.Mesh>;
  // Attack animation
  isAttacking: boolean;
  attackTime: number;
  attackCooldown: number;
  lastAttackTime: number;
  aiBehavior?: AIBehaviorSystem;
  perception?: EnemyPerception;
  attackSystem?: AttackSystem;
  bulletDodging?: BulletDodging;
  playerVelocity?: THREE.Vector3; // Track player velocity for prediction
  isDodging?: boolean;
  dodgeDirection?: THREE.Vector3;
  // Object pooling support
  poolId?: number; // ID for returning mesh to pool when enemy dies
  // ── Multiplayer shared-enemy sync ──
  // netId is the stable id the host assigns and broadcasts; it lets every
  // client agree on which enemy is which. On guests the enemy is a mirror of
  // the host's authoritative copy, interpolated toward the last snapshot.
  netId?: number;
  netTargetX?: number;
  netTargetZ?: number;
  netYaw?: number;
  // ── Multiplayer fair-share targeting (host only) ──
  // The player id this enemy is currently engaging. Assigned with load
  // balancing so aggro is spread evenly across all alive players instead of
  // every enemy piling onto whoever is nearest. Sticky between evaluations
  // (re-evaluated when its target dies/leaves or after nextTargetEvalAt).
  targetPlayerId?: string;
  nextTargetEvalAt?: number;
  // ── Per-enemy throttle state (used by the round-robin scheduler) ──
  // Heavy AI/perception/dodge work is run on a slow tick (5-10 Hz) and the
  // last result is cached so steering and animation still update at 60 Hz.
  // Timestamps are millisecond Date.now() — when the loop sees nextXxxAt is
  // in the past, it re-evaluates and bumps the timestamp forward.
  nextAiAt?: number;
  nextPerceptionAt?: number;
  nextDodgeAt?: number;
  cachedAiDecision?: AIDecision;
  cachedPerception?: PerceptionResult;
  cachedDodge?: DodgeResult;
  // ── Mini-Boss / Boss Phases ─────────────────────────────────────────
  // Mini-bosses are elite tank enemies (4× HP + crown visual) spawned on
  // waves divisible by 5. Bosses transition into a faster, more aggressive
  // "phase 2" when HP drops below half — `bossPhase` is the latched phase
  // so the trigger only fires once.
  isMiniBoss?: boolean;
  // The mini-boss's 3D crown group (gold band + spikes + jewel, session-shared
  // geometry/materials) — referenced so the enemy loop can spin/bob it.
  crown?: THREE.Object3D;
  bossPhase?: 1 | 2;
  // ── Boss summoner (wave 10+) ─────────────────────────────────────────
  // From wave 10 the full boss periodically calls in a pack of minions —
  // mostly Red (normal) + Blue (fast) shock troops, rarely a Sniper (ranged).
  // bossNextSummonAt is the ms timestamp the next summon is allowed; while
  // bossSummonCast > 0 the boss is rearing up in its summon telegraph (seconds
  // remaining) before the minions burst in; bossSummonCount is the pack size
  // for the in-progress cast.
  bossNextSummonAt?: number;
  bossSummonCast?: number;
  bossSummonCount?: number;
  // ── Boss blink/teleport (wave 10+) ───────────────────────────────────
  // The boss can phase-blink AROUND the player to flank/backstab. It uses a
  // small pool of CHARGES (the "how many times at once" burst cap) that refill
  // over time; `bossTeleNextChargeAt` is the next refill timestamp, and
  // `bossTeleNextAt` is the per-blink cooldown gate. Charges + cadence + flank
  // smarts scale with difficulty (hardest in Hard). A fairness floor stops it
  // ever blinking on top of the player.
  bossTeleCharges?: number;
  bossTeleMaxCharges?: number;
  bossTeleNextChargeAt?: number;
  bossTeleNextAt?: number;
  // Short fade-in timer after a blink (drives the arrival materialise VFX).
  bossTeleArriveFx?: number;
  // ── Ranged archetype state ──────────────────────────────────────────
  // Ranged enemies fire a slow telegraphed energy bolt at the player when
  // they have line of sight and the cooldown has elapsed. The cooldown is
  // milliseconds since the last shot; chargeMs tracks the pre-fire wind-up
  // so the player sees a glowing muzzle build before the bolt launches.
  rangedNextShotAt?: number;
  rangedChargeMs?: number;
  // ── Revenant (rare apex trickster) ───────────────────────────────────
  // The Revenant teleports, shoots, regenerates, and raises its own energy
  // shield to phase off bullets / dash / fire. It's only vulnerable while the
  // shield is DOWN (caught off-guard) or after an EXPLOSIVE shatters it.
  //   revShield        — the custom shield-bubble mesh (distinct from the
  //                       player's flat riot shield); toggled by visibility.
  //   revShieldActive  — is the shield currently blocking damage?
  //   revShieldNextUpAt/revShieldDownAt — the up↔down cycle timestamps (ms);
  //                       the DOWN gap is the player's "catch it off-guard"
  //                       window. revShieldBrokenUntil locks the shield OFF
  //                       after an explosive shatter so the player can finish it.
  //   revShieldHitFlash — brief 0→1 brighten when a bullet pings off.
  //   revTele* — blink charges/cooldown (mirrors the boss blink, tuned tighter).
  //   revRegenNextAt — earliest ms it may use its small, rare self-heal.
  revShield?: THREE.Object3D;
  revShieldActive?: boolean;
  revShieldNextUpAt?: number;
  revShieldDownAt?: number;
  revShieldBrokenUntil?: number;
  revShieldHitFlash?: number;
  revTeleCharges?: number;
  revTeleNextChargeAt?: number;
  revTeleNextAt?: number;
  revRegenNextAt?: number;
  // revEvadeUntil — set ONLY when the PLAYER hits it (so it blinks to dodge
  // your fire, but never flees a subverter-hacked enemy that's hunting it).
  // revTeleSuppressUntil — while a hacked enemy is mauling it, its teleport AND
  // shield are suppressed (it can't escape; it stays focused on the player).
  revEvadeUntil?: number;
  revTeleSuppressUntil?: number;
  // ── Hacking (Subverter tool) ─────────────────────────────────────────
  // A hacked enemy is overclocked by an intrusion chip: it ignores the
  // player and hunts/melees the nearest non-hacked enemy, jitters
  // erratically ("unstable"), and self-destructs in an EMP blast when
  // hackTimeLeft hits zero. hackVisuals is the chip + indicator + aura group
  // attached to the mesh; hackNextSparkAt rate-limits the overclock sparks.
  hacked?: boolean;
  hackTimeLeft?: number;   // seconds remaining until overclock death
  hackDuration?: number;   // total hack window (drives the indicator ring)
  hackVisuals?: THREE.Group;
  hackNextSparkAt?: number;
  // ── Crowd-control (Cryo Freeze / Shockwave pickups) ──────────────────────
  // ccUntil: ms timestamp until which the enemy is stunned — it can't move or
  // attack (frozen solid or staggered by a shockwave). frozenUntil: ms until
  // which it carries the frost VISUAL + takes bonus damage (cryo only).
  // frostShell: the per-enemy icy encasement mesh attached while frozen
  // (shared geo+mat, just a lightweight wrapper) — removed on thaw.
  ccUntil?: number;
  frozenUntil?: number;
  frostShell?: THREE.Mesh;
  // Twitch offsets so the instability jitter can be cleanly zeroed out.
  hackJitter?: THREE.Vector3;
  // ── ARK-07 network events (lore layer) ───────────────────────────────────
  // surgeHalo: the red overclock ring hovering over this enemy while an
  // OVERDRIVE SURGE wave is live (shared geo+mat, lightweight wrapper —
  // attached/detached lazily in the enemy loop, MUST be detached before the
  // pooled mesh is released or the release path would dispose the shared
  // assets). radShell: the sickly-green irradiated shell worn while the enemy
  // stands inside the ARK-07 uplink's radiation field (same shared-asset
  // rules; attach/detach uses hysteresis so it doesn't flicker at the rim).
  surgeHalo?: THREE.Mesh;
  radShell?: THREE.Mesh;
  // Next allowed "glitch-skip" (NULL WAVE teleport stutter) timestamp — set
  // by the host/solo loop so a corrupted enemy doesn't chain-blink.
  nextGlitchSkipAt?: number;
  // ── Lingering irradiation charge ──
  // A unit that bathes in a relay's command bandwidth stays SUPERCHARGED for
  // a long while after leaving the field: irradiatedPower is the peak field
  // factor it soaked up (0..1) and irradiatedUntil the ms timestamp the
  // charge finally bleeds off. Both refreshed continuously while inside a
  // field; read by the damage/speed empowerment helpers on the authority and
  // by the shell visuals on every client.
  irradiatedPower?: number;
  irradiatedUntil?: number;
  // ── Battle-damage FX throttle ────────────────────────────────────────────
  // A badly-wounded robot vents smoke + arcs electricity from its breached
  // plating. This is the next-emit timestamp (ms) so the venting is rate-limited
  // per enemy rather than spawned every frame. Reset on (re)spawn.
  nextDamageFxAt?: number;
  // ── Decapitation neck stub ───────────────────────────────────────────────
  // Torn-cable bundle left sparking in the neck after the head is popped off
  // (the flying head gib carries its own matching wires). Attached to the
  // pooled mesh, so it MUST be detached when the corpse is recycled.
  neckWires?: THREE.Group;

  // ══ TACTICAL ARCHETYPES ═════════════════════════════════════════════════
  //
  // ⚠ POOL DISPOSAL: every Object3D attached to a pooled enemy mesh below is
  // tagged with a `userData.isX` flag and MUST be detached in createEnemy's
  // acquire path, or the next enemy to occupy that pool slot inherits it. The
  // shared geometry/material is owned by the builder, never by the enemy — so
  // these are DETACH-only, never dispose.

  /**
   * BULWARK — the frontal energy shield mesh. Damage from within ±SHIELD_ARC
   * of the enemy's facing is almost entirely absorbed; flank or rear shots
   * land in full. This is what turns a stand-and-shoot fight into a
   * reposition-first fight.
   */
  bulwarkShield?: THREE.Mesh;
  /** Flashes when the shield eats a hit, so blocked damage reads as blocked. */
  bulwarkFlash?: number;

  /**
   * HOWLER — the aura ring mesh, plus the next-pulse timestamp. While alive it
   * grants nearby allies an overshield; ignoring it makes the whole swarm
   * durable, which is the pressure that forces target prioritisation.
   */
  howlerAura?: THREE.Mesh;
  howlerNextPulseAt?: number;

  /**
   * Overshield granted BY a Howler (absorbs damage before health). Lives on
   * the recipient, not the caster, and decays once the Howler dies.
   */
  overshield?: number;
  overshieldUntil?: number;
  /**
   * Direct handle to the marker ring worn while shielded.
   *
   * Stored rather than re-discovered with `mesh.children.find(...)`: that ran
   * in the bullet-hit path and once per frame per shielded enemy, allocating a
   * closure and walking the child array each time. Shared geo+mat — detach
   * only, and clear this field alongside it.
   */
  overshieldRing?: THREE.Mesh;

  /**
   * LEAPER — pounce state machine.
   * `leapState`: idle → crouching (the telegraph) → airborne → recovering.
   * The crouch is deliberately long enough (and loud enough, see enemy_attack)
   * to be reacted to; the payoff is that it clears cover the player is using.
   */
  leapState?: 'idle' | 'crouch' | 'air' | 'recover';
  leapUntil?: number;
  leapNextAt?: number;
  leapVel?: THREE.Vector3;

  /**
   * SPLITTER — whether this unit spawns children on death. Children are
   * flagged false so a split can never cascade.
   */
  canSplit?: boolean;

  /**
   * Forces HIGH LOD regardless of distance.
   *
   * ⚠ LOAD-BEARING. Only HIGH-LOD enemies are damageable (see isDetailReady in
   * SmartEnemyManager — the 45 m floor is deliberate and only ever scales UP).
   * A support archetype that hangs at the BACK of the pack would therefore be
   * literally invulnerable on low graphics presets. Rather than lowering that
   * floor for everything, a handful of must-be-killable elites opt out here.
   */
  alwaysDamageable?: boolean;

  /** Next allowed hazard-pool damage tick (ms) — throttles the lava/sludge burn. */
  nextHazardTickAt?: number;
}

export interface Bullet {
  // Group for compound bullets (glow + core), Mesh for the rocket. Both
  // expose .position / .quaternion / .add to scene the same way.
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  life: number;
  damage: number;
  /** Rocket-launcher projectile — explodes with area damage + a crater. */
  isRocket?: boolean;
  /** Remaining over-penetrations (see Weapon.pierce). Decrements per body. */
  pierceLeft?: number;
  /** Damage fraction kept per punched-through body (weapon.pierceRetain). */
  pierceRetain?: number;
  /** Enemies this round has already passed through — never re-hit by the same
   *  bullet. Reused (cleared) with the pooled record, never reallocated. */
  hitEnemies?: Set<Enemy>;
}

export type PowerUpType = 'ammo' | 'speed' | 'damage' | 'shield' | 'infinite_ammo' | 'overcharge' | 'phantom'
  | 'cryo' | 'tesla' | 'shockwave' | 'health' | 'nuke';

export interface PowerUp {
  mesh: THREE.Mesh;
  type: PowerUpType;
  position: THREE.Vector3;
  collected: boolean;
}

export interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface Tree {
  mesh: THREE.Group;
  x: number;
  z: number;
}

/**
 * What standing in this pool actually DOES.
 *
 * Lava, toxic sludge and frozen ponds were `type: 'water', collidable: false`
 * — i.e. painted decoration. They did no damage, applied no slow, blocked
 * nothing. Combined with `MapConfig` being ~36 visual fields to ~5 gameplay
 * ones, that's most of why the eight maps differed only by colour grade.
 *
 * Tagging them here lets the same scattered props finally carry a rule, so a
 * map's terrain is something the player has to fight around.
 */
export type HazardKind = 'lava' | 'toxic' | 'ice';

export interface TerrainObject {
  mesh: THREE.Group | THREE.Mesh;
  x: number;
  z: number;
  type: 'tree' | 'rock' | 'boulder' | 'bush' | 'water' | 'cactus';
  collidable: boolean;
  radius: number;
  height?: number; // Collidable height — player can jump over if above this Y
  /** Set on pools that damage/slow whatever stands in them. */
  hazard?: HazardKind;
}

export interface Keys {
  [key: string]: boolean;
}

export interface GameState {
  health: number;
  maxHealth: number; // dynamic, boosted by Thick Skin skill
  ammo: number;
  maxAmmo: number;
  score: number;
  enemiesKilled: number;
  wave: number;
  isGameOver: boolean;
  isVictory: boolean;
  combo: number;
  killStreak: number;
  currentWeapon: string;
  unlockedWeapons: string[];
  /** Weapon Mastery snapshot for the EQUIPPED weapon — drives the small
   *  XP sliver under the ammo counter. Omitted when the player isn't
   *  signed in / in tutorial / on guest play. */
  weaponMastery?: { level: number; intoLevel: number; nextLevelXp: number };
  /** Difficulty-scaled multiplier applied to every weapon's unlockScore (easy 1×,
   *  medium/hard higher, adaptive dynamic). Drives the locked-weapon "Unlocks at
   *  N pts" readout in the HUD. Defaults to 1 when omitted. */
  weaponUnlockMult?: number;
  /** This-run headshot (critical hit) count. Drives the compact combat-stats
   *  readout docked under the Solo/Tutorial tactical map. Omitted in
   *  multiplayer (per-player headshots aren't tracked over the network). */
  headshots?: number;
}
