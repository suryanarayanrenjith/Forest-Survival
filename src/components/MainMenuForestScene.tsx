import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';

type PulsingLight = THREE.PointLight & {
  baseIntensity: number;
  phase: number;
  speed: number;
};

type PulsingRay = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> & {
  baseOpacity: number;
  phase: number;
  speed: number;
};

type LeafDrift = {
  fallSpeed: number;
  swaySpeed: number;
  swayAmount: number;
  phase: number;
};

type SceneVariant = 'main' | 'classic' | 'tutorial';

type MainMenuForestSceneProps = {
  variant?: SceneVariant;
  onReady?: () => void;
};

type ForestSceneTheme = {
  fogColor: number;
  clearColor: number;
  skyDeepColor: number;
  skyMidColor: number;
  skyTopColor: number;
  nebulaColor: number;
  starColor: number;
  brightStarColor: number;
  ambientColor: number;
  ambientIntensity: number;
  moonLightColor: number;
  moonLightIntensity: number;
  fillLightColor: number;
  fillLightIntensity: number;
  backLightColor: number;
  hemisphereSkyColor: number;
  hemisphereGroundColor: number;
  hemisphereIntensity: number;
  cameraFillColor: number;
  cameraFillIntensity: number;
  clearLightColor: number;
  clearLightIntensity: number;
  glowColors: number[];
  groundColor: number;
  groundGlowColor: number;
  puddleColor: number;
  moonColor: number;
  haloColors: [number, number];
  fireflyColor: number;
  dustColor: number;
  leafColor: number;
  rayColor: number;
  glowVeilColor: number;
  shardColor: number;
  shardEmissive: number;
  mistColor: number;
  mushroomGlowColor: number;
  mushroomCapColor: number;
  mushroomCapEmissive: number;
  mushroomStemColor: number;
};

// Overhauled "enchanted bioluminescent forest under a teal aurora" palette —
// deeper, jewel-toned midnight blues against luminous emerald-cyan glow, for a
// far more cinematic, breathtaking menu vista than the flatter original.
const MAIN_FOREST_SCENE_THEME: ForestSceneTheme = {
  fogColor: 0x05140d,
  clearColor: 0x01070a,
  skyDeepColor: 0x02050d,
  skyMidColor: 0x04110f,
  skyTopColor: 0x010309,
  nebulaColor: 0x0a4038,
  starColor: 0xd2e6ff,
  brightStarColor: 0xc2e8ff,
  ambientColor: 0x2c5046,
  ambientIntensity: 0.6,
  moonLightColor: 0x8aa2e6,
  moonLightIntensity: 4.0,
  fillLightColor: 0x2fb091,
  fillLightIntensity: 1.7,
  backLightColor: 0x1f8a86,
  hemisphereSkyColor: 0x386c66,
  hemisphereGroundColor: 0x10281c,
  hemisphereIntensity: 0.62,
  cameraFillColor: 0x37a884,
  cameraFillIntensity: 2.4,
  clearLightColor: 0x36caa0,
  clearLightIntensity: 2.7,
  glowColors: [0x2ee8b4, 0x33d6ea, 0x22c4a6, 0x5aa6ff],
  groundColor: 0x214a30,
  groundGlowColor: 0x2ee8b4,
  puddleColor: 0x06231b,
  moonColor: 0xdfeaff,
  haloColors: [0x63c6e6, 0x3f93d6],
  fireflyColor: 0x3cf4c4,
  dustColor: 0x4eb491,
  leafColor: 0x347a3c,
  rayColor: 0x4ccae6,
  glowVeilColor: 0x39d0e6,
  shardColor: 0x07231b,
  shardEmissive: 0x2ef0b6,
  mistColor: 0x09402e,
  mushroomGlowColor: 0x35f4c4,
  mushroomCapColor: 0x1a7e5c,
  mushroomCapEmissive: 0x1ce6a6,
  mushroomStemColor: 0x234a3a,
};

const TUTORIAL_FOREST_SCENE_THEME: ForestSceneTheme = {
  fogColor: 0x201408,
  clearColor: 0x120b05,
  skyDeepColor: 0x090403,
  skyMidColor: 0x1b0f07,
  skyTopColor: 0x3a1f0a,
  nebulaColor: 0x7e4a18,
  starColor: 0xf1d8a3,
  brightStarColor: 0xfff0cc,
  ambientColor: 0x5a4221,
  ambientIntensity: 0.8,
  moonLightColor: 0xffdca0,
  moonLightIntensity: 3.8,
  fillLightColor: 0xf2b14d,
  fillLightIntensity: 2.0,
  backLightColor: 0xd98a2a,
  hemisphereSkyColor: 0xd7a15d,
  hemisphereGroundColor: 0x27130a,
  hemisphereIntensity: 0.8,
  cameraFillColor: 0xffc65a,
  cameraFillIntensity: 2.8,
  clearLightColor: 0xffb84d,
  clearLightIntensity: 2.5,
  glowColors: [0xffb347, 0xffd166, 0xf59e0b, 0xfb923c],
  groundColor: 0x324321,
  groundGlowColor: 0xfbbf24,
  puddleColor: 0x1f160d,
  moonColor: 0xffe6b4,
  haloColors: [0xffc66b, 0xff9d3a],
  fireflyColor: 0xffd27a,
  dustColor: 0x8c6b2a,
  leafColor: 0xc9a34f,
  rayColor: 0xf0b04e,
  glowVeilColor: 0xffc06b,
  shardColor: 0x2a1a0e,
  shardEmissive: 0xffbf63,
  mistColor: 0x5b3411,
  mushroomGlowColor: 0xfbbf24,
  mushroomCapColor: 0x8a5a1f,
  mushroomCapEmissive: 0xffc857,
  mushroomStemColor: 0x4a3a25,
};

const FOREST_SCENE_THEMES: Record<SceneVariant, ForestSceneTheme> = {
  main: MAIN_FOREST_SCENE_THEME,
  classic: MAIN_FOREST_SCENE_THEME,
  tutorial: TUTORIAL_FOREST_SCENE_THEME,
};

const FOREST_SCENE_DEFAULTS = {
  // Cinematic forest grade — richer bloom + deeper vignette + stronger filmic
  // contrast and split-tone (handled in the final pass) for a moodier, more
  // premium vista than the original softer pass.
  bloomStrength: 1.12,
  bloomThreshold: 0.70,
  exposure: 1.62,
  glowStrength: 0.82,
  glowThreshold: 0.56,
  glowRadius: 2.2,
  vignetteStrength: 0.54,
  grainIntensity: 0.011,
  contrast: 1.13,
  dofFocus: 27,
  dofAperture: 0.0009,
  ssaoRadius: 16,
  ssaoMinDistance: 0.004,
  ssaoMaxDistance: 0.12,
  chromaticAberration: 0.0026,
} as const;

function randomRange(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

function isUiClearZone(x: number, z: number): boolean {
  const normalizedX = x / 12;
  const normalizedZ = (z - 8) / 22;
  return normalizedX * normalizedX + normalizedZ * normalizedZ < 1;
}

function createPoissonDiskPoints(
  width: number,
  height: number,
  minimumDistance: number,
  maxAttempts: number,
): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  const cellSize = minimumDistance / Math.sqrt(2);
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const grid = new Array(gridWidth * gridHeight).fill(-1);
  const activePointIndices: number[] = [];

  const gridIndexFor = (x: number, z: number): number => {
    const gridX = Math.floor((x + width / 2) / cellSize);
    const gridZ = Math.floor((z + height / 2) / cellSize);
    return gridX >= 0 && gridX < gridWidth && gridZ >= 0 && gridZ < gridHeight
      ? gridZ * gridWidth + gridX
      : -1;
  };

  const tryAddPoint = (x: number, z: number): boolean => {
    const gridIndex = gridIndexFor(x, z);
    if (gridIndex < 0) return false;

    const gridX = Math.floor((x + width / 2) / cellSize);
    const gridZ = Math.floor((z + height / 2) / cellSize);

    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
        const neighborX = gridX + offsetX;
        const neighborZ = gridZ + offsetZ;
        if (neighborX < 0 || neighborX >= gridWidth || neighborZ < 0 || neighborZ >= gridHeight) continue;

        const neighborIndex = neighborZ * gridWidth + neighborX;
        if (grid[neighborIndex] >= 0) {
          const neighborPoint = points[grid[neighborIndex]];
          const dx = neighborPoint.x - x;
          const dz = neighborPoint.z - z;
          if (dx * dx + dz * dz < minimumDistance * minimumDistance) return false;
        }
      }
    }

    points.push({ x, z });
    grid[gridIndex] = points.length - 1;
    activePointIndices.push(points.length - 1);
    return true;
  };

  tryAddPoint(20, -15);

  while (activePointIndices.length > 0 && points.length < 350) {
    const activeIndex = Math.floor(Math.random() * activePointIndices.length);
    const basePoint = points[activePointIndices[activeIndex]];
    let foundPoint = false;

    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = minimumDistance + Math.random() * minimumDistance;
      const candidateX = basePoint.x + Math.cos(angle) * distance;
      const candidateZ = basePoint.z + Math.sin(angle) * distance;

      if (Math.abs(candidateX) > width / 2 || Math.abs(candidateZ) > height / 2) continue;
      if (tryAddPoint(candidateX, candidateZ)) {
        foundPoint = true;
        break;
      }
    }

    if (!foundPoint) activePointIndices.splice(activeIndex, 1);
  }

  return points.filter((point) => {
    const clearedPathDistanceX = point.x;
    const clearedPathDistanceZ = point.z - 22;
    if (Math.sqrt(clearedPathDistanceX * clearedPathDistanceX + clearedPathDistanceZ * clearedPathDistanceZ) < 14) {
      return false;
    }
    if (Math.abs(point.x) < 5 && point.z > 8 && point.z < 35) {
      return false;
    }
    // Keep a clear bubble around the camera (~0, 28) so no foreground tree
    // spawns right beside the lens — those near-camera low-poly trees clip the
    // frame edge and read as glitched green shards.
    if (Math.hypot(point.x, point.z - 27) < 17) {
      return false;
    }
    if (isUiClearZone(point.x, point.z)) {
      return false;
    }
    return true;
  });
}

