/**
 * TERRAIN SYSTEM — Forest Survival
 *
 * Turns the previously DEAD-FLAT ground plane into a believable, AAA-grade
 * landscape with:
 *
 *   • GPU vertex displacement — rolling hills, indentations, bumps and ridges
 *     sampled from a seeded, precision-stable height field (different every run,
 *     "Minecraft-style" world variety) that is locked to WORLD space so the
 *     terrain doesn't swim as the camera-following ground plane recenters.
 *
 *   • A PLAYER-RELATIVE FLAT ZONE — the displacement is multiplied by a radial
 *     envelope that is ~0 within `flatRadius` of the player and ramps to full
 *     only out in the fogged mid/far field. The combat arena the player and
 *     enemies actually fight in therefore stays perfectly flat (y == 0), so the
 *     entire gameplay/VFX layer is untouched and nothing floats or clips. The
 *     undulation lives where the eye reads "terrain" (the horizon/mid-ground)
 *     and where fog hides any parallax against world props.
 *
 *   • Ultra-detailed procedural ground material — macro earth-tone patches,
 *     cavity ambient-occlusion, micro grain, slope→rock (talus) blending, and
 *     per-pixel normal-mapped micro-relief, PLUS a per-map IDENTITY layer:
 *     sand ripples, snow drift + sparkle, lava cracks, wet swamp puddles, etc.
 *
 * The height field is intentionally built from band-limited TRIG (not a
 * fract()/sin-hash) so it evaluates to the same value in JS (float64) and on
 * the GPU (float32) to sub-millimetre precision — important if gameplay ever
 * needs to sample it. The high-frequency "noisy" realism is added per-pixel in
 * the fragment shader where an exact CPU match is irrelevant.
 *
 * Everything here is injected into a standard `MeshStandardMaterial` through
 * `onBeforeCompile`, so three.js's full PBR + shadow + fog path stays intact.
 */

import * as THREE from 'three';
import type { MapConfig } from './MapSystem';

// ── Per-map terrain authoring input (lives on MapConfig.terrain) ────────────
export interface TerrainProfileInput {
  /** Peak macro undulation height in world units (hills/valleys). */
  amplitude?: number;
  /** Base spatial frequency (≈ 1 / wavelength). Smaller = broader hills. */
  frequency?: number;
  /** 0..1 — biases the field toward sharp ridges/dunes/canyon walls. */
  ridginess?: number;
  /** Inner radius (m) kept perfectly flat around the player. */
  flatRadius?: number;
  /** Distance (m) over which displacement ramps from 0 → full. */
  falloff?: number;
  /** Multiplicative warm/cool macro tints (subtle, centred near 1.0). */
  macroTintA?: [number, number, number];
  macroTintB?: [number, number, number];
  /** Target colour the surface blends toward on steep slopes (talus rock). */
  rockColor?: number;
  /** Fine grain tint (additive micro grit). */
  detailColor?: [number, number, number];
  /** Micro detail frequency multiplier. */
  detailScale?: number;
  /** Directional ripple identity (sand dunes / snow drift). */
  rippleDir?: [number, number];
  rippleScale?: number;
  rippleStrength?: number;
  /** View-dependent glint (snow / sand). */
  sparkle?: number;
  /** Wet sheen + dark puddle pooling (swamp / rain). */
  wetness?: number;
  /** Emissive crack veins (lava). */
  crackGlow?: number;
  crackColor?: number;
}

export interface ResolvedTerrainProfile {
  amplitude: number;
  frequency: number;
  ridginess: number;
  flatRadius: number;
  falloff: number;
  warpAmp: number;
  macroTintA: [number, number, number];
  macroTintB: [number, number, number];
  rockColor: number;
  detailColor: [number, number, number];
  detailScale: number;
  rippleDir: [number, number];
  rippleScale: number;
  rippleStrength: number;
  sparkle: number;
  wetness: number;
  crackGlow: number;
  crackColor: number;
}

