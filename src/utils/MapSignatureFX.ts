import * as THREE from 'three';
import type { MapType } from './MapSystem';

/**
 * MAP SIGNATURE FX — one unmistakable visual per map, on top of the shared
 * weather / ambience layers.
 *
 *   deep_forest        shooting stars over the canopy on clear nights
 *   scorched_wasteland lava light smouldering along the horizon + heat haze
 *                      (and volcanic lightning in its ashfall — WeatherSystem)
 *   frozen_tundra      emerald→violet aurora curtains + meteors
 *   desert_canyon      wandering DUST DEVILS + shimmering heat haze + meteors
 *   toxic_swamp        a permanent low bog mist breathing across the water
 *   military_outpost   searchlight beams sweeping the night sky + base glow
 *   autumn_grove       (Twilight Vale) rose-violet aurora over the dusk
 *   ancient_ruins      meteors over the stones; dawn mist from the weather
 *
 * Sky features are uniforms on the existing sky dome (no extra fullscreen
 * pass); heat haze is a composite-pass term; the beams and dust devils are
 * one draw call each, animated in their vertex shaders, built before the
 * warmup compile and left in the scene (idle = zero instances / zero range).
 */

interface Signature {
  aurora: number;               // night strength (0 = none)
  auroraA: number;
  auroraB: number;
  auroraDusk: number;           // strength even at dusk/day (the vale)
  meteors: boolean;
  horizonDay: [number, number, number];
  horizonNight: [number, number, number];
  shimmer: number;              // midday heat-haze strength
  mistBase: number;             // permanent ground-mist floor (0..1)
  searchlights: boolean;
  dustDevils: boolean;
}

const NONE: [number, number, number] = [0, 0, 0];

const SIGNATURES: Record<MapType, Signature> = {
  deep_forest:        { aurora: 0, auroraA: 0, auroraB: 0, auroraDusk: 0, meteors: true, horizonDay: NONE, horizonNight: NONE, shimmer: 0, mistBase: 0, searchlights: false, dustDevils: false },
  scorched_wasteland: { aurora: 0, auroraA: 0, auroraB: 0, auroraDusk: 0, meteors: false, horizonDay: [0.09, 0.03, 0.008], horizonNight: [0.34, 0.1, 0.025], shimmer: 0.85, mistBase: 0, searchlights: false, dustDevils: false },
  frozen_tundra:      { aurora: 1.15, auroraA: 0x22ff9c, auroraB: 0x8458ff, auroraDusk: 0, meteors: true, horizonDay: NONE, horizonNight: NONE, shimmer: 0, mistBase: 0, searchlights: false, dustDevils: false },
  desert_canyon:      { aurora: 0, auroraA: 0, auroraB: 0, auroraDusk: 0, meteors: true, horizonDay: NONE, horizonNight: NONE, shimmer: 1, mistBase: 0, searchlights: false, dustDevils: true },
  toxic_swamp:        { aurora: 0, auroraA: 0, auroraB: 0, auroraDusk: 0, meteors: false, horizonDay: NONE, horizonNight: [0.012, 0.04, 0.012], shimmer: 0, mistBase: 0.45, searchlights: false, dustDevils: false },
  military_outpost:   { aurora: 0, auroraA: 0, auroraB: 0, auroraDusk: 0, meteors: false, horizonDay: NONE, horizonNight: [0.05, 0.042, 0.032], shimmer: 0, mistBase: 0, searchlights: true, dustDevils: false },
  autumn_grove:       { aurora: 0.85, auroraA: 0xff4fc8, auroraB: 0x5a3cff, auroraDusk: 0.28, meteors: true, horizonDay: NONE, horizonNight: NONE, shimmer: 0, mistBase: 0.2, searchlights: false, dustDevils: false },
  ancient_ruins:      { aurora: 0, auroraA: 0, auroraB: 0, auroraDusk: 0, meteors: true, horizonDay: NONE, horizonNight: NONE, shimmer: 0, mistBase: 0, searchlights: false, dustDevils: false },
};

