import * as THREE from 'three';

// Custom vertex shader for animated grass/foliage
export const foliageVertexShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    vec3 pos = position;
    // Wind effect
    float wind = sin(time * 2.0 + position.x * 0.5 + position.z * 0.5) * 0.3;
    pos.x += wind * position.y * 0.1;
    pos.z += wind * position.y * 0.05;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const foliageFragmentShader = `
  uniform vec3 color;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 light = normalize(vec3(0.5, 1.0, 0.3));
    float dProd = max(0.0, dot(vNormal, light));

    vec3 finalColor = color * (0.5 + 0.5 * dProd);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Enhanced water/liquid shader
export const waterVertexShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vPosition = position;

    vec3 pos = position;
    // Wave motion
    pos.y += sin(time * 3.0 + position.x * 2.0) * 0.1;
    pos.y += cos(time * 2.0 + position.z * 2.0) * 0.1;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const waterFragmentShader = `
  uniform float time;
  uniform vec3 color;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vec2 uv = vUv * 10.0;
    float pattern = sin(uv.x + time) * cos(uv.y + time) * 0.5 + 0.5;

    vec3 finalColor = mix(color * 0.8, color, pattern);
    gl_FragColor = vec4(finalColor, 0.7);
  }
`;

// Rim lighting shader for enemies
export const rimLightVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const rimLightFragmentShader = `
  uniform vec3 color;
  uniform vec3 rimColor;
  uniform float rimPower;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    float rim = 1.0 - max(0.0, dot(normal, viewDir));
    rim = pow(rim, rimPower);

    vec3 finalColor = mix(color, rimColor, rim);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Holographic effect for power-ups
export const holographicVertexShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    vec3 pos = position;
    // Floating animation
    pos.y += sin(time * 2.0) * 0.2;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const holographicFragmentShader = `
  uniform float time;
  uniform vec3 color;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // Scan lines
    float scanline = sin(vPosition.y * 20.0 - time * 5.0) * 0.5 + 0.5;

    // Fresnel effect
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - dot(vNormal, viewDir), 3.0);

    vec3 finalColor = color * (0.5 + scanline * 0.5) + vec3(fresnel);
    float alpha = 0.7 + fresnel * 0.3;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// Create shader material helper
export function createCustomMaterial(
  type: 'foliage' | 'water' | 'rimLight' | 'holographic',
  color: THREE.Color,
  options?: {
    rimColor?: THREE.Color;
    rimPower?: number;
  }
): THREE.ShaderMaterial {
  const uniforms = {
    time: { value: 0 },
    color: { value: color }
  };

  let vertexShader = '';
  let fragmentShader = '';

  switch (type) {
    case 'foliage':
      vertexShader = foliageVertexShader;
      fragmentShader = foliageFragmentShader;
      break;
    case 'water':
      vertexShader = waterVertexShader;
      fragmentShader = waterFragmentShader;
      break;
    case 'rimLight':
      Object.assign(uniforms, {
        rimColor: { value: options?.rimColor || new THREE.Color(0xffffff) },
        rimPower: { value: options?.rimPower || 3.0 }
      });
      vertexShader = rimLightVertexShader;
      fragmentShader = rimLightFragmentShader;
      break;
    case 'holographic':
      vertexShader = holographicVertexShader;
      fragmentShader = holographicFragmentShader;
      break;
  }

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: type === 'water' || type === 'holographic',
    side: THREE.DoubleSide
  });
}

// Update shader time uniform
export function updateShaderTime(material: THREE.ShaderMaterial, deltaTime: number) {
  if (material.uniforms.time) {
    material.uniforms.time.value += deltaTime;
  }
}

// Advanced Volumetric Fog Shader
export const volumetricFogVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying float vDistance;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = viewMatrix * worldPosition;
    vViewPosition = mvPosition.xyz;
    vDistance = length(mvPosition.xyz);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const volumetricFogFragmentShader = `
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float fogHeight;
  uniform vec3 sunPosition;
  uniform vec3 sunColor;
  uniform float time;
  uniform vec3 baseColor;

  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying float vDistance;

  // 3D Noise function for volumetric effects
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    // Height-based fog density
    float heightFactor = max(0.0, (fogHeight - vWorldPosition.y) / fogHeight);

    // Animated 3D noise for volumetric fog
    vec3 noiseCoord = vWorldPosition * 0.02 + vec3(time * 0.05, time * 0.02, 0.0);
    float noise = snoise(noiseCoord) * 0.5 + 0.5;

    // Multiple octaves for detail
    float noise2 = snoise(noiseCoord * 2.0) * 0.25 + 0.5;
    float noise3 = snoise(noiseCoord * 4.0) * 0.125 + 0.5;
    float volumetricNoise = (noise + noise2 + noise3) / 1.875;

    // Distance-based fog
    float fogFactor = 1.0 - exp(-fogDensity * vDistance * vDistance);
    fogFactor = clamp(fogFactor * heightFactor * volumetricNoise, 0.0, 1.0);

    // Sun scattering in fog
    vec3 viewDir = normalize(vViewPosition);
    vec3 sunDir = normalize(sunPosition - vWorldPosition);
    float sunScatter = pow(max(dot(viewDir, sunDir), 0.0), 8.0);

    vec3 scatteredColor = mix(fogColor, sunColor, sunScatter * 0.5);
    vec3 finalColor = mix(baseColor, scatteredColor, fogFactor);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Chromatic Aberration Shader for post-processing
