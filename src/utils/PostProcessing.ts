import * as THREE from 'three';
import { gpuProfiler } from './GpuProfiler';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { GraphicsPreset, GraphicsQuality } from './GameSettingsManager';

/**
 * Live atmosphere uniforms pushed to the grading stage every frame.
 * Same shape as the previous pipeline so `App.tsx` did not have to change.
 */
export interface AtmosphereGrading {
  saturation: number;
  contrast: number;
  temperature: number;
  exposure?: number;
  bloomStrength?: number;
  colorTint: THREE.Color | THREE.Vector3 | { r: number; g: number; b: number };
  sunDirection?: THREE.Vector3;
  isNight?: boolean;
  godRayStrength?: number;
  aerialPerspective?: number;
  highlightRecovery?: number;
  highlightDesaturation?: number;
  vibranceScale?: number;
  shadowLiftScale?: number;
}

/** A small coloured light that lights the haze (muzzle flash, explosion). */
export interface VolumetricGlow {
  position: THREE.Vector3;
  color: THREE.Color;
  /** Radiant energy; 0 = off. */
  energy: number;
}

/**
 * Inputs for the raymarched volumetric light pass, written by App.tsx every
 * frame (allocation-free: mutate the object returned by `volumetricInputs`).
 */
export interface VolumetricInputs {
  enabled: boolean;
  /** Direction TOWARD the key light (sun or moon), normalised. */
  sunDir: THREE.Vector3;
  /** Key-light in-scattering radiance (linear HDR, already intensity-scaled). */
  sunRadiance: THREE.Color;
  /** Isotropic sky / fog in-scattering radiance. */
  ambient: THREE.Color;
  /** Base extinction of the air (1/m). */
  density: number;
  /** Extra extinction concentrated near the ground (1/m). */
  heightDensity: number;
  /** Height falloff of the ground layer (1/m). */
  heightFalloff: number;
  /** Ground-fog base height (m). */
  baseHeight: number;
  /** Henyey-Greenstein anisotropy for the key light. */
  anisotropy: number;
  /** 0..1 heterogeneity of the medium. */
  noiseStrength: number;
  /** Drifting noise offset (wind), metres in noise space. */
  wind: THREE.Vector2;
  /** Raymarch range (m); scene fog carries on beyond it. */
  maxDistance: number;
  /** Up to 4 local lights that scatter in the haze. */
  glows: VolumetricGlow[];
}

interface PipelineTier {
  ssao: boolean;
  ssaoRadius: number;
  ssaoIntensity: number;
  /** 0 off, 1 quarter resolution, 2 half resolution. */
  volumetrics: 0 | 1 | 2;
  volSteps: number;
  localHaze: boolean;
  bloomLevels: number;
  godRays: boolean;
  godDiv: number;
  smaa: boolean;
  cas: number;
  anamorphic: number;
  halation: number;
  splitTone: number;
  clarity: number;
  lensDirt: number;
  grain: number;
  scanline: number;
}

const TIERS: Record<'medium' | 'high' | 'ultra', PipelineTier> = {
  medium: {
    ssao: false, ssaoRadius: 1.4, ssaoIntensity: 1.2,
    volumetrics: 1, volSteps: 12, localHaze: false,
    bloomLevels: 5, godRays: true, godDiv: 4,
    smaa: true, cas: 0.34,
    anamorphic: 0, halation: 0.14, splitTone: 0.42, clarity: 0.2, lensDirt: 0,
    grain: 0.012, scanline: 0,
  },
  high: {
    ssao: true, ssaoRadius: 1.5, ssaoIntensity: 1.35,
    volumetrics: 2, volSteps: 20, localHaze: true,
    bloomLevels: 6, godRays: true, godDiv: 4,
    smaa: true, cas: 0.42,
    anamorphic: 0.35, halation: 0.2, splitTone: 0.5, clarity: 0.26, lensDirt: 0.9,
    grain: 0.016, scanline: 0,
  },
  ultra: {
    ssao: true, ssaoRadius: 1.6, ssaoIntensity: 1.45,
    volumetrics: 2, volSteps: 28, localHaze: true,
    bloomLevels: 6, godRays: true, godDiv: 2,
    smaa: true, cas: 0.5,
    anamorphic: 0.5, halation: 0.26, splitTone: 0.56, clarity: 0.3, lensDirt: 1.2,
    grain: 0.018, scanline: 0,
  },
};

/** Linear multiplier mapping the authored atmosphere exposure onto the
 *  fitted-ACES curve, which expects scene-referred input (0.18 grey lands at
 *  ~0.36 sRGB). The worlds use deliberately dark albedos (moss, bark, robot
 *  plate), so sunlit ground needs this lift to sit in the mid-tones while
 *  shadow keeps its depth. */
const EXPOSURE_SCALE = 1.5;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const LUMA = 'const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);';

// One NaN/Inf or negative pixel from any shader would otherwise smear across
// the whole bloom chain and the volumetric history.
const SANITIZE_GLSL = /* glsl */ `
vec3 sanitize(vec3 c) {
  return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : clamp(c, vec3(0.0), vec3(6e4));
}
vec4 sanitize(vec4 c) {
  return (any(isnan(c)) || any(isinf(c))) ? vec4(0.0, 0.0, 0.0, 1.0) : clamp(c, vec4(0.0), vec4(6e4));
}
`;

const HG_GLSL = /* glsl */ `
float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (12.5663706 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
`;

// World-space view ray + distance for a pixel.
const VIEW_RAY_GLSL = /* glsl */ `
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
vec3 worldRayDir(vec2 uv) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize(mat3(uCamWorld) * normalize(v.xyz / v.w));
}
float pixelDistance(vec2 uv, float depth) {
  if (depth >= 0.99999) return 1e5;
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return length(v.xyz / v.w);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

const SSAO_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform mat4 uProj;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uIntensity;
varying vec2 vUv;
vec3 viewPos(vec2 uv) {
  float d = textureLod(tDepth, uv, 0.0).r;
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  float depth = texture2D(tDepth, vUv).r;
  if (depth >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  // The first-person viewmodel lives inside ~1 m of the eye: a world-scale
  // radius would halo the gun against the scenery behind it.
  if (-P.z < 1.15) { gl_FragColor = vec4(1.0); return; }
  // Normal from the depth neighbours with the smaller step (no silhouette smear).
  vec3 px = viewPos(vUv + vec2(uTexel.x, 0.0)) - P;
  vec3 nx = P - viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 py = viewPos(vUv + vec2(0.0, uTexel.y)) - P;
  vec3 ny = P - viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(px.z) < abs(nx.z) ? px : nx;
  vec3 dy = abs(py.z) < abs(ny.z) ? py : ny;
  vec3 N = normalize(cross(dx, dy));
  float projScale = uProj[1][1] * 0.5 / max(-P.z, 0.1);
  float radiusUv = min(uRadius * projScale, 0.12);
  float ao = 0.0;
  float rot = hash12(gl_FragCoord.xy) * 6.2831853;
  const int SAMPLES = 12;
  for (int i = 0; i < SAMPLES; i++) {
    float fi = float(i);
    float a = rot + fi * 2.39996323;
    float r = (fi + 0.5) / float(SAMPLES);
    vec2 offset = vec2(cos(a), sin(a)) * r * radiusUv;
    vec3 S = viewPos(vUv + offset);
    vec3 v = S - P;
    float vv = dot(v, v);
    float vn = dot(v, N);
    // Sky / far samples have huge vv: the falloff zeroes them, so nothing
    // ever darkens against the sky (the old GTAO halo bug).
    float falloff = max(0.0, 1.0 - vv / (uRadius * uRadius));
    ao += max(0.0, vn - 0.012 * -P.z) / (vv + 0.01) * falloff;
  }
  ao = clamp(1.0 - ao * uIntensity / float(SAMPLES), 0.0, 1.0);
  // Fade out with distance (the fog takes over).
  ao = mix(ao, 1.0, smoothstep(45.0, 110.0, -P.z));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}
`;

const SSAO_BLUR_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
void main() {
  float center = linDepth(texture2D(tDepth, vUv).r);
  float sum = 0.0;
  float wsum = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 o = vec2(float(x), float(y)) * uTexel;
      float d = linDepth(textureLod(tDepth, vUv + o, 0.0).r);
      float w = 1.0 / (1.0 + abs(d - center) / max(center, 0.1) * 40.0);
      sum += textureLod(tInput, vUv + o, 0.0).r * w;
      wsum += w;
    }
  }
  gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
}
`;

const VOLUMETRIC_FRAG = (steps: number) => /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform sampler2D tNoise;
uniform sampler2D tShadow0;
uniform sampler2D tShadow1;
uniform mat4 uShadowMat0;
uniform mat4 uShadowMat1;
uniform float uShadowCount;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec4 uFog;       // x base sigma, y height sigma, z height falloff, w base height
uniform vec4 uFogNoise;  // x strength, y scale, zw wind offset
uniform float uAniso;
uniform float uMaxDist;
uniform float uFrame;
varying vec2 vUv;
${VIEW_RAY_GLSL}
${HG_GLSL}

float sunVisibility(vec3 p) {
  if (uShadowCount < 0.5) return 1.0;
  vec4 s0 = uShadowMat0 * vec4(p, 1.0);
  vec3 c0 = s0.xyz / s0.w;
  if (c0.x > 0.002 && c0.x < 0.998 && c0.y > 0.002 && c0.y < 0.998 && c0.z < 1.0) {
    return step(c0.z - 0.0015, unpackRGBAToDepth(textureLod(tShadow0, c0.xy, 0.0)));
  }
  if (uShadowCount > 1.5) {
    vec4 s1 = uShadowMat1 * vec4(p, 1.0);
    vec3 c1 = s1.xyz / s1.w;
    if (c1.x > 0.0 && c1.x < 1.0 && c1.y > 0.0 && c1.y < 1.0 && c1.z < 1.0) {
      return step(c1.z - 0.0025, unpackRGBAToDepth(textureLod(tShadow1, c1.xy, 0.0)));
    }
  }
  return 1.0;
}

void main() {
  float depth = texture2D(tDepth, vUv).r;
  vec3 dir = worldRayDir(vUv);
  // Sky rays stop short: the dome already IS the far atmosphere.
  float L = depth >= 0.99999 ? uMaxDist * 0.6 : min(pixelDistance(vUv, depth), uMaxDist);
  const int STEPS = ${steps};
  float stepLen = L / float(STEPS);
  float jitter = ign(gl_FragCoord.xy + vec2(uFrame * 5.588238, uFrame * 3.177));
  float cosSun = dot(dir, uLightDir);
  // Phase: forward lobe (shafts toward the sun) + a soft back lobe + an
  // isotropic floor so lit air still reads from every angle.
  vec3 sunIn = uLightColor * (hg(cosSun, uAniso) * 0.7 + hg(cosSun, -0.25) * 0.12 + 0.0795775 * 0.18);
  // Sky / fog light arrives from everywhere: uAmbient is already the
  // in-scattered RADIANCE, so a thick medium converges to the fog colour
  // exactly like the material FogExp2 does (no darkening of the far field).
  vec3 ambIn = uAmbient;
  vec3 scatter = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < STEPS; i++) {
    float t = (float(i) + jitter) * stepLen;
    vec3 p = uCamPos + dir * t;
    float h = p.y - uFog.w;
    float hc = clamp(h, -20.0, 300.0);
    float sigma = uFog.x * exp(-max(hc, 0.0) * 0.012) + uFog.y * exp(-hc * uFog.z);
    vec2 nuv = p.xz * uFogNoise.y + uFogNoise.zw;
    float n = textureLod(tNoise, nuv, 0.0).r * 0.62 + textureLod(tNoise, nuv * 2.63 + vec2(p.y * 0.021, -p.y * 0.017), 0.0).g * 0.38;
    sigma *= max(0.05, 1.0 + (n - 0.5) * 2.2 * uFogNoise.x);
    vec3 S = sunIn * sunVisibility(p) + ambIn;
    // Energy-conserving step integral (Hillaire 2015, albedo 1).
    float tr = exp(-sigma * stepLen);
    scatter += T * S * (1.0 - tr);
    T *= tr;
  }
  gl_FragColor = vec4(scatter, T);
}
`;

