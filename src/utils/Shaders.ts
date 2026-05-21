import * as THREE from 'three';

// Update shader time uniform
export function updateShaderTime(material: THREE.ShaderMaterial, deltaTime: number) {
  if (material.uniforms.time) {
    material.uniforms.time.value += deltaTime;
  }
}

// AAA-Quality Sky Dome Shader with realistic Rayleigh & Mie atmospheric scattering
export const skyDomeVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vSkyDirection;
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
    // Use the local sphere position as a direction so the sky is always
    // sampled radially from the dome's center, regardless of world translation.
    vSkyDirection = normalize(position);
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
  varying vec3 vSkyDirection;
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
    vec3 direction = normalize(vSkyDirection);
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
    depthWrite: false,
    depthTest: false,
    fog: false
  });
}
