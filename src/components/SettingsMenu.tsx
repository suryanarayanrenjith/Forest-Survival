import React, { useState, useEffect } from 'react';
import {
  Settings, X, Gamepad2, Volume2, SlidersHorizontal, Monitor, Wind, Zap,
  Crosshair, Target, RotateCcw, Music, MousePointer2, Move, ChevronRight,
  Eye, Activity, Skull, Check, Headphones, Sparkles, Hand, Bone, Flame, Terminal, Navigation,
  Maximize, Moon, Aperture, Wand2, Trees, Users, Gauge, Cpu, type LucideIcon,
} from 'lucide-react';
import { soundManager } from '../utils/SoundManager';
import {
  gameSettingsManager, GRAPHICS_LIMITS, FPS_CAP_OPTIONS,
  type GraphicsQuality, type GraphicsSettings, type UserSettings, type FpsCap,
} from '../utils/GameSettingsManager';
import { detectHardwareTier } from '../utils/hardwareDetect';
import { detectIsTouch } from '../hooks/useDeviceInfo';
import KeyBindingsEditor from './KeyBindingsEditor';
import TouchLayoutEditor from './TouchLayoutEditor';

interface SettingsMenuProps {
  onClose: () => void;
}

// The simple (non-graphics, non-keybinding) settings this panel edits directly.
// Graphics live in their own section (gameSettingsManager.getGraphics()) and the
// rebinder owns keyBindings, so neither is mirrored here — that keeps the
// persisted blob clean and avoids the old "stale key written back" hazard.
type SimpleSettings = Pick<UserSettings,
  | 'masterVolume' | 'sfxVolume' | 'musicVolume' | 'ambienceVolume' | 'sensitivity' | 'fov'
  | 'showFPS' | 'showConsole' | 'fpsCap' | 'screenShake' | 'haptics' | 'hitMarkers' | 'killFeed'
  | 'impactFeedback' | 'ragdollPhysics' | 'autoReload' | 'cameraBob'
  | 'showCrosshair' | 'crosshairStyle' | 'crosshairColor' | 'enemyArrowColor'>;

const SIMPLE_KEYS: (keyof SimpleSettings)[] = [
  'masterVolume', 'sfxVolume', 'musicVolume', 'ambienceVolume', 'sensitivity', 'fov',
  'showFPS', 'showConsole', 'fpsCap', 'screenShake', 'haptics', 'hitMarkers', 'killFeed',
  'impactFeedback', 'ragdollPhysics', 'autoReload', 'cameraBob',
  'showCrosshair', 'crosshairStyle', 'crosshairColor', 'enemyArrowColor',
];

/** Shared swatch palette for the crosshair + enemy-marker colour pickers. */
const COLOR_SWATCHES = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ffffff'];

const FPS_CAP_LABEL = (c: FpsCap) => (c === 0 ? 'Unlimited' : String(c));

const pickSimple = (s: UserSettings): SimpleSettings => {
  const out = {} as SimpleSettings;
  for (const k of SIMPLE_KEYS) (out as Record<string, unknown>)[k] = s[k];
  return out;
};

// Touch is a fixed device capability — resolved once so the shared control
// primitives below (Slider / Toggle / Segmented), which live outside the
// component, can render a denser layout on phones without prop-drilling.
const IS_TOUCH = detectIsTouch();

// Shared density tokens — every settings card/label/pill reads from these so
// the touch build is uniformly compact and the desktop build is unchanged.
const CARD_PAD = IS_TOUCH ? 'p-2.5' : 'p-4';
const CARD_HEAD_GAP = IS_TOUCH ? 'mb-2' : 'mb-3';
const LABEL_CLS = IS_TOUCH
  ? 'font-hud text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-300'
  : 'font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300';
const ICON_CLS = IS_TOUCH ? 'h-3.5 w-3.5 text-gray-400' : 'w-4 h-4 text-gray-400';
/** Small selectable pill (crosshair style, FPS cap, presets). */
const PILL_CLS = IS_TOUCH ? 'm-tap py-1.5 text-[11px]' : 'py-2.5 text-xs';
/** Colour swatch — opts out of the global 44px minimum on touch. */
const SWATCH_CLS = IS_TOUCH ? 'm-tap h-8 w-8' : 'w-9 h-9';