const VOLUMETRIC_RESOLVE_FRAG = /* glsl */ `
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform sampler2D tDepth;
uniform mat4 uPrevViewProj;
uniform vec2 uTexel;
uniform float uMaxDist;
uniform float uReset;
varying vec2 vUv;
${VIEW_RAY_GLSL}
void main() {
  vec4 center = texture2D(tCurrent, vUv);
  vec4 mn = center;
  vec4 mx = center;
  vec4 cur = center * 4.0;
  float wsum = 4.0;
  // Only mix texels whose rays end at a similar depth so the haze never
  // bleeds across silhouettes.
  float dc = min(pixelDistance(vUv, texture2D(tDepth, vUv).r), uMaxDist);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) continue;
      vec2 uv2 = vUv + vec2(float(x), float(y)) * uTexel;
      vec4 s = textureLod(tCurrent, uv2, 0.0);
      float di = min(pixelDistance(uv2, textureLod(tDepth, uv2, 0.0).r), uMaxDist);
      float sim = 1.0 / (1.0 + abs(di - dc) / max(dc, 1.0) * 12.0);
      float w = ((x == 0 || y == 0) ? 2.0 : 1.0) * sim;
      cur += s * w;
      wsum += w;
      if (sim > 0.5) {
        mn = min(mn, s);
        mx = max(mx, s);
      }
    }
  }
  cur /= wsum;
  // Reproject the end of this pixel's ray into last frame.
  float depth = texture2D(tDepth, vUv).r;
  vec3 p = uCamPos + worldRayDir(vUv) * min(pixelDistance(vUv, depth), uMaxDist);
  vec4 prevClip = uPrevViewProj * vec4(p, 1.0);
  vec2 prevUv = prevClip.xy / max(prevClip.w, 1e-4) * 0.5 + 0.5;
  float valid = (uReset < 0.5 && prevClip.w > 0.0 && prevUv.x > 0.0 && prevUv.x < 1.0 && prevUv.y > 0.0 && prevUv.y < 1.0) ? 1.0 : 0.0;
  vec4 hist = texture2D(tHistory, prevUv);
  if (any(isnan(hist)) || any(isinf(hist))) valid = 0.0;
  hist = clamp(hist, mn, mx);
  vec4 outV = mix(cur, hist, 0.88 * valid);
  gl_FragColor = (any(isnan(outV)) || any(isinf(outV))) ? vec4(0.0, 0.0, 0.0, 1.0) : outV;
}
`;

const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tVol;
uniform float uUseVol;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
uniform float uExposure;
uniform vec3 uTint;
varying vec2 vUv;
${LUMA}
${SANITIZE_GLSL}
float karis(vec3 c) { return 1.0 / (1.0 + dot(c, LUMA) * 0.25); }
vec3 tap(vec2 uv) {
  vec3 c = sanitize(texture2D(tScene, uv).rgb);
  if (uUseVol > 0.5) {
    vec4 v = sanitize(texture2D(tVol, uv));
    c = c * v.a + v.rgb;
  }
  return c;
}
void main() {
  // 4-tap box with Karis (inverse-luma) weights suppresses single-pixel fireflies.
  vec3 a = tap(vUv + uTexel * vec2(-1.0, -1.0));
  vec3 b = tap(vUv + uTexel * vec2(1.0, -1.0));
  vec3 c = tap(vUv + uTexel * vec2(-1.0, 1.0));
  vec3 d = tap(vUv + uTexel * vec2(1.0, 1.0));
  float wa = karis(a), wb = karis(b), wc = karis(c), wd = karis(d);
  vec3 color = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  // Threshold in EXPOSED units so bloom tracks the grade's exposure.
  vec3 exposed = color * uTint * uExposure;
  float br = max(exposed.r, max(exposed.g, exposed.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(exposed * contrib, vec3(200.0)), 1.0);
}
`;

const DOWNSAMPLE_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  // Jimenez 2014 13-tap downsample.
  vec3 a = texture2D(tInput, vUv + uTexel * vec2(-2.0, 2.0)).rgb;
  vec3 b = texture2D(tInput, vUv + uTexel * vec2(0.0, 2.0)).rgb;
  vec3 c = texture2D(tInput, vUv + uTexel * vec2(2.0, 2.0)).rgb;
  vec3 d = texture2D(tInput, vUv + uTexel * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture2D(tInput, vUv).rgb;
  vec3 f = texture2D(tInput, vUv + uTexel * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tInput, vUv + uTexel * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture2D(tInput, vUv + uTexel * vec2(0.0, -2.0)).rgb;
  vec3 i = texture2D(tInput, vUv + uTexel * vec2(2.0, -2.0)).rgb;
  vec3 j = texture2D(tInput, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  vec3 k = texture2D(tInput, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  vec3 l = texture2D(tInput, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture2D(tInput, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  vec3 color = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(color, 1.0);
}
`;

const UPSAMPLE_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  // 3x3 tent, accumulated additively into the next larger mip.
  vec2 r = uTexel * uRadius;
  vec3 c = texture2D(tInput, vUv + vec2(-r.x, r.y)).rgb;
  c += texture2D(tInput, vUv + vec2(0.0, r.y)).rgb * 2.0;
  c += texture2D(tInput, vUv + vec2(r.x, r.y)).rgb;
  c += texture2D(tInput, vUv + vec2(-r.x, 0.0)).rgb * 2.0;
  c += texture2D(tInput, vUv).rgb * 4.0;
  c += texture2D(tInput, vUv + vec2(r.x, 0.0)).rgb * 2.0;
  c += texture2D(tInput, vUv + vec2(-r.x, -r.y)).rgb;
  c += texture2D(tInput, vUv + vec2(0.0, -r.y)).rgb * 2.0;
  c += texture2D(tInput, vUv + vec2(r.x, -r.y)).rgb;
  gl_FragColor = vec4(c / 16.0, 1.0);
}
`;

const GOD_MASK_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uLightUv;
uniform float uAspect;
varying vec2 vUv;
${SANITIZE_GLSL}
void main() {
  // Only open SKY feeds the shafts: every tree, rock and robot occludes them.
  float sky = step(0.99999, texture2D(tDepth, vUv).r);
  vec3 c = sanitize(texture2D(tScene, vUv).rgb) * sky;
  vec2 d = (vUv - uLightUv) * vec2(uAspect, 1.0);
  float falloff = exp(-dot(d, d) * 4.0);
  gl_FragColor = vec4(min(c, vec3(24.0)) * falloff, 1.0);
}
`;

const GOD_BLUR_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uLightUv;
uniform float uDensity;
uniform float uDecay;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec2 coord = vUv;
  vec2 delta = (vUv - uLightUv) * (uDensity / 28.0);
  float illum = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 28; i++) {
    coord -= delta;
    acc += textureLod(tInput, clamp(coord, 0.0, 1.0), 0.0).rgb * illum * uWeight;
    illum *= uDecay;
  }
  gl_FragColor = vec4(acc, 1.0);
}
`;

// Local lights (muzzle flash, explosions) scatter in the haze along each
// pixel's own ray, integrated in closed form at full resolution so the haze
// stops exactly at the full-resolution depth: a 1/(d^2 + k) falloff along
// p(t) = cam + dir*t integrates to an arctangent.
const LOCAL_HAZE_GLSL = /* glsl */ `
uniform vec4 uGlowPos[4];
uniform vec3 uGlowColor[4];
vec2 falloffIntegral(vec3 s, float k, vec3 dir, float t0, float t1) {
  vec3 v = uCamPos - s;
  float b = dot(dir, v);
  float H = sqrt(max(dot(v, v) - b * b, 0.0) + k);
  float I = (atan((t1 + b) / H) - atan((t0 + b) / H)) / H;
  float q0 = (t0 + b) * (t0 + b) + H * H;
  float q1 = (t1 + b) * (t1 + b) + H * H;
  float mean = (0.5 * log(q1 / q0) - b * I) / max(I, 1e-6);
  return vec2(I, clamp(mean, t0, t1));
}
vec3 localInScatter(vec3 dir, float L, float sigma) {
  vec3 acc = vec3(0.0);
  for (int g = 0; g < 4; g++) {
    if (uGlowPos[g].w > 0.0) {
      vec2 w = falloffIntegral(uGlowPos[g].xyz, 0.35, dir, 0.0, L);
      acc += uGlowColor[g] * uGlowPos[g].w * 0.0795775 * w.x * exp(-sigma * w.y);
    }
  }
  return acc * max(sigma, 0.004);
}
`;

// ── LOW-RES EFFECT BUFFERS FOR THE COMPOSITE ─────────────────────────────────
// Halation (8 taps) and the clarity luma blur (6 taps) are smooth, wide
// kernels: evaluating them per FULL-res pixel cost 14 scene fetches each and
// was most of the composite's 5.3 ms on an integrated GPU. Same kernels, same
// full-res tap offsets, evaluated at HALF res and upsampled bilinearly.
const FX_PRE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel;        // FULL-res texel (the kernels' radii are in full-res texels)
uniform float uClarityOn;
uniform float uHalationOn;
varying vec2 vUv;
${LUMA}
${SANITIZE_GLSL}
void main() {
  float bLum = 0.0;
  if (uClarityOn > 0.5) {
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0471975512;
      vec2 off = vec2(cos(a), sin(a)) * uTexel * 6.0;
      bLum += dot(clamp(textureLod(tScene, vUv + off, 0.0).rgb, vec3(0.0), vec3(8.0)), LUMA);
    }
    bLum *= (1.0 / 6.0);
  }
  vec3 halo = vec3(0.0);
  if (uHalationOn > 0.5) {
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853981634;
      vec2 off = vec2(cos(a), sin(a)) * uTexel * 4.5;
      halo += max(sanitize(textureLod(tScene, vUv + off, 0.0).rgb) - 1.1, 0.0);
    }
    halo *= 0.125;
  }
  gl_FragColor = vec4(halo, bLum);
}
`;

