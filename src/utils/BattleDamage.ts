import * as THREE from 'three';

/**
 * BattleDamageSystem — persistent, accumulating *physical battle damage* on robot
 * enemies. Every shot that deals REAL damage punches a DENT + scrapes a SCUFF
 * into the enemy's armour exactly where it was hit. The damage builds up as the
 * robot is worn down — so by the time it's at low health it's visibly battered,
 * dented and scratched all over — rides the body as it walks, tumbles with the
 * death ragdoll, then fades out with the corpse.
 *
 * It is deliberately METAL-ONLY (no blood, no char, no molten glow): pushed-in
 * dome dents with a bright bare-metal highlight rim and a dark cast shadow that
 * fake real concave depth, plus bright scraped-metal scuffs and dark stress
 * gouges. The damage reads as a robot taking a physical beating.
 *
 * PERF (respects the project's GPU-bound invariants — see warmup/teardown notes):
 *   • ONE shared procedural ATLAS texture + ONE shared material → a single WebGL
 *     program. It links once in the loader warmup (call `prewarm`), so it never
 *     stutters mid-fight. A handful of unit-quad GEOMETRIES (one per atlas cell)
 *     give per-hit visual variety WITHOUT a second program — geometry count does
 *     not change the program-cache key, only the material/defines do.
 *   • Globally POOLED meshes — stamping a mark recycles a quad, so sustained fire
 *     allocates nothing. Hard caps per-enemy and total; oldest mark recycled.
 *   • Marks are children of the enemy GROUP, so they need no per-frame update of
 *     their own — three transforms them with the body for free.
 *   • Caps scale with particle density (passed in by the caller) so Low /
 *     Ultra-Low spend almost nothing.
 *
 * Materials on the pooled enemy meshes are SHARED per type, so a per-enemy body
 * tint / mesh deformation is impossible without breaking the instanced batching
 * (and true Rapier vertex-denting would regress the GPU-bound frame). Oriented
 * decals are the correct, AAA-standard way to show per-enemy physical wear.
 */
export interface BattleDamageOptions {
  /** Max marks kept on a single enemy (oldest recycled past this). */
  maxPerEnemy?: number;
  /** Hard ceiling on live marks across the whole field. */
  maxTotal?: number;
}

// Distinct damage motifs baked into the shared atlas (2×2 grid → 4 motifs).
const ATLAS_COLS = 2;
const ATLAS_ROWS = 2;

