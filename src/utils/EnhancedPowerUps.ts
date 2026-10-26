import * as THREE from 'three';
import {
  getItemMaterial, getAirdropCrateGeometry, getCrateLabelGeometry, getChuteGeometry, getLineGeometry,
  type CrateLabelId,
} from './ItemAtlas';

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
  /** ms timestamp of touchdown — drives the landing settle + the smoke plume. */
  landTime?: number;
  /** Resting Y of the crate centre once landed. */
  baseY?: number;
  // ── Descent rig (animated during the fall, released on touchdown) ──
  /** Parachute canopy — collapses, drifts downwind and settles over ~1.6 s. */
  chute?: THREE.Mesh;
  /** Suspension lines — go slack with the canopy release. */
  tethers?: THREE.Mesh[];
  /** Per-crate sway phase so simultaneous drops don't swing in lockstep. */
  swayPhase?: number;
  /** Seconds of signal smoke still to emit, and the emitter accumulator. */
  smokeLeft?: number;
  smokeAccum?: number;
  /** World position of the smoke canister's mouth (set on touchdown). */
  smokeAt?: THREE.Vector3;
  /**
   * Render-distance streaming: a landed crate farther than the cull radius is
   * fully hidden + skips all per-frame animation; it rehydrates when the player
   * comes back in range. Never set on falling crates — a drop is an event.
   */
  asleep?: boolean;
}

/** Crate dimensions (world units) — a 2 m-class air-cargo crate on a pallet. */
const CRATE_W = 2.1;
const CRATE_H = 1.35;
const CRATE_D = 1.45;
/** Canopy radius and its height above the crate centre while descending. */
const CHUTE_R = 3.3;
const CHUTE_Y = 3.6;
/** Seconds the released parachute takes to collapse and lie down. */
const CHUTE_RELEASE_S = 1.6;
/** Seconds of red signal smoke after touchdown (thinning toward the end). */
const SMOKE_S = 26;
/**
 * Seconds a LANDED crate waits to be claimed before it is written off.
 *
 * A landed airdrop used to sit there for the rest of the run. Generous enough
 * that any reachable crate is still yours (a streak reward should not be a
 * sprint), but finite. The last CRATE_FADE_S are a visible strobe-out warning.
 */
const CRATE_LIFE_S = 75;
/** Seconds of accelerating blink-out at the end of CRATE_LIFE_S. */
const CRATE_FADE_S = 10;

/** Where the suspension lines meet the crate (top corners, crate-local). */
const LINE_ANCHORS: [number, number][] = [
  [-CRATE_W * 0.42, -CRATE_D * 0.4], [-CRATE_W * 0.42, CRATE_D * 0.4],
  [CRATE_W * 0.42, -CRATE_D * 0.4], [CRATE_W * 0.42, CRATE_D * 0.4],
];

/**
 * Session-long shared GPU assets for every airdrop. Geometry + the item
 * material come from ItemAtlas (cached there, freed by disposeItemAtlas); the
 * only things owned here are the strobe beacon's geometry + material.
 *
 * Materials hold the reference that keeps their compiled shader program in the
 * renderer cache — the old per-crate materials were disposed with each crate,
 * so the NEXT airdrop mid-fight re-linked programs (a visible freeze). Shared
 * materials pin every program for the whole run.
 */
interface SharedAirdropAssets {
  beaconGeo: THREE.SphereGeometry;
  beaconMat: THREE.MeshStandardMaterial;
}

