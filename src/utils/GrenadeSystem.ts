/**
 * THROWABLES IN FLIGHT — bouncing, rolling, sticking, embedding, fused.
 * ====================================================================
 *
 * This module owns ONLY the physical object of every throwable in the
 * catalog (see Throwables.ts): flight under the kind's own gravity, bounces
 * off the ground and obstacles (restitution + friction + tumble), rolling to
 * rest, and the three ways a throwable can end:
 *
 *   • 'fuse'  — frag / EMP / thermite / smoke / decoy: the fuse runs from the
 *               release; smoke and decoy then LINGER (the canister keeps
 *               emitting / the beacon keeps calling) before they're removed.
 *   • 'stick' — the C4 charge clings to the first robot or surface it touches
 *               (riding a robot's chassis, even through its death fall) and
 *               its timer starts on contact.
 *   • 'blade' — the throwing knife flies flat and fast, end over end, and
 *               EMBEDS where it strikes: in a robot (onImpact → damage) or in
 *               a trunk / the ground.
 *
 * What an effect DOES is App's business (`onDetonate`, `onImpact`) — the same
 * callbacks serve the local thrower (damage + FX) and a remote player's
 * replicated throw (FX only), so a throw looks identical on every screen.
 *
 * RIGID BODIES: once the shared PhysicsWorld is up, every 'fuse' throwable
 * (frag, thermite, smoke, EMP, decoy) flies as a real Rapier body with a
 * convex-hull collider fitted to its own model — so it tumbles with a true
 * inertia tensor, a canister rolls along its axis and comes to rest on its
 * side, a frag wobbles to a stop, and everything glances off tree trunks,
 * rocks and corpses. Robots stay a gameplay test (they're not in the physics
 * world) and simply deflect the body. The knife and the C4 charge keep the
 * hand-rolled integrator: they end on first contact, where a solver adds
 * nothing. Before the WASM is ready every kind uses that integrator.
 *
 * Every live throwable is one mesh sharing the ItemAtlas material and a cached
 * geometry. The aim-arc preview is a pre-allocated line + landing ring that
 * are NEVER hidden with `.visible` (the warmup rule) — idle is a zero draw
 * range / zero scale.
 */
import * as THREE from 'three';
import type * as RAPIER from '@dimforge/rapier3d-compat';
import { getItemMaterial, getThrownGrenadeGeometry } from './ItemAtlas';
import { THROWABLES, THROWABLE_KINDS, type ThrowableKind } from './Throwables';
import { GROUP_DEBRIS, GROUP_RAGDOLL, GROUP_THROWN, GROUP_WORLD, groups, type PhysicsWorld } from './PhysicsWorld';

export type GrenadeKind = ThrowableKind;
export const GRENADE_KINDS = THROWABLE_KINDS;

/** Collision radius of a thrown body (world units). */
const RADIUS = 0.17;
/** In-world display scale over the true-size model (readable at range). */
const WORLD_SCALE = 1.45;
/** How long a smoke canister keeps pouring after its fuse (s). */
export const SMOKE_EMIT_SECONDS = 15;
/** Seconds an embedded knife stays in a robot / the world. */
const KNIFE_STAY_ROBOT = 2.6;
const KNIFE_STAY_WORLD = 7;

export interface LiveGrenade {
  kind: GrenadeKind;
  /** Thrown by THIS client (effects apply) vs replicated (FX only). */
  local: boolean;
  /** Thrower id in multiplayer ('' in solo). */
  owner: string;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Angular velocity (rad/s) — tumble in flight, roll on the ground. */
  ang: THREE.Vector3;
  /** Seconds left on the fuse (from release, or from contact for 'stick'). */
  fuse: number;
  resting: boolean;
  bounces: number;
  /** Stuck / embedded: no more physics; may ride `attach`. */
  stuck: boolean;
  attach: THREE.Object3D | null;
  /** Whatever App hit (the Enemy) — handed back in callbacks. */
  attachRef: unknown;
  attachOffset: THREE.Vector3;
  attachQuat: THREE.Quaternion;
  /** Fused + lingering (smoke pouring / spent knife waiting to vanish). */
  detonated: boolean;
  linger: number;
  age: number;
  /** Rapier body when this throwable flies on the shared physics world. */
  body: RAPIER.RigidBody | null;
}

