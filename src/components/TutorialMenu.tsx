import { useState } from 'react';
import {
  ArrowLeft, GraduationCap, Play, ChevronDown, CloudSun, Sun, Moon,
  Trees, Flame, Snowflake, Mountain, Droplet, Shield, Leaf, Landmark, type LucideIcon,
} from 'lucide-react';
import CharacterSelect from './CharacterSelect';
import { MAP_CONFIGS, type MapType } from '../utils/MapSystem';
import type { ClassId } from '../utils/CharacterModels';

interface TutorialMenuProps {
  onStartTutorial: (map: MapType, timeOfDay: 'day' | 'night' | 'auto') => void;
  onBack: () => void;
  selectedCharacter: ClassId;
  onSelectCharacter: (id: ClassId) => void;
  t?: (key: string) => string;
}

const MAP_ICONS: Record<MapType, LucideIcon> = {
  deep_forest: Trees,
  scorched_wasteland: Flame,
  frozen_tundra: Snowflake,
  desert_canyon: Mountain,
  toxic_swamp: Droplet,
  military_outpost: Shield,
  autumn_grove: Leaf,
  ancient_ruins: Landmark,
};

const ATMOSPHERES: { key: 'auto' | 'day' | 'night'; icon: LucideIcon; label: string; desc: string; color: string }[] = [
  { key: 'auto',  icon: CloudSun, label: 'Auto',  desc: 'Day-night cycle', color: '#a78bfa' },
  { key: 'day',   icon: Sun,      label: 'Day',   desc: 'Bright',          color: '#fbbf24' },
  { key: 'night', icon: Moon,     label: 'Night', desc: 'Dark',            color: '#818cf8' },
];