export const chromaticAberrationVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const chromaticAberrationFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform float amount;
  uniform vec2 direction;
  varying vec2 vUv;

  void main() {
    vec2 offset = direction * amount;
    vec4 cr = texture2D(tDiffuse, vUv + offset);
    vec4 cga = texture2D(tDiffuse, vUv);
    vec4 cb = texture2D(tDiffuse, vUv - offset);

    gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);
  }
`;

// Film Grain Shader
export const filmGrainFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform float amount;
  uniform float time;
  varying vec2 vUv;

  float random(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233)) + time) * 43758.5453);
  }

  void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    float grain = (random(vUv) - 0.5) * amount;
    gl_FragColor = vec4(color.rgb + grain, color.a);
  }
`;

// Rain Drop Shader
export const rainVertexShader = `
  uniform float time;
  varying vec2 vUv;
  varying float vIntensity;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Animate rain drops falling
    float fallSpeed = 20.0;
    pos.y = mod(pos.y - time * fallSpeed, 50.0);

    // Random variation
    float variation = sin(pos.x * 10.0 + time) * 0.5;
    pos.x += variation * 0.2;

    vIntensity = 0.5 + 0.5 * sin(time * 5.0 + pos.x);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 2.0;
  }
`;

export const rainFragmentShader = `
  varying vec2 vUv;
  varying float vIntensity;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    float alpha = (1.0 - dist * 2.0) * vIntensity * 0.6;
    gl_FragColor = vec4(0.8, 0.85, 0.9, alpha);
  }
`;

// God Rays Enhanced Shader
export const godRaysVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const godRaysFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform vec2 lightPosition;
  uniform float exposure;
  uniform float decay;
  uniform float density;
  uniform float weight;
  uniform int samples;
  varying vec2 vUv;

  void main() {
    vec2 texCoord = vUv;
    vec2 deltaTextCoord = texCoord - lightPosition;
    deltaTextCoord *= 1.0 / float(samples) * density;

    float illuminationDecay = 1.0;
    vec4 color = texture2D(tDiffuse, texCoord);

    for(int i = 0; i < 100; i++) {
      if(i >= samples) break;
      texCoord -= deltaTextCoord;
      vec4 sample = texture2D(tDiffuse, texCoord);
      sample *= illuminationDecay * weight;
      color += sample;
      illuminationDecay *= decay;
    }

    gl_FragColor = color * exposure;
  }
