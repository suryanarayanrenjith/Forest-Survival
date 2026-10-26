// Types only — erased at build time. The engine itself is dynamic-import()ed
// inside init(), so the ~1 MB physics WASM never touches the menu / first paint.
import type * as RAPIER from '@dimforge/rapier3d-compat';

/**
 * PhysicsWorld — the ONE Rapier world every rigid-body system shares.
 * ===================================================================
 *
 * Ragdolls (RagdollSystem), throwables (GrenadeSystem) and loose debris
 * (RigidDebris) all live in this world, so a rolling grenade knocks into a
 * corpse, a severed robot head bounces off a tree trunk, and a blast shoves
 * all of them at once.
 *
 * WHAT IT OWNS
 *   • The ground. A HEIGHTFIELD that matches the visual terrain — the game's
 *     gameplay plane is y = 0 inside a flat disc that FOLLOWS THE PLAYER and
 *     the GPU raises the visible ground beyond it, so the field is re-centred
 *     on the player and resampled from the CPU replica of the terrain shader
 *     whenever they've moved far enough. Bodies settle on the ground you can
 *     see, not on a hidden plane underneath it. A deep safety floor catches
 *     anything that leaves the field.
 *   • The props. Tree trunks and rocks STREAM IN as colliders around awake
 *     bodies only (terrain itself streams by chunk, and a static collider for
 *     every prop on the map would be thousands of shapes for nothing). Each
 *     one ages out a couple of seconds after the last body near it settles.
 *   • The clock. A fixed-ceiling sub-step: every frame advances the world by
 *     exactly the (slow-mo scaled) frame delta, split into ≤ 1/60 s steps so
 *     a 30 FPS frame or a 144 Hz frame solve the same, stable contacts —
 *     never one huge step that blows a joint apart.
 *   • Cost. The world steps ONLY while a dynamic body exists; settled bodies
 *     sleep (≈ free); an empty field costs literally nothing.
 *
 * Until the WASM is ready (or if it fails to load) `ready` is false and every
 * caller falls back to its own lightweight integrator — nothing hard-depends
 * on Rapier being there.
 */

/** Collision-group bits (membership << 16 | filter). */
export const GROUP_WORLD = 0x0001;   // ground + props
export const GROUP_RAGDOLL = 0x0002; // corpses — never tangle with each other
export const GROUP_THROWN = 0x0004;  // live throwables
export const GROUP_DEBRIS = 0x0008;  // gibs / severed parts
export const groups = (member: number, filter: number): number => (member << 16) | filter;

/** A collidable prop as the terrain grid reports it (a vertical cylinder). */
export interface PhysicsProp {
  x: number;
  z: number;
  radius: number;
  height?: number;
}
/** Visit every collidable prop within `r` of (x, z). */
export type PropQuery = (x: number, z: number, r: number, visit: (prop: PhysicsProp) => void) => void;
/** Visual ground height under (x, z). */
export type GroundHeight = (x: number, z: number) => number;

interface PropEntry { collider: RAPIER.Collider; lastNeeded: number; }

/** Heightfield footprint: (CELLS × CELL) metres square, centred on the player. */
const HF_CELLS = 48;
const HF_CELL = 2;
/** Resample the field once the player is this far from its centre. */
const HF_RECENTRE = 6;
/** Props are streamed in within this distance of an awake body. */
const PROP_REACH = 4.5;
/** A prop collider no body has needed for this long is dropped (s). */
const PROP_TTL = 2.5;
const MAX_SUBSTEP = 1 / 60;
/** A body this far under the visible ground has gone through it (m). */
const RESCUE_DEPTH = 0.6;

export class PhysicsWorld {
  R: typeof RAPIER | null = null;
  world: RAPIER.World | null = null;
  private _ready = false;
  private _initStarted = false;
  readonly gravityY: number;

  private dynamicCount = 0;
  private clock = 0;

  // Ground
  private ground: GroundHeight | null = null;
  private heightfield: RAPIER.Collider | null = null;
  private hfCx = Infinity;
  private hfCz = Infinity;
  private centreX = 0;
  private centreZ = 0;
  private readonly hfHeights = new Float32Array((HF_CELLS + 1) * (HF_CELLS + 1));

  // Props
  private propQuery: PropQuery | null = null;
  private readonly props = new Map<PhysicsProp, PropEntry>();
  private propSweepAt = 0;
  private readonly _visitProp = (p: PhysicsProp) => this.needProp(p);

  // Radial-impulse scratch (allocation-free blasts).
  private readonly _v = { x: 0, y: 0, z: 0 };
  private readonly _w = { x: 0, y: 0, z: 0 };

  constructor(gravityY = 18) {
    this.gravityY = gravityY;
  }

  get ready(): boolean { return this._ready; }

