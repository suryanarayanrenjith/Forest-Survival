// Game Settings Manager - Handles reading/writing user settings from localStorage

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface GraphicsPreset {
  pixelRatio: number;
  shadowMapSize: number;
  shadowsEnabled: boolean;
  antialias: boolean;
  postProcessing: boolean;
  particleDensity: number;
  maxEnemies: number;
  viewDistance: number;
  effectsQuality: number; // 0-1 multiplier for effects
  terrainDetail: number; // 0-1 multiplier for terrain objects
  playerShadow: boolean;
}

export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsPreset> = {
  low: {
    pixelRatio: 0.5,
    shadowMapSize: 512,
    shadowsEnabled: false,
    antialias: false,
    postProcessing: false,
    particleDensity: 0.3,
    maxEnemies: 15,
    viewDistance: 80,
    effectsQuality: 0.3,
    terrainDetail: 0.5,
    playerShadow: false,
  },
  medium: {
    pixelRatio: 0.75,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    antialias: false,
    postProcessing: true,
    particleDensity: 0.6,
    maxEnemies: 25,
    viewDistance: 120,
    effectsQuality: 0.6,
    terrainDetail: 0.75,
    playerShadow: true,
  },
  high: {
    pixelRatio: 1,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    antialias: true,
    postProcessing: true,
    particleDensity: 1.0,
    maxEnemies: 40,
    viewDistance: 200,
    effectsQuality: 1.0,
    terrainDetail: 1.0,
    playerShadow: true,
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
