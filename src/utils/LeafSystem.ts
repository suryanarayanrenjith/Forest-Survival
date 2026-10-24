import * as THREE from 'three';
import type { MapType } from './MapSystem';
import { SpatialGrid } from './SpatialGrid';

/**
 * LEAF SYSTEM — world-space leaves with real aerodynamics.
 *
 * Replaces the old camera-locked leaf column (a fixed shader loop that slid
 * along with the player and replayed the same fall forever). Every leaf here
 * is a WORLD object with its own state, simulated on the CPU (a few dozen
 * airborne at once — microseconds a frame) and drawn as ONE InstancedMesh:
 *
 *   • FALLING — leaves detach from the canopies of the trees actually around
 *     the player and fall as thin plates through moving air: drag splits into
 *     a heavy face-on term and a light edgewise one (so a tilted leaf GLIDES
 *     toward its low edge), the centre-of-pressure torque swings it back
 *     broadside to the flow, and rotational inertia overshoots — the classic
 *     falling-leaf pendulum, emerging from the physics rather than a sine. A
 *     share of leaves tumble (autorotate about their long axis) instead. Wind
 *     is a drifting breeze plus turbulence sampled in space and time, so no
 *     two falls are alike.
 *
 *   • LANDING — on contact a leaf skids to a stop with friction while it rolls
 *     flat onto whichever face it landed on (a small resting tilt keeps the
 *     litter from looking stamped), then sleeps: a resting leaf costs nothing.
 *
 *   • LITTER — the ground near the player carries a scattering of fallen
 *     leaves, densest under the crowns. It is generated per 8-unit WORLD cell
 *     from a hash of the cell, so walking back to a spot finds the same leaves
 *     where they lay; cells stream in/out at the edge of the field (40+ units,
 *     a few pixels) with a soft fade.
 *
 *   • DISTURBANCE — feet (player, robots, remote players) kick resting leaves
 *     up and aside along their stride (sprinting throws them, a slow step just
 *     shoves them), a moving body drags airborne leaves along in its wake,
 *     explosions blow everything outward and skyward, and rounds striking the
 *     ground pop the leaves around the impact. Storm gusts lift and skitter
 *     loose leaves across the floor.
 *
 * Rapier is deliberately NOT used: a leaf is an aerodynamic plate, not a rigid
 * body in contact — the WASM world would add a step and buffer sync for none of
 * the motion that matters. Everything here is allocation-free per frame.
 *
 * World scale: the player is 5 units tall, so 1 unit ≈ 0.36 m. Real values
 * (g, a leaf's ~1.1 m/s terminal fall) are converted below.
 */

/** A tree crown that sheds leaves: world XZ, Y band and radius. */
export interface LeafCanopyShape {
  y0: number;
  y1: number;
  r: number;
}

interface LeafMapConfig {
  /** [sRGB hex, weight] — leaves shed live from the crowns. */
  fall: ReadonlyArray<readonly [number, number]>;
  /** [sRGB hex, weight] — the older, drier ground litter. */
  litter: ReadonlyArray<readonly [number, number]>;
  /** Leaf length (world units). */
  size: number;
  /** Litter leaves / unit² right under a crown (at density 1). */
  crownDensity: number;
  /** Litter leaves / unit² in the open. */
  openDensity: number;
  /** Leaves shed per second around the player in calm air (density 1). */
  fallRate: number;
}

const LEAF_MAPS: Partial<Record<MapType, LeafMapConfig>> = {
  deep_forest: {
    fall: [[0x8a9a3e, 3], [0xa39a45, 2], [0xb08a3a, 2], [0x8f6a35, 1], [0x6f8a38, 1]],
    litter: [[0x6e5536, 3], [0x7f6440, 3], [0x5a442c, 2], [0x8c7a4a, 1], [0x5f6436, 1], [0x4a3826, 1]],
    size: 0.62,
    crownDensity: 0.36,
    openDensity: 0.085,
    fallRate: 6,
  },
  // Sparse, decayed leaves off the gnarled swamp crowns.
  toxic_swamp: {
    fall: [[0x5b6328, 3], [0x6f7030, 2], [0x4e4a26, 2], [0x7a6a30, 1]],
    litter: [[0x3e3a22, 3], [0x4a4426, 3], [0x55542e, 2], [0x2f2c1c, 2]],
    size: 0.55,
    crownDensity: 0.17,
    openDensity: 0.028,
    fallRate: 3,
  },
};

export function hasLeaves(map: MapType): boolean {
  return LEAF_MAPS[map] !== undefined;
}

// ── Physical constants (world units, seconds) ─────────────────────────────
const G = 27;            // 9.81 m/s² in world units
const K_FACE = 3.6;      // face-on quadratic drag  → ≈2.7 u/s (1 m/s) flat terminal
const K_EDGE = 0.5;      // edgewise drag (a real leaf's camber + petiole, not a knife)
const K_ALIGN = 2.0;     // centre-of-pressure torque (turns the blade broadside)
const K_FLUTTER = 0.6;   // vortex-shedding rock about the long axis (∝ airspeed)
const ANG_DAMP = 0.6;    // rotational damping (1/s) …
const ANG_DAMP_U = 0.3;  // … plus the aerodynamic share, ∝ airspeed …
const ANG_DAMP_Q = 0.6;  // … plus a quadratic share, ∝ spin: lets small swings
                         // grow but caps big ones — a stable flutter / spiral cycle
const GUARD = 0.7;       // flutterers: cos(tilt) below which camber rights the leaf
const K_GUARD = 200;
const K_TUMBLE = 1.0;    // tumblers: autorotation drive, × K_ALIGN·|u|²
const K_MAGNUS = 0.15;   // tumblers: spin × airflow side force
const MAX_SPIN = 26;     // rad/s
const SKID_DECEL = 11;   // ground friction while a leaf skids (u/s²)
const CELL = 8;          // litter cell size (units)

const FREE = 0, AIR = 1, SKID = 2, REST = 3;

// Leaf outline: stations base → tip as [t along the length, half-width].
const STATIONS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.016], [0.1, 0.018], [0.13, 0.06], [0.22, 0.2], [0.34, 0.29], [0.48, 0.32],
  [0.62, 0.29], [0.76, 0.21], [0.88, 0.11], [1.0, 0.0],
];
const MAX_HW = 0.32;
const FOLD = 0.3;        // V-cupping of the blade along the midrib
const CURL = 0.22;       // tip + base lift (longitudinal curl)

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellKey(ix: number, iz: number): number {
  return (ix + 32768) * 65536 + (iz + 32768);
}

