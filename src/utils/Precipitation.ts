import * as THREE from 'three';
import { getNoiseTexture } from './NoiseTextures';
import type { StormKind } from './WeatherSystem';

/**
 * PRECIPITATION — GPU weather particles, anchored in the WORLD.
 *
 * The old storm field was one CPU-updated Points cloud (≤2600 square sprites,
 * re-uploaded every frame) parented to the camera — so the rain slid along
 * with the player and a "streak" was a 4-pixel square. Every layer here is an
 * instanced quad field animated entirely in the vertex shader:
 *
 *   • WORLD-WRAPPED VOLUME — each particle's position is its seed inside a box
 *     plus an offset the CPU integrates from the live wind/fall velocity, then
 *     `mod`-wrapped into the box around the camera IN WORLD SPACE. Walking
 *     through the rain moves you past drops that stay where they are; only the
 *     box's far wall recycles them. Offsets are integrated per speed lane and
 *     kept wrapped on the CPU, so precision never decays over a long session.
 *   • RAIN — view-space streaks stretched along the drop velocity (relative to
 *     the moving camera → real motion blur), lit by the sky and flashing with
 *     lightning, plus expanding SPLASH RINGS that pop on the ground around you.
 *   • SNOW / ASH / SPORES / WISPS — soft flakes that flutter on their own,
 *     stretching into streaks when a gale drives them.
 *   • SAND — fine grit streaks raking past on the wind, under rolling DUST
 *     SHEETS (big noise-textured billboards hugging the ground). The blizzard
 *     gets the same sheets as white spindrift.
 *
 * Density is a per-instance threshold (`uAmount`), so a front thickens
 * smoothly without touching buffers; with the weather clear the instance count
 * is 0 and nothing is drawn — yet the programs exist from construction, so
 * the warmup compile links them during loading.
 */

const LANES = [0.82, 0.94, 1.06, 1.18];
const _tint = new THREE.Color();

interface FieldSpec {
  count: number;
  box: [number, number, number];
  /** Fraction of the box height that sits below the camera. */
  below: number;
  /** Base fall speed (u/s, + = down) and how strongly the wind carries it. */
  fall: number;
  windCarry: number;
  shape: 'streak' | 'flake';
  /** Streak length (u) / flake diameter (u); width (u). */
  len: number;
  width: number;
  /** Flake: velocity motion-blur stretch (s) and flutter amplitude (u). */
  stretch: number;
  flutter: number;
  color: number;
  opacity: number;
  additive: boolean;
  /** How much of the sky's TINT the particle takes (the rest is its own
   *  colour at the sky's brightness). */
  lit: number;
  /** Brightness gain over the sky light: a sunlit flake is as bright as the
   *  snow on the ground, far brighter than the diffuse sky term alone. */
  gain: number;
  /** Camera-near fade band (u): no blobs smeared across the lens. */
  near: [number, number];
}

const FIELDS: Record<StormKind, FieldSpec[]> = {
  rain: [
    { count: 10000, box: [56, 34, 56], below: 0.3, fall: 34, windCarry: 1, shape: 'streak', len: 1.8, width: 0.022, stretch: 0, flutter: 0, color: 0xc4d6ea, opacity: 0.34, additive: false, lit: 0.5, gain: 0.85, near: [0.6, 2.4] },
  ],
  blizzard: [
    { count: 5600, box: [50, 30, 50], below: 0.3, fall: 6.5, windCarry: 1, shape: 'flake', len: 0.14, width: 0.14, stretch: 0.04, flutter: 0.45, color: 0xf4f8ff, opacity: 0.85, additive: false, lit: 0.25, gain: 1.1, near: [1.6, 4.2] },
  ],
  sandstorm: [
    { count: 4200, box: [52, 18, 52], below: 0.35, fall: 1.2, windCarry: 1.25, shape: 'streak', len: 0.9, width: 0.026, stretch: 0, flutter: 0.15, color: 0xe2c08c, opacity: 0.24, additive: false, lit: 0.3, gain: 0.9, near: [1.2, 3.5] },
  ],
  ashfall: [
    { count: 3000, box: [50, 30, 50], below: 0.3, fall: 2.4, windCarry: 0.7, shape: 'flake', len: 0.12, width: 0.12, stretch: 0.02, flutter: 0.6, color: 0x9a938a, opacity: 0.7, additive: false, lit: 0.4, gain: 0.7, near: [1.4, 3.8] },
  ],
  spores: [
    { count: 1700, box: [48, 22, 48], below: 0.35, fall: -0.7, windCarry: 0.35, shape: 'flake', len: 0.17, width: 0.17, stretch: 0, flutter: 0.9, color: 0x8ef06a, opacity: 0.55, additive: true, lit: 0, gain: 1, near: [1.2, 3.2] },
  ],
  wisps: [
    { count: 800, box: [50, 22, 50], below: 0.35, fall: -0.25, windCarry: 0.3, shape: 'flake', len: 0.32, width: 0.32, stretch: 0, flutter: 1.3, color: 0xc7a0ff, opacity: 0.5, additive: true, lit: 0, gain: 1, near: [1.6, 4] },
  ],
};

