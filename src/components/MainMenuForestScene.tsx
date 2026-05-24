import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';

type ForestSceneApi = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  bloomPass: UnrealBloomPass;
  bokehPass: BokehPass;
  finalPass: ShaderPass;
  composer: EffectComposer;
};

type ForestWindow = Window & {
  __forestScene?: ForestSceneApi;
};

type PulsingLight = THREE.PointLight & {
  baseIntensity: number;
  phase: number;
  speed: number;
};

type PulsingRay = THREE.Mesh & {
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
  puddleColor: number;
  moonColor: number;
  haloColors: [number, number];
  fireflyColor: number;
  dustColor: number;
  leafColor: number;
  rayColor: number;
  mistColor: number;
  mushroomGlowColor: number;
  mushroomCapColor: number;
  mushroomCapEmissive: number;
  mushroomStemColor: number;
};

const MAIN_FOREST_SCENE_THEME: ForestSceneTheme = {
  fogColor: 0x071a0e,
  clearColor: 0x001a00,
  skyDeepColor: 0x020603,
  skyMidColor: 0x030a05,
  skyTopColor: 0x010405,
  nebulaColor: 0x06331f,
  starColor: 0xb7d1f0,
  brightStarColor: 0xa8d4ff,
  ambientColor: 0x3a5a3a,
  ambientIntensity: 0.7,
  moonLightColor: 0x7788cc,
  moonLightIntensity: 3.5,
  fillLightColor: 0x4a8a5a,
  fillLightIntensity: 1.8,
  backLightColor: 0x2a6a5a,
  hemisphereSkyColor: 0x4a6a5a,
  hemisphereGroundColor: 0x1a3a1a,
  hemisphereIntensity: 0.7,
  cameraFillColor: 0x4a8a6a,
  cameraFillIntensity: 2.5,
  clearLightColor: 0x3a9a6a,
  clearLightIntensity: 2.5,
  glowColors: [0x2dd4a0, 0x40d080, 0x20c0a0, 0x4a90ff],
  groundColor: 0x2a5a2a,
  puddleColor: 0x0a2a1a,
  moonColor: 0xd0d8ff,
  haloColors: [0x6677bb, 0x4455aa],
  fireflyColor: 0x2dd4a0,
  dustColor: 0x5aaa7a,
  leafColor: 0x3a6a2a,
  rayColor: 0x4466aa,
  mistColor: 0x0a3a18,
  mushroomGlowColor: 0x2dd4a0,
  mushroomCapColor: 0x1a6b4a,
  mushroomCapEmissive: 0x18b878,
  mushroomStemColor: 0x2a4a35,
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
  puddleColor: 0x1f160d,
  moonColor: 0xffe6b4,
  haloColors: [0xffc66b, 0xff9d3a],
  fireflyColor: 0xffd27a,
  dustColor: 0x8c6b2a,
  leafColor: 0xc9a34f,
  rayColor: 0xf0b04e,
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
  bloomStrength: 1.5,
  bloomThreshold: 0.2,
  exposure: 1.8,
  vignetteStrength: 0.4,
  grainIntensity: 0.02,
  contrast: 1.12,
  dofFocus: 22,
  dofAperture: 0.0008,
  chromaticAberration: 0.003,
} as const;

