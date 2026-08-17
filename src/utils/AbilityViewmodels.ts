// ─────────────────────────────────────────────────────────────────────────────
// FIRST-PERSON ABILITY VIEWMODELS
//
// Every character's signature ability used to be a screen flash and a particle
// puff: the power simply *happened*. This module gives each one a PHYSICAL
// MECHANISM the player watches their own gloved left hand operate — the same
// standard the weapon reloads are held to (see GunModel's reload choreography).
//
//   • detonator (Engineer) — a radio firing device: safety cap flipped up with
//     the thumb, arming key turned, whip antenna extended, and the plunger
//     pressed DOWN BY THE THUMB. The bomb goes off on the frame the plunger
//     bottoms out, not on the key press.
//   • flamer   (Pyro)      — a forearm-mounted pyroclast projector: fuel bottle,
//     pressure gauge, braided feed hose, and a spinning emitter head whose six
//     nozzles throw fire through a full 360°. Struck alight by a thumb-rolled
//     striker, opened with a valve lever.
//   • medkit   (Medic)     — a hard case worked one-handed: thumb pops the
//     latch, the lid swings, a spring-loaded auto-injector rises out of the
//     foam tray, and the case is driven into the chest to administer it.
//   • stim     (Scout)     — a combat auto-injector: safety cap thumbed off,
//     cocked back, slammed home, fluid window drains, spent unit discarded.
//   • bracer   (Phantom)   — a forearm cloak module: guarded toggle flipped, the
//     lens iris opens and washes a refraction sheet across the view.
//   • brace    (Ranger)    — a hip-mounted kinetic charge unit: the free hand
//     drops, yanks the charge lever, and the vent blows off.
//
// DESIGN RULES
//  • ONE prop is built per run — the one belonging to the player's class — so a
//    Medic never pays for the Pyro's geometry.
//  • Every geometry and material is per-instance and registered for disposal;
//    nothing here touches GunModel's shared caches.
//  • The animation is driven from the render loop (never setTimeout), so it
//    pauses with the game and cannot fire a beat after teardown.
//  • `onBeat` is the contract with gameplay: App hangs the ACTUAL effect off the
//    frame the mechanism does its work, which is what makes the motion read as
//    causing the power rather than decorating it.
//  • The prop occupies the LEFT hand, so GunModel is put into a one-handed carry
//    (see setOneHanded) while it's up — the player never grows a second left arm.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import type { CharacterAbilityId } from './CharacterAbilityRegistry';

/** Which physical prop a character's signature ability is operated with. */
export type AbilityPropKind =
  | 'detonator'  // engineer — radio firing device
  | 'flamer'     // pyro     — 360° flame projector
  | 'medkit'     // medic    — field first-aid case
  | 'stim'       // scout    — combat auto-injector
  | 'bracer'     // phantom  — forearm cloak module
  | 'brace';     // ranger   — hip kinetic charge unit

/**
 * Named frames in a prop's choreography. App subscribes to these and applies
 * the real gameplay effect on the exact frame the mechanism acts, so a heal
 * lands when the needle goes in and a bomb goes off when the plunger bottoms.
 */
export type AbilityBeat =
  | 'ready'     // prop is fully up in the hand
  | 'latch'     // a catch / guard / safety is worked
  | 'press'     // detonator plunger bottoms out  → DETONATE
  | 'ignite'    // flamer striker lights the pilot
  | 'burst'     // flamer main valve opens        → START THE FIRE
  | 'flameoff'  // flamer main valve closes       → STOP THE FIRE
  | 'cap'       // injector safety cap flicked off
  | 'inject'    // needle is in, plunger driven   → HEAL / SURGE
  | 'close'     // case lid shut
  | 'toss'      // spent unit discarded
  | 'switch'    // cloak toggle thrown            → CLOAK
  | 'slam';     // charge lever released          → DASH

/** Nothing to hold for abilities whose mechanism is the weapon or the shield. */
export function abilityPropKind(id: CharacterAbilityId): AbilityPropKind | null {
  switch (id) {
    case 'demolition': return 'detonator';
    case 'firestorm':  return 'flamer';
    case 'triage':     return 'medkit';
    case 'adrenaline': return 'stim';
    case 'cloak':      return 'bracer';
    case 'dash':       return 'brace';
    // 'overclock' is performed ON the weapon (GunModel.triggerOverclock) and
    // 'bulwark' deploys the riot shield — neither needs a separate prop.
    default: return null;
  }
}

/** How long one full use choreography runs, per prop (seconds). */
export const ABILITY_PLAY_SECONDS: Record<AbilityPropKind, number> = {
  detonator: 0.55,
  flamer: 2.40,
  medkit: 1.25,
  stim: 1.00,
  bracer: 0.95,
  brace: 0.70,
};

/**
 * Delay from the ability key-press to the frame the prop actually DOES its job.
 * Exported so App can extend a timed buff's duration by exactly the wind-up it
 * spends on the animation — the player is never charged for the choreography.
 */
export const ABILITY_PAYLOAD_DELAY: Record<AbilityPropKind, number> = {
  detonator: 0.55 * 0.30,
  flamer: 2.40 * 0.24,
  medkit: 1.25 * 0.54,
  stim: 1.00 * 0.50,
  bracer: 0.95 * 0.32,
  brace: 0,   // a charge has to be instant — the mechanism plays alongside it
};

interface Pose { x: number; y: number; z: number; rx: number; ry: number; rz: number }

const pose = (x: number, y: number, z: number, rx: number, ry: number, rz: number): Pose =>
  ({ x, y, z, rx, ry, rz });

/** Smoothstep-eased 0..1 progress through the window [a,b]. */
const seg = (v: number, a: number, b: number): number =>
  THREE.MathUtils.clamp((v - a) / Math.max(1e-5, b - a), 0, 1);
const ss = (v: number): number => v * v * (3 - 2 * v);
const span = (v: number, a: number, b: number): number => ss(seg(v, a, b));
/** A 0→1→0 bump across [a,b] — the shape of one hand motion. */
const bump = (v: number, a: number, b: number): number => Math.sin(seg(v, a, b) * Math.PI);

/**
 * The thumb's rest pose on the palm, and the single place every choreography
 * offsets from. It sits on the INBOARD edge of the left palm pointing up and
 * slightly forward — i.e. resting exactly where a held device puts its controls.
 *
 * Conventions used by every anim below (the thumb group's own axis is +Y):
 *   • `rotation.x` LESS than rest  → the thumb rolls FORWARD, over a button.
 *   • `position.y` below rest      → the thumb drives DOWN into one.
 *   • `rotation.z` less than rest  → it swings further inboard, across the face.
 */
const THUMB_REST = { x: 0.030, y: 0.012, z: -0.012, rx: -0.15, rz: -0.20 };
const THUMB_TIP_REST = -0.25;

/** The Scout's injector at rest in the fist (see buildStim for why it's upright). */
const STIM_REST = { x: 0.030, y: 0.020, z: -0.030, rx: -1.12, rz: 0.12 };

export class AbilityViewmodel {
  readonly kind: AbilityPropKind;
  /** Root, parented to the camera exactly like the weapon viewmodel. */
  readonly group: THREE.Group;

  /** Fires once per named frame of the choreography. Set by App. */
  onBeat: ((beat: AbilityBeat) => void) | null = null;

  private readonly camera: THREE.Camera;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  // ── Animated part refs (only the ones this prop actually built) ──
  private handGroup: THREE.Group;
  private thumb: THREE.Object3D | null = null;
  private thumbTip: THREE.Object3D | null = null;
  private fingers: THREE.Object3D[] = [];
  private plunger: THREE.Object3D | null = null;
  private plungerBaseY = 0;
  private safetyCap: THREE.Object3D | null = null;
  private armKey: THREE.Object3D | null = null;
  private antenna: THREE.Object3D | null = null;
  private lamp: THREE.Mesh | null = null;
  private lampMat: THREE.MeshBasicMaterial | null = null;
  private screenMat: THREE.MeshBasicMaterial | null = null;
  private emitterHead: THREE.Object3D | null = null;
  private valveLever: THREE.Object3D | null = null;
  private gaugeNeedle: THREE.Object3D | null = null;
  private pilotFlame: THREE.Mesh | null = null;
  private pilotMat: THREE.MeshBasicMaterial | null = null;
  private nozzleFlames: THREE.Mesh[] = [];
  private flameMat: THREE.MeshBasicMaterial | null = null;
  private fuelWindow: THREE.Object3D | null = null;
  private lid: THREE.Object3D | null = null;
  private latch: THREE.Object3D | null = null;
  private injector: THREE.Object3D | null = null;
  private injectorPlunger: THREE.Object3D | null = null;
  private fluid: THREE.Object3D | null = null;
  private needleGuard: THREE.Object3D | null = null;
  private toggle: THREE.Object3D | null = null;
  private guard: THREE.Object3D | null = null;
  private irisBlades: THREE.Object3D[] = [];
  private shimmer: THREE.Mesh | null = null;
  private shimmerMat: THREE.MeshBasicMaterial | null = null;
  private chargeLever: THREE.Object3D | null = null;
  private ventGlow: THREE.Mesh | null = null;
  private ventMat: THREE.MeshBasicMaterial | null = null;
  private statusLamps: THREE.Mesh[] = [];
  private statusMats: THREE.MeshBasicMaterial[] = [];

