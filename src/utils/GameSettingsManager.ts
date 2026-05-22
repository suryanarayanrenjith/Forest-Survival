// Game Settings Manager - Handles reading/writing user settings from localStorage

export type GraphicsQuality = 'low' | 'medium' | 'high';

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

// Three clean performance tiers. Every field below is read and applied by
// the engine — there are no dead knobs.
export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsPreset> = {
  // LOW — maximum performance: no shadows, no post-FX, reduced resolution.
  low: {
    pixelRatio: 0.6,
    shadowMapSize: 512,
    shadowsEnabled: false,
    antialias: false,
    postProcessing: false,
    particleDensity: 0.35,
    maxEnemies: 16,
    viewDistance: 90,
    terrainDetail: 0.5,
  },
  // MEDIUM — balanced: soft shadows + bloom at a slightly reduced resolution.
  medium: {
    pixelRatio: 0.8,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    antialias: false,
    postProcessing: true,
    particleDensity: 0.65,
    maxEnemies: 28,
    viewDistance: 140,
    terrainDetail: 0.8,
  },
  // HIGH — full fidelity: native resolution, MSAA, high-res soft shadows.
  high: {
    pixelRatio: 1.0,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    antialias: true,
    postProcessing: true,
    particleDensity: 1.0,
    maxEnemies: 42,
    viewDistance: 200,
    terrainDetail: 1.0,
  },
};

export interface UserSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  sensitivity: number;
  fov: number;
  showFPS: boolean;
  screenShake: boolean;
  hitMarkers: boolean;
  killFeed: boolean;
  damageNumbers: boolean;
  crosshairStyle: 'dot' | 'cross' | 'circle' | 'dynamic';
  crosshairColor: string;
  graphicsQuality: GraphicsQuality;
}

export const defaultUserSettings: UserSettings = {
  masterVolume: 80,
  sfxVolume: 100,
  musicVolume: 70,
  sensitivity: 50,
  fov: 75,
  showFPS: false,
  screenShake: true,
  hitMarkers: true,
  killFeed: true,
  damageNumbers: true,
  crosshairStyle: 'cross',
  crosshairColor: '#22c55e',
  graphicsQuality: 'high', // Default to highest quality
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
        return { ...defaultUserSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load game settings:', e);
    }
    return { ...defaultUserSettings };
  }

  getSettings(): UserSettings {
    // Always read fresh from localStorage to stay in sync
    this.settings = this.loadSettings();
    return { ...this.settings };
  }

  getSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
    this.settings = this.loadSettings();
    return this.settings[key];
  }

  updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    this.settings[key] = value;
    this.saveSettings();
    this.notifyListeners();
  }

  updateSettings(updates: Partial<UserSettings>): void {
    this.settings = { ...this.settings, ...updates };
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
    return GRAPHICS_PRESETS[this.settings.graphicsQuality] || GRAPHICS_PRESETS.high;
  }

  // Get graphics quality level
  getGraphicsQuality(): GraphicsQuality {
    return this.settings.graphicsQuality || 'high';
  }

  // Set graphics quality
  setGraphicsQuality(quality: GraphicsQuality): void {
    this.updateSetting('graphicsQuality', quality);
  }
}

// Singleton instance
export const gameSettingsManager = new GameSettingsManager();
export default gameSettingsManager;
