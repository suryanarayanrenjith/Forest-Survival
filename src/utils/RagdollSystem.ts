import * as THREE from 'three';
// Types only — erased at build time. The engine is loaded lazily by the
// shared PhysicsWorld, so the physics WASM never touches the menu.
import type * as RAPIER from '@dimforge/rapier3d-compat';
import { GROUP_DEBRIS, GROUP_RAGDOLL, GROUP_THROWN, GROUP_WORLD, groups, type PhysicsWorld } from './PhysicsWorld';

/**
 * RagdollSystem — engine-grade robot-death ragdolls on the shared Rapier world.
 *
 * Every corpse is a real articulated body: a compound chassis with hinged
 * shoulders, hips and knees that topple, fold and settle into whatever pose
 * the dead machine actually fell into. They share PhysicsWorld with the
 * throwables and debris, so corpses rest on the VISUAL ground (not a hidden
 * plane under raised terrain), slump against tree trunks and rocks, get
 * shoved by blasts alongside every loose gib, and sleep (≈ free) once still.
 *
 * Kept cheap: capped (the oldest corpse is recycled at the cap — it was
 * already fading), no corpse-to-corpse contacts (no tangles), and graceful —
 * until the WASM is ready spawn() returns -1 and the caller falls back to the
 * lightweight scripted death. The pooled enemy meshes are never re-parented:
 * we only READ body transforms and copy them onto the group and its limbs.
 */
/** One jointed limb of an articulated robot ragdoll. */
export interface RagdollLimbSpec {
  /** Which body it hangs from: -1 = the torso, else the index of an earlier limb. */
  parent: number;
  /** Joint position in the PARENT body's frame (model units, pre-scale). */
  anchor: { x: number; y: number; z: number };
  /** The limb pivot's world transform at the moment of death. */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Segment length hanging down its local −Y (model units) and radius. */
  length: number;
  radius: number;
  /** Hinge range about the local X axis (radians, +X swings the end backward). */
  min: number;
  max: number;
}

/** Everything an articulated corpse needs at spawn (world units, already scaled where noted). */
export interface RobotRagdollSpec {
  torsoPos: THREE.Vector3;
  torsoQuat: THREE.Quaternion;
  /** Uniform model → world scale of the robot. */
  scale: number;
  limbs: RagdollLimbSpec[];
  vel: { x: number; y: number; z: number };
  spin: { x: number; y: number; z: number };
}

interface Articulated {
  torso: RAPIER.RigidBody;
  limbs: RAPIER.RigidBody[];
  joints: RAPIER.ImpulseJoint[];
}

/** Ragdoll parts hit the world, throwables and debris — never another corpse (no tangles). */
const RAGDOLL_GROUPS = groups(GROUP_RAGDOLL, GROUP_WORLD | GROUP_THROWN | GROUP_DEBRIS);

export class RagdollSystem {
  private readonly physics: PhysicsWorld;

  /** id → live rigid body. */
  private readonly bodies = new Map<number, RAPIER.RigidBody>();
  /** ids in spawn order, so the OLDEST corpse is the one recycled at the cap. */
  private readonly order: number[] = [];
  private nextId = 1;

  private readonly maxActive: number;

  /** Articulated (jointed) robot corpses, by id — shares the id space + cap. */
  private readonly articulated = new Map<number, Articulated>();

  constructor(physics: PhysicsWorld, maxActive = 20) {
    this.physics = physics;
    this.maxActive = maxActive;
  }

  /** Load the shared physics world (idempotent; never throws). */
  async init(): Promise<void> {
    await this.physics.init();
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
    const RAPIER = this.physics.R;
    if (!RAPIER || !this.physics.ready) return -1;

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
    const rb = this.physics.createDynamic(bodyDesc);
    if (!rb) return -1;

    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setRestitution(0.32)
      .setFriction(0.8)
      .setDensity(1.1);
    this.physics.world!.createCollider(colliderDesc, rb);

    const id = this.nextId++;
    this.bodies.set(id, rb);
    this.order.push(id);
    return id;
  }