// Sensible neutral defaults — every map overrides the parts that give it
// character; anything omitted falls back to a grounded "earth" look.
const DEFAULTS: ResolvedTerrainProfile = {
  amplitude: 3.0,
  frequency: 0.015,
  ridginess: 0.15,
  flatRadius: 20,
  falloff: 55,
  warpAmp: 10,
  macroTintA: [1.08, 1.03, 0.93],
  macroTintB: [0.9, 0.95, 1.04],
  rockColor: 0x4a4640,
  detailColor: [1.0, 0.96, 0.88],
  detailScale: 1.0,
  rippleDir: [0.9, 0.42],
  rippleScale: 0.0,
  rippleStrength: 0.0,
  sparkle: 0.0,
  wetness: 0.0,
  crackGlow: 0.0,
  crackColor: 0xff5512,
};

/** Merge a map's authored terrain block with the neutral defaults. */
export function resolveTerrainProfile(map: MapConfig): ResolvedTerrainProfile {
  const t = map.terrain ?? {};
  const frequency = t.frequency ?? DEFAULTS.frequency;
  return {
    amplitude: t.amplitude ?? DEFAULTS.amplitude,
    frequency,
    ridginess: t.ridginess ?? DEFAULTS.ridginess,
    flatRadius: t.flatRadius ?? DEFAULTS.flatRadius,
    falloff: t.falloff ?? DEFAULTS.falloff,
    // Domain-warp amount scales with the hill wavelength so warp reads the
    // same regardless of frequency.
    warpAmp: 0.15 / frequency,
    macroTintA: t.macroTintA ?? DEFAULTS.macroTintA,
    macroTintB: t.macroTintB ?? DEFAULTS.macroTintB,
    rockColor: t.rockColor ?? DEFAULTS.rockColor,
    detailColor: t.detailColor ?? DEFAULTS.detailColor,
    detailScale: t.detailScale ?? DEFAULTS.detailScale,
    rippleDir: t.rippleDir ?? DEFAULTS.rippleDir,
    rippleScale: t.rippleScale ?? DEFAULTS.rippleScale,
    rippleStrength: t.rippleStrength ?? DEFAULTS.rippleStrength,
    sparkle: t.sparkle ?? DEFAULTS.sparkle,
    wetness: t.wetness ?? DEFAULTS.wetness,
    crackGlow: t.crackGlow ?? DEFAULTS.crackGlow,
    crackColor: t.crackColor ?? DEFAULTS.crackColor,
  };
}

/**
 * Per-run terrain seed. Uses crypto for uniform entropy so every playthrough
 * gets a distinct hill layout (the "truly random" world the design calls for).
 * Kept moderate so the trig arguments inside the shader stay in a range where
 * float32 sin/cos is accurate.
 */
export function createTerrainSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 100000) * 0.001; // 0 .. 100
}

// Recommended ground-plane segment count for the displaced mesh, scaled by the
// graphics preset's terrainDetail. The flat near-zone needs far fewer triangles
// than the undulating far field, but a uniform grid is simplest and robust.
export function terrainSegments(terrainDetail: number): number {
  if (terrainDetail >= 1.0) return 200;
  if (terrainDetail >= 0.82) return 160;
  return 112;
}

// ── Uniform holders ─────────────────────────────────────────────────────────
// Returned to the caller so the static terrain uniforms can be created once and
// the per-frame day-cycle uniforms (uTime etc.) keep their existing wiring.
export interface TerrainUniforms {
  [name: string]: { value: number | THREE.Color | THREE.Vector2 | THREE.Vector3 };
}

