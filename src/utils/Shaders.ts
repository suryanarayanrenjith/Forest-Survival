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
      vec3 zenith = skyColorTop * 0.82;
      vec3 horizon = skyColorHorizon;
      sky = mix(horizon, zenith, pow(h, 0.45));

      // Warm, volumetric glow around the sun — feeds the bloom pass so the
      // sun reads as a radiant, hazy light source rather than a flat dot.
      vec3 sunColor = vec3(1.0, 0.95, 0.82);
      float glow = pow(max(sd, 0.0), 6.0);
      float wideGlow = pow(max(sd, 0.0), 1.6);
      float hugeGlow = pow(max(sd, 0.0), 0.7);
      sky += sunColor * hugeGlow * 0.10;
      sky += sunColor * wideGlow * 0.30;
      sky += sunColor * glow * 1.25;

      // Crisp, hot sun disk — blooms strongly.
      float disk = smoothstep(0.9986, 0.9994, sd);
      sky += sunColor * disk * 9.0;

      // Atmospheric horizon haze for depth — thicker band so the horizon
      // dissolves into atmosphere instead of ending at a hard edge.
      float haze = pow(1.0 - h, 2.4);
      sky += horizon * haze * 0.55;

      // Drifting volumetric cloud bands.
      float cloudMask = smoothstep(0.04, 0.45, dir.y);
      vec2 cuv = dir.xz / max(dir.y, 0.16) * 1.15 + vec2(time * 0.011, time * 0.005);
      float clouds = smoothstep(0.52, 0.95, fbm(cuv)) * cloudMask;
      vec3 cloudCol = mix(vec3(1.05, 1.04, 1.02), sunColor, glow * 0.6);
      sky = mix(sky, cloudCol, clouds * 0.6);
    } else {
      // ===== NIGHT =====
      vec3 zenith = skyColorTop;
      vec3 horizon = skyColorHorizon;
      sky = mix(horizon, zenith, pow(h, 0.6));

      // Moon glow + disk.
      vec3 moonDir = normalize(moonPosition);
      float md = dot(dir, moonDir);
      vec3 moonColor = vec3(0.86, 0.90, 1.0);
      sky += moonColor * pow(max(md, 0.0), 8.0) * 0.28;
      sky += moonColor * smoothstep(0.9989, 0.9996, md) * 3.5;

      // Twinkling star field (sky only, above the horizon).
      vec2 suv = dir.xz / max(abs(dir.y) + 0.06, 0.06) * 64.0;
      float sv = hash(floor(suv));
      if (sv > 0.974 && dir.y > 0.03) {
        float twinkle = 0.55 + 0.45 * sin(time * 3.0 + sv * 120.0);
        sky += vec3((sv - 0.974) * 40.0 * twinkle) * (0.5 + 0.5 * h);
      }

      // Faint milky-way style band.
      float band = fbm(dir.xz * 2.6 + 12.0) * smoothstep(0.12, 0.7, dir.y);
      sky += zenith * band * 0.10;
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
