// Subverter hack visuals — everything the player SEES on a hacked enemy.
//
//  • A glowing intrusion CHIP clamped to the enemy's back (the virus the
//    Subverter fired into it).
//  • An "overclock" RING that orbits the torso, spinning faster and reddening
//    as the enemy nears burnout.
//  • A camera-facing HACKED indicator that hovers over the head.
//  • A scanline "glitch" bar that sweeps the body.
//
// All of it is parented to the enemy's root mesh group (so it inherits the
// body's position / yaw / type-scale and rides the LOD-independent root), and
// re-tints green→amber→red across the hack's lifetime so the player can read
// "this one's about to blow" at a glance.
//
// Geometry + the indicator glyph texture are shared module singletons; only a
// handful of tiny per-instance materials are allocated per hack (and disposed
// on detach), which is cheap because only a few enemies are ever hacked at once.

import * as THREE from 'three';

// ── Shared, build-once resources ──────────────────────────────────────────
let _chipGeo: THREE.BufferGeometry | null = null;
let _chipPinGeo: THREE.BufferGeometry | null = null;
let _ringGeo: THREE.BufferGeometry | null = null;
let _ring2Geo: THREE.BufferGeometry | null = null;
let _scanGeo: THREE.BufferGeometry | null = null;
let _glyphTex: THREE.CanvasTexture | null = null;

function chipGeo(): THREE.BufferGeometry {
  return (_chipGeo ??= new THREE.BoxGeometry(0.46, 0.5, 0.16));
}
function chipPinGeo(): THREE.BufferGeometry {
  return (_chipPinGeo ??= new THREE.BoxGeometry(0.12, 0.12, 0.18));
}
function ringGeo(): THREE.BufferGeometry {
  return (_ringGeo ??= new THREE.TorusGeometry(0.95, 0.05, 6, 28));
}
function ring2Geo(): THREE.BufferGeometry {
  return (_ring2Geo ??= new THREE.TorusGeometry(0.66, 0.035, 6, 24));
}
function scanGeo(): THREE.BufferGeometry {
  // A thin flat band the body height, swept up and down as a "scanline".
  return (_scanGeo ??= new THREE.BoxGeometry(1.9, 0.07, 1.9));
}

/** The HACKED emblem drawn once (neutral/white so a per-instance material tint
 *  can recolour it green→red). A glitchy hex badge + skull + label. */
function glyphTexture(): THREE.CanvasTexture {
  if (_glyphTex) return _glyphTex;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d')!;
  const cx = s / 2;

  // Soft glow disc
  const grad = ctx.createRadialGradient(cx, cx, 8, cx, cx, cx);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cx, cx, 0, Math.PI * 2);
  ctx.fill();

  // Hex badge outline
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * 84;
    const y = cx - 18 + Math.sin(a) * 84;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // Skull glyph (compromised) — bold so it survives downscaling at distance.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 96px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('☠', cx, cx - 20);

  // Label
  ctx.font = 'bold 40px monospace';
  ctx.fillText('HACKED', cx, cx + 86);

  // Glitch scanlines across the badge
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let y = 30; y < s - 30; y += 14) ctx.fillRect(28, y, s - 56, 4);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _glyphTex = tex;
  return tex;
}

// Per-instance animated handles stashed on the returned group's userData.
interface HackVisualRefs {
  chipCore: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshBasicMaterial;
  ring2Mat: THREE.MeshBasicMaterial;
  scanMat: THREE.MeshBasicMaterial;
  spriteMat: THREE.SpriteMaterial;
  ring: THREE.Mesh;
  ring2: THREE.Mesh;
  scan: THREE.Mesh;
  sprite: THREE.Sprite;
  chip: THREE.Object3D;
}

const _green = new THREE.Color(0x39ff14);
const _amber = new THREE.Color(0xffc83a);
const _red = new THREE.Color(0xff2d2d);
const _tmpCol = new THREE.Color();

/** Lifetime tint: fresh = green, half = amber, burnout = hot red. */
function lifeColor(frac: number, out: THREE.Color): THREE.Color {
  // frac = 1 (just hacked) → 0 (about to detonate)
  if (frac > 0.5) out.copy(_green).lerp(_amber, (1 - frac) / 0.5);
  else out.copy(_amber).lerp(_red, (0.5 - frac) / 0.5);
  return out;
}

/**
 * Build the hack visual rig and parent it to the enemy's mesh group.
 * `headY` / `torsoY` are local heights (the head sits ~1.9 in enemy-group
 * space; the back chip rides the torso ~1.0).
 */
