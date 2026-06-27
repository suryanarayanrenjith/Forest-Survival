import * as THREE from 'three';
// Types only — erased at build time, so importing them costs nothing in the
// bundle. The engine itself is pulled in lazily via dynamic import() inside
// init(), so the ~1 MB physics WASM never touches the menu / first paint and
// is only fetched the first time a solo game with ragdolls actually starts.
import type * as RAPIER from '@dimforge/rapier3d-compat';

/**
 * RagdollSystem — engine-grade enemy-death ragdolls backed by Rapier.
 *
 * WHY THIS EXISTS (and why it's scoped the way it is):
 *   The rest of the game's "physics" is featherlight, hand-rolled kinematic
 *   integration (bullets, casings, gibs, player movement) and is already about
 *   as cheap as it gets — moving any of it into a rigid-body engine would only
 *   ADD cost. Ragdolls are the one place a real solver earns its keep: corpses
 *   tumble with a true inertia tensor, drape over each other, settle into
 *   stable rest poses, and go to sleep (≈ free) once still — none of which the
 *   single-velocity "ragdoll-lite" launcher could do.
 *
 * HOW IT STAYS CHEAP (so it never regresses the thing it's part of):
 *   • Lazy-loaded   — the WASM is dynamic-import()ed on first solo game start;
 *                     the menu and initial bundle are untouched.
 *   • Capped        — at most `maxActive` live bodies; the oldest corpse is
 *                     recycled when the cap is hit (it was already fading out).
 *   • Sleeps        — settled corpses are slept by Rapier and cost ~nothing.
 *   • Stepped only when ≥1 corpse is active, with the game's own (slow-mo
 *     scaled) delta so ragdolls obey bullet-time exactly like everything else.
 *   • Graceful      — until the WASM is ready (or if it fails to load at all),
 *     spawn() returns -1 and the caller transparently falls back to the old
 *     lightweight death integrator. Nothing hard-depends on Rapier being there.
 *
 * The corpse mesh is driven as a SINGLE compound body (a capsule) rather than a
 * fully articulated per-limb skeleton: the enemy meshes are pooled and reused,
 * so re-parenting their limbs into world space every death would be both a GC
 * and a correctness hazard. One body per corpse gives real-world collisions,
 * real tumbling and corpse-on-corpse piling without ever touching the pool's
 * mesh hierarchy — we only READ the body transform and copy it onto the group.
 */
export class RagdollSystem {
  private rapier: typeof RAPIER | null = null;
  private world: RAPIER.World | null = null;
  private _ready = false;
  private _initStarted = false;

  /** id → live rigid body. */
  private readonly bodies = new Map<number, RAPIER.RigidBody>();
  /** ids in spawn order, so the OLDEST corpse is the one recycled at the cap. */
  private readonly order: number[] = [];
  private nextId = 1;

  private readonly maxActive: number;
  private readonly gravityY: number;

  // Reusable vector-likes for applyRadialImpulse so a blast that shoves several
  // corpses allocates nothing (Rapier's set*vel accept any {x,y,z}).
  private readonly _scratchV = { x: 0, y: 0, z: 0 };
  private readonly _scratchW = { x: 0, y: 0, z: 0 };

  constructor(maxActive = 20, gravityY = 18) {
    this.maxActive = maxActive;
    this.gravityY = gravityY;
  }

  get isReady(): boolean { return this._ready; }
  get activeCount(): number { return this.order.length; }

  /**
   * Lazily load Rapier's WASM, build the physics world + static ground, and go
   * live. Idempotent and safe to call more than once — only the first call does
   * work. Never throws: a failure (WASM blocked, fetch error) leaves the system
   * un-ready so callers fall back to the lightweight ragdoll path.
   */
  async init(): Promise<void> {
    if (this._initStarted) return;
    this._initStarted = true;
    try {
      const RAPIER = await import('@dimforge/rapier3d-compat');
      await RAPIER.init();
      const world = new RAPIER.World({ x: 0, y: -this.gravityY, z: 0 });
      // Big thin static floor — its TOP face sits exactly at y = 0, matching the
      // game's flat gameplay ground envelope, so corpses rest where they always
      // did. Friction + a little restitution give the same tumble-and-settle.
      const ground = RAPIER.ColliderDesc.cuboid(600, 0.5, 600)
        .setTranslation(0, -0.5, 0)
        .setRestitution(0.3)
        .setFriction(0.85);
      world.createCollider(ground);
      this.rapier = RAPIER;
      this.world = world;
      this._ready = true;
    } catch (err) {
      this._ready = false;
      // Non-fatal: the caller falls back to the lightweight death integrator.
      console.warn('[RagdollSystem] Rapier failed to initialise — using lightweight ragdolls.', err);
    }
  }

  /**
   * Launch a corpse. Positions/velocities/spin are in the same world units the
   * rest of the game uses; `baseScale` sizes the capsule to the enemy archetype.
   * Returns an opaque body id, or -1 if the engine isn't ready (→ fall back).
   */
  spawn(
    px: number, py: number, pz: number,
    vx: number, vy: number, vz: number,
    sx: number, sy: number, sz: number,
    baseScale: number,
  ): number {
    const RAPIER = this.rapier;
    const world = this.world;
    if (!RAPIER || !world || !this._ready) return -1;

    // At the cap, retire the oldest corpse (already near the end of its fade).
    if (this.order.length >= this.maxActive) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.destroy(oldest);
    }