// The anamorphic streak's 15-tap horizontal smear of the 1/8-res bloom mip,
// run ONCE at that resolution instead of per full-res pixel.
const STREAK_BLUR_FRAG = /* glsl */ `
uniform sampler2D tStreak;
uniform float uStreakTexel;
varying vec2 vUv;
void main() {
  vec3 streak = vec3(0.0);
  for (int i = -7; i <= 7; i++) {
    float fi = float(i);
    streak += textureLod(tStreak, vUv + vec2(fi * uStreakTexel, 0.0), 0.0).rgb * exp(-abs(fi) * 0.28);
  }
  gl_FragColor = vec4(streak, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform sampler2D tStreak;
uniform sampler2D tGod;
uniform sampler2D tAO;
uniform sampler2D tVol;
uniform sampler2D tFxPre;
uniform sampler2D tStreakBlur;
uniform float uUseAO;
uniform float uAOStrength;
uniform float uUseVol;
uniform float uUseGlows;
uniform vec2 uVolRes;
uniform float uVolMaxDist;
uniform vec2 uProjScale;
uniform float uCamNear;
uniform float uCamFar;
uniform vec2 uTexel;
uniform float uTime;
uniform float uExposure;
uniform vec3 uTint;
uniform float uSaturation;
uniform float uContrast;
uniform float uTemperature;
uniform float uHighlightRecovery;
uniform float uHighlightDesaturation;
uniform float uBloomStrength;
uniform float uLensDirt;
uniform float uStreakStrength;
uniform float uStreakTexel;
uniform float uGodStrength;
uniform vec3 uGodColor;
uniform vec2 uSunUV;
uniform float uSunHalo;
uniform vec3 uSunColor;
uniform float uAerial;
uniform float uAspect;
uniform float uChromatic;
uniform float uHalation;
uniform float uClarity;
uniform float uShadowLift;
uniform float uShadowDepth;
uniform float uVibrance;
uniform float uSplitTone;
uniform float uGrain;
uniform float uScanline;
uniform float uVignetteOffset;
uniform float uVignetteDarkness;
uniform float uGlitch;
uniform float uInterference;
uniform float uHeatShimmer;
varying vec2 vUv;
${LUMA}
${SANITIZE_GLSL}
${VIEW_RAY_GLSL}
${LOCAL_HAZE_GLSL}

// ACES fitted (Stephen Hill): sRGB -> AP1 -> RRT+ODT fit -> sRGB. Holds hue
// and saturation through the shoulder far better than the 5-term curve, so
// saturated emissives roll off to rich colour instead of neon-clipping.
const mat3 ACES_IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
const mat3 ACES_OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
vec3 rrtOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFitted(vec3 c) {
  c = ACES_IN * c;
  c = rrtOdt(c);
  c = ACES_OUT * c;
  return clamp(c, 0.0, 1.0);
}
// Hue-preserving display map (cf. Frostbite, "HDR color grading and display",
// GDC 2017). The fitted ACES input matrix bleeds a very bright saturated
// channel into the other two, so sunlit red armour or a hot orange flame skews
// to salmon / yellow-white. Blend in a variant that runs the same curve on the
// PEAK channel and keeps the channel ratios — saturated highlights stay their
// hue, and the 65% per-channel share keeps the filmic roll-off to white.
vec3 tonemapDisplay(vec3 c) {
  vec3 perChannel = acesFitted(c);
  float peak = max(max(c.r, c.g), c.b);
  vec3 preserved = c * (acesFitted(vec3(peak)).g / max(peak, 1e-5));
  // Saturation-aware: a strongly saturated colour (red armour plate in noon
  // sun measured (255,164,122) — peach) keeps its hue, while near-neutral
  // highlights (sun disc, white sky, snow) still roll off to white as film does.
  float chroma = (peak - min(min(c.r, c.g), c.b)) / max(peak, 1e-5);
  float w = 0.3 + 0.5 * smoothstep(0.45, 0.95, chroma);
  return mix(perChannel, clamp(preserved, 0.0, 1.0), w);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c));
}
float filmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float linearDepth(float d) {
  return -perspectiveDepthToViewZ(d, uCamNear, uCamFar);
}
// Ray length the volumetric march used for a pixel (mirrors pixelDistance and
// the march's distance cap).
float volRayLength(vec2 uv, float depth) {
  if (depth >= 0.99999) return uVolMaxDist * 0.6;
  vec2 ndc = uv * 2.0 - 1.0;
  return min(linearDepth(depth) * length(vec3(ndc / uProjScale, 1.0)), uVolMaxDist);
}
// Upsample the low-resolution volumetric buffer by reconstructing the MEDIUM
// rather than blending results: neighbouring texels give the local extinction
// and mean in-scattered light, and this pixel's own ray length turns them into
// its fog — so the haze follows full-resolution depth at every silhouette and
// through foliage finer than a texel. Local-light haze is then integrated
// along this pixel's own ray.
vec4 sampleVolumetric(vec2 uv, float depth) {
  float z = linearDepth(depth);
  float L = volRayLength(uv, depth);
  vec2 p = uv * uVolRes - 0.5;
  vec2 f = fract(p);
  vec2 base = (floor(p) + 0.5) / uVolRes;
  vec3 inScatter = vec3(0.0);
  float opacity = 0.0;
  float tau = 0.0;
  float len = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 tuv = base + vec2(float(i), float(j)) / uVolRes;
      float di = textureLod(tDepth, tuv, 0.0).r;
      float zi = linearDepth(di);
      float bw = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      float w = bw * (1.0 / (1.0 + abs(zi - z) / max(z, 0.5) * 25.0) + 0.02);
      vec4 v = sanitize(textureLod(tVol, tuv, 0.0));
      float Ti = clamp(v.a, 1e-4, 1.0);
      inScatter += v.rgb * w;
      opacity += (1.0 - Ti) * w;
      tau -= log(Ti) * w;
      len += volRayLength(tuv, di) * w;
    }
  }
  float sigma = tau / max(len, 1e-4);
  float T = exp(-sigma * L);
  vec3 local = vec3(0.0);
  if (uUseGlows > 0.5) local = sanitize(localInScatter(worldRayDir(uv), L, sigma));
  return vec4(inScatter / max(opacity, 1e-4) * (1.0 - T) + local, T);
}
// Screen-locked procedural lens dirt (soft smudges + fine dust).
float dirtMask(vec2 uv) {
  float dirt = 0.0;
  dirt += smoothstep(0.34, 0.0, length((uv - vec2(0.27, 0.62)) * vec2(uAspect, 1.0))) * 0.85;
  dirt += smoothstep(0.40, 0.0, length((uv - vec2(0.74, 0.34)) * vec2(uAspect, 1.0))) * 0.70;
  dirt += smoothstep(0.30, 0.0, length((uv - vec2(0.55, 0.80)) * vec2(uAspect, 1.0))) * 0.60;
  dirt += smoothstep(0.26, 0.0, length((uv - vec2(0.12, 0.20)) * vec2(uAspect, 1.0))) * 0.50;
  dirt += filmHash(floor(uv * 240.0)) * 0.22;
  return dirt;
}

void main() {
  // ─── NULL-WAVE SIGNAL CORRUPTION (uv-space tearing) ────────────────────
  // ARK-07 glitch waves: band tears + block jitter on a stepped clock so the
  // artifacts "stick" for a few frames like real corrupted video.
  vec2 guv = vUv;
  if (uGlitch > 0.001) {
    float gClock = floor(uTime * 16.0);
    float band = floor(vUv.y * 24.0);
    float bandR = filmHash(vec2(band, gClock));
    float tear = step(0.78, bandR) * (bandR - 0.78) * 4.0 * (filmHash(vec2(gClock, band)) - 0.5);
    guv.x += tear * 0.09 * uGlitch;
    vec2 cell = floor(vUv * vec2(10.0, 6.0));
    float cellR = filmHash(cell + vec2(gClock * 0.37, gClock * 0.11));
    if (cellR > 0.965) {
      guv += (vec2(filmHash(cell + gClock), filmHash(cell - gClock)) - 0.5) * 0.05 * uGlitch;
    }
    guv = clamp(guv, vec2(0.0), vec2(1.0));
  }
  // ─── ARK-07 RELAY INTERFERENCE (analogue wobble) ───────────────────────
  if (uInterference > 0.001) {
    float iw = uInterference;
    guv.x += sin(vUv.y * 42.0 + uTime * 2.3) * 0.0022 * iw;
    guv.y += sin(vUv.x * 30.0 - uTime * 1.7) * 0.0014 * iw;
    guv = clamp(guv, vec2(0.0), vec2(1.0));
  }

  // ─── HEAT SHIMMER (desert / volcanic maps) ─────────────────────────────
  // Hot air over the ground bends the far view: rising, wavering refraction
  // confined to the band around the horizon and to distant pixels (the
  // player's own hands and nearby rocks stay crisp).
  if (uHeatShimmer > 0.001) {
    float hd = textureLod(tDepth, guv, 0.0).r;
    float hFar = hd >= 0.99999 ? 1.0 : smoothstep(14.0, 70.0, linearDepth(hd));
    vec3 hRay = worldRayDir(vUv);
    float hBand = 1.0 - smoothstep(0.015, 0.2, abs(hRay.y + 0.025));
    float hk = uHeatShimmer * hFar * hBand;
    if (hk > 0.001) {
      vec2 hw = vec2(
        sin(vUv.y * 260.0 + uTime * 6.5 + sin(vUv.x * 38.0 + uTime) * 2.0),
        sin(vUv.y * 190.0 - uTime * 4.7 + vUv.x * 27.0)
      );
      guv = clamp(guv + hw * vec2(0.0009, 0.0013) * hk, vec2(0.0), vec2(1.0));
    }
  }

  // ─── CHROMATIC ABERRATION (HDR, radial) ────────────────────────────────
  vec2 dir = vUv - 0.5;
  float dist = length(dir) * 1.4142;
  float caStrength = uChromatic * (dist * dist + 0.2) + uGlitch * 0.0038 + uInterference * 0.0016;
  vec3 col;
  col.r = texture2D(tScene, guv - dir * caStrength).r;
  col.g = texture2D(tScene, guv).g;
  col.b = texture2D(tScene, guv + dir * caStrength).b;
  col = sanitize(col);

  // ─── ARK-07 RELAY INTERFERENCE (defocus + sickly desaturation) ─────────
  if (uInterference > 0.001) {
    float iw = min(1.0, uInterference);
    vec2 bo = uTexel * (2.0 + 7.0 * iw);
    vec3 blurSum =
        sanitize(texture2D(tScene, clamp(guv + vec2( bo.x, 0.0), vec2(0.0), vec2(1.0))).rgb)
      + sanitize(texture2D(tScene, clamp(guv + vec2(-bo.x, 0.0), vec2(0.0), vec2(1.0))).rgb)
      + sanitize(texture2D(tScene, clamp(guv + vec2(0.0,  bo.y), vec2(0.0), vec2(1.0))).rgb)
      + sanitize(texture2D(tScene, clamp(guv + vec2(0.0, -bo.y), vec2(0.0), vec2(1.0))).rgb);
    col = mix(col, (col + blurSum) * 0.2, min(1.0, iw * 1.35));
    float iLum = dot(col, LUMA);
    col = mix(col, vec3(iLum) * vec3(0.9, 1.04, 0.94), 0.42 * iw);
  }

  float depth = texture2D(tDepth, guv).r;
  bool isSky = depth >= 0.99999;

  // ─── CLARITY source (scene luma high-pass, measured pre-fog) ───────────
  // (The blurred luma and the halation glow come from the half-res FX_PRE
  //  buffer — same kernels, a quarter of the work.)
  vec4 fxPre = textureLod(tFxPre, guv, 0.0);
  float detail = 0.0;
  if (uClarity > 0.001) {
    float cLum = dot(min(col, vec3(8.0)), LUMA);
    float bLum = fxPre.a;
    detail = clamp((cLum - bLum) / max(bLum + 0.05, 0.05), -0.6, 0.6);
  }

  // ─── FILM HALATION (warm bleed around hot highlights) ──────────────────
  vec3 halo = uHalation > 0.001 ? fxPre.rgb : vec3(0.0);

  // ─── AMBIENT OCCLUSION (contact darkening, never on the sky) ───────────
  if (uUseAO > 0.5 && !isSky) {
    float ao = textureLod(tAO, guv, 0.0).r;
    col *= mix(1.0, ao, uAOStrength);
  }

  // ─── VOLUMETRIC LIGHT + FOG (shadowed in-scatter, transmittance) ───────
  if (uUseVol > 0.5) {
    vec4 v = sampleVolumetric(guv, depth);
    col = col * v.a + v.rgb;
  }

  col += halo * vec3(1.0, 0.48, 0.32) * uHalation;

  // ─── EXPOSURE · TINT · WHITE BALANCE (linear HDR) ──────────────────────
  col *= uTint * uExposure;
  col *= vec3(1.0 + uTemperature * 0.08, 1.0, 1.0 - uTemperature * 0.1);

  // ─── BLOOM + DIRTY LENS (bloom is already in exposed units) ────────────
  vec3 bloom = texture2D(tBloom, guv).rgb;
  col += bloom * uBloomStrength * (1.0 + dirtMask(vUv) * uLensDirt);

  // ─── ANAMORPHIC STREAKS (horizontal smear of the brightest lights) ─────
  if (uStreakStrength > 0.001) {
    vec3 streak = textureLod(tStreakBlur, guv, 0.0).rgb;
    col += streak * vec3(0.5, 0.72, 1.35) * uStreakStrength * 0.06;
  }

  // ─── GOD RAYS (sky-occluded radial shafts) + SUN HALO ──────────────────
  col += texture2D(tGod, guv).rgb * uGodColor * uGodStrength * uExposure;
  if (uSunHalo > 0.001) {
    vec2 so = uSunUV - vUv;
    float sunDist = length(vec2(so.x * uAspect, so.y));
    col += uSunColor * uSunHalo * exp(-sunDist * 4.2) * uExposure;
  }

  // ─── AERIAL PERSPECTIVE (sun-warmed bright sky / distance) ─────────────
  if (uAerial > 0.001) {
    float lumAerial = dot(col, LUMA);
    float aerialMask = smoothstep(0.6, 2.2, lumAerial) * smoothstep(0.4, 1.0, vUv.y);
    col = mix(col, col * uSunColor * 1.04, aerialMask * 0.1 * uAerial);
  }

  // ─── SATURATION + CONTRAST (HDR; contrast pivots on mid-grey) ──────────
  float luma = dot(col, LUMA);
  col = max(mix(vec3(luma), col, 1.0 + uSaturation), vec3(0.0));
  col = 0.18 * pow(max(col, vec3(0.0)) / 0.18, vec3(uContrast));

  // ─── FILMIC HIGHLIGHT RECOVERY (snow / sand / bright fog) ──────────────
  float recoverLuma = dot(col, LUMA);
  float recoverMask = smoothstep(0.92, 2.8, recoverLuma) * uHighlightRecovery;
  float compressedLuma = 0.92 + log2(max(recoverLuma, 0.92) / 0.92 + 1.0) * 0.62;
  col = mix(col, col * (compressedLuma / max(recoverLuma, 1e-4)), recoverMask);
  float recoveredLuma = dot(col, LUMA);
  col = mix(col, mix(vec3(recoveredLuma), col, 0.64), recoverMask * uHighlightDesaturation);

  // ─── TONEMAP (ACES fitted, hue-preserving blend) → DISPLAY (sRGB) ──────
  vec3 ldr = toSRGB(tonemapDisplay(col));

  // ─── DISPLAY-SPACE GRADE ───────────────────────────────────────────────
  float lumaD = dot(ldr, LUMA);
  // Shadow lift: a whisper of detail retention in the deepest blacks.
  ldr += vec3(uShadowLift) * (1.0 - smoothstep(0.0, 0.22, lumaD));
  // Shadow deepening: pull the low-mids down for weighty, grounded shadow.
  if (uShadowDepth > 0.001) {
    float sdMask = 1.0 - smoothstep(0.04, 0.4, lumaD);
    ldr *= 1.0 - sdMask * uShadowDepth;
  }
  // Vibrance: boost under-saturated colours, leave saturated ones alone.
  float maxC = max(max(ldr.r, ldr.g), ldr.b);
  float minC = min(min(ldr.r, ldr.g), ldr.b);
  float sat = (maxC - minC) / max(maxC, 1e-4);
  float lumaV = dot(ldr, LUMA);
  ldr = vec3(lumaV) + (ldr - vec3(lumaV)) * (1.0 + uVibrance * (1.0 - sat));
  // Clarity: local contrast — crevices darken, edges crisp (hue-preserving).
  ldr *= 1.0 + detail * uClarity * (1.0 - smoothstep(0.75, 1.0, lumaV));
  // Split tone: cool shadows, warm highlights.
  if (uSplitTone > 0.001) {
    float lumaST = dot(ldr, LUMA);
    vec3 toneMul = mix(vec3(0.92, 0.99, 1.07), vec3(1.06, 1.01, 0.92), smoothstep(0.2, 0.8, lumaST));
    ldr *= mix(vec3(1.0), toneMul, uSplitTone);
  }
  // Film grain (luma-shaped, strongest in the mids).
  float grain = filmHash(gl_FragCoord.xy + fract(uTime * 13.7) * 341.0) - 0.5;
  float lumaG = dot(ldr, LUMA);
  float grainShape = smoothstep(0.04, 0.35, lumaG) * (1.0 - smoothstep(0.8, 1.0, lumaG));
  ldr += grain * uGrain * (0.35 + grainShape * 0.75);
  if (uScanline > 0.001) {
    ldr *= 1.0 - (sin(vUv.y * 1600.0) * 0.5 + 0.5) * uScanline * 0.06;
  }
  // Gentle filmic s-curve on display values.
  ldr = clamp(ldr, vec3(0.0), vec3(1.0));
  ldr = mix(ldr, ldr * ldr * (3.0 - 2.0 * ldr), 0.1);

  // ─── NULL-WAVE INTERFERENCE (display) ──────────────────────────────────
  if (uGlitch > 0.001) {
    float gClock2 = floor(uTime * 16.0);
    float lineR = filmHash(vec2(floor(vUv.y * 220.0), gClock2));
    ldr *= 1.0 - step(0.93, lineR) * 0.35 * uGlitch;
    float crush = step(0.7, filmHash(vec2(gClock2, 3.7)));
    ldr = mix(ldr, floor(ldr * 6.0) * (1.0 / 6.0), crush * 0.5 * uGlitch);
  }

  // ─── VIGNETTE ──────────────────────────────────────────────────────────
  float vig = smoothstep(uVignetteOffset, 1.0, dist);
  ldr *= 1.0 - vig * uVignetteDarkness;
  // Dither to kill 8-bit banding in the dark gradients.
  ldr += (filmHash(gl_FragCoord.yx * 1.31) - 0.5) / 255.0;

  gl_FragColor = vec4(clamp(ldr, vec3(0.0), vec3(1.0)), 1.0);
}
`;

