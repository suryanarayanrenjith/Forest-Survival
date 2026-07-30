/**
 * RemotePlayerManager
 * ====================
 * Renders the avatars for every remote player in the multiplayer match.
 *
 * Responsibilities
 *  - Build & display 8 visually-distinct chamfered-block player models
 *    (Ranger, Scout, Heavy, Operative, Pyro, Medic, Engineer, Phantom).
 *  - Assign each remote player a unique class deterministically so all
 *    clients see the same model for the same player.
 *  - Smoothly interpolate position / rotation from the throttled network
 *    snapshots so movement feels fluid even at ~15Hz updates.
 *  - Drive a two-handed "weapon ready" pose with subtle arm sway and
 *    full leg stride that scales with the derived velocity.
 *  - Render a billboarded nameplate + health bar above each player —
 *    hidden the moment that player dies.
 *  - Collapse the body forward on death and hide it after the fade.
 *  - Tag every mesh with `userData.friendlyPlayer = true` so any
 *    raycast / collision check anywhere in the game can opt them out
 *    of friendly-fire / collision.
 *
 * Friendly fire is also structurally impossible because the projectile
 * system only checks against the enemy spatial grid — remote-player
 * meshes are never added there. The tag is belt-and-suspenders.
 */
import * as THREE from 'three';
import type { PlayerData } from './MultiplayerManager';
import { SnapshotInterpolator, type TransformSample } from './SnapshotInterpolator';
import {
  CLASS_IDS, type ClassId, type Palette,
  derivePalette, RIG,
  buildRanger, buildScout, buildHeavy, buildOperative,
  buildPyro, buildMedic, buildEngineer, buildPhantom,
  buildHeldWeapon, getWeaponPose, type WeaponType,
} from './CharacterModels';
import { PlayerWounds, woundSeverityForHealth } from './PlayerWounds';

const VALID_WEAPONS: WeaponType[] = ['pistol', 'rifle', 'shotgun', 'smg', 'sniper', 'minigun', 'launcher'];
function asWeaponType(name: string | undefined): WeaponType {
  return (VALID_WEAPONS.includes(name as WeaponType) ? name : 'pistol') as WeaponType;
}

// Camera/eye height in App.tsx is 5 units above feet. The chamfered
// humanoid is 4.45 units tall; we scale it up so head top lands right
// at camera height, then position the root so feet sit on the ground.
const MODEL_NATIVE_HEIGHT = RIG.headTopY;          // 4.45
const PLAYER_EYE_HEIGHT = 5;                       // matches standingHeight in App.tsx
const MODEL_SCALE = PLAYER_EYE_HEIGHT / MODEL_NATIVE_HEIGHT;
// Name tag sits on top, the health bar tucked directly beneath it so the two
// read as a single floating "player card" rather than two stray sprites.
const NAMEPLATE_Y = PLAYER_EYE_HEIGHT + 1.12;      // world units above feet
const HEALTHBAR_Y = PLAYER_EYE_HEIGHT + 0.60;

// Snapshot-interpolation render delay. We render every remote avatar a short
// time `in the past` so there are always two buffered network samples to
// interpolate between — this is what turns the throttled ~20Hz position stream
// into perfectly smooth, constant-speed movement instead of the old
// "ease-to-latest then freeze" stutter.
//
// The delay is now ADAPTIVE per peer (see `update()`): it grows with the
// measured network jitter so a noisy mobile/relayed link never starves the
// buffer (which used to cause the extrapolation overshoot + snap-back that
// read as "players teleporting around"), and shrinks back toward the floor on
// a clean link so movement stays responsive. These bound that adaptation.
const SEND_INTERVAL_MS = 50;          // matches POSITION_UPDATE_INTERVAL on the sender
const MIN_RENDER_DELAY_MS = 60;       // floor — just over one send interval
const MAX_RENDER_DELAY_MS = 280;      // ceiling for very jittery links
const DEFAULT_RENDER_DELAY_MS = 100;  // used for legacy peers that send no timestamp
// How fast the per-peer clock-offset estimate is allowed to drift upward (ms
// per accepted packet) to track real wall-clock drift between machines.
const CLOCK_DRIFT_UP_MS = 0.5;
// A silence longer than this means the stream paused (tab backgrounded, big lag
// spike, teleport) — we resync the clock + clear stale history rather than
// interpolate across the gap.
const STREAM_GAP_RESET_MS = 1500;
// If a snapshot lands this far (world units) from where we're currently
// rendering the avatar, it's a teleport/respawn, not movement — hard-snap
// instead of interpolating (which would slide the avatar across the map).
const TELEPORT_DIST_SQ = 12 * 12;

// Re-used vectors / sample slot so the update loop is allocation-free.
const _tmpVec3 = new THREE.Vector3();
const _tmpEuler = new THREE.Euler();
const _interp: TransformSample = { x: 0, y: 0, z: 0, yaw: 0 };