    const radius = 0.4 * baseScale;
    const halfHeight = 0.45 * baseScale;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(px, py, pz)
      .setLinvel(vx, vy, vz)
      .setAngvel({ x: sx, y: sy, z: sz })
      .setLinearDamping(0.12)
      .setAngularDamping(0.45)
      .setCcdEnabled(true); // don't let a fast launch tunnel through the floor
    const rb = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setRestitution(0.32)
      .setFriction(0.8)
      .setDensity(1.1);
    world.createCollider(colliderDesc, rb);

    const id = this.nextId++;
    this.bodies.set(id, rb);
    this.order.push(id);
    return id;
  }

  /**
   * Copy a corpse body's current transform onto a THREE position + quaternion
   * (no allocation). Returns false if the body no longer exists (e.g. it was
   * recycled out from under a still-fading corpse under heavy cap pressure).
   */
  read(id: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): boolean {
    const rb = this.bodies.get(id);
    if (!rb) return false;
    const t = rb.translation();
    outPos.set(t.x, t.y, t.z);
    const r = rb.rotation();
    outQuat.set(r.x, r.y, r.z, r.w);
    return true;
  }

  /**
   * Shove every live corpse near a blast outward + upward — the physical
   * "bodies fly from the explosion" feel. Velocity-based (not force-based) so the
   * result is mass-independent and reads consistently for light fast-bots and
   * heavy tanks alike, with a smooth distance falloff and a satisfying upward
   * pop. Solo-only by construction (MP never spawns Rapier corpses, so `bodies`
   * is empty → no-op) and free when no corpse is in range. `strength` scales the
   * whole kick (1 = a standard grenade; the nuke/airstrike pass more).
   * Returns how many corpses were affected.
   */
  applyRadialImpulse(cx: number, cy: number, cz: number, radius: number, strength = 1): number {
    const world = this.world;
    if (!world || !this._ready || this.order.length === 0) return 0;
    // Corpses just outside the kill radius should still get nudged, so the blast
    // edge doesn't look like a hard wall.
    const reach = radius * 1.6;
    const reachSq = reach * reach;
    let affected = 0;
    for (const rb of this.bodies.values()) {
      const t = rb.translation();
      const dx = t.x - cx;
      const dy = t.y - cy;
      const dz = t.z - cz;
      const horizSq = dx * dx + dz * dz;
      if (horizSq > reachSq) continue;
      const d = Math.sqrt(horizSq);
      const f = 1 - d / reach;           // 1 at centre → 0 at the edge
      const ease = f * f;                // bias the kick toward the epicentre
      // Outward direction (random scatter at the exact centre so a dead-centre
      // corpse still launches somewhere rather than straight up).
      let nx: number, nz: number;
      if (d > 0.01) { nx = dx / d; nz = dz / d; }
      else { const a = Math.random() * Math.PI * 2; nx = Math.cos(a); nz = Math.sin(a); }
      // A corpse below the blast centre (typical — bodies are on the ground) gets
      // a touch more lift so it actually leaves the ground.
      const lift = dy < 0 ? 1.15 : 1.0;
      const speed = (6 + 15 * ease) * strength;
      const up = (5 + 9 * ease) * strength * lift;
      const v = rb.linvel();
      this._scratchV.x = v.x + nx * speed;
      this._scratchV.y = v.y + up;
      this._scratchV.z = v.z + nz * speed;
      rb.setLinvel(this._scratchV, true); // `true` wakes a sleeping corpse
      const av = rb.angvel();
      const spin = 9 * ease * strength;
      this._scratchW.x = av.x + (Math.random() - 0.5) * spin;
      this._scratchW.y = av.y + (Math.random() - 0.5) * spin;
      this._scratchW.z = av.z + (Math.random() - 0.5) * spin;
      rb.setAngvel(this._scratchW, true);
      affected++;
    }
    return affected;
  }

  /** Retire a corpse body once its visual has finished fading. */
  release(id: number): void {
    const i = this.order.indexOf(id);
    if (i !== -1) this.order.splice(i, 1);
    this.destroy(id);
  }

  private destroy(id: number): void {
    const rb = this.bodies.get(id);
    if (rb && this.world) this.world.removeRigidBody(rb); // also drops its collider
    this.bodies.delete(id);
  }

  /** Drop every live corpse (game reset / scene teardown). */
  releaseAll(): void {
    if (this.world) {
      for (const rb of this.bodies.values()) this.world.removeRigidBody(rb);
    }
    this.bodies.clear();
    this.order.length = 0;
  }

  /**
   * Advance the simulation by the game's frame delta (already scaled by the
   * transient + critical-health slow-mo, so corpses dilate in bullet-time too).
   * No-op while no corpses are live, so an idle field costs literally nothing.
   * The step is clamped to ≥30 Hz worth of time so a GC/stall spike can't blow
   * the solver up.
   */
  step(dt: number): void {
    const world = this.world;
    if (!world || !this._ready || this.order.length === 0) return;
    // Hold corpses perfectly still on a paused / zero-delta frame (the main
    // loop already freezes during pause; this is belt-and-braces).
    if (dt <= 0) return;
    world.timestep = dt > 1 / 30 ? 1 / 30 : dt;
    world.step();
  }

  /** Free the Rapier world + all bodies. Call on scene unmount. */
  dispose(): void {
    this.releaseAll();
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.rapier = null;
    this._ready = false;
    this._initStarted = false;
  }
}
