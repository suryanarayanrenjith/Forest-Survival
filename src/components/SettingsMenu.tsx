import React, { useState, useEffect } from 'react';
import {
  Settings, X, Gamepad2, Volume2, SlidersHorizontal, Monitor,
  ChevronsUp, ChevronsDown, ChevronsRight, Wind, Zap,
  Crosshair, Target, RotateCcw, Grid3x3, Pause, Music, MousePointer2,
  Eye, Activity, Skull, Check, Headphones, Sparkles, Hand, Radar, Bone, Flame,
  Maximize, Moon, Aperture, Wand2, Trees, Users, type LucideIcon,
} from 'lucide-react';
import { soundManager } from '../utils/SoundManager';
import {
  gameSettingsManager, GRAPHICS_LIMITS,
  type GraphicsQuality, type GraphicsSettings, type UserSettings,
} from '../utils/GameSettingsManager';
import { detectIsTouch } from '../hooks/useDeviceInfo';
import KeyBindingsEditor from './KeyBindingsEditor';

interface SettingsMenuProps {
  onClose: () => void;
}

// The simple (non-graphics, non-keybinding) settings this panel edits directly.
// Graphics live in their own section (gameSettingsManager.getGraphics()) and the
// rebinder owns keyBindings, so neither is mirrored here — that keeps the
// persisted blob clean and avoids the old "stale key written back" hazard.
type SimpleSettings = Pick<UserSettings,
  | 'masterVolume' | 'sfxVolume' | 'musicVolume' | 'sensitivity' | 'fov'
  | 'showFPS' | 'screenShake' | 'haptics' | 'hitMarkers' | 'killFeed'
  | 'impactFeedback' | 'ragdollPhysics' | 'autoReload' | 'cameraBob'
  | 'showCrosshair' | 'crosshairStyle' | 'crosshairColor'>;

const SIMPLE_KEYS: (keyof SimpleSettings)[] = [
  'masterVolume', 'sfxVolume', 'musicVolume', 'sensitivity', 'fov',
  'showFPS', 'screenShake', 'haptics', 'hitMarkers', 'killFeed',
  'impactFeedback', 'ragdollPhysics', 'autoReload', 'cameraBob',
  'showCrosshair', 'crosshairStyle', 'crosshairColor',
];

const pickSimple = (s: UserSettings): SimpleSettings => {
  const out = {} as SimpleSettings;
  for (const k of SIMPLE_KEYS) (out as Record<string, unknown>)[k] = s[k];
  return out;
};

const PRESET_META: { id: GraphicsQuality; label: string; desc: string }[] = [
  { id: 'ultralow', label: 'Ultra Low', desc: 'Max FPS' },
  { id: 'low', label: 'Low', desc: 'Best performance' },
  { id: 'medium', label: 'Medium', desc: 'Balanced' },
  { id: 'high', label: 'High', desc: 'Best visuals' },
  { id: 'ultra', label: 'Ultra', desc: 'Cinematic' },
];