/** Compact gesture cheat-sheet shown on the touch Controls tab. */
const TOUCH_GESTURES: { key: string; action: string; icon: LucideIcon }[] = [
  { key: 'L-stick', action: 'Move', icon: Gamepad2 },
  { key: 'Swipe', action: 'Look around', icon: Hand },
  { key: 'Push', action: 'Sprint', icon: Wind },
  { key: 'FIRE', action: 'Auto-aim & shoot', icon: Crosshair },
];

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
  // Last hardware auto-detect result (shown under the Auto-Detect button).
  const [detectSummary, setDetectSummary] = useState<string | null>(null);

  useEffect(() => {
    // Persist the simple fields. Graphics + keyBindings are written via their own
    // manager calls, so they're never part of this patch.
    gameSettingsManager.updateSettings(settings);
    soundManager.setVolume((settings.masterVolume / 100) * (settings.sfxVolume / 100));
  }, [settings]);

  const updateSetting = <K extends keyof SimpleSettings>(key: K, value: SimpleSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Toggle one of the two mutually-exclusive HUD readouts (`showFPS` /
   * `showConsole`). Switching one ON force-clears the other in the SAME state
   * update, so the pair is never both-true even for a single render — the
   * manager applies the same rule on write, and this keeps the UI agreeing with
   * it instead of relying on a second pass to correct itself.
   */
  const setReadout = (key: 'showFPS' | 'showConsole', value: boolean) => {
    const other = key === 'showFPS' ? 'showConsole' : 'showFPS';
    setSettings((prev) => ({ ...prev, [key]: value, ...(value ? { [other]: false } : {}) }));
  };

  /**
   * Which HUD readout is live. Both toggles derive their on-state AND their
   * locked-state from this ONE value, which is what makes the pair
   * deadlock-proof: reading the two flags independently, a hypothetical
   * both-true state would render both toggles off AND both disabled, trapping
   * the player with no way back. Resolving to a single winner first — console
   * ahead of counter, matching the manager's tie-break — means there is always
   * exactly one enabled control.
   */
  const activeReadout: 'fps' | 'console' | 'none' =
    settings.showConsole ? 'console' : settings.showFPS ? 'fps' : 'none';

  // ── Graphics editing ───────────────────────────────────────────────────────
  const selectPreset = (name: GraphicsQuality) => {
    gameSettingsManager.setGraphicsPreset(name);
    setGraphics(gameSettingsManager.getGraphics());
  };
  const editGraphics = (patch: Partial<Omit<GraphicsSettings, 'preset' | 'baseTier'>>) => {
    gameSettingsManager.updateGraphics(patch);
    setGraphics(gameSettingsManager.getGraphics());
  };
  // "Custom" tile: fork the current resolved settings into an editable mix.
  const enterCustom = () => {
    if (graphics.preset === 'custom') return;
    gameSettingsManager.updateGraphics({}); // empty patch flips preset → custom
    setGraphics(gameSettingsManager.getGraphics());
  };
  // Probe the device and apply the recommended preset.
  const autoDetect = () => {
    const report = detectHardwareTier();
    gameSettingsManager.setGraphicsPreset(report.tier);
    setGraphics(gameSettingsManager.getGraphics());
    setDetectSummary(report.summary);
  };

  // Touch devices remap every action to the on-screen controls, so the Controls
  // tab swaps to the drag-to-arrange HUD editor instead of key bindings.
  const isTouch = IS_TOUCH;
  // The HUD arranger lives in its OWN full-screen modal on touch: it needs a
  // no-scroll drag surface, which would otherwise swallow the settings sheet's
  // scroll gestures and make the rest of the panel unreachable on a short
  // landscape phone.
  const [layoutOpen, setLayoutOpen] = useState(false);

  const tabs: { id: 'controls' | 'audio' | 'gameplay' | 'display'; label: string; icon: LucideIcon }[] = [
    { id: 'controls', label: 'Controls', icon: Gamepad2 },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'gameplay', label: 'Gameplay', icon: SlidersHorizontal },
    { id: 'display', label: 'Display', icon: Monitor },
  ];

  return (
    <div
      className={isTouch
        ? 'm-safe fixed inset-0 z-50 flex flex-col menu-overlay-in'
        : 'fixed inset-0 z-50 flex items-center justify-center p-4 menu-overlay-in'}
      style={{ background: 'rgba(5,8,10,0.92)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className={isTouch
          ? 'm-sheet-in flex h-full w-full flex-col overflow-hidden border-t border-emerald-400/15 bg-[#080d0b]'
          : 'hud-frame w-full max-w-3xl flex flex-col rounded-2xl border border-emerald-400/15 bg-[#080d0b] shadow-[0_40px_100px_rgba(0,0,0,0.6)]'}
        style={isTouch ? undefined : { maxHeight: '94dvh', animation: 'smFade 0.3s cubic-bezier(0.16,1,0.3,1)' }}
      >
        {/* Header — a single compact row on touch (the eyebrow + tall glyph
            ate scarce vertical space on a landscape phone). */}
        <div className={`flex flex-none items-center justify-between border-b border-white/[0.07] ${isTouch ? 'gap-2 px-3 py-1.5' : 'px-5 sm:px-6 py-4'}`}>
          <div className={`flex items-center ${isTouch ? 'gap-2' : 'gap-3'}`}>
            <div className={`relative flex items-center justify-center rounded-lg bg-emerald-500/12 border border-emerald-400/30 ${isTouch ? 'h-7 w-7' : 'w-10 h-10 rounded-xl'}`}>
              <Settings className={isTouch ? 'h-4 w-4 text-emerald-300' : 'w-5 h-5 text-emerald-300'} strokeWidth={2} />
            </div>
            <div>
              {!isTouch && (
                <p className="font-hud text-[10px] tracking-[0.36em] text-emerald-300/90 font-semibold uppercase">Configuration</p>
              )}
              <h2 className={`font-display font-semibold uppercase tracking-wide text-white ${isTouch ? 'text-sm leading-none' : 'text-lg'}`}>Settings</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`flex flex-none items-center justify-center rounded-lg border border-white/10 text-gray-400
              transition-colors hover:text-white hover:bg-white/[0.06] ${isTouch ? 'm-tap h-8 w-8' : 'w-9 h-9'}`}
            aria-label="Close settings"
          >
            <X className={isTouch ? 'h-4 w-4' : 'w-[18px] h-[18px]'} strokeWidth={2.25} />
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex flex-none gap-1 border-b border-white/[0.07] ${isTouch ? 'p-1' : 'p-2'}`}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`font-hud flex-1 flex items-center justify-center gap-1.5 rounded-lg font-semibold uppercase tracking-wider transition-all duration-200 ${
                  isTouch ? 'm-tap py-1.5 text-[10px]' : 'gap-2 py-2.5 text-xs'
                } ${
                  active ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/40' : 'text-gray-400 border border-transparent hover:text-gray-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className={isTouch ? 'h-3.5 w-3.5' : 'w-4 h-4'} strokeWidth={2.25} />
                <span className={isTouch ? 'inline' : 'hidden sm:inline'}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className={`m-scroll overflow-y-auto flex-1 min-h-0 ${isTouch ? 'p-3' : 'p-5'}`}>
          {activeTab === 'controls' && (
            isTouch ? (
              <div className="space-y-2" style={{ animation: 'smFade 0.2s ease-out' }}>
                {/* Opens the arranger in its own full-screen modal — it owns a
                    drag surface that can't share scrolling with this sheet. */}
                <button
                  onClick={() => setLayoutOpen(true)}
                  className="flex w-full items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] px-3 py-2.5 text-left transition-colors active:bg-emerald-500/[0.16]"
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/15">
                    <Move className="h-4 w-4 text-emerald-300" strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-white">Button Layout</span>
                    <span className="block text-[11px] leading-tight text-gray-400">Drag your on-screen controls anywhere</span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-emerald-300/70" strokeWidth={2.5} />
                </button>

                {/* Quick gesture reference — two compact columns. */}
                <div className="grid grid-cols-2 gap-1.5">
                  {TOUCH_GESTURES.map((g) => {
                    const Icon = g.icon;
                    return (
                      <div key={g.action} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5">
                        <Icon className="h-3.5 w-3.5 flex-none text-gray-500" strokeWidth={2} />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-gray-300">{g.action}</span>
                        <kbd className="flex-none rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-gray-400">{g.key}</kbd>
                      </div>
                    );
                  })}
                </div>
                <Toggle label="Haptics" desc="Vibration on fire, hits & damage" icon={Hand} value={settings.haptics} onChange={(v) => updateSetting('haptics', v)} />
              </div>
            ) : (
              <div style={{ animation: 'smFade 0.2s ease-out' }}>
                <KeyBindingsEditor accent="#34d399" />
              </div>
            )
          )}

          {activeTab === 'audio' && (
            <div className={IS_TOUCH ? 'space-y-2' : 'space-y-3'} style={{ animation: 'smFade 0.2s ease-out' }}>
              {/* Two columns on touch: a landscape phone is wide but short, so
                  side-by-side sliders keep everything above the fold. */}
              <div className={IS_TOUCH ? 'grid grid-cols-2 gap-2' : 'space-y-3'}>
                <Slider label="Master Volume" icon={Volume2} value={settings.masterVolume} onChange={(v) => updateSetting('masterVolume', v)} />
                <Slider label="Sound Effects" icon={Zap} value={settings.sfxVolume} onChange={(v) => updateSetting('sfxVolume', v)} />
                <Slider label="Menu Music" icon={Music} value={settings.musicVolume} onChange={(v) => updateSetting('musicVolume', v)} />
                {/* In-game procedural ambient score (per-map survival music) —
                    independent of the menu music so either can be tuned alone.
                    Changes apply live mid-run via the manager subscription. */}
                <Slider label="Ambience Music" icon={Trees} value={settings.ambienceVolume} onChange={(v) => updateSetting('ambienceVolume', v)} />
              </div>

              <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${IS_TOUCH ? 'p-2.5' : 'p-4'}`}>
                <div className={`flex items-center gap-2 ${IS_TOUCH ? 'mb-2' : 'mb-3'}`}>
                  <Headphones className={IS_TOUCH ? 'h-3.5 w-3.5 text-gray-400' : 'w-4 h-4 text-gray-400'} strokeWidth={2.25} />
                  <span className={`font-hud font-semibold uppercase tracking-[0.16em] text-gray-300 ${IS_TOUCH ? 'text-[10px]' : 'text-[11px] tracking-[0.18em]'}`}>Sound Test</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { name: 'Gunshot', sound: 'shoot' },
                    { name: 'Reload', sound: 'reload' },
                    { name: 'Hit', sound: 'enemyHit' },
                    { name: 'Hurt', sound: 'playerHurt' },
                  ].map((item) => (
                    <button
                      key={item.sound}
                      onClick={() => soundManager.play(item.sound as 'shoot' | 'reload' | 'enemyHit' | 'playerHurt')}
                      className={`rounded-lg border border-white/10 bg-white/[0.03] font-semibold text-gray-300
                        transition-colors hover:bg-white/[0.07] hover:text-white ${IS_TOUCH ? 'm-tap py-1.5 text-[11px]' : 'py-2.5 text-sm'}`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gameplay' && (
            <div className={IS_TOUCH ? 'space-y-2' : 'space-y-3'} style={{ animation: 'smFade 0.2s ease-out' }}>
              <Slider label={IS_TOUCH ? 'Look Sensitivity' : 'Mouse Sensitivity'} icon={MousePointer2} value={settings.sensitivity} min={10} max={100} onChange={(v) => updateSetting('sensitivity', v)} />
              <div className={`grid gap-2 ${IS_TOUCH ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                <Toggle label="Screen Shake" desc="Camera shake on impacts" icon={Activity} value={settings.screenShake} onChange={(v) => updateSetting('screenShake', v)} />
                <Toggle label="Hit Markers" desc="Feedback when you land hits" icon={Crosshair} value={settings.hitMarkers} onChange={(v) => updateSetting('hitMarkers', v)} />
                <Toggle label="Kill Feed" desc="Elimination notifications" icon={Skull} value={settings.killFeed} onChange={(v) => updateSetting('killFeed', v)} />
                <Toggle label="Impact Feedback" desc="Hit flashes, bullet shatter & impact sparks" icon={Flame} value={settings.impactFeedback} onChange={(v) => updateSetting('impactFeedback', v)} />
                <Toggle label="Ragdoll Physics" desc="Enemies fly & tumble on death" icon={Bone} value={settings.ragdollPhysics} onChange={(v) => updateSetting('ragdollPhysics', v)} />
                <Toggle label="Auto Reload" desc="Reload automatically on empty mag" icon={RotateCcw} value={settings.autoReload} onChange={(v) => updateSetting('autoReload', v)} />
                <Toggle label="Camera Bob" desc="Head-bob while moving" icon={Wind} value={settings.cameraBob} onChange={(v) => updateSetting('cameraBob', v)} />
                <Toggle label="Show Crosshair" desc="Display the aiming reticle" icon={Target} value={settings.showCrosshair} onChange={(v) => updateSetting('showCrosshair', v)} />
                {/* Haptics lives on the touch Controls tab (desktop has none). */}
              </div>
              <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${CARD_PAD} transition-opacity ${settings.showCrosshair ? '' : 'opacity-50'}`}>
                <div className={`flex items-center justify-between gap-2 ${CARD_HEAD_GAP}`}>
                  <div className="flex items-center gap-2">
                    <Crosshair className={ICON_CLS} strokeWidth={2.25} />
                    <span className={LABEL_CLS}>Crosshair Style</span>
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
                        className={`rounded-lg font-semibold capitalize transition-all border disabled:cursor-not-allowed ${PILL_CLS} ${
                          active ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-gray-400 enabled:hover:bg-white/[0.06]'
                        }`}
                      >
                        {style}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Crosshair colour (relocated from Display so all aiming
                  personalisation lives together in Gameplay). */}
              <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${CARD_PAD} transition-opacity ${settings.showCrosshair ? '' : 'opacity-50'}`}>
                <div className={`flex items-center justify-between gap-2 ${CARD_HEAD_GAP}`}>
                  <div className="flex items-center gap-2">
                    <Crosshair className={ICON_CLS} strokeWidth={2.25} />
                    <span className={LABEL_CLS}>Crosshair Color</span>
                  </div>
                  {!settings.showCrosshair && (
                    <span className="font-hud text-[9px] font-semibold uppercase tracking-wider text-gray-500">Crosshair hidden</span>
                  )}
                </div>
                <div className="flex gap-2.5">
                  {COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      disabled={!settings.showCrosshair}
                      onClick={() => updateSetting('crosshairColor', color)}
                      className={`rounded-lg transition-transform enabled:hover:scale-110 disabled:cursor-not-allowed ${SWATCH_CLS} ${
                        settings.crosshairColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#080d0b]' : ''
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Crosshair color ${color}`}
                    />
                  ))}
                </div>
              </div>

              {/* Enemy GPS marker colour — the hunt arrows that point at the
                  last 1–2 enemies of a wave. */}
              <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${CARD_PAD}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Navigation className={ICON_CLS} strokeWidth={2.25} />
                  <span className={LABEL_CLS}>Enemy Marker Color</span>
                </div>
                {!IS_TOUCH && <p className="mb-3 text-[10px] text-gray-600">GPS arrows guide you to the last 1–2 enemies of a wave.</p>}
                <div className={`flex gap-2.5 ${IS_TOUCH ? 'mt-2' : ''}`}>
                  {COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateSetting('enemyArrowColor', color)}
                      className={`rounded-lg transition-transform hover:scale-110 ${SWATCH_CLS} ${
                        settings.enemyArrowColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#080d0b]' : ''
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Enemy marker color ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div className="space-y-3" style={{ animation: 'smFade 0.2s ease-out' }}>
              {/* ── GRAPHICS PRESETS ── */}
              <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${CARD_PAD}`}>
                <div className={`flex items-center justify-between gap-2 ${CARD_HEAD_GAP}`}>
                  <div className="flex items-center gap-2">
                    <Monitor className={ICON_CLS} strokeWidth={2.25} />
                    <span className={LABEL_CLS}>Graphics Quality</span>
                  </div>
                  <span className={`font-hud text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border transition-colors ${
                    graphics.preset === 'custom'
                      ? 'text-amber-300 bg-amber-400/10 border-amber-400/40'
                      : 'text-gray-500 bg-white/[0.02] border-white/10'
                  }`}>
                    {graphics.preset === 'custom' ? '● Custom enabled' : 'Preset'}
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {PRESET_META.map(({ id, label, desc }) => {
                    const active = graphics.preset === id;
                    return (
                      <button
                        key={id}
                        onClick={() => selectPreset(id)}
                        className={`relative rounded-lg border transition-all ${IS_TOUCH ? 'm-tap py-1.5' : 'py-3'} ${
                          active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className={`font-bold uppercase ${IS_TOUCH ? 'text-[11px]' : 'text-sm'} ${active ? 'text-emerald-300' : 'text-gray-300'}`}>{label}</div>
                        {!IS_TOUCH && <div className="text-[10px] text-gray-500 mt-0.5">{desc}</div>}
                        {active && (
                          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-emerald-400">
                            <Check className="w-3 h-3 text-[#04130a]" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {/* CUSTOM tile — lights up amber when a hand-tuned mix is active.
                      Clicking it forks the current settings into an editable mix. */}
                  {(() => {
                    const active = graphics.preset === 'custom';
                    return (
                      <button
                        onClick={enterCustom}
                        className={`relative rounded-lg border transition-all ${IS_TOUCH ? 'm-tap py-1.5' : 'py-3'} ${
                          active ? 'border-amber-400/60 bg-amber-400/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className={`font-bold uppercase ${IS_TOUCH ? 'text-[11px]' : 'text-sm'} ${active ? 'text-amber-300' : 'text-gray-300'}`}>Custom</div>
                        {!IS_TOUCH && <div className="text-[10px] text-gray-500 mt-0.5">Your mix</div>}
                        {active && (
                          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-amber-400">
                            <Check className="w-3 h-3 text-[#1a1204]" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })()}
                </div>
                {/* Auto-detect — probe CPU/RAM/GPU and apply the matching preset. */}
                <button
                  onClick={autoDetect}
                  className={`w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/[0.08]
                    text-emerald-300 transition-colors hover:bg-emerald-500/15 ${IS_TOUCH ? 'm-tap mt-2 py-1.5' : 'mt-3 py-2.5'}`}
                >
                  <Cpu className={IS_TOUCH ? 'h-3.5 w-3.5' : 'w-4 h-4'} strokeWidth={2.25} />
                  <span className={`font-hud font-bold uppercase tracking-wider ${IS_TOUCH ? 'text-[10px]' : 'text-[11px]'}`}>Auto-Detect Best Preset</span>
                </button>
                {detectSummary
                  ? <p className={`text-emerald-300/80 ${IS_TOUCH ? 'mt-1.5 text-[10px]' : 'mt-2 text-[11px]'}`}>{detectSummary}</p>
                  : !IS_TOUCH && (
                    <p className="mt-3 text-[11px] text-gray-500">
                      Pick a preset, hit Auto-Detect, or fine-tune any control below for a <span className="text-amber-300/90 font-semibold">Custom</span> mix.
                      Graphics changes apply on your next match.
                    </p>
                  )}
              </div>

              {/* ── ADVANCED GRAPHICS (drives Custom) ── */}
              <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${CARD_PAD} ${IS_TOUCH ? 'space-y-2' : 'space-y-3'}`}>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className={ICON_CLS} strokeWidth={2.25} />
                  <span className={LABEL_CLS}>Advanced</span>
                </div>

                {/* Side-by-side on touch so the whole block fits a short screen. */}
                <div className={IS_TOUCH ? 'grid grid-cols-2 gap-2' : 'space-y-3'}>
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
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Toggle label="Post-Processing" desc="Bloom, god rays & colour grade" icon={Wand2} value={graphics.postProcessing} onChange={(v) => editGraphics({ postProcessing: v })} />
                  <Toggle label="Anti-Aliasing" desc="Smooth jagged edges (MSAA/SMAA)" icon={Aperture} value={graphics.antialias} onChange={(v) => editGraphics({ antialias: v })} />
                </div>
              </div>

              {/* ── FRAME RATE CAP ── */}
              <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${IS_TOUCH ? 'px-3 py-2' : 'px-4 py-3.5'}`}>
                <div className={`flex items-center justify-between gap-2 ${IS_TOUCH ? 'mb-1.5' : 'mb-2.5'}`}>
                  <div className={`flex items-center ${IS_TOUCH ? 'gap-2' : 'gap-2.5'}`}>
                    <Gauge className={ICON_CLS} strokeWidth={2.25} />
                    <span className={LABEL_CLS}>Frame Rate Cap</span>
                  </div>
                  <span className="text-[11px] text-gray-500">{settings.fpsCap === 0 ? 'V-Sync' : `${settings.fpsCap} FPS`}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {FPS_CAP_OPTIONS.map((cap) => {
                    const active = settings.fpsCap === cap;
                    return (
                      <button
                        key={cap}
                        onClick={() => updateSetting('fpsCap', cap)}
                        className={`rounded-lg font-semibold transition-all border ${IS_TOUCH ? 'm-tap py-1.5 text-[10px]' : 'py-2 text-xs'} ${
                          active ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.06]'
                        }`}
                      >
                        {FPS_CAP_LABEL(cap)}
                      </button>
                    );
                  })}
                </div>
                {!IS_TOUCH && <p className="mt-2 text-[10px] text-gray-600">Unlimited follows your display's refresh rate (V-Sync).</p>}
              </div>

              <div className={IS_TOUCH ? 'grid grid-cols-2 gap-2' : 'space-y-3'}>
                <Slider label="Field of View" icon={Eye} value={settings.fov} min={60} max={120} suffix="°" onChange={(v) => updateSetting('fov', v)} />
                {/* MUTUALLY EXCLUSIVE — the console readout already includes the
                    FPS number, so running both stacks two overlays reporting the
                    same thing. Whichever is on locks the other off. Turning one
                    on also force-clears the other (see setReadout), so the pair
                    can never both be true even if state arrives that way. */}
                <div className="grid grid-cols-2 gap-2">
                  <Toggle
                    label="Show FPS Counter" desc="FPS counter only" icon={Activity}
                    value={activeReadout === 'fps'}
                    disabled={activeReadout === 'console'}
                    disabledHint="Turn off Show Console / Info to use this"
                    onChange={(v) => setReadout('showFPS', v)}
                  />
                  <Toggle
                    label="Show Console / Info" desc="FPS with in-depth detail — renderer, memory & hardware" icon={Terminal}
                    value={activeReadout === 'console'}
                    disabled={activeReadout === 'fps'}
                    disabledHint="Turn off Show FPS Counter to use this"
                    onChange={(v) => setReadout('showConsole', v)}
                  />
                </div>
                {!IS_TOUCH && (
                  <p className="mt-2 text-[10px] text-gray-600">
                    Only one HUD readout can be active — Console / Info already shows the FPS count.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex flex-none items-center justify-between border-t border-white/[0.07] ${isTouch ? 'px-3 py-1.5' : 'px-5 sm:px-6 py-4'}`}>
          <button
            onClick={() => {
              gameSettingsManager.resetToDefaults();
              setSettings(pickSimple(gameSettingsManager.getSettings()));
              setGraphics(gameSettingsManager.getGraphics());
            }}
            className={`font-hud font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-white ${isTouch ? 'm-tap text-[11px]' : 'text-xs'}`}
          >
            Reset{isTouch ? '' : ' to defaults'}
          </button>
          <button
            onClick={onClose}
            className={`font-hud rounded-xl font-bold uppercase tracking-wider text-[#04130a]
              transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 ${isTouch ? 'm-tap px-4 py-1.5 text-xs' : 'px-7 py-2.5 text-sm'}`}
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

      {/* ── HUD ARRANGER — its own full-screen modal (touch only) ──────────
          Kept out of the settings sheet on purpose: the drag surface sets
          `touch-action: none`, so nesting it inside a scrollable panel made
          the rest of Settings unreachable on a short landscape phone. */}
      {isTouch && layoutOpen && (
        <div className="m-safe m-sheet-in fixed inset-0 z-[60] flex flex-col bg-[#05080a]">
          <div className="flex flex-none items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/12">
                <Move className="h-4 w-4 text-emerald-300" strokeWidth={2.25} />
              </span>
              <h2 className="font-display text-sm font-semibold uppercase leading-none tracking-wide text-white">Button Layout</h2>
            </div>
            <button
              onClick={() => setLayoutOpen(false)}
              aria-label="Close button layout"
              className="m-tap flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-white/10 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
          <div className="m-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
            <TouchLayoutEditor />
          </div>
        </div>
      )}
    </div>
  );
};

const Slider = ({ label, icon: Icon, value, onChange, min = 0, max = 100, step = 1, suffix = '%' }: {
  label: string; icon: LucideIcon; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${IS_TOUCH ? 'px-3 py-2' : 'px-4 py-3.5'}`}>
      <div className={`flex items-center justify-between ${IS_TOUCH ? 'mb-1.5' : 'mb-2.5'}`}>
        <div className={`flex items-center ${IS_TOUCH ? 'gap-2' : 'gap-2.5'}`}>
          <Icon className={IS_TOUCH ? 'h-3.5 w-3.5 text-gray-400' : 'w-4 h-4 text-gray-400'} strokeWidth={2.25} />
          <span className={`font-hud font-semibold uppercase tracking-[0.16em] text-gray-300 ${IS_TOUCH ? 'text-[10px]' : 'text-[11px] tracking-[0.18em]'}`}>{label}</span>
        </div>
        <span className={`font-bold text-emerald-300 tabular-nums ${IS_TOUCH ? 'text-xs' : 'text-sm'}`}>{value}{suffix}</span>
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
    <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${IS_TOUCH ? 'px-3 py-2' : 'px-4 py-3.5'}`}>
      <div className={`flex items-center ${IS_TOUCH ? 'gap-2 mb-1.5' : 'gap-2.5 mb-2.5'}`}>
        <Icon className={IS_TOUCH ? 'h-3.5 w-3.5 text-gray-400' : 'w-4 h-4 text-gray-400'} strokeWidth={2.25} />
        <span className={`font-hud font-semibold uppercase tracking-[0.16em] text-gray-300 ${IS_TOUCH ? 'text-[10px]' : 'text-[11px] tracking-[0.18em]'}`}>{label}</span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`rounded-lg font-semibold transition-all border ${IS_TOUCH ? 'm-tap py-1.5 text-[11px]' : 'py-2 text-xs'} ${
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

const Toggle = ({ label, desc, icon: Icon, value, onChange, disabled = false, disabledHint }: {
  label: string; desc?: string; icon: LucideIcon; value: boolean; onChange: (v: boolean) => void;
  /** Locked out by another setting — renders dimmed and refuses interaction. */
  disabled?: boolean;
  /** Why it's locked. Surfaces as the description line + native tooltip. */
  disabledHint?: string;
}) => (
  <button
    type="button"
    disabled={disabled}
    aria-disabled={disabled}
    title={disabled ? disabledHint : undefined}
    onClick={() => { if (!disabled) onChange(!value); }}
    // Touch drops the description line — on a landscape phone that second line
    // is what pushes a list of toggles past the fold; the label carries it.
    className={`flex items-center justify-between rounded-xl border text-left transition-all ${
      IS_TOUCH ? 'm-tap gap-2 px-2.5 py-1.5' : 'px-3.5 py-3'
    } ${disabled
      ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.01] opacity-45'
      : value ? 'border-emerald-400/30 bg-emerald-500/[0.07]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]'}`}
  >
    <div className={`flex items-center min-w-0 ${IS_TOUCH ? 'gap-2' : 'gap-2.5'}`}>
      <Icon className={`flex-shrink-0 ${IS_TOUCH ? 'h-3.5 w-3.5' : 'w-4 h-4'} ${value && !disabled ? 'text-emerald-400' : 'text-gray-500'}`} strokeWidth={2.25} />
      <div className="min-w-0">
        <div className={`font-semibold ${disabled ? 'text-gray-400' : 'text-gray-200'} ${IS_TOUCH ? 'text-[12px] leading-tight' : 'text-sm'}`}>{label}</div>
        {/* When locked, the reason replaces the normal blurb — a greyed-out
            toggle with no explanation reads as a bug. */}
        {(disabled ? disabledHint : desc) && !IS_TOUCH && (
          <div className={`text-[11px] truncate ${disabled ? 'text-amber-400/70' : 'text-gray-500'}`}>
            {disabled ? disabledHint : desc}
          </div>
        )}
      </div>
    </div>
    <span className={`relative rounded-full flex-shrink-0 transition-colors ${IS_TOUCH ? 'h-[18px] w-8' : 'w-10 h-5'} ${value && !disabled ? 'bg-emerald-500' : 'bg-white/15'}`}>
      <span className={`absolute top-0.5 rounded-full bg-white transition-all ${IS_TOUCH ? 'h-[14px] w-[14px]' : 'w-[18px] h-[18px]'} ${value && !disabled ? 'right-0.5' : 'left-0.5'}`} />
    </span>
  </button>
);

export default SettingsMenu;