/** Ground height under (x, z). */
export type GroundFn = (x: number, z: number) => number;
/** What an obstacle query found. */
export interface SolidHit {
  /** Outward horizontal normal. */
  normal: THREE.Vector3;
  /** The robot's mesh when the obstacle is a robot (null for terrain). */
  target: THREE.Object3D | null;
  /** App's object for that robot (the Enemy). */
  ref: unknown;
}
/**
 * Solid-obstacle query: if a sphere of `radius` at (x, y, z) intersects a
 * tree / rock / robot, fill `out` and return the penetration depth; else 0.
 */
export type SolidFn = (x: number, y: number, z: number, radius: number, out: SolidHit) => number;

const PREVIEW_POINTS = 72;
const PREVIEW_STEP = 0.04;

const _hit: SolidHit = { normal: new THREE.Vector3(), target: null, ref: null };
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _DOWN = new THREE.Vector3(0, -1, 0);
const _lin = { x: 0, y: 0, z: 0 };
const THROWN_GROUPS = groups(GROUP_THROWN, GROUP_WORLD | GROUP_RAGDOLL | GROUP_DEBRIS | GROUP_THROWN);
/** Below this speed a rigid throwable counts as resting (decoys start calling). */
const REST_SPEED = 0.45;

export class GrenadeSystem {
  readonly live: LiveGrenade[] = [];
  private readonly scene: THREE.Scene;
  private readonly ground: GroundFn;
  private readonly solid: SolidFn;
  private readonly physics: PhysicsWorld | null;
  /** Convex-hull points per kind (model space × display scale), built once. */
  private readonly hulls = new Map<GrenadeKind, Float32Array | null>();

  // ── Aim-arc preview (pre-allocated, never .visible-toggled) ──
  private readonly arcGeo: THREE.BufferGeometry;
  private readonly arcPos: Float32Array;
  private readonly arcLine: THREE.Line;
  private readonly arcMat: THREE.LineBasicMaterial;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private prewarming = false;
  private pulse = 0;

  /** The fuse ran out (frag/emp/thermite/sticky: blast · smoke: start pouring · decoy: fizzle). */
  onDetonate: ((g: LiveGrenade) => void) | null = null;
  /** A knife struck something (`ref` = the robot, null for the world). */
  onImpact: ((g: LiveGrenade, ref: unknown, at: THREE.Vector3) => void) | null = null;
  /** The C4 charge stuck to something. */
  onStick: ((g: LiveGrenade, ref: unknown) => void) | null = null;
  /** Each audible bounce (`speed` = impact speed, u/s). */
  onBounce: ((g: LiveGrenade, speed: number) => void) | null = null;
  /** Is an attachment still a valid place to ride (e.g. the corpse still exists)? */
  attachValid: ((ref: unknown) => boolean) | null = null;

