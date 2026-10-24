/**
 * LocalPlayerShadow
 * =================
 * Spawns a full-body humanoid attached to the local camera that the
 * player never sees directly — but which CASTS a real shadow onto the
 * ground. This is what makes the shadow read as "a person holding a
 * gun" instead of a floating gun shadow.
 *
 * How the invisibility works
 *  - Every body material is patched to `colorWrite = false`,
 *    `depthWrite = false`. The main render pass renders these meshes
 *    but they contribute nothing to the colour or depth buffer, so they
 *    are effectively invisible.
 *  - Shadow casting in three.js uses `MeshDepthMaterial` (or a custom
 *    depth material) regardless of the main material's write flags,
 *    so the shadow map still receives every vertex.
 *
 * Used in BOTH solo and multiplayer, so even in single-player the player
 * sees a believable full-body shadow of their character.
 */
import * as THREE from 'three';
import {
  type ClassId, type Palette, type WeaponType,
  derivePalette, RIG,
  buildRanger, buildScout, buildHeavy, buildOperative,
  buildPyro, buildMedic, buildEngineer, buildPhantom,
  buildHeldWeapon,
} from './CharacterModels';
import { getHold, poseAvatarHold } from './AvatarRig';

const VALID_WEAPONS: WeaponType[] = ['pistol', 'rifle', 'shotgun', 'smg', 'sniper', 'minigun', 'launcher'];
function asWeaponType(name: string | undefined): WeaponType {
  return (VALID_WEAPONS.includes(name as WeaponType) ? name : 'pistol') as WeaponType;
}

const MODEL_NATIVE_HEIGHT = RIG.headTopY;          // 4.45
const PLAYER_EYE_HEIGHT = 5;                       // matches standingHeight in App.tsx
const MODEL_SCALE = PLAYER_EYE_HEIGHT / MODEL_NATIVE_HEIGHT;

interface Joints {
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  rightHip: THREE.Group;
  headJoint: THREE.Group;
  rightHand: THREE.Mesh;
}

export interface LocalPlayerShadowOptions {
  modelClass?: ClassId;
  color?: number;
  weapon?: string;
  shadows?: boolean;
}

export class LocalPlayerShadow {
  private scene: THREE.Scene;
  private root: THREE.Group;
  private body: THREE.Group;                          // scaled wrapper we rotate
  private joints!: Joints;
  private materials: THREE.Material[] = [];
  private weaponGroup: THREE.Group | null = null;
  private weaponMaterials: THREE.Material[] = [];
  private currentWeaponType: WeaponType = 'pistol';
  private modelClass: ClassId;
  private shadowsEnabled: boolean;

  // Animation state
  private walkPhase: number = 0;
  private bobPhase: number = 0;
  private smoothedSpeed: number = 0;
  private lastPosition = new THREE.Vector3();
  // Crouch — eased 0→1 so the shadow compresses into a believable kneel.
  private crouchAmount: number = 0;
  private crouchTarget: number = 0;
  private stanceTurn: number = 0;
  private aimPitch: number = 0;
  /** Dev preview: the body stands in front of the camera, visible. */
  private debugPreview: { dist: number; yaw: number } | null = null;

  // Lifecycle
  private isAlive: boolean = true;
  private deathT: number = 0;

  constructor(scene: THREE.Scene, opts: LocalPlayerShadowOptions = {}) {
    this.scene = scene;
    this.shadowsEnabled = opts.shadows !== false;
    this.modelClass = opts.modelClass ?? 'ranger';

    this.root = new THREE.Group();
    this.root.name = 'LocalPlayerShadow';
    this.root.userData.friendlyPlayer = true;
    scene.add(this.root);

    this.body = new THREE.Group();
    this.body.scale.setScalar(MODEL_SCALE);
    this.root.add(this.body);

    this.buildModel(opts.color ?? 0x6a9b3f);
    this.swapWeapon(asWeaponType(opts.weapon));
    this.applyInvisibilityToAll();
  }

  /** Dev only: show the (normally invisible) body in front of the camera. */
  setDebugPreview(on: boolean, dist = 9, yaw = 0): void {
    this.debugPreview = on ? { dist, yaw } : null;
    const apply = (m: THREE.Material) => {
      m.colorWrite = on;
      m.depthWrite = on;
      m.transparent = !on;
      m.needsUpdate = true;
    };
    this.materials.forEach(apply);
    this.weaponMaterials.forEach(apply);
  }