const TutorialMenu = ({ onStartTutorial, onBack, selectedCharacter, onSelectCharacter }: TutorialMenuProps) => {
  const [selectedMap, setSelectedMap] = useState<MapType>('deep_forest');
  // Default 'auto' so new players see the full day-night transition the
  // game shows in real gameplay.
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<'day' | 'night' | 'auto'>('auto');
  const [showMapSelector, setShowMapSelector] = useState(false);

  const SelectedMapIcon = MAP_ICONS[selectedMap];

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* Backdrop chrome (dark gradients + themed tint) is rendered at App
          level OUTSIDE the menu transition so it stays static while this
          screen slides. Only the content below animates. */}

      {/* Back */}
      <button
        onClick={onBack}
        className="group fixed top-5 left-5 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5
          border border-white/10 bg-black/50 backdrop-blur-md font-hud text-sm font-semibold uppercase tracking-wider text-gray-300
          transition-all duration-200 hover:text-white hover:bg-black/70 hover:border-white/20"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" strokeWidth={2.25} />
        Back
      </button>

      {/* Scrollable content */}
      <div className="relative z-20 h-dvh overflow-y-auto">
        <div className="flex flex-col items-center px-4 pt-20 pb-36 max-w-2xl mx-auto">
          {/* Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-amber-400/30 bg-amber-500/10 mb-4">
              <GraduationCap className="w-7 h-7 text-amber-400" strokeWidth={1.75} />
            </div>
            <p className="font-hud text-[10px] tracking-[0.4em] text-amber-300/90 font-semibold uppercase mb-2">Tutorial</p>
            <h1
              className="font-display text-4xl sm:text-5xl font-semibold uppercase tracking-wide"
              style={{
                background: 'linear-gradient(180deg, #fef3c7 0%, #fcd34d 60%, #f59e0b 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 4px 20px rgba(245,158,11,0.35))',
              }}
            >
              CHOOSE YOUR MAP
            </h1>
            <p className="mt-3 text-sm text-gray-400">
              Pick a battlefield to learn the core mechanics. All weapons and abilities are unlocked, and you can't be hurt.
            </p>
          </div>

          <div className="w-full space-y-4 menu-stagger">
            {/* Character — pick who you'll learn the ropes as */}
            <Section title="Character">
              <CharacterSelect selected={selectedCharacter} onSelect={onSelectCharacter} accent="#fbbf24" />
            </Section>

            {/* Atmosphere — Auto/Day/Night (Auto by default) */}
            <Section title="Atmosphere">
              <div className="grid grid-cols-3 gap-2">
                {ATMOSPHERES.map((a) => {
                  const Icon = a.icon;
                  const active = selectedTimeOfDay === a.key;
                  return (
                    <button
                      key={a.key}
                      onClick={() => setSelectedTimeOfDay(a.key)}
                      className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all duration-200 hover:-translate-y-0.5"
                      style={{
                        borderColor: active ? `${a.color}99` : 'rgba(255,255,255,0.08)',
                        background: active ? `${a.color}1f` : 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <Icon className="w-5 h-5 mb-1.5" style={{ color: active ? a.color : '#9ca3af' }} strokeWidth={2} />
                      <span className={`font-hud text-xs font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{a.label}</span>
                      <span className="text-[10px] text-gray-500">{a.desc}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* Map — collapsible grid */}
            <Section title="Map">
              <button
                onClick={() => setShowMapSelector(!showMapSelector)}
                className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 border border-white/10 bg-white/[0.03]
                  transition-colors hover:bg-white/[0.06]"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/12 flex-shrink-0">
                  <SelectedMapIcon className="w-5 h-5 text-amber-400" strokeWidth={1.75} />
                </span>
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-sm font-bold text-white truncate">{MAP_CONFIGS[selectedMap].name}</span>
                  <span className="block text-[11px] text-gray-500 truncate">{MAP_CONFIGS[selectedMap].description}</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${showMapSelector ? 'rotate-180' : ''}`} strokeWidth={2.25} />
              </button>
              {showMapSelector && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 menu-pop-grid">
                  {Object.values(MAP_CONFIGS).map((map) => {
                    const Icon = MAP_ICONS[map.id];
                    const active = selectedMap === map.id;
                    return (
                      <button
                        key={map.id}
                        onClick={() => { setSelectedMap(map.id); setShowMapSelector(false); }}
                        className="group flex flex-col items-center justify-center py-3 px-2 rounded-xl border
                          transition-all duration-200 hover:-translate-y-0.5"
                        title={map.description}
                        style={{
                          borderColor: active ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.08)',
                          background: active ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.03)',
                        }}
                      >
                        <Icon className="w-5 h-5 mb-1.5" style={{ color: active ? '#fbbf24' : '#9ca3af' }} strokeWidth={1.75} />
                        <span className={`text-[10px] font-bold leading-tight text-center ${active ? 'text-white' : 'text-gray-400'}`}>
                          {map.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>

          <p className="font-hud mt-6 text-[10px] tracking-[0.3em] text-gray-600 uppercase">
            Tutorial Mode · Invincible · All weapons unlocked
          </p>
        </div>
      </div>

      {/* Fixed Start button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="bg-gradient-to-t from-black via-black/80 to-transparent pt-10 pb-6 px-4 flex justify-center pointer-events-auto">
          <button
            onClick={() => onStartTutorial(selectedMap, selectedTimeOfDay)}
            className="group font-hud flex items-center justify-center gap-2.5 rounded-xl px-12 py-4 min-w-[260px]
              font-bold tracking-[0.12em] uppercase text-[#160a04] transition-all duration-200
              hover:-translate-y-0.5 active:translate-y-0"
            style={{
              background: 'linear-gradient(135deg, #fcd34d, #f59e0b)',
              boxShadow: '0 8px 28px -8px rgba(245,158,11,0.6)',
            }}
          >
            <Play className="w-5 h-5" strokeWidth={2.5} fill="currentColor" />
            Start Tutorial
          </button>
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-md">
    <div className="px-4 py-2.5 border-b border-white/[0.07]">
      <h2 className="font-hud text-[11px] font-semibold tracking-[0.2em] text-gray-400 uppercase">{title}</h2>
    </div>
    <div className="p-3">{children}</div>
  </div>
);

export default TutorialMenu;