/**
 * AMD FidelityFX Contrast Adaptive Sharpening (CAS), sharpen-only port. Runs
 * last on the display image to recover the micro-detail AA + bloom soften.
 * Reference: https://gpuopen.com/fidelityfx-cas/
 */
const CAS_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uSharpness;
varying vec2 vUv;
void main() {
  vec3 a = texture2D(tInput, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture2D(tInput, vUv + uTexel * vec2( 0.0, -1.0)).rgb;
  vec3 c = texture2D(tInput, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3 d = texture2D(tInput, vUv + uTexel * vec2(-1.0,  0.0)).rgb;
  vec3 e = texture2D(tInput, vUv).rgb;
  vec3 f = texture2D(tInput, vUv + uTexel * vec2( 1.0,  0.0)).rgb;
  vec3 g = texture2D(tInput, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3 h = texture2D(tInput, vUv + uTexel * vec2( 0.0,  1.0)).rgb;
  vec3 i = texture2D(tInput, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  vec3 mnRGB = min(min(min(d, e), min(f, b)), h);
  mnRGB += min(mnRGB, min(min(a, c), min(g, i)));
  vec3 mxRGB = max(max(max(d, e), max(f, b)), h);
  mxRGB += max(mxRGB, max(max(a, c), max(g, i)));
  vec3 rcpM = 1.0 / max(mxRGB, vec3(1e-4));
  vec3 ampRGB = sqrt(clamp(min(mnRGB, 2.0 - mxRGB) * rcpM, 0.0, 1.0));
  float peak = -1.0 / mix(8.0, 5.0, clamp(uSharpness, 0.0, 1.0));
  vec3 wRGB = ampRGB * peak;
  vec3 rcpW = 1.0 / (1.0 + 4.0 * wRGB);
  vec3 sharp = clamp((b * wRGB + d * wRGB + f * wRGB + h * wRGB + e) * rcpW, 0.0, 1.0);
  gl_FragColor = vec4(mix(e, sharp, clamp(uSharpness, 0.0, 1.0)), 1.0);
}
`;

const COPY_FRAG = /* glsl */ `
uniform sampler2D tInput;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tInput, vUv).rgb, 1.0); }
`;

const makeShader = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending = THREE.NoBlending) =>
  new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending,
    toneMapped: false,
  });

/** Tileable two-octave value noise (R and G channels) for the volumetric medium. */
function createNoiseTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const lattice = (period: number, seed: number) => {
    const g = new Float32Array(period * period);
    let s = seed;
    for (let i = 0; i < g.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      g[i] = s / 4294967296;
    }
    return g;
  };
  const sample = (g: Float32Array, period: number, x: number, y: number) => {
    const fx = (x / size) * period;
    const fy = (y / size) * period;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (ix: number, iy: number) => g[((iy % period + period) % period) * period + ((ix % period + period) % period)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const r1 = lattice(8, 1337), r2 = lattice(16, 7331), g1 = lattice(12, 4242), g2 = lattice(24, 2424);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = Math.round(255 * (sample(r1, 8, x, y) * 0.66 + sample(r2, 16, x, y) * 0.34));
      data[i + 1] = Math.round(255 * (sample(g1, 12, x, y) * 0.62 + sample(g2, 24, x, y) * 0.38));
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * AAA HDR post-processing pipeline (custom passes on three's renderer).
 *
 *  scene (linear HDR + depth texture)
 *    → SSAO (half res, bilateral)                       [High / Ultra]
 *    → raymarched volumetric light + ground fog: the sun's own cascaded
 *      shadow maps carve real light shafts through the canopy; half/quarter
 *      res, jittered, temporally reprojected (Hillaire 2015)    [Medium+]
 *    → bloom (Karis prefilter in exposed units, 13-tap down / tent up chain)
 *    → god rays (sky-only mask, quarter res radial blur)
 *    → composite: AO · volumetric (depth-aware medium reconstruction) ·
 *      local-light haze · exposure · bloom + dirty lens · anamorphic streaks ·
 *      halation · grade · ACES fitted · sRGB · grain · vignette · glitch
 *    → SMAA → CAS sharpen → screen
 *
 * Every material is fixed at construction (no permutations), and prewarm()
 * runs every pass once, so nothing compiles mid-game.
 */
export class PostProcessingPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly tier: PipelineTier;
  private readonly hdrType: THREE.TextureDataType;

  private readonly postScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;

  private sceneTarget!: THREE.WebGLRenderTarget;
  private aoTarget: THREE.WebGLRenderTarget | null = null;
  private aoBlurTarget: THREE.WebGLRenderTarget | null = null;
  private volTarget: THREE.WebGLRenderTarget | null = null;
  private volHistory: THREE.WebGLRenderTarget[] = [];
  private bloomMips: THREE.WebGLRenderTarget[] = [];
  private godA!: THREE.WebGLRenderTarget;
  private godB!: THREE.WebGLRenderTarget;
  private ldrA!: THREE.WebGLRenderTarget;
  private ldrB!: THREE.WebGLRenderTarget;
  private fxPreTarget!: THREE.WebGLRenderTarget;
  private streakTarget: THREE.WebGLRenderTarget | null = null;

  private readonly ssaoMat: THREE.ShaderMaterial;
  private readonly ssaoBlurMat: THREE.ShaderMaterial;
  private readonly volMat: THREE.ShaderMaterial;
  private readonly volResolveMat: THREE.ShaderMaterial;
  private readonly prefilterMat: THREE.ShaderMaterial;
  private readonly downMat: THREE.ShaderMaterial;
  private readonly upMat: THREE.ShaderMaterial;
  private readonly godMaskMat: THREE.ShaderMaterial;
  private readonly godBlurMat: THREE.ShaderMaterial;
  private readonly compositeMat: THREE.ShaderMaterial;
  private readonly fxPreMat: THREE.ShaderMaterial;
  private readonly streakBlurMat: THREE.ShaderMaterial;
  private readonly casMat: THREE.ShaderMaterial;
  private readonly copyMat: THREE.ShaderMaterial;
  private readonly smaaPass: SMAAPass | null;

  private readonly blackTexture: THREE.DataTexture;
  private readonly whiteTexture: THREE.DataTexture;
  private readonly noiseTexture: THREE.DataTexture;

  private width = 2;
  private height = 2;
  private volIndex = 0;
  private volReset = true;
  private volFrame = 0;
  private readonly prevViewProj = new THREE.Matrix4();
  private readonly viewProj = new THREE.Matrix4();
  private time = 0;

  private shadowNear: THREE.DirectionalLight | null = null;
  private shadowFar: THREE.DirectionalLight | null = null;

  /** Mutable per-frame volumetric inputs (App.tsx writes into this). */
  readonly volumetricInputs: VolumetricInputs = {
    enabled: false,
    sunDir: new THREE.Vector3(0, 1, 0),
    sunRadiance: new THREE.Color(1, 1, 1),
    ambient: new THREE.Color(0.1, 0.12, 0.15),
    density: 0.003,
    heightDensity: 0.02,
    heightFalloff: 0.3,
    baseHeight: 0,
    anisotropy: 0.7,
    noiseStrength: 0.6,
    wind: new THREE.Vector2(),
    maxDistance: 90,
    glows: [0, 1, 2, 3].map(() => ({ position: new THREE.Vector3(), color: new THREE.Color(), energy: 0 })),
  };

  // Grading state
  private baseBloomStrength: number;
  private bloomMultiplier = 1.0;
  private bloomThreshold = 1.0;
  private dayCycleBloom = 1.0;
  // -1 = "no atmosphere pushed yet": the first push snaps exposure directly so
  // the very first rendered frame is already at the final EV.
  private currentExposure = -1;
  private godStrength = 0;
  private readonly lightNdc = new THREE.Vector3();
  private readonly camForward = new THREE.Vector3();
  private readonly tmpSun = new THREE.Vector3();

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    _graphicsPreset: GraphicsPreset,
    quality: GraphicsQuality,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera as THREE.PerspectiveCamera;
    this.tier = TIERS[quality === 'ultra' ? 'ultra' : quality === 'high' ? 'high' : 'medium'];
    // Tone mapping + sRGB happen in the composite; the scene stays linear HDR.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    const ext = renderer.extensions;
    const hdrOk = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.hdrType = hdrOk ? THREE.HalfFloatType : THREE.UnsignedByteType;
    // Without float targets the HDR-only passes would clip: drop them.
    if (!hdrOk) {
      this.tier = { ...this.tier, volumetrics: 0, localHaze: false };
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geometry);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);

    this.blackTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blackTexture.needsUpdate = true;
    this.whiteTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.whiteTexture.needsUpdate = true;
    this.noiseTexture = createNoiseTexture(128);

    this.baseBloomStrength = quality === 'ultra' ? 1.0 : quality === 'high' ? 0.9 : 0.78;

    this.ssaoMat = makeShader(SSAO_FRAG, {
      tDepth: { value: null },
      uProjInv: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: this.tier.ssaoRadius },
      uIntensity: { value: this.tier.ssaoIntensity },
    });
    this.ssaoBlurMat = makeShader(SSAO_BLUR_FRAG, {
      tInput: { value: null },
      tDepth: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uNear: { value: 0.1 },
      uFar: { value: 1000 },
    });
    this.volMat = makeShader(VOLUMETRIC_FRAG(Math.max(6, this.tier.volSteps)), {
      tDepth: { value: null },
      tNoise: { value: this.noiseTexture },
      tShadow0: { value: this.whiteTexture },
      tShadow1: { value: this.whiteTexture },
      uShadowMat0: { value: new THREE.Matrix4() },
      uShadowMat1: { value: new THREE.Matrix4() },
      uShadowCount: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0, 1, 0) },
      uLightColor: { value: new THREE.Color() },
      uAmbient: { value: new THREE.Color() },
      uFog: { value: new THREE.Vector4() },
      uFogNoise: { value: new THREE.Vector4() },
      uAniso: { value: 0.7 },
      uMaxDist: { value: 90 },
      uFrame: { value: 0 },
      uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
    });
    this.volResolveMat = makeShader(VOLUMETRIC_RESOLVE_FRAG, {
      tCurrent: { value: null },
      tHistory: { value: null },
      tDepth: { value: null },
      uPrevViewProj: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() },
      uMaxDist: { value: 90 },
      uReset: { value: 1 },
      uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
    });
    this.prefilterMat = makeShader(PREFILTER_FRAG, {
      tScene: { value: null },
      tVol: { value: this.blackTexture },
      uUseVol: { value: 0 },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1.0 },
      uKnee: { value: 0.5 },
      uExposure: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
    });
    this.downMat = makeShader(DOWNSAMPLE_FRAG, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = makeShader(
      UPSAMPLE_FRAG,
      { tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } },
      THREE.AdditiveBlending,
    );
    this.godMaskMat = makeShader(GOD_MASK_FRAG, {
      tScene: { value: null },
      tDepth: { value: null },
      uLightUv: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: 1 },
    });
    this.godBlurMat = makeShader(GOD_BLUR_FRAG, {
      tInput: { value: null },
      uLightUv: { value: new THREE.Vector2(0.5, 0.5) },
      uDensity: { value: 0.6 },
      uDecay: { value: 0.95 },
      uWeight: { value: 0.07 },
    });
    this.compositeMat = makeShader(COMPOSITE_FRAG, {
      tScene: { value: null },
      tDepth: { value: this.whiteTexture },
      tBloom: { value: this.blackTexture },
      tStreak: { value: this.blackTexture },
      tGod: { value: this.blackTexture },
      tAO: { value: this.whiteTexture },
      tVol: { value: this.blackTexture },
      tFxPre: { value: this.blackTexture },
      tStreakBlur: { value: this.blackTexture },
      uUseAO: { value: 0 },
      uAOStrength: { value: 0.85 },
      uUseVol: { value: 0 },
      uUseGlows: { value: 0 },
      uVolRes: { value: new THREE.Vector2(1, 1) },
      uVolMaxDist: { value: 90 },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uCamNear: { value: 0.1 },
      uCamFar: { value: 1000 },
      uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uGlowPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
      uGlowColor: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
      uTexel: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uExposure: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uSaturation: { value: 0 },
      uContrast: { value: 1 },
      uTemperature: { value: 0 },
      uHighlightRecovery: { value: 0.18 },
      uHighlightDesaturation: { value: 0.18 },
      uBloomStrength: { value: 0.1 },
      uLensDirt: { value: this.tier.lensDirt },
      uStreakStrength: { value: 0 },
      uStreakTexel: { value: 0.01 },
      uGodStrength: { value: 0 },
      uGodColor: { value: new THREE.Color(1, 0.92, 0.78) },
      uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
      uSunHalo: { value: 0 },
      uSunColor: { value: new THREE.Color(1, 0.92, 0.78) },
      uAerial: { value: 1 },
      uAspect: { value: 1 },
      uChromatic: { value: 0.00032 },
      uHalation: { value: this.tier.halation },
      uClarity: { value: this.tier.clarity },
      uShadowLift: { value: 0.012 },
      uShadowDepth: { value: 0.2 },
      uVibrance: { value: 0.2 },
      uSplitTone: { value: this.tier.splitTone },
      uGrain: { value: this.tier.grain },
      uScanline: { value: this.tier.scanline },
      uVignetteOffset: { value: 0.42 },
      uVignetteDarkness: { value: 0.42 },
      uGlitch: { value: 0 },
      uInterference: { value: 0 },
      uHeatShimmer: { value: 0 },
    });
    this.fxPreMat = makeShader(FX_PRE_FRAG, {
      tScene: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uClarityOn: { value: this.tier.clarity > 0.001 ? 1 : 0 },
      uHalationOn: { value: this.tier.halation > 0.001 ? 1 : 0 },
    });
    this.streakBlurMat = makeShader(STREAK_BLUR_FRAG, {
      tStreak: { value: null },
      uStreakTexel: { value: 0.01 },
    });
    this.casMat = makeShader(CAS_FRAG, {
      tInput: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uSharpness: { value: this.tier.cas },
    });
    this.copyMat = makeShader(COPY_FRAG, { tInput: { value: null } });
    this.smaaPass = this.tier.smaa ? new SMAAPass() : null;
    const named: [THREE.Material, string][] = [
      [this.ssaoMat, 'ssao'], [this.ssaoBlurMat, 'ssaoBlur'], [this.volMat, 'volumetric'], [this.volResolveMat, 'volResolve'],
      [this.prefilterMat, 'bloomPrefilter'], [this.downMat, 'bloomDown'], [this.upMat, 'bloomUp'], [this.godMaskMat, 'godMask'],
      [this.godBlurMat, 'godBlur'], [this.compositeMat, 'composite'], [this.casMat, 'cas'], [this.copyMat, 'copy'],
      [this.fxPreMat, 'fxPre'], [this.streakBlurMat, 'streakBlur'],
    ];
    for (const [m, n] of named) m.name = `post:${n}`;

    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    this.allocate(size.x, size.y);
  }

  /** The sun's shadow casters whose maps carve the volumetric light shafts. */
  setShadowLights(near: THREE.DirectionalLight | null, far: THREE.DirectionalLight | null) {
    this.shadowNear = near;
    this.shadowFar = far;
  }

  /** True when this tier raymarches the volumetric pass. */
  get volumetricsAvailable(): boolean {
    return this.tier.volumetrics > 0;
  }

  /** Raymarch range (m) for this tier — App scales the haze to it. */
  get volumetricRange(): number {
    return this.tier.volumetrics === 2 ? (this.tier.volSteps >= 28 ? 120 : 100) : 80;
  }

  private allocate(w: number, h: number) {
    this.width = Math.max(2, Math.floor(w));
    this.height = Math.max(2, Math.floor(h));
    const W = this.width;
    const H = this.height;

    const depthTexture = new THREE.DepthTexture(W, H);
    depthTexture.type = THREE.UnsignedIntType;
    this.sceneTarget = new THREE.WebGLRenderTarget(W, H, {
      type: this.hdrType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture,
      samples: 0,
    });

    const target = (tw: number, th: number, type: THREE.TextureDataType = this.hdrType) =>
      new THREE.WebGLRenderTarget(Math.max(1, Math.floor(tw)), Math.max(1, Math.floor(th)), {
        type,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
        depthBuffer: false,
        stencilBuffer: false,
      });

    if (this.tier.ssao) {
      this.aoTarget = target(W / 2, H / 2, THREE.UnsignedByteType);
      this.aoBlurTarget = target(W / 2, H / 2, THREE.UnsignedByteType);
    }

    if (this.tier.volumetrics > 0) {
      const div = this.tier.volumetrics === 2 ? 2 : 4;
      this.volTarget = target(Math.ceil(W / div), Math.ceil(H / div));
      this.volHistory = [0, 1].map(() => target(Math.ceil(W / div), Math.ceil(H / div)));
      this.volReset = true;
    }

    this.bloomMips = [];
    let bw = W >> 1;
    let bh = H >> 1;
    for (let i = 0; i < this.tier.bloomLevels && bw >= 2 && bh >= 2; i++) {
      this.bloomMips.push(target(bw, bh));
      bw >>= 1;
      bh >>= 1;
    }

    this.godA = target(W / this.tier.godDiv, H / this.tier.godDiv);
    this.godB = target(W / this.tier.godDiv, H / this.tier.godDiv);

    this.ldrA = target(W, H, THREE.UnsignedByteType);
    this.ldrB = target(W, H, THREE.UnsignedByteType);
    this.fxPreTarget = target(Math.ceil(W / 2), Math.ceil(H / 2));
    (this.fxPreMat.uniforms.uTexel.value as THREE.Vector2).set(1 / W, 1 / H);
    const sm = this.bloomMips[Math.min(2, this.bloomMips.length - 1)];
    this.streakTarget = sm ? target(sm.width, sm.height) : null;

    this.smaaPass?.setSize(W, H);
    const c = this.compositeMat.uniforms;
    c.uAspect.value = W / H;
    (c.uTexel.value as THREE.Vector2).set(1 / W, 1 / H);
    (this.casMat.uniforms.uTexel.value as THREE.Vector2).set(1 / W, 1 / H);
  }

  private disposeTargets() {
    this.sceneTarget?.depthTexture?.dispose();
    this.sceneTarget?.dispose();
    this.aoTarget?.dispose();
    this.aoBlurTarget?.dispose();
    this.aoTarget = null;
    this.aoBlurTarget = null;
    this.volTarget?.dispose();
    this.volTarget = null;
    this.volHistory.forEach((t) => t.dispose());
    this.volHistory = [];
    this.bloomMips.forEach((t) => t.dispose());
    this.bloomMips = [];
    this.godA?.dispose();
    this.godB?.dispose();
    this.ldrA?.dispose();
    this.ldrB?.dispose();
    this.fxPreTarget?.dispose();
    this.streakTarget?.dispose();
    this.streakTarget = null;
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = true) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    if (clear) {
      this.renderer.render(this.postScene, this.postCamera);
    } else {
      const autoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.render(this.postScene, this.postCamera);
      this.renderer.autoClear = autoClear;
    }
  }

  /**
   * Force the NEXT updateAtmosphere call to set exposure DIRECTLY (no easing),
   * so the graded look is on screen the instant the warmup loader hides.
   */
  primeExposureSnap() {
    this.currentExposure = -1;
    this.volReset = true;
  }

  /** Push live atmospheric grading (called once per frame). */
  updateAtmosphere(g: AtmosphereGrading) {
    const u = this.compositeMat.uniforms;

    // Saturation: restrained. The old grade added +0.22 saturation and a 0.56
    // vibrance on top of a day atmosphere already at 1.45 — the neon "toy"
    // greens. Day-cycle colour now reads through the tint + split tone.
    u.uSaturation.value = THREE.MathUtils.clamp((g.saturation - 1.0) * 0.36 + 0.07, -0.3, 0.3);
    // Contrast as a power curve around mid-grey (HDR safe).
    u.uContrast.value = THREE.MathUtils.clamp(1.1 + (g.contrast - 1.0) * 0.35, 0.9, 1.32);
    u.uTemperature.value = THREE.MathUtils.clamp(g.temperature, -0.6, 0.6);
    u.uAerial.value = THREE.MathUtils.clamp(g.aerialPerspective ?? 1.0, 0.0, 1.35);
    u.uHighlightRecovery.value = THREE.MathUtils.clamp(g.highlightRecovery ?? 0.18, 0.0, 1.0);
    u.uHighlightDesaturation.value = THREE.MathUtils.clamp(g.highlightDesaturation ?? 0.18, 0.0, 1.0);

    if (typeof g.exposure === 'number') {
      const target = THREE.MathUtils.clamp(g.exposure, 0.4, 1.8) * EXPOSURE_SCALE;
      if (this.currentExposure < 0) this.currentExposure = target;
      else this.currentExposure += (target - this.currentExposure) * 0.08;
      u.uExposure.value = this.currentExposure;
      this.prefilterMat.uniforms.uExposure.value = this.currentExposure;
    }

    if (typeof g.bloomStrength === 'number') {
      this.dayCycleBloom = THREE.MathUtils.clamp(g.bloomStrength / 3.0, 0.75, 1.4);
    }
    u.uBloomStrength.value = 0.085 * this.baseBloomStrength * this.dayCycleBloom * this.bloomMultiplier;

    if (g.colorTint) {
      const tint = u.uTint.value as THREE.Color;
      if (g.colorTint instanceof THREE.Color) tint.copy(g.colorTint);
      else if (g.colorTint instanceof THREE.Vector3) tint.setRGB(g.colorTint.x, g.colorTint.y, g.colorTint.z);
      else tint.setRGB(g.colorTint.r, g.colorTint.g, g.colorTint.b);
      // Pull the tint halfway to neutral: it is a mood cast, not a filter.
      tint.lerp(_WHITE, 0.35);
      (this.prefilterMat.uniforms.uTint.value as THREE.Color).copy(tint);
    }

    const night = !!g.isNight;
    let lowLight = 0;
    if (g.sunDirection) {
      this.tmpSun.copy(g.sunDirection).normalize();
      lowLight = THREE.MathUtils.clamp((0.18 - this.tmpSun.y) / 0.45, 0, 1);
    }
    const shadowLiftScale = THREE.MathUtils.clamp(g.shadowLiftScale ?? 1.0, 0.45, 1.25);
    const vibranceScale = THREE.MathUtils.clamp(g.vibranceScale ?? 1.0, 0.35, 1.2);
    if (night) {
      // Night: deep, but the player must still read silhouettes.
      u.uShadowLift.value = (0.018 + lowLight * 0.006) * shadowLiftScale;
      u.uShadowDepth.value = 0.12;
      u.uVibrance.value = 0.22 * vibranceScale;
    } else {
      // Day: weighty, contrasty shadows — the premium grounded look.
      u.uShadowLift.value = (0.008 + lowLight * 0.006) * shadowLiftScale;
      u.uShadowDepth.value = 0.24;
      u.uVibrance.value = 0.3 * vibranceScale;
    }

    // ─── SCREEN-SPACE SHAFTS (god rays) + SUN HALO ─────────────────────
    const godRayStrength = THREE.MathUtils.clamp(g.godRayStrength ?? 1.0, 0.0, 1.3);
    this.godStrength = 0;
    u.uSunHalo.value = 0;
    if (g.sunDirection && this.tier.godRays) {
      const sun = this.tmpSun.copy(g.sunDirection).normalize();
      const vis = this.updateGodRayLight(sun);
      const altGate = THREE.MathUtils.smoothstep(sun.y, -0.05, 0.4);
      const sunColor = u.uSunColor.value as THREE.Color;
      if (night) {
        sunColor.setRGB(0.55, 0.7, 1.0);
        this.godStrength = 0.22 * vis * godRayStrength;
        u.uSunHalo.value = 0.05 * vis;
      } else {
        const lowSun = THREE.MathUtils.smoothstep(1.0 - sun.y, 0.4, 0.85);
        sunColor.setRGB(1.0, 0.92 - lowSun * 0.22, 0.78 - lowSun * 0.34);
        const goldenBoost = 1.0 + lowSun * 0.45;
        this.godStrength = 0.5 * vis * altGate * goldenBoost * godRayStrength;
        u.uSunHalo.value = 0.07 * vis * altGate;
      }
      (u.uGodColor.value as THREE.Color).copy(sunColor);
    }
  }

  /** Project the sun; returns 0..1 visibility (0 when behind / far off-screen). */
  private updateGodRayLight(dir: THREE.Vector3): number {
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.getWorldDirection(this.camForward);
    const facing = this.camForward.dot(dir);
    if (facing <= 0.02) return 0;
    this.lightNdc.copy(dir).multiplyScalar(380).add(cam.position).project(cam);
    const uvx = this.lightNdc.x * 0.5 + 0.5;
    const uvy = this.lightNdc.y * 0.5 + 0.5;
    (this.godMaskMat.uniforms.uLightUv.value as THREE.Vector2).set(uvx, uvy);
    (this.godBlurMat.uniforms.uLightUv.value as THREE.Vector2).set(uvx, uvy);
    (this.compositeMat.uniforms.uSunUV.value as THREE.Vector2).set(uvx, uvy);
    const edge = Math.max(Math.abs(this.lightNdc.x), Math.abs(this.lightNdc.y));
    return THREE.MathUtils.clamp(1 - (edge - 0.95) / 0.5, 0, 1) * THREE.MathUtils.smoothstep(facing, 0.02, 0.3);
  }

  /**
   * Map-specific bloom profile, called once at scene init.
   *   multiplier      scales the global bloom strength
   *   thresholdBias   ADDED to the base threshold (negative = more blooms)
   */
  setMapBloomProfile(multiplier: number, thresholdBias: number) {
    this.bloomMultiplier = multiplier;
    this.bloomThreshold = THREE.MathUtils.clamp(1.0 + thresholdBias * 1.6, 0.6, 1.6);
    this.prefilterMat.uniforms.uThreshold.value = this.bloomThreshold;
  }

  /** NULL-WAVE signal corruption amount (0 = clean). Plain uniform write. */
  setGlitch(strength: number) {
    this.compositeMat.uniforms.uGlitch.value = THREE.MathUtils.clamp(strength, 0, 1);
  }

  /** ARK-07 relay interference (0 = clear). Plain uniform write. */
  setInterference(strength: number) {
    this.compositeMat.uniforms.uInterference.value = THREE.MathUtils.clamp(strength, 0, 1);
  }

  /** Heat-haze refraction near the horizon (0 = off). Plain uniform write. */
  setHeatShimmer(strength: number) {
    this.compositeMat.uniforms.uHeatShimmer.value = THREE.MathUtils.clamp(strength, 0, 1.5);
  }

  setSize(width: number, height: number) {
    this.disposeTargets();
    this.allocate(width, height);
  }

  /**
   * Issue the compile of EVERY post program at once and resolve when the
   * driver has linked them all. With KHR_parallel_shader_compile the driver
   * builds them on its own threads, so calling this at the start of the
   * loader overlaps the whole post chain with the rest of the warmup instead
   * of stalling the first frame (on D3D11 that serial compile was ~19 s).
   *
   * A ShaderMaterial's program key includes the colour space of the target it
   * renders into, so each pass is compiled while ITS target is bound — the
   * programs built here are exactly the ones the real frames reuse.
   */
  compileAsync(): Promise<void> {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevMaterial = this.quad.material;
    const pending = new Set<THREE.Material>();
    const compileFor = (material: THREE.Material, target: THREE.WebGLRenderTarget | null) => {
      this.quad.material = material;
      r.setRenderTarget(target);
      r.compile(this.postScene, this.postCamera).forEach((m) => pending.add(m));
    };
    try {
      if (this.aoTarget && this.aoBlurTarget) {
        compileFor(this.ssaoMat, this.aoTarget);
        compileFor(this.ssaoBlurMat, this.aoBlurTarget);
      }
      if (this.volTarget && this.volHistory[0]) {
        compileFor(this.volMat, this.volTarget);
        compileFor(this.volResolveMat, this.volHistory[0]);
      }
      if (this.bloomMips[0]) {
        compileFor(this.prefilterMat, this.bloomMips[0]);
        compileFor(this.downMat, this.bloomMips[0]);
        compileFor(this.upMat, this.bloomMips[0]);
      }
      if (this.tier.godRays) {
        compileFor(this.godMaskMat, this.godA);
        compileFor(this.godBlurMat, this.godB);
      }
      compileFor(this.fxPreMat, this.fxPreTarget);
      if (this.streakTarget) compileFor(this.streakBlurMat, this.streakTarget);
      compileFor(this.compositeMat, this.ldrA);
      // CAS writes the canvas (sRGB output space) whenever it is enabled.
      compileFor(this.casMat, this.tier.cas > 0 ? null : this.ldrA);
      // SMAA's own materials: every one renders into an off-screen target.
      const smaa = this.smaaPass as unknown as Record<string, unknown> | null;
      if (smaa) {
        for (const key of ['_materialEdges', '_materialWeights', '_materialBlend']) {
          const m = smaa[key];
          if (m instanceof THREE.Material) compileFor(m, this.ldrB);
        }
      }
    } finally {
      this.quad.material = prevMaterial;
      r.setRenderTarget(prevTarget);
    }
    const t0 = performance.now();
    return new Promise<void>((resolve) => {
      const check = () => {
        pending.forEach((m) => {
          const program = (r.properties.get(m) as { currentProgram?: { isReady: () => boolean } }).currentProgram;
          // A missing program (material disposed mid-compile) is not worth waiting on.
          if (!program || program.isReady()) {
            pending.delete(m);
            if (import.meta.env.DEV) console.log(`[Post] ${m.name || m.type} ready after ${Math.round(performance.now() - t0)} ms`);
          }
        });
        if (pending.size === 0) resolve();
        else window.setTimeout(check, 16);
      };
      check();
    });
  }

  /**
   * Run every pass once (forcing the optional ones) so each program links
   * during the loader instead of on first use mid-game.
   */
  prewarm() {
    this.renderInternal(0.016, true);
  }

  render(delta: number) {
    this.renderInternal(delta, false);
  }

  private renderInternal(delta: number, force: boolean) {
    const renderer = this.renderer;
    const camera = this.camera;
    const tier = this.tier;
    this.time += delta;
    camera.updateMatrixWorld();

    // 1. Scene → linear HDR + depth.
    const gp = gpuProfiler;
    const shadowAuto = renderer.shadowMap.autoUpdate;
    const skipShadows = gp.enabled && gp.splitShadows && (gp.frame & 1) === 1;
    if (skipShadows) renderer.shadowMap.autoUpdate = false;
    gp.begin(skipShadows ? 'scene(no shadow)' : 'scene+shadow');
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(this.scene, camera);
    gp.end();
    if (skipShadows) renderer.shadowMap.autoUpdate = shadowAuto;
    const sceneTex = this.sceneTarget.texture;
    const depthTex = this.sceneTarget.depthTexture as THREE.DepthTexture;

    // 2. SSAO.
    const useAO = !!(this.aoTarget && this.aoBlurTarget);
    if (useAO && this.aoTarget && this.aoBlurTarget) {
      const s = this.ssaoMat.uniforms;
      s.tDepth.value = depthTex;
      (s.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
      (s.uProj.value as THREE.Matrix4).copy(camera.projectionMatrix);
      (s.uTexel.value as THREE.Vector2).set(1 / this.aoTarget.width, 1 / this.aoTarget.height);
      gp.begin('ssao');
      this.pass(this.ssaoMat, this.aoTarget);
      const b = this.ssaoBlurMat.uniforms;
      b.tInput.value = this.aoTarget.texture;
      b.tDepth.value = depthTex;
      (b.uTexel.value as THREE.Vector2).set(1 / this.aoTarget.width, 1 / this.aoTarget.height);
      b.uNear.value = camera.near;
      b.uFar.value = camera.far;
      this.pass(this.ssaoBlurMat, this.aoBlurTarget);
      gp.end();
    }

    // 3. Volumetric light.
    const vol = this.volumetricInputs;
    let volTex: THREE.Texture | null = null;
    if (this.volTarget && (vol.enabled || force)) {
      gp.begin('volumetrics');
      volTex = this.renderVolumetrics(depthTex);
      gp.end();
    } else {
      this.volReset = true;
    }

    // 4. Bloom.
    let bloomTex: THREE.Texture = this.blackTexture;
    if (this.bloomMips.length > 0) {
      const first = this.bloomMips[0];
      const p = this.prefilterMat.uniforms;
      p.tScene.value = sceneTex;
      p.tVol.value = volTex ?? this.blackTexture;
      p.uUseVol.value = volTex ? 1 : 0;
      (p.uTexel.value as THREE.Vector2).set(0.5 / this.width, 0.5 / this.height);
      gp.begin('bloom');
      this.pass(this.prefilterMat, first);
      for (let i = 1; i < this.bloomMips.length; i++) {
        const src = this.bloomMips[i - 1];
        this.downMat.uniforms.tInput.value = src.texture;
        (this.downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
        this.pass(this.downMat, this.bloomMips[i]);
      }
      for (let i = this.bloomMips.length - 1; i > 0; i--) {
        const src = this.bloomMips[i];
        this.upMat.uniforms.tInput.value = src.texture;
        (this.upMat.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
        this.pass(this.upMat, this.bloomMips[i - 1], false);
      }
      bloomTex = first.texture;
      gp.end();
    }

    // 5. God rays.
    let godTex: THREE.Texture = this.blackTexture;
    if (tier.godRays && (this.godStrength > 0.004 || force)) {
      this.godMaskMat.uniforms.tScene.value = sceneTex;
      this.godMaskMat.uniforms.tDepth.value = depthTex;
      this.godMaskMat.uniforms.uAspect.value = this.width / this.height;
      gp.begin('godrays');
      this.pass(this.godMaskMat, this.godA);
      this.godBlurMat.uniforms.tInput.value = this.godA.texture;
      this.godBlurMat.uniforms.uDensity.value = 0.55;
      this.pass(this.godBlurMat, this.godB);
      this.godBlurMat.uniforms.tInput.value = this.godB.texture;
      this.godBlurMat.uniforms.uDensity.value = 0.95;
      this.pass(this.godBlurMat, this.godA);
      godTex = this.godA.texture;
      gp.end();
    }

    // 6a. Low-res effect buffers (halation + clarity blur; anamorphic streak).
    gp.begin('fxPre+streak');
    const usePre = tier.clarity > 0.001 || tier.halation > 0.001;
    if (usePre) {
      this.fxPreMat.uniforms.tScene.value = sceneTex;
      this.pass(this.fxPreMat, this.fxPreTarget);
    }
    const streakMip0 = this.bloomMips[Math.min(2, this.bloomMips.length - 1)];
    let streakBlurTex: THREE.Texture = this.blackTexture;
    if (this.streakTarget && streakMip0 && tier.anamorphic > 0) {
      this.streakBlurMat.uniforms.tStreak.value = streakMip0.texture;
      this.streakBlurMat.uniforms.uStreakTexel.value = 2.5 / streakMip0.width;
      this.pass(this.streakBlurMat, this.streakTarget);
      streakBlurTex = this.streakTarget.texture;
    }
    gp.end();

    // 6. Composite → display-referred LDR.
    const c = this.compositeMat.uniforms;
    c.tFxPre.value = usePre ? this.fxPreTarget.texture : this.blackTexture;
    c.tStreakBlur.value = streakBlurTex;
    c.tScene.value = sceneTex;
    c.tDepth.value = depthTex;
    c.tBloom.value = bloomTex;
    c.tGod.value = godTex;
    // With raymarched shafts on, the screen-space rays only add the streaky
    // crepuscular highlight around a visible sun.
    c.uGodStrength.value = this.godStrength * (volTex ? 0.55 : 0.8);
    c.tAO.value = useAO && this.aoBlurTarget ? this.aoBlurTarget.texture : this.whiteTexture;
    c.uUseAO.value = useAO ? 1 : 0;
    c.tVol.value = volTex ?? this.blackTexture;
    c.uUseVol.value = volTex ? 1 : 0;
    c.uUseGlows.value = volTex && tier.localHaze ? 1 : 0;
    if (volTex && this.volTarget) {
      (c.uVolRes.value as THREE.Vector2).set(this.volTarget.width, this.volTarget.height);
      this.bindCameraUniforms(c);
      this.bindGlows(c);
    }
    c.uCamNear.value = camera.near;
    c.uCamFar.value = camera.far;
    c.uVolMaxDist.value = vol.maxDistance;
    (c.uProjScale.value as THREE.Vector2).set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    const streakMip = this.bloomMips[Math.min(2, this.bloomMips.length - 1)];
    c.tStreak.value = streakMip ? streakMip.texture : this.blackTexture;
    c.uStreakStrength.value = streakMip ? tier.anamorphic : 0;
    c.uStreakTexel.value = streakMip ? 2.5 / streakMip.width : 0;
    c.uTime.value = this.time;

    if (this.smaaPass) {
      gp.begin('composite');
      this.pass(this.compositeMat, this.ldrA);
      gp.end();
      if (tier.cas > 0) {
        this.smaaPass.renderToScreen = false;
        gp.begin('smaa');
        this.smaaPass.render(renderer, this.ldrB, this.ldrA, 0, false);
        gp.end();
        this.casMat.uniforms.tInput.value = this.ldrB.texture;
        gp.begin('cas');
        this.pass(this.casMat, null);
        gp.end();
      } else {
        this.smaaPass.renderToScreen = true;
        this.smaaPass.render(renderer, null as unknown as THREE.WebGLRenderTarget, this.ldrA, 0, false);
      }
    } else if (tier.cas > 0) {
      this.pass(this.compositeMat, this.ldrA);
      this.casMat.uniforms.tInput.value = this.ldrA.texture;
      this.pass(this.casMat, null);
    } else {
      this.pass(this.compositeMat, null);
    }
    renderer.setRenderTarget(null);
  }

  private renderVolumetrics(depthTex: THREE.Texture): THREE.Texture {
    const target = this.volTarget!;
    const vol = this.volumetricInputs;
    const camera = this.camera;
    const u = this.volMat.uniforms;
    this.volFrame = (this.volFrame + 1) % 1024;
    u.tDepth.value = depthTex;

    // Shadow cascades (maps are created lazily by three on first shadow render).
    let count = 0;
    const near = this.shadowNear;
    if (near && near.castShadow && near.shadow.map) {
      u.tShadow0.value = near.shadow.map.texture;
      (u.uShadowMat0.value as THREE.Matrix4).copy(near.shadow.matrix);
      count = 1;
      const far = this.shadowFar;
      if (far && far.castShadow && far.shadow.map) {
        u.tShadow1.value = far.shadow.map.texture;
        (u.uShadowMat1.value as THREE.Matrix4).copy(far.shadow.matrix);
        count = 2;
      }
    }
    u.uShadowCount.value = count;
    (u.uLightDir.value as THREE.Vector3).copy(vol.sunDir);
    (u.uLightColor.value as THREE.Color).copy(vol.sunRadiance);
    (u.uAmbient.value as THREE.Color).copy(vol.ambient);
    (u.uFog.value as THREE.Vector4).set(vol.density, vol.heightDensity, vol.heightFalloff, vol.baseHeight);
    (u.uFogNoise.value as THREE.Vector4).set(vol.noiseStrength, 0.011, vol.wind.x, vol.wind.y);
    u.uAniso.value = vol.anisotropy;
    u.uMaxDist.value = vol.maxDistance;
    u.uFrame.value = this.volFrame;
    this.bindCameraUniforms(u);
    this.bindCameraUniforms(this.volResolveMat.uniforms);
    this.pass(this.volMat, target);

    // Temporal accumulation with neighbourhood clamping.
    const read = this.volHistory[this.volIndex];
    const write = this.volHistory[1 - this.volIndex];
    const r = this.volResolveMat.uniforms;
    r.tCurrent.value = target.texture;
    r.tHistory.value = read.texture;
    r.tDepth.value = depthTex;
    (r.uPrevViewProj.value as THREE.Matrix4).copy(this.prevViewProj);
    (r.uTexel.value as THREE.Vector2).set(1 / target.width, 1 / target.height);
    r.uMaxDist.value = vol.maxDistance;
    r.uReset.value = this.volReset ? 1 : 0;
    this.pass(this.volResolveMat, write);
    this.volIndex = 1 - this.volIndex;
    this.volReset = false;
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.prevViewProj.copy(this.viewProj);
    return write.texture;
  }

  private bindCameraUniforms(u: Record<string, THREE.IUniform>) {
    const camera = this.camera;
    (u.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u.uCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    (u.uCamPos.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);
  }

  private bindGlows(c: Record<string, THREE.IUniform>) {
    const gp = c.uGlowPos.value as THREE.Vector4[];
    const gc = c.uGlowColor.value as THREE.Color[];
    const glows = this.volumetricInputs.glows;
    for (let i = 0; i < 4; i++) {
      const g = glows[i];
      if (g && g.energy > 0) {
        gp[i].set(g.position.x, g.position.y, g.position.z, g.energy);
        gc[i].copy(g.color);
      } else {
        gp[i].w = 0;
      }
    }
  }

  /** Plain blit of a texture to the screen (fallback utility). */
  blit(texture: THREE.Texture) {
    this.copyMat.uniforms.tInput.value = texture;
    this.pass(this.copyMat, null);
  }

  dispose() {
    this.disposeTargets();
    for (const m of [
      this.ssaoMat, this.ssaoBlurMat, this.volMat, this.volResolveMat, this.prefilterMat,
      this.downMat, this.upMat, this.godMaskMat, this.godBlurMat, this.compositeMat,
      this.casMat, this.copyMat, this.fxPreMat, this.streakBlurMat,
    ]) {
      m.dispose();
    }
    this.smaaPass?.dispose();
    this.quad.geometry.dispose();
    this.blackTexture.dispose();
    this.whiteTexture.dispose();
    this.noiseTexture.dispose();
  }
}

const _WHITE = new THREE.Color(1, 1, 1);
