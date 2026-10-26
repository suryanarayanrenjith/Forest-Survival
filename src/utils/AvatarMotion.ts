/**
 * AVATAR MOTION — legs that bend, and a body that falls like a body.
 * =================================================================
 *
 * Shared by every humanoid avatar: remote players (RemotePlayerManager) and
 * the local player's shadow caster (LocalPlayerShadow).
 *
 * LEGS — the rig now has knees (CharacterModels.KNEE_DROP). The stride swings
 * the thigh from the hip and folds the knee through the swing phase, so the
 * foot lifts and plants instead of the whole leg pendulum-sliding. A crouch
 * folds hip + knee and drops the pelvis by exactly the height the bent leg
 * loses (closed-form from the segment lengths), rather than squashing the
 * whole model vertically.
 *
 * DEATH — a collapse driven by a tiny rigid-body model rather than a canned
 * lerp: the knees BUCKLE first (the body drops), then the body topples under
 * gravity as an inverted pendulum about the feet (angular acceleration
 * ∝ sin θ, so it starts slow and slams down), hits the ground, bounces once
 * and settles. The arms trail the torso on damped springs and splay out on
 * impact, the head lolls, the legs relax, and the weapon leaves the hands and
 * falls on its own, clattering to rest beside the body.
 */
import * as THREE from 'three';
import { KNEE_DROP, RIG } from './CharacterModels';

export interface LegJoints {
  leftHip: THREE.Object3D;
  rightHip: THREE.Object3D;
  leftKnee?: THREE.Object3D;
  rightKnee?: THREE.Object3D;
}

export interface CollapseJoints extends LegJoints {
  leftShoulder: THREE.Object3D;
  rightShoulder: THREE.Object3D;
  leftElbow?: THREE.Object3D;
  rightElbow?: THREE.Object3D;
  headJoint: THREE.Object3D;
}

/** Thigh / shin+boot lengths (model units). */
const L_THIGH = KNEE_DROP;
const L_SHIN = RIG.thighH - KNEE_DROP + RIG.bootH;
const LEG_LEN = L_THIGH + L_SHIN;

/** Knee fold for a leg at phase φ (hip angle = sin φ; it swings forward while cos φ < 0). */
function kneeAt(phi: number, flex: number): number {
  const swing = Math.max(0, -Math.cos(phi));
  return 0.06 + flex * Math.pow(swing, 1.3);
}

/**
 * Stride + crouch for one frame. Returns the pelvis drop (model units) the
 * caller subtracts from the body's height so the feet stay on the ground.
 * Rig convention: +rotation.x on a hip/knee swings the foot BACKWARD.
 */
export function driveAvatarLegs(j: LegJoints, walkPhase: number, moveGate: number, crouch: number): number {
  const swing = (0.06 + moveGate * 0.72) * (1 - 0.45 * crouch);
  const flex = (0.25 + moveGate * 0.95) * (1 - 0.4 * crouch);
  // Crouch: thighs forward, knees folded back under the body.
  const hipFold = -0.95 * crouch;
  const kneeFold = 1.85 * crouch;
  const hl = Math.sin(walkPhase) * swing + hipFold;
  const hr = Math.sin(walkPhase + Math.PI) * swing + hipFold;
  const kl = kneeAt(walkPhase, flex) + kneeFold;
  const kr = kneeAt(walkPhase + Math.PI, flex) + kneeFold;
  j.leftHip.rotation.x = hl;
  j.rightHip.rotation.x = hr;
  if (j.leftKnee) j.leftKnee.rotation.x = kl;
  if (j.rightKnee) j.rightKnee.rotation.x = kr;
  // Height the folded legs lose (the planted, i.e. lower, foot governs).
  const h = (hip: number, knee: number) => L_THIGH * Math.cos(hip) + L_SHIN * Math.cos(hip + knee);
  const reach = Math.max(h(hl, kl), h(hr, kr));
  return Math.max(0, LEG_LEN - reach);
}

// ── DEATH COLLAPSE ───────────────────────────────────────────────────────────

export interface CollapseState {
  active: boolean;
  t: number;
  /** +1 falls forward (face-down), −1 falls backward (onto the back). */
  dir: number;
  /** Small sideways roll for a less symmetric fall. */
  roll: number;
  theta: number;
  omega: number;
  bounced: boolean;
  settled: boolean;
  // Limp-limb springs (current value + velocity).
  armX: number; armV: number;
  headX: number; headV: number;
  // The dropped weapon (re-parented to the avatar root while it falls free).
  weapon: THREE.Object3D | null;
  weaponHome: THREE.Object3D | null;
  wVel: THREE.Vector3;
  wSpin: THREE.Vector3;
  wRest: boolean;
  /** One-shot: true on the frame the body hits the ground (for a thud). */
  impact: boolean;
}

export function newCollapse(): CollapseState {
  return {
    active: false, t: 0, dir: 1, roll: 0, theta: 0, omega: 0, bounced: false, settled: false,
    armX: 0, armV: 0, headX: 0, headV: 0,
    weapon: null, weaponHome: null, wVel: new THREE.Vector3(), wSpin: new THREE.Vector3(), wRest: false,
    impact: false,
  };
}

/**
 * Begin a collapse. `dir` +1 = forward onto the face, −1 = backward. The
 * weapon (if given) is detached into `root` keeping its world transform and
 * thrown loose with a little forward momentum.
 */
