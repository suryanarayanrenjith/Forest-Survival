import * as THREE from 'three';

/**
 * Shared muzzle-flash texture. The flash gradient is identical every shot, so
 * building a fresh <canvas> + GPU texture each time (the old behaviour) just
 * churned memory and stuttered auto-fire weapons. Built once, reused forever.
 */
let sharedFlashTexture: THREE.CanvasTexture | null = null;
function getFlashTexture(): THREE.CanvasTexture {
  if (sharedFlashTexture) return sharedFlashTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 200, 50, 0.9)');
  gradient.addColorStop(0.6, 'rgba(255, 140, 0, 0.6)');
  gradient.addColorStop(0.85, 'rgba(255, 80, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  sharedFlashTexture = new THREE.CanvasTexture(canvas);
  return sharedFlashTexture;
}

/**
 * Optional shared PointLight pool injected by the host scene. Adding /
 * removing PointLights from a three.js scene triggers a full shader
 * recompile of every material (the light count is baked into shader
 * uniforms at compile time) — which produced a visible per-shot stutter
 * on autofire weapons. The host pre-allocates a fixed pool and we
 * acquire/release via intensity toggling (which never recompiles).
 *
 * Reference: https://discourse.threejs.org/t/scene-freezes-when-adding-dynamically-pointlight/28281
 */
type MuzzleLightAcquire = () => THREE.PointLight | null;
type MuzzleLightRelease = (light: THREE.PointLight | null | undefined) => void;
let _muzzleLightAcquire: MuzzleLightAcquire | null = null;
let _muzzleLightRelease: MuzzleLightRelease | null = null;
export function setMuzzleLightPool(acquire: MuzzleLightAcquire, release: MuzzleLightRelease) {
  _muzzleLightAcquire = acquire;
  _muzzleLightRelease = release;
}

// Pooled flash sprites. Every shot built a fresh SpriteMaterial (one per
// trigger pull); recycling a small pool of sprites removes that per-shot
// allocation entirely. Overlapping autofire flashes each get their own pooled
// sprite, so concurrent flashes never share animated-opacity state.
const _flashSpritePool: THREE.Sprite[] = [];
function acquireFlashSprite(): THREE.Sprite {
  const s = _flashSpritePool.pop();
  if (s) {
    (s.material as THREE.SpriteMaterial).opacity = 1;
    return s;
  }
  const mat = new THREE.SpriteMaterial({
    map: getFlashTexture(),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.8, 0.8, 0.8); // Larger, more visible flash
  sprite.userData.cannotReceiveAO = true;
  return sprite;
}

/** Free every pooled flash sprite + its material (game teardown). */
export function clearFlashSpritePool(): void {
  for (const s of _flashSpritePool) (s.material as THREE.SpriteMaterial).dispose();
  _flashSpritePool.length = 0;
}

export class MuzzleFlash {
  light: THREE.PointLight | null;
  sprite: THREE.Sprite;
  lifetime: number = 0;
  private _initialIntensity: number;

  constructor(scene: THREE.Scene, position: THREE.Vector3, _color: number) {
    // Force realistic gun fire colors - yellow/orange (ignore passed color)
    const fireColor = 0xffaa00;

    // Borrow a PointLight from the host's pool if one is available. Pool
    // lights live in world space (scene-parented) and are toggled via
    // intensity rather than scene.add/remove, eliminating the per-shot
    // recompile stutter the user reported.
    if (_muzzleLightAcquire) {
      this.light = _muzzleLightAcquire();
      if (this.light) {
        this.light.color.setHex(fireColor);
        this.light.intensity = 20;
        this.light.distance = 15;
        this.light.position.copy(position);
      }
    } else {
      // Fallback path (e.g. tests that don't wire up the pool) —
      // allocate a fresh light. Should never run in production.
      this.light = new THREE.PointLight(fireColor, 20, 15);
      this.light.castShadow = false;
      this.light.position.copy(position);
      scene.add(this.light);
    }
    this._initialIntensity = 20;

    // Borrow a pooled sprite (its SpriteMaterial is reused — opacity reset on
    // acquire); the flash texture is shared across all flashes.
    this.sprite = acquireFlashSprite();
    this.sprite.position.copy(position);
    scene.add(this.sprite);

    this.lifetime = 0.08; // Shorter, snappier flash
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true; // Signal for removal
    }

    // Fast fade out for snappy feel
    const opacity = Math.pow(this.lifetime / 0.08, 0.5);
    if (this.light) this.light.intensity = this._initialIntensity * opacity;
    if (this.sprite.material instanceof THREE.SpriteMaterial) {
      this.sprite.material.opacity = opacity;
    }

    return false;
  }

  dispose(scene: THREE.Scene) {
    // Return pool light to the pool (intensity → 0, kept in scene), or
    // remove the fallback fresh light from the scene.
    if (this.light) {
      if (_muzzleLightRelease) {
        _muzzleLightRelease(this.light);
      } else {
        scene.remove(this.light);
      }
      this.light = null;
    }
    scene.remove(this.sprite);
    // Return the sprite (with its reusable material) to the pool instead of
    // disposing — the texture map is shared and must never be disposed here.
    if (_flashSpritePool.length < 8) _flashSpritePool.push(this.sprite);
    else if (this.sprite.material instanceof THREE.SpriteMaterial) this.sprite.material.dispose();
  }
}

/**
 * Shared muzzle-smoke texture — a soft, slightly wispy grey puff. Identical for
 * every shot, so it's built once and reused (same discipline as the flash).
 * Normal alpha (NOT additive) + a grey tint read it as drifting smoke rather
 * than light, sitting it into the cinematic atmosphere instead of glowing.
 */
