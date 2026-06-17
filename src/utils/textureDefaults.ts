/**
 * GLOBAL TEXTURE DEFAULTS — Forest Survival
 *
 * A single, zero-cost lever that lifts EVERY texture in the game to AAA filter
 * quality. `THREE.Texture.DEFAULT_ANISOTROPY` is the static the Texture
 * constructor reads for its initial `anisotropy`, so raising it here means every
 * texture created afterwards (gun screens & detail maps, effect/impact sprites,
 * ability & hack billboards, weather, remote-player labels, the main-menu
 * forest …) is anisotropically filtered out of the box — the #1 perceptual cue
 * that separates a sharp "next-gen" surface from a smeared, shimmering one at
 * grazing angles and in the distance.
 *
 * Why 16: WebGL clamps the requested anisotropy to the GPU's actual maximum at
 * upload time (`Math.min(anisotropy, capabilities.getMaxAnisotropy())`), so 16
 * resolves to "the best this hardware offers" — full quality on desktop GPUs
 * (commonly 16×) and safely reduced on weaker mobile parts. The extra cost is
 * incurred only on minified, obliquely-viewed texels, which is exactly where the
 * quality win lives, so it is effectively free everywhere else.
 *
 * IMPORTANT: this module is imported FIRST in `main.tsx` (before `App` and all
 * of its transitive util imports) so the new default is in place before any
 * module-level texture singleton is constructed. Importing it anywhere else, or
 * later, would miss those eagerly-built textures. It mutates a global static and
 * has no other side effects — safe to import exactly once.
 */
import * as THREE from 'three';

// Request the maximum; the renderer clamps per-GPU at texture upload.
THREE.Texture.DEFAULT_ANISOTROPY = 16;

export {};
