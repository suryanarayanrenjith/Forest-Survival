import {
  ArrowLeft, GraduationCap,
  Trees, Flame, Snowflake, Mountain, Droplet, Shield, Gem, Landmark, type LucideIcon,
} from 'lucide-react';
import { MAP_CONFIGS, type MapType } from '../utils/MapSystem';

interface TutorialMenuProps {
  onStartTutorial: (map: MapType) => void;
  onBack: () => void;
  t?: (key: string) => string;
}

const MAP_ICONS: Record<MapType, LucideIcon> = {
  deep_forest: Trees,
  scorched_wasteland: Flame,
  frozen_tundra: Snowflake,
  desert_canyon: Mountain,
  toxic_swamp: Droplet,
  military_outpost: Shield,
  crystal_caverns: Gem,
  ancient_ruins: Landmark,
};

const TutorialMenu = ({ onStartTutorial, onBack }: TutorialMenuProps) => {
  return (
    <div className="relative w-full h-screen bg-[#05080a] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/45 to-black/85 pointer-events-none" />

      {/* Back */}
      <button
        onClick={onBack}
        className="group fixed top-5 left-5 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5
          border border-white/10 bg-black/50 backdrop-blur-md text-sm font-semibold text-gray-300
          transition-all duration-200 hover:text-white hover:bg-black/70 hover:border-white/20"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" strokeWidth={2.25} />
        Back
      </button>

      {/* Scrollable content */}
      <div className="relative z-20 h-screen overflow-y-auto">
        <div className="flex flex-col items-center px-4 pt-20 pb-36 max-w-2xl mx-auto">
          {/* Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-amber-400/30 bg-amber-500/10 mb-4">
              <GraduationCap className="w-7 h-7 text-amber-400" strokeWidth={1.75} />
            </div>
            <p className="text-[10px] tracking-[0.4em] text-amber-300/90 font-semibold uppercase mb-2">Tutorial</p>
            <h1
              className="text-4xl sm:text-5xl font-black tracking-tight"
              style={{
                background: 'linear-gradient(180deg, #fef3c7 0%, #fcd34d 60%, #f59e0b 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              CHOOSE YOUR MAP
            </h1>
            <p className="mt-3 text-sm text-gray-400">
              Pick a battlefield to learn the core mechanics in. All weapons and abilities are unlocked, and you can't be hurt.
            </p>
          </div>

          {/* Map grid */}
          <div className="w-full rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-md">
            <div className="px-4 py-2.5 border-b border-white/[0.07]">
              <h2 className="text-[11px] font-semibold tracking-[0.2em] text-gray-400 uppercase">Map</h2>
            </div>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.values(MAP_CONFIGS).map((map) => {
                const Icon = MAP_ICONS[map.id];
                return (
                  <button
                    key={map.id}
                    onClick={() => onStartTutorial(map.id)}
                    className="group flex flex-col items-center justify-center py-4 px-2 rounded-xl border
                      border-white/[0.08] bg-white/[0.03] transition-all duration-200
                      hover:-translate-y-0.5 hover:bg-amber-500/10 hover:border-amber-400/40"
                    title={map.description}
                  >
                    <Icon className="w-6 h-6 mb-2 text-gray-400 group-hover:text-amber-300 transition-colors" strokeWidth={1.75} />
                    <span className="text-[11px] font-bold leading-tight text-center text-gray-300 group-hover:text-white transition-colors">
                      {map.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-6 text-[10px] tracking-[0.3em] text-gray-600 uppercase">
            Click any map to begin
          </p>
        </div>
      </div>
    </div>
  );
};

export default TutorialMenu;
