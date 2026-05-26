import { useState } from 'react';
import { Swords, Users, GraduationCap, Settings, ChevronRight, Sparkles } from 'lucide-react';
import MenuShell from './MenuShell';
import SettingsMenu from './SettingsMenu';
import CreditsMenu from './CreditsMenu';

interface MainMenuProps {
  onClassicMode: () => void;
  onMultiplayerMode: () => void;
  onTutorialMode: () => void;
  t: (key: string) => string;
}

const MainMenu = ({ onClassicMode, onMultiplayerMode, onTutorialMode }: MainMenuProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showCredits, setShowCredits] = useState(false);

  const modes = [
    {
      key: 'solo',
      icon: Swords,
      title: 'Solo',
      desc: 'Survive endless waves alone',
      accent: 'emerald',
      onClick: onClassicMode,
    },
    {
      key: 'multiplayer',
      icon: Users,
      title: 'Multiplayer',
      desc: 'Co-op & survival with friends',
      accent: 'sky',
      onClick: onMultiplayerMode,
    },
    {
      key: 'tutorial',
      icon: GraduationCap,
      title: 'Tutorial',
      desc: 'Learn the core mechanics',
      accent: 'amber',
      onClick: onTutorialMode,
    },
  ] as const;

  const accentRing: Record<string, string> = {
    emerald: 'group-hover:border-emerald-400/70 group-hover:shadow-[0_0_24px_-6px_rgba(16,185,129,0.45)]',
    sky: 'group-hover:border-sky-400/70 group-hover:shadow-[0_0_24px_-6px_rgba(56,189,248,0.45)]',
    amber: 'group-hover:border-amber-400/70 group-hover:shadow-[0_0_24px_-6px_rgba(245,158,11,0.45)]',
  };
  const accentIcon: Record<string, string> = {
    emerald: 'text-emerald-400',
    sky: 'text-sky-400',
    amber: 'text-amber-400',
  };
  const accentIconBg: Record<string, string> = {
    emerald: 'bg-emerald-500/10 group-hover:bg-emerald-500/15',
    sky: 'bg-sky-500/10 group-hover:bg-sky-500/15',
    amber: 'bg-amber-500/10 group-hover:bg-amber-500/15',
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <MenuShell variant="main" />

      {/* Cinematic vignette + readability overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/80" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.7) 100%)' }}
      />

      {/* Main Screen */}
      {!showSettings && (
        <div className="relative z-10 min-h-screen overflow-y-auto flex flex-col items-center justify-center px-6 py-10">
          {/* Title */}
          <div className="relative mb-10 sm:mb-14 text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="h-px w-8 sm:w-12 bg-gradient-to-r from-transparent to-emerald-500/60" />
              <p className="text-[10px] sm:text-xs tracking-[0.45em] text-emerald-400/90 font-semibold uppercase">
                Wave-Based Survival
              </p>
              <span className="h-px w-8 sm:w-12 bg-gradient-to-l from-transparent to-emerald-500/60" />
            </div>

            <h1
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-none"
              style={{
                background: 'linear-gradient(180deg, #f0fdf4 0%, #86efac 55%, #22c55e 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 4px 24px rgba(34,197,94,0.35))',
              }}
            >
              FOREST<br className="sm:hidden" /> SURVIVAL
            </h1>
          </div>

          {/* Mode Buttons */}
          <div className="flex flex-col gap-3 w-full max-w-md">
            {modes.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.key}
                  onClick={mode.onClick}
                  className="group relative flex items-center gap-4 w-full rounded-2xl px-4 py-4 text-left
                    bg-white/[0.03] border border-white/10 backdrop-blur-md
                    transition-all duration-300 hover:bg-white/[0.06] hover:-translate-y-0.5
                    active:translate-y-0"
                >
                  {/* accent ring on hover */}
                  <span
                    className={`pointer-events-none absolute inset-0 rounded-2xl border border-transparent transition-all duration-300 ${accentRing[mode.accent]}`}
                  />
                  <span
                    className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors duration-300 ${accentIconBg[mode.accent]}`}
                  >
                    <Icon className={`w-6 h-6 ${accentIcon[mode.accent]}`} strokeWidth={1.75} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-lg sm:text-xl font-bold text-white tracking-wide">
                      {mode.title}
                    </span>
                    <span className="block text-xs sm:text-sm text-gray-400 font-medium truncate">
                      {mode.desc}
                    </span>
                  </span>
                  <ChevronRight
                    className="w-5 h-5 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all duration-300"
                    strokeWidth={2}
                  />
                </button>
              );
            })}

            {/* Settings + Credits */}
            <div className="flex items-center justify-center gap-2 mt-1">
              <button
                onClick={() => setShowSettings(true)}
                className="group flex items-center justify-center gap-2 rounded-xl px-5 py-2.5
                  text-sm font-semibold text-gray-400 border border-white/10 bg-white/[0.02]
                  transition-all duration-300 hover:text-white hover:bg-white/[0.06] hover:border-white/20"
              >
                <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" strokeWidth={2} />
                Settings
              </button>
              <button
                onClick={() => setShowCredits(true)}
                className="group flex items-center justify-center gap-2 rounded-xl px-5 py-2.5
                  text-sm font-semibold text-gray-400 border border-white/10 bg-white/[0.02]
                  transition-all duration-300 hover:text-emerald-300 hover:bg-emerald-500/[0.06] hover:border-emerald-400/30"
              >
                <Sparkles
                  className="w-4 h-4 transition-transform duration-500 group-hover:scale-110"
                  strokeWidth={2}
                  fill="currentColor"
                />
                Credits
              </button>
            </div>
          </div>

          {/* Version + author tagline */}
          <div className="mt-10 flex flex-col items-center gap-1.5">
            <p className="text-[10px] tracking-[0.3em] text-gray-600 uppercase">
              Version 1.0
            </p>
            <button
              onClick={() => setShowCredits(true)}
              className="text-[11px] text-gray-500 hover:text-emerald-300 transition-colors"
            >
              vibe-coded by <span className="font-semibold">Surya</span>
            </button>
          </div>
        </div>
      )}

      {/* Settings Menu */}
      {showSettings && <SettingsMenu onClose={() => setShowSettings(false)} />}

      {/* Credits Menu */}
      {showCredits && <CreditsMenu onClose={() => setShowCredits(false)} />}
    </div>
  );
};

export default MainMenu;
