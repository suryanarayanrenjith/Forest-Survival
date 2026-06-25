// Game Settings Manager - Handles reading/writing user settings from localStorage

export type GraphicsQuality = 'ultralow' | 'low' | 'medium' | 'high' | 'ultra';
/** The active graphics selection: one of the named tiers, or a hand-tuned mix. */
export type GraphicsPresetName = GraphicsQuality | 'custom';
/** Shadow fidelity, mapped to a shadow-map resolution (or disabled). */
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsPreset {
  /** Internal render scale (0-1). 1 = native resolution. */
  pixelRatio: number;
  /** Directional-light shadow map resolution. */
  shadowMapSize: number;
  /** Whether real-time shadows are rendered at all. */
  shadowsEnabled: boolean;
  /** Hardware MSAA on the canvas. */
  antialias: boolean;
  /** Bloom + colour-grading post-processing pipeline. */
  postProcessing: boolean;
  /** 0-1 multiplier for particle-effect density. */
  particleDensity: number;
  /** Max simultaneous enemies the spawner targets. */
  maxEnemies: number;
  /** World draw distance in units (camera far / fog / culling). */
  viewDistance: number;
  /** 0-1 multiplier for grass / terrain object density. */
  terrainDetail: number;
}

// Four clean performance tiers. Every field below is read and applied by
// the engine — there are no dead knobs.
//
// `maxEnemies` is a hard ceiling the spawner respects regardless of
// difficulty multiplier — keeping it low prevents the screen from ever
// filling with robots even on Hard.
export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsPreset> = {
  // ULTRA LOW — the "potato" floor: absolute maximum FPS for the weakest
  // hardware (old integrated GPUs, low-end phones, thin laptops on battery).
  // One full step below LOW. Everything that costs frames is pushed as low as
  // it can go while the world still reads as the same game:
  //   • 50% render scale — quarter of native's fragment work; pixelated upscale
  //   • No shadows / no post-FX / no MSAA (same as LOW — the big WebGL costs)
  //   • No atmospheric haze sphere, no gun fill-lights (handled in App via the
  //     shared "low tier" gate) — fewer draw calls + lights
  //   • particleDensity 0.25 + terrainDetail 0.40 — sparse but not barren
  //   • maxEnemies 10 — fewer multi-mesh enemy rigs = less CPU (AI) + GPU (draws)
  //   • viewDistance 72m — tighter fog wall, much less overdraw + culling work
  ultralow: {
    pixelRatio: 0.50,
    shadowMapSize: 256,
    shadowsEnabled: false,
    antialias: false,
    postProcessing: false,
    particleDensity: 0.25,
    maxEnemies: 10,
    viewDistance: 72,
    terrainDetail: 0.40,
  },
  // LOW — maximum performance for older / integrated GPUs.
  //   • No real-time shadows (single biggest WebGL cost)
  //   • No post-processing (composer + bloom is ~2-3ms per frame)
  //   • 65% pixel ratio + nearest-neighbour scaling = ~42% of the fragment work
  //   • Particle density 0.42 + terrain detail 0.55 — still readable
  //     world, no "empty plain" feel
  //   • viewDistance 92m — fog masks the cull boundary
  low: {
    pixelRatio: 0.65,
    shadowMapSize: 512,
    shadowsEnabled: false,
    antialias: false,
    postProcessing: false,
    // Particles (pooled, capped) + grass are the cheapest way to keep the
    // shadow-less, post-less LOW world from reading as an empty plain, so they
    // get a small lift; the heavy levers (resolution / shadows / post-FX) stay
    // off to protect the frame-rate target on integrated GPUs. Tightened a notch
    // (res 0.70→0.65, particles 0.50→0.42, view 100→92, terrain 0.62→0.55) to
    // squeeze out more headroom; ULTRA LOW sits below this for weaker hardware.
    particleDensity: 0.42,
    maxEnemies: 14,
    viewDistance: 92,
    terrainDetail: 0.55,
  },
  // MEDIUM — soft shadows + lightweight bloom, ~85% pixel ratio.
  //   • Soft 1024² shadow map (8MB) — visible directional shadows
  //   • Post-FX on: bloom + cinematic grade (no SMAA)
  //   • Particle density 0.70 + terrain detail 0.85
  //   • 150m view distance — fog hides the boundary
  medium: {
    pixelRatio: 0.85,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    antialias: false,
    postProcessing: true,
    particleDensity: 0.70,
    maxEnemies: 22,
    viewDistance: 150,
    terrainDetail: 0.85,
  },
  // HIGH — native res, MSAA, crisp 2048² shadows + full post-FX stack.
  high: {
    pixelRatio: 1.0,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    antialias: true,
    postProcessing: true,
    particleDensity: 1.0,
    maxEnemies: 30,
    viewDistance: 200,
    terrainDetail: 1.0,
  },
  // ULTRA — super-sampled, 4096² shadows, every effect maxed.
  //   • Pixel ratio 1.2 super-samples for the sharpest, most aliasing-free edges
  //   • 4096² shadow map (64MB) — pin-sharp directional shadows
  //   • viewDistance 300m — high-end GPUs have the headroom to see right out to
  //     the far ridgelines (fog still feathers the cull boundary)
  //   • All effects on (bloom, cinematic grade, SMAA, god rays)
  ultra: {
    pixelRatio: 1.2,
    shadowMapSize: 4096,
    shadowsEnabled: true,
    antialias: true,
    postProcessing: true,
    particleDensity: 1.0,
    maxEnemies: 40,
    viewDistance: 300,
    terrainDetail: 1.0,
  },
};