  constructor(scene: THREE.Scene, ground: GroundFn, solid: SolidFn, physics: PhysicsWorld | null = null) {
    this.scene = scene;
    this.ground = ground;
    this.solid = solid;
    this.physics = physics;

    this.arcPos = new Float32Array(PREVIEW_POINTS * 3);
    this.arcGeo = new THREE.BufferGeometry();
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.arcGeo.setDrawRange(0, 0);
    this.arcMat = new THREE.LineBasicMaterial({
      color: 0xf2f4ee, transparent: true, opacity: 0.55, depthWrite: false, fog: false,
    });
    this.arcLine = new THREE.Line(this.arcGeo, this.arcMat);
    this.arcLine.frustumCulled = false;
    this.arcLine.renderOrder = 995;
    scene.add(this.arcLine);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xf2f4ee, transparent: true, opacity: 0.6, depthWrite: false, fog: false,
      side: THREE.DoubleSide,
    });
    const ringGeo = new THREE.RingGeometry(0.62, 0.8, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.scale.setScalar(0.0001);
    this.ring.renderOrder = 995;
    scene.add(this.ring);
  }

  /**
   * Release a throwable. `origin` is the hand in world space, `velocity` in
   * u/s. `fuse` overrides the catalog fuse for 'fuse' kinds — a cooked frag
   * leaves the hand with whatever time was left on it.
   */
  throw(kind: GrenadeKind, origin: THREE.Vector3, velocity: THREE.Vector3, local: boolean, owner = '', fuse?: number): LiveGrenade {
    const spec = THROWABLES[kind];
    const mesh = new THREE.Mesh(getThrownGrenadeGeometry(kind), getItemMaterial());
    mesh.scale.setScalar(kind === 'knife' ? WORLD_SCALE * 1.15 : WORLD_SCALE);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const ang = new THREE.Vector3();
    if (kind === 'knife') {
      // End over end about the axis across the flight path (~2.2 rev/s per 10 u/s).
      _axis.crossVectors(velocity, _UP);
      if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
      _axis.normalize();
      ang.copy(_axis).multiplyScalar(-velocity.length() * 0.85);
      // Point the blade along the throw to start.
      _dir.copy(velocity).normalize();
      mesh.quaternion.setFromUnitVectors(_UP, _dir);
    } else {
      // A real throw leaves the hand spinning end over end.
      ang.set(8 + Math.random() * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
    }
    const g: LiveGrenade = {
      kind, local, owner, mesh,
      pos: origin.clone(),
      vel: velocity.clone(),
      ang,
      fuse: spec.impact === 'stick' ? Infinity : spec.impact === 'blade' ? Infinity : (fuse ?? spec.fuse),
      resting: false,
      bounces: 0,
      stuck: false,
      attach: null,
      attachRef: null,
      attachOffset: new THREE.Vector3(),
      attachQuat: new THREE.Quaternion(),
      detonated: false,
      linger: 0,
      age: 0,
      body: null,
    };
    if (spec.impact === 'fuse') g.body = this.createBody(g);
    this.live.push(g);
    return g;
  }

  /**
   * The convex hull of a kind's model at display scale — computed by Rapier
   * once from the full vertex cloud, then cached as just the hull vertices so
   * every later throw builds its collider from a few dozen points.
   */
  private hullFor(kind: GrenadeKind): Float32Array | null {
    if (this.hulls.has(kind)) return this.hulls.get(kind) ?? null;
    const R = this.physics?.R;
    const world = this.physics?.world;
    if (!R || !world) return null;
    const src = getThrownGrenadeGeometry(kind).getAttribute('position') as THREE.BufferAttribute;
    const pts = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) {
      pts[i * 3] = src.getX(i) * WORLD_SCALE;
      pts[i * 3 + 1] = src.getY(i) * WORLD_SCALE;
      pts[i * 3 + 2] = src.getZ(i) * WORLD_SCALE;
    }
    let hull: Float32Array | null = null;
    const desc = R.ColliderDesc.convexHull(pts);
    if (desc) {
      const probe = world.createCollider(desc);
      const v = probe.vertices();
      hull = v && v.length >= 12 ? new Float32Array(v) : null;
      world.removeCollider(probe, false);
    }
    this.hulls.set(kind, hull);
    return hull;
  }

  /** A rigid body for a 'fuse' throwable, or null (→ hand-rolled integrator). */
  private createBody(g: LiveGrenade): RAPIER.RigidBody | null {
    const physics = this.physics;
    const R = physics?.R;
    const world = physics?.world;
    if (!physics || !R || !world || !physics.ready) return null;
    const spec = THROWABLES[g.kind];
    const hull = this.hullFor(g.kind);
    const shape = (hull && R.ColliderDesc.convexHull(hull)) || R.ColliderDesc.ball(RADIUS);
    const q = g.mesh.quaternion;
    const body = physics.createDynamic(R.RigidBodyDesc.dynamic()
      .setTranslation(g.pos.x, g.pos.y, g.pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinvel(g.vel.x, g.vel.y, g.vel.z)
      .setAngvel({ x: g.ang.x, y: g.ang.y, z: g.ang.z })
      // Each kind keeps its own throw feel (a canister lobs heavier than a frag).
      .setGravityScale(spec.gravity / physics.gravityY)
      .setLinearDamping(0.04)
      // No rolling resistance in a rigid solver — angular damping stands in
      // for it, so a canister rolls a few metres and stops instead of forever.
      .setAngularDamping(0.7)
      .setCcdEnabled(true));
    if (!body) return null;
    world.createCollider(shape
      .setDensity(0.6)
      .setRestitution(spec.restitution)
      .setFriction(Math.max(0.35, spec.friction))
      .setCollisionGroups(THROWN_GROUPS), body);
    return body;
  }

  /** Advance a rigid throwable (the world has already stepped this frame). */
  private stepBody(g: LiveGrenade, body: RAPIER.RigidBody): void {
    const t = body.translation();
    g.pos.set(t.x, t.y, t.z);
    const lv = body.linvel();
    // Robots aren't in the physics world: deflect off a chassis like a wall —
    // by VELOCITY only. Teleporting the body out of a walking robot could
    // wedge it into a trunk, and the solver's depenetration would then shove
    // it through the ground; a velocity kick just bats it away.
    _hit.target = null;
    _hit.ref = null;
    const pen = this.solid(g.pos.x, g.pos.y, g.pos.z, RADIUS, _hit);
    let vx = lv.x, vy = lv.y, vz = lv.z;
    if (pen > 0 && _hit.target) {
      const n = _hit.normal;
      const vn = vx * n.x + vz * n.z;
      if (vn < 0) {
        vx = (vx - 1.45 * vn * n.x) * 0.7;
        vz = (vz - 1.45 * vn * n.z) * 0.7;
        vy *= 0.7;
        if (-vn > 3) this.onBounce?.(g, -vn);
      }
      // A robot leaning on a resting throwable nudges it clear.
      const out = vx * n.x + vz * n.z;
      if (out < 1.6) { vx += n.x * (1.6 - out); vz += n.z * (1.6 - out); }
      _lin.x = vx; _lin.y = vy; _lin.z = vz;
      body.setLinvel(_lin, true);
    }
    // A hard contact shows up as the falling velocity snapping back.
    const dvy = vy - g.vel.y;
    if (g.vel.y < -2.2 && dvy > 2.2) {
      g.bounces++;
      this.onBounce?.(g, -g.vel.y);
    }
    g.vel.set(vx, vy, vz);
    g.resting = g.vel.lengthSq() < REST_SPEED * REST_SPEED;
    const r = body.rotation();
    g.mesh.position.copy(g.pos);
    g.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  /** Advance every live throwable; fires the effect callbacks. */
  update(dt: number): void {
    if (dt <= 0) return;
    this.pulse += dt;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.age += dt;

      // ── Lingering after the effect (smoke pouring, spent knife, …) ──
      if (g.detonated) {
        g.linger -= dt;
        if (g.attach) this.ride(g);
        // A pouring smoke canister keeps rolling (its plume follows it).
        else if (g.body) this.stepBody(g, g.body);
        if (g.linger <= 0) { this.remove(i); }
        continue;
      }

      g.fuse -= dt;
      if (g.fuse <= 0) {
        g.detonated = true;
        this.onDetonate?.(g);
        // Smoke keeps its canister on the ground while it pours; everything
        // else is consumed by the effect.
        g.linger = g.kind === 'smoke' ? SMOKE_EMIT_SECONDS : 0;
        if (g.linger <= 0) this.remove(i);
        continue;
      }
      // Safety: nothing flies forever (a knife thrown into the sky, …).
      if (g.age > 14 && !g.stuck) { g.detonated = true; g.linger = 0; this.remove(i); continue; }

      if (g.stuck) {
        if (g.attach) this.ride(g);
        continue;
      }

      if (g.body) { this.stepBody(g, g.body); continue; }

      // Sub-step so a fast throw can't tunnel through a trunk or the ground.
      const steps = Math.max(1, Math.ceil(dt / (g.kind === 'knife' ? 1 / 240 : 1 / 90)));
      const h = dt / steps;
      for (let s = 0; s < steps && !g.stuck; s++) this.step(g, h);
      if (g.stuck) continue;
      g.mesh.position.copy(g.pos);
      const w = g.ang.length();
      if (w > 1e-4) {
        _axis.copy(g.ang).multiplyScalar(1 / w);
        _q.setFromAxisAngle(_axis, w * dt);
        g.mesh.quaternion.premultiply(_q);
      }
    }
  }

  private remove(i: number): void {
    const g = this.live[i];
    this.live.splice(i, 1);
    this.scene.remove(g.mesh);
    this.dropBody(g);
  }

  private dropBody(g: LiveGrenade): void {
    if (g.body && this.physics) this.physics.removeDynamic(g.body);
    g.body = null;
  }

  /** Keep a stuck throwable on its moving host (a robot, even as a falling corpse). */
  private ride(g: LiveGrenade): void {
    const host = g.attach;
    if (!host) return;
    if (this.attachValid && !this.attachValid(g.attachRef)) {
      // The host is gone (corpse recycled): drop where it was.
      g.attach = null;
      g.attachRef = null;
      return;
    }
    host.updateMatrixWorld();
    g.pos.copy(g.attachOffset).applyMatrix4(host.matrixWorld);
    g.mesh.position.copy(g.pos);
    host.getWorldQuaternion(_q);
    g.mesh.quaternion.copy(_q).multiply(g.attachQuat);
  }

  /** Pin a throwable to whatever it hit (`target` null = the static world). */
  private stickTo(g: LiveGrenade, target: THREE.Object3D | null, ref: unknown): void {
    // (The caller has already oriented the mesh: knife point-first along its
    // flight, the charge's adhesive face against the surface.)
    g.stuck = true;
    g.vel.set(0, 0, 0);
    g.ang.set(0, 0, 0);
    if (target) {
      target.updateMatrixWorld();
      g.attach = target;
      g.attachRef = ref;
      g.attachOffset.copy(g.pos).applyMatrix4(_m4.copy(target.matrixWorld).invert());
      target.getWorldQuaternion(_q);
      g.attachQuat.copy(_q).invert().multiply(g.mesh.quaternion);
    }
  }

  private step(g: LiveGrenade, h: number): void {
    const spec = THROWABLES[g.kind];
    if (!g.resting) g.vel.y -= spec.gravity * h;
    const vx = g.vel.x, vy = g.vel.y, vz = g.vel.z;
    g.pos.addScaledVector(g.vel, h);

    // ── Obstacles (trees, rocks, robots) ──
    _hit.target = null;
    _hit.ref = null;
    const pen = this.solid(g.pos.x, g.pos.y, g.pos.z, RADIUS, _hit);
    if (pen > 0) {
      const n = _hit.normal;
      if (spec.impact === 'blade') {
        // Embed point-first, a touch inside the surface.
        _dir.set(vx, vy, vz).normalize();
        g.mesh.quaternion.setFromUnitVectors(_UP, _dir);
        g.pos.addScaledVector(_dir, 0.06);
        g.mesh.position.copy(g.pos);
        this.onImpact?.(g, _hit.ref, g.pos);
        this.stickTo(g, _hit.target, _hit.ref);
        g.detonated = true;
        g.linger = _hit.target ? KNIFE_STAY_ROBOT : KNIFE_STAY_WORLD;
        return;
      }
      if (spec.impact === 'stick') {
        g.pos.x += n.x * pen * 0.6;
        g.pos.z += n.z * pen * 0.6;
        g.mesh.position.copy(g.pos);
        // Adhesive face (−Y) toward the surface.
        _dir.set(-n.x, 0, -n.z);
        g.mesh.quaternion.setFromUnitVectors(_DOWN, _dir);
        this.stickTo(g, _hit.target, _hit.ref);
        g.fuse = spec.fuse;
        this.onStick?.(g, _hit.ref);
        return;
      }
      g.pos.x += n.x * pen;
      g.pos.z += n.z * pen;
      const vn = g.vel.x * n.x + g.vel.z * n.z;
      if (vn < 0) {
        g.vel.x -= 1.45 * vn * n.x;
        g.vel.z -= 1.45 * vn * n.z;
        g.vel.multiplyScalar(0.7);
        g.ang.set(g.ang.z * 0.6, g.ang.y + (Math.random() - 0.5) * 6, -g.ang.x * 0.6);
        if (-vn > 3) this.onBounce?.(g, -vn);
      }
    }

    // ── Ground ──
    const gy = this.ground(g.pos.x, g.pos.z) + RADIUS;
    if (g.pos.y <= gy) {
      g.pos.y = gy;
      if (spec.impact === 'blade') {
        // Knife buries its point in the dirt at the angle it came in.
        _dir.set(vx, vy, vz).normalize();
        g.mesh.quaternion.setFromUnitVectors(_UP, _dir);
        g.pos.y = gy - RADIUS * 0.6;
        g.mesh.position.copy(g.pos);
        this.onImpact?.(g, null, g.pos);
        this.stickTo(g, null, null);
        g.detonated = true;
        g.linger = KNIFE_STAY_WORLD;
        return;
      }
      if (spec.impact === 'stick') {
        g.pos.y = gy - RADIUS * 0.55;
        g.mesh.position.copy(g.pos);
        g.mesh.quaternion.setFromUnitVectors(_DOWN, _DOWN);
        this.stickTo(g, null, null);
        g.fuse = spec.fuse;
        this.onStick?.(g, null);
        return;
      }
      if (g.vel.y < -2.2) {
        const impact = -g.vel.y;
        g.vel.y = impact * spec.restitution;
        g.vel.x *= spec.friction;
        g.vel.z *= spec.friction;
        g.bounces++;
        g.ang.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10)
          .multiplyScalar(Math.min(1, impact / 14));
        this.onBounce?.(g, impact);
      } else {
        g.vel.y = 0;
        g.resting = true;
        // Rolling friction; the spin locks to the roll (axis = up × v).
        const sp = Math.hypot(g.vel.x, g.vel.z);
        const decel = 9 * h;
        if (sp <= decel) {
          g.vel.x = 0; g.vel.z = 0;
          g.ang.multiplyScalar(Math.max(0, 1 - 6 * h));
        } else {
          const k = (sp - decel) / sp;
          g.vel.x *= k; g.vel.z *= k;
          g.ang.set(g.vel.z, 0, -g.vel.x).multiplyScalar(1 / (RADIUS * WORLD_SCALE));
        }
      }
    } else if (g.resting && g.pos.y > gy + 0.05) {
      g.resting = false; // rolled off a lip
    }
  }

  /** Live decoys that have landed and are calling robots onto themselves. */
  forEachActiveDecoy(fn: (g: LiveGrenade) => void): void {
    for (const g of this.live) if (g.kind === 'decoy' && !g.detonated && (g.resting || g.stuck)) fn(g);
  }

  /** Smoke canisters currently pouring. */
  forEachSmoke(fn: (g: LiveGrenade) => void): void {
    for (const g of this.live) if (g.kind === 'smoke' && g.detonated && g.linger > 0) fn(g);
  }

  /**
   * Show (or hide, with `velocity` null) the predicted arc from `origin`.
   * Same integrator as the live throwables minus obstacles, so where the ring
   * sits is where an unobstructed throw first lands.
   */
  setPreview(origin: THREE.Vector3 | null, velocity: THREE.Vector3 | null, gravity = 30): void {
    if (this.prewarming) return;
    if (!origin || !velocity) {
      this.arcGeo.setDrawRange(0, 0);
      this.ring.scale.setScalar(0.0001);
      return;
    }
    _p.copy(origin);
    _v.copy(velocity);
    let n = 0;
    let landed = false;
    for (; n < PREVIEW_POINTS; n++) {
      this.arcPos[n * 3] = _p.x;
      this.arcPos[n * 3 + 1] = _p.y;
      this.arcPos[n * 3 + 2] = _p.z;
      _v.y -= gravity * PREVIEW_STEP;
      _p.addScaledVector(_v, PREVIEW_STEP);
      const gy = this.ground(_p.x, _p.z) + 0.04;
      if (_p.y <= gy) { _p.y = gy; landed = true; n++; break; }
    }
    if (landed && n < PREVIEW_POINTS) {
      this.arcPos[n * 3] = _p.x; this.arcPos[n * 3 + 1] = _p.y; this.arcPos[n * 3 + 2] = _p.z;
      n++;
    }
    (this.arcGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.arcGeo.setDrawRange(0, n);
    if (landed) {
      this.ring.position.copy(_p);
      this.ring.scale.setScalar(1 + Math.sin(this.pulse * 6) * 0.06);
      this.ringMat.opacity = 0.5 + Math.sin(this.pulse * 6) * 0.15;
    } else {
      this.ring.scale.setScalar(0.0001);
    }
  }

  /** Warmup: put one of every throwable + the preview on screen at `at`. */
  prewarm(at: THREE.Vector3): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    GRENADE_KINDS.forEach((k, i) => {
      const m = new THREE.Mesh(getThrownGrenadeGeometry(k), getItemMaterial());
      m.position.copy(at).add(new THREE.Vector3((i - GRENADE_KINDS.length / 2) * 0.35, 0.3, 0));
      this.scene.add(m);
      out.push(m);
    });
    this.prewarming = true;
    for (let i = 0; i < 4; i++) {
      this.arcPos[i * 3] = at.x + i * 0.2; this.arcPos[i * 3 + 1] = at.y; this.arcPos[i * 3 + 2] = at.z;
    }
    (this.arcGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.arcGeo.setDrawRange(0, 4);
    this.ring.position.copy(at);
    this.ring.scale.setScalar(1);
    return out;
  }

  endPrewarm(): void {
    this.prewarming = false;
    this.setPreview(null, null);
  }

  /** Remove every live throwable (run reset). */
  clear(): void {
    for (const g of this.live) { this.scene.remove(g.mesh); this.dropBody(g); }
    this.live.length = 0;
    this.hulls.clear();
    this.setPreview(null, null);
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.arcLine);
    this.scene.remove(this.ring);
    this.arcGeo.dispose();
    this.arcMat.dispose();
    this.ring.geometry.dispose();
    this.ringMat.dispose();
    this.onDetonate = null;
    this.onImpact = null;
    this.onStick = null;
    this.onBounce = null;
    this.attachValid = null;
  }
}

const _m4 = new THREE.Matrix4();
