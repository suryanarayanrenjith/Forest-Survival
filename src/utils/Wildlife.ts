import * as THREE from 'three';
import type { MapType } from './MapSystem';

/**
 * WILDLIFE — the world is inhabited.
 *
 * Two GPU-animated layers, each ONE draw call with every bit of motion in the
 * vertex shader (no per-frame CPU loop, no buffer re-upload — advancing them is
 * a few uniform writes), built before the warmup compile so their programs link
 * during loading:
 *
 *   • BIRDS — a flock circling high over the arena. Wings beat in bursts and
 *     the bird GLIDES between them (wings held in a shallow dihedral), banking
 *     into the turn; each bird has its own orbit radius, altitude, rhythm and
 *     phase, so the flock reads as animals, not a rotating decal. Per map:
 *     raptors riding thermals over the desert / tundra / ruins, small fast
 *     flocks over the forests and swamp, crows over the outpost. Birds roost at
 *     night (they shrink to nothing as the light goes).
 *
 *   • LEAVES — under the Deep Forest canopy, leaves drift down through a camera-local
 *     column, fluttering (each spins about its own tilted axis while it
 *     side-slips on the wind) and flashing as they turn toward the sun.
 */

interface FlockConfig {
  count: number;
  span: number;        // wingspan (m)
  radiusMin: number;   // orbit radius band (m)
  radiusMax: number;
  altMin: number;      // altitude band (m)
  altMax: number;
  speed: number;       // orbit angular speed (rad/s)
  flapHz: number;      // wingbeat frequency
  glide: number;       // 0 = always flapping … 1 = mostly gliding
  color: number;
}

interface LeafConfig {
  count: number;
  colors: [number, number, number];
  size: number;
}

const FLOCKS: Partial<Record<MapType, FlockConfig>> = {
  deep_forest:      { count: 16, span: 1.1, radiusMin: 14, radiusMax: 32, altMin: 15, altMax: 24, speed: 0.24, flapHz: 9.5, glide: 0.25, color: 0x16181a },
  autumn_grove:     { count: 13, span: 1.15, radiusMin: 15, radiusMax: 34, altMin: 15, altMax: 24, speed: 0.22, flapHz: 8.5, glide: 0.3, color: 0x141217 },
  toxic_swamp:      { count: 11, span: 1.25, radiusMin: 16, radiusMax: 36, altMin: 14, altMax: 22, speed: 0.2, flapHz: 7.5, glide: 0.35, color: 0x161a16 },
  military_outpost: { count: 9, span: 1.3, radiusMin: 18, radiusMax: 38, altMin: 16, altMax: 26, speed: 0.19, flapHz: 6.5, glide: 0.4, color: 0x101114 },
  desert_canyon:    { count: 5, span: 2.6, radiusMin: 22, radiusMax: 48, altMin: 24, altMax: 36, speed: 0.09, flapHz: 3.2, glide: 0.85, color: 0x1e1712 },
  ancient_ruins:    { count: 6, span: 2.4, radiusMin: 22, radiusMax: 46, altMin: 22, altMax: 34, speed: 0.1, flapHz: 3.5, glide: 0.8, color: 0x1c1915 },
  frozen_tundra:    { count: 5, span: 2.5, radiusMin: 24, radiusMax: 48, altMin: 24, altMax: 36, speed: 0.095, flapHz: 3.4, glide: 0.82, color: 0x22262b },
};

// Only where there is a canopy to shed them: the Twilight Vale's trees are
// bare and the ruins are open stone, so leaves there read as confetti.
const LEAVES: Partial<Record<MapType, LeafConfig>> = {
  deep_forest: { count: 140, colors: [0x557f2a, 0x7f9634, 0x9c8636], size: 0.11 },
};

