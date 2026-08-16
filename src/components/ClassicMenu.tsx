import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Dices, Sparkles, ChevronDown, Play, Cpu,
  Shield, Crosshair, Skull, CloudSun, Sun, Moon,
  Trees, Flame, Snowflake, Mountain, Droplet, Leaf, Landmark, type LucideIcon,
} from 'lucide-react';
import CharacterSelect from './CharacterSelect';
import { MAP_CONFIGS, getRandomMap, type MapType } from '../utils/MapSystem';
import type { ClassId } from '../utils/CharacterModels';
import { detectIsTouch } from '../hooks/useDeviceInfo';

const IS_TOUCH = detectIsTouch();

interface ClassicMenuProps {
  onStartGame: (difficulty: 'easy' | 'medium' | 'hard' | 'adaptive', timeOfDay: 'day' | 'night' | 'auto', map: MapType, isRandom: boolean) => void;
  onBack: () => void;
  selectedCharacter: ClassId;
  onSelectCharacter: (id: ClassId) => void;
  t: (key: string) => string;
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

const ClassicMenu = ({ onStartGame, onBack, selectedCharacter, onSelectCharacter }: ClassicMenuProps) => {
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard' | 'adaptive'>('medium');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<'day' | 'night' | 'auto'>('auto');
  const [selectedMap, setSelectedMap] = useState<MapType>('deep_forest');
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [showMapSelector, setShowMapSelector] = useState(false);

  // Map is the LAST section, so expanding it unfolds the 8-map grid into the
  // strip covered by the fixed Start bar (or below the fold on a short screen)
  // and the dropdown reads as doing nothing. Scroll it back into view.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showMapSelector) return;
    const raf = requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const section = mapSectionRef.current;
      if (!scroller || !section) return;
      // Start bar height (pt-10 + button + pb-6) plus breathing room.
      const START_BAR_CLEARANCE = 148;
      const hidden = section.getBoundingClientRect().bottom - (scroller.clientHeight - START_BAR_CLEARANCE);
      if (hidden > 0) scroller.scrollBy({ top: hidden, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [showMapSelector]);

  const difficulties: { key: 'easy' | 'medium' | 'hard' | 'adaptive'; icon: LucideIcon; label: string; desc: string; color: string }[] = [
    { key: 'easy', icon: Shield, label: 'Easy', desc: 'Casual', color: '#34d399' },
    { key: 'medium', icon: Crosshair, label: 'Medium', desc: 'Balanced', color: '#fbbf24' },
    { key: 'hard', icon: Skull, label: 'Hard', desc: 'Brutal', color: '#f87171' },
    { key: 'adaptive', icon: Cpu, label: 'Adaptive', desc: 'AI-paced', color: '#22d3ee' },
  ];

  const atmospheres: { key: 'auto' | 'day' | 'night'; icon: LucideIcon; label: string; desc: string; color: string }[] = [
    { key: 'auto', icon: CloudSun, label: 'Auto', desc: 'Day-night cycle', color: '#a78bfa' },
    { key: 'day', icon: Sun, label: 'Day', desc: 'Bright', color: '#fbbf24' },
    { key: 'night', icon: Moon, label: 'Night', desc: 'Dark', color: '#818cf8' },
  ];

  const SelectedMapIcon = MAP_ICONS[selectedMap];

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* Backdrop chrome (dark gradients + themed tint) is rendered at App
          level OUTSIDE the menu transition so it stays static while this
          screen slides. Only the content below animates. */}

      <button
        onClick={onBack}
        className="group fixed top-5 left-5 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5
          border border-white/10 bg-black/50 backdrop-blur-md font-hud text-sm font-semibold uppercase tracking-wider text-gray-300
          transition-all duration-200 hover:text-white hover:bg-black/70 hover:border-white/20"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" strokeWidth={2.25} />
        Back
      </button>

      {/* Scrollable content.

          `m-safe` lives on the SCROLLER, never on the padded content div below —
          it sets all four `padding-*` longhands and wins over a co-located
          `px-4 pt-20 pb-36` (equal specificity, emitted later), silently zeroing
          the page's padding. That left no bottom padding to scroll the Map
          section clear of the Start bar. Same fix as TutorialMenu.

          Bottom padding must exceed the fixed Start bar (~120px: pt-10 + button
          + pb-6) so the bar ends up BELOW the last section, not cutting into it. */}
      <div ref={scrollRef} className="m-safe relative z-20 h-dvh overflow-y-auto">
        <div className={`flex flex-col items-center max-w-2xl mx-auto ${IS_TOUCH ? 'px-4 pt-16 pb-36' : 'px-4 pt-20 pb-40'}`}>
          <div className={`text-center ${IS_TOUCH ? 'mb-5' : 'mb-8'}`}>
            <p className="font-hud text-[10px] tracking-[0.4em] text-emerald-400/90 font-semibold uppercase mb-2">Solo Survival</p>
            <h1 className={`font-display title-bio font-semibold uppercase tracking-wide ${IS_TOUCH ? 'text-3xl' : 'text-4xl sm:text-5xl'}`}>
              CLASSIC MODE
            </h1>
          </div>

          <div className="w-full space-y-4 menu-stagger">
            <button
              onClick={() => {
                const next = !isRandomMode;
                setIsRandomMode(next);
                setSelectedDifficulty(next ? 'adaptive' : 'medium');
              }}
              className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 border transition-all duration-300 text-left"
              style={{
                borderColor: isRandomMode ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.1)',
                background: isRandomMode ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)',
              }}
            >
              <span
                className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
                style={{ background: 'rgba(167,139,250,0.15)' }}
              >
                <Dices className="w-6 h-6 text-violet-400" strokeWidth={1.75} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-display block text-lg font-semibold uppercase tracking-wide text-white">Random Mode</span>
                <span className="font-hud block text-xs text-gray-400 truncate">
                  {isRandomMode ? 'Adaptive difficulty + randomized atmosphere & map' : 'Let the game roll difficulty, time and map'}
                </span>
              </span>
              <span
                className="flex items-center justify-center w-6 h-6 rounded-full border text-[10px] font-bold flex-shrink-0"
                style={{
                  borderColor: isRandomMode ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.2)',
                  background: isRandomMode ? '#a78bfa' : 'transparent',
                }}
              >
                {isRandomMode && <Sparkles className="w-3.5 h-3.5 text-[#1a1030]" strokeWidth={2.5} />}
              </span>
            </button>

            {/* Character — independent of Random Mode (you always pick who you are) */}
            <Section title="Character" dimmed={false}>
              <CharacterSelect selected={selectedCharacter} onSelect={onSelectCharacter} accent="#34d399" />
            </Section>

            <Section title="Difficulty" dimmed={isRandomMode}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {difficulties.map((d) => {
                  const Icon = d.icon;
                  const active = selectedDifficulty === d.key && !isRandomMode;
                  return (
                    <OptionCard key={d.key} active={active} color={d.color}
                      onClick={() => { setSelectedDifficulty(d.key); setIsRandomMode(false); }}>
                      <Icon className="w-5 h-5 mb-1.5" style={{ color: active ? d.color : '#9ca3af' }} strokeWidth={2} />
                      <span className={`font-hud text-xs font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{d.label}</span>
                      <span className="text-[10px] text-gray-500">{d.desc}</span>
                    </OptionCard>
                  );
                })}
              </div>
            </Section>

            <Section title="Atmosphere" dimmed={isRandomMode}>
              <div className="grid grid-cols-3 gap-2">
                {atmospheres.map((a) => {
                  const Icon = a.icon;
                  const active = selectedTimeOfDay === a.key;
                  return (
                    <OptionCard key={a.key} active={active} color={a.color}
                      onClick={() => setSelectedTimeOfDay(a.key)}>
                      <Icon className="w-5 h-5 mb-1.5" style={{ color: active ? a.color : '#9ca3af' }} strokeWidth={2} />
                      <span className={`font-hud text-xs font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{a.label}</span>
                      <span className="text-[10px] text-gray-500">{a.desc}</span>
                    </OptionCard>
                  );
                })}
              </div>
            </Section>

            <Section title="Map" dimmed={isRandomMode} innerRef={mapSectionRef}>
              <button
                onClick={() => setShowMapSelector(!showMapSelector)}
                className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 border border-white/10 bg-white/[0.03]
                  transition-colors hover:bg-white/[0.06]"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/12 flex-shrink-0">
                  <SelectedMapIcon className="w-5 h-5 text-emerald-400" strokeWidth={1.75} />
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
                      <OptionCard key={map.id} active={active} color="#34d399"
                        onClick={() => { setSelectedMap(map.id); setShowMapSelector(false); }}>
                        <Icon className="w-5 h-5 mb-1.5" style={{ color: active ? '#34d399' : '#9ca3af' }} strokeWidth={1.75} />
                        <span className={`text-[10px] font-bold leading-tight text-center ${active ? 'text-white' : 'text-gray-400'}`}>
                          {map.name}
                        </span>
                      </OptionCard>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>

          <p className="font-hud mt-6 text-[10px] tracking-[0.3em] text-gray-600 uppercase">Version 2.0 · Classic Mode</p>
        </div>
      </div>

      {/* Fixed Start button.

          The gradient scrim MUST stay pointer-events-none — it spans the full
          viewport width, so an interactive scrim eats every click in the bottom
          strip of the screen, including the Map dropdown once the page is
          scrolled down. Only the button takes input. (Same fix as TutorialMenu.) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="bg-gradient-to-t from-[#06130b] via-[#06130b]/85 to-transparent pt-10 pb-6 px-4 flex justify-center">
          <button
            onClick={() => {
              if (isRandomMode) {
                const timeOptions: ('day' | 'night' | 'auto')[] = ['day', 'night', 'auto'];
                onStartGame('adaptive', timeOptions[Math.floor(Math.random() * 3)], getRandomMap(), true);
              } else {
                onStartGame(selectedDifficulty, selectedTimeOfDay, selectedMap, false);
              }
            }}
            className="group font-hud pointer-events-auto flex items-center justify-center gap-2.5 rounded-xl px-12 py-4 min-w-[260px]
              font-bold tracking-[0.12em] uppercase text-[#04130a] transition-all duration-200
              hover:-translate-y-0.5 active:translate-y-0"
            style={{
              background: isRandomMode
                ? 'linear-gradient(135deg, #a78bfa, #f0abfc)'
                : 'linear-gradient(135deg, #34d399, #22c55e)',
              boxShadow: isRandomMode
                ? '0 8px 28px -8px rgba(167,139,250,0.6)'
                : '0 8px 28px -8px rgba(52,211,153,0.6)',
            }}
          >
            {isRandomMode
              ? <Dices className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" strokeWidth={2.25} />
              : <Play className="w-5 h-5" strokeWidth={2.5} fill="currentColor" />}
            {isRandomMode ? 'Roll & Play' : 'Start Game'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, dimmed, children, innerRef }: { title: string; dimmed: boolean; children: React.ReactNode; innerRef?: React.Ref<HTMLDivElement> }) => (
  <div ref={innerRef} className={`rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-md transition-opacity duration-300 ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}>
    <div className="px-4 py-2.5 border-b border-white/[0.07]">
      <h2 className="font-hud text-[11px] font-semibold tracking-[0.2em] text-gray-400 uppercase">{title}</h2>
    </div>
    <div className="p-3">{children}</div>
  </div>
);

const OptionCard = ({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all duration-200 hover:-translate-y-0.5"
    style={{
      borderColor: active ? `${color}99` : 'rgba(255,255,255,0.08)',
      background: active ? `${color}1f` : 'rgba(255,255,255,0.03)',
    }}
  >
    {children}
  </button>
);

export default ClassicMenu;