`;

// AAA-Quality Sky Dome Shader with realistic Rayleigh & Mie atmospheric scattering
export const skyDomeVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vViewDirection;
  varying float vSunfade;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;

  uniform vec3 sunPosition;
  uniform float rayleigh;
  uniform float turbidity;
  uniform float mieCoefficient;

  // Constants for atmospheric scattering
  const float e = 2.71828182845904523536;
  const float pi = 3.141592653589793238;
  const vec3 up = vec3(0.0, 1.0, 0.0);

  // Wavelength of used primaries (in nanometers)
  const vec3 lambda = vec3(680.0, 550.0, 450.0);

  // K coefficient for the primaries
  const vec3 K = vec3(0.686, 0.678, 0.666);
  const float v = 4.0;

  // Optical length at zenith for molecules
  const float rayleighZenithLength = 8.4e3;
  const float mieZenithLength = 1.25e3;

  // Sun intensity factor
  const float sunIntensityFactor = 1000.0;
  const float sunIntensityFalloffSteepness = 1.5;
  const float sunAngularDiameterCos = 0.999956676946448443;

  float sunIntensity(float zenithAngleCos) {
    zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
    return sunIntensityFactor * max(0.0, 1.0 - pow(e, -((1.5707963267948966 - acos(zenithAngleCos)) / sunIntensityFalloffSteepness)));
  }

  vec3 totalMie(float T) {
    float c = (0.2 * T) * 10e-18;
    return 0.434 * c * pi * pow((2.0 * pi) / lambda, vec3(v - 2.0)) * K;
  }

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vViewDirection = normalize(worldPosition.xyz - cameraPosition);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;

    vec3 sunDirection = normalize(sunPosition);
    vSunE = sunIntensity(dot(sunDirection, up));
    vSunfade = 1.0 - clamp(1.0 - exp((sunPosition.y / 450000.0)), 0.0, 1.0);

    float rayleighCoefficient = rayleigh - (1.0 * (1.0 - vSunfade));
    vBetaR = totalMie(2.0) * rayleighCoefficient;
    vBetaM = totalMie(turbidity) * mieCoefficient;
  }
`;

