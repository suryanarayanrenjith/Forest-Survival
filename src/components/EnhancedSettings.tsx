import React, { useState } from 'react';

export interface GameSettings {
  // Graphics
  graphicsQuality: 'low' | 'medium' | 'high' | 'ultra';
  shadowQuality: 'off' | 'low' | 'medium' | 'high';
  postProcessing: boolean;
  particles: boolean;
  particleDensity: number; // 0-100
  viewDistance: number; // 50-200

  // Audio
  masterVolume: number; // 0-100
  musicVolume: number; // 0-100
  sfxVolume: number; // 0-100

  // Gameplay
  difficulty: 'easy' | 'medium' | 'hard';
  showTutorial: boolean;
  showHints: boolean;
  showDamageNumbers: boolean;
  screenShake: boolean;
  autoReload: boolean;
  adaptiveDifficulty: boolean;

  // Controls
  mouseSensitivity: number; // 0-100
  invertY: boolean;
  toggleAim: boolean;

  // UI
  showFPS: boolean;
  showMinimap: boolean;
  uiScale: number; // 80-120
  colorblindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

interface EnhancedSettingsProps {
  settings: GameSettings;
  onSettingsChange: (settings: Partial<GameSettings>) => void;
  onClose: () => void;
  onReset?: () => void;
}

export const EnhancedSettings: React.FC<EnhancedSettingsProps> = ({
  settings,
  onSettingsChange,
  onClose,
  onReset
}) => {
  const [activeTab, setActiveTab] = useState<'graphics' | 'audio' | 'gameplay' | 'controls' | 'ui'>('graphics');

  const tabs = [
    { id: 'graphics' as const, name: 'Graphics', icon: '🎨' },
    { id: 'audio' as const, name: 'Audio', icon: '🔊' },
    { id: 'gameplay' as const, name: 'Gameplay', icon: '🎮' },
    { id: 'controls' as const, name: 'Controls', icon: '🎯' },
    { id: 'ui' as const, name: 'Interface', icon: '📊' }
  ];

  const handleChange = (key: keyof GameSettings, value: any) => {
    onSettingsChange({ [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-900/50 to-purple-900/50 p-3 sm:p-4 border-b-2 border-cyan-400/50 rounded-t-lg">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Settings</h2>
        </div>

        {/* Tabs - Horizontal on mobile, sidebar on desktop */}
        <div className="flex flex-wrap gap-1 p-2 bg-gray-800/50 border-b border-cyan-400/30 md:hidden">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[60px] text-center px-2 py-2 rounded transition-all text-xs ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-white'
                  : 'text-gray-300 hover:bg-gray-700 bg-gray-800/50'
              }`}
            >
              <span className="block text-lg">{tab.icon}</span>
              <span className="block text-[10px] mt-0.5">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Tabs - Sidebar on desktop */}
          <div className="hidden md:block w-48 bg-gray-800/50 border-r border-cyan-400/30 p-3">
            <div className="space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2 rounded transition-all ${
                    activeTab === tab.id
                      ? 'bg-cyan-500 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  <span className="text-sm">{tab.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Settings Panel */}
          <div className="flex-1 p-3 sm:p-6 overflow-y-auto">
            {activeTab === 'graphics' && (
              <GraphicsSettings settings={settings} onChange={handleChange} />
            )}
            {activeTab === 'audio' && (
              <AudioSettings settings={settings} onChange={handleChange} />
            )}
            {activeTab === 'gameplay' && (
              <GameplaySettings settings={settings} onChange={handleChange} />
            )}
            {activeTab === 'controls' && (
              <ControlsSettings settings={settings} onChange={handleChange} />
            )}
            {activeTab === 'ui' && (
              <UISettings settings={settings} onChange={handleChange} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-800/50 p-3 sm:p-4 border-t border-cyan-400/30 rounded-b-lg flex flex-col sm:flex-row gap-2 sm:gap-0 justify-between">
          {onReset && (
            <button
              onClick={onReset}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-400/50 rounded transition-colors text-sm sm:text-base order-2 sm:order-1"
            >
              Reset to Default
            </button>
          )}
          <div className="flex-1 hidden sm:block" />
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded transition-colors text-sm sm:text-base order-1 sm:order-2"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Graphics Settings Panel
const GraphicsSettings: React.FC<{
  settings: GameSettings;
  onChange: (key: keyof GameSettings, value: any) => void;
}> = ({ settings, onChange }) => (
  <div className="space-y-4 sm:space-y-6">
    <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Graphics Settings</h3>

    <SelectSetting
      label="Graphics Quality"
      value={settings.graphicsQuality}
      options={[
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'ultra', label: 'Ultra' }
      ]}
      onChange={(v) => onChange('graphicsQuality', v)}
    />

    <SelectSetting
      label="Shadow Quality"
      value={settings.shadowQuality}
      options={[
        { value: 'off', label: 'Off' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' }
      ]}
      onChange={(v) => onChange('shadowQuality', v)}
    />

    <ToggleSetting
      label="Post-Processing Effects"
      description="Bloom, color grading, and other visual effects"
      value={settings.postProcessing}
      onChange={(v) => onChange('postProcessing', v)}
    />

    <ToggleSetting
      label="Particles"
      description="Weapon effects, blood splatter, weather"
      value={settings.particles}
      onChange={(v) => onChange('particles', v)}
    />

    <SliderSetting
      label="Particle Density"
      value={settings.particleDensity}
      min={0}
      max={100}
      onChange={(v) => onChange('particleDensity', v)}
    />

    <SliderSetting
      label="View Distance"
      value={settings.viewDistance}
      min={50}
      max={200}
      onChange={(v) => onChange('viewDistance', v)}
    />
  </div>
);

// Audio Settings Panel
const AudioSettings: React.FC<{
  settings: GameSettings;
  onChange: (key: keyof GameSettings, value: any) => void;
}> = ({ settings, onChange }) => (
  <div className="space-y-4 sm:space-y-6">
    <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Audio Settings</h3>

    <SliderSetting
      label="Master Volume"
      value={settings.masterVolume}
      min={0}
      max={100}
      onChange={(v) => onChange('masterVolume', v)}
      showPercentage
    />

    <SliderSetting
      label="Music Volume"
      value={settings.musicVolume}
      min={0}
      max={100}
      onChange={(v) => onChange('musicVolume', v)}
      showPercentage
    />

    <SliderSetting
      label="Sound Effects Volume"
      value={settings.sfxVolume}
      min={0}
      max={100}
      onChange={(v) => onChange('sfxVolume', v)}
      showPercentage
    />
  </div>
);

// Gameplay Settings Panel
const GameplaySettings: React.FC<{
  settings: GameSettings;
  onChange: (key: keyof GameSettings, value: any) => void;
}> = ({ settings, onChange }) => (
  <div className="space-y-4 sm:space-y-6">
    <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Gameplay Settings</h3>

    <SelectSetting
      label="Base Difficulty"
      value={settings.difficulty}
      options={[
        { value: 'easy', label: 'Easy' },
        { value: 'medium', label: 'Medium' },
        { value: 'hard', label: 'Hard' }
      ]}
      onChange={(v) => onChange('difficulty', v)}
    />

    <ToggleSetting
      label="Adaptive Difficulty"
      description="AI adjusts difficulty based on your performance"
      value={settings.adaptiveDifficulty}
      onChange={(v) => onChange('adaptiveDifficulty', v)}
    />

    <ToggleSetting
      label="Show Tutorial"
      description="Display tutorial messages for new players"
      value={settings.showTutorial}
      onChange={(v) => onChange('showTutorial', v)}
    />

    <ToggleSetting
      label="Show Hints"
      description="Display contextual gameplay hints"
      value={settings.showHints}
      onChange={(v) => onChange('showHints', v)}
    />

    <ToggleSetting
      label="Show Damage Numbers"
      description="Display damage numbers on hits"
      value={settings.showDamageNumbers}
      onChange={(v) => onChange('showDamageNumbers', v)}
    />

    <ToggleSetting
      label="Screen Shake"
      description="Camera shake on weapon fire and damage"
      value={settings.screenShake}
      onChange={(v) => onChange('screenShake', v)}
    />

    <ToggleSetting
      label="Auto Reload"
      description="Automatically reload when ammo is empty"
      value={settings.autoReload}
      onChange={(v) => onChange('autoReload', v)}
    />
  </div>
);

// Controls Settings Panel
const ControlsSettings: React.FC<{
  settings: GameSettings;
  onChange: (key: keyof GameSettings, value: any) => void;
}> = ({ settings, onChange }) => (
  <div className="space-y-4 sm:space-y-6">
    <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Controls Settings</h3>

    <SliderSetting
      label="Mouse Sensitivity"
      value={settings.mouseSensitivity}
      min={0}
      max={100}
      onChange={(v) => onChange('mouseSensitivity', v)}
    />

    <ToggleSetting
      label="Invert Y-Axis"
      description="Invert vertical camera movement"
      value={settings.invertY}
      onChange={(v) => onChange('invertY', v)}
    />

    <ToggleSetting
      label="Toggle Aim"
      description="Right-click toggles aim instead of hold"
      value={settings.toggleAim}
      onChange={(v) => onChange('toggleAim', v)}
    />

    <div className="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
      <h4 className="text-white font-bold mb-2 text-sm sm:text-base">Key Bindings</h4>
      <div className="text-xs sm:text-sm text-gray-400 space-y-1 grid grid-cols-2 sm:block gap-x-4">
        <div>WASD - Movement</div>
        <div>Mouse - Look / Aim</div>
        <div>Left Click - Shoot</div>
        <div>R - Reload</div>
        <div>Q - Switch Weapon</div>
        <div>1-6 - Abilities</div>
        <div>E - Interact</div>
        <div>Shift - Sprint</div>
        <div>ESC - Pause</div>
      </div>
    </div>
  </div>
);

// UI Settings Panel
const UISettings: React.FC<{
  settings: GameSettings;
  onChange: (key: keyof GameSettings, value: any) => void;
}> = ({ settings, onChange }) => (
  <div className="space-y-4 sm:space-y-6">
    <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Interface Settings</h3>

    <ToggleSetting
      label="Show FPS Counter"
      description="Display frames per second"
      value={settings.showFPS}
      onChange={(v) => onChange('showFPS', v)}
    />

    <ToggleSetting
      label="Show Minimap"
      description="Display minimap (when available)"
      value={settings.showMinimap}
      onChange={(v) => onChange('showMinimap', v)}
    />

    <SliderSetting
      label="UI Scale"
      value={settings.uiScale}
      min={80}
      max={120}
      onChange={(v) => onChange('uiScale', v)}
      showPercentage
    />

    <SelectSetting
      label="Colorblind Mode"
      value={settings.colorblindMode}
      options={[
        { value: 'none', label: 'None' },
        { value: 'protanopia', label: 'Protanopia (Red-blind)' },
        { value: 'deuteranopia', label: 'Deuteranopia (Green-blind)' },
        { value: 'tritanopia', label: 'Tritanopia (Blue-blind)' }
      ]}
      onChange={(v) => onChange('colorblindMode', v)}
    />
  </div>
);

// Helper Components
const SliderSetting: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  showPercentage?: boolean;
}> = ({ label, value, min, max, onChange, showPercentage }) => (
  <div>
    <div className="flex justify-between items-center mb-2">
      <label className="text-white text-xs sm:text-sm font-medium">{label}</label>
      <span className="text-cyan-400 font-mono text-xs sm:text-sm">
        {showPercentage ? `${value}%` : value}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
    />
  </div>
);

const ToggleSetting: React.FC<{
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, description, value, onChange }) => (
  <div className="flex items-start justify-between gap-2">
    <div className="flex-1 min-w-0">
      <label className="text-white text-xs sm:text-sm font-medium">{label}</label>
      {description && <p className="text-gray-400 text-[10px] sm:text-xs mt-1">{description}</p>}
    </div>
    <button
      onClick={() => onChange(!value)}
      className={`ml-2 sm:ml-4 w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors flex-shrink-0 ${
        value ? 'bg-cyan-500' : 'bg-gray-600'
      }`}
    >
      <div
        className={`w-4 sm:w-5 h-4 sm:h-5 bg-white rounded-full transition-transform ${
          value ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

const SelectSetting: React.FC<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div>
    <label className="text-white text-xs sm:text-sm font-medium mb-2 block">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:border-cyan-500 focus:outline-none text-xs sm:text-sm"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);
