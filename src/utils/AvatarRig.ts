import * as THREE from 'three';
import { RIG, shoulderRest, type WeaponType } from './CharacterModels';

/**
 * AVATAR RIG — how a third-person humanoid actually HOLDS its weapon.
 *
 * Used by every body the player can see or shadow: remote players in
 * multiplayer and the local player's shadow caster. The weapon is no longer a
 * child of the right hand (which made the gun point wherever the arm swung,
 * and dipped it when the player aimed UP). Instead:
 *
 *   1. The weapon is placed in BODY space from a per-weapon hold — stock in
 *      the shoulder pocket for long guns, a shouldered tube for the launcher,
 *      a hip carry for the minigun, an extended two-hand grip for the pistol —
 *      and rotated about that pivot by the aim pitch.
 *   2. The body blades toward its strong side the way a shooter stands (the
 *      caller turns the whole model by `hold.turn`); the weapon and head
 *      counter-rotate, so the muzzle and gaze stay on the true aim.
 *   3. Each arm is solved with two-bone IK (shoulder → elbow → hand) onto its
 *      grip: the strong hand on the pistol grip, the support hand on the
 *      foregrip / pump / handle. Elbows hang down and out via pole vectors,
 *      and a shoulder may protract a little toward a far grip (the scapula).
 *
 * All maths are in the model's native (unscaled, pre-yaw) frame: +Z forward,
 * +Y up, anatomical right = −X. Allocation-free per frame.
 */

export interface ArmJoints {
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  headJoint: THREE.Group;
}

interface Hold {
  /** Body yaw toward the strong side while holding (rad, applied by caller). */
  turn: number;
  /** Pivot the weapon swings about with the aim (model space). */
  pivot: readonly [number, number, number];
  /** Bore distance from the pivot to the grip, and the grip's drop below it. */
  reach: number;
  drop: number;
  /** Support-hand grip in WEAPON space (origin = strong-hand grip, +Z bore). */
  support: readonly [number, number, number];
  /** Share of the aim pitch the weapon follows (a hip-carried minigun less). */
  pitchScale: number;
}

const HOLDS: Record<WeaponType, Hold> = {
  rifle:    { turn: 0.55, pivot: [-0.52, 2.98, 0.32], reach: 0.62, drop: 0.08, support: [0, -0.12, 0.55], pitchScale: 1 },
  smg:      { turn: 0.48, pivot: [-0.5, 2.96, 0.36], reach: 0.52, drop: 0.08, support: [0, -0.06, 0.42], pitchScale: 1 },
  shotgun:  { turn: 0.55, pivot: [-0.52, 2.98, 0.32], reach: 0.6, drop: 0.06, support: [0, -0.14, 0.5], pitchScale: 1 },
  sniper:   { turn: 0.6, pivot: [-0.52, 3.0, 0.3], reach: 0.62, drop: 0.06, support: [0, -0.1, 0.68], pitchScale: 1 },
  // Tube rides on the right shoulder pad; grip just ahead of it.
  launcher: { turn: 0.32, pivot: [-0.92, 3.44, -0.1], reach: 0.42, drop: 0.05, support: [0, -0.18, 0.55], pitchScale: 0.85 },
  // Hip carry — the bulk sits low and only partly follows the aim.
  minigun:  { turn: 0.45, pivot: [-0.55, 2.28, 0.28], reach: 0.42, drop: 0.0, support: [0.05, 0.3, 0.28], pitchScale: 0.55 },
  // Two-handed isosceles: arms out, support hand wrapping the strong hand.
  pistol:   { turn: 0.16, pivot: [-0.28, 3.02, 0.22], reach: 1.02, drop: 0.04, support: [0.14, -0.06, -0.02], pitchScale: 1 },
};

export function getHold(type: WeaponType): Hold {
  return HOLDS[type];
}

// Upper arm: shoulder → elbow. Forearm: elbow → hand centre.
const L1 = RIG.upperArmH;
const L2 = RIG.foreArmH + RIG.wristGap + RIG.handH / 2;
const MAX_PROTRACT = 0.32;

const _S = new THREE.Vector3();
const _T = new THREE.Vector3();
const _E = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qi = new THREE.Quaternion();
const _down = new THREE.Vector3(0, -1, 0);
const _restR = shoulderRest(1);
const _restL = shoulderRest(-1);
const _poleR = new THREE.Vector3(-0.75, -1, -0.35).normalize();
const _poleL = new THREE.Vector3(0.45, -1, -0.1).normalize();

