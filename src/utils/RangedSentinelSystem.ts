// Ranged Sentinels — stationary laser turrets that pressure the player to
// keep moving.
//
// Each sentinel sits at a fixed map position (chosen at scene init) and
// periodically targets the player with a telegraphed red glow. After a brief
// charge-up window the laser fires a hitscan-style shot that does heavy
// damage if the player hasn't moved out of the line. Sentinels have HP and
// can be destroyed by the player.
//
// All geometry + materials are shared so spawning a dozen sentinels is cheap.

import * as THREE from 'three';

export interface RangedSentinel {
  /** Root mesh / group placed in the scene. */
  mesh: THREE.Group;
  position: THREE.Vector3;
  /** Hitpoints. A few rifle rounds; pistol takes a moment. */
  hp: number;
  maxHp: number;
  /** Bullet-collision radius (m). */
  hitRadius: number;
  /** The turret head — emissive brightens during charge-up. */
  head: THREE.Mesh;
  /** Charge-up clock. Reaches `chargeDurationMs` then fires + resets. */
  chargeMs: number;
  chargeDurationMs: number;
  /** Cool-down clock between fires (only ticks down between shots). */
  cooldownMs: number;
  cooldownDurationMs: number;
  /** True while the sentinel is winding up its next shot. Set by the per-
   *  frame update; gameplay code consumes it (e.g. to draw a tracer). */
  isCharging: boolean;
  /** Damage dealt by a successful hit. */
  damage: number;
  /** Effective range — beyond this the sentinel stays idle. */
  range: number;
  destroyed: boolean;
}

const TURRET_BODY = new THREE.CylinderGeometry(0.55, 0.7, 1.4, 14, 1);
const TURRET_BODY_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a3a3a,
  emissive: 0x191919,
  roughness: 0.5,
  metalness: 0.78,
});
const TURRET_HEAD = new THREE.SphereGeometry(0.45, 14, 12);

/** Build a single sentinel turret at (x, z). */
export function buildRangedSentinel(x: number, z: number): RangedSentinel {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const body = new THREE.Mesh(TURRET_BODY, TURRET_BODY_MAT);
  body.position.y = 0.7;
  body.castShadow = true;
  group.add(body);

  // Head gets a UNIQUE material so we can spike its emissive intensity to
  // telegraph the shot. Reusing the shared material would brighten every
  // turret in the world at once.
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x6c1212,
    emissive: 0x991010,
    emissiveIntensity: 0.6,
    roughness: 0.35,
    metalness: 0.6,
  });
  const head = new THREE.Mesh(TURRET_HEAD, headMat);
  head.position.y = 1.6;
  group.add(head);

  return {
    mesh: group,
    position: group.position.clone(),
    hp: 80,
    maxHp: 80,
    hitRadius: 0.95,
    head,
    chargeMs: 0,
    chargeDurationMs: 1100, // 1.1s telegraph — readable but not generous
    cooldownMs: 1800,
    cooldownDurationMs: 1800,
    isCharging: false,
    damage: 18,
    range: 55,
    destroyed: false,
  };
}

/**
 * Spawn `count` sentinels around the world, avoiding terrain and the player
 * spawn area. Returns the spawned set so the caller can iterate / collide.
 */
export function spawnRangedSentinels(
  scene: THREE.Scene,
  count: number,
  overlapsTerrain: (x: number, z: number, r: number) => boolean,
  worldSize: number = 220,
): RangedSentinel[] {
  const list: RangedSentinel[] = [];
  let attempts = 0;
  const MAX_ATTEMPTS = count * 8;
  while (list.length < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const x = (Math.random() - 0.5) * worldSize;
    const z = (Math.random() - 0.5) * worldSize;
    // Keep them at distance from player spawn (camera ~ (0,5,10)) so they
    // don't immediately laser the player at round start.
    if (Math.hypot(x, z - 10) < 35) continue;
    if (overlapsTerrain(x, z, 1.6)) continue;
    const sentinel = buildRangedSentinel(x, z);
    scene.add(sentinel.mesh);
    list.push(sentinel);
  }
  return list;
}

/** Increase the head's emissive glow proportional to the sentinel's charge.
 *  Call every frame for every sentinel in `isCharging` state. */
export function updateSentinelGlow(s: RangedSentinel): void {
  const charge = Math.min(1, s.chargeMs / s.chargeDurationMs);
  const mat = s.head.material as THREE.MeshStandardMaterial;
  mat.emissiveIntensity = 0.6 + charge * 2.8;
}
