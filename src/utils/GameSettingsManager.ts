// Game Settings Manager - Handles reading/writing user settings from localStorage

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

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
  // LOW — maximum performance for older / integrated GPUs.
  //   • No real-time shadows (single biggest WebGL cost)
  //   • No post-processing (composer + bloom is ~2-3ms per frame)
  //   • 70% pixel ratio + nearest-neighbour scaling = ~half the fragment work
  //   • Particle density 0.40 + terrain detail 0.55 — still readable
  //     world, no "empty plain" feel
  //   • viewDistance 100m — fog masks the cull boundary
  low: {
    pixelRatio: 0.70,
    shadowMapSize: 512,
    shadowsEnabled: false,
    antialias: false,
    postProcessing: false,
    // Particles (pooled, capped) + grass are the cheapest way to keep the
    // shadow-less, post-less LOW world from reading as an empty plain, so they
    // get a small lift; the heavy levers (resolution / shadows / post-FX) stay
    // off to protect the frame-rate target on integrated GPUs.
    particleDensity: 0.50,
    maxEnemies: 14,
    viewDistance: 100,
    terrainDetail: 0.62,
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
  damageNumbers: boolean;
  /** Cinematic combat impact FX — world-space hit flashes + shockrings when you
   *  land a shot, bullets that shatter into shrapnel off enemy armour, and a
   *  visceral directional impact spark when an enemy lands a hit on you. Purely
   *  feel/feedback — gameplay numbers are unchanged. */
  impactFeedback: boolean;
  /** Enemy death ragdoll physics (launch + gravity + bounce + tumble). When
   *  off, enemies use a lightweight shrink-out death instead. */
  ragdollPhysics: boolean;
  crosshairStyle: 'dot' | 'cross' | 'circle' | 'dynamic';
  crosshairColor: string;
  graphicsQuality: GraphicsQuality;
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
  damageNumbers: true,
  impactFeedback: true,
  ragdollPhysics: true,
  crosshairStyle: 'cross',
  crosshairColor: '#22c55e',
  graphicsQuality: 'high', // Default to the high tier
  keyBindings: { ...defaultKeyBindings },
};

const STORAGE_KEY = 'gameSettings';

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
    if (typeof window === 'undefined') return { ...defaultUserSettings };

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<UserSettings>;
        return {
          ...defaultUserSettings,
          ...parsed,
          // Deep-merge bindings so a partial/legacy blob can't drop an action.
          keyBindings: normalizeKeyBindings(parsed.keyBindings),
        };
      }
    } catch (e) {
      console.warn('Failed to load game settings:', e);
    }
    return { ...defaultUserSettings, keyBindings: { ...defaultKeyBindings } };
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
    this.settings = { ...defaultUserSettings };
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

  // Get the current graphics preset based on quality setting
  getGraphicsPreset(): GraphicsPreset {
    const quality = this.getGraphicsQuality();
    return GRAPHICS_PRESETS[quality] || GRAPHICS_PRESETS.high;
  }

  // Get graphics quality level
  getGraphicsQuality(): GraphicsQuality {
    const quality = this.settings.graphicsQuality as GraphicsQuality;
    return GRAPHICS_PRESETS[quality] ? quality : 'high';
  }

  // Set graphics quality
  setGraphicsQuality(quality: GraphicsQuality): void {
    this.updateSetting('graphicsQuality', quality);
  }
}

// Singleton instance
export const gameSettingsManager = new GameSettingsManager();
export default gameSettingsManager;
