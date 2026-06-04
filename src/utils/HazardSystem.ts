// Environmental Hazards — explosive barrels.
//
// Scattered around each map at spawn. A bullet hit (or splash damage) detonates
// the barrel, dealing radius damage to ALL nearby entities (player included).
// Tactical: kite a tank into a barrel cluster for a free wipe.
//
// All barrels share their geometry + material via static pools so spawning a
// hundred barrels stays cheap. Each barrel keeps a small HP value so a glancing
// hit doesn't always blow the whole thing — players can chip away without
// catching themselves in the blast.

import * as THREE from 'three';

export interface ExplosiveBarrel {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  hp: number;
  /** Radius the player / enemies use for bullet-collision tests (m). */
  hitRadius: number;
  /** Explosion radius (m) — falls off with distance to ~25% at the edge. */
  blastRadius: number;
  /** Centre damage. Tunable per map if we ever want stronger barrels. */
  blastDamage: number;
  detonated: boolean;
}

const BARREL_GEOMETRY = new THREE.CylinderGeometry(0.55, 0.55, 1.3, 12, 1);
const BARREL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xb02525,
  emissive: 0x3a0606,
  emissiveIntensity: 0.7,
  roughness: 0.55,
  metalness: 0.6,
});

const RIB_GEOMETRY = new THREE.TorusGeometry(0.56, 0.06, 6, 18);
const RIB_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x6b6b6b,
  roughness: 0.4,
  metalness: 0.9,
});

/**
 * Builds a stylised, vaguely Half-Life-ish red barrel. The bottom rests on
 * y=0; the caller positions x/z.
 */
export function buildExplosiveBarrel(): ExplosiveBarrel {
  const group = new THREE.Mesh(BARREL_GEOMETRY, BARREL_MATERIAL);
  group.castShadow = true;
  group.receiveShadow = true;
  group.position.y = 0.65; // barrel is 1.3 tall, centre at 0.65
  group.userData.cannotReceiveAO = true;

  // Two metal rings around the barrel for silhouette readability.
  const topRib = new THREE.Mesh(RIB_GEOMETRY, RIB_MATERIAL);
  topRib.position.y = 0.4;
  topRib.rotation.x = Math.PI / 2;
  group.add(topRib);

  const bottomRib = new THREE.Mesh(RIB_GEOMETRY, RIB_MATERIAL);
  bottomRib.position.y = -0.4;
  bottomRib.rotation.x = Math.PI / 2;
  group.add(bottomRib);

  return {
    mesh: group,
    position: group.position.clone(),
    hp: 28, // ~1 rifle hit or 2 pistol hits
    hitRadius: 0.85,
    blastRadius: 6.5,
    blastDamage: 65,
    detonated: false,
  };
}

/** Drops `count` barrels in a wide ring around the origin, avoiding terrain
 *  via the supplied `overlapsTerrain` predicate. Returns the spawned set. */
export function spawnBarrels(
  scene: THREE.Scene,
  count: number,
  overlapsTerrain: (x: number, z: number, r: number) => boolean,
  worldSize: number = 220,
): ExplosiveBarrel[] {
  const barrels: ExplosiveBarrel[] = [];
  let attempts = 0;
  const MAX_ATTEMPTS = count * 6;
  while (barrels.length < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const x = (Math.random() - 0.5) * worldSize;
    const z = (Math.random() - 0.5) * worldSize;
    // Don't drop barrels right next to the player spawn (camera at 0,5,10).
    if (Math.hypot(x, z - 10) < 12) continue;
    if (overlapsTerrain(x, z, 1.2)) continue;
    const barrel = buildExplosiveBarrel();
    barrel.mesh.position.x = x;
    barrel.mesh.position.z = z;
    barrel.position.set(x, barrel.mesh.position.y, z);
    scene.add(barrel.mesh);
    barrels.push(barrel);
  }
  return barrels;
}
