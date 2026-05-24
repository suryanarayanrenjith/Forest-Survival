import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  Effect,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  HueSaturationEffect,
  BrightnessContrastEffect,
  VignetteEffect,
  VignetteTechnique,
  ChromaticAberrationEffect,
  GodRaysEffect,
  SMAAEffect,
  SMAAPreset,
  KernelSize,
  BlendFunction,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
// realism-effects motion blur & TRAA disabled — they require every
// material in the scene to populate a velocity buffer, and the biome /
// enemy / particle materials in this game don't, which produced visible
// black artefacts (tree tops, enemy panels). The library is still
// imported by external-effects.d.ts in case we add a different
// realism-effects pass later.
import type { GraphicsPreset, GraphicsQuality } from './GameSettingsManager';

/** Live atmosphere uniforms that get pushed to the grading effects every frame. */
export interface AtmosphereGrading {
  /** 0..2 — base saturation multiplier (1 = no change). */
  saturation: number;
  /** 0..2 — base contrast multiplier (1 = no change). */
  contrast: number;
  /** -1..1 — warm (+) / cool (-) shift, like white balance. */
  temperature: number;
  /** Linear exposure multiplier (1 = neutral). Drives the EV adapter — pre-tonemap. */
  exposure?: number;
  /** Time-of-day bloom curve from the day-cycle system. */
  bloomStrength?: number;
  /** RGB tint applied multiplicatively to the final image (per-time-of-day colour cast). */
  colorTint: THREE.Color | THREE.Vector3 | { r: number; g: number; b: number };
  /** World-space sun direction — drives screen-space light shafts. */
  sunDirection?: THREE.Vector3;
  /** True at twilight / night — switches the look-dev into the "neon" branch. */
  isNight?: boolean;
}

/**
 * Three.js r162+ changed the signature of `copyFramebufferToTexture` from
 * `(position, texture, level)` to `(texture, position, level)`.
 *
 * realism-effects (≤1.1.x) still calls the old form, which on the new
 * three.js reads `.image.width` from a Vector2 and explodes. We wrap the
 * renderer's method once so calls with the old order are silently re-ordered.
 *
 * Idempotent — calling twice on the same renderer is a no-op.
 */
function installFramebufferCompatShim(renderer: THREE.WebGLRenderer) {
  const r = renderer as THREE.WebGLRenderer & { __framebufferCompatPatched?: boolean };
  if (r.__framebufferCompatPatched) return;
  const original = renderer.copyFramebufferToTexture.bind(renderer);
  renderer.copyFramebufferToTexture = function (
    arg1: unknown,
    arg2?: unknown,
    arg3?: unknown,
  ) {
    // New signature: first arg is a texture with `.image`. Old signature:
    // first arg is a Vector2 (.isVector2 true). Detect and reorder.
    if (arg1 && (arg1 as THREE.Vector2).isVector2) {
      return original(arg2 as THREE.Texture, arg1 as THREE.Vector2, arg3 as number | undefined);
    }
    return original(arg1 as THREE.Texture, arg2 as THREE.Vector2 | undefined, arg3 as number | undefined);
  } as THREE.WebGLRenderer['copyFramebufferToTexture'];
  r.__framebufferCompatPatched = true;
}

/**
 * Custom pmndrs Effect — multiplies the input colour by a tint RGB and
 * applies a master linear exposure BEFORE the tonemapping stage.
 *
 * Combining the two into a single effect saves a fullscreen pass.
 */
class ExposureTintEffect extends Effect {
  constructor(tint = new THREE.Color(1, 1, 1), exposure = 1.0) {
    super(
      'ExposureTintEffect',
      /* glsl */ `
        uniform vec3 tint;
        uniform float exposure;
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          vec3 c = inputColor.rgb * tint * exposure;
          outputColor = vec4(c, inputColor.a);
        }
      `,
      {
        uniforms: new Map<string, THREE.Uniform<unknown>>([
          ['tint', new THREE.Uniform(tint.clone())],
          ['exposure', new THREE.Uniform(exposure)],
        ]),
      },
    );
  }

  get tint(): THREE.Color {
    return (this.uniforms.get('tint') as THREE.Uniform<THREE.Color>).value;
  }

  set exposure(v: number) {
    (this.uniforms.get('exposure') as THREE.Uniform<number>).value = v;
  }
  get exposure(): number {
    return (this.uniforms.get('exposure') as THREE.Uniform<number>).value;
  }
}

