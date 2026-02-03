import React, { useState, useEffect } from 'react';
import { soundManager } from '../utils/SoundManager';
import { type GraphicsQuality, GRAPHICS_PRESETS } from '../utils/GameSettingsManager';

interface SettingsMenuProps {
  onClose: () => void;
}

interface GameSettings {
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

const defaultSettings: GameSettings = {
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

const SettingsMenu: React.FC<SettingsMenuProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'controls' | 'audio' | 'gameplay' | 'display'>('controls');
  const [settings, setSettings] = useState<GameSettings>(() => {
    const saved = localStorage.getItem('gameSettings');
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('gameSettings', JSON.stringify(settings));
    soundManager.setVolume((settings.masterVolume / 100) * (settings.sfxVolume / 100));
  }, [settings]);

  const updateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    setSettings(defaultSettings);
  };

  const controls = [
    { key: 'W', action: 'Move Forward', icon: '↑' },
    { key: 'S', action: 'Move Backward', icon: '↓' },
    { key: 'A', action: 'Move Left', icon: '←' },
    { key: 'D', action: 'Move Right', icon: '→' },
    { key: 'Space', action: 'Jump', icon: '⬆' },
    { key: 'Shift', action: 'Sprint', icon: '⚡' },
    { key: 'Q', action: 'Dash', icon: '💨' },
    { key: 'Mouse', action: 'Look Around', icon: '🖱️' },
    { key: 'Left Click', action: 'Shoot', icon: '🔫' },
    { key: 'Right Click', action: 'Aim (Sniper/Rifle)', icon: '🎯' },
    { key: 'R', action: 'Reload', icon: '🔄' },
    { key: '1-7', action: 'Switch Weapon', icon: '🔫' },
    { key: 'ESC', action: 'Pause Menu', icon: '⏸️' },
  ];

  const tabs = [
    { id: 'controls' as const, label: 'Controls', icon: '🎮' },
    { id: 'audio' as const, label: 'Audio', icon: '🔊' },
    { id: 'gameplay' as const, label: 'Gameplay', icon: '⚙️' },
    { id: 'display' as const, label: 'Display', icon: '🖥️' },
  ];

  const SliderControl = ({
    label,
    value,
    onChange,
    min = 0,
    max = 100,
    icon,
    suffix = '%'
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    icon: string;
    suffix?: string;
  }) => (
    <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 border border-gray-700/50 rounded-xl p-3 sm:p-5 hover:border-green-500/30 transition-all group">
      <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-xl sm:text-2xl flex-shrink-0">{icon}</span>
          <span className="text-gray-200 font-semibold text-sm sm:text-lg truncate">{label}</span>
        </div>
        <div className="bg-black/50 border border-green-500/50 rounded-lg px-2 sm:px-4 py-1 sm:py-2 min-w-[60px] sm:min-w-[80px] text-center flex-shrink-0">
          <span className="text-green-400 font-mono text-sm sm:text-lg font-bold">{value}{suffix}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        style={{
          background: `linear-gradient(to right, #22c55e 0%, #22c55e ${((value - min) / (max - min)) * 100}%, #374151 ${((value - min) / (max - min)) * 100}%, #374151 100%)`,
        }}
      />
    </div>
  );