let sharedSmokeTexture: THREE.CanvasTexture | null = null;
function getSmokeTexture(): THREE.CanvasTexture {
  if (sharedSmokeTexture) return sharedSmokeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c = canvas.getContext('2d')!;
  // Base soft round falloff.
  const base = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  base.addColorStop(0, 'rgba(255,255,255,0.95)');
  base.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  base.addColorStop(0.8, 'rgba(255,255,255,0.12)');
  base.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = base;
  c.fillRect(0, 0, 128, 128);
  // A few overlapping soft blobs break the perfect circle into a wispier cloud.
  for (let i = 0; i < 7; i++) {
    const bx = 64 + (Math.random() - 0.5) * 56;
    const by = 64 + (Math.random() - 0.5) * 56;
    const br = 16 + Math.random() * 26;
    const g = c.createRadialGradient(bx, by, 0, bx, by, br);
    const a = 0.10 + Math.random() * 0.16;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  sharedSmokeTexture = new THREE.CanvasTexture(canvas);
  return sharedSmokeTexture;
}

// Pooled smoke sprites. Every puff (muzzle wisp on each throttled shot +
// damaged-robot venting) used to allocate a fresh SpriteMaterial — a steady
// drip of heap garbage under sustained fire. Colour is a per-material uniform,
// so one pooled sprite serves gun-grey, soot-black and overclock-green puffs
// alike without a new shader program. Bounded to the host's combined caps.
const _smokeSpritePool: THREE.Sprite[] = [];
function acquireSmokeSprite(color: number): THREE.Sprite {
  const s = _smokeSpritePool.pop();
  if (s) {
    const m = s.material as THREE.SpriteMaterial;
    m.color.setHex(color);
    m.opacity = 0;
    m.rotation = 0;
    return s;
  }
  const mat = new THREE.SpriteMaterial({
    map: getSmokeTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0,
    color,
    fog: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.userData.cannotReceiveAO = true;
  return sprite;
}

/** Free every pooled smoke sprite + its material (game teardown). */
export function clearSmokeSpritePool(): void {
  for (const s of _smokeSpritePool) (s.material as THREE.SpriteMaterial).dispose();
  _smokeSpritePool.length = 0;
}

/**
 * A single lingering muzzle-smoke puff: one billboard sprite that drifts up and
 * forward off the barrel, expands, slowly tumbles and fades. The host spawns
 * these (throttled + hard-capped) so full-auto leaves a believable haze rather
 * than a wall of sprites. Shared texture + a POOLED sprite/material pair (no
 * texture upload, no per-puff allocation) keeps each puff almost free; the
 * sprite returns to the pool on dispose, the texture is shared and never
 * disposed here.
 */
export class MuzzleSmoke {
  sprite: THREE.Sprite;
  private life: number;
  private readonly maxLife: number;
  private readonly vel: THREE.Vector3;
  private readonly startScale: number;
  private readonly endScale: number;
  private readonly peakOpacity: number;
  private readonly spin: number;

  // Optional tuning so the SAME smoke sprite (and therefore the same shader
  // program) can serve both gun-muzzle smoke and the heavier, sootier smoke that
  // pours off a critically-damaged / hacked robot. Colour is a per-instance
  // uniform (not a program define), so a darker/greener puff costs no new program.
  constructor(scene: THREE.Scene, position: THREE.Vector3, forward: THREE.Vector3, opts?: {
    color?: number;        // tint (default cool gun-smoke grey)
    sizeScale?: number;    // multiplies start/end scale (bigger billows)
    lifeScale?: number;    // multiplies lifetime (lingers longer)
    opacityScale?: number; // multiplies peak opacity (thicker)
    rise?: number;         // extra upward velocity (m/s) added to the buoyant base
  }) {
    // Cool gun-smoke grey by default; fog ON so it grounds into the atmosphere.
    // Borrowed from the pool — colour/opacity reset on acquire.
    this.sprite = acquireSmokeSprite(opts?.color ?? 0x9a9ea6);
    this.sprite.position.copy(position);
    // Drift: a little along the barrel + a buoyant rise + slight random jitter.
    this.vel = new THREE.Vector3(
      forward.x * 0.45 + (Math.random() - 0.5) * 0.4,
      0.45 + Math.random() * 0.35 + (opts?.rise ?? 0),
      forward.z * 0.45 + (Math.random() - 0.5) * 0.4,
    );
    const sizeScale = opts?.sizeScale ?? 1;
    this.startScale = (0.16 + Math.random() * 0.08) * sizeScale;
    this.endScale = (0.85 + Math.random() * 0.5) * sizeScale;
    this.maxLife = (0.55 + Math.random() * 0.4) * (opts?.lifeScale ?? 1);
    this.life = this.maxLife;
    this.peakOpacity = (0.26 + Math.random() * 0.12) * (opts?.opacityScale ?? 1);
    this.spin = (Math.random() - 0.5) * 1.6;
    this.sprite.scale.setScalar(this.startScale);
    scene.add(this.sprite);
  }

  update(delta: number): boolean {
    this.life -= delta;
    if (this.life <= 0) return true;
    const p = 1 - this.life / this.maxLife; // 0 → 1 over its life
    // Expand (ease-out) so the puff blooms quickly then settles.
    const eased = 1 - (1 - p) * (1 - p);
    const s = this.startScale + (this.endScale - this.startScale) * eased;
    this.sprite.scale.setScalar(s);
    // Drift with air drag + buoyant lift.
    this.vel.multiplyScalar(Math.max(0, 1 - delta * 1.3));
    this.vel.y += delta * 0.35;
    this.sprite.position.addScaledVector(this.vel, delta);
    // Quick fade-in, long fade-out.
    const op = p < 0.18 ? (p / 0.18) * this.peakOpacity : this.peakOpacity * (1 - (p - 0.18) / 0.82);
    const mat = this.sprite.material as THREE.SpriteMaterial;
    mat.opacity = Math.max(0, op);
    mat.rotation += this.spin * delta;
    return false;
  }

  private _released = false;
  dispose(scene: THREE.Scene, _disposeMaterial = true) {
    if (this._released) return; // idempotent — warmup teardown double-disposes
    this._released = true;
    scene.remove(this.sprite);
    // Return the sprite (with its reusable material) to the bounded pool; only
    // overflow frees the material. 56 covers the muzzle + enemy-vent caps.
    if (_smokeSpritePool.length < 56) _smokeSpritePool.push(this.sprite);
    else if (this.sprite.material instanceof THREE.SpriteMaterial) this.sprite.material.dispose();
  }
}

// Shared tracer material. Every BulletTracer used to allocate its own
// LineBasicMaterial — even though every tracer is the same bright-yellow,
// linewidth-2 additive line. One shared material across the whole game.
// We can't share OPACITY (each tracer fades on its own clock) but since
// opacity is a single per-material uniform, sharing means every visible
// tracer fades with the most-recently-set value. In practice tracers all
// fade identically over 0.04s so they're effectively in sync, but to keep
// this clean we instead toggle visibility — fade is just visibility on/off
// over the short 40ms window, which reads identically to the old fade.
const sharedTracerMaterial = new THREE.LineBasicMaterial({
  color: 0xffffaa,
  transparent: true,
  opacity: 0.9,
  linewidth: 2,
});

// Pooled 2-vertex line geometries for bullet tracers. Every trigger pull
// allocated a fresh BufferGeometry + a GPU vertex buffer (via setFromPoints);
// on a high-RPM minigun that is a steady drip of heap garbage + driver buffer
// churn. We recycle the geometries: a tracer borrows one, rewrites its two
// endpoints in-place, and returns it on dispose. Same 40 ms flash, no alloc.
const _tracerGeoPool: THREE.BufferGeometry[] = [];
function acquireTracerGeometry(start: THREE.Vector3, end: THREE.Vector3): THREE.BufferGeometry {
  let g = _tracerGeoPool.pop();
  if (!g) {
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  }
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const a = p.array as Float32Array;
  a[0] = start.x; a[1] = start.y; a[2] = start.z;
  a[3] = end.x;   a[4] = end.y;   a[5] = end.z;
  p.needsUpdate = true;
  return g;
}

/** Free every pooled tracer geometry (game teardown — see particle pools). */
export function clearTracerGeometryPool(): void {
  for (const g of _tracerGeoPool) g.dispose();
  _tracerGeoPool.length = 0;
}

export class BulletTracer {
  line: THREE.Line;
  lifetime: number = 0;
  private geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, start: THREE.Vector3, end: THREE.Vector3, _color: number) {
    this.geometry = acquireTracerGeometry(start, end);
    this.line = new THREE.Line(this.geometry, sharedTracerMaterial);
    this.line.userData.cannotReceiveAO = true;
    // Pooled geometry carries a stale boundingSphere; a tracer is a one-frame
    // flash fired straight down the player's aim (always on-screen), so skip
    // the frustum test rather than recompute a sphere each shot.
    this.line.frustumCulled = false;
    scene.add(this.line);
    this.lifetime = 0.04; // Shorter tracer duration
  }

  update(delta: number): boolean {
    this.lifetime -= delta;
    if (this.lifetime <= 0) return true;
    // Tracer opacity belongs to the SHARED material — we don't mutate it
    // here. The 40ms lifetime is so short the eye reads each tracer as a
    // sharp flash regardless. Saves a per-frame material write.
    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.line);
    // Return the geometry to the pool instead of freeing it (material shared).
    if (_tracerGeoPool.length < 32) _tracerGeoPool.push(this.geometry);
    else this.geometry.dispose();
  }
}

// Shared SOFT-SPARK sprite texture for every point-particle system.
//
// An untextured THREE.PointsMaterial rasterises each particle as a hard-edged
// square — the single biggest "cheap 2005 particles" tell in the whole game
// (impact bursts, robot sparks, embers, nuke debris, ability sparks all showed
// it). One shared radial-gradient sprite turns every one of those squares into
// a soft, hot-cored glowing spark that bloom can catch — the AAA read — for the
// cost of a single tiny texture fetch per particle fragment. Built once,
// shared by every points material below, never disposed.
let _softSparkTex: THREE.CanvasTexture | null = null;
export function getSoftSparkTexture(): THREE.CanvasTexture {
  if (_softSparkTex) return _softSparkTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  // Hot white core → tinted mid falloff → transparent edge. Vertex colours
  // multiply this, so the core stays near-white (reads "burning") while the
  // falloff carries the particle's own colour.
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _softSparkTex = new THREE.CanvasTexture(canvas);
  return _softSparkTex;
}

// Shared particle materials & a small pool of reusable buffer geometries for
// ImpactEffect and RobotHitSparks. Building a fresh BufferGeometry +
// Float32Arrays + PointsMaterial for every bullet hit is wasteful on
// autofire weapons. We share the material (one per effect type) and reuse
// a pool of geometry slots.
const sharedImpactMaterial = new THREE.PointsMaterial({
  size: 0.17,
  map: getSoftSparkTexture(),
  vertexColors: true,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

// Robot hit sparks — additive so the hot sparks glow against the scene.
const sharedSparkMaterial = new THREE.PointsMaterial({
  size: 0.18,
  map: getSoftSparkTexture(),
  vertexColors: true,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

// Pooled particle geometries for ImpactEffect + RobotHitSparks.
//
// Every bullet hit (ImpactEffect) and every armour spark (RobotHitSparks) used
// to allocate a brand-new BufferGeometry + two Float32Arrays (position + color)
// AND a fresh GPU vertex buffer. On autofire into a crowd that is dozens of
// allocations + buffer uploads per second — the heap churn that surfaces as the
// periodic GC hitch the player feels as "lag when shooting".
//
// We now recycle a small pool of fixed-capacity geometries. An effect borrows
// one for its lifetime, writes only its `count` points, clips the rest with
// setDrawRange (so the render is byte-identical to a tightly-sized buffer), and
// returns the geometry to the pool on dispose instead of freeing it. Output is
// pixel-for-pixel unchanged; the per-hit allocation + GPU realloc is gone.
//
// Bursts larger than the cap (rare — only the 50-particle boss-enrage pop) fall
// back to a dedicated, non-pooled geometry so behaviour is never clamped.
const POOLED_PARTICLE_CAP = 64;
const _impactGeoPool: THREE.BufferGeometry[] = [];
const _sparkGeoPool: THREE.BufferGeometry[] = [];
function acquireParticleGeometry(pool: THREE.BufferGeometry[], count: number): THREE.BufferGeometry {
  if (count > POOLED_PARTICLE_CAP) {
    // Oversized burst — give it a one-off geometry (released by disposal).
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }
  const g = pool.pop();
  if (g) return g;
  const fresh = new THREE.BufferGeometry();
  fresh.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOLED_PARTICLE_CAP * 3), 3));
  fresh.setAttribute('color', new THREE.BufferAttribute(new Float32Array(POOLED_PARTICLE_CAP * 3), 3));
  return fresh;
}
function releaseParticleGeometry(pool: THREE.BufferGeometry[], g: THREE.BufferGeometry): void {
  // Pool only the standard-capacity geometries; free the oversized one-offs.
  // Keep the pool bounded so a one-time mass burst can't permanently inflate it.
  const cap = (g.getAttribute('position') as THREE.BufferAttribute | undefined)?.count ?? 0;
  if (cap === POOLED_PARTICLE_CAP && pool.length < 24) pool.push(g);
  else g.dispose();
}

/**
 * Free every pooled particle geometry. Call on game teardown so the recycled
 * buffers don't carry across a remount into a freshly-created WebGL context.
 */
export function clearParticleGeometryPools(): void {
  for (const g of _impactGeoPool) g.dispose();
  for (const g of _sparkGeoPool) g.dispose();
  _impactGeoPool.length = 0;
  _sparkGeoPool.length = 0;
}

export class ImpactEffect {
  particles: THREE.Points;
  private velocities: Float32Array;
  private count: number;
  lifetime: number = 0;
  private geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, position: THREE.Vector3, _color: number, count: number = 20) {
    this.count = count;
    this.geometry = acquireParticleGeometry(_impactGeoPool, count);
    const positions = this.geometry.getAttribute('position').array as Float32Array;
    const colors = this.geometry.getAttribute('color').array as Float32Array;
    this.velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      positions[idx] = position.x;
      positions[idx + 1] = position.y;
      positions[idx + 2] = position.z;

      // Mix of yellow/orange for realistic impact sparks (ignore passed color)
      const sparkColor = Math.random() > 0.5 ? 0xffaa00 : 0xffdd55;
      colors[idx] = ((sparkColor >> 16) & 255) / 255;
      colors[idx + 1] = ((sparkColor >> 8) & 255) / 255;
      colors[idx + 2] = (sparkColor & 255) / 255;

      // Faster, more explosive velocities
      this.velocities[idx] = (Math.random() - 0.5) * 1.5;
      this.velocities[idx + 1] = (Math.random() - 0.2) * 1.2;
      this.velocities[idx + 2] = (Math.random() - 0.5) * 1.5;
    }

    // Only render the `count` points we wrote — the rest of a pooled buffer is
    // stale and must stay clipped. Upload both attributes once up-front.
    this.geometry.setDrawRange(0, count);
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('color').needsUpdate = true;

    this.particles = new THREE.Points(this.geometry, sharedImpactMaterial);
    this.particles.userData.cannotReceiveAO = true;
    // A pooled geometry keeps the previous user's boundingSphere, so per-object
    // frustum culling would test against a stale bounds. These are tiny,
    // sub-second bursts that only ever spawn at the point of combat (always
    // on-screen), so skip the frustum test outright — visually identical,
    // and it sidesteps the stale-bounds cull without recomputing a sphere.
    this.particles.frustumCulled = false;
    scene.add(this.particles);
    this.lifetime = 0.6; // Longer visible impact
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true;
    }

    const positions = this.geometry.getAttribute('position').array as Float32Array;
    const vel = this.velocities;

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      positions[idx] += vel[idx] * delta * 15;
      positions[idx + 1] += vel[idx + 1] * delta * 15;
      positions[idx + 2] += vel[idx + 2] * delta * 15;

      // Strong gravity for realistic fall
      vel[idx + 1] -= delta * 8;

      // Air resistance
      vel[idx] *= 0.98;
      vel[idx + 1] *= 0.98;
      vel[idx + 2] *= 0.98;
    }

    this.geometry.getAttribute('position').needsUpdate = true;
    // Opacity belongs to the shared material — leave it at 1 and rely on
    // the short lifetime + removal to provide the "pop" feel.

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.particles);
    // Return the geometry to the pool instead of freeing it (material shared).
    releaseParticleGeometry(_impactGeoPool, this.geometry);
  }
}

