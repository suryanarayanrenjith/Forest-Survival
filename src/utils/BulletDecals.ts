import * as THREE from 'three';
import type { MapType } from './MapSystem';

/**
 * BulletDecalSystem — hyper-real environment bullet marks.
 *
 * Every round that strikes the WORLD (a tree, rock, wall, pillar or the ground)
 * punches an oriented bullet-hole decal at the exact contact point — a dark
 * penetration core, a scorched rim, radiating cracks/splinters and a soft dust
 * halo, all tinted to the surface it hit (bark brown, stone grey, sand tan,
 * snow, charred basalt, violet earth…). The mark's SIZE + MOTIF track the gun:
 * a sniper blows a big cracked spall, a shotgun peppers small pocks, the pistol/
 * rifle/SMG leave clean holes.
 *
 * Runs on EVERY graphics tier (unlike the High/Ultra ambience) — it is cheap
 * enough: ONE procedural atlas texture + ONE shader program (per-decal material
 * CLONES share it), pooled quads, hard caps that scale with the preset's
 * particle density so Low/Ultra-Low keep only a few marks.
 *
 * SAFE DISPOSAL (the core perf contract):
 *   • Each mark has a bounded LIFETIME, then fades out over ~2 s and returns to
 *     the pool — nothing accumulates forever.
 *   • Marks that fall outside a cull radius around the player (out of view /
 *     far downrange) are reclaimed IMMEDIATELY, every frame, so walking away
 *     from a firefight frees its marks instead of stranding hundreds behind you.
 *   • A hard global cap recycles the oldest mark when a fresh hit would exceed
 *     it, so sustained automatic fire can never grow the live set unbounded.
 *   • Fully pooled: stamping recycles a quad + its material, so held-trigger
 *     fire allocates nothing after warmup.
 *
 * Unlike BattleDamage (which parents marks to a moving enemy) these live in
 * WORLD space on static terrain, so the system owns a per-frame update that
 * ages, fades and culls them. Each pooled decal carries its OWN cloned material
 * (same program, so one compile) purely so its opacity + tint fade independently
 * of every other mark.
 */

export interface BulletDecalOptions {
  /** Hard ceiling on live marks (recycled oldest-first past this). */
  maxTotal?: number;
  /** Seconds a mark stays at full strength before it starts fading. */
  lifetime?: number;
  /** Seconds the fade-out takes. */
  fadeDuration?: number;
}

const ATLAS_COLS = 2;
const ATLAS_ROWS = 2;

let _sharedTexture: THREE.Texture | null = null;

// ── Per-map surface tints (multiply the neutral atlas). Keyed by hit surface:
//    `ground` (the floor), `cover` (the map's TALL structural props — bark in
//    the forest, but concrete walls at the outpost, sandstone mesas in the
//    desert, stone columns in the ruins…) and `rock` (rocks / boulders /
//    debris). Values are the material of THAT map's props, not a literal wood/
//    stone split. The atlas core stays dark under any tint; the rim + dust halo
//    take the surface colour. ────────────────────────────────────────────────
interface SurfacePalette { ground: number; cover: number; rock: number; }
const MAP_PALETTES: Record<MapType, SurfacePalette> = {
  deep_forest:        { ground: 0x6b5a3a, cover: 0x5a3f26, rock: 0x717668 }, // dirt · bark · mossy stone
  scorched_wasteland: { ground: 0x2a211c, cover: 0x241a14, rock: 0x1d1815 }, // ash · charred stump · basalt
  frozen_tundra:      { ground: 0xd6e4f2, cover: 0x6a5f52, rock: 0x8fa0ac }, // snow · frosted trunk · ice-rock
  desert_canyon:      { ground: 0xc2a06a, cover: 0x9a6f3c, rock: 0xb08150 }, // sand · sandstone mesa · rock
  toxic_swamp:        { ground: 0x3f4a30, cover: 0x33291d, rock: 0x3a4436 }, // silt · gnarled bark · wet stone
  military_outpost:   { ground: 0x565349, cover: 0x5a5a52, rock: 0x6a6a62 }, // gravel · concrete wall · sandbag/stone
  autumn_grove:       { ground: 0x3a2b48, cover: 0x241432, rock: 0x2f2440 }, // violet earth · dark bark · obsidian
  ancient_ruins:      { ground: 0x6f695a, cover: 0x6a6a5a, rock: 0x837f6f }, // flagstone · column · rubble
};
const DEFAULT_PALETTE = MAP_PALETTES.deep_forest;

