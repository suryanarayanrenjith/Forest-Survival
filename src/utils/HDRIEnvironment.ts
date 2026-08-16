import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { MapType } from './MapSystem';

export interface HDRIEnvironmentProfile {
  label: string;
  slug: string;
  dayIntensity: number;
  nightIntensity: number;
  rotationY: number;
}

export interface LoadedHDRIEnvironment {
  profile: HDRIEnvironmentProfile;
  resolution: '1k' | '2k';
  url: string;
  renderTarget: THREE.WebGLRenderTarget;
  texture: THREE.Texture;
}

/**
 * ⚠ CSP DEPENDENCY — the only third-party asset origin the game fetches at runtime.
 *
 * `vercel.json`'s `connect-src` is a strict allowlist (it used to be a blanket
 * `https:`, which let any compromised dependency exfiltrate anywhere). This host
 * is on that allowlist ONLY because of this file. Two consequences:
 *
 *   • Changing this base URL, or pointing at a different CDN, silently breaks
 *     image-based lighting IN PRODUCTION ONLY — local dev serves no CSP, so it
 *     will look fine right up until deploy. Update `connect-src` in the same
 *     commit.
 *   • Self-hosting these .hdr files under /public would remove the last runtime
 *     third-party dependency and let `https://dl.polyhaven.org` be dropped from
 *     the policy entirely.
 *
 * Only High/Ultra tiers load these; low tiers skip the fetch (see `load` option).
 */
const POLY_HAVEN_HDR_BASE = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr';

const HDRI_ENVIRONMENTS: Record<MapType, HDRIEnvironmentProfile> = {
  deep_forest: {
    label: 'Forest Slope',
    slug: 'forest_slope',
    dayIntensity: 0.92,
    nightIntensity: 0.34,
    rotationY: -0.35,
  },
  scorched_wasteland: {
    label: 'Belfast Sunset',
    slug: 'belfast_sunset',
    dayIntensity: 1.08,
    nightIntensity: 0.5,
    rotationY: 0.25,
  },
  frozen_tundra: {
    label: 'Snowy Park 01',
    slug: 'snowy_park_01',
    // Reduced from 0.98 — the bright snow HDRI was stacking with the
    // bright sky + bloom to produce the user-reported white wash. At
    // 0.62 the IBL still gives realistic snow reflections without
    // saturating the scene.
    dayIntensity: 0.62,
    nightIntensity: 0.32,
    rotationY: -0.9,
  },
  desert_canyon: {
    label: 'Quarry 01',
    slug: 'quarry_01',
    dayIntensity: 1.12,
    nightIntensity: 0.46,
    rotationY: 0.65,
  },
  toxic_swamp: {
    label: 'Moonless Golf',
    slug: 'moonless_golf',
    dayIntensity: 0.72,
    nightIntensity: 0.52,
    rotationY: 1.35,
  },
  military_outpost: {
    label: 'Venice Sunset',
    slug: 'venice_sunset',
    dayIntensity: 1.0,
    nightIntensity: 0.45,
    rotationY: -1.1,
  },
  autumn_grove: {
    // Twilight Vale — quiet dusk forest. Low IBL so the moody purple
    // palette reads as twilight rather than washing toward neutral
    // daylight.
    label: 'Moonless Golf',
    slug: 'moonless_golf',
    dayIntensity: 0.55,
    nightIntensity: 0.42,
    rotationY: 0.4,
  },
  ancient_ruins: {
    label: 'Kiara 1 Dawn',
    slug: 'kiara_1_dawn',
    dayIntensity: 1.0,
    nightIntensity: 0.38,
    rotationY: 0.8,
  },
};

function getHDRIUrl(slug: string, resolution: '1k' | '2k') {
  return `${POLY_HAVEN_HDR_BASE}/${resolution}/${slug}_${resolution}.hdr`;
}

export function getHDRIEnvironmentProfile(mapType: MapType) {
  return HDRI_ENVIRONMENTS[mapType] ?? HDRI_ENVIRONMENTS.deep_forest;
}

export function getHDRIEnvironmentIntensity(
  profile: HDRIEnvironmentProfile,
  sunVisible: boolean,
  ambientIntensity: number,
) {
  const baseIntensity = sunVisible ? profile.dayIntensity : profile.nightIntensity;
  return THREE.MathUtils.clamp(baseIntensity + ambientIntensity * 0.08, 0.2, 1.35);
}

export async function loadHDRIEnvironment(
  renderer: THREE.WebGLRenderer,
  mapType: MapType,
  // Derived from the EFFECTIVE graphics settings (custom-safe), not a preset
  // name: `load` is false on the performance path (post-processing off — i.e.
  // LOW / ULTRA-LOW or any custom mix with post off), where the network fetch,
  // PMREM convolution and env-target VRAM cost more than they're worth. Those
  // fall back to the cheap local scene PMREM captured in App.tsx, so
  // reflections/IBL still work. `highRes` lifts the texture to 2k (ULTRA only).
  opts: { load: boolean; highRes: boolean },
): Promise<LoadedHDRIEnvironment | null> {
  if (!opts.load) return null;

  const profile = getHDRIEnvironmentProfile(mapType);
  const resolution: '1k' | '2k' = opts.highRes ? '2k' : '1k';
  const url = getHDRIUrl(profile.slug, resolution);
  const loader = new HDRLoader().setDataType(THREE.HalfFloatType);
  const hdrTexture = await loader.loadAsync(url);
  hdrTexture.mapping = THREE.EquirectangularReflectionMapping;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const renderTarget = pmrem.fromEquirectangular(hdrTexture);

  hdrTexture.dispose();
  pmrem.dispose();

  return {
    profile,
    resolution,
    url,
    renderTarget,
    texture: renderTarget.texture,
  };
}