interface RemotePlayerRecord {
  id: string;
  data: PlayerData;
  group: THREE.Group;                                  // outermost container (position lives here)
  body: THREE.Group;                                   // scaled wrapper we rotate for yaw
  joints: Joints;
  nameplate: THREE.Sprite;
  healthBar: THREE.Sprite;
  modelClass: ClassId;
  // Held weapon — rebuilt whenever the player swaps weapons in-game.
  weaponGroup: THREE.Group | null;
  weaponMaterials: THREE.Material[];
  currentWeaponType: WeaponType;
  // Interpolation — a timestamped snapshot buffer (position + yaw) we play
  // back with an adaptive render delay for smooth, jitter-free movement.
  posBuf: SnapshotInterpolator;
  currentYaw: number;
  // ── Network de-jitter (per-peer clock reconstruction) ──
  // We map each remote player's send-time onto OUR clock via a slowly-adapting
  // offset, so the buffered snapshot spacing reflects the *sender's* steady
  // send cadence instead of our noisy receive times. This is the core fix for
  // warped/erratic remote motion.
  clockOffset: number;   // localTime ≈ senderSendTime + clockOffset
  clockReady: boolean;   // offset seeded from a timestamped packet yet?
  netJitter: number;     // decaying peak-hold of timing jitter (ms)
  renderDelay: number;   // current interpolation delay (ms), adapts to jitter
  lastSeq: number;       // highest accepted sequence — drop anything ≤ this
  lastPacketAt: number;  // local time of the last accepted packet (gap detect)
  // Velocity derived from successive position updates (drives walk anim)
  smoothedSpeed: number;
  walkPhase: number;
  bobPhase: number;
  // Crouch blend (eased toward data.crouch) + smoothed aim pitch (from the
  // sender's camera pitch) so the avatar visibly kneels and points its weapon
  // where the player is actually looking.
  crouchAmount: number;
  aimPitch: number;
  // Health bar canvas + texture
  healthCanvas: HTMLCanvasElement;
  healthCtx: CanvasRenderingContext2D;
  healthTexture: THREE.CanvasTexture;
  lastRenderedHealth: number;
  // Nameplate cache
  lastNameplateName: string;
  // Whether the last-drawn nameplate included the mobile (phone) glyph, so we
  // only redraw the canvas when the device flag actually changes.
  lastNameplateMobile: boolean;
  // Lifecycle
  isAlive: boolean;
  deathT: number;
  materials: THREE.Material[];
  // Realistic human wounds that bleed through as this player nears death and
  // seal up when they're healed. Driven by data.health each frame.
  wounds: PlayerWounds;
}

interface Joints {
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftHip: THREE.Group;
  rightHip: THREE.Group;
  headJoint: THREE.Group;
  rightHand: THREE.Mesh;
}