  // ── Animation state ──
  private restPose: Pose;
  private readyPose: Pose;
  private raise = 0;            // 0 = stowed below the view, 1 = up in the hand
  private heldTarget = 0;       // 1 while the prop must stay up (armed bomb)
  private playTime = -1;        // <0 = idle, else seconds into the choreography
  private playDur = 1;
  private holdAfter = 0;        // seconds the prop stays up after a play ends
  private fired = new Set<AbilityBeat>();
  private t = 0;                // free-running clock for idle life / blinks
  private dt = 1 / 60;          // this frame's step (read by the spin-up terms)
  private prewarming = false;
  // Cached scratch so the per-frame pose blend allocates nothing.
  private readonly cur: Pose = pose(0, 0, 0, 0, 0, 0);

  constructor(kind: AbilityPropKind, camera: THREE.Camera) {
    this.kind = kind;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.renderOrder = 6;
    this.group.visible = false;
    // Left-hand rest / ready poses, mirroring the right-hand weapon.
    switch (kind) {
      case 'detonator':
        this.restPose = pose(-0.30, -0.62, -0.42, -0.10, 0.30, 0.10);
        this.readyPose = pose(-0.245, -0.235, -0.400, -0.62, 0.42, 0.14);
        break;
      case 'flamer':
        this.restPose = pose(-0.34, -0.70, -0.44, 0.10, 0.20, 0.05);
        this.readyPose = pose(-0.275, -0.225, -0.430, -0.30, 0.30, -0.10);
        break;
      case 'medkit':
        this.restPose = pose(-0.30, -0.68, -0.44, 0.20, 0.28, 0.06);
        this.readyPose = pose(-0.255, -0.265, -0.415, -0.34, 0.36, 0.10);
        break;
      case 'stim':
        this.restPose = pose(-0.28, -0.64, -0.40, 0.10, 0.30, 0.10);
        this.readyPose = pose(-0.235, -0.230, -0.375, -0.46, 0.34, 0.30);
        break;
      case 'bracer':
        this.restPose = pose(-0.34, -0.66, -0.42, 0.10, 0.22, 0.06);
        this.readyPose = pose(-0.250, -0.215, -0.395, -0.52, 0.46, 0.22);
        break;
      case 'brace':
      default:
        this.restPose = pose(-0.26, -0.74, -0.46, 0.30, 0.20, 0.00);
        this.readyPose = pose(-0.240, -0.480, -0.440, 0.62, 0.26, 0.06);
        break;
    }

    this.handGroup = this.buildHand();
    this.group.add(this.handGroup);
    switch (kind) {
      case 'detonator': this.buildDetonator(); break;
      case 'flamer':    this.buildFlamer(); break;
      case 'medkit':    this.buildMedkit(); break;
      case 'stim':      this.buildStim(); break;
      case 'bracer':    this.buildBracer(); break;
      case 'brace':     this.buildBrace(); break;
    }
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false; }
    });
    camera.add(this.group);
  }

  // ── ASSET HELPERS ─────────────────────────────────────────────────────────

  private reg<T extends THREE.BufferGeometry>(g: T): T { this.geos.push(g); return g; }
  private regM<T extends THREE.Material>(m: T): T { this.mats.push(m); return m; }

  private std(color: number, metalness: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) {
    return this.regM(new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra }));
  }

  private glow(color: number, opacity = 1, additive = true) {
    return this.regM(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, toneMapped: false, fog: false,
      depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
  }

  /**
   * Chamfered box. Sharp 90° corners are what make a hand prop read as a
   * cardboard mock-up rather than a machined device — the thin bright bevel
   * line running each edge is most of what the eye reads as "hardware".
   */
  private cbox(w: number, h: number, d: number, chamfer = 0.004): THREE.BufferGeometry {
    const b = Math.min(chamfer, w * 0.3, h * 0.3, d * 0.3);
    if (b <= 0.0008) return this.reg(new THREE.BoxGeometry(w, h, d));
    const W = w - 2 * b, H = h - 2 * b, D = d - 2 * b;
    const r = Math.max(0.0004, Math.min(b * 1.7, W * 0.45, H * 0.45));
    const s = new THREE.Shape();
    const x0 = -W / 2, y0 = -H / 2;
    s.moveTo(x0 + r, y0);
    s.lineTo(x0 + W - r, y0);
    s.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + r);
    s.lineTo(x0 + W, y0 + H - r);
    s.quadraticCurveTo(x0 + W, y0 + H, x0 + W - r, y0 + H);
    s.lineTo(x0 + r, y0 + H);
    s.quadraticCurveTo(x0, y0 + H, x0, y0 + H - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: D, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 2,
    });
    g.translate(0, 0, -D / 2 - b);
    return this.reg(g);
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D,
    x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  // ── THE HAND ──────────────────────────────────────────────────────────────

  /**
   * A gloved LEFT hand and forearm, built to the same anatomy as the weapon's
   * arms (tapered forearm from an off-screen elbow, rolled cuff, knuckle block,
   * four two-segment fingers, two-segment thumb) but with the thumb and fingers
   * kept as live refs — every prop here is worked with them.
   */
  private buildHand(): THREE.Group {
    const g = new THREE.Group();
    const sleeve = this.std(0x2b2e26, 0.12, 0.84, { envMapIntensity: 0.5 });
    const glove = this.std(0x15171b, 0.28, 0.55, { envMapIntensity: 1.0 });
    const cuff = this.std(0x1d2024, 0.18, 0.68, { envMapIntensity: 0.6 });

    // Forearm running back to an elbow that sits below/behind/outboard of view.
    const wrist = new THREE.Vector3(0, 0.012, 0.052);
    const elbow = new THREE.Vector3(-0.085, -0.235, 0.300);
    const dir = new THREE.Vector3().subVectors(wrist, elbow);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

    const forearm = this.mesh(this.reg(new THREE.CylinderGeometry(0.032, 0.046, len, 12)), sleeve, g);
    forearm.quaternion.copy(quat);
    forearm.position.set((wrist.x + elbow.x) / 2, (wrist.y + elbow.y) / 2, (wrist.z + elbow.z) / 2);
    const elbowCap = this.mesh(this.reg(new THREE.SphereGeometry(0.046, 10, 8)), sleeve, g);
    elbowCap.position.copy(elbow);
    const cuffMesh = this.mesh(this.reg(new THREE.CylinderGeometry(0.043, 0.035, 0.044, 12)), cuff, g);
    cuffMesh.quaternion.copy(quat);
    cuffMesh.position.copy(wrist);

    // Palm block + knuckles. The prop is carried in front of the palm.
    const palm = new THREE.Group();
    palm.position.set(0, 0, -0.012);
    g.add(palm);
    this.mesh(this.cbox(0.058, 0.034, 0.070, 0.009), glove, palm);
    this.mesh(this.cbox(0.060, 0.019, 0.026, 0.006), glove, palm, 0, 0.011, -0.030);
    // Wrist taper into the cuff so the hand doesn't end in a flat slab.
    this.mesh(this.cbox(0.050, 0.030, 0.024, 0.007), glove, palm, 0, -0.002, 0.036);

    // Four fingers, each with a distal segment so they WRAP the prop.
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Group();
      f.position.set(-0.021 + i * 0.014, -0.015, -0.036);
      f.rotation.x = 1.05;
      palm.add(f);
      this.mesh(this.cbox(0.012, 0.035, 0.021, 0.004), glove, f, 0, -0.015, 0);
      const tip = new THREE.Group();
      tip.position.set(0, -0.031, -0.004);
      tip.rotation.x = 0.95;
      f.add(tip);
      this.mesh(this.cbox(0.011, 0.023, 0.018, 0.004), glove, tip, 0, -0.010, 0);
      this.fingers.push(f);
    }

    // Thumb — the digit every one of these mechanisms is actually worked with,
    // so it is built pointing UP off the inboard edge of the palm (along its own
    // +Y) rather than curled in with the fingers. That puts its tip exactly
    // where a held device's controls are, and makes every gesture below a plain
    // offset from one rest pose: −rotation.x rolls it FORWARD over a button,
    // position.y drives it DOWN onto one.
    const thumb = new THREE.Group();
    thumb.position.set(THUMB_REST.x, THUMB_REST.y, THUMB_REST.z);
    thumb.rotation.set(THUMB_REST.rx, 0, THUMB_REST.rz);
    palm.add(thumb);
    this.mesh(this.cbox(0.016, 0.036, 0.019, 0.005), glove, thumb, 0, 0.016, 0);
    const thumbTip = new THREE.Group();
    thumbTip.position.set(0, 0.032, -0.002);
    thumbTip.rotation.x = THUMB_TIP_REST;
    thumb.add(thumbTip);
    this.mesh(this.cbox(0.014, 0.022, 0.017, 0.005), glove, thumbTip, 0, 0.011, 0);
    this.thumb = thumb;
    this.thumbTip = thumbTip;
    return g;
  }

  // ── PROP: ENGINEER RADIO FIRING DEVICE ────────────────────────────────────

  private buildDetonator() {
    const shell = this.std(0x2b3038, 0.55, 0.44);
    const dark = this.std(0x14161a, 0.35, 0.62);
    const steel = this.std(0x777d86, 0.92, 0.28);
    const rubber = this.std(0x191b1f, 0.05, 0.9);
    const brass = this.std(0xb08a3c, 0.85, 0.34);
    const warn = this.std(0xcf9a1e, 0.2, 0.6);

    // ── FRAMING ──
    // Everything here is placed against ONE constraint: the plunger's crown has
    // to sit exactly under the thumb tip, so the press is a real contact rather
    // than a thumb waving near a button. The palm's top face is at y = +0.017,
    // so a 0.040-tall case centred at y = 0.037 rests ON it; the thumb rises
    // from THUMB_REST and puts its tip around (0.042, 0.068, −0.020), which is
    // where the plunger below is placed.
    const body = new THREE.Group();
    body.position.set(0.004, 0.037, -0.030);
    body.rotation.x = -0.10;
    this.group.add(body);

    // Die-cast case with a rubber-armoured belly and a machined top deck.
    this.mesh(this.cbox(0.086, 0.040, 0.108, 0.009), shell, body);
    this.mesh(this.cbox(0.090, 0.014, 0.104, 0.006), rubber, body, 0, -0.020, 0);
    this.mesh(this.cbox(0.074, 0.007, 0.088, 0.003), dark, body, 0, 0.021, 0);
    // Grip ribs down both flanks — the thing is meant to be held in a glove.
    for (let i = 0; i < 4; i++) {
      this.mesh(this.cbox(0.094, 0.005, 0.008, 0.002), rubber, body, 0, -0.016 + i * 0.008, 0.030 - i * 0.004);
    }
    // Hazard stripe across the nose so it reads as ordnance, not a phone.
    this.mesh(this.cbox(0.078, 0.009, 0.004, 0.002), warn, body, 0, 0.006, -0.055);

    // Status window facing the operator (7-segment style glow).
    this.screenMat = this.regM(new THREE.MeshBasicMaterial({
      color: 0x18e0a0, toneMapped: false, fog: false, transparent: true, opacity: 0.92,
    }));
    this.mesh(this.reg(new THREE.PlaneGeometry(0.046, 0.018)), this.screenMat, body, 0, 0.014, 0.0545);
    this.mesh(this.cbox(0.054, 0.026, 0.004, 0.002), dark, body, 0, 0.014, 0.052);

    // ARMING KEY — a brass barrel key turned a quarter-turn to live.
    const key = new THREE.Group();
    key.position.set(-0.030, 0.024, 0.020);
    body.add(key);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.010, 0.011, 0.008, 12)), steel, key);
    this.mesh(this.cbox(0.004, 0.010, 0.024, 0.001), brass, key, 0, 0.008, 0);
    this.armKey = key;

    // PLUNGER — sprung red firing button seated in a machined collar in the top
    // deck, on the inboard rear corner: directly beneath the thumb.
    this.mesh(this.reg(new THREE.CylinderGeometry(0.021, 0.023, 0.008, 16)), steel, body, 0.036, 0.019, 0.010);
    const plungerMat = this.std(0xd8362a, 0.25, 0.36, { emissive: 0x3a0803, emissiveIntensity: 0.7 });
    const plunger = new THREE.Group();
    plunger.position.set(0.036, 0.024, 0.010);
    body.add(plunger);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.017, 0.019, 0.014, 16)), plungerMat, plunger);
    this.mesh(this.reg(new THREE.TorusGeometry(0.0165, 0.0022, 6, 16)), this.std(0x8c1c12, 0.3, 0.5), plunger, 0, 0.006, 0)
      .rotation.x = Math.PI / 2;
    this.plunger = plunger;
    this.plungerBaseY = 0.024;

    // SAFETY CAP — hinged guard that flips back off the plunger when armed. The
    // hinge sits BEHIND the button so it opens away from the thumb's approach.
    const cap = new THREE.Group();
    cap.position.set(0.036, 0.021, 0.032);
    body.add(cap);
    const capMat = this.regM(new THREE.MeshStandardMaterial({
      color: 0xd8b64a, metalness: 0.1, roughness: 0.22, transparent: true, opacity: 0.42,
      side: THREE.DoubleSide,
    }));
    this.mesh(this.reg(new THREE.CylinderGeometry(0.024, 0.024, 0.016, 14, 1, true)), capMat, cap, 0, 0.008, -0.022)
      .rotation.x = Math.PI / 2;
    this.mesh(this.reg(new THREE.CircleGeometry(0.024, 14)), capMat, cap, 0, 0.016, -0.022)
      .rotation.x = -Math.PI / 2;
    this.safetyCap = cap;

    // Whip antenna that telescopes up when the device goes live.
    const ant = new THREE.Group();
    ant.position.set(-0.036, 0.020, -0.040);
    ant.rotation.z = 0.14;
    body.add(ant);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.0022, 0.0032, 0.088, 6)), steel, ant, 0, 0.044, 0);
    this.mesh(this.reg(new THREE.SphereGeometry(0.0042, 8, 6)), this.std(0x0e0f12, 0.2, 0.7), ant, 0, 0.090, 0);
    this.antenna = ant;

    // Charge lamp on the deck, in the operator's eyeline beside the button.
    this.lampMat = this.regM(new THREE.MeshBasicMaterial({ color: 0xff2f1e, toneMapped: false, fog: false }));
    this.lamp = this.mesh(this.reg(new THREE.SphereGeometry(0.005, 10, 8)), this.lampMat, body, 0.002, 0.024, 0.030);

    // Firing cable running out of the nose and away out of frame — the wire the
    // engineer actually spliced into the drum.
    const cable = this.std(0x0d0e11, 0.1, 0.85);
    for (let i = 0; i < 3; i++) {
      const seg2 = this.mesh(this.reg(new THREE.CylinderGeometry(0.0026, 0.0026, 0.05 + i * 0.02, 5)), cable, body,
        -0.004 - i * 0.010, -0.010 - i * 0.014, -0.062 - i * 0.026);
      seg2.rotation.set(1.25 - i * 0.22, 0, 0.20 + i * 0.10);
    }
  }

  // ── PROP: PYRO 360° FLAME PROJECTOR ───────────────────────────────────────

  private buildFlamer() {
    const shell = this.std(0x3a3129, 0.5, 0.55);
    const steel = this.std(0x8a9099, 0.94, 0.24);
    const dark = this.std(0x121417, 0.4, 0.65);
    const hose = this.std(0x1b1d21, 0.15, 0.88);
    const copper = this.std(0xb5713a, 0.9, 0.3);
    const soot = this.std(0x2a2320, 0.3, 0.85);

    // FUEL BOTTLE strapped along the forearm.
    const bottle = new THREE.Group();
    bottle.position.set(-0.012, -0.006, 0.062);
    bottle.rotation.x = -0.20;
    this.group.add(bottle);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.026, 0.026, 0.108, 14)), shell, bottle)
      .rotation.x = Math.PI / 2;
    this.mesh(this.reg(new THREE.SphereGeometry(0.026, 12, 8)), shell, bottle, 0, 0, 0.054);
    this.mesh(this.reg(new THREE.SphereGeometry(0.026, 12, 8)), shell, bottle, 0, 0, -0.054);
    for (const z of [0.030, -0.030]) {
      this.mesh(this.reg(new THREE.TorusGeometry(0.0275, 0.004, 6, 18)), dark, bottle, 0, 0, z);
    }
    // Fuel-level window down the flank — drains visibly as the burst runs.
    const fuelMat = this.regM(new THREE.MeshStandardMaterial({
      color: 0xff8a2a, metalness: 0.1, roughness: 0.3, emissive: 0xb03c08, emissiveIntensity: 0.7,
    }));
    const fuel = this.mesh(this.cbox(0.008, 0.010, 0.070, 0.002), fuelMat, bottle, 0.024, 0.008, 0);
    this.fuelWindow = fuel;

    // PRESSURE GAUGE on the bottle shoulder, needle swinging with the charge.
    const gauge = new THREE.Group();
    gauge.position.set(0.006, 0.026, -0.040);
    gauge.rotation.set(-0.5, 0, 0);
    bottle.add(gauge);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 14)), steel, gauge)
      .rotation.x = Math.PI / 2;
    this.mesh(this.reg(new THREE.CircleGeometry(0.011, 14)),
      this.regM(new THREE.MeshBasicMaterial({ color: 0xe8e2d2, toneMapped: false, fog: false })), gauge, 0, 0, 0.0035);
    const needle = new THREE.Group();
    needle.position.set(0, 0, 0.0045);
    gauge.add(needle);
    this.mesh(this.cbox(0.0016, 0.010, 0.001, 0), this.std(0xc02a1e, 0.2, 0.5), needle, 0, 0.005, 0);
    this.gaugeNeedle = needle;

    // Braided feed hose bottle → wrist manifold.
    for (let i = 0; i < 4; i++) {
      const h = this.mesh(this.reg(new THREE.CylinderGeometry(0.0055, 0.0055, 0.032, 6)), hose, this.group,
        -0.006 - i * 0.002, 0.004 + i * 0.004, 0.036 - i * 0.026);
      h.rotation.set(1.32 + i * 0.06, 0, 0.10);
    }

    // WRIST MANIFOLD + the valve lever the thumb drives forward. The lever is
    // deliberately mounted high on the manifold's inboard shoulder so its knob
    // sits within a centimetre of the thumb tip's rest position — a lever the
    // thumb visibly misses is worse than no lever at all.
    const manifold = new THREE.Group();
    manifold.position.set(0.006, 0.030, -0.024);
    this.group.add(manifold);
    this.mesh(this.cbox(0.048, 0.032, 0.052, 0.006), shell, manifold);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.008, 0.008, 0.030, 10)), copper, manifold, 0.018, 0.008, 0)
      .rotation.z = Math.PI / 2;
    const lever = new THREE.Group();
    lever.position.set(0.028, 0.020, 0.008);
    manifold.add(lever);
    this.mesh(this.cbox(0.007, 0.008, 0.026, 0.002), steel, lever, 0, 0, -0.010);
    this.mesh(this.reg(new THREE.SphereGeometry(0.0065, 8, 6)), this.std(0xc93a22, 0.3, 0.45), lever, 0, 0, -0.022);
    this.valveLever = lever;

    // EMITTER HEAD — a spinning hub with six outward nozzles: the 360°.
    const head = new THREE.Group();
    head.position.set(0, 0.006, -0.062);
    head.rotation.x = Math.PI / 2; // hub axis points down the view
    this.group.add(head);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.020, 0.024, 0.026, 16)), steel, head);
    this.mesh(this.reg(new THREE.TorusGeometry(0.023, 0.0035, 6, 20)), dark, head, 0, 0.012, 0);
    this.emitterHead = head;

    this.flameMat = this.glow(0xff9432, 0.0);
    const nozzleGeo = this.reg(new THREE.CylinderGeometry(0.0055, 0.0075, 0.024, 8));
    const flameGeo = this.reg(new THREE.ConeGeometry(0.016, 0.10, 9, 1, true));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const arm = new THREE.Group();
      arm.rotation.y = a;
      head.add(arm);
      const noz = this.mesh(nozzleGeo, soot, arm, 0, 0.002, -0.030);
      noz.rotation.x = Math.PI / 2;
      // Each flame tongue points radially OUT and licks slightly upward.
      const fl = this.mesh(flameGeo, this.flameMat, arm, 0, 0.004, -0.086);
      fl.rotation.x = -Math.PI / 2;
      fl.visible = false;
      this.nozzleFlames.push(fl);
    }

    // Pilot igniter — a small striker head with its own standing flame.
    const pilotBody = this.mesh(this.cbox(0.010, 0.012, 0.020, 0.003), soot, this.group, 0.020, 0.020, -0.052);
    pilotBody.rotation.z = -0.2;
    this.pilotMat = this.glow(0x8fd0ff, 0.0);
    this.pilotFlame = this.mesh(this.reg(new THREE.ConeGeometry(0.006, 0.026, 8, 1, true)), this.pilotMat,
      this.group, 0.020, 0.036, -0.052);
  }

  // ── PROP: MEDIC FIELD CASE ────────────────────────────────────────────────

  private buildMedkit() {
    const caseMat = this.std(0x2f4436, 0.15, 0.72);
    const trim = this.std(0x1b241d, 0.3, 0.6);
    const steel = this.std(0x8b9199, 0.9, 0.3);
    const white = this.std(0xe8ece8, 0.05, 0.55);
    const red = this.std(0xc22a22, 0.1, 0.5);
    const foam = this.std(0x14181a, 0.02, 0.95);

    // ── FRAMING ──
    // The case sits ON the palm (top face y = +0.017, case half-height 0.022 →
    // centre 0.040), and its two operated parts are placed where the thumb can
    // actually reach them: the draw latch on the NEAR top edge under the thumb
    // tip, and the lid hinged on the FAR edge so it swings up and away, opening
    // the tray toward the player rather than into their face.
    const box = new THREE.Group();
    box.position.set(0.004, 0.040, -0.026);
    box.rotation.x = -0.20;
    this.group.add(box);

    // Hard case body with a rubber bumper rail and corner protectors.
    this.mesh(this.cbox(0.104, 0.044, 0.082, 0.009), caseMat, box);
    this.mesh(this.cbox(0.108, 0.008, 0.086, 0.004), trim, box, 0, -0.014, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.mesh(this.cbox(0.014, 0.040, 0.014, 0.004), trim, box, sx * 0.046, 0, sz * 0.035);
    }
    // Foam tray inside, visible once the lid is up.
    this.mesh(this.cbox(0.090, 0.012, 0.068, 0.004), foam, box, 0, 0.018, 0);
    // Vials + a gauze roll seated in the foam.
    for (let i = 0; i < 3; i++) {
      this.mesh(this.reg(new THREE.CylinderGeometry(0.005, 0.005, 0.020, 8)),
        i === 1 ? red : white, box, -0.034 + i * 0.013, 0.028, 0.020);
    }
    this.mesh(this.reg(new THREE.CylinderGeometry(0.011, 0.011, 0.024, 12)), white, box, 0.030, 0.028, 0.018)
      .rotation.z = Math.PI / 2;

    // Hinged LID with the cross panel. Hinge line on the FAR edge, panel
    // extending back over the tray toward the player, so opening lifts it up
    // and forward, out of the sightline.
    const lid = new THREE.Group();
    lid.position.set(0, 0.022, -0.041);
    box.add(lid);
    this.mesh(this.cbox(0.104, 0.020, 0.082, 0.008), caseMat, lid, 0, 0.010, 0.041);
    this.mesh(this.cbox(0.026, 0.008, 0.008, 0.002), white, lid, 0, 0.021, 0.041);
    this.mesh(this.cbox(0.008, 0.008, 0.026, 0.002), white, lid, 0, 0.021, 0.041);
    this.mesh(this.cbox(0.030, 0.003, 0.030, 0.001), red, lid, 0, 0.0195, 0.041);
    // Two hinge knuckles on the fold line.
    for (const kx of [-0.030, 0.030]) {
      this.mesh(this.reg(new THREE.CylinderGeometry(0.005, 0.005, 0.018, 10)), steel, lid, kx, 0, 0)
        .rotation.z = Math.PI / 2;
    }
    this.lid = lid;

    // Draw latch on the near top edge, directly under the thumb.
    const latch = new THREE.Group();
    latch.position.set(0.034, 0.022, 0.020);
    box.add(latch);
    this.mesh(this.cbox(0.018, 0.006, 0.016, 0.002), steel, latch, 0, 0.002, 0.006);
    this.mesh(this.cbox(0.014, 0.012, 0.005, 0.002), steel, latch, 0, -0.004, 0.014);
    this.latch = latch;

    // SPRING-LOADED AUTO-INJECTOR clipped in the tray; rises on its bracket.
    const inj = new THREE.Group();
    inj.position.set(-0.006, 0.022, -0.012);
    box.add(inj);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.0085, 0.0085, 0.052, 12)), white, inj)
      .rotation.x = Math.PI / 2;
    this.mesh(this.reg(new THREE.CylinderGeometry(0.0092, 0.0092, 0.008, 12)), red, inj, 0, 0, -0.028)
      .rotation.x = Math.PI / 2;
    const fluidMat = this.regM(new THREE.MeshStandardMaterial({
      color: 0x3affa0, metalness: 0.05, roughness: 0.25, emissive: 0x0f7a4a, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.9,
    }));
    const fluid = this.mesh(this.reg(new THREE.CylinderGeometry(0.0062, 0.0062, 0.034, 10)), fluidMat, inj, 0, 0, 0.002);
    fluid.rotation.x = Math.PI / 2;
    this.fluid = fluid;
    const plunger = new THREE.Group();
    plunger.position.set(0, 0, 0.030);
    inj.add(plunger);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.0072, 0.0072, 0.014, 10)), steel, plunger)
      .rotation.x = Math.PI / 2;
    this.injectorPlunger = plunger;
    // Needle + its guard.
    this.mesh(this.reg(new THREE.CylinderGeometry(0.0011, 0.0011, 0.020, 6)), steel, inj, 0, 0, -0.042)
      .rotation.x = Math.PI / 2;
    const guard = this.mesh(this.reg(new THREE.CylinderGeometry(0.005, 0.005, 0.022, 10)),
      this.std(0x2c6fbc, 0.15, 0.5), inj, 0, 0, -0.043);
    guard.rotation.x = Math.PI / 2;
    this.needleGuard = guard;
    this.injector = inj;
  }

  // ── PROP: SCOUT COMBAT AUTO-INJECTOR ──────────────────────────────────────

  private buildStim() {
    const barrel = this.std(0xd8d4c8, 0.1, 0.42);
    const steel = this.std(0x8b9199, 0.9, 0.3);
    const amberBody = this.std(0x27313d, 0.4, 0.5);

    // ── FRAMING ──
    // Built the way a real combat auto-injector is CARRIED and USED: gripped in
    // a fist with the barrel near-vertical, the orange needle end pointing DOWN
    // and forward ready to be driven in, and the blue safety cap on the TAIL —
    // up at the top, right under the thumb that has to flick it off. Laying it
    // fore-and-aft (the obvious way to model a cylinder) would put the cap
    // behind the hand where no thumb could ever reach it.
    const inj = new THREE.Group();
    inj.position.set(STIM_REST.x, STIM_REST.y, STIM_REST.z);
    inj.rotation.set(STIM_REST.rx, 0, STIM_REST.rz); // tail up-back, needle down-forward
    this.group.add(inj);

    // Body, knurled collar, label band (all along the injector's local Z).
    const shaft = this.mesh(this.reg(new THREE.CylinderGeometry(0.011, 0.011, 0.076, 14)), barrel, inj);
    shaft.rotation.x = Math.PI / 2;
    this.mesh(this.reg(new THREE.CylinderGeometry(0.0125, 0.0125, 0.012, 14)), amberBody, inj, 0, 0, 0.016)
      .rotation.x = Math.PI / 2;
    this.mesh(this.reg(new THREE.CylinderGeometry(0.0118, 0.0118, 0.008, 14)),
      this.std(0xf0a41e, 0.2, 0.5), inj, 0, 0, -0.030).rotation.x = Math.PI / 2;

    // Fluid window — a sleeve of stim that visibly drains on injection.
    const fluidMat = this.regM(new THREE.MeshStandardMaterial({
      color: 0xffc23a, metalness: 0.05, roughness: 0.22, emissive: 0xa8620a, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.92,
    }));
    const fluid = this.mesh(this.reg(new THREE.CylinderGeometry(0.0082, 0.0082, 0.044, 12)), fluidMat, inj, 0, 0, 0.002);
    fluid.rotation.x = Math.PI / 2;
    this.fluid = fluid;

    // Firing head at the TAIL, exposed once the cap is off — the slam drives it
    // in and the mechanism fires.
    const plunger = new THREE.Group();
    plunger.position.set(0, 0, 0.038);
    inj.add(plunger);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.014, 0.012, 0.010, 14)), steel, plunger)
      .rotation.x = Math.PI / 2;
    this.injectorPlunger = plunger;

    // Needle at the business end, under an orange guard.
    this.mesh(this.reg(new THREE.CylinderGeometry(0.0012, 0.0012, 0.022, 6)), steel, inj, 0, 0, -0.048)
      .rotation.x = Math.PI / 2;
    // Blue safety cap on the tail, directly under the thumb.
    const cap = new THREE.Group();
    cap.position.set(0, 0, 0.046);
    inj.add(cap);
    const capMesh = this.mesh(this.reg(new THREE.CylinderGeometry(0.0072, 0.0088, 0.026, 12)),
      this.std(0x2f7fd0, 0.2, 0.45), cap);
    capMesh.rotation.x = Math.PI / 2;
    this.safetyCap = cap;
    this.injector = inj;
  }

  // ── PROP: PHANTOM CLOAK BRACER ────────────────────────────────────────────

  private buildBracer() {
    const plate = this.std(0x22262e, 0.7, 0.4);
    const dark = this.std(0x101216, 0.4, 0.62);
    const steel = this.std(0x878d97, 0.92, 0.26);

    // ── FRAMING ──
    // A gauntlet rather than a pure forearm cuff: it runs from the wrist over
    // the back of the hand, which is what puts its guarded toggle on the
    // inboard-forward shoulder — within reach of the thumb that has to throw it.
    // Sitting it back on the forearm alone would look right and be unusable.
    const br = new THREE.Group();
    br.position.set(0.000, 0.014, 0.030);
    br.rotation.x = -0.30;
    this.group.add(br);

    // Armoured cuff wrapped around the wrist.
    const cuff = this.mesh(this.reg(new THREE.CylinderGeometry(0.040, 0.036, 0.075, 14, 1, true)), plate, br);
    cuff.rotation.x = Math.PI / 2;
    this.mesh(this.reg(new THREE.TorusGeometry(0.040, 0.004, 6, 18)), dark, br, 0, 0, 0.036);
    this.mesh(this.reg(new THREE.TorusGeometry(0.038, 0.004, 6, 18)), dark, br, 0, 0, -0.036);
    this.mesh(this.cbox(0.052, 0.012, 0.066, 0.005), plate, br, 0, 0.034, 0);

    // Guarded toggle switch on the inboard-forward shoulder — the guard flips
    // up, then the toggle is thrown under it.
    const guard = new THREE.Group();
    guard.position.set(0.030, 0.044, -0.026);
    br.add(guard);
    this.mesh(this.cbox(0.018, 0.003, 0.020, 0.001), steel, guard, 0, 0, -0.010);
    this.guard = guard;
    const toggle = new THREE.Group();
    toggle.position.set(0.030, 0.042, -0.026);
    br.add(toggle);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.0022, 0.0032, 0.014, 8)), steel, toggle, 0, 0.007, 0);
    this.mesh(this.reg(new THREE.SphereGeometry(0.004, 8, 6)), this.std(0xd8d4c8, 0.3, 0.4), toggle, 0, 0.014, 0);
    this.toggle = toggle;

    // Status lamp strip, outboard of the switch so the thumb never covers it.
    for (let i = 0; i < 3; i++) {
      const m = this.regM(new THREE.MeshBasicMaterial({ color: 0x7a4dff, toneMapped: false, fog: false, transparent: true, opacity: 0.25 }));
      this.statusMats.push(m);
      this.statusLamps.push(this.mesh(this.reg(new THREE.SphereGeometry(0.0035, 8, 6)), m, br, -0.018, 0.040, -0.016 + i * 0.013));
    }

    // Refraction lens on the back of the hand — an iris of four blades that
    // opens to expose the emitter, then a shimmer sheet washes over the view.
    const lensHub = new THREE.Group();
    lensHub.position.set(-0.004, 0.034, -0.048);
    lensHub.rotation.x = -0.5;
    br.add(lensHub);
    this.mesh(this.reg(new THREE.CylinderGeometry(0.019, 0.021, 0.010, 16)), steel, lensHub)
      .rotation.x = Math.PI / 2;
    const bladeGeo = this.cbox(0.020, 0.002, 0.011, 0.001);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / 4) * Math.PI * 2;
      lensHub.add(pivot);
      this.mesh(bladeGeo, dark, pivot, 0.010, 0, 0.006);
      this.irisBlades.push(pivot);
    }
    this.shimmerMat = this.glow(0xb08cff, 0.0);
    this.shimmer = this.mesh(this.reg(new THREE.SphereGeometry(0.055, 14, 10)), this.shimmerMat, lensHub, 0, 0, 0.02);
    this.shimmer.visible = false;
  }

  // ── PROP: RANGER KINETIC CHARGE UNIT ──────────────────────────────────────

  private buildBrace() {
    const plate = this.std(0x30373f, 0.65, 0.45);
    const dark = this.std(0x101216, 0.4, 0.62);
    const steel = this.std(0x878d97, 0.92, 0.26);
    const warn = this.std(0xd0761e, 0.2, 0.55);

    // The unit rides on the hip, so only its top deck ever enters the frame —
    // and it is set BELOW the palm so the charge lever rises into the curl of
    // the fingers rather than floating above a hand that never touches it.
    const unit = new THREE.Group();
    unit.position.set(0.010, -0.055, -0.048);
    unit.rotation.set(0.55, 0.2, 0);
    this.group.add(unit);
    this.mesh(this.cbox(0.086, 0.036, 0.062, 0.008), plate, unit);
    this.mesh(this.cbox(0.090, 0.006, 0.026, 0.003), warn, unit, 0, 0.020, -0.014);
    // Cooling vanes + the blow-off vent.
    for (let i = 0; i < 5; i++) {
      this.mesh(this.cbox(0.070, 0.004, 0.005, 0.001), dark, unit, 0, 0.020, 0.004 + i * 0.008);
    }
    this.ventMat = this.glow(0x7ff0ff, 0.0);
    this.ventGlow = this.mesh(this.reg(new THREE.PlaneGeometry(0.060, 0.024)), this.ventMat, unit, 0, 0.024, 0.014);
    this.ventGlow.rotation.x = -Math.PI / 2;

    // Charge lever the hand yanks back against the piston spring.
    const lever = new THREE.Group();
    lever.position.set(-0.020, 0.016, -0.024);
    unit.add(lever);
    this.mesh(this.cbox(0.008, 0.030, 0.008, 0.002), steel, lever, 0, 0.014, 0);
    this.mesh(this.reg(new THREE.SphereGeometry(0.009, 10, 8)), this.std(0xb8322a, 0.3, 0.45), lever, 0, 0.032, 0);
    this.chargeLever = lever;
    // Piston barrel it compresses.
    this.mesh(this.reg(new THREE.CylinderGeometry(0.011, 0.011, 0.048, 12)), steel, unit, 0.026, 0.014, -0.010)
      .rotation.z = Math.PI / 2;
  }

  // ── PUBLIC CONTROL ────────────────────────────────────────────────────────

  /** Start the one-shot use choreography. `dur` defaults to the prop's own length. */
  play(dur = ABILITY_PLAY_SECONDS[this.kind]) {
    this.playTime = 0;
    this.playDur = Math.max(0.15, dur);
    this.fired.clear();
    this.holdAfter = 0;
  }

  /**
   * Keep the prop up indefinitely (the Engineer holds the firing device for as
   * long as a bomb is wired). Independent of `play`.
   */
  setHeld(on: boolean) { this.heldTarget = on ? 1 : 0; }

  /** Engineer: thumb the plunger. Holds the prop up long enough to be seen. */
  press() {
    this.play(ABILITY_PLAY_SECONDS.detonator);
    this.holdAfter = 0.30;
  }

  /** True while the prop is anywhere in view — the left hand is not free. */
  occupiesHand(): boolean {
    return this.heldTarget > 0 || this.playTime >= 0 || this.raise > 0.05;
  }

  /** 0..1 — how much of the left hand the prop currently owns (drives the gun). */
  get handBlend(): number { return this.raise; }

  /**
   * Render one frame of the prop. `hostVisible` mirrors the weapon viewmodel's
   * own visibility so photo mode hides the whole set of hands at once.
   */
  update(dt: number, hostVisible: boolean) {
    this.t += dt;
    this.dt = dt;

    // ── Timeline ──
    let p = -1;
    if (this.playTime >= 0) {
      this.playTime += dt;
      p = Math.min(1, this.playTime / this.playDur);
      if (this.playTime >= this.playDur) {
        if (this.holdAfter > 0) this.holdAfter -= dt;
        if (this.holdAfter <= 0) this.playTime = -1;
      }
    }
    const active = p >= 0;
    const wantUp = this.heldTarget > 0 || active;
    const rate = wantUp ? 11 : 7;
    this.raise += ((wantUp ? 1 : 0) - this.raise) * Math.min(1, dt * rate);
    if (!wantUp && this.raise < 0.004) this.raise = 0;

    const visible = hostVisible && (this.raise > 0.01 || this.prewarming);
    this.group.visible = visible;
    if (!visible) return;
    // Mid-warmup the prop is parked on purpose so the compile pass can see
    // every one of its materials — leave the pose exactly where prewarm put it.
    // (Only reachable at all if the loader watchdog let gameplay start while the
    // warmup chain was still finishing in the background.)
    if (this.prewarming) return;

    // ── Base pose: eased between the stowed and ready poses ──
    const e = ss(THREE.MathUtils.clamp(this.raise, 0, 1));
    const c = this.cur;
    const r0 = this.restPose, r1 = this.readyPose;
    c.x = r0.x + (r1.x - r0.x) * e;
    c.y = r0.y + (r1.y - r0.y) * e;
    c.z = r0.z + (r1.z - r0.z) * e;
    c.rx = r0.rx + (r1.rx - r0.rx) * e;
    c.ry = r0.ry + (r1.ry - r0.ry) * e;
    c.rz = r0.rz + (r1.rz - r0.rz) * e;
    // Hand-held life: nothing a person holds is ever perfectly still.
    const idle = e * (this.prewarming ? 0 : 1);
    c.y += Math.sin(this.t * 1.7) * 0.0035 * idle;
    c.x += Math.sin(this.t * 1.23 + 1.1) * 0.0028 * idle;
    c.rz += Math.sin(this.t * 1.41 + 0.4) * 0.012 * idle;

    // Neutral hand pose, re-applied every frame; each choreography then offsets
    // only what it actually works (see THUMB_REST for the sign conventions).
    if (this.thumb) {
      this.thumb.position.set(THUMB_REST.x, THUMB_REST.y, THUMB_REST.z);
      this.thumb.rotation.set(THUMB_REST.rx, 0, THUMB_REST.rz);
    }
    if (this.thumbTip) this.thumbTip.rotation.x = THUMB_TIP_REST;

    switch (this.kind) {
      case 'detonator': this.animDetonator(p, c); break;
      case 'flamer':    this.animFlamer(p, c); break;
      case 'medkit':    this.animMedkit(p, c); break;
      case 'stim':      this.animStim(p, c); break;
      case 'bracer':    this.animBracer(p, c); break;
      case 'brace':     this.animBrace(p, c); break;
    }

    this.group.position.set(c.x, c.y, c.z);
    this.group.rotation.set(c.rx, c.ry, c.rz);
  }

  private beat(b: AbilityBeat) {
    if (this.fired.has(b)) return;
    this.fired.add(b);
    this.onBeat?.(b);
  }
  /** Emit `b` once the playhead reaches `at`. */
  private at(p: number, t: number, b: AbilityBeat) { if (p >= 0 && p >= t) this.beat(b); }

  // ── CHOREOGRAPHY ──────────────────────────────────────────────────────────

  /**
   * Engineer. Coming up: the safety cap flips, the arming key turns a quarter,
   * the antenna telescopes, the lamp goes to a fast armed blink. On a press the
   * THUMB rolls down onto the plunger, the plunger bottoms out (that frame is
   * the detonation), the whole device recoils in the hand, and the screen and
   * lamp flash white.
   */
  private animDetonator(p: number, c: Pose) {
    const armed = ss(THREE.MathUtils.clamp(this.raise, 0, 1));
    if (this.safetyCap) this.safetyCap.rotation.x = -armed * 1.9;
    if (this.armKey) this.armKey.rotation.y = armed * (Math.PI / 2);
    if (this.antenna) this.antenna.scale.y = 0.25 + armed * 0.75;

    // While armed the thumb comes to REST ON the button — cocked and waiting.
    // The press then drives thumb and plunger down together by the same 11 mm,
    // which is what makes it read as the thumb firing the device rather than a
    // button animating near a hand.
    let pressDepth = 0;
    if (p >= 0) {
      // 0.00–0.30 the thumb drives the button down, 0.30–0.46 it holds it
      // bottomed out, then thumb and plunger spring back together.
      const down = span(p, 0.06, 0.30);
      const back = span(p, 0.46, 0.78);
      pressDepth = down * (1 - back);
      this.at(p, 0.30, 'press');
      // Firing recoil: the device kicks back into the palm.
      const kick = bump(p, 0.28, 0.52);
      c.z += kick * 0.020;
      c.rx -= kick * 0.16;
      c.x += kick * 0.006;
    }
    const PRESS_TRAVEL = 0.011;
    if (this.thumb) {
      // Armed: roll a little further forward so the pad lies flat on the crown.
      this.thumb.rotation.x = THUMB_REST.rx - armed * 0.10 - pressDepth * 0.16;
      this.thumb.rotation.z = THUMB_REST.rz - armed * 0.04;
      this.thumb.position.y = THUMB_REST.y - pressDepth * PRESS_TRAVEL;
    }
    if (this.thumbTip) this.thumbTip.rotation.x = THUMB_TIP_REST - pressDepth * 0.14;
    if (this.plunger) this.plunger.position.y = this.plungerBaseY - pressDepth * PRESS_TRAVEL;
    // Fingers close around the body as it comes up.
    for (let i = 0; i < this.fingers.length; i++) {
      this.fingers[i].rotation.x = 1.05 + armed * 0.34 + pressDepth * 0.06;
    }
    // Lamp: slow standby → urgent armed blink → solid white on the shot.
    if (this.lampMat && this.lamp) {
      const hz = 1.2 + armed * 5.0;
      const bl = 0.5 + 0.5 * Math.sin(this.t * hz * Math.PI * 2);
      const fireFlash = p >= 0 ? Math.max(0, 1 - Math.abs(p - 0.32) * 7) : 0;
      this.lamp.scale.setScalar(0.75 + bl * 0.7 + fireFlash * 1.6);
      this.lampMat.color.setRGB(1, 0.18 + fireFlash * 0.8, 0.12 + fireFlash * 0.85);
    }
    if (this.screenMat) {
      const fireFlash = p >= 0 ? Math.max(0, 1 - Math.abs(p - 0.32) * 6) : 0;
      this.screenMat.opacity = 0.55 + armed * 0.35 + fireFlash * 0.6;
      this.screenMat.color.setRGB(0.09 + fireFlash, 0.88, 0.63 + fireFlash * 0.35);
    }
  }

  /**
   * Pyro. Thumb rolls the striker (pilot lights), then drives the valve lever
   * forward; the emitter head spins up and all six nozzles throw fire while the
   * bottle's fuel window drains and the gauge needle falls. Closing the valve
   * snuffs the tongues and the head coasts down.
   */
  private animFlamer(p: number, c: Pose) {
    const up = ss(THREE.MathUtils.clamp(this.raise, 0, 1));
    let strike = 0, valve = 0, burn = 0, spin = 0;
    if (p >= 0) {
      strike = bump(p, 0.10, 0.19);
      this.at(p, 0.17, 'ignite');
      valve = span(p, 0.19, 0.26) * (1 - span(p, 0.82, 0.90));
      this.at(p, 0.24, 'burst');
      this.at(p, 0.86, 'flameoff');
      burn = span(p, 0.22, 0.30) * (1 - span(p, 0.82, 0.92));
      spin = span(p, 0.20, 0.42) * (1 - span(p, 0.86, 1.0));
      // The projector fights the operator: a hard shove back plus a rattle.
      c.z += burn * 0.028;
      c.rx += burn * 0.10;
      c.x += Math.sin(this.t * 47) * 0.0035 * burn;
      c.y += Math.sin(this.t * 39) * 0.0030 * burn;
      c.rz += Math.sin(this.t * 53) * 0.020 * burn;
    }
    // Thumb: rolls the striker wheel forward, then shoves the valve lever over.
    if (this.thumb) {
      this.thumb.rotation.x = THUMB_REST.rx - strike * 0.50 - valve * 0.34;
      this.thumb.rotation.y = -valve * 0.30;
      this.thumb.rotation.z = THUMB_REST.rz - up * 0.10 - valve * 0.22;
      this.thumb.position.y = THUMB_REST.y - strike * 0.004;
    }
    if (this.thumbTip) this.thumbTip.rotation.x = THUMB_TIP_REST - strike * 0.55;
    if (this.valveLever) this.valveLever.rotation.x = -valve * 0.9;
    for (let i = 0; i < this.fingers.length; i++) this.fingers[i].rotation.x = 1.05 + up * 0.30;

    // The head idles slowly and winds up hard once the valve is open.
    if (this.emitterHead) this.emitterHead.rotation.y += (0.6 + spin * 34) * this.dt;
    if (this.pilotMat && this.pilotFlame) {
      const pilot = Math.max(strike * 0.4, p >= 0 ? span(p, 0.15, 0.20) * (1 - span(p, 0.92, 1.0)) : 0);
      this.pilotMat.opacity = pilot * (0.65 + Math.sin(this.t * 34) * 0.2);
      this.pilotFlame.visible = pilot > 0.02;
      this.pilotFlame.scale.set(1, 0.7 + Math.sin(this.t * 41) * 0.25 + pilot * 0.4, 1);
    }
    if (this.flameMat) {
      this.flameMat.opacity = burn * (0.72 + Math.sin(this.t * 44) * 0.22);
      // Colour runs hot yellow at the root and rolls orange as it stabilises.
      const hot = 1 - THREE.MathUtils.clamp(burn, 0, 1) * 0.35;
      this.flameMat.color.setRGB(1, 0.48 + hot * 0.22, 0.12 + hot * 0.08);
    }
    for (let i = 0; i < this.nozzleFlames.length; i++) {
      const f = this.nozzleFlames[i];
      f.visible = burn > 0.02;
      if (!f.visible) continue;
      const flick = 0.78 + Math.sin(this.t * (28 + i * 3.1) + i) * 0.22;
      f.scale.set(0.8 + burn * 0.5, burn * (1.15 + flick * 0.5), 0.8 + burn * 0.5);
    }
    // Fuel drains, gauge falls with it.
    const spent = p >= 0 ? span(p, 0.24, 0.86) : 0;
    if (this.fuelWindow) this.fuelWindow.scale.z = Math.max(0.08, 1 - spent * 0.82);
    if (this.gaugeNeedle) this.gaugeNeedle.rotation.z = -2.1 + (1 - spent) * (up * 1.9);
  }

  /**
   * Medic. Thumb pops the latch, the lid swings, the auto-injector rises out of
   * the foam on its bracket, the case is driven into the chest and the plunger
   * is fired (that frame is the heal), then the lid is thumbed shut.
   */
  private animMedkit(p: number, c: Pose) {
    const up = ss(THREE.MathUtils.clamp(this.raise, 0, 1));
    let latch = 0, open = 0, rise = 0, jab = 0, fire = 0, shut = 0;
    if (p >= 0) {
      latch = bump(p, 0.12, 0.22);
      this.at(p, 0.18, 'latch');
      open = span(p, 0.18, 0.36) * (1 - span(p, 0.80, 0.92));
      rise = span(p, 0.30, 0.44) * (1 - span(p, 0.74, 0.86));
      jab = span(p, 0.44, 0.54) * (1 - span(p, 0.66, 0.78));
      fire = span(p, 0.54, 0.62) * (1 - span(p, 0.72, 0.82));
      shut = span(p, 0.82, 0.94);
      this.at(p, 0.54, 'inject');
      this.at(p, 0.90, 'close');
      // Drive the case in toward the chest, then ease it back out.
      c.x += jab * 0.075;
      c.y += jab * 0.055;
      c.z += jab * 0.070;
      c.rx += jab * 0.55;
      c.ry -= jab * 0.40;
      // The jab itself lands with a small shock, and the arm trembles on the push.
      const shock = bump(p, 0.52, 0.60);
      c.z += shock * 0.010;
      c.y += Math.sin(this.t * 36) * 0.0022 * fire;
    }
    // Thumb pops the latch forward, then presses the lid shut at the end.
    if (this.thumb) {
      this.thumb.rotation.x = THUMB_REST.rx - latch * 0.70 - shut * 0.45;
      this.thumb.rotation.z = THUMB_REST.rz - up * 0.10 - latch * 0.26;
      this.thumb.position.y = THUMB_REST.y - shut * 0.008;
    }
    if (this.thumbTip) this.thumbTip.rotation.x = THUMB_TIP_REST - latch * 0.40;
    if (this.latch) this.latch.rotation.x = -latch * 1.15;
    // Hinged on the far edge: a NEGATIVE rotation swings the panel up and over
    // forward, away from the sightline, exposing the tray.
    if (this.lid) this.lid.rotation.x = -open * 2.05;
    for (let i = 0; i < this.fingers.length; i++) this.fingers[i].rotation.x = 1.05 + up * 0.32;
    if (this.injector) {
      this.injector.position.y = 0.022 + rise * 0.026;
      this.injector.rotation.x = -rise * 0.55 - jab * 0.35;
    }
    if (this.needleGuard) this.needleGuard.position.z = -0.043 + rise * 0.020;
    if (this.injectorPlunger) this.injectorPlunger.position.z = 0.030 - fire * 0.020;
    if (this.fluid) this.fluid.scale.z = Math.max(0.06, 1 - fire * 0.94);
  }

  /**
   * Scout. Thumb hooks the safety cap and flicks it clear, the injector is
   * cocked back, slammed into the neck, and the amber stim empties; the spent
   * unit is thrown away and the hand drops.
   */
  private animStim(p: number, c: Pose) {
    const up = ss(THREE.MathUtils.clamp(this.raise, 0, 1));
    let capOff = 0, cock = 0, slam = 0, fire = 0, toss = 0;
    if (p >= 0) {
      capOff = span(p, 0.14, 0.26);
      this.at(p, 0.22, 'cap');
      cock = span(p, 0.26, 0.40) * (1 - span(p, 0.40, 0.50));
      slam = span(p, 0.40, 0.50) * (1 - span(p, 0.68, 0.80));
      fire = span(p, 0.50, 0.60) * (1 - span(p, 0.74, 0.84));
      toss = span(p, 0.82, 1.0);
      this.at(p, 0.50, 'inject');
      this.at(p, 0.86, 'toss');
      // Cock outboard and back, then drive up into the side of the neck.
      c.x -= cock * 0.045;
      c.y += cock * 0.030;
      c.rz += cock * 0.35;
      c.x += slam * 0.100;
      c.y += slam * 0.090;
      c.z += slam * 0.055;
      c.rz -= slam * 0.55;
      c.rx += slam * 0.40;
      // Adrenaline hits: the hand shakes for as long as the plunger is down.
      const shake = fire;
      c.x += Math.sin(this.t * 43) * 0.0032 * shake;
      c.y += Math.sin(this.t * 51 + 1.3) * 0.0030 * shake;
      c.rz += Math.sin(this.t * 47) * 0.030 * shake;
      // Thrown clear: tumbles away and shrinks out of frame.
      if (this.injector) {
        this.injector.position.set(STIM_REST.x - toss * 0.10, STIM_REST.y - toss * 0.14, STIM_REST.z + toss * 0.10);
        this.injector.rotation.set(STIM_REST.rx - toss * 5.5, toss * 3.1, STIM_REST.rz + toss * 2.2);
        this.injector.scale.setScalar(Math.max(0.05, 1 - toss));
      }
    } else if (this.injector) {
      this.injector.position.set(STIM_REST.x, STIM_REST.y, STIM_REST.z);
      this.injector.rotation.set(STIM_REST.rx, 0, STIM_REST.rz);
      this.injector.scale.setScalar(1);
    }
    // Thumb hooks the cap and flicks it clear, then rides the tail plunger down.
    if (this.thumb) {
      this.thumb.rotation.x = THUMB_REST.rx - capOff * 0.60;
      this.thumb.rotation.z = THUMB_REST.rz - up * 0.10 - capOff * 0.32;
      this.thumb.position.y = THUMB_REST.y - fire * 0.010;
    }
    if (this.thumbTip) this.thumbTip.rotation.x = THUMB_TIP_REST - capOff * 0.55;
    if (this.safetyCap) {
      // Flicked off the tail: thrown clear along the barrel's axis, spinning.
      this.safetyCap.position.z = 0.046 + capOff * 0.085;
      this.safetyCap.position.x = capOff * 0.030;
      this.safetyCap.rotation.set(capOff * 6.0, capOff * 3.4, 0);
      this.safetyCap.scale.setScalar(Math.max(0.03, 1 - capOff * 1.05));
      this.safetyCap.visible = capOff < 0.96;
    }
    for (let i = 0; i < this.fingers.length; i++) {
      this.fingers[i].rotation.x = 1.05 + up * 0.30 + slam * 0.16;
    }
    if (this.injectorPlunger) this.injectorPlunger.position.z = 0.042 - fire * 0.016;
    if (this.fluid) this.fluid.scale.z = Math.max(0.05, 1 - fire * 0.95);
  }

  /**
   * Phantom. Forearm rolls into view, the thumb lifts the switch guard and
   * throws the toggle (that frame is the cloak), the lamps sequence, the lens
   * iris opens and a refraction sheet washes out over the view.
   */
  private animBracer(p: number, c: Pose) {
    const up = ss(THREE.MathUtils.clamp(this.raise, 0, 1));
    let lift = 0, flip = 0, iris = 0, wash = 0;
    if (p >= 0) {
      lift = span(p, 0.10, 0.22);
      this.at(p, 0.20, 'latch');
      flip = span(p, 0.24, 0.34);
      this.at(p, 0.32, 'switch');
      iris = span(p, 0.32, 0.50);
      wash = bump(p, 0.34, 0.72);
      c.rz += flip * 0.10;
      c.z += wash * 0.010;
    }
    // Thumb lifts the guard, then throws the toggle forward under it.
    if (this.thumb) {
      this.thumb.rotation.x = THUMB_REST.rx - lift * 0.40 - flip * 0.36;
      this.thumb.rotation.y = -flip * 0.24;
      this.thumb.rotation.z = THUMB_REST.rz - up * 0.14;
      this.thumb.position.y = THUMB_REST.y + lift * 0.004;
    }
    if (this.thumbTip) this.thumbTip.rotation.x = THUMB_TIP_REST - lift * 0.50;
    if (this.guard) this.guard.rotation.x = -lift * 1.5;
    if (this.toggle) this.toggle.rotation.x = -0.5 + flip * 1.0;
    for (let i = 0; i < this.fingers.length; i++) this.fingers[i].rotation.x = 1.05 + up * 0.20;
    for (let i = 0; i < this.irisBlades.length; i++) {
      this.irisBlades[i].position.x = iris * 0.008;
      this.irisBlades[i].rotation.y = iris * 0.9;
    }
    for (let i = 0; i < this.statusMats.length; i++) {
      // Lamps light in sequence as the emitter charges.
      const litAt = 0.34 + i * 0.05;
      const lit = p >= 0 ? THREE.MathUtils.clamp((p - litAt) * 14, 0, 1) : 0;
      this.statusMats[i].opacity = 0.2 + lit * 0.75;
      this.statusLamps[i].scale.setScalar(0.8 + lit * 0.7);
    }
    if (this.shimmer && this.shimmerMat) {
      this.shimmer.visible = wash > 0.02;
      this.shimmerMat.opacity = wash * 0.42;
      const s = 0.3 + wash * 1.6;
      this.shimmer.scale.set(s, s, s * 0.7);
      this.shimmer.rotation.y += 0.06;
    }
  }

  /**
   * Ranger. The free hand drops to the hip unit, yanks the charge lever against
   * the piston, and the vent blows off — the mechanical reason the charge
   * happens. Plays alongside the dash rather than before it: a charge has to be
   * instant, so the beat is on frame one.
   */
  private animBrace(p: number, c: Pose) {
    let pull = 0, release = 0, blow = 0;
    if (p >= 0) {
      this.at(p, 0.0, 'slam');
      pull = span(p, 0.0, 0.22) * (1 - span(p, 0.30, 0.44));
      release = bump(p, 0.28, 0.50);
      blow = span(p, 0.28, 0.36) * (1 - span(p, 0.42, 0.80));
      c.y -= pull * 0.030;
      c.z += pull * 0.018;
      c.rx += pull * 0.22;
      c.y += release * 0.018;
    }
    if (this.chargeLever) {
      this.chargeLever.rotation.x = pull * 0.95;
      this.chargeLever.position.z = -0.024 + pull * 0.018;
    }
    // The whole hand clamps the lever, thumb folded across the knuckles.
    for (let i = 0; i < this.fingers.length; i++) this.fingers[i].rotation.x = 1.05 + pull * 0.55;
    if (this.thumb) {
      this.thumb.rotation.x = THUMB_REST.rx - pull * 0.55;
      this.thumb.rotation.z = THUMB_REST.rz - pull * 0.45;
    }
    if (this.ventMat && this.ventGlow) {
      this.ventMat.opacity = blow * (0.6 + Math.sin(this.t * 55) * 0.3);
      this.ventGlow.visible = blow > 0.02;
      this.ventGlow.scale.set(1 + blow * 0.7, 1, 1 + blow * 1.5);
    }
  }

  // ── WARMUP / DISPOSAL ─────────────────────────────────────────────────────

  /**
   * Force every material of the prop on-screen for the loader's shader compile
   * pass. A program links on first RENDER, so an ability prop that only ever
   * appears mid-fight would link its shaders during the fight — the exact
   * activation stutter the warmup exists to kill.
   */
  prewarm() {
    this.prewarming = true;
    this.group.visible = true;
    this.group.traverse((o) => { o.visible = true; });
    // Barely-there opacity: enough for the material to be a real draw, not
    // enough to be a bright rectangle if the loader's overlay ever lifts early.
    if (this.flameMat) this.flameMat.opacity = 0.02;
    if (this.pilotMat) this.pilotMat.opacity = 0.02;
    if (this.shimmerMat) this.shimmerMat.opacity = 0.02;
    if (this.ventMat) this.ventMat.opacity = 0.02;
    // Parked at the READY pose, i.e. squarely inside the frustum. Hiding it off
    // the bottom of the view would let frustum culling skip the draw and the
    // programs would link on the player's first cast instead — which is the
    // entire stutter this exists to prevent. The loader's full-screen overlay is
    // covering the canvas while this is up.
    const r = this.readyPose;
    this.group.position.set(r.x, r.y, r.z);
    this.group.rotation.set(r.rx, r.ry, r.rz);
  }

  endPrewarm() {
    this.prewarming = false;
    this.group.visible = false;
    for (const f of this.nozzleFlames) f.visible = false;
    if (this.pilotFlame) this.pilotFlame.visible = false;
    if (this.shimmer) this.shimmer.visible = false;
    if (this.ventGlow) this.ventGlow.visible = false;
    if (this.flameMat) this.flameMat.opacity = 0;
    if (this.pilotMat) this.pilotMat.opacity = 0;
    if (this.shimmerMat) this.shimmerMat.opacity = 0;
    if (this.ventMat) this.ventMat.opacity = 0;
  }

  dispose() {
    this.camera.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.geos.length = 0;
    this.mats.length = 0;
    this.onBeat = null;
  }
}