  /**
   * Launch an ARTICULATED robot corpse: a compound torso (chassis + head + hip
   * block) with jointed limbs hanging off it on HINGES — shoulders, hips and
   * knees swing about their own X axes within real ranges, like the servo
   * joints they are. The chassis topples, the knees fold, the arms flop and
   * everything settles into a pose the dead machine actually fell into.
   * Returns an id, or -1 when the engine isn't ready (caller falls back).
   */
  spawnArticulated(spec: RobotRagdollSpec): number {
    const RAPIER = this.physics.R;
    const world = this.physics.world;
    if (!RAPIER || !world || !this.physics.ready) return -1;
    if (this.order.length >= this.maxActive) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.destroy(oldest);
    }
    const k = spec.scale;
    const q = spec.torsoQuat;
    const torsoDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spec.torsoPos.x, spec.torsoPos.y, spec.torsoPos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinvel(spec.vel.x, spec.vel.y, spec.vel.z)
      .setAngvel(spec.spin)
      .setLinearDamping(0.1)
      .setAngularDamping(0.6)
      .setCcdEnabled(true);
    const torso = this.physics.createDynamic(torsoDesc);
    if (!torso) return -1;
    // Chassis, head, hip block (robot-local offsets × scale).
    const box = (hx: number, hy: number, hz: number, ox: number, oy: number, oz: number, density: number) =>
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx * k, hy * k, hz * k)
        .setTranslation(ox * k, oy * k, oz * k)
        .setRestitution(0.15).setFriction(0.9).setDensity(density)
        .setCollisionGroups(RAGDOLL_GROUPS), torso);
    box(0.5, 0.75, 0.3, 0, 0.75, 0, 1.3);
    box(0.4, 0.4, 0.4, 0, 1.9, 0, 0.9);
    box(0.46, 0.2, 0.28, 0, -0.05, 0, 1.2);

    const bodies: RAPIER.RigidBody[] = [];
    const joints: RAPIER.ImpulseJoint[] = [];
    for (const limb of spec.limbs) {
      const lq = limb.quat;
      const rb = this.physics.createDynamic(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(limb.pos.x, limb.pos.y, limb.pos.z)
        .setRotation({ x: lq.x, y: lq.y, z: lq.z, w: lq.w })
        .setLinvel(spec.vel.x, spec.vel.y, spec.vel.z)
        .setLinearDamping(0.1)
        // Servo friction: the joints resist a little, so limbs swing heavy
        // instead of whipping like rope.
        .setAngularDamping(1.6))!;
      const half = Math.max(0.01, (limb.length / 2 - limb.radius)) * k;
      world.createCollider(RAPIER.ColliderDesc.capsule(half, limb.radius * k)
        .setTranslation(0, -limb.length / 2 * k, 0)
        .setRestitution(0.1).setFriction(0.9).setDensity(1.0)
        .setCollisionGroups(RAGDOLL_GROUPS), rb);
      const parent = limb.parent < 0 ? torso : bodies[limb.parent];
      const params = RAPIER.JointData.revolute(
        { x: limb.anchor.x * k, y: limb.anchor.y * k, z: limb.anchor.z * k },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      );
      const joint = world.createImpulseJoint(params, parent, rb, true) as RAPIER.RevoluteImpulseJoint;
      joint.setContactsEnabled(false);
      joint.setLimits(limb.min, limb.max);
      bodies.push(rb);
      joints.push(joint);
    }

    const id = this.nextId++;
    this.articulated.set(id, { torso, limbs: bodies, joints });
    this.order.push(id);
    return id;
  }

  /**
   * Read an articulated corpse: the torso's world transform, and each limb's
   * world quaternion (in spec order) into `outLimbQuats`. False if recycled.
   */
  readArticulated(id: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion, outLimbQuats: THREE.Quaternion[]): boolean {
    const a = this.articulated.get(id);
    if (!a) return false;
    const t = a.torso.translation();
    outPos.set(t.x, t.y, t.z);
    const r = a.torso.rotation();
    outQuat.set(r.x, r.y, r.z, r.w);
    for (let i = 0; i < a.limbs.length && i < outLimbQuats.length; i++) {
      const lr = a.limbs[i].rotation();
      outLimbQuats[i].set(lr.x, lr.y, lr.z, lr.w);
    }
    return true;
  }

  /** Torso speed of an articulated corpse (for the ground-impact thud). */
  articulatedSpeed(id: number): number {
    const a = this.articulated.get(id);
    if (!a) return 0;
    const v = a.torso.linvel();
    return Math.hypot(v.x, v.y, v.z);
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
   * Shove every loose body near a blast — corpses AND every gib / throwable in
   * the shared world (see PhysicsWorld.applyRadialImpulse). Returns the count.
   */
  applyRadialImpulse(cx: number, cy: number, cz: number, radius: number, strength = 1): number {
    return this.physics.applyRadialImpulse(cx, cy, cz, radius, strength);
  }

  /** Retire a corpse body once its visual has finished fading. */
  release(id: number): void {
    const i = this.order.indexOf(id);
    if (i !== -1) this.order.splice(i, 1);
    this.destroy(id);
  }

  private destroy(id: number): void {
    const rb = this.bodies.get(id);
    if (rb) this.physics.removeDynamic(rb); // also drops its collider
    this.bodies.delete(id);
    const a = this.articulated.get(id);
    if (a) {
      // Removing a body removes its joints with it.
      for (const l of a.limbs) this.physics.removeDynamic(l);
      this.physics.removeDynamic(a.torso);
    }
    this.articulated.delete(id);
  }

  /** Drop every live corpse (game reset / scene teardown). */
  releaseAll(): void {
    for (const rb of this.bodies.values()) this.physics.removeDynamic(rb);
    for (const a of this.articulated.values()) {
      for (const l of a.limbs) this.physics.removeDynamic(l);
      this.physics.removeDynamic(a.torso);
    }
    this.bodies.clear();
    this.articulated.clear();
    this.order.length = 0;
  }

  /** Drop every corpse body (the shared world itself is freed by its owner). */
  dispose(): void {
    this.releaseAll();
  }
}