function randomRange(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
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

export default function MainMenuForestScene({ variant = 'main', onReady }: MainMenuForestSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const theme = FOREST_SCENE_THEMES[variant];

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.FogExp2(new THREE.Color(theme.fogColor), 0.018);

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
    renderer.toneMappingExposure = 1.8;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(theme.clearColor, 1);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 300);
    camera.position.set(0, 7, 28);
    camera.lookAt(0, 2, -8);

    const mouseState = { x: 0, y: 0, targetX: 0, targetY: 0 };

    const skyGeometry = new THREE.SphereGeometry(150, 20, 20);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
        uSkyDeep: { value: new THREE.Color(theme.skyDeepColor) },
        uSkyMid: { value: new THREE.Color(theme.skyMidColor) },
        uSkyTop: { value: new THREE.Color(theme.skyTopColor) },
        uNebulaColor: { value: new THREE.Color(theme.nebulaColor) },
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
        void main() {
          vec3 direction = normalize(vWorldPos);
          float y = direction.y;
          vec3 color = mix(
            mix(uSkyDeep, uSkyMid, smoothstep(-0.1, 0.2, y)),
            uSkyTop, smoothstep(0.2, 0.8, y)
          );
          vec2 uv = direction.xz / (y + 0.5) * 2.0;
          float nebula = fbm(uv * 1.5 + uTime * 0.02);
          nebula = smoothstep(0.3, 0.7, nebula) * smoothstep(0.05, 0.4, y) * (1.0 - smoothstep(0.4, 0.9, y));
          color += uNebulaColor * nebula * 0.8;
          float starField = hash(floor(direction.xz * 300.0));
          color += uStarColor * smoothstep(0.997, 1.0, starField) * smoothstep(0.15, 0.5, y)
            * (sin(uTime * (2.0 + starField * 5.0) + starField * 100.0) * 0.5 + 0.5) * 0.8;
          float brightStar = hash(floor(direction.xz * 80.0));
          color += uBrightStarColor * smoothstep(0.995, 1.0, brightStar) * smoothstep(0.2, 0.6, y)
            * (sin(uTime * 1.5 + brightStar * 50.0) * 0.3 + 0.7);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(skyGeometry, skyMaterial));

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

    const groundMaterial = new THREE.MeshStandardMaterial({ color: theme.groundColor, roughness: 0.92, metalness: 0 });
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

    for (let puddleIndex = 0; puddleIndex < 2; puddleIndex++) {
      const radius = 1 + Math.random() * 1.5;
      const puddlePatchGeometry = new THREE.CircleGeometry(radius, 16);
      puddlePatchGeometry.rotateX(-Math.PI / 2);
      const puddlePatchMaterial = puddleMaterial.clone();
      puddlePatchMaterial.opacity = 0.6 + Math.random() * 0.2;
      const puddlePatch = new THREE.Mesh(puddlePatchGeometry, puddlePatchMaterial);
      const puddleX = -4 + Math.random() * 10;
      const puddleZ = 4 + Math.random() * 8;
      puddlePatch.position.set(puddleX, heightAt(puddleX, puddleZ) + 0.03, puddleZ);
      puddlePatch.receiveShadow = true;
      scene.add(puddlePatch);
    }

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
    const trunkGeometries = [
      new THREE.CylinderGeometry(0.3, 0.5, 8, 6),
      new THREE.CylinderGeometry(0.4, 0.65, 10, 6),
      new THREE.CylinderGeometry(0.5, 0.75, 12, 6),
    ];

    const createPineTree = (scale: number): THREE.Group => {
      const treeGroup = new THREE.Group();
      const sizeIndex = scale < 0.7 ? 0 : scale < 1.1 ? 1 : 2;
      const trunkHeight = [8, 10, 12][sizeIndex];
      const trunk = new THREE.Mesh(trunkGeometries[sizeIndex], trunkMaterials[sizeIndex > 1 ? 0 : 1]);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      treeGroup.add(trunk);

      const tierCount = 3 + (sizeIndex > 1 ? 1 : 0);
      for (let tierIndex = 0; tierIndex < tierCount; tierIndex++) {
        const tierRadius = (3.5 - tierIndex * 0.5) * randomRange(0.75, 1.25);
        const tierHeight = (7 - tierIndex * 1.1) * randomRange(0.8, 1.1);
        const foliage = new THREE.Mesh(
          new THREE.ConeGeometry(tierRadius, tierHeight, 6),
          foliageMaterials[Math.floor(Math.random() * foliageMaterials.length)],
        );
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
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, trunkHeight, 5), trunkMaterials[1]);
      trunk.position.y = trunkHeight / 2;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const branchCount = 2 + Math.floor(Math.random() * 2);
      for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
        const branchLength = 1 + Math.random() * 2;
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, branchLength, 3), trunkMaterials[1]);
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
      const treeScale = baseScale * distanceScale;
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

    for (let rockIndex = 0; rockIndex < 30; rockIndex++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 4 + Math.random() * 50;
      const rockX = Math.cos(angle) * distance;
      const rockZ = Math.sin(angle) * distance;
      const rockScale = 0.15 + Math.random() * 0.6;
      const rockGeometry = new THREE.DodecahedronGeometry(rockScale, 0);
      const rockPositions = rockGeometry.getAttribute('position');
      for (let vertexIndex = 0; vertexIndex < rockPositions.count; vertexIndex++) {
        rockPositions.setX(vertexIndex, rockPositions.getX(vertexIndex) * (0.6 + Math.random() * 0.8));
        rockPositions.setY(vertexIndex, rockPositions.getY(vertexIndex) * (0.4 + Math.random() * 0.5));
        rockPositions.setZ(vertexIndex, rockPositions.getZ(vertexIndex) * (0.6 + Math.random() * 0.8));
      }
      rockGeometry.computeVertexNormals();
      const rockMesh = new THREE.Mesh(rockGeometry, rockMaterial);
      rockMesh.position.set(rockX, heightAt(rockX, rockZ) + rockScale * 0.15, rockZ);
      rockMesh.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, 0);
      rockMesh.castShadow = true;
      rockMesh.receiveShadow = true;
      scene.add(rockMesh);
    }

    for (let fernIndex = 0; fernIndex < 35; fernIndex++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 3 + Math.random() * 40;
      const fernX = Math.cos(angle) * distance;
      const fernZ = Math.sin(angle) * distance;
      const fernScale = 0.4 + Math.random() * 1.2;
      const fernMesh = new THREE.Mesh(new THREE.PlaneGeometry(fernScale, fernScale * 0.5), fernMaterial);
      fernMesh.position.set(fernX, heightAt(fernX, fernZ) + fernScale * 0.2, fernZ);
      fernMesh.rotation.x = -0.5;
      fernMesh.rotation.y = Math.random() * Math.PI * 2;
      scene.add(fernMesh);
    }

    for (let logIndex = 0; logIndex < 8; logIndex++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 6 + Math.random() * 35;
      const logX = Math.cos(angle) * distance;
      const logZ = Math.sin(angle) * distance;
      const logLength = 3 + Math.random() * 4;
      const logRadius = 0.12 + Math.random() * 0.2;
      const logGeometry = new THREE.CylinderGeometry(logRadius * 0.7, logRadius, logLength, 5);
      logGeometry.rotateZ(Math.PI / 2);
      const logMesh = new THREE.Mesh(logGeometry, logMaterial);
      logMesh.position.set(logX, heightAt(logX, logZ) + logRadius * 0.6, logZ);
      logMesh.rotation.y = Math.random() * Math.PI;
      logMesh.castShadow = true;
      logMesh.receiveShadow = true;
      scene.add(logMesh);
    }

    const mushroomGlowMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.mushroomGlowColor,
      emissive: theme.mushroomGlowColor,
      emissiveIntensity: 4,
      roughness: 0.3,
      metalness: 0.1,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
    });
    const mushroomCapMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.mushroomCapColor,
      emissive: theme.mushroomCapEmissive,
      emissiveIntensity: 2,
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

    const fireflyCount = 100;
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
    for (let rayIndex = 0; rayIndex < 5; rayIndex++) {
      const rayWidth = 0.4 + Math.random() * 1.8;
      const rayMaterial = new THREE.MeshBasicMaterial({
        color: theme.rayColor,
        transparent: true,
        opacity: 0.02 + Math.random() * 0.03,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const rayMesh = new THREE.Mesh(new THREE.PlaneGeometry(rayWidth, 30), rayMaterial) as unknown as PulsingRay;
      rayMesh.position.set(-10 + rayIndex * 5 + Math.random() * 3, 13, -18 + Math.random() * 14);
      rayMesh.rotation.x = -0.05;
      rayMesh.rotation.z = (Math.random() - 0.5) * 0.12;
      rayMesh.baseOpacity = rayMaterial.opacity;
      rayMesh.phase = Math.random() * Math.PI * 2;
      rayMesh.speed = 0.12 + Math.random() * 0.25;
      rayGroup.add(rayMesh);
      rayMeshes.push(rayMesh);
    }
    scene.add(rayGroup);

    for (let mistIndex = 0; mistIndex < 3; mistIndex++) {
      const mistMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(150, 6),
        new THREE.MeshBasicMaterial({
          color: theme.mistColor,
          transparent: true,
          opacity: 0.025 + mistIndex * 0.012,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mistMesh.position.set(0, 0.3 + mistIndex * 0.6, -3 - mistIndex * 12);
      mistMesh.rotation.x = -Math.PI / 2;
      scene.add(mistMesh);
    }

    const composer = new EffectComposer(renderer);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    composer.addPass(new RenderPass(scene, camera));

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
      maxblur: 0.005,
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
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime, uVignette, uGrain, uContrast, uChromatic;
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

    const forestSceneApi: ForestSceneApi = { renderer, scene, camera, bloomPass, bokehPass, finalPass, composer };
    (window as ForestWindow).__forestScene = forestSceneApi;

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
      bloomPass.setSize(width, height);
      finalPass.uniforms.uResolution.value.set(width, height);
      fireflyMaterial.uniforms.uPR.value = renderer.getPixelRatio();
    };

    const animate = () => {
      animationFrameId = window.requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsedTime = clock.getElapsedTime();

      mouseState.x += (mouseState.targetX - mouseState.x) * 0.02;
      mouseState.y += (mouseState.targetY - mouseState.y) * 0.02;

      camera.position.x = mouseState.x * 3;
      camera.position.y = 7 - mouseState.y * 0.8;
      camera.lookAt(mouseState.x * 0.8, 2 - mouseState.y * 0.3, -8);

      skyMaterial.uniforms.uTime.value = elapsedTime;

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

      for (const rayMesh of rayMeshes) {
        const rayMaterial = rayMesh.material as THREE.MeshBasicMaterial;
        rayMaterial.opacity = rayMesh.baseOpacity * (0.2 + (Math.sin(elapsedTime * rayMesh.speed + rayMesh.phase) * 0.5 + 0.5) * 0.8);
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
      onReady?.();
    });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.cancelAnimationFrame(animationFrameId);
      window.cancelAnimationFrame(readyFrame);
      (window as ForestWindow).__forestScene = undefined;
      disposeScene(scene);
      scene.clear();
      (bloomPass as unknown as { dispose?: () => void }).dispose?.();
      (bokehPass as unknown as { dispose?: () => void }).dispose?.();
      (composer as unknown as { dispose?: () => void }).dispose?.();
      renderer.dispose();
    };
  }, [variant]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true" />;
}