// ── Graphics section (AAA-style presets + custom mix) ────────────────────────
// The user picks a named preset OR a "custom" mix of individual knobs. The
// engine only ever reads the resolved `GraphicsPreset` above (via
// resolveGraphicsPreset), so adding a knob here is the ONLY place that needs to
// know about custom vs preset — every consumer keeps reading the same shape.
//
// `baseTier` is the representative named tier used for the few QUALITATIVE /
// cosmetic engine choices that aren't captured by the numeric knobs (shadow
// penumbra softness, HDRI reflection resolution, haze-sphere density). For a
// named preset it equals `preset`; for a custom mix it's whatever tier the
// player was on when they started tweaking, so those choices stay sensible.
export interface GraphicsSettings {
  preset: GraphicsPresetName;
  baseTier: GraphicsQuality;
  /** Internal render scale 0.40–1.20 (1 = native). */
  resolution: number;
  shadows: ShadowQuality;
  antialias: boolean;
  postProcessing: boolean;
  /** Particle-effect density 0–1. */
  particleDensity: number;
  /** World draw distance in metres. */
  viewDistance: number;
  /** Grass / scattered-prop density 0–1. */
  terrainDetail: number;
  /** Hard ceiling on simultaneous enemies. */
  maxEnemies: number;
}

const SHADOW_MAP_SIZE: Record<ShadowQuality, number> = {
  off: 256, low: 512, medium: 1024, high: 2048, ultra: 4096,
};

// Sensible bounds for the custom knobs. viewDistance is floored at 72m: the
// camera far plane is viewDistance×5 and the streamed 5×5 chunk grid reaches
// ~360m at its corner, so going lower would hard-clip loaded terrain corners
// (the sky dome itself is far-plane-pinned, so it is unaffected). See the sky
// dome shader note in Shaders.ts.
export const GRAPHICS_LIMITS = {
  resolution: { min: 0.40, max: 1.20 },
  particleDensity: { min: 0, max: 1 },
  viewDistance: { min: 72, max: 300 },
  terrainDetail: { min: 0.25, max: 1 },
  maxEnemies: { min: 6, max: 40 },
} as const;

const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};

const isShadowQuality = (v: unknown): v is ShadowQuality =>
  v === 'off' || v === 'low' || v === 'medium' || v === 'high' || v === 'ultra';