  /** Update what character class the shadow is built from. */
  setModelClass(modelClass: ClassId, color: number): void {
    if (modelClass === this.modelClass) return;
    this.modelClass = modelClass;
    // Tear down old body (swapWeapon frees the held weapon's GPU data first)
    const wt = this.currentWeaponType;
    this.swapWeapon(wt);
    this.weaponGroup?.removeFromParent();
    this.body.clear();
    this.materials.forEach((m) => m.dispose());
    this.materials = [];
    this.buildModel(color);
    // Re-attach the held weapon to the freshly-built body
    if (this.weaponGroup) this.body.add(this.weaponGroup);
    this.applyInvisibilityToAll();
  }

  /** Update what weapon is being held. Called whenever the player swaps. */
  setWeapon(weapon: string): void {
    const t = asWeaponType(weapon);
    if (t === this.currentWeaponType) return;
    this.swapWeapon(t);
    this.applyInvisibilityToAll();
  }

  /** Set crouch state — the shadow eases into a compact kneel. */
  setCrouch(crouching: boolean): void {
    this.crouchTarget = crouching ? 1 : 0;
  }

  /** Should be called when the local player dies (collapse pose). */
  setAlive(alive: boolean): void {
    if (alive && !this.isAlive) {
      this.isAlive = true;
      this.deathT = 0;
      this.body.rotation.x = 0;
      this.body.position.y = 0;
      this.body.visible = true;
    } else if (!alive && this.isAlive) {
      this.isAlive = false;
      this.deathT = 0;
    }
  }

  /**
   * Per-frame update. Drive the body to follow the camera, animate
   * walking from the camera's horizontal velocity, and hold the weapon on
   * the camera's aim with both hands (AvatarRig IK) so the shadow reads as
   * "a person aiming a gun". `eyeHeight` is the live camera height above the
   * feet (it drops while crouched) so the feet stay planted on the ground.
   */
  update(delta: number, camera: THREE.Camera, euler: THREE.Euler, eyeHeight = PLAYER_EYE_HEIGHT): void {
    if (delta <= 0) delta = 1 / 60;

    // Position: feet on the ground below the camera (the crouch lowers the
    // eye, not the feet — the old fixed 5u offset sank a crouching shadow
    // a full unit and a half into the ground).
    this.root.position.set(camera.position.x, camera.position.y - eyeHeight, camera.position.z);
    // Yaw: camera looks down -Z by convention; avatar faces same direction,
    // bladed by the weapon's stance turn (weapon + head counter-rotate).
    const turnTarget = this.isAlive ? getHold(this.currentWeaponType).turn : 0;
    this.stanceTurn += (turnTarget - this.stanceTurn) * Math.min(1, delta * 8);
    this.body.rotation.y = -euler.y + Math.PI - this.stanceTurn;
    if (this.debugPreview) {
      // Stand `dist` ahead of the eye, turned by `yaw` so the hold can be
      // inspected from any side (0 = facing the camera).
      const fx = -Math.sin(euler.y), fz = -Math.cos(euler.y);
      this.root.position.x += fx * this.debugPreview.dist;
      this.root.position.z += fz * this.debugPreview.dist;
      this.body.rotation.y += Math.PI + this.debugPreview.yaw;
    }

    // Derive horizontal speed for the walk animation
    const dx = camera.position.x - this.lastPosition.x;
    const dz = camera.position.z - this.lastPosition.z;
    const frameSpeed = Math.sqrt(dx * dx + dz * dz) / delta;
    this.smoothedSpeed += (frameSpeed - this.smoothedSpeed) * Math.min(1, delta * 6);
    this.lastPosition.copy(camera.position);

    // Ease the crouch blend (snappy in, smooth out).
    this.crouchAmount += (this.crouchTarget - this.crouchAmount) * Math.min(1, delta * 12);
    const crouch = this.crouchAmount;

    if (this.isAlive) {
      const moveGate = Math.min(1, this.smoothedSpeed / 7);
      const walkFreq = 4.0 + moveGate * 4.0;
      this.walkPhase += delta * walkFreq;
      this.bobPhase += delta * (1.5 + moveGate * 0.5);

      // Vertical compression — feet stay planted (scale origin is at the feet)
      // while the body sinks, reading as a crouch in the cast shadow.
      this.body.scale.set(MODEL_SCALE, MODEL_SCALE * (1 - 0.2 * crouch), MODEL_SCALE);

      // Legs stride — shorter when crouched, plus a forward knee-fold offset.
      const legSwing = (0.06 + moveGate * 0.85) * (1 - 0.5 * crouch);
      const hipFold = crouch * 0.55;
      this.joints.leftHip.rotation.x = Math.sin(this.walkPhase) * legSwing + hipFold;
      this.joints.rightHip.rotation.x = Math.sin(this.walkPhase + Math.PI) * legSwing + hipFold;

      // Weapon on the aim, both hands solved onto it (elbows bend), head
      // down the sights. Pitch is lightly smoothed so mouse jitter doesn't
      // shiver the shadow.
      this.aimPitch += (euler.x - this.aimPitch) * Math.min(1, delta * 20);
      poseAvatarHold(this.joints, this.weaponGroup, this.currentWeaponType, this.aimPitch, moveGate, this.walkPhase, crouch);
      this.joints.headJoint.rotation.x += Math.sin(this.walkPhase * 2) * 0.02 * moveGate;

      // Body bob with footfalls (and idle breath)
      const bobAmp = (0.03 + moveGate * 0.12) * (1 - 0.4 * crouch);
      const breath = Math.sin(this.bobPhase * 2) * 0.012;
      this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * bobAmp + breath;
    } else {
      this.deathT = Math.min(1.4, this.deathT + delta / 0.65);
      const t = Math.min(1, this.deathT);
      this.body.rotation.x = -t * (Math.PI / 2 - 0.05);
      this.body.position.y = -t * 1.4;
      if (this.deathT > 1.2) this.body.visible = false;
    }
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.materials.forEach((m) => m.dispose());
    this.weaponMaterials.forEach((m) => m.dispose());
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
    this.materials = [];
    this.weaponMaterials = [];
  }