const _up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class EnhancedPowerUpSystem {
  private airdrops: Airdrop[] = [];
  private activePowerUps: Map<PowerUpType, { expiresAt: number }> = new Map();
  private shared: SharedAirdropAssets | null = null;

  // Single SHARED glow light for landed crates (the signal flare's red glow).
  // Adding/removing a PointLight at runtime forces three.js to recompile every
  // material in the scene (the light count is baked into shaders); the host
  // pre-allocates ONE light at scene init and hands it over — we only ever
  // move it + set its intensity, which never recompiles.
  private glowLight: THREE.PointLight | null = null;

  /**
   * Puff emitter for the landed crate's signal smoke and the touchdown dust.
   * App owns the (already warmed, pooled) smoke sprites and spawns them here.
   */
  onPuff: ((kind: 'signal' | 'dust', x: number, y: number, z: number) => void) | null = null;

  /** Inject the host-owned, permanently-scene-parented airdrop glow light. */
  setGlowLight(light: THREE.PointLight | null): void {
    this.glowLight = light;
    if (light) light.intensity = 0;
  }

  private ensureShared(): SharedAirdropAssets {
    if (this.shared) return this.shared;
    this.shared = {
      beaconGeo: new THREE.SphereGeometry(0.07, 12, 10),
      beaconMat: new THREE.MeshStandardMaterial({
        color: 0xff4030,
        emissive: 0xff4030,
        emissiveIntensity: 2.5,
        roughness: 0.3,
        metalness: 0.0,
        toneMapped: true,
      }),
    };
    return this.shared;
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
    const mat = getItemMaterial();
    const group = new THREE.Group();

    // ── CRATE — OD plywood air-cargo crate: frame battens, steel corner
    // brackets, two ratchet cargo straps and the pallet, all ONE merged mesh. ──
    const crate = new THREE.Mesh(getAirdropCrateGeometry(CRATE_W, CRATE_H, CRATE_D), mat);
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);

    // ── STENCILLED CONTENTS PLATES — front, back and on the lid, so what is
    // inside reads from any approach (MEDICAL, AMMUNITION, BODY ARMOR …). ──
    const labelGeo = getCrateLabelGeometry(powerUpType as CrateLabelId, 1.05);
    for (const side of [1, -1]) {
      const plate = new THREE.Mesh(labelGeo, mat);
      plate.position.set(0, 0.02, side * (CRATE_D / 2 + 0.02));
      if (side < 0) plate.rotation.y = Math.PI;
      group.add(plate);
    }
    const lid = new THREE.Mesh(labelGeo, mat);
    lid.rotation.x = -Math.PI / 2;
    lid.position.set(0, CRATE_H / 2 + 0.02, 0);
    group.add(lid);

    // ── IR STROBE on a corner bracket (blinks once landed). ──
    const beacon = new THREE.Mesh(s.beaconGeo, s.beaconMat);
    beacon.position.set(CRATE_W / 2 - 0.08, CRATE_H / 2 + 0.12, CRATE_D / 2 - 0.08);
    beacon.userData.airdropBeacon = true;
    group.add(beacon);

    // ── PARACHUTE — a gored nylon canopy with its vent, on four risers. ──
    const parachute = new THREE.Mesh(getChuteGeometry(CHUTE_R), mat);
    parachute.position.y = CHUTE_Y;
    parachute.castShadow = true;
    group.add(parachute);

    const tethers: THREE.Mesh[] = [];
    for (const [ax, az] of LINE_ANCHORS) {
      const line = new THREE.Mesh(getLineGeometry(), mat);
      tethers.push(line);
      group.add(line);
      this.aimLine(line, ax, CRATE_H / 2, az, ax * 2.6, CHUTE_Y + 0.05, az * 2.6);
    }

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
      chute: parachute,
      tethers,
      swayPhase: Math.random() * Math.PI * 2,
    };
    this.airdrops.push(airdrop);
    return airdrop;
  }

  /** Stretch a unit line mesh between two crate-local points. */
  private aimLine(line: THREE.Mesh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    _a.set(x0, y0, z0);
    _b.set(x1, y1, z1);
    _dir.subVectors(_b, _a);
    const len = _dir.length();
    line.position.copy(_a);
    line.quaternion.setFromUnitVectors(_up, _dir.multiplyScalar(1 / Math.max(1e-4, len)));
    line.scale.set(1, len, 1);
  }

  /**
   * Advance every airdrop. When `playerPos`/`cullDistance` are provided,
   * landed crates beyond the cull radius go to sleep — hidden and skipping
   * all animation work — and rehydrate when the player closes to ~92% of the
   * radius (hysteresis so the boundary never flickers).
   */
  updateAirdrops(
    deltaTime: number,
    scene: THREE.Scene,
    playerPos?: THREE.Vector3,
    cullDistance?: number,
    groundAt?: (x: number, z: number) => number,
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

        // Pendulum sway under the canopy + the canopy breathing in the air.
        const swayT = Date.now() * 0.001 + (airdrop.swayPhase ?? 0);
        airdrop.mesh.position.x += Math.sin(swayT) * 0.5 * deltaTime;
        airdrop.mesh.rotation.z = Math.sin(swayT * 1.15) * 0.07;
        airdrop.mesh.rotation.x = Math.cos(swayT * 0.9) * 0.05;
        airdrop.mesh.rotation.y += deltaTime * 0.25;
        if (airdrop.chute) {
          const breathe = 1 + Math.sin(swayT * 2.1) * 0.04;
          airdrop.chute.scale.set(breathe, 1 + Math.sin(swayT * 2.1 + 1) * 0.05, breathe);
        }

        const ground = groundAt ? groundAt(airdrop.mesh.position.x, airdrop.mesh.position.z) : 0;
        // Crate centre rests half a crate + the pallet (~0.29) above the ground.
        const rest = ground + CRATE_H / 2 + 0.29;
        if (airdrop.mesh.position.y <= rest) {
          airdrop.mesh.position.y = rest;
          airdrop.landed = true;
          airdrop.mesh.rotation.x = 0;
          airdrop.mesh.rotation.z = 0;
          airdrop.baseY = rest;
          airdrop.landTime = Date.now();
          airdrop.smokeLeft = SMOKE_S;
          airdrop.smokeAccum = 0;
          // The signal canister sits by the crate's front corner.
          airdrop.smokeAt = new THREE.Vector3(CRATE_W / 2 + 0.35, -CRATE_H / 2 - 0.29 + 0.4, CRATE_D / 2 + 0.2)
            .applyQuaternion(airdrop.mesh.quaternion).add(airdrop.mesh.position);
          // Touchdown dust kicked out from under the pallet.
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            this.onPuff?.('dust', airdrop.mesh.position.x + Math.cos(a) * 1.3, ground + 0.3, airdrop.mesh.position.z + Math.sin(a) * 1.3);
          }
          landedAirdrops.push(airdrop);
        }
        continue;
      }

      // Seconds since touchdown.
      const since = airdrop.landTime ? (Date.now() - airdrop.landTime) / 1000 : 1;

      // ── EXPIRY (checked before the render-distance gate, so a crate the
      // player walked away from still times out). ──
      if (since > CRATE_LIFE_S) {
        this.disposeAirdrop(airdrop, scene);
        this.airdrops.splice(i, 1);
        continue;
      }
      const crateLife = since > CRATE_LIFE_S - CRATE_FADE_S ? (CRATE_LIFE_S - since) / CRATE_FADE_S : 1;

      // ── Render-distance streaming (landed crates only) ──
      if (playerPos && cullDistance !== undefined) {
        const dx = airdrop.mesh.position.x - playerPos.x;
        const dz = airdrop.mesh.position.z - playerPos.z;
        const dSq = dx * dx + dz * dz;
        if (airdrop.asleep) {
          if (dSq < wakeSq) {
            airdrop.asleep = false;
            airdrop.mesh.visible = true;
          } else {
            continue;
          }
        } else if (dSq > sleepSq) {
          airdrop.asleep = true;
          airdrop.mesh.visible = false;
          continue;
        }
      }

      if (crateLife < 1) {
        // Accelerating strobe — the universal "about to expire" language.
        airdrop.mesh.visible = Math.sin(since * (6 + (1 - crateLife) * 26)) > -0.4;
      }

      // ── LANDING SETTLE — a heavy crate lands, the pallet flexes and it
      // rocks once on its skids before settling (no cartoon squash). ──
      if (since < 0.9) {
        const k = since / 0.9;
        const rock = Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.035;
        airdrop.mesh.rotation.x = rock;
        airdrop.mesh.rotation.z = -rock * 0.6;
        airdrop.mesh.position.y = (airdrop.baseY ?? airdrop.mesh.position.y) - Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k) * 0.05;
      } else if (airdrop.mesh.rotation.x !== 0) {
        airdrop.mesh.rotation.x = 0;
        airdrop.mesh.rotation.z = 0;
        if (airdrop.baseY !== undefined) airdrop.mesh.position.y = airdrop.baseY;
      }

      // ── CHUTE RELEASE — the canopy deflates, drifts downwind and lies down
      // across the ground beside the crate; the risers go slack and drop. ──
      if (airdrop.chute) {
        const ct = Math.min(1, since / CHUTE_RELEASE_S);
        const e = ct * ct * (3 - 2 * ct);
        airdrop.chute.scale.set(1 + e * 0.15, Math.max(0.06, 1 - e * 0.94), 1 + e * 0.15);
        airdrop.chute.position.set(e * 3.4, CHUTE_Y - e * (CHUTE_Y + CRATE_H / 2 + 0.24), e * 0.6);
        airdrop.chute.rotation.z = -e * 0.35;
        if (airdrop.tethers) {
          LINE_ANCHORS.forEach(([ax, az], li) => {
            const line = airdrop.tethers![li];
            const tx = ax * 2.6 + e * 3.4, ty = (CHUTE_Y + 0.05) * (1 - e) + (-CRATE_H / 2 - 0.2) * e, tz = az * 2.6 + e * 0.6;
            this.aimLine(line, ax, CRATE_H / 2, az, tx, ty, tz);
          });
        }
      }

      // Strobe beacon on the corner bracket.
      const tNow = Date.now() * 0.001;
      const strobe = (tNow % 1.1) < 0.08 ? 4.5 : 0.25;
      for (let c = 0; c < airdrop.mesh.children.length; c++) {
        const child = airdrop.mesh.children[c];
        if (child instanceof THREE.Mesh && child.userData.airdropBeacon
            && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissiveIntensity = strobe;
          break;
        }
      }

      // ── SIGNAL SMOKE — a red M18 plume rising and drifting downwind; dense
      // for the first ~18 s, thinning as the canister burns out. ──
      if (airdrop.smokeAt && (airdrop.smokeLeft ?? 0) > 0) {
        airdrop.smokeLeft = (airdrop.smokeLeft ?? 0) - deltaTime;
        const density = Math.min(1, (airdrop.smokeLeft ?? 0) / 8);
        airdrop.smokeAccum = (airdrop.smokeAccum ?? 0) + deltaTime * (2.5 + 5.5 * density);
        while ((airdrop.smokeAccum ?? 0) >= 1) {
          airdrop.smokeAccum = (airdrop.smokeAccum ?? 0) - 1;
          this.onPuff?.('signal', airdrop.smokeAt.x, airdrop.smokeAt.y, airdrop.smokeAt.z);
        }
      }
    }

    // Drive the single shared glow light from the most prominent landed crate:
    // the signal flare's red glow, flickering with the burn. Pure move +
    // intensity changes — never a recompile.
    if (this.glowLight) {
      let lit = false;
      for (let i = 0; i < this.airdrops.length; i++) {
        const a = this.airdrops[i];
        if (a.collected || a.asleep || !a.landed || !a.smokeAt || (a.smokeLeft ?? 0) <= 0) continue;
        this.glowLight.color.setHex(0xff4a2a);
        this.glowLight.position.set(a.smokeAt.x, a.smokeAt.y + 0.6, a.smokeAt.z);
        const burn = Math.min(1, (a.smokeLeft ?? 0) / 6);
        this.glowLight.intensity = (1.4 + Math.sin(Date.now() * 0.023) * 0.35 + Math.sin(Date.now() * 0.051) * 0.2) * burn;
        lit = true;
        break;
      }
      if (!lit) this.glowLight.intensity = 0;
    }

    return landedAirdrops;
  }

  /**
   * Warmup hook: build one crate and force an instant touchdown so every
   * airdrop program links during the loader. The caller's clearAll() removes
   * the crate; the shared materials keep every program pinned afterwards.
   */
  prewarm(scene: THREE.Scene, x: number, z: number): void {
    const drop = this.createAirdrop(scene, x, z, 'speed');
    drop.mesh.position.y = 1.0;
    const puff = this.onPuff;
    this.onPuff = null; // no smoke from the warm crate
    this.updateAirdrops(0.016, scene); // lands
    this.updateAirdrops(0.016, scene); // one animated frame of the landed state
    this.onPuff = puff;
  }

  /** Release an airdrop: everything visual is session-shared, so just detach. */
  private disposeAirdrop(airdrop: Airdrop, scene: THREE.Scene): void {
    scene.remove(airdrop.mesh);
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
   * Remove every live crate. The shared assets are deliberately KEPT (their
   * materials pin the compiled programs). Call disposeShared() at teardown.
   */
  clearAll(scene: THREE.Scene): void {
    this.airdrops.forEach(airdrop => this.disposeAirdrop(airdrop, scene));
    this.airdrops = [];
    this.activePowerUps.clear();
    if (this.glowLight) this.glowLight.intensity = 0;
  }

  /** Free the airdrop-owned assets (geometry/material from ItemAtlas is freed there). */
  disposeShared(): void {
    const s = this.shared;
    if (!s) return;
    s.beaconGeo.dispose();
    s.beaconMat.dispose();
    this.shared = null;
    this.onPuff = null;
  }

  getAirdrops(): Airdrop[] {
    return this.airdrops;
  }
}