const shadowQualityForPreset = (p: GraphicsPreset): ShadowQuality => {
  if (!p.shadowsEnabled) return 'off';
  if (p.shadowMapSize >= 4096) return 'ultra';
  if (p.shadowMapSize >= 2048) return 'high';
  if (p.shadowMapSize >= 1024) return 'medium';
  return 'low';
};

/** Expand a named tier into the editable knob set (so the sliders mirror it). */
export function graphicsSettingsFromPreset(name: GraphicsQuality): GraphicsSettings {
  const p = GRAPHICS_PRESETS[name];
  return {
    preset: name,
    baseTier: name,
    resolution: p.pixelRatio,
    shadows: shadowQualityForPreset(p),
    antialias: p.antialias,
    postProcessing: p.postProcessing,
    particleDensity: p.particleDensity,
    viewDistance: p.viewDistance,
    terrainDetail: p.terrainDetail,
    maxEnemies: p.maxEnemies,
  };
}

/** Resolve the editable graphics section into the engine-facing GraphicsPreset.
 *  Named tiers return their canonical preset verbatim; a custom mix is built
 *  (and clamped) from the individual knobs. */
export function resolveGraphicsPreset(g: GraphicsSettings): GraphicsPreset {
  if (g.preset !== 'custom') return GRAPHICS_PRESETS[g.preset] ?? GRAPHICS_PRESETS.high;
  const L = GRAPHICS_LIMITS;
  return {
    pixelRatio: clampNum(g.resolution, L.resolution.min, L.resolution.max, 0.85),
    shadowsEnabled: g.shadows !== 'off',
    shadowMapSize: SHADOW_MAP_SIZE[isShadowQuality(g.shadows) ? g.shadows : 'medium'],
    antialias: !!g.antialias,
    postProcessing: !!g.postProcessing,
    particleDensity: clampNum(g.particleDensity, L.particleDensity.min, L.particleDensity.max, 0.7),
    maxEnemies: Math.round(clampNum(g.maxEnemies, L.maxEnemies.min, L.maxEnemies.max, 22)),
    viewDistance: Math.round(clampNum(g.viewDistance, L.viewDistance.min, L.viewDistance.max, 150)),
    terrainDetail: clampNum(g.terrainDetail, L.terrainDetail.min, L.terrainDetail.max, 0.85),
  };
}

/** Build a complete, validated GraphicsSettings from raw/partial/legacy input
 *  (a saved JSON blob, a legacy flat `graphicsQuality`, or nothing). Pure — used
 *  by both the localStorage loader and the Convex blob restore. */
export function parseGraphics(raw: unknown, legacyQuality?: unknown): GraphicsSettings {
  const isTier = (v: unknown): v is GraphicsQuality =>
    typeof v === 'string' && v in GRAPHICS_PRESETS;

  if (raw && typeof raw === 'object') {
    const g = raw as Partial<GraphicsSettings>;
    if (g.preset === 'custom') {
      const baseTier: GraphicsQuality = isTier(g.baseTier) ? g.baseTier : 'high';
      const base = graphicsSettingsFromPreset(baseTier);
      const L = GRAPHICS_LIMITS;
      return {
        preset: 'custom',
        baseTier,
        resolution: clampNum(g.resolution, L.resolution.min, L.resolution.max, base.resolution),
        shadows: isShadowQuality(g.shadows) ? g.shadows : base.shadows,
        antialias: typeof g.antialias === 'boolean' ? g.antialias : base.antialias,
        postProcessing: typeof g.postProcessing === 'boolean' ? g.postProcessing : base.postProcessing,
        particleDensity: clampNum(g.particleDensity, L.particleDensity.min, L.particleDensity.max, base.particleDensity),
        viewDistance: Math.round(clampNum(g.viewDistance, L.viewDistance.min, L.viewDistance.max, base.viewDistance)),
        terrainDetail: clampNum(g.terrainDetail, L.terrainDetail.min, L.terrainDetail.max, base.terrainDetail),
        maxEnemies: Math.round(clampNum(g.maxEnemies, L.maxEnemies.min, L.maxEnemies.max, base.maxEnemies)),
      };
    }
    if (isTier(g.preset)) return graphicsSettingsFromPreset(g.preset);
  }
  // Legacy migration: a pre-section flat `graphicsQuality` string.
  if (isTier(legacyQuality)) return graphicsSettingsFromPreset(legacyQuality);
  return graphicsSettingsFromPreset('high');
}