export function createTerrainUniforms(
  profile: ResolvedTerrainProfile,
  seed: number,
): TerrainUniforms {
  return {
    uTSeed: { value: seed },
    uTAmp: { value: profile.amplitude },
    uTFreq: { value: profile.frequency },
    uTWarpAmp: { value: profile.warpAmp },
    uTRidge: { value: profile.ridginess },
    uTFlatR: { value: profile.flatRadius },
    uTFalloff: { value: profile.falloff },
    uTMacroA: { value: new THREE.Color(profile.macroTintA[0], profile.macroTintA[1], profile.macroTintA[2]) },
    uTMacroB: { value: new THREE.Color(profile.macroTintB[0], profile.macroTintB[1], profile.macroTintB[2]) },
    uTRock: { value: new THREE.Color(profile.rockColor) },
    uTDetailCol: { value: new THREE.Color(profile.detailColor[0], profile.detailColor[1], profile.detailColor[2]) },
    uTDetailScale: { value: profile.detailScale },
    uTRippleDir: { value: new THREE.Vector2(profile.rippleDir[0], profile.rippleDir[1]).normalize() },
    uTRippleScale: { value: profile.rippleScale },
    uTRippleStr: { value: profile.rippleStrength },
    uTSparkle: { value: profile.sparkle },
    uTWetness: { value: profile.wetness },
    uTCrackGlow: { value: profile.crackGlow },
    uTCrackCol: { value: new THREE.Color(profile.crackColor) },
  };
}

// ── Shared GLSL: noise helpers + the precision-stable height field ──────────
const TERRAIN_VERT_COMMON = /* glsl */ `
  varying vec3 vGroundWorldPos;
  varying float vTerrainSlope;

  uniform float uTSeed;
  uniform float uTAmp;
  uniform float uTFreq;
  uniform float uTWarpAmp;
  uniform float uTRidge;
  uniform float uTFlatR;
  uniform float uTFalloff;

  // Band-limited trig height field — domain-warped, 3 octaves, optional ridge
  // bias. Identical in JS and GLSL because every trig argument stays bounded.
  float tHeight(vec2 p) {
    float s = uTSeed;
    float f = uTFreq;
    vec2 w = p + vec2(
      sin(p.y * f * 1.7 + s),
      cos(p.x * f * 1.7 + s * 1.31)
    ) * uTWarpAmp;
    float h  = sin(w.x * f         + s)       * cos(w.y * f * 0.93       + s * 0.7);
    h       += sin(w.x * f * 2.07  + 1.7 + s) * cos(w.y * f * 1.96 - 0.8) * 0.5;
    h       += sin(w.x * f * 4.13  - 2.1)     * cos(w.y * f * 3.88 + s)   * 0.25;
    h /= 1.75;
    // Ridge bias — turns rolling hills into sharper dunes / canyon walls.
    float ridge = 1.0 - abs(h);
    ridge = ridge * ridge * 2.0 - 1.0;
    h = mix(h, ridge, uTRidge);
    return h * uTAmp;
  }
`;

