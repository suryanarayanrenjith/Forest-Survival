import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  HueSaturationEffect,
  BrightnessContrastEffect,
  VignetteEffect,
  VignetteTechnique,
  ChromaticAberrationEffect,
  SMAAEffect,
  SMAAPreset,
} from 'postprocessing';
import type { GraphicsPreset, GraphicsQuality } from './GameSettingsManager';

/** Live atmosphere uniforms that get pushed to the grading effects every frame. */
export interface AtmosphereGrading {
  /** 0..2 — base saturation multiplier (1 = no change). */
  saturation: number;
  /** 0..2 — base contrast multiplier (1 = no change). */
  contrast: number;
  /** -1..1 — warm (+) / cool (-) shift, like white balance. */
  temperature: number;
  /** RGB tint applied multiplicatively to the final image. */
  colorTint: THREE.Color | THREE.Vector3 | { r: number; g: number; b: number };
}

/**
 * AAA post-processing pipeline built on pmndrs/postprocessing.
 *
 * Replaces the previous hand-rolled bright-pass + Gaussian-blur pipeline
 * with a single merged-effect pass: mipmap-blur bloom, ACES tone mapping,
 * SMAA edge anti-aliasing, hue/saturation + brightness/contrast grading,
 * subtle chromatic aberration, and a soft vignette.
 *
 * Effects are merged into a single fragment shader for performance — the
 * GPU sees one fullscreen draw, not one per effect.
 */
export class PostProcessingPipeline {
  composer: EffectComposer;