const BIRD_VERT = /* glsl */ `
  attribute vec3 aLocal;
  attribute float aWing;   // 0 = body, 1 = wingtip (flap weight)
  attribute vec4 aSeed;    // phase, orbit radius, altitude, rhythm (0..1)
  uniform float uTime;
  uniform vec3 uCenter;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uFlapHz;
  uniform float uGlide;
  void main() {
    float t = uTime;
    float rhythm = aSeed.w;
    float ang = aSeed.x + t * uSpeed * (0.85 + rhythm * 0.3);
    float r = aSeed.y + sin(t * 0.11 + aSeed.x * 3.0) * 5.0;
    float alt = aSeed.z + sin(t * 0.37 + aSeed.x * 5.0) * 1.6;
    vec3 pos = uCenter + vec3(cos(ang) * r, alt, sin(ang) * r);
    // Flying counter-clockwise round the orbit: heading is its tangent.
    vec3 fwd = normalize(vec3(-sin(ang), 0.0, cos(ang)));
    vec3 up0 = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(fwd, up0));
    // Bank into the turn (the centre is to the bird's left).
    float bank = 0.38;
    vec3 up = normalize(up0 * cos(bank) + right * sin(bank));
    right = normalize(cross(fwd, up));
    // Wingbeats come in bursts with glides between; while gliding the wings
    // hold a shallow dihedral instead of freezing flat.
    float burst = smoothstep(uGlide - 0.35, uGlide + 0.25, sin(t * (0.45 + rhythm * 0.3) + aSeed.x * 7.0) * 0.5 + 0.5);
    float beat = sin(t * uFlapHz * (0.9 + rhythm * 0.2) * 6.2831853 + aSeed.x * 11.0);
    vec3 l = aLocal;
    l.y += aWing * (beat * 0.42 * burst + (1.0 - burst) * 0.12);
    l.x *= 1.0 - aWing * abs(beat) * 0.12 * burst; // wings fold a touch on the upstroke
    vec3 world = pos + (right * l.x + up * l.y + fwd * l.z) * uScale;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const BIRD_FRAG = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, 1.0);
  }
`;

const LEAF_VERT = /* glsl */ `
  attribute vec2 aCorner;  // -1..1 quad corner
  attribute vec4 aSeed;    // x,z offset in column (normalised), phase, palette pick
  uniform float uTime;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uFall;
  uniform vec2 uWind;
  uniform float uSize;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying float vShade;
  varying float vPick;
  mat3 axisAngle(vec3 a, float ang) {
    float s = sin(ang), c = cos(ang), oc = 1.0 - c;
    return mat3(
      oc * a.x * a.x + c,       oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s,
      oc * a.x * a.y - a.z * s, oc * a.y * a.y + c,       oc * a.y * a.z + a.x * s,
      oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c);
  }
  void main() {
    float ph = aSeed.z;
    float fall = uFall * (0.75 + fract(ph * 7.3) * 0.5);
    // Wrap the fall through the column so the field is endless.
    float y = uHeight - mod(uTime * fall + ph * uHeight, uHeight);
    // Side-slip: the classic falling-leaf pendulum, plus the wind.
    float sway = sin(uTime * (1.3 + fract(ph * 3.1)) + ph * 20.0);
    vec3 c = vec3(aSeed.x * uRadius, y, aSeed.y * uRadius);
    c.xz += uWind * (uHeight - y) * 0.35 + vec2(sway * 0.6, cos(uTime * 0.9 + ph * 13.0) * 0.35);
    // Re-wrap horizontally so wind drift never empties the column.
    c.xz = mod(c.xz + uRadius, uRadius * 2.0) - uRadius;
    // Flutter: spin about a per-leaf tilted axis.
    vec3 axis = normalize(vec3(sin(ph * 17.0), 0.6, cos(ph * 11.0)));
    mat3 R = axisAngle(axis, uTime * (2.2 + fract(ph * 5.7) * 2.5) + ph * 30.0);
    vec3 local = R * vec3(aCorner.x * uSize, 0.0, aCorner.y * uSize * 1.6);
    vec3 n = R * vec3(0.0, 1.0, 0.0);
    vec4 wp = modelMatrix * vec4(c + local, 1.0);
    vUv = aCorner;
    vShade = 0.45 + 0.55 * abs(dot(n, uSunDir));
    vPick = aSeed.w;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const LEAF_FRAG = /* glsl */ `
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform float uLight;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vShade;
  varying float vPick;
  void main() {
    // Leaf silhouette: pointed ellipse along the long axis, with a midrib.
    float w = 1.0 - vUv.y * vUv.y;
    if (abs(vUv.x) > w * 0.95) discard;
    vec3 col = vPick < 0.33 ? uC0 : (vPick < 0.66 ? uC1 : uC2);
    col *= 0.86 + 0.14 * smoothstep(0.0, 0.12, abs(vUv.x)); // midrib
    gl_FragColor = vec4(col * vShade * uLight, uOpacity);
  }