const VERT = /* glsl */ `
  attribute vec4 aSeed;            // xyz: position in the box (0..1), w: random
  uniform vec3 uCam;
  uniform vec3 uBox;
  uniform float uBelow;
  uniform vec3 uOff[4];            // per speed-lane wrapped drift offsets
  uniform vec3 uVel;               // base velocity (for streak direction)
  uniform vec3 uCamVel;
  uniform float uAmount;
  uniform float uTime;
  uniform float uLen;
  uniform float uWidth;
  uniform float uStretch;
  uniform float uFlutter;
  uniform float uStreak;           // 1 = rain/grit streak, 0 = flake
  uniform vec2 uNear;              // camera-near fade band
  varying vec2 vUv;
  varying float vFade;
  varying float vThin;
  void main() {
    float r = aSeed.w;
    if (r >= uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    int lane = int(fract(r * 13.37) * 4.0);
    vec3 off = uOff[0];
    float laneK = 0.82;
    if (lane == 1) { off = uOff[1]; laneK = 0.94; }
    else if (lane == 2) { off = uOff[2]; laneK = 1.06; }
    else if (lane == 3) { off = uOff[3]; laneK = 1.18; }
    vec3 bmin = uCam - uBox * vec3(0.5, uBelow, 0.5);
    vec3 p = bmin + mod(aSeed.xyz * uBox + off - bmin, uBox);
    // Flutter: a flake swims on its own small orbit.
    float ph = r * 61.0;
    p += vec3(sin(uTime * (0.9 + r * 1.3) + ph), 0.0, cos(uTime * (0.7 + r) + ph * 1.7)) * uFlutter;
    vec3 vel = uVel * laneK - uCamVel;
    vec4 vp = viewMatrix * vec4(p, 1.0);
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
    float speed = length(vv);
    vec3 dir = speed > 1e-3 ? vv / speed : vec3(0.0, -1.0, 0.0);
    vec3 toCam = normalize(-vp.xyz);
    vec3 side = cross(dir, toCam);
    float sl = length(side);
    side = sl > 1e-3 ? side / sl : vec3(1.0, 0.0, 0.0);
    float size = 0.75 + 0.5 * fract(r * 7.13);
    vec3 pos;
    vThin = 1.0;
    if (uStreak > 0.5) {
      float len = uLen * size;
      // Never thinner than ~a pixel (sub-pixel lines shimmer): widen with
      // distance and thin the alpha to match, so the energy stays put.
      float w = max(uWidth, -vp.z * 0.0016);
      vThin = uWidth / w;
      pos = vp.xyz + side * position.x * w + dir * (position.y - 0.5) * len;
    } else {
      // Camera-facing flake, stretched along its motion when driven hard.
      float d = uWidth * size;
      vec3 up = cross(toCam, side);
      float stretch = 1.0 + speed * uStretch;
      pos = vp.xyz + side * position.x * d * 0.5 + dir * (position.y - 0.5) * d * stretch;
      if (stretch < 1.05) pos = vp.xyz + side * position.x * d * 0.5 + up * (position.y - 0.5) * d;
    }
    vUv = vec2(position.x, position.y);
    // Soft round edge of the volume + no streaks in the player's face.
    vec2 q = (p.xz - uCam.xz) / (uBox.xz * 0.5);
    float edge = 1.0 - smoothstep(0.62, 1.0, length(q));
    float near = smoothstep(uNear.x, uNear.y, -vp.z);
    vFade = edge * near;
    gl_Position = projectionMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uStreak;
  varying vec2 vUv;
  varying float vFade;
  varying float vThin;
  void main() {
    float a;
    if (uStreak > 0.5) {
      // Thin soft line, brightest just behind the head, fading to the tail.
      float across = 1.0 - abs(vUv.x);
      a = across * across * smoothstep(0.0, 0.55, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
    } else {
      float d = length(vec2(vUv.x, (vUv.y - 0.5) * 2.0));
      a = 1.0 - smoothstep(0.25, 1.0, d);
    }
    a *= uOpacity * vFade * vThin;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

// Splash rings: ground-aligned quads that pop and expand around the player.
const SPLASH_VERT = /* glsl */ `
  attribute vec4 aSeed;            // xy: position in the box, z: rate, w: random
  uniform vec3 uCam;
  uniform float uBox;
  uniform float uTime;
  uniform float uAmount;
  uniform float uGround;
  varying vec2 vUv;
  varying float vT;
  varying float vFade;
  float h1(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    if (aSeed.w >= uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float rate = 1.6 + aSeed.z * 1.8;
    float cyc = uTime * rate + aSeed.w * 17.0;
    float n = floor(cyc);
    float t = fract(cyc);
    // A new spot every cycle.
    vec2 jitter = vec2(h1(n * 12.9 + aSeed.x * 78.2), h1(n * 7.3 + aSeed.y * 37.7));
    vec2 bmin = uCam.xz - vec2(uBox * 0.5);
    vec2 xz = bmin + mod((aSeed.xy + jitter) * uBox - bmin, vec2(uBox));
    float radius = 0.06 + t * (0.28 + aSeed.z * 0.18);
    vec3 world = vec3(xz.x + position.x * radius, uGround, xz.y + position.y * radius);
    vUv = position.xy;
    vT = t;
    float d = length(xz - uCam.xz) / (uBox * 0.5);
    vFade = 1.0 - smoothstep(0.55, 1.0, d);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SPLASH_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vT;
  varying float vFade;
  void main() {
    float r = length(vUv);
    float ring = 1.0 - smoothstep(0.0, 0.16, abs(r - 0.82));
    float core = (1.0 - smoothstep(0.0, 0.35, r)) * (1.0 - smoothstep(0.0, 0.25, vT));
    float a = (ring * (1.0 - vT) * (1.0 - vT) + core * 0.8) * uOpacity * vFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

// Dust / spindrift sheets: big soft billboards textured with drifting noise.
const SHEET_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform vec3 uCam;
  uniform vec3 uBox;
  uniform vec3 uOff;
  uniform float uAmount;
  uniform float uSize;
  varying vec2 vUv;
  varying float vFade;
  varying vec2 vSeed;
  void main() {
    if (aSeed.w >= uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec3 bmin = vec3(uCam.x - uBox.x * 0.5, 0.0, uCam.z - uBox.z * 0.5);
    vec3 p = bmin + mod(aSeed.xyz * uBox + uOff - bmin, uBox);
    float size = uSize * (0.6 + 0.8 * fract(aSeed.w * 9.7));
    p.y = size * 0.32 + aSeed.y * 2.5;
    vec4 vp = viewMatrix * vec4(p, 1.0);
    vp.xy += position.xy * size;
    vUv = position.xy * 2.0;
    vSeed = aSeed.xz * 7.0;
    vec2 q = (p.xz - uCam.xz) / (uBox.xz * 0.5);
    vFade = (1.0 - smoothstep(0.55, 1.0, length(q))) * smoothstep(3.0, 11.0, -vp.z);
    gl_Position = projectionMatrix * vp;
  }
`;

const SHEET_FRAG = /* glsl */ `
  uniform sampler2D uBakedNoise;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;
  varying vec2 vSeed;
  void main() {
    float r = length(vUv);
    float mask = 1.0 - smoothstep(0.35, 1.0, r);
    mask *= smoothstep(-1.0, -0.35, vUv.y);           // never a hard bottom edge
    vec2 uv = vUv * 0.55 + vSeed + vec2(uTime * 0.07, uTime * 0.02);
    float n = texture2D(uBakedNoise, uv * 0.35).r * 0.65 + texture2D(uBakedNoise, uv * 0.9 + 3.1).g * 0.35;
    n = smoothstep(0.32, 0.78, n);
    float a = n * mask * uOpacity * vFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

function quadGeometry(count: number, seedFill: (out: Float32Array, i: number) => void, centered = false): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  const pos = centered
    ? new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0])
    : new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) seedFill(seeds, i);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = 0;
  return g;
}

interface Field {
  spec: FieldSpec;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  geo: THREE.InstancedBufferGeometry;
  count: number;
  off: THREE.Vector3[];
}

export class Precipitation {
  private readonly scene: THREE.Scene;
  private readonly kind: StormKind;
  private readonly fields: Field[] = [];
  private splash: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; geo: THREE.InstancedBufferGeometry; count: number } | null = null;
  private sheets: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; geo: THREE.InstancedBufferGeometry; count: number; off: THREE.Vector3; box: THREE.Vector3 } | null = null;
  private time = 0;
  private readonly lastCam = new THREE.Vector3();
  private readonly camVel = new THREE.Vector3();
  private hasCam = false;
  private readonly vel = new THREE.Vector3();

  constructor(scene: THREE.Scene, kind: StormKind, quality: number) {
    this.scene = scene;
    this.kind = kind;
    const q = THREE.MathUtils.clamp(quality, 0.25, 1);
    for (const spec of FIELDS[kind]) {
      const count = Math.round(spec.count * q);
      const geo = quadGeometry(count, (s, i) => {
        s[i * 4] = Math.random(); s[i * 4 + 1] = Math.random(); s[i * 4 + 2] = Math.random(); s[i * 4 + 3] = Math.random();
      });
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uCam: { value: new THREE.Vector3() },
          uBox: { value: new THREE.Vector3(...spec.box) },
          uBelow: { value: spec.below },
          uOff: { value: LANES.map(() => new THREE.Vector3()) },
          uVel: { value: new THREE.Vector3(0, -spec.fall, 0) },
          uCamVel: { value: new THREE.Vector3() },
          uAmount: { value: 0 },
          uTime: { value: 0 },
          uLen: { value: spec.len },
          uWidth: { value: spec.width },
          uStretch: { value: spec.stretch },
          uFlutter: { value: spec.flutter },
          uStreak: { value: spec.shape === 'streak' ? 1 : 0 },
          uNear: { value: new THREE.Vector2(spec.near[0], spec.near[1]) },
          uColor: { value: new THREE.Color(spec.color) },
          uOpacity: { value: spec.opacity },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.userData.kind = 'weather';
      scene.add(mesh);
      this.fields.push({ spec, mesh, mat, geo, count, off: LANES.map(() => new THREE.Vector3()) });
    }
    if (kind === 'rain') {
      const count = Math.round(520 * q);
      const geo = quadGeometry(count, (s, i) => {
        s[i * 4] = Math.random(); s[i * 4 + 1] = Math.random(); s[i * 4 + 2] = Math.random(); s[i * 4 + 3] = Math.random();
      }, true);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uCam: { value: new THREE.Vector3() },
          uBox: { value: 34 },
          uTime: { value: 0 },
          uAmount: { value: 0 },
          uGround: { value: 0.03 },
          uColor: { value: new THREE.Color(0xd8e6f4) },
          uOpacity: { value: 0.5 },
        },
        vertexShader: SPLASH_VERT,
        fragmentShader: SPLASH_FRAG,
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      mesh.userData.kind = 'weather';
      scene.add(mesh);
      this.splash = { mesh, mat, geo, count };
    }
    if (kind === 'sandstorm' || kind === 'blizzard') {
      const count = Math.round(70 * q);
      const box = new THREE.Vector3(130, 1, 130);
      const geo = quadGeometry(count, (s, i) => {
        s[i * 4] = Math.random(); s[i * 4 + 1] = Math.random(); s[i * 4 + 2] = Math.random(); s[i * 4 + 3] = Math.random();
      }, true);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uCam: { value: new THREE.Vector3() },
          uBox: { value: box },
          uOff: { value: new THREE.Vector3() },
          uAmount: { value: 0 },
          uSize: { value: kind === 'sandstorm' ? 13 : 9 },
          uTime: { value: 0 },
          uBakedNoise: { value: getNoiseTexture() },
          uColor: { value: new THREE.Color(kind === 'sandstorm' ? 0xcfa36a : 0xf2f6fc) },
          uOpacity: { value: kind === 'sandstorm' ? 0.42 : 0.34 },
        },
        vertexShader: SHEET_VERT,
        fragmentShader: SHEET_FRAG,
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      mesh.userData.kind = 'weather';
      scene.add(mesh);
      this.sheets = { mesh, mat, geo, count, off: new THREE.Vector3(), box };
    }
  }

  /**
   * `amount` 0..1 precipitation; `windX/Z` the live wind (u/s); `light` the
   * colour the particles take from the sky this frame; `flash` 0..1 lightning.
   */
  update(dt: number, cam: THREE.Vector3, amount: number, windX: number, windZ: number, light: THREE.Color, flash: number): void {
    this.time += dt;
    if (!this.hasCam) { this.lastCam.copy(cam); this.hasCam = true; }
    if (dt > 0) {
      // Camera velocity (smoothed): streaks are drawn relative to the eye, so
      // running into the rain slants it toward you like real motion blur.
      const k = Math.min(1, dt * 10);
      this.camVel.x += ((cam.x - this.lastCam.x) / dt - this.camVel.x) * k;
      this.camVel.y += ((cam.y - this.lastCam.y) / dt - this.camVel.y) * k;
      this.camVel.z += ((cam.z - this.lastCam.z) / dt - this.camVel.z) * k;
      if (this.camVel.lengthSq() > 80 * 80) this.camVel.setScalar(0); // teleport
    }
    this.lastCam.copy(cam);
    const on = amount > 0.004;
    for (const f of this.fields) {
      const s = f.spec;
      f.geo.instanceCount = on ? f.count : 0;
      if (!on) continue;
      this.vel.set(windX * s.windCarry, -s.fall, windZ * s.windCarry);
      const box = f.mat.uniforms.uBox.value as THREE.Vector3;
      for (let l = 0; l < LANES.length; l++) {
        const o = f.off[l];
        o.addScaledVector(this.vel, LANES[l] * dt);
        o.x = ((o.x % box.x) + box.x) % box.x;
        o.y = ((o.y % box.y) + box.y) % box.y;
        o.z = ((o.z % box.z) + box.z) % box.z;
        (f.mat.uniforms.uOff.value as THREE.Vector3[])[l].copy(o);
      }
      const u = f.mat.uniforms;
      (u.uCam.value as THREE.Vector3).copy(cam);
      (u.uVel.value as THREE.Vector3).copy(this.vel);
      (u.uCamVel.value as THREE.Vector3).copy(this.camVel).multiplyScalar(s.shape === 'streak' ? 0.6 : 0.25);
      u.uAmount.value = amount;
      u.uTime.value = this.time;
      const c = u.uColor.value as THREE.Color;
      c.setHex(s.color);
      if (!s.additive) {
        // Own colour at the sky's brightness, tinted `lit` toward the sky.
        const lum = light.r * 0.2126 + light.g * 0.7152 + light.b * 0.0722;
        _tint.setRGB(lum, lum, lum).lerp(light, s.lit).multiplyScalar(s.gain);
        c.multiply(_tint).addScalar(flash * 0.9);
      }
    }
    if (this.splash) {
      this.splash.geo.instanceCount = on ? this.splash.count : 0;
      if (on) {
        const u = this.splash.mat.uniforms;
        (u.uCam.value as THREE.Vector3).copy(cam);
        u.uTime.value = this.time;
        u.uAmount.value = amount;
        (u.uColor.value as THREE.Color).copy(light).multiplyScalar(0.6).addScalar(flash * 0.6);
      }
    }
    if (this.sheets) {
      const sh = this.sheets;
      const vis = amount > 0.15;
      sh.geo.instanceCount = vis ? sh.count : 0;
      if (vis) {
        sh.off.x = (((sh.off.x + windX * 1.15 * dt) % sh.box.x) + sh.box.x) % sh.box.x;
        sh.off.z = (((sh.off.z + windZ * 1.15 * dt) % sh.box.z) + sh.box.z) % sh.box.z;
        const u = sh.mat.uniforms;
        (u.uCam.value as THREE.Vector3).copy(cam);
        (u.uOff.value as THREE.Vector3).copy(sh.off);
        u.uAmount.value = (amount - 0.15) / 0.85;
        u.uTime.value = this.time;
        (u.uColor.value as THREE.Color).setHex(this.kind === 'sandstorm' ? 0xcfa36a : 0xf2f6fc).multiply(light);
      }
    }
  }

  dispose(): void {
    for (const f of this.fields) {
      this.scene.remove(f.mesh);
      f.geo.dispose();
      f.mat.dispose();
    }
    this.fields.length = 0;
    for (const x of [this.splash, this.sheets]) {
      if (!x) continue;
      this.scene.remove(x.mesh);
      x.geo.dispose();
      x.mat.dispose();
    }
    this.splash = null;
    this.sheets = null;
  }
}