/**
 * Cinematic atmosphere — fine-grained film grain plus a perceptual
 * micro-contrast curve. The grain density scales with luma so shadows
 * keep their bite (cinema cameras grain more in mid-tones than blacks).
 *
 * This is intentionally subtle. Heavy grain reads as "indie hipster",
 * not AAA. We want the texture of a real lens, not a Photoshop filter.
 */
class CinematicAtmosphereEffect extends Effect {
  constructor(grainStrength: number, scanlineStrength: number) {
    super(
      'CinematicAtmosphereEffect',
      /* glsl */ `
        uniform float time;
        uniform float grainStrength;
        uniform float scanlineStrength;
        uniform float shadowLift;
        uniform float vibrance;

        float filmHash(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
        }

        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          vec3 color = inputColor.rgb;
          float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

          // Shadow lift — gentle gain in the deep-shadow range so foreground
          // foliage and rock detail isn't crushed to silhouette. Only kicks
          // in below luma ≈ 0.25, so highlights are untouched.
          float liftMask = 1.0 - smoothstep(0.0, 0.25, luma);
          color += vec3(shadowLift) * liftMask;

          // Vibrance — selective saturation that affects only mid-saturation
          // colours, so already-saturated reds/blues don't over-shoot.
          float maxC = max(max(color.r, color.g), color.b);
          float minC = min(min(color.r, color.g), color.b);
          float sat = (maxC - minC) / max(maxC, 1e-4);
          float vibranceMask = 1.0 - sat; // less-saturated pixels get bigger boost
          vec3 chroma = color - vec3(luma);
          color = vec3(luma) + chroma * (1.0 + vibrance * vibranceMask);

          // Fine grain — scaled by mid-tone luma so shadows stay clean.
          float grain = filmHash(uv * vec2(1919.0, 1079.0) + vec2(time * 41.0, time * 17.0)) - 0.5;
          float grainShape = smoothstep(0.05, 0.4, luma) * (1.0 - smoothstep(0.85, 1.0, luma));
          color += grain * grainStrength * (0.4 + grainShape * 0.7);

          // Soft scanline — adds a sub-pixel "lens" feel without reading as a CRT.
          float scan = sin(uv.y * 1600.0) * 0.5 + 0.5;
          color *= 1.0 - scan * scanlineStrength * 0.06;

          // Filmic micro-contrast s-curve.
          vec3 contrasted = color * color * (3.0 - 2.0 * color);
          color = mix(color, contrasted, 0.08);

          // Subtle saturation lift around bright highlights — the "Control"
          // shimmer where neon edges read richer than their RGB suggests.
          float lumaFinal = dot(color, vec3(0.2126, 0.7152, 0.0722));
          vec3 chroma2 = color - vec3(lumaFinal);
          color = vec3(lumaFinal) + chroma2 * (1.0 + smoothstep(0.5, 1.2, lumaFinal) * 0.15);

          outputColor = vec4(max(color, vec3(0.0)), inputColor.a);
        }
      `,
      {
        uniforms: new Map<string, THREE.Uniform<unknown>>([
          ['time', new THREE.Uniform(0)],
          ['grainStrength', new THREE.Uniform(grainStrength)],
          ['scanlineStrength', new THREE.Uniform(scanlineStrength)],
          ['shadowLift', new THREE.Uniform(0.04)],
          ['vibrance', new THREE.Uniform(0.25)],
        ]),
      },
    );
  }

  setShadowLift(v: number) {
    (this.uniforms.get('shadowLift') as THREE.Uniform<number>).value = v;
  }

  setVibrance(v: number) {
    (this.uniforms.get('vibrance') as THREE.Uniform<number>).value = v;
  }

  advance(delta: number) {
    (this.uniforms.get('time') as THREE.Uniform<number>).value += delta;
  }
}

/**
 * AAA post-processing pipeline built on pmndrs/postprocessing + realism-effects.
 *
 *  RenderPass
 *    → N8AO (Medium+)
 *    → VelocityDepthNormalPass (Ultra)
 *    → EffectPass(exposureTint + grade + bloom + vignette + grain + AGX tone)
 *    → EffectPass(GodRays)      [High/Ultra — real radial light scattering]
 *    → EffectPass(ChromaticAb)  [skip on Low]
 *    → EffectPass(MotionBlur)   [Ultra only — physical inter-frame blur]
 *    → EffectPass(TRAA or SMAA) [TRAA on Ultra, SMAA otherwise]
 *
 * Tone mapping happens in the pipeline (AGX — modern filmic curve used by
 * Blender 4.x and many AAA titles, gives a much more cinematic roll-off
 * than ACES on bright skies). The renderer renders NoToneMapping into a
 * HalfFloat HDR buffer; the pipeline reads true HDR highlights for bloom,
 * applies grading + atmospheric tint + a master exposure in linear space,
 * then maps to display range with AGX.
 */