/** Two-bone IK: put the hand centre on `target` (model space). */
function solveArm(
  shoulder: THREE.Group, elbow: THREE.Group, rest: THREE.Vector3,
  target: THREE.Vector3, pole: THREE.Vector3,
): void {
  _S.copy(rest);
  _d.subVectors(target, _S);
  let dist = _d.length();
  const maxReach = L1 + L2 - 0.02;
  if (dist > maxReach) {
    // Scapula protraction: the shoulder slides toward a far grip.
    const slide = Math.min(MAX_PROTRACT, dist - maxReach);
    _S.addScaledVector(_d, slide / dist);
    _d.subVectors(target, _S);
    dist = _d.length();
  }
  dist = THREE.MathUtils.clamp(dist, Math.abs(L1 - L2) + 0.02, maxReach);
  _d.normalize();
  // Elbow on the circle where the two segments meet, pushed toward the pole.
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0).addScaledVector(_d, _d.y);
  _p.normalize();
  _E.copy(_S).addScaledVector(_d, a).addScaledVector(_p, h);
  _T.copy(_S).addScaledVector(_d, dist);

  // Shoulder frame: −Y along the upper arm, X = the elbow's hinge axis —
  // normal to the arm's plane (reach direction × pole), which stays stable
  // even as the arm straightens.
  _y.subVectors(_S, _E).normalize();               // +Y points back up the arm
  _x.crossVectors(_d, _p).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  shoulder.position.copy(_S);
  shoulder.quaternion.setFromRotationMatrix(_m);

  // Elbow: forearm direction expressed in the shoulder frame — a pure
  // rotation about the hinge.
  _qi.copy(shoulder.quaternion).invert();
  _v.subVectors(_T, _E).normalize().applyQuaternion(_qi);
  elbow.quaternion.setFromUnitVectors(_down, _v);
}

const _grip = new THREE.Vector3();
const _support = new THREE.Vector3();
const _wx = new THREE.Vector3();
const _wy = new THREE.Vector3();
const _wz = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Pose the weapon + both arms + head for this frame.
 * `pitch` = aim pitch (rad, + = looking up). `sway` adds the walk's carry
 * motion (small, 0..1 scale), `phase` the stride phase, `crouch` 0..1.
 * The caller must yaw the model by −hold.turn relative to the aim.
 */
export function poseAvatarHold(
  joints: ArmJoints, weapon: THREE.Object3D | null, type: WeaponType,
  pitch: number, sway: number, phase: number, crouch: number,
): void {
  const hold = HOLDS[type];
  const p = THREE.MathUtils.clamp(pitch, -1.1, 1.1) * hold.pitchScale;
  // Bore direction in model space: counter-rotated by the stance turn.
  const cp = Math.cos(p);
  _wz.set(Math.sin(hold.turn) * cp, Math.sin(p), Math.cos(hold.turn) * cp);
  _wx.crossVectors(_up, _wz).normalize();          // weapon +X (support side)
  _wy.crossVectors(_wz, _wx);
  // Carry bob with the stride (muted so the muzzle stays on target).
  const bobY = Math.sin(phase * 2) * 0.03 * sway;
  const bobX = Math.sin(phase) * 0.025 * sway;
  _grip.set(hold.pivot[0] + bobX, hold.pivot[1] + bobY - crouch * 0.05, hold.pivot[2])
    .addScaledVector(_wz, hold.reach)
    .addScaledVector(_wy, -hold.drop);
  if (weapon) {
    weapon.position.copy(_grip);
    _m.makeBasis(_wx, _wy, _wz);
    weapon.quaternion.setFromRotationMatrix(_m);
  }
  // Strong hand: centred just under the grip. Support hand: on its grip.
  _T.copy(_grip).addScaledVector(_wy, -0.06);
  solveArm(joints.rightShoulder, joints.rightElbow, _restR, _T, _poleR);
  _support.copy(_grip)
    .addScaledVector(_wx, hold.support[0])
    .addScaledVector(_wy, hold.support[1] - 0.04)
    .addScaledVector(_wz, hold.support[2]);
  solveArm(joints.leftShoulder, joints.leftElbow, _restL, _support, _poleL);
  // Head looks down the sights: undo the stance turn, follow the pitch.
  joints.headJoint.rotation.set(-THREE.MathUtils.clamp(pitch, -0.8, 0.8) * 0.85, hold.turn * 0.85, 0, 'YXZ');
}