export function buildHackVisuals(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'hackVisuals';

  // ── Back chip (the virus) — a small board clamped to the upper back ──
  const chip = new THREE.Group();
  chip.position.set(0, 1.0, -0.56); // upper back, behind the torso
  const board = new THREE.Mesh(
    chipGeo(),
    new THREE.MeshStandardMaterial({ color: 0x101418, metalness: 0.6, roughness: 0.4 }),
  );
  chip.add(board);
  // Glowing virus core on the board
  const chipCore = new THREE.MeshStandardMaterial({
    color: 0x062a16, emissive: _green.clone(), emissiveIntensity: 1.4,
    metalness: 0.2, roughness: 0.3,
  });
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.06), chipCore);
  core.position.z = -0.09;
  chip.add(core);
  // Gold contact prongs sticking into the back
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xc8a23a, metalness: 0.9, roughness: 0.3 });
  for (const px of [-0.12, 0, 0.12]) {
    const pin = new THREE.Mesh(chipPinGeo(), pinMat);
    pin.position.set(px, -0.3, 0.04);
    chip.add(pin);
  }
  group.add(chip);

  // ── Overclock ring orbiting the torso ──
  const ringMat = new THREE.MeshBasicMaterial({
    color: _green.clone(), transparent: true, opacity: 0.85, toneMapped: false,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo(), ringMat);
  ring.position.y = 0.9;
  ring.rotation.x = Math.PI / 2;
  ring.userData.cannotReceiveAO = true;
  group.add(ring);

  // A second, smaller ring tilted off-axis and counter-rotating — gives the
  // overclock a gyroscopic, unstable "two-axis containment field" read.
  const ring2Mat = new THREE.MeshBasicMaterial({
    color: _green.clone(), transparent: true, opacity: 0.7, toneMapped: false,
    depthWrite: false,
  });
  const ring2 = new THREE.Mesh(ring2Geo(), ring2Mat);
  ring2.position.y = 0.95;
  ring2.rotation.x = Math.PI / 2.6;
  ring2.userData.cannotReceiveAO = true;
  group.add(ring2);

  // ── Glitch scanline band ──
  const scanMat = new THREE.MeshBasicMaterial({
    color: _green.clone(), transparent: true, opacity: 0.22, toneMapped: false,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const scan = new THREE.Mesh(scanGeo(), scanMat);
  scan.position.y = 0.9;
  scan.userData.cannotReceiveAO = true;
  group.add(scan);

  // ── HACKED indicator hovering over the head ──
  const spriteMat = new THREE.SpriteMaterial({
    map: glyphTexture(), color: _green.clone(), transparent: true,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.setScalar(1.5);
  sprite.position.y = 2.9;
  sprite.renderOrder = 999;
  group.add(sprite);

  const refs: HackVisualRefs = { chipCore, ringMat, ring2Mat, scanMat, spriteMat, ring, ring2, scan, sprite, chip };
  group.userData.hackRefs = refs;
  return group;
}

/**
 * Animate the rig. `frac` is the fraction of the hack window remaining (1→0);
 * `t` is a free-running time accumulator (seconds).
 */
export function updateHackVisuals(group: THREE.Group, dt: number, t: number, frac: number): void {
  const refs = group.userData.hackRefs as HackVisualRefs | undefined;
  if (!refs) return;
  const col = lifeColor(Math.max(0, Math.min(1, frac)), _tmpCol);

  // Urgency rises as burnout nears (faster spin, brighter pulse).
  const urgency = 1 + (1 - frac) * 2.5;
  const pulse = 0.7 + Math.abs(Math.sin(t * 6 * urgency)) * 0.6;
  // Spawn-in pop — a brief expand+overshoot in the first slice of the hack so
  // the rig reads as a chip being violently "installed", not just appearing.
  const spawn = Math.max(0, (frac - 0.9) / 0.1); // 1 → 0 over the first 10%
  const pop = 1 + spawn * 0.6;

  // Chip core glow (flares on install)
  refs.chipCore.emissive.copy(col);
  refs.chipCore.emissiveIntensity = 1.0 + pulse * 1.6 + spawn * 3.0;
  refs.chip.scale.setScalar((1 + Math.sin(t * 9 * urgency) * 0.06) * pop);

  // Outer ring — spin, breathe, recolour
  refs.ring.rotation.z += dt * (2 + urgency * 3);
  refs.ring.scale.setScalar((0.9 + Math.sin(t * 4 * urgency) * 0.12) * pop);
  refs.ringMat.color.copy(col);
  refs.ringMat.opacity = (0.55 + pulse * 0.4) * (frac > 0.001 ? 1 : 0);

  // Inner ring — counter-rotates on a tilted axis for a gyroscopic field look.
  refs.ring2.rotation.z -= dt * (3 + urgency * 4);
  refs.ring2.rotation.y += dt * (1.5 + urgency * 2);
  refs.ring2.scale.setScalar((0.85 + Math.sin(t * 5 * urgency + 1.3) * 0.14) * pop);
  refs.ring2Mat.color.copy(col);
  refs.ring2Mat.opacity = 0.5 + pulse * 0.35;

  // Scanline sweeps up the body and flickers
  refs.scan.position.y = 0.2 + ((t * 1.4 * urgency) % 1) * 1.7;
  refs.scanMat.color.copy(col);
  refs.scanMat.opacity = (Math.sin(t * 30) > 0 ? 0.3 : 0.12) * (0.6 + pulse * 0.6);

  // Indicator bob + glitch jitter + recolour
  refs.sprite.position.y = 2.9 + Math.sin(t * 3) * 0.12;
  refs.sprite.position.x = (Math.sin(t * 41) > 0.7 ? (Math.random() - 0.5) * 0.16 : 0); // occasional glitch shake
  refs.spriteMat.color.copy(col);
  refs.spriteMat.opacity = 0.85 + pulse * 0.15;
  refs.sprite.scale.setScalar(1.4 + pulse * 0.25);
}

/**
 * Detach from the scene graph and free the per-instance materials. Geometries
 * are shared module singletons, so they're deliberately NOT disposed here; the
 * shared glyph texture is likewise retained (disposing a material never frees
 * its map). Only the throwaway per-hack materials (chip board / core / pins,
 * ring, scanline, indicator sprite) are released.
 */
export function disposeHackVisuals(group: THREE.Group): void {
  if (group.parent) group.parent.remove(group);
  group.traverse((o) => {
    const mat = (o as THREE.Mesh | THREE.Sprite).material as
      | THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
  group.userData.hackRefs = undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// HackBeam — the intrusion beam fired from the deck's emitter into the target
// when a chip is deployed. A JAGGED lightning bolt (not a straight line) that
// snaps taut, flickers between a few pre-jittered shapes for an electric feel,
// fires a couple of branching forks, and streams glowing "data packets" down
// its length into the target before fading. Lives in an array updated each
// frame (returns true when spent).
//
// The bolt geometry is baked in world space at construction (the strike only
// lives ~0.45s, so it doesn't need to track a moving target), and a small set
// of jittered variants is cycled each frame to fake live arcing — cheap, since
// only a handful of enemies are ever hacked at once.
// ─────────────────────────────────────────────────────────────────────────
export class HackBeam {
  private group = new THREE.Group();
  private coreMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private packetMat: THREE.MeshBasicMaterial;
  private core: THREE.Mesh;
  private glow: THREE.Mesh;
  private packets: THREE.Mesh[] = [];
  private variants: { core: THREE.TubeGeometry; glow: THREE.TubeGeometry }[] = [];
  private curve: THREE.CatmullRomCurve3;
  private age = 0;
  private readonly life = 0.45;
  private variant = 0;
  private flickerT = 0;
  private readonly len: number;

  constructor(scene: THREE.Scene, start: THREE.Vector3, end: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(end, start);
    this.len = Math.max(0.001, dir.length());
    const fwd = dir.clone().normalize();
    // Two perpendicular axes to scatter the bolt's kinks across.
    const up = Math.abs(fwd.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const ax1 = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const ax2 = new THREE.Vector3().crossVectors(fwd, ax1).normalize();
    const jitter = Math.min(0.6, this.len * 0.06);

    // Build a jagged path between start and end with perpendicular noise; the
    // ends stay pinned so the bolt actually connects emitter → target.
    const makePath = (): THREE.CatmullRomCurve3 => {
      const segs = 7;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const p = new THREE.Vector3().lerpVectors(start, end, u);
        if (i > 0 && i < segs) {
          const taper = Math.sin(u * Math.PI); // most kink in the middle
          p.addScaledVector(ax1, (Math.random() - 0.5) * 2 * jitter * taper);
          p.addScaledVector(ax2, (Math.random() - 0.5) * 2 * jitter * taper);
        }
        pts.push(p);
      }
      return new THREE.CatmullRomCurve3(pts);
    };

    // A few jittered variants to flicker between (live arcing).
    this.curve = makePath();
    for (let v = 0; v < 3; v++) {
      const curve = v === 0 ? this.curve : makePath();
      this.variants.push({
        core: new THREE.TubeGeometry(curve, 16, 0.05, 6, false),
        glow: new THREE.TubeGeometry(curve, 16, 0.17, 6, false),
      });
    }

    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0xeaffe0, transparent: true, opacity: 1, toneMapped: false, depthWrite: false,
    });
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0x39ff14, transparent: true, opacity: 0.4, toneMapped: false,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.core = new THREE.Mesh(this.variants[0].core, this.coreMat);
    this.glow = new THREE.Mesh(this.variants[0].glow, this.glowMat);
    this.core.userData.cannotReceiveAO = true;
    this.glow.userData.cannotReceiveAO = true;
    this.group.add(this.glow, this.core);

    // Branching forks — short dead-end arcs that split off the main bolt.
    for (let f = 0; f < 2; f++) {
      const u0 = 0.3 + Math.random() * 0.4;
      const base = this.curve.getPoint(u0);
      const forkPts = [base.clone()];
      const dirF = new THREE.Vector3()
        .addScaledVector(ax1, (Math.random() - 0.5) * 2)
        .addScaledVector(ax2, (Math.random() - 0.5) * 2)
        .addScaledVector(fwd, (Math.random() - 0.5))
        .normalize();
      const flen = 0.4 + Math.random() * this.len * 0.18;
      forkPts.push(base.clone().addScaledVector(dirF, flen * 0.5));
      forkPts.push(base.clone().addScaledVector(dirF, flen)
        .addScaledVector(ax1, (Math.random() - 0.5) * jitter));
      const forkCurve = new THREE.CatmullRomCurve3(forkPts);
      const forkGeo = new THREE.TubeGeometry(forkCurve, 6, 0.03, 5, false);
      const fork = new THREE.Mesh(forkGeo, this.coreMat);
      fork.userData.cannotReceiveAO = true;
      this.group.add(fork);
    }

    // Data packets streaming down the bolt into the target.
    this.packetMat = new THREE.MeshBasicMaterial({
      color: 0xbcffd0, transparent: true, opacity: 0.95, toneMapped: false,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const packetGeo = new THREE.OctahedronGeometry(0.13, 0);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(packetGeo, this.packetMat);
      m.userData.cannotReceiveAO = true;
      m.userData.phase = i / 4;
      this.packets.push(m);
      this.group.add(m);
    }

    scene.add(this.group);
  }

  update(dt: number): boolean {
    this.age += dt;
    const p = this.age / this.life;
    if (p >= 1) return true;

    // Flicker between jittered variants ~30×/s for live arcing.
    this.flickerT += dt;
    if (this.flickerT > 0.033) {
      this.flickerT = 0;
      this.variant = (this.variant + 1) % this.variants.length;
      this.core.geometry = this.variants[this.variant].core;
      this.glow.geometry = this.variants[this.variant].glow;
    }

    // Bright snap on impact, then a flickering fade.
    const fade = 1 - p;
    const sputter = 0.75 + Math.abs(Math.sin(this.age * 70)) * 0.25;
    this.coreMat.opacity = fade * sputter;
    this.glowMat.opacity = 0.45 * fade * (0.6 + sputter * 0.4);
    const swell = 1 + Math.sin(this.age * 55) * 0.12;
    this.glow.scale.setScalar(swell);

    // Stream the data packets along the curve into the target.
    for (const m of this.packets) {
      const phase = m.userData.phase as number;
      const u = (p * 2.2 + phase) % 1;
      this.curve.getPoint(u, m.position);
      const s = (0.6 + Math.sin((p + phase) * Math.PI * 3) * 0.4) * fade;
      m.scale.setScalar(Math.max(0.01, s));
    }
    this.packetMat.opacity = 0.95 * fade;
    return false;
  }

  dispose(scene: THREE.Scene, disposeMaterials = true): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    // Variant geometries swapped onto the meshes may not all be currently
    // attached, so dispose the full set explicitly.
    for (const v of this.variants) { v.core.dispose(); v.glow.dispose(); }
    // disposeMaterials=false is used by the shader warmup: it frees the
    // per-instance tube geometries but KEEPS the three MeshBasic materials alive
    // so their linked program stays in the renderer's cache, so the first real
    // Subverter beam in a fight never stalls compiling it.
    if (disposeMaterials) {
      this.coreMat.dispose();
      this.glowMat.dispose();
      this.packetMat.dispose();
    }
  }
}
