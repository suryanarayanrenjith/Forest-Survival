import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type GraphicsPreset } from './GameSettingsManager';
import { applyRobotSurface } from './RobotSurface';

// ⚠ ADDING A TYPE HERE IS A RIPPLE. The compiler catches most of it (every
// Record<EnemyType, …> below, plus ENEMY_SCALE / ENEMY_SPAWN_CLEARANCE), but
// four things it CANNOT catch and that must be done by hand:
//   1. App.tsx ENEMY_TYPE_CODE / ENEMY_TYPE_FROM_CODE — an APPEND-ONLY wire
//      format. Inserting in the middle silently reassigns archetypes for any
//      client on an older build mid-match.
//   2. App.tsx `warmEnemyTypes` in the shader warmup — omit it and the first
//      spawn of that archetype hitches while its materials link.
//   3. createEnemy's stat switch + AI personality + attackArchetype narrowing.
//   4. Spawn eligibility in spawnWave().
export type EnemyType =
  | 'normal' | 'fast' | 'tank' | 'boss' | 'ranged' | 'revenant'
  // ── TACTICAL ARCHETYPES ──
  // The original six all did the same thing: walk at the player and hit them.
  // Four of them were the same enemy with different HP/speed/scale numbers, so
  // nothing on the field ever asked the player to change what they were doing.
  // Each of these forces a DIFFERENT response instead of just being tougher.
  | 'bulwark'   // frontal shield      → forces flanking
  | 'howler'    // ally overshield aura → forces priority targeting
  | 'leaper'    // telegraphed pounce   → forces reaction, punishes cover
  | 'splitter'; // splits on death      → forces weapon choice and spacing

// Result type for mesh acquisition - used by App.tsx createEnemy
export interface AcquiredMesh {
  mesh: THREE.Group;
  body: THREE.Mesh;
  // Arms are shoulder-PIVOT groups (the arm mesh hangs inside), so rotations
  // swing from the shoulder. Typed Object3D since they're Groups, not Meshes.
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  head: THREE.Mesh;
  /** Shooter archetypes only — bore anchor at the tip of the energy lance.
   *  Undefined for every melee archetype. */
  muzzle?: THREE.Object3D;
  /** Shooter archetypes only — the emissive aperture inside the muzzle. */
  muzzleGlow?: THREE.Mesh;
  /** Shooter archetypes only — the charge-coil stack on the weapon body. */
  weaponGlow?: THREE.Mesh;
  poolId: number;
}

export const LODLevel = {
  HIGH: 0,    // Full detail - close range (0-30 units)
  MEDIUM: 1,  // Reduced detail - medium range (30-60 units)
  LOW: 2,     // Minimal detail - far range (60-100 units)
  CULLED: 3,  // Not visible - beyond view distance or off-screen
} as const;

export type LODLevel = typeof LODLevel[keyof typeof LODLevel];

interface EnemyVisualConfig {
  baseColor: number;   // torso / main shell
  accentColor: number; // limbs
  brightColor: number; // head
  darkColor: number;   // recessed detail (visor, joints)
  glowColor: number;   // emissive core + eye bar
  emissiveIntensity: number;
  scale: number;
}

// Cohesive, slightly-desaturated palette — premium low-poly reads better with
// a controlled value range than with pure primary colors.
// Dark accent colours brightened — the previous near-black values
// (e.g. 0x2e1313) rendered as solid "black panels" on enemy bodies
// under the high-contrast ACES tonemap, which the player perceived as
// a rendering glitch. Bumped roughly +30% lightness while keeping the
// same hue, so visor / joint / hip details stay visibly DARK without
// looking like overlay errors.
const ENEMY_CONFIGS: Record<EnemyType, EnemyVisualConfig> = {
  normal: {
    baseColor: 0xb02f2f,
    accentColor: 0x7c1f1f,
    brightColor: 0xd9544a,
    darkColor: 0x5a2a2a,
    glowColor: 0xff6a3d,
    emissiveIntensity: 0.18,
    scale: 1.0,
  },
  fast: {
    baseColor: 0x2f6fd0,
    accentColor: 0x1f4a9c,
    brightColor: 0x5fa0ec,
    darkColor: 0x2a3a64,
    glowColor: 0x57d6ff,
    emissiveIntensity: 0.22,
    scale: 0.7,
  },
  tank: {
    baseColor: 0x3f8a45,
    accentColor: 0x2a5f30,
    brightColor: 0x6fc06f,
    darkColor: 0x2e5238,
    glowColor: 0x9bff6b,
    emissiveIntensity: 0.14,
    scale: 1.5,
  },
  boss: {
    baseColor: 0x9446c6,
    accentColor: 0x6c2c96,
    brightColor: 0xc77ce6,
    darkColor: 0x432a60,
    glowColor: 0xe85aff,
    emissiveIntensity: 0.28,
    scale: 2.0,
  },
  // Ranged "Sniper" archetype — tall, slender, cyan-trimmed. Visually
  // distinct so the player IDs the threat (must close to break LOS) at a
  // glance, even on busy maps. Slightly above normal height for an
  // unmistakable silhouette. Emissive intensity is INTENTIONALLY low —
  // the cyan palette already reads as bright on the ACES tonemap; the
  // new belt + jet glow + rifle muzzle stack tipped the original 0.24
  // value over the edge into "glowstick", so we hold it back to ~0.12.
  ranged: {
    baseColor: 0x1e6f7a,
    accentColor: 0x144c55,
    brightColor: 0x55c5d6,
    darkColor: 0x153a42,
    glowColor: 0x4ad4e6,
    emissiveIntensity: 0.12,
    scale: 1.05,
  },
  // Revenant — the rare APEX TRICKSTER. A small, fast-ish, dark-slate body lit
  // by molten GOLD energy (its own unmistakable hue — no other enemy is gold).
  // Teleports, shields, shoots and regenerates: the smartest, most dangerous
  // foe in the game. Higher emissive so the gold reads "elite/charged" even at
  // distance, and a sub-1.0 scale so its silhouette stays small & quick.
  revenant: {
    baseColor: 0x2a2233,   // dark indigo-slate shell
    accentColor: 0x4a3a14, // burnished gold limbs
    brightColor: 0xffe08a, // bright gold head/plate
    darkColor: 0x14101a,   // near-black recesses
    glowColor: 0xffc24a,   // molten gold core/eyes/shield
    emissiveIntensity: 0.34,
    scale: 0.85,
  },
  // BULWARK — a walking wall. Heavy slate-and-steel body with a cold cyan
  // shield glow so the protected arc is readable at a glance: the player has
  // to SEE which way it's facing to know where it's safe to shoot from.
  bulwark: {
    baseColor: 0x3d4550,
    accentColor: 0x2a303a,
    brightColor: 0x7f93a8,
    darkColor: 0x20252e,
    glowColor: 0x5fd8ff,
    emissiveIntensity: 0.26,
    scale: 1.35,
  },
  // HOWLER — support caster. Violet-white and deliberately spindly: a small,
  // non-threatening silhouette the player must learn to prioritise ANYWAY,
  // which is the whole lesson of the archetype.
  howler: {
    baseColor: 0x5b3f7a,
    accentColor: 0x412c59,
    brightColor: 0xc9a6ee,
    darkColor: 0x281a36,
    glowColor: 0xd08cff,
    emissiveIntensity: 0.38,
    scale: 0.95,
  },
  // LEAPER — coiled and lean, hot orange. Reads as "about to move fast".
  leaper: {
    baseColor: 0x8a4420,
    accentColor: 0x5e2d14,
    brightColor: 0xe08a4a,
    darkColor: 0x3a1c0d,
    glowColor: 0xff8c2e,
    emissiveIntensity: 0.30,
    scale: 0.9,
  },
  // SPLITTER — bloated and sickly green, visually unstable. The bulk telegraphs
  // that there is something inside it.
  splitter: {
    baseColor: 0x4a6b32,
    accentColor: 0x354d23,
    brightColor: 0x9ccc5f,
    darkColor: 0x24331a,
    glowColor: 0xb6ff5a,
    emissiveIntensity: 0.32,
    scale: 1.25,
  },
};

/**
 * Per-type body scale — THE single source of truth.
 *
 * This used to be a hand-written ternary chain duplicated at seven separate
 * call sites in App.tsx (hit tests, headshot height, ragdoll launch, death
 * anim, terrain grounding, battle-damage stamping). Three of those copies had
 * silently drifted and omitted `ranged` entirely, so sniper enemies were
 * ragdolled, animated and ground-clamped at 1.0 instead of 1.05.
 *
 * Derived from ENEMY_CONFIGS so it can never drift again, and typed as
 * Record<EnemyType, number> so adding an archetype to the union is a COMPILE
 * ERROR here rather than a silent fall-through to 1.0.
 */
export const ENEMY_SCALE: Record<EnemyType, number> = Object.fromEntries(
  (Object.keys(ENEMY_CONFIGS) as EnemyType[]).map((t) => [t, ENEMY_CONFIGS[t].scale]),
) as Record<EnemyType, number>;

