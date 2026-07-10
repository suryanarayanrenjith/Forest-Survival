import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { getSoftSparkTexture } from '../utils/Effects';
import {
  gameSettingsManager,
  resolveGraphicsPreset,
  type GraphicsQuality,
  type ShadowQuality,
  type UserSettings,
} from '../utils/GameSettingsManager';

type SceneVariant = 'main' | 'classic' | 'tutorial' | 'multiplayer';

type MainMenuForestSceneProps = {
  variant?: SceneVariant;
  onReady?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// SUNLIT CLEARING — menu backdrop.
//
// The old scene fought a losing battle against its own darkness: the forest
// floor was `dark ground texture × dark green color × lights`, which multiplies
// down to near-black in linear space. This build makes a dark lower frame
// STRUCTURALLY impossible:
//
//   1. The ground's colors are AUTHORED in a shader (moss → sunlit sage) and
//      clamped to a luminance floor. There is no albedo×texture×light
//      multiplication chain that can crush it.
//   2. The sky dome covers every direction, INCLUDING below the horizon,
//      where it continues into bright ground-haze.
//   3. Ground fog, tree fog, ridge fog, mist banks and the dome haze all
//      converge on the SAME haze color, so the ground/sky seam cannot render
//      as an edge, no matter where the camera drifts.
//   4. The camera orbits gently around a FIXED look target, so its pitch is
//      near-constant — the horizon stays put — and the horizon itself is
//      dissolved inside bright mist banks anyway.
//   5. The final grade applies vignette only above the frame's midline, then
//      enforces `color = max(color, hazeTone × bottomRamp)` — a hard floor of
//      brightness for the lower frame that no upstream pass can defeat.
//
// CINEMATIC LAYER (this pass): the scene now renders through a settings-gated
// post pipeline (bloom → screen-space crepuscular rays → filmic grade) and
// carries golden-hour lighting cues that read as ray-traced without any of
// the banned techniques:
//   • foliage rim/backlight translucency (sun glowing THROUGH canopy edges)
//   • analytic sun-stretched cast shadows + trunk-streak canopy dapple on the
//     ground, authored in-shader — NO shadow maps, capped darkening, applied
//     BEFORE the luminance floor so they can never crush the frame
//   • dew specular glints on the moss inside the sun pool
//   • quality-gated cumulus with a silver lining hugging the sun
//   • floating dust motes catching the light on higher tiers
//
// SETTINGS SYNC: the scene reads Settings → Display live. Preset tier gates
// the cinematic budget (ray samples, bloom, shaft count, sky detail); the
// individual knobs map 1:1 — resolution → render scale, shadows → analytic
// shadow strength/length, particle density → pollen/leaf/mote counts,
// terrain detail → tree/grass/fern/rock density + ground micro-detail,
// view distance → atmospheric depth (fog density), post-processing → the
// composer path, FPS cap → the menu render loop. Everything applies WITHOUT
// a rebuild except MSAA, which owns the canvas context and forces one.
//
// PER-MENU VIEWS: each menu (main / classic / tutorial / multiplayer) owns a
// set of authored camera rigs; entering a menu picks one at random (plus
// jitter) and the camera eases over. All rigs share near-identical pitch so
// the horizon stays low and steady — the invariant that keeps the lower
// frame luminous survives every vantage.
// ─────────────────────────────────────────────────────────────────────────────

const PALETTE = {
  // The ONE haze color everything converges to. Deep sunlit sage — luminous
  // enough that the black-box guarantees hold, deep enough that white UI
  // text keeps contrast against it (the old brighter sage washed the frame
  // out and fought every light-on-glass menu card).
  haze: 0xafc492,
  skyZenith: 0x4a8ed2,
  skyMid: 0x8ec1ea,
  skyHorizon: 0xeee4bd,
  hazeFloor: 0xb9cc9b,
  cloud: 0xffffff,
  sunCore: 0xfff6d8,
  sunHalo: 0xffe1a1,
  // Ground ramp — authored, never multiplied against a texture.
  mossDeep: 0x466f33,
  mossLight: 0x6f9a4a,
  sunPool: 0xd6c17c,
  groundFloorMin: 0x3c5a2e,
  sunGlint: 0xfff3c8,
  soil: 0x6d5c39,
  litter: 0x8f7f52,
  // Forest — richer, deeper greens so the tree wall reads as forest depth
  // (and as a contrast bed for the menu cards) instead of pastel cones.
  foliage: [0x2f7c3d, 0x468a44, 0x276d35, 0x3f8f4e],
  foliageTip: 0x9fc261,
  trunk: 0x7d5940,
  rimGlow: 0xffe2a4,
  castShadow: 0x24401f,
  ridgeNear: 0x7fa473,
  ridgeFar: 0x93b285,
  // Atmosphere
  mistBank: 0xcbdaae,
  groundMist: 0xc3d5a2,
  shaft: 0xffe9b0,
  pollen: 0xffe9b6,
  mote: 0xfff0c9,
  leaf: 0x7fae57,
  // Lights
  ambient: 0xb9d6a6,
  hemiSky: 0xbfe0f5,
  hemiGround: 0x6f8f56,
  sunLight: 0xffe9b0,
  rimLight: 0xd6ffc0,
  // Final grade
  gradeMist: 0xb5c48f,
  gradeSun: 0xffe5b1,
} as const;

const SCENE_TUNING = {
  fogDensity: 0.0085,
  exposure: 1.2,
  // Bloom is tuned TIGHT: with a bright daylight sky, a low threshold makes
  // the whole frame blossom into glare (and washes the UI). Only genuinely
  // hot pixels — the sun disc, its halo, dew glints — may bloom.
  bloomRadius: 0.55,
  bloomThreshold: 0.85,
  vignette: 0.3,
  grain: 0.006,
  // Filmic punch: the deeper palette needs real contrast/saturation to read
  // as cinema instead of fog — and the extra contrast is exactly what makes
  // the light-on-glass UI text pop against the backdrop.
  contrast: 1.15,
  saturation: 1.13,
  chromatic: 0.0012,
  // Screen-space bottom haze: mix amount + the guaranteed max() floor.
  // The mix is a safety tint, not a look — keep it low so the authored
  // forest-floor detail stays readable right down to the frame edge.
  bottomMistMix: 0.11,
  bottomMistFloor: 0.3,
} as const;

// ── Settings → cinematic budget ──────────────────────────────────────────────
// Tier index gates the qualitative features the numeric knobs don't cover.
// Order matches GraphicsQuality: ultralow / low / medium / high / ultra.
const TIER_INDEX: Record<GraphicsQuality, number> = {
  ultralow: 0, low: 1, medium: 2, high: 3, ultra: 4,
};
const TIER_FEATURES = {
  /** Crepuscular-ray march samples in the grade pass (post tiers only). */
  raySamples: [0, 0, 12, 18, 24],
  bloomStrength: [0, 0, 0.32, 0.4, 0.48],
  /** Visible 3D volumetric light blades. */
  shaftCount: [3, 4, 6, 7, 8],
  /** Foliage rim/backlight glow strength. */
  rimStrength: [0.4, 0.5, 0.72, 0.9, 1.05],
  /** Large bokeh dust motes drifting through the light. */
  motesEnabled: [false, false, true, true, true],
  /** Extra cumulus layer + silver lining in the sky shader. */
  skyDetail: [0, 0, 1, 1, 1],
} as const;

// Analytic (shader-authored) shadows — the ONLY shadows in this scene. Real
// shadow maps stay banned here: they are the single easiest way for the
// floor to go dark again. Strengths are capped so shadow × ground can never
// fall below the ground shader's luminance floor.
const GROUND_SHADOW_STRENGTH: Record<ShadowQuality, number> = {
  off: 0, low: 0.35, medium: 0.6, high: 0.8, ultra: 0.95,
};
const CAST_SHADOW_CFG: Record<ShadowQuality, { len: number; opacity: number }> = {
  off: { len: 0, opacity: 0 },
  low: { len: 2.8, opacity: 0.22 },
  medium: { len: 3.6, opacity: 0.28 },
  high: { len: 4.4, opacity: 0.34 },
  ultra: { len: 5.2, opacity: 0.4 },
};

// ── Per-menu camera rigs ─────────────────────────────────────────────────────
// Every rig keeps the same near-flat pitch (camera ~1–2° below its target's
// height over ~50m) so the horizon sits low and STILL in frame from every
// vantage — the black-bar-proofing depends on that. Identity comes from
// lateral position, yaw and focal length, never from pitch.
type CameraRig = { position: [number, number, number]; target: [number, number, number]; fov: number };
const CAMERA_RIGS: Record<SceneVariant, CameraRig[]> = {
  main: [
    { position: [0, 5.6, 26], target: [0, 7.2, -28], fov: 44 },
    { position: [-3.5, 5.9, 27], target: [2.5, 7.0, -27], fov: 45 },
    { position: [3.2, 5.3, 25], target: [-2.5, 7.3, -30], fov: 43 },
  ],
  classic: [
    { position: [-6.5, 5.1, 22], target: [4.5, 6.8, -30], fov: 46 },
    { position: [6.5, 5.0, 23], target: [-3.5, 6.7, -27], fov: 45 },
    { position: [-2, 4.7, 20], target: [1.5, 6.5, -32], fov: 47 },
  ],
  tutorial: [
    { position: [0, 6.5, 30], target: [0, 7.6, -24], fov: 42 },
    { position: [4.5, 6.1, 29], target: [-4, 7.3, -27], fov: 43 },
    { position: [-5, 6.3, 30], target: [3.5, 7.4, -25], fov: 42 },
  ],
  multiplayer: [
    { position: [-8, 6.6, 24], target: [6, 7.0, -25], fov: 46 },
    { position: [8, 6.4, 25], target: [-5.5, 7.1, -26], fov: 46 },
    { position: [0.5, 7.2, 31], target: [0, 7.4, -23], fov: 44 },
  ],
};

// Hard allocation ceilings — everything scalable is allocated ONCE at its
// maximum and gated live via InstancedMesh.count / drawRange, so settings
// changes never rebuild geometry.
const POLLEN_MAX = 240;
const MOTE_MAX = 70;
const LEAF_MAX = 30;
const BLADE_MAX = 320;
const FERN_MAX = 96;
const ROCK_MAX = 18;
const SHAFT_MAX = 8;

// Keeps props/trees out of the space the menu UI occupies (the clearing the
// camera looks across). Same footprint the previous scene used.
function isUiClearZone(x: number, z: number): boolean {
  const normalizedX = x / 12;
  const normalizedZ = (z - 8) / 22;
  return normalizedX * normalizedX + normalizedZ * normalizedZ < 1;
}

// Gentle terrain undulation — soft enough that the floor never folds into
// self-shadowed hollows.
function heightAt(x: number, z: number): number {
  return Math.sin(x * 0.06) * 0.5 + Math.cos(z * 0.08) * 0.4 + Math.sin(x * 0.2 + z * 0.15) * 0.2;
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

  const tryAddPoint = (x: number, z: number): boolean => {
    const gridX = Math.floor((x + width / 2) / cellSize);
    const gridZ = Math.floor((z + height / 2) / cellSize);
    if (gridX < 0 || gridX >= gridWidth || gridZ < 0 || gridZ >= gridHeight) return false;

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
    grid[gridZ * gridWidth + gridX] = points.length - 1;
    activePointIndices.push(points.length - 1);
    return true;
  };

  tryAddPoint(20, -15);

  while (activePointIndices.length > 0 && points.length < 400) {
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
    // Keep the walked path into the clearing open.
    if (Math.hypot(point.x, point.z - 22) < 14) return false;
    if (Math.abs(point.x) < 5 && point.z > 8 && point.z < 35) return false;
    // Clear bubble around the camera so nothing clips the lens edge — sized
    // for the widest rig offsets across every menu variant.
    if (Math.hypot(point.x, point.z - 27) < 17) return false;
    if (isUiClearZone(point.x, point.z)) return false;
    return true;
  });
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

// Shared GLSL value-noise + fbm, injected into the sky and ground shaders.
const GLSL_NOISE = /* glsl */ `
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
`;

export default function MainMenuForestScene({ variant = 'main', onReady }: MainMenuForestSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  // Bumped when the browser reclaims our WebGL context (e.g. context-loss
  // after heavy dev hot-reload churn) — re-runs the scene effect so the
  // backdrop rebuilds itself instead of freezing on a dead context.
  const [contextGeneration, setContextGeneration] = useState(0);
  // Bumped when the MSAA setting changes: canvas context attributes are
  // immutable, so honouring an antialias flip needs a FRESH canvas element
  // (the key below) + a full scene rebuild. Every other graphics setting
  // applies live without touching the scene graph.
  const [aaGeneration, setAaGeneration] = useState(0);

  // The active menu drives WHICH authored camera rig the scene eases toward.
  // It must never re-run the heavy build effect — menu navigation only nudges
  // the camera, it never rebuilds the forest.
  const variantRef = useRef<SceneVariant>(variant);
  const rigControlRef = useRef<((nextVariant: SceneVariant) => void) | null>(null);
  // Set immediately before an AA-triggered canvas swap: tells the OUTGOING
  // canvas's cleanup to release its WebGL context for real (that element is
  // leaving the DOM forever). This must be an explicit flag — inferring the
  // swap from `canvasRef.current` misfires under StrictMode's simulated
  // unmount (refs detach before cleanup runs), which would force-lose the
  // context the immediate remount is about to REUSE and crash the renderer.
  const releaseContextOnCleanupRef = useRef(false);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    variantRef.current = variant;
    rigControlRef.current?.(variant);
  }, [variant]);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const settingsAtBuild = gameSettingsManager.getSettings();
    const presetAtBuild = resolveGraphicsPreset(settingsAtBuild.graphics);
    // MSAA is baked into the context; remembered so the settings subscription
    // knows when a change requires the canvas-swap rebuild path.
    const appliedAntialias = presetAtBuild.antialias;

    // React StrictMode deliberately mounts, cleans up, then mounts effects
    // again in development. A CanvasTexture upload in the first pass leaves
    // these WebGL pixel-store flags enabled on the canvas' *reused* context.
    // Three creates its built-in 2D-array and 3D fallback textures before it
    // resets those flags, and Chromium rejects those texImage3D uploads. Own
    // the context here so it is clean before Three initializes either pass.
    const webglContext = canvasElement.getContext('webgl2', {
      alpha: true,
      antialias: appliedAntialias,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!webglContext) return;

    // A reused canvas can hand back a context that is currently LOST (a
    // forced release racing a remount, or the browser reclaiming GPU while
    // the tab was hidden). Three's WebGLRenderer reads
    // `context.getContextAttributes().alpha` at construction, and that call
    // returns null on a lost context — building on one is a guaranteed
    // crash. Nudge the context back to life instead and let the restoration
    // event re-run this effect; until then the luminous CSS fallback shows.
    if (webglContext.isContextLost()) {
      const handleEarlyRestore = () => setContextGeneration((generation) => generation + 1);
      canvasElement.addEventListener('webglcontextrestored', handleEarlyRestore, { once: true });
      try {
        webglContext.getExtension('WEBGL_lose_context')?.restoreContext();
      } catch {
        // Restoration isn't guaranteed — the fallback artwork stays up and
        // no failure mode reaches the renderer.
      }
      return () => {
        canvasElement.removeEventListener('webglcontextrestored', handleEarlyRestore);
      };
    }

    const resetTextureUploadState = () => {
      try {
        webglContext.pixelStorei(webglContext.UNPACK_FLIP_Y_WEBGL, false);
        webglContext.pixelStorei(webglContext.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      } catch {
        // A context can be lost while React is unmounting; the CSS fallback
        // remains visible and the restoration handler below rebuilds the scene.
      }
    };
    resetTextureUploadState();

    const getViewportSize = () => {
      const bounds = canvasElement.getBoundingClientRect();
      return {
        width: Math.max(1, Math.round(bounds.width || window.innerWidth)),
        height: Math.max(1, Math.round(bounds.height || window.innerHeight)),
      };
    };
    const initialViewport = getViewportSize();
    // Refined by applyGraphics below (resolution knob × devicePixelRatio).
    let effectivePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.FogExp2(new THREE.Color(PALETTE.haze), SCENE_TUNING.fogDensity);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasElement,
      context: webglContext,
      antialias: appliedAntialias,
      // alpha:true is a SAFETY property, not a visual one: rendered frames
      // are fully opaque (clearAlpha 1), but if the canvas ever stops
      // presenting (lost context, driver reset), a transparent canvas lets
      // the luminous CSS gradient behind it show through. With alpha:false
      // the same failure composites as a solid BLACK screen.
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    renderer.setPixelRatio(effectivePixelRatio);
    // Keep the canvas' CSS dimensions owned by its fixed, inset-0 host. The
    // drawing buffer follows that host exactly, including dynamic viewports.
    renderer.setSize(initialViewport.width, initialViewport.height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = SCENE_TUNING.exposure;
    // No shadow maps anywhere in this scene — shadowing is the single easiest
    // way for the floor to go dark again. The Settings "shadows" quality maps
    // to the ANALYTIC shadows instead (in-shader canopy dapple + instanced
    // sun-stretched contact ellipses), which are capped and floor-clamped.
    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Leave a transparent clear behind the scene. The sky dome renders the
    // normal full-frame background; if a browser loses its WebGL context or a
    // shader is rejected, the forest fallback behind this canvas still shows.
    renderer.setClearColor(new THREE.Color(PALETTE.haze), 0);

    // ── CAMERA — per-menu rigs, fixed-pitch, gentle positional orbit ────────
    // The camera looks slightly UP at a fixed per-rig target, so the horizon
    // sits low in frame (~40% up) and sky + canopy own the top of the screen.
    // Menu navigation eases position/target/fov toward the incoming menu's
    // randomly-picked rig; because every rig shares the same near-flat pitch,
    // the horizon never wanders vertically — only the vantage changes.
    const camera = new THREE.PerspectiveCamera(44, initialViewport.width / initialViewport.height, 0.5, 400);
    const rigPosition = new THREE.Vector3();
    const rigTarget = new THREE.Vector3();
    const rigDesiredPosition = new THREE.Vector3();
    const rigDesiredTarget = new THREE.Vector3();
    let desiredFov = 44;
    let currentFov = 44;

    const pickRig = (nextVariant: SceneVariant) => {
      const rigs = CAMERA_RIGS[nextVariant] ?? CAMERA_RIGS.main;
      const rig = rigs[Math.floor(Math.random() * rigs.length)];
      // Jitter keeps repeat visits to the same menu from framing identically.
      // Kept small enough that the camera stays inside its tree-free bubble.
      rigDesiredPosition.set(
        rig.position[0] + (Math.random() - 0.5) * 2.4,
        rig.position[1] + (Math.random() - 0.5) * 0.5,
        rig.position[2] + (Math.random() - 0.5) * 2.0,
      );
      rigDesiredTarget.set(
        rig.target[0] + (Math.random() - 0.5) * 1.6,
        rig.target[1] + (Math.random() - 0.5) * 0.3,
        rig.target[2],
      );
      desiredFov = rig.fov + (Math.random() - 0.5) * 1.5;
    };
    pickRig(variantRef.current);
    // First frame starts ON the rig (no fly-in from origin).
    rigPosition.copy(rigDesiredPosition);
    rigTarget.copy(rigDesiredTarget);
    currentFov = desiredFov;
    camera.fov = currentFov;
    camera.position.copy(rigPosition);
    camera.lookAt(rigTarget);
    camera.updateProjectionMatrix();
    rigControlRef.current = pickRig;

    const mouseState = { x: 0, y: 0, targetX: 0, targetY: 0 };

    // ── SKY DOME — covers EVERY direction, below-horizon included ──────────
    // Below y=0 the dome renders bright ground-haze, so even a pixel missed
    // by all geometry shows luminous sage. Rendered first, no depth.
    // The sun sits low (≈12° elevation) at the upper-LEFT of frame — golden
    // hour light grazing the canopy, with the disc peeking through the
    // tree-line so the screen-space rays have silhouettes to break against.
    // Screen-left is deliberate UI composition: every hot cinematic element
    // (halo, bloom, god rays, streak) lands on the TITLE side of the frame,
    // leaving the right action column against calm, deep forest where the
    // glassy menu cards keep maximum contrast.
    const sunDirection = new THREE.Vector3(-0.26, 0.22, -0.94).normalize();
    const skyGeometry = new THREE.SphereGeometry(170, 48, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uZenith: { value: new THREE.Color(PALETTE.skyZenith) },
        uMid: { value: new THREE.Color(PALETTE.skyMid) },
        uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
        uHazeFloor: { value: new THREE.Color(PALETTE.hazeFloor) },
        uCloud: { value: new THREE.Color(PALETTE.cloud) },
        uSunCore: { value: new THREE.Color(PALETTE.sunCore) },
        uSunHalo: { value: new THREE.Color(PALETTE.sunHalo) },
        uSunDir: { value: sunDirection },
        uSkyDetail: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uSkyDetail;
        uniform vec3 uZenith, uMid, uHorizon, uHazeFloor, uCloud, uSunCore, uSunHalo;
        uniform vec3 uSunDir;
        varying vec3 vWorldPos;
        ${GLSL_NOISE}
        void main() {
          vec3 direction = normalize(vWorldPos);
          float y = direction.y;

          // Above horizon: warm cream → mid blue → zenith blue.
          vec3 sky = mix(uHorizon, uMid, smoothstep(0.02, 0.34, y));
          sky = mix(sky, uZenith, smoothstep(0.30, 0.85, y));

          // Below horizon: the luminous haze floor. This is the structural
          // guarantee — there is no direction in which the dome is dark.
          vec3 below = mix(uHorizon, uHazeFloor, 1.0 - smoothstep(-0.35, -0.02, y));
          vec3 color = mix(below, sky, smoothstep(-0.02, 0.03, y));

          // Sun: hot core, warm halo, restrained atmospheric wash. The core
          // stays HDR-hot so the bloom pass blossoms it naturally, but the
          // halo/wash terms are kept TIGHT — a wide wash here floods half
          // the frame with white glare and drowns the menu UI.
          float sunDot = max(dot(direction, uSunDir), 0.0);
          float sunCore = pow(sunDot, 1400.0);
          float sunHalo = pow(sunDot, 40.0);
          float sunWash = pow(sunDot, 6.0);
          color += uSunHalo * (sunHalo * 0.36 + sunWash * 0.09);
          color += uSunCore * sunCore * 2.4;

          // Slow cirrus drift, kept above the tree line.
          float safeY = max(0.22, y + 0.6);
          vec2 cloudUv = direction.xz / safeY;
          float drift = uTime * 0.02;
          float cirrus = smoothstep(0.52, 0.84, fbm(cloudUv * 1.3 + vec2(drift, -drift * 0.4)));
          cirrus *= smoothstep(0.06, 0.45, y) * (1.0 - smoothstep(0.7, 1.0, y));
          color = mix(color, uCloud, cirrus * 0.22);

          // Quality-gated cumulus: puffy mid-sky clouds with a sun-facing
          // silver lining — the "expensive sky" cue on medium tiers and up.
          if (uSkyDetail > 0.5) {
            vec2 cumulusUv = cloudUv * 0.55 + vec2(uTime * 0.008, uTime * 0.003);
            float puff = fbm(cumulusUv * 2.0 + fbm(cumulusUv * 4.6) * 0.7);
            puff = smoothstep(0.56, 0.78, puff);
            puff *= smoothstep(0.04, 0.26, y) * (1.0 - smoothstep(0.5, 0.85, y));
            float lining = pow(sunDot, 10.0);
            vec3 cloudColor = mix(uCloud * 0.985, uSunHalo * 1.22, lining * 0.7);
            color = mix(color, cloudColor, puff * 0.46);
          }

          // Soft vapor band hugging the horizon (both sides of it).
          float band = exp(-abs(y - 0.015) * 9.0);
          color = mix(color, uHorizon, band * 0.4);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    skyMesh.renderOrder = -100;
    skyMesh.frustumCulled = false;
    scene.add(skyMesh);

    // ── LIGHT RIG — bright, shadowless, ALLOCATED ONCE ──────────────────────
    // (Never add/remove lights at runtime — the rig is fixed for the scene's
    // whole life; quality tiers modulate shaders, not lights.)
    // Key-to-fill ratio is deliberately steep: a strong directional key with
    // restrained ambient/hemi fill is what models the pine tiers into round,
    // lit-vs-shaded forms — the old near-flat rig is why the trees read as
    // untextured cones. Fill floors are still high enough that no facet can
    // approach black.
    scene.add(new THREE.AmbientLight(PALETTE.ambient, 0.58));
    scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.78));
    const sunLight = new THREE.DirectionalLight(PALETTE.sunLight, 3.3);
    sunLight.position.set(-45, 52, -28);
    scene.add(sunLight);
    const rimLight = new THREE.DirectionalLight(PALETTE.rimLight, 1.0);
    rimLight.position.set(14, 22, -60);
    scene.add(rimLight);

    // ── GROUND — authored gradient shader, luminance-clamped ───────────────
    // No lights, no shadow maps, no albedo multiplication. The floor's tones
    // are written directly: mossy dapple near the lens melting into the shared
    // haze color with distance (manual FogExp2 match), warmed inside a sun
    // pool, dappled by ANALYTIC canopy shadows (capped, pre-floor), glinted
    // with dew specular, and clamped so no pixel can fall below a sunlit
    // minimum.
    const groundGeometry = new THREE.PlaneGeometry(220, 220, 96, 96);
    groundGeometry.rotateX(-Math.PI / 2);
    groundGeometry.translate(0, 0, -10);
    const groundPositions = groundGeometry.getAttribute('position');
    for (let vertexIndex = 0; vertexIndex < groundPositions.count; vertexIndex++) {
      const vertexX = groundPositions.getX(vertexIndex);
      const vertexZ = groundPositions.getZ(vertexIndex);
      groundPositions.setY(vertexIndex, heightAt(vertexX, vertexZ));
    }
    groundGeometry.computeVertexNormals();

    const groundMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMossDeep: { value: new THREE.Color(PALETTE.mossDeep) },
        uMossLight: { value: new THREE.Color(PALETTE.mossLight) },
        uSunPool: { value: new THREE.Color(PALETTE.sunPool) },
        uFloorMin: { value: new THREE.Color(PALETTE.groundFloorMin) },
        uHaze: { value: new THREE.Color(PALETTE.haze) },
        uSunGlint: { value: new THREE.Color(PALETTE.sunGlint) },
        uSoil: { value: new THREE.Color(PALETTE.soil) },
        uLitter: { value: new THREE.Color(PALETTE.litter) },
        uSunDirW: { value: sunDirection },
        uFogDensity: { value: SCENE_TUNING.fogDensity },
        uShadow: { value: 0.5 },
        uDetail: { value: 1 },
        uQuality: { value: 0.75 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying float vFogDepth;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPosition.xyz;
          vec4 mvPosition = viewMatrix * worldPosition;
          vFogDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uFogDensity, uShadow, uDetail, uQuality;
        uniform vec3 uMossDeep, uMossLight, uSunPool, uFloorMin, uHaze, uSunGlint, uSoil, uLitter, uSunDirW;
        varying vec3 vWorldPos;
        varying float vFogDepth;
        ${GLSL_NOISE}
        void main() {
          // Organic moss mottling at two scales; the fine scale rides the
          // Terrain Detail knob so low settings read simpler, not darker.
          // A smoothstep contrast curve keeps the mottling PUNCHY — without
          // it the floor averages into a featureless plastic green.
          float largeDapple = fbm(vWorldPos.xz * 0.045);
          float fineDapple = fbm(vWorldPos.xz * 0.35) * uDetail;
          float mossMix = clamp(largeDapple * 0.85 + fineDapple * 0.35, 0.0, 1.0);
          mossMix = mossMix * mossMix * (3.0 - 2.0 * mossMix);
          vec3 color = mix(uMossDeep, uMossLight, mossMix);

          // Bare earth worn through the moss + dry leaf-litter flecks — the
          // mid-frequency organic clutter a real forest floor has. All tones
          // are AUTHORED (warm, luminous): extra variation, never darkness.
          float soil = smoothstep(0.6, 0.78, fbm(vWorldPos.xz * 0.09 + 7.3));
          color = mix(color, uSoil, soil * 0.42);
          float litter = noise(vWorldPos.xz * 2.3);
          color = mix(color, uLitter, smoothstep(0.74, 0.92, litter) * 0.3 * uDetail);
          color *= 1.0 - smoothstep(0.16, 0.04, litter) * 0.08 * uDetail;

          // Sun-dappled canopy light drifting across the floor — with a
          // warm sunlit core so the moving patches read as LIGHT landing on
          // moss, not merely paler green.
          float drift = fbm(vWorldPos.xz * 0.12 + vec2(uTime * 0.02, -uTime * 0.014));
          color += uMossLight * smoothstep(0.55, 0.85, drift) * 0.2;
          color += uSunGlint * smoothstep(0.66, 0.94, drift) * 0.1;

          // Warm sun pool in the clearing (sun sits screen-LEFT, under the
          // title — the hot floor stays away from the action column).
          float poolDistance = length(vWorldPos.xz - vec2(-9.0, 0.0));
          float pool = 1.0 - smoothstep(8.0, 30.0, poolDistance);
          color = mix(color, uSunPool, pool * 0.33);

          // ── ANALYTIC GOLDEN-HOUR SHADOWS ────────────────────────────────
          // Sun-aligned coordinates: sc.x runs ALONG the light, sc.y across
          // it. Long parallel trunk streaks + slow-drifting canopy dapple,
          // both constant along the light direction so they read as true
          // cast shadows. Darkening is CAPPED and applied BEFORE the
          // luminance floor — it can shade the moss, never crush it.
          if (uShadow > 0.01) {
            vec2 sunAz = normalize(uSunDirW.xz);
            vec2 sc = vec2(dot(vWorldPos.xz, sunAz), dot(vWorldPos.xz, vec2(-sunAz.y, sunAz.x)));
            float dapple = smoothstep(0.6, 0.3, fbm(vec2(sc.x * 0.05, sc.y * 0.16) + uTime * 0.006));
            float stripes = smoothstep(0.55, 0.95, noise(vec2(sc.y * 0.45 + fbm(sc * 0.08) * 2.0, sc.x * 0.02)));
            float shade = clamp(dapple * 0.6 + stripes * 0.55, 0.0, 1.0);
            color *= 1.0 - shade * uShadow * 0.56;
          }

          // Dew specular — tiny wet-grass glints answering the sun, denser
          // and micro-shaded on higher tiers (fbm-perturbed normal).
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 microNormal = vec3(0.0, 1.0, 0.0);
          if (uQuality > 0.45) {
            float hC = fbm(vWorldPos.xz * 0.6);
            float hX = fbm(vWorldPos.xz * 0.6 + vec2(0.35, 0.0));
            float hZ = fbm(vWorldPos.xz * 0.6 + vec2(0.0, 0.35));
            microNormal = normalize(vec3(hC - hX, 0.9, hC - hZ));
          }
          // Gentle directional relief from the micro-normal — the floor
          // answers the sun's direction (bounded ×0.9–1.1, pre-floor).
          color *= 0.9 + 0.2 * max(dot(microNormal, uSunDirW), 0.0);
          vec3 halfVec = normalize(viewDir + uSunDirW);
          float dewMask = smoothstep(0.55, 0.85, fbm(vWorldPos.xz * 0.9 + 3.7));
          float glint = pow(max(dot(microNormal, halfVec), 0.0), 48.0);
          color += uSunGlint * glint * dewMask * (0.18 + 0.4 * uQuality);

          // Luminance floor: the darkest the forest floor can EVER be.
          color = max(color, uFloorMin);

          // Manual FogExp2 toward the shared haze color — identical math to
          // the scene fog on the trees, so ground and forest melt together.
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          color = mix(color, uHaze, fogFactor);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      fog: false,
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    scene.add(groundMesh);

    // ── PROCEDURAL DETAIL TEXTURES (kept LIGHT so albedo never crushes) ────
    const generatedTextures: THREE.Texture[] = [];
    const createProceduralTexture = (
      size: number,
      painter: (ctx: CanvasRenderingContext2D, size: number) => void,
      repeatX: number,
      repeatY: number,
    ): THREE.CanvasTexture => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      painter(ctx, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      generatedTextures.push(texture);
      return texture;
    };

    // Bark detail is drawn in LIGHT neutral browns — the material color
    // carries the hue, the map only modulates. (Dark maps × dark colors were
    // the root of the old black-floor bug; no material in this scene repeats
    // that pattern.)
    const barkTexture = createProceduralTexture(128, (ctx, size) => {
      ctx.fillStyle = '#8f7a64';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * size;
        ctx.strokeStyle = `rgba(${120 + Math.random() * 70}, ${100 + Math.random() * 55}, ${80 + Math.random() * 40}, ${0.3 + Math.random() * 0.3})`;
        ctx.lineWidth = 1 + Math.random() * 3;
        ctx.beginPath();
        ctx.moveTo(x, -8);
        for (let y = -8; y <= size + 8; y += 12) {
          ctx.lineTo(x + Math.sin(y * 0.08 + i) * (2 + Math.random() * 3), y);
        }
        ctx.stroke();
      }
    }, 1.2, 5);

    const leafTexture = createProceduralTexture(128, (ctx, size) => {
      ctx.fillStyle = '#a8bf96';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 380; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 1 + Math.random() * 4;
        const g = 175 + Math.random() * 60;
        ctx.fillStyle = `rgba(${130 + Math.random() * 50}, ${g}, ${110 + Math.random() * 45}, ${0.2 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.8, r, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 3.5, 3.5);

    const fernTexture = createProceduralTexture(96, (ctx, size) => {
      ctx.clearRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(96, 158, 82, 0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.92);
      ctx.lineTo(size * 0.5, size * 0.12);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const y = size * (0.18 + i * 0.058);
        const len = size * (0.14 + (1 - i / 12) * 0.18);
        ctx.strokeStyle = `rgba(${96 + Math.random() * 40}, ${150 + Math.random() * 60}, ${80 + Math.random() * 35}, 0.85)`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(size * 0.5, y);
        ctx.lineTo(size * 0.5 - len, y + size * 0.12);
        ctx.moveTo(size * 0.5, y);
        ctx.lineTo(size * 0.5 + len, y + size * 0.12);
        ctx.stroke();
      }
    }, 1, 1);

    // ── THE FOREST — two merged pine silhouettes, instanced ─────────────────
    // Each pine (trunk + overlapping foliage tiers) is merged into one
    // geometry with two material groups (bark / foliage) and drawn as ONE
    // InstancedMesh; TWO silhouette variants break up the repetition that
    // made the old forest read as copy-paste cones. Per-instance color varies
    // the greens; per-vertex colors lighten the canopy tips; wind sway runs
    // on the GPU via a bend weight baked into the vertices.
    type PineShape = {
      trunkHeight: number;
      tiers: Array<{ radius: number; height: number; y: number }>;
    };
    const buildPineGeometry = (shape: PineShape): THREE.BufferGeometry => {
      const parts: THREE.BufferGeometry[] = [];

      const paintAttributes = (geometry: THREE.BufferGeometry, colorFor: (localY: number) => THREE.Color, bendFor: (localY: number) => number, yOffset: number, yScale: number) => {
        const positionAttr = geometry.getAttribute('position');
        const colors = new Float32Array(positionAttr.count * 3);
        const bends = new Float32Array(positionAttr.count);
        const vertexColor = new THREE.Color();
        for (let i = 0; i < positionAttr.count; i++) {
          const localY = THREE.MathUtils.clamp((positionAttr.getY(i) + yOffset) / Math.max(yScale, 0.0001), 0, 1);
          vertexColor.copy(colorFor(localY));
          colors[i * 3] = vertexColor.r;
          colors[i * 3 + 1] = vertexColor.g;
          colors[i * 3 + 2] = vertexColor.b;
          bends[i] = bendFor(localY);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aBend', new THREE.BufferAttribute(bends, 1));
      };

      // Trunk — near-white vertex color (material map+color carry the look)
      // with a gentle base-darkening so trunks ground into the floor. No bend.
      const trunkGeometry = new THREE.CylinderGeometry(0.28, 0.55, shape.trunkHeight, 7);
      const white = new THREE.Color(0xffffff);
      const trunkShade = new THREE.Color();
      paintAttributes(
        trunkGeometry,
        (localY) => trunkShade.copy(white).multiplyScalar(0.82 + localY * 0.18),
        () => 0,
        shape.trunkHeight / 2,
        shape.trunkHeight,
      );
      trunkGeometry.translate(0, shape.trunkHeight / 2, 0);
      parts.push(trunkGeometry);

      // Foliage — overlapping tapered tiers, classic spruce silhouette. Each
      // tier is SHADED from a dim skirt up to a sun-kissed tip: baked
      // canopy self-occlusion that models the cones into round boughs (the
      // single biggest anti-"plastic cone" cue). Bounded ×0.72 — vertex
      // shading can deepen the underside, never black it out. Bend weight
      // grows with height so the crown sways more than the skirt.
      const tipColor = new THREE.Color(PALETTE.foliageTip);
      shape.tiers.forEach((tier, tierIndex) => {
        const tierGeometry = new THREE.ConeGeometry(tier.radius, tier.height, 12);
        const tierF = tierIndex / (shape.tiers.length - 1);
        const base = new THREE.Color(0xffffff);
        paintAttributes(
          tierGeometry,
          (localY) => base
            .copy(white)
            .multiplyScalar(0.72 + localY * 0.28)
            .lerp(tipColor, localY * 0.3 + tierF * 0.16),
          (localY) => (0.25 + tierF * 0.65) * (0.5 + localY * 0.5),
          tier.height / 2,
          tier.height,
        );
        tierGeometry.translate(
          (Math.random() - 0.5) * 0.25,
          tier.y,
          (Math.random() - 0.5) * 0.25,
        );
        parts.push(tierGeometry);
      });

      const foliageMerged = mergeGeometries(parts.slice(1), false)!;
      const merged = mergeGeometries([parts[0], foliageMerged], true)!;
      parts.forEach((part) => part.dispose());
      foliageMerged.dispose();
      return merged;
    };

    // Wind sway (vertex) + golden-hour rim/backlight translucency (fragment),
    // patched into the tree materials. The bend weight lives on the vertices;
    // phase + amplitude are per-instance attributes. The rim term is the
    // single biggest "ray-traced" cue in the scene: canopy silhouettes catch
    // a warm glow whenever the camera looks toward the light — it is purely
    // ADDITIVE (emissive), so it can only brighten.
    const windTimeUniform = { value: 0 };
    const sunDirViewUniform = { value: new THREE.Vector3() };
    const rimStrengthUniform = { value: 0.6 };
    const patchTreeMaterial = (material: THREE.Material, options: { rim: boolean }) => {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uWindTime = windTimeUniform;
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
            uniform float uWindTime;
            attribute float aBend;
            attribute float aWindPhase;
            attribute float aWindAmp;`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float windT = uWindTime + aWindPhase;
            float windWave = sin(windT) * 0.6 + sin(windT * 1.83 + 1.7) * 0.4;
            transformed.x += windWave * aBend * aWindAmp * 0.35;
            transformed.z += cos(windT * 0.71) * aBend * aWindAmp * 0.18;`,
          );
        if (options.rim) {
          shader.uniforms.uSunDirView = sunDirViewUniform;
          shader.uniforms.uRimColor = { value: new THREE.Color(PALETTE.rimGlow) };
          shader.uniforms.uRimStrength = rimStrengthUniform;
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              `#include <common>
              uniform vec3 uSunDirView;
              uniform vec3 uRimColor;
              uniform float uRimStrength;`,
            )
            .replace(
              '#include <emissivemap_fragment>',
              `#include <emissivemap_fragment>
              {
                vec3 rimViewDir = normalize(vViewPosition);
                float rimFacing = pow(1.0 - saturate(dot(normalize(normal), rimViewDir)), 2.2);
                float rimBacklit = pow(saturate(dot(rimViewDir, -uSunDirView)), 2.5);
                totalEmissiveRadiance += uRimColor * rimFacing * (rimBacklit * 0.85 + 0.1) * uRimStrength;
              }`,
            );
        }
      };
    };

    const barkMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.trunk,
      map: barkTexture,
      roughness: 0.9,
      metalness: 0,
      vertexColors: true,
    });
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, // hue comes from instanceColor × vertex tips × leaf map
      map: leafTexture,
      roughness: 0.6,
      metalness: 0,
      vertexColors: true,
    });
    patchTreeMaterial(barkMaterial, { rim: false });
    patchTreeMaterial(foliageMaterial, { rim: true });

    // Tree placement: poisson field for the natural mid-forest plus a dense
    // arc behind the clearing so the tree-line the mist dissolves into is an
    // unbroken wall (no sky gaps punching through at ground level).
    type TreeTransform = { x: number; z: number; scale: number; rotation: number };
    const poissonTransforms: TreeTransform[] = [];
    for (const point of createPoissonDiskPoints(150, 150, 5.5, 30)) {
      const distanceFromCamera = Math.hypot(point.x, point.z - 26);
      const scale = THREE.MathUtils.clamp(0.75 + Math.random() * 0.55 + distanceFromCamera * 0.004, 0.75, 1.55);
      poissonTransforms.push({ x: point.x, z: point.z, scale, rotation: Math.random() * Math.PI * 2 });
      if (poissonTransforms.length >= 215) break;
    }
    // Shuffle so lowering the density count removes trees uniformly across
    // the field instead of stripping one spatial region.
    for (let i = poissonTransforms.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [poissonTransforms[i], poissonTransforms[j]] = [poissonTransforms[j], poissonTransforms[i]];
    }
    const wallTransforms: TreeTransform[] = [];
    const backWallCount = 42;
    for (let i = 0; i < backWallCount; i++) {
      const x = -84 + (i / (backWallCount - 1)) * 168 + (Math.random() - 0.5) * 6;
      const z = -58 - Math.random() * 22;
      wallTransforms.push({ x, z, scale: 1.25 + Math.random() * 0.7, rotation: Math.random() * Math.PI * 2 });
    }

    // Split transforms between the two pine silhouettes.
    const wallSplit: [TreeTransform[], TreeTransform[]] = [[], []];
    wallTransforms.forEach((t, i) => wallSplit[i % 2].push(t));
    const poissonSplit: [TreeTransform[], TreeTransform[]] = [[], []];
    poissonTransforms.forEach((t, i) => poissonSplit[i % 2].push(t));

    const pineShapes: [PineShape, PineShape] = [
      {
        trunkHeight: 10,
        tiers: [
          { radius: 3.6, height: 4.4, y: 4.6 },
          { radius: 2.9, height: 4.0, y: 7.2 },
          { radius: 2.2, height: 3.6, y: 9.6 },
          { radius: 1.4, height: 3.2, y: 11.8 },
        ],
      },
      // Taller, narrower alpine silhouette — breaks the copy-paste rhythm.
      {
        trunkHeight: 11.5,
        tiers: [
          { radius: 3.0, height: 4.2, y: 5.2 },
          { radius: 2.4, height: 3.9, y: 8.0 },
          { radius: 1.8, height: 3.6, y: 10.6 },
          { radius: 1.1, height: 3.4, y: 13.0 },
        ],
      },
    ];

    // Shared grounding assets. Contact patches soften each trunk base;
    // cast ellipses stretch AWAY from the sun for the golden-hour look.
    // Both are capped-opacity normal blends over the luminance-floored
    // ground — a bounded darkening that can never stack into black.
    const contactGeometry = new THREE.CircleGeometry(1, 12);
    contactGeometry.rotateX(-Math.PI / 2);
    const contactMaterial = new THREE.MeshBasicMaterial({
      color: 0x35502a,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const castGeometry = new THREE.CircleGeometry(1, 14);
    castGeometry.rotateX(-Math.PI / 2);
    const castMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.castShadow,
      transparent: true,
      opacity: CAST_SHADOW_CFG.medium.opacity,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    // Shadows fall opposite the sun (mostly toward the camera — dramatic).
    const shadowDir = new THREE.Vector2(-sunDirection.x, -sunDirection.z).normalize();
    const shadowYaw = Math.atan2(shadowDir.x, shadowDir.y);

    type ForestLayer = {
      setDensity: (terrainDetail: number) => void;
      applyShadows: (quality: ShadowQuality) => void;
    };
    const forestLayers: ForestLayer[] = [];

    const createForestLayer = (shape: PineShape, wall: TreeTransform[], poisson: TreeTransform[]): ForestLayer => {
      // Wall trees FIRST in instance order: they are the unbroken horizon
      // line and must survive any density reduction — trimming .count only
      // ever removes trailing (poisson) instances.
      const ordered = [...wall, ...poisson];
      const total = ordered.length;
      const pineGeometry = buildPineGeometry(shape);
      const trees = new THREE.InstancedMesh(pineGeometry, [barkMaterial, foliageMaterial], total);
      trees.frustumCulled = false;
      const windPhases = new Float32Array(total);
      const windAmps = new Float32Array(total);
      {
        const dummy = new THREE.Object3D();
        const instanceTint = new THREE.Color();
        const foliagePalette = PALETTE.foliage.map((hex) => new THREE.Color(hex));
        for (let i = 0; i < total; i++) {
          const transform = ordered[i];
          dummy.position.set(transform.x, heightAt(transform.x, transform.z) - 0.15, transform.z);
          dummy.rotation.set(0, transform.rotation, (Math.random() - 0.5) * 0.04);
          dummy.scale.set(
            transform.scale * (0.9 + Math.random() * 0.2),
            transform.scale * (0.92 + Math.random() * 0.28),
            transform.scale * (0.9 + Math.random() * 0.2),
          );
          dummy.updateMatrix();
          trees.setMatrixAt(i, dummy.matrix);
          instanceTint
            .copy(foliagePalette[Math.floor(Math.random() * foliagePalette.length)])
            .multiplyScalar(0.92 + Math.random() * 0.2);
          trees.setColorAt(i, instanceTint);
          windPhases[i] = Math.random() * Math.PI * 2;
          windAmps[i] = 0.5 + Math.random() * 0.8;
        }
        trees.instanceMatrix.needsUpdate = true;
        if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
      }
      pineGeometry.setAttribute('aWindPhase', new THREE.InstancedBufferAttribute(windPhases, 1));
      pineGeometry.setAttribute('aWindAmp', new THREE.InstancedBufferAttribute(windAmps, 1));
      scene.add(trees);

      // Grounding for the near/mid poisson trees only — the wall lives
      // inside the mist where patches would be invisible anyway.
      const contact = new THREE.InstancedMesh(contactGeometry, contactMaterial, Math.max(poisson.length, 1));
      const cast = new THREE.InstancedMesh(castGeometry, castMaterial, Math.max(poisson.length, 1));
      const castJitter = new Float32Array(poisson.length);
      {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < poisson.length; i++) {
          const transform = poisson[i];
          dummy.position.set(transform.x, heightAt(transform.x, transform.z) + 0.05, transform.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(transform.scale * (1.6 + Math.random() * 0.7));
          dummy.updateMatrix();
          contact.setMatrixAt(i, dummy.matrix);
          castJitter[i] = 0.8 + Math.random() * 0.45;
        }
        contact.instanceMatrix.needsUpdate = true;
      }
      contact.renderOrder = 2;
      cast.renderOrder = 1;
      scene.add(contact);
      scene.add(cast);

      const layer: ForestLayer = {
        setDensity: (terrainDetail: number) => {
          const detail = THREE.MathUtils.clamp((terrainDetail - 0.25) / 0.75, 0, 1);
          const poissonVisible = Math.round(poisson.length * (0.5 + 0.5 * detail));
          trees.count = wall.length + poissonVisible;
          contact.count = poissonVisible;
          cast.count = poissonVisible;
        },
        applyShadows: (quality: ShadowQuality) => {
          const cfg = CAST_SHADOW_CFG[quality] ?? CAST_SHADOW_CFG.medium;
          if (cfg.len <= 0) {
            cast.visible = false;
            return;
          }
          cast.visible = true;
          const dummy = new THREE.Object3D();
          for (let i = 0; i < poisson.length; i++) {
            const transform = poisson[i];
            const length = transform.scale * cfg.len * castJitter[i];
            const width = transform.scale * (1.1 + castJitter[i] * 0.5);
            dummy.position.set(
              transform.x + shadowDir.x * length * 0.35,
              heightAt(transform.x, transform.z) + 0.07,
              transform.z + shadowDir.y * length * 0.35,
            );
            dummy.rotation.set(0, shadowYaw, 0);
            dummy.scale.set(width, 1, length);
            dummy.updateMatrix();
            cast.setMatrixAt(i, dummy.matrix);
          }
          cast.instanceMatrix.needsUpdate = true;
        },
      };
      forestLayers.push(layer);
      return layer;
    };

    createForestLayer(pineShapes[0], wallSplit[0], poissonSplit[0]);
    createForestLayer(pineShapes[1], wallSplit[1], poissonSplit[1]);

    // ── DISTANT RIDGELINES — misty banks, unlit so their tone is authored ──
    const ridgeConeGeometry = new THREE.ConeGeometry(1, 1, 6);
    const ridgeLayers = [
      { z: -100, count: 30, spread: 250, baseHeight: 20, varHeight: 15, radius: 7, color: PALETTE.ridgeNear },
      { z: -125, count: 34, spread: 320, baseHeight: 28, varHeight: 20, radius: 9, color: PALETTE.ridgeFar },
    ];
    for (const ridgeLayer of ridgeLayers) {
      const ridgeMaterial = new THREE.MeshBasicMaterial({ color: ridgeLayer.color, fog: true });
      const ridge = new THREE.InstancedMesh(ridgeConeGeometry, ridgeMaterial, ridgeLayer.count);
      ridge.frustumCulled = false;
      const dummy = new THREE.Object3D();
      for (let i = 0; i < ridgeLayer.count; i++) {
        const height = ridgeLayer.baseHeight + Math.random() * ridgeLayer.varHeight;
        const radius = ridgeLayer.radius * (0.7 + Math.random() * 0.6);
        const x = -ridgeLayer.spread / 2 + (i / (ridgeLayer.count - 1)) * ridgeLayer.spread + (Math.random() - 0.5) * 8;
        const z = ridgeLayer.z + (Math.random() - 0.5) * 12;
        dummy.position.set(x, height * 0.5 - 2, z);
        dummy.scale.set(radius, height, radius);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.updateMatrix();
        ridge.setMatrixAt(i, dummy.matrix);
      }
      ridge.instanceMatrix.needsUpdate = true;
      scene.add(ridge);
    }

    // ── MIST BANKS — the horizon dissolvers ─────────────────────────────────
    // Big soft-edged planes of BRIGHT haze straddling the tree line, normal
    // blended (they pull pixels toward their luminous color — they cannot
    // darken anything). Whatever tiny horizon breathing the camera drift
    // leaves happens INSIDE this glow, where no edge can be seen.
    const mistBankMaterials: THREE.ShaderMaterial[] = [];
    const createMistBank = (width: number, height: number, y: number, z: number, opacity: number) => {
      const mistMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(PALETTE.mistBank) },
          uOpacity: { value: opacity },
          uSeed: { value: Math.random() * 100 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uSeed;
          varying vec2 vUv;
          ${GLSL_NOISE}
          void main() {
            float vertical = smoothstep(0.0, 0.38, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
            float horizontal = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
            float body = fbm(vec2(vUv.x * 5.0 + uSeed + uTime * 0.014, vUv.y * 2.2 - uTime * 0.008));
            float alpha = vertical * horizontal * (0.62 + body * 0.38) * uOpacity;
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
      });
      mistMaterial.userData.baseOpacity = opacity;
      const mistMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mistMaterial);
      mistMesh.position.set(0, y, z);
      mistMesh.renderOrder = 10;
      scene.add(mistMesh);
      mistBankMaterials.push(mistMaterial);
    };
    createMistBank(300, 30, 8, -88, 0.55);
    createMistBank(260, 26, 7, -66, 0.42);
    createMistBank(220, 20, 5, -48, 0.3);

    // Near-field ground mist: flat luminous sheets floating over the clearing
    // floor. Normal blend — they can only lift the floor toward bright sage.
    const groundMistMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(PALETTE.groundMist) },
        uOpacity: { value: 0.1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        ${GLSL_NOISE}
        void main() {
          float radial = 1.0 - smoothstep(0.15, 1.0, length(vUv - 0.5) * 2.0);
          float body = fbm(vUv * 4.0 + vec2(uTime * 0.02, uTime * 0.012));
          gl_FragColor = vec4(uColor, radial * (0.55 + body * 0.45) * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    for (let mistIndex = 0; mistIndex < 4; mistIndex++) {
      const mistSheet = new THREE.Mesh(new THREE.PlaneGeometry(95, 95), groundMistMaterial);
      mistSheet.rotation.x = -Math.PI / 2;
      mistSheet.rotation.z = Math.random() * Math.PI;
      mistSheet.position.set((Math.random() - 0.5) * 20, 0.6 + mistIndex * 0.7, -6 - mistIndex * 12);
      mistSheet.renderOrder = 9;
      scene.add(mistSheet);
    }

    // ── VOLUMETRIC LIGHT BLADES — angled canopy shafts, additive but faint ──
    // Animated fbm curtains drift INSIDE each blade so the light reads as a
    // participating medium rather than a static gradient card. The visible
    // count is gated by the quality tier.
    type ShaftMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> & {
      baseOpacity: number;
      phase: number;
      speed: number;
    };
    const shaftMeshes: ShaftMesh[] = [];
    for (let shaftIndex = 0; shaftIndex < SHAFT_MAX; shaftIndex++) {
      const shaftMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(PALETTE.shaft) },
          // Strong enough to READ as volumetric light against the deeper
          // forest (the old 0.05 base was invisible after tone mapping);
          // still additive-faint so it can never white out the frame.
          uOpacity: { value: 0.09 + Math.random() * 0.05 },
          uSeed: { value: Math.random() * 40 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uSeed;
          varying vec2 vUv;
          ${GLSL_NOISE}
          void main() {
            float edge = pow(smoothstep(0.0, 0.5, 1.0 - abs(vUv.x - 0.5) * 2.0), 1.7);
            float fade = smoothstep(0.02, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 0.98, vUv.y));
            float curtain = fbm(vec2(vUv.x * 6.0 + uSeed, vUv.y * 2.4 - uTime * 0.05));
            float beams = 0.6 + 0.4 * sin(vUv.x * 26.0 + curtain * 5.0 + uTime * 0.22);
            gl_FragColor = vec4(uColor, uOpacity * edge * fade * (0.55 + curtain * 0.45) * beams);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(5 + Math.random() * 4, 55 + Math.random() * 25), shaftMaterial) as ShaftMesh;
      // Blades hang from screen-left through centre (under the sun), leaning
      // with the light — the right action column stays free of hot streaks.
      shaft.position.set(-34 + shaftIndex * 5.5 + Math.random() * 3, 22 + Math.random() * 8, -26 - Math.random() * 26);
      shaft.rotation.set(-0.12, 0.14 + (Math.random() - 0.5) * 0.26, -0.3 - Math.random() * 0.12);
      shaft.baseOpacity = shaftMaterial.uniforms.uOpacity.value as number;
      shaft.phase = Math.random() * Math.PI * 2;
      shaft.speed = 0.08 + Math.random() * 0.15;
      shaft.renderOrder = 11;
      scene.add(shaft);
      shaftMeshes.push(shaft);
    }

    // Ground light pools — where each volumetric blade LANDS. Warm additive
    // ellipses stretched along the light direction on the forest floor,
    // pulsing in sync with their parent shaft, so the volumetric light
    // visibly arrives on the ground instead of dissolving mid-air. Additive
    // + capped opacity: they can only add warmth, never darkness.
    const poolGeometry = new THREE.CircleGeometry(1, 16);
    poolGeometry.rotateX(-Math.PI / 2);
    type PoolMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const poolMeshes: PoolMesh[] = [];
    for (let poolIndex = 0; poolIndex < SHAFT_MAX; poolIndex++) {
      const parentShaft = shaftMeshes[poolIndex];
      const poolMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(PALETTE.shaft) },
          uOpacity: { value: 0 },
          uSeed: { value: Math.random() * 20 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uOpacity, uSeed;
          uniform vec3 uColor;
          varying vec2 vUv;
          ${GLSL_NOISE}
          void main() {
            vec2 fromCenter = vUv - 0.5;
            float radial = 1.0 - smoothstep(0.1, 0.5, length(fromCenter));
            float mottle = fbm(vUv * 3.0 + uSeed + uTime * 0.02);
            gl_FragColor = vec4(uColor, radial * (0.5 + mottle * 0.5) * uOpacity);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      // The pool sits where the shaft's light line meets the floor: offset
      // from the blade's base along the shadow direction (away from the sun).
      const poolX = parentShaft.position.x + shadowDir.x * 10;
      const poolZ = parentShaft.position.z + shadowDir.y * 10;
      const pool = new THREE.Mesh(poolGeometry, poolMaterial) as PoolMesh;
      pool.position.set(poolX, heightAt(poolX, poolZ) + 0.12, poolZ);
      pool.rotation.y = shadowYaw;
      pool.scale.set(3.5 + Math.random() * 2, 1, 8 + Math.random() * 4);
      pool.renderOrder = 3;
      scene.add(pool);
      poolMeshes.push(pool);
    }

    // ── FLOOR ACCENTS — ferns, grass tufts, rocks (instanced, mid-tone) ────
    // Allocated at MAX; the Terrain Detail knob trims InstancedMesh.count
    // live. Placement rejects the UI clear zone up front so every allocated
    // slot is a REAL prop (no wasted hidden instances).
    const scatterOnFloor = (
      instanced: THREE.InstancedMesh,
      max: number,
      place: (dummy: THREE.Object3D, x: number, z: number) => void,
      minDistance: number,
      maxDistance: number,
    ): number => {
      const dummy = new THREE.Object3D();
      let placed = 0;
      let guard = 0;
      while (placed < max && guard++ < max * 60) {
        const angle = Math.random() * Math.PI * 2;
        const distance = minDistance + Math.random() * (maxDistance - minDistance);
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        if (isUiClearZone(x, z)) continue;
        place(dummy, x, z);
        dummy.updateMatrix();
        instanced.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
      instanced.instanceMatrix.needsUpdate = true;
      return placed;
    };

    const fernMaterial = new THREE.MeshLambertMaterial({
      color: 0x76a253,
      map: fernTexture,
      transparent: true,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
    });
    const fernGeometry = new THREE.PlaneGeometry(1, 0.5);
    const fernInstanced = new THREE.InstancedMesh(fernGeometry, fernMaterial, FERN_MAX);
    const fernPlaced = scatterOnFloor(fernInstanced, FERN_MAX, (dummy, x, z) => {
      const fernScale = 0.5 + Math.random() * 1.1;
      dummy.position.set(x, heightAt(x, z) + fernScale * 0.2, z);
      dummy.rotation.set(-0.5, Math.random() * Math.PI * 2, 0);
      dummy.scale.setScalar(fernScale);
    }, 6, 52);
    scene.add(fernInstanced);

    const bladeGeometry = new THREE.PlaneGeometry(0.13, 1);
    bladeGeometry.translate(0, 0.5, 0);
    const bladeMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const bladeInstanced = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, BLADE_MAX);
    const bladePlaced = scatterOnFloor(bladeInstanced, BLADE_MAX, (dummy, x, z) => {
      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.16);
      dummy.scale.set(0.8 + Math.random() * 0.7, 0.35 + Math.random() * 0.7, 1);
    }, 5, 55);
    {
      const bladeTint = new THREE.Color();
      const bladeLow = new THREE.Color(0x4f7f38);
      const bladeHigh = new THREE.Color(0x8fb75c);
      for (let i = 0; i < BLADE_MAX; i++) {
        bladeInstanced.setColorAt(i, bladeTint.copy(bladeLow).lerp(bladeHigh, Math.random()));
      }
      if (bladeInstanced.instanceColor) bladeInstanced.instanceColor.needsUpdate = true;
    }
    scene.add(bladeInstanced);

    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rockMaterial = new THREE.MeshLambertMaterial({ color: 0x8a9579 });
    const rockInstanced = new THREE.InstancedMesh(rockGeometry, rockMaterial, ROCK_MAX);
    const rockPlaced = scatterOnFloor(rockInstanced, ROCK_MAX, (dummy, x, z) => {
      const rockScale = 0.18 + Math.random() * 0.5;
      dummy.position.set(x, heightAt(x, z) + rockScale * 0.2, z);
      dummy.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, 0);
      dummy.scale.set(
        rockScale * (0.7 + Math.random() * 0.6),
        rockScale * (0.5 + Math.random() * 0.5),
        rockScale * (0.7 + Math.random() * 0.6),
      );
    }, 7, 49);
    scene.add(rockInstanced);

    // ── AIRBORNE LIFE — pollen motes, bokeh dust + drifting leaves ──────────
    // All allocated at MAX; Particle Density gates the drawRange live, and
    // the per-frame update loops only touch the active count.
    const pollenGeometry = new THREE.BufferGeometry();
    const pollenPositions = new Float32Array(POLLEN_MAX * 3);
    const pollenBase = new Float32Array(POLLEN_MAX * 3);
    const pollenPhases = new Float32Array(POLLEN_MAX);
    const pollenSpeeds = new Float32Array(POLLEN_MAX);
    for (let i = 0; i < POLLEN_MAX; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 4 + Math.random() * 40;
      pollenBase[i * 3] = Math.cos(angle) * distance;
      pollenBase[i * 3 + 1] = 1 + Math.random() * 13;
      pollenBase[i * 3 + 2] = Math.sin(angle) * distance - 6;
      pollenPositions.set(pollenBase.subarray(i * 3, i * 3 + 3), i * 3);
      pollenPhases[i] = Math.random() * Math.PI * 2;
      pollenSpeeds[i] = 0.25 + Math.random() * 1.1;
    }
    pollenGeometry.setAttribute('position', new THREE.BufferAttribute(pollenPositions, 3));
    const pollenPoints = new THREE.Points(
      pollenGeometry,
      new THREE.PointsMaterial({
        size: 0.09,
        map: getSoftSparkTexture(),
        color: PALETTE.pollen,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    scene.add(pollenPoints);

    // Large soft bokeh motes — near-lens dust catching the sun. The classic
    // "volumetric air" cue; medium tiers and up only.
    const moteGeometry = new THREE.BufferGeometry();
    const motePositions = new Float32Array(MOTE_MAX * 3);
    const moteBase = new Float32Array(MOTE_MAX * 3);
    const motePhases = new Float32Array(MOTE_MAX);
    for (let i = 0; i < MOTE_MAX; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 3 + Math.random() * 26;
      moteBase[i * 3] = Math.cos(angle) * distance;
      moteBase[i * 3 + 1] = 1.5 + Math.random() * 10;
      moteBase[i * 3 + 2] = Math.sin(angle) * distance + 2;
      motePositions.set(moteBase.subarray(i * 3, i * 3 + 3), i * 3);
      motePhases[i] = Math.random() * Math.PI * 2;
    }
    moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    const motePoints = new THREE.Points(
      moteGeometry,
      new THREE.PointsMaterial({
        size: 0.55,
        map: getSoftSparkTexture(),
        color: PALETTE.mote,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    scene.add(motePoints);

    const leafGeometry = new THREE.BufferGeometry();
    const leafPositions = new Float32Array(LEAF_MAX * 3);
    const leafDrift: Array<{ fallSpeed: number; swaySpeed: number; swayAmount: number; phase: number }> = [];
    for (let i = 0; i < LEAF_MAX; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 5 + Math.random() * 35;
      leafPositions[i * 3] = Math.cos(angle) * distance;
      leafPositions[i * 3 + 1] = 8 + Math.random() * 14;
      leafPositions[i * 3 + 2] = Math.sin(angle) * distance;
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
        map: getSoftSparkTexture(),
        color: PALETTE.leaf,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    scene.add(leafPoints);

    // ── POST — render → bloom → grade (with the bottom-brightness floor) ────
    // The composer target carries MSAA samples when the AA setting is on, so
    // the post path doesn't trade edge quality for its cinematic passes.
    const composerTarget = new THREE.WebGLRenderTarget(initialViewport.width, initialViewport.height, {
      type: THREE.HalfFloatType,
      samples: appliedAntialias ? 4 : 0,
    });
    const composer = new EffectComposer(renderer, composerTarget);
    composer.setPixelRatio(effectivePixelRatio);
    composer.setSize(initialViewport.width, initialViewport.height);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(initialViewport.width, initialViewport.height),
      TIER_FEATURES.bloomStrength[3],
      SCENE_TUNING.bloomRadius,
      SCENE_TUNING.bloomThreshold,
    );
    composer.addPass(bloomPass);

    const finalPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(initialViewport.width, initialViewport.height) },
        uVignette: { value: SCENE_TUNING.vignette },
        uGrain: { value: SCENE_TUNING.grain },
        uContrast: { value: SCENE_TUNING.contrast },
        uSaturation: { value: SCENE_TUNING.saturation },
        uChromatic: { value: SCENE_TUNING.chromatic },
        uSunUV: { value: new THREE.Vector2(0.35, 0.68) },
        uSunColor: { value: new THREE.Color(PALETTE.gradeSun) },
        uSunIntensity: { value: 0.28 },
        uRaySamples: { value: TIER_FEATURES.raySamples[3] },
        uStreak: { value: 0.18 },
        uMistTone: { value: new THREE.Color(PALETTE.gradeMist) },
        uMistMix: { value: SCENE_TUNING.bottomMistMix },
        uMistFloor: { value: SCENE_TUNING.bottomMistFloor },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uTime, uVignette, uGrain, uContrast, uSaturation, uChromatic, uSunIntensity, uRaySamples, uStreak, uMistMix, uMistFloor;
        uniform vec2 uResolution, uSunUV;
        uniform vec3 uSunColor, uMistTone;
        varying vec2 vUv;
        float rand(vec2 coords) { return fract(sin(dot(coords, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 uv = vUv;
          vec2 fromCenter = uv - 0.5;
          float centerDistance = length(fromCenter);

          // Gentle chromatic fringe toward the frame edge.
          vec2 chromaOffset = fromCenter * centerDistance * uChromatic;
          vec3 color = vec3(
            texture2D(tDiffuse, uv + chromaOffset).r,
            texture2D(tDiffuse, uv).g,
            texture2D(tDiffuse, uv - chromaOffset).b
          );

          // Screen-space crepuscular rays: a bright-pass march toward the
          // sun. Tree silhouettes occlude samples naturally, so the beams
          // break around the canopy like true volumetric light. Sample
          // count rides the quality tier.
          vec2 toSun = uSunUV - uv;
          float radialGate = 1.0 - smoothstep(0.05, 0.85, length(vec2(toSun.x * (uResolution.x / max(uResolution.y, 1.0)), toSun.y)));
          if (uRaySamples >= 2.0) {
            vec3 shaft = vec3(0.0);
            float shaftWeight = 0.0;
            for (int sampleIndex = 0; sampleIndex < 24; sampleIndex++) {
              if (float(sampleIndex) >= uRaySamples) break;
              float f = float(sampleIndex) / max(uRaySamples - 1.0, 1.0);
              vec2 sampleUv = uv + toSun * f * 0.8;
              if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;
              vec3 sampleColor = texture2D(tDiffuse, sampleUv).rgb;
              float bright = smoothstep(0.5, 0.95, dot(sampleColor, vec3(0.299, 0.587, 0.114)));
              float decay = pow(1.0 - f, 1.7);
              shaft += sampleColor * bright * decay;
              shaftWeight += decay;
            }
            shaft /= max(shaftWeight, 0.001);
            color += mix(shaft, uSunColor, 0.55) * uSunIntensity * radialGate * smoothstep(0.02, 0.75, length(toSun));
          }

          // Faint anamorphic streak through the sun — the lens answering the
          // light. Tightly windowed AND radially gated: the sun sits
          // screen-LEFT above the title block, so a wide streak would smear
          // straight across the game title.
          float streakY = exp(-abs(uv.y - uSunUV.y) * 52.0);
          float streakX = exp(-abs(uv.x - uSunUV.x) * 10.0);
          color += uSunColor * streakY * streakX * uSunIntensity * uStreak * radialGate;

          // Grade: gentle contrast + saturation + daylight split-tone.
          color = (color - 0.5) * uContrast + 0.5 + 0.006;
          float gradeLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color = mix(vec3(gradeLuma), color, uSaturation);
          color *= mix(vec3(0.95, 1.0, 1.03), vec3(1.05, 1.02, 0.94), smoothstep(0.2, 0.8, gradeLuma));

          // Vignette centered ABOVE the midline: it shades the sky corners
          // for title readability but barely grazes the lower frame — the
          // bottom's brightness budget belongs to the mist floor below.
          vec2 vignettePos = vec2(fromCenter.x, (uv.y - 0.58));
          color *= 1.0 - smoothstep(0.38, 1.05, length(vignettePos) * 1.18) * uVignette;

          // ── BOTTOM BRIGHTNESS FLOOR — the black-bar killer ──────────────
          // A smooth ramp over the lower frame first mixes toward luminous
          // ground-haze, then max() enforces an absolute minimum brightness.
          // Applied AFTER every darkening step: no pass, overlay mistake or
          // camera drift can push the lower frame below this floor.
          // Smoothstep requires ascending edges. Invert a normal ramp
          // instead of relying on undefined reversed-edge behaviour, which
          // can produce a black post-process output on some WebGL drivers.
          float bottomRamp = pow(1.0 - smoothstep(-0.06, 0.44, vUv.y), 1.25);
          color = mix(color, uMistTone, bottomRamp * uMistMix);
          color = max(color, uMistTone * (bottomRamp * uMistFloor));

          color += (rand(uv + fract(uTime * 0.7)) * 2.0 - 1.0) * uGrain;
          gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
      `,
    });
    composer.addPass(finalPass);
    composer.addPass(new OutputPass());

    // ── SETTINGS SYNC — Settings → Display drives everything live ──────────
    // Two flags for the render path: `postEnabled` mirrors the user's
    // Post-Processing setting; `postFailed` latches if the composer ever
    // throws (exotic driver, lost resources) so the direct render — which
    // the scene is authored to look complete on — takes over permanently.
    let postEnabled = presetAtBuild.postProcessing;
    let postFailed = false;
    let fpsCapValue = settingsAtBuild.fpsCap;
    let activePollenCount = POLLEN_MAX;
    let activeMoteCount = MOTE_MAX;
    let activeLeafCount = LEAF_MAX;

    const handleResize = () => {
      const { width, height } = getViewportSize();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(effectivePixelRatio);
      composer.setPixelRatio(effectivePixelRatio);
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
      (finalPass.uniforms.uResolution.value as THREE.Vector2).set(width, height);
    };

    const applyGraphics = (settings: UserSettings) => {
      const resolved = resolveGraphicsPreset(settings.graphics);
      const tierIndex = TIER_INDEX[settings.graphics.baseTier] ?? 3;
      const quality = tierIndex / 4;
      fpsCapValue = settings.fpsCap;

      // Resolution — the render-scale knob × the device's real pixel ratio.
      const devicePixels = Math.min(window.devicePixelRatio || 1, 2);
      effectivePixelRatio = THREE.MathUtils.clamp(devicePixels * resolved.pixelRatio, 0.4, 2);
      handleResize();

      // Post pipeline. A custom mix can enable post on a low base tier —
      // give it at least the MEDIUM cinematic budget so "on" means on.
      postEnabled = resolved.postProcessing;
      const postTier = Math.max(tierIndex, 2);
      bloomPass.strength = TIER_FEATURES.bloomStrength[postTier];
      finalPass.uniforms.uRaySamples.value = TIER_FEATURES.raySamples[postTier];
      finalPass.uniforms.uStreak.value = tierIndex >= 3 ? 0.22 : 0.15;

      // View distance → atmospheric depth. Far views clear the air out to
      // the ridgelines; short views wrap the clearing in luminous mist.
      // Everything still converges on the ONE haze color. Slightly thinner
      // than the old build so near/mid trees hold their rich greens instead
      // of washing out into haze two rows deep.
      const fogDensity = THREE.MathUtils.clamp(1.25 / Math.max(resolved.viewDistance, 1), 0.0045, 0.0145);
      (scene.fog as THREE.FogExp2).density = fogDensity;
      groundMaterial.uniforms.uFogDensity.value = fogDensity;
      const mistScale = THREE.MathUtils.clamp(fogDensity / SCENE_TUNING.fogDensity, 0.85, 1.25);
      for (const mistMaterial of mistBankMaterials) {
        mistMaterial.uniforms.uOpacity.value = (mistMaterial.userData.baseOpacity as number) * mistScale;
      }
      groundMistMaterial.uniforms.uOpacity.value = 0.1 * mistScale;

      // Qualitative shader gates.
      groundMaterial.uniforms.uQuality.value = quality;
      groundMaterial.uniforms.uDetail.value = resolved.terrainDetail;
      skyMaterial.uniforms.uSkyDetail.value = TIER_FEATURES.skyDetail[tierIndex];
      rimStrengthUniform.value = TIER_FEATURES.rimStrength[tierIndex];

      // Shadows — analytic only (see the light-rig note above).
      const shadowQuality = settings.graphics.shadows;
      groundMaterial.uniforms.uShadow.value = GROUND_SHADOW_STRENGTH[shadowQuality] ?? 0.5;
      castMaterial.opacity = (CAST_SHADOW_CFG[shadowQuality] ?? CAST_SHADOW_CFG.medium).opacity;
      contactMaterial.opacity = shadowQuality === 'off' ? 0.24 : 0.34;
      for (const layer of forestLayers) layer.applyShadows(shadowQuality);

      // Terrain detail → forest + floor-prop density.
      for (const layer of forestLayers) layer.setDensity(resolved.terrainDetail);
      bladeInstanced.count = Math.min(bladePlaced, Math.round(BLADE_MAX * resolved.terrainDetail));
      fernInstanced.count = Math.min(fernPlaced, Math.round(FERN_MAX * resolved.terrainDetail));
      rockInstanced.count = Math.min(rockPlaced, Math.max(4, Math.round(ROCK_MAX * resolved.terrainDetail)));

      // Particle density → airborne life.
      activePollenCount = Math.round(POLLEN_MAX * resolved.particleDensity);
      pollenGeometry.setDrawRange(0, activePollenCount);
      pollenPoints.visible = activePollenCount > 0;
      activeMoteCount = TIER_FEATURES.motesEnabled[tierIndex]
        ? Math.round(MOTE_MAX * resolved.particleDensity)
        : 0;
      moteGeometry.setDrawRange(0, activeMoteCount);
      motePoints.visible = activeMoteCount > 0;
      activeLeafCount = Math.max(4, Math.round(LEAF_MAX * resolved.particleDensity));
      leafGeometry.setDrawRange(0, activeLeafCount);

      // Volumetric light blades (and their ground light pools) ride the
      // quality tier together.
      const visibleShafts = TIER_FEATURES.shaftCount[tierIndex];
      shaftMeshes.forEach((shaft, index) => {
        shaft.visible = index < visibleShafts;
        poolMeshes[index].visible = shaft.visible;
      });
    };
    applyGraphics(settingsAtBuild);

    const unsubscribeSettings = gameSettingsManager.subscribe((settings) => {
      const resolved = resolveGraphicsPreset(settings.graphics);
      if (resolved.antialias !== appliedAntialias) {
        // MSAA lives in the immutable canvas context attributes — swap the
        // canvas (key bump) and rebuild. Every other knob applies live.
        // Flag the outgoing canvas's context for release: the key change
        // discards that element permanently, so its context would otherwise
        // squat in the browser's WebGL context budget until GC.
        releaseContextOnCleanupRef.current = true;
        setAaGeneration((generation) => generation + 1);
        return;
      }
      applyGraphics(settings);
    });

    // ── ANIMATION ───────────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let animationFrameId = 0;
    let isVisible = !document.hidden;
    let previousTime = 0;
    let lastRenderTime = -1;
    const sunWorldPosition = sunDirection.clone().multiplyScalar(165);
    const sunScreenPosition = new THREE.Vector3();
    const lookAtPoint = new THREE.Vector3();
    const viewMatrixInverse = new THREE.Matrix4();

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvasElement.getBoundingClientRect();
      const width = Math.max(bounds.width, 1);
      const height = Math.max(bounds.height, 1);
      mouseState.targetX = ((event.clientX - bounds.left) / width - 0.5) * 2;
      mouseState.targetY = ((event.clientY - bounds.top) / height - 0.5) * 2;
    };

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };

    const animate = () => {
      animationFrameId = window.requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsedTime = clock.getElapsedTime();
      const deltaTime = Math.min(Math.max(elapsedTime - previousTime, 0), 0.1);
      previousTime = elapsedTime;

      // FPS cap (Settings → Display). The menu respects the same cap as the
      // game so the backdrop never renders faster than the user asked for.
      if (fpsCapValue > 0 && elapsedTime - lastRenderTime < 1 / fpsCapValue - 0.001) return;
      lastRenderTime = elapsedTime;

      mouseState.x += (mouseState.targetX - mouseState.x) * 0.02;
      mouseState.y += (mouseState.targetY - mouseState.y) * 0.02;

      // Ease toward the active menu's rig. All rigs share near-flat pitch,
      // so the blend reads as a slow dolly through the clearing — the
      // horizon never climbs or drops during the move.
      const rigBlend = 1 - Math.exp(-deltaTime * 2.1);
      rigPosition.lerp(rigDesiredPosition, rigBlend);
      rigTarget.lerp(rigDesiredTarget, rigBlend);
      currentFov += (desiredFov - currentFov) * rigBlend;
      if (Math.abs(camera.fov - currentFov) > 0.01) {
        camera.fov = currentFov;
        camera.updateProjectionMatrix();
      }

      // Positional drift around the rig's FIXED look target. The pitch
      // change from the tiny y-drift is a fraction of a degree — the horizon
      // effectively never moves, and what remains is buried in mist banks.
      camera.position.set(
        rigPosition.x + mouseState.x * 2.2 + Math.sin(elapsedTime * 0.05) * 1.1,
        rigPosition.y + Math.sin(elapsedTime * 0.073) * 0.3 - mouseState.y * 0.5,
        rigPosition.z + Math.sin(elapsedTime * 0.031) * 1.4,
      );
      lookAtPoint.set(
        rigTarget.x + mouseState.x * 0.7,
        rigTarget.y - mouseState.y * 0.4,
        rigTarget.z,
      );
      camera.lookAt(lookAtPoint);
      camera.updateMatrixWorld();

      // View-space sun direction for the foliage rim/backlight shader.
      viewMatrixInverse.copy(camera.matrixWorld).invert();
      sunDirViewUniform.value.copy(sunDirection).transformDirection(viewMatrixInverse);

      // Screen-space sun tracking for the ray march, gated at frame edges.
      sunScreenPosition.copy(sunWorldPosition).project(camera);
      const insideX = 1.0 - THREE.MathUtils.smoothstep(Math.abs(sunScreenPosition.x), 1.0, 1.3);
      const insideY = 1.0 - THREE.MathUtils.smoothstep(Math.abs(sunScreenPosition.y), 1.0, 1.3);
      const sunGate = sunScreenPosition.z >= 1 ? 0 : insideX * insideY;
      (finalPass.uniforms.uSunUV.value as THREE.Vector2).set(
        sunScreenPosition.x * 0.5 + 0.5,
        sunScreenPosition.y * 0.5 + 0.5,
      );
      finalPass.uniforms.uSunIntensity.value = 0.28 * sunGate;

      windTimeUniform.value = elapsedTime * 0.9;
      skyMaterial.uniforms.uTime.value = elapsedTime;
      groundMaterial.uniforms.uTime.value = elapsedTime;
      groundMistMaterial.uniforms.uTime.value = elapsedTime;
      for (const mistMaterial of mistBankMaterials) {
        mistMaterial.uniforms.uTime.value = elapsedTime;
      }
      for (let shaftIndex = 0; shaftIndex < shaftMeshes.length; shaftIndex++) {
        const shaft = shaftMeshes[shaftIndex];
        if (!shaft.visible) continue;
        const pulse = Math.sin(elapsedTime * shaft.speed + shaft.phase) * 0.5 + 0.5;
        shaft.material.uniforms.uTime.value = elapsedTime;
        shaft.material.uniforms.uOpacity.value = shaft.baseOpacity * (0.4 + pulse * 0.85);
        // The ground pool breathes with its parent blade, so the landing
        // light brightens exactly when the shaft does.
        const pool = poolMeshes[shaftIndex];
        pool.material.uniforms.uTime.value = elapsedTime;
        pool.material.uniforms.uOpacity.value = 0.22 * (0.35 + pulse * 0.75);
      }

      const pollenAttribute = pollenGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < activePollenCount; i++) {
        const base = i * 3;
        pollenPositions[base] = pollenBase[base] + Math.sin(elapsedTime * pollenSpeeds[i] * 0.5 + pollenPhases[i]) * 2.2;
        pollenPositions[base + 1] = pollenBase[base + 1] + Math.cos(elapsedTime * pollenSpeeds[i] * 0.3 + pollenPhases[i] * 1.3) * 1.1;
        pollenPositions[base + 2] = pollenBase[base + 2] + Math.sin(elapsedTime * pollenSpeeds[i] * 0.4 + pollenPhases[i] * 0.7) * 1.8;
      }
      pollenAttribute.needsUpdate = true;

      if (activeMoteCount > 0) {
        const moteAttribute = moteGeometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < activeMoteCount; i++) {
          const base = i * 3;
          motePositions[base] = moteBase[base] + Math.sin(elapsedTime * 0.12 + motePhases[i]) * 3.2;
          motePositions[base + 1] = moteBase[base + 1] + Math.sin(elapsedTime * 0.09 + motePhases[i] * 1.7) * 1.6;
          motePositions[base + 2] = moteBase[base + 2] + Math.cos(elapsedTime * 0.1 + motePhases[i] * 0.6) * 2.6;
        }
        moteAttribute.needsUpdate = true;
      }

      const leafAttribute = leafGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < activeLeafCount; i++) {
        const base = i * 3;
        const drift = leafDrift[i];
        leafPositions[base] += Math.sin(elapsedTime * drift.swaySpeed + drift.phase) * drift.swayAmount * 0.02;
        leafPositions[base + 1] -= drift.fallSpeed;
        leafPositions[base + 2] += Math.cos(elapsedTime * drift.swaySpeed * 0.7 + drift.phase) * 0.005;
        if (leafPositions[base + 1] < 0) {
          leafPositions[base + 1] = 10 + Math.random() * 10;
          leafPositions[base] = (Math.random() - 0.5) * 60;
          leafPositions[base + 2] = (Math.random() - 0.5) * 60;
        }
      }
      leafAttribute.needsUpdate = true;

      finalPass.uniforms.uTime.value = elapsedTime;

      // Guarded render: if the composer ever fails (exotic driver, lost
      // resources), fall back to the plain scene render — the scene is
      // authored to look complete without post. If even that fails, stop;
      // the transparent canvas leaves the luminous CSS gradient visible,
      // so no failure mode can show a black screen.
      try {
        if (postEnabled && !postFailed) {
          composer.render();
        } else {
          renderer.render(scene, camera);
        }
      } catch (renderError) {
        if (postEnabled && !postFailed) {
          postFailed = true;
          console.error('Menu forest scene: post pipeline failed, using direct render.', renderError);
        } else {
          console.error('Menu forest scene: rendering failed, stopping.', renderError);
          window.cancelAnimationFrame(animationFrameId);
        }
      }
    };

    // Context-loss safety net: swallow the loss (so the browser is allowed
    // to restore), then rebuild the whole scene on restoration. Heavy dev
    // hot-reload sessions can exhaust the browser's WebGL context budget —
    // without this, the menu freezes on whatever frame died (or worse,
    // composites black).
    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };
    const handleContextRestored = () => {
      setContextGeneration((generation) => generation + 1);
    };
    canvasElement.addEventListener('webglcontextlost', handleContextLost);
    canvasElement.addEventListener('webglcontextrestored', handleContextRestored);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(handleResize);
    resizeObserver?.observe(canvasElement.parentElement ?? canvasElement);
    animate();

    const readyFrame = window.requestAnimationFrame(() => {
      onReadyRef.current?.();
    });

    return () => {
      rigControlRef.current = null;
      unsubscribeSettings();
      canvasElement.removeEventListener('webglcontextlost', handleContextLost);
      canvasElement.removeEventListener('webglcontextrestored', handleContextRestored);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrameId);
      window.cancelAnimationFrame(readyFrame);
      generatedTextures.forEach((texture) => texture.dispose());
      // getSoftSparkTexture() is module-cached and shared with gameplay
      // effects — never disposed here.
      disposeScene(scene);
      scene.clear();
      (bloomPass as unknown as { dispose?: () => void }).dispose?.();
      (composer as unknown as { dispose?: () => void }).dispose?.();
      renderer.dispose();
      // Release the WebGL context ONLY when this cleanup belongs to an
      // AA-triggered canvas swap (explicit flag above) — that canvas is gone
      // for good, so freeing its context keeps the browser's context budget
      // clean. Every other teardown (StrictMode's simulated remount, menu →
      // gameplay unmount) leaves the context alone: StrictMode reuses the
      // SAME canvas immediately, and a force-lost context on it would hand
      // the remount a dead context and crash the renderer.
      if (releaseContextOnCleanupRef.current) {
        releaseContextOnCleanupRef.current = false;
        renderer.forceContextLoss();
      }
      // Keep the shared canvas clean for StrictMode's immediate next mount.
      resetTextureUploadState();
    };
    // Rebuilds only when the browser reclaims the WebGL context, or when the
    // MSAA setting flips (context attributes are immutable → fresh canvas).
    // Menu variant changes and every other graphics setting apply LIVE.
  }, [contextGeneration, aaGeneration]);

  return (
    <canvas
      key={aaGeneration}
      ref={canvasRef}
      className="absolute inset-0 h-full w-full pointer-events-none"
      aria-hidden="true"
    />
  );
}