export const skyDomeFragmentShader = `
  uniform vec3 sunPosition;
  uniform float time;
  uniform bool isNight;
  uniform vec3 moonPosition;
  uniform float mieDirectionalG;
  uniform vec3 skyColorTop;
  uniform vec3 skyColorHorizon;

  varying vec3 vWorldPosition;
  varying vec3 vViewDirection;
  varying float vSunfade;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;

  // Constants
  const float pi = 3.141592653589793238;
  const float n = 1.0003; // refractive index of air
  const float N = 2.545e25; // molecules per unit volume
  const float rayleighZenithLength = 8.4e3;
  const float mieZenithLength = 1.25e3;
  const vec3 up = vec3(0.0, 1.0, 0.0);
  const float sunAngularDiameterCos = 0.999956676946448443;

  // Earth shadow constants
  const float cutoffAngle = 1.6110731556870734;
  const float steepness = 1.5;

  // Rayleigh phase function
  float rayleighPhase(float cosTheta) {
    return (3.0 / (16.0 * pi)) * (1.0 + pow(cosTheta, 2.0));
  }

  // Henyey-Greenstein phase function for Mie scattering
  float hgPhase(float cosTheta, float g) {
    float g2 = pow(g, 2.0);
    float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
    return (1.0 / (4.0 * pi)) * ((1.0 - g2) * inverse);
  }

  // ACESFilm tone mapping
  vec3 ACESFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  // Simple noise for stars
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

  void main() {
    vec3 direction = normalize(vWorldPosition);
    vec3 sunDirection = normalize(sunPosition);

    // Calculate zenith angle
    float zenithAngle = acos(max(0.0, dot(up, direction)));
    float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
    float sR = rayleighZenithLength * inverse;
    float sM = mieZenithLength * inverse;

    // Extinction factor
    vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));

    // In-scattering
    float cosTheta = dot(direction, sunDirection);

    float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
    vec3 betaRTheta = vBetaR * rPhase;

    float mPhase = hgPhase(cosTheta, mieDirectionalG);
    vec3 betaMTheta = vBetaM * mPhase;

    // Combined sky color with proper scattering
    vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
    Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(0.5)), clamp(pow(1.0 - dot(up, sunDirection), 5.0), 0.0, 1.0));

    // Night sky adjustments
    float nightFactor = smoothstep(0.0, -0.2, sunDirection.y);
    vec3 nightSky = skyColorTop * 0.1;

    // Stars
    vec3 stars = vec3(0.0);
    if (nightFactor > 0.0) {
      vec2 starCoord = direction.xz / (direction.y + 0.1) * 500.0;
      float starNoise = hash(floor(starCoord));
      float twinkle = sin(time * 2.0 + starNoise * 100.0) * 0.5 + 0.5;

      if (starNoise > 0.985 && direction.y > 0.1) {
        float starBrightness = (starNoise - 0.985) * 66.6;
        starBrightness *= twinkle * 0.5 + 0.5;
        stars = vec3(starBrightness) * nightFactor;
      }

      // Add colored stars
      if (starNoise > 0.99) {
        float colorVar = fract(starNoise * 123.456);
        if (colorVar < 0.33) stars *= vec3(1.0, 0.8, 0.7); // Warm
        else if (colorVar < 0.66) stars *= vec3(0.8, 0.9, 1.0); // Cool
      }
    }

    // Sun disk
    float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
    vec3 L0 = vec3(0.1) * Fex;
    L0 += vSunE * 19000.0 * Fex * sundisk;

    // Moon for night
    vec3 moonDir = normalize(moonPosition);
    float moonDisk = smoothstep(0.9995, 0.9999, dot(direction, moonDir));
    vec3 moonColor = vec3(0.9, 0.92, 1.0) * moonDisk * nightFactor * 15.0;

    // Final composition
    vec3 color = (Lin + L0) * 0.04;
    color += nightSky * nightFactor;
    color += stars;
    color += moonColor;

    // Horizon glow during sunset/sunrise
    float horizonGlow = pow(1.0 - abs(direction.y), 4.0);
    vec3 sunsetColor = vec3(1.0, 0.4, 0.1) * horizonGlow * max(0.0, 1.0 - abs(sunDirection.y)) * 0.5;
    color += sunsetColor;

    // Tone mapping and gamma correction
    color = ACESFilm(color);
    color = pow(color, vec3(1.0 / 2.2)); // Gamma correction

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Enhanced Water Shader with reflections
export const enhancedWaterVertexShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vPosition = position;

    vec3 pos = position;

    // Multiple wave layers for realism
    float wave1 = sin(pos.x * 0.5 + time) * 0.5;
    float wave2 = sin(pos.z * 0.3 + time * 0.7) * 0.3;
    float wave3 = sin((pos.x + pos.z) * 0.2 + time * 1.5) * 0.2;

    pos.y += wave1 + wave2 + wave3;

    // Calculate normal for lighting
    vec3 tangent1 = vec3(1.0, cos(pos.x * 0.5 + time) * 0.25, 0.0);
    vec3 tangent2 = vec3(0.0, cos(pos.z * 0.3 + time * 0.7) * 0.15, 1.0);
    vNormal = normalize(cross(tangent1, tangent2));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const enhancedWaterFragmentShader = `
  uniform float time;
  uniform vec3 waterColor;
  uniform vec3 sunPosition;
  uniform vec3 cameraPosition;

  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;

  void main() {
    // Animated water texture
    vec2 uv1 = vUv * 10.0 + vec2(time * 0.1, time * 0.05);
    vec2 uv2 = vUv * 15.0 - vec2(time * 0.08, time * 0.12);

    float pattern1 = sin(uv1.x) * cos(uv1.y);
    float pattern2 = sin(uv2.x + time) * cos(uv2.y - time);
    float pattern = (pattern1 + pattern2) * 0.5;

    // Fresnel effect for reflections
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);

    // Specular highlight
    vec3 sunDir = normalize(sunPosition - vPosition);
    vec3 reflectDir = reflect(-sunDir, vNormal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);

    // Combine colors
    vec3 baseColor = waterColor * (0.7 + pattern * 0.3);
    vec3 reflectionColor = vec3(0.8, 0.9, 1.0);
    vec3 finalColor = mix(baseColor, reflectionColor, fresnel * 0.6);
    finalColor += vec3(1.0) * spec * 0.8;

    gl_FragColor = vec4(finalColor, 0.8);
  }
