import * as THREE from 'three';
import { getNoiseTexture } from './NoiseTextures';

export function updateShaderTime(material: THREE.ShaderMaterial, deltaTime: number) {
  if (material.uniforms.time) {
    material.uniforms.time.value += deltaTime;
  }
}

/**
 * Sky Dome Shader
 *
 * A tuned, performant gradient sky with a glowing sun, drifting volumetric
 * cloud bands, atmospheric horizon haze, and a star field + moon at night.
 * It is driven entirely by the colour uniforms supplied by the day-night
 * cycle (skyColorTop / skyColorHorizon), so daytime renders a bright blue
 * sky and nighttime a deep starry one — no heavy atmospheric-scattering math.
 */
export const skyDomeVertexShader = `
  varying vec3 vDir;

  void main() {
    // The dome follows the camera, so the normalised local vertex position
    // is a stable view direction independent of world translation.
    vDir = normalize(position);
    vec4 clipPos = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    // ── FAR-PLANE PIN (skybox technique) ──
    // Force the dome to the far plane (z = w → NDC z = 1.0). The dome's world
    // radius (500u) EXCEEDS the camera far plane on the LOW (460u) and ULTRA-LOW
    // (360u) presets, and a perspective far plane clips by VIEW-SPACE DEPTH (a
    // flat plane), not radius — so the dome was being sliced exactly where it
    // crosses the view axis, revealing the flat scene.background as a coloured
    // disc that tracked the aim direction. Pinning the depth makes the dome
    // un-clippable at any far distance, so it renders identically on every
    // preset. depthTest/Write are off (see material), so the pinned z only needs
    // to stay inside the clip volume — it never affects occlusion.
    // A hair inside the far plane so a depth TEST against the cleared buffer
    // (1.0) always passes on empty pixels and always fails behind geometry.
    clipPos.z = clipPos.w * 0.999999;
    gl_Position = clipPos;
  }
`;

