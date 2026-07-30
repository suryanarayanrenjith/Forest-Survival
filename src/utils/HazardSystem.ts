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
import { bakeCanvas, bakeTex, heightToNormal, grain, mottle, scratches, rivet } from './ProceduralSurface';

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
  /**
   * This drum was standing inside an ARK-07 relay field when the map was
   * built. Decades of the dead satellite's broadcast have cooked its contents
   * into something that is no longer an explosive — it is a warhead.
   *
   * Marked with its own radiological skin (see `makeBarrelIrradiated`) so it is
   * never mistaken for ordinary red TNT, detonates as a genuine nuclear event
   * over a huge radius, and CANNOT be wired by the Engineer — nobody rigs a
   * critical core with a detonator kit and a length of wire.
   */
  irradiated?: boolean;
  /** The pulsing warning band + ground halo added by `makeBarrelIrradiated`. */
  radBand?: THREE.Mesh;
  radHalo?: THREE.Mesh;
  // ── Engineer "Demolition" wiring (set when armed into a remote bomb) ──
  /** Armed into a remote bomb by the Engineer's ability. */
  wired?: boolean;
  /** Wiring-animation progress 0→1; the bomb is detonatable once it reaches 1. */
  armProgress?: number;
  /** Detonator/wire kit parented to the barrel mesh (disposed on detonation). */
  bombKit?: THREE.Group;
  /** Blinking LED + antenna tip + glow band, animated each frame while armed. */
  bombLight?: THREE.Mesh;
  bombTip?: THREE.Mesh;
  bombBand?: THREE.Mesh;
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

// ═══ IRRADIATED CORE ═══════════════════════════════════════════════════
//
// A barrel that spawned inside an ARK-07 relay field. Everything below is
// built LAZILY on the first conversion and then shared by every core on the
// map — a map with no relays (or no barrels inside one) pays nothing.

/** Blast radius of an irradiated core, in metres. Roughly half a relay field:
 *  big enough that being anywhere near one when it goes is fatal, small enough
 *  that the field is still a place you can choose to fight in. */
export const IRRADIATED_BLAST_RADIUS = 32;
/** Centre damage against enemies. Nothing in the game survives it. */
export const IRRADIATED_BLAST_DAMAGE = 900;

interface RadAssets {
  body: THREE.MeshStandardMaterial;
  rib: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  halo: THREE.MeshBasicMaterial;
  bandGeo: THREE.TorusGeometry;
  haloGeo: THREE.RingGeometry;
}
let radAssets: RadAssets | null = null;

/** The radiological trefoil: three 60° blades on a central disc. */
function trefoil(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, style: string): void {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 - Math.PI / 2 - Math.PI / 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a0 + Math.PI / 3);
    ctx.arc(cx, cy, r * 0.36, a0 + Math.PI / 3, a0, true);
    ctx.closePath();
    ctx.fill();
  }
}