// ── Rebindable controls ──────────────────────────────────────────────────────
// Every action here is read by the game loop (see App.tsx). The stored value is
// a KeyboardEvent.code (e.g. 'KeyW', 'Space', 'ShiftLeft') so bindings are
// layout-independent and survive a JSON round-trip to Convex. Mouse look/fire,
// the weapon-select digits (1–7), the arrow-key movement fallback and Escape
// (pause) are intentionally NOT rebindable and stay fixed.
export type GameAction =
  | 'moveForward' | 'moveBackward' | 'moveLeft' | 'moveRight'
  | 'jump' | 'sprint' | 'crouch' | 'dash' | 'reload' | 'usePower' | 'toggleMap' | 'inspect';

export type KeyBindings = Record<GameAction, string>;

export const defaultKeyBindings: KeyBindings = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  dash: 'KeyQ',
  reload: 'KeyR',
  usePower: 'KeyE',
  toggleMap: 'KeyM',
  inspect: 'KeyF',
};

// Codes that may never be assigned to a rebindable action — they're owned by
// fixed systems (pause, weapon switching, the arrow-key movement fallback).
export const RESERVED_KEY_CODES: ReadonlySet<string> = new Set([
  'Escape', 'Tab',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

/** Merge a (possibly partial / legacy) binding set onto the full defaults so
 *  the live bindings always cover every action. */
export function normalizeKeyBindings(partial?: Partial<KeyBindings> | null): KeyBindings {
  return { ...defaultKeyBindings, ...(partial ?? {}) };
}

export interface UserSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  sensitivity: number;
  fov: number;
  showFPS: boolean;
  screenShake: boolean;
  /** Vibration feedback on touch devices (fire, hits, damage, button taps).
   *  No-ops on hardware without the Vibration API (e.g. desktop, iOS Safari). */
  haptics: boolean;
  hitMarkers: boolean;
  killFeed: boolean;
  /** Cinematic combat impact FX — world-space hit flashes + shockrings when you
   *  land a shot, bullets that shatter into shrapnel off enemy armour, and a
   *  visceral directional impact spark when an enemy lands a hit on you. Purely
   *  feel/feedback — gameplay numbers are unchanged. */
  impactFeedback: boolean;
  /** Enemy death ragdoll physics (launch + gravity + bounce + tumble). When
   *  off, enemies use a lightweight shrink-out death instead. */
  ragdollPhysics: boolean;
  /** Auto-reload when the trigger is pulled on an empty magazine. Off → the
   *  empty pull just dry-fires (manual reload only). */
  autoReload: boolean;
  /** Vertical head-bob while moving. Off → the camera holds steady (helps
   *  motion-sensitive players). */
  cameraBob: boolean;
  /** Show the aiming crosshair/reticle. Off → no reticle (hardcore aim). */
  showCrosshair: boolean;
  crosshairStyle: 'dot' | 'cross' | 'circle' | 'dynamic';
  crosshairColor: string;
  /** AAA-style graphics section: a named preset OR a hand-tuned custom mix.
   *  Supersedes the old flat `graphicsQuality` field (auto-migrated on load). */
  graphics: GraphicsSettings;
  keyBindings: KeyBindings;
}

export const defaultUserSettings: UserSettings = {
  masterVolume: 80,
  sfxVolume: 100,
  musicVolume: 70,
  sensitivity: 50,
  fov: 75,
  showFPS: false,
  screenShake: true,
  haptics: true,
  hitMarkers: true,
  killFeed: true,
  impactFeedback: true,
  ragdollPhysics: true,
  autoReload: true,
  cameraBob: true,
  showCrosshair: true,
  crosshairStyle: 'cross',
  crosshairColor: '#22c55e',
  graphics: graphicsSettingsFromPreset('high'), // Default to the high tier
  keyBindings: { ...defaultKeyBindings },
};

const STORAGE_KEY = 'gameSettings';

// Rebuild a clean, complete UserSettings from a raw/partial/legacy object (a
// localStorage blob, a Convex sync blob, or nothing). Explicit field-by-field so
// that retired keys (`damageNumbers`, the flat `graphicsQuality`) are DROPPED
// rather than carried forward — that's what keeps the persisted blob small and
// migrates old accounts in one pass. The graphics section is migrated from a
// legacy flat `graphicsQuality` when no `graphics` object is present.
function mergeSettings(raw: unknown): UserSettings {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = defaultUserSettings;
  const num = (k: string, f: number) => (typeof p[k] === 'number' && Number.isFinite(p[k]) ? (p[k] as number) : f);
  const bool = (k: string, f: boolean) => (typeof p[k] === 'boolean' ? (p[k] as boolean) : f);
  const str = <T extends string>(k: string, f: T, allowed?: readonly T[]): T => {
    const v = p[k];
    if (typeof v === 'string' && (!allowed || (allowed as readonly string[]).includes(v))) return v as T;
    return f;
  };
  return {
    masterVolume: num('masterVolume', d.masterVolume),
    sfxVolume: num('sfxVolume', d.sfxVolume),
    musicVolume: num('musicVolume', d.musicVolume),
    sensitivity: num('sensitivity', d.sensitivity),
    fov: num('fov', d.fov),
    showFPS: bool('showFPS', d.showFPS),
    screenShake: bool('screenShake', d.screenShake),
    haptics: bool('haptics', d.haptics),
    hitMarkers: bool('hitMarkers', d.hitMarkers),
    killFeed: bool('killFeed', d.killFeed),
    impactFeedback: bool('impactFeedback', d.impactFeedback),
    ragdollPhysics: bool('ragdollPhysics', d.ragdollPhysics),
    autoReload: bool('autoReload', d.autoReload),
    cameraBob: bool('cameraBob', d.cameraBob),
    showCrosshair: bool('showCrosshair', d.showCrosshair),
    crosshairStyle: str('crosshairStyle', d.crosshairStyle, ['dot', 'cross', 'circle', 'dynamic'] as const),
    crosshairColor: str('crosshairColor', d.crosshairColor),
    graphics: parseGraphics(p.graphics, p.graphicsQuality),
    keyBindings: normalizeKeyBindings(p.keyBindings as Partial<KeyBindings> | undefined),
  };
}

class GameSettingsManager {
  private settings: UserSettings;
  private listeners: ((settings: UserSettings) => void)[] = [];

  constructor() {
    this.settings = this.loadSettings();

    // Listen for storage changes from other tabs/windows
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.settings = this.loadSettings();
          this.notifyListeners();
        }
      });
    }
  }

  private loadSettings(): UserSettings {
    if (typeof window === 'undefined') return mergeSettings(null);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return mergeSettings(JSON.parse(saved));
    } catch (e) {
      console.warn('Failed to load game settings:', e);
    }
    return mergeSettings(null);
  }

  getSettings(): UserSettings {
    // Return the in-memory snapshot. This used to re-read + JSON.parse the
    // whole settings blob (incl. keyBindings) from localStorage on EVERY call —
    // and the game loop calls getSetting() per shot / per kill / per pickup /
    // per frame, so during combat that was dozens of synchronous localStorage
    // parses a frame, which is exactly the main-thread hitch the player felt
    // when interacting. The in-memory copy is authoritative because every write
    // path (updateSetting/updateSettings/resetToDefaults) keeps it current, and
    // cross-tab edits are folded back in via the `storage` event listener.
    return { ...this.settings };
  }

  getSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
    return this.settings[key];
  }

  updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    this.settings[key] = value;
    this.saveSettings();
    this.notifyListeners();
  }

  updateSettings(updates: Partial<UserSettings>): void {
    this.settings = { ...this.settings, ...updates };
    // Keep bindings complete whether the update is partial (one rebind) or a
    // full set restored from the account blob.
    if (updates.keyBindings) {
      this.settings.keyBindings = normalizeKeyBindings({
        ...this.settings.keyBindings,
        ...updates.keyBindings,
      });
    }
    // Validate/clamp a graphics section if one was supplied directly.
    if (updates.graphics) {
      this.settings.graphics = parseGraphics(updates.graphics);
    }
    this.saveSettings();
    this.notifyListeners();
  }

  /** Restore the full settings from a synced account blob (Convex). Rebuilds
   *  from defaults so retired/stale keys are dropped and the section is migrated
   *  — used by the sign-in restore path. */
  importSettings(raw: unknown): void {
    this.settings = mergeSettings(raw);
    this.saveSettings();
    this.notifyListeners();
  }

  private saveSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save game settings:', e);
    }
  }

  resetToDefaults(): void {
    // Fresh deep copy (mergeSettings clones graphics + keyBindings) so the
    // defaults are never mutated by later edits.
    this.settings = mergeSettings(null);
    this.saveSettings();
    this.notifyListeners();
  }

  // Subscribe to settings changes
  subscribe(listener: (settings: UserSettings) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener({ ...this.settings });
    }
  }

  // Utility methods for computed values
  getEffectiveVolume(): number {
    return (this.settings.masterVolume / 100) * (this.settings.sfxVolume / 100);
  }

  getEffectiveMusicVolume(): number {
    return (this.settings.masterVolume / 100) * (this.settings.musicVolume / 100);
  }

  // Sensitivity is stored as 10-100, convert to usable multiplier (0.5 to 2.5)
  getSensitivityMultiplier(): number {
    return 0.5 + (this.settings.sensitivity / 100) * 2;
  }

  // The editable graphics section (preset name + individual knobs).
  getGraphics(): GraphicsSettings {
    return { ...this.settings.graphics };
  }

  // Resolve the section into the engine-facing preset (named tier or custom mix).
  // This is what the renderer reads at scene init.
  getGraphicsPreset(): GraphicsPreset {
    return resolveGraphicsPreset(this.settings.graphics);
  }

  // Representative named tier — drives the few cosmetic/qualitative engine
  // choices not captured by the numeric knobs (shadow softness, HDRI res, haze).
  getGraphicsQuality(): GraphicsQuality {
    return this.settings.graphics.baseTier;
  }

  // Select a named preset (resets the knobs to mirror that tier).
  setGraphicsPreset(name: GraphicsQuality): void {
    this.settings.graphics = graphicsSettingsFromPreset(name);
    this.saveSettings();
    this.notifyListeners();
  }

  // Tweak one or more individual knobs → switches the section to a CUSTOM mix.
  // The previously-selected named tier becomes the cosmetic `baseTier`.
  updateGraphics(patch: Partial<Omit<GraphicsSettings, 'preset' | 'baseTier'>>): void {
    const current = this.settings.graphics;
    this.settings.graphics = parseGraphics({
      ...current,
      ...patch,
      preset: 'custom',
      baseTier: current.preset === 'custom' ? current.baseTier : current.preset,
    });
    this.saveSettings();
    this.notifyListeners();
  }

  // Back-compat alias (touch auto-detect): select a named preset.
  setGraphicsQuality(quality: GraphicsQuality): void {
    this.setGraphicsPreset(quality);
  }
}

// Singleton instance
export const gameSettingsManager = new GameSettingsManager();
export default gameSettingsManager;