export const skyDomeFragmentShader = `
  precision highp float;

  uniform vec3 sunPosition;
  uniform vec3 moonPosition;
  uniform vec3 skyColorTop;
  uniform vec3 skyColorHorizon;
  uniform float time;
  uniform bool isNight;
  // 1.0 = full bloom-tuned sun (the tight glow + HDR disk read as a radiant sun
  // once the bloom pass spreads them). 0.0 = no post-processing (low tiers): the
  // tight glow + disk are dropped — without bloom they'd render as a hard pale
  // disc — and a softer wide glow takes over so the sky still feels sun-lit.
  uniform float sunGlowScale;
  // true on the LOW / ULTRA-LOW presets. The sky dome draws first and FULLSCREEN
  // every frame (renderOrder -1000), so its per-pixel cost is paid for the whole
  // viewport. lowDetail skips the heavy fbm layers (volumetric clouds by day;
  // the per-pixel star hash, milky-way band + drifting aurora by night) and keeps
  // only the cheap gradient + sun/moon glow — a real fragment-shader saving on
  // exactly the GPUs that need it, while the sky still reads as the same world.
  uniform bool lowDetail;
  // ── Weather + per-map sky (see WeatherSystem / MapSignatureFX) ──
  uniform float uCloudCover;   // 0 fair-weather wisps … 1 storm ceiling
  uniform float uCloudTime;    // cloud drift clock (runs faster in wind)
  uniform float uFlash;        // lightning flash 0..1+
  uniform vec3 uFlashDir;      // toward the strike
  uniform float uRainbow;      // post-rain bow strength
  uniform float uAurora;       // night aurora strength (tundra / vale)
  uniform vec3 uAuroraA;       // curtain base colour
  uniform vec3 uAuroraB;       // curtain crown colour
  uniform float uMeteors;      // 1 = shooting stars on clear nights
  uniform vec3 uHorizonGlow;   // distant fires / lava light on the horizon

  varying vec3 vDir;

  // --- hash for stars; fBm for clouds is BAKED -------------------------------
  // The dome runs fullscreen every frame and its clouds took four 3-octave
  // procedural fBm calls per pixel (~3 ms of an integrated GPU's frame). The
  // same value-noise fBm is now one fetch of the shared baked noise texture.
  uniform sampler2D uBakedNoise;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float fbm(vec2 p) {
    return texture2D(uBakedNoise, p * 0.125).a;
  }

  // Aurora: luminous curtains whose lower edge snakes along the azimuth,
  // striated by fine vertical rays and fading upward into the crown colour.
  vec3 auroraCurtains(vec3 dir) {
    if (dir.y < 0.04) return vec3(0.0);
    float az = atan(dir.z, dir.x);
    float n1 = fbm(vec2(az * 1.3 + time * 0.018, time * 0.011));
    float base = 0.2 + 0.16 * sin(az * 2.0 + time * 0.035 + n1 * 5.0);
    float h = dir.y - base;
    if (h < -0.06) return vec3(0.0);
    float rays = fbm(vec2(az * 22.0 + n1 * 4.0, time * 0.12));
    float curtain = smoothstep(-0.05, 0.015, h) * exp(-max(h, 0.0) * 4.2) * (0.25 + 0.75 * rays * rays);
    float sway = 0.6 + 0.4 * sin(az * 5.0 - time * 0.2 + n1 * 3.0);
    return mix(uAuroraA, uAuroraB, clamp(h * 3.5, 0.0, 1.0)) * curtain * sway;
  }

  // One meteor per ~7 s slot (most slots empty) — a short bright streak.
  vec3 meteor(vec3 dir) {
    float slot = floor(time / 7.0);
    float r0 = hash(vec2(slot, 3.7));
    if (r0 > 0.55) return vec3(0.0);
    float p = fract(time / 7.0) * 7.0 / 0.7;
    if (p > 1.0) return vec3(0.0);
    float a0 = hash(vec2(slot, 1.3)) * 6.2831;
    float e0 = 0.45 + hash(vec2(slot, 2.1)) * 0.35;
    vec3 start = normalize(vec3(cos(a0) * (1.0 - e0), e0, sin(a0) * (1.0 - e0)));
    vec3 travel = normalize(vec3(-sin(a0), -0.55, cos(a0)));
    vec3 head = normalize(start + travel * p * 0.35);
    vec3 tail = normalize(start + travel * max(0.0, p * 0.35 - 0.08));
    vec3 seg = head - tail;
    float t = clamp(dot(dir - tail, seg) / max(dot(seg, seg), 1e-6), 0.0, 1.0);
    float d = length(dir - (tail + seg * t));
    float fade = sin(3.14159 * p);
    return vec3(0.9, 0.95, 1.0) * exp(-d * d * 2.4e5) * t * fade * 1.6;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);

    vec3 sunDir = normalize(sunPosition);
    float sd = dot(dir, sunDir);

    vec3 sky;

    if (!isNight) {
      // ===== DAYTIME =====
      // Rich vertical gradient: pale haze at the horizon -> deep blue zenith.
      vec3 zenith = skyColorTop * 0.80;
      vec3 horizon = skyColorHorizon;
      sky = mix(horizon, zenith, pow(h, 0.42));

      float sunAmount = max(sd, 0.0);
      // 1 as the sun nears the horizon (golden hour), 0 from mid-afternoon on.
      float lowSun = 1.0 - smoothstep(0.02, 0.42, sunDir.y);

      // ── ATMOSPHERIC FORWARD SCATTERING ──
      // The half of the sky toward the sun — especially the horizon band —
      // glows warmer and brighter. A cheap single-scattering cue that makes
      // the dome feel like real atmosphere rather than a flat gradient.
      vec3 scatterWarm = vec3(1.0, 0.84, 0.62);
      float horizonBand = pow(1.0 - h, 1.7);
      sky += scatterWarm * sunAmount * horizonBand * 0.12;

      // ── GOLDEN HOUR ──
      // Long air paths strip the blue out of low sunlight, so the sky around
      // the setting sun burns amber→orange (a tight core + a broad band that
      // hugs the horizon) while the far side stays cool, with a faint rose
      // "Belt of Venus" low on the anti-solar sky.
      vec3 sunsetGlow = vec3(1.0, 0.52, 0.22);
      sky += sunsetGlow * (pow(sunAmount, 5.0) * 0.5 + pow(sunAmount, 1.6) * horizonBand * 0.32) * lowSun;
      float antiSun = max(-sd, 0.0);
      sky += vec3(0.62, 0.32, 0.42) * exp(-pow((h - 0.08) * 11.0, 2.0)) * antiSun * lowSun * 0.16;

      // Warm glow around the sun — feeds the bloom pass so the sun reads as a
      // radiant light source rather than a flat dot. TIGHTENED + DIMMED so the
      // sun no longer blows out the whole centre of the frame: the glow falls
      // off faster (higher powers) and at lower intensity, keeping the bright
      // region compact instead of a giant white wash.
      vec3 sunColor = mix(vec3(1.0, 0.94, 0.80), vec3(1.0, 0.72, 0.45), lowSun);
      float glow = pow(sunAmount, 14.0);
      float wideGlow = pow(sunAmount, 4.5);
      // Soft wide sun-side scatter. When sunGlowScale → 0 (no bloom) we lean on
      // a STRONGER soft glow (mix → 0.085) and drop the tight glow + HDR disk
      // below, so the sun reads as a gentle edge-free brightening instead of a
      // hard pale circle. With bloom (scale = 1) the original look is preserved.
      sky += sunColor * wideGlow * mix(0.085, 0.022, sunGlowScale);
      sky += sunColor * glow * 0.26 * sunGlowScale;

      // Compact HDR sun disk — bright enough to drive bloom + god rays
      // but the disc itself stays a small, readable light source. Dropped on the
      // bloom-less low tiers (it only looks right once the bloom pass blurs it).
      float disk = smoothstep(0.99930, 0.99965, sd);
      sky += sunColor * disk * 2.1 * sunGlowScale;

      // Atmospheric horizon haze for depth — thicker band so the horizon
      // dissolves into atmosphere instead of ending at a hard edge.
      float haze = pow(1.0 - h, 2.4);
      sky += horizon * haze * 0.40;

      // ── VOLUMETRIC CLOUDS with sun-side self-lighting ──
      // Two fBm layers at different scales + opposing drift give parallax
      // depth; a second density sample offset toward the sun cheaply lights
      // the sun-facing billows and shadows the far side, so clouds read as
      // 3D volumes instead of flat cirrus sheets. Four fbm calls per pixel —
      // the dome's single heaviest term — so it is dropped on the low tiers,
      // leaving a clean, sun-lit clear sky.
      if (!lowDetail) {
        float cloudMask = smoothstep(0.03, 0.42, dir.y);
        vec2 cuv = dir.xz / max(dir.y, 0.15) * 1.05 + vec2(uCloudTime * 0.010, uCloudTime * 0.004);
        float c1 = fbm(cuv);
        float c2 = fbm(cuv * 2.4 + vec2(-uCloudTime * 0.008, uCloudTime * 0.006));
        float density = c1 * 0.62 + c2 * 0.38;
        // Weather thickens the deck: the threshold drops until a storm
        // ceiling covers the whole sky, and the clouds darken + flatten.
        float cov = clamp(uCloudCover, 0.0, 1.0);
        float clouds = smoothstep(0.5 - cov * 0.46, 0.9 - cov * 0.42, density) * mix(cloudMask, 1.0, cov * 0.7);
        vec2 towardSun = normalize(sunDir.xz - dir.xz + vec2(1e-4)) * 0.05;
        float densSun = fbm(cuv + towardSun) * 0.62 + fbm(cuv * 2.4 + towardSun) * 0.38;
        float lit = clamp((density - densSun) * 3.5 + 0.45, 0.0, 1.0) * (1.0 - cov * 0.6);
        // Low sun: sun-facing billows glow orange, the shaded undersides
        // turn dusky violet. Storm decks go slate grey.
        vec3 cloudShade = mix(vec3(0.55, 0.58, 0.66), vec3(0.36, 0.33, 0.50), lowSun) * (1.0 - cov * 0.5);
        vec3 cloudLit = mix(vec3(1.0, 0.97, 0.90), vec3(1.0, 0.62, 0.40), lowSun) * (1.0 - cov * 0.4);
        vec3 cloudCol = mix(cloudShade, cloudLit, lit);
        cloudCol = mix(cloudCol, sunColor, glow * 0.5 * (1.0 - cov));
        sky = mix(sky, cloudCol, clouds * (0.5 + cov * 0.42));
        // Lightning lights the deck from inside, brightest toward the strike.
        if (uFlash > 0.001) {
          float toward = pow(max(dot(dir, uFlashDir), 0.0), 3.0);
          sky += vec3(0.78, 0.8, 1.0) * uFlash * (0.18 + clouds * 0.5 + toward * 1.4);
        }
      }

      // Rainbow: the primary bow at 42 degrees round the anti-solar point
      // (red outside) and a faint, reversed secondary at 51 degrees.
      if (uRainbow > 0.002 && dir.y > -0.02) {
        float ang = acos(clamp(dot(dir, -sunDir), -1.0, 1.0));
        float x1 = (ang - 0.733) / 0.036;
        float x2 = (ang - 0.89) / 0.05;
        vec3 bow = vec3(0.0);
        if (abs(x1) < 1.0) bow += clamp(vec3(x1 * 1.6 + 0.6, 1.0 - abs(x1 + 0.05) * 1.5, -x1 * 1.6 + 0.5), 0.0, 1.0) * (1.0 - x1 * x1);
        if (abs(x2) < 1.0) bow += clamp(vec3(-x2 * 1.6 + 0.6, 1.0 - abs(x2) * 1.5, x2 * 1.6 + 0.5), 0.0, 1.0) * (1.0 - x2 * x2) * 0.35;
        sky += bow * uRainbow * 0.2 * smoothstep(-0.02, 0.12, dir.y);
      }
    } else {
      // ===== NIGHT (NEON-NOIR TWIST) =====
      // A deep cobalt zenith fading through cyan-violet at the horizon —
      // Returnal / Control "after-dark" palette. The dome reads as a
      // chromatic gradient rather than a flat black sky, so even when the
      // moon isn't on screen there's a sense of distance and depth.
      vec3 zenith = skyColorTop * 0.6;
      vec3 horizon = skyColorHorizon;
      // Two-stop horizon → magenta belt → cool zenith for that filmic depth.
      vec3 magentaBelt = vec3(0.18, 0.06, 0.24);
      float belt = pow(1.0 - abs(h - 0.06), 18.0);
      sky = mix(horizon, zenith, pow(h, 0.55));
      sky += magentaBelt * belt * 0.45;

      // Moon glow + disk — cool blue with a faint outer corona ring.
      vec3 moonDir = normalize(moonPosition);
      float md = dot(dir, moonDir);
      vec3 moonColor = vec3(0.82, 0.90, 1.0);
      sky += moonColor * pow(max(md, 0.0), 18.0) * 0.5;          // tight halo
      sky += moonColor * pow(max(md, 0.0), 3.0) * 0.10;          // wider corona
      // Crisp moon disk.
      sky += moonColor * smoothstep(0.99905, 0.99965, md) * 2.6;

      // Per-pixel star hashing + two fbm washes (milky-way band, drifting
      // aurora) are the night dome's heavy terms — skipped on the low tiers,
      // which keep the cobalt gradient + magenta belt + moon for a clean,
      // still-atmospheric night sky.
      if (!lowDetail) {
        // Twinkling star field (sky only, above the horizon). Each hash cell
        // holds at most one star: a soft ROUND point jittered inside the cell
        // and sized from the cell's screen footprint, so stars stay crisp 1–2
        // pixel points instead of filling the whole cell as a hard square.
        vec2 suv = dir.xz / max(abs(dir.y) + 0.06, 0.06) * 64.0;
        vec2 starCell = floor(suv);
        // Footprint taken in uniform control flow (derivatives).
        float starPx = max(fwidth(suv.x), fwidth(suv.y));
        float sv = hash(starCell);
        if (sv > 0.973 && dir.y > 0.03) {
          vec2 starJitter = (vec2(hash(starCell + 1.7), hash(starCell + 3.1)) - 0.5) * 0.6;
          float starR = max(0.06, starPx * 1.1);
          float starCore = 1.0 - smoothstep(starR * 0.35, starR, length(fract(suv) - 0.5 - starJitter));
          float twinkle = 0.55 + 0.45 * sin(time * 3.0 + sv * 120.0);
          // Star colour drifts between cool white and faint blue based on hash.
          vec3 starCol = mix(vec3(1.0, 1.0, 1.05), vec3(0.7, 0.85, 1.1), fract(sv * 41.0));
          sky += starCol * ((sv - 0.973) * 60.0 * twinkle) * starCore * (0.5 + 0.5 * h) * (1.0 - clamp(uCloudCover, 0.0, 1.0) * 0.9);
        }

        // Faint milky-way style band — slightly warm against the cool sky.
        float band = fbm(dir.xz * 2.6 + 12.0) * smoothstep(0.12, 0.7, dir.y);
        sky += mix(zenith, vec3(0.45, 0.35, 0.55), 0.4) * band * 0.10;

        // Aurora-style colour wash slow-drifting along the upper sky —
        // subtle but reads as "alive" rather than a static skybox.
        float aurora = fbm(vec2(dir.x * 1.8 + time * 0.05, dir.z * 1.8 - time * 0.03))
                     * smoothstep(0.3, 0.85, dir.y);
        sky += vec3(0.08, 0.22, 0.30) * aurora * 0.15;

        // Real aurora curtains on the maps that have them (tundra, vale).
        if (uAurora > 0.001) sky += auroraCurtains(dir) * uAurora;
        // Shooting stars across a clear night.
        if (uMeteors > 0.5 && uCloudCover < 0.6) sky += meteor(dir) * (1.0 - uCloudCover);

        // Storm decks roll in at night too: moonlit rims, black undersides.
        if (uCloudCover > 0.2) {
          vec2 cuv = dir.xz / max(dir.y, 0.15) * 1.05 + vec2(uCloudTime * 0.010, uCloudTime * 0.004);
          float density = fbm(cuv) * 0.62 + fbm(cuv * 2.4) * 0.38;
          float cov = clamp(uCloudCover, 0.0, 1.0);
          float clouds = smoothstep(0.5 - cov * 0.46, 0.9 - cov * 0.42, density) * smoothstep(0.0, 0.35, dir.y + cov * 0.2);
          float rim = pow(max(md, 0.0), 6.0) * 0.5;
          vec3 nightCloud = mix(vec3(0.035, 0.04, 0.055), moonColor * 0.32, rim) * (1.0 - cov * 0.35);
          sky = mix(sky, nightCloud, clouds * (0.35 + cov * 0.55));
          if (uFlash > 0.001) {
            float toward = pow(max(dot(dir, uFlashDir), 0.0), 3.0);
            sky += vec3(0.7, 0.72, 1.0) * uFlash * (0.14 + clouds * 0.55 + toward * 1.5);
          }
        }
      }
    }

    // Distant fires / lava light hugging the horizon (per map).
    if (dot(uHorizonGlow, uHorizonGlow) > 1e-6) {
      float hz = exp(-max(dir.y + 0.02, 0.0) * 9.0) * (0.75 + 0.5 * fbm(vec2(atan(dir.z, dir.x) * 3.0, time * 0.02)));
      sky += uHorizonGlow * hz;
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

export function createSkyDomeMaterial(
  skyColorTop: THREE.Color,
  skyColorHorizon: THREE.Color,
  sunPosition: THREE.Vector3,
  isNight: boolean,
  sunGlowScale: number = 1.0,
  lowDetail: boolean = false
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunPosition: { value: sunPosition },
      moonPosition: { value: new THREE.Vector3(-80, 120, 100) },
      skyColorTop: { value: skyColorTop },
      skyColorHorizon: { value: skyColorHorizon },
      time: { value: 0 },
      isNight: { value: isNight },
      sunGlowScale: { value: sunGlowScale },
      lowDetail: { value: lowDetail },
      uBakedNoise: { value: getNoiseTexture() },
      uCloudCover: { value: 0.18 },
      uCloudTime: { value: 0 },
      uFlash: { value: 0 },
      uFlashDir: { value: new THREE.Vector3(0, 1, 0) },
      uRainbow: { value: 0 },
      uAurora: { value: 0 },
      uAuroraA: { value: new THREE.Color(0x2bff9a) },
      uAuroraB: { value: new THREE.Color(0x7a4dff) },
      uMeteors: { value: 0 },
      uHorizonGlow: { value: new THREE.Vector3(0, 0, 0) },
    },
    vertexShader: skyDomeVertexShader,
    fragmentShader: skyDomeFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    // Tested (not written): drawn after the opaque scene, so it only shades
    // pixels where nothing nearer was drawn — i.e. the visible sky.
    depthTest: true,
    fog: false
  });
}

export const atmosphericHazeVertexShader = `
  varying vec3 vDir;

  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