  // ── INTERNAL ─────────────────────────────────────────────────────────────

  private buildModel(playerColor: number): void {
    const palette: Palette = derivePalette(playerColor, this.modelClass);
    const mats: THREE.Material[] = [];
    let modelRoot: THREE.Group;
    switch (this.modelClass) {
      case 'ranger':    modelRoot = buildRanger(palette, mats); break;
      case 'scout':     modelRoot = buildScout(palette, mats); break;
      case 'heavy':     modelRoot = buildHeavy(palette, mats); break;
      case 'operative': modelRoot = buildOperative(palette, mats); break;
      case 'pyro':      modelRoot = buildPyro(palette, mats); break;
      case 'medic':     modelRoot = buildMedic(palette, mats); break;
      case 'engineer':  modelRoot = buildEngineer(palette, mats); break;
      case 'phantom':   modelRoot = buildPhantom(palette, mats); break;
    }
    this.body.add(modelRoot);
    this.joints = modelRoot.userData.joints as Joints;

    // Gather every material from the model + the joints stash
    mats.forEach((m) => this.materials.push(m));
    const rootMats = (modelRoot.userData.joints as { materials?: THREE.Material[] }).materials;
    if (Array.isArray(rootMats)) rootMats.forEach((m) => this.materials.push(m));

    // Tag + cast shadow on every mesh in the body
    modelRoot.traverse((obj) => {
      obj.userData.friendlyPlayer = true;
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = this.shadowsEnabled;
        obj.receiveShadow = false;
      }
    });
  }

  private swapWeapon(type: WeaponType): void {
    if (this.weaponGroup) {
      this.weaponGroup.removeFromParent();
      this.weaponGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
      this.weaponMaterials.forEach((m) => m.dispose());
      this.weaponMaterials = [];
      this.weaponGroup = null;
    }

    this.currentWeaponType = type;
    const matSink: THREE.Material[] = [];
    const weapon = buildHeldWeapon(type, matSink);
    weapon.traverse((obj) => {
      obj.userData.friendlyPlayer = true;
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = this.shadowsEnabled;
        obj.receiveShadow = false;
      }
    });
    // Body space — AvatarRig places it on the aim and the hands follow.
    this.body.add(weapon);
    this.weaponGroup = weapon;
    this.weaponMaterials = matSink;
  }

  /**
   * Patch every material on the body + weapon to be invisible to the main
   * camera while still casting shadows. Three.js's shadow pass uses its
   * own MeshDepthMaterial — turning off colorWrite/depthWrite on the
   * main material doesn't affect shadow casting.
   */
  private applyInvisibilityToAll(): void {
    const apply = (m: THREE.Material) => {
      m.colorWrite = false;
      m.depthWrite = false;
      // Keep depthTest so faces don't fight; we just don't write the depth.
      m.depthTest = true;
      m.transparent = true;
      m.needsUpdate = true;
    };
    this.materials.forEach(apply);
    this.weaponMaterials.forEach(apply);
  }
}