const TERRAIN_FRAG_COMMON = /* glsl */ `
  uniform float uTime;
  uniform vec3  uSunDirection;
  uniform vec3  uSunColor;
  uniform float uIncidentBoost;
  uniform float uSpecularStrength;
  uniform float uNormalStrength;
  uniform float uPatchScale;
  uniform float uPatchStrength;
  uniform float uIsNight;
  // ── LIVE RAIN (weather system) ──
  // uRainWet  — 0..1 ground soak; grows puddles + darkens soil, lingers
  //             after the rain ends (slow dry-out).
  // uRainRipple — 0..1 active precipitation; animates ripple rings on the
  //             puddles so still pools only form once the rain has stopped.
  // uPuddleDetail — graphics-preset knob (0..1): scales the procedural
  //             rain-ring layers perturbing the puddle mirror.
  // uEnvTint — weather tint folded into the puddle env reflection so a
  //             storm-grey sky never mirrors as a bright sunny HDRI.
  uniform float uRainWet;
  uniform float uRainRipple;
  uniform float uPuddleDetail;
  uniform vec3  uEnvTint;

  uniform vec3  uTMacroA;
  uniform vec3  uTMacroB;
  uniform vec3  uTRock;
  uniform vec3  uTDetailCol;
  uniform float uTDetailScale;
  uniform vec2  uTRippleDir;
  uniform float uTRippleScale;
  uniform float uTRippleStr;
  uniform float uTSparkle;
  uniform float uTWetness;
  uniform float uTCrackGlow;
  uniform vec3  uTCrackCol;

  varying vec3  vGroundWorldPos;
  varying float vTerrainSlope;

  float gHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float gNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = gHash(i);
    float b = gHash(i + vec2(1.0, 0.0));
    float c = gHash(i + vec2(0.0, 1.0));
    float d = gHash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float gFbm(vec2 p) {
    // 3 octaves — the 4th adds negligible ground detail for ~25% more cost.
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * gNoise(p); p = p * 2.07 + vec2(13.0, 7.0); a *= 0.5; }
    return v;
  }
  vec2 gFbmGradient(vec2 p, float epsilon) {
    float c = gFbm(p);
    float dx = gFbm(p + vec2(epsilon, 0.0)) - c;
    float dy = gFbm(p + vec2(0.0, epsilon)) - c;
    return vec2(dx, dy) / epsilon;
  }

  // PRECISION-STABLE puddle field — band-limited trig (like the terrain
  // height field) instead of a sin-hash fbm, so it evaluates to the SAME
  // pattern in JS (float64) and on the GPU (float32). Gameplay samples the
  // JS twin (samplePuddleMask) to decide where footstep / movement splashes
  // belong, so the CPU and the pixels must agree on where the puddles are.
  // KEEP IN SYNC with samplePuddleField() below.
  float puddleField(vec2 p) {
    vec2 q = p * 0.3;
    float s = uTSeed;
    float v = sin(q.x + s) * cos(q.y * 0.93 + s * 0.7);
    v += sin(q.x * 1.83 + q.y * 0.67 + s * 1.9) * 0.6;
    v += cos(q.x * 0.49 - q.y * 1.27 + s * 2.6) * 0.75;
    v += sin((q.x + q.y) * 1.37 - s * 1.2) * 0.45;
    return v * 0.178 + 0.5;
  }
`;

/**
 * Inject the terrain displacement + ultra-detailed ground material into a
 * standard MeshStandardMaterial's compiled shader. Call this from the
 * material's `onBeforeCompile`, passing BOTH the existing day-cycle uniform
 * holders and the static terrain uniforms so all of them get wired up.
 */
