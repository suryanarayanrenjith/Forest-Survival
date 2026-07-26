// TACTICAL ARCHETYPE VISUALS + RULES
//
// WHY THESE EXIST
//
// The original roster was six types, four of which were the same enemy with
// different HP/speed/scale numbers. Every one of them did exactly one thing:
// walk at the player and hit them. Nothing on the field ever asked the player
// to change position, weapon, or target priority — so a fight at wave 30 was
// the same fight as wave 8, only longer.
//
// Each archetype here forces a DIFFERENT response:
//
//   BULWARK  — immune from the front. You must flank. (position)
//   HOWLER   — heals the swarm. You must kill it first. (target priority)
//   LEAPER   — telegraphed pounce that clears cover. You must react. (timing)
//   SPLITTER — splits on death. You must choose where/how. (weapon + spacing)
//
// PERF / POOL CONTRACT
//
//  • Every mesh built here uses MODULE-SHARED geometry and materials, so an
//    archetype adds no per-spawn allocation and — critically — no new shader
//    program. The enemy material set is already one program for all six slots;
//    these attachments must not break that.
//  • Attachments are tagged `userData.isX` and are DETACH-only. The pooled
//    enemy mesh is recycled, so createEnemy strips them on acquire; disposing
//    them there would free geometry every other enemy of that type is drawing.
//  • disposeArchetypeAssets() is for game teardown only.

import * as THREE from 'three';

// ── SHARED ASSETS ──────────────────────────────────────────────────────────
// Built lazily on first use so a run that never spawns an archetype pays
// nothing, then shared by every instance for the rest of the session.

let _shieldGeo: THREE.SphereGeometry | null = null;
let _shieldMat: THREE.MeshBasicMaterial | null = null;
let _auraGeo: THREE.TorusGeometry | null = null;
let _auraMat: THREE.MeshBasicMaterial | null = null;
let _linkGeo: THREE.RingGeometry | null = null;
let _linkMat: THREE.MeshBasicMaterial | null = null;

/**
 * BULWARK shield — a partial sphere covering the front arc only.
 *
 * Deliberately a HEMISPHERE-ish cap rather than a full bubble: the player has
 * to be able to read, at a glance and from any angle, which way the protection
 * faces. A full bubble would say "invulnerable" instead of "flank me".
 */