/**
 * Spawn-clearance radius (m) — how much empty ground an enemy of this type
 * needs to materialise into without ending up inside a tree trunk.
 *
 * Deliberately NOT derived from ENEMY_SCALE: it's a hand-tuned spawn-placement
 * value, not a mesh dimension (a tank is scale 1.5 but wants 1.6 m of slack).
 * Lives here, next to the type union, purely so adding an archetype is a
 * compile error rather than a silent fall-through to the default.
 */
export const ENEMY_SPAWN_CLEARANCE: Record<EnemyType, number> = {
  normal: 1.2,
  fast: 1.2,
  tank: 1.6,
  boss: 2.0,
  ranged: 1.2,
  revenant: 1.2,
  bulwark: 1.5,
  howler: 1.2,
  leaper: 1.2,
  splitter: 1.5,
};

// Shared geometry cache - created once, reused for all enemies
interface SharedGeometries {
  bodyHigh: THREE.BoxGeometry;
  armHigh: THREE.BoxGeometry;
  legHigh: THREE.BoxGeometry;
  headHigh: THREE.BoxGeometry;
  eyeHigh: THREE.BoxGeometry;
  // High-detail accent pieces (premium low-poly silhouette)
  chestHigh: THREE.BoxGeometry;
  coreHigh: THREE.OctahedronGeometry;
  shoulderHigh: THREE.BoxGeometry;
  visorHigh: THREE.BoxGeometry;
  footHigh: THREE.BoxGeometry;
  handHigh: THREE.BoxGeometry;
  // ── HEAD CREST ────────────────────────────────────────────────────────
  // Was a single 4-segment ConeGeometry. A cone carries CYLINDRICAL UVs — one
  // wrapped, radially-pinched texture tile — so once the armour maps went on,
  // the crest smeared a whole stretched panel around itself while the box-UV'd
  // skull beside it showed a crisp plate. It read as a low-res part bolted onto
  // a different model. Rebuilt as three tapered BOXES: same swept silhouette,
  // but it shares the head's exact texel density and panel language, so it
  // finally reads as one piece of armour with the skull.
  crestBaseHigh: THREE.BoxGeometry;
  crestBladeHigh: THREE.BoxGeometry;
  crestTipHigh: THREE.BoxGeometry;
  /** Revenant horn segment — same box-UV treatment as the crest. */
  hornHigh: THREE.BoxGeometry;
  hipHigh: THREE.BoxGeometry;
  // NEW detail pieces — small dressing that adds visual interest without
  // exploding mesh count. All ride on the existing animated parts.
  beltHigh: THREE.BoxGeometry;       // glowing waist strip (on body)
  kneePadHigh: THREE.BoxGeometry;    // small dark plate halfway down the leg
  elbowPadHigh: THREE.BoxGeometry;   // matching elbow plate on the arm
  // Sensor whip on the head. Was a ConeGeometry that was allocated on every
  // init and then never added to a single mesh — dead geometry. Now a box (same
  // UV-consistency reason as the crest) and actually fitted, merged into the
  // head's dark set so it costs no extra draw.
  antennaHigh: THREE.BoxGeometry;
  jetVentHigh: THREE.BoxGeometry;    // back panel (glow vent)
  // ── ENEMY ENERGY LANCE ───────────────────────────────────────────────
  // The shooter archetypes used to carry TWO boxes — a 0.18×0.22×0.46 stock
  // and a 0.08×0.08×1.4 stick — which is why the thing in their hands read as
  // a plank rather than a weapon. These are the parts of a real bullpup energy
  // rifle: receiver, heat shroud, bored barrel, optic, powercell, muzzle
  // prongs and the emissive coil stack that charges before it fires.
  wpnReceiver: THREE.BoxGeometry;
  wpnStock: THREE.BoxGeometry;
  wpnGrip: THREE.BoxGeometry;
  wpnShroud: THREE.BoxGeometry;
  wpnBarrel: THREE.CylinderGeometry;
  wpnScopeTube: THREE.CylinderGeometry;
  wpnScopeMount: THREE.BoxGeometry;
  wpnCell: THREE.BoxGeometry;
  wpnProng: THREE.BoxGeometry;
  wpnFin: THREE.BoxGeometry;          // revenant: swept crest fins
  wpnCoil: THREE.TorusGeometry;       // emissive charge ring around the barrel
  wpnCellWindow: THREE.BoxGeometry;   // emissive strip in the powercell
  wpnEmitter: THREE.SphereGeometry;   // glowing bore aperture at the muzzle
  // Previously allocated FRESH per spawn (and leaked) — now shared.
  jetGlowHigh: THREE.BoxGeometry;     // glow stripe on the backpack vent

  bodyMedium: THREE.BoxGeometry;
  limbMedium: THREE.BoxGeometry; // Single geometry for arms/legs
  headMedium: THREE.BoxGeometry;

  bodyLow: THREE.BoxGeometry;
}

interface PooledEnemyMesh {
  group: THREE.Group;
  lodGroups: {
    high: THREE.Group;
    medium: THREE.Group;
    low: THREE.Group;
  };
  parts: {
    body?: THREE.Mesh;
    leftArm?: THREE.Object3D;   // shoulder-pivot group
    rightArm?: THREE.Object3D;  // shoulder-pivot group
    leftLeg?: THREE.Mesh;
    rightLeg?: THREE.Mesh;
    head?: THREE.Mesh;
    leftEye?: THREE.Mesh;
    rightEye?: THREE.Mesh;
    // ── Shooter archetypes only (ranged / revenant) ──
    /** Bore anchor at the tip of the energy lance. Bolts launch from its WORLD
     *  position, so a shot always leaves the actual barrel. */
    muzzle?: THREE.Object3D;
    /** The glowing aperture inside `muzzle` — scaled by the charge animation. */
    muzzleGlow?: THREE.Mesh;
    /** Charge-coil stack + powercell window on the weapon body. */
    weaponGlow?: THREE.Mesh;
  };
  currentLOD: LODLevel;
  inUse: boolean;
  type: EnemyType | null;
  lastActivationTime: number;
  // Meshes that cast a shadow (collected at build), plus the current gate
  // state, so distant enemies can drop shadow casting without a recompile.
  shadowCasters?: THREE.Mesh[];
  castsShadow?: boolean;
}

interface PerformanceMetrics {
  frameCount: number;
  totalFrameTime: number;
  avgFPS: number;
  lastMeasureTime: number;
  consecutiveLowFPSFrames: number;
  consecutiveHighFPSFrames: number;
}

// BASE LOD distance thresholds — scaled at runtime by the graphics preset's
// viewDistance (see lodScale in updateEnemyLOD) so enemy culling is
// PROPORTIONAL to the player's chosen render distance: Ultra (300 m) keeps
// full crowds visible far past the old fixed 100 m wall, Low (72 m) culls
// tighter and saves the frame budget where it matters.
// HIGH_TO_MEDIUM is pushed out to 45 m so the FULL-detail model (the only state
// in which an enemy is damageable — see isDetailReady) covers a believable
// engagement range; below this an enemy is the simplified "half texture" mesh
// the player is not allowed to damage. Its 45 m FLOOR is load-bearing — it
// only ever scales UP (capped ×1.5) so no preset can shrink the damage window.
const LOD_DISTANCES = {
  HIGH_TO_MEDIUM: 45,
  MEDIUM_TO_LOW: 70,
  LOW_TO_CULLED: 100,
};
// viewDistance at which the base thresholds apply unscaled (the High preset).
const LOD_REFERENCE_VIEW_DISTANCE = 150;

// Beyond this distance an enemy stops casting a real-time shadow. A shadow at
// 40 m is a few pixels on screen and reads as noise, but every caster past it
// still costs a full extra draw in the directional light's shadow pass each
// frame — the cost that scales hardest with crowd size. Gated per-enemy on the
// throttled LOD tick (a cheap castShadow toggle, never a recompile), so close
// enemies keep their full, crisp shadows and only distant ones are dropped.
const SHADOW_CAST_DISTANCE = 40;

const PERFORMANCE_THRESHOLDS = {
  TARGET_FPS: 55,
  LOW_FPS: 40,
  HIGH_FPS: 58,
  MEASURE_INTERVAL: 1000, // 1 second
  ADJUSTMENT_COOLDOWN: 2000, // 2 seconds between adjustments
};

class SmartEnemyManager {
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private graphicsPreset: GraphicsPreset | null = null;

  private sharedGeometries: SharedGeometries | null = null;
  private sharedMaterials: Map<string, THREE.MeshStandardMaterial> = new Map();
  private eyeMaterial: THREE.MeshBasicMaterial | null = null;
  // Static sub-pieces that share a material AND ride the same animated part
  // are pre-merged into one geometry (built lazily, cached forever). Cuts an
  // enemy's HIGH-LOD draw calls nearly in half with pixel-identical output.
  private mergedGeoCache: Map<string, THREE.BufferGeometry> = new Map();

  private enemyPool: PooledEnemyMesh[] = [];
  private poolSize: number = 0;
  private maxPoolSize: number = 50;

