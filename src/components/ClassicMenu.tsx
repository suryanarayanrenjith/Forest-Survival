import { useRef, useState } from 'react';
import { Dices, Sparkles, Play, Cpu, Shield, Crosshair, Skull, type LucideIcon } from 'lucide-react';
import CharacterSelect from './CharacterSelect';
import { getRandomMap, type MapType } from '../utils/MapSystem';
import type { ClassId } from '../utils/CharacterModels';
import { detectIsTouch } from '../hooks/useDeviceInfo';
import {
  MenuBackButton, MenuScreenHeader, MenuSection, MenuOptionCard, AtmosphereSection, MapSection,
  MenuStartBar, MenuFootnote, type TimeOfDay,
} from './MenuKit';
import { MENU_RADIUS } from './menuTokens';

const IS_TOUCH = detectIsTouch();

interface ClassicMenuProps {
  onStartGame: (difficulty: 'easy' | 'medium' | 'hard' | 'adaptive', timeOfDay: TimeOfDay, map: MapType, isRandom: boolean) => void;
  onBack: () => void;
  selectedCharacter: ClassId;
  onSelectCharacter: (id: ClassId) => void;
  t: (key: string) => string;
}

const DIFFICULTIES: { key: 'easy' | 'medium' | 'hard' | 'adaptive'; icon: LucideIcon; label: string; desc: string; color: string }[] = [
  { key: 'easy', icon: Shield, label: 'Easy', desc: 'Casual', color: '#34d399' },
  { key: 'medium', icon: Crosshair, label: 'Medium', desc: 'Balanced', color: '#fbbf24' },
  { key: 'hard', icon: Skull, label: 'Hard', desc: 'Brutal', color: '#f87171' },
  { key: 'adaptive', icon: Cpu, label: 'Adaptive', desc: 'AI-paced', color: '#22d3ee' },
];

/** Solo setup — built from the shared MenuKit (same layout as Tutorial). */
const ClassicMenu = ({ onStartGame, onBack, selectedCharacter, onSelectCharacter }: ClassicMenuProps) => {
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard' | 'adaptive'>('medium');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDay>('auto');
  const [selectedMap, setSelectedMap] = useState<MapType>('deep_forest');
  const [isRandomMode, setIsRandomMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* Backdrop chrome (dark gradients + themed tint) is rendered at App
          level OUTSIDE the menu transition so it stays static while this
          screen slides. Only the content below animates. */}
      <MenuBackButton onClick={onBack} />

      {/* Scrollable content. `m-safe` lives on the SCROLLER, never on the
          padded content div below — it sets all four `padding-*` longhands
          and would silently zero a co-located `px-4 pt-20 pb-40`. Bottom
          padding must exceed the fixed Start bar (~120px). */}
      <div ref={scrollRef} className="m-safe relative z-20 h-dvh overflow-y-auto">
        <div className={`flex flex-col items-center max-w-2xl mx-auto ${IS_TOUCH ? 'px-4 pt-16 pb-36' : 'px-4 pt-20 pb-40'}`}>
          <MenuScreenHeader
            eyebrow="Solo Survival"
            title="Classic Mode"
            subtitle="Hold the forest against endless robot waves. Pick your operative, the difficulty and the battlefield."
            accent="emerald"
            compact={IS_TOUCH}
          />

          <div className="w-full space-y-4 menu-stagger">
            <button
              onClick={() => {
                const next = !isRandomMode;
                setIsRandomMode(next);
                setSelectedDifficulty(next ? 'adaptive' : 'medium');
              }}
              className="w-full flex items-center gap-4 px-4 py-4 border transition-all duration-300 text-left"
              style={{
                borderColor: isRandomMode ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.09)',
                background: isRandomMode ? 'linear-gradient(90deg, rgba(60,40,110,0.9), rgba(16,12,30,0.88))' : 'rgba(6,11,9,0.85)',
                borderRadius: MENU_RADIUS,
              }}
            >
              <span
                className="flex items-center justify-center w-12 h-12 flex-shrink-0 border border-violet-300/25"
                style={{ background: 'rgba(167,139,250,0.14)' }}
              >
                <Dices className="w-6 h-6 text-violet-400" strokeWidth={1.75} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-display block text-lg font-semibold uppercase tracking-wide text-white">Random Mode</span>
                <span className="font-hud block text-xs text-white/55 truncate">
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
            <MenuSection title="Character" accent="emerald">
              <CharacterSelect selected={selectedCharacter} onSelect={onSelectCharacter} accent="#34d399" />
            </MenuSection>

            <MenuSection title="Difficulty" accent="emerald" dimmed={isRandomMode}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DIFFICULTIES.map((d) => {
                  const Icon = d.icon;
                  const active = selectedDifficulty === d.key && !isRandomMode;
                  return (
                    <MenuOptionCard key={d.key} active={active} color={d.color}
                      onClick={() => { setSelectedDifficulty(d.key); setIsRandomMode(false); }}>
                      <Icon className="w-5 h-5 mb-1.5" style={{ color: active ? d.color : '#9ca3af' }} strokeWidth={2} />
                      <span className={`font-hud text-xs font-bold ${active ? 'text-white' : 'text-white/75'}`}>{d.label}</span>
                      <span className="font-hud text-[10px] text-white/45">{d.desc}</span>
                    </MenuOptionCard>
                  );
                })}
              </div>
            </MenuSection>

            <AtmosphereSection value={selectedTimeOfDay} onChange={setSelectedTimeOfDay} accent="emerald" dimmed={isRandomMode} />
            <MapSection value={selectedMap} onChange={setSelectedMap} accent="emerald" dimmed={isRandomMode} scrollRef={scrollRef} />
          </div>

          <MenuFootnote>Version 2.0 · Classic Mode</MenuFootnote>
        </div>
      </div>

      <MenuStartBar
        accent={isRandomMode ? 'violet' : 'emerald'}
        icon={isRandomMode ? Dices : Play}
        filled={!isRandomMode}
        iconClassName={isRandomMode ? 'w-5 h-5 group-hover:rotate-180 transition-transform duration-500' : 'w-5 h-5'}
        label={isRandomMode ? 'Roll & Play' : 'Start Game'}
        onClick={() => {
          if (isRandomMode) {
            const timeOptions: TimeOfDay[] = ['day', 'night', 'auto'];
            onStartGame('adaptive', timeOptions[Math.floor(Math.random() * 3)], getRandomMap(), true);
          } else {
            onStartGame(selectedDifficulty, selectedTimeOfDay, selectedMap, false);
          }
        }}
      />
    </div>
  );
};

export default ClassicMenu;
