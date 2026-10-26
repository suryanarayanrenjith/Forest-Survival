/**
 * ROBOT GAIT — locomotion + idle for the jointed robot rig.
 * ========================================================
 *
 * The robots used to walk on stiff single-block legs swinging about their own
 * middles, with arms that barely moved: a pendulum shuffle. The rig now has
 * real hips and knees (SmartEnemyManager), and this drives them like a gait:
 *
 *   • HIP swing   — sin(phase) · stride, opposite legs half a cycle apart.
 *   • KNEE flex   — the knee folds while its leg SWINGS FORWARD (foot lifted
 *                   behind, then kicked through to plant), and keeps a little
 *                   bend in stance so the leg is never a locked pole.
 *   • ARMS        — counter-swing against the legs with a lag, splaying out a
 *                   touch and pumping harder at a run; claws flex in rhythm.
 *   • TORSO       — twists with the stride, leans into speed, and the pelvis
 *                   bob is two dips per cycle (one per footfall).
 *   • IDLE        — the weight shifts slowly from leg to leg (one knee soft),
 *                   arms hang and sway, the chassis breathes.
 *
 * Phase is advanced by DISTANCE travelled (App), so the feet stay planted —
 * a blocked robot stops striding. Every write is a lerp toward the target so
 * walk → idle → attack blend without pops. Allocation-free.
 */
import * as THREE from 'three';

export interface GaitRig {
  leftLeg?: THREE.Object3D;
  rightLeg?: THREE.Object3D;
  leftKnee?: THREE.Object3D;
  rightKnee?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  torso?: THREE.Object3D;
  leftClaw?: { fingers: THREE.Object3D; thumb: THREE.Object3D };
  rightClaw?: { fingers: THREE.Object3D; thumb: THREE.Object3D };
}

const lerp = THREE.MathUtils.lerp;

/** Knee fold for a leg at phase φ (hip angle = sin φ; it swings forward while cos φ < 0). */
function kneeAt(phi: number, flex: number): number {
  const swing = Math.max(0, -Math.cos(phi));
  // Peak fold mid-swing, plus a soft stance bend that dips at heel strike.
  return 0.1 + flex * Math.pow(swing, 1.35) + 0.06 * Math.max(0, Math.sin(phi * 2)) * (1 - swing);
}

/**
 * Drive one walking frame. `run` 0..1 (walk → sprint) scales stride, knee
 * fold, arm pump and lean. `k` is the blend factor toward the pose (0..1).
 * Returns the pelvis bob (world units, before the robot's scale).
 */
export function driveRobotGait(rig: GaitRig, phase: number, run: number, k: number, dodging = false): number {
  const stride = 0.34 + 0.34 * run;
  const flex = 0.55 + 0.55 * run;
  const hipL = Math.sin(phase) * stride;
  const hipR = Math.sin(phase + Math.PI) * stride;
  if (rig.leftLeg) rig.leftLeg.rotation.x = lerp(rig.leftLeg.rotation.x, hipL, k);
  if (rig.rightLeg) rig.rightLeg.rotation.x = lerp(rig.rightLeg.rotation.x, hipR, k);
  if (rig.leftKnee) rig.leftKnee.rotation.x = lerp(rig.leftKnee.rotation.x, kneeAt(phase, flex), k);
  if (rig.rightKnee) rig.rightKnee.rotation.x = lerp(rig.rightKnee.rotation.x, kneeAt(phase + Math.PI, flex), k);

  // Arms counter-swing (left arm forward with the right leg), lagging a hair.
  const pump = 0.45 + 0.5 * run;
  const lag = 0.35;
  if (rig.leftArm) {
    rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, Math.sin(phase + Math.PI - lag) * stride * pump, k * 0.9);
    rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, 0.05 + 0.08 * run, k * 0.6);
  }
  if (rig.rightArm) {
    rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, Math.sin(phase - lag) * stride * pump, k * 0.9);
    rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, -0.05 - 0.08 * run, k * 0.6);
  }
  // Torso: twist with the stride, lean into the speed.
  if (rig.torso) {
    rig.torso.rotation.y = lerp(rig.torso.rotation.y, Math.sin(phase) * (0.05 + 0.06 * run), k);
    rig.torso.rotation.x = lerp(rig.torso.rotation.x, (dodging ? 0.14 : 0.04 + 0.08 * run), k * 0.5);
  }
  // Claws flex with the arm swing (open forward, close back).
  const curl = 0.18 + 0.12 * Math.sin(phase);
  if (rig.leftClaw) {
    rig.leftClaw.fingers.rotation.x = lerp(rig.leftClaw.fingers.rotation.x, curl, k);
    rig.leftClaw.thumb.rotation.x = lerp(rig.leftClaw.thumb.rotation.x, -curl * 0.8, k);
  }
  if (rig.rightClaw) {
    rig.rightClaw.fingers.rotation.x = lerp(rig.rightClaw.fingers.rotation.x, 0.18 - 0.12 * Math.sin(phase), k);
    rig.rightClaw.thumb.rotation.x = lerp(rig.rightClaw.thumb.rotation.x, -(0.18 - 0.12 * Math.sin(phase)) * 0.8, k);
  }
  // Two dips per cycle — the chassis sinks onto each planted foot.
  return Math.abs(Math.sin(phase)) * (0.05 + 0.04 * run);
}

