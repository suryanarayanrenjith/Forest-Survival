import * as THREE from 'three';

/**
 * SPLASH SYSTEM — interactive water VFX for the wet ground.
 *
 * Two pre-allocated, GPU-animated pools (one draw call each):
 *
 *   • RINGS — flat expanding ripple rings that play where raindrops strike
 *     puddles and under the feet of anything moving through water (player,
 *     enemies, the Ranger's dash). Each ring is a quad whose expansion +
 *     fade is computed ENTIRELY in the vertex shader from a birth-time
 *     attribute, so after the spawn write the CPU does nothing per frame.
 *
 *   • DROPLETS — small ballistic water beads kicked up by footsteps and
 *     heavy rain hits. Position is integrated in the shader
 *     (p = p0 + v0·t + ½g·t²), again zero CPU per frame.
 *
 * Spawning round-robins over the pools (oldest slot is overwritten), so the
 * system never allocates after construction — in line with the project's
 * pre-allocate + warmup performance invariants. Both pools live in the
 * scene from init (hidden by expired lifetimes), so the warmup shader
 * compile pass picks their programs up and the first real splash never
 * stutters.
 */

// ── Shared sprite textures (built once per session) ─────────────────────────
let ringTexture: THREE.CanvasTexture | null = null;
function getRingTexture(): THREE.CanvasTexture {
  if (ringTexture) return ringTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  // Soft annulus — bright crest with a feathered inner/outer falloff.
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0)');
  grad.addColorStop(0.78, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.88, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  ringTexture = new THREE.CanvasTexture(canvas);
  return ringTexture;
}

let dropTexture: THREE.CanvasTexture | null = null;
function getDropTexture(): THREE.CanvasTexture {
  if (dropTexture) return dropTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, 'rgba(235,245,255,0.95)');
  grad.addColorStop(0.5, 'rgba(215,235,255,0.5)');
  grad.addColorStop(1, 'rgba(215,235,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 16);
  dropTexture = new THREE.CanvasTexture(canvas);
  return dropTexture;
}

// ── Shaders ──────────────────────────────────────────────────────────────────
const RING_VERT = /* glsl */ `
  uniform float uTime;
  attribute vec2 aCenter;
  attribute float aBirth;
  attribute float aLife;
  attribute float aScale;
  attribute float aRot;
  attribute float aBright;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    float t = clamp((uTime - aBirth) / max(aLife, 0.001), 0.0, 1.0);
    // Ease-out expansion: fast crest launch, gentle settle.
    float grow = 1.0 - (1.0 - t) * (1.0 - t);
    float size = aScale * mix(0.22, 1.0, grow);
    // Dead slots collapse to zero — no fragments rasterized.
    float alive = step(0.001, aLife) * step(uTime - aBirth, aLife) * step(0.0, uTime - aBirth);
    float c = cos(aRot), s = sin(aRot);
    vec2 corner = vec2(
      position.x * c - position.z * s,
      position.x * s + position.z * c
    ) * size * alive;
    vec3 world = vec3(aCenter.x + corner.x, 0.035, aCenter.y + corner.y);
    vUv = position.xz + 0.5;
    vAlpha = (1.0 - t) * (1.0 - t) * aBright * alive;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RING_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    float m = texture2D(uMap, vUv).a;
    gl_FragColor = vec4(uColor, m * vAlpha);
  }
`;

const DROP_VERT = /* glsl */ `
  uniform float uTime;
  attribute vec3 aV0;
  attribute float aBirth;
  attribute float aLife;
  attribute float aSize;
  varying float vAlpha;
  void main() {
    float age = uTime - aBirth;
    float t = clamp(age / max(aLife, 0.001), 0.0, 1.0);
    float alive = step(0.001, aLife) * step(0.0, age) * step(age, aLife);
    vec3 p = position + aV0 * age + vec3(0.0, -7.4, 0.0) * age * age;
    vAlpha = (1.0 - t) * alive;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(aSize * (140.0 / max(0.5, -mv.z)), 0.0, 42.0) * alive;
    gl_Position = projectionMatrix * mv;
  }
`;

const DROP_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(uColor, tex.a * vAlpha * 0.85);
  }