export function applyGroundTerrainShader(
  shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, { value: unknown }> },
  dayUniforms: Record<string, { value: unknown }>,
  terrainUniforms: TerrainUniforms,
): void {
  for (const k in dayUniforms) shader.uniforms[k] = dayUniforms[k];
  for (const k in terrainUniforms) shader.uniforms[k] = terrainUniforms[k] as { value: unknown };

  // ════════════════════════ VERTEX ════════════════════════
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>\n${TERRAIN_VERT_COMMON}`,
  );

  // Replace the geometry normal with the analytic terrain normal so hill
  // slopes shade correctly. Object-space basis: plane is rotated -90° about X
  // (local +Z → world +Y), so a world height-field normal (-dH/dx, 1, -dH/dz)
  // maps back to object space as (-dH/dx, dH/dz, 1).
  shader.vertexShader = shader.vertexShader.replace(
    '#include <beginnormal_vertex>',
    `#include <beginnormal_vertex>
    {
      vec3 tW = (modelMatrix * vec4(position, 1.0)).xyz;
      float tR = length(position.xy);
      float tEnv = smoothstep(uTFlatR, uTFlatR + uTFalloff, tR);
      float e = 1.6;
      float h0 = tHeight(tW.xz);
      float dHdx = (tHeight(tW.xz + vec2(e, 0.0)) - h0) / e * tEnv;
      float dHdz = (tHeight(tW.xz + vec2(0.0, e)) - h0) / e * tEnv;
      objectNormal = normalize(vec3(-dHdx, dHdz, 1.0));
      vTerrainSlope = clamp(1.0 - objectNormal.z, 0.0, 1.0);
    }`,
  );

  // Displace along world-up (local +Z) by the enveloped height.
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    {
      vec3 tW = (modelMatrix * vec4(position, 1.0)).xyz;
      float tR = length(position.xy);
      float tEnv = smoothstep(uTFlatR, uTFlatR + uTFalloff, tR);
      transformed.z += tHeight(tW.xz) * tEnv;
    }`,
  );

  // World-space position varying (now includes the displacement on Y).
  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
    #ifdef USE_INSTANCING
      vGroundWorldPos = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    #else
      vGroundWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #endif`,
  );

  // ════════════════════════ FRAGMENT ════════════════════════
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>\n${TERRAIN_FRAG_COMMON}`,
  );

  // ── Albedo: macro patches, cavity AO, micro grit, slope rock, wet/crack ──
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    // Shared with the normal / emissive / lighting chunks downstream. Declared
    // at main() scope (the per-chunk locals stay inside their own { } blocks).
    float gNear = 1.0 - smoothstep(45.0, 150.0, length(vViewPosition));
    float gMicro = 0.0;   // antialiased micro-detail visibility (set below)
    float gWet = 0.0;
    float gCrackMask = 0.0;
    {
      vec2 gWP = vGroundWorldPos.xz;

      // ── ANALYTIC ANTIALIASING ──────────────────────────────────────────
      // The screen-space texel footprint (world units covered by one pixel).
      // When a procedural feature gets smaller than a texel it aliases into
      // the harsh shimmering "static" look. We fade ALL high-frequency detail
      // (grit + normal relief + ripples) toward 0 as the footprint approaches
      // the feature size — the standard fwidth() LOD technique. This also
      // kills shimmer at grazing angles where pure distance fade fails.
      vec2 gFw = fwidth(gWP);
      float gTexel = max(gFw.x, gFw.y);
      float gDetailAA = 1.0 - smoothstep(0.45, 2.2, gTexel * uTDetailScale);
      gMicro = gNear * gDetailAA;

      // Macro tonal variation — broad, soft warm/cool earth patches. Pulled
      // 45% toward neutral so the ground reads natural, not technicolor.
      float gMacro = gFbm(gWP * (uPatchScale * 0.5) + 11.3);
      vec3 gMacroTint = mix(uTMacroA, uTMacroB, smoothstep(0.35, 0.7, gMacro));
      diffuseColor.rgb *= mix(vec3(1.0), gMacroTint, 0.55);

      // Meso weathering patches — softened.
      float gPatch = gFbm(gWP * uPatchScale + 4.0);
      diffuseColor.rgb *= 1.0 + (gPatch - 0.5) * uPatchStrength * 0.7;

      // Cavity ambient occlusion — gently darken creases for grounded depth.
      // Kept conservative (floor 0.88) so already-dark biomes don't muddy.
      float gCav = gFbm(gWP * (uTDetailScale * 0.45) + 31.0);
      diffuseColor.rgb *= 0.88 + 0.12 * smoothstep(0.2, 0.8, gCav);

      // Micro grit — fine grain, antialiased so it never shimmers.
      float gGrit = gNoise(gWP * uTDetailScale * 2.4);
      diffuseColor.rgb += (gGrit - 0.5) * 0.035 * gMicro * uTDetailCol;

      // Slope → talus rock. Steep terrain (far hills/dunes) reveals bare rock.
      float gSlope = clamp(vTerrainSlope * 2.4, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, uTRock, gSlope * 0.6);

      // Wet pooling — low-lying puddle patches darken & desaturate the soil.
      // uTWetness is the map's static base (swamp); uRainWet is the LIVE rain
      // soak from the weather system. As the rain soaks in, the puddle
      // threshold widens so pools visibly GROW outward from the low spots,
      // then slowly recede as the ground dries. The mask is the precision-
      // stable puddleField (NOT fbm) so the JS twin in this module places
      // splash VFX exactly where the pixels show water; an fbm modulation on
      // top keeps the depth reading organic without moving the shoreline.
      float wetAmt = max(uTWetness, uRainWet);
      if (wetAmt > 0.001) {
        float pudNoise = puddleField(gWP);
        float pud = smoothstep(0.56 - uRainWet * 0.15, 0.8 - uRainWet * 0.18, pudNoise);
        pud *= 0.72 + 0.28 * gFbm(gWP * 0.6 + 7.0);
        gWet = pud * wetAmt;
        // Deep-water read: darker base with a subtle cool shift so pools
        // look like water over soil, not just stained ground.
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.30, 0.34, 0.40), gWet);
        // Rain also soak-darkens the ground BETWEEN the puddles.
        diffuseColor.rgb *= 1.0 - uRainWet * 0.16 * (1.0 - pud);
      }

      // Lava crack veins — thin emissive seams between cooled plates.
      if (uTCrackGlow > 0.001) {
        float cv = gFbm(gWP * 0.13 + 5.0);
        gCrackMask = smoothstep(0.47, 0.5, cv) * (1.0 - smoothstep(0.5, 0.53, cv));
        diffuseColor.rgb += uTCrackCol * gCrackMask * uTCrackGlow * 0.5;
      }
    }`,
  );

  // ── Normal: procedural micro-relief + directional ripples ────────────────
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
    {
      vec2 gWP = vGroundWorldPos.xz;
      // Lower-frequency, gentler relief — antialiased by gMicro so it fades
      // out before it can sparkle. This is the main fix for the harsh
      // "crumpled-foil" ground: the perturbation is now soft and resolves
      // to a flat surface in the mid/far field instead of speckling.
      vec2 gGrad = gFbmGradient(gWP * (0.32 * uTDetailScale), 0.9);
      vec3 gPerturb = vec3(-gGrad.x, 0.0, -gGrad.y) * uNormalStrength * gMicro;

      // Ripples / drifts — a band-limited sinusoid along a fixed direction.
      if (uTRippleStr > 0.001) {
        float rp = dot(gWP, uTRippleDir) * uTRippleScale;
        // Secondary cross-ripple breaks up the regularity of pure dunes.
        float rp2 = dot(gWP, vec2(-uTRippleDir.y, uTRippleDir.x)) * uTRippleScale * 0.37;
        vec3 rdir = vec3(uTRippleDir.x, 0.0, uTRippleDir.y);
        gPerturb += rdir * (cos(rp) + 0.3 * cos(rp2)) * uTRippleScale * uTRippleStr * gMicro;
      }
      normal = normalize(normal + gPerturb);
    }`,
  );

  // ── Emissive: lava crack glow ────────────────────────────────────────────
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
    totalEmissiveRadiance += uTCrackCol * gCrackMask * uTCrackGlow;`,
  );

  // ── Lighting: sharp directional sun + crisp specular + wet/sparkle ───────
  // (Carried over from the original ground shader, extended with the terrain
  // wet-sheen and sparkle contributions.)
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_end>',
    `#include <lights_fragment_end>
    {
      vec3 sunDir = normalize(uSunDirection);
      float sunDot = max(dot(normal, sunDir), 0.0);
      float baseLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float lumaDamp = clamp(1.0 - baseLuma * 1.2, 0.20, 1.0);

      float incident = pow(sunDot, 3.0);
      float patchMod = 0.6 + gFbm(vGroundWorldPos.xz * 0.10) * 0.8;
      reflectedLight.directDiffuse +=
        uSunColor * incident * uIncidentBoost * patchMod * lumaDamp;

      vec3 viewDir = normalize(vViewPosition);
      vec3 halfVec = normalize(sunDir + viewDir);
      float specPower = pow(max(dot(normal, halfVec), 0.0), 48.0);
      float specPatch = 0.55 + gFbm(vGroundWorldPos.xz * 0.22) * 0.9;
      reflectedLight.directSpecular +=
        uSunColor * specPower * uSpecularStrength * specPatch * sunDot * lumaDamp;

      // Wet sheen — puddles throw a tight, bright sun reflection.
      if (gWet > 0.001) {
        float wetSpec = pow(max(dot(normal, halfVec), 0.0), 160.0);
        reflectedLight.directSpecular += uSunColor * wetSpec * gWet * 1.6 * sunDot;
      }

      // ── PUDDLE MIRROR REFLECTIONS — the "RTX puddle" moment ──────────
      // Each puddle is shaded as a thin sheet of water: a near-mirror
      // world-up normal perturbed by LIVE rain-impact RINGS + travelling
      // micro-waves, a fresnel-weighted sample of the scene's PMREM
      // environment (the same prefiltered IBL the PBR pipeline already
      // uses — one extra texture fetch, not a render pass), a weather tint
      // so storm skies mirror dark, and a razor-thin sun glint streak. The
      // bloom pass then catches the bright bounce. While rain falls the
      // surface dances with expanding impact rings; once it stops the pools
      // settle into still mirrors and slowly dry out. Guarded so a missing
      // environment map (failed HDRI load) simply skips the reflection
      // instead of breaking the shader.
      #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
      if (gWet > 0.003) {
        vec2 rWP = vGroundWorldPos.xz;
        // Travelling micro-waves — wind shiver across the pool surface.
        float rT = uTime * 6.0;
        float rw1 = sin(rWP.x * 9.1 + rT) * sin(rWP.y * 8.3 - rT * 0.9);
        float rw2 = sin((rWP.x + rWP.y) * 13.7 - rT * 1.4);
        float rAmp = 0.05 * uRainRipple * gMicro;
        vec2 ripGrad = vec2(
          (rw1 * 0.7 + rw2 * 0.3) * rAmp,
          (rw1 * 0.3 - rw2 * 0.7) * rAmp
        );

        // RAIN-IMPACT RINGS — hashed cells each spawn an expanding,
        // fading circular wavefront (the classic water-surface drop
        // animation), perturbing the mirror normal so every reflection
        // wobbles outward from each hit. Layer 2 (offset + finer) fills
        // the gaps on high/ultra presets; both layers fade with distance
        // (gMicro) so far puddles stay calm, alias-free mirrors.
        if (uRainRipple > 0.02 && uPuddleDetail > 0.05) {
          float ringAA = uRainRipple * gMicro;
          {
            vec2 rp = rWP * 0.85;
            vec2 cell = floor(rp);
            vec2 f = fract(rp) - 0.5;
            float h = gHash(cell);
            vec2 jit = vec2(gHash(cell + 1.7), gHash(cell + 3.1)) - 0.5;
            vec2 toC = f - jit * 0.5;
            float d = length(toC);
            float lt = fract(uTime * 0.9 + h);
            float ring = smoothstep(0.085, 0.0, abs(d - lt * 0.46)) * (1.0 - lt) * (1.0 - lt);
            ripGrad += (toC / (d + 0.04)) * ring * 0.16 * ringAA;
          }
          if (uPuddleDetail > 0.55) {
            vec2 rp = rWP * 1.45 + 13.7;
            vec2 cell = floor(rp);
            vec2 f = fract(rp) - 0.5;
            float h = gHash(cell + 5.3);
            vec2 jit = vec2(gHash(cell + 8.9), gHash(cell + 11.3)) - 0.5;
            vec2 toC = f - jit * 0.5;
            float d = length(toC);
            float lt = fract(uTime * 1.25 + h);
            float ring = smoothstep(0.075, 0.0, abs(d - lt * 0.42)) * (1.0 - lt) * (1.0 - lt);
            ripGrad += (toC / (d + 0.04)) * ring * 0.11 * ringAA;
          }
        }

        vec3 puddleN = normalize(vec3(ripGrad.x, 1.0, ripGrad.y));
        vec3 viewDirW = normalize(cameraPosition - vGroundWorldPos);
        vec3 refW = reflect(-viewDirW, puddleN);
        refW.y = max(refW.y, 0.04); // water reflects the world above it
        // Fresnel — grazing angles turn the pool into a true mirror.
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(viewDirW, puddleN), 0.0), 5.0);
        // Sharpest reflection in a full, still puddle; rain agitation and
        // partial dryness rough it up. v4 floor is glassier (0.03) for the
        // crisp "ray-traced" read on still water.
        float mirrorRough = 0.03 + (1.0 - gWet) * 0.18 + uRainRipple * 0.06;
        vec3 reflCol = textureCubeUV(envMap, envMapRotation * refW, mirrorRough).rgb;
        // uEnvTint folds the live weather into the static HDRI bounce so a
        // storm-dark sky reflects storm-dark.
        reflectedLight.indirectSpecular +=
          reflCol * uEnvTint * envMapIntensity * gWet * (0.26 + 0.84 * fres);

        // Sun glint — a razor-thin specular streak across the water, the
        // detail that sells "real reflection" at a glance. Day only;
        // fresnel-weighted so it blazes at grazing angles.
        vec3 glintHalf = normalize(sunDir + viewDirW);
        float glint = pow(max(dot(puddleN, glintHalf), 0.0), 720.0);
        reflectedLight.directSpecular +=
          uSunColor * glint * gWet * fres * 3.2 * (1.0 - uIsNight);
      }
      #endif

      // Sparkle — sparse view-dependent glints on snow / sand. Gated by the
      // antialiased gMicro so the sharp glints never become shimmering noise.
      if (uTSparkle > 0.001) {
        float spk = gHash(floor(vGroundWorldPos.xz * 11.0));
        float twinkle = step(0.94, spk) * pow(max(dot(normal, halfVec), 0.0), 220.0);
        reflectedLight.directSpecular += uSunColor * twinkle * uTSparkle * gMicro * (1.0 - uIsNight);
      }

      // Subtle subsurface back-spill at grazing-toward-sun angles (day only).
      float backSpill = pow(max(dot(-sunDir, viewDir), 0.0), 8.0) * 0.14 * (1.0 - uIsNight) * lumaDamp;
      reflectedLight.indirectDiffuse += diffuseColor.rgb * backSpill;
    }`,
  );
}