let _sharedTexture: THREE.Texture | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Procedural dent/scuff ATLAS. Four metal-damage motifs on one canvas, shared by
// every decal. Each motif fakes concave depth with a consistent top-left light:
// a soft dark depression, a dark cast-shadow crescent on the far rim, a bright
// bare-metal highlight crescent on the near rim, and scraped/gouged scratches.
// Normal alpha blend (NOT additive): dark pixels read as the dented hollow, bright
// pixels as freshly-scraped bare metal catching the light.
// ─────────────────────────────────────────────────────────────────────────────
function drawDent(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  lx: number, ly: number, // unit light direction (points toward the light)
  depth: number,          // 0..1 how deep/dark the hollow reads
): void {
  // 1) Soft occlusion hollow — the whole dent sits a touch darker than the plate.
  let g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  g.addColorStop(0, `rgba(16,18,22,${0.34 * depth})`);
  g.addColorStop(0.6, `rgba(12,13,16,${0.22 * depth})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 2) Cast-shadow crescent on the rim AWAY from the light (deepest darkness).
  const sx = cx - lx * r * 0.42;
  const sy = cy - ly * r * 0.42;
  g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.72);
  g.addColorStop(0, `rgba(4,5,7,${0.6 * depth})`);
  g.addColorStop(1, 'rgba(4,5,7,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.72, 0, Math.PI * 2);
  ctx.fill();

  // 3) Bright bare-metal highlight crescent on the rim TOWARD the light.
  const hx = cx + lx * r * 0.5;
  const hy = cy + ly * r * 0.5;
  g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.55);
  g.addColorStop(0, `rgba(214,220,230,${0.55 * (0.6 + depth * 0.4)})`);
  g.addColorStop(0.6, 'rgba(150,156,166,0.18)');
  g.addColorStop(1, 'rgba(150,156,166,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // 4) Torn rim — a broken bright ring of exposed metal around the breach.
  ctx.save();
  ctx.lineCap = 'round';
  for (let k = 0; k < 10; k++) {
    const a0 = Math.random() * Math.PI * 2;
    const rr = r * (0.55 + Math.random() * 0.22);
    const lit = (Math.cos(a0) * lx + Math.sin(a0) * ly) > 0; // facing the light?
    ctx.strokeStyle = lit
      ? `rgba(196,202,212,${0.30 + Math.random() * 0.25})`
      : `rgba(10,11,14,${0.30 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, a0, a0 + 0.35 + Math.random() * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScratch(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  width: number,
): void {
  // A scrape reads as a dark groove with a bright bare-metal core riding it.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(8,9,12,${0.45 + Math.random() * 0.25})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = `rgba(206,212,222,${0.4 + Math.random() * 0.3})`;
  ctx.lineWidth = Math.max(0.5, width * 0.45);
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, y0 - 0.5);
  ctx.lineTo(x1 + 0.5, y1 - 0.5);
  ctx.stroke();
  ctx.restore();
}

function getDamageAtlas(): THREE.Texture {
  if (_sharedTexture) return _sharedTexture;
  const cell = 128;
  const size = cell * 2; // 2×2 atlas → 256²
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fallback: a tiny soft dark dot so the system still works headless.
    _sharedTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 160]), 1, 1, THREE.RGBAFormat);
    _sharedTexture.needsUpdate = true;
    return _sharedTexture;
  }
  // Consistent light from the top-left across every motif so the dents read as
  // concave once the system rolls each decal to align with world-up.
  const LX = -0.7, LY = -0.7;

  const cellCenter = (col: number, row: number) => ({ cx: col * cell + cell / 2, cy: row * cell + cell / 2 });

  // ── Cell 0 (0,0): one deep impact crater + radial stress cracks. ──────────
  {
    const { cx, cy } = cellCenter(0, 0);
    drawDent(ctx, cx, cy, 50, LX, LY, 1.0);
    ctx.save();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + Math.random() * 0.5;
      const r1 = 14 + Math.random() * 8;
      const r2 = 40 + Math.random() * 24;
      drawScratch(ctx, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, 0.7 + Math.random() * 1.2);
    }
    ctx.restore();
  }

  // ── Cell 1 (1,0): a cluster of small pock dents (shotgun/SMG peppering). ───
  {
    const { cx, cy } = cellCenter(1, 0);
    const pocks = 5;
    for (let k = 0; k < pocks; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 38;
      const px = cx + Math.cos(a) * d;
      const py = cy + Math.sin(a) * d;
      drawDent(ctx, px, py, 12 + Math.random() * 16, LX, LY, 0.75 + Math.random() * 0.25);
    }
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2;
      const len = 20 + Math.random() * 26;
      drawScratch(ctx, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, 0.6 + Math.random());
    }
  }

  // ── Cell 2 (0,1): a long diagonal gouge / scrape with a shallow dent. ─────
  {
    const { cx, cy } = cellCenter(0, 1);
    drawDent(ctx, cx, cy, 40, LX, LY, 0.55);
    const ga = -0.7 + Math.random() * 0.4;
    const gl = 46;
    drawScratch(ctx, cx - Math.cos(ga) * gl, cy - Math.sin(ga) * gl, cx + Math.cos(ga) * gl, cy + Math.sin(ga) * gl, 2.4 + Math.random());
    for (let k = 0; k < 5; k++) {
      const off = (Math.random() - 0.5) * 34;
      const px = cx + Math.cos(ga + Math.PI / 2) * off;
      const py = cy + Math.sin(ga + Math.PI / 2) * off;
      const l2 = 26 + Math.random() * 28;
      drawScratch(ctx, px - Math.cos(ga) * l2, py - Math.sin(ga) * l2, px + Math.cos(ga) * l2, py + Math.sin(ga) * l2, 0.5 + Math.random() * 1.1);
    }
  }

  // ── Cell 3 (1,1): a buckled / cracked plate — angular dent + paint scuff. ──
  {
    const { cx, cy } = cellCenter(1, 1);
    drawDent(ctx, cx, cy, 44, LX, LY, 0.85);
    // Angular crack lines fanning from the impact.
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.random() * 0.4;
      let x = cx + Math.cos(a) * 8;
      let y = cy + Math.sin(a) * 8;
      ctx.strokeStyle = `rgba(6,7,10,${0.4 + Math.random() * 0.3})`;
      ctx.lineWidth = 0.7 + Math.random();
      ctx.beginPath();
      ctx.moveTo(x, y);
      let aa = a;
      const segs = 2 + ((Math.random() * 2) | 0);
      for (let s = 0; s < segs; s++) {
        aa += (Math.random() - 0.5) * 0.9;
        const step = 14 + Math.random() * 14;
        x += Math.cos(aa) * step;
        y += Math.sin(aa) * step;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    // A couple of bright bare-metal nicks.
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = 10 + Math.random() * 30;
      const px = cx + Math.cos(a) * d;
      const py = cy + Math.sin(a) * d;
      drawScratch(ctx, px, py, px + (Math.random() - 0.5) * 18, py + (Math.random() - 0.5) * 18, 0.6 + Math.random());
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _sharedTexture = tex;
  return tex;
}

export class BattleDamageSystem {
  private readonly scene: THREE.Scene;
  private readonly geos: THREE.PlaneGeometry[] = []; // one per atlas cell (shared material)
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly pool: THREE.Mesh[] = [];
  private readonly active = new Map<THREE.Object3D, THREE.Mesh[]>();
  private readonly maxPerEnemy: number;
  private readonly maxTotal: number;
  private liveCount = 0;

  // Scratch — addImpact must never retain a caller's vector, so it copies in.
  private readonly _pos = new THREE.Vector3();
  private readonly _nrm = new THREE.Vector3();
  private readonly _up = new THREE.Vector3();
  private readonly _x = new THREE.Vector3();
  private readonly _y = new THREE.Vector3();
  private readonly _basis = new THREE.Matrix4();
  private readonly _quat = new THREE.Quaternion();
  private readonly _roll = new THREE.Quaternion();
  private static readonly _WORLD_UP = new THREE.Vector3(0, 1, 0);
  private static readonly _WORLD_FWD = new THREE.Vector3(0, 0, 1);
  private static readonly _Z = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, opts: BattleDamageOptions = {}) {
    this.scene = scene;
    this.maxPerEnemy = Math.max(1, opts.maxPerEnemy ?? 12);
    this.maxTotal = Math.max(this.maxPerEnemy, opts.maxTotal ?? 180);

    // One unit quad per atlas cell, each remapped to its cell's UV rect. All
    // share the SAME material → a single program; the per-cell geometry just
    // gives each stamp a different damage motif.
    const tex = getDamageAtlas();
    for (let row = 0; row < ATLAS_ROWS; row++) {
      for (let col = 0; col < ATLAS_COLS; col++) {
        const g = new THREE.PlaneGeometry(1, 1);
        const u0 = col / ATLAS_COLS;
        const u1 = (col + 1) / ATLAS_COLS;
        const v0 = 1 - (row + 1) / ATLAS_ROWS;
        const v1 = 1 - row / ATLAS_ROWS;
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        // PlaneGeometry vert order: TL, TR, BL, BR.
        uv.setXY(0, u0, v1);
        uv.setXY(1, u1, v1);
        uv.setXY(2, u0, v0);
        uv.setXY(3, u1, v0);
        uv.needsUpdate = true;
        this.geos.push(g);
      }
    }

    this.mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Pull the decal toward the camera a hair so it never z-fights the armour.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.FrontSide,
      toneMapped: true,
      fog: true,
    });
  }

  private randomGeo(): THREE.PlaneGeometry {
    return this.geos[(Math.random() * this.geos.length) | 0];
  }

  // Free the oldest live mark from any enemy (used when the global cap is hit so
  // a fresh hit can always leave a mark). Returns it detached, ready to reuse;
  // liveCount is unchanged because the caller re-uses it immediately.
  private stealOldest(): THREE.Mesh | undefined {
    for (const [h, l] of this.active) {
      if (l.length > 0) {
        const d = l.shift()!;
        h.remove(d);
        return d;
      }
    }
    return undefined;
  }

  private obtain(): THREE.Mesh {
    const m = this.pool.pop();
    if (m) { m.visible = true; return m; }
    const mesh = new THREE.Mesh(this.randomGeo(), this.mat);
    mesh.renderOrder = 4; // draw over the body shell
    mesh.userData.isBattleDamage = true;
    return mesh;
  }

  /**
   * Stamp a dent + scuff on `host` (the enemy group) at world-space `worldPos`,
   * facing world `outwardNormal` (points away from the body — i.e. back toward
   * the shot). `size` is the mark's world diameter (scaled by weapon damage by
   * the caller). Safe to call every hit; no-op-safe.
   */
  addImpact(host: THREE.Object3D, worldPos: THREE.Vector3, outwardNormal: THREE.Vector3, size = 0.7): void {
    if (!host) return;
    this._pos.copy(worldPos);
    this._nrm.copy(outwardNormal);
    if (this._nrm.lengthSq() < 1e-6) this._nrm.set(0, 0, 1);
    this._nrm.normalize();

    let list = this.active.get(host);
    if (!list) { list = []; this.active.set(host, list); }

    // Pick the mesh to use: reuse this enemy's oldest mark once it's saturated;
    // else if the global ceiling is hit, steal the oldest mark from any enemy;
    // otherwise pull a fresh one from the pool.
    let decal: THREE.Mesh | undefined;
    if (list.length >= this.maxPerEnemy) {
      decal = list.shift();             // oldest mark on THIS enemy
      if (decal) host.remove(decal);
    } else if (this.liveCount >= this.maxTotal) {
      decal = this.stealOldest();       // free one globally (liveCount unchanged)
    }
    if (!decal) {
      decal = this.obtain();
      this.liveCount++;
    }
    // Pick a fresh damage motif for this stamp (varies the look per hit).
    decal.geometry = this.randomGeo();

    // Orient: quad's +Z faces outward along the surface normal, and its +Y is
    // rolled to align with world-up projected onto the surface — so the baked
    // top-left light reads as a genuinely concave dent rather than a flat sticker.
    // A small random roll keeps repeated hits from looking template-stamped.
    this._up.copy(BattleDamageSystem._WORLD_UP);
    if (Math.abs(this._up.dot(this._nrm)) > 0.985) this._up.copy(BattleDamageSystem._WORLD_FWD);
    this._x.crossVectors(this._up, this._nrm).normalize();
    this._y.crossVectors(this._nrm, this._x).normalize();
    this._basis.makeBasis(this._x, this._y, this._nrm);
    this._quat.setFromRotationMatrix(this._basis);
    // Keep the mark essentially upright on the plating (square to the surface) —
    // only a hair of random roll so repeated hits aren't visibly identical, never
    // enough to read as "tilted/floating".
    this._roll.setFromAxisAngle(BattleDamageSystem._Z, (Math.random() - 0.5) * 0.18);
    this._quat.multiply(this._roll);

    // Nudge the mark a touch off the surface along the normal so it sits on top
    // of the plating, and give it a little size variety.
    decal.position.copy(this._pos).addScaledVector(this._nrm, 0.04);
    decal.quaternion.copy(this._quat);
    decal.scale.setScalar(size * (0.85 + Math.random() * 0.4));

    // Reparent onto the enemy preserving the world transform we just set, so the
    // mark sticks to the exact spot on the moving/scaling body.
    host.attach(decal);
    list.push(decal);
  }

  /** Return all of a host's marks to the pool (enemy death / respawn / cleanup). */
  clearFor(host: THREE.Object3D): void {
    const list = this.active.get(host);
    if (!list) return;
    for (const decal of list) {
      host.remove(decal);
      decal.visible = false;
      this.pool.push(decal);
    }
    this.liveCount -= list.length;
    if (this.liveCount < 0) this.liveCount = 0;
    list.length = 0;
    this.active.delete(host);
  }

  /**
   * Render one throwaway decal during the loader so the shared material's WebGL
   * program links there, never on the first real hit mid-fight. Returns the mesh
   * so the caller can remove it after the compile pass (the shared material stays
   * alive on this system, so its program persists for the rest of the run).
   */
  prewarm(worldPos: THREE.Vector3): THREE.Mesh {
    const m = new THREE.Mesh(this.geos[0], this.mat);
    m.position.copy(worldPos);
    m.renderOrder = 4;
    this.scene.add(m);
    return m;
  }

  /** Drop every live mark (scene reset). Keeps the pool for reuse. */
  reset(): void {
    for (const [host, list] of this.active) {
      for (const decal of list) { host.remove(decal); decal.visible = false; this.pool.push(decal); }
      list.length = 0;
    }
    this.active.clear();
    this.liveCount = 0;
  }

  /** Free GPU resources (scene teardown). */
  dispose(): void {
    this.reset();
    for (const decal of this.pool) decal.removeFromParent();
    this.pool.length = 0;
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    this.mat.dispose();
    if (_sharedTexture) { _sharedTexture.dispose(); _sharedTexture = null; }
  }
}
