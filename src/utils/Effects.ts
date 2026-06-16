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

// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────
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
      size: 0.4, vertexColors: true, transparent: true, opacity: 1,
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

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.ringFrontMat.dispose();
    this.ringBackMat.dispose();
    this.domeMat.dispose();
    this.emberMat.dispose();
    this.emberGeo.dispose();
    if (this.light) {
      if (_explosionLightRelease) _explosionLightRelease(this.light);
      else scene.remove(this.light);
      this.light = null;
    }
    // NOVA_* geometries are shared — never dispose here.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ability Cast — a generic, tinted "signature move" burst played at the caster
// the instant ANY character ability fires. It reads as a surge of the
// ability's accent colour erupting from the player: an expanding ground energy
// ring, a brief rising pillar of light, a hot core flash and a ring of rising
// sparks. One reusable effect (recoloured per ability) gives every class a
// distinct, readable activation without bespoke geometry per power.
// ─────────────────────────────────────────────────────────────────────────────
const CAST_PILLAR_GEO = new THREE.CylinderGeometry(0.7, 1.25, 4.4, 24, 1, true);

export class AbilityCastEffect {
  private group: THREE.Group;
  private ring: THREE.Mesh;
  private pillar: THREE.Mesh;
  private core: THREE.Mesh;
  private sparks: THREE.Points;
  private sparkVel: Float32Array;
  private ringMat: THREE.MeshBasicMaterial;
  private pillarMat: THREE.MeshBasicMaterial;
  private coreMat: THREE.MeshBasicMaterial;
  private sparkMat: THREE.PointsMaterial;
  private sparkGeo: THREE.BufferGeometry;
  private light: THREE.PointLight | null;
  private age = 0;
  private readonly life = 0.72;

