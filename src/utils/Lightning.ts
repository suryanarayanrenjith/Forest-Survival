import * as THREE from 'three';

/**
 * LIGHTNING BOLT — one pooled, additive ribbon re-shaped per strike.
 *
 * A strike is a jagged main channel from the cloud base to the ground (midpoint
 * displacement, so it forks and kinks like the real thing) with a few side
 * branches that die out in mid-air. The ribbon is built facing the camera at
 * the moment of the strike (it only lives ~0.6 s) and flickers through the
 * classic return-stroke pulses. It is HDR-bright so bloom halos it, depth-
 * tested so the treeline occludes it, and never adds a light: the scene's
 * flash is the sky/ambient brightening the weather mods fold in (adding or
 * removing lights at runtime recompiles every material — see AdvancedLighting).
 */

const MAX_POINTS = 220;

const VERT = /* glsl */ `
  attribute float aEdge;     // -1..1 across the ribbon
  attribute float aWeight;   // 1 main channel … ~0.3 thin branch tips
  varying float vEdge;
  varying float vWeight;
  void main() {
    vEdge = aEdge;
    vWeight = aWeight;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uIntensity;
  uniform vec3 uCore;
  uniform vec3 uGlow;
  varying float vEdge;
  varying float vWeight;
  void main() {
    float e = abs(vEdge);
    float core = exp(-e * e * 26.0);
    float glow = exp(-e * e * 3.2) * 0.35;
    vec3 c = uCore * core * 3.2 + uGlow * glow;
    float a = (core + glow) * uIntensity * vWeight;
    if (a < 0.003) discard;
    gl_FragColor = vec4(c * a, 1.0);
  }
`;

export class LightningBolt {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly edge: Float32Array;
  private readonly weight: Float32Array;
  private age = 99;
  private pulses: number[] = [];

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(MAX_POINTS * 2 * 3);
    this.edge = new Float32Array(MAX_POINTS * 2);
    this.weight = new Float32Array(MAX_POINTS * 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aEdge', new THREE.BufferAttribute(this.edge, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aWeight', new THREE.BufferAttribute(this.weight, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(new Uint16Array(MAX_POINTS * 6), 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0 },
        uCore: { value: new THREE.Color(0xf4f2ff) },
        uGlow: { value: new THREE.Color(0x8f86ff) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.userData.kind = 'weather';
    scene.add(this.mesh);
  }

  /** Tint the channel (volcanic lightning runs warmer). */
  setColors(core: number, glow: number): void {
    (this.mat.uniforms.uCore.value as THREE.Color).setHex(core);
    (this.mat.uniforms.uGlow.value as THREE.Color).setHex(glow);
  }

  /** Shape and fire a strike from `top` to `ground`, facing `eye`. */
  strike(top: THREE.Vector3, ground: THREE.Vector3, eye: THREE.Vector3, width: number): void {
    const chains: Array<{ pts: THREE.Vector3[]; w: number }> = [];
    const main = this.channel(top, ground, 7, 0.18);
    chains.push({ pts: main, w: 1 });
    const branches = 2 + Math.floor(Math.random() * 3);
    for (let b = 0; b < branches; b++) {
      const at = Math.floor(main.length * (0.15 + Math.random() * 0.5));
      const from = main[at];
      const down = ground.clone().sub(top).normalize();
      const sideways = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      const len = top.distanceTo(ground) * (0.12 + Math.random() * 0.22);
      const to = from.clone().addScaledVector(down, len * 0.7).addScaledVector(sideways, len * 0.7);
      chains.push({ pts: this.channel(from, to, 4, 0.22), w: 0.55 });
    }
    // Ribbonise every chain facing the eye.
    let v = 0, idx = 0;
    const index = this.geo.getIndex()!.array as Uint16Array;
    const side = new THREE.Vector3(), seg = new THREE.Vector3(), toEye = new THREE.Vector3();
    for (const ch of chains) {
      const n = ch.pts.length;
      if (v + n * 2 > MAX_POINTS * 2) break;
      const base = v;
      for (let i = 0; i < n; i++) {
        const p = ch.pts[i];
        const q = ch.pts[Math.min(n - 1, i + 1)], o = ch.pts[Math.max(0, i - 1)];
        seg.subVectors(q, o);
        toEye.subVectors(eye, p);
        side.crossVectors(seg, toEye).normalize();
        const t = i / (n - 1);
        const w = width * ch.w * (ch.w < 1 ? 1 - t * 0.85 : 1 - t * 0.25);
        for (let s = 0; s < 2; s++) {
          const sg = s === 0 ? -1 : 1;
          this.pos[v * 3] = p.x + side.x * w * sg;
          this.pos[v * 3 + 1] = p.y + side.y * w * sg;
          this.pos[v * 3 + 2] = p.z + side.z * w * sg;
          this.edge[v] = sg;
          this.weight[v] = ch.w < 1 ? ch.w * (1 - t * 0.7) : 1;
          v++;
        }
        if (i < n - 1) {
          const a = base + i * 2;
          index[idx++] = a; index[idx++] = a + 1; index[idx++] = a + 2;
          index[idx++] = a + 1; index[idx++] = a + 3; index[idx++] = a + 2;
        }
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    (this.geo.attributes.aEdge as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aWeight as THREE.BufferAttribute).needsUpdate = true;
    this.geo.getIndex()!.needsUpdate = true;
    this.geo.setDrawRange(0, idx);
    // Return strokes: a main flash and one or two re-strikes down the channel.
    this.pulses = [0, 0.06 + Math.random() * 0.05];
    if (Math.random() < 0.6) this.pulses.push(0.17 + Math.random() * 0.12);
    this.age = 0;
  }

  /** Midpoint-displaced channel, `depth` subdivisions. */
  private channel(a: THREE.Vector3, b: THREE.Vector3, depth: number, rough: number): THREE.Vector3[] {
    let pts = [a.clone(), b.clone()];
    let amp = a.distanceTo(b) * rough;
    for (let d = 0; d < depth; d++) {
      const next: THREE.Vector3[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        next.push(p);
        const m = p.clone().add(q).multiplyScalar(0.5);
        m.x += (Math.random() - 0.5) * amp;
        m.y += (Math.random() - 0.5) * amp * 0.35;
        m.z += (Math.random() - 0.5) * amp;
        next.push(m);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
      amp *= 0.52;
    }
    return pts;
  }

  /** Advance the flicker; returns the live brightness (0..1+). */
  update(dt: number): number {
    // Idle: an empty draw range (the mesh stays "visible" so the warmup
    // compile links its program; a zero range draws nothing).
    if (this.age > 1) {
      if (this.mat.uniforms.uIntensity.value !== 0) {
        this.mat.uniforms.uIntensity.value = 0;
        this.geo.setDrawRange(0, 0);
      }
      return 0;
    }
    this.age += dt;
    let I = 0;
    for (const p of this.pulses) {
      const t = this.age - p;
      if (t >= 0) I += Math.exp(-t / 0.045);
    }
    // A faint glowing channel lingers after the strokes.
    I += Math.max(0, 0.25 * (1 - this.age / 0.7));
    this.mat.uniforms.uIntensity.value = I;
    return I;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
