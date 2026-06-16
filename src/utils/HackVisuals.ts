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
  scanMat: THREE.MeshBasicMaterial;
  spriteMat: THREE.SpriteMaterial;
  ring: THREE.Mesh;
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

  const refs: HackVisualRefs = { chipCore, ringMat, scanMat, spriteMat, ring, scan, sprite, chip };
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

  // Chip core glow
  refs.chipCore.emissive.copy(col);
  refs.chipCore.emissiveIntensity = 1.0 + pulse * 1.6;
  refs.chip.scale.setScalar(1 + Math.sin(t * 9 * urgency) * 0.06);

  // Ring — spin, breathe, recolour
  refs.ring.rotation.z += dt * (2 + urgency * 3);
  refs.ring.scale.setScalar(0.9 + Math.sin(t * 4 * urgency) * 0.12);
  refs.ringMat.color.copy(col);
  refs.ringMat.opacity = 0.55 + pulse * 0.4;

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
// when a chip is deployed. A bright tapered bolt that snaps taut, crackles,
// then fades. Lives in an array updated each frame (returns true when spent).
// ─────────────────────────────────────────────────────────────────────────
const _beamMatProto = { color: 0x9dff6a };
export class HackBeam {
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private glow: THREE.Mesh;
  private age = 0;
  private readonly life = 0.4;
  private readonly len: number;

  constructor(scene: THREE.Scene, start: THREE.Vector3, end: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(end, start);
    this.len = Math.max(0.001, dir.length());
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), dir.clone().normalize(),
    );

    this.mat = new THREE.MeshBasicMaterial({
      color: _beamMatProto.color, transparent: true, opacity: 0.95,
      toneMapped: false, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, this.len, 7, 1, true), this.mat);
    this.mesh.position.copy(mid);
    this.mesh.quaternion.copy(quat);
    this.mesh.userData.cannotReceiveAO = true;
    scene.add(this.mesh);

    // Soft outer glow sleeve
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0x39ff14, transparent: true, opacity: 0.35,
      toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, this.len, 8, 1, true), this.glowMat);
    this.glow.position.copy(mid);
    this.glow.quaternion.copy(quat);
    this.glow.userData.cannotReceiveAO = true;
    scene.add(this.glow);
  }

  update(dt: number): boolean {
    this.age += dt;
    const p = this.age / this.life;
    if (p >= 1) return true;
    // Snap taut quickly, then thin + fade. Crackle the radius for an electric feel.
    const crackle = 1 + Math.sin(this.age * 90) * 0.25;
    const fade = 1 - p;
    this.mat.opacity = 0.95 * fade;
    this.glowMat.opacity = 0.4 * fade;
    this.mesh.scale.set(crackle * fade, 1, crackle * fade);
    this.glow.scale.set((0.8 + p) * crackle, 1, (0.8 + p) * crackle);
    return false;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    scene.remove(this.glow);
    this.mesh.geometry.dispose();
    this.glow.geometry.dispose();
    this.mat.dispose();
    this.glowMat.dispose();
  }
}