function buildLeafGeometry(): THREE.BufferGeometry {
  const n = STATIONS.length;
  const pos = new Float32Array(n * 3 * 3);
  const uv = new Float32Array(n * 3 * 2);
  for (let k = 0; k < n; k++) {
    const [t, hw] = STATIONS[k];
    const z = t - 0.5;
    const yCurl = CURL * (t - 0.55) * (t - 0.55);
    const yEdge = yCurl + FOLD * hw;
    // left, mid, right
    const xs = [-hw, 0, hw];
    const ys = [yEdge, yCurl, yEdge];
    for (let s = 0; s < 3; s++) {
      const i = k * 3 + s;
      pos[i * 3] = xs[s];
      pos[i * 3 + 1] = ys[s];
      pos[i * 3 + 2] = z;
      uv[i * 2] = 0.5 + xs[s] / (2 * MAX_HW);
      uv[i * 2 + 1] = t;
    }
  }
  const idx: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    const L0 = k * 3, M0 = L0 + 1, R0 = L0 + 2;
    const L1 = L0 + 3, M1 = L1 + 1, R1 = L1 + 2;
    idx.push(L0, L1, M0, M0, L1, M1, M0, M1, R0, R0, M1, R1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Grey leaf albedo (multiplied by the per-leaf colour): pale midrib,
 *  secondary veins, browned margin, faint blotching. */
function buildLeafTexture(): THREE.DataTexture {
  const W = 64, H = 128;
  const data = new Uint8Array(W * H * 4);
  const rnd = mulberry(0x1eaf);
  const blot = new Float32Array(8 * 16);
  for (let i = 0; i < blot.length; i++) blot[i] = rnd();
  const blotAt = (u: number, v: number) => {
    const x = u * 7, y = v * 15;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const a = blot[yi * 8 + xi], b = blot[yi * 8 + Math.min(7, xi + 1)];
    const c = blot[Math.min(15, yi + 1) * 8 + xi], d = blot[Math.min(15, yi + 1) * 8 + Math.min(7, xi + 1)];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const halfWidthAt = (t: number) => {
    for (let k = 0; k < STATIONS.length - 1; k++) {
      const [t0, w0] = STATIONS[k], [t1, w1] = STATIONS[k + 1];
      if (t <= t1) return w0 + (w1 - w0) * ((t - t0) / Math.max(1e-6, t1 - t0));
    }
    return 0;
  };
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const hw = Math.max(1e-3, halfWidthAt(v));
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const lx = (u - 0.5) * 2 * MAX_HW;          // leaf-space x
      const ax = Math.abs(lx);
      const edge = ax / hw;                         // 0 midrib … 1 margin
      let l = 0.84 + (blotAt(u, v) - 0.5) * 0.14;
      l += 0.16 * Math.exp(-(ax / 0.014) * (ax / 0.014));          // midrib
      const ph = (v - ax * 1.15) * 9.0;                           // secondary veins
      const vd = Math.abs(ph - Math.floor(ph) - 0.5);
      l += 0.07 * Math.max(0, 1 - vd / 0.09) * Math.max(0, 1 - edge) * (v > 0.12 ? 1 : 0);
      l -= 0.2 * Math.max(0, (edge - 0.72) / 0.28);                // browned margin
      const c = Math.max(0, Math.min(255, Math.round(l * 255)));
      const i = (y * W + x) * 4;
      data[i] = c; data[i + 1] = c; data[i + 2] = Math.round(c * 0.94); data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.name = 'leafAlbedo';
  t.needsUpdate = true;
  return t;
}

interface CanopyRec { x: number; z: number; y0: number; y1: number; r: number }

export interface LeafSystemOptions {
  /** 0..1 — the preset's particle density (scales counts + field radius). */
  density: number;
  /** The terrain's flat-disc radius: beyond it the ground moves with the
   *  player's envelope, so resting leaves there re-seat every frame. */
  flatRadius: number;
  /** World ground height (the visual, GPU-displaced surface). */
  groundY: (x: number, z: number) => number;
}

export class LeafSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly scene: THREE.Scene;
  private readonly cfg: LeafMapConfig;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly texture: THREE.DataTexture;
  private readonly groundY: (x: number, z: number) => number;
  private readonly cap: number;
  private readonly airCap: number;
  private readonly radius: number;
  private readonly flatR: number;
  private readonly density: number;
  private readonly fallCum: Float32Array;
  private readonly litterCum: Float32Array;
  private readonly baseColor = new THREE.Color(1, 1, 1);

  // ── per-leaf state (structure of arrays) ──
  private readonly px: Float32Array; private readonly py: Float32Array; private readonly pz: Float32Array;
  private readonly vx: Float32Array; private readonly vy: Float32Array; private readonly vz: Float32Array;
  private readonly qx: Float32Array; private readonly qy: Float32Array; private readonly qz: Float32Array; private readonly qw: Float32Array;
  private readonly wx: Float32Array; private readonly wy: Float32Array; private readonly wz: Float32Array;
  // Air the leaf is caught in (a kick's swept air, a blast's updraft): added
  // to the local wind and decaying at cd/s — so a thrown leaf RIDES the gust
  // up, then hangs and flutters down instead of stopping dead like a plate.
  private readonly cx: Float32Array; private readonly cy: Float32Array; private readonly cz: Float32Array;
  private readonly cd: Float32Array;
  // settle target orientation (set on ground contact)
  private readonly tx: Float32Array; private readonly ty: Float32Array; private readonly tz: Float32Array; private readonly tw: Float32Array;
  private readonly size: Float32Array;     // leaf length (world units)
  private readonly aspect: Float32Array;   // width multiplier
  private readonly fade: Float32Array;     // 0..1 scale-in/out
  private readonly fadeRate: Float32Array; // + fading in, − fading out
  private readonly flPh: Float32Array;     // flutter phase
  private readonly flHz: Float32Array;     // flutter rate (rad/s)
  private readonly tumble: Float32Array;   // autorotation drive (0 = flutterer)
  private readonly tilt: Float32Array;     // resting tilt about the long axis
  private readonly lift: Float32Array;     // resting height offset (anti z-fight)
  private readonly state: Uint8Array;
  private readonly cellOf: Float64Array;   // owning litter cell (REST only), −1 none
  private readonly free: Int32Array;
  private freeTop = 0;
  private highWater = 0;
  private airCount = 0;
  private readonly minLeafY: number;
  private readonly maxLeafY: number;

  private readonly cells = new Map<number, number[]>();
  // Cells waiting to be generated (flat ix, iz pairs): a boundary crossing
  // activates a whole row, which is spread over a few frames.
  private readonly pending: number[] = [];
  private readonly pendingSet = new Set<number>();
  private readonly canopies = new SpatialGrid<CanopyRec>(16);
  private readonly canopyByKey = new Map<object, CanopyRec>();
  private lastCellX = Number.NaN;
  private lastCellZ = Number.NaN;
  private cellCheckTimer = 0;
  private started = false;
  private spawnAcc = 0;
  private gustLiftAcc = 0;
  private time = 0;
  private dirtyMin = Infinity;
  private dirtyMax = -1;
  private colorDirty = false;
  private readonly rnd = mulberry((Math.random() * 0xffffffff) >>> 0);
  private readonly _color = new THREE.Color();

  // Disturbers queued for this frame: x, footY, z, vx, vz, radius.
  private readonly dist = new Float32Array(12 * 6);
  private distCount = 0;
  private readonly airList: Int32Array;
  private airN = 0;
  private seatPhase = 0;
  /** Leaves the FIRST queued body (the player) kicked up since last read. */
  private playerKicks = 0;
  private fwdX = 0;
  private fwdZ = 1;
  private readonly lastPos = new WeakMap<object, { x: number; z: number; t: number }>();

  // Wind (shared by every leaf this frame).
  private windX = 0;
  private windZ = 0;
  private turb = 0.5;
  private gust = 0;

  constructor(scene: THREE.Scene, map: MapType, opts: LeafSystemOptions) {
    const cfg = LEAF_MAPS[map];
    if (!cfg) throw new Error(`LeafSystem: no leaf config for ${map}`);
    this.scene = scene;
    this.cfg = cfg;
    this.groundY = opts.groundY;
    this.flatR = opts.flatRadius;
    const d = THREE.MathUtils.clamp(opts.density, 0.2, 1);
    this.density = d;
    this.radius = d >= 0.95 ? 46 : d >= 0.65 ? 36 : 26;
    this.cap = Math.round(d >= 0.95 ? 1500 : d >= 0.65 ? 700 : 260);
    this.airCap = Math.round(14 + 40 * d);

    const cum = (arr: ReadonlyArray<readonly [number, number]>) => {
      const out = new Float32Array(arr.length);
      let s = 0;
      for (let i = 0; i < arr.length; i++) { s += arr[i][1]; out[i] = s; }
      for (let i = 0; i < arr.length; i++) out[i] /= s;
      return out;
    };
    this.fallCum = cum(cfg.fall);
    this.litterCum = cum(cfg.litter);

    const N = this.cap;
    const f = () => new Float32Array(N);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.qx = f(); this.qy = f(); this.qz = f(); this.qw = f();
    this.wx = f(); this.wy = f(); this.wz = f();
    this.cx = f(); this.cy = f(); this.cz = f(); this.cd = f();
    this.tx = f(); this.ty = f(); this.tz = f(); this.tw = f();
    this.size = f(); this.aspect = f(); this.fade = f(); this.fadeRate = f();
    this.flPh = f(); this.flHz = f(); this.tumble = f(); this.tilt = f(); this.lift = f();
    this.state = new Uint8Array(N);
    this.cellOf = new Float64Array(N).fill(-1);
    this.free = new Int32Array(N);
    this.airList = new Int32Array(N);
    for (let i = 0; i < N; i++) this.free[i] = N - 1 - i;
    this.freeTop = N;

    const geo = buildLeafGeometry();
    geo.computeBoundingBox();
    this.minLeafY = geo.boundingBox!.min.y;
    this.maxLeafY = geo.boundingBox!.max.y;
    this.texture = buildLeafTexture();
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      color: 0xffffff,
      roughness: 0.74,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    // Backlit translucency: a thin leaf between the eye and the sun glows
    // with transmitted light (its far face is the lit one). Resting leaves
    // seen from above never qualify, so the litter stays matte.
    this.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          #ifdef FS_SUN_SHADOW
          float trSh = fsSunShadow;   // a shadowed leaf has nothing to transmit
          #else
          float trSh = 1.0;
          #endif
          vec3 trL = directionalLights[ 0 ].direction;
          float trBack = saturate( dot( -geometryNormal, trL ) );
          float trView = saturate( dot( -geometryViewDir, trL ) );
          reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[ 0 ].color
            * trBack * ( 0.2 + 0.8 * trView * trView ) * 0.3 * trSh;
        }
        #endif`,
      );
    };
    this.material.customProgramCacheKey = () => 'leafTranslucency1';

    this.mesh = new THREE.InstancedMesh(geo, this.material, N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Instance colours must exist before the warmup compile (it is a program
    // define), so allocate them now.
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(1), 3);
    const zero = this.mesh.instanceMatrix.array as Float32Array;
    zero.fill(0);
    this.mesh.count = 1; // one degenerate instance so the warmup compile links the program
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 3;
    this.mesh.userData.kind = 'leaves';
    scene.add(this.mesh);
  }

  // ── canopies ────────────────────────────────────────────────────────────
  addCanopy(key: object, x: number, z: number, c: LeafCanopyShape): void {
    if (this.canopyByKey.has(key)) return;
    const rec: CanopyRec = { x, z, y0: c.y0, y1: c.y1, r: c.r };
    this.canopyByKey.set(key, rec);
    this.canopies.insert(rec, x, z);
  }

  removeCanopy(key: object): void {
    const rec = this.canopyByKey.get(key);
    if (!rec) return;
    this.canopyByKey.delete(key);
    this.canopies.remove(rec, rec.x, rec.z);
  }

  // ── disturbances ────────────────────────────────────────────────────────
  /** Queue a foot/body that scatters leaves this frame. */
  disturb(x: number, footY: number, z: number, velX: number, velZ: number, radius: number): void {
    if (this.distCount >= 12) return;
    const o = this.distCount * 6;
    this.dist[o] = x; this.dist[o + 1] = footY; this.dist[o + 2] = z;
    this.dist[o + 3] = velX; this.dist[o + 4] = velZ; this.dist[o + 5] = radius;
    this.distCount++;
  }

  /** As disturb(), deriving the velocity from the body's last position. */
  disturbTracked(key: object, x: number, footY: number, z: number, radius: number): void {
    const last = this.lastPos.get(key);
    const now = this.time;
    let velX = 0, velZ = 0;
    if (last) {
      const dt = now - last.t;
      if (dt > 1e-4 && dt < 0.5) { velX = (x - last.x) / dt; velZ = (z - last.z) / dt; }
      last.x = x; last.z = z; last.t = now;
    } else {
      this.lastPos.set(key, { x, z, t: now });
    }
    // A robot that teleport-nudges out of a stuck spot is not a stride.
    if (velX * velX + velZ * velZ > 60 * 60) return;
    this.disturb(x, footY, z, velX, velZ, radius);
  }

  /** Radial blast (explosions, ground impacts): 0..1+ strength. */
  blast(x: number, y: number, z: number, radius: number, strength: number): void {
    const r2 = radius * radius;
    for (let i = 0; i < this.highWater; i++) {
      const st = this.state[i];
      if (st === FREE || this.fadeRate[i] < 0) continue;
      const dx = this.px[i] - x, dz = this.pz[i] - z, dy = this.py[i] - y;
      const d2 = dx * dx + dz * dz + dy * dy * 0.5;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2);
      const w = 1 - d / radius;
      const inv = d > 1e-3 ? 1 / d : 0;
      const sp = strength * (5 + 13 * w) * (0.7 + 0.6 * this.rnd());
      if (st === REST) this.unrest(i);
      const hx = (dx * inv || (this.rnd() - 0.5)) * sp, hz = (dz * inv || (this.rnd() - 0.5)) * sp;
      const up = strength * (4 + 12 * w) * (0.6 + 0.8 * this.rnd());
      this.vx[i] += hx; this.vz[i] += hz; this.vy[i] += up;
      // The blast column carries them: an outward, rising gust that dies
      // over ~½ s, after which they hang and drift down for seconds.
      this.cx[i] = hx * 0.8; this.cy[i] = up * 0.9; this.cz[i] = hz * 0.8;
      this.cd[i] = 2.2 + this.rnd();
      if (st === REST) this.edgeOn(i);
      this.spinUp(i, strength * (8 + 16 * w));
      this.toAir(i);
    }
  }

  // ── frame update ────────────────────────────────────────────────────────
  /**
   * `dt` game seconds (slow-mo aware), `camX/Z` + `fwdX/Z` the view (spawns
   * favour what the player can see), `gust` 0 calm … ~2 storm, `wet` 0..1,
   * `windX/Z` the breeze heading the grass is bending to (unit).
   */
  update(
    dt: number, camX: number, camZ: number, fwdX: number, fwdZ: number,
    gust: number, wet: number, windX: number, windZ: number,
  ): void {
    if (dt <= 0) { this.distCount = 0; return; }
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const t = this.time;
    const fl = Math.hypot(fwdX, fwdZ);
    if (fl > 1e-4) { this.fwdX = fwdX / fl; this.fwdZ = fwdZ / fl; }

    // Breeze: the grass's heading, at a speed that breathes, lifted by the
    // live weather gust.
    this.gust += (Math.max(0, gust) - this.gust) * Math.min(1, dt * 0.8);
    const spd = (0.7 + 0.3 * Math.sin(t * 0.13) + 0.2 * Math.sin(t * 0.41 + 2.0)) * (0.8 + this.gust * 1.6);
    this.windX = windX * spd;
    this.windZ = windZ * spd;
    this.turb = 0.45 + this.gust * 0.55;

    // Wet leaves darken and pick up a sheen.
    const wetK = THREE.MathUtils.clamp(wet, 0, 1);
    this.material.roughness = 0.74 - wetK * 0.34;
    this.baseColor.setScalar(1 - wetK * 0.22);
    this.material.color.copy(this.baseColor);

    // ── litter cells ──
    const cix = Math.floor(camX / CELL), ciz = Math.floor(camZ / CELL);
    this.cellCheckTimer -= dt;
    if (!this.started || cix !== this.lastCellX || ciz !== this.lastCellZ || this.cellCheckTimer <= 0) {
      this.refreshCells(camX, camZ);
      this.lastCellX = cix; this.lastCellZ = ciz;
      this.cellCheckTimer = 1.5;
    }
    this.drainPending(camX, camZ, this.started ? 3 : Infinity, !this.started);
    this.started = true;

    // ── shedding ──
    this.spawnAcc += this.cfg.fallRate * this.density * (0.6 + this.gust * 0.9) * dt;
    let guard = 4;
    while (this.spawnAcc >= 1 && guard-- > 0) {
      this.spawnAcc -= 1;
      if (this.airCount >= this.airCap || !this.spawnFalling(camX, camZ, fwdX, fwdZ)) { this.spawnAcc = 0; break; }
    }

    // Storm gusts skitter loose litter across the floor.
    if (this.gust > 0.6) {
      this.gustLiftAcc += (this.gust - 0.6) * 1.6 * this.density * dt;
      while (this.gustLiftAcc >= 1) {
        this.gustLiftAcc -= 1;
        this.gustLift(camX, camZ);
      }
    }

    // ── disturbances ──
    if (this.distCount > 0) {
      // Airborne set once per frame, so each body's wake scans only it.
      let n = 0;
      for (let i = 0; i < this.highWater; i++) if (this.state[i] === AIR) this.airList[n++] = i;
      this.airN = n;
      for (let k = 0; k < this.distCount; k++) this.applyDisturber(k, dt);
      this.distCount = 0;
    }

    // ── simulate ──
    const hw = this.highWater;
    // Far resting leaves re-seat on the moving terrain envelope a third at a
    // time (the envelope drifts slowly; the error is far below a pixel).
    this.seatPhase = (this.seatPhase + 1) % 3;
    for (let i = 0; i < hw; i++) {
      const st = this.state[i];
      if (st === FREE) continue;
      if (st === AIR) this.stepAir(i, dt);
      else if (st === SKID) this.stepSkid(i, dt);
      else {
        // Resting: outside the flat disc the ground follows the player's
        // terrain envelope, so re-seat the leaf on it (and while it scales
        // in/out, as its rest height scales with it).
        const dx = this.px[i] - camX, dz = this.pz[i] - camZ;
        if (this.fadeRate[i] !== 0
          || ((i % 3) === this.seatPhase && dx * dx + dz * dz > (this.flatR - 1) * (this.flatR - 1))) {
          const y = this.restY(i);
          if (Math.abs(y - this.py[i]) > 1e-3) { this.py[i] = y; this.markDirty(i); }
        }
      }
      if (this.fadeRate[i] !== 0) {
        let fv = this.fade[i] + this.fadeRate[i] * dt;
        if (fv >= 1) { fv = 1; this.fadeRate[i] = 0; }
        this.fade[i] = fv;
        this.markDirty(i);
        if (fv <= 0) { this.release(i); continue; }
      }
    }

    // ── upload ──
    this.mesh.count = Math.max(1, this.highWater);
    if (this.dirtyMax >= 0) {
      const attr = this.mesh.instanceMatrix;
      attr.clearUpdateRanges();
      attr.addUpdateRange(this.dirtyMin * 16, (this.dirtyMax - this.dirtyMin + 1) * 16);
      attr.needsUpdate = true;
      this.dirtyMin = Infinity;
      this.dirtyMax = -1;
    }
    if (this.colorDirty && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.colorDirty = false;
    }
  }

  // ── simulation steps ────────────────────────────────────────────────────
  private stepAir(i: number, dt: number): void {
    const t = this.time;
    let px = this.px[i], py = this.py[i], pz = this.pz[i];
    // Local air velocity: breeze + turbulence sampled in space and time.
    const tw = this.turb;
    const ax = this.windX + tw * (Math.sin(t * 0.71 + px * 0.13 + pz * 0.07) + 0.6 * Math.sin(t * 1.93 + pz * 0.31 - px * 0.11));
    const az = this.windZ + tw * (Math.cos(t * 0.63 + pz * 0.12 - px * 0.05) + 0.6 * Math.cos(t * 1.71 + px * 0.29 + pz * 0.13));
    let ay = tw * 0.55 * Math.sin(t * 1.37 + px * 0.23 + pz * 0.19);
    let ax2 = ax, az2 = az;
    if (this.cd[i] > 0) {
      ax2 += this.cx[i]; ay += this.cy[i]; az2 += this.cz[i];
      const dk = 1 / (1 + this.cd[i] * dt);
      this.cx[i] *= dk; this.cy[i] *= dk; this.cz[i] *= dk;
      if (Math.abs(this.cx[i]) + Math.abs(this.cy[i]) + Math.abs(this.cz[i]) < 0.05) this.cd[i] = 0;
    }

    let vx = this.vx[i], vy = this.vy[i] - G * dt, vz = this.vz[i];
    const qx = this.qx[i], qy = this.qy[i], qz = this.qz[i], qw = this.qw[i];
    // Leaf normal (local +Y) and long axis (local +Z).
    const nx = 2 * (qx * qy - qw * qz), ny = 1 - 2 * (qx * qx + qz * qz), nz = 2 * (qy * qz + qw * qx);
    const lx = 2 * (qx * qz + qw * qy), ly = 2 * (qy * qz - qw * qx), lz = 1 - 2 * (qx * qx + qy * qy);

    // Plate drag, implicit per component (stable at any dt): heavy face-on,
    // light edgewise — a tilted leaf therefore glides toward its low edge.
    let ux = vx - ax2, uy = vy - ay, uz = vz - az2;
    const un = ux * nx + uy * ny + uz * nz;
    const utx = ux - un * nx, uty = uy - un * ny, utz = uz - un * nz;
    const ut = Math.sqrt(utx * utx + uty * uty + utz * utz);
    const un2 = un / (1 + K_FACE * Math.abs(un) * dt);
    const tf = 1 / (1 + K_EDGE * ut * dt);
    ux = un2 * nx + utx * tf; uy = un2 * ny + uty * tf; uz = un2 * nz + utz * tf;
    vx = ux + ax2; vy = uy + ay; vz = uz + az2;

    // Torques. Centre of pressure → swing broadside to the flow:
    // τ = K |u|² (n·û)(n × û)  — zero face-on and edge-on, max at 45°.
    const u2 = ux * ux + uy * uy + uz * uz;
    const um = Math.sqrt(u2);
    let tqx = 0, tqy = 0, tqz = 0;
    if (um > 1e-3) {
      const ix = ux / um, iy = uy / um, iz = uz / um;
      const c = nx * ix + ny * iy + nz * iz;
      const k = K_ALIGN * u2 * c;
      tqx = k * (ny * iz - nz * iy);
      tqy = k * (nz * ix - nx * iz);
      tqz = k * (nx * iy - ny * ix);
    }
    // Vortex shedding rocks the blade about its long axis (sustains the
    // flutter); tumblers autorotate about it instead — and their spin turns
    // the airflow into a steady side force (they drift far as they roll).
    let wx = this.wx[i], wy = this.wy[i], wz = this.wz[i];
    const tb = this.tumble[i];
    let drive: number;
    if (tb !== 0) {
      drive = tb * K_TUMBLE * K_ALIGN * u2;
      vx += K_MAGNUS * (wy * uz - wz * uy) * dt;
      vy += K_MAGNUS * (wz * ux - wx * uz) * dt;
      vz += K_MAGNUS * (wx * uy - wy * ux) * dt;
    } else {
      drive = K_FLUTTER * um * Math.sin(this.flPh[i] + t * this.flHz[i]);
      // A cambered leaf rights itself before it can flip over.
      const cy = Math.abs(ny);
      if (cy < GUARD) {
        const sgn = ny >= 0 ? K_GUARD * (GUARD - cy) : -K_GUARD * (GUARD - cy);
        tqx += -nz * sgn;
        tqz += nx * sgn;
      }
    }
    tqx += lx * drive; tqy += ly * drive; tqz += lz * drive;

    wx += tqx * dt; wy += tqy * dt; wz += tqz * dt;
    const wm0 = Math.sqrt(wx * wx + wy * wy + wz * wz);
    const damp = 1 / (1 + (ANG_DAMP + ANG_DAMP_U * um + ANG_DAMP_Q * wm0) * dt);
    wx *= damp; wy *= damp; wz *= damp;
    const wm = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (wm > MAX_SPIN) { const s = MAX_SPIN / wm; wx *= s; wy *= s; wz *= s; }
    this.wx[i] = wx; this.wy[i] = wy; this.wz[i] = wz;
    this.integrateRotation(i, wx, wy, wz, dt);

    px += vx * dt; py += vy * dt; pz += vz * dt;
    this.px[i] = px; this.py[i] = py; this.pz[i] = pz;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;

    // Ground contact → skid + settle.
    const gy = this.groundY(px, pz);
    const ny2 = 1 - 2 * (this.qx[i] * this.qx[i] + this.qz[i] * this.qz[i]);
    const low = gy + 0.006 + (1 - Math.abs(ny2)) * this.size[i] * MAX_HW * 0.9;
    if (py <= low && vy <= 0.5) {
      this.py[i] = Math.max(py, gy + 0.004);
      this.vy[i] = 0;
      // The impact bleeds most of the horizontal speed.
      this.vx[i] *= 0.45; this.vz[i] *= 0.45;
      this.wx[i] = 0; this.wy[i] = 0; this.wz[i] = 0;
      this.computeRestTarget(i);
      this.state[i] = SKID;
      this.airCount--;
    } else if (py < gy - 2 || py > gy + 80) {
      // Lost (fell through a seam / blown out of the world): recycle.
      this.fadeRate[i] = -4;
    }
    this.markDirty(i);
  }

  private stepSkid(i: number, dt: number): void {
    let vx = this.vx[i], vz = this.vz[i];
    const sp = Math.sqrt(vx * vx + vz * vz);
    // A skidding leaf also catches the breeze a little.
    const push = 0.18 * dt;
    if (sp > 1e-4) {
      const ns = Math.max(0, sp - SKID_DECEL * dt);
      const k = ns / sp;
      vx *= k; vz *= k;
    }
    vx += this.windX * push; vz += this.windZ * push;
    this.px[i] += vx * dt;
    this.pz[i] += vz * dt;
    this.vx[i] = vx; this.vz[i] = vz;
    // Roll flat onto the face it landed on.
    const k = 1 - Math.exp(-11 * dt);
    let ax = this.tx[i], ay = this.ty[i], az = this.tz[i], aw = this.tw[i];
    const dot = ax * this.qx[i] + ay * this.qy[i] + az * this.qz[i] + aw * this.qw[i];
    if (dot < 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
    let qx = this.qx[i] + (ax - this.qx[i]) * k;
    let qy = this.qy[i] + (ay - this.qy[i]) * k;
    let qz = this.qz[i] + (az - this.qz[i]) * k;
    let qw = this.qw[i] + (aw - this.qw[i]) * k;
    const l = 1 / Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
    qx *= l; qy *= l; qz *= l; qw *= l;
    this.qx[i] = qx; this.qy[i] = qy; this.qz[i] = qz; this.qw[i] = qw;
    const target = this.restY(i);
    this.py[i] += (target - this.py[i]) * k;
    this.markDirty(i);
    if (sp < 0.25 && Math.abs(dot) > 0.9995) {
      this.qx[i] = ax; this.qy[i] = ay; this.qz[i] = az; this.qw[i] = aw;
      this.py[i] = target;
      this.vx[i] = 0; this.vz[i] = 0;
      this.rest(i);
    }
  }

  /** q ← q + ½·dt·(ω ⊗ q), renormalised. */
  private integrateRotation(i: number, wx: number, wy: number, wz: number, dt: number): void {
    const qx = this.qx[i], qy = this.qy[i], qz = this.qz[i], qw = this.qw[i];
    const h = 0.5 * dt;
    let nx = qx + h * (wx * qw + wy * qz - wz * qy);
    let ny = qy + h * (-wx * qz + wy * qw + wz * qx);
    let nz = qz + h * (wx * qy - wy * qx + wz * qw);
    let nw = qw + h * (-(wx * qx + wy * qy + wz * qz));
    const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    nx *= l; ny *= l; nz *= l; nw *= l;
    this.qx[i] = nx; this.qy[i] = ny; this.qz[i] = nz; this.qw[i] = nw;
  }

  /** Flat-on-the-ground orientation for the face the leaf is showing,
   *  keeping its heading, with the leaf's own small resting tilt. */
  private computeRestTarget(i: number): void {
    const qx = this.qx[i], qy = this.qy[i], qz = this.qz[i], qw = this.qw[i];
    const ny = 1 - 2 * (qx * qx + qz * qz);
    const side = ny >= 0 ? 1 : -1;
    // Ground normal (flat inside the disc; sampled beyond it).
    let gx = 0, gyN = 1, gz = 0;
    const px = this.px[i], pz = this.pz[i];
    const h0 = this.groundY(px, pz);
    const hx = this.groundY(px + 0.5, pz), hz = this.groundY(px, pz + 0.5);
    if (hx !== h0 || hz !== h0) {
      gx = -(hx - h0) / 0.5; gz = -(hz - h0) / 0.5; gyN = 1;
      const gl = 1 / Math.sqrt(gx * gx + gyN * gyN + gz * gz);
      gx *= gl; gyN *= gl; gz *= gl;
    }
    // Y' = side·g; Z' = heading projected onto the ground plane.
    const Yx = gx * side, Yy = gyN * side, Yz = gz * side;
    let Zx = 2 * (qx * qz + qw * qy), Zy = 2 * (qy * qz - qw * qx), Zz = 1 - 2 * (qx * qx + qy * qy);
    const dz = Zx * Yx + Zy * Yy + Zz * Yz;
    Zx -= dz * Yx; Zy -= dz * Yy; Zz -= dz * Yz;
    let zl = Math.sqrt(Zx * Zx + Zy * Zy + Zz * Zz);
    if (zl < 1e-3) { Zx = 1; Zy = 0; Zz = 0; zl = 1; }
    Zx /= zl; Zy /= zl; Zz /= zl;
    // X' = Y' × Z'
    let Xx = Yy * Zz - Yz * Zy, Xy = Yz * Zx - Yx * Zz, Xz = Yx * Zy - Yy * Zx;
    // Resting tilt about the long axis (a curled leaf never lies dead flat).
    const c = Math.cos(this.tilt[i]), s = Math.sin(this.tilt[i]);
    const Y2x = Yx * c + Xx * s, Y2y = Yy * c + Xy * s, Y2z = Yz * c + Xz * s;
    const X2x = Xx * c - Yx * s, X2y = Xy * c - Yy * s, X2z = Xz * c - Yz * s;
    Xx = X2x; Xy = X2y; Xz = X2z;
    this.basisToTarget(i, Xx, Xy, Xz, Y2x, Y2y, Y2z, Zx, Zy, Zz);
  }

  private basisToTarget(
    i: number,
    m00: number, m10: number, m20: number,  // X column
    m01: number, m11: number, m21: number,  // Y column
    m02: number, m12: number, m22: number,  // Z column
  ): void {
    const tr = m00 + m11 + m22;
    let x: number, y: number, z: number, w: number;
    if (tr > 0) {
      const s = 0.5 / Math.sqrt(tr + 1);
      w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
    }
    const l = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
    this.tx[i] = x * l; this.ty[i] = y * l; this.tz[i] = z * l; this.tw[i] = w * l;
  }

  /** Height of a resting leaf's origin: the curl/fold means one face rests
   *  on its midrib, the other on its rim. */
  private restY(i: number): number {
    const ny = 1 - 2 * (this.tx[i] * this.tx[i] + this.tz[i] * this.tz[i]);
    const sc = this.size[i] * Math.max(0.05, this.fade[i]);
    const under = ny >= 0 ? -this.minLeafY : this.maxLeafY;
    const tiltDip = Math.abs(Math.sin(this.tilt[i])) * MAX_HW * this.aspect[i];
    return this.groundY(this.px[i], this.pz[i]) + (under + tiltDip * 0.6) * sc + 0.005 + this.lift[i];
  }

  // ── state transitions ───────────────────────────────────────────────────
  private toAir(i: number): void {
    if (this.state[i] !== AIR) this.airCount++;
    this.state[i] = AIR;
    this.py[i] += 0.015;
    this.markDirty(i);
  }

  private spinUp(i: number, mag: number): void {
    const r = this.rnd;
    this.wx[i] += (r() - 0.5) * 2 * mag;
    this.wy[i] += (r() - 0.5) * 1.2 * mag;
    this.wz[i] += (r() - 0.5) * 2 * mag;
  }

  private rest(i: number): void {
    this.state[i] = REST;
    const ix = Math.floor(this.px[i] / CELL), iz = Math.floor(this.pz[i] / CELL);
    const key = cellKey(ix, iz);
    const list = this.cells.get(key);
    if (!list) {
      // Landed outside the live field — let it go quietly.
      this.cellOf[i] = -1;
      this.fadeRate[i] = -1.5;
      return;
    }
    list.push(i);
    this.cellOf[i] = key;
  }

  private unrest(i: number): void {
    const key = this.cellOf[i];
    if (key >= 0) {
      const list = this.cells.get(key);
      if (list) {
        const at = list.indexOf(i);
        if (at >= 0) { list[at] = list[list.length - 1]; list.pop(); }
      }
    }
    this.cellOf[i] = -1;
  }

  private release(i: number): void {
    if (this.state[i] === REST) this.unrest(i);
    if (this.state[i] === AIR) this.airCount--;
    this.state[i] = FREE;
    this.fade[i] = 0;
    this.fadeRate[i] = 0;
    this.writeZero(i);
    this.free[this.freeTop++] = i;
    while (this.highWater > 0 && this.state[this.highWater - 1] === FREE) this.highWater--;
  }

  /** A free slot — or, with the pool full, the resting leaf farthest from
   *  the player (only if it is out at the faded edge of the field). */
  private alloc(camX: number, camZ: number): number {
    let i = -1;
    if (this.freeTop > 0) {
      // Prefer the lowest free index to keep the draw range tight.
      let best = this.freeTop - 1;
      for (let k = this.freeTop - 1, n = 0; k >= 0 && n < 24; k--, n++) {
        if (this.free[k] < this.free[best]) best = k;
      }
      i = this.free[best];
      this.free[best] = this.free[this.freeTop - 1];
      this.freeTop--;
    } else {
      // Pool full: reclaim a resting leaf nobody can see — out at the faded
      // edge of the field, or else the farthest one behind the camera.
      let far = -1, farD = (this.radius * 0.72) * (this.radius * 0.72);
      let back = -1, backD = 16;
      for (let k = 0; k < this.highWater; k++) {
        if (this.state[k] !== REST || this.fadeRate[k] !== 0) continue;
        const dx = this.px[k] - camX, dz = this.pz[k] - camZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > farD) { farD = d2; far = k; }
        else if (d2 > backD && dx * this.fwdX + dz * this.fwdZ < 0) { backD = d2; back = k; }
      }
      if (far < 0) far = back;
      if (far < 0) return -1;
      this.unrest(far);
      this.state[far] = FREE;
      i = far;
    }
    if (i >= this.highWater) this.highWater = i + 1;
    return i;
  }

  private initLeaf(i: number, palette: Float32Array, colors: LeafMapConfig['fall'], r: () => number = this.rnd): void {
    this.size[i] = this.cfg.size * (0.78 + r() * 0.44);
    this.aspect[i] = 0.78 + r() * 0.36;
    this.flPh[i] = r() * Math.PI * 2;
    this.flHz[i] = 4.5 + r() * 4.5;
    this.tumble[i] = r() < 0.2 ? (r() < 0.5 ? -1 : 1) * (0.8 + r() * 0.5) : 0;
    this.tilt[i] = (r() - 0.5) * 0.36;
    this.lift[i] = (i % 9) * 0.0024;
    this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
    this.wx[i] = 0; this.wy[i] = 0; this.wz[i] = 0;
    this.cx[i] = 0; this.cy[i] = 0; this.cz[i] = 0; this.cd[i] = 0;
    // Colour: weighted palette pick + brightness / warmth jitter.
    const p = r();
    let ci = 0;
    while (ci < palette.length - 1 && p > palette[ci]) ci++;
    this._color.setHex(colors[ci][0]);
    const b = 0.84 + r() * 0.3;
    const warm = (r() - 0.5) * 0.08;
    this._color.r *= b * (1 + warm); this._color.g *= b; this._color.b *= b * (1 - warm);
    this.mesh.setColorAt(i, this._color);
    this.colorDirty = true;
  }

  /** Tip a resting leaf up toward its edge about its long axis (how a flick
   *  launches it) — flat, it would parachute to a dead stop. */
  private edgeOn(i: number): void {
    const a = (0.7 + this.rnd() * 0.7) * (this.rnd() < 0.5 ? -1 : 1);
    const h = a * 0.5, s = Math.sin(h), c = Math.cos(h);
    // q · rotZ(a)
    const qx = this.qx[i], qy = this.qy[i], qz = this.qz[i], qw = this.qw[i];
    this.qx[i] = qx * c + qy * s;
    this.qy[i] = qy * c - qx * s;
    this.qz[i] = qz * c + qw * s;
    this.qw[i] = qw * c - qz * s;
  }

  private setRandomOrientation(i: number, flatBias: number): void {
    const r = this.rnd;
    // Random yaw, then a tilt drawn toward flat by `flatBias`.
    const yaw = r() * Math.PI * 2;
    const tiltA = (r() - 0.5) * Math.PI * (1 - flatBias);
    const tiltB = (r() - 0.5) * Math.PI * (1 - flatBias);
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
    const ca = Math.cos(tiltA / 2), sa = Math.sin(tiltA / 2);
    const cb = Math.cos(tiltB / 2), sb = Math.sin(tiltB / 2);
    // q = yaw(Y) * tiltA(X) * tiltB(Z)
    const x1 = cy * sa, y1 = sy * ca, z1 = -sy * sa, w1 = cy * ca;
    this.qx[i] = x1 * cb + y1 * sb;
    this.qy[i] = y1 * cb - x1 * sb;
    this.qz[i] = z1 * cb + w1 * sb;
    this.qw[i] = w1 * cb - z1 * sb;
    const l = 1 / Math.hypot(this.qx[i], this.qy[i], this.qz[i], this.qw[i]);
    this.qx[i] *= l; this.qy[i] *= l; this.qz[i] *= l; this.qw[i] *= l;
  }

  private spawnFalling(camX: number, camZ: number, fwdX: number, fwdZ: number): boolean {
    const near = this.canopies.queryRadius(camX, camZ, 34);
    if (near.length === 0) return false;
    // Weighted pick: crowns in view and close by shed where it's seen.
    let total = 0;
    const r = this.rnd;
    let pick: CanopyRec | null = null;
    for (let k = 0; k < near.length; k++) {
      const c = near[k];
      const dx = c.x - camX, dz = c.z - camZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 34) continue;
      const facing = d > 1e-3 ? (dx * fwdX + dz * fwdZ) / d : 1;
      const w = (facing > 0.2 ? 3 : 1) * (d < 6 ? 1.6 : 1);
      total += w;
      if (r() * total < w) pick = c;
    }
    if (!pick) return false;
    const i = this.alloc(camX, camZ);
    if (i < 0) return false;
    this.initLeaf(i, this.fallCum, this.cfg.fall);
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * pick.r * 0.92;
    this.px[i] = pick.x + Math.cos(a) * rr;
    this.pz[i] = pick.z + Math.sin(a) * rr;
    this.py[i] = pick.y0 + r() * (pick.y1 - pick.y0);
    this.setRandomOrientation(i, 0.45);
    this.vx[i] = this.windX * 0.5; this.vz[i] = this.windZ * 0.5;
    this.spinUp(i, 1.5);
    this.fade[i] = 0;
    this.fadeRate[i] = 3; // grows in over ~⅓ s (inside the crown)
    this.cellOf[i] = -1;
    this.state[i] = AIR;
    this.airCount++;
    this.markDirty(i);
    return true;
  }

  private gustLift(camX: number, camZ: number): void {
    // A random resting leaf within ~20 units catches the gust.
    const r = this.rnd;
    for (let tries = 0; tries < 6; tries++) {
      const i = Math.floor(r() * this.highWater);
      if (this.state[i] !== REST) continue;
      const dx = this.px[i] - camX, dz = this.pz[i] - camZ;
      if (dx * dx + dz * dz > 400) continue;
      this.unrest(i);
      const k = 0.7 + r() * 0.8;
      this.vx[i] = this.windX * k * 1.4;
      this.vz[i] = this.windZ * k * 1.4;
      this.vy[i] = 1.2 + r() * 2.2;
      this.cx[i] = this.vx[i] * 0.6; this.cy[i] = this.vy[i] * 0.5; this.cz[i] = this.vz[i] * 0.6;
      this.cd[i] = 2.5;
      this.edgeOn(i);
      this.spinUp(i, 6);
      this.toAir(i);
      return;
    }
  }

  private applyDisturber(k: number, dt: number): void {
    const o = k * 6;
    const x = this.dist[o], footY = this.dist[o + 1], z = this.dist[o + 2];
    const dvx = this.dist[o + 3], dvz = this.dist[o + 4], rad = this.dist[o + 5];
    const s = Math.sqrt(dvx * dvx + dvz * dvz);
    const r = this.rnd;
    // Feet → resting leaves (standing still scatters nothing).
    if (s > 1.5) {
      const mx = dvx / s, mz = dvz / s;
      const i0 = Math.floor((x - rad) / CELL), i1 = Math.floor((x + rad) / CELL);
      const j0 = Math.floor((z - rad) / CELL), j1 = Math.floor((z + rad) / CELL);
      for (let ci = i0; ci <= i1; ci++) {
        for (let cj = j0; cj <= j1; cj++) {
          const list = this.cells.get(cellKey(ci, cj));
          if (!list) continue;
          for (let n = list.length - 1; n >= 0; n--) {
            const i = list[n];
            const dx = this.px[i] - x, dz = this.pz[i] - z;
            const d2 = dx * dx + dz * dz;
            if (d2 > rad * rad) continue;
            const dy = this.py[i] - footY;
            if (dy > 0.9 || dy < -1.2) continue;
            const d = Math.sqrt(d2);
            const w = 1 - d / rad;
            const rx = d > 1e-3 ? dx / d : mx, rz = d > 1e-3 ? dz / d : mz;
            // Ahead of the foot → swept forward; beside it → shoved outward.
            let hx = rx * 0.62 + mx * 0.5, hz = rz * 0.62 + mz * 0.5;
            const hl = 1 / Math.max(1e-3, Math.sqrt(hx * hx + hz * hz));
            hx *= hl; hz *= hl;
            const sp = s * (0.16 + 0.3 * w) * (0.7 + 0.6 * r());
            // Swap-pop out of the cell list (we're iterating it backwards).
            list[n] = list[list.length - 1]; list.pop();
            this.cellOf[i] = -1;
            const up = Math.min(18, s * (0.16 + 0.34 * w * r()) + 1.5);
            this.vx[i] = hx * sp;
            this.vz[i] = hz * sp;
            this.vy[i] = up;
            // A foot flicks a leaf up on edge, in the air it swept along.
            this.edgeOn(i);
            this.cx[i] = hx * sp * 0.5; this.cy[i] = up * 0.7; this.cz[i] = hz * sp * 0.5;
            this.cd[i] = 4 + 2.5 * r();
            this.spinUp(i, (4 + 10 * r()) * Math.min(1.4, s / 18));
            this.toAir(i);
            if (k === 0) this.playerKicks++;
          }
        }
      }
    }
    // Body wake → airborne leaves near the body get dragged + swirled.
    const wr = rad * 2.4;
    const wr2 = wr * wr;
    for (let n = 0; n < this.airN; n++) {
      const i = this.airList[n];
      if (this.state[i] !== AIR) continue;
      const dy = this.py[i] - footY;
      if (dy < -0.5 || dy > 6) continue;
      const dx = this.px[i] - x, dz = this.pz[i] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > wr2) continue;
      const d = Math.sqrt(d2);
      const w = 1 - d / wr;
      const inv = d > 1e-3 ? 1 / d : 0;
      // The air a moving body shoves along (and outward round its flanks).
      const k = Math.min(1, dt * 6 * w);
      this.cx[i] += (dvx * 0.4 + dx * inv * s * 0.12 - this.cx[i]) * k;
      this.cz[i] += (dvz * 0.4 + dz * inv * s * 0.12 - this.cz[i]) * k;
      this.cy[i] += (s * 0.05 - this.cy[i]) * k;
      if (this.cd[i] === 0) this.cd[i] = 3;
    }
  }

  // ── litter cells ────────────────────────────────────────────────────────
  private refreshCells(camX: number, camZ: number): void {
    const R = this.radius;
    // Drop cells that fell well outside the field (hysteresis of one cell).
    const dropR = R + CELL;
    for (const [key, list] of this.cells) {
      const ix = Math.floor(key / 65536) - 32768, iz = (key % 65536) - 32768;
      const cx = (ix + 0.5) * CELL - camX, cz = (iz + 0.5) * CELL - camZ;
      if (cx * cx + cz * cz <= dropR * dropR) continue;
      for (let n = list.length - 1; n >= 0; n--) {
        const i = list[n];
        this.cellOf[i] = -1;
        this.state[i] = FREE; // release() would look the list up again
        this.fade[i] = 0; this.fadeRate[i] = 0;
        this.writeZero(i);
        this.free[this.freeTop++] = i;
      }
      this.cells.delete(key);
    }
    while (this.highWater > 0 && this.state[this.highWater - 1] === FREE) this.highWater--;
    // Activate the cells inside the field.
    const i0 = Math.floor((camX - R) / CELL), i1 = Math.floor((camX + R) / CELL);
    const j0 = Math.floor((camZ - R) / CELL), j1 = Math.floor((camZ + R) / CELL);
    for (let ix = i0; ix <= i1; ix++) {
      for (let iz = j0; iz <= j1; iz++) {
        const cx = (ix + 0.5) * CELL - camX, cz = (iz + 0.5) * CELL - camZ;
        if (cx * cx + cz * cz > R * R) continue;
        const key = cellKey(ix, iz);
        if (this.cells.has(key) || this.pendingSet.has(key)) continue;
        this.pendingSet.add(key);
        this.pending.push(ix, iz);
      }
    }
  }

  private drainPending(camX: number, camZ: number, budget: number, instant: boolean): void {
    const R = this.radius + CELL;
    while (budget > 0 && this.pending.length > 0) {
      const iz = this.pending.pop()!, ix = this.pending.pop()!;
      const key = cellKey(ix, iz);
      this.pendingSet.delete(key);
      if (this.cells.has(key)) continue;
      const cx = (ix + 0.5) * CELL - camX, cz = (iz + 0.5) * CELL - camZ;
      if (cx * cx + cz * cz > R * R) continue; // walked away before its turn
      this.generateCell(ix, iz, key, camX, camZ, instant);
      budget--;
    }
  }

  private generateCell(ix: number, iz: number, key: number, camX: number, camZ: number, instant: boolean): void {
    const list: number[] = [];
    this.cells.set(key, list);
    const rnd = mulberry((Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ 0x5eed) >>> 0);
    const x0 = ix * CELL, z0 = iz * CELL;
    const near = this.canopies.queryRadius(x0 + CELL / 2, z0 + CELL / 2, CELL + 10);
    const cfg = this.cfg;
    const attempts = Math.round(CELL * CELL * cfg.crownDensity * this.density);
    const openP = cfg.openDensity / cfg.crownDensity;
    let lastX = 0, lastZ = 0, have = false;
    for (let a = 0; a < attempts; a++) {
      let x: number, z: number;
      // ~40% gather into little drifts beside the previous leaf.
      if (have && rnd() < 0.4) {
        x = lastX + (rnd() - 0.5) * 1.1;
        z = lastZ + (rnd() - 0.5) * 1.1;
      } else {
        x = x0 + rnd() * CELL;
        z = z0 + rnd() * CELL;
      }
      let crown = 0;
      for (let k = 0; k < near.length; k++) {
        const c = near[k];
        const dx = x - c.x, dz = z - c.z;
        const d = Math.sqrt(dx * dx + dz * dz) / (c.r * 1.5);
        if (d < 1) crown = Math.max(crown, 1 - d * d);
      }
      // Seeded accept test (keeps the cell deterministic).
      const roll = rnd();
      if (roll > openP + (1 - openP) * crown) continue;
      const i = this.alloc(camX, camZ);
      if (i < 0) return;
      this.initLeaf(i, this.litterCum, cfg.litter, rnd);
      this.px[i] = x; this.pz[i] = z;
      // Deterministic heading + face so a revisited cell looks the same.
      const yaw = rnd() * Math.PI * 2;
      const side = rnd() < 0.62 ? 1 : -1;
      this.qx[i] = 0; this.qy[i] = Math.sin(yaw / 2); this.qz[i] = 0; this.qw[i] = Math.cos(yaw / 2);
      if (side < 0) {
        // Flip 180° about the long axis (local Z): q · (0,0,1,0)
        const qx = this.qx[i], qy = this.qy[i], qz = this.qz[i], qw = this.qw[i];
        this.qx[i] = qy; this.qy[i] = -qx; this.qz[i] = qw; this.qw[i] = -qz;
      }
      this.computeRestTarget(i);
      this.qx[i] = this.tx[i]; this.qy[i] = this.ty[i]; this.qz[i] = this.tz[i]; this.qw[i] = this.tw[i];
      this.fade[i] = instant ? 1 : 0;
      this.fadeRate[i] = instant ? 0 : 1.3;
      this.py[i] = this.restY(i);
      this.state[i] = REST;
      this.cellOf[i] = key;
      list.push(i);
      this.markDirty(i);
      lastX = x; lastZ = z; have = true;
    }
  }

  // ── instance matrices ───────────────────────────────────────────────────
  private markDirty(i: number): void {
    const qx = this.qx[i], qy = this.qy[i], qz = this.qz[i], qw = this.qw[i];
    const sc = this.size[i] * this.fade[i];
    const sx = sc * this.aspect[i];
    const a = this.mesh.instanceMatrix.array as Float32Array;
    const o = i * 16;
    a[o] = (1 - 2 * (qy * qy + qz * qz)) * sx;
    a[o + 1] = 2 * (qx * qy + qw * qz) * sx;
    a[o + 2] = 2 * (qx * qz - qw * qy) * sx;
    a[o + 3] = 0;
    a[o + 4] = 2 * (qx * qy - qw * qz) * sc;
    a[o + 5] = (1 - 2 * (qx * qx + qz * qz)) * sc;
    a[o + 6] = 2 * (qy * qz + qw * qx) * sc;
    a[o + 7] = 0;
    a[o + 8] = 2 * (qx * qz + qw * qy) * sc;
    a[o + 9] = 2 * (qy * qz - qw * qx) * sc;
    a[o + 10] = (1 - 2 * (qx * qx + qy * qy)) * sc;
    a[o + 11] = 0;
    a[o + 12] = this.px[i];
    a[o + 13] = this.py[i];
    a[o + 14] = this.pz[i];
    a[o + 15] = 1;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  private writeZero(i: number): void {
    const a = this.mesh.instanceMatrix.array as Float32Array;
    a.fill(0, i * 16, i * 16 + 16);
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  /** How many leaves the player's stride kicked since the last call (foley). */
  takePlayerKicks(): number {
    const n = this.playerKicks;
    this.playerKicks = 0;
    return n;
  }

  /** Live counts (dev diagnostics). */
  stats(): { live: number; air: number; cells: number } {
    let live = 0;
    for (let i = 0; i < this.highWater; i++) if (this.state[i] !== FREE) live++;
    return { live, air: this.airCount, cells: this.cells.size };
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.mesh.dispose();
    this.cells.clear();
    this.canopyByKey.clear();
  }
}