  /** Load the WASM and build the world. Idempotent; never throws. */
  async init(): Promise<void> {
    if (this._initStarted) return;
    this._initStarted = true;
    try {
      const R = await import('@dimforge/rapier3d-compat');
      await R.init();
      const world = new R.World({ x: 0, y: -this.gravityY, z: 0 });
      // Safety floor well below any valley the terrain can carve: nothing
      // that slips off the heightfield's edge falls forever.
      world.createCollider(R.ColliderDesc.cuboid(2000, 1, 2000)
        .setTranslation(0, -60, 0)
        .setCollisionGroups(groups(GROUP_WORLD, 0xffff)));
      this.R = R;
      this.world = world;
      this._ready = true;
      this.rebuildGround(this.centreX, this.centreZ);
    } catch (err) {
      this._ready = false;
      console.warn('[PhysicsWorld] Rapier failed to initialise — using lightweight physics.', err);
    }
  }

  /** The visual-ground sampler (CPU replica of the terrain displacement). */
  setGround(fn: GroundHeight): void {
    this.ground = fn;
    this.hfCx = Infinity; // force a resample
  }

  /** Where the flat gameplay disc is centred (the player) — call per frame. */
  setCentre(x: number, z: number): void {
    this.centreX = x;
    this.centreZ = z;
  }

  /** The collidable-prop query (trees, rocks, structures). */
  setPropQuery(fn: PropQuery): void {
    this.propQuery = fn;
  }

  // ── Body bookkeeping ──────────────────────────────────────────────────

  /** Create a DYNAMIC body that keeps the world stepping while it lives. */
  createDynamic(desc: RAPIER.RigidBodyDesc): RAPIER.RigidBody | null {
    if (!this.world) return null;
    this.dynamicCount++;
    return this.world.createRigidBody(desc);
  }

  /** Remove a body made by createDynamic (its colliders + joints go with it). */
  removeDynamic(body: RAPIER.RigidBody): void {
    if (!this.world) return;
    this.world.removeRigidBody(body);
    this.dynamicCount = Math.max(0, this.dynamicCount - 1);
  }

  // ── Ground ────────────────────────────────────────────────────────────

  private rebuildGround(cx: number, cz: number): void {
    const R = this.R, world = this.world;
    if (!R || !world) return;
    // Snap to the cell grid so successive fields line up sample-for-sample.
    cx = Math.round(cx / HF_CELL) * HF_CELL;
    cz = Math.round(cz / HF_CELL) * HF_CELL;
    const n = HF_CELLS;
    const half = (n * HF_CELL) / 2;
    const h = this.hfHeights;
    const g = this.ground;
    // Column-major: heights[col * (n+1) + row]; columns run along +X, rows
    // along +Z, and the field is centred on the collider's translation.
    for (let col = 0; col <= n; col++) {
      const x = cx - half + col * HF_CELL;
      for (let row = 0; row <= n; row++) {
        h[col * (n + 1) + row] = g ? g(x, cz - half + row * HF_CELL) : 0;
      }
    }
    if (this.heightfield) world.removeCollider(this.heightfield, true); // wakes resting bodies
    this.heightfield = world.createCollider(
      R.ColliderDesc.heightfield(n, n, h, { x: n * HF_CELL, y: 1, z: n * HF_CELL })
        .setTranslation(cx, 0, cz)
        .setFriction(0.85)
        .setRestitution(0.25)
        .setCollisionGroups(groups(GROUP_WORLD, 0xffff)),
    );
    this.hfCx = cx;
    this.hfCz = cz;
  }

  // ── Props ─────────────────────────────────────────────────────────────

  private needProp(p: PhysicsProp): void {
    const e = this.props.get(p);
    if (e) { e.lastNeeded = this.clock; return; }
    const R = this.R, world = this.world;
    if (!R || !world) return;
    // Matches the gameplay obstacle test (0.8 × radius, up to its height).
    const r = Math.max(0.15, p.radius * 0.8);
    const height = Math.min(12, Math.max(0.6, p.height ?? 4));
    const base = this.ground ? this.ground(p.x, p.z) : 0;
    const collider = world.createCollider(R.ColliderDesc.cylinder(height / 2, r)
      .setTranslation(p.x, base + height / 2 - 0.05, p.z)
      .setFriction(0.7)
      .setRestitution(0.2)
      .setCollisionGroups(groups(GROUP_WORLD, 0xffff)));
    this.props.set(p, { collider, lastNeeded: this.clock });
  }

  private syncProps(): void {
    const world = this.world;
    const q = this.propQuery;
    if (!world || !q) return;
    world.forEachActiveRigidBody((b) => {
      const t = b.translation();
      q(t.x, t.z, PROP_REACH, this._visitProp);
    });
    if (this.clock >= this.propSweepAt) {
      this.propSweepAt = this.clock + 0.5;
      for (const [p, e] of this.props) {
        if (this.clock - e.lastNeeded > PROP_TTL) {
          world.removeCollider(e.collider, true);
          this.props.delete(p);
        }
      }
    }
  }

