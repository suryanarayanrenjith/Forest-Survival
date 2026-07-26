import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type GraphicsPreset } from './GameSettingsManager';

export type EnemyType = 'normal' | 'fast' | 'tank' | 'boss' | 'ranged' | 'revenant';

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
  crestHigh: THREE.ConeGeometry;
  hipHigh: THREE.BoxGeometry;
  // NEW detail pieces — small dressing that adds visual interest without
  // exploding mesh count. All ride on the existing animated parts.
  beltHigh: THREE.BoxGeometry;       // glowing waist strip (on body)
  kneePadHigh: THREE.BoxGeometry;    // small dark plate halfway down the leg
  elbowPadHigh: THREE.BoxGeometry;   // matching elbow plate on the arm
  antennaHigh: THREE.ConeGeometry;   // thin spike on the head
  jetVentHigh: THREE.BoxGeometry;    // back panel (glow vent)
  // Ranged-specific rifle barrel — long thin box clipped onto the right arm.
  rifleBarrelHigh: THREE.BoxGeometry;
  rifleStockHigh: THREE.BoxGeometry;
  // Previously allocated FRESH per spawn (and leaked) — now shared.
  jetGlowHigh: THREE.BoxGeometry;     // glow stripe on the backpack vent
  muzzleGlowHigh: THREE.SphereGeometry; // ranged rifle's glowing muzzle tip

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
  };
  currentLOD: LODLevel;
  inUse: boolean;
  type: EnemyType | null;
  lastActivationTime: number;
  _cellKey?: string; // Spatial grid cell key for quick removal
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

  private spatialGrid: Map<string, Set<PooledEnemyMesh>> = new Map();
  private gridCellSize: number = 20;

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
      crestHigh: new THREE.ConeGeometry(0.16, 0.55, 4),
      hipHigh: new THREE.BoxGeometry(0.92, 0.4, 0.56),
      beltHigh:      new THREE.BoxGeometry(1.06, 0.12, 0.62),
      kneePadHigh:   new THREE.BoxGeometry(0.42, 0.18, 0.42),
      elbowPadHigh:  new THREE.BoxGeometry(0.36, 0.16, 0.36),
      antennaHigh:   new THREE.ConeGeometry(0.04, 0.42, 6),
      jetVentHigh:   new THREE.BoxGeometry(0.62, 0.6, 0.14),
      rifleBarrelHigh: new THREE.BoxGeometry(0.08, 0.08, 1.4),
      rifleStockHigh:  new THREE.BoxGeometry(0.18, 0.22, 0.46),
      jetGlowHigh:     new THREE.BoxGeometry(0.46, 0.08, 0.04),
      muzzleGlowHigh:  new THREE.SphereGeometry(0.08, 10, 8),

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
    for (const [type, config] of Object.entries(ENEMY_CONFIGS)) {
      // Body material — strongest emissive boost so the torso reads bright.
      registerMaterial(`${type}_body`, new THREE.MeshStandardMaterial({
        color: config.baseColor,
        emissive: config.baseColor,
        emissiveIntensity: config.emissiveIntensity * 5.5,
        metalness: 0.0,
        roughness: 0.52,
        flatShading: true,
      }), 1.12);

      registerMaterial(`${type}_accent`, new THREE.MeshStandardMaterial({
        color: config.accentColor,
        emissive: config.accentColor,
        emissiveIntensity: config.emissiveIntensity * 4.4,
        metalness: 0.0,
        roughness: 0.5,
        flatShading: true,
      }), 1.1);

      registerMaterial(`${type}_bright`, new THREE.MeshStandardMaterial({
        color: config.brightColor,
        emissive: config.brightColor,
        emissiveIntensity: config.emissiveIntensity * 6.2,
        metalness: 0.0,
        roughness: 0.46,
        flatShading: true,
      }), 1.15);

      registerMaterial(`${type}_low`, new THREE.MeshStandardMaterial({
        color: config.baseColor,
        emissive: config.baseColor,
        emissiveIntensity: config.emissiveIntensity * 5.5,
        metalness: 0.0,
        roughness: 0.52,
        flatShading: true,
      }), 1.1);

      // Dark recessed-detail material (visor frame, joints, hips).
      // Brighter darkColor + meaningful emissive so it reads as DARK
      // not BLACK in low-light conditions.
      registerMaterial(`${type}_dark`, new THREE.MeshStandardMaterial({
        color: config.darkColor,
        emissive: config.darkColor,
        emissiveIntensity: 1.65,
        metalness: 0.0,
        roughness: 0.68,
        flatShading: true,
      }), 1.3, 0.55);

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
      object.userData.cannotReceiveAO = true;
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
    parts: Array<{ geo: THREE.BufferGeometry; pos?: [number, number, number]; rotX?: number }>,
  ): THREE.BufferGeometry {
    let merged = this.mergedGeoCache.get(key);
    if (merged) return merged;
    const transformed = parts.map((p) => {
      // mergeGeometries needs uniform indexing — normalise to non-indexed.
      // (toNonIndexed returns `this` for already-non-indexed geometry, so
      // clone in that case to avoid mutating the shared primitive.)
      const clone = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      if (p.rotX) clone.rotateX(p.rotX);
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
      this.updateSpatialGrid(pooledEnemy);
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
    bodyGlow.userData.cannotReceiveAO = true;
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

    // ── RANGED ARCHETYPE — clip a rifle onto the right hand. Reads as
    // unmistakable from afar so the player IDs the long-range threat. The
    // rifle/muzzle attach to the arm MESH (not the pivot) so they keep their
    // exact local offset relative to the hand.
    if (type === 'ranged') {
      const rifle = new THREE.Mesh(this.mergedGeo('rifle_dark', [
        { geo: G.rifleStockHigh, pos: [0.06, -0.65, 0.12] },
        { geo: G.rifleBarrelHigh, pos: [0.06, -0.65, 0.78] },
      ]), darkMat);
      rightArmRig.armMesh.add(rifle);
      // Glowing muzzle tip — same colour as the eye bar / belt so all
      // emissive bits read as one "energy weapon" set.
      const muzzle = new THREE.Mesh(G.muzzleGlowHigh, glowMat);
      muzzle.position.set(0.06, -0.65, 1.46);
      muzzle.userData.cannotReceiveAO = true;
      rightArmRig.armMesh.add(muzzle);
    }

    // ── REVENANT ARCHETYPE — a slim gold rifle on the hand (it shoots like a
    // sniper). Twin glowing head horns are added after the head is built below,
    // so its small silhouette still reads as the apex trickster.
    if (type === 'revenant') {
      const rifle = new THREE.Mesh(this.mergedGeo('rev_rifle_dark', [
        { geo: G.rifleStockHigh, pos: [0.06, -0.6, 0.1] },
        { geo: G.rifleBarrelHigh, pos: [0.06, -0.6, 0.62] },
      ]), darkMat);
      rightArmRig.armMesh.add(rifle);
      const revMuzzle = new THREE.Mesh(G.muzzleGlowHigh, glowMat);
      revMuzzle.position.set(0.06, -0.6, 1.2);
      revMuzzle.userData.cannotReceiveAO = true;
      rightArmRig.armMesh.add(revMuzzle);
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

    // ── Head (box + tilted crest merged; visor + glowing eye bar ride it) ──
    const head = new THREE.Mesh(this.mergedGeo('head_bright', [
      { geo: G.headHigh },
      { geo: G.crestHigh, rotX: -0.32, pos: [0, 0.62, -0.04] },
    ]), brightMat);
    head.castShadow = shadows;
    head.position.y = 1.9;
    highGroup.add(head);
    pooledEnemy.parts.head = head;

    const visor = new THREE.Mesh(G.visorHigh, darkMat);
    visor.position.set(0, -0.02, 0.34);
    head.add(visor);
    const eyeBar = new THREE.Mesh(G.eyeHigh, glowMat);
    eyeBar.position.set(0, -0.02, 0.43);
    head.add(eyeBar);
    pooledEnemy.parts.leftEye = eyeBar;

    // Revenant horns — twin emissive-gold crests swept back off the head. The
    // unmistakable apex-trickster tell on top of the small gold body.
    if (type === 'revenant') {
      [-1, 1].forEach((s) => {
        const horn = new THREE.Mesh(G.crestHigh, glowMat);
        horn.scale.set(0.5, 1.15, 0.5);
        horn.position.set(s * 0.34, 0.62, -0.06);
        horn.rotation.z = s * 0.5;
        horn.rotation.x = -0.3;
        horn.userData.cannotReceiveAO = true;
        head.add(horn);
      });
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
   * Get an enemy from the pool or create a new one
   */
  acquireEnemy(type: EnemyType, position: THREE.Vector3): PooledEnemyMesh | null {
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

    // Setup the enemy for the specific type
    this.setupEnemyMeshes(pooledEnemy, type);

    // Activate the enemy
    pooledEnemy.inUse = true;
    pooledEnemy.type = type;
    pooledEnemy.lastActivationTime = performance.now();
    pooledEnemy.group.visible = true;
    pooledEnemy.group.position.copy(position);
    pooledEnemy.group.rotation.set(0, 0, 0);
    pooledEnemy.currentLOD = LODLevel.HIGH;

    // Add to active set
    this.activeEnemies.add(pooledEnemy);

    // Update spatial grid
    this.updateSpatialGrid(pooledEnemy);

    // Set initial LOD
    this.updateEnemyLOD(pooledEnemy);

    return pooledEnemy;
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

    // Remove from spatial grid
    this.removeFromSpatialGrid(pooledEnemy);
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
   * Update spatial grid for an enemy
   */
  private updateSpatialGrid(pooledEnemy: PooledEnemyMesh): void {
    const cellKey = this.getCellKey(pooledEnemy.group.position);

    // Remove from old cell if exists
    this.removeFromSpatialGrid(pooledEnemy);

    // Add to new cell
    if (!this.spatialGrid.has(cellKey)) {
      this.spatialGrid.set(cellKey, new Set());
    }
    this.spatialGrid.get(cellKey)!.add(pooledEnemy);

    // Store cell key on enemy for quick removal
    pooledEnemy._cellKey = cellKey;
  }

  /**
   * Remove enemy from spatial grid
   */
  private removeFromSpatialGrid(pooledEnemy: PooledEnemyMesh): void {
    const cellKey = pooledEnemy._cellKey;
    if (cellKey && this.spatialGrid.has(cellKey)) {
      this.spatialGrid.get(cellKey)!.delete(pooledEnemy);
    }
  }

  /**
   * Get spatial grid cell key for a position
   */
  private getCellKey(position: THREE.Vector3): string {
    const x = Math.floor(position.x / this.gridCellSize);
    const z = Math.floor(position.z / this.gridCellSize);
    return `${x},${z}`;
  }

  /**
   * Get nearby enemies from spatial grid
   */
  getNearbyEnemies(position: THREE.Vector3, radius: number): PooledEnemyMesh[] {
    const result: PooledEnemyMesh[] = [];
    const cellRadius = Math.ceil(radius / this.gridCellSize);
    const centerX = Math.floor(position.x / this.gridCellSize);
    const centerZ = Math.floor(position.z / this.gridCellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const cellKey = `${centerX + dx},${centerZ + dz}`;
        const cell = this.spatialGrid.get(cellKey);
        if (cell) {
          for (const enemy of cell) {
            if (enemy.inUse) {
              const dist = enemy.group.position.distanceTo(position);
              if (dist <= radius) {
                result.push(enemy);
              }
            }
          }
        }
      }
    }

    return result;
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
        this.updateSpatialGrid(enemy);
      }
      this.lastLODUpdateTime = now;
    }
  }

  /**
   * Get animation parts for a pooled enemy (for leg/arm animations)
   */
  getAnimationParts(pooledEnemy: PooledEnemyMesh): {
    leftLeg?: THREE.Mesh;
    rightLeg?: THREE.Mesh;
    leftArm?: THREE.Object3D;  // shoulder-pivot group
    rightArm?: THREE.Object3D;
  } {
    // Only return parts if using high LOD (animations only at close range)
    if (pooledEnemy.currentLOD === LODLevel.HIGH) {
      return pooledEnemy.parts;
    }
    return {};
  }

  /**
   * Check if enemy should receive full AI updates
   */
  shouldUpdateAI(pooledEnemy: PooledEnemyMesh): boolean {
    // Only update AI for visible enemies (not culled)
    return pooledEnemy.currentLOD !== LODLevel.CULLED;
  }

  /**
   * Check if enemy should have detailed animations
   */
  shouldAnimate(pooledEnemy: PooledEnemyMesh): boolean {
    // Only animate at high LOD
    return pooledEnemy.currentLOD === LODLevel.HIGH;
  }

  /**
   * Get current statistics
   */
  getStats(): {
    poolSize: number;
    activeCount: number;
    maxEnemies: number;
    avgFPS: number;
    lodCounts: Record<LODLevel, number>;
  } {
    const lodCounts = {
      [LODLevel.HIGH]: 0,
      [LODLevel.MEDIUM]: 0,
      [LODLevel.LOW]: 0,
      [LODLevel.CULLED]: 0,
    };

    for (const enemy of this.activeEnemies) {
      lodCounts[enemy.currentLOD]++;
    }

    return {
      poolSize: this.poolSize,
      activeCount: this.activeEnemies.size,
      maxEnemies: this.currentMaxEnemies,
      avgFPS: this.metrics.avgFPS,
      lodCounts,
    };
  }

  /**
   * Get all active enemies
   */
  getActiveEnemies(): PooledEnemyMesh[] {
    return Array.from(this.activeEnemies);
  }

  /**
   * Get current max enemies (may be lower than base due to performance)
   */
  getCurrentMaxEnemies(): number {
    return this.currentMaxEnemies;
  }

  /**
   * Force a specific max enemy count (for testing)
   */
  setMaxEnemies(count: number): void {
    this.currentMaxEnemies = Math.min(count, this.baseMaxEnemies);
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

    // Update spatial grid
    this.updateSpatialGrid(pooledEnemy);

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
   * Check if a position is visible (in frustum and within view distance)
   */
  isPositionVisible(position: THREE.Vector3): boolean {
    if (!this.camera || !this.graphicsPreset) return true;

    const distance = position.distanceTo(this.camera.position);
    if (distance > this.graphicsPreset.viewDistance) return false;

    return this.isInFrustum(position);
  }

  /**
   * Get the LOD level for a mesh by pool ID
   */
  getLODLevel(poolId: number): LODLevel {
    if (poolId < 0 || poolId >= this.enemyPool.length) return LODLevel.HIGH;
    return this.enemyPool[poolId].currentLOD;
  }

  /**
   * Check if an enemy should skip expensive updates based on LOD
   */
  shouldSkipAIUpdate(poolId: number): boolean {
    if (poolId < 0 || poolId >= this.enemyPool.length) return false;
    return this.enemyPool[poolId].currentLOD === LODLevel.CULLED;
  }

  /**
   * Check if an enemy should have full animations (only at close range)
   */
  shouldAnimateFull(poolId: number): boolean {
    if (poolId < 0 || poolId >= this.enemyPool.length) return true;
    return this.enemyPool[poolId].currentLOD === LODLevel.HIGH;
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
   * Get number of active enemies
   */
  getActiveCount(): number {
    return this.activeEnemies.size;
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
    this.spatialGrid.clear();
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

    // Dispose shared materials
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
