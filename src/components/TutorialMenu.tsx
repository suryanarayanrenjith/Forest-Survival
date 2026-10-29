import { useRef, useState } from 'react';
import { Play, BookOpen, ArrowUpRight } from 'lucide-react';
import CharacterSelect from './CharacterSelect';
import type { MapType } from '../utils/MapSystem';
import type { ClassId } from '../utils/CharacterModels';
import { WIKI_BASE } from '../utils/TutorialSystem';
import { detectIsTouch } from '../hooks/useDeviceInfo';
import {
  MenuBackButton, MenuScreenHeader, MenuSection, AtmosphereSection, MapSection,
  MenuStartBar, MenuFootnote, type TimeOfDay,
} from './MenuKit';

const IS_TOUCH = detectIsTouch();

interface TutorialMenuProps {
  onStartTutorial: (map: MapType, timeOfDay: TimeOfDay) => void;
  onBack: () => void;
  selectedCharacter: ClassId;
  onSelectCharacter: (id: ClassId) => void;
  t?: (key: string) => string;
}

/**
 * Tutorial setup — the SAME layout as Solo (shared MenuKit), in the tutorial's
 * amber accent. It used to be a translucent glass variant with its own header,
 * buttons and grey type.
 */
const TutorialMenu = ({ onStartTutorial, onBack, selectedCharacter, onSelectCharacter }: TutorialMenuProps) => {
  const [selectedMap, setSelectedMap] = useState<MapType>('deep_forest');
  // Default 'auto' so new players see the full day-night transition the
  // game shows in real gameplay.
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDay>('auto');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* Backdrop chrome (dark gradients + themed tint) is rendered at App
          level OUTSIDE the menu transition so it stays static while this
          screen slides. Only the content below animates. */}
      <MenuBackButton onClick={onBack} />

      {/* Scrollable content — `m-safe` on the SCROLLER only (see ClassicMenu). */}
      <div ref={scrollRef} className="m-safe relative z-20 h-dvh overflow-y-auto">
        <div className={`flex flex-col items-center max-w-2xl mx-auto ${IS_TOUCH ? 'px-4 pt-16 pb-36' : 'px-4 pt-20 pb-40'}`}>
          <MenuScreenHeader
            eyebrow="Guided Training"
            title="Tutorial Mode"
            subtitle="Learn every control step by step. All weapons, abilities and throwables are unlocked, throwables are unlimited, and nothing can hurt you."
            accent="amber"
            compact={IS_TOUCH}
          >
            <a
              href={WIKI_BASE}
              target="_blank"
              rel="noopener noreferrer"
              className="font-hud group mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/90 transition-colors hover:text-amber-200"
            >
              <BookOpen className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />
              Prefer reading first? Browse the Game Wiki
              <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.2} />
            </a>
          </MenuScreenHeader>

          <div className="w-full space-y-4 menu-stagger">
            <MenuSection title="Character" accent="amber">
              <CharacterSelect selected={selectedCharacter} onSelect={onSelectCharacter} accent="#fbbf24" />
            </MenuSection>
            <AtmosphereSection value={selectedTimeOfDay} onChange={setSelectedTimeOfDay} accent="amber" />
            <MapSection value={selectedMap} onChange={setSelectedMap} accent="amber" scrollRef={scrollRef} />
          </div>

          <MenuFootnote>Tutorial Mode · Invincible · All weapons unlocked</MenuFootnote>
        </div>
      </div>

      <MenuStartBar accent="amber" icon={Play} label="Start Tutorial" onClick={() => onStartTutorial(selectedMap, selectedTimeOfDay)} />
    </div>
  );
};

export default TutorialMenu;