  private activeEnemies: Set<PooledEnemyMesh> = new Set();

  private metrics: PerformanceMetrics = {
    frameCount: 0,
    totalFrameTime: 0,
    avgFPS: 60,
    lastMeasureTime: 0,
    consecutiveLowFPSFrames: 0,
    consecutiveHighFPSFrames: 0,
  };

  private currentMaxEnemies: number = 40;
  private baseMaxEnemies: number = 40;
  // Continuous day→night blend for the enemy "powered" glow (0 = full daylight,
  // 1 = full night). Seeded to -1 so the first setNightFactor() always applies.
  private nightFactor: number = -1;
  // OVERDRIVE SURGE blend (0 = normal, 1 = fully overclocked). During a surge
  // wave every enemy's energy set (eye bar / core / belt / vent / muzzle) is
  // dragged toward burning RED and overdriven brighter — one shared-material
  // write recolours the ENTIRE crowd for free. Seeded -1 so the first
  // setSurgeFactor() always applies.
  private surgeFactor: number = -1;
  // Reused temp for the surge colour lerp (no per-call allocation).
  private readonly _surgeTmpColor = new THREE.Color();
  private static readonly SURGE_RED = new THREE.Color(0xff2012);

  private frustum: THREE.Frustum = new THREE.Frustum();
  private frustumMatrix: THREE.Matrix4 = new THREE.Matrix4();

  // NOTE: this class deliberately keeps NO spatial index of its own. It used
  // to maintain a string-keyed `Map<"x,z", Set<PooledEnemyMesh>>` that was
  // rebuilt for every active enemy on each LOD tick — and never once read.
  // The only live neighbour queries in the game run against the frame-rebuilt
  // `enemyGrid` (a packed-integer-key `SpatialGrid`) in App.tsx, which is both
  // authoritative and far cheaper. Don't reintroduce a second index here.

  private lastLODUpdateTime: number = 0;
  private lodUpdateInterval: number = 100; // Update LOD every 100ms

  initialize(scene: THREE.Scene, camera: THREE.Camera, graphicsPreset: GraphicsPreset): void {
    this.scene = scene;
    this.camera = camera;
    this.graphicsPreset = graphicsPreset;

    this.baseMaxEnemies = graphicsPreset.maxEnemies;
    this.currentMaxEnemies = this.baseMaxEnemies;
    this.maxPoolSize = Math.ceil(this.baseMaxEnemies * 1.5); // Pool 50% extra for smooth spawning

    this.createSharedGeometries();
    this.createSharedMaterials();
    // Fresh materials → re-seed both blend factors so the first
    // setNightFactor()/setSurgeFactor() of the new match always applies
    // (a leftover value from a previous run would early-return past them).
    this.nightFactor = -1;
    this.surgeFactor = -1;

    const initialPoolSize = Math.ceil(this.baseMaxEnemies * 0.75);
    this.warmupPool(initialPoolSize);

  }