function heightAt(x: number, z: number): number {
  return Math.sin(x * 0.06) * 0.5 + Math.cos(z * 0.08) * 0.4 + Math.sin(x * 0.2 + z * 0.15) * 0.2;
}

function disposeScene(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => materials.add(material));
      } else {
        materials.add(mesh.material);
      }
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function createAtmosphericPlaneMaterial(
  primaryColor: THREE.ColorRepresentation,
  accentColor: THREE.ColorRepresentation,
  opacity: number,
): THREE.ShaderMaterial {
  const seed = Math.random() * 1000;

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPrimaryColor: { value: new THREE.Color(primaryColor) },
      uAccentColor: { value: new THREE.Color(accentColor) },
      uOpacity: { value: opacity },
      uSeed: { value: seed },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uPrimaryColor;
      uniform vec3 uAccentColor;
      uniform float uOpacity;
      uniform float uSeed;
      varying vec2 vUv;

      float hash(vec2 coords) {
        return fract(sin(dot(coords + vec2(uSeed), vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 uv = vUv - 0.5;
        float stretchX = 1.0 + 0.18 * sin(uSeed * 0.7);
        float stretchY = 1.55 + 0.22 * cos(uSeed * 0.4);
        float radial = 1.0 - smoothstep(0.0, 0.72, length(vec2(uv.x * stretchX, uv.y * stretchY)));
        radial = pow(max(radial, 0.0), 1.9);
        float band = smoothstep(0.12, 0.78, 1.0 - abs(uv.x) * (1.6 + 0.2 * sin(uTime * 0.18 + uSeed)));
        float haze = smoothstep(0.76, 0.05, length(vec2(uv.x * 0.92, uv.y * 1.35)));
        float ripple = 0.88 + sin((vUv.y * (7.0 + uSeed * 0.05)) + uTime * 0.25 + uSeed) * 0.12;
        float shimmer = 0.84 + hash(vUv * (32.0 + uSeed)) * 0.16;
        vec3 color = mix(uPrimaryColor, uAccentColor, smoothstep(0.08, 0.92, vUv.y));
        float alpha = (radial * 0.9 + band * 0.28 + haze * 0.38) * uOpacity * ripple * shimmer;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export default function MainMenuForestScene({ variant = 'main', onReady }: MainMenuForestSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const theme = FOREST_SCENE_THEMES[variant];

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.FogExp2(new THREE.Color(theme.fogColor), variant === 'tutorial' ? 0.0166 : 0.0152);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasElement,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = FOREST_SCENE_DEFAULTS.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(theme.clearColor, 1);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 300);
    camera.position.set(0, 7, 28);
    camera.lookAt(0, 2, -8);

    const mouseState = { x: 0, y: 0, targetX: 0, targetY: 0 };

    const skyGeometry = new THREE.SphereGeometry(150, 48, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      dithering: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uSkyDeep: { value: new THREE.Color(theme.skyDeepColor) },
        uSkyMid: { value: new THREE.Color(theme.skyMidColor) },
        uSkyTop: { value: new THREE.Color(theme.skyTopColor) },
        uNebulaColor: { value: new THREE.Color(theme.nebulaColor) },
        uAuroraColor: { value: new THREE.Color(theme.glowVeilColor) },
        uHorizonColor: { value: new THREE.Color(theme.backLightColor) },
        uStarColor: { value: new THREE.Color(theme.starColor) },
        uBrightStarColor: { value: new THREE.Color(theme.brightStarColor) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSkyDeep;
        uniform vec3 uSkyMid;
        uniform vec3 uSkyTop;
        uniform vec3 uNebulaColor;
        uniform vec3 uAuroraColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uStarColor;
        uniform vec3 uBrightStarColor;
        varying vec3 vWorldPos;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int octaveIndex = 0; octaveIndex < 3; octaveIndex++) {
            value += amplitude * noise(p);
            p *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }
        const float PI = 3.14159265;
        void main() {
          vec3 direction = normalize(vWorldPos);
          float y = direction.y;
          vec3 color = mix(
            mix(uSkyDeep, uSkyMid, smoothstep(-0.15, 0.18, y)),
            uSkyTop, smoothstep(0.2, 0.85, y)
          );
          float safeY = max(0.18, y + 0.6);
          vec2 cloudUv = direction.xz / safeY * 1.6;
          float driftTime = uTime * 0.035;
          float nebula = fbm(cloudUv * 1.35 + vec2(0.16 + driftTime, -0.08 - driftTime * 0.4));
          float aurora = fbm(cloudUv * 0.82 + vec2(0.42 - driftTime * 0.6, 1.28 + driftTime * 1.2));
          float auroraRibbon = smoothstep(0.42, 0.92, aurora);
          auroraRibbon *= smoothstep(-0.1, 0.44, y);
          auroraRibbon *= 0.72 + 0.28 * sin(uTime * 0.32 + cloudUv.x * 1.8 + cloudUv.y * 2.2);
          float horizonGlow = smoothstep(-0.1, 0.3, y) * (0.85 - abs(direction.x) * 0.42);
          float mistBand = smoothstep(0.02, 0.44, y) * (1.0 - smoothstep(0.58, 0.93, y));
          color += uNebulaColor * nebula * 0.25;
          color += uAuroraColor * auroraRibbon * horizonGlow * 0.92;
          color += uHorizonColor * horizonGlow * 0.33;
          vec2 starUv = vec2(
            atan(direction.z, direction.x) / (2.0 * PI) + 0.5,
            asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5
          );
          float starField = hash(floor(starUv * 800.0));
          float starTwinkle = 0.82 + 0.18 * sin(uTime * 1.7 + starField * 18.0);
          color += uStarColor * smoothstep(0.997, 1.0, starField) * smoothstep(0.15, 0.5, y)
            * 0.7 * starTwinkle;
          float brightStar = hash(floor(starUv * 220.0));
          color += uBrightStarColor * smoothstep(0.995, 1.0, brightStar) * smoothstep(0.2, 0.65, y)
            * (0.8 + 0.2 * sin(uTime * 2.2 + brightStar * 22.0));
          color += uAuroraColor * mistBand * 0.065;
          color += uHorizonColor * mistBand * 0.028;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    skyMesh.renderOrder = -100;
    skyMesh.frustumCulled = false;
    scene.add(skyMesh);

    scene.add(new THREE.AmbientLight(theme.ambientColor, theme.ambientIntensity));

    const moonLight = new THREE.DirectionalLight(theme.moonLightColor, theme.moonLightIntensity);
    moonLight.position.set(25, 45, -25);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    moonLight.shadow.camera.near = 1;
    moonLight.shadow.camera.far = 100;
    moonLight.shadow.camera.left = -40;
    moonLight.shadow.camera.right = 40;
    moonLight.shadow.camera.top = 40;
    moonLight.shadow.camera.bottom = -5;
    moonLight.shadow.bias = -0.002;
    moonLight.shadow.normalBias = 0.02;
    scene.add(moonLight);

    const fillLight = new THREE.DirectionalLight(theme.fillLightColor, theme.fillLightIntensity);
    fillLight.position.set(-15, 12, 30);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(theme.backLightColor, 1.2);
    backLight.position.set(5, 18, -40);
    scene.add(backLight);
    scene.add(new THREE.HemisphereLight(theme.hemisphereSkyColor, theme.hemisphereGroundColor, theme.hemisphereIntensity));

    const cameraFill = new THREE.PointLight(theme.cameraFillColor, theme.cameraFillIntensity, 45, 1.5);
    cameraFill.position.set(0, 8, 26);
    scene.add(cameraFill);

    const clearLight = new THREE.PointLight(theme.clearLightColor, theme.clearLightIntensity, 40, 1.5);
    clearLight.position.set(0, 4, 8);
    scene.add(clearLight);

    const heroGlowLight = new THREE.PointLight(theme.glowVeilColor, 3.2, 75, 1.35);
    heroGlowLight.position.set(0, 16, -18);
    scene.add(heroGlowLight);

    const heroGlowLayers: Array<{
      mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
      material: THREE.ShaderMaterial;
      baseX: number;
      baseY: number;
      baseZ: number;
      baseRotationZ: number;
      driftX: number;
      driftY: number;
      pulseSpeed: number;
      pulsePhase: number;
    }> = [];

    const heroGlowConfigs = [
      { width: 180, height: 96, x: 0, y: 18, z: -36, rx: -0.06, ry: 0, rz: 0.02, primary: theme.mistColor, accent: theme.glowVeilColor, opacity: 0.26, driftX: 0.26, driftY: 0.1, pulseSpeed: 0.12 },
      { width: 132, height: 72, x: 0, y: 15, z: -20, rx: -0.03, ry: 0, rz: -0.02, primary: theme.glowVeilColor, accent: theme.moonLightColor, opacity: 0.38, driftX: 0.42, driftY: 0.16, pulseSpeed: 0.16 },
      { width: 84, height: 48, x: 0, y: 12, z: -12, rx: 0.01, ry: 0, rz: 0.03, primary: theme.moonLightColor, accent: theme.fillLightColor, opacity: 0.24, driftX: 0.55, driftY: 0.2, pulseSpeed: 0.22 },
      { width: 180, height: 92, x: 10, y: 23, z: -44, rx: -0.07, ry: -0.03, rz: 0.05, primary: theme.glowVeilColor, accent: theme.moonLightColor, opacity: 0.12, driftX: 0.22, driftY: 0.07, pulseSpeed: 0.11 },
    ];

    for (const heroGlowConfig of heroGlowConfigs) {
      const heroGlowMaterial = createAtmosphericPlaneMaterial(heroGlowConfig.primary, heroGlowConfig.accent, heroGlowConfig.opacity);
      const heroGlowMesh = new THREE.Mesh(new THREE.PlaneGeometry(heroGlowConfig.width, heroGlowConfig.height), heroGlowMaterial);
      heroGlowMesh.position.set(heroGlowConfig.x, heroGlowConfig.y, heroGlowConfig.z);
      heroGlowMesh.rotation.set(heroGlowConfig.rx, heroGlowConfig.ry, heroGlowConfig.rz);
      scene.add(heroGlowMesh);
      heroGlowLayers.push({
        mesh: heroGlowMesh,
        material: heroGlowMaterial,
        baseX: heroGlowConfig.x,
        baseY: heroGlowConfig.y,
        baseZ: heroGlowConfig.z,
        baseRotationZ: heroGlowConfig.rz,
        driftX: heroGlowConfig.driftX,
        driftY: heroGlowConfig.driftY,
        pulseSpeed: heroGlowConfig.pulseSpeed,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    const backdropMaterial = new THREE.MeshStandardMaterial({
      color: 0x07130a,
      roughness: 1,
      metalness: 0,
      emissive: new THREE.Color(theme.backLightColor),
      emissiveIntensity: 0.03,
    });
    const backdropGroup = new THREE.Group();
    const backdropAnchors = [
      [-58, 10, -72, 17, 4.2],
      [-40, 13, -82, 21, 5.0],
      [-22, 14, -90, 25, 5.8],
      [0, 16, -94, 28, 6.4],
      [22, 14, -90, 25, 5.8],
      [40, 13, -82, 21, 5.0],
      [58, 10, -72, 17, 4.2],
    ] as const;

    // Unit cylinder + cones shared across all backdrop trees — each instance
    // scales the unit geometry to its trunk height / canopy radius. Saves
    // 21 unique geometries and 21 cloned materials vs. the per-tree approach.
    const backdropTrunkGeo = new THREE.CylinderGeometry(0.5, 1.0, 1, 5);
    const backdropCanopyGeo = new THREE.ConeGeometry(1, 1, 5);
    for (const [anchorX, anchorY, anchorZ, trunkHeight, canopyRadius] of backdropAnchors) {
      const backdropTree = new THREE.Group();
      const trunk = new THREE.Mesh(backdropTrunkGeo, backdropMaterial);
      trunk.scale.set(0.4, trunkHeight, 0.4);
      trunk.position.y = trunkHeight / 2;
      const canopy = new THREE.Mesh(backdropCanopyGeo, backdropMaterial);
      canopy.scale.set(canopyRadius, trunkHeight * 0.92, canopyRadius);
      canopy.position.y = trunkHeight * 0.75;
      canopy.rotation.y = Math.random() * Math.PI * 2;
      const crown = new THREE.Mesh(backdropCanopyGeo, backdropMaterial);
      crown.scale.set(canopyRadius * 0.62, trunkHeight * 0.48, canopyRadius * 0.62);
      crown.position.y = trunkHeight * 1.06;
      crown.rotation.y = Math.random() * Math.PI * 2;
      backdropTree.add(trunk, canopy, crown);
      backdropTree.position.set(anchorX, heightAt(anchorX, anchorZ) * 0.5 + anchorY * 0.12, anchorZ);
      backdropTree.rotation.y = Math.random() * Math.PI * 2;
      backdropTree.scale.setScalar(0.9 + Math.random() * 0.35);
      backdropGroup.add(backdropTree);
    }
    scene.add(backdropGroup);

    // Left framing pine — rebuilt as a proper multi-tier conifer. The old
    // version was a SINGLE oversized 5-sided cone sitting close to the camera's
    // left edge; its big flat low-poly faces read as broken green shards. A
    // stack of decreasing canopy tiers pushed back into the tree-line reads
    // cleanly as a tree and frames the vista instead of glitching it.
    const leftFeatureTree = new THREE.Group();
    const leftFeatureTrunkHeight = 16;
    const leftFeatureTrunk = new THREE.Mesh(backdropTrunkGeo, backdropMaterial);
    leftFeatureTrunk.scale.set(0.6, leftFeatureTrunkHeight, 0.6);
    leftFeatureTrunk.position.y = leftFeatureTrunkHeight / 2;
    leftFeatureTree.add(leftFeatureTrunk);
    const leftFeatureTiers = [
      { radius: 5.4, height: 9.5, y: 11.0 },
      { radius: 4.4, height: 8.5, y: 15.0 },
      { radius: 3.4, height: 7.0, y: 18.8 },
      { radius: 2.3, height: 5.5, y: 22.4 },
    ];
    for (const tier of leftFeatureTiers) {
      const tierCone = new THREE.Mesh(backdropCanopyGeo, backdropMaterial);
      tierCone.scale.set(tier.radius, tier.height, tier.radius);
      tierCone.position.y = tier.y;
      tierCone.rotation.y = Math.random() * Math.PI;
      leftFeatureTree.add(tierCone);
    }
    leftFeatureTree.position.set(-66, heightAt(-66, -42) + 0.5, -42);
    leftFeatureTree.rotation.y = 0.35;
    leftFeatureTree.scale.setScalar(1.0);
    scene.add(leftFeatureTree);

    const glowLights: PulsingLight[] = [];
    const glowColors = theme.glowColors;
    for (let lightIndex = 0; lightIndex < 6; lightIndex++) {
      const glowLight = new THREE.PointLight(glowColors[Math.floor(Math.random() * glowColors.length)], 2.0, 22, 2) as PulsingLight;
      const angle = (lightIndex / 6) * Math.PI * 2;
      const distance = 8 + Math.random() * 20;
      glowLight.position.set(Math.cos(angle) * distance, 0.3 + Math.random() * 0.8, Math.sin(angle) * distance);
      glowLight.baseIntensity = 1.0 + Math.random() * 1.2;
      glowLight.phase = Math.random() * Math.PI * 2;
      glowLight.speed = 0.3 + Math.random() * 0.6;
      scene.add(glowLight);
      glowLights.push(glowLight);
    }

    const groundGeometry = new THREE.PlaneGeometry(250, 250, 60, 60);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundPositions = groundGeometry.getAttribute('position');
    for (let vertexIndex = 0; vertexIndex < groundPositions.count; vertexIndex++) {
      const vertexX = groundPositions.getX(vertexIndex);
      const vertexZ = groundPositions.getZ(vertexIndex);
      groundPositions.setY(vertexIndex, heightAt(vertexX, vertexZ));
    }
    groundGeometry.computeVertexNormals();

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: theme.groundColor,
      roughness: 0.92,
      metalness: 0,
      emissive: new THREE.Color(theme.groundGlowColor),
      emissiveIntensity: 0.08,
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const puddleMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.puddleColor,
      roughness: 0.05,
      metalness: 0.3,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      transparent: true,
      opacity: 0.8,
    });
    const puddleGeometry = new THREE.CircleGeometry(4, 24);
    puddleGeometry.rotateX(-Math.PI / 2);
    const puddleMesh = new THREE.Mesh(puddleGeometry, puddleMaterial);
    puddleMesh.position.set(2, heightAt(2, 6) + 0.05, 6);
    puddleMesh.receiveShadow = true;
    scene.add(puddleMesh);

    // Shared unit circle for the small puddle patches — scale per puddle.
    const puddlePatchGeo = new THREE.CircleGeometry(1, 16);
    puddlePatchGeo.rotateX(-Math.PI / 2);
    for (let puddleIndex = 0; puddleIndex < 2; puddleIndex++) {
      const radius = 1 + Math.random() * 1.5;
      const puddlePatch = new THREE.Mesh(puddlePatchGeo, puddleMaterial);
      puddlePatch.scale.setScalar(radius);
      const puddleX = -4 + Math.random() * 10;
      const puddleZ = 4 + Math.random() * 8;
      puddlePatch.position.set(puddleX, heightAt(puddleX, puddleZ) + 0.03, puddleZ);
      puddlePatch.receiveShadow = true;
      scene.add(puddlePatch);
    }

    const glowPoolMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(theme.groundGlowColor) },
        uIntensity: { value: 0.55 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          float dist = length(vUv - 0.5) * 2.0;
          float glow = smoothstep(1.0, 0.0, dist);
          glow = pow(glow, 2.4);
          float pulse = 0.85 + sin(uTime * 0.4 + dist * 4.0) * 0.15;
          float alpha = glow * uIntensity * pulse;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowPoolGroup = new THREE.Group();
    const glowPoolCount = 12;
    for (let glowIndex = 0; glowIndex < glowPoolCount; glowIndex++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 8 + Math.random() * 32;
      const glowX = Math.cos(angle) * distance;
      const glowZ = Math.sin(angle) * distance + 2;
      if (isUiClearZone(glowX, glowZ)) {
        continue;
      }
      const glowRadius = 1.8 + Math.random() * 4.5;
      const glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(glowRadius * 2, glowRadius * 2), glowPoolMaterial);
      glowMesh.rotation.x = -Math.PI / 2;
      glowMesh.position.set(glowX, heightAt(glowX, glowZ) + 0.05, glowZ);
      glowPoolGroup.add(glowMesh);
    }
    scene.add(glowPoolGroup);

    const shardMaterial = new THREE.MeshStandardMaterial({
      color: theme.shardColor,
      roughness: 0.35,
      metalness: 0.4,
      emissive: new THREE.Color(theme.shardEmissive),
      emissiveIntensity: 0.22,
    });
    const shardGeometry = new THREE.ConeGeometry(1, 1, 3, 1);
    const shardGroup = new THREE.Group();
    const shardCount = 40;
    let shardIndex = 0;
    let shardAttempts = 0;
    while (shardIndex < shardCount && shardAttempts < shardCount * 6) {
      shardAttempts += 1;
      const angle = (shardIndex / shardCount) * Math.PI * 2 + Math.random() * 0.35;
      const distance = 24 + Math.random() * 62;
      const height = 6 + Math.random() * 20;
      const radius = 1.2 + Math.random() * 4.2;
      const shardX = Math.cos(angle) * distance;
      const shardZ = Math.sin(angle) * distance - 8;
      if (isUiClearZone(shardX, shardZ)) {
        continue;
      }
      const shardMesh = new THREE.Mesh(shardGeometry, shardMaterial);
      shardMesh.scale.set(radius, height, radius);
      shardMesh.position.set(shardX, heightAt(shardX, shardZ) + height * 0.5, shardZ);
      shardMesh.rotation.y = angle + Math.random() * 0.6;
      shardMesh.rotation.x = (Math.random() - 0.5) * 0.08;
      shardMesh.rotation.z = (Math.random() - 0.5) * 0.08;
      shardMesh.castShadow = true;
      shardMesh.receiveShadow = true;
      shardGroup.add(shardMesh);
      shardIndex += 1;
    }
    scene.add(shardGroup);

    const glowCurtainMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(theme.glowVeilColor) },
        uIntensity: { value: 0.24 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        float rand(vec2 coords) { return fract(sin(dot(coords, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          float edge = smoothstep(0.0, 0.42, 1.0 - abs(vUv.x - 0.5) * 2.0);
          float vertical = smoothstep(0.02, 0.62, vUv.y) * (1.0 - smoothstep(0.58, 1.0, vUv.y));
          float ripple = 0.86 + sin(vUv.y * 7.0 + uTime * 0.18) * 0.14;
          float shimmer = 0.82 + rand(vec2(vUv.y * 4.0, uTime * 0.12)) * 0.18;
          float alpha = edge * vertical * ripple * shimmer * uIntensity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const glowCurtain = new THREE.Mesh(new THREE.PlaneGeometry(150, 80), glowCurtainMaterial);
    glowCurtain.position.set(0, 20, -58);
    glowCurtain.rotation.x = -0.05;
    scene.add(glowCurtain);

    const treePositions = createPoissonDiskPoints(140, 140, 5, 30);
    const trunkMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.9 }),
    ];
    const foliageMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x1a5a20, roughness: 0.65 }),
      new THREE.MeshStandardMaterial({ color: 0x2a6a2a, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x256a30, roughness: 0.65 }),
      new THREE.MeshStandardMaterial({ color: 0x1a4a25, roughness: 0.7 }),
    ];
    // Pre-baked unit trunks (3 size bands). Each tree scales the unit
    // cylinder to its target height — no per-tree geometry allocation.
    const trunkGeometries = [
      new THREE.CylinderGeometry(0.3, 0.5, 1, 6),
      new THREE.CylinderGeometry(0.4, 0.65, 1, 6),
      new THREE.CylinderGeometry(0.5, 0.75, 1, 6),
    ];
    // Single unit cone — every foliage tier scales this. Previously each
    // tier got a fresh ConeGeometry, producing ~600 unique cones across
    // the menu's ~150 trees.
    const foliageUnitGeo = new THREE.ConeGeometry(1, 1, 6);
    const deadTrunkGeo = new THREE.CylinderGeometry(0.06, 0.2, 1, 5);
    const deadBranchGeo = new THREE.CylinderGeometry(0.02, 0.05, 1, 3);

    const createPineTree = (scale: number): THREE.Group => {
      const treeGroup = new THREE.Group();
      const sizeIndex = scale < 0.7 ? 0 : scale < 1.1 ? 1 : 2;
      const trunkHeight = [8, 10, 12][sizeIndex];
      const trunk = new THREE.Mesh(trunkGeometries[sizeIndex], trunkMaterials[sizeIndex > 1 ? 0 : 1]);
      trunk.scale.set(1, trunkHeight, 1);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      treeGroup.add(trunk);

      const tierCount = 3 + (sizeIndex > 1 ? 1 : 0);
      for (let tierIndex = 0; tierIndex < tierCount; tierIndex++) {
        const tierRadius = (3.5 - tierIndex * 0.5) * randomRange(0.75, 1.25);
        const tierHeight = (7 - tierIndex * 1.1) * randomRange(0.8, 1.1);
        const foliage = new THREE.Mesh(
          foliageUnitGeo,
          foliageMaterials[Math.floor(Math.random() * foliageMaterials.length)],
        );
        foliage.scale.set(tierRadius, tierHeight, tierRadius);
        foliage.position.y = trunkHeight * 0.5 + tierIndex * 3 + 1;
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        foliage.rotation.y = Math.random() * 0.4;
        treeGroup.add(foliage);
      }

      return treeGroup;
    };

    const createDeadTree = (): THREE.Group => {
      const treeGroup = new THREE.Group();
      const trunkHeight = 5 + Math.random() * 7;
      const trunk = new THREE.Mesh(deadTrunkGeo, trunkMaterials[1]);
      trunk.scale.set(1, trunkHeight, 1);
      trunk.position.y = trunkHeight / 2;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const branchCount = 2 + Math.floor(Math.random() * 2);
      for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
        const branchLength = 1 + Math.random() * 2;
        const branch = new THREE.Mesh(deadBranchGeo, trunkMaterials[1]);
        branch.scale.set(1, branchLength, 1);
        branch.position.y = trunkHeight * (0.35 + Math.random() * 0.45);
        branch.rotation.z = 0.4 + Math.random() * 0.8;
        branch.rotation.y = Math.random() * Math.PI * 2;
        treeGroup.add(branch);
      }

      return treeGroup;
    };

    const trees: THREE.Group[] = [];
    for (const treePosition of treePositions) {
      const distanceFromCenter = Math.sqrt(treePosition.x * treePosition.x + treePosition.z * treePosition.z);
      const baseScale = 0.5 + Math.random() * 0.8;
      const distanceScale = distanceFromCenter > 45 ? 0.55 : distanceFromCenter > 28 ? 0.75 : 1.0;
      const foregroundScale = treePosition.z > 18 ? 0.6 : treePosition.z > 10 ? 0.8 : 1.0;
      const treeScale = baseScale * distanceScale * foregroundScale;
      const treeGroup = Math.random() < 0.1 ? createDeadTree() : createPineTree(treeScale);
      treeGroup.scale.set(treeScale, treeScale + Math.random() * 0.2, treeScale);
      treeGroup.position.set(treePosition.x, heightAt(treePosition.x, treePosition.z), treePosition.z);
      treeGroup.rotation.y = Math.random() * Math.PI * 2;
      treeGroup.rotation.x = (Math.random() - 0.5) * 0.03;
      treeGroup.rotation.z = (Math.random() - 0.5) * 0.03;
      treeGroup.userData.baseRotationX = treeGroup.rotation.x;
      treeGroup.userData.baseRotationZ = treeGroup.rotation.z;
      treeGroup.userData.swingPhase = Math.random() * Math.PI * 2;
      treeGroup.userData.swingSpeed = 0.2 + Math.random() * 0.3;
      treeGroup.userData.swingAmount = 0.002 + Math.random() * 0.005;
      scene.add(treeGroup);
      trees.push(treeGroup);
    }

    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x4a5a4a, roughness: 0.88, metalness: 0.08 });
    const fernMaterial = new THREE.MeshStandardMaterial({ color: 0x3a7a30, roughness: 0.7, side: THREE.DoubleSide });
    const logMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 0.85 });

    // === ROCKS — instanced (1 draw call instead of 30) ===
    // Single unit dodecahedron, per-instance non-uniform scale gives each rock
    // a different silhouette without the cost of a unique distorted geometry.
    const rockUnitGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockInstanced = new THREE.InstancedMesh(rockUnitGeo, rockMaterial, 30);
    rockInstanced.castShadow = true;
    rockInstanced.receiveShadow = true;
    {
      const dummy = new THREE.Object3D();
      for (let rockIndex = 0; rockIndex < 30; rockIndex++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 4 + Math.random() * 50;
        const rockX = Math.cos(angle) * distance;
        const rockZ = Math.sin(angle) * distance;
        const rockScale = 0.15 + Math.random() * 0.6;
        dummy.position.set(rockX, heightAt(rockX, rockZ) + rockScale * 0.15, rockZ);
        dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, 0);
        // Asymmetric scale mimics the per-vertex distortion of the old build
        dummy.scale.set(
          rockScale * (0.7 + Math.random() * 0.6),
          rockScale * (0.5 + Math.random() * 0.5),
          rockScale * (0.7 + Math.random() * 0.6),
        );
        dummy.updateMatrix();
        rockInstanced.setMatrixAt(rockIndex, dummy.matrix);
      }
      rockInstanced.instanceMatrix.needsUpdate = true;
    }
    scene.add(rockInstanced);

    // === FERNS — instanced (1 draw call instead of 35) ===
    const fernUnitGeo = new THREE.PlaneGeometry(1, 0.5);
    const fernInstanced = new THREE.InstancedMesh(fernUnitGeo, fernMaterial, 35);
    {
      const dummy = new THREE.Object3D();
      for (let fernIndex = 0; fernIndex < 35; fernIndex++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 3 + Math.random() * 40;
        const fernX = Math.cos(angle) * distance;
        const fernZ = Math.sin(angle) * distance;
        const fernScale = 0.4 + Math.random() * 1.2;
        dummy.position.set(fernX, heightAt(fernX, fernZ) + fernScale * 0.2, fernZ);
        dummy.rotation.set(-0.5, Math.random() * Math.PI * 2, 0);
        dummy.scale.setScalar(fernScale);
        dummy.updateMatrix();
        fernInstanced.setMatrixAt(fernIndex, dummy.matrix);
      }
      fernInstanced.instanceMatrix.needsUpdate = true;
    }
    scene.add(fernInstanced);

    // === LOGS — instanced (1 draw call instead of 8) ===
    // Unit cylinder rotated 90° around Z so it lies on its side.
    const logUnitGeo = new THREE.CylinderGeometry(0.7, 1, 1, 5);
    logUnitGeo.rotateZ(Math.PI / 2);
    const logInstanced = new THREE.InstancedMesh(logUnitGeo, logMaterial, 8);
    logInstanced.castShadow = true;
    logInstanced.receiveShadow = true;
    {
      const dummy = new THREE.Object3D();
      for (let logIndex = 0; logIndex < 8; logIndex++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 6 + Math.random() * 35;
        const logX = Math.cos(angle) * distance;
        const logZ = Math.sin(angle) * distance;
        const logLength = 3 + Math.random() * 4;
        const logRadius = 0.12 + Math.random() * 0.2;
        dummy.position.set(logX, heightAt(logX, logZ) + logRadius * 0.6, logZ);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        // Unit cylinder is 1 unit along Y → rotated to X. Scale: X=length, Y/Z=radius.
        dummy.scale.set(logLength, logRadius, logRadius);
        dummy.updateMatrix();
        logInstanced.setMatrixAt(logIndex, dummy.matrix);
      }
      logInstanced.instanceMatrix.needsUpdate = true;
    }
    scene.add(logInstanced);

    const mushroomGlowMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.mushroomGlowColor,
      emissive: theme.mushroomGlowColor,
      // Kept below the HDR clipping range so bloom stays stable in motion.
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.1,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
    });
    const mushroomCapMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.mushroomCapColor,
      emissive: theme.mushroomCapEmissive,
      emissiveIntensity: 0.7,
      roughness: 0.4,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
    });
    const mushroomStemMaterial = new THREE.MeshStandardMaterial({ color: theme.mushroomStemColor, roughness: 0.8 });
    const mushroomStemGeometry = new THREE.CylinderGeometry(1, 1, 1, 5);
    const mushroomCapGeometry = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const mushroomSpotGeometry = new THREE.SphereGeometry(1, 4, 3);

    const mushrooms: THREE.Group[] = [];
    for (let mushroomIndex = 0; mushroomIndex < 30; mushroomIndex++) {
      const mushroomGroup = new THREE.Group();
      const mushroomRadius = 0.12 + Math.random() * 0.3;
      const mushroomStemHeight = 0.1 + Math.random() * 0.35;

      const mushroomStem = new THREE.Mesh(mushroomStemGeometry, mushroomStemMaterial);
      mushroomStem.scale.set(mushroomRadius * 0.22, mushroomStemHeight, mushroomRadius * 0.22);
      mushroomStem.position.y = mushroomStemHeight / 2;
      mushroomGroup.add(mushroomStem);

      const mushroomCap = new THREE.Mesh(mushroomCapGeometry, mushroomCapMaterial);
      mushroomCap.scale.set(mushroomRadius, mushroomRadius, mushroomRadius);
      mushroomCap.position.y = mushroomStemHeight;
      mushroomGroup.add(mushroomCap);

      const spotCount = 2 + Math.floor(Math.random() * 2);
      for (let spotIndex = 0; spotIndex < spotCount; spotIndex++) {
        const spot = new THREE.Mesh(mushroomSpotGeometry, mushroomGlowMaterial);
        const spotAngle = Math.random() * Math.PI * 2;
        spot.scale.setScalar(mushroomRadius * 0.1);
        spot.position.set(
          Math.cos(spotAngle) * mushroomRadius * 0.45,
          mushroomStemHeight + Math.random() * mushroomRadius * 0.3,
          Math.sin(spotAngle) * mushroomRadius * 0.45,
        );
        mushroomGroup.add(spot);
      }

      const angle = Math.random() * Math.PI * 2;
      const distance = 3 + Math.random() * 32;
      const mushroomX = Math.cos(angle) * distance;
      const mushroomZ = Math.sin(angle) * distance;
      mushroomGroup.position.set(mushroomX, heightAt(mushroomX, mushroomZ), mushroomZ);
      mushroomGroup.rotation.y = Math.random() * Math.PI * 2;
      mushroomGroup.userData.pulsePhase = Math.random() * Math.PI * 2;
      mushroomGroup.userData.pulseSpeed = 0.5 + Math.random() * 1;
      scene.add(mushroomGroup);
      mushrooms.push(mushroomGroup);
    }

    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 20, 20),
      new THREE.MeshBasicMaterial({ color: theme.moonColor }),
    );
    moonMesh.position.set(22, 38, -55);
    scene.add(moonMesh);

    for (let haloIndex = 0; haloIndex < 2; haloIndex++) {
      const haloMesh = new THREE.Mesh(
        new THREE.SphereGeometry(6 + haloIndex * 5, 12, 12),
        new THREE.MeshBasicMaterial({
          color: haloIndex === 0 ? theme.haloColors[0] : theme.haloColors[1],
          transparent: true,
          opacity: 0.06 - haloIndex * 0.02,
          side: THREE.BackSide,
        }),
      );
      haloMesh.position.copy(moonMesh.position);
      scene.add(haloMesh);
    }

    // Bumped from 100 — denser firefly field for that magical "alive
    // forest" feel. Still cheap (single Points draw call).
    const fireflyCount = 160;
    const fireflyGeometry = new THREE.BufferGeometry();
    const fireflyPositions = new Float32Array(fireflyCount * 3);
    const fireflyBasePositions = new Float32Array(fireflyCount * 3);
    const fireflySizes = new Float32Array(fireflyCount);
    const fireflyPhases = new Float32Array(fireflyCount);
    const fireflySpeeds = new Float32Array(fireflyCount);
    for (let fireflyIndex = 0; fireflyIndex < fireflyCount; fireflyIndex++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 3 + Math.random() * 42;
      fireflyBasePositions[fireflyIndex * 3] = Math.cos(angle) * distance;
      fireflyBasePositions[fireflyIndex * 3 + 1] = 0.5 + Math.random() * 8;
      fireflyBasePositions[fireflyIndex * 3 + 2] = Math.sin(angle) * distance;
      fireflyPositions[fireflyIndex * 3] = fireflyBasePositions[fireflyIndex * 3];
      fireflyPositions[fireflyIndex * 3 + 1] = fireflyBasePositions[fireflyIndex * 3 + 1];
      fireflyPositions[fireflyIndex * 3 + 2] = fireflyBasePositions[fireflyIndex * 3 + 2];
      fireflySizes[fireflyIndex] = 0.1 + Math.random() * 0.3;
      fireflyPhases[fireflyIndex] = Math.random() * Math.PI * 2;
      fireflySpeeds[fireflyIndex] = 0.3 + Math.random() * 1.5;
    }
    fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
    fireflyGeometry.setAttribute('aSize', new THREE.BufferAttribute(fireflySizes, 1));
    fireflyGeometry.setAttribute('aPhase', new THREE.BufferAttribute(fireflyPhases, 1));

    const fireflyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(theme.fireflyColor) },
        uPR: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPR;
        varying float vA;
        void main() {
          vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
          float pulse = sin(uTime * 1.5 + aPhase);
          pulse = pulse * pulse * sign(sin(uTime * 1.5 + aPhase));
          pulse = pulse * 0.5 + 0.5;
          vA = pulse;
          gl_PointSize = aSize * uPR * (320.0 / -modelViewPosition.z) * (0.4 + pulse * 0.9);
          gl_Position = projectionMatrix * modelViewPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float distanceToCenter = length(gl_PointCoord - 0.5) * 2.0;
          float glow = 1.0 - smoothstep(0.0, 1.0, distanceToCenter);
          glow = pow(glow, 1.2);
          float core = 1.0 - smoothstep(0.0, 0.2, distanceToCenter);
          gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.8), glow * vA);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
    scene.add(fireflies);

    // ── EMBERS: drifting warm upward sparks ────────────────────────────
    // Cinematic "magical embers rising" particle layer. Warm orange points
    // that drift up + sideways, fade as they rise. Adds the premium AAA
    // touch to the menu vista without the cost of a full particle system.
    const emberCount = 80;
    const emberGeometry = new THREE.BufferGeometry();
    const emberPositions = new Float32Array(emberCount * 3);
    const emberVelocities = new Float32Array(emberCount * 3);
    const emberLifes = new Float32Array(emberCount);
    const emberMaxLifes = new Float32Array(emberCount);
    for (let i = 0; i < emberCount; i++) {
      // Spawn around the hero glow area in front of the camera
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 26;
      emberPositions[i * 3] = Math.cos(a) * r;
      emberPositions[i * 3 + 1] = -1 + Math.random() * 18;
      emberPositions[i * 3 + 2] = Math.sin(a) * r - 8;
      emberVelocities[i * 3] = (Math.random() - 0.5) * 0.018;
      emberVelocities[i * 3 + 1] = 0.018 + Math.random() * 0.024;
      emberVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.018;
      emberMaxLifes[i] = 4 + Math.random() * 6;
      emberLifes[i] = Math.random() * emberMaxLifes[i];
    }
    emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
    const emberPoints = new THREE.Points(
      emberGeometry,
      new THREE.PointsMaterial({
        size: 0.18,
        color: variant === 'tutorial' ? 0xffb957 : 0xffd57a,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    scene.add(emberPoints);

    const dustCount = 150;
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    const dustVelocities = new Float32Array(dustCount * 3);
    for (let dustIndex = 0; dustIndex < dustCount; dustIndex++) {
      dustPositions[dustIndex * 3] = (Math.random() - 0.5) * 80;
      dustPositions[dustIndex * 3 + 1] = Math.random() * 14;
      dustPositions[dustIndex * 3 + 2] = (Math.random() - 0.5) * 80;
      dustVelocities[dustIndex * 3] = (Math.random() - 0.5) * 0.006;
      dustVelocities[dustIndex * 3 + 1] = -0.002 - Math.random() * 0.004;
      dustVelocities[dustIndex * 3 + 2] = (Math.random() - 0.5) * 0.006;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustPoints = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        size: 0.07,
        color: theme.dustColor,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    scene.add(dustPoints);

    const leafCount = 25;
    const leafGeometry = new THREE.BufferGeometry();
    const leafPositions = new Float32Array(leafCount * 3);
    const leafDrift: LeafDrift[] = [];
    for (let leafIndex = 0; leafIndex < leafCount; leafIndex++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 5 + Math.random() * 35;
      leafPositions[leafIndex * 3] = Math.cos(angle) * distance;
      leafPositions[leafIndex * 3 + 1] = 8 + Math.random() * 14;
      leafPositions[leafIndex * 3 + 2] = Math.sin(angle) * distance;
      leafDrift.push({
        fallSpeed: 0.005 + Math.random() * 0.012,
        swaySpeed: 1 + Math.random() * 2,
        swayAmount: 0.3 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      });
    }
    leafGeometry.setAttribute('position', new THREE.BufferAttribute(leafPositions, 3));
    const leafPoints = new THREE.Points(
      leafGeometry,
      new THREE.PointsMaterial({
        size: 0.15,
        color: theme.leafColor,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    scene.add(leafPoints);

    const rayGroup = new THREE.Group();
    const rayMeshes: PulsingRay[] = [];
    const rayCount = 8;
    for (let rayIndex = 0; rayIndex < rayCount; rayIndex++) {
      const rayWidth = 0.6 + Math.random() * 1.8;
      const rayHeight = 28 + Math.random() * 10;
      const rayMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(theme.rayColor) },
          uOpacity: { value: 0.028 + Math.random() * 0.04 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vUv;
          float rand(vec2 coords) { return fract(sin(dot(coords, vec2(12.9898, 78.233))) * 43758.5453); }
          void main() {
            float edge = smoothstep(0.0, 0.45, 1.0 - abs(vUv.x - 0.5) * 2.0);
            float fade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
            float shimmer = 0.8 + rand(vec2(vUv.y * 6.0, uTime * 0.2)) * 0.2;
            float wave = 0.92 + sin((vUv.y * 6.0 + uTime * 0.35)) * 0.08;
            float alpha = uOpacity * edge * fade * shimmer * wave;
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const rayMesh = new THREE.Mesh(new THREE.PlaneGeometry(rayWidth, rayHeight), rayMaterial) as PulsingRay;
      rayMesh.position.set(-12 + rayIndex * 4.5 + Math.random() * 3, 11 + Math.random() * 6, -22 + Math.random() * 18);
      rayMesh.rotation.x = -0.18;
      rayMesh.rotation.z = (Math.random() - 0.5) * 0.18;
      rayMesh.rotation.y = (Math.random() - 0.5) * 0.5;
      rayMesh.baseOpacity = rayMaterial.uniforms.uOpacity.value;
      rayMesh.phase = Math.random() * Math.PI * 2;
      rayMesh.speed = 0.12 + Math.random() * 0.25;
      rayGroup.add(rayMesh);
      rayMeshes.push(rayMesh);
    }

    // ── CATHEDRAL MOON-SHAFTS — dramatic volumetric light from the moon ──
    // A cluster of large, bright god-ray shafts raking down through the canopy
    // from the moon's direction (upper-right). Folded into rayMeshes so the
    // existing ray loop drives their shimmer + pulse with zero extra per-frame
    // code. This is the centrepiece of the overhaul — the "light pouring
    // through the trees" beat that makes the vista feel alive and cinematic.
    const shaftColor = new THREE.Color(theme.glowVeilColor);
    for (let shaftIndex = 0; shaftIndex < 6; shaftIndex++) {
      const shaftWidth = 3.5 + Math.random() * 3.5;
      const shaftHeight = 52 + Math.random() * 24;
      const shaftMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: shaftColor.clone() },
          uOpacity: { value: 0.05 + Math.random() * 0.045 },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vUv;
          float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
          void main() {
            float edge = pow(smoothstep(0.0, 0.5, 1.0 - abs(vUv.x - 0.5) * 2.0), 1.6);
            float fade = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
            float beams = 0.78 + 0.22 * sin(vUv.x * 26.0 + uTime * 0.2);
            float shimmer = 0.85 + rand(vec2(vUv.y * 5.0, floor(uTime * 1.5))) * 0.15;
            gl_FragColor = vec4(uColor, uOpacity * edge * fade * beams * shimmer);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(shaftWidth, shaftHeight), shaftMaterial) as PulsingRay;
      shaft.position.set(-18 + shaftIndex * 8 + Math.random() * 4, 22 + Math.random() * 8, -30 - Math.random() * 16);
      shaft.rotation.x = -0.12;
      shaft.rotation.z = 0.32 + Math.random() * 0.14;   // slant down-left from the moon
      shaft.rotation.y = (Math.random() - 0.5) * 0.3;
      shaft.baseOpacity = shaftMaterial.uniforms.uOpacity.value;
      shaft.phase = Math.random() * Math.PI * 2;
      shaft.speed = 0.08 + Math.random() * 0.15;
      rayGroup.add(shaft);
      rayMeshes.push(shaft);
    }
    scene.add(rayGroup);

    // ── DISTANT RIDGELINE SILHOUETTES — layered depth behind the backdrop ──
    // Two faint rows of dark, jagged pine silhouettes far beyond the backdrop
    // trees, dissolving into the fog — the vista now reads as an endless forest
    // stretching to the horizon instead of ending at the backdrop tree-line.
    // Instanced (2 draw calls), far enough back to need no shadows.
    const ridgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x041710,
      roughness: 1,
      metalness: 0,
      emissive: new THREE.Color(theme.backLightColor),
      emissiveIntensity: 0.025,
    });
    const ridgeConeGeo = new THREE.ConeGeometry(1, 1, 5);
    const ridgeLayers = [
      { z: -101, count: 30, spread: 240, baseH: 20, varH: 16, radius: 7 },
      { z: -122, count: 34, spread: 310, baseH: 28, varH: 22, radius: 9 },
    ];
    for (const ridgeLayer of ridgeLayers) {
      const ridge = new THREE.InstancedMesh(ridgeConeGeo, ridgeMaterial, ridgeLayer.count);
      ridge.frustumCulled = false;
      const dummy = new THREE.Object3D();
      for (let i = 0; i < ridgeLayer.count; i++) {
        const h = ridgeLayer.baseH + Math.random() * ridgeLayer.varH;
        const r = ridgeLayer.radius * (0.7 + Math.random() * 0.6);
        const x = -ridgeLayer.spread / 2 + (i / (ridgeLayer.count - 1)) * ridgeLayer.spread + (Math.random() - 0.5) * 8;
        const z = ridgeLayer.z + (Math.random() - 0.5) * 14;
        dummy.position.set(x, h * 0.5 - 2, z);
        dummy.scale.set(r, h, r);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.updateMatrix();
        ridge.setMatrixAt(i, dummy.matrix);
      }
      ridge.instanceMatrix.needsUpdate = true;
      scene.add(ridge);
    }

    // Layered low ground fog — denser + wider than the original three strips so
    // the forest floor dissolves into a soft luminous haze that catches the
    // moon-shafts.
    for (let mistIndex = 0; mistIndex < 5; mistIndex++) {
      const mistMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(230, 9),
        new THREE.MeshBasicMaterial({
          color: theme.mistColor,
          transparent: true,
          opacity: 0.034 + mistIndex * 0.013,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mistMesh.position.set(0, 0.3 + mistIndex * 0.7, -3 - mistIndex * 11);
      mistMesh.rotation.x = -Math.PI / 2;
      scene.add(mistMesh);
    }

    const composer = new EffectComposer(renderer);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    composer.addPass(new RenderPass(scene, camera));

    const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = FOREST_SCENE_DEFAULTS.ssaoRadius;
    ssaoPass.minDistance = FOREST_SCENE_DEFAULTS.ssaoMinDistance;
    ssaoPass.maxDistance = FOREST_SCENE_DEFAULTS.ssaoMaxDistance;
    composer.addPass(ssaoPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      FOREST_SCENE_DEFAULTS.bloomStrength,
      0.7,
      FOREST_SCENE_DEFAULTS.bloomThreshold,
    );
    composer.addPass(bloomPass);

    const bokehPass = new BokehPass(scene, camera, {
      focus: FOREST_SCENE_DEFAULTS.dofFocus,
      aperture: FOREST_SCENE_DEFAULTS.dofAperture,
      maxblur: 0.0032,
    });
    composer.addPass(bokehPass);

    const finalPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uVignette: { value: FOREST_SCENE_DEFAULTS.vignetteStrength },
        uGrain: { value: FOREST_SCENE_DEFAULTS.grainIntensity },
        uContrast: { value: FOREST_SCENE_DEFAULTS.contrast },
        uChromatic: { value: FOREST_SCENE_DEFAULTS.chromaticAberration },
        uGlowStrength: { value: FOREST_SCENE_DEFAULTS.glowStrength },
        uGlowThreshold: { value: FOREST_SCENE_DEFAULTS.glowThreshold },
        uGlowRadius: { value: FOREST_SCENE_DEFAULTS.glowRadius },
        uGlowColor: { value: new THREE.Color(theme.glowVeilColor) },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime, uVignette, uGrain, uContrast, uChromatic;
        uniform float uGlowStrength, uGlowThreshold, uGlowRadius;
        uniform vec3 uGlowColor;
        uniform vec2 uResolution;
        varying vec2 vUv;
        float rand(vec2 coords) { return fract(sin(dot(coords, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 uv = vUv;
          vec2 direction = uv - 0.5;
          float distanceFromCenter = length(direction);
          vec2 offset = direction * distanceFromCenter * uChromatic;
          float redChannel = texture2D(tDiffuse, uv + offset).r;
          float greenChannel = texture2D(tDiffuse, uv).g;
          float blueChannel = texture2D(tDiffuse, uv - offset).b;
          vec3 color = vec3(redChannel, greenChannel, blueChannel);
          float luminance = dot(color, vec3(0.299, 0.587, 0.114));
          color.b += luminance * 0.015;
          color.g += (1.0 - luminance) * 0.015;
          color = (color - 0.5) * uContrast + 0.5 + 0.025;
          // ── Cinematic split-tone: teal shadows, warm highlights ──
          float gradeLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
          vec3 coolShadow = vec3(0.90, 1.00, 1.07);
          vec3 warmHigh = vec3(1.07, 1.01, 0.92);
          color *= mix(coolShadow, warmHigh, smoothstep(0.18, 0.82, gradeLuma));
          // ── Filmic micro-contrast S-curve for snap ──
          vec3 sCurve = clamp(color, 0.0, 1.0);
          color = mix(color, sCurve * sCurve * (3.0 - 2.0 * sCurve), 0.14);
          vec2 texel = uGlowRadius / uResolution;
          vec3 glowSample = texture2D(tDiffuse, uv).rgb * 0.24;
          glowSample += texture2D(tDiffuse, uv + vec2(texel.x, 0.0)).rgb * 0.19;
          glowSample += texture2D(tDiffuse, uv - vec2(texel.x, 0.0)).rgb * 0.19;
          glowSample += texture2D(tDiffuse, uv + vec2(0.0, texel.y)).rgb * 0.19;
          glowSample += texture2D(tDiffuse, uv - vec2(0.0, texel.y)).rgb * 0.19;
          float glowLuma = dot(glowSample, vec3(0.299, 0.587, 0.114));
          float glowMask = smoothstep(uGlowThreshold, 1.05, glowLuma);
          vec3 glowColor = mix(glowSample, uGlowColor, 0.35);
          float veil = smoothstep(0.95, 0.25, distanceFromCenter);
          color += glowColor * glowMask * uGlowStrength;
          color += uGlowColor * veil * (uGlowStrength * 0.08);
          color *= 1.0 - smoothstep(0.35, 1.15, distanceFromCenter * 1.2) * uVignette;
          color *= 1.0 - smoothstep(0.3, 0.95, distanceFromCenter) * 0.15;
          color += (rand(uv + fract(uTime * 0.7)) * 2.0 - 1.0) * uGrain;
          color.g += sin(uTime * 0.1) * 0.005;
          gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
      `,
    });
    composer.addPass(finalPass);
    composer.addPass(new OutputPass());

    const clock = new THREE.Clock();
    let animationFrameId = 0;
    let isVisible = !document.hidden;

    const handlePointerMove = (event: PointerEvent) => {
      mouseState.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
      mouseState.targetY = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
      ssaoPass.setSize(width, height);
      bloomPass.setSize(width, height);
      finalPass.uniforms.uResolution.value.set(width, height);
      fireflyMaterial.uniforms.uPR.value = renderer.getPixelRatio();
    };

    // ── SHOOTING STARS ─────────────────────────────────────────────────────
    // Occasional meteors streak across the upper night sky — a quiet, magical
    // beat layered over the existing starfield + aurora. Fully parametric
    // (driven by elapsed time, no per-frame delta), additive, and recycled with
    // a random gap so they stay rare. Geometry + materials are freed by
    // disposeScene(); the one shared streak TEXTURE is disposed on cleanup.
    const meteorTexture = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 8;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createLinearGradient(0, 0, 64, 0);
      grad.addColorStop(0.0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.7, 'rgba(255,255,255,0.32)');
      grad.addColorStop(0.93, 'rgba(255,255,255,0.92)');
      grad.addColorStop(1.0, 'rgba(255,255,255,1)'); // bright head
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 8);
      // Soft vertical falloff so the streak has a rounded, glowing core.
      ctx.globalCompositeOperation = 'destination-in';
      const vgrad = ctx.createLinearGradient(0, 0, 0, 8);
      vgrad.addColorStop(0, 'rgba(255,255,255,0)');
      vgrad.addColorStop(0.5, 'rgba(255,255,255,1)');
      vgrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = vgrad;
      ctx.fillRect(0, 0, 64, 8);
      return new THREE.CanvasTexture(canvas);
    })();
    const meteorGeometry = new THREE.PlaneGeometry(7, 0.42);
    type Meteor = {
      mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial;
      startT: number; dur: number; sx: number; sy: number; dx: number; dy: number; z: number;
    };
    const meteors: Meteor[] = [];
    const armMeteor = (m: Meteor, now: number) => {
      m.startT = now + 2 + Math.random() * 9;          // random gap before the next streak
      m.dur = 1.1 + Math.random() * 0.9;
      m.z = -44 - Math.random() * 26;                  // deep in the sky
      m.sx = (Math.random() - 0.5) * 70;
      m.sy = 20 + Math.random() * 18;
      m.dx = (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 20);
      m.dy = -(12 + Math.random() * 12);               // always rakes downward
      m.mesh.rotation.z = Math.atan2(m.dy, m.dx);      // align the streak with its path
    };
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: meteorTexture, color: theme.brightStarColor, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
      });
      const mesh = new THREE.Mesh(meteorGeometry, mat);
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      const meteor: Meteor = { mesh, mat, startT: 0, dur: 1, sx: 0, sy: 0, dx: 0, dy: 0, z: -50 };
      armMeteor(meteor, i * 3.5); // stagger the first appearances
      scene.add(mesh);
      meteors.push(meteor);
    }

    const animate = () => {
      animationFrameId = window.requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsedTime = clock.getElapsedTime();

      mouseState.x += (mouseState.targetX - mouseState.x) * 0.02;
      mouseState.y += (mouseState.targetY - mouseState.y) * 0.02;

      // Gentle autonomous camera breathing layered under the mouse parallax, so
      // the scene stays alive and cinematic even when the pointer is still.
      const camDriftX = Math.sin(elapsedTime * 0.12) * 1.05;
      const camDriftY = Math.cos(elapsedTime * 0.09) * 0.45;
      camera.position.x = mouseState.x * 3 + camDriftX;
      camera.position.y = 7 - mouseState.y * 0.8 + camDriftY;
      camera.lookAt(mouseState.x * 0.8 + camDriftX * 0.25, 2 - mouseState.y * 0.3, -8);

      // Shooting stars — advance each meteor along its arc (or wait out its gap).
      for (let mi = 0; mi < meteors.length; mi++) {
        const m = meteors[mi];
        const p = (elapsedTime - m.startT) / m.dur;
        if (p < 0) { m.mat.opacity = 0; continue; }
        if (p >= 1) { armMeteor(m, elapsedTime); m.mat.opacity = 0; continue; }
        m.mesh.position.set(m.sx + m.dx * p, m.sy + m.dy * p, m.z);
        m.mat.opacity = Math.sin(p * Math.PI) * 0.9; // fade in, peak mid-arc, fade out
      }

      heroGlowLight.intensity = 2.8 + Math.sin(elapsedTime * 0.2) * 0.22;
      heroGlowLight.position.y = 16 + Math.sin(elapsedTime * 0.16) * 0.45;
      skyMaterial.uniforms.uTime.value = elapsedTime;

      for (const heroGlowLayer of heroGlowLayers) {
        heroGlowLayer.material.uniforms.uTime.value = elapsedTime;
        heroGlowLayer.mesh.position.x = heroGlowLayer.baseX + Math.sin(elapsedTime * heroGlowLayer.pulseSpeed + heroGlowLayer.pulsePhase) * heroGlowLayer.driftX;
        heroGlowLayer.mesh.position.y = heroGlowLayer.baseY + Math.cos(elapsedTime * heroGlowLayer.pulseSpeed * 0.8 + heroGlowLayer.pulsePhase) * heroGlowLayer.driftY;
        heroGlowLayer.mesh.position.z = heroGlowLayer.baseZ;
        heroGlowLayer.mesh.rotation.z = heroGlowLayer.baseRotationZ + Math.sin(elapsedTime * 0.05 + heroGlowLayer.pulsePhase) * 0.003;
      }

      for (const treeGroup of trees) {
        const treeData = treeGroup.userData as {
          baseRotationX: number;
          baseRotationZ: number;
          swingPhase: number;
          swingSpeed: number;
          swingAmount: number;
        };
        treeGroup.rotation.x = treeData.baseRotationX + Math.sin(elapsedTime * treeData.swingSpeed + treeData.swingPhase) * treeData.swingAmount;
        treeGroup.rotation.z = treeData.baseRotationZ + Math.cos(elapsedTime * treeData.swingSpeed * 0.7 + treeData.swingPhase) * treeData.swingAmount * 0.7;
      }

      for (const glowLight of glowLights) {
        glowLight.intensity = glowLight.baseIntensity * (0.35 + Math.sin(elapsedTime * glowLight.speed + glowLight.phase) * 0.65);
      }

      for (const mushroomGroup of mushrooms) {
        const mushroomData = mushroomGroup.userData as { pulsePhase: number; pulseSpeed: number };
        mushroomGroup.scale.setScalar(0.9 + (Math.sin(elapsedTime * mushroomData.pulseSpeed + mushroomData.pulsePhase) * 0.5 + 0.5) * 0.15);
      }

      const fireflyPositionAttribute = fireflyGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let fireflyIndex = 0; fireflyIndex < fireflyCount; fireflyIndex++) {
        const baseIndex = fireflyIndex * 3;
        fireflyPositions[baseIndex] = fireflyBasePositions[baseIndex] + Math.sin(elapsedTime * fireflySpeeds[fireflyIndex] * 0.5 + fireflyPhases[fireflyIndex]) * 2.5;
        fireflyPositions[baseIndex + 1] = fireflyBasePositions[baseIndex + 1] + Math.cos(elapsedTime * fireflySpeeds[fireflyIndex] * 0.3 + fireflyPhases[fireflyIndex] * 1.3) * 1;
        fireflyPositions[baseIndex + 2] = fireflyBasePositions[baseIndex + 2] + Math.sin(elapsedTime * fireflySpeeds[fireflyIndex] * 0.4 + fireflyPhases[fireflyIndex] * 0.7) * 2;
      }
      fireflyPositionAttribute.needsUpdate = true;
      fireflyMaterial.uniforms.uTime.value = elapsedTime;

      const dustPositionAttribute = dustGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let dustIndex = 0; dustIndex < dustCount; dustIndex++) {
        const baseIndex = dustIndex * 3;
        dustPositions[baseIndex] += dustVelocities[baseIndex] + Math.sin(elapsedTime * 0.4 + dustIndex) * 0.001;
        dustPositions[baseIndex + 1] += dustVelocities[baseIndex + 1];
        dustPositions[baseIndex + 2] += dustVelocities[baseIndex + 2];
        if (dustPositions[baseIndex + 1] < 0) {
          dustPositions[baseIndex + 1] = 13;
          dustPositions[baseIndex] = (Math.random() - 0.5) * 80;
          dustPositions[baseIndex + 2] = (Math.random() - 0.5) * 80;
        }
      }
      dustPositionAttribute.needsUpdate = true;

      // Drift embers upward with subtle sway, respawn at base when life expires.
      const emberPositionAttribute = emberGeometry.getAttribute('position') as THREE.BufferAttribute;
      // Convert frame time (approx) — animate loop runs ~60fps so use 0.016s
      // step. We're not picky about exact dt here since embers are decorative.
      const emberDt = 1 / 60;
      for (let i = 0; i < emberCount; i++) {
        const base = i * 3;
        emberLifes[i] -= emberDt;
        if (emberLifes[i] <= 0) {
          // Respawn at a random ground-level spot near the hero glow
          const a = Math.random() * Math.PI * 2;
          const r = 6 + Math.random() * 26;
          emberPositions[base]     = Math.cos(a) * r;
          emberPositions[base + 1] = -1 + Math.random() * 2;
          emberPositions[base + 2] = Math.sin(a) * r - 8;
          emberLifes[i] = emberMaxLifes[i];
        } else {
          emberPositions[base]     += emberVelocities[base]
            + Math.sin(elapsedTime * 0.8 + i * 0.7) * 0.004;
          emberPositions[base + 1] += emberVelocities[base + 1];
          emberPositions[base + 2] += emberVelocities[base + 2]
            + Math.cos(elapsedTime * 0.6 + i * 0.5) * 0.004;
        }
      }
      emberPositionAttribute.needsUpdate = true;

      const leafPositionAttribute = leafGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let leafIndex = 0; leafIndex < leafCount; leafIndex++) {
        const baseIndex = leafIndex * 3;
        const drift = leafDrift[leafIndex];
        leafPositions[baseIndex] += Math.sin(elapsedTime * drift.swaySpeed + drift.phase) * drift.swayAmount * 0.02;
        leafPositions[baseIndex + 1] -= drift.fallSpeed;
        leafPositions[baseIndex + 2] += Math.cos(elapsedTime * drift.swaySpeed * 0.7 + drift.phase) * 0.005;
        if (leafPositions[baseIndex + 1] < 0) {
          leafPositions[baseIndex + 1] = 10 + Math.random() * 10;
          leafPositions[baseIndex] = (Math.random() - 0.5) * 60;
          leafPositions[baseIndex + 2] = (Math.random() - 0.5) * 60;
        }
      }
      leafPositionAttribute.needsUpdate = true;

      glowPoolMaterial.uniforms.uTime.value = elapsedTime;
      glowCurtainMaterial.uniforms.uTime.value = elapsedTime;

      for (const rayMesh of rayMeshes) {
        const rayMaterial = rayMesh.material as THREE.ShaderMaterial;
        const pulse = Math.sin(elapsedTime * rayMesh.speed + rayMesh.phase) * 0.5 + 0.5;
        rayMaterial.uniforms.uTime.value = elapsedTime;
        rayMaterial.uniforms.uOpacity.value = rayMesh.baseOpacity * (0.35 + pulse * 0.9);
      }

      puddleMaterial.clearcoatRoughness = 0.02 + Math.sin(elapsedTime * 0.5) * 0.01;
      finalPass.uniforms.uTime.value = elapsedTime;
      composer.render();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    animate();

    const readyFrame = window.requestAnimationFrame(() => {
      onReadyRef.current?.();
    });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.cancelAnimationFrame(animationFrameId);
      window.cancelAnimationFrame(readyFrame);
      meteorTexture.dispose(); // shared streak texture isn't owned by any mesh
      disposeScene(scene);
      scene.clear();
      (bloomPass as unknown as { dispose?: () => void }).dispose?.();
      (ssaoPass as unknown as { dispose?: () => void }).dispose?.();
      (bokehPass as unknown as { dispose?: () => void }).dispose?.();
      (composer as unknown as { dispose?: () => void }).dispose?.();
      renderer.dispose();
    };
  }, [variant]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true" />;
}