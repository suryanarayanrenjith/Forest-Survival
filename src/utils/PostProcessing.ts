import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { GraphicsPreset, GraphicsQuality } from './GameSettingsManager';

/**
 * Live atmosphere uniforms pushed to the grading shader every frame.
 * Same shape as the previous pipeline so `App.tsx` does not have to change.
 */
export interface AtmosphereGrading {
  saturation: number;
  contrast: number;
  temperature: number;
  exposure?: number;
  bloomStrength?: number;
  colorTint: THREE.Color | THREE.Vector3 | { r: number; g: number; b: number };
  sunDirection?: THREE.Vector3;
  isNight?: boolean;
  godRayStrength?: number;
  aerialPerspective?: number;
  highlightRecovery?: number;
  highlightDesaturation?: number;
  vibranceScale?: number;
  shadowLiftScale?: number;
}

/**
 * Cinematic grade + tonemap shader. EVERY per-pixel post-effect lives in
 * one fragment shader so the pipeline pays a single fullscreen cost on
 * top of bloom + AA.
 *
 *  HDR chromatic aberration (radial)
 *    → multi-tap volumetric god-ray radial blur (additive)
 *    → anamorphic horizontal lens streaks (Ultra, additive HDR)
 *    → film halation / warm highlight diffusion (additive HDR)
 *    → dreamy soft-light diffusion veil (additive HDR, energy-guarded)
 *    → aerial perspective warm tint
 *    → exposure × atmospheric tint
 *    → HDR brightness / saturation / contrast
 *    → ACES Filmic tonemap (HDR -> [0,1] LDR)
 *    → LDR shadow lift + vibrance + highlight saturation kick
 *    → LDR filmic split-tone (cool shadows / warm highlights)
 *    → LDR film grain + subtle scanline
 *    → LDR filmic micro-contrast s-curve  (safe because input is in [0,1])
 *    → LDR vignette
 *  (CAS adaptive sharpening then runs as a separate final pass.)
 *
 * Critical ordering note: the smoothstep cubic `x²(3-2x)` ONLY behaves
 * in [0,1]. Applying it on HDR values blows up to large negatives, then
 * subsequent operations produce the "black sun" artifact. We apply it
 * AFTER tonemap.
 */