// Explosion FX (rocket launcher + barrel blast).
//
// The old explosion `scene.add()`-ed a fresh THREE.PointLight every blast, which
// forced three.js to RECOMPILE every material in the world (the light count is
// baked into shaders at compile time) — the exact stutter the muzzle-flash and
// pickup systems were already rewritten to avoid. On the rocket launcher (and
// chained barrels) that recompile fired several times a second and was the
// reported "lag".
//
// The fix mirrors those systems: the host pre-allocates a small PointLight pool
// and we acquire/release a slot via intensity toggling (never add/remove). The
// fireball + shockwave + white-hot flash are pooled-geometry additive meshes
// animated per-frame in the game loop (no setTimeout chains), so the blast both
// runs allocation-light AND reads as a punchier, expanding fireball.
//
// Reference: https://discourse.threejs.org/t/scene-freezes-when-adding-dynamically-pointlight/28281

let _explosionLightAcquire: MuzzleLightAcquire | null = null;
let _explosionLightRelease: MuzzleLightRelease | null = null;
export function setExplosionLightPool(acquire: MuzzleLightAcquire, release: MuzzleLightRelease) {
  _explosionLightAcquire = acquire;
  _explosionLightRelease = release;
}

// Shared geometries — one fireball sphere, one white-hot core, one ground ring.
// Built once; scaled per-instance, never disposed by the effect cleanup.
const EXPLO_FIREBALL_GEO = new THREE.IcosahedronGeometry(1, 2);
const EXPLO_FLASH_GEO = new THREE.IcosahedronGeometry(1, 1);
const EXPLO_SHOCK_GEO = (() => {
  const g = new THREE.RingGeometry(0.82, 1, 40);
  g.rotateX(-Math.PI / 2); // lie flat on the ground (XZ plane)
  return g;
})();

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