/** Diagonal caution striping across a horizontal band. */
function bandStripes(
  ctx: CanvasRenderingContext2D, s: number,
  y0: number, h: number, base: string, stripe: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y0, s, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(0, y0, s, h);
  ctx.fillStyle = stripe;
  const pitch = s / 14;
  for (let x = -h; x < s + h; x += pitch * 2) {
    ctx.beginPath();
    ctx.moveTo(x, y0 + h);
    ctx.lineTo(x + pitch, y0 + h);
    ctx.lineTo(x + pitch + h, y0);
    ctx.lineTo(x + h, y0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Layout shared by all four maps of the drum skin, so the paint, the gloss,
 * the glow and the physical relief describe the SAME features.
 *
 * The canvas wraps the cylinder: x is the circumference, y is the height with
 * canvas-top = drum-top. Three trefoils are spaced around it so the warning is
 * legible from any approach angle — which is the entire point of marking these
 * differently from ordinary TNT.
 */
const RAD_BAND_TOP = 0.10, RAD_BAND_H = 0.13;
const RAD_BAND_BOT = 0.77;
const RAD_TREFOIL_Y = 0.475;

function paintRadBody(ctx: CanvasRenderingContext2D, s: number): void {
  // Sickly irradiated-yellow drum paint, streaked and stained.
  ctx.fillStyle = '#b9b23c';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * s;
    const w = s * (0.004 + Math.random() * 0.014);
    ctx.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${80 + Math.random() * 55 | 0},30,${(0.05 + Math.random() * 0.16).toFixed(2)})`;
    ctx.fillRect(x, Math.random() * s * 0.6, w, s * (0.2 + Math.random() * 0.5));
  }
  // Corrosion blooms around the seams — this thing has been out here a while.
  mottle(ctx, s, 22, s * 0.07, 0.22, 120);
  bandStripes(ctx, s, s * RAD_BAND_TOP, s * RAD_BAND_H, '#141208', '#e0c318');
  bandStripes(ctx, s, s * RAD_BAND_BOT, s * RAD_BAND_H, '#141208', '#e0c318');
  // Three trefoil placards on black discs.
  for (let i = 0; i < 3; i++) {
    const cx = s * (i / 3 + 1 / 6);
    const cy = s * RAD_TREFOIL_Y;
    const r = s * 0.115;
    ctx.fillStyle = '#e8cf1c';
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#141208';
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2); ctx.fill();
    trefoil(ctx, cx, cy, r, '#f2e33a');
  }
  scratches(ctx, s, 46, (a) => `rgba(60,52,20,${a})`, s * 0.10);
  // Fastener line under the top band.
  for (let i = 0; i < 12; i++) rivet(ctx, s * (0.04 + i * 0.0833), s * 0.275, s * 0.011, 196, 92);
}

function paintRadRough(ctx: CanvasRenderingContext2D, s: number): void {
  grain(ctx, s, 226, 22, false);                 // matte, weathered paint
  bandStripes(ctx, s, s * RAD_BAND_TOP, s * RAD_BAND_H, 'rgb(150,150,150)', 'rgb(120,120,120)');
  bandStripes(ctx, s, s * RAD_BAND_BOT, s * RAD_BAND_H, 'rgb(150,150,150)', 'rgb(120,120,120)');
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = 'rgb(118,118,118)';          // placards are glossy enamel
    ctx.beginPath(); ctx.arc(s * (i / 3 + 1 / 6), s * RAD_TREFOIL_Y, s * 0.154, 0, Math.PI * 2); ctx.fill();
  }
  mottle(ctx, s, 22, s * 0.07, 0.24, 250);       // rust patches read fully matte
}

function paintRadHeight(ctx: CanvasRenderingContext2D, s: number): void {
  grain(ctx, s, 132, 10, false);
  // Rolled hoops at the band lines stand proud of the drum wall.
  bandStripes(ctx, s, s * RAD_BAND_TOP, s * RAD_BAND_H, 'rgb(186,186,186)', 'rgb(198,198,198)');
  bandStripes(ctx, s, s * RAD_BAND_BOT, s * RAD_BAND_H, 'rgb(186,186,186)', 'rgb(198,198,198)');
  for (let i = 0; i < 3; i++) {
    const cx = s * (i / 3 + 1 / 6), cy = s * RAD_TREFOIL_Y;
    ctx.fillStyle = 'rgb(172,172,172)';
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.154, 0, Math.PI * 2); ctx.fill();
    trefoil(ctx, cx, cy, s * 0.115, 'rgb(96,96,96)'); // stencil is etched IN
  }
  for (let i = 0; i < 12; i++) rivet(ctx, s * (0.04 + i * 0.0833), s * 0.275, s * 0.011, 228, 74);
  scratches(ctx, s, 46, (a) => `rgba(84,84,84,${a})`, s * 0.10);
}

/**
 * Emissive mask — black except where the core's light escapes: the trefoil
 * itself, the seam gaps at both bands, and a scatter of hairline leak cracks.
 * This is what makes the drum read as ACTIVE at night rather than as a
 * differently-painted prop.
 */
function paintRadEmissive(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#7dff35';
  ctx.fillRect(0, s * (RAD_BAND_TOP + RAD_BAND_H) - s * 0.012, s, s * 0.014);
  ctx.fillRect(0, s * RAD_BAND_BOT, s, s * 0.014);
  for (let i = 0; i < 3; i++) {
    trefoil(ctx, s * (i / 3 + 1 / 6), s * RAD_TREFOIL_Y, s * 0.115, '#a8ff5c');
  }
  // Leak cracks radiating out of the placards.
  ctx.strokeStyle = 'rgba(125,255,53,0.75)';
  for (let i = 0; i < 26; i++) {
    let x = Math.random() * s, y = s * (0.30 + Math.random() * 0.42);
    ctx.lineWidth = s * 0.003;
    ctx.beginPath(); ctx.moveTo(x, y);
    let ang = Math.random() * Math.PI * 2;
    for (let j = 0; j < 4; j++) {
      ang += (Math.random() - 0.5) * 1.5;
      x += Math.cos(ang) * s * 0.03; y += Math.sin(ang) * s * 0.03;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function ensureRadAssets(): RadAssets {
  if (radAssets) return radAssets;
  // 512: the trefoil stencil edge and the caution stripes are the read, and
  // both fall apart at 256 on a drum the player walks right up to.
  const S = 512;
  const albedo = bakeTex(S, 1, true, paintRadBody);
  const emissive = bakeTex(S, 1, true, paintRadEmissive);
  const rough = bakeTex(S, 1, false, paintRadRough);
  const normal = heightToNormal(bakeCanvas(S, paintRadHeight), 2.6);

  radAssets = {
    body: new THREE.MeshStandardMaterial({
      map: albedo,
      roughnessMap: rough,
      normalMap: normal,
      emissiveMap: emissive,
      emissive: 0x7dff35,
      emissiveIntensity: 1.9,
      roughness: 0.78,
      metalness: 0.35,
    }),
    // Corroded hoops rather than the clean chrome of a standard barrel.
    rib: new THREE.MeshStandardMaterial({
      color: 0x4d4a2c, roughness: 0.86, metalness: 0.55,
      emissive: 0x1c2a06, emissiveIntensity: 0.6,
    }),
    // Containment band — an additive ring that breathes, so the core reads as
    // live at any distance and in any light.
    glow: new THREE.MeshBasicMaterial({
      color: 0x9dff4a, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
    // Contamination pool on the ground under it.
    halo: new THREE.MeshBasicMaterial({
      color: 0x6bff2e, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
    bandGeo: new THREE.TorusGeometry(0.58, 0.035, 6, 24),
    haloGeo: new THREE.RingGeometry(0.7, 2.1, 26),
  };
  return radAssets;
}

/**
 * Convert an already-spawned barrel into an ARK-07 irradiated core.
 *
 * Done as a CONVERSION rather than a separate spawn path because which barrels
 * end up irradiated depends on where the relay spires land, and the relays are
 * placed after the barrels are scattered.
 */
export function makeBarrelIrradiated(barrel: ExplosiveBarrel): void {
  if (barrel.irradiated || barrel.detonated) return;
  const a = ensureRadAssets();
  barrel.irradiated = true;
  barrel.mesh.material = a.body;
  // Re-skin the two hoops that were added in buildExplosiveBarrel.
  for (const child of barrel.mesh.children) {
    if (child instanceof THREE.Mesh) child.material = a.rib;
  }
  const band = new THREE.Mesh(a.bandGeo, a.glow);
  band.rotation.x = Math.PI / 2;
  barrel.mesh.add(band);
  barrel.radBand = band;
  const halo = new THREE.Mesh(a.haloGeo, a.halo);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.62; // the barrel centre sits at y=0.65, so this is ground
  barrel.mesh.add(halo);
  barrel.radHalo = halo;

  // Tougher than red TNT: a stray round should not casually set off a warhead,
  // and the extra HP makes popping one a deliberate act.
  barrel.hp = 52;
  barrel.blastRadius = IRRADIATED_BLAST_RADIUS;
  barrel.blastDamage = IRRADIATED_BLAST_DAMAGE;
}

/**
 * Breathe the containment band + contamination pool. One shared-material write
 * plus a couple of per-core scale writes — called once per frame from the
 * barrel loop, and a no-op when the map has no cores.
 */
export function pulseIrradiatedBarrels(barrels: ExplosiveBarrel[], timeSec: number): void {
  if (!radAssets) return;
  const p = 0.5 + 0.5 * Math.sin(timeSec * 2.6);
  radAssets.glow.opacity = 0.55 + p * 0.45;
  radAssets.halo.opacity = 0.13 + p * 0.16;
  radAssets.body.emissiveIntensity = 1.5 + p * 0.9;
  for (let i = 0; i < barrels.length; i++) {
    const b = barrels[i];
    if (!b.irradiated || b.detonated) continue;
    if (b.radBand) b.radBand.scale.setScalar(1 + p * 0.06);
    if (b.radHalo) b.radHalo.scale.setScalar(0.92 + p * 0.16);
  }
}

/**
 * Every material the irradiated cores use, or an empty array if this map's
 * relays caught no barrels and the skin was never built.
 *
 * Handed to the shader warmup so the core's programs (a fully-mapped standard
 * material, plus the two additive overlays) are linked before the first
 * playable frame. Without this the first core the player LOOKS at would link
 * mid-fight — and a core is something you tend to look at from cover, in a
 * firefight, at exactly the moment a stall is least affordable.
 */
export function irradiatedCoreMaterials(): THREE.Material[] {
  return radAssets ? [radAssets.body, radAssets.rib, radAssets.glow, radAssets.halo] : [];
}

/** Free the shared irradiated-core assets. Scene teardown only. */
export function disposeHazardAssets(): void {
  if (!radAssets) return;
  radAssets.body.map?.dispose();
  radAssets.body.roughnessMap?.dispose();
  radAssets.body.normalMap?.dispose();
  radAssets.body.emissiveMap?.dispose();
  radAssets.body.dispose();
  radAssets.rib.dispose();
  radAssets.glow.dispose();
  radAssets.halo.dispose();
  radAssets.bandGeo.dispose();
  radAssets.haloGeo.dispose();
  radAssets = null;
}

/**
 * Builds a stylised, vaguely Half-Life-ish red barrel. The bottom rests on
 * y=0; the caller positions x/z.
 */
export function buildExplosiveBarrel(): ExplosiveBarrel {
  const group = new THREE.Mesh(BARREL_GEOMETRY, BARREL_MATERIAL);
  group.castShadow = true;
  group.receiveShadow = true;
  group.position.y = 0.65; // barrel is 1.3 tall, centre at 0.65

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
    // A TNT blast should reliably wipe out the cluster of enemies around it.
    // Centre damage (150) one-shots normals / fast / ranged at any realistic
    // wave and heavily chunks tanks; the gentle falloff (resolved in App's
    // detonateBarrel) keeps enemies a few metres out still lethal-or-close.
    blastRadius: 7.5,
    blastDamage: 150,
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