`;

export class SplashSystem {
  private readonly scene: THREE.Scene;
  private readonly maxRings: number;
  private readonly maxDrops: number;

  private rings!: THREE.Mesh;
  private ringMat!: THREE.ShaderMaterial;
  private aCenter!: THREE.BufferAttribute;
  private aBirth!: THREE.BufferAttribute;
  private aLife!: THREE.BufferAttribute;
  private aScale!: THREE.BufferAttribute;
  private aRot!: THREE.BufferAttribute;
  private aBright!: THREE.BufferAttribute;
  private ringCursor = 0;

  private drops!: THREE.Points;
  private dropMat!: THREE.ShaderMaterial;
  private dPos!: THREE.BufferAttribute;
  private dV0!: THREE.BufferAttribute;
  private dBirth!: THREE.BufferAttribute;
  private dLife!: THREE.BufferAttribute;
  private dSize!: THREE.BufferAttribute;
  private dropCursor = 0;

  /** Internal clock — both shaders animate against this. */
  private time = 0;
  /** Rain-splash emission accumulator (fractional spawns carry over). */
  private rainAccum = 0;

  constructor(scene: THREE.Scene, maxRings = 64, maxDrops = 192) {
    this.scene = scene;
    this.maxRings = Math.max(8, Math.round(maxRings));
    this.maxDrops = Math.max(16, Math.round(maxDrops));
    this.buildRings();
    this.buildDrops();
  }

  private buildRings(): void {
    const n = this.maxRings;
    const positions = new Float32Array(n * 4 * 3);
    const centers = new Float32Array(n * 4 * 2);
    const births = new Float32Array(n * 4).fill(-100);
    const lives = new Float32Array(n * 4);
    const scales = new Float32Array(n * 4);
    const rots = new Float32Array(n * 4);
    const brights = new Float32Array(n * 4);
    const index: number[] = [];
    // Unit quad corners in the ground plane (rotated/scaled in the shader).
    const corners = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
    for (let i = 0; i < n; i++) {
      for (let v = 0; v < 4; v++) {
        const vi = (i * 4 + v) * 3;
        positions[vi] = corners[v * 2];
        positions[vi + 1] = 0;
        positions[vi + 2] = corners[v * 2 + 1];
      }
      const b = i * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.aCenter = new THREE.BufferAttribute(centers, 2);
    this.aBirth = new THREE.BufferAttribute(births, 1);
    this.aLife = new THREE.BufferAttribute(lives, 1);
    this.aScale = new THREE.BufferAttribute(scales, 1);
    this.aRot = new THREE.BufferAttribute(rots, 1);
    this.aBright = new THREE.BufferAttribute(brights, 1);
    geo.setAttribute('aCenter', this.aCenter);
    geo.setAttribute('aBirth', this.aBirth);
    geo.setAttribute('aLife', this.aLife);
    geo.setAttribute('aScale', this.aScale);
    geo.setAttribute('aRot', this.aRot);
    geo.setAttribute('aBright', this.aBright);
    geo.setIndex(index);

    this.ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: getRingTexture() },
        uColor: { value: new THREE.Color(0.82, 0.9, 1.0) },
      },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.rings = new THREE.Mesh(geo, this.ringMat);
    this.rings.frustumCulled = false; // positions live in the shader
    this.rings.renderOrder = 2;
    this.rings.userData.cannotReceiveAO = true;
    this.scene.add(this.rings);
  }

  private buildDrops(): void {
    const n = this.maxDrops;
    const geo = new THREE.BufferGeometry();
    this.dPos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.dV0 = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.dBirth = new THREE.BufferAttribute(new Float32Array(n).fill(-100), 1);
    this.dLife = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.dSize = new THREE.BufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('position', this.dPos);
    geo.setAttribute('aV0', this.dV0);
    geo.setAttribute('aBirth', this.dBirth);
    geo.setAttribute('aLife', this.dLife);
    geo.setAttribute('aSize', this.dSize);

    this.dropMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: getDropTexture() },
        uColor: { value: new THREE.Color(0.85, 0.92, 1.0) },
      },
      vertexShader: DROP_VERT,
      fragmentShader: DROP_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.drops = new THREE.Points(geo, this.dropMat);
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 3;
    this.drops.userData.cannotReceiveAO = true;
    this.scene.add(this.drops);
  }

  /**
   * Spawn one expanding ripple ring at a world position.
   * `scale` — final ring diameter in metres. `bright` — crest intensity.
   */
  spawnRing(x: number, z: number, scale = 1, bright = 1, life = 0.55): void {
    const i = this.ringCursor;
    this.ringCursor = (this.ringCursor + 1) % this.maxRings;
    const rot = Math.random() * Math.PI * 2;
    for (let v = 0; v < 4; v++) {
      const vi = i * 4 + v;
      this.aCenter.setXY(vi, x, z);
      this.aBirth.setX(vi, this.time);
      this.aLife.setX(vi, life);
      this.aScale.setX(vi, scale);
      this.aRot.setX(vi, rot);
      this.aBright.setX(vi, bright);
    }
    this.aCenter.needsUpdate = true;
    this.aBirth.needsUpdate = true;
    this.aLife.needsUpdate = true;
    this.aScale.needsUpdate = true;
    this.aRot.needsUpdate = true;
    this.aBright.needsUpdate = true;
  }

  /** Kick up a small burst of ballistic water beads at a world position. */
  spawnDrops(x: number, z: number, count: number, vigor = 1): void {
    for (let k = 0; k < count; k++) {
      const i = this.dropCursor;
      this.dropCursor = (this.dropCursor + 1) % this.maxDrops;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.22;
      this.dPos.setXYZ(i, x + Math.cos(a) * r, 0.06, z + Math.sin(a) * r);
      this.dV0.setXYZ(
        i,
        Math.cos(a) * (0.4 + Math.random() * 0.9) * vigor,
        (1.5 + Math.random() * 1.6) * vigor,
        Math.sin(a) * (0.4 + Math.random() * 0.9) * vigor,
      );
      this.dBirth.setX(i, this.time);
      this.dLife.setX(i, 0.35 + Math.random() * 0.25);
      this.dSize.setX(i, 0.5 + Math.random() * 0.6);
    }
    this.dPos.needsUpdate = true;
    this.dV0.needsUpdate = true;
    this.dBirth.needsUpdate = true;
    this.dLife.needsUpdate = true;
    this.dSize.needsUpdate = true;
  }

  /** A full movement splash — ring + droplets, scaled by the mover. */
  splashAt(x: number, z: number, scale = 1, dropCount = 0): void {
    this.spawnRing(x, z, 0.8 * scale + Math.random() * 0.4, 0.9);
    if (dropCount > 0) this.spawnDrops(x, z, dropCount, 0.7 + 0.45 * scale);
  }

  /**
   * Rain impact splashes — call once per frame while it rains. Spawns
   * `intensity`-scaled rings at random points around the camera, biased
   * onto actual puddles via the terrain's CPU puddle sampler (rejection
   * sampling): hits on water play a full ring (+ the odd droplet crown),
   * misses play a faint micro-ring (rain striking mud).
   */
  updateRain(
    dt: number,
    intensity: number,
    camX: number,
    camZ: number,
    puddleAt: (x: number, z: number) => number,
    rateScale = 1,
  ): void {
    if (intensity <= 0.02) {
      this.rainAccum = 0;
      return;
    }
    this.rainAccum += dt * intensity * 24 * rateScale;
    let budget = Math.floor(this.rainAccum);
    if (budget <= 0) return;
    this.rainAccum -= budget;
    budget = Math.min(budget, 6); // hard per-frame cap
    for (let s = 0; s < budget; s++) {
      let px = 0;
      let pz = 0;
      let onPuddle = false;
      // Rejection-sample toward puddles so the show happens ON the water.
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.sqrt(Math.random()) * 15;
        px = camX + Math.cos(a) * r;
        pz = camZ + Math.sin(a) * r;
        if (puddleAt(px, pz) > 0.3) {
          onPuddle = true;
          break;
        }
      }
      if (onPuddle) {
        this.spawnRing(px, pz, 0.5 + Math.random() * 0.55, 0.95, 0.5 + Math.random() * 0.2);
        if (Math.random() < 0.25) this.spawnDrops(px, pz, 2, 0.55);
      } else {
        // Rain hitting soaked dirt — a faint, fast micro-ring.
        this.spawnRing(px, pz, 0.22 + Math.random() * 0.2, 0.35, 0.3);
      }
    }
  }

  /** Advance the shared clock. Call once per frame with the unscaled delta. */
  update(dt: number): void {
    this.time += dt;
    this.ringMat.uniforms.uTime.value = this.time;
    this.dropMat.uniforms.uTime.value = this.time;
  }

  /**
   * Exercise both pools once (attribute upload + draw path) so the warmup
   * pass compiles everything; the spawned VFX expire in well under a second.
   */
  prewarm(x: number, z: number): void {
    this.spawnRing(x, z, 0.5, 0.5, 0.3);
    this.spawnDrops(x, z, 4, 0.5);
  }

  /** Release GPU resources. Safe to call multiple times. */
  dispose(): void {
    if (this.rings) {
      this.scene.remove(this.rings);
      this.rings.geometry.dispose();
      this.ringMat.dispose();
    }
    if (this.drops) {
      this.scene.remove(this.drops);
      this.drops.geometry.dispose();
      this.dropMat.dispose();
    }
  }
}
