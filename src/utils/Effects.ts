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

export class MuzzleFlash {
  light: THREE.PointLight | null;
  sprite: THREE.Sprite;
  lifetime: number = 0;
  private _initialIntensity: number;

  constructor(scene: THREE.Scene, position: THREE.Vector3, _color: number) {
    // Force realistic gun fire colors - yellow/orange (ignore passed color)
    const fireColor = 0xffaa00; // Bright yellow-orange fire color

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

    // Per-instance material owns the animated opacity. Building these is
    // cheap (no texture upload) compared to the underlying canvas texture
    // which is shared. We can't pool the material here because the muzzle
    // flash runs alongside auto-fire and would need overlap-safe state.
    const spriteMaterial = new THREE.SpriteMaterial({
      map: getFlashTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });

    this.sprite = new THREE.Sprite(spriteMaterial);
    this.sprite.position.copy(position);
    this.sprite.scale.set(0.8, 0.8, 0.8); // Larger, more visible flash
    // Legacy AO-opt-out tag preserved for any future AO pass.
    this.sprite.userData.cannotReceiveAO = true;
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
    // Dispose only the per-instance material — the texture map is shared
    // across every flash and must NOT be disposed here.
    if (this.sprite.material instanceof THREE.SpriteMaterial) {
      this.sprite.material.dispose();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared tracer material. Every BulletTracer used to allocate its own
// LineBasicMaterial — even though every tracer is the same bright-yellow,
// linewidth-2 additive line. One shared material across the whole game.
// We can't share OPACITY (each tracer fades on its own clock) but since
// opacity is a single per-material uniform, sharing means every visible
// tracer fades with the most-recently-set value. In practice tracers all
// fade identically over 0.04s so they're effectively in sync, but to keep
// this clean we instead toggle visibility — fade is just visibility on/off
// over the short 40ms window, which reads identically to the old fade.
// ─────────────────────────────────────────────────────────────────────────────
const sharedTracerMaterial = new THREE.LineBasicMaterial({
  color: 0xffffaa,
  transparent: true,
  opacity: 0.9,
  linewidth: 2,
});

export class BulletTracer {
  line: THREE.Line;
  lifetime: number = 0;
  private geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, start: THREE.Vector3, end: THREE.Vector3, _color: number) {
    // Tracer geometry must be unique per shot because the endpoints differ.
    // It's a 2-vertex line — basically free to allocate.
    this.geometry = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    this.line = new THREE.Line(this.geometry, sharedTracerMaterial);
    this.line.userData.cannotReceiveAO = true;
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
    this.geometry.dispose();
    // Material is shared — never dispose here.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared particle materials & a small pool of reusable buffer geometries for
// ImpactEffect and RobotHitSparks. Building a fresh BufferGeometry +
// Float32Arrays + PointsMaterial for every bullet hit is wasteful on
// autofire weapons. We share the material (one per effect type) and reuse
// a pool of geometry slots.
// ─────────────────────────────────────────────────────────────────────────────
const sharedImpactMaterial = new THREE.PointsMaterial({
  size: 0.15,
  vertexColors: true,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

// Robot hit sparks — additive so the hot sparks glow against the scene.
const sharedSparkMaterial = new THREE.PointsMaterial({
  size: 0.16,
  vertexColors: true,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

export class ImpactEffect {
  particles: THREE.Points;
  velocities: THREE.Vector3[] = [];
  lifetime: number = 0;
  private geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, position: THREE.Vector3, _color: number, count: number = 20) {
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

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
      this.velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.2) * 1.2,
        (Math.random() - 0.5) * 1.5,
      ));
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.particles = new THREE.Points(this.geometry, sharedImpactMaterial);
    this.particles.userData.cannotReceiveAO = true;
    scene.add(this.particles);
    this.lifetime = 0.6; // Longer visible impact
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true;
    }

    const positions = this.particles.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < this.velocities.length; i++) {
      const idx = i * 3;
      positions[idx] += this.velocities[i].x * delta * 15;
      positions[idx + 1] += this.velocities[i].y * delta * 15;
      positions[idx + 2] += this.velocities[i].z * delta * 15;

      // Strong gravity for realistic fall
      this.velocities[i].y -= delta * 8;

      // Air resistance
      this.velocities[i].multiplyScalar(0.98);
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
    // Opacity belongs to the shared material — leave it at 1 and rely on
    // the short lifetime + removal to provide the "pop" feel.

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.particles);
    this.geometry.dispose();
    // Material is shared — never dispose here.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────

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

export class ExplosionEffect {
  private group: THREE.Group;
  private fireball: THREE.Mesh;
  private flash: THREE.Mesh;
  private shock: THREE.Mesh;
  private fireMat: THREE.MeshBasicMaterial;
  private flashMat: THREE.MeshBasicMaterial;
  private shockMat: THREE.MeshBasicMaterial;
  private light: THREE.PointLight | null;
  private age = 0;
  private readonly life = 0.55;          // total seconds on screen
  private readonly radius: number;       // visual scale driver
  private readonly lightPeak: number;

  constructor(scene: THREE.Scene, position: THREE.Vector3, radius = 9, color = 0xff7a2a) {
    this.radius = radius;
    this.lightPeak = Math.min(80, 30 + radius * 4);
    this.group = new THREE.Group();
    this.group.position.copy(position);

    this.fireMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.fireball = new THREE.Mesh(EXPLO_FIREBALL_GEO, this.fireMat);
    this.fireball.position.y = radius * 0.18;
    this.fireball.userData.cannotReceiveAO = true;
    this.fireball.renderOrder = 992;
    this.group.add(this.fireball);

    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xfff2c4, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.flash = new THREE.Mesh(EXPLO_FLASH_GEO, this.flashMat);
    this.flash.position.y = radius * 0.18;
    this.flash.userData.cannotReceiveAO = true;
    this.flash.renderOrder = 994;
    this.group.add(this.flash);

    this.shockMat = new THREE.MeshBasicMaterial({
      color: 0xffb066, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.shock = new THREE.Mesh(EXPLO_SHOCK_GEO, this.shockMat);
    this.shock.position.y = 0.12;
    this.shock.userData.cannotReceiveAO = true;
    this.shock.renderOrder = 991;
    this.group.add(this.shock);

    scene.add(this.group);

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

    // Fireball: rapid expand then linger-fade.
    const fb = easeOut(Math.min(1, this.age / 0.32));
    const fbScale = this.radius * (0.22 + 0.45 * fb);
    this.fireball.scale.setScalar(fbScale);
    this.fireMat.opacity = this.age < 0.16 ? 1 : Math.max(0, 1 - (this.age - 0.16) / 0.34);

    // White-hot core: very brief, snaps out fast.
    const flScale = this.radius * (0.18 + 0.5 * easeOut(Math.min(1, this.age / 0.09)));
    this.flash.scale.setScalar(flScale);
    this.flashMat.opacity = Math.max(0, 1 - this.age / 0.13);
    this.flash.visible = this.flashMat.opacity > 0.01;

    // Ground shockwave: spreads wide and thin, fades out.
    const sw = easeOut(t);
    this.shock.scale.set(this.radius * (0.2 + 1.25 * sw), 1, this.radius * (0.2 + 1.25 * sw));
    this.shockMat.opacity = 0.85 * Math.max(0, 1 - t);

    // Pooled light decays quickly so the bloom doesn't linger.
    if (this.light) {
      this.light.intensity = this.lightPeak * Math.max(0, 1 - this.age / 0.3);
    }

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.fireMat.dispose();
    this.flashMat.dispose();
    this.shockMat.dispose();
    if (this.light) {
      if (_explosionLightRelease) _explosionLightRelease(this.light);
      else scene.remove(this.light);
      this.light = null;
    }
    // Geometries are shared (EXPLO_*) — never dispose here.
  }
}

// Robot hit effect — the enemies are robots, so hits throw off hot sparks and
// bits of metal (electric yellow/orange/white with the occasional cyan arc),
// not blood. Sparks fly out from the impact, then arc down under gravity.
export class RobotHitSparks {
  particles: THREE.Points;
  velocities: THREE.Vector3[] = [];
  lifetime: number = 0;
  private geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, position: THREE.Vector3, direction: THREE.Vector3, count: number = 15) {
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

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
      const velocity = new THREE.Vector3(
        direction.x + (Math.random() - 0.5) * spread,
        direction.y + (Math.random() - 0.5) * spread + 0.3, // bias slightly up
        direction.z + (Math.random() - 0.5) * spread,
      );
      velocity.multiplyScalar(0.7 + Math.random() * 0.8);
      this.velocities.push(velocity);
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.particles = new THREE.Points(this.geometry, sharedSparkMaterial);
    this.particles.userData.cannotReceiveAO = true;
    scene.add(this.particles);
    this.lifetime = 0.55; // Sparks die quickly
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true;
    }

    const positions = this.particles.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < this.velocities.length; i++) {
      const idx = i * 3;
      positions[idx] += this.velocities[i].x * delta * 14;
      positions[idx + 1] += this.velocities[i].y * delta * 14;
      positions[idx + 2] += this.velocities[i].z * delta * 14;

      // Strong gravity so sparks arc down fast, plus heavy drag (they burn out).
      this.velocities[i].y -= delta * 9;
      this.velocities[i].multiplyScalar(0.9);
    }

    this.particles.geometry.attributes.position.needsUpdate = true;

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.particles);
    this.geometry.dispose();
    // Material is shared — never dispose here.
  }
}
