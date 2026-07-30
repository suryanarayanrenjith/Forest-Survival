import * as THREE from 'three';
import { getSoftSparkTexture } from './Effects';

export type PowerUpType =
  | 'health'
  | 'ammo'
  | 'speed'
  | 'damage'
  | 'shield'
  | 'invincible'
  | 'infinite_ammo'
  | 'rapid_fire'
  | 'nuke'
  | 'random_weapon'
  | 'frenzy'
  | 'juggernaut';

export interface PowerUpConfig {
  type: PowerUpType;
  name: string;
  description: string;
  icon: string;
  color: number;
  emissiveColor: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  duration?: number; // For temporary effects (milliseconds)
  spawnChance: number; // 0-1
}

export const POWER_UP_CONFIGS: Record<PowerUpType, PowerUpConfig> = {
  health: {
    type: 'health',
    name: 'Health Pack',
    description: '+50 HP',
    icon: '❤️',
    color: 0xff0000,
    emissiveColor: 0xff3333,
    rarity: 'common',
    spawnChance: 0.4
  },
  ammo: {
    type: 'ammo',
    name: 'Ammo Box',
    description: 'Refill ammo',
    icon: '📦',
    color: 0xffaa00,
    emissiveColor: 0xffcc33,
    rarity: 'common',
    spawnChance: 0.3
  },
  speed: {
    type: 'speed',
    name: 'Speed Boost',
    description: '2x speed for 10s',
    icon: '⚡',
    color: 0x00ffff,
    emissiveColor: 0x33ffff,
    rarity: 'rare',
    duration: 10000,
    spawnChance: 0.1
  },
  damage: {
    type: 'damage',
    name: 'Damage Boost',
    description: '2x damage for 15s',
    icon: '💥',
    color: 0xff4400,
    emissiveColor: 0xff6633,
    rarity: 'rare',
    duration: 15000,
    spawnChance: 0.08
  },
  shield: {
    type: 'shield',
    name: 'Energy Shield',
    description: 'Shield absorbs 100 damage',
    icon: '🛡️',
    color: 0x0099ff,
    emissiveColor: 0x33aaff,
    rarity: 'rare',
    duration: 20000,
    spawnChance: 0.07
  },
  invincible: {
    type: 'invincible',
    name: 'Invincibility',
    description: 'Invincible for 5s',
    icon: '⭐',
    color: 0xffff00,
    emissiveColor: 0xffff33,
    rarity: 'epic',
    duration: 5000,
    spawnChance: 0.03
  },
  infinite_ammo: {
    type: 'infinite_ammo',
    name: 'Infinite Ammo',
    description: 'Unlimited ammo for 20s',
    icon: '∞',
    color: 0xff00ff,
    emissiveColor: 0xff33ff,
    rarity: 'epic',
    duration: 20000,
    spawnChance: 0.05
  },
  rapid_fire: {
    type: 'rapid_fire',
    name: 'Rapid Fire',
    description: '3x fire rate for 15s',
    icon: '🔫',
    color: 0xff9900,
    emissiveColor: 0xffaa33,
    rarity: 'epic',
    duration: 15000,
    spawnChance: 0.04
  },
  nuke: {
    type: 'nuke',
    name: 'Tactical Nuke',
    description: 'Eliminate all enemies on screen',
    icon: '☢️',
    color: 0x00ff00,
    emissiveColor: 0x33ff33,
    rarity: 'legendary',
    spawnChance: 0.01
  },
  random_weapon: {
    type: 'random_weapon',
    name: 'Mystery Box',
    description: 'Random weapon unlock',
    icon: '🎁',
    color: 0xaa00ff,
    emissiveColor: 0xbb33ff,
    rarity: 'rare',
    spawnChance: 0.06
  },
  frenzy: {
    type: 'frenzy',
    name: 'Frenzy',
    description: 'Rapid fire + 2x damage for 15s',
    icon: '🔥',
    color: 0xff3a1e,
    emissiveColor: 0xff6a2e,
    rarity: 'epic',
    duration: 15000,
    spawnChance: 0
  },
  juggernaut: {
    type: 'juggernaut',
    name: 'Juggernaut',
    description: 'Shield + speed + overcharge rampage',
    icon: '🛡️',
    color: 0x33ccff,
    emissiveColor: 0x66e0ff,
    rarity: 'legendary',
    duration: 15000,
    spawnChance: 0
  }
};

export interface Airdrop {
  mesh: THREE.Group;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  parachuteOpen: boolean;
  landed: boolean;
  collected: boolean;
  powerUpType: PowerUpType;
  smoke: THREE.Points | null;
  // ── Landed beacon FX (built lazily on touchdown) ──
  /** Vertical perk-coloured light shaft so a crate reads from across the map. */
  beam?: THREE.Mesh;
  /** Flat ground halo ring pulsing under the crate. */
  halo?: THREE.Mesh;
  /** ms timestamp of touchdown — drives the landing pop + idle pulses. */
  landTime?: number;
  /** Resting Y the crate hovers around once landed. */
  baseY?: number;
  // ── Descent rig (animated during the fall, released on touchdown) ──
  /** Parachute canopy — collapses + floats free over ~0.6s after landing. */
  chute?: THREE.Mesh;
  /** Suspension tethers — shrink away with the canopy release. */
  tethers?: THREE.Mesh[];
  /** Per-crate sway phase so simultaneous drops don't swing in lockstep. */
  swayPhase?: number;
  /**
   * Render-distance streaming: a landed crate farther than the cull radius is
   * fully hidden + skips all per-frame animation; it rehydrates (with its
   * landing-pop replayed subtly via landTime preservation) when the player
   * comes back in range. Never set on falling crates — a drop is an event.
   */
  asleep?: boolean;
}