const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    exposure: { value: 1.0 },
    tint: { value: new THREE.Color(1, 1, 1) },
    saturation: { value: 0.0 },
    contrast: { value: 0.0 },
    brightness: { value: 0.0 },
    grainStrength: { value: 0.008 },
    scanlineStrength: { value: 0.08 },
    shadowLift: { value: 0.05 },
    vibrance: { value: 0.28 },
    vignetteOffset: { value: 0.46 },
    vignetteDarkness: { value: 0.32 },
    chromaticAberration: { value: 0.00038 },
    sunUV: { value: new THREE.Vector2(0.5, 0.5) },
    sunIntensity: { value: 0.0 },
    sunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
    aspect: { value: 1.0 },
    aerialPerspective: { value: 1.0 },
    highlightRecovery: { value: 0.18 },
    highlightDesaturation: { value: 0.18 },
    // ── Cinematic film optics (added in the graphics overhaul) ──────────
    texelSize: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
    anamorphicStrength: { value: 0.0 },   // horizontal blue lens streaks
    halationStrength: { value: 0.0 },     // warm highlight diffusion bleed
    splitToneStrength: { value: 0.0 },    // warm highs / cool shadows grade
    dreamDiffusion: { value: 0.0 },       // wide soft-light veil (2014 "dreamy" look)
    clarity: { value: 0.0 },              // local-contrast / midtone "definition" (Control-grade depth)
    lensDirt: { value: 0.0 },             // procedural dirty-lens bloom scatter
    shadowDepth: { value: 0.0 },          // detail-preserving shadow deepening (premium contrast)
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
    uniform float time;
    uniform float exposure;
    uniform vec3  tint;
    uniform float saturation;
    uniform float contrast;
    uniform float brightness;
    uniform float grainStrength;
    uniform float scanlineStrength;
    uniform float shadowLift;
    uniform float vibrance;
    uniform float vignetteOffset;
    uniform float vignetteDarkness;
    uniform float chromaticAberration;
    uniform vec2  sunUV;
    uniform float sunIntensity;
    uniform vec3  sunColor;
    uniform float aspect;
    uniform float aerialPerspective;
    uniform float highlightRecovery;
    uniform float highlightDesaturation;
    uniform vec2  texelSize;
    uniform float anamorphicStrength;
    uniform float halationStrength;
    uniform float splitToneStrength;
    uniform float dreamDiffusion;
    uniform float clarity;
    uniform float lensDirt;
    uniform float shadowDepth;
    varying vec2  vUv;

    // ACES Filmic tonemap — Narkowicz fit; the curve used by Cyberpunk,
    // Doom Eternal, The Last of Us. Clamps to [0,1] internally.
    vec3 acesFilmic(vec3 x) {
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    float filmHash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      // ─── CHROMATIC ABERRATION (HDR, radial) ────────────────────────
      vec2 dir = vUv - 0.5;
      float dist = length(dir) * 1.4142;
      float caStrength = chromaticAberration * (dist * dist + 0.2);
      vec3 hdr;
      hdr.r = texture2D(tDiffuse, vUv - dir * caStrength).r;
      hdr.g = texture2D(tDiffuse, vUv).g;
      hdr.b = texture2D(tDiffuse, vUv + dir * caStrength).b;
      float alpha = texture2D(tDiffuse, vUv).a;
      // Safety: bloom may have pushed values above HALF_FLOAT_MAX in
      // pathological cases. Clamp to a sane HDR range so downstream
      // math doesn't produce Inf/NaN.
      hdr = clamp(hdr, vec3(0.0), vec3(64.0));

      // ─── VOLUMETRIC LIGHT SHAFTS (god rays — additive radial blur) ──
      // 64-tap radial blur from current pixel toward the projected sun.
      // Luminance-weighted so only bright pixels (sun disc + sky halo)
      // shaft outward — geometry occluding the sun reads as crepuscular
      // rays. Off-screen / below-horizon suns are gated by sunIntensity = 0.
      //
      // Two-layer technique:
      //   1. Long sweep (64 taps, decay-weighted) — the smooth body of
      //      the shafts, what you see streaming through tree silhouettes
      //   2. Tight halo sweep (8 taps near the sun) — boosts the bright
      //      bloom around the sun disc itself for that "burning hole in
      //      the sky" look
      // Combined with a temporal jitter to break up banding on the long
      // sweep so the shafts look smooth instead of stepped.
      if (sunIntensity > 0.001) {
        vec2 sunOffset = sunUV - vUv;
        // Aspect-correct so shafts don't squash on widescreen.
        vec2 sunOffsetAR = vec2(sunOffset.x * aspect, sunOffset.y);
        float sunDist = length(sunOffsetAR);
        // Tiny per-pixel jitter — kills stepped banding on the long sweep
        float jitter = filmHash(vUv * 1024.0) * 0.5 + 0.5;
        // Step toward the sun, sampling the input texture along the way.
        const int SAMPLES = 64;
        const float INV_SAMPLES = 1.0 / float(SAMPLES);
        vec3 shaft = vec3(0.0);
        float wAccum = 0.0;
        for (int i = 0; i < SAMPLES; i++) {
          float t = (float(i) + jitter) * INV_SAMPLES;
          vec2 samplePos = vUv + sunOffset * t * 0.62;
          vec3 s = clamp(texture2D(tDiffuse, samplePos).rgb, vec3(0.0), vec3(64.0));
          float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
          // Slightly lower brightness gate so soft sky pixels join the
          // shaft (dramatic AAA-style ray spread), not just the sun disc.
          float bright = smoothstep(0.55, 2.5, lum);
          float decay = pow(1.0 - t, 1.45);
          shaft += s * bright * decay;
          wAccum += decay;
        }
        shaft *= (1.0 / max(wAccum, 1e-4)) * sunColor * sunIntensity * 1.05;
        // Falloff toward the sun centre so we don't double-add the disc.
        float centerMask = smoothstep(0.0, 0.22, sunDist);
        hdr += shaft * centerMask;

        // Sun-halo kicker — extra bloom right around the sun disc that
        // mimics how a real lens scatters incoming bright light. Compact
        // falloff so it reads as a warm halo, with enough punch that the
        // sun feels like a genuine light source burning through the trees.
        float haloFalloff = exp(-sunDist * 3.4);
        hdr += sunColor * sunIntensity * haloFalloff * 0.30;
      }

      // ─── ANAMORPHIC LENS STREAKS (horizontal cinematic flare) ──────
      // Real anamorphic cine lenses smear bright highlights into a long
      // horizontal blue streak. We sample the (already bloom-composited)
      // HDR buffer left/right and accumulate ONLY the highlight energy
      // (value > 1.0), decay-weighted, tinted cool blue. Reads on the sun,
      // muzzle flashes, glowing pickups + enemy cores — a signature
      // "shot on film" look. HDR-additive, like bloom, so it's tonemap-safe.
      if (anamorphicStrength > 0.001) {
        vec3 streak = vec3(0.0);
        float wsum = 0.0;
        for (int i = 1; i <= 18; i++) {
          float fi = float(i);
          float w = exp(-fi * 0.16);
          vec2 off = vec2(texelSize.x * fi * 4.0, 0.0);
          vec3 sL = clamp(texture2D(tDiffuse, vUv - off).rgb, vec3(0.0), vec3(64.0));
          vec3 sR = clamp(texture2D(tDiffuse, vUv + off).rgb, vec3(0.0), vec3(64.0));
          streak += (max(sL - 1.0, 0.0) + max(sR - 1.0, 0.0)) * w;
          wsum += w;
        }
        streak /= max(wsum, 1e-4);
        hdr += streak * vec3(0.42, 0.62, 1.0) * anamorphicStrength;
      }

      // ─── FILM HALATION (warm highlight diffusion bleed) ────────────
      // Film stock scatters bright light into the emulsion, blooming a soft
      // reddish-orange halo around highlights (think a glowing window in a
      // Kodak-graded frame). A tight radial sample of the highlight energy,
      // tinted warm. Distinct from UnrealBloom's broad halo — this is the
      // close, organic glow that makes lights feel like they're "burning".
      if (halationStrength > 0.001) {
        vec3 halo = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7853981634;
          vec2 off = vec2(cos(a), sin(a)) * texelSize * 4.5;
          vec3 s = clamp(texture2D(tDiffuse, vUv + off).rgb, vec3(0.0), vec3(64.0));
          halo += max(s - 1.1, 0.0);
        }
        halo *= 0.125;
        hdr += halo * vec3(1.0, 0.48, 0.32) * halationStrength;
      }

      // ─── DREAMY SOFT-LIGHT DIFFUSION (2014-era golden veil) ─────────
      // The signature softness of Dying Light / Far Cry 4-era AAA: a WIDE,
      // ultra-soft gather of the scene's luminous energy laid gently back
      // over the frame. Unlike the thresholded UnrealBloom (which only
      // halos true highlights) this wraps everything moderately bright —
      // sunlit fog, warm ground, the sky — in a faint luminous veil, so
      // light feels like it hangs IN the air rather than sitting ON
      // surfaces. Luma-masked from mid-greys up so shadows stay grounded
      // and the frame never lifts toward washed-out grey, and the
      // contribution is energy-guarded so already-bright pixels don't
      // stack toward a blowout.
      if (dreamDiffusion > 0.001) {
        vec3 veil = vec3(0.0);
        // 12-tap dual-ring gather (radii 9px + 21px) ≈ a very wide, very
        // cheap gaussian. Hex angles keep the kernel rotationally even.
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 1.0471975512;
          vec2 ringDir = vec2(cos(a), sin(a));
          veil += clamp(texture2D(tDiffuse, vUv + ringDir * texelSize * 9.0).rgb,  vec3(0.0), vec3(64.0));
          veil += clamp(texture2D(tDiffuse, vUv + ringDir * texelSize * 21.0).rgb, vec3(0.0), vec3(64.0));
        }
        veil *= (1.0 / 12.0);
        float veilLum = dot(veil, vec3(0.2126, 0.7152, 0.0722));
        // Soft knee from mid-tones upward — dark forest floors contribute
        // nothing, sunlit air contributes fully.
        float veilMask = smoothstep(0.35, 1.6, veilLum);
        // Energy guard: fade the veil out where the frame is already hot
        // so the diffusion can never push highlights into clipping.
        vec3 headroom = 1.0 - clamp(hdr * 0.25, vec3(0.0), vec3(1.0));
        hdr += veil * veilMask * dreamDiffusion * headroom;
      }

      // ─── DIRTY-LENS BLOOM SCATTER (cinematic smudge) ───────────────
      // Real camera optics are never perfectly clean — bright light scatters
      // across micro-smudges + dust on the front element, throwing soft
      // blooms across the frame wherever the lens is dirty. The signature
      // "shot through a real lens" look of Control / Battlefield / Cyberpunk.
      // We gather only the HIGHLIGHT energy (value > 1.0) from a wide ring,
      // then deposit it through a screen-locked procedural dirt mask (a few
      // soft smudge blobs + fine speckle). HDR-additive, so it's tonemap-safe
      // and energy-guarded by the highlight threshold (dark frames stay clean).
      if (lensDirt > 0.001) {
        vec3 he = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 1.0471975512 + 0.4;
          vec2 off = vec2(cos(a), sin(a)) * texelSize * 18.0;
          he += max(clamp(texture2D(tDiffuse, vUv + off).rgb, vec3(0.0), vec3(64.0)) - 1.0, 0.0);
        }
        he *= (1.0 / 6.0);
        // Procedural dirt: aspect-corrected soft smudge blobs + fine speckle.
        float dirt = 0.0;
        dirt += smoothstep(0.34, 0.0, length((vUv - vec2(0.27, 0.62)) * vec2(aspect, 1.0))) * 0.85;
        dirt += smoothstep(0.40, 0.0, length((vUv - vec2(0.74, 0.34)) * vec2(aspect, 1.0))) * 0.70;
        dirt += smoothstep(0.30, 0.0, length((vUv - vec2(0.55, 0.80)) * vec2(aspect, 1.0))) * 0.60;
        dirt += smoothstep(0.26, 0.0, length((vUv - vec2(0.12, 0.20)) * vec2(aspect, 1.0))) * 0.50;
        dirt += filmHash(floor(vUv * 240.0)) * 0.22;   // fine dust speckle
        hdr += he * dirt * lensDirt;
      }

      // ─── AERIAL PERSPECTIVE — warm tint on bright distant pixels ────
      // Approximates atmospheric Mie scattering: bright pixels that are
      // already sun-coloured get pushed slightly more toward the sun's
      // colour temperature, giving the "everything bathed in golden
      // light" feel without needing depth-buffer access.
      //
      // Strength dialled WAY back (0.45 → 0.18) because bright-fog maps
      // like tundra (white fog) and desert (warm-tan fog) have a large
      // fraction of the screen above the brightness gate — at the old
      // strength this fully drowned those scenes in a warm haze. At
      // 0.18 the effect reads as the intended subtle "lit by sun" warm
      // bias on truly bright pixels (sky, sun-lit cloud edges) without
      // pulling the whole scene to one colour.
      if (sunIntensity > 0.001) {
        float lumAerial = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
        float aerialMask = smoothstep(0.9, 2.4, lumAerial) * sunIntensity;
        float topBias = smoothstep(0.4, 1.0, vUv.y);
        hdr = mix(hdr, hdr * sunColor * 1.06, aerialMask * topBias * 0.12 * aerialPerspective);
      }

      // ─── EXPOSURE × ATMOSPHERIC TINT (linear HDR) ──────────────────
      hdr = hdr * tint * exposure;

      // ─── WHITE BALANCE / BRIGHTNESS SHIFT (HDR) ────────────────────
      hdr += vec3(brightness);

      // ─── SATURATION (HDR safe — uses luma mix) ─────────────────────
      float luma = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
      hdr = mix(vec3(luma), hdr, 1.0 + saturation);

      // ─── CONTRAST (HDR safe — keeps positives positive) ────────────
      hdr = max(vec3(0.0), (hdr - 0.5) * (1.0 + contrast) + 0.5);

      // --- FILMIC HIGHLIGHT RECOVERY (HDR) ----------------------------
      // Snow, sand, and bright fog can occupy most of the screen above the
      // bloom/tonemap knee. Compress only those high-luma regions before
      // ACES so detail survives without flattening dark forest scenes.
      float recoverLuma = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
      float recoverMask = smoothstep(0.92, 2.8, recoverLuma) * highlightRecovery;
      float compressedLuma = 0.92 + log2(max(recoverLuma, 0.92) / 0.92 + 1.0) * 0.62;
      float recoverScale = compressedLuma / max(recoverLuma, 1e-4);
      hdr = mix(hdr, hdr * recoverScale, recoverMask);

      float recoveredLuma = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
      hdr = mix(hdr, mix(vec3(recoveredLuma), hdr, 0.64), recoverMask * highlightDesaturation);

      // ─── ACES FILMIC TONEMAP — HDR -> LDR [0,1] ─────────────────────
      // All subsequent operations are in LDR space, safe to use the
      // smoothstep s-curve, multiplicative vignette, additive grain.
      vec3 ldr = acesFilmic(hdr);

      // ─── SHADOW LIFT (LDR — gentle gain in deep shadow) ────────────
      float lumaShadow = dot(ldr, vec3(0.2126, 0.7152, 0.0722));
      float liftMask = 1.0 - smoothstep(0.0, 0.25, lumaShadow);
      ldr += vec3(shadowLift) * liftMask;

      // ─── SHADOW DEEPENING (premium contrast — detail-preserving) ───
      // The opposite of a wash: pull the low-mids DOWN so cast shadows and
      // shaded faces read as genuine, weighty shadow instead of flat grey.
      // Masked to the shadow band only (mids + highlights untouched) and
      // gentle, so detail survives — the signature grounded, contrasty,
      // "premium" look. Scaled down at night by the driver for visibility.
      if (shadowDepth > 0.001) {
        float sdMask = 1.0 - smoothstep(0.0, 0.42, lumaShadow);
        ldr *= 1.0 - sdMask * shadowDepth;
      }

      // ─── VIBRANCE (LDR — selective sat on mid-saturation pixels) ────
      float maxC = max(max(ldr.r, ldr.g), ldr.b);
      float minC = min(min(ldr.r, ldr.g), ldr.b);
      float sat = (maxC - minC) / max(maxC, 1e-4);
      float vibMask = 1.0 - sat;
      float lumaV = dot(ldr, vec3(0.2126, 0.7152, 0.0722));
      vec3 chroma = ldr - vec3(lumaV);
      ldr = vec3(lumaV) + chroma * (1.0 + vibrance * vibMask);

      // ─── HIGHLIGHT SATURATION KICK (LDR) ────────────────────────────
      // Bright neon edges read richer than their RGB suggests — the
      // signature "Control / Cyberpunk" shimmer. Cranked from 0.18 →
      // 0.32 so pickup cores / muzzle flashes / sun-bloomed sky read
      // with deep saturated halos instead of washing out to white.
      float lumaH = dot(ldr, vec3(0.2126, 0.7152, 0.0722));
      vec3 chromaH = ldr - vec3(lumaH);
      ldr = vec3(lumaH) + chromaH * (1.0 + smoothstep(0.5, 1.2, lumaH) * 0.32);

      // ─── CLARITY — local-contrast / midtone "definition" ───────────
      // The single biggest lever for the grounded, sculpted, contact-shadowed
      // feel of Control: an unsharp high-pass on the scene luminance darkens
      // crevices + recesses and crisps up edges, so surfaces read as having
      // real depth + occlusion instead of flat shading. We sample the source
      // (pre-tonemap) luma at a wide hex ring, blur it, take the high-pass
      // (centre − blur), and multiply it back in (hue-preserving). Cheap
      // (6 taps), gated, and clamped so it never rings or blows out.
      if (clarity > 0.001) {
        float cLum = dot(clamp(texture2D(tDiffuse, vUv).rgb, vec3(0.0), vec3(8.0)), vec3(0.2126, 0.7152, 0.0722));
        float bLum = 0.0;
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 1.0471975512;
          vec2 off = vec2(cos(a), sin(a)) * texelSize * 6.0;
          bLum += dot(clamp(texture2D(tDiffuse, vUv + off).rgb, vec3(0.0), vec3(8.0)), vec3(0.2126, 0.7152, 0.0722));
        }
        bLum *= (1.0 / 6.0);
        float detail = clamp(cLum - bLum, -0.55, 0.55);
        ldr *= 1.0 + detail * clarity;
      }

      // ─── FILMIC SPLIT-TONE (cool shadows, warm highlights) ─────────
      // The colour-grade signature of graded film + AAA cinematics: push
      // shadows subtly toward teal and highlights toward amber so the image
      // reads "graded" instead of flat. Luma-driven, very restrained.
      if (splitToneStrength > 0.001) {
        float lumaST = dot(ldr, vec3(0.2126, 0.7152, 0.0722));
        vec3 coolShadow = vec3(0.90, 0.98, 1.07);
        vec3 warmHi      = vec3(1.07, 1.01, 0.90);
        vec3 toneMul = mix(coolShadow, warmHi, smoothstep(0.18, 0.82, lumaST));
        ldr *= mix(vec3(1.0), toneMul, splitToneStrength);
      }

      // ─── FILM GRAIN (LDR, luma-shaped) ─────────────────────────────
      float grain = filmHash(vUv * vec2(1919.0, 1079.0) + vec2(time * 41.0, time * 17.0)) - 0.5;
      float lumaG = dot(ldr, vec3(0.2126, 0.7152, 0.0722));
      float grainShape = smoothstep(0.05, 0.4, lumaG) * (1.0 - smoothstep(0.85, 1.0, lumaG));
      ldr += grain * grainStrength * (0.4 + grainShape * 0.7);

      // ─── SUBTLE SCANLINE (LDR) ──────────────────────────────────────
      float scan = sin(vUv.y * 1600.0) * 0.5 + 0.5;
      ldr *= 1.0 - scan * scanlineStrength * 0.06;

      // ─── FILMIC MICRO-CONTRAST S-CURVE (LDR — now safe!) ───────────
      ldr = clamp(ldr, vec3(0.0), vec3(1.0));
      vec3 contrasted = ldr * ldr * (3.0 - 2.0 * ldr);
      ldr = mix(ldr, contrasted, 0.12);

      // ─── VIGNETTE (LDR multiplicative) ──────────────────────────────
      float vig = smoothstep(vignetteOffset, 1.0, dist);
      ldr *= 1.0 - vig * vignetteDarkness;

      gl_FragColor = vec4(clamp(ldr, vec3(0.0), vec3(1.0)), alpha);
    }
  `,
} as const;

/**
 * AMD FidelityFX Contrast Adaptive Sharpening (CAS), sharpen-only port.
 *
 * Runs as the FINAL pass on the tonemapped LDR image (after SMAA) to recover
 * the crisp micro-detail that AA + bloom soften. CAS is adaptive: it sharpens
 * low-contrast regions more than already-sharp edges and clamps to the local
 * 3×3 min/max so it never rings or haloes. The result is a noticeably crisper,
 * higher-perceived-resolution image with no shimmer.
 *
 * Reference: AMD GPUOpen FidelityFX CAS (https://gpuopen.com/fidelityfx-cas/).
 */
const CASShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    texelSize: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
    sharpness: { value: 0.4 },
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
    uniform vec2  texelSize;
    uniform float sharpness;
    varying vec2  vUv;

    void main() {
      // 3×3 neighbourhood (a b c / d e f / g h i), e = centre.
      vec3 a = texture2D(tDiffuse, vUv + texelSize * vec2(-1.0, -1.0)).rgb;
      vec3 b = texture2D(tDiffuse, vUv + texelSize * vec2( 0.0, -1.0)).rgb;
      vec3 c = texture2D(tDiffuse, vUv + texelSize * vec2( 1.0, -1.0)).rgb;
      vec3 d = texture2D(tDiffuse, vUv + texelSize * vec2(-1.0,  0.0)).rgb;
      vec4 eF = texture2D(tDiffuse, vUv);
      vec3 e = eF.rgb;
      vec3 f = texture2D(tDiffuse, vUv + texelSize * vec2( 1.0,  0.0)).rgb;
      vec3 g = texture2D(tDiffuse, vUv + texelSize * vec2(-1.0,  1.0)).rgb;
      vec3 h = texture2D(tDiffuse, vUv + texelSize * vec2( 0.0,  1.0)).rgb;
      vec3 i = texture2D(tDiffuse, vUv + texelSize * vec2( 1.0,  1.0)).rgb;

      // Soft min/max of the cross (b,d,e,f,h), reinforced by the diagonals.
      vec3 mnRGB = min(min(min(d, e), min(f, b)), h);
      mnRGB += min(mnRGB, min(min(a, c), min(g, i)));
      vec3 mxRGB = max(max(max(d, e), max(f, b)), h);
      mxRGB += max(mxRGB, max(max(a, c), max(g, i)));

      // Adaptive sharpening amount per channel.
      vec3 rcpM = 1.0 / max(mxRGB, vec3(1e-4));
      vec3 ampRGB = clamp(min(mnRGB, 2.0 - mxRGB) * rcpM, 0.0, 1.0);
      ampRGB = sqrt(ampRGB);
      float peak = -1.0 / mix(8.0, 5.0, clamp(sharpness, 0.0, 1.0));
      vec3 wRGB = ampRGB * peak;
      vec3 rcpW = 1.0 / (1.0 + 4.0 * wRGB);
      vec3 sharp = clamp((b * wRGB + d * wRGB + f * wRGB + h * wRGB + e) * rcpW, 0.0, 1.0);

      gl_FragColor = vec4(mix(e, sharp, clamp(sharpness, 0.0, 1.0)), eF.a);
    }
  `,
} as const;

