import * as THREE from 'three';

// Update shader time uniform
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
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
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

  varying vec3 vDir;

  // --- value noise / fbm for clouds + stars -------------------------------
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
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

      // ── ATMOSPHERIC FORWARD SCATTERING ──
      // The half of the sky toward the sun — especially the horizon band —
      // glows warmer and brighter. A cheap single-scattering cue that makes
      // the dome feel like real atmosphere rather than a flat gradient.
      vec3 scatterWarm = vec3(1.0, 0.84, 0.62);
      float horizonBand = pow(1.0 - h, 1.7);
      sky += scatterWarm * sunAmount * horizonBand * 0.12;

      // Warm glow around the sun — feeds the bloom pass so the sun reads as a
      // radiant light source rather than a flat dot. TIGHTENED + DIMMED so the
      // sun no longer blows out the whole centre of the frame: the glow falls
      // off faster (higher powers) and at lower intensity, keeping the bright
      // region compact instead of a giant white wash.
      vec3 sunColor = vec3(1.0, 0.94, 0.80);
      float glow = pow(sunAmount, 14.0);
      float wideGlow = pow(sunAmount, 4.5);
      sky += sunColor * wideGlow * 0.022;
      sky += sunColor * glow * 0.26;

      // Compact HDR sun disk — bright enough to drive bloom + god rays
      // but the disc itself stays a small, readable light source.
      float disk = smoothstep(0.99930, 0.99965, sd);
      sky += sunColor * disk * 2.1;

      // Atmospheric horizon haze for depth — thicker band so the horizon
      // dissolves into atmosphere instead of ending at a hard edge.
      float haze = pow(1.0 - h, 2.4);
      sky += horizon * haze * 0.40;

      // ── VOLUMETRIC CLOUDS with sun-side self-lighting ──
      // Two fBm layers at different scales + opposing drift give parallax
      // depth; a second density sample offset toward the sun cheaply lights
      // the sun-facing billows and shadows the far side, so clouds read as
      // 3D volumes instead of flat cirrus sheets.
      float cloudMask = smoothstep(0.03, 0.42, dir.y);
      vec2 cuv = dir.xz / max(dir.y, 0.15) * 1.05 + vec2(time * 0.010, time * 0.004);
      float c1 = fbm(cuv);
      float c2 = fbm(cuv * 2.4 + vec2(-time * 0.008, time * 0.006));
      float density = c1 * 0.62 + c2 * 0.38;
      float clouds = smoothstep(0.5, 0.9, density) * cloudMask;
      vec2 towardSun = normalize(sunDir.xz - dir.xz + vec2(1e-4)) * 0.05;
      float densSun = fbm(cuv + towardSun) * 0.62 + fbm(cuv * 2.4 + towardSun) * 0.38;
      float lit = clamp((density - densSun) * 3.5 + 0.45, 0.0, 1.0);
      vec3 cloudCol = mix(vec3(0.55, 0.58, 0.66), vec3(1.0, 0.97, 0.90), lit);
      cloudCol = mix(cloudCol, sunColor, glow * 0.5);
      sky = mix(sky, cloudCol, clouds * 0.5);
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

      // Twinkling star field (sky only, above the horizon).
      vec2 suv = dir.xz / max(abs(dir.y) + 0.06, 0.06) * 64.0;
      float sv = hash(floor(suv));
      if (sv > 0.973 && dir.y > 0.03) {
        float twinkle = 0.55 + 0.45 * sin(time * 3.0 + sv * 120.0);
        // Star colour drifts between cool white and faint blue based on hash.
        vec3 starCol = mix(vec3(1.0, 1.0, 1.05), vec3(0.7, 0.85, 1.1), fract(sv * 41.0));
        sky += starCol * ((sv - 0.973) * 40.0 * twinkle) * (0.5 + 0.5 * h);
      }

      // Faint milky-way style band — slightly warm against the cool sky.
      float band = fbm(dir.xz * 2.6 + 12.0) * smoothstep(0.12, 0.7, dir.y);
      sky += mix(zenith, vec3(0.45, 0.35, 0.55), 0.4) * band * 0.10;

      // Aurora-style colour wash slow-drifting along the upper sky —
      // subtle but reads as "alive" rather than a static skybox.
      float aurora = fbm(vec2(dir.x * 1.8 + time * 0.05, dir.z * 1.8 - time * 0.03))
                   * smoothstep(0.3, 0.85, dir.y);
      sky += vec3(0.08, 0.22, 0.30) * aurora * 0.15;
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

export function createSkyDomeMaterial(
  skyColorTop: THREE.Color,
  skyColorHorizon: THREE.Color,
  sunPosition: THREE.Vector3,
  isNight: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunPosition: { value: sunPosition },
      moonPosition: { value: new THREE.Vector3(-80, 120, 100) },
      skyColorTop: { value: skyColorTop },
      skyColorHorizon: { value: skyColorHorizon },
      time: { value: 0 },
      isNight: { value: isNight }
    },
    vertexShader: skyDomeVertexShader,
    fragmentShader: skyDomeFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
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
    depthTest: false,
    blending: THREE.NormalBlending,
    fog: false
  });
}