export const atmosphericHazeFragmentShader = `
  precision highp float;

  uniform vec3 hazeColor;
  uniform vec3 sunPosition;
  uniform float time;
  uniform float density;
  uniform bool isNight;

  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(41.17, 289.33))) * 15873.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + 7.1;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    vec3 sunDir = normalize(sunPosition);

    // Pure horizon haze for atmospheric depth — anything in the upper sky
    // is left untouched so the sun glow doesn't bleed into a washed-out
    // sheet. The old shader added a "lightCone shaft" term that overlapped
    // pmndrs god rays and was the dominant cause of the side-of-screen
    // white wash.
    float horizon = pow(1.0 - clamp(abs(dir.y), 0.0, 1.0), 2.6);
    float lowMist = smoothstep(0.22, -0.22, dir.y);
    float movingVapor = fbm(dir.xz * 3.6 + vec2(time * 0.022, -time * 0.012));

    float alpha = density;
    alpha *= horizon * 0.55 + lowMist * 0.22;
    alpha *= 0.85 + movingVapor * 0.3;
    alpha = clamp(alpha, 0.0, isNight ? 0.16 : 0.18);

    // Tint subtly warmer toward the sun, cool toward the night moon —
    // but NEVER add a luminance boost. This is volumetric particulate
    // matter, not a light source.
    float sunBias = max(dot(dir, sunDir), 0.0) * 0.25;
    vec3 shaftColor = mix(hazeColor, hazeColor * vec3(1.05, 1.0, 0.95), sunBias);
    if (isNight) {
      shaftColor = mix(hazeColor, hazeColor * vec3(0.92, 0.95, 1.05), sunBias);
    }

    gl_FragColor = vec4(shaftColor, alpha);
  }
`;

export function createAtmosphericHazeMaterial(
  hazeColor: THREE.Color,
  sunPosition: THREE.Vector3,
  density: number,
  isNight: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      hazeColor: { value: hazeColor },
      sunPosition: { value: sunPosition },
      time: { value: 0 },
      density: { value: density },
      isNight: { value: isNight }
    },
    vertexShader: atmosphericHazeVertexShader,
    fragmentShader: atmosphericHazeFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    // Depth-TESTED: the haze shell (r = 420 m) now veils only what lies beyond
    // it — the sky and far horizon. With the test off it was laid over the
    // whole frame after everything else, hazing a tree 5 m away exactly as
    // much as a ridge 400 m away (a big part of the old washed-out look);
    // near and mid-distance haze is the volumetric medium's job.
    depthTest: true,
    blending: THREE.NormalBlending,
    fog: false
  });
}