// ── Per-weapon mark profile: which atlas motif + base world size. ────────────
interface DecalProfile { cell: number; size: number; }
const WEAPON_DECALS: Record<string, DecalProfile> = {
  pistol:  { cell: 0, size: 0.30 },
  rifle:   { cell: 0, size: 0.34 },
  smg:     { cell: 0, size: 0.24 },
  minigun: { cell: 0, size: 0.30 },
  shotgun: { cell: 3, size: 0.26 }, // each pellet stamps one → a natural cluster
  sniper:  { cell: 1, size: 0.62 }, // big cracked spall
  launcher:{ cell: 1, size: 0.95 }, // scorch blast (from rocket impact)
};
const DEFAULT_PROFILE: DecalProfile = { cell: 0, size: 0.30 };

// ─────────────────────────────────────────────────────────────────────────────
// Procedural bullet-impact ATLAS (2×2). Drawn in NEUTRAL grey/white so the
// per-decal colour tint recolours the rim + dust to any surface while the dark
// core stays dark. Consistent top-left key light on the crater lips so the hole
// reads concave once each decal rolls to align with world-up.
// ─────────────────────────────────────────────────────────────────────────────
function drawHole(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  lx: number, ly: number,
): void {
  // 1) Soft dust / scorch halo — light, low alpha (takes the surface tint).
  let g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 1.5);
  g.addColorStop(0, 'rgba(150,142,128,0.30)');
  g.addColorStop(0.5, 'rgba(120,112,100,0.16)');
  g.addColorStop(1, 'rgba(90,84,74,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // 2) Scorched rim ring — mid-dark, the crater lip.
  g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
  g.addColorStop(0, 'rgba(30,27,24,0.0)');
  g.addColorStop(0.7, 'rgba(26,22,19,0.55)');
  g.addColorStop(1, 'rgba(18,15,13,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 3) Deep penetration core — near-black, opaque.
  g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
  g.addColorStop(0, 'rgba(6,5,4,0.98)');
  g.addColorStop(0.6, 'rgba(9,7,6,0.9)');
  g.addColorStop(1, 'rgba(14,11,9,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // 4) Bare-lip highlight toward the light — fresh torn material catching sun.
  const hx = cx + lx * r * 0.42;
  const hy = cy + ly * r * 0.42;
  g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.5);
  g.addColorStop(0, 'rgba(224,216,200,0.5)');
  g.addColorStop(1, 'rgba(224,216,200,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrack(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, a: number, len: number,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(8,6,5,${0.45 + Math.random() * 0.3})`;
  ctx.lineWidth = 0.8 + Math.random() * 1.6;
  ctx.beginPath();
  let x = cx + Math.cos(a) * 6;
  let y = cy + Math.sin(a) * 6;
  ctx.moveTo(x, y);
  let aa = a;
  const segs = 2 + ((Math.random() * 3) | 0);
  const step = len / segs;
  for (let s = 0; s < segs; s++) {
    aa += (Math.random() - 0.5) * 0.8;
    x += Math.cos(aa) * step;
    y += Math.sin(aa) * step;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function getDecalAtlas(): THREE.Texture {
  if (_sharedTexture) return _sharedTexture;
  const cell = 128;
  const size = cell * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    _sharedTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 180]), 1, 1, THREE.RGBAFormat);
    _sharedTexture.needsUpdate = true;
    return _sharedTexture;
  }
  const LX = -0.7, LY = -0.7;
  const center = (col: number, row: number) => ({ cx: col * cell + cell / 2, cy: row * cell + cell / 2 });

  // Cell 0 (0,0): clean single hole (pistol / rifle / SMG / minigun).
  {
    const { cx, cy } = center(0, 0);
    drawHole(ctx, cx, cy, 30, LX, LY);
    for (let k = 0; k < 3; k++) drawCrack(ctx, cx, cy, Math.random() * Math.PI * 2, 14 + Math.random() * 14);
  }

  // Cell 1 (1,0): large cracked spall (sniper / launcher scorch).
  {
    const { cx, cy } = center(1, 0);
    drawHole(ctx, cx, cy, 40, LX, LY);
    for (let k = 0; k < 9; k++) drawCrack(ctx, cx, cy, (k / 9) * Math.PI * 2 + Math.random() * 0.5, 28 + Math.random() * 22);
    // Extra outer scorch ring for the heavy impact.
    const g = ctx.createRadialGradient(cx, cy, 30, cx, cy, 58);
    g.addColorStop(0, 'rgba(20,16,13,0.0)');
    g.addColorStop(0.7, 'rgba(20,16,13,0.28)');
    g.addColorStop(1, 'rgba(20,16,13,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); ctx.fill();
  }

  // Cell 2 (0,1): splinter burst (angled / wood shatter look).
  {
    const { cx, cy } = center(0, 1);
    drawHole(ctx, cx, cy, 26, LX, LY);
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2;
      drawCrack(ctx, cx, cy, a, 24 + Math.random() * 30);
    }
  }

  // Cell 3 (1,1): pock cluster (shotgun peppering / stray fragments).
  {
    const { cx, cy } = center(1, 1);
    const pocks = 5 + ((Math.random() * 3) | 0);
    for (let k = 0; k < pocks; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 40;
      drawHole(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 8 + Math.random() * 12, LX, LY);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _sharedTexture = tex;
  return tex;
}

interface LiveDecal {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;       // per-decal full-strength duration (jittered)
  baseOpacity: number;
}

export class BulletDecalSystem {
  private readonly scene: THREE.Scene;
  private readonly geos: THREE.PlaneGeometry[] = []; // one per atlas cell
  private readonly baseMat: THREE.MeshBasicMaterial;  // template — cloned per decal
  private readonly pool: LiveDecal[] = [];
  private readonly live: LiveDecal[] = [];
  private readonly maxTotal: number;
  private readonly lifetime: number;
  private readonly fadeDuration: number;
  private palette: SurfacePalette = DEFAULT_PALETTE;

  // Scratch — never retain a caller vector.
  private readonly _pos = new THREE.Vector3();
  private readonly _nrm = new THREE.Vector3();
  private readonly _up = new THREE.Vector3();
  private readonly _x = new THREE.Vector3();
  private readonly _y = new THREE.Vector3();
  private readonly _basis = new THREE.Matrix4();
  private readonly _quat = new THREE.Quaternion();
  private readonly _roll = new THREE.Quaternion();
  private readonly _col = new THREE.Color();
  private static readonly _WORLD_UP = new THREE.Vector3(0, 1, 0);
  private static readonly _WORLD_FWD = new THREE.Vector3(0, 0, 1);
  private static readonly _Z = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, opts: BulletDecalOptions = {}) {
    this.scene = scene;
    this.maxTotal = Math.max(8, opts.maxTotal ?? 90);
    this.lifetime = Math.max(4, opts.lifetime ?? 22);
    this.fadeDuration = Math.max(0.4, opts.fadeDuration ?? 1.8);

    const tex = getDecalAtlas();
    for (let row = 0; row < ATLAS_ROWS; row++) {
      for (let col = 0; col < ATLAS_COLS; col++) {
        const g = new THREE.PlaneGeometry(1, 1, 1, 1);
        const u0 = col / ATLAS_COLS, u1 = (col + 1) / ATLAS_COLS;
        const v0 = 1 - (row + 1) / ATLAS_ROWS, v1 = 1 - row / ATLAS_ROWS;
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
        }
        uv.needsUpdate = true;
        this.geos.push(g);
      }
    }

    this.baseMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Depth-bias toward the camera so a flush-placed decal never z-fights the
      // surface it sits on (bias is in depth space only — no world-space hover).
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.FrontSide,
      toneMapped: true,
      fog: true,
    });
  }

  /** Point the tints at the active map (call once at scene init). */
  configure(map: MapType): void {
    this.palette = MAP_PALETTES[map] ?? DEFAULT_PALETTE;
  }

  private tintFor(surface: 'ground' | 'cover' | 'rock'): number {
    if (surface === 'ground') return this.palette.ground;
    if (surface === 'cover') return this.palette.cover;
    return this.palette.rock;
  }

  private obtain(): LiveDecal {
    const pooled = this.pool.pop();
    if (pooled) { pooled.mesh.visible = true; return pooled; }
    const mat = this.baseMat.clone();
    const mesh = new THREE.Mesh(this.geos[0], mat);
    mesh.renderOrder = 3;
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    return { mesh, mat, age: 0, life: this.lifetime, baseOpacity: 0.92 };
  }

  private free(d: LiveDecal): void {
    d.mesh.visible = false;
    this.scene.remove(d.mesh);
    this.pool.push(d);
  }

  /**
   * Stamp a bullet mark at world `worldPos`, facing `outwardNormal` (points back
   * toward the shooter / up out of the ground). `weaponKey` selects the motif +
   * size; `surface` selects the tint family. Safe to call every hit.
   */
  addDecal(
    worldPos: THREE.Vector3,
    outwardNormal: THREE.Vector3,
    weaponKey: string,
    surface: 'ground' | 'cover' | 'rock',
  ): void {
    this._pos.copy(worldPos);
    this._nrm.copy(outwardNormal);
    if (this._nrm.lengthSq() < 1e-6) this._nrm.copy(BulletDecalSystem._WORLD_UP);
    this._nrm.normalize();

    // Recycle the oldest live mark once the global cap is reached.
    let decal: LiveDecal;
    if (this.live.length >= this.maxTotal) {
      decal = this.live.shift()!;
      this.scene.remove(decal.mesh);
    } else {
      decal = this.obtain();
    }

    const profile = WEAPON_DECALS[weaponKey] ?? DEFAULT_PROFILE;
    decal.mesh.geometry = this.geos[profile.cell] ?? this.geos[0];

    // Orient: +Z along the surface normal, +Y rolled toward world-up projected
    // on the surface so the baked top-left key light reads as a real crater.
    this._up.copy(BulletDecalSystem._WORLD_UP);
    if (Math.abs(this._up.dot(this._nrm)) > 0.985) this._up.copy(BulletDecalSystem._WORLD_FWD);
    this._x.crossVectors(this._up, this._nrm).normalize();
    this._y.crossVectors(this._nrm, this._x).normalize();
    this._basis.makeBasis(this._x, this._y, this._nrm);
    this._quat.setFromRotationMatrix(this._basis);
    this._roll.setFromAxisAngle(BulletDecalSystem._Z, Math.random() * Math.PI * 2);
    this._quat.multiply(this._roll);

    const scale = profile.size * (0.85 + Math.random() * 0.4);
    decal.mesh.position.copy(this._pos).addScaledVector(this._nrm, 0.01);
    decal.mesh.quaternion.copy(this._quat);
    decal.mesh.scale.setScalar(scale);
    decal.mesh.updateMatrix();

    this._col.setHex(this.tintFor(surface));
    decal.mat.color.copy(this._col);
    decal.baseOpacity = 0.82 + Math.random() * 0.14;
    decal.mat.opacity = 0; // fades in over the first fraction of a second
    decal.age = 0;
    decal.life = this.lifetime * (0.8 + Math.random() * 0.4);

    decal.mesh.visible = true;
    this.scene.add(decal.mesh);
    this.live.push(decal);
  }

  /**
   * Age, fade and CULL every live mark. Call once per frame with the real delta.
   * `cullDist` reclaims marks farther than that from the player immediately
   * (out of view / far downrange) so the live set tracks where the player is.
   */
  update(dt: number, cameraPos: THREE.Vector3, cullDist: number): void {
    if (this.live.length === 0) return;
    const cull2 = cullDist * cullDist;
    const fadeInDur = 0.12;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      // Distance cull — reclaim marks the player has left far behind.
      const dx = d.mesh.position.x - cameraPos.x;
      const dz = d.mesh.position.z - cameraPos.z;
      if (dx * dx + dz * dz > cull2) {
        this.free(d);
        this.live.splice(i, 1);
        continue;
      }
      d.age += dt;
      const fadeOutStart = d.life;
      if (d.age >= fadeOutStart + this.fadeDuration) {
        // Lived its full life — retire.
        this.free(d);
        this.live.splice(i, 1);
        continue;
      }
      let a = d.baseOpacity;
      if (d.age < fadeInDur) {
        a *= d.age / fadeInDur;                                   // quick fade-in
      } else if (d.age >= fadeOutStart) {
        a *= 1 - (d.age - fadeOutStart) / this.fadeDuration;      // fade-out
      }
      d.mat.opacity = a;
    }
  }

  /**
   * Render one throwaway decal so the shared program links during the loader
   * warmup, never on the first real shot. Returns the mesh for the caller to
   * remove after the compile pass; the base material persists for the run.
   */
  prewarm(worldPos: THREE.Vector3): THREE.Mesh {
    const m = new THREE.Mesh(this.geos[0], this.baseMat);
    m.position.copy(worldPos);
    m.renderOrder = 3;
    this.scene.add(m);
    return m;
  }

  /** Drop every live mark (scene reset); keeps the pool. */
  reset(): void {
    for (const d of this.live) { d.mesh.visible = false; this.scene.remove(d.mesh); this.pool.push(d); }
    this.live.length = 0;
  }

  /** Free all GPU resources (scene teardown). */
  dispose(): void {
    this.reset();
    for (const d of this.pool) { d.mesh.removeFromParent(); d.mat.dispose(); }
    this.pool.length = 0;
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    this.baseMat.dispose();
    if (_sharedTexture) { _sharedTexture.dispose(); _sharedTexture = null; }
  }
}