// ── Searchlight beams ────────────────────────────────────────────────────
const BEAM_VERT = /* glsl */ `
  varying float vAlong;
  varying float vEdge;
  void main() {
    vAlong = uv.y;
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vEdge = abs(dot(n, normalize(-mv.xyz)));   // 1 facing us (beam core), 0 at the rim
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vAlong;
  varying float vEdge;
  void main() {
    float core = pow(vEdge, 2.2);
    float along = (1.0 - vAlong) * (1.0 - vAlong) * smoothstep(0.0, 0.03, vAlong);
    float a = core * along * uIntensity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

// ── Dust devils ──────────────────────────────────────────────────────────
const DEVIL_VERT = /* glsl */ `
  attribute vec4 aSeed;          // x: height 0..1, y: angle, z: size, w: devil index (0/1)
  uniform vec4 uDevils[2];       // xyz = base position, w = strength 0..1
  uniform float uTime;
  varying vec2 vUv;
  varying float vA;
  void main() {
    vec4 d = aSeed.w < 0.5 ? uDevils[0] : uDevils[1];
    if (d.w < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float h = fract(aSeed.x + uTime * 0.09);                // grains climb the funnel
    float height = 24.0 * h;
    float r = (0.5 + h * h * 6.5) * (0.8 + 0.4 * fract(aSeed.z * 5.1));
    float ang = aSeed.y * 6.2831 + uTime * (3.2 - h * 1.8);
    vec3 c = d.xyz + vec3(sin(height * 0.21 + uTime) * h * 2.0, height, cos(height * 0.17 + uTime * 0.8) * h * 2.0);
    vec3 p = c + vec3(cos(ang) * r, 0.0, sin(ang) * r);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float size = (1.2 + 3.2 * h) * (0.6 + aSeed.z);
    mv.xy += position.xy * size;
    vUv = position.xy;
    vA = d.w * (1.0 - smoothstep(0.55, 1.0, h)) * smoothstep(0.0, 0.08, h);
    gl_Position = projectionMatrix * mv;
  }
`;
const DEVIL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vA;
  void main() {
    float r = length(vUv);
    float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA * 0.16;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export class MapSignatureFX {
  private readonly scene: THREE.Scene;
  private readonly sig: Signature;
  private beams: THREE.Group | null = null;
  private beamMat: THREE.ShaderMaterial | null = null;
  private beamGeo: THREE.CylinderGeometry | null = null;
  private readonly beamPivots: THREE.Object3D[] = [];
  private devilsMesh: THREE.Mesh | null = null;
  private devilsMat: THREE.ShaderMaterial | null = null;
  private devilsGeo: THREE.InstancedBufferGeometry | null = null;
  private readonly devilState = [
    { x: 0, z: 0, vx: 0, vz: 0, life: 0, str: 0 },
    { x: 0, z: 0, vx: 0, vz: 0, life: 0, str: 0 },
  ];
  private time = 0;
  private readonly _hz = new THREE.Vector3();
  private readonly beamDist: number;

  constructor(scene: THREE.Scene, map: MapType, quality: number, viewDist: number) {
    this.scene = scene;
    this.sig = SIGNATURES[map];
    // Lamps stand inside the far plane with beams short enough that the
    // camera's far clip never slices a bright section.
    this.beamDist = viewDist * 0.55;
    if (this.sig.searchlights) this.buildBeams(viewDist * 0.85);
    if (this.sig.dustDevils) this.buildDevils(quality);
  }

  private buildBeams(length: number): void {
    // Open, long cone: narrow at the lamp, widening into the sky.
    // uv.y runs 0 at the lamp (bottom) → 1 at the far end.
    this.beamGeo = new THREE.CylinderGeometry(length * 0.035, 0.6, length, 24, 1, true);
    this.beamGeo.translate(0, length / 2, 0);
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xdfe8ff) }, uIntensity: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.beams = new THREE.Group();
    this.beams.userData.kind = 'mapfx';
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Object3D();
      const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
      beam.frustumCulled = false;
      beam.renderOrder = 6;
      pivot.add(beam);
      this.beams.add(pivot);
      this.beamPivots.push(pivot);
    }
    this.scene.add(this.beams);
  }

  private buildDevils(quality: number): void {
    const per = Math.round(220 * THREE.MathUtils.clamp(quality, 0.3, 1));
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(per * 2 * 4);
    for (let i = 0; i < per * 2; i++) {
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.random();
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = i < per ? 0 : 1;
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = per * 2;
    this.devilsGeo = g;
    this.devilsMat = new THREE.ShaderMaterial({
      uniforms: {
        uDevils: { value: [new THREE.Vector4(), new THREE.Vector4()] },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xc9a46e) },
      },
      vertexShader: DEVIL_VERT,
      fragmentShader: DEVIL_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.devilsMesh = new THREE.Mesh(g, this.devilsMat);
    this.devilsMesh.frustumCulled = false;
    this.devilsMesh.renderOrder = 5;
    this.devilsMesh.userData.kind = 'mapfx';
    this.scene.add(this.devilsMesh);
  }

  /** Permanent ground-mist floor for this map (0..1). */
  get mistBase(): number {
    return this.sig.mistBase;
  }

  /**
   * Per frame. `night` 0 day … 1 full night; `storm` 0..1 (cloud cover /
   * precipitation hides the sky features and calms the haze); `light` the
   * scene's sun light 0..1 (for dust tint).
   */
  update(
    dt: number, cam: THREE.Vector3, night: number, storm: number,
    sky: THREE.ShaderMaterial, light: THREE.Color,
    setShimmer: ((s: number) => void) | null,
  ): void {
    this.time += dt;
    const sig = this.sig;
    const u = sky.uniforms;
    const clearSky = 1 - THREE.MathUtils.clamp(storm, 0, 1);
    if (u.uAurora) {
      const a = (sig.aurora * night + sig.auroraDusk * (1 - night)) * clearSky;
      u.uAurora.value = a;
      if (a > 0) {
        (u.uAuroraA.value as THREE.Color).setHex(sig.auroraA);
        (u.uAuroraB.value as THREE.Color).setHex(sig.auroraB);
      }
      u.uMeteors.value = sig.meteors && night > 0.6 ? 1 : 0;
      this._hz.set(
        sig.horizonDay[0] + (sig.horizonNight[0] - sig.horizonDay[0]) * night,
        sig.horizonDay[1] + (sig.horizonNight[1] - sig.horizonDay[1]) * night,
        sig.horizonDay[2] + (sig.horizonNight[2] - sig.horizonDay[2]) * night,
      );
      (u.uHorizonGlow.value as THREE.Vector3).copy(this._hz);
    }
    // Heat haze: strongest in the midday sun, gone at night / under storms.
    if (setShimmer) setShimmer(sig.shimmer * (1 - night) * clearSky);

    if (this.beams && this.beamMat) {
      const on = THREE.MathUtils.smoothstep(night, 0.35, 0.8);
      // Always "visible" (an idle beam discards every fragment) so its program
      // links in the warmup pass even when a run starts by day.
      this.beamMat.uniforms.uIntensity.value = on * 0.16 * (0.75 + 0.25 * clearSky);
      if (on > 0.01) {
        // Lamps stand far out round the player (a distant base), sweeping.
        for (let i = 0; i < this.beamPivots.length; i++) {
          const p = this.beamPivots[i];
          const az = 0.6 + i * 2.2;
          p.position.set(cam.x + Math.cos(az) * this.beamDist, 0, cam.z + Math.sin(az) * this.beamDist);
          const sweep = this.time * (0.11 + i * 0.03) + i * 1.7;
          p.rotation.set(0.42 + Math.sin(sweep * 0.7) * 0.22, sweep, 0, 'YXZ');
        }
      }
    }

    if (this.devilsMat) {
      const dev = this.devilsMat.uniforms.uDevils.value as THREE.Vector4[];
      const allow = (1 - night) * clearSky;
      for (let i = 0; i < 2; i++) {
        const d = this.devilState[i];
        d.life -= dt;
        const dx = d.x - cam.x, dz = d.z - cam.z;
        if (d.life <= 0 || dx * dx + dz * dz > 150 * 150) {
          // Spawn a new one out in the open, drifting across the view.
          const a = Math.random() * Math.PI * 2;
          const r = 45 + Math.random() * 70;
          d.x = cam.x + Math.cos(a) * r;
          d.z = cam.z + Math.sin(a) * r;
          const da = a + Math.PI * (0.6 + Math.random() * 0.8);
          const sp = 2.5 + Math.random() * 3;
          d.vx = Math.cos(da) * sp;
          d.vz = Math.sin(da) * sp;
          d.life = 22 + Math.random() * 30;
          d.str = 0;
        }
        d.x += d.vx * dt;
        d.z += d.vz * dt;
        // Spin up, live, wind down.
        const target = d.life > 4 ? allow : 0;
        d.str += (target - d.str) * Math.min(1, dt * 0.5);
        dev[i].set(d.x, 0, d.z, d.str);
      }
      this.devilsMat.uniforms.uTime.value = this.time;
      // Sunlit dust: sand colour at the sky's brightness (never smoke-dark).
      const lum = light.r * 0.2126 + light.g * 0.7152 + light.b * 0.0722;
      (this.devilsMat.uniforms.uColor.value as THREE.Color).setHex(0xd9b885).multiplyScalar(Math.max(0.15, lum * 0.8));
    }
  }

  dispose(): void {
    if (this.beams) this.scene.remove(this.beams);
    this.beamGeo?.dispose();
    this.beamMat?.dispose();
    if (this.devilsMesh) this.scene.remove(this.devilsMesh);
    this.devilsGeo?.dispose();
    this.devilsMat?.dispose();
    this.beams = null;
    this.devilsMesh = null;
  }
}
