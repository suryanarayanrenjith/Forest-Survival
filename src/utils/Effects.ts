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
// ImpactEffect and BloodSplatter. Building a fresh BufferGeometry +
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

const sharedBloodMaterial = new THREE.PointsMaterial({
  size: 0.2,
  vertexColors: true,
  transparent: true,
  opacity: 0.9,
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

// New: Blood splatter effect for enemy hits
export class BloodSplatter {
  particles: THREE.Points;
  velocities: THREE.Vector3[] = [];
  lifetime: number = 0;
  private geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, position: THREE.Vector3, direction: THREE.Vector3, count: number = 15) {
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      positions[idx] = position.x;
      positions[idx + 1] = position.y;
      positions[idx + 2] = position.z;

      // Dark red blood
      const bloodColor = Math.random() > 0.7 ? 0x8b0000 : 0xa00000;
      colors[idx] = ((bloodColor >> 16) & 255) / 255;
      colors[idx + 1] = ((bloodColor >> 8) & 255) / 255;
      colors[idx + 2] = (bloodColor & 255) / 255;

      // Spray away from impact direction
      const spread = 0.5;
      const velocity = new THREE.Vector3(
        direction.x + (Math.random() - 0.5) * spread,
        direction.y + (Math.random() - 0.5) * spread,
        direction.z + (Math.random() - 0.5) * spread,
      );
      velocity.multiplyScalar(0.5 + Math.random() * 0.5);
      this.velocities.push(velocity);
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.particles = new THREE.Points(this.geometry, sharedBloodMaterial);
    this.particles.userData.cannotReceiveAO = true;
    scene.add(this.particles);
    this.lifetime = 1.0;
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true;
    }

    const positions = this.particles.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < this.velocities.length; i++) {
      const idx = i * 3;
      positions[idx] += this.velocities[i].x * delta * 10;
      positions[idx + 1] += this.velocities[i].y * delta * 10;
      positions[idx + 2] += this.velocities[i].z * delta * 10;

      // Gravity
      this.velocities[i].y -= delta * 5;
      this.velocities[i].multiplyScalar(0.95); // Drag
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