`;

export class Wildlife {
  private readonly scene: THREE.Scene;
  private birds: THREE.Mesh | null = null;
  private birdMat: THREE.ShaderMaterial | null = null;
  private leaves: THREE.Mesh | null = null;
  private leafMat: THREE.ShaderMaterial | null = null;
  private center = new THREE.Vector3();
  private centerReady = false;
  private daylight = 1;

  constructor(scene: THREE.Scene, map: MapType, withLeaves: boolean) {
    this.scene = scene;
    const f = FLOCKS[map];
    if (f) this.buildBirds(f);
    const l = LEAVES[map];
    if (l && withLeaves) this.buildLeaves(l);
  }

  private buildBirds(f: FlockConfig): void {
    // One bird = body (2 tris) + two wings (1 tri each, inner edge on the
    // body). Baked N times into a single geometry.
    const h = f.span / 2;
    const tmpl: Array<[number, number, number, number]> = [
      // body: nose → tail diamond (x, y, z, wing weight)
      [0, 0, 0.32 * f.span, 0], [-0.06 * f.span, 0, 0, 0], [0.06 * f.span, 0, 0, 0],
      [-0.06 * f.span, 0, 0, 0], [0, 0, -0.3 * f.span, 0], [0.06 * f.span, 0, 0, 0],
      // left wing
      [-0.05 * f.span, 0, 0.1 * f.span, 0], [-h, 0, -0.06 * f.span, 1], [-0.05 * f.span, 0, -0.12 * f.span, 0],
      // right wing
      [0.05 * f.span, 0, 0.1 * f.span, 0], [0.05 * f.span, 0, -0.12 * f.span, 0], [h, 0, -0.06 * f.span, 1],
    ];
    const n = f.count;
    const vpb = tmpl.length;
    const local = new Float32Array(n * vpb * 3);
    const wing = new Float32Array(n * vpb);
    const seed = new Float32Array(n * vpb * 4);
    for (let b = 0; b < n; b++) {
      const s0 = Math.random() * Math.PI * 2;
      const s1 = f.radiusMin + Math.random() * (f.radiusMax - f.radiusMin);
      const s2 = f.altMin + Math.random() * (f.altMax - f.altMin);
      const s3 = Math.random();
      for (let v = 0; v < vpb; v++) {
        const i = b * vpb + v;
        local[i * 3] = tmpl[v][0];
        local[i * 3 + 1] = tmpl[v][1];
        local[i * 3 + 2] = tmpl[v][2];
        wing[i] = tmpl[v][3];
        seed[i * 4] = s0; seed[i * 4 + 1] = s1; seed[i * 4 + 2] = s2; seed[i * 4 + 3] = s3;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(local.slice(), 3));
    geo.setAttribute('aLocal', new THREE.BufferAttribute(local, 3));
    geo.setAttribute('aWing', new THREE.BufferAttribute(wing, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.birdMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uScale: { value: 1 },
        uSpeed: { value: f.speed },
        // Wingbeat Hz, slowed for distance: a true 9 Hz beat strobes at 60 FPS.
        uFlapHz: { value: f.flapHz * 0.45 },
        uGlide: { value: f.glide },
        uColor: { value: new THREE.Color(f.color) },
      },
      vertexShader: BIRD_VERT,
      fragmentShader: BIRD_FRAG,
      side: THREE.DoubleSide,
    });
    this.birds = new THREE.Mesh(geo, this.birdMat);
    this.birds.frustumCulled = false;
    this.birds.renderOrder = 2;
    this.scene.add(this.birds);
  }

  private buildLeaves(l: LeafConfig): void {
    const n = l.count;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    const corner = new Float32Array(n * 6 * 2);
    const seed = new Float32Array(n * 6 * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const sx = Math.cos(a) * r, sz = Math.sin(a) * r;
      const ph = Math.random();
      const pick = Math.random();
      for (let v = 0; v < 6; v++) {
        const k = i * 6 + v;
        corner[k * 2] = corners[v][0];
        corner[k * 2 + 1] = corners[v][1];
        seed[k * 4] = sx; seed[k * 4 + 1] = sz; seed[k * 4 + 2] = ph; seed[k * 4 + 3] = pick;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6 * 3), 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.leafMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRadius: { value: 16 },
        uHeight: { value: 11 },
        uFall: { value: 0.75 },
        uWind: { value: new THREE.Vector2(0.4, 0.15) },
        uSize: { value: l.size },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
        uC0: { value: new THREE.Color(l.colors[0]) },
        uC1: { value: new THREE.Color(l.colors[1]) },
        uC2: { value: new THREE.Color(l.colors[2]) },
        uLight: { value: 1 },
        uOpacity: { value: 1 },
      },
      vertexShader: LEAF_VERT,
      fragmentShader: LEAF_FRAG,
      side: THREE.DoubleSide,
    });
    this.leaves = new THREE.Mesh(geo, this.leafMat);
    this.leaves.frustumCulled = false;
    this.leaves.renderOrder = 3;
    this.scene.add(this.leaves);
  }

  /**
   * `elapsed` absolute seconds; `daylight` 0 (night) → 1 (day); `light` the
   * scene's key-light level (tints the leaves); `wind` the live gust.
   */
  update(
    elapsed: number, delta: number, cameraPos: THREE.Vector3,
    daylight: number, sunDir: THREE.Vector3, light: number, wind: number,
  ): void {
    // Birds roost at night; ease so dusk doesn't snap them out.
    this.daylight += (THREE.MathUtils.clamp(daylight, 0, 1) - this.daylight) * Math.min(1, delta * 0.5);
    if (this.birds && this.birdMat) {
      // The flock's centre drifts after the player lazily (and a little ahead
      // of them), so the birds stay overhead without being glued to the view.
      if (!this.centerReady) { this.center.copy(cameraPos); this.centerReady = true; }
      const k = Math.min(1, delta * 0.08);
      this.center.x += (cameraPos.x + 12 - this.center.x) * k;
      this.center.z += (cameraPos.z - 8 - this.center.z) * k;
      const u = this.birdMat.uniforms;
      u.uTime.value = elapsed;
      (u.uCenter.value as THREE.Vector3).set(this.center.x, 0, this.center.z);
      u.uScale.value = THREE.MathUtils.smoothstep(this.daylight, 0.2, 0.7);
      this.birds.visible = u.uScale.value > 0.01;
    }
    if (this.leaves && this.leafMat) {
      const u = this.leafMat.uniforms;
      u.uTime.value = elapsed;
      this.leaves.position.set(cameraPos.x, 0, cameraPos.z);
      (u.uWind.value as THREE.Vector2).set(0.35 + wind * 0.9, 0.12 + wind * 0.3);
      (u.uSunDir.value as THREE.Vector3).copy(sunDir).normalize();
      u.uLight.value = THREE.MathUtils.clamp(light, 0.15, 1.3);
    }
  }

  dispose(): void {
    if (this.birds) { this.scene.remove(this.birds); this.birds.geometry.dispose(); this.birds = null; }
    if (this.leaves) { this.scene.remove(this.leaves); this.leaves.geometry.dispose(); this.leaves = null; }
    this.birdMat?.dispose();
    this.leafMat?.dispose();
    this.birdMat = null;
    this.leafMat = null;
  }
}