// ── CPU twin of the GLSL puddle mask ────────────────────────────────────────
// The puddle pattern is a band-limited trig field (precision-stable, same
// value in float64 JS and float32 GLSL), so gameplay can ask "is there water
// at (x, z)?" and get an answer that agrees with the pixels. Used to place
// footstep / movement splash VFX on actual puddles.
// KEEP IN SYNC with the GLSL puddleField() in TERRAIN_FRAG_COMMON.

/** Raw puddle field value (~0..1, puddles pool where it's high). */
export function samplePuddleField(x: number, z: number, seed: number): number {
  const qx = x * 0.3;
  const qz = z * 0.3;
  let v = Math.sin(qx + seed) * Math.cos(qz * 0.93 + seed * 0.7);
  v += Math.sin(qx * 1.83 + qz * 0.67 + seed * 1.9) * 0.6;
  v += Math.cos(qx * 0.49 - qz * 1.27 + seed * 2.6) * 0.75;
  v += Math.sin((qx + qz) * 1.37 - seed * 1.2) * 0.45;
  return v * 0.178 + 0.5;
}

function smoothstepJS(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Puddle coverage 0..1 at a world position — mirrors the shader's `pud`
 * mask (same thresholds, same rain-growth widening). `rainWet` is the live
 * weather soak (uRainWet); `baseWetness` is the map's static terrain
 * wetness (swamp pools exist even in dry weather). Returns 0 when there is
 * no water at all.
 */
export function samplePuddleMask(
  x: number,
  z: number,
  seed: number,
  rainWet: number,
  baseWetness = 0,
): number {
  const wetAmt = Math.max(baseWetness, rainWet);
  if (wetAmt <= 0.001) return 0;
  const pud = smoothstepJS(0.56 - rainWet * 0.15, 0.8 - rainWet * 0.18, samplePuddleField(x, z, seed));
  return pud * wetAmt;
}
