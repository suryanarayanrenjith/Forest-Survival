import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { GraphicsQuality } from './GameSettingsManager';
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

function getHDRIResolution(quality: GraphicsQuality): '1k' | '2k' {
  return quality === 'ultra' ? '2k' : '1k';
}

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
  quality: GraphicsQuality,
): Promise<LoadedHDRIEnvironment | null> {
  if (quality === 'low') return null;

  const profile = getHDRIEnvironmentProfile(mapType);
  const resolution = getHDRIResolution(quality);
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