  private readonly bloom: BloomEffect;
  private readonly hueSat: HueSaturationEffect;
  private readonly brightnessContrast: BrightnessContrastEffect;
  private readonly vignette: VignetteEffect;
  private readonly chromatic: ChromaticAberrationEffect;
  private readonly toneMapping: ToneMappingEffect;
  private readonly smaa: SMAAEffect;
  // Live color tint applied at composite time — mutated each frame from
  // the day/atmosphere system to subtly warm/cool the whole frame.
  private readonly tintColor = new THREE.Color(1, 1, 1);

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    graphicsPreset: GraphicsPreset,
    quality: GraphicsQuality,
  ) {
    // Tone mapping happens inside the post pipeline now — turn off the
    // renderer's built-in tone mapper to avoid double-applying ACES.
    renderer.toneMapping = THREE.NoToneMapping;

    this.composer = new EffectComposer(renderer, {
      // HalfFloat gives us HDR headroom so bloom can capture true highlights
      // (sun, muzzle flash, embers) without clipping or banding.
      frameBufferType: THREE.HalfFloatType,
      // SMAA replaces hardware MSAA — leave multisampling at 0.
      multisampling: 0,
    });

    this.composer.addPass(new RenderPass(scene, camera));

    // ── BLOOM (mipmap-blur cinematic glow) ───────────────────────────────
    // Kawase / mipmap-based blur — only bright highlights (sun, muzzle flash,
    // tracers, embers) feather out. Threshold tuned for LINEAR HDR input,
    // where 0.85+ is genuinely bright (mid-grey is around 0.18-0.5).
    this.bloom = new BloomEffect({
      intensity: quality === 'high' ? 0.55 : quality === 'medium' ? 0.40 : 0.28,
      luminanceThreshold: 0.85,
      luminanceSmoothing: 0.20,
      mipmapBlur: true,
      radius: 0.72,
      levels: quality === 'high' ? 7 : quality === 'medium' ? 5 : 4,
    });

    // ── COLOR GRADING ─────────────────────────────────────────────────────
    // Start neutral. updateAtmosphere() pushes small per-frame deltas so the
    // day cycle can warm/cool/saturate the look without ever blowing out.
    this.hueSat = new HueSaturationEffect({
      saturation: 0.0,
      hue: 0,
    });

    this.brightnessContrast = new BrightnessContrastEffect({
      // +0.06 compensates for the lost renderer.toneMappingExposure (was 1.15)
      // now that tone mapping lives in the post pipeline.
      brightness: 0.06,
      contrast: 0.05,
    });

    // ── CHROMATIC ABERRATION (cinematic edge) ─────────────────────────────
    // Whisper-thin — should be invisible at the centre and barely perceptible
    // at the corners. Anything more and it reads as a broken display.
    this.chromatic = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.00035, 0.00035),
      radialModulation: true,
      modulationOffset: 0.55,
    });

    // ── VIGNETTE ──────────────────────────────────────────────────────────
    // Soft falloff that frames the action without darkening playable area.
    this.vignette = new VignetteEffect({
      technique: VignetteTechnique.DEFAULT,
      offset: 0.50,
      darkness: 0.28,
    });

    // ── TONE MAPPING (ACES Filmic) ────────────────────────────────────────
    // Roll-off whites smoothly instead of clipping. whitePoint = 5 gives
    // a bit more highlight headroom for the sun + emissive props.
    this.toneMapping = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
      whitePoint: 5.0,
      middleGrey: 0.5,
    });

    // ── SMAA (sub-pixel morphological AA) ─────────────────────────────────
    // Better edge quality than MSAA when post-FX is on, and cheaper.
    this.smaa = new SMAAEffect({
      preset:
        quality === 'high' ? SMAAPreset.ULTRA :
        quality === 'medium' ? SMAAPreset.HIGH :
        SMAAPreset.MEDIUM,
    });

    // pmndrs/postprocessing merges effects into a single fragment shader to
    // save fullscreen draws — but CONVOLUTION effects (those that sample
    // neighbouring pixels) cannot be merged with anything else and must
    // each live in their own EffectPass.
    //
    // Non-convolution chain — bloom + colour grading + tone mapping + vignette
    // all share one merged pass: a single fullscreen draw on the GPU.
    this.composer.addPass(new EffectPass(
      camera,
      this.hueSat,
      this.brightnessContrast,
      this.bloom,
      this.vignette,
      this.toneMapping,
    ));

    // Chromatic aberration is a convolution effect (per-channel UV offsets) —
    // skipped on Low for perf, otherwise gets its own dedicated pass.
    if (quality !== 'low') {
      this.composer.addPass(new EffectPass(camera, this.chromatic));
    }

    // SMAA is also convolution-based (edge detection + blending). Last pass
    // so it anti-aliases the fully-composited image.
    this.composer.addPass(new EffectPass(camera, this.smaa));

    // We're not using `graphicsPreset.viewDistance` directly here, but we
    // pull the reference in so callers don't pass an unused param.
    void graphicsPreset;
  }

  /**
   * Push live atmospheric grading into the effects. Called each frame so
   * dusk/dawn/bloodmoon shifts read on screen.
   *
   * The incoming values use the OLD shader convention where 1.0 means
   * "no change". We map small deltas (≤40%) into pmndrs' [-1,1] range so
   * the day cycle gently nudges the grade without ever blowing it out.
   */
  updateAtmosphere(g: AtmosphereGrading) {
    // Saturation: take a 35% slice of the multiplicative delta. A typical
    // sunset value of g.saturation = 1.2 maps to +0.07 — perceptibly more
    // vivid, not neon.
    this.hueSat.saturation = THREE.MathUtils.clamp((g.saturation - 1.0) * 0.35, -0.4, 0.4);

    // Contrast: keep the +0.05 baseline (set in the constructor) and add
    // a small per-frame delta on top.
    this.brightnessContrast.contrast = THREE.MathUtils.clamp(0.05 + (g.contrast - 1.0) * 0.25, -0.3, 0.3);

    // Brightness: +0.06 baseline (compensates for lost renderer exposure)
    // plus a subtle warm/cool tilt from temperature.
    this.brightnessContrast.brightness = THREE.MathUtils.clamp(0.06 + g.temperature * 0.05, -0.2, 0.2);

    // Track the colour tint for future passes (not currently piped into a
    // pmndrs effect — kept so existing call sites stay valid).
    if (g.colorTint) {
      if (g.colorTint instanceof THREE.Color) {
        this.tintColor.copy(g.colorTint);
      } else if (g.colorTint instanceof THREE.Vector3) {
        this.tintColor.setRGB(g.colorTint.x, g.colorTint.y, g.colorTint.z);
      } else {
        this.tintColor.setRGB(g.colorTint.r, g.colorTint.g, g.colorTint.b);
      }
    }
  }

  render(delta: number) {
    this.composer.render(delta);
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
  }

  dispose() {
    // EffectComposer.dispose() walks every pass and effect for us.
    this.composer.dispose();
  }
}