`;

// Create helper functions for new materials
export function createVolumetricFogMaterial(
  fogColor: THREE.Color,
  sunPosition: THREE.Vector3,
  sunColor: THREE.Color
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      fogColor: { value: fogColor },
      fogDensity: { value: 0.003 },
      fogHeight: { value: 50.0 },
      sunPosition: { value: sunPosition },
      sunColor: { value: sunColor },
      time: { value: 0 },
      baseColor: { value: new THREE.Color(0xffffff) }
    },
    vertexShader: volumetricFogVertexShader,
    fragmentShader: volumetricFogFragmentShader,
    transparent: true,
    side: THREE.DoubleSide
  });
}

export function createSkyDomeMaterial(
  skyColorTop: THREE.Color,
  skyColorHorizon: THREE.Color,
  sunPosition: THREE.Vector3,
  isNight: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunPosition: { value: sunPosition },
      skyColorTop: { value: skyColorTop },
      skyColorHorizon: { value: skyColorHorizon },
      time: { value: 0 },
      isNight: { value: isNight },
      moonPosition: { value: new THREE.Vector3(-80, 120, 100) },
      // Atmospheric scattering parameters
      rayleigh: { value: 2.0 },
      turbidity: { value: 2.0 },
      mieCoefficient: { value: 0.005 },
      mieDirectionalG: { value: 0.8 }
    },
    vertexShader: skyDomeVertexShader,
    fragmentShader: skyDomeFragmentShader,
    side: THREE.BackSide,
    depthWrite: false
  });
}

export function createEnhancedWaterMaterial(
  waterColor: THREE.Color,
  sunPosition: THREE.Vector3
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      waterColor: { value: waterColor },
      sunPosition: { value: sunPosition },
      cameraPosition: { value: new THREE.Vector3() }
    },
    vertexShader: enhancedWaterVertexShader,
    fragmentShader: enhancedWaterFragmentShader,
    transparent: true,
    side: THREE.DoubleSide
  });
}

// ====== AAA PBR (Physically Based Rendering) Shaders ======

// PBR Ground/Terrain Shader with realistic lighting
export const pbrTerrainVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying mat3 vTBN;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;

    // TBN matrix for normal mapping
    vec3 T = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
    vec3 B = normalize(cross(vNormal, T));
    vTBN = mat3(T, B, vNormal);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const pbrTerrainFragmentShader = `
  uniform vec3 baseColor;
  uniform vec3 sunPosition;
  uniform vec3 sunColor;
  uniform float sunIntensity;
  uniform float roughness;
  uniform float metallic;
  uniform float ambientIntensity;
  uniform float time;
  uniform bool isNight;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying mat3 vTBN;

  const float PI = 3.14159265359;

  // Fresnel-Schlick approximation
  vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  }

  // GGX/Trowbridge-Reitz normal distribution
  float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;

    float num = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return num / denom;
  }

  // Geometry function (Schlick-GGX)
  float geometrySchlickGGX(float NdotV, float roughness) {
    float r = (roughness + 1.0);
    float k = (r * r) / 8.0;
    float num = NdotV;
    float denom = NdotV * (1.0 - k) + k;
    return num / denom;
  }

  // Smith's method for geometry
  float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2 = geometrySchlickGGX(NdotV, roughness);
    float ggx1 = geometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
  }

  // Procedural noise for terrain detail
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
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += noise(p) * amp;
      p *= 2.0;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);
    vec3 L = normalize(sunPosition - vWorldPosition);
    vec3 H = normalize(V + L);

    // Generate procedural detail
    float terrainDetail = fbm(vUv * 50.0);
    vec3 albedo = baseColor * (0.8 + terrainDetail * 0.4);

    // Adjust roughness based on terrain
    float adjustedRoughness = roughness + terrainDetail * 0.2;
    adjustedRoughness = clamp(adjustedRoughness, 0.1, 1.0);

    // Calculate F0 (base reflectivity)
    vec3 F0 = vec3(0.04);
    F0 = mix(F0, albedo, metallic);

    // Cook-Torrance BRDF
    float NDF = distributionGGX(N, H, adjustedRoughness);
    float G = geometrySmith(N, V, L, adjustedRoughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    kD *= 1.0 - metallic;

    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;

    // Calculate lighting
    float NdotL = max(dot(N, L), 0.0);
    float dayFactor = isNight ? 0.15 : 1.0;
    vec3 radiance = sunColor * sunIntensity * dayFactor;

    vec3 Lo = (kD * albedo / PI + specular) * radiance * NdotL;

    // Ambient lighting with hemisphere
    vec3 skyColor = isNight ? vec3(0.02, 0.03, 0.05) : vec3(0.4, 0.5, 0.6);
    vec3 groundColor = vec3(0.1, 0.08, 0.05);
    vec3 ambient = mix(groundColor, skyColor, N.y * 0.5 + 0.5) * albedo * ambientIntensity;

    // Add subtle AO from terrain height
    float ao = 0.8 + terrainDetail * 0.2;
    ambient *= ao;

    vec3 color = ambient + Lo;

    // Fog for distance
    float fogDistance = length(vViewPosition);
    float fogFactor = 1.0 - exp(-fogDistance * 0.01);
    vec3 fogColor = isNight ? vec3(0.02, 0.03, 0.05) : vec3(0.7, 0.8, 0.9);
    color = mix(color, fogColor, fogFactor * 0.5);

    // Tone mapping (ACES)
    color = color / (color + vec3(1.0));
    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Advanced Tree/Foliage PBR Shader with SSS (Subsurface Scattering)
export const pbrFoliageVertexShader = `
  uniform float time;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    vec3 pos = position;

    // Wind animation with multiple frequencies
    float windStrength = 0.3;
    float windFreq1 = sin(time * 1.5 + position.x * 0.5 + position.z * 0.3);
    float windFreq2 = sin(time * 2.3 + position.x * 0.3 + position.z * 0.7) * 0.5;
    float wind = (windFreq1 + windFreq2) * windStrength;

    // Apply wind based on height (higher = more movement)
    float heightFactor = smoothstep(0.0, 2.0, position.y);
    pos.x += wind * heightFactor * 0.2;
    pos.z += wind * heightFactor * 0.1;

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const pbrFoliageFragmentShader = `
  uniform vec3 baseColor;
  uniform vec3 sunPosition;
  uniform vec3 sunColor;
  uniform float sunIntensity;
  uniform float time;
  uniform bool isNight;
  uniform float translucency;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  const float PI = 3.14159265359;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);
    vec3 L = normalize(sunPosition - vWorldPosition);

    // Basic diffuse lighting
    float NdotL = max(dot(N, L), 0.0);

    // Subsurface scattering simulation
    float backLight = max(dot(-N, L), 0.0);
    float sss = pow(backLight, 2.0) * translucency;

    // View-dependent SSS
    vec3 H = normalize(L + N * 0.5);
    float VdotH = pow(clamp(dot(V, -H), 0.0, 1.0), 4.0) * translucency;

    // Color variation based on position
    float colorVariation = sin(vWorldPosition.x * 0.5 + vWorldPosition.z * 0.3) * 0.1;
    vec3 albedo = baseColor * (1.0 + colorVariation);

    // SSS color (light passing through leaves)
    vec3 sssColor = vec3(0.5, 0.8, 0.3) * albedo;

    float dayFactor = isNight ? 0.2 : 1.0;
    vec3 radiance = sunColor * sunIntensity * dayFactor;

    // Combine lighting
    vec3 diffuse = albedo * radiance * NdotL;
    vec3 subsurface = sssColor * radiance * (sss + VdotH);

    // Ambient
    vec3 ambient = albedo * (isNight ? 0.1 : 0.3);

    vec3 color = ambient + diffuse + subsurface;

    // Tone mapping
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Bloom/Glow post-processing shader
export const bloomVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const bloomFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform float bloomStrength;
  uniform float bloomThreshold;
  uniform vec2 resolution;
  varying vec2 vUv;

  vec3 sampleBloom(vec2 uv, float offset) {
    vec3 color = vec3(0.0);
    vec2 texelSize = 1.0 / resolution;

    for (float x = -4.0; x <= 4.0; x += 1.0) {
      for (float y = -4.0; y <= 4.0; y += 1.0) {
        vec2 sampleUv = uv + vec2(x, y) * texelSize * offset;
        vec3 sample = texture2D(tDiffuse, sampleUv).rgb;

        // Extract bright areas
        float brightness = dot(sample, vec3(0.2126, 0.7152, 0.0722));
        if (brightness > bloomThreshold) {
          color += sample;
        }
      }
    }
    return color / 81.0;
  }

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;

    // Multi-scale bloom
    vec3 bloom = vec3(0.0);
    bloom += sampleBloom(vUv, 1.0) * 0.5;
    bloom += sampleBloom(vUv, 2.0) * 0.3;
    bloom += sampleBloom(vUv, 4.0) * 0.2;

    color += bloom * bloomStrength;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// SSAO (Screen-Space Ambient Occlusion) approximation