/**
 * Drive one idle frame at time `t` (seconds). Weight shifts leg to leg, the
 * arms hang and drift, the chassis breathes. Returns the breathing offset.
 */
export function driveRobotIdle(rig: GaitRig, t: number, k: number): number {
  const shift = Math.sin(t * 0.42);
  // The loaded leg straightens, the other softens at the knee and hip.
  const kneeL = 0.07 + 0.09 * Math.max(0, shift);
  const kneeR = 0.07 + 0.09 * Math.max(0, -shift);
  if (rig.leftLeg) rig.leftLeg.rotation.x = lerp(rig.leftLeg.rotation.x, -0.04 * Math.max(0, shift), k);
  if (rig.rightLeg) rig.rightLeg.rotation.x = lerp(rig.rightLeg.rotation.x, -0.04 * Math.max(0, -shift), k);
  if (rig.leftKnee) rig.leftKnee.rotation.x = lerp(rig.leftKnee.rotation.x, kneeL, k);
  if (rig.rightKnee) rig.rightKnee.rotation.x = lerp(rig.rightKnee.rotation.x, kneeR, k);
  if (rig.leftArm) {
    rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, Math.sin(t * 0.5) * 0.05, k);
    rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, 0.04 + Math.sin(t * 0.37) * 0.02, k);
  }
  if (rig.rightArm) {
    rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, Math.sin(t * 0.5 + 0.5) * 0.05, k);
    rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, -0.04 - Math.sin(t * 0.41) * 0.02, k);
  }
  if (rig.torso) {
    rig.torso.rotation.y = lerp(rig.torso.rotation.y, Math.sin(t * 0.21) * 0.04, k);
    rig.torso.rotation.x = lerp(rig.torso.rotation.x, 0.02 + Math.sin(t * 1.1) * 0.01, k);
  }
  const relax = 0.24 + Math.sin(t * 0.9) * 0.05;
  if (rig.leftClaw) {
    rig.leftClaw.fingers.rotation.x = lerp(rig.leftClaw.fingers.rotation.x, relax, k);
    rig.leftClaw.thumb.rotation.x = lerp(rig.leftClaw.thumb.rotation.x, -relax * 0.8, k);
  }
  if (rig.rightClaw) {
    rig.rightClaw.fingers.rotation.x = lerp(rig.rightClaw.fingers.rotation.x, relax, k);
    rig.rightClaw.thumb.rotation.x = lerp(rig.rightClaw.thumb.rotation.x, -relax * 0.8, k);
  }
  return Math.sin(t * 1.1) * 0.02 - 0.03 * Math.abs(shift);
}

/** A braced fighting stance under an attack pose: knees soft, weight forward. */
export function braceKnees(rig: GaitRig, k: number): void {
  if (rig.leftKnee) rig.leftKnee.rotation.x = lerp(rig.leftKnee.rotation.x, 0.32, k);
  if (rig.rightKnee) rig.rightKnee.rotation.x = lerp(rig.rightKnee.rotation.x, 0.22, k);
}