/** Stable 32-bit FNV-1a hash. Used for deterministic class assignment. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class RemotePlayerManager {
  private scene: THREE.Scene;
  private root: THREE.Group;
  private players: Map<string, RemotePlayerRecord> = new Map();
  private shadowsEnabled: boolean;
  private isNight: boolean = false;

  // Tracks model assignments so each connected player gets a unique
  // class deterministically (linear-probed by FNV hash on the sorted
  // ID list — every client converges on the same mapping).
  private classAssignments: Map<string, ClassId> = new Map();

  constructor(scene: THREE.Scene, opts: { shadows?: boolean } = {}) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'RemotePlayers';
    this.root.userData.friendlyPlayer = true;
    this.scene.add(this.root);
    this.shadowsEnabled = opts.shadows !== false;
  }

  setNightMode(isNight: boolean) {
    this.isNight = isNight;
  }

  /**
   * Decide which class an incoming player should use. Priority order:
   *   1. The player's explicit lobby pick (`data.modelClass`).
   *   2. A locked-in previous assignment for this id.
   *   3. Deterministic FNV-hash + linear-probe over the sorted ID set
   *      (every client converges on the same mapping).
   */
  private assignClass(playerId: string, otherIds: string[], explicit?: ClassId): ClassId {
    if (explicit && CLASS_IDS.includes(explicit)) {
      this.classAssignments.set(playerId, explicit);
      return explicit;
    }
    const existing = this.classAssignments.get(playerId);
    if (existing) return existing;

    const used = new Set<ClassId>();
    otherIds.forEach((id) => {
      const cls = this.classAssignments.get(id);
      if (cls) used.add(cls);
    });

    const start = fnv1a(playerId) % CLASS_IDS.length;
    for (let attempt = 0; attempt < CLASS_IDS.length; attempt++) {
      const candidate = CLASS_IDS[(start + attempt) % CLASS_IDS.length];
      if (!used.has(candidate)) {
        this.classAssignments.set(playerId, candidate);
        return candidate;
      }
    }
    // All 8 slots used (>8 players — beyond lobby cap) → fall back
    const fallback = CLASS_IDS[start];
    this.classAssignments.set(playerId, fallback);
    return fallback;
  }

  /** Add (or refresh, if already present) a remote player. */
  addOrUpdatePlayer(data: PlayerData, allKnownIds: string[]): void {
    const existing = this.players.get(data.id);
    if (existing) {
      // If the player picked a different class in the lobby, rebuild the
      // model in-place so the change reflects immediately.
      const wanted = (data.modelClass && CLASS_IDS.includes(data.modelClass as ClassId))
        ? (data.modelClass as ClassId)
        : existing.modelClass;
      if (wanted !== existing.modelClass) {
        this.removePlayer(data.id);
      } else {
        this.updatePlayer(data);
        return;
      }
    }

    const explicit = data.modelClass && CLASS_IDS.includes(data.modelClass as ClassId)
      ? (data.modelClass as ClassId)
      : undefined;
    const modelClass = this.assignClass(data.id, allKnownIds.filter((id) => id !== data.id), explicit);
    const record = this.buildPlayer(data, modelClass);
    this.players.set(data.id, record);
    this.root.add(record.group);

    // Seed interpolation to the spawn position so the avatar doesn't
    // streak across the map on first appearance. Route the seed through the
    // timeline mapper so the per-peer clock offset is primed from packet #1.
    const feetY = data.position.y - PLAYER_EYE_HEIGHT;
    record.group.position.set(data.position.x, feetY, data.position.z);
    record.currentYaw = -data.rotation.y + Math.PI;
    record.body.rotation.y = record.currentYaw;
    const seedTime = this.mapToLocalTimeline(record, data);
    record.posBuf.push(seedTime, data.position.x, feetY, data.position.z, record.currentYaw);
  }

  /** Apply a freshly-received network snapshot to an already-present player. */
  updatePlayer(data: PlayerData): void {
    const rec = this.players.get(data.id);
    if (!rec) return;

    // ── Drop stale / reordered position packets ──
    // PeerJS datachannels (and the host's star-topology relay hop) can deliver
    // packets out of order; applying an older one snaps the avatar backward and
    // corrupts the clock estimate. Sequence numbers make ordering authoritative.
    if (typeof data.seq === 'number') {
      if (data.seq <= rec.lastSeq) return;
      rec.lastSeq = data.seq;
    }

    rec.data = data;
    // Camera yaw is the player's facing — avatar yaw is the same direction,
    // but the camera/model use opposite sign conventions for "forward".
    _tmpEuler.set(data.rotation.x, data.rotation.y, data.rotation.z, 'YXZ');
    const avatarYaw = -_tmpEuler.y + Math.PI;
    const feetY = data.position.y - PLAYER_EYE_HEIGHT;

    // ── Teleport / respawn hard-snap ──
    // If the snapshot lands implausibly far from where we're rendering, the
    // stale buffer samples would make the avatar visibly *slide* there (the
    // classic "respawn fly-in"). Clear the timeline and snap instead.
    const dxT = data.position.x - rec.group.position.x;
    const dzT = data.position.z - rec.group.position.z;
    if (dxT * dxT + dzT * dzT > TELEPORT_DIST_SQ) {
      rec.posBuf.reset();
      rec.group.position.set(data.position.x, feetY, data.position.z);
      rec.currentYaw = avatarYaw;
      rec.body.rotation.y = avatarYaw;
    }

    // Map the sender's send-time onto our local clock and buffer the snapshot
    // there. The render loop plays it back rec.renderDelay later, interpolating
    // between samples — so movement stays smooth and constant-speed regardless
    // of when the packet physically arrived (jitter / relay delay absorbed).
    const bufferTime = this.mapToLocalTimeline(rec, data);
    rec.posBuf.push(
      bufferTime,
      data.position.x,
      feetY,    // remote camera y → world feet y
      data.position.z,
      avatarYaw,
    );

    // Weapon swap — rebuild the held mesh + reapply the pose so all 8
    // models hold every weapon correctly.
    const wantedWeapon = asWeaponType(data.currentWeapon);
    if (wantedWeapon !== rec.currentWeaponType) {
      this.swapWeapon(rec, wantedWeapon);
    }

    // Death state transitions
    if (rec.isAlive && !data.isAlive) {
      rec.isAlive = false;
      rec.deathT = 0;
    } else if (!rec.isAlive && data.isAlive) {
      // Respawn — reset the death pose
      rec.isAlive = true;
      rec.deathT = 0;
      rec.body.rotation.x = 0;
      rec.body.position.y = 0;
      rec.body.visible = true;
      rec.nameplate.visible = true;
      rec.healthBar.visible = true;
    }

    if (rec.isAlive) {
      this.refreshNameplateIfNeeded(rec);
      this.refreshHealthBarIfNeeded(rec);
    }
  }

  /**
   * Replace the player's held weapon mesh + adjust the arm pose to match.
   * Disposes the old weapon's geometry/materials so weapon swaps don't leak.
   */
  private swapWeapon(rec: RemotePlayerRecord, type: WeaponType): void {
    // Tear down the old weapon mesh + free its GPU resources.
    if (rec.weaponGroup) {
      rec.weaponGroup.removeFromParent();
      rec.weaponGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
      rec.weaponMaterials.forEach((m) => m.dispose());
      rec.weaponMaterials = [];
      rec.weaponGroup = null;
    }

    rec.currentWeaponType = type;
    const matSink: THREE.Material[] = [];
    const weapon = buildHeldWeapon(type, matSink);
    const pose = getWeaponPose(type);
    weapon.position.set(...pose.weaponPos);
    weapon.rotation.set(...pose.weaponRot);
    // Tag for friendly-fire safety and apply shadow flag.
    weapon.traverse((obj) => {
      obj.userData.friendlyPlayer = true;
      obj.userData.playerId = rec.id;
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = this.shadowsEnabled;
        obj.receiveShadow = false;
      }
    });
    rec.joints.rightHand.add(weapon);
    rec.weaponGroup = weapon;
    rec.weaponMaterials = matSink;
  }

  /** Sync the visible set against the authoritative player map. */
  syncFromPlayerMap(allPlayers: Map<string, PlayerData>, localPlayerId: string): void {
    const allIds = Array.from(allPlayers.keys());
    allPlayers.forEach((p, id) => {
      if (id === localPlayerId) return;
      this.addOrUpdatePlayer(p, allIds);
    });
    const presentIds = new Set(allIds);
    this.players.forEach((_rec, id) => {
      if (id === localPlayerId) return;
      if (!presentIds.has(id)) this.removePlayer(id);
    });
  }

  removePlayer(playerId: string): void {
    const rec = this.players.get(playerId);
    if (!rec) return;
    this.root.remove(rec.group);
    this.disposeRecord(rec);
    this.players.delete(playerId);
    this.classAssignments.delete(playerId);
  }

  /** Per-frame update — interpolation, animation, nameplate billboarding. */
  update(delta: number, camera: THREE.Camera): void {
    if (delta <= 0) delta = 1 / 60;
    const now = performance.now();

    this.players.forEach((rec) => {
      // ── 0. Adapt this peer's interpolation delay to its link jitter ────
      // Grow fast (stay ahead of starvation when the link gets noisy), shrink
      // slow (reclaim latency gently once it settles) — the classic adaptive
      // jitter-buffer behaviour. Legacy peers (no timestamps) hold the default.
      const target = rec.clockReady
        ? THREE.MathUtils.clamp(
            SEND_INTERVAL_MS + 12 + rec.netJitter * 1.6,
            MIN_RENDER_DELAY_MS,
            MAX_RENDER_DELAY_MS,
          )
        : DEFAULT_RENDER_DELAY_MS;
      rec.renderDelay += (target - rec.renderDelay) * (target > rec.renderDelay ? 0.2 : 0.01);
      const renderTime = now - rec.renderDelay;

      // ── 1. Position + yaw from the snapshot buffer ─────────────────────
      const prevX = rec.group.position.x;
      const prevZ = rec.group.position.z;
      if (rec.posBuf.sample(renderTime, _interp)) {
        rec.group.position.set(_interp.x, _interp.y, _interp.z);
        rec.currentYaw = _interp.yaw;       // already shortest-arc interpolated
        rec.body.rotation.y = rec.currentYaw;
      }

      // Derived horizontal speed → drives stride length
      const dx = rec.group.position.x - prevX;
      const dz = rec.group.position.z - prevZ;
      const frameSpeed = Math.sqrt(dx * dx + dz * dz) / delta;
      rec.smoothedSpeed += (frameSpeed - rec.smoothedSpeed) * Math.min(1, delta * 6);

      // ── 2. Walk / idle animation ───────────────────────────────────────
      if (rec.isAlive) {
        const moveGate = Math.min(1, rec.smoothedSpeed / 7); // 7 u/s ≈ run
        const walkFreq = 4.0 + moveGate * 4.0;
        rec.walkPhase += delta * walkFreq;
        rec.bobPhase += delta * (1.5 + moveGate * 0.5);

        // Crouch blend (snappy in, smooth out) + smoothed aim pitch from the
        // sender's camera pitch, so the avatar kneels and tracks its aim.
        rec.crouchAmount += ((rec.data.crouch ? 1 : 0) - rec.crouchAmount) * Math.min(1, delta * 12);
        const crouch = rec.crouchAmount;
        const targetPitch = THREE.MathUtils.clamp(rec.data.rotation?.x ?? 0, -0.7, 0.7);
        rec.aimPitch += (targetPitch - rec.aimPitch) * Math.min(1, delta * 12);
        const pitch = rec.aimPitch;

        // Vertical compression for the crouch (feet stay planted; the scale
        // origin sits at the feet). x/z keep the native model scale.
        rec.body.scale.set(MODEL_SCALE, MODEL_SCALE * (1 - 0.2 * crouch), MODEL_SCALE);

        // Legs stride — full range when running, slight idle sway when still,
        // compressed + knee-folded when crouched.
        const legSwing = (0.06 + moveGate * 0.85) * (1 - 0.5 * crouch);
        const hipFold = crouch * 0.55;
        rec.joints.leftHip.rotation.x = Math.sin(rec.walkPhase) * legSwing + hipFold;
        rec.joints.rightHip.rotation.x = Math.sin(rec.walkPhase + Math.PI) * legSwing + hipFold;

        // Arms are held in a per-weapon "ready" pose. The right shoulder
        // is the dominant grip; the left reaches forward to the foregrip
        // for two-handed weapons or hangs at the side for the pistol.
        // Sway is intentionally muted so the muzzle stays on-target, and the
        // aim pitch tilts both arms so the weapon points where they look.
        const pose = getWeaponPose(rec.currentWeaponType);
        const armSway = 0.06 + moveGate * 0.14;
        const armPitch = pitch * 0.6 + crouch * 0.12;
        rec.joints.rightShoulder.rotation.x = pose.rightShoulderX + armPitch + Math.sin(rec.walkPhase + Math.PI) * armSway;
        rec.joints.rightShoulder.rotation.z = pose.rightShoulderZ;
        if (pose.twoHanded) {
          rec.joints.leftShoulder.rotation.x = pose.leftShoulderX + armPitch + Math.sin(rec.walkPhase) * armSway;
          rec.joints.leftShoulder.rotation.z = pose.leftShoulderZ;
        } else {
          // Pistol: left arm hangs and only sways naturally with the stride.
          rec.joints.leftShoulder.rotation.x = pose.leftShoulderX + Math.sin(rec.walkPhase) * (armSway + 0.25);
          rec.joints.leftShoulder.rotation.z = pose.leftShoulderZ;
        }

        // Head bob with footfalls (and idle breath when still)
        const bobAmp = (0.03 + moveGate * 0.12) * (1 - 0.4 * crouch);
        const breath = Math.sin(rec.bobPhase * 2) * 0.012;
        rec.body.position.y = Math.abs(Math.sin(rec.walkPhase)) * bobAmp + breath;

        // Head tracks aim pitch + a subtle counter-rotated bob and crouch hunch.
        rec.joints.headJoint.rotation.x = pitch + crouch * 0.22 + Math.sin(rec.walkPhase * 2) * 0.025 * moveGate;

        // ── Human wounds ── bleed through as this player nears death; seal back
        // up the instant they're healed (Medic triage / pickup / crate). Driven
        // by the synced health, so every client sees it in real time.
        const hpFrac = rec.data.health / Math.max(1, rec.data.maxHealth);
        rec.wounds.update(woundSeverityForHealth(hpFrac), delta);
      } else {
        // ── 3. Death pose — fall forward, then hide nameplate/healthbar ─
        rec.deathT = Math.min(1.4, rec.deathT + delta / 0.65);
        const t = Math.min(1, rec.deathT);
        // Fall forward with a slight roll
        rec.body.rotation.x = -t * (Math.PI / 2 - 0.05);
        rec.body.position.y = -t * 1.4;

        // Hide nameplate + health bar AS SOON AS the player dies (fade
        // over the first 250ms so it's quick but not jarring).
        const uiFade = THREE.MathUtils.clamp(1 - rec.deathT * 4, 0, 1);
        const npMat = rec.nameplate.material as THREE.SpriteMaterial;
        const hbMat = rec.healthBar.material as THREE.SpriteMaterial;
        npMat.opacity = uiFade;
        hbMat.opacity = uiFade;
        rec.nameplate.visible = uiFade > 0.01;
        rec.healthBar.visible = uiFade > 0.01;
        // Body fades out shortly after fully collapsing
        if (rec.deathT > 1.2) rec.body.visible = false;
      }

      // ── 4. Nameplate / health bar billboarding ─────────────────────────
      if (rec.isAlive) {
        _tmpVec3.copy(rec.group.position);
        const distSq = camera.position.distanceToSquared(_tmpVec3);
        // Strong inside 4 m, full from 8 m, full fade beyond 90 m
        const near = THREE.MathUtils.smoothstep(distSq, 16, 64);
        const far = 1 - THREE.MathUtils.smoothstep(distSq, 70 * 70, 90 * 90);
        const alpha = Math.max(0, Math.min(1, near * far));
        (rec.nameplate.material as THREE.SpriteMaterial).opacity = alpha;
        (rec.healthBar.material as THREE.SpriteMaterial).opacity = alpha * 0.95;

        // Night-mode brighter nameplate so teammates remain readable
        // when the map turns dark.
        const nightBoost = this.isNight ? 1.08 : 1.0;
        rec.nameplate.material.color.setScalar(nightBoost);
      }
    });
  }

  /**
   * Live blips for the tactical minimap — the smoothly-interpolated world
   * position (not the raw network snapshot) of every remote ally, plus their
   * player colour and alive flag. Cheap to call every frame.
   */
  getMinimapBlips(): { x: number; z: number; color: number; alive: boolean; name: string }[] {
    const out: { x: number; z: number; color: number; alive: boolean; name: string }[] = [];
    this.players.forEach((rec) => {
      out.push({
        x: rec.group.position.x,
        z: rec.group.position.z,
        color: rec.data.color,
        alive: rec.isAlive,
        name: rec.data.name,
      });
    });
    return out;
  }

  dispose(): void {
    this.players.forEach((rec) => this.disposeRecord(rec));
    this.players.clear();
    this.classAssignments.clear();
    this.scene.remove(this.root);
    this.root.clear();
  }

  // ─── INTERNAL ─────────────────────────────────────────────────────────────

  /**
   * Convert a remote player's send-time (`data.t`) into a timestamp on OUR
   * clock for the snapshot buffer, maintaining a per-peer clock-offset estimate.
   *
   * The offset tracks the *floor* of (receiveTime − sendTime) — i.e. the
   * lowest-latency, least-queued packets — so the reconstructed snapshot spacing
   * matches the sender's steady send cadence rather than our noisy arrival
   * times. It snaps toward a faster path quickly (network improved) and drifts
   * upward slowly (real clock drift), and records the timing jitter so the
   * render delay can size its buffer to the link quality.
   *
   * Falls back to receive-time stamping for legacy peers that send no `t`.
   */
  private mapToLocalTimeline(rec: RemotePlayerRecord, data: PlayerData): number {
    const nowLocal = performance.now();

    // Stream resumed after a long silence (backgrounded tab, lag spike,
    // teleport) → resync rather than interpolate across the gap.
    if (nowLocal - rec.lastPacketAt > STREAM_GAP_RESET_MS) {
      rec.clockReady = false;
      rec.netJitter = 0;
      rec.posBuf.reset();
    }
    rec.lastPacketAt = nowLocal;

    if (typeof data.t !== 'number') {
      // Legacy peer — no send-time. Stamp on arrival and ease the delay back
      // toward the safe default (handled in update()).
      return nowLocal;
    }

    const offsetSample = nowLocal - data.t;
    if (!rec.clockReady) {
      rec.clockOffset = offsetSample;
      rec.clockReady = true;
    } else if (offsetSample < rec.clockOffset) {
      // Faster path than our current floor → move toward it promptly (but not
      // instantly, so a single freak-fast packet can't yank the whole timeline).
      rec.clockOffset += (offsetSample - rec.clockOffset) * 0.5;
    } else {
      // Slow upward follow for genuine clock drift, never above this packet's
      // own offset (keeps clockOffset a true floor → bufferTime ≤ now).
      rec.clockOffset = Math.min(rec.clockOffset + CLOCK_DRIFT_UP_MS, offsetSample);
    }

    // Jitter = how far above the floor this packet landed. Peak-hold with slow
    // decay so the render buffer is sized to the recent worst case, not the
    // average (a single late packet is what causes a visible hitch).
    const dev = offsetSample - rec.clockOffset;
    rec.netJitter = Math.max(dev, rec.netJitter * 0.97);

    return data.t + rec.clockOffset;
  }

  private disposeRecord(rec: RemotePlayerRecord): void {
    // Detach wounds FIRST so the group traverse below doesn't dispose the SHARED
    // wound geometries (they're freed once, at scene teardown, not per player).
    rec.wounds.dispose();
    rec.healthTexture.dispose();
    const npMat = rec.nameplate.material as THREE.SpriteMaterial;
    npMat.map?.dispose();
    npMat.dispose();
    (rec.healthBar.material as THREE.SpriteMaterial).dispose();
    rec.materials.forEach((m) => m.dispose());
    rec.weaponMaterials.forEach((m) => m.dispose());
    rec.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
  }

  private refreshNameplateIfNeeded(rec: RemotePlayerRecord): void {
    const isMobile = !!rec.data.isMobile;
    if (rec.data.name === rec.lastNameplateName && isMobile === rec.lastNameplateMobile) return;
    rec.lastNameplateName = rec.data.name;
    rec.lastNameplateMobile = isMobile;
    const sprite = this.makeNameplateSprite(rec.data.name, rec.data.color, isMobile);
    const oldMat = rec.nameplate.material as THREE.SpriteMaterial;
    rec.nameplate.material = sprite.material;
    rec.nameplate.scale.copy(sprite.scale);
    oldMat.map?.dispose();
    oldMat.dispose();
  }

  private refreshHealthBarIfNeeded(rec: RemotePlayerRecord): void {
    const pct = Math.max(0, Math.min(1, rec.data.health / Math.max(1, rec.data.maxHealth)));
    const quantised = Math.round(pct * 40); // 2.5% buckets — avoid redraw spam
    if (quantised === rec.lastRenderedHealth) return;
    rec.lastRenderedHealth = quantised;

    const ctx = rec.healthCtx;
    const w = rec.healthCanvas.width;
    const h = rec.healthCanvas.height;
    const pad = 3;
    const radius = (h - pad * 2) / 2; // full pill rounding
    ctx.clearRect(0, 0, w, h);

    // ── Track (rounded translucent pill backdrop) ──
    this.roundRect(ctx, 1, 1, w - 2, h - 2, radius + 2);
    ctx.fillStyle = 'rgba(6,9,14,0.78)';
    ctx.fill();

    // ── Fill (color-coded by health, vertical gradient for a glossy read) ──
    let r = 46, g = 214, b = 120;            // healthy → emerald
    if (pct < 0.55) { r = 250; g = 186; b = 60; }   // hurt → amber
    if (pct < 0.28) { r = 244; g = 78; b = 78; }     // critical → red
    const innerW = (w - pad * 2) * pct;
    if (innerW > 1) {
      const grd = ctx.createLinearGradient(0, pad, 0, h - pad);
      grd.addColorStop(0, `rgba(${Math.min(255, r + 45)},${Math.min(255, g + 45)},${Math.min(255, b + 45)},1)`);
      grd.addColorStop(0.5, `rgba(${r},${g},${b},1)`);
      grd.addColorStop(1, `rgba(${Math.max(0, r - 35)},${Math.max(0, g - 35)},${Math.max(0, b - 35)},1)`);
      this.roundRect(ctx, pad, pad, Math.max(radius * 2, innerW), h - pad * 2, radius);
      ctx.fillStyle = grd;
      ctx.fill();
      // Top sheen
      ctx.beginPath();
      this.roundRect(ctx, pad, pad, Math.max(radius * 2, innerW), (h - pad * 2) * 0.45, radius);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
    }

    // ── Border ──
    this.roundRect(ctx, 1, 1, w - 2, h - 2, radius + 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    rec.healthTexture.needsUpdate = true;
  }

  // ─── MODEL BUILDER ───────────────────────────────────────────────────────

  private buildPlayer(data: PlayerData, modelClass: ClassId): RemotePlayerRecord {
    const group = new THREE.Group();
    group.name = `RemotePlayer:${data.id}`;
    group.userData.friendlyPlayer = true;
    group.userData.playerId = data.id;

    // The body wrapper carries the yaw rotation + uniform scale so the
    // chamfered humanoid (~4.45u tall) reaches the 5u camera eye height.
    const bodyWrap = new THREE.Group();
    bodyWrap.name = 'PlayerBody';
    bodyWrap.scale.setScalar(MODEL_SCALE);
    bodyWrap.userData.friendlyPlayer = true;
    group.add(bodyWrap);

    const palette: Palette = derivePalette(data.color, modelClass);
    const materials: THREE.Material[] = [];

    let modelRoot: THREE.Group;
    switch (modelClass) {
      case 'ranger':    modelRoot = buildRanger(palette, materials); break;
      case 'scout':     modelRoot = buildScout(palette, materials); break;
      case 'heavy':     modelRoot = buildHeavy(palette, materials); break;
      case 'operative': modelRoot = buildOperative(palette, materials); break;
      case 'pyro':      modelRoot = buildPyro(palette, materials); break;
      case 'medic':     modelRoot = buildMedic(palette, materials); break;
      case 'engineer':  modelRoot = buildEngineer(palette, materials); break;
      case 'phantom':   modelRoot = buildPhantom(palette, materials); break;
    }
    bodyWrap.add(modelRoot);

    // Pull joint refs that CharacterModels stashed for us.
    const joints = modelRoot.userData.joints as Joints;

    // Build the human wound set, parented to the matching skeletal joints so each
    // gash/bruise rides the limb it sits on. Seeded by player id so every client
    // renders the same wounds for the same player.
    const wounds = new PlayerWounds({
      root: modelRoot,
      leftShoulder: joints.leftShoulder,
      rightShoulder: joints.rightShoulder,
      leftHip: joints.leftHip,
      rightHip: joints.rightHip,
      headJoint: joints.headJoint,
    }, { seed: fnv1a(data.id) });

    // Apply shadow flags + friendly-fire tag to every mesh on the body.
    // (Weapon meshes are tagged separately inside swapWeapon().)
    modelRoot.traverse((obj) => {
      obj.userData.friendlyPlayer = true;
      obj.userData.playerId = data.id;
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = this.shadowsEnabled;
        obj.receiveShadow = false;
      }
    });

    // ── Health bar sprite (canvas-backed, updated on health change) ─────
    // Higher-res canvas + anisotropy so the pill stays crisp up close.
    const healthCanvas = document.createElement('canvas');
    healthCanvas.width = 256;
    healthCanvas.height = 32;
    const healthCtx = healthCanvas.getContext('2d')!;
    const healthTexture = new THREE.CanvasTexture(healthCanvas);
    healthTexture.minFilter = THREE.LinearFilter;
    healthTexture.magFilter = THREE.LinearFilter;
    healthTexture.anisotropy = THREE.Texture.DEFAULT_ANISOTROPY; // global max (GPU-clamped)
    const healthBar = new THREE.Sprite(new THREE.SpriteMaterial({
      map: healthTexture, depthTest: true, depthWrite: false, transparent: true,
    }));
    healthBar.scale.set(1.95, 0.26, 1);
    healthBar.position.set(0, HEALTHBAR_Y, 0);
    group.add(healthBar);

    // ── Nameplate sprite ────────────────────────────────────────────────
    const nameplate = this.makeNameplateSprite(data.name, data.color, !!data.isMobile);
    nameplate.position.set(0, NAMEPLATE_Y, 0);
    group.add(nameplate);

    // Pull the materials stashed on the model root so we can dispose
    // them later (every chamfer/box mat the builders allocated).
    const rootMats = (modelRoot.userData.joints as { materials?: THREE.Material[] }).materials;
    if (Array.isArray(rootMats)) {
      rootMats.forEach((m) => materials.push(m));
    }

    const rec: RemotePlayerRecord = {
      id: data.id,
      data,
      group,
      body: bodyWrap,
      joints,
      nameplate,
      healthBar,
      modelClass,
      weaponGroup: null,
      weaponMaterials: [],
      currentWeaponType: 'pistol', // overwritten by swapWeapon() below
      // Tighter extrapolation cap than before: with the adaptive jitter buffer
      // sized to the link, the buffer rarely starves, so we only ever
      // extrapolate to smooth a single dropped packet — never far enough to
      // overshoot a direction change and snap back (the old "teleport" glitch).
      posBuf: new SnapshotInterpolator({ capacity: 16, maxExtrapolationMs: 90 }),
      currentYaw: 0,
      // Network de-jitter state (see mapToLocalTimeline / update).
      clockOffset: 0,
      clockReady: false,
      netJitter: 0,
      renderDelay: DEFAULT_RENDER_DELAY_MS,
      lastSeq: typeof data.seq === 'number' ? data.seq : -1,
      lastPacketAt: performance.now(),
      smoothedSpeed: 0,
      walkPhase: Math.random() * Math.PI * 2,
      bobPhase: Math.random() * Math.PI * 2,
      crouchAmount: 0,
      aimPitch: 0,
      healthCanvas,
      healthCtx,
      healthTexture,
      lastRenderedHealth: -1,
      lastNameplateName: data.name, // nameplate canvas is already drawn → skip first redraw
      lastNameplateMobile: !!data.isMobile,
      isAlive: data.isAlive,
      deathT: 0,
      materials,
      wounds,
    };
    // Build initial weapon (sets currentWeaponType + applies grip pose)
    this.swapWeapon(rec, asWeaponType(data.currentWeapon));
    // Prime the health bar so the first frame doesn't show a blank sprite.
    this.refreshHealthBarIfNeeded(rec);
    // If the player joined already dead (unlikely but possible), hide UI immediately.
    if (!data.isAlive) {
      rec.nameplate.visible = false;
      rec.healthBar.visible = false;
      rec.body.rotation.x = -(Math.PI / 2 - 0.05);
      rec.body.position.y = -1.4;
      rec.body.visible = false;
      rec.deathT = 1.4;
    }
    return rec;
  }

  // ─── NAMEPLATE BUILDER ───────────────────────────────────────────────────

  private makeNameplateSprite(name: string, color: number, isMobile = false): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 84;
    const ctx = canvas.getContext('2d')!;

    const hex = `#${(color >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
    const cardX = 6, cardY = 12;
    const cardW = canvas.width - 12, cardH = canvas.height - 24;
    const cardR = 16;
    // When the player is on a touch device we reserve a slot on the right of
    // the card for a small phone glyph so PC teammates can tell at a glance.
    const glyphReserve = isMobile ? 40 : 0;

    // Soft drop shadow beneath the card for separation from the world.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    this.roundRect(ctx, cardX, cardY, cardW, cardH, cardR);
    // Vertical gradient body — deep slate, subtly lighter at the top.
    const body = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
    body.addColorStop(0, 'rgba(20,26,34,0.92)');
    body.addColorStop(1, 'rgba(8,11,16,0.92)');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.restore();

    // Player-colour accent bar down the left edge.
    this.roundRect(ctx, cardX + 4, cardY + 6, 7, cardH - 12, 3.5);
    ctx.fillStyle = hex;
    ctx.shadowColor = hex;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Hairline border tinted toward the player colour.
    this.roundRect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    let text = name || 'Player';
    // Shorter cap when the phone glyph is shown so a long name never runs into it.
    const maxChars = isMobile ? 13 : 16;
    if (text.length > maxChars) text = text.slice(0, maxChars - 1) + '…';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 5;
    ctx.fillText(text, cardX + 24, canvas.height / 2 + 1);
    ctx.shadowBlur = 0;

    // ── Mobile indicator — a small smartphone glyph on the right edge ──
    if (isMobile) {
      this.drawPhoneGlyph(ctx, cardX + cardW - glyphReserve + 4, canvas.height / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = THREE.Texture.DEFAULT_ANISOTROPY; // global max (GPU-clamped)

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, depthTest: true, depthWrite: false, transparent: true,
    }));
    sprite.scale.set(2.7, 0.71, 1);
    return sprite;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Draw a small smartphone glyph centred on (cx, cy). Used on the nameplate to
   * mark players on a touch device. Hand-drawn (canvas paths) so it stays crisp
   * without bundling an SVG/icon font into the texture pipeline.
   */
  private drawPhoneGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const w = 20, h = 32, r = 4;
    const x = cx - w / 2, y = cy - h / 2;
    const accent = '#5eead4'; // teal — reads as a distinct "device" tint
    ctx.save();
    // Soft glow + body outline.
    ctx.shadowColor = 'rgba(94,234,212,0.55)';
    ctx.shadowBlur = 6;
    this.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = 'rgba(8,12,18,0.92)';
    ctx.fill();
    ctx.shadowBlur = 0;
    this.roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Screen.
    this.roundRect(ctx, x + 3, y + 5, w - 6, h - 11, 1.5);
    ctx.fillStyle = 'rgba(94,234,212,0.35)';
    ctx.fill();
    // Home indicator / button.
    ctx.beginPath();
    ctx.arc(cx, y + h - 3.5, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
  }
}