export const ssaoVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const ssaoFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform float aoStrength;
  uniform float aoRadius;
  varying vec2 vUv;

  const int SAMPLES = 16;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    float depth = texture2D(tDepth, vUv).r;

    if (depth >= 1.0) {
      gl_FragColor = color;
      return;
    }

    vec2 texelSize = 1.0 / resolution;
    float ao = 0.0;

    for (int i = 0; i < SAMPLES; i++) {
      float angle = float(i) * 6.28318 / float(SAMPLES);
      float radius = aoRadius * (1.0 + hash(vUv + float(i)) * 0.5);

      vec2 sampleUv = vUv + vec2(cos(angle), sin(angle)) * texelSize * radius;
      float sampleDepth = texture2D(tDepth, sampleUv).r;

      float rangeCheck = smoothstep(0.0, 1.0, aoRadius / abs(depth - sampleDepth));
      ao += (sampleDepth < depth ? 1.0 : 0.0) * rangeCheck;
    }

    ao = 1.0 - (ao / float(SAMPLES)) * aoStrength;

    gl_FragColor = vec4(color.rgb * ao, color.a);
  }
`;

// Create PBR terrain material
export function createPBRTerrainMaterial(
  baseColor: THREE.Color,
  sunPosition: THREE.Vector3,
  isNight: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: baseColor },
      sunPosition: { value: sunPosition },
      sunColor: { value: new THREE.Color(1.0, 0.95, 0.9) },
      sunIntensity: { value: 2.0 },
      roughness: { value: 0.8 },
      metallic: { value: 0.0 },
      ambientIntensity: { value: 0.4 },
      time: { value: 0 },
      isNight: { value: isNight }
    },
    vertexShader: pbrTerrainVertexShader,
    fragmentShader: pbrTerrainFragmentShader,
    side: THREE.FrontSide
  });
}

// Create PBR foliage material with SSS
export function createPBRFoliageMaterial(
  baseColor: THREE.Color,
  sunPosition: THREE.Vector3,
  isNight: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: baseColor },
      sunPosition: { value: sunPosition },
      sunColor: { value: new THREE.Color(1.0, 0.95, 0.9) },
      sunIntensity: { value: 2.0 },
      time: { value: 0 },
      isNight: { value: isNight },
      translucency: { value: 0.5 }
    },
    vertexShader: pbrFoliageVertexShader,
    fragmentShader: pbrFoliageFragmentShader,
    side: THREE.DoubleSide
  });
}

// Color grading/LUT shader for cinematic look
export const colorGradingVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const colorGradingFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform float contrast;
  uniform float saturation;
  uniform float brightness;
  uniform vec3 shadowTint;
  uniform vec3 highlightTint;
  uniform float vignetteStrength;
  uniform float vignetteRadius;
  varying vec2 vUv;

  vec3 adjustContrast(vec3 color, float c) {
    return (color - 0.5) * c + 0.5;
  }

  vec3 adjustSaturation(vec3 color, float s) {
    float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(grey), color, s);
  }

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;

    // Brightness
    color *= brightness;

    // Contrast
    color = adjustContrast(color, contrast);

    // Saturation
    color = adjustSaturation(color, saturation);

    // Split toning (shadows/highlights)
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(color * shadowTint, color * highlightTint, luminance);

    // Vignette
    vec2 uv = vUv * 2.0 - 1.0;
    float vignette = 1.0 - dot(uv, uv) * vignetteStrength;
    vignette = smoothstep(vignetteRadius, 1.0, vignette);
    color *= vignette;

    // Clamp to valid range
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Create color grading material for cinematic post-processing
export function createColorGradingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      contrast: { value: 1.1 },
      saturation: { value: 1.15 },
      brightness: { value: 1.0 },
      shadowTint: { value: new THREE.Color(0.9, 0.95, 1.0) },
      highlightTint: { value: new THREE.Color(1.0, 0.98, 0.95) },
      vignetteStrength: { value: 0.3 },
      vignetteRadius: { value: 0.5 }
    },
    vertexShader: colorGradingVertexShader,
    fragmentShader: colorGradingFragmentShader
  });
}