export function buildBulwarkShield(): THREE.Mesh {
  if (!_shieldGeo) {
    // In THREE's SphereGeometry, phi = π/2 points along LOCAL +Z, which is the
    // enemy's forward. Centre a ~115° cap (phiLength 2.0 rad ≈ ±57°, matching
    // BULWARK_SHIELD_ARC) on that, so the visible plate and the damage test
    // agree — getting those out of step would mean shots that look blocked
    // landing, and vice versa.
    const phiLength = 2.0;
    _shieldGeo = new THREE.SphereGeometry(
      1.5, 18, 12,
      Math.PI / 2 - phiLength / 2, phiLength,
      0.35, 2.4,
    );
  }
  if (!_shieldMat) {
    _shieldMat = new THREE.MeshBasicMaterial({
      color: 0x5fd8ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  }
  const m = new THREE.Mesh(_shieldGeo, _shieldMat);
  m.position.set(0, 1.1, 0);
  m.userData.isBulwarkShield = true; // ← pool-acquire detach tag
  m.renderOrder = 3;
  return m;
}

/** HOWLER aura ring — a flat torus at the feet marking its support radius. */
export function buildHowlerAura(): THREE.Mesh {
  if (!_auraGeo) _auraGeo = new THREE.TorusGeometry(HOWLER_AURA_RADIUS, 0.12, 6, 40);
  if (!_auraMat) {
    _auraMat = new THREE.MeshBasicMaterial({
      color: 0xd08cff,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  }
  const m = new THREE.Mesh(_auraGeo, _auraMat);
  m.rotation.x = Math.PI / 2;
  m.position.y = 0.08;
  m.userData.isHowlerAura = true; // ← pool-acquire detach tag
  return m;
}

/** Overshield marker worn by an ally the Howler is currently buffing. */
export function buildOvershieldRing(): THREE.Mesh {
  if (!_linkGeo) _linkGeo = new THREE.RingGeometry(0.85, 1.05, 20);
  if (!_linkMat) {
    _linkMat = new THREE.MeshBasicMaterial({
      color: 0xd08cff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  }
  const m = new THREE.Mesh(_linkGeo, _linkMat);
  m.rotation.x = Math.PI / 2;
  m.position.y = 2.4;
  m.userData.isOvershieldRing = true; // ← pool-acquire detach tag
  return m;
}

/** Free the shared archetype assets. Game teardown ONLY. */
export function disposeArchetypeAssets(): void {
  _shieldGeo?.dispose(); _shieldGeo = null;
  _shieldMat?.dispose(); _shieldMat = null;
  _auraGeo?.dispose(); _auraGeo = null;
  _auraMat?.dispose(); _auraMat = null;
  _linkGeo?.dispose(); _linkGeo = null;
  _linkMat?.dispose(); _linkMat = null;
}

// ── TUNING ─────────────────────────────────────────────────────────────────

/**
 * Turn-rate multiplier applied to the body-facing lerp.
 *
 * ⚠ This is what makes the Bulwark WORK. Every other enemy squares up to the
 * player at a lerp rate of 7-9/s, which is fast enough that a player circling
 * at any realistic range can never get behind them. A frontal shield on an
 * enemy that always faces you is not a puzzle, it's just immunity — so the
 * Bulwark turns like the heavy slab of armour it is, and out-manoeuvring it
 * becomes an actual, achievable answer.
 *
 * 1 = unchanged. Only archetypes that need a different feel are listed.
 */
export const TURN_RATE_MULT: Record<string, number> = {
  bulwark: 0.26,  // deliberately ponderous — the flanking window
  splitter: 0.7,  // bloated and slow to come about
  leaper: 1.25,   // whips around to line up its pounce
};

/** Half-angle (radians) of the Bulwark's protected front arc. ~±60°. */
export const BULWARK_SHIELD_ARC = Math.PI / 3;
/** Damage multiplier for shots landing inside that arc. */
export const BULWARK_FRONT_DAMAGE = 0.12;

/** Radius (m) within which the Howler shields its allies. */
export const HOWLER_AURA_RADIUS = 9;
/** Overshield granted per pulse. */
export const HOWLER_SHIELD_AMOUNT = 30;
/** Pulse period (ms). */
export const HOWLER_PULSE_MS = 2600;
/** How long a granted overshield survives without a refresh (ms). */
export const HOWLER_SHIELD_LINGER_MS = 4000;

/** Leaper: how long the crouch telegraph lasts (ms). The reaction window. */
export const LEAP_CROUCH_MS = 620;
/** Max time in the air before the landing is forced (ms). */
export const LEAP_AIR_MAX_MS = 1400;
/** Post-landing vulnerable window (ms) — the payoff for dodging. */
export const LEAP_RECOVER_MS = 900;
/** Cooldown between pounces (ms). */
export const LEAP_COOLDOWN_MS = 4200;
/** Distance band the Leaper will commit a pounce from (m). */
export const LEAP_MIN_RANGE = 7;
export const LEAP_MAX_RANGE = 20;
/** Impact damage of a landed pounce. */
export const LEAP_IMPACT_DAMAGE = 22;
/** How long the player is rooted by a landed pounce (ms). */
export const LEAP_ROOT_MS = 550;

/** How many children a Splitter bursts into. */
export const SPLITTER_CHILDREN = 3;

/**
 * Is a shot landing inside the Bulwark's protected arc?
 *
 * Compares the enemy's facing against the direction TO the shooter. The
 * Bulwark holds its shield toward whatever it's facing, and the steering keeps
 * it facing the player — so beating it genuinely requires getting around it,
 * not just waiting.
 */
export function isBlockedByBulwark(
  enemyRotationY: number,
  enemyX: number, enemyZ: number,
  fromX: number, fromZ: number,
): boolean {
  // Facing convention, verified against the enemy loop: the body is squared up
  // with `rotation.y = atan2(playerX - enemyX, playerZ - enemyZ)`, and the head
  // tracker treats `atan2(dx,dz) - rotation.y === 0` as "looking straight at
  // the player". So the forward vector is (+sin, +cos) — NOT (-sin, -cos).
  const facingX = Math.sin(enemyRotationY);
  const facingZ = Math.cos(enemyRotationY);
  const toX = fromX - enemyX;
  const toZ = fromZ - enemyZ;
  const len = Math.hypot(toX, toZ);
  if (len < 1e-4) return false;
  const dot = (toX / len) * facingX + (toZ / len) * facingZ;
  return dot > Math.cos(BULWARK_SHIELD_ARC);
}