  constructor(scene: THREE.Scene, position: THREE.Vector3, color = 0x22d3ee) {
    const tint = new THREE.Color(color);
    this.group = new THREE.Group();
    this.group.position.set(position.x, 0.05, position.z);

    // Expanding ground ring.
    this.ringMat = new THREE.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(NOVA_RING_GEO, this.ringMat);
    this.ring.position.y = 0.12;
    this.ring.renderOrder = 990;
    this.ring.userData.cannotReceiveAO = true;
    this.group.add(this.ring);

    // Rising pillar of light (open cylinder, walls kept off the camera centre).
    this.pillarMat = new THREE.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.pillar = new THREE.Mesh(CAST_PILLAR_GEO, this.pillarMat);
    this.pillar.position.y = 2.2;
    this.pillar.renderOrder = 991;
    this.pillar.userData.cannotReceiveAO = true;
    this.group.add(this.pillar);

    // Hot core flash.
    this.coreMat = new THREE.MeshBasicMaterial({
      color: tint.clone().lerp(new THREE.Color(0xffffff), 0.5), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.core = new THREE.Mesh(NOVA_DOME_GEO, this.coreMat);
    this.core.position.y = 1.1;
    this.core.renderOrder = 992;
    this.core.userData.cannotReceiveAO = true;
    this.group.add(this.core);

    // Rising spark ring.
    const sparkCount = 30;
    this.sparkGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(sparkCount * 3);
    const colors = new Float32Array(sparkCount * 3);
    this.sparkVel = new Float32Array(sparkCount * 3);
    const hot = tint.clone().lerp(new THREE.Color(0xffffff), 0.35);
    for (let i = 0; i < sparkCount; i++) {
      const i3 = i * 3;
      const ang = Math.random() * Math.PI * 2;
      const out = 1.5 + Math.random() * 2.0;
      positions[i3] = Math.cos(ang) * 0.6;
      positions[i3 + 1] = 0.2 + Math.random() * 0.4;
      positions[i3 + 2] = Math.sin(ang) * 0.6;
      this.sparkVel[i3] = Math.cos(ang) * out;
      this.sparkVel[i3 + 1] = 3.5 + Math.random() * 4.0; // strong upward rush
      this.sparkVel[i3 + 2] = Math.sin(ang) * out;
      colors[i3] = hot.r; colors[i3 + 1] = hot.g; colors[i3 + 2] = hot.b;
    }
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.sparkMat = new THREE.PointsMaterial({
      size: 0.3, vertexColors: true, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.sparks = new THREE.Points(this.sparkGeo, this.sparkMat);
    this.sparks.userData.cannotReceiveAO = true;
    this.group.add(this.sparks);

    scene.add(this.group);

    // Brief tinted light so the cast actually illuminates the player + ground.
    this.light = _explosionLightAcquire ? _explosionLightAcquire() : null;
    if (this.light) {
      this.light.color.copy(tint);
      this.light.intensity = 26;
      this.light.distance = 22;
      this.light.position.set(position.x, 1.6, position.z);
    }
  }

  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.life;
    if (t >= 1) return true;

    // Ground ring sweeps out + fades.
    const rs = 0.6 + easeOut(t) * 5.4;
    this.ring.scale.set(rs, 1, rs);
    this.ringMat.opacity = 0.95 * (1 - t);

    // Pillar rises (scale.y up from the floor) then dissolves.
    const up = easeOut(Math.min(1, this.age / 0.3));
    this.pillar.scale.set(0.6 + 0.5 * up, up, 0.6 + 0.5 * up);
    this.pillarMat.opacity = 0.5 * Math.max(0, 1 - this.age / 0.45);

    // Core flash — quick punch out.
    const cs = 0.4 + easeOut(Math.min(1, this.age / 0.12)) * 1.3;
    this.core.scale.setScalar(cs);
    this.coreMat.opacity = Math.max(0, 1 - this.age / 0.2);
    this.core.visible = this.coreMat.opacity > 0.01;

    // Sparks rise + spread under light gravity.
    const pos = this.sparkGeo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.sparkVel.length; i += 3) {
      arr[i] += this.sparkVel[i] * delta;
      arr[i + 1] += this.sparkVel[i + 1] * delta;
      arr[i + 2] += this.sparkVel[i + 2] * delta;
      this.sparkVel[i + 1] -= 6 * delta;
    }
    pos.needsUpdate = true;
    this.sparkMat.opacity = Math.max(0, 1 - t);

    if (this.light) this.light.intensity = 26 * Math.max(0, 1 - this.age / 0.28);

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.ringMat.dispose();
    this.pillarMat.dispose();
    this.coreMat.dispose();
    this.sparkMat.dispose();
    this.sparkGeo.dispose();
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

// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────
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

export class ImpactBurst {
  private core: THREE.Sprite;
  private ring: THREE.Sprite;
  private coreMat: THREE.SpriteMaterial;
  private ringMat: THREE.SpriteMaterial;
  private age = 0;
  private readonly life = 0.24;
  private readonly size: number;

  constructor(scene: THREE.Scene, position: THREE.Vector3, color = 0xffe6b0, size = 1) {
    this.size = size;
    const tint = new THREE.Color(color);

    // depthTest off so the flash reads cleanly even though its centre sits at
    // the body's mid-depth (the front faces would otherwise clip it); the
    // sub-quarter-second life makes any "through cover" peek imperceptible.
    this.coreMat = new THREE.SpriteMaterial({
      map: getImpactCoreTexture(),
      color: tint.clone().lerp(new THREE.Color(0xffffff), 0.55),
      transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      fog: false, toneMapped: false,
    });
    this.core = new THREE.Sprite(this.coreMat);
    this.core.position.copy(position);
    this.core.scale.setScalar(0.2 * size);
    this.core.renderOrder = 997;
    this.core.userData.cannotReceiveAO = true;
    scene.add(this.core);

    this.ringMat = new THREE.SpriteMaterial({
      map: getImpactRingTexture(),
      color: tint,
      transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      fog: false, toneMapped: false,
    });
    this.ring = new THREE.Sprite(this.ringMat);
    this.ring.position.copy(position);
    this.ring.scale.setScalar(0.3 * size);
    this.ring.renderOrder = 996;
    this.ring.userData.cannotReceiveAO = true;
    scene.add(this.ring);
  }

  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / this.life;
    if (t >= 1) return true;

    // Core: snaps out big, then fades fast — the spark of contact.
    const coreT = Math.min(1, this.age / 0.1);
    this.core.scale.setScalar((0.2 + 0.72 * easeOut(coreT)) * this.size);
    this.coreMat.opacity = Math.max(0, 1 - this.age / 0.1);
    this.core.visible = this.coreMat.opacity > 0.01;

    // Ring: sweeps outward + thins to nothing.
    const ringS = (0.3 + 2.0 * easeOut(t)) * this.size;
    this.ring.scale.setScalar(ringS);
    this.ringMat.opacity = 0.9 * Math.max(0, 1 - t);

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.core);
    scene.remove(this.ring);
    this.coreMat.dispose();
    this.ringMat.dispose();
    // Textures are shared — never dispose here.
  }
}