export function startCollapse(c: CollapseState, dir: number, weapon: THREE.Object3D | null, root: THREE.Object3D | null): void {
  c.active = true;
  c.t = 0;
  c.dir = dir >= 0 ? 1 : -1;
  c.roll = (Math.random() - 0.5) * 0.5;
  c.theta = 0;
  c.omega = 0.9 + Math.random() * 0.5;
  c.bounced = false;
  c.settled = false;
  c.armX = 0; c.armV = 0; c.headX = 0; c.headV = 0;
  c.impact = false;
  c.weapon = null;
  c.weaponHome = null;
  c.wRest = false;
  if (weapon && root && weapon.parent) {
    c.weaponHome = weapon.parent;
    root.attach(weapon);
    c.weapon = weapon;
    c.wVel.set((Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 0.8, c.dir * (1.4 + Math.random()));
    c.wSpin.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 7);
  }
}

/** Undo a collapse (respawn): weapon back into the hands, pose cleared. */
export function endCollapse(c: CollapseState, body: THREE.Object3D): void {
  if (c.weapon && c.weaponHome) c.weaponHome.attach(c.weapon);
  c.weapon = null;
  c.weaponHome = null;
  c.active = false;
  body.rotation.x = 0;
  body.rotation.z = 0;
  body.position.y = 0;
}

/**
 * Advance a collapse by `dt` (s). `body` pivots at the feet (its origin);
 * `scale` is the model → world scale (body.position is in world units).
 */
export function driveCollapse(c: CollapseState, j: CollapseJoints, body: THREE.Object3D, dt: number, scale: number): void {
  if (!c.active) return;
  c.t += dt;
  c.impact = false;
  const LIE = Math.PI / 2 - 0.1;

  // ── 1. Knees buckle (first ~0.3 s): the legs give way, the body drops.
  const buckle = Math.min(1, c.t / 0.3);
  const bk = buckle * buckle * (3 - 2 * buckle);
  // ── 2. Topple: inverted pendulum about the feet once the knees have gone.
  if (c.t > 0.18 && !c.settled) {
    const alpha = 7.5 * Math.sin(c.theta + 0.25);
    c.omega += alpha * dt;
    c.theta += c.omega * dt;
    if (c.theta >= LIE) {
      c.theta = LIE;
      if (!c.bounced && c.omega > 1.2) {
        c.omega = -c.omega * 0.22;   // one bounce off the ground
        c.bounced = true;
        c.impact = true;
      } else {
        c.omega = 0;
        c.settled = true;
        if (!c.bounced) c.impact = true;
      }
    }
  }
  const lay = c.theta / LIE; // 0 upright → 1 lying
  body.rotation.x = c.dir * c.theta;
  body.rotation.z = c.roll * lay;
  // Pelvis: buckled knees drop it, then lying it rests at half a body depth.
  const dropK = 0.55 * bk * (1 - lay);
  body.position.y = (-dropK + 0.42 * Math.sin(c.theta)) * scale;

  // Legs: fold on the buckle, relax out as the body lands.
  const knee = 1.25 * bk * (1 - 0.65 * lay);
  const hip = -0.55 * bk * (1 - 0.6 * lay) * c.dir;
  j.leftHip.rotation.x = hip + 0.04;
  j.rightHip.rotation.x = hip - 0.06;
  if (j.leftKnee) j.leftKnee.rotation.x = knee;
  if (j.rightKnee) j.rightKnee.rotation.x = knee * 0.8 + 0.1 * lay;

  // Arms: a damped spring dragging behind the fall, flung out on impact.
  const armTarget = -c.dir * (0.45 + 0.75 * lay);
  c.armV += ((armTarget - c.armX) * 26 - c.armV * 5.5) * dt;
  c.armX += c.armV * dt;
  const splay = 0.25 + 0.75 * lay;
  j.leftShoulder.rotation.set(c.armX + 0.15, 0, splay);
  j.rightShoulder.rotation.set(c.armX - 0.1, 0, -splay * 0.85);
  if (j.leftElbow) j.leftElbow.rotation.set(-0.35 - 0.2 * bk, 0, 0);
  if (j.rightElbow) j.rightElbow.rotation.set(-0.5 - 0.15 * bk, 0, 0);

  // Head lolls behind the motion and rolls to the side once down.
  const headTarget = -c.dir * 0.5 * lay + 0.2 * bk;
  c.headV += ((headTarget - c.headX) * 30 - c.headV * 6) * dt;
  c.headX += c.headV * dt;
  j.headJoint.rotation.set(c.headX, 0, c.roll * 1.6 * lay);

  // Weapon falls free and clatters to rest (avatar-root space, ground at y≈0).
  const w = c.weapon;
  if (w && !c.wRest) {
    c.wVel.y -= 24 * dt;
    w.position.addScaledVector(c.wVel, dt);
    w.rotation.x += c.wSpin.x * dt;
    w.rotation.y += c.wSpin.y * dt;
    w.rotation.z += c.wSpin.z * dt;
    const floor = 0.12;
    if (w.position.y <= floor) {
      w.position.y = floor;
      if (c.wVel.y < -2) {
        c.wVel.y *= -0.3;
        c.wVel.x *= 0.5; c.wVel.z *= 0.5;
        c.wSpin.multiplyScalar(0.4);
      } else {
        c.wRest = true;
        // Settle flat on its side.
        w.rotation.x = 0;
        w.rotation.z = Math.PI / 2;
      }
    }
  }
}