// Pooled explosion rigs. Rockets, barrels, splash perks and boss casts each
// used to build 3 fresh MeshBasicMaterials + meshes per blast — chained barrel
// detonations turned that into a burst of heap churn right at the frame the
// player already feels the hit. A rig (group + fireball/flash/shock meshes +
// their materials) is borrowed whole and reset on acquire; colour is a uniform,
// so re-tinting costs nothing and no new shader program is ever created.
interface ExplosionRig {
  group: THREE.Group;
  fireball: THREE.Mesh;
  flash: THREE.Mesh;
  shock: THREE.Mesh;
  fireMat: THREE.MeshBasicMaterial;
  flashMat: THREE.MeshBasicMaterial;
  shockMat: THREE.MeshBasicMaterial;
}
const _explosionRigPool: ExplosionRig[] = [];
function buildExplosionRig(): ExplosionRig {
  const group = new THREE.Group();
  const fireMat = new THREE.MeshBasicMaterial({
    color: 0xff7a2a, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const fireball = new THREE.Mesh(EXPLO_FIREBALL_GEO, fireMat);
  fireball.userData.cannotReceiveAO = true;
  fireball.renderOrder = 992;
  group.add(fireball);

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfff2c4, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flash = new THREE.Mesh(EXPLO_FLASH_GEO, flashMat);
  flash.userData.cannotReceiveAO = true;
  flash.renderOrder = 994;
  group.add(flash);

  const shockMat = new THREE.MeshBasicMaterial({
    color: 0xffb066, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const shock = new THREE.Mesh(EXPLO_SHOCK_GEO, shockMat);
  shock.userData.cannotReceiveAO = true;
  shock.renderOrder = 991;
  group.add(shock);

  return { group, fireball, flash, shock, fireMat, flashMat, shockMat };
}

/** Free every pooled explosion rig (game teardown). */
export function clearExplosionRigPool(): void {
  for (const r of _explosionRigPool) {
    r.fireMat.dispose();
    r.flashMat.dispose();
    r.shockMat.dispose();
  }
  _explosionRigPool.length = 0;
}

export class ExplosionEffect {
  private rig: ExplosionRig;
  private light: THREE.PointLight | null;
  private age = 0;
  private readonly life = 0.55;          // total seconds on screen
  private readonly radius: number;       // visual scale driver
  private readonly lightPeak: number;
  private _released = false;

  constructor(scene: THREE.Scene, position: THREE.Vector3, radius = 9, color = 0xff7a2a) {
    this.radius = radius;
    this.lightPeak = Math.min(80, 30 + radius * 4);
    // Borrow a rig (or build the pool's first few) and reset it for this blast.
    this.rig = _explosionRigPool.pop() ?? buildExplosionRig();
    const { group, fireball, flash, shock, fireMat, flashMat, shockMat } = this.rig;
    group.position.copy(position);
    fireMat.color.setHex(color);
    fireMat.opacity = 1;
    flashMat.opacity = 1;
    shockMat.opacity = 0.85;
    fireball.position.y = radius * 0.18;
    fireball.scale.setScalar(radius * 0.22);
    flash.position.y = radius * 0.18;
    flash.scale.setScalar(radius * 0.18);
    flash.visible = true;
    shock.position.y = 0.12;
    shock.scale.set(radius * 0.2, 1, radius * 0.2);

    scene.add(group);

    // Borrow a pooled light (never scene.add a fresh one — that recompiles).
    this.light = _explosionLightAcquire ? _explosionLightAcquire() : null;
    if (this.light) {
      this.light.color.setHex(0xff8a3a);
      this.light.intensity = this.lightPeak;
      this.light.distance = Math.max(24, radius * 4);
      this.light.position.set(position.x, position.y + 1.5, position.z);
    }
  }

  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.life;
    if (t >= 1) return true;
    const { fireball, flash, shock, fireMat, flashMat, shockMat } = this.rig;

    // Fireball: rapid expand then linger-fade.
    const fb = easeOut(Math.min(1, this.age / 0.32));
    const fbScale = this.radius * (0.22 + 0.45 * fb);
    fireball.scale.setScalar(fbScale);
    fireMat.opacity = this.age < 0.16 ? 1 : Math.max(0, 1 - (this.age - 0.16) / 0.34);

    // White-hot core: very brief, snaps out fast.
    const flScale = this.radius * (0.18 + 0.5 * easeOut(Math.min(1, this.age / 0.09)));
    flash.scale.setScalar(flScale);
    flashMat.opacity = Math.max(0, 1 - this.age / 0.13);
    flash.visible = flashMat.opacity > 0.01;

    // Ground shockwave: spreads wide and thin, fades out.
    const sw = easeOut(t);
    shock.scale.set(this.radius * (0.2 + 1.25 * sw), 1, this.radius * (0.2 + 1.25 * sw));
    shockMat.opacity = 0.85 * Math.max(0, 1 - t);

    // Pooled light decays quickly so the bloom doesn't linger.
    if (this.light) {
      this.light.intensity = this.lightPeak * Math.max(0, 1 - this.age / 0.3);
    }

    return false;
  }

  dispose(scene: THREE.Scene, _disposeMaterials = true) {
    if (this._released) return; // idempotent — warmup teardown double-disposes
    this._released = true;
    scene.remove(this.rig.group);
    // Return the whole rig (materials included) to the bounded pool — keeping
    // the materials alive also keeps their linked programs cached for the run.
    if (_explosionRigPool.length < 10) {
      _explosionRigPool.push(this.rig);
    } else {
      this.rig.fireMat.dispose();
      this.rig.flashMat.dispose();
      this.rig.shockMat.dispose();
    }
    if (this.light) {
      if (_explosionLightRelease) _explosionLightRelease(this.light);
      else scene.remove(this.light);
      this.light = null;
    }
    // Geometries are shared (EXPLO_*) — never dispose here.
  }
}

// Fire Nova — the Pyro's "Firestorm" ultimate. A single, self-contained,
// allocation-light effect that reads as a fire shockwave SWEEPING the arena:
//   • two expanding ground fire-rings (a leading front + a trailing one) for a
//     double-pulse shockwave,
//   • a rising flame dome at the heart of the cast,
//   • a burst of embers thrown outward + up that arc back down under gravity.
// One effect ≫ cheaper than chaining dozens of explosions, and it borrows a
// single pooled light (never scene.add's one — that recompiles every material).
//
// Refs: expanding-ring shockwave VFX —
//   https://discourse.threejs.org/t/explosion-shockwave-vfx/54742
const NOVA_RING_GEO = (() => {
  const g = new THREE.RingGeometry(0.8, 1.0, 64);
  g.rotateX(-Math.PI / 2); // lie flat on the XZ plane
  return g;
})();
const NOVA_DOME_GEO = new THREE.IcosahedronGeometry(1, 2);

export class FireNovaEffect {
  private group: THREE.Group;
  private ringFront: THREE.Mesh;
  private ringBack: THREE.Mesh;
  private dome: THREE.Mesh;
  private embers: THREE.Points;
  private emberVel: Float32Array;
  private ringFrontMat: THREE.MeshBasicMaterial;
  private ringBackMat: THREE.MeshBasicMaterial;
  private domeMat: THREE.MeshBasicMaterial;
  private emberMat: THREE.PointsMaterial;
  private emberGeo: THREE.BufferGeometry;
  private light: THREE.PointLight | null;
  private age = 0;
  private readonly life = 0.9;
  private readonly radius: number;
  private readonly lightPeak: number;

  constructor(scene: THREE.Scene, position: THREE.Vector3, radius = 16) {
    this.radius = radius;
    this.lightPeak = Math.min(110, 46 + radius * 3);
    this.group = new THREE.Group();
    this.group.position.copy(position);

    // Leading fire-ring — hot orange front of the shockwave.
    this.ringFrontMat = new THREE.MeshBasicMaterial({
      color: 0xff7a24, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.ringFront = new THREE.Mesh(NOVA_RING_GEO, this.ringFrontMat);
    this.ringFront.position.y = 0.14;
    this.ringFront.renderOrder = 991;
    this.ringFront.userData.cannotReceiveAO = true;
    this.group.add(this.ringFront);

    // Trailing ring — deeper red, lags behind for a double-pulse front.
    this.ringBackMat = new THREE.MeshBasicMaterial({
      color: 0xd23a12, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.ringBack = new THREE.Mesh(NOVA_RING_GEO, this.ringBackMat);
    this.ringBack.position.y = 0.1;
    this.ringBack.renderOrder = 990;
    this.ringBack.userData.cannotReceiveAO = true;
    this.group.add(this.ringBack);

    // Flame dome — the heart of the cast bursts upward then fades.
    this.domeMat = new THREE.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.dome = new THREE.Mesh(NOVA_DOME_GEO, this.domeMat);
    this.dome.position.y = radius * 0.12;
    this.dome.renderOrder = 993;
    this.dome.userData.cannotReceiveAO = true;
    this.group.add(this.dome);

    // Ember burst — thrown outward + up, arcing back down under gravity.
    const emberCount = 60;
    this.emberGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(emberCount * 3);
    const colors = new Float32Array(emberCount * 3);
    this.emberVel = new Float32Array(emberCount * 3);
    const EMBER_COLORS = [0xffd24a, 0xff8a1e, 0xff5a1e, 0xfff0b0];
    for (let i = 0; i < emberCount; i++) {
      const i3 = i * 3;
      const ang = Math.random() * Math.PI * 2;
      const outSpeed = 8 + Math.random() * radius * 0.9;
      this.emberVel[i3] = Math.cos(ang) * outSpeed;
      this.emberVel[i3 + 1] = 6 + Math.random() * 9; // upward kick
      this.emberVel[i3 + 2] = Math.sin(ang) * outSpeed;
      const c = EMBER_COLORS[(Math.random() * EMBER_COLORS.length) | 0];
      colors[i3] = ((c >> 16) & 255) / 255;
      colors[i3 + 1] = ((c >> 8) & 255) / 255;
      colors[i3 + 2] = (c & 255) / 255;
    }
    this.emberGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.emberGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.emberMat = new THREE.PointsMaterial({
      size: 0.4, map: getSoftSparkTexture(), vertexColors: true, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.embers = new THREE.Points(this.emberGeo, this.emberMat);
    this.embers.userData.cannotReceiveAO = true;
    this.group.add(this.embers);

    scene.add(this.group);

    this.light = _explosionLightAcquire ? _explosionLightAcquire() : null;
    if (this.light) {
      this.light.color.setHex(0xff7a2a);
      this.light.intensity = this.lightPeak;
      this.light.distance = Math.max(36, radius * 4.5);
      this.light.position.set(position.x, position.y + 2, position.z);
    }
  }

  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.life;
    if (t >= 1) return true;

    // Leading ring sweeps out fast and wide, fading as it goes.
    const fFront = easeOut(t);
    const sFront = this.radius * (0.18 + 1.05 * fFront);
    this.ringFront.scale.set(sFront, 1, sFront);
    this.ringFrontMat.opacity = 0.95 * Math.max(0, 1 - t);

    // Trailing ring lags ~0.12s behind for the double-pulse look.
    const tb = Math.max(0, (this.age - 0.12) / (this.life - 0.12));
    const fBack = easeOut(tb);
    const sBack = this.radius * (0.12 + 0.92 * fBack);
    this.ringBack.scale.set(sBack, 1, sBack);
    this.ringBackMat.opacity = 0.8 * Math.max(0, 1 - tb);

    // Dome punches up in the first third, then dissolves.
    const domeUp = easeOut(Math.min(1, this.age / 0.26));
    this.dome.scale.set(this.radius * 0.55 * domeUp, this.radius * 0.42 * domeUp, this.radius * 0.55 * domeUp);
    this.domeMat.opacity = Math.max(0, 1 - this.age / 0.4);
    this.dome.visible = this.domeMat.opacity > 0.01;

    // Embers fly out and arc down.
    const pos = this.emberGeo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.emberVel.length; i += 3) {
      arr[i] += this.emberVel[i] * delta;
      arr[i + 1] += this.emberVel[i + 1] * delta;
      arr[i + 2] += this.emberVel[i + 2] * delta;
      this.emberVel[i + 1] -= 16 * delta; // gravity
      this.emberVel[i] *= 0.96;
      this.emberVel[i + 2] *= 0.96;
    }
    pos.needsUpdate = true;
    this.emberMat.opacity = Math.max(0, 1 - t);

    if (this.light) this.light.intensity = this.lightPeak * Math.max(0, 1 - this.age / 0.32);

    return false;
  }

  dispose(scene: THREE.Scene, disposeMaterials = true) {
    scene.remove(this.group);
    if (disposeMaterials) {
      this.ringFrontMat.dispose();
      this.ringBackMat.dispose();
      this.domeMat.dispose();
      this.emberMat.dispose();
      this.emberGeo.dispose();
    }
    if (this.light) {
      if (_explosionLightRelease) _explosionLightRelease(this.light);
      else scene.remove(this.light);
      this.light = null;
    }
    // NOVA_* geometries are shared — never dispose here.
  }
}

// Tactical Nuke — a full, self-contained nuclear-detonation set-piece for the
// nuke power-up. Built to read as the real thing in stages:
//   1. a blinding white-hot flash that snaps out instantly,
//   2. a churning ground fireball that expands then lifts off,
//   3. a rising MUSHROOM CLOUD — a column (stem) that climbs while a billowing
//      cap rolls outward at its head (with a vortex-ring collar), cooling from
//      fire-orange to ash-grey as it rises,
//   4. a fast, wide ground shockwave ring + a low base dust ring,
//   5. debris/embers blown out and arcing back down.
// Allocation-light (shared geometries, one pooled light) and far cheaper than
// chaining dozens of explosions for the same payoff.
//
// Refs: mushroom-cloud + shockwave layering — the same expanding-ring approach
// as the fire nova above, extended with a rising stem/cap pair.
const NUKE_STEM_GEO = new THREE.CylinderGeometry(0.42, 0.62, 1, 18, 1, true);
const NUKE_CAP_GEO = new THREE.IcosahedronGeometry(1, 3);
const NUKE_COLLAR_GEO = new THREE.TorusGeometry(1, 0.42, 12, 28);
const NUKE_RING_GEO = (() => {
  const g = new THREE.RingGeometry(0.78, 1.0, 72);
  g.rotateX(-Math.PI / 2); // lie flat on the XZ ground plane
  return g;
})();
// Scratch colours reused for the cooling lerp (no per-frame allocation).
const _NUKE_HOT = new THREE.Color(0xfff1c2);
const _NUKE_FIRE = new THREE.Color(0xff7a26);
const _NUKE_ASH = new THREE.Color(0x4a443e);

export class NukeEffect {
  private group: THREE.Group;
  private flash: THREE.Mesh;
  private fireball: THREE.Mesh;
  private stem: THREE.Mesh;
  private cap: THREE.Mesh;
  private collar: THREE.Mesh;
  private shock: THREE.Mesh;
  private dust: THREE.Mesh;
  private debris: THREE.Points;
  private debrisVel: Float32Array;
  private flashMat: THREE.MeshBasicMaterial;
  private fireMat: THREE.MeshBasicMaterial;
  private stemMat: THREE.MeshBasicMaterial;
  private capMat: THREE.MeshBasicMaterial;
  private collarMat: THREE.MeshBasicMaterial;
  private shockMat: THREE.MeshBasicMaterial;
  private dustMat: THREE.MeshBasicMaterial;
  private debrisMat: THREE.PointsMaterial;
  private debrisGeo: THREE.BufferGeometry;
  private light: THREE.PointLight | null;
  private age = 0;
  private readonly life = 3.8;        // long enough for the cloud to rise + cool
  private readonly radius: number;    // blast scale driver
  private readonly cloudTop: number;  // peak height the cap climbs to
  private readonly lightPeak: number;

  constructor(scene: THREE.Scene, position: THREE.Vector3, radius = 34) {
    this.radius = radius;
    this.cloudTop = radius * 1.5;
    this.lightPeak = Math.min(160, 70 + radius * 2.4);
    this.group = new THREE.Group();
    this.group.position.copy(position);

    // 1. Blinding detonation flash — white-hot, snaps huge then vanishes.
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.flash = new THREE.Mesh(NUKE_CAP_GEO, this.flashMat);
    this.flash.position.y = radius * 0.32;
    this.flash.userData.cannotReceiveAO = true;
    this.flash.renderOrder = 996;
    this.group.add(this.flash);

    // 2. Ground fireball — churning hot core that lifts off as the stem forms.
    this.fireMat = new THREE.MeshBasicMaterial({
      color: 0xff8a2e, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.fireball = new THREE.Mesh(NUKE_CAP_GEO, this.fireMat);
    this.fireball.position.y = radius * 0.22;
    this.fireball.userData.cannotReceiveAO = true;
    this.fireball.renderOrder = 994;
    this.group.add(this.fireball);

    // 3a. Rising stem — the column of the mushroom.
    this.stemMat = new THREE.MeshBasicMaterial({
      color: 0xff7a26, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.stem = new THREE.Mesh(NUKE_STEM_GEO, this.stemMat);
    this.stem.userData.cannotReceiveAO = true;
    this.stem.renderOrder = 992;
    this.group.add(this.stem);

    // 3b. Billowing cap + 3c. vortex-ring collar at the cap's underside.
    this.capMat = new THREE.MeshBasicMaterial({
      color: 0xff8a30, transparent: true, opacity: 0.0,
      blending: THREE.NormalBlending, depthWrite: false,
    });
    this.cap = new THREE.Mesh(NUKE_CAP_GEO, this.capMat);
    this.cap.userData.cannotReceiveAO = true;
    this.cap.renderOrder = 993;
    this.group.add(this.cap);

    this.collarMat = new THREE.MeshBasicMaterial({
      color: 0xff9a3a, transparent: true, opacity: 0.0,
      blending: THREE.NormalBlending, depthWrite: false,
    });
    this.collar = new THREE.Mesh(NUKE_COLLAR_GEO, this.collarMat);
    this.collar.rotation.x = Math.PI / 2; // lie flat (ring axis up)
    this.collar.userData.cannotReceiveAO = true;
    this.collar.renderOrder = 992;
    this.group.add(this.collar);

    // 4a. Ground shockwave — sweeps out fast and wide.
    this.shockMat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.shock = new THREE.Mesh(NUKE_RING_GEO, this.shockMat);
    this.shock.position.y = 0.16;
    this.shock.userData.cannotReceiveAO = true;
    this.shock.renderOrder = 991;
    this.group.add(this.shock);

    // 4b. Base dust ring — kicked-up dirt skirting the crater.
    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0x6a5d4c, transparent: true, opacity: 0.0,
      blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.dust = new THREE.Mesh(NUKE_RING_GEO, this.dustMat);
    this.dust.position.y = 0.1;
    this.dust.userData.cannotReceiveAO = true;
    this.dust.renderOrder = 990;
    this.group.add(this.dust);

    // 5. Debris/embers thrown out + up, arcing back down under gravity.
    const debrisCount = 90;
    this.debrisGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(debrisCount * 3);
    const colors = new Float32Array(debrisCount * 3);
    this.debrisVel = new Float32Array(debrisCount * 3);
    const DEBRIS_COLORS = [0xffd24a, 0xff7a1e, 0xff4a1e, 0x6a5d4c, 0x3a342e];
    for (let i = 0; i < debrisCount; i++) {
      const i3 = i * 3;
      const ang = Math.random() * Math.PI * 2;
      const out = 10 + Math.random() * radius * 1.1;
      this.debrisVel[i3] = Math.cos(ang) * out;
      this.debrisVel[i3 + 1] = 10 + Math.random() * 24; // strong upward kick
      this.debrisVel[i3 + 2] = Math.sin(ang) * out;
      const c = DEBRIS_COLORS[(Math.random() * DEBRIS_COLORS.length) | 0];
      colors[i3] = ((c >> 16) & 255) / 255;
      colors[i3 + 1] = ((c >> 8) & 255) / 255;
      colors[i3 + 2] = (c & 255) / 255;
    }
    this.debrisGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.debrisGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.debrisMat = new THREE.PointsMaterial({
      size: 0.7, map: getSoftSparkTexture(), vertexColors: true, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.debris = new THREE.Points(this.debrisGeo, this.debrisMat);
    this.debris.userData.cannotReceiveAO = true;
    this.group.add(this.debris);

    scene.add(this.group);

    // Borrow a pooled light (never scene.add a fresh one — that recompiles).
    this.light = _explosionLightAcquire ? _explosionLightAcquire() : null;
    if (this.light) {
      this.light.color.setHex(0xffd28a);
      this.light.intensity = this.lightPeak;
      this.light.distance = Math.max(80, radius * 6);
      this.light.position.set(position.x, position.y + 4, position.z);
    }
  }

  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.life;
    if (t >= 1) return true;

    // 1. Flash — colossal in the first ~80ms, gone by ~180ms.
    const flGrow = easeOut(Math.min(1, this.age / 0.08));
    this.flash.scale.setScalar(this.radius * (0.4 + 1.1 * flGrow));
    this.flashMat.opacity = Math.max(0, 1 - this.age / 0.18);
    this.flash.visible = this.flashMat.opacity > 0.01;

    // 2. Fireball — expands hard, lifts off and dims into the rising stem.
    const fbGrow = easeOut(Math.min(1, this.age / 0.45));
    this.fireball.scale.setScalar(this.radius * (0.25 + 0.7 * fbGrow));
    this.fireball.position.y = this.radius * (0.22 + 0.5 * easeOut(Math.min(1, this.age / 0.9)));
    this.fireMat.opacity = this.age < 0.25 ? 1 : Math.max(0, 1 - (this.age - 0.25) / 0.85);
    this.fireball.visible = this.fireMat.opacity > 0.01;

    // 3. Mushroom cloud — the cap climbs to cloudTop while the stem stretches
    // under it; both fade up from nothing as the fireball hands off (~0.2s).
    const rise = easeOut(Math.min(1, this.age / 2.4));        // 0→1 climb
    const capY = this.radius * 0.4 + this.cloudTop * rise;
    const capScale = this.radius * (0.3 + 0.95 * easeOut(Math.min(1, this.age / 1.8)));
    // Cooling: fire-orange → ash-grey as the cloud ages (collar runs hotter).
    const coolA = Math.min(1, this.age / 1.6);
    this.capMat.color.copy(_NUKE_FIRE).lerp(_NUKE_ASH, coolA);
    this.stemMat.color.copy(_NUKE_FIRE).lerp(_NUKE_ASH, Math.min(1, this.age / 1.9));
    this.collarMat.color.copy(_NUKE_HOT).lerp(_NUKE_ASH, coolA);

    // Cap: a wide, slightly flattened billow that rolls outward as it rises.
    this.cap.position.y = capY;
    this.cap.scale.set(capScale, capScale * 0.74, capScale);
    // Vortex collar hugs the cap underside, a touch wider than the cap.
    this.collar.position.y = capY - capScale * 0.34;
    this.collar.scale.set(capScale * 0.92, capScale * 0.92, capScale * 0.5);

    // Stem: from the ground up to just under the cap, thickening slightly.
    const stemH = Math.max(0.001, capY - this.radius * 0.1);
    const stemW = this.radius * (0.26 + 0.12 * rise);
    this.stem.position.y = stemH * 0.5;
    this.stem.scale.set(stemW, stemH, stemW);

    // Cloud opacity: fades in fast, holds, then dissolves over the last ~1.1s.
    const cloudFade = this.age < 0.22 ? 0
      : this.age < 1.0 ? (this.age - 0.22) / 0.78
      : Math.max(0, 1 - (this.age - (this.life - 1.1)) / 1.1);
    const cloudOp = Math.min(1, Math.max(0, cloudFade));
    this.capMat.opacity = 0.96 * cloudOp;
    this.collarMat.opacity = 0.9 * cloudOp;
    this.stemMat.opacity = 0.8 * cloudOp;

    // 4a. Shockwave — out fast and wide in the first ~1.1s.
    const swT = Math.min(1, this.age / 1.1);
    const sw = easeOut(swT);
    const swScale = this.radius * (0.25 + 2.2 * sw);
    this.shock.scale.set(swScale, 1, swScale);
    this.shockMat.opacity = 0.95 * Math.max(0, 1 - swT);
    this.shock.visible = this.shockMat.opacity > 0.01;

    // 4b. Base dust ring — slower, lingers low around the crater.
    const dT = Math.min(1, this.age / 1.8);
    const dScale = this.radius * (0.3 + 1.5 * easeOut(dT));
    this.dust.scale.set(dScale, 1, dScale);
    this.dustMat.opacity = 0.5 * Math.max(0, 1 - dT) * (this.age > 0.1 ? 1 : this.age / 0.1);
    this.dust.visible = this.dustMat.opacity > 0.01;

    // 5. Debris — fly out and arc back down (frozen once it has mostly landed).
    if (this.age < 1.6) {
      const pos = this.debrisGeo.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < this.debrisVel.length; i += 3) {
        arr[i] += this.debrisVel[i] * delta;
        arr[i + 1] += this.debrisVel[i + 1] * delta;
        arr[i + 2] += this.debrisVel[i + 2] * delta;
        this.debrisVel[i + 1] -= 26 * delta; // gravity
        this.debrisVel[i] *= 0.97;
        this.debrisVel[i + 2] *= 0.97;
        if (arr[i + 1] < 0) arr[i + 1] = 0; // settle on the ground
      }
      pos.needsUpdate = true;
    }
    this.debrisMat.opacity = Math.max(0, 1 - this.age / 1.5);
    this.debris.visible = this.debrisMat.opacity > 0.01;

    // Light: blinding flash that decays fast, then a warm afterglow from the
    // burning cloud that fades over ~1.2s.
    if (this.light) {
      const flashGlow = this.lightPeak * Math.max(0, 1 - this.age / 0.4);
      const cloudGlow = this.lightPeak * 0.28 * Math.max(0, 1 - this.age / 1.2);
      this.light.intensity = Math.max(flashGlow, cloudGlow);
      this.light.position.y = 4 + capY * 0.4;
    }

    return false;
  }

  dispose(scene: THREE.Scene, disposeMaterials = true) {
    scene.remove(this.group);
    if (disposeMaterials) {
      this.flashMat.dispose();
      this.fireMat.dispose();
      this.stemMat.dispose();
      this.capMat.dispose();
      this.collarMat.dispose();
      this.shockMat.dispose();
      this.dustMat.dispose();
      this.debrisMat.dispose();
      this.debrisGeo.dispose();
    }
    if (this.light) {
      if (_explosionLightRelease) _explosionLightRelease(this.light);
      else scene.remove(this.light);
      this.light = null;
    }
    // NUKE_* shared geometries are never disposed here.
  }
}

// Ability Cast — a generic, tinted "signature move" burst played at the caster
// the instant ANY character ability fires. It reads as a surge of the
// ability's accent colour erupting from the player: an expanding ground energy
// ring, a brief rising pillar of light, a hot core flash and a ring of rising
// sparks. One reusable effect (recoloured per ability) gives every class a
// distinct, readable activation without bespoke geometry per power.
const CAST_PILLAR_GEO = new THREE.CylinderGeometry(0.7, 1.25, 4.4, 24, 1, true);

// Pooled cast rigs. Every ability/boss/power cast used to allocate 4 fresh
// materials + a 30-spark BufferGeometry (two Float32Arrays + a GPU buffer).
// The rig is borrowed whole, re-tinted (colour is a uniform — no new program)
// and its spark buffer re-seeded in place, so casting mid-fight allocates
// nothing. Scratch colours below avoid per-cast Color churn too.
interface CastRig {
  group: THREE.Group;
  ring: THREE.Mesh;
  pillar: THREE.Mesh;
  core: THREE.Mesh;
  sparks: THREE.Points;
  sparkVel: Float32Array;
  ringMat: THREE.MeshBasicMaterial;
  pillarMat: THREE.MeshBasicMaterial;
  coreMat: THREE.MeshBasicMaterial;
  sparkMat: THREE.PointsMaterial;
  sparkGeo: THREE.BufferGeometry;
}
const CAST_SPARK_COUNT = 30;
const _castRigPool: CastRig[] = [];
const _castTint = new THREE.Color();
const _castHot = new THREE.Color();
const _castWhite = new THREE.Color(0xffffff);
function buildCastRig(): CastRig {
  const group = new THREE.Group();

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(NOVA_RING_GEO, ringMat);
  ring.position.y = 0.12;
  ring.renderOrder = 990;
  ring.userData.cannotReceiveAO = true;
  group.add(ring);

  const pillarMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const pillar = new THREE.Mesh(CAST_PILLAR_GEO, pillarMat);
  pillar.position.y = 2.2;
  pillar.renderOrder = 991;
  pillar.userData.cannotReceiveAO = true;
  group.add(pillar);

  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const core = new THREE.Mesh(NOVA_DOME_GEO, coreMat);
  core.position.y = 1.1;
  core.renderOrder = 992;
  core.userData.cannotReceiveAO = true;
  group.add(core);

  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAST_SPARK_COUNT * 3), 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CAST_SPARK_COUNT * 3), 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.3, map: getSoftSparkTexture(), vertexColors: true, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.userData.cannotReceiveAO = true;
  // Spark positions are rewritten per cast, so a pooled rig would carry a stale
  // boundingSphere; the burst always plays at the point of action (on-screen).
  sparks.frustumCulled = false;
  group.add(sparks);

  return {
    group, ring, pillar, core, sparks,
    sparkVel: new Float32Array(CAST_SPARK_COUNT * 3),
    ringMat, pillarMat, coreMat, sparkMat, sparkGeo,
  };
}

/** Free every pooled ability-cast rig (game teardown). */
export function clearCastRigPool(): void {
  for (const r of _castRigPool) {
    r.ringMat.dispose();
    r.pillarMat.dispose();
    r.coreMat.dispose();
    r.sparkMat.dispose();
    r.sparkGeo.dispose();
  }
  _castRigPool.length = 0;
}

export class AbilityCastEffect {
  private rig: CastRig;
  private light: THREE.PointLight | null;
  private age = 0;
  private readonly life = 0.72;
  private _released = false;

  constructor(scene: THREE.Scene, position: THREE.Vector3, color = 0x22d3ee) {
    this.rig = _castRigPool.pop() ?? buildCastRig();
    const { group, ring, pillar, core, ringMat, pillarMat, coreMat, sparkMat, sparkGeo, sparkVel } = this.rig;
    _castTint.setHex(color);
    _castHot.copy(_castTint).lerp(_castWhite, 0.35);
    group.position.set(position.x, 0.05, position.z);

    ringMat.color.copy(_castTint);
    ringMat.opacity = 0.95;
    ring.scale.set(0.6, 1, 0.6);

    pillarMat.color.copy(_castTint);
    pillarMat.opacity = 0.5;
    pillar.scale.set(0.6, 0, 0.6);

    coreMat.color.copy(_castTint).lerp(_castWhite, 0.5);
    coreMat.opacity = 0.9;
    core.visible = true;
    core.scale.setScalar(0.4);

    // Re-seed the rising spark ring in place (no new buffers).
    const positions = sparkGeo.getAttribute('position') as THREE.BufferAttribute;
    const colors = sparkGeo.getAttribute('color') as THREE.BufferAttribute;
    const pArr = positions.array as Float32Array;
    const cArr = colors.array as Float32Array;
    for (let i = 0; i < CAST_SPARK_COUNT; i++) {
      const i3 = i * 3;
      const ang = Math.random() * Math.PI * 2;
      const out = 1.5 + Math.random() * 2.0;
      pArr[i3] = Math.cos(ang) * 0.6;
      pArr[i3 + 1] = 0.2 + Math.random() * 0.4;
      pArr[i3 + 2] = Math.sin(ang) * 0.6;
      sparkVel[i3] = Math.cos(ang) * out;
      sparkVel[i3 + 1] = 3.5 + Math.random() * 4.0; // strong upward rush
      sparkVel[i3 + 2] = Math.sin(ang) * out;
      cArr[i3] = _castHot.r; cArr[i3 + 1] = _castHot.g; cArr[i3 + 2] = _castHot.b;
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    sparkMat.opacity = 1;

    scene.add(group);

    // Brief tinted light so the cast actually illuminates the player + ground.
    this.light = _explosionLightAcquire ? _explosionLightAcquire() : null;
    if (this.light) {
      this.light.color.copy(_castTint);
      this.light.intensity = 26;
      this.light.distance = 22;
      this.light.position.set(position.x, 1.6, position.z);
    }
  }

  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.life;
    if (t >= 1) return true;
    const { ring, pillar, core, ringMat, pillarMat, coreMat, sparkMat, sparkGeo, sparkVel } = this.rig;

    // Ground ring sweeps out + fades.
    const rs = 0.6 + easeOut(t) * 5.4;
    ring.scale.set(rs, 1, rs);
    ringMat.opacity = 0.95 * (1 - t);

    // Pillar rises (scale.y up from the floor) then dissolves.
    const up = easeOut(Math.min(1, this.age / 0.3));
    pillar.scale.set(0.6 + 0.5 * up, up, 0.6 + 0.5 * up);
    pillarMat.opacity = 0.5 * Math.max(0, 1 - this.age / 0.45);

    // Core flash — quick punch out.
    const cs = 0.4 + easeOut(Math.min(1, this.age / 0.12)) * 1.3;
    core.scale.setScalar(cs);
    coreMat.opacity = Math.max(0, 1 - this.age / 0.2);
    core.visible = coreMat.opacity > 0.01;

    // Sparks rise + spread under light gravity.
    const pos = sparkGeo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < sparkVel.length; i += 3) {
      arr[i] += sparkVel[i] * delta;
      arr[i + 1] += sparkVel[i + 1] * delta;
      arr[i + 2] += sparkVel[i + 2] * delta;
      sparkVel[i + 1] -= 6 * delta;
    }
    pos.needsUpdate = true;
    sparkMat.opacity = Math.max(0, 1 - t);

    if (this.light) this.light.intensity = 26 * Math.max(0, 1 - this.age / 0.28);

    return false;
  }

  dispose(scene: THREE.Scene, _disposeMaterials = true) {
    if (this._released) return; // idempotent — warmup teardown double-disposes
    this._released = true;
    scene.remove(this.rig.group);
    // Return the rig (materials + spark buffers) to the bounded pool; keeping
    // the materials alive also keeps their linked programs cached for the run.
    if (_castRigPool.length < 8) {
      _castRigPool.push(this.rig);
    } else {
      this.rig.ringMat.dispose();
      this.rig.pillarMat.dispose();
      this.rig.coreMat.dispose();
      this.rig.sparkMat.dispose();
      this.rig.sparkGeo.dispose();
    }
    if (this.light) {
      if (_explosionLightRelease) _explosionLightRelease(this.light);
      else scene.remove(this.light);
      this.light = null;
    }
    // NOVA_* + CAST_PILLAR geometries are shared — never dispose here.
  }
}

// Robot hit effect — the enemies are robots, so hits throw off hot sparks and
// bits of metal (electric yellow/orange/white with the occasional cyan arc),
// not blood. Sparks fly out from the impact, then arc down under gravity.
export class RobotHitSparks {
  particles: THREE.Points;
  private velocities: Float32Array;
  private count: number;
  lifetime: number = 0;
  private geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, position: THREE.Vector3, direction: THREE.Vector3, count: number = 15) {
    this.count = count;
    this.geometry = acquireParticleGeometry(_sparkGeoPool, count);
    const positions = this.geometry.getAttribute('position').array as Float32Array;
    const colors = this.geometry.getAttribute('color').array as Float32Array;
    this.velocities = new Float32Array(count * 3);

    // Hot spark palette + a couple of cooler tones for shrapnel/electric arcs.
    const SPARK_COLORS = [0xffd23f, 0xff8a1e, 0xfff3c0, 0x66e0ff, 0xb8bdc4];

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      positions[idx] = position.x;
      positions[idx + 1] = position.y;
      positions[idx + 2] = position.z;

      const sparkColor = SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0];
      colors[idx] = ((sparkColor >> 16) & 255) / 255;
      colors[idx + 1] = ((sparkColor >> 8) & 255) / 255;
      colors[idx + 2] = (sparkColor & 255) / 255;

      // Spray away from impact direction, with a wider, faster cone than blood
      // so it reads as a spark burst.
      const spread = 0.8;
      const mag = 0.7 + Math.random() * 0.8;
      this.velocities[idx] = (direction.x + (Math.random() - 0.5) * spread) * mag;
      this.velocities[idx + 1] = (direction.y + (Math.random() - 0.5) * spread + 0.3) * mag; // bias slightly up
      this.velocities[idx + 2] = (direction.z + (Math.random() - 0.5) * spread) * mag;
    }

    this.geometry.setDrawRange(0, count);
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('color').needsUpdate = true;

    this.particles = new THREE.Points(this.geometry, sharedSparkMaterial);
    this.particles.userData.cannotReceiveAO = true;
    // Pooled geometry → stale boundingSphere; skip frustum culling (tiny,
    // sub-second bursts always at the point of combat). See ImpactEffect.
    this.particles.frustumCulled = false;
    scene.add(this.particles);
    this.lifetime = 0.55; // Sparks die quickly
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true;
    }

    const positions = this.geometry.getAttribute('position').array as Float32Array;
    const vel = this.velocities;

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      positions[idx] += vel[idx] * delta * 14;
      positions[idx + 1] += vel[idx + 1] * delta * 14;
      positions[idx + 2] += vel[idx + 2] * delta * 14;

      // Strong gravity so sparks arc down fast, plus heavy drag (they burn out).
      vel[idx + 1] -= delta * 9;
      vel[idx] *= 0.9;
      vel[idx + 1] *= 0.9;
      vel[idx + 2] *= 0.9;
    }

    this.geometry.getAttribute('position').needsUpdate = true;

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.particles);
    // Return the geometry to the pool instead of freeing it (material shared).
    releaseParticleGeometry(_sparkGeoPool, this.geometry);
  }
}

// Impact Burst — the premium, AAA-grade "hit confirm" played in WORLD SPACE at
// the exact point a round connects (enemy armour, or in front of the camera
// when the player is struck). It's a quick two-part flash:
//   • a hot white-gold CORE that pops and snaps out (the spark of contact), and
//   • an expanding SHOCKRING that sweeps outward and thins to nothing.
// Both are camera-facing sprites (always read clean from any angle) drawn
// additively so bloom catches them. Textures are generated once and shared;
// only the two tiny per-instance SpriteMaterials are allocated per hit, so it
// stays cheap enough to fire on full-auto. Pairs with the existing spark burst
// for a layered, weighty impact rather than a flat particle puff.
let _impactCoreTex: THREE.CanvasTexture | null = null;
function getImpactCoreTexture(): THREE.CanvasTexture {
  if (_impactCoreTex) return _impactCoreTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.32, 'rgba(255,251,236,0.9)');
  g.addColorStop(0.68, 'rgba(255,236,200,0.28)');
  g.addColorStop(1, 'rgba(255,236,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _impactCoreTex = new THREE.CanvasTexture(c);
  return _impactCoreTex;
}

let _impactRingTex: THREE.CanvasTexture | null = null;
function getImpactRingTexture(): THREE.CanvasTexture {
  if (_impactRingTex) return _impactRingTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(0.79, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _impactRingTex = new THREE.CanvasTexture(c);
  return _impactRingTex;
}

// Pooled burst sprite pairs. The hit-confirm burst fires on EVERY landed round
// — on autofire that was two fresh SpriteMaterials per hit, the single biggest
// remaining per-hit allocation. A pair (core + ring sprite, each with its own
// reusable material over the shared textures) is borrowed and re-tinted per
// hit; colour is a uniform, so no new shader program is ever created.
interface BurstPair { core: THREE.Sprite; ring: THREE.Sprite; }
const _burstPairPool: BurstPair[] = [];
function buildBurstPair(): BurstPair {
  // depthTest off so the flash reads cleanly even though its centre sits at
  // the body's mid-depth (the front faces would otherwise clip it); the
  // sub-quarter-second life makes any "through cover" peek imperceptible.
  const coreMat = new THREE.SpriteMaterial({
    map: getImpactCoreTexture(),
    color: 0xffffff,
    transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    fog: false, toneMapped: false,
  });
  const core = new THREE.Sprite(coreMat);
  core.renderOrder = 997;
  core.userData.cannotReceiveAO = true;

  const ringMat = new THREE.SpriteMaterial({
    map: getImpactRingTexture(),
    color: 0xffe6b0,
    transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    fog: false, toneMapped: false,
  });
  const ring = new THREE.Sprite(ringMat);
  ring.renderOrder = 996;
  ring.userData.cannotReceiveAO = true;

  return { core, ring };
}

/** Free every pooled impact-burst sprite pair (game teardown). */
export function clearBurstPairPool(): void {
  for (const p of _burstPairPool) {
    (p.core.material as THREE.SpriteMaterial).dispose();
    (p.ring.material as THREE.SpriteMaterial).dispose();
  }
  _burstPairPool.length = 0;
}

const _burstTint = new THREE.Color();
const _burstWhite = new THREE.Color(0xffffff);

export class ImpactBurst {
  private pair: BurstPair;
  private coreMat: THREE.SpriteMaterial;
  private ringMat: THREE.SpriteMaterial;
  private age = 0;
  private readonly life = 0.24;
  private readonly size: number;
  private _released = false;

  constructor(scene: THREE.Scene, position: THREE.Vector3, color = 0xffe6b0, size = 1) {
    this.size = size;
    this.pair = _burstPairPool.pop() ?? buildBurstPair();
    const { core, ring } = this.pair;
    _burstTint.setHex(color);

    this.coreMat = core.material as THREE.SpriteMaterial;
    this.coreMat.color.copy(_burstTint).lerp(_burstWhite, 0.55);
    this.coreMat.opacity = 1;
    core.visible = true;
    core.position.copy(position);
    core.scale.setScalar(0.2 * size);
    scene.add(core);

    this.ringMat = ring.material as THREE.SpriteMaterial;
    this.ringMat.color.copy(_burstTint);
    this.ringMat.opacity = 1;
    ring.position.copy(position);
    ring.scale.setScalar(0.3 * size);
    scene.add(ring);
  }

  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.life;
    if (t >= 1) return true;

    // Core: snaps out big, then fades fast — the spark of contact.
    const coreT = Math.min(1, this.age / 0.1);
    this.pair.core.scale.setScalar((0.2 + 0.72 * easeOut(coreT)) * this.size);
    this.coreMat.opacity = Math.max(0, 1 - this.age / 0.1);
    this.pair.core.visible = this.coreMat.opacity > 0.01;

    // Ring: sweeps outward + thins to nothing.
    const ringS = (0.3 + 2.0 * easeOut(t)) * this.size;
    this.pair.ring.scale.setScalar(ringS);
    this.ringMat.opacity = 0.9 * Math.max(0, 1 - t);

    return false;
  }

  dispose(scene: THREE.Scene, _disposeMaterials = true) {
    if (this._released) return; // idempotent — warmup teardown double-disposes
    this._released = true;
    scene.remove(this.pair.core);
    scene.remove(this.pair.ring);
    // Return the pair to the bounded pool; overflow frees its materials.
    if (_burstPairPool.length < 24) {
      _burstPairPool.push(this.pair);
    } else {
      this.coreMat.dispose();
      this.ringMat.dispose();
    }
    // Textures are shared — never dispose here.
  }
}