export class PostProcessingPipeline {
  composer: EffectComposer;

  private readonly bloom: BloomEffect;
  private readonly baseBloomIntensity: number;
  private readonly hueSat: HueSaturationEffect;
  private readonly brightnessContrast: BrightnessContrastEffect;
  private readonly vignette: VignetteEffect;
  private readonly chromatic: ChromaticAberrationEffect;
  private readonly toneMapping: ToneMappingEffect;
  private readonly smaa: SMAAEffect;
  private readonly exposureTint: ExposureTintEffect;
  private readonly cinematicAtmosphere: CinematicAtmosphereEffect;
  private readonly godRays: GodRaysEffect | null;
  private readonly godRaysSunMesh: THREE.Mesh | null;
  private godRaysPass: EffectPass | null = null;
  private readonly baseGodRaysWeight: number;
  private readonly baseGodRaysDensity: number;
  private readonly n8aoPass: N8AOPostPass | null;
  private readonly baseN8aoIntensity: number;
  private readonly camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private readonly _tempSun = new THREE.Vector3();
  private readonly _tempNdc = new THREE.Vector3();
  private currentExposure = 1.0;
  private isNightMode = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    _graphicsPreset: GraphicsPreset,
    quality: GraphicsQuality,
  ) {
    this.camera = camera;
    // Tone mapping happens in the pipeline — keep the renderer's built-in
    // mapper off so we don't double-apply.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    // realism-effects calls copyFramebufferToTexture with the legacy
    // argument order. Patch the renderer once so its VelocityDepthNormalPass
    // (used by TRAA / Motion Blur) doesn't blow up on three.js r162+.
    installFramebufferCompatShim(renderer);

    this.composer = new EffectComposer(renderer, {
      // HDR framebuffer so bloom can read true highlights (sun, muzzle flash)
      // without clipping. Anything brighter than 1.0 is preserved here.
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    });

    this.composer.addPass(new RenderPass(scene, camera));

    const isUltraQuality = quality === 'ultra';
    const isHighEndQuality = quality === 'high' || isUltraQuality;
    const isMediumPlus = quality !== 'low';

    if (isMediumPlus) {
      const n8aoPass = new N8AOPostPass(scene, camera);
      n8aoPass.setQualityMode(isUltraQuality ? 'Ultra' : isHighEndQuality ? 'High' : 'Medium');
      n8aoPass.configuration.halfRes = !isHighEndQuality;
      n8aoPass.configuration.depthAwareUpsampling = true;
      n8aoPass.configuration.screenSpaceRadius = false;
      // Conservative N8AO so unlit/emissive meshes (bullets, powerups,
      // muzzle flashes) keep their actual colour. The fragment shader
      // applies AO as `mix(scene, black, 1-pow(ao,intensity))`; the
      // base intensity below is the DAYTIME value, with night driven
      // higher at runtime via updateAtmosphere for that moody-noir feel.
      n8aoPass.configuration.aoRadius = isUltraQuality ? 2.5 : isHighEndQuality ? 2.0 : 1.6;
      n8aoPass.configuration.distanceFalloff = isUltraQuality ? 0.45 : isHighEndQuality ? 0.4 : 0.35;
      this.baseN8aoIntensity = isUltraQuality ? 0.9 : isHighEndQuality ? 0.75 : 0.6;
      n8aoPass.configuration.intensity = this.baseN8aoIntensity;
      n8aoPass.configuration.denoiseRadius = isUltraQuality ? 12 : 8;
      n8aoPass.configuration.denoiseIterations = isUltraQuality ? 2 : 1;
      n8aoPass.configuration.colorMultiply = true;
      // transparencyAware enables the `userData.cannotReceiveAO` opt-out
      // that bullets, powerups and muzzle flashes use to bypass AO.
      n8aoPass.configuration.transparencyAware = true;
      this.composer.addPass(n8aoPass);
      this.n8aoPass = n8aoPass;
    } else {
      this.n8aoPass = null;
      this.baseN8aoIntensity = 0;
    }

    // MotionBlur and TRAA from realism-effects both require every material
    // to populate a velocity buffer. The biome cones, enemy parts and
    // custom unlit materials in this game don't write velocity correctly,
    // so the resulting velocity buffer contains undefined samples — when
    // the motion-blur shader samples those it returns BLACK, producing
    // the "black tree tops" / "tearing artifact" the user reported on
    // Ultra. We skip the velocity pass entirely. Ultra still gets max
    // SMAA, max bloom, max shadow map, max AO — just no motion blur.

    // ── BLOOM ────────────────────────────────────────────────────────────
    // Stronger bloom — the sun, tracers, muzzle flashes, emissive powerups
    // all NEED to glow visibly. Threshold lowered to 0.78 so even
    // mid-bright highlights bloom, but the smoothing prevents bloom from
    // bleeding into the bright sky and washing the image out.
    this.baseBloomIntensity =
      isUltraQuality ? 0.7 :
      quality === 'high' ? 0.58 :
      quality === 'medium' ? 0.44 :
      0.32;
    this.bloom = new BloomEffect({
      intensity: this.baseBloomIntensity,
      luminanceThreshold: 0.78,
      luminanceSmoothing: 0.12,
      mipmapBlur: true,
      kernelSize: KernelSize.LARGE,
      radius: 0.85,
      levels: isUltraQuality ? 9 : quality === 'high' ? 8 : quality === 'medium' ? 7 : 5,
    });

    // ── COLOR GRADING ─────────────────────────────────────────────────────
    // Start truly neutral; updateAtmosphere() applies small per-frame deltas.
    this.hueSat = new HueSaturationEffect({ saturation: 0, hue: 0 });
    this.brightnessContrast = new BrightnessContrastEffect({ brightness: 0, contrast: 0 });

    // ── EXPOSURE + COLOR TINT (pre-tonemap) ──────────────────────────────
    // Master linear exposure (eye adaptation) folded with the per-time-of-day
    // multiplicative tint (warm sunset, cool dawn, magenta night). The
    // shader is dirt-cheap so we save a pass by combining them.
    this.exposureTint = new ExposureTintEffect(new THREE.Color(1, 1, 1), 1.0);

    // ── FILM GRAIN + MICRO-CONTRAST ──────────────────────────────────────
    // Scanline dropped to almost nothing — what was 0.32 was actively
    // making the bright sky look hazy/banded.
    this.cinematicAtmosphere = new CinematicAtmosphereEffect(
      isUltraQuality ? 0.010 : quality === 'high' ? 0.008 : quality === 'medium' ? 0.006 : 0.004,
      isUltraQuality ? 0.10 : quality === 'high' ? 0.08 : 0.06,
    );

    // ── CHROMATIC ABERRATION ──────────────────────────────────────────────
    // Whisper-thin lens fringe — barely perceptible at the edges, the kind
    // of CA you see on a quality cinema prime, not a phone webcam.
    this.chromatic = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.00038, 0.00038),
      radialModulation: true,
      modulationOffset: 0.6,
    });

    // ── VIGNETTE ──────────────────────────────────────────────────────────
    // Soft frame — only darkens the very corners.
    this.vignette = new VignetteEffect({
      technique: VignetteTechnique.DEFAULT,
      offset: 0.42,
      darkness: 0.4,
    });

    // ── TONE MAPPING (ACES Filmic — vibrant AAA standard) ────────────────
    // ACES_FILMIC keeps colour saturation in mid-tones where AGX flattens
    // it. This is the look every modern blockbuster AAA shooter (Cyberpunk,
    // The Last of Us, Doom Eternal) actually uses. Combined with the
    // saturation grade above and a generous bloom, it gives the punchy,
    // colourful image the player expects.
    this.toneMapping = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
      whitePoint: 5.5,
      middleGrey: 0.5,
    });

    // ── SMAA ──────────────────────────────────────────────────────────────
    this.smaa = new SMAAEffect({
      preset:
        isUltraQuality ? SMAAPreset.ULTRA :
        quality === 'high' ? SMAAPreset.ULTRA :
        quality === 'medium' ? SMAAPreset.HIGH :
        SMAAPreset.MEDIUM,
    });

    // ── GOD RAYS (volumetric light scattering) ───────────────────────────
    // Real radial-blur god rays. The pmndrs effect maintains its own
    // lightScene — on the first frame it moves our sun mesh INTO that
    // scene (and keeps it there). We never add the mesh to the gameplay
    // scene, so the player only sees the rays, not a giant duplicate sun
    // sphere. The lightScene gets rendered on top of a depth-copied
    // inputBuffer, so trees/rocks/the gun naturally occlude the rays.
    //
    // The whole pass is enable/disable-toggled by updateAtmosphere() based
    // on the sun's projected NDC, so we never accumulate radial samples
    // toward an off-screen sun (which is what blew out earlier frames).
    this.baseGodRaysWeight = isHighEndQuality ? 0.35 : 0.0;
    this.baseGodRaysDensity = 0.96;
    if (isHighEndQuality && camera instanceof THREE.PerspectiveCamera) {
      // Sun mesh sized so the radial blur has a meaningful bright core to
      // sample from — radius 8 at 380 unit distance ≈ 2.4° angular, large
      // enough to drive visible shafts but small enough to read as a
      // distant sun rather than a fireball overhead.
      const sunGeo = new THREE.SphereGeometry(8, 18, 18);
      const sunMat = new THREE.MeshBasicMaterial({
        color: 0xffe2a0,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        fog: false,
      });
      this.godRaysSunMesh = new THREE.Mesh(sunGeo, sunMat);
      this.godRaysSunMesh.frustumCulled = false;
      // We bake position into matrix manually each frame in updateAtmosphere
      // — this lets the GodRaysEffect's own matrixAutoUpdate juggling work
      // correctly without the mesh ever rendering at world origin.
      this.godRaysSunMesh.matrixAutoUpdate = false;
      // Defensive: tag so N8AO doesn't sample it.
      this.godRaysSunMesh.userData.cannotReceiveAO = true;
      // Park the mesh far up the +Y axis so even if updateAtmosphere
      // hasn't fired yet (e.g. shader warmup frame), it can't blob on
      // the ground — anywhere above the sky dome is invisible to a
      // forward-looking camera.
      this.godRaysSunMesh.position.set(0, 600, 0);
      this.godRaysSunMesh.updateMatrix();
      // NOT added to the gameplay scene — the GodRaysEffect.update() call
      // reparents it into its internal lightScene on the first render.

      this.godRays = new GodRaysEffect(camera, this.godRaysSunMesh, {
        resolutionScale: isUltraQuality ? 0.6 : 0.5,
        kernelSize: isUltraQuality ? KernelSize.LARGE : KernelSize.MEDIUM,
        density: this.baseGodRaysDensity,
        decay: 0.94,
        weight: this.baseGodRaysWeight,
        exposure: 0.6,
        samples: isUltraQuality ? 80 : 60,
        clampMax: 1.0,
        blendFunction: BlendFunction.SCREEN,
        blur: true,
      });
      void scene; // intentionally not added — GodRaysEffect adopts the mesh
    } else {
      this.godRays = null;
      this.godRaysSunMesh = null;
    }

    // pmndrs merges non-convolution effects into a single fragment shader.
    // Convolution effects (chromatic aberration, SMAA / TRAA, god rays,
    // motion blur) each need their own EffectPass — the merge-step rejects
    // them.
    //
    // Order matters:
    //   exposure+tint → grade → bloom from tinted highlights → vignette
    //   → grain/micro-contrast → AGX tonemap
    this.composer.addPass(new EffectPass(
      camera,
      this.exposureTint,
      this.hueSat,
      this.brightnessContrast,
      this.bloom,
      this.vignette,
      this.cinematicAtmosphere,
      this.toneMapping,
    ));

    if (this.godRays) {
      this.godRaysPass = new EffectPass(camera, this.godRays);
      // Start disabled — updateAtmosphere() will enable when the sun is
      // genuinely on-screen with a meaningful weight.
      this.godRaysPass.enabled = false;
      this.composer.addPass(this.godRaysPass);
    }

    if (quality !== 'low') {
      this.composer.addPass(new EffectPass(camera, this.chromatic));
    }

    // SMAA always — the temporal AA path (TRAA) and motion blur had too
    // many failure modes with custom materials, and SMAA-ULTRA looks
    // great regardless.
    this.composer.addPass(new EffectPass(camera, this.smaa));
  }

  /**
   * Push live atmospheric grading into the effects. Called each frame so
   * dusk/dawn/bloodmoon shifts read on screen.
   *
   * The incoming saturation/contrast values use the OLD shader convention
   * where 1.0 means "no change". We apply small percentage-deltas into
   * pmndrs' [-1,1] range so the day cycle nudges the grade without ever
   * blowing out.
   */
  updateAtmosphere(g: AtmosphereGrading) {
    // Saturation: ACES_FILMIC is naturally more saturated than AGX, so we
    // slice a more modest 0.45× of the day-cycle delta. The combined
    // effect (ACES + this grade + tinted exposure) gives genuine Cyberpunk
    // midday vibrancy without going neon.
    this.hueSat.saturation = THREE.MathUtils.clamp((g.saturation - 1.0) * 0.45, -0.35, 0.4);

    // Contrast: meaningful s-curve for depth, capped so shadows don't
    // crush — important for the foliage and rock detail in mid-distance.
    this.brightnessContrast.contrast = THREE.MathUtils.clamp((g.contrast - 1.0) * 0.3, -0.25, 0.3);

    // Brightness: pure temperature tilt — keep close to neutral, real
    // exposure lives in the ExposureTintEffect below.
    this.brightnessContrast.brightness = THREE.MathUtils.clamp(g.temperature * 0.04, -0.15, 0.15);

    // Master linear exposure (eye adaptation). Smoothed so a sudden flash
    // or entering shadow doesn't instantly clamp the entire image — the
    // light adapter eases over a few frames, like a real CMOS sensor.
    if (typeof g.exposure === 'number') {
      const target = THREE.MathUtils.clamp(g.exposure, 0.4, 1.8);
      // Cheap exponential lerp toward target — ~100ms response.
      this.currentExposure += (target - this.currentExposure) * 0.08;
      this.exposureTint.exposure = this.currentExposure;
    }

    if (typeof g.bloomStrength === 'number') {
      // Map the day-cycle bloom value (1..3.5) onto a 0.85..1.5 multiplier
      // so even the bloodmoon never glows like a runway flare.
      const bloomBoost = THREE.MathUtils.clamp(g.bloomStrength / 3.0, 0.85, 1.5);
      this.bloom.intensity = this.baseBloomIntensity * bloomBoost;
    }

    // Atmospheric colour cast — multiplicative tint baked into the
    // exposure pass so it modifies the linear signal before tone mapping.
    if (g.colorTint) {
      const tint = this.exposureTint.tint;
      if (g.colorTint instanceof THREE.Color) {
        tint.copy(g.colorTint);
      } else if (g.colorTint instanceof THREE.Vector3) {
        tint.setRGB(g.colorTint.x, g.colorTint.y, g.colorTint.z);
      } else {
        tint.setRGB(g.colorTint.r, g.colorTint.g, g.colorTint.b);
      }
    }

    // ── DAY/NIGHT GRADE PROFILE: shadow lift + vibrance + AO intensity ─
    // Day mode lifts shadows generously (foliage detail in shaded areas)
    // and bumps vibrance for the punchy AAA look. Night mode keeps lift
    // tighter (deep moody shadows), pushes vibrance MORE so the neon/cobalt
    // palette pops against the dark plate, AND boosts AO so contact
    // shadows under the moonlight read as dramatic noir contrast.
    this.isNightMode = !!g.isNight;
    if (this.isNightMode) {
      this.cinematicAtmosphere.setShadowLift(0.02);
      this.cinematicAtmosphere.setVibrance(0.38);
      if (this.n8aoPass) this.n8aoPass.configuration.intensity = this.baseN8aoIntensity * 1.4;
    } else {
      this.cinematicAtmosphere.setShadowLift(0.06);
      this.cinematicAtmosphere.setVibrance(0.28);
      if (this.n8aoPass) this.n8aoPass.configuration.intensity = this.baseN8aoIntensity;
    }

    // ── GOD RAYS: position the sun mesh + gate weight by visibility ─────
    //
    // CRITICAL: when the sun projects OFF-SCREEN, the radial-blur shader
    // walks samples outward toward a clamped UV (2.0) and accumulates the
    // bright sky pixels at the texture edge into a blown-out white blob.
    // We pre-project the sun to NDC and HARD-GATE the weight to zero when
    // the sun is past the visible frame — only true on-screen suns cast
    // rays now.
    if (this.godRays && this.godRaysSunMesh && g.sunDirection) {
      this._tempSun.copy(g.sunDirection).normalize();
      const farDist = 380;
      this.godRaysSunMesh.position.set(
        this.camera.position.x + this._tempSun.x * farDist,
        this.camera.position.y + this._tempSun.y * farDist,
        this.camera.position.z + this._tempSun.z * farDist,
      );
      // CRITICAL: bake the new position into the local matrix manually.
      // pmndrs GodRaysEffect.update() sets `matrixAutoUpdate=false` before
      // computing world matrices, which means updateMatrix() is skipped —
      // and because our sun mesh lives ONLY in the effect's private
      // lightScene (never in the gameplay scene), the main renderer
      // never calls updateMatrix() on it either. Without this explicit
      // call the matrix stays at identity, the mesh renders at WORLD
      // ORIGIN, and the rays radiate from whatever screen point (0,0,0)
      // projects to — which from a forward-looking FPS camera is on the
      // ground in front of the player. That was the "light blob on the
      // grass" the player kept seeing.
      this.godRaysSunMesh.updateMatrix();
      this.godRaysSunMesh.matrixWorldNeedsUpdate = true;

      // Force camera matrices fresh — updateAtmosphere is called BEFORE
      // composer.render(), which is when three.js normally updates them.
      // Stale matrices would give a wrong NDC projection and the gate
      // below would be unreliable.
      this.camera.updateMatrixWorld(true);
      this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

      this._tempNdc.set(
        this.godRaysSunMesh.position.x,
        this.godRaysSunMesh.position.y,
        this.godRaysSunMesh.position.z,
      );
      this._tempNdc.project(this.camera);
      const sx = this._tempNdc.x;        // NDC X — [-1, 1] inside frame
      const sy = this._tempNdc.y;        // NDC Y
      const sz = this._tempNdc.z;        // NDC Z — > 1 means BEHIND camera
      // Wide gate: full strength when the sun is anywhere in frame, smooth
      // falloff out to 30% past the edge so rays still radiate inward
      // when the player has the sun just off-screen. Beyond that, zero
      // contribution (no edge-clamp accumulation).
      const insideX = 1.0 - THREE.MathUtils.smoothstep(Math.abs(sx), 1.0, 1.3);
      const insideY = 1.0 - THREE.MathUtils.smoothstep(Math.abs(sy), 1.0, 1.3);
      const onScreenGate = sz >= 1 ? 0 : (insideX * insideY);

      const altitude = this._tempSun.y;
      const altGate = THREE.MathUtils.smoothstep(altitude, -0.05, 0.45);

      const mat = this.godRaysSunMesh.material as THREE.MeshBasicMaterial;
      let effectiveWeight: number;
      if (this.isNightMode) {
        mat.color.setRGB(0.55, 0.7, 1.0);
        mat.opacity = 0.5 * altGate + 0.1;
        effectiveWeight = this.baseGodRaysWeight * 0.4 * onScreenGate;
      } else {
        const lowSun = THREE.MathUtils.smoothstep(1.0 - altitude, 0.4, 0.85);
        mat.color.setRGB(1.0, 0.92 - lowSun * 0.18, 0.78 - lowSun * 0.28);
        mat.opacity = 0.85;
        effectiveWeight = this.baseGodRaysWeight * onScreenGate * altGate;
      }
      this.godRays.godRaysMaterial.uniforms.weight.value = effectiveWeight;
      this.godRaysSunMesh.visible = onScreenGate > 0.005 && (altGate > 0.01 || this.isNightMode);

      // Pass-level kill switch — when the gate is essentially closed, skip
      // the entire god-rays pass. Setting weight to 0 isn't enough on its
      // own; the radial-blur shader still walks 60 samples that can pick
      // up edge clamp artefacts from the input buffer.
      if (this.godRaysPass) {
        this.godRaysPass.enabled = effectiveWeight > 0.01;
      }
    } else if (this.godRaysPass) {
      // No sun direction provided this frame — keep the pass off entirely.
      this.godRaysPass.enabled = false;
    }
  }

  render(delta: number) {
    this.cinematicAtmosphere.advance(delta);
    this.composer.render(delta);
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
  }

  dispose() {
    if (this.godRaysSunMesh) {
      // The sun mesh lives inside the GodRaysEffect's private lightScene
      // — detach from whichever parent currently owns it.
      this.godRaysSunMesh.parent?.remove(this.godRaysSunMesh);
      this.godRaysSunMesh.geometry.dispose();
      (this.godRaysSunMesh.material as THREE.Material).dispose();
    }
    this.composer.dispose();
  }
}
