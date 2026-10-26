import * as THREE from 'three';
import type * as RAPIER from '@dimforge/rapier3d-compat';
import { GROUP_DEBRIS, GROUP_RAGDOLL, GROUP_THROWN, GROUP_WORLD, groups, type PhysicsWorld } from './PhysicsWorld';

/**
 * RigidDebris — loose robot parts as real rigid bodies.
 * =====================================================
 *
 * A decapitated head or a limb torn off by a blast used to arc on a
 * hand-rolled parabola, bounce off an invisible y = 0 plane and spin on
 * three independent Euler rates, so it settled in whatever pose the spin
 * happened to stop at. Here each piece is a rounded box fitted to the part's
 * own geometry in the shared PhysicsWorld: it tumbles with a true inertia
 * tensor, rolls over its edges, glances off tree trunks and corpses, rests
 * flat on the visible ground, and goes to sleep.
 *
 * The caller places the part (an Object3D already in the scene, in world
 * space) and calls launch(); this module owns it from there — syncs the
 * transform every frame, shrinks it away at the end of its life and removes
 * it. Capped (the oldest piece is retired first). launch() returns false
 * while the physics WASM isn't ready so the caller can use its own fallback.
 */
export interface DebrisLaunch {
  vel: { x: number; y: number; z: number };
  spin: { x: number; y: number; z: number };
  /** Seconds before it shrinks away. */
  life: number;
  density?: number;
  restitution?: number;
  friction?: number;
  /** Fit the collider to this subtree instead of the whole object (e.g. skip dangling wires). */
  fitTo?: THREE.Object3D;
  /** A hard ground/obstacle contact (first few only) — for a thud. */
  onImpact?: (speed: number, at: THREE.Vector3) => void;
  /** Called once when the piece leaves the scene. */
  onRemove?: (obj: THREE.Object3D) => void;
}

interface Piece {
  obj: THREE.Object3D;
  body: RAPIER.RigidBody;
  life: number;
  baseScale: THREE.Vector3;
  lastVy: number;
  impacts: number;
  onImpact?: (speed: number, at: THREE.Vector3) => void;
  onRemove?: (obj: THREE.Object3D) => void;
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _savedPos = new THREE.Vector3();
const _savedQuat = new THREE.Quaternion();
const _at = new THREE.Vector3();
const DEBRIS_GROUPS = groups(GROUP_DEBRIS, GROUP_WORLD | GROUP_RAGDOLL | GROUP_THROWN | GROUP_DEBRIS);
const SHRINK_S = 0.45;

export class RigidDebris {
  private readonly physics: PhysicsWorld;
  private readonly scene: THREE.Scene;
  private readonly max: number;
  private readonly pieces: Piece[] = [];

  constructor(physics: PhysicsWorld, scene: THREE.Scene, max = 24) {
    this.physics = physics;
    this.scene = scene;
    this.max = max;
  }

  get count(): number { return this.pieces.length; }

  /** Launch a placed, scene-parented part. False when physics isn't ready. */
  launch(obj: THREE.Object3D, o: DebrisLaunch): boolean {
    const R = this.physics.R;
    const world = this.physics.world;
    if (!R || !world || !this.physics.ready) return false;
    if (this.pieces.length >= this.max) this.removeAt(0);

    // Fit a box in the part's OWN frame (scale included): measure it with an
    // identity rotation at the origin, then put it back.
    _savedPos.copy(obj.position);
    _savedQuat.copy(obj.quaternion);
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.updateMatrixWorld(true);
    _box.setFromObject(o.fitTo ?? obj);
    obj.position.copy(_savedPos);
    obj.quaternion.copy(_savedQuat);
    obj.updateMatrixWorld(true);
    if (_box.isEmpty()) return false;
    _box.getSize(_size).multiplyScalar(0.5);
    _box.getCenter(_centre);
    const hx = Math.max(0.04, _size.x), hy = Math.max(0.04, _size.y), hz = Math.max(0.04, _size.z);
    // Rounded edges so it rolls over its corners instead of catching on them.
    const border = Math.min(hx, hy, hz) * 0.3;

    const body = this.physics.createDynamic(R.RigidBodyDesc.dynamic()
      .setTranslation(obj.position.x, obj.position.y, obj.position.z)
      .setRotation({ x: obj.quaternion.x, y: obj.quaternion.y, z: obj.quaternion.z, w: obj.quaternion.w })
      .setLinvel(o.vel.x, o.vel.y, o.vel.z)
      .setAngvel(o.spin)
      .setLinearDamping(0.08)
      .setAngularDamping(0.55)
      .setCcdEnabled(true));
    if (!body) return false;
    world.createCollider(R.ColliderDesc.roundCuboid(hx - border, hy - border, hz - border, border)
      .setTranslation(_centre.x, _centre.y, _centre.z)
      .setDensity(o.density ?? 1.4)
      .setRestitution(o.restitution ?? 0.32)
      .setFriction(o.friction ?? 0.8)
      .setCollisionGroups(DEBRIS_GROUPS), body);

    this.pieces.push({
      obj, body, life: o.life, baseScale: obj.scale.clone(), lastVy: o.vel.y, impacts: 0,
      onImpact: o.onImpact, onRemove: o.onRemove,
    });
    return true;
  }

  /** Sync every piece to its body; shrink + retire expired ones. Call after the physics step. */
  update(dt: number): void {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life -= dt;
      const t = p.body.translation();
      const r = p.body.rotation();
      p.obj.position.set(t.x, t.y, t.z);
      p.obj.quaternion.set(r.x, r.y, r.z, r.w);
      // A falling piece whose downward speed just reversed hit something.
      const vy = p.body.linvel().y;
      if (p.onImpact && p.impacts < 3 && p.lastVy < -3 && vy > p.lastVy + 2.5) {
        p.impacts++;
        p.onImpact(-p.lastVy, _at.set(t.x, t.y, t.z));
      }
      p.lastVy = vy;
      if (p.life < SHRINK_S) p.obj.scale.copy(p.baseScale).multiplyScalar(Math.max(0.02, p.life / SHRINK_S));
      if (p.life <= 0) this.removeAt(i);
    }
  }

  private removeAt(i: number): void {
    const p = this.pieces[i];
    this.pieces.splice(i, 1);
    this.physics.removeDynamic(p.body);
    this.scene.remove(p.obj);
    p.onRemove?.(p.obj);
  }

  /** Retire everything (game reset / teardown — before the world is freed). */
  clear(): void {
    for (let i = this.pieces.length - 1; i >= 0; i--) this.removeAt(i);
  }
}