/**
 * AAA post-processing pipeline built on three.js's native
 * `examples/jsm/postprocessing` modules — no external libraries.
 *
 *  RenderPass         (scene → linear HDR HalfFloat target)
 *    → UnrealBloomPass  [aggressive mip-chain bloom for the "glow"]
 *    → CinematicGrade   [CA + god-rays + anamorphic streaks + film halation
 *                        + aerial perspective + ACES + LDR grade + split-tone
 *                        + grain + vignette]
 *    → SMAAPass         [Medium+ — sub-pixel morphological AA]
 *    → CAS              [Medium+ — adaptive sharpening, final crispness]
 *
 * Ambient occlusion is intentionally NOT in this pipeline. Both
 * pmndrs N8AO and three.js GTAO produced a "multiply-by-zero" black
 * artifact on bright HDR pixels where the sky meets tree silhouettes
 * (GTAOPass uses `blendSrc = DstColorFactor, blendDst = ZeroFactor`).
 * We rely instead on the HDRI IBL + multi-light setup in App.tsx for
 * realistic contact darkening. The result is a far cleaner image.
 */
export class PostProcessingPipeline {
  composer: EffectComposer;

  private readonly bloom: UnrealBloomPass;
  private baseBloomIntensity: number;
  private readonly baseBloomThreshold: number = 0.82;
  private bloomMultiplier = 1.0;
  private readonly cinematic: ShaderPass;
  private readonly smaaPass: SMAAPass | null;
  private readonly casPass: ShaderPass | null;
  private readonly camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private readonly hdrTarget: THREE.WebGLRenderTarget;
  private readonly _tempSun = new THREE.Vector3();
  private readonly _tempNdc = new THREE.Vector3();
  // Sentinel: -1 means "no atmosphere pushed yet". The first updateAtmosphere
  // call sets the target exposure DIRECTLY (no smoothing) so the very first
  // rendered frame already shows the correct EV — preventing the dim "raw"
  // look that used to linger after the shader-warmup loader hid.
  private currentExposure = -1;
  private isNightMode = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    _graphicsPreset: GraphicsPreset,
    quality: GraphicsQuality,
  ) {
    this.camera = camera;
    // Tonemap is baked into the cinematic grade shader; keep the
    // renderer linear so every intermediate pass operates on real HDR
    // (bloom needs > 1.0 values to read true highlights).
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const width = Math.max(2, Math.floor(size.x));
    const height = Math.max(2, Math.floor(size.y));

    // HDR framebuffer so bloom can read true highlights (sun, muzzle
    // flash, emissive pickups) without clipping. HalfFloat preserves
    // values up to ±65504.
    this.hdrTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    });

    this.composer = new EffectComposer(renderer, this.hdrTarget);
    this.composer.setPixelRatio(1);
    this.composer.setSize(width, height);

    // ─── 1. RenderPass ──────────────────────────────────────────────
    this.composer.addPass(new RenderPass(scene, camera));

    const isUltra = quality === 'ultra';
    const isHigh = quality === 'high' || isUltra;

    // ─── 2. UnrealBloomPass — 2012 Hitman-Absolution style ─────────
    // Heavy, generous mip-chain bloom. The 2012-era AAA look has thick
    // halos around every light source (sun, lamps, neon, muzzle flash,
    // emissive powerups, glowing enemy cores) that read as atmospheric
    // light scattering rather than just thresholded highlights.
    //
    // We give the pipeline a baseline that's dramatic enough for that
    // look, then EACH MAP further tunes it via `bloomMultiplier` and
    // `bloomThresholdBias` from MapConfig — volcanic / crystal maps
    // get heavy 1.5×+ bloom, military / desert maps get restrained
    // 0.75-0.85× bloom so their bright tones don't blow out.
    // Bloom intensity bumped across the board for the AAA-cinematic
    // "lit by glow" look. Combined with the boosted god-rays + halo
    // kicker + brighter pickup cores, the world reads as having real
    // volumetric light scattering rather than dry flat shading.
    // Boosted across every tier for the dramatic "lit by glow" AAA look —
    // pure uniform changes, zero added GPU cost.
    this.baseBloomIntensity =
      isUltra ? 1.18 :
      quality === 'high' ? 0.96 :
      quality === 'medium' ? 0.75 :
      0.55;
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      this.baseBloomIntensity,
      0.9,    // soft cinematic halo radius
      0.82,   // threshold: true highlights bloom generously (sun, emissives,
              // muzzle flashes, pickup cores) while the broad sky stays
              // below the knee so the frame centre never washes out.
    );
    this.composer.addPass(this.bloom);

    // ─── 3. Cinematic grade + ACES tonemap (FINAL look) ─────────────
    this.cinematic = new ShaderPass({
      uniforms: THREE.UniformsUtils.clone(CinematicGradeShader.uniforms),
      vertexShader: CinematicGradeShader.vertexShader,
      fragmentShader: CinematicGradeShader.fragmentShader,
    });
    // Whisper-thin grain — the Krunker look is CLEAN. Just enough texture
    // to avoid the "Unity Standard Asset" plastic feel.
    this.cinematic.uniforms.grainStrength.value =
      isUltra ? 0.0045 : quality === 'high' ? 0.0035 : quality === 'medium' ? 0.0025 : 0.0015;
    this.cinematic.uniforms.scanlineStrength.value =
      isUltra ? 0.04 : quality === 'high' ? 0.03 : 0.02;
    this.cinematic.uniforms.aspect.value = width / Math.max(1, height);
    (this.cinematic.uniforms.texelSize.value as THREE.Vector2).set(1 / width, 1 / height);
    // Cinematic film optics. Anamorphic streaks are the heaviest (36 taps) so
    // they're reserved for Ultra; halation + split-tone are cheap and run on
    // every post-FX tier. All restrained — this is grading, not a filter.
    this.cinematic.uniforms.anamorphicStrength.value = isUltra ? 0.55 : 0.0;
    this.cinematic.uniforms.halationStrength.value =
      isUltra ? 0.3 : quality === 'high' ? 0.24 : quality === 'medium' ? 0.16 : 0.0;
    this.cinematic.uniforms.splitToneStrength.value =
      isUltra ? 0.5 : quality === 'high' ? 0.42 : quality === 'medium' ? 0.32 : 0.0;
    // Dreamy soft-light veil — the 2014 "golden hour through the air" look.
    // 12 taps, cheap enough for every post-FX tier; strength is deliberately
    // subtle (it's a veil, not a glow) and CAS at the end of the chain
    // restores the micro-detail the diffusion softens.
    this.cinematic.uniforms.dreamDiffusion.value =
      isUltra ? 0.30 : quality === 'high' ? 0.25 : quality === 'medium' ? 0.18 : 0.10;
    // Clarity (local-contrast) — the grounded, sculpted Control-grade depth.
    // Cheap (6 taps) so it runs on every post-FX tier, subtle so it adds
    // definition without crunch. CAS at the end of the chain complements it.
    this.cinematic.uniforms.clarity.value =
      isUltra ? 0.30 : quality === 'high' ? 0.26 : quality === 'medium' ? 0.20 : 0.12;
    // Dirty-lens bloom scatter — reserved for High+ (6 wide highlight taps);
    // gives the "shot through a real lens" smudge bloom on bright sources.
    this.cinematic.uniforms.lensDirt.value =
      isUltra ? 0.55 : quality === 'high' ? 0.40 : 0.0;
    this.composer.addPass(this.cinematic);

    // ─── 4. SMAA AA (Medium+) ───────────────────────────────────────
    if (quality !== 'low') {
      const smaa = new SMAAPass();
      smaa.setSize(width, height);
      this.composer.addPass(smaa);
      this.smaaPass = smaa;
    } else {
      this.smaaPass = null;
    }

    // ─── 5. CAS sharpening (FINAL — after AA) ───────────────────────
    // Recovers the crispness AA + bloom soften. Runs last so it sharpens the
    // fully-composited image. Cheap (9 taps) and adaptive, so it's on for all
    // post-FX tiers.
    if (quality !== 'low') {
      const cas = new ShaderPass({
        uniforms: THREE.UniformsUtils.clone(CASShader.uniforms),
        vertexShader: CASShader.vertexShader,
        fragmentShader: CASShader.fragmentShader,
      });
      (cas.uniforms.texelSize.value as THREE.Vector2).set(1 / width, 1 / height);
      cas.uniforms.sharpness.value = isUltra ? 0.5 : quality === 'high' ? 0.42 : 0.34;
      this.composer.addPass(cas);
      this.casPass = cas;
    } else {
      this.casPass = null;
    }

    void isHigh;
  }

  /**
   * Force the NEXT {@link updateAtmosphere} call to set exposure DIRECTLY
   * (no easing). Call this immediately before the first gameplay frame after
   * the shader-warmup loader hides, so the fully-graded look is on screen
   * instantly instead of easing in over ~12 frames. The ease is frame-rate
   * dependent, so on a stuttery startup that ramp was visible as
   * "post-processing applied a moment after the loader" — this kills it.
   */
  primeExposureSnap() {
    this.currentExposure = -1;
  }

  /**
   * Push live atmospheric grading uniforms. Called once per frame so
   * dusk/dawn/bloodmoon colour shifts read on screen.
   */
  updateAtmosphere(g: AtmosphereGrading) {
    const u = this.cinematic.uniforms;

    // Saturation: keep the punchy stylised palette but no baseline boost —
    // warm-tinted maps (desert, scorched wasteland) were getting their
    // already-saturated yellows/oranges pushed over the edge into the
    // "everything is one colour" blowout. Pure day-cycle delta only.
    u.saturation.value = THREE.MathUtils.clamp((g.saturation - 1.0) * 0.5, -0.30, 0.45);
    // Contrast: tiny baseline bias for visual snap, capped low so warm
    // bright scenes don't pull the highlight into the bloom threshold.
    u.contrast.value = THREE.MathUtils.clamp((g.contrast - 1.0) * 0.30 + 0.07, -0.15, 0.40);
    // Brightness: pure temperature tilt, no baseline lift. The main
    // directional × 1.6 + ambient × 0.8 already give Krunker brightness;
    // adding more pushed warm maps into yellow blowout.
    u.brightness.value = THREE.MathUtils.clamp(g.temperature * 0.04, -0.15, 0.15);
    u.aerialPerspective.value = THREE.MathUtils.clamp(g.aerialPerspective ?? 1.0, 0.0, 1.35);
    u.highlightRecovery.value = THREE.MathUtils.clamp(g.highlightRecovery ?? 0.18, 0.0, 1.0);
    u.highlightDesaturation.value = THREE.MathUtils.clamp(g.highlightDesaturation ?? 0.18, 0.0, 1.0);

    if (typeof g.exposure === 'number') {
      const target = THREE.MathUtils.clamp(g.exposure, 0.4, 1.8);
      // First push: snap directly to the target so the loader hands the
      // canvas to gameplay with the correct exposure already baked in.
      // Subsequent pushes use the eased follower so dusk/dawn/bloodmoon
      // colour shifts still ramp in smoothly during play.
      if (this.currentExposure < 0) {
        this.currentExposure = target;
      } else {
        this.currentExposure += (target - this.currentExposure) * 0.08;
      }
      u.exposure.value = this.currentExposure;
    }

    if (typeof g.bloomStrength === 'number') {
      // Day-cycle bloom (1..3.5) × per-map multiplier (0.75..1.65) folds
      // into one composite scalar, then applied to the base intensity.
      const bloomBoost = THREE.MathUtils.clamp(g.bloomStrength / 3.0, 0.85, 1.55);
      this.bloom.strength = this.baseBloomIntensity * bloomBoost * this.bloomMultiplier;
    }

    if (g.colorTint) {
      const tint = u.tint.value as THREE.Color;
      if (g.colorTint instanceof THREE.Color) {
        tint.copy(g.colorTint);
      } else if (g.colorTint instanceof THREE.Vector3) {
        tint.setRGB(g.colorTint.x, g.colorTint.y, g.colorTint.z);
      } else {
        tint.setRGB(g.colorTint.r, g.colorTint.g, g.colorTint.b);
      }
    }

    let lowLight = 0;
    const godRayStrength = THREE.MathUtils.clamp(g.godRayStrength ?? 1.0, 0.0, 1.3);
    if (g.sunDirection) {
      this._tempSun.copy(g.sunDirection).normalize();
      const sunAlt = this._tempSun.y;
      lowLight = THREE.MathUtils.clamp((0.18 - sunAlt) / 0.45, 0, 1);
    }

    this.isNightMode = !!g.isNight;
    const shadowLiftScale = THREE.MathUtils.clamp(g.shadowLiftScale ?? 1.0, 0.45, 1.25);
    const vibranceScale = THREE.MathUtils.clamp(g.vibranceScale ?? 1.0, 0.35, 1.2);
    if (this.isNightMode) {
      // Night: keep a meaningful lift so the player can still SEE — moody but
      // playable. Shadow deepening stays gentle so darkness reads without
      // swallowing detail.
      u.shadowLift.value = (0.085 + lowLight * 0.04) * shadowLiftScale;
      u.vibrance.value = 0.58 * vibranceScale;
      u.shadowDepth.value = 0.06;
    } else {
      // Day: deeper, weightier shadows for a premium, grounded look — the lift
      // is pulled back (less wash) and the shadow band is actively deepened so
      // cast shadows + shaded faces read with real contrast instead of flat
      // grey. Richer vibrance for premium foliage greens + sky blues.
      u.shadowLift.value = (0.04 + lowLight * 0.02) * shadowLiftScale;
      u.vibrance.value = 0.56 * vibranceScale;
      u.shadowDepth.value = 0.17;
    }

    // ─── SCREEN-SPACE LIGHT SHAFTS (god rays) ───────────────────────
    if (g.sunDirection) {
      this._tempSun.copy(g.sunDirection).normalize();
      const farDist = 380;
      this._tempNdc.set(
        this.camera.position.x + this._tempSun.x * farDist,
        this.camera.position.y + this._tempSun.y * farDist,
        this.camera.position.z + this._tempSun.z * farDist,
      );
      this.camera.updateMatrixWorld(true);
      this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
      this._tempNdc.project(this.camera);

      const sx = this._tempNdc.x;
      const sy = this._tempNdc.y;
      const sz = this._tempNdc.z;
      const insideX = 1.0 - THREE.MathUtils.smoothstep(Math.abs(sx), 1.0, 1.3);
      const insideY = 1.0 - THREE.MathUtils.smoothstep(Math.abs(sy), 1.0, 1.3);
      const onScreenGate = sz >= 1 ? 0 : (insideX * insideY);
      const altitude = this._tempSun.y;
      const altGate = THREE.MathUtils.smoothstep(altitude, -0.05, 0.45);

      (u.sunUV.value as THREE.Vector2).set(sx * 0.5 + 0.5, sy * 0.5 + 0.5);
      if (this.isNightMode) {
        // Moonlight god-rays — cool blue, present enough to silhouette the
        // canopy on a clear night.
        (u.sunColor.value as THREE.Color).setRGB(0.55, 0.7, 1.0);
        u.sunIntensity.value = 0.26 * onScreenGate * godRayStrength;
      } else {
        // Warm shift as the sun drops — golden-hour at low altitude,
        // pure white at noon. lowSun ramps as altitude → 0.
        const lowSun = THREE.MathUtils.smoothstep(1.0 - altitude, 0.4, 0.85);
        (u.sunColor.value as THREE.Color).setRGB(
          1.0,
          0.92 - lowSun * 0.22,
          0.78 - lowSun * 0.34,
        );
        // Dramatic but controlled shafts — clearly visible streaming through
        // the canopy, with extra punch at low-sun angles (golden-hour drama)
        // where they read as pure atmosphere. Weather scales this further:
        // clear skies crank it, overcast kills it.
        const goldenBoost = 1.0 + lowSun * 0.4;
        u.sunIntensity.value = 0.46 * onScreenGate * altGate * goldenBoost * godRayStrength;
      }
    } else {
      u.sunIntensity.value = 0.0;
    }
  }

  /**
   * Apply a map-specific bloom profile. Called once at scene init so
   * each environment gets a unique post-FX feel (heavy on crystal /
   * volcanic, restrained on desert / military).
   *
   *   multiplier      scales the global bloom strength
   *   thresholdBias   ADDED to the base threshold (negative = more blooms)
   */
  setMapBloomProfile(multiplier: number, thresholdBias: number) {
    this.bloomMultiplier = multiplier;
    this.bloom.strength = this.baseBloomIntensity * multiplier;
    this.bloom.threshold = THREE.MathUtils.clamp(
      this.baseBloomThreshold + thresholdBias,
      0.4,
      1.0,
    );
  }

  render(delta: number) {
    this.cinematic.uniforms.time.value += delta;
    this.composer.render(delta);
  }

  setSize(width: number, height: number) {
    const w = Math.max(2, Math.floor(width));
    const h = Math.max(2, Math.floor(height));
    this.hdrTarget.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    if (this.smaaPass) this.smaaPass.setSize(w, h);
    this.cinematic.uniforms.aspect.value = w / Math.max(1, h);
    (this.cinematic.uniforms.texelSize.value as THREE.Vector2).set(1 / w, 1 / h);
    if (this.casPass) (this.casPass.uniforms.texelSize.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  dispose() {
    this.hdrTarget.dispose();
    if (this.smaaPass && typeof (this.smaaPass as unknown as { dispose?: () => void }).dispose === 'function') {
      (this.smaaPass as unknown as { dispose: () => void }).dispose();
    }
    if (this.bloom && typeof (this.bloom as unknown as { dispose?: () => void }).dispose === 'function') {
      (this.bloom as unknown as { dispose: () => void }).dispose();
    }
    if (this.casPass && typeof (this.casPass as unknown as { dispose?: () => void }).dispose === 'function') {
      (this.casPass as unknown as { dispose: () => void }).dispose();
    }
    this.composer.dispose();
  }
}