  const ToggleControl = ({
    label,
    value,
    onChange,
    icon,
    description
  }: {
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
    icon: string;
    description?: string;
  }) => (
    <div
      onClick={() => onChange(!value)}
      className={`bg-gradient-to-r ${value ? 'from-green-900/40 to-emerald-900/40 border-green-500/50' : 'from-gray-900/80 to-gray-800/80 border-gray-700/50'} border rounded-xl p-3 sm:p-5 cursor-pointer hover:border-green-500/50 transition-all group`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-xl sm:text-2xl flex-shrink-0">{icon}</span>
          <div className="min-w-0">
            <span className="text-gray-200 font-semibold text-sm sm:text-lg">{label}</span>
            {description && <p className="text-gray-500 text-xs sm:text-sm mt-1 truncate">{description}</p>}
          </div>
        </div>
        <div className={`relative w-12 sm:w-14 h-6 sm:h-7 rounded-full transition-all flex-shrink-0 ${value ? 'bg-green-500' : 'bg-gray-600'}`}>
          <div className={`absolute w-4 sm:w-5 h-4 sm:h-5 bg-white rounded-full top-1 transition-all shadow-md ${value ? 'right-1' : 'left-1'}`} />
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-2 sm:p-4"
      style={{
        background: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        className="bg-gradient-to-b from-gray-900/95 to-black/95 rounded-2xl border-2 border-green-500/40 w-full max-w-5xl flex flex-col"
        style={{
          animation: 'scale-in 0.3s ease-out',
          boxShadow: '0 0 80px rgba(34, 197, 94, 0.2), 0 25px 50px rgba(0, 0, 0, 0.8)',
          maxHeight: '95vh',
        }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 border-b border-green-500/30 p-4 sm:p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                <span className="text-2xl">⚙️</span>
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-green-400">SETTINGS</h2>
                <p className="text-gray-400 text-sm">Customize your experience</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gray-800/80 hover:bg-red-900/50 border border-gray-700 hover:border-red-500/50 flex items-center justify-center text-gray-400 hover:text-red-400 transition-all hover:scale-110 active:scale-95"
            >
              <span className="text-xl font-bold">✕</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 bg-black/40 border-b border-gray-800 flex-shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-2 sm:px-4 font-bold text-sm sm:text-base rounded-lg transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-500/20'
                  : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
              }`}
            >
              <span className="hidden sm:inline mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">
          {/* Controls Tab */}
          {activeTab === 'controls' && (
            <div className="space-y-4" style={{ animation: 'fade-in 0.2s ease-out' }}>
              <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl p-4">
                <p className="text-green-300 text-center font-semibold flex items-center justify-center gap-2">
                  <span>💡</span>
                  <span>Master the controls to survive the forest!</span>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {controls.map((control, index) => (
                  <div
                    key={index}
                    className="group bg-gray-900/80 border border-gray-700/50 rounded-xl p-4 flex items-center justify-between hover:border-green-500/50 hover:bg-gray-800/80 transition-all"
                    style={{ animation: `fade-in 0.2s ease-out ${index * 0.03}s both` }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{control.icon}</span>
                      <span className="text-gray-200 font-medium">{control.action}</span>
                    </div>
                    <kbd className="bg-black border-2 border-green-500/60 rounded-lg px-3 py-1.5 text-green-400 font-mono text-sm font-bold shadow-lg group-hover:border-green-400 transition-all">
                      {control.key}
                    </kbd>
                  </div>
                ))}
              </div>

              <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mt-4">
                <p className="text-amber-300 text-sm flex items-center gap-2">
                  <span className="font-bold">⚠️ Note:</span>
                  <span>Key bindings are fixed. Customizable controls coming soon!</span>
                </p>
              </div>
            </div>
          )}

          {/* Audio Tab */}
          {activeTab === 'audio' && (
            <div className="space-y-4" style={{ animation: 'fade-in 0.2s ease-out' }}>
              <SliderControl
                label="Master Volume"
                value={settings.masterVolume}
                onChange={(v) => updateSetting('masterVolume', v)}
                icon="🔊"
              />
              <SliderControl
                label="Sound Effects"
                value={settings.sfxVolume}
                onChange={(v) => updateSetting('sfxVolume', v)}
                icon="💥"
              />
              <SliderControl
                label="Music Volume"
                value={settings.musicVolume}
                onChange={(v) => updateSetting('musicVolume', v)}
                icon="🎵"
              />

              {/* Sound Test */}
              <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 border border-gray-700/50 rounded-xl p-3 sm:p-5">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <span className="text-xl sm:text-2xl">🎧</span>
                  <span className="text-gray-200 font-semibold text-base sm:text-lg">Sound Test</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {[
                    { name: 'Gunshot', sound: 'shoot', color: 'blue' },
                    { name: 'Reload', sound: 'reload', color: 'purple' },
                    { name: 'Hit', sound: 'enemyHit', color: 'red' },
                    { name: 'Hurt', sound: 'playerHurt', color: 'orange' },
                  ].map((item) => (
                    <button
                      key={item.sound}
                      onClick={() => soundManager.play(item.sound as 'shoot' | 'reload' | 'enemyHit' | 'playerHurt')}
                      className={`bg-gradient-to-r from-${item.color}-600 to-${item.color}-700 hover:from-${item.color}-500 hover:to-${item.color}-600 text-white font-bold py-3 px-4 rounded-xl transition-all transform hover:scale-105 active:scale-95 border border-${item.color}-400/50`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Gameplay Tab */}
          {activeTab === 'gameplay' && (
            <div className="space-y-4" style={{ animation: 'fade-in 0.2s ease-out' }}>
              <SliderControl
                label="Mouse Sensitivity"
                value={settings.sensitivity}
                onChange={(v) => updateSetting('sensitivity', v)}
                icon="🎯"
                min={10}
                max={100}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ToggleControl
                  label="Screen Shake"
                  value={settings.screenShake}
                  onChange={(v) => updateSetting('screenShake', v)}
                  icon="📳"
                  description="Camera shake on impacts"
                />
                <ToggleControl
                  label="Hit Markers"
                  value={settings.hitMarkers}
                  onChange={(v) => updateSetting('hitMarkers', v)}
                  icon="🎯"
                  description="Visual feedback on hits"
                />
                <ToggleControl
                  label="Kill Feed"
                  value={settings.killFeed}
                  onChange={(v) => updateSetting('killFeed', v)}
                  icon="💀"
                  description="Show elimination notifications"
                />
                <ToggleControl
                  label="Damage Numbers"
                  value={settings.damageNumbers}
                  onChange={(v) => updateSetting('damageNumbers', v)}
                  icon="💢"
                  description="Show damage dealt"
                />
              </div>

              {/* Crosshair Settings */}
              <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 border border-gray-700/50 rounded-xl p-3 sm:p-5">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <span className="text-xl sm:text-2xl">⊕</span>
                  <span className="text-gray-200 font-semibold text-base sm:text-lg">Crosshair Style</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {(['dot', 'cross', 'circle', 'dynamic'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => updateSetting('crosshairStyle', style)}
                      className={`py-3 sm:py-4 rounded-lg sm:rounded-xl font-bold transition-all ${
                        settings.crosshairStyle === style
                          ? 'bg-green-600 text-white border-2 border-green-400'
                          : 'bg-gray-800/60 text-gray-400 border-2 border-gray-600 hover:border-green-400'
                      }`}
                    >
                      <div className="text-lg sm:text-xl mb-1">
                        {style === 'dot' && '•'}
                        {style === 'cross' && '+'}
                        {style === 'circle' && '○'}
                        {style === 'dynamic' && '⊕'}
                      </div>
                      <div className="text-[10px] sm:text-xs capitalize">{style}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Display Tab */}
          {activeTab === 'display' && (
            <div className="space-y-4" style={{ animation: 'fade-in 0.2s ease-out' }}>
              {/* Graphics Quality - Most Important Setting */}
              <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border-2 border-purple-500/50 rounded-xl p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🎮</span>
                  <div>
                    <span className="text-white font-bold text-lg">Graphics Quality</span>
                    <p className="text-gray-400 text-xs mt-0.5">Affects performance and visual quality</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(['low', 'medium', 'high'] as const).map((quality) => {
                    const isSelected = settings.graphicsQuality === quality;
                    return (
                      <button
                        key={quality}
                        onClick={() => updateSetting('graphicsQuality', quality)}
                        className={`relative py-4 px-3 rounded-xl font-bold transition-all transform hover:scale-105 active:scale-95 ${
                          isSelected
                            ? quality === 'high' ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white border-2 border-green-300 shadow-lg shadow-green-500/30'
                            : quality === 'medium' ? 'bg-gradient-to-br from-yellow-500 to-orange-500 text-white border-2 border-yellow-300 shadow-lg shadow-yellow-500/30'
                            : 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white border-2 border-blue-300 shadow-lg shadow-blue-500/30'
                            : 'bg-gray-800/80 text-gray-400 border-2 border-gray-600 hover:border-gray-400'
                        }`}
                      >
                        <div className="text-xl mb-1">
                          {quality === 'high' && '✨'}
                          {quality === 'medium' && '⚡'}
                          {quality === 'low' && '🚀'}
                        </div>
                        <div className="text-sm uppercase font-black">{quality}</div>
                        <div className="text-[9px] mt-1 opacity-80">
                          {quality === 'high' && 'Best visuals'}
                          {quality === 'medium' && 'Balanced'}
                          {quality === 'low' && 'Best performance'}
                        </div>
                        {isSelected && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs shadow-lg">
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 bg-black/30 rounded-lg p-3 text-xs text-gray-400">
                  <div className="grid grid-cols-2 gap-2">
                    <div>• Shadows: {GRAPHICS_PRESETS[settings.graphicsQuality].shadowsEnabled ? 'On' : 'Off'}</div>
                    <div>• Post-Processing: {GRAPHICS_PRESETS[settings.graphicsQuality].postProcessing ? 'On' : 'Off'}</div>
                    <div>• Resolution: {Math.round(GRAPHICS_PRESETS[settings.graphicsQuality].pixelRatio * 100)}%</div>
                    <div>• Player Shadow: {GRAPHICS_PRESETS[settings.graphicsQuality].playerShadow ? 'On' : 'Off'}</div>
                  </div>
                </div>
              </div>

              <SliderControl
                label="Field of View"
                value={settings.fov}
                onChange={(v) => updateSetting('fov', v)}
                icon="👁️"
                min={60}
                max={120}
                suffix="°"
              />

              <ToggleControl
                label="Show FPS Counter"
                value={settings.showFPS}
                onChange={(v) => updateSetting('showFPS', v)}
                icon="📊"
                description="Display frames per second"
              />

              {/* Crosshair Color */}
              <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 border border-gray-700/50 rounded-xl p-3 sm:p-5">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <span className="text-xl sm:text-2xl">🎨</span>
                  <span className="text-gray-200 font-semibold text-base sm:text-lg">Crosshair Color</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
                  {['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ffffff'].map((color) => (
                    <button
                      key={color}
                      onClick={() => updateSetting('crosshairColor', color)}
                      className={`h-10 sm:h-12 rounded-lg sm:rounded-xl transition-all ${
                        settings.crosshairColor === color ? 'ring-4 ring-white scale-110' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Performance Info */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                <p className="text-blue-300 text-sm">
                  <span className="font-bold">💡 Tips:</span>
                </p>
                <ul className="text-blue-300 text-sm mt-2 space-y-1 list-disc list-inside">
                  <li>Lower graphics quality for smoother gameplay on older devices</li>
                  <li>Higher FOV gives wider view but may affect performance</li>
                  <li>Restart the game after changing graphics quality for full effect</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-black/40 border-t border-gray-800 p-4 flex flex-col sm:flex-row gap-3 justify-between items-center flex-shrink-0">
          <button
            onClick={resetToDefaults}
            className="px-6 py-2 bg-gray-800/80 hover:bg-gray-700 border border-gray-600 hover:border-gray-500 text-gray-300 font-bold rounded-xl transition-all hover:scale-105 active:scale-95"
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="px-10 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black text-lg rounded-xl border-2 border-green-400 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-green-500/30"
          >
            SAVE & CLOSE
          </button>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        input[type="range"].slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #22c55e, #15803d);
          cursor: pointer;
          border: 3px solid #ffffff;
          box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
          transition: all 0.2s;
        }

        input[type="range"].slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 15px rgba(34, 197, 94, 0.8);
        }

        input[type="range"].slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #22c55e, #15803d);
          cursor: pointer;
          border: 3px solid #ffffff;
          box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
        }
      `}</style>
    </div>
  );
};

export default SettingsMenu;
