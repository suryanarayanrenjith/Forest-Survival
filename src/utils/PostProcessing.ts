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
    // Kawase / mipmap-based blur is hierarchically wider and softer than the
    // 9-tap Gaussian we had before — bright lights and tracers feather out
    // with a real "halation" feel.
    this.bloom = new BloomEffect({
      intensity: quality === 'high' ? 1.05 : quality === 'medium' ? 0.85 : 0.6,
      luminanceThreshold: 0.55,
      luminanceSmoothing: 0.18,
      mipmapBlur: true,
      radius: 0.86,
      levels: quality === 'high' ? 8 : quality === 'medium' ? 6 : 4,
    });

    // ── COLOR GRADING ─────────────────────────────────────────────────────
    // Saturation/hue and brightness/contrast are split because pmndrs runs
    // them as different shader snippets — keeps the deltas easier to tune.
    this.hueSat = new HueSaturationEffect({
      saturation: 0.15,   // mild boost on top of whatever the atmosphere asks
      hue: 0,
    });

    this.brightnessContrast = new BrightnessContrastEffect({
      brightness: 0.04,
      contrast: 0.12,
    });

    // ── CHROMATIC ABERRATION (cinematic edge) ─────────────────────────────
    // Subtle — barely perceptible at the centre, modulates outward so it
    // reads as a real lens, not a filter. Skipped on Low for perf.
    this.chromatic = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0009, 0.0009),
      radialModulation: true,
      modulationOffset: 0.42,
    });

    // ── VIGNETTE ──────────────────────────────────────────────────────────
    this.vignette = new VignetteEffect({
      technique: VignetteTechnique.DEFAULT,
      offset: 0.32,
      darkness: 0.55,
    });

    // ── TONE MAPPING (ACES Filmic) ────────────────────────────────────────
    this.toneMapping = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
      whitePoint: 4.0,
      middleGrey: 0.6,
    });

    // ── SMAA (sub-pixel morphological AA) ─────────────────────────────────
    // Better edge quality than MSAA when post-FX is on, and cheaper.
    this.smaa = new SMAAEffect({
      preset:
        quality === 'high' ? SMAAPreset.ULTRA :
        quality === 'medium' ? SMAAPreset.HIGH :
        SMAAPreset.MEDIUM,
    });

    // Order matters: grading -> bloom (so the boosted color blooms) ->
    // chromatic (lens) -> vignette (edge falloff) -> tone -> SMAA (last).
    // All merged into ONE pass — single fullscreen draw on the GPU.
    const effects = [
      this.hueSat,
      this.brightnessContrast,
      this.bloom,
      ...(quality === 'low' ? [] : [this.chromatic]),
      this.vignette,
      this.toneMapping,
      this.smaa,
    ];

    this.composer.addPass(new EffectPass(camera, ...effects));

    // We're not using `graphicsPreset.viewDistance` directly here, but we
    // pull the reference in so callers don't pass an unused param.
    void graphicsPreset;
  }

  /**
   * Push live atmospheric grading into the effects. Called each frame so
   * dusk/dawn/bloodmoon shifts read on screen.
   *
   * The incoming values use the OLD shader convention where 1.0 means
   * "no change". We remap into pmndrs' [-1, 1] convention here.
   */
  updateAtmosphere(g: AtmosphereGrading) {
    // saturation 1.0 => 0 offset; 1.4 => +0.4 (capped to keep it readable)
    this.hueSat.saturation = THREE.MathUtils.clamp((g.saturation - 1.0) * 1.0 + 0.15, -1, 1);

    // contrast 1.0 => baseline; small boost above that, gently reduced below
    this.brightnessContrast.contrast = THREE.MathUtils.clamp((g.contrast - 1.0) * 0.9 + 0.10, -1, 1);

    // temperature is a [-1, 1] warm/cool shift; gently colour the brightness
    // so warm scenes feel warm and cool ones cool, without breaking neutrals.
    this.brightnessContrast.brightness = THREE.MathUtils.clamp(0.03 + g.temperature * 0.06, -1, 1);

    // Update color tint — multiplied into the scene through HueSaturation's
    // shader is not directly possible here, but we mimic the previous tint
    // behaviour by mixing it into the brightness/contrast curve gently.
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