  // ── Forces ────────────────────────────────────────────────────────────

  /**
   * Shove every dynamic body near a blast outward + upward — corpses, gibs and
   * loose throwables alike. Velocity-based (mass-independent) with a smooth
   * falloff past the kill radius so the edge never reads as a wall. Returns
   * how many bodies were moved.
   */
  applyRadialImpulse(cx: number, cy: number, cz: number, radius: number, strength = 1): number {
    const world = this.world;
    if (!world || !this._ready || this.dynamicCount === 0) return 0;
    const reach = radius * 1.6;
    const reachSq = reach * reach;
    let affected = 0;
    world.forEachRigidBody((rb) => {
      if (!rb.isDynamic()) return;
      const t = rb.translation();
      const dx = t.x - cx, dy = t.y - cy, dz = t.z - cz;
      const horizSq = dx * dx + dz * dz;
      if (horizSq > reachSq) return;
      const d = Math.sqrt(horizSq);
      const f = 1 - d / reach;
      const ease = f * f;
      let nx: number, nz: number;
      if (d > 0.01) { nx = dx / d; nz = dz / d; }
      else { const a = Math.random() * Math.PI * 2; nx = Math.cos(a); nz = Math.sin(a); }
      const lift = dy < 0 ? 1.15 : 1.0;
      const speed = (6 + 15 * ease) * strength;
      const up = (5 + 9 * ease) * strength * lift;
      const v = rb.linvel();
      this._v.x = v.x + nx * speed;
      this._v.y = v.y + up;
      this._v.z = v.z + nz * speed;
      rb.setLinvel(this._v, true);
      const av = rb.angvel();
      const spin = 9 * ease * strength;
      this._w.x = av.x + (Math.random() - 0.5) * spin;
      this._w.y = av.y + (Math.random() - 0.5) * spin;
      this._w.z = av.z + (Math.random() - 0.5) * spin;
      rb.setAngvel(this._w, true);
      affected++;
    });
    return affected;
  }

  // ── Clock ─────────────────────────────────────────────────────────────

  /**
   * Advance by the game's frame delta (already slow-mo scaled, so bodies
   * dilate in bullet-time like everything else). No-op with no dynamic body.
   */
  step(dt: number): void {
    const world = this.world;
    if (!world || !this._ready || this.dynamicCount === 0 || dt <= 0) return;
    // A stall/GC spike can't explode the solver: cap the frame, then split it
    // into equal sub-steps no longer than 1/60 s.
    const frame = dt > 0.05 ? 0.05 : dt;
    const n = Math.max(1, Math.ceil(frame / MAX_SUBSTEP - 1e-6));
    this.clock += frame;
    if (Math.abs(this.centreX - this.hfCx) > HF_RECENTRE || Math.abs(this.centreZ - this.hfCz) > HF_RECENTRE) {
      this.rebuildGround(this.centreX, this.centreZ);
    }
    this.syncProps();
    world.timestep = frame / n;
    for (let i = 0; i < n; i++) world.step();
    this.rescueSunken();
  }

  /**
   * Safety net: an awake body found well under the visible ground (the field
   * is a zero-thickness surface, so anything driven through it would fall
   * forever) is lifted back onto it with its vertical speed killed. Also
   * covers the ground shifting under a body as the flat disc follows the
   * player between heightfield resamples.
   */
  private rescueSunken(): void {
    const world = this.world;
    if (!world) return;
    const g = this.ground;
    world.forEachActiveRigidBody((b) => {
      const t = b.translation();
      const gy = g ? g(t.x, t.z) : 0;
      if (t.y >= gy - RESCUE_DEPTH) return;
      this._v.x = t.x; this._v.y = gy + 0.25; this._v.z = t.z;
      b.setTranslation(this._v, true);
      const v = b.linvel();
      this._w.x = v.x * 0.3; this._w.y = 0; this._w.z = v.z * 0.3;
      b.setLinvel(this._w, true);
    });
  }

  /** Dev/diagnostic snapshot. */
  debugInfo(): { hf: [number, number]; centre: [number, number]; dynamic: number; props: number } {
    return { hf: [this.hfCx, this.hfCz], centre: [this.centreX, this.centreZ], dynamic: this.dynamicCount, props: this.props.size };
  }

  /** Free everything (scene teardown). Callers must drop their bodies first. */
  dispose(): void {
    if (this.world) this.world.free();
    this.world = null;
    this.R = null;
    this.heightfield = null;
    this.props.clear();
    this.dynamicCount = 0;
    this._ready = false;
    this._initStarted = false;
    this.hfCx = Infinity;
    this.hfCz = Infinity;
  }
}