  /**
   * Blend the enemy emissive between its low DAYTIME floor and its full NIGHT
   * glow. `t` = 0 (full daylight — the body is lit purely by the sun) → 1 (full
   * night — the internal glow takes over so enemies never crush to black). The
   * caller drives `t` smoothly off the sun's altitude, so the artificial glow
   * fades up at dusk instead of popping. Cached: a steady factor early-returns
   * without touching a single material.
   */
  setNightFactor(t: number): void {
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.abs(this.nightFactor - clamped) < 0.001) return;
    this.nightFactor = clamped;
    this.applyMaterialState();
  }

  /**
   * OVERDRIVE SURGE blend — 0 restores every archetype's signature energy
   * colour; 1 drags all the emissive "energy" parts (eye bar, chest core,
   * belt, vent stripe, rifle muzzle) to burning red and overdrives their
   * intensity. The head plate takes a subtler shift so silhouettes keep their
   * archetype identity. Cheap: touches only the ~36 shared materials, and a
   * steady factor early-returns without touching a single one. The caller
   * eases + pulses `t` per frame, so the crowd visibly THROBS while surged.
   */
  setSurgeFactor(t: number): void {
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.abs(this.surgeFactor - clamped) < 0.003) return;
    this.surgeFactor = clamped;
    this.applyMaterialState();
  }

  /**
   * Single writer for the shared enemy materials: composes the day/night
   * emissive lerp with the surge red-shift so the two systems never clobber
   * each other's writes.
   */
  private applyMaterialState(): void {
    const nf = this.nightFactor < 0 ? 0 : this.nightFactor;
    const sf = this.surgeFactor < 0 ? 0 : this.surgeFactor;
    this.sharedMaterials.forEach((material, key) => {
      const dayI = (material.userData.dayEmissiveIntensity as number | undefined) ?? material.emissiveIntensity;
      const nightI = (material.userData.nightEmissiveIntensity as number | undefined) ?? material.emissiveIntensity;
      let intensity = dayI + (nightI - dayI) * nf;
      // Surge recolour: full red takeover on the glow set, a subtle warm
      // shift on the bright head plate. Base colours were snapshotted at
      // registration so the lerp is always anchored to the true identity hue.
      const baseColor = material.userData.baseColorHex as number | undefined;
      if (baseColor !== undefined) {
        const isGlow = key.endsWith('_glow');
        const isBright = key.endsWith('_bright');
        if (isGlow || isBright) {
          const blend = isGlow ? sf : sf * 0.35;
          this._surgeTmpColor.setHex(baseColor).lerp(SmartEnemyManager.SURGE_RED, blend);
          material.color.copy(this._surgeTmpColor);
          material.emissive.copy(this._surgeTmpColor);
          if (isGlow) intensity *= 1 + sf * 1.5;
        }
      }
      material.emissiveIntensity = intensity;
    });
  }

  private createSharedGeometries(): void {
    this.sharedGeometries = {
      bodyHigh: new THREE.BoxGeometry(1, 1.5, 0.6),
      armHigh: new THREE.BoxGeometry(0.3, 1.2, 0.3),
      legHigh: new THREE.BoxGeometry(0.35, 1, 0.35),
      headHigh: new THREE.BoxGeometry(0.8, 0.8, 0.8),
      eyeHigh: new THREE.BoxGeometry(0.52, 0.1, 0.06),
      chestHigh: new THREE.BoxGeometry(0.74, 0.78, 0.16),
      coreHigh: new THREE.OctahedronGeometry(0.16, 0),
      shoulderHigh: new THREE.BoxGeometry(0.42, 0.34, 0.5),
      visorHigh: new THREE.BoxGeometry(0.72, 0.26, 0.14),
      footHigh: new THREE.BoxGeometry(0.42, 0.2, 0.56),
      handHigh: new THREE.BoxGeometry(0.34, 0.34, 0.34),
      // Crest: mount plate → main fin → tapered tip. Boxes, not a cone (see
      // the interface note) — the taper comes from the three sizes, not from
      // geometry that would pinch its UVs to a point.
      crestBaseHigh:  new THREE.BoxGeometry(0.30, 0.11, 0.48),
      crestBladeHigh: new THREE.BoxGeometry(0.13, 0.34, 0.40),
      crestTipHigh:   new THREE.BoxGeometry(0.085, 0.24, 0.24),
      hornHigh:       new THREE.BoxGeometry(0.075, 0.30, 0.13),
      hipHigh: new THREE.BoxGeometry(0.92, 0.4, 0.56),
      beltHigh:      new THREE.BoxGeometry(1.06, 0.12, 0.62),
      kneePadHigh:   new THREE.BoxGeometry(0.42, 0.18, 0.42),
      elbowPadHigh:  new THREE.BoxGeometry(0.36, 0.16, 0.36),
      antennaHigh:   new THREE.BoxGeometry(0.045, 0.46, 0.045),
      jetVentHigh:   new THREE.BoxGeometry(0.62, 0.6, 0.14),
      // Energy lance. Authored on their natural axes; the merge below rotates
      // the cylinders/tori down the +Z bore.
      wpnReceiver:   new THREE.BoxGeometry(0.15, 0.20, 0.68),
      wpnStock:      new THREE.BoxGeometry(0.12, 0.16, 0.30),
      wpnGrip:       new THREE.BoxGeometry(0.10, 0.24, 0.12),
      wpnShroud:     new THREE.BoxGeometry(0.13, 0.13, 0.42),
      wpnBarrel:     new THREE.CylinderGeometry(0.035, 0.030, 0.80, 8),
      wpnScopeTube:  new THREE.CylinderGeometry(0.048, 0.048, 0.32, 8),
      wpnScopeMount: new THREE.BoxGeometry(0.05, 0.10, 0.05),
      wpnCell:       new THREE.BoxGeometry(0.11, 0.21, 0.17),
      wpnProng:      new THREE.BoxGeometry(0.028, 0.028, 0.22),
      wpnFin:        new THREE.BoxGeometry(0.02, 0.15, 0.34),
      wpnCoil:       new THREE.TorusGeometry(0.068, 0.019, 6, 14),
      wpnCellWindow: new THREE.BoxGeometry(0.055, 0.13, 0.02),
      wpnEmitter:    new THREE.SphereGeometry(0.055, 10, 8),
      jetGlowHigh:   new THREE.BoxGeometry(0.46, 0.08, 0.04),

      bodyMedium: new THREE.BoxGeometry(1, 1.5, 0.6, 1, 1, 1),
      limbMedium: new THREE.BoxGeometry(0.4, 1.5, 0.4, 1, 1, 1),
      headMedium: new THREE.BoxGeometry(0.8, 0.8, 0.8, 1, 1, 1),

      bodyLow: new THREE.BoxGeometry(1.2, 2.5, 0.8, 1, 1, 1),
    };
  }

  private createSharedMaterials(): void {
    // MeshBasicMaterial is unlit and appears at full brightness
    this.eyeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      toneMapped: false,
      fog: false,
    });

    const registerMaterial = (
      key: string,
      material: THREE.MeshStandardMaterial,
      nightMultiplier: number,
      dayFactor: number = 0.22,
    ) => {
      // Absolute DAY + NIGHT emissive targets, lerped by setNightFactor(). NIGHT
      // is the original look (creation value × nightMultiplier — unchanged); DAY
      // floors the self-illumination down so daylight reads off the SUN, not the
      // material. dayFactor stays higher for structural/energy parts so joints
      // and the eye/core never vanish.
      const created = material.emissiveIntensity;
      material.userData.dayEmissiveIntensity = created * dayFactor;
      material.userData.nightEmissiveIntensity = created * nightMultiplier;
      // Identity-hue anchor for the OVERDRIVE SURGE red-shift (setSurgeFactor)
      // — the lerp always starts from this snapshot, never from a half-shifted
      // live colour, so repeated surges can't drift the palette.
      material.userData.baseColorHex = material.color.getHex();
      // Seed at the day floor; the first setNightFactor() sets the real value.
      material.emissiveIntensity = created * dayFactor;
      this.sharedMaterials.set(key, material);
    };

    // Create materials for each enemy type.
    // PBR (MeshStandardMaterial) gives the "robot" enemies a proper metallic
    // sheen and lets them pick up the scene environment map — far richer than
    // the old flat Lambert shading. Flat shading is kept for the crisp,
    // intentional faceted silhouette.
    // CRITICAL: enemy materials use VERY low metalness + strong emissive
    // so they're SELF-LIT and don't depend on the environment / ambient
    // light. At evening / night the env map is dim, ambient is low, and
    // any material that relies on those will render as a dark silhouette.
    // By driving brightness from EMISSIVE (which is constant regardless
    // of scene lighting), the enemies stay visible 24/7.
    //
    // The emissive multipliers below are intentionally HIGH (3-4×) — the
    // ACES tonemap rolls them back to a sensible range, and bloom catches
    // their highlights for a proper "self-illuminated robot" look.
    // ── ULTRA-LOW OPT-OUT ──────────────────────────────────────────────
    // The "potato" tier renders at 50% scale with no post-processing, so the
    // armour micro-surface is literally sub-pixel there — it would cost four
    // texture fetches per fragment and ~16 MB of VRAM on exactly the hardware
    // that can least afford either, to produce something the player cannot
    // see. Every other tier gets the full detail. (Only ONE of the two shapes
    // is ever used within a session, so shader warmup still covers whichever
    // it is.) 0.50 is the ultra-low render scale; the next tier up is 0.65.
    const detailedSurfaces = (this.graphicsPreset?.pixelRatio ?? 1) > 0.6;
    const surface = (m: THREE.MeshStandardMaterial, kind: 'plate' | 'limb' | 'greeble') =>
      detailedSurfaces ? applyRobotSurface(m, kind) : m;

    for (const [type, config] of Object.entries(ENEMY_CONFIGS)) {
      // ── SURFACE DETAIL ────────────────────────────────────────────────
      // Every structural material carries the shared machined-armour maps
      // (albedo × roughness × normal, plus cavity AO read from the normal
      // map's alpha) so a torso plate, a shoulder pad and a shin now show
      // bevelled rims, panel gaps, construction seams, corner fasteners and
      // combat weathering instead of one flat colour. See RobotSurface —
      // it is ONE shared texture set and ONE shader program for the whole
      // cast, so the warmup guarantee is unaffected.
      //
      // Metalness is lifted off zero now that there is a real roughness map
      // to break up the specular: the plates finally read as METAL under the
      // moving sun/muzzle light rather than as painted card. It stays low so
      // the enemies never go dark when the env map does (the emissive term is
      // what keeps them visible at night — see the note above).

      // Body material — strongest emissive boost so the torso reads bright.
      registerMaterial(`${type}_body`, surface(new THREE.MeshStandardMaterial({
        color: config.baseColor,
        emissive: config.baseColor,
        emissiveIntensity: config.emissiveIntensity * 5.5,
        metalness: 0.22,
        roughness: 0.52,
        flatShading: true,
      }), 'plate'), 1.12);

      registerMaterial(`${type}_accent`, surface(new THREE.MeshStandardMaterial({
        color: config.accentColor,
        emissive: config.accentColor,
        emissiveIntensity: config.emissiveIntensity * 4.4,
        metalness: 0.22,
        roughness: 0.5,
        flatShading: true,
      }), 'limb'), 1.1);

      registerMaterial(`${type}_bright`, surface(new THREE.MeshStandardMaterial({
        color: config.brightColor,
        emissive: config.brightColor,
        emissiveIntensity: config.emissiveIntensity * 6.2,
        metalness: 0.26,
        roughness: 0.46,
        flatShading: true,
      }), 'plate'), 1.15);

      registerMaterial(`${type}_low`, new THREE.MeshStandardMaterial({
        color: config.baseColor,
        emissive: config.baseColor,
        emissiveIntensity: config.emissiveIntensity * 5.5,
        metalness: 0.0,
        roughness: 0.52,
        flatShading: true,
      }), 1.1);

      // Dark recessed-detail material (visor frame, joints, hips, vents, and
      // the ranged/revenant weapon bodies). Brighter darkColor + meaningful
      // emissive so it reads as DARK not BLACK in low-light conditions.
      // Takes the `greeble` surface — deep slats and a machined service band,
      // so the parts that read as "inside the chassis" look like mechanism.
      registerMaterial(`${type}_dark`, surface(new THREE.MeshStandardMaterial({
        color: config.darkColor,
        emissive: config.darkColor,
        emissiveIntensity: 1.65,
        metalness: 0.35,
        roughness: 0.68,
        flatShading: true,
      }), 'greeble'), 1.3, 0.55);

      // Glowing energy material (chest core, eye bar) — strong emissive so it
      // catches the bloom pass and reads as a light source.
      registerMaterial(`${type}_glow`, new THREE.MeshStandardMaterial({
        color: config.glowColor,
        emissive: config.glowColor,
        emissiveIntensity: 4.8,
        metalness: 0,
        roughness: 0.3,
        flatShading: true,
      }), 1.4, 0.5);
    }
  }

  /**
   * Enemies are small, high-contrast targets made from intersecting low-poly
   * parts. Letting screen-space AO run across those seams produced black
   * panels during dusk/night. They still cast shadows into the world; they
   * simply opt out of receiving the full-screen AO composite.
   */
  private markEnemyAOSafe(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.receiveShadow = false;
      }
    });
  }

  /**
   * Merge a set of shared primitive geometries (each with its original local
   * transform baked in) into ONE cached geometry. The merged result renders
   * byte-identically to the individual meshes it replaces — same vertices,
   * same normals, same material — in a single draw call. Keys are
   * type-independent because the part layout is identical across archetypes
   * (only the materials differ).
   */
  private mergedGeo(
    key: string,
    parts: Array<{
      geo: THREE.BufferGeometry;
      pos?: [number, number, number];
      rotX?: number; rotY?: number; rotZ?: number;
    }>,
  ): THREE.BufferGeometry {
    let merged = this.mergedGeoCache.get(key);
    if (merged) return merged;
    const transformed = parts.map((p) => {
      // mergeGeometries needs uniform indexing — normalise to non-indexed.
      // (toNonIndexed returns `this` for already-non-indexed geometry, so
      // clone in that case to avoid mutating the shared primitive.)
      const clone = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      // Rotate X→Y→Z then translate. Cylinders and tori are authored on their
      // own axes, so the weapon build below needs all three to lay a barrel
      // down the +Z bore and fan the muzzle prongs around it.
      if (p.rotX) clone.rotateX(p.rotX);
      if (p.rotY) clone.rotateY(p.rotY);
      if (p.rotZ) clone.rotateZ(p.rotZ);
      if (p.pos) clone.translate(p.pos[0], p.pos[1], p.pos[2]);
      return clone;
    });
    merged = mergeGeometries(transformed, false)!;
    transformed.forEach((g) => g.dispose());
    this.mergedGeoCache.set(key, merged);
    return merged;
  }

  /**
   * Pre-populate the enemy pool
   */
  private warmupPool(count: number): void {
    for (let i = 0; i < count; i++) {
      this.createPooledEnemy();
    }
    this.poolSize = this.enemyPool.length;
  }

  /**
   * Build one visible, temporary mesh for every gameplay archetype during the
   * loader. The regular pool warmup only creates empty Groups; the expensive
   * per-type mesh assembly and the first WebGL program link otherwise happen
   * when that species first unlocks mid-run. These slots are released by pool id
   * after shader warmup, but their type-specific meshes remain in the pool for
   * instant reuse later.
   */
  prewarmEnemyTypes(types: EnemyType[], origin: THREE.Vector3): number[] {
    const ids: number[] = [];
    const mid = (types.length - 1) * 0.5;

    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      let pooledEnemy = this.enemyPool.find(e => !e.inUse && e.type === type);
      if (!pooledEnemy) pooledEnemy = this.enemyPool.find(e => !e.inUse);

      // This intentionally bypasses currentMaxEnemies: prewarm slots are not
      // gameplay spawns and are released before the first playable frame.
      if (!pooledEnemy && this.poolSize < this.maxPoolSize) {
        pooledEnemy = this.createPooledEnemy();
        this.poolSize++;
      }
      if (!pooledEnemy) continue;

      this.setupEnemyMeshes(pooledEnemy, type);
      pooledEnemy.inUse = true;
      pooledEnemy.type = type;
      pooledEnemy.lastActivationTime = performance.now();
      pooledEnemy.group.position.set(origin.x + (i - mid) * 2.4, origin.y, origin.z - 8);
      pooledEnemy.group.rotation.set(0, 0, 0);
      pooledEnemy.group.visible = true;

      // Make every LOD branch visible for the compile pass so the low-LOD
      // material program is also resident before the enemy moves far away.
      pooledEnemy.lodGroups.high.visible = true;
      pooledEnemy.lodGroups.medium.visible = true;
      pooledEnemy.lodGroups.low.visible = true;
      pooledEnemy.currentLOD = LODLevel.HIGH;

      this.activeEnemies.add(pooledEnemy);
      ids.push(this.enemyPool.indexOf(pooledEnemy));
    }

    return ids;
  }

  /**
   * Create a single pooled enemy mesh with all LOD levels
   */
  private createPooledEnemy(): PooledEnemyMesh {
    if (!this.sharedGeometries) {
      throw new Error('SmartEnemyManager not initialized');
    }

    const group = new THREE.Group();
    group.visible = false; // Hidden until activated

    // Create LOD groups - all start hidden, applyLOD will show the correct one
    const highGroup = new THREE.Group();
    highGroup.visible = false;
    const mediumGroup = new THREE.Group();
    mediumGroup.visible = false;
    const lowGroup = new THREE.Group();
    lowGroup.visible = false;

    // We'll populate these when the enemy is activated with a specific type
    // This saves memory by not creating meshes until needed

    group.add(highGroup);
    group.add(mediumGroup);
    group.add(lowGroup);

    const pooledEnemy: PooledEnemyMesh = {
      group,
      lodGroups: { high: highGroup, medium: mediumGroup, low: lowGroup },
      parts: {},
      currentLOD: LODLevel.CULLED,
      inUse: false,
      type: null,
      lastActivationTime: 0,
    };

    this.enemyPool.push(pooledEnemy);

    if (this.scene) {
      this.scene.add(group);
    }

    return pooledEnemy;
  }

  /**
   * Setup mesh parts for a specific enemy type
   */
  private setupEnemyMeshes(pooledEnemy: PooledEnemyMesh, type: EnemyType): void {
    if (!this.sharedGeometries) return;

    const config = ENEMY_CONFIGS[type];

    // ── TYPE-AFFINITY FAST PATH ────────────────────────────────────────
    // The acquire path prefers a pooled slot that already holds this exact
    // archetype's meshes. When it found one, everything below is already
    // built — releaseEnemy() reset every transform — so re-asserting the
    // scale is all the work a respawn costs. This turns mid-wave spawns
    // from a ~30-object rebuild into a no-op.
    if (pooledEnemy.type === type && pooledEnemy.parts.body) {
      pooledEnemy.group.scale.setScalar(config.scale);
      return;
    }

    const bodyMat = this.sharedMaterials.get(`${type}_body`)!;
    const accentMat = this.sharedMaterials.get(`${type}_accent`)!;
    const brightMat = this.sharedMaterials.get(`${type}_bright`)!;
    const lowMat = this.sharedMaterials.get(`${type}_low`)!;

    // Clear existing meshes
    this.clearLODGroups(pooledEnemy);

    // HIGH LOD — premium low-poly creature, assembled from MERGED static
    // sub-geometries (grouped per material) parented to the 6 animated parts
    // (body / arms / legs / head). Renders pixel-identically to the old
    // 27-mesh build — same vertices, same materials, same local transforms —
    // at roughly half the draw calls per enemy, and with zero per-spawn
    // geometry allocation (the old build created a fresh jet-glow box and
    // rifle-muzzle sphere on EVERY spawn and never disposed them).
    const highGroup = pooledEnemy.lodGroups.high;
    const G = this.sharedGeometries;
    const darkMat = this.sharedMaterials.get(`${type}_dark`)!;
    const glowMat = this.sharedMaterials.get(`${type}_glow`)!;
    const shadows = this.graphicsPreset?.shadowsEnabled ?? true;

    // ── Torso (+ chest plate, shoulder pads, hips, vent, glow set) ──
    const body = new THREE.Mesh(G.bodyHigh, bodyMat);
    body.castShadow = shadows;
    body.position.y = 0.75;
    highGroup.add(body);
    pooledEnemy.parts.body = body;

    // Bright accents: chest plate + both shoulder pads — one mesh.
    const bodyBright = new THREE.Mesh(this.mergedGeo('body_bright', [
      { geo: G.chestHigh, pos: [0, 0.06, 0.3] },
      { geo: G.shoulderHigh, pos: [-0.62, 0.52, 0] },
      { geo: G.shoulderHigh, pos: [0.62, 0.52, 0] },
    ]), brightMat);
    bodyBright.castShadow = shadows;
    body.add(bodyBright);

    // Dark fittings: hip block + backpack vent — one mesh.
    const bodyDark = new THREE.Mesh(this.mergedGeo('body_dark', [
      { geo: G.hipHigh, pos: [0, -0.8, 0] },
      { geo: G.jetVentHigh, pos: [0, 0.05, -0.36] },
    ]), darkMat);
    bodyDark.castShadow = shadows;
    body.add(bodyDark);

    // Glow set: power core + waist belt + vent stripe — one mesh. Same
    // per-type glow material as before so each archetype keeps its colour
    // identity (red / cyan / green / …).
    const bodyGlow = new THREE.Mesh(this.mergedGeo('body_glow', [
      { geo: G.coreHigh, pos: [0, 0.06, 0.41] },
      { geo: G.beltHigh, pos: [0, -0.5, 0] },
      { geo: G.jetGlowHigh, pos: [0, -0.18, -0.43] },
    ]), glowMat);
    body.add(bodyGlow);

    // ── Arms (fist + elbow pad merged into one dark mesh per arm) ──
    // Each arm hangs from a SHOULDER PIVOT group: the arm mesh sits 0.6 below
    // the pivot (= the old centred rest position, so the idle silhouette is
    // pixel-identical), but walk / attack / summon rotations now swing the arm
    // about the SHOULDER instead of spinning it around its own middle — the
    // "propeller arm" look, most obvious on the 2× boss, is gone.
    const armDarkGeo = this.mergedGeo('arm_dark', [
      { geo: G.handHigh, pos: [0, -0.62, 0] },
      { geo: G.elbowPadHigh, pos: [0, -0.10, 0] },
    ]);
    const SHOULDER_Y = 1.2; // pivot height (arm spans pivot → pivot−1.2)
    const makeArm = (side: -1 | 1): { pivot: THREE.Group; armMesh: THREE.Mesh } => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.65, SHOULDER_Y, 0);
      highGroup.add(pivot);
      const armMesh = new THREE.Mesh(G.armHigh, accentMat);
      armMesh.castShadow = shadows;
      armMesh.position.set(0, -0.6, 0); // hang the centred box below the shoulder
      pivot.add(armMesh);
      armMesh.add(new THREE.Mesh(armDarkGeo, darkMat));
      return { pivot, armMesh };
    };
    const leftArmRig = makeArm(-1);
    pooledEnemy.parts.leftArm = leftArmRig.pivot;
    const rightArmRig = makeArm(1);
    pooledEnemy.parts.rightArm = rightArmRig.pivot;

    // ── SHOOTER ARCHETYPES — build the energy lance into the right hand ──
    //
    // Both shooters carry a real weapon now instead of two stacked boxes. It is
    // assembled as THREE objects and no more:
    //
    //   • one merged DARK mesh — receiver, stock, grip, heat shroud, bored
    //     barrel, optic, powercell, muzzle prongs (and the revenant's crest
    //     fins). One draw, one cached geometry per archetype.
    //   • one merged GLOW mesh — the charge-coil stack around the barrel and
    //     the powercell window. Driven by the charge animation in App.
    //   • one muzzle GROUP holding the bore emitter. It is the anchor the bolt
    //     actually spawns from — previously bolts were launched from a fixed
    //     offset off the enemy's ROOT, so an energy round visibly came out of
    //     the sniper's chest while the barrel pointed somewhere else.
    //
    // Everything parents to the arm MESH (not the shoulder pivot) so it keeps
    // its exact offset relative to the hand as the arm swings.
    if (type === 'ranged' || type === 'revenant') {
      const rev = type === 'revenant';
      // Grip point in the hand, and how far the bore runs forward from it.
      const hy = rev ? -0.62 : -0.66;
      const reach = rev ? 0.88 : 1.0;   // revenant carries a shorter carbine
      const key = rev ? 'rev_lance' : 'lance';

      const lanceDark = new THREE.Mesh(this.mergedGeo(`${key}_dark`, [
        // Body: bullpup receiver with the cell behind the grip.
        { geo: G.wpnReceiver, pos: [0, hy, 0.30 * reach] },
        { geo: G.wpnStock,    pos: [0, hy - 0.01, -0.06] },
        { geo: G.wpnGrip,     rotX: 0.22, pos: [0, hy - 0.19, 0.20 * reach] },
        { geo: G.wpnCell,     pos: [0, hy - 0.15, 0.52 * reach] },
        // Bore: shroud, then the barrel proper (cylinder authored on Y).
        { geo: G.wpnShroud,   pos: [0, hy, 0.82 * reach] },
        { geo: G.wpnBarrel,   rotX: Math.PI / 2, pos: [0, hy, 1.16 * reach] },
        // Optic sitting on a two-point rail.
        { geo: G.wpnScopeTube,  rotX: Math.PI / 2, pos: [0, hy + 0.17, 0.44 * reach] },
        { geo: G.wpnScopeMount, pos: [0, hy + 0.09, 0.32 * reach] },
        { geo: G.wpnScopeMount, pos: [0, hy + 0.09, 0.56 * reach] },
        // Muzzle brake — three prongs fanned around the bore.
        { geo: G.wpnProng, rotZ: 0,               pos: [0, hy + 0.075, 1.52 * reach] },
        { geo: G.wpnProng, rotZ: (Math.PI * 2) / 3, pos: [0.065, hy - 0.038, 1.52 * reach] },
        { geo: G.wpnProng, rotZ: -(Math.PI * 2) / 3, pos: [-0.065, hy - 0.038, 1.52 * reach] },
        // Revenant only: swept crest fins that mirror its head horns, so the
        // apex trickster's weapon reads as regalia rather than issue kit.
        ...(rev ? [
          { geo: G.wpnFin, rotZ:  0.42, pos: [ 0.10, hy + 0.10, 0.66 * reach] as [number, number, number] },
          { geo: G.wpnFin, rotZ: -0.42, pos: [-0.10, hy + 0.10, 0.66 * reach] as [number, number, number] },
        ] : []),
      ]), darkMat);
      lanceDark.castShadow = shadows;
      rightArmRig.armMesh.add(lanceDark);

      // Charge coils + cell window — the emissive set the shot charges through.
      const lanceGlow = new THREE.Mesh(this.mergedGeo(`${key}_glow`, [
        { geo: G.wpnCoil, pos: [0, hy, 0.70 * reach] },
        { geo: G.wpnCoil, pos: [0, hy, 0.86 * reach] },
        { geo: G.wpnCoil, pos: [0, hy, 1.02 * reach] },
        { geo: G.wpnCellWindow, rotY: Math.PI / 2, pos: [0.058, hy - 0.15, 0.52 * reach] },
        { geo: G.wpnCellWindow, rotY: Math.PI / 2, pos: [-0.058, hy - 0.15, 0.52 * reach] },
      ]), glowMat);
      rightArmRig.armMesh.add(lanceGlow);
      pooledEnemy.parts.weaponGlow = lanceGlow;

      // Muzzle anchor. A GROUP (not the emitter mesh itself) so the charge
      // animation can scale the glowing aperture without moving the spawn
      // point the bolt is launched from.
      const muzzle = new THREE.Group();
      muzzle.position.set(0, hy, 1.62 * reach);
      rightArmRig.armMesh.add(muzzle);
      const emitter = new THREE.Mesh(G.wpnEmitter, glowMat);
      muzzle.add(emitter);
      pooledEnemy.parts.muzzle = muzzle;
      pooledEnemy.parts.muzzleGlow = emitter;
    }

    // ── Legs (foot + knee pad merged into one dark mesh per leg) ──
    const legDarkGeo = this.mergedGeo('leg_dark', [
      { geo: G.footHigh, pos: [0, -0.56, 0.12] },
      { geo: G.kneePadHigh, pos: [0, -0.05, 0.06] },
    ]);
    const leftLeg = new THREE.Mesh(G.legHigh, accentMat);
    leftLeg.castShadow = shadows;
    leftLeg.position.set(-0.25, -0.5, 0);
    highGroup.add(leftLeg);
    pooledEnemy.parts.leftLeg = leftLeg;
    leftLeg.add(new THREE.Mesh(legDarkGeo, darkMat));

    const rightLeg = new THREE.Mesh(G.legHigh, accentMat);
    rightLeg.castShadow = shadows;
    rightLeg.position.set(0.25, -0.5, 0);
    highGroup.add(rightLeg);
    pooledEnemy.parts.rightLeg = rightLeg;
    rightLeg.add(new THREE.Mesh(legDarkGeo, darkMat));

    // ── Head ──────────────────────────────────────────────────────────────
    // Skull + a three-stage swept dorsal CREST, merged into one bright mesh.
    // Each stage is a box, progressively smaller and raked further back, so the
    // crest tapers through its silhouette rather than through a cone's pinched
    // UVs — it now carries the same armour panel, bevel and fastener density as
    // the skull it grows out of instead of reading as a smeared low-res spike.
    const head = new THREE.Mesh(this.mergedGeo('head_bright', [
      { geo: G.headHigh },
      { geo: G.crestBaseHigh,  rotX: -0.10, pos: [0, 0.435, -0.02] },
      { geo: G.crestBladeHigh, rotX: -0.30, pos: [0, 0.63, -0.075] },
      { geo: G.crestTipHigh,   rotX: -0.58, pos: [0, 0.85, -0.205] },
    ]), brightMat);
    head.castShadow = shadows;
    head.position.y = 1.9;
    highGroup.add(head);
    pooledEnemy.parts.head = head;

    // Visor frame + the sensor whip behind it — one dark mesh, one draw.
    const visor = new THREE.Mesh(this.mergedGeo('head_dark', [
      { geo: G.visorHigh, pos: [0, -0.02, 0.34] },
      { geo: G.antennaHigh, rotZ: 0.16, pos: [0.28, 0.62, -0.14] },
    ]), darkMat);
    head.add(visor);
    const eyeBar = new THREE.Mesh(G.eyeHigh, glowMat);
    eyeBar.position.set(0, -0.02, 0.43);
    head.add(eyeBar);
    pooledEnemy.parts.leftEye = eyeBar;

    // Revenant horns — twin emissive-gold crests swept back off the head. The
    // unmistakable apex-trickster tell on top of the small gold body. Built
    // from two box segments per horn (a long root and a raked tip) for the same
    // reason as the crest, and merged so the pair costs ONE draw rather than
    // two meshes carrying per-instance transforms.
    if (type === 'revenant') {
      const horns = new THREE.Mesh(this.mergedGeo('rev_horns_glow', [
        { geo: G.hornHigh, rotZ:  0.46, rotX: -0.24, pos: [ 0.32, 0.60, -0.05] },
        { geo: G.hornHigh, rotZ: -0.46, rotX: -0.24, pos: [-0.32, 0.60, -0.05] },
        { geo: G.hornHigh, rotZ:  0.62, rotX: -0.62, pos: [ 0.44, 0.83, -0.19] },
        { geo: G.hornHigh, rotZ: -0.62, rotX: -0.62, pos: [-0.44, 0.83, -0.19] },
      ]), glowMat);
      head.add(horns);
    }

    // MEDIUM LOD - Simplified (no separate arms/legs, just body + head)
    const mediumGroup = pooledEnemy.lodGroups.medium;

    const bodyMed = new THREE.Mesh(this.sharedGeometries.bodyMedium, bodyMat);
    bodyMed.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    bodyMed.position.y = 0.75;
    bodyMed.scale.set(1.2, 1, 1);
    mediumGroup.add(bodyMed);

    const headMed = new THREE.Mesh(this.sharedGeometries.headMedium, brightMat);
    headMed.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    headMed.position.y = 1.9;
    mediumGroup.add(headMed);

    // Simplified limbs (just two boxes)
    const limbsMed = new THREE.Mesh(this.sharedGeometries.limbMedium, accentMat);
    limbsMed.position.y = -0.25;
    limbsMed.scale.set(1.5, 0.8, 1);
    mediumGroup.add(limbsMed);

    // LOW LOD - Single box
    const lowGroup = pooledEnemy.lodGroups.low;

    const bodyLow = new THREE.Mesh(this.sharedGeometries.bodyLow, lowMat);
    bodyLow.castShadow = false; // No shadows for low LOD
    bodyLow.position.y = 1.0;
    lowGroup.add(bodyLow);

    // Apply scale based on enemy type
    pooledEnemy.group.scale.setScalar(config.scale);
    this.markEnemyAOSafe(pooledEnemy.group);

    // Snapshot the meshes that cast shadows (exactly the ones built with
    // castShadow=true above) so the per-enemy distance gate can toggle them
    // cheaply. Collected here in the FULL build only; the type-affinity fast
    // path reuses the existing list. `castsShadow` starts matching the build
    // state; updateEnemyLOD re-gates it against SHADOW_CAST_DISTANCE.
    const casters: THREE.Mesh[] = [];
    const collect = (o: THREE.Object3D) => { if (o instanceof THREE.Mesh && o.castShadow) casters.push(o); };
    pooledEnemy.lodGroups.high.traverse(collect);
    pooledEnemy.lodGroups.medium.traverse(collect);
    pooledEnemy.shadowCasters = casters;
    pooledEnemy.castsShadow = shadows;
  }

  /**
   * Clear all meshes from LOD groups and reset their state
   */
  private clearLODGroups(pooledEnemy: PooledEnemyMesh): void {
    for (const lodGroup of Object.values(pooledEnemy.lodGroups)) {
      // Reset LOD group visibility (will be set properly by applyLOD)
      lodGroup.visible = false;

      while (lodGroup.children.length > 0) {
        const child = lodGroup.children[0];
        lodGroup.remove(child);
        // Don't dispose geometry/material as they're shared
      }
    }
    pooledEnemy.parts = {};

    // Reset the main group's transform state
    pooledEnemy.group.rotation.set(0, 0, 0);
    pooledEnemy.group.scale.set(1, 1, 1);
  }

  /**
   * Return an enemy to the pool
   */
  releaseEnemy(pooledEnemy: PooledEnemyMesh): void {
    if (!pooledEnemy.inUse) return;

    // Reset transform state (death animation modifies these)
    pooledEnemy.group.position.set(0, 0, 0);
    pooledEnemy.group.rotation.set(0, 0, 0);
    pooledEnemy.group.scale.set(1, 1, 1);

    // Reset LOD group transforms
    for (const lodGroup of Object.values(pooledEnemy.lodGroups)) {
      lodGroup.rotation.set(0, 0, 0);
      lodGroup.position.set(0, 0, 0);
    }

    // Reset individual mesh part rotations and scales (death/damage animations modify these)
    if (pooledEnemy.parts.leftArm) {
      pooledEnemy.parts.leftArm.rotation.set(0, 0, 0);
      pooledEnemy.parts.leftArm.scale.set(1, 1, 1);
    }
    if (pooledEnemy.parts.rightArm) {
      pooledEnemy.parts.rightArm.rotation.set(0, 0, 0);
      pooledEnemy.parts.rightArm.scale.set(1, 1, 1);
    }
    if (pooledEnemy.parts.leftLeg) {
      pooledEnemy.parts.leftLeg.rotation.set(0, 0, 0);
      pooledEnemy.parts.leftLeg.scale.set(1, 1, 1);
    }
    if (pooledEnemy.parts.rightLeg) {
      pooledEnemy.parts.rightLeg.rotation.set(0, 0, 0);
      pooledEnemy.parts.rightLeg.scale.set(1, 1, 1);
    }
    if (pooledEnemy.parts.body) {
      pooledEnemy.parts.body.scale.set(1, 1, 1);
      pooledEnemy.parts.body.rotation.set(0, 0, 0);
    }
    if (pooledEnemy.parts.head) {
      pooledEnemy.parts.head.rotation.set(0, 0, 0);
    }
    // The charge animation scales these while a shot spins up; a recycled slot
    // must not hand the next shooter a weapon frozen mid-charge.
    if (pooledEnemy.parts.muzzleGlow) pooledEnemy.parts.muzzleGlow.scale.set(1, 1, 1);
    if (pooledEnemy.parts.weaponGlow) pooledEnemy.parts.weaponGlow.scale.set(1, 1, 1);

    // NOTE: We do NOT reset materials because they are SHARED across all enemies.
    // The death/damage animations now use scale effects instead of material changes.

    // Strip gameplay add-ons attached directly to the group (e.g. the
    // mini-boss crown App.tsx parents onto enemy.mesh). They were never
    // cleaned up, so a recycled slot could hand the next enemy a leftover
    // crown. Add-ons are allocated fresh per enemy, so dispose them too.
    for (let i = pooledEnemy.group.children.length - 1; i >= 0; i--) {
      const child = pooledEnemy.group.children[i];
      if (child === pooledEnemy.lodGroups.high
        || child === pooledEnemy.lodGroups.medium
        || child === pooledEnemy.lodGroups.low) continue;
      pooledEnemy.group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    }

    pooledEnemy.inUse = false;
    pooledEnemy.group.visible = false;
    // `type` is intentionally KEPT — it records which archetype's meshes the
    // slot still holds, so the type-affinity acquire path can reuse them
    // without rebuilding ~15 meshes on every respawn.
    pooledEnemy.currentLOD = LODLevel.CULLED;

    // Remove from active set
    this.activeEnemies.delete(pooledEnemy);
  }

  /**
   * Update the LOD level for a single enemy based on distance
   */
  private updateEnemyLOD(pooledEnemy: PooledEnemyMesh): void {
    if (!pooledEnemy.inUse || !this.camera) return;

    const distance = pooledEnemy.group.position.distanceTo(this.camera.position);
    const viewDistance = this.graphicsPreset?.viewDistance ?? 200;

    // ── Render-distance-proportional LOD ladder ──
    // The whole ladder stretches/compresses with the preset's viewDistance so
    // the enemy streaming radius tracks the player's render-distance setting.
    // The damageable-range gate (HIGH_TO_MEDIUM) never drops below its 45 m
    // floor — it only extends (capped) on long-view presets.
    const lodScale = Math.min(2.0, Math.max(0.7, viewDistance / LOD_REFERENCE_VIEW_DISTANCE));
    const highToMedium = LOD_DISTANCES.HIGH_TO_MEDIUM * Math.min(1.5, Math.max(1, lodScale));
    const mediumToLow = Math.max(highToMedium + 5, LOD_DISTANCES.MEDIUM_TO_LOW * lodScale);
    const cullDistance = Math.min(viewDistance, LOD_DISTANCES.LOW_TO_CULLED * lodScale);

    // Calculate LOD based on distance
    let newLOD: LODLevel;
    if (distance > cullDistance) {
      newLOD = LODLevel.CULLED;
    } else if (distance > mediumToLow) {
      newLOD = LODLevel.LOW;
    } else if (distance > highToMedium) {
      newLOD = LODLevel.MEDIUM;
    } else {
      newLOD = LODLevel.HIGH;
    }

    // Check frustum culling — but never cull close enemies. A single-point
    // frustum test makes enemies pop in/out at screen edges, and an enemy
    // attacking the player from the side/behind would vanish entirely.
    // Keeping nearby enemies always rendered avoids that flicker; distant
    // enemies are still culled for performance.
    if (
      newLOD !== LODLevel.CULLED &&
      distance > highToMedium &&
      !this.isInFrustum(pooledEnemy.group.position)
    ) {
      newLOD = LODLevel.CULLED;
    }

    // ── Distance-gated shadow casting ──
    // Drop the real-time shadow once the enemy is past SHADOW_CAST_DISTANCE (or
    // culled / shadows off in the preset). A plain castShadow toggle on the
    // pre-collected caster meshes — never a recompile — so close enemies keep
    // their full shadows and only distant ones stop loading the shadow pass.
    // Long-view presets have the headroom for a slightly deeper shadow ring.
    const shadowReach = SHADOW_CAST_DISTANCE * Math.min(1.4, Math.max(1, lodScale));
    const shadowsOn = this.graphicsPreset?.shadowsEnabled ?? true;
    const wantShadow = shadowsOn && newLOD !== LODLevel.CULLED && distance <= shadowReach;
    if (pooledEnemy.shadowCasters && wantShadow !== pooledEnemy.castsShadow) {
      const casters = pooledEnemy.shadowCasters;
      for (let s = 0; s < casters.length; s++) casters[s].castShadow = wantShadow;
      pooledEnemy.castsShadow = wantShadow;
    }

    // Apply LOD change if needed
    if (newLOD !== pooledEnemy.currentLOD) {
      this.applyLOD(pooledEnemy, newLOD);
    }
  }

  /**
   * Apply a specific LOD level to an enemy
   */
  private applyLOD(pooledEnemy: PooledEnemyMesh, lod: LODLevel): void {
    pooledEnemy.currentLOD = lod;

    // Hide all LOD groups
    pooledEnemy.lodGroups.high.visible = false;
    pooledEnemy.lodGroups.medium.visible = false;
    pooledEnemy.lodGroups.low.visible = false;

    // Show the appropriate LOD group
    switch (lod) {
      case LODLevel.HIGH:
        pooledEnemy.lodGroups.high.visible = true;
        pooledEnemy.group.visible = true;
        break;
      case LODLevel.MEDIUM:
        pooledEnemy.lodGroups.medium.visible = true;
        pooledEnemy.group.visible = true;
        break;
      case LODLevel.LOW:
        pooledEnemy.lodGroups.low.visible = true;
        pooledEnemy.group.visible = true;
        break;
      case LODLevel.CULLED:
        pooledEnemy.group.visible = false;
        break;
    }
  }

  /**
   * Check if a position is within the camera frustum
   */
  private isInFrustum(position: THREE.Vector3): boolean {
    return this.frustum.containsPoint(position);
  }

  /**
   * Update the frustum for culling
   */
  updateFrustum(): void {
    if (!this.camera) return;

    this.frustumMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);
  }

  /**
   * Update performance metrics and adjust enemy limits
   */
  updatePerformanceMetrics(deltaTime: number): void {
    const now = performance.now();

    this.metrics.frameCount++;
    this.metrics.totalFrameTime += deltaTime;

    // Calculate average FPS every second
    if (now - this.metrics.lastMeasureTime >= PERFORMANCE_THRESHOLDS.MEASURE_INTERVAL) {
      this.metrics.avgFPS = this.metrics.frameCount / (this.metrics.totalFrameTime);

      // Track consecutive low/high FPS frames
      if (this.metrics.avgFPS < PERFORMANCE_THRESHOLDS.LOW_FPS) {
        this.metrics.consecutiveLowFPSFrames++;
        this.metrics.consecutiveHighFPSFrames = 0;
      } else if (this.metrics.avgFPS > PERFORMANCE_THRESHOLDS.HIGH_FPS) {
        this.metrics.consecutiveHighFPSFrames++;
        this.metrics.consecutiveLowFPSFrames = 0;
      } else {
        this.metrics.consecutiveLowFPSFrames = 0;
        this.metrics.consecutiveHighFPSFrames = 0;
      }

      // Adjust enemy limit if needed
      this.adjustEnemyLimit(now);

      // Reset metrics
      this.metrics.frameCount = 0;
      this.metrics.totalFrameTime = 0;
      this.metrics.lastMeasureTime = now;
    }
  }

  /**
   * ENEMY COUNT IS SACRED. The old "adaptive limit" silently cut the max
   * enemy count by 15% per low-FPS second (40 → 10 in a bad stretch), which
   * thinned every wave on slower machines — a gameplay downgrade dressed up
   * as an optimization. Performance is now reclaimed in the renderer
   * (instanced world props, merged enemy parts, no backdrop blur) instead of
   * by deleting gameplay, so the limit stays pinned at the preset's target.
   */
  private adjustEnemyLimit(_now: number): void {
    if (this.currentMaxEnemies !== this.baseMaxEnemies) {
      this.currentMaxEnemies = this.baseMaxEnemies;
    }
  }

  /**
   * Main update function - call once per frame
   */
  update(deltaTime: number): void {
    const now = performance.now();

    // Update frustum for culling
    this.updateFrustum();

    // Update performance metrics
    this.updatePerformanceMetrics(deltaTime);

    // Throttle LOD updates for performance
    if (now - this.lastLODUpdateTime >= this.lodUpdateInterval) {
      // Update LOD for all active enemies
      for (const enemy of this.activeEnemies) {
        this.updateEnemyLOD(enemy);
      }
      this.lastLODUpdateTime = now;
    }
  }

  /**
   * Get current max enemies. Always the preset's target — see adjustEnemyLimit
   * for why nothing is allowed to lower it.
   */
  getCurrentMaxEnemies(): number {
    return this.currentMaxEnemies;
  }

  /**
   * SIMPLIFIED API: Acquire a mesh for use with the existing Enemy system
   * Returns the mesh group and all parts needed for animations
   * This method is designed to integrate with the existing createEnemy function
   */
  acquireMeshForEnemy(type: EnemyType, position: THREE.Vector3): AcquiredMesh | null {
    // Check if we've hit the adaptive limit
    if (this.activeEnemies.size >= this.currentMaxEnemies) {
      return null;
    }

    // Prefer a free slot that already holds THIS archetype's meshes —
    // setupEnemyMeshes then skips the whole rebuild (type-affinity reuse).
    let pooledEnemy = this.enemyPool.find(e => !e.inUse && e.type === type);
    if (!pooledEnemy) pooledEnemy = this.enemyPool.find(e => !e.inUse);

    // If no available enemy in pool, create new one if under max pool size
    if (!pooledEnemy && this.poolSize < this.maxPoolSize) {
      pooledEnemy = this.createPooledEnemy();
      this.poolSize++;
    }

    if (!pooledEnemy) {
      return null; // Pool exhausted
    }

    // Setup the enemy meshes for the specific type
    this.setupEnemyMeshes(pooledEnemy, type);

    // Activate the enemy
    pooledEnemy.inUse = true;
    pooledEnemy.type = type;
    pooledEnemy.lastActivationTime = performance.now();
    pooledEnemy.group.position.copy(position);
    pooledEnemy.group.rotation.set(0, 0, 0);

    // CRITICAL: Apply LOD to set correct visibility for LOD groups
    // This makes the HIGH detail group visible and hides MEDIUM/LOW groups
    this.applyLOD(pooledEnemy, LODLevel.HIGH);

    // Add to active set
    this.activeEnemies.add(pooledEnemy);

    // Get pool index for ID
    const poolId = this.enemyPool.indexOf(pooledEnemy);

    // Return the mesh and parts for use with the existing Enemy interface
    return {
      mesh: pooledEnemy.group,
      body: pooledEnemy.parts.body!,
      leftArm: pooledEnemy.parts.leftArm!,
      rightArm: pooledEnemy.parts.rightArm!,
      leftLeg: pooledEnemy.parts.leftLeg!,
      rightLeg: pooledEnemy.parts.rightLeg!,
      head: pooledEnemy.parts.head!,
      muzzle: pooledEnemy.parts.muzzle,
      muzzleGlow: pooledEnemy.parts.muzzleGlow,
      weaponGlow: pooledEnemy.parts.weaponGlow,
      poolId,
    };
  }

  /**
   * Release a mesh back to the pool by pool ID
   */
  releaseMeshById(poolId: number): void {
    if (poolId < 0 || poolId >= this.enemyPool.length) return;

    const pooledEnemy = this.enemyPool[poolId];
    if (!pooledEnemy || !pooledEnemy.inUse) return;

    this.releaseEnemy(pooledEnemy);
  }

  /**
   * True only once the enemy's FULL-detail model has streamed in (HIGH LOD).
   * Bullets register on a detail-ready enemy ONLY — so the player can't damage
   * the distant single-box "minimal" stand-in (LOW) NOR the simplified "half
   * texture" mesh (MEDIUM); the enemy must close to full-detail range (≤45 m,
   * HIGH_TO_MEDIUM) where its complete model is shown. Unknown / un-pooled ids
   * default to true (don't accidentally make an untracked enemy un-killable).
   */
  isDetailReady(poolId: number): boolean {
    if (poolId < 0 || poolId >= this.enemyPool.length) return true;
    return this.enemyPool[poolId].currentLOD === LODLevel.HIGH;
  }

  /**
   * Check if spawning is allowed (adaptive limit check)
   */
  canSpawnMore(): boolean {
    return this.activeEnemies.size < this.currentMaxEnemies;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    // Remove all enemies from scene
    for (const enemy of this.enemyPool) {
      if (this.scene) {
        this.scene.remove(enemy.group);
      }
    }

    // Clear collections
    this.enemyPool = [];
    this.activeEnemies.clear();
    this.poolSize = 0;

    // Dispose shared geometries
    if (this.sharedGeometries) {
      for (const geometry of Object.values(this.sharedGeometries)) {
        geometry.dispose();
      }
      this.sharedGeometries = null;
    }

    // Dispose merged sub-part geometries
    this.mergedGeoCache.forEach((g) => g.dispose());
    this.mergedGeoCache.clear();

    // Dispose shared materials.
    //
    // Deliberately does NOT free the armour surfaces these materials sample
    // (see RobotSurface). Those canvases are SESSION-shared: the player
    // character models bind the same textures, and the next run rebuilds this
    // manager's materials against them. Disposing them here would both break
    // any live character model and force a full re-bake + re-upload on the
    // next run for no benefit — material.dispose() never touches textures,
    // which is exactly why this is safe.
    for (const material of this.sharedMaterials.values()) {
      material.dispose();
    }
    this.sharedMaterials.clear();

    if (this.eyeMaterial) {
      this.eyeMaterial.dispose();
      this.eyeMaterial = null;
    }

    this.scene = null;
    this.camera = null;
  }
}

// Singleton export
export const smartEnemyManager = new SmartEnemyManager();
export default smartEnemyManager;
