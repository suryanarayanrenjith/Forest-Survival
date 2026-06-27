import * as THREE from 'three';

/**
 * BattleDamageSystem — persistent, accumulating battle-damage decals on robot
 * enemies. Every shot that deals REAL damage stamps a scorched-armour / molten
 * impact mark on the enemy where it was hit; the marks build up as the robot is
 * worn down, ride the body as it walks, tumble with the death ragdoll, then fade
 * out with the corpse.
 *
 * PERF (respects the project's GPU-bound invariants):
 *   • ONE shared procedural texture + ONE shared material + ONE shared unit-quad
 *     geometry across every decal → a single WebGL program, links once in the
 *     loader warmup (call `prewarm`), never stutters mid-fight.
 *   • Globally POOLED meshes — stamping a mark recycles a quad, so sustained
 *     fire allocates nothing. Hard caps per-enemy and total, oldest recycled.
 *   • Decals are children of the enemy GROUP, so they need no per-frame update
 *     of their own — three transforms them with the body for free.
 *   • Caps scale with particle density so Low / Ultra-Low spend almost nothing.
 *
 * Materials on the pooled enemy meshes are SHARED per type, so a per-enemy body
 * tint is impossible without breaking batching — decals are the correct way to
 * show per-enemy wear, and read far more like real battle damage anyway.
 */
export interface BattleDamageOptions {
  /** Max marks kept on a single enemy (oldest recycled past this). */
  maxPerEnemy?: number;
  /** Hard ceiling on live marks across the whole field. */
  maxTotal?: number;
}

let _sharedTexture: THREE.Texture | null = null;

// Procedural impact texture: a charred-metal scorch ring with torn lighter rim,
// radiating cracks and a hot molten core — reads as "armour blown open" on a
// sci-fi robot. Generated once, shared by every decal.
function getImpactTexture(): THREE.Texture {
  if (_sharedTexture) return _sharedTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fallback: a tiny soft dot so the system still works headless.
    _sharedTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 180]), 1, 1, THREE.RGBAFormat);
    _sharedTexture.needsUpdate = true;
    return _sharedTexture;
  }
  const cx = size / 2;
  const cy = size / 2;

  // 1) Outer scorch — slightly irregular charred halo (several offset circles).
  for (let k = 0; k < 5; k++) {
    const ox = cx + (Math.random() - 0.5) * 10;
    const oy = cy + (Math.random() - 0.5) * 10;
    const r = 46 + Math.random() * 14;
    const g = ctx.createRadialGradient(ox, oy, 3, ox, oy, r);
    g.addColorStop(0, 'rgba(18,13,10,0.55)');
    g.addColorStop(0.55, 'rgba(10,8,6,0.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2) Torn exposed-metal rim around the breach (lighter scratched ring).
  ctx.save();
  ctx.strokeStyle = 'rgba(150,150,160,0.5)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 14; k++) {
    const a0 = Math.random() * Math.PI * 2;
    const rr = 16 + Math.random() * 8;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, a0, a0 + 0.4 + Math.random() * 0.6);
    ctx.stroke();
  }
  ctx.restore();

  // 3) Radiating cracks / shrapnel scratches.
  ctx.save();
  ctx.strokeStyle = 'rgba(8,6,5,0.7)';
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + Math.random() * 0.5;
    const r1 = 10 + Math.random() * 6;
    const r2 = 30 + Math.random() * 26;
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.restore();

  // 4) Hot molten core — glowing exposed innards (bright, unlit → reads as hot).
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
  core.addColorStop(0, 'rgba(255,236,170,0.95)');
  core.addColorStop(0.35, 'rgba(255,150,60,0.85)');
  core.addColorStop(0.7, 'rgba(150,45,15,0.45)');
  core.addColorStop(1, 'rgba(40,12,6,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fill();

  // 5) Charred punch-through at the very centre.
  const hole = ctx.createRadialGradient(cx, cy, 0, cx, cy, 7);
  hole.addColorStop(0, 'rgba(5,3,2,0.9)');
  hole.addColorStop(1, 'rgba(5,3,2,0)');
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  _sharedTexture = tex;
  return tex;
}

export class BattleDamageSystem {
  private readonly scene: THREE.Scene;
  private readonly geo: THREE.PlaneGeometry;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly pool: THREE.Mesh[] = [];
  private readonly active = new Map<THREE.Object3D, THREE.Mesh[]>();
  private readonly maxPerEnemy: number;
  private readonly maxTotal: number;
  private liveCount = 0;

  // Scratch — addImpact must never retain a caller's vector, so it copies in.
  private readonly _pos = new THREE.Vector3();
  private readonly _nrm = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _roll = new THREE.Quaternion();
  private static readonly _Z = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, opts: BattleDamageOptions = {}) {
    this.scene = scene;
    this.maxPerEnemy = Math.max(1, opts.maxPerEnemy ?? 7);
    this.maxTotal = Math.max(this.maxPerEnemy, opts.maxTotal ?? 140);
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.mat = new THREE.MeshBasicMaterial({
      map: getImpactTexture(),
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
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.renderOrder = 4; // draw over the body shell
    mesh.userData.isBattleDamage = true;
    return mesh;
  }

  /**
   * Stamp a battle-damage mark on `host` (the enemy group) at world-space
   * `worldPos`, facing world `outwardNormal` (points away from the body — e.g.
   * back toward the shooter). `size` is the mark's world diameter (≈ scaled by
   * the weapon's damage by the caller). Safe to call every hit; no-op-safe.
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

    // Orient: quad's +Z faces outward along the surface normal, with a random
    // roll so repeated hits don't look stamped from a template. Nudge the mark a
    // touch off the surface along the normal so it sits on top of the plating.
    this._quat.setFromUnitVectors(BattleDamageSystem._Z, this._nrm);
    this._roll.setFromAxisAngle(BattleDamageSystem._Z, Math.random() * Math.PI * 2);
    this._quat.multiply(this._roll);

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
    const m = new THREE.Mesh(this.geo, this.mat);
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
    this.geo.dispose();
    this.mat.dispose();
    if (_sharedTexture) { _sharedTexture.dispose(); _sharedTexture = null; }
  }
}