const SettingsMenu: React.FC<SettingsMenuProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'controls' | 'audio' | 'gameplay' | 'display'>('controls');
  // Seed from the (already-migrated) manager snapshot rather than parsing
  // localStorage directly, so no retired/stale keys can ride in.
  const [settings, setSettings] = useState<SimpleSettings>(() => pickSimple(gameSettingsManager.getSettings()));
  // Graphics section is edited through dedicated manager calls; this mirror just
  // keeps the UI in sync (preset highlight vs. custom badge, live knob values).
  const [graphics, setGraphics] = useState<GraphicsSettings>(() => gameSettingsManager.getGraphics());

  useEffect(() => {
    // Persist the simple fields. Graphics + keyBindings are written via their own
    // manager calls, so they're never part of this patch.
    gameSettingsManager.updateSettings(settings);
    soundManager.setVolume((settings.masterVolume / 100) * (settings.sfxVolume / 100));
  }, [settings]);

  const updateSetting = <K extends keyof SimpleSettings>(key: K, value: SimpleSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // ── Graphics editing ───────────────────────────────────────────────────────
  const selectPreset = (name: GraphicsQuality) => {
    gameSettingsManager.setGraphicsPreset(name);
    setGraphics(gameSettingsManager.getGraphics());
  };
  const editGraphics = (patch: Partial<Omit<GraphicsSettings, 'preset' | 'baseTier'>>) => {
    gameSettingsManager.updateGraphics(patch);
    setGraphics(gameSettingsManager.getGraphics());
  };

  // Touch devices remap every action to the on-screen controls, so the
  // reference list shown here swaps to the touch gestures/buttons.
  const isTouch = detectIsTouch();

  const touchControlsList: { key: string; action: string; icon: LucideIcon }[] = [
    { key: 'Left stick', action: 'Move', icon: Gamepad2 },
    { key: 'Swipe right', action: 'Look Around', icon: Hand },
    { key: 'Push stick', action: 'Sprint', icon: Wind },
    { key: 'FIRE', action: 'Shoot', icon: Crosshair },
    { key: 'Aim', action: 'Aim Down Sights', icon: Target },
    { key: 'Jump', action: 'Jump', icon: ChevronsUp },
    { key: 'Dash', action: 'Dash', icon: ChevronsRight },
    { key: 'Crouch', action: 'Crouch', icon: ChevronsDown },
    { key: 'Power', action: 'Use Power-Up', icon: Sparkles },
    { key: 'Reload', action: 'Reload', icon: RotateCcw },
    { key: 'Weapon', action: 'Switch Weapon', icon: Grid3x3 },
    { key: 'Map', action: 'Tactical Map', icon: Radar },
    { key: 'Pause', action: 'Pause Menu', icon: Pause },
  ];

  const tabs: { id: 'controls' | 'audio' | 'gameplay' | 'display'; label: string; icon: LucideIcon }[] = [
    { id: 'controls', label: 'Controls', icon: Gamepad2 },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'gameplay', label: 'Gameplay', icon: SlidersHorizontal },
    { id: 'display', label: 'Display', icon: Monitor },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 menu-overlay-in"
      style={{ background: 'rgba(5,8,10,0.92)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="hud-frame w-full max-w-3xl flex flex-col rounded-2xl border border-emerald-400/15 bg-[#080d0b] shadow-[0_40px_100px_rgba(0,0,0,0.6)]"
        style={{ maxHeight: '94dvh', animation: 'smFade 0.3s cubic-bezier(0.16,1,0.3,1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-400/30">
              <Settings className="w-5 h-5 text-emerald-300" strokeWidth={2} />
            </div>
            <div>
              <p className="font-hud text-[10px] tracking-[0.36em] text-emerald-300/90 font-semibold uppercase">Configuration</p>
              <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-white">Settings</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-gray-400
              transition-colors hover:text-white hover:bg-white/[0.06]"
            aria-label="Close settings"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2.25} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b border-white/[0.07]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`font-hud flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                  active ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/40' : 'text-gray-400 border border-transparent hover:text-gray-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={2.25} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 min-h-0">
          {activeTab === 'controls' && (
            isTouch ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ animation: 'smFade 0.2s ease-out' }}>
                {touchControlsList.map((c) => {
                  const Icon = c.icon;
                  return (
                    <div key={c.action} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-gray-500" strokeWidth={2} />
                        <span className="text-sm text-gray-300 font-medium">{c.action}</span>
                      </div>
                      <kbd className="px-2 py-1 rounded-md bg-white/[0.06] border border-white/10 text-gray-300 font-mono text-[11px] font-semibold">
                        {c.key}
                      </kbd>
                    </div>
                  );
                })}
                <p className="sm:col-span-2 text-xs text-gray-600 text-center mt-1">
                  On-screen touch controls are active. Play in landscape.
                </p>
              </div>
            ) : (
              <div style={{ animation: 'smFade 0.2s ease-out' }}>
                <KeyBindingsEditor accent="#34d399" />
              </div>
            )
          )}

          {activeTab === 'audio' && (
            <div className="space-y-3" style={{ animation: 'smFade 0.2s ease-out' }}>
              <Slider label="Master Volume" icon={Volume2} value={settings.masterVolume} onChange={(v) => updateSetting('masterVolume', v)} />
              <Slider label="Sound Effects" icon={Zap} value={settings.sfxVolume} onChange={(v) => updateSetting('sfxVolume', v)} />
              <Slider label="Music" icon={Music} value={settings.musicVolume} onChange={(v) => updateSetting('musicVolume', v)} />

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Headphones className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
                  <span className="font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">Sound Test</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { name: 'Gunshot', sound: 'shoot' },
                    { name: 'Reload', sound: 'reload' },
                    { name: 'Hit', sound: 'enemyHit' },
                    { name: 'Hurt', sound: 'playerHurt' },
                  ].map((item) => (
                    <button
                      key={item.sound}
                      onClick={() => soundManager.play(item.sound as 'shoot' | 'reload' | 'enemyHit' | 'playerHurt')}
                      className="rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-sm font-semibold text-gray-300
                        transition-colors hover:bg-white/[0.07] hover:text-white"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gameplay' && (
            <div className="space-y-3" style={{ animation: 'smFade 0.2s ease-out' }}>
              <Slider label="Mouse Sensitivity" icon={MousePointer2} value={settings.sensitivity} min={10} max={100} onChange={(v) => updateSetting('sensitivity', v)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Toggle label="Screen Shake" desc="Camera shake on impacts" icon={Activity} value={settings.screenShake} onChange={(v) => updateSetting('screenShake', v)} />
                <Toggle label="Hit Markers" desc="Feedback when you land hits" icon={Crosshair} value={settings.hitMarkers} onChange={(v) => updateSetting('hitMarkers', v)} />
                <Toggle label="Kill Feed" desc="Elimination notifications" icon={Skull} value={settings.killFeed} onChange={(v) => updateSetting('killFeed', v)} />
                <Toggle label="Impact Feedback" desc="Hit flashes, bullet shatter & impact sparks" icon={Flame} value={settings.impactFeedback} onChange={(v) => updateSetting('impactFeedback', v)} />
                <Toggle label="Ragdoll Physics" desc="Enemies fly & tumble on death" icon={Bone} value={settings.ragdollPhysics} onChange={(v) => updateSetting('ragdollPhysics', v)} />
                <Toggle label="Auto Reload" desc="Reload automatically on empty mag" icon={RotateCcw} value={settings.autoReload} onChange={(v) => updateSetting('autoReload', v)} />
                <Toggle label="Camera Bob" desc="Head-bob while moving" icon={Wind} value={settings.cameraBob} onChange={(v) => updateSetting('cameraBob', v)} />
                <Toggle label="Show Crosshair" desc="Display the aiming reticle" icon={Target} value={settings.showCrosshair} onChange={(v) => updateSetting('showCrosshair', v)} />
                {isTouch && (
                  <Toggle label="Haptics" desc="Vibration on fire, hits & damage" icon={Hand} value={settings.haptics} onChange={(v) => updateSetting('haptics', v)} />
                )}
              </div>
              <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition-opacity ${settings.showCrosshair ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Crosshair className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
                    <span className="font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">Crosshair Style</span>
                  </div>
                  {!settings.showCrosshair && (
                    <span className="font-hud text-[9px] font-semibold uppercase tracking-wider text-gray-500">Crosshair hidden</span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['dot', 'cross', 'circle', 'dynamic'] as const).map((style) => {
                    const active = settings.crosshairStyle === style;
                    return (
                      <button
                        key={style}
                        disabled={!settings.showCrosshair}
                        onClick={() => updateSetting('crosshairStyle', style)}
                        className={`py-2.5 rounded-lg text-xs font-semibold capitalize transition-all border disabled:cursor-not-allowed ${
                          active ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-gray-400 enabled:hover:bg-white/[0.06]'
                        }`}
                      >
                        {style}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div className="space-y-3" style={{ animation: 'smFade 0.2s ease-out' }}>
              {/* ── GRAPHICS PRESETS ── */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
                    <span className="font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">Graphics Quality</span>
                  </div>
                  {graphics.preset === 'custom' && (
                    <span className="font-hud text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5">
                      Custom mix
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {PRESET_META.map(({ id, label, desc }) => {
                    const active = graphics.preset === id;
                    return (
                      <button
                        key={id}
                        onClick={() => selectPreset(id)}
                        className={`relative py-3 rounded-lg border transition-all ${
                          active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className={`text-sm font-bold uppercase ${active ? 'text-emerald-300' : 'text-gray-300'}`}>{label}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{desc}</div>
                        {active && (
                          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-emerald-400">
                            <Check className="w-3 h-3 text-[#04130a]" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11px] text-gray-500">
                  Pick a preset or fine-tune any control below to build a <span className="text-amber-300/90 font-semibold">Custom</span> mix.
                  Graphics changes apply when you start your next match.
                </p>
              </div>

              {/* ── ADVANCED GRAPHICS (drives Custom) ── */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
                  <span className="font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">Advanced</span>
                </div>

                <Slider
                  label="Resolution Scale" icon={Maximize}
                  value={Math.round(graphics.resolution * 100)}
                  min={Math.round(GRAPHICS_LIMITS.resolution.min * 100)}
                  max={Math.round(GRAPHICS_LIMITS.resolution.max * 100)}
                  step={5} suffix="%"
                  onChange={(v) => editGraphics({ resolution: v / 100 })}
                />

                <Segmented
                  label="Shadows" icon={Moon}
                  value={graphics.shadows}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Med' },
                    { value: 'high', label: 'High' },
                    { value: 'ultra', label: 'Ultra' },
                  ]}
                  onChange={(v) => editGraphics({ shadows: v })}
                />

                <Slider
                  label="Particle Density" icon={Sparkles}
                  value={Math.round(graphics.particleDensity * 100)}
                  min={Math.round(GRAPHICS_LIMITS.particleDensity.min * 100)}
                  max={Math.round(GRAPHICS_LIMITS.particleDensity.max * 100)}
                  step={5} suffix="%"
                  onChange={(v) => editGraphics({ particleDensity: v / 100 })}
                />

                <Slider
                  label="Render Distance" icon={Eye}
                  value={graphics.viewDistance}
                  min={GRAPHICS_LIMITS.viewDistance.min}
                  max={GRAPHICS_LIMITS.viewDistance.max}
                  step={4} suffix="m"
                  onChange={(v) => editGraphics({ viewDistance: v })}
                />

                <Slider
                  label="Terrain Detail" icon={Trees}
                  value={Math.round(graphics.terrainDetail * 100)}
                  min={Math.round(GRAPHICS_LIMITS.terrainDetail.min * 100)}
                  max={Math.round(GRAPHICS_LIMITS.terrainDetail.max * 100)}
                  step={5} suffix="%"
                  onChange={(v) => editGraphics({ terrainDetail: v / 100 })}
                />

                <Slider
                  label="Max Enemies" icon={Users}
                  value={graphics.maxEnemies}
                  min={GRAPHICS_LIMITS.maxEnemies.min}
                  max={GRAPHICS_LIMITS.maxEnemies.max}
                  step={1} suffix=""
                  onChange={(v) => editGraphics({ maxEnemies: v })}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <Toggle label="Post-Processing" desc="Bloom, god rays & colour grade" icon={Wand2} value={graphics.postProcessing} onChange={(v) => editGraphics({ postProcessing: v })} />
                  <Toggle label="Anti-Aliasing" desc="Smooth jagged edges (MSAA/SMAA)" icon={Aperture} value={graphics.antialias} onChange={(v) => editGraphics({ antialias: v })} />
                </div>
              </div>

              <Slider label="Field of View" icon={Eye} value={settings.fov} min={60} max={120} suffix="°" onChange={(v) => updateSetting('fov', v)} />
              <Toggle label="Show FPS Counter" desc="Display frames per second" icon={Activity} value={settings.showFPS} onChange={(v) => updateSetting('showFPS', v)} />
              <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition-opacity ${settings.showCrosshair ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Crosshair className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
                    <span className="font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">Crosshair Color</span>
                  </div>
                  {!settings.showCrosshair && (
                    <span className="font-hud text-[9px] font-semibold uppercase tracking-wider text-gray-500">Crosshair hidden</span>
                  )}
                </div>
                <div className="flex gap-2.5">
                  {['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ffffff'].map((color) => (
                    <button
                      key={color}
                      disabled={!settings.showCrosshair}
                      onClick={() => updateSetting('crosshairColor', color)}
                      className={`w-9 h-9 rounded-lg transition-transform enabled:hover:scale-110 disabled:cursor-not-allowed ${
                        settings.crosshairColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#080d0b]' : ''
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Crosshair color ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-t border-white/[0.07]">
          <button
            onClick={() => {
              gameSettingsManager.resetToDefaults();
              setSettings(pickSimple(gameSettingsManager.getSettings()));
              setGraphics(gameSettingsManager.getGraphics());
            }}
            className="font-hud text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-white"
          >
            Reset to defaults
          </button>
          <button
            onClick={onClose}
            className="font-hud rounded-xl px-7 py-2.5 text-sm font-bold uppercase tracking-wider text-[#04130a]
              transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)', boxShadow: '0 12px 30px -12px rgba(46,232,180,0.7)' }}
          >
            Save &amp; Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes smFade {
          from { opacity: 0; transform: scale(0.98) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        input[type="range"].sm-slider { -webkit-appearance: none; appearance: none; }
        input[type="range"].sm-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: #34d399; cursor: pointer; border: 2px solid #080d0b;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.15);
        }
        input[type="range"].sm-slider::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: #34d399; cursor: pointer; border: 2px solid #080d0b;
        }
      `}</style>
    </div>
  );
};

const Slider = ({ label, icon: Icon, value, onChange, min = 0, max = 100, step = 1, suffix = '%' }: {
  label: string; icon: LucideIcon; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
          <span className="font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">{label}</span>
        </div>
        <span className="text-sm font-bold text-emerald-300 tabular-nums">{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sm-slider w-full h-1.5 rounded-full cursor-pointer"
        style={{ background: `linear-gradient(to right, #34d399 0%, #34d399 ${pct}%, rgba(255,255,255,0.1) ${pct}%, rgba(255,255,255,0.1) 100%)` }}
      />
    </div>
  );
};

// Segmented selector (e.g. shadow quality) — a labelled row of mutually
// exclusive pills, styled to match the preset/toggle controls.
function Segmented<T extends string>({ label, icon: Icon, value, options, onChange }: {
  label: string; icon: LucideIcon; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
      <div className="flex items-center gap-2.5 mb-2.5">
        <Icon className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
        <span className="font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">{label}</span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`py-2 rounded-lg text-xs font-semibold transition-all border ${
                active ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.06]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const Toggle = ({ label, desc, icon: Icon, value, onChange }: {
  label: string; desc?: string; icon: LucideIcon; value: boolean; onChange: (v: boolean) => void;
}) => (
  <button
    onClick={() => onChange(!value)}
    className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-all ${
      value ? 'border-emerald-400/30 bg-emerald-500/[0.07]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]'
    }`}
  >
    <div className="flex items-center gap-2.5 min-w-0">
      <Icon className={`w-4 h-4 flex-shrink-0 ${value ? 'text-emerald-400' : 'text-gray-500'}`} strokeWidth={2.25} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-200">{label}</div>
        {desc && <div className="text-[11px] text-gray-500 truncate">{desc}</div>}
      </div>
    </div>
    <span className={`relative w-10 h-5 rounded-full flex-shrink-0 transition-colors ${value ? 'bg-emerald-500' : 'bg-white/15'}`}>
      <span className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white transition-all ${value ? 'right-0.5' : 'left-0.5'}`} />
    </span>
  </button>
);

export default SettingsMenu;