/**
 * Shared vertical-gradient texture for the loot light-shaft. Bright at the
 * base, fading to nothing at the top — multiplied by the perk colour so every
 * crate gets a tinted beam. Built once, reused (and never disposed) forever,
 * mirroring the rain/snow sprite textures in WeatherSystem.
 */
let beamTexture: THREE.CanvasTexture | null = null;
function getBeamTexture(): THREE.CanvasTexture {
  if (beamTexture) return beamTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // canvas y=0 (top) → beam top (transparent); y=128 (bottom) → beam base.
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.42)');
  grad.addColorStop(0.85, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 128);
  beamTexture = new THREE.CanvasTexture(canvas);
  return beamTexture;
}

/**
 * Shared procedural weathered-plank texture for the crate body. Vertical
 * planks with per-plank tone shifts, grain streaks and dark seam lines — the
 * crate reads as real military packaging instead of a flat brown cube. Built
 * once at 128², reused (never disposed) like the beam gradient above.
 */
let woodTexture: THREE.CanvasTexture | null = null;
function getWoodTexture(): THREE.CanvasTexture {
  if (woodTexture) return woodTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8a6034';
  ctx.fillRect(0, 0, 128, 128);
  const PLANKS = 5;
  const pw = 128 / PLANKS;
  for (let p = 0; p < PLANKS; p++) {
    // Per-plank tonal shift so the boards read as separate pieces of wood.
    const tone = 0.82 + ((p * 7919) % 13) / 13 * 0.32;
    ctx.fillStyle = `rgb(${Math.round(138 * tone)},${Math.round(96 * tone)},${Math.round(52 * tone)})`;
    ctx.fillRect(p * pw, 0, pw, 128);
    // Grain streaks — thin darker vertical strokes with slight wander.
    for (let g = 0; g < 7; g++) {
      const gx = p * pw + 2 + ((p * 31 + g * 17) % Math.max(1, Math.floor(pw - 4)));
      const alpha = 0.10 + ((g * 13 + p * 5) % 10) / 10 * 0.12;
      ctx.strokeStyle = `rgba(46,28,12,${alpha.toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + 2, 40, gx - 2, 88, gx + 1, 128);
      ctx.stroke();
    }
    // Dark seam between planks.
    ctx.fillStyle = 'rgba(30,18,8,0.55)';
    ctx.fillRect(p * pw, 0, 1.5, 128);
  }
  // A few knots for character.
  for (let k = 0; k < 4; k++) {
    const kx = (k * 37 + 19) % 118 + 5;
    const ky = (k * 53 + 31) % 118 + 5;
    const kr = 2.5 + (k % 3);
    const rg = ctx.createRadialGradient(kx, ky, 0.5, kx, ky, kr);
    rg.addColorStop(0, 'rgba(40,24,10,0.85)');
    rg.addColorStop(1, 'rgba(40,24,10,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI * 2);
    ctx.fill();
  }
  woodTexture = new THREE.CanvasTexture(canvas);
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  woodTexture.wrapS = THREE.RepeatWrapping;
  woodTexture.wrapT = THREE.RepeatWrapping;
  return woodTexture;
}

const CRATE_SIZE = 2.0;
/** Seconds the released parachute takes to collapse + drift away. */
const CHUTE_RELEASE_S = 0.6;
/** Seconds of touchdown dust before the smoke Points is retired (it used to
 *  animate + re-upload its buffer every frame forever — per landed crate). */
const SMOKE_LIFE_S = 6;
/**
 * Seconds a LANDED crate waits to be claimed before it is written off.
 *
 * A landed airdrop used to sit there for the rest of the run: beacon strobing,
 * light shaft up, halo pulsing. Over a long session every crate the player
 * declined stayed lit, so the map slowly turned into a field of loot beacons
 * and each individual crate stopped meaning anything. Generous enough that any
 * reachable crate is still yours (a streak reward should not be a sprint), but
 * finite. The last CRATE_FADE_S are a visible strobe-out warning.
 */
const CRATE_LIFE_S = 75;
/** Seconds of accelerating blink-out at the end of CRATE_LIFE_S. */
const CRATE_FADE_S = 10;

/**
 * Session-long shared GPU assets for every airdrop. Built lazily ONCE, reused
 * by all crates, and only freed by disposeShared() at scene teardown.
 *
 * This is both an allocation win (spawning a crate builds only Mesh wrappers +
 * its 100-particle smoke buffer) and — critically — a STUTTER fix: materials
 * hold the reference that keeps their compiled shader program in the renderer
 * cache. The old per-crate materials were disposed with each crate, dropping
 * program refcounts to zero, so the NEXT airdrop mid-fight re-linked programs
 * (the vertex-coloured parachute + textured beam were unique permutations) —
 * a visible freeze. Shared materials pin every program for the whole run.
 */
interface SharedAirdropAssets {
  crateGeo: THREE.BoxGeometry;
  bandGeo: THREE.BoxGeometry;
  cornerGeo: THREE.BoxGeometry;
  studGeo: THREE.SphereGeometry;
  panelGeo: THREE.BoxGeometry;
  labelGeo: THREE.BoxGeometry;
  beaconGeo: THREE.SphereGeometry;
  lineGeo: THREE.CylinderGeometry;
  beamGeo: THREE.CylinderGeometry;
  beamCoreGeo: THREE.CylinderGeometry;
  haloGeo: THREE.RingGeometry;
  crateMat: THREE.MeshStandardMaterial;
  bandMat: THREE.MeshStandardMaterial;
  studMat: THREE.MeshStandardMaterial;
  lineMat: THREE.MeshBasicMaterial;
  chuteMat: THREE.MeshStandardMaterial;
  beaconMat: THREE.MeshStandardMaterial;
  smokeMat: THREE.PointsMaterial;
  // Per-perk-colour material caches (colour is baked in, so one per type).
  panelMats: Map<PowerUpType, THREE.MeshStandardMaterial>;
  labelMats: Map<PowerUpType, THREE.MeshStandardMaterial>;
  beamMats: Map<PowerUpType, THREE.MeshBasicMaterial>;
  haloMats: Map<PowerUpType, THREE.MeshBasicMaterial>;
  // Per-type parachute canopies (sector tint is baked into vertex colours).
  chuteGeos: Map<PowerUpType, THREE.ConeGeometry>;
}

export class EnhancedPowerUpSystem {
  private airdrops: Airdrop[] = [];
  private activePowerUps: Map<PowerUpType, { expiresAt: number }> = new Map();
  private shared: SharedAirdropAssets | null = null;

  // Single SHARED glow light for landed crates. Adding/removing a PointLight
  // at runtime forces three.js to recompile every material in the scene (the
  // light count is baked into shaders) — that was the stutter on the first
  // airdrop. The host pre-allocates ONE light at scene init and hands it over;
  // we only ever move it + toggle its intensity, which never recompiles.
  // Reference: https://discourse.threejs.org/t/scene-freezes-when-adding-dynamically-pointlight/28281
  private glowLight: THREE.PointLight | null = null;

  /** Inject the host-owned, permanently-scene-parented airdrop glow light. */
  setGlowLight(light: THREE.PointLight | null): void {
    this.glowLight = light;
    if (light) light.intensity = 0;
  }

  private ensureShared(): SharedAirdropAssets {
    if (this.shared) return this.shared;
    const bandThickness = 0.06;
    this.shared = {
      crateGeo: new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE),
      bandGeo: new THREE.BoxGeometry(CRATE_SIZE + bandThickness, 0.14, CRATE_SIZE + bandThickness),
      cornerGeo: new THREE.BoxGeometry(0.12, CRATE_SIZE + bandThickness, 0.12),
      studGeo: new THREE.SphereGeometry(0.08, 8, 6),
      panelGeo: new THREE.BoxGeometry(1.35, 0.04, 1.35),
      labelGeo: new THREE.BoxGeometry(1.05, 0.32, 0.02),
      beaconGeo: new THREE.SphereGeometry(0.13, 12, 10),
      lineGeo: new THREE.CylinderGeometry(0.015, 0.015, 2.2, 4, 1),
      beamGeo: new THREE.CylinderGeometry(0.45, 1.25, 9, 18, 1, true),
      beamCoreGeo: new THREE.CylinderGeometry(0.16, 0.5, 9, 12, 1, true),
      haloGeo: (() => {
        const g = new THREE.RingGeometry(1.5, 2.5, 40);
        g.rotateX(-Math.PI / 2); // lie flat on the XZ plane
        return g;
      })(),
      crateMat: new THREE.MeshStandardMaterial({
        color: 0xa98756,
        map: getWoodTexture(),
        emissive: 0x1f0e05,
        emissiveIntensity: 0.22,
        roughness: 0.82,
        metalness: 0.06,
      }),
      bandMat: new THREE.MeshStandardMaterial({
        color: 0x42413d,
        emissive: 0x1c1b18,
        emissiveIntensity: 0.4,
        roughness: 0.42,
        metalness: 0.85,
      }),
      studMat: new THREE.MeshStandardMaterial({
        color: 0xb3a982,
        emissive: 0x3a3520,
        emissiveIntensity: 0.7,
        roughness: 0.38,
        metalness: 0.9,
      }),
      lineMat: new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: true }),
      chuteMat: new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.65,
        metalness: 0.0,
        emissive: 0x080808,
        emissiveIntensity: 0.35,
      }),
      beaconMat: new THREE.MeshStandardMaterial({
        color: 0xff4030,
        emissive: 0xff4030,
        emissiveIntensity: 2.5,
        roughness: 0.3,
        metalness: 0.0,
        toneMapped: true,
      }),
      smokeMat: new THREE.PointsMaterial({
        color: 0xaaaaaa,
        size: 0.5,
        map: getSoftSparkTexture(),
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      panelMats: new Map(),
      labelMats: new Map(),
      beamMats: new Map(),
      haloMats: new Map(),
      chuteGeos: new Map(),
    };
    return this.shared;
  }

  private getPanelMat(type: PowerUpType): THREE.MeshStandardMaterial {
    const s = this.ensureShared();
    let m = s.panelMats.get(type);
    if (!m) {
      const cfg = POWER_UP_CONFIGS[type];
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cfg.color),
        emissive: new THREE.Color(cfg.emissiveColor).multiplyScalar(1.4),
        emissiveIntensity: 3.2,
        roughness: 0.35,
        metalness: 0.2,
        toneMapped: true,
      });
      s.panelMats.set(type, m);
    }
    return m;
  }

  private getLabelMat(type: PowerUpType): THREE.MeshStandardMaterial {
    const s = this.ensureShared();
    let m = s.labelMats.get(type);
    if (!m) {
      const cfg = POWER_UP_CONFIGS[type];
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cfg.color),
        emissive: new THREE.Color(cfg.emissiveColor).multiplyScalar(1.4),
        emissiveIntensity: 1.8,
        roughness: 0.5,
        metalness: 0.15,
        toneMapped: true,
      });
      s.labelMats.set(type, m);
    }
    return m;
  }

  private getBeamMat(type: PowerUpType): THREE.MeshBasicMaterial {
    const s = this.ensureShared();
    let m = s.beamMats.get(type);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        map: getBeamTexture(),
        color: new THREE.Color(POWER_UP_CONFIGS[type].emissiveColor),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: true,
      });
      s.beamMats.set(type, m);
    }
    return m;
  }

  private getHaloMat(type: PowerUpType): THREE.MeshBasicMaterial {
    const s = this.ensureShared();
    let m = s.haloMats.get(type);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color: new THREE.Color(POWER_UP_CONFIGS[type].emissiveColor),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: true,
      });
      s.haloMats.set(type, m);
    }
    return m;
  }

  /** Per-type parachute canopy with the perk tint baked into vertex colours. */
  private getChuteGeo(type: PowerUpType): THREE.ConeGeometry {
    const s = this.ensureShared();
    let geo = s.chuteGeos.get(type);
    if (geo) return geo;
    geo = new THREE.ConeGeometry(3, 1.8, 12);
    geo.translate(0, 0.9, 0); // pivot at base for swing
    const positionAttr = geo.getAttribute('position');
    const colorArr = new Float32Array(positionAttr.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
    const whiteCol = new THREE.Color(0xf5f5f5);
    const sectorCol = new THREE.Color(POWER_UP_CONFIGS[type].color).lerp(new THREE.Color(0xffffff), 0.25);
    // The cone has tri faces: tip + 12 base verts. Alternate sectors by
    // looking at the angle of each base vertex.
    for (let i = 0; i < positionAttr.count; i++) {
      const vx = positionAttr.getX(i);
      const vz = positionAttr.getZ(i);
      const ang = Math.atan2(vz, vx);
      const sector = Math.floor((ang + Math.PI) / (Math.PI / 6));
      const c = sector % 2 === 0 ? sectorCol : whiteCol;
      colorArr[i * 3] = c.r;
      colorArr[i * 3 + 1] = c.g;
      colorArr[i * 3 + 2] = c.b;
    }
    s.chuteGeos.set(type, geo);
    return geo;
  }

  createAirdrop(
    scene: THREE.Scene,
    x: number,
    z: number,
    powerUpType?: PowerUpType
  ): Airdrop {
    if (!powerUpType) {
      const random = Math.random();
      let cumulative = 0;

      for (const [type, config] of Object.entries(POWER_UP_CONFIGS)) {
        cumulative += config.spawnChance;
        if (random <= cumulative) {
          powerUpType = type as PowerUpType;
          break;
      }
      }

      if (!powerUpType) powerUpType = 'health';
    }

    const s = this.ensureShared();
    const group = new THREE.Group();
    const halfSize = CRATE_SIZE / 2;

    // ── CRATE BODY — weathered plank wood (shared textured material). ──
    const crate = new THREE.Mesh(s.crateGeo, s.crateMat);
    crate.castShadow = true;
    group.add(crate);

    // ── METAL BANDS — top + middle + bottom rails hugging the wood. ──
    for (const y of [0.92, 0.0, -0.92]) {
      const band = new THREE.Mesh(s.bandGeo, s.bandMat);
      band.position.y = y;
      group.add(band);
    }

    // ── CORNER REINFORCEMENTS — 4 vertical metal strips on the side edges. ──
    const cornerOffsets: [number, number][] = [
      [-halfSize, -halfSize],
      [-halfSize,  halfSize],
      [ halfSize, -halfSize],
      [ halfSize,  halfSize],
    ];
    for (const [cx, cz] of cornerOffsets) {
      const post = new THREE.Mesh(s.cornerGeo, s.bandMat);
      post.position.set(cx, 0, cz);
      group.add(post);
    }

    // ── CORNER STUDS — small bronze rivets at the 8 box corners. ──
    for (const sy of [halfSize, -halfSize]) {
      for (const [sx, sz] of cornerOffsets) {
        const stud = new THREE.Mesh(s.studGeo, s.studMat);
        stud.position.set(sx, sy, sz);
        group.add(stud);
      }
    }

    // ── EMISSIVE TOP PANEL — the power-up's signature colour, the "what's
    // inside" tell at distance and the main bloom catcher. ──
    const topPanel = new THREE.Mesh(s.panelGeo, this.getPanelMat(powerUpType));
    topPanel.position.y = halfSize + 0.02;
    group.add(topPanel);

    // ── FRONT LABEL STRIPE — reinforces the readable "package" silhouette. ──
    const frontLabel = new THREE.Mesh(s.labelGeo, this.getLabelMat(powerUpType));
    frontLabel.position.set(0, 0.05, halfSize + 0.012);
    group.add(frontLabel);

    // ── STROBE BEACON — red blinker pulsed in the per-frame update. Shared
    // material: simultaneous landed crates strobe in phase, which reads fine. ──
    const beacon = new THREE.Mesh(s.beaconGeo, s.beaconMat);
    beacon.position.set(halfSize - 0.18, halfSize + 0.05, halfSize - 0.18);
    beacon.userData.airdropBeacon = true; // tag for the strobe animation
    group.add(beacon);

    // ── PARACHUTE — per-type vertex-coloured canopy (shared geo + material). ──
    const parachute = new THREE.Mesh(this.getChuteGeo(powerUpType), s.chuteMat);
    parachute.position.y = 3.7;
    parachute.rotation.x = Math.PI; // dome opens downward
    group.add(parachute);

    // ── SUSPENSION LINES — 4 thin black tethers to the crate corners. ──
    const tethers: THREE.Mesh[] = [];
    for (const [lx, lz] of cornerOffsets) {
      const line = new THREE.Mesh(s.lineGeo, s.lineMat);
      line.position.set(lx * 0.55, 2.4, lz * 0.55);
      line.rotation.x = -0.18;
      line.rotation.z = lx * 0.18;
      group.add(line);
      tethers.push(line);
    }

    // NOTE: the coloured key light that bathes the ground in the perk's hue is
    // the SHARED `glowLight` (see setGlowLight) driven in updateAirdrops — NOT a
    // per-crate PointLight, which would recompile every scene material on spawn.

    const startY = 100;
    group.position.set(x, startY, z);

    scene.add(group);

    const airdrop: Airdrop = {
      mesh: group,
      position: new THREE.Vector3(x, startY, z),
      targetPosition: new THREE.Vector3(x, 0, z),
      parachuteOpen: true,
      landed: false,
      collected: false,
      powerUpType,
      smoke: null,
      chute: parachute,
      tethers,
      swayPhase: Math.random() * Math.PI * 2,
    };

    this.createSmokeEffect(scene, airdrop);

    this.airdrops.push(airdrop);
    return airdrop;
  }

  private createSmokeEffect(_scene: THREE.Scene, airdrop: Airdrop) {
    // Per-crate GEOMETRY (its positions animate), shared soft-sprite material.
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const smoke = new THREE.Points(geometry, this.ensureShared().smokeMat);
    airdrop.smoke = smoke;
  }

  /**
   * Build the landed beacon: a perk-coloured vertical LIGHT SHAFT (outer cone +
   * bright inner core sharing one material) plus a flat GROUND HALO, parented
   * to the crate group so they ride its slow spin. Created lazily on touchdown
   * so a crate falling through the air isn't trailing a beam. Geometries AND
   * materials are session-shared (see SharedAirdropAssets) — nothing here is
   * disposed per-crate.
   */
  private buildLandingFX(airdrop: Airdrop): void {
    const s = this.ensureShared();
    // Local Y of the ground plane relative to the (crate-centred) group origin.
    const groundLocalY = -(airdrop.baseY ?? 1);

    const beamMat = this.getBeamMat(airdrop.powerUpType);
    const beam = new THREE.Mesh(s.beamGeo, beamMat);
    beam.position.y = groundLocalY + 4.5; // base on the ground, rising 9 units
    beam.renderOrder = 990;
    // Bright inner core — same material, tighter cone → a hot centre line that
    // makes the shaft read volumetric instead of flat.
    const core = new THREE.Mesh(s.beamCoreGeo, beamMat);
    core.renderOrder = 991;
    beam.add(core);
    airdrop.mesh.add(beam);
    airdrop.beam = beam;

    const halo = new THREE.Mesh(s.haloGeo, this.getHaloMat(airdrop.powerUpType));
    halo.position.y = groundLocalY + 0.06;
    halo.renderOrder = 989;
    airdrop.mesh.add(halo);
    airdrop.halo = halo;
  }

  /**
   * Advance every airdrop. When `playerPos`/`cullDistance` are provided,
   * landed crates beyond the cull radius go to sleep — hidden and skipping
   * all animation work — and rehydrate when the player closes to ~92% of the
   * radius (hysteresis so the boundary never flickers). The radius follows
   * the graphics preset's view distance, so streaming is proportional to the
   * player's chosen render distance.
   */
  updateAirdrops(
    deltaTime: number,
    scene: THREE.Scene,
    playerPos?: THREE.Vector3,
    cullDistance?: number,
  ): Airdrop[] {
    const landedAirdrops: Airdrop[] = [];
    const sleepSq = cullDistance !== undefined ? cullDistance * cullDistance : Infinity;
    const wakeDist = cullDistance !== undefined ? cullDistance * 0.92 : Infinity;
    const wakeSq = wakeDist * wakeDist;

    for (let i = this.airdrops.length - 1; i >= 0; i--) {
      const airdrop = this.airdrops[i];

      if (airdrop.collected) {
        this.disposeAirdrop(airdrop, scene);
        this.airdrops.splice(i, 1);
        continue;
      }

      if (!airdrop.landed) {
        const descendSpeed = airdrop.parachuteOpen ? 0.3 : 1.0;
        airdrop.mesh.position.y -= descendSpeed * deltaTime * 60;

        // Pendulum sway — the whole rig tips a few degrees side to side while
        // the canopy breathes, so the fall reads as air resistance, not a
        // straight elevator ride. Per-crate phase offset.
        const swayT = Date.now() * 0.001 + (airdrop.swayPhase ?? 0);
        airdrop.mesh.position.x += Math.sin(swayT) * 0.5 * deltaTime;
        airdrop.mesh.rotation.z = Math.sin(swayT * 1.15) * 0.085;
        airdrop.mesh.rotation.x = Math.cos(swayT * 0.9) * 0.06;
        airdrop.mesh.rotation.y += deltaTime * 0.35; // slow spin on the way down
        if (airdrop.chute) {
          const breathe = 1 + Math.sin(swayT * 2.1) * 0.045;
          airdrop.chute.scale.set(breathe, 1, breathe);
        }

        if (airdrop.mesh.position.y <= 1) {
          airdrop.mesh.position.y = 1;
          airdrop.landed = true;
          // Sit flat on touchdown — the sway tilt zeroes instantly (the squash
          // pop below sells the impact) while the slow Y spin carries on.
          airdrop.mesh.rotation.x = 0;
          airdrop.mesh.rotation.z = 0;

          if (airdrop.smoke) {
            airdrop.smoke.position.copy(airdrop.mesh.position);
            scene.add(airdrop.smoke);
          }

          // Spin up the landed beacon FX (light shaft + ground halo) and the
          // touchdown timestamp that drives the impact pop + idle pulses.
          airdrop.baseY = airdrop.mesh.position.y;
          airdrop.landTime = Date.now();
          this.buildLandingFX(airdrop);

          landedAirdrops.push(airdrop);
      }
      } else {
        // Seconds since touchdown — drives the one-shot landing pop, the chute
        // release, the squash-and-settle and the looping idle pulses.
        const since = airdrop.landTime ? (Date.now() - airdrop.landTime) / 1000 : 1;

        // ── EXPIRY ────────────────────────────────────────────────────────
        // An unclaimed crate is written off after CRATE_LIFE_S so the map can
        // never accumulate a field of permanently-lit loot beacons.
        //
        // Deliberately checked BEFORE the render-distance gate below: a crate
        // the player walked away from is exactly the one that should be timing
        // out, and gating it behind the wake test would leave expired crates
        // sitting in the array to be disposed the moment the player wandered
        // back — which reads as loot vanishing out from under them.
        if (since > CRATE_LIFE_S) {
          this.disposeAirdrop(airdrop, scene);
          this.airdrops.splice(i, 1);
          continue;
      }
        // 1 → 0 across the final CRATE_FADE_S — the crate visibly winds down
        // before it goes. Driven through per-MESH properties only (scale and
        // group visibility): the beam and halo MATERIALS are shared per power-up
        // type, so fading their opacity here would dim every other crate of the
        // same type along with this one.
        const crateLife = since > CRATE_LIFE_S - CRATE_FADE_S
          ? (CRATE_LIFE_S - since) / CRATE_FADE_S
          : 1;

        // ── Render-distance streaming (landed crates only) ────────────────
        if (playerPos && cullDistance !== undefined) {
          const dx = airdrop.mesh.position.x - playerPos.x;
          const dz = airdrop.mesh.position.z - playerPos.z;
          const dSq = dx * dx + dz * dz;
          if (airdrop.asleep) {
            if (dSq < wakeSq) {
              airdrop.asleep = false;
              airdrop.mesh.visible = true;
              if (airdrop.smoke) airdrop.smoke.visible = true;
            } else {
              continue; // stay hidden — zero per-frame work
            }
          } else if (dSq > sleepSq) {
            airdrop.asleep = true;
            airdrop.mesh.visible = false;
            if (airdrop.smoke) airdrop.smoke.visible = false;
            continue;
          }
        }

        if (crateLife < 1) {
          // Accelerating strobe — the universal "about to expire" language.
          airdrop.mesh.visible = Math.sin(since * (6 + (1 - crateLife) * 26)) > -0.4;
      }

        // Slow Y-rotation for the WHOLE crate group so the priority panel
        // and label sweep into view for any nearby player.
        airdrop.mesh.rotation.y += deltaTime * 0.55;

        // ── CHUTE RELEASE — the canopy collapses inward, floats up and the
        // tethers shrink away over the first ~0.6s instead of blinking out.
        // Meshes only are removed (geometry + material are session-shared).
        if (airdrop.chute) {
          const ct = Math.min(1, since / CHUTE_RELEASE_S);
          const collapse = 1 - ct;
          airdrop.chute.scale.set(0.25 + collapse * 0.75, 0.15 + collapse * 0.85, 0.25 + collapse * 0.75);
          airdrop.chute.position.y = 3.7 + ct * 2.6;
          airdrop.chute.rotation.z = ct * 0.9;
          if (airdrop.tethers) {
            for (const t of airdrop.tethers) t.scale.y = collapse;
          }
          if (ct >= 1) {
            airdrop.mesh.remove(airdrop.chute);
            airdrop.chute = undefined;
            if (airdrop.tethers) {
              for (const t of airdrop.tethers) airdrop.mesh.remove(t);
              airdrop.tethers = undefined;
            }
          }
      }

        // Landing pop: 0 → 1 over the first 0.45 s with an ease-out so the
        // beam/halo punch up, then settle.
        const popRaw = Math.min(1, since / 0.45);
        const pop = 1 - (1 - popRaw) * (1 - popRaw); // easeOut

        // ── SQUASH & SETTLE — the crate lands heavy: squashes wide, then
        // springs back to rest over ~0.55s. Applied to the group scale so the
        // fittings ride along; the beam pops in over the same window so the
        // brief distortion reads as part of the impact.
        const st = Math.min(1, since / 0.55);
        const spring = 1 - (1 - st) * (1 - st) * Math.cos(st * 9);
        const squash = THREE.MathUtils.lerp(0.62, 1, Math.min(1, spring));
        const flare = THREE.MathUtils.lerp(1.22, 1, Math.min(1, spring));
        airdrop.mesh.scale.set(flare, squash, flare);

        // Idle hover — the crate gently floats so it never looks like dead
        // geometry sitting on the floor. Tiny amplitude keeps the beacon base
        // and halo visually anchored to the ground.
        if (airdrop.baseY !== undefined) {
          airdrop.mesh.position.y = airdrop.baseY + Math.sin(since * 2.4) * 0.12;
      }

        // Strobe beacon — pulse the red blinker so a landed crate is easy
        // to spot in a forest. Cheap traversal because the group has only
        // ~30 children and we early-exit on the tagged mesh.
        const tNow = Date.now() * 0.005;
        const strobe = 0.6 + Math.abs(Math.sin(tNow)) * 3.2;
        for (let c = 0; c < airdrop.mesh.children.length; c++) {
          const child = airdrop.mesh.children[c];
          if (child instanceof THREE.Mesh && child.userData.airdropBeacon
              && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissiveIntensity = strobe;
            break;
          }
      }

        // Light-shaft beacon — breathe its opacity + swell on landing so it
        // reads as a living column of light, not a static cone.
        if (airdrop.beam && airdrop.beam.material instanceof THREE.MeshBasicMaterial) {
          const breathe = 0.7 + Math.sin(since * 2.0) * 0.3;
          airdrop.beam.material.opacity = 0.32 * pop * breathe;
          const sway = 1 + Math.sin(since * 1.7) * 0.04;
          // The shaft narrows away as the crate expires (per-mesh scale — the
          // beam MATERIAL is shared across all crates of this type).
          airdrop.beam.scale.set(pop * crateLife, sway, pop * crateLife);
          airdrop.beam.rotation.y -= deltaTime * 0.8; // slow counter-spin shimmer
      }

        // Ground halo — expands out of the impact point then idles with a
        // slow breathing pulse. (No spin: a symmetric ring reads identically
        // when rotated, and the group already turns it on its Y axis.)
        if (airdrop.halo && airdrop.halo.material instanceof THREE.MeshBasicMaterial) {
          const haloPulse = 0.85 + Math.sin(since * 3.0 + 1.0) * 0.15;
          airdrop.halo.scale.setScalar(pop * haloPulse * crateLife);
          airdrop.halo.material.opacity = 0.55 * pop * (0.7 + Math.sin(since * 3.0) * 0.3);
      }

        // Animate the touchdown dust, then RETIRE it — the old version rose
        // forever, re-uploading a 100-particle buffer every frame per landed
        // crate for the rest of the run.
        if (airdrop.smoke) {
          if (since > SMOKE_LIFE_S) {
            scene.remove(airdrop.smoke);
            airdrop.smoke.geometry.dispose(); // per-crate buffer; material is shared
            airdrop.smoke = null;
          } else {
            const positions = airdrop.smoke.geometry.attributes.position.array as Float32Array;
            for (let j = 0; j < positions.length; j += 3) {
              positions[j + 1] += 0.05;
              if (positions[j + 1] > 3) {
                positions[j] = (Math.random() - 0.5) * 2;
                positions[j + 1] = 0;
                positions[j + 2] = (Math.random() - 0.5) * 2;
              }
            }
            airdrop.smoke.geometry.attributes.position.needsUpdate = true;
          }
      }
      }
    }

    // Drive the single shared glow light from the most prominent active crate
    // (landed, or close enough to the ground that the glow reads). Pure
    // move + intensity changes — never a recompile. Sleeping crates are
    // skipped — their glow shouldn't burn a light the player can't see.
    if (this.glowLight) {
      let lit = false;
      for (let i = 0; i < this.airdrops.length; i++) {
        const a = this.airdrops[i];
        if (a.collected || a.asleep) continue;
        const y = a.mesh.position.y;
        if (a.landed || y < 14) {
          const cfg = POWER_UP_CONFIGS[a.powerUpType];
          this.glowLight.color.setHex(cfg.emissiveColor);
          this.glowLight.position.set(a.mesh.position.x, a.mesh.position.y + 1.5, a.mesh.position.z);
          const prox = a.landed ? 1 : 1 - Math.min(1, Math.max(0, (y - 2) / 12));
          this.glowLight.intensity = 2.0 * prox;
          lit = true;
          break;
      }
      }
      if (!lit) this.glowLight.intensity = 0;
    }

    return landedAirdrops;
  }

  /**
   * Warmup hook: build one crate, force an instant touchdown and tick the
   * update twice so EVERY airdrop shader program links during the loader —
   * including the landed-only set (light beam + core, ground halo, chute
   * collapse, touchdown dust) that the old fall-from-100m warm crate never
   * reached, which left the FIRST real landing mid-fight to compile them.
   * The caller's clearAll() removes the crate; the session-shared materials
   * keep every program pinned in the cache afterwards.
   */
  prewarm(scene: THREE.Scene, x: number, z: number): void {
    const drop = this.createAirdrop(scene, x, z, 'speed');
    drop.mesh.position.y = 1.2;
    this.updateAirdrops(0.016, scene); // lands: builds beam/halo, adds smoke
    this.updateAirdrops(0.016, scene); // one animated frame of the landed state
  }

  /**
   * Release an airdrop's per-crate resources. Everything visual is session-
   * shared now (see SharedAirdropAssets) — only the 100-particle smoke buffer
   * is owned by the crate, so disposal is just a scene detach + one geometry.
   */
  private disposeAirdrop(airdrop: Airdrop, scene: THREE.Scene): void {
    scene.remove(airdrop.mesh);
    if (airdrop.smoke) {
      scene.remove(airdrop.smoke);
      airdrop.smoke.geometry.dispose();
      airdrop.smoke = null;
    }
  }

  collectAirdrop(airdrop: Airdrop): PowerUpType {
    airdrop.collected = true;

    const config = POWER_UP_CONFIGS[airdrop.powerUpType];

    if (config.duration) {
      this.activePowerUps.set(airdrop.powerUpType, {
        expiresAt: Date.now() + config.duration
      });
    }

    return airdrop.powerUpType;
  }

  getRemainingTime(type: PowerUpType): number {
    const data = this.activePowerUps.get(type);
    if (!data) return 0;

    return Math.max(0, data.expiresAt - Date.now());
  }

  /**
   * Remove every live crate. The session-shared assets are deliberately KEPT
   * (their materials pin the compiled airdrop shader programs in the renderer
   * cache — freeing them would re-introduce the first-airdrop stutter this
   * system was rebuilt to kill). Call disposeShared() at scene teardown.
   */
  clearAll(scene: THREE.Scene): void {
    this.airdrops.forEach(airdrop => this.disposeAirdrop(airdrop, scene));
    this.airdrops = [];
    this.activePowerUps.clear();
    if (this.glowLight) this.glowLight.intensity = 0;
  }

  /** Free the session-shared geometries + materials. Scene teardown only. */
  disposeShared(): void {
    const s = this.shared;
    if (!s) return;
    s.crateGeo.dispose();
    s.bandGeo.dispose();
    s.cornerGeo.dispose();
    s.studGeo.dispose();
    s.panelGeo.dispose();
    s.labelGeo.dispose();
    s.beaconGeo.dispose();
    s.lineGeo.dispose();
    s.beamGeo.dispose();
    s.beamCoreGeo.dispose();
    s.haloGeo.dispose();
    s.crateMat.dispose();
    s.bandMat.dispose();
    s.studMat.dispose();
    s.lineMat.dispose();
    s.chuteMat.dispose();
    s.beaconMat.dispose();
    s.smokeMat.dispose();
    s.panelMats.forEach((m) => m.dispose());
    s.labelMats.forEach((m) => m.dispose());
    s.beamMats.forEach((m) => m.dispose());
    s.haloMats.forEach((m) => m.dispose());
    s.chuteGeos.forEach((g) => g.dispose());
    this.shared = null;
    // The beam/wood CanvasTextures are module-level singletons kept for the
    // page lifetime (mirroring the weather sprite textures) — re-uploaded
    // automatically if a fresh WebGL context needs them.
  }

  getAirdrops(): Airdrop[] {
    return this.airdrops;
  }
}
