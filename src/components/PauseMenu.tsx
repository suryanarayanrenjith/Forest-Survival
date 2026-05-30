import { Pause, Heart, Crosshair, Skull, Waves, Trophy, Network, LogOut, ChevronRight, Lock } from 'lucide-react';

interface PauseMenuProps {
  health: number;
  ammo: number;
  maxAmmo: number;
  enemiesKilled: number;
  score: number;
  wave: number;
  onMainMenu: () => void;
  onSkillTree: () => void;
  /** When false the Skill Tree action is hidden (e.g. Tutorial mode). */
  showSkillTree?: boolean;
  /** When true the Skill Tree is shown locked (guest play — sign-in required). */
  skillTreeLocked?: boolean;
  t: (key: string) => string;
}

const PauseMenu = ({ health, ammo, maxAmmo, enemiesKilled, score, wave, onMainMenu, onSkillTree, showSkillTree = true, skillTreeLocked = false }: PauseMenuProps) => {
  const stats = [
    { icon: Heart, label: 'Health', value: `${Math.floor(health)}`, color: '#f87171' },
    { icon: Crosshair, label: 'Ammo', value: `${ammo}/${maxAmmo}`, color: '#fbbf24' },
    { icon: Skull, label: 'Kills', value: `${enemiesKilled}`, color: '#c084fc' },
    { icon: Waves, label: 'Wave', value: `${wave}`, color: '#34d399' },
  ];

  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-y-auto p-4"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(8,11,16,0.92) 0%, rgba(2,4,8,0.97) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        className="relative w-full max-w-sm"
        style={{ animation: 'pmFade 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-white/10 bg-white/[0.04] mb-4">
            <Pause className="w-7 h-7 text-white" strokeWidth={2} fill="currentColor" />
          </div>
          <h1 className="text-3xl font-bold tracking-[0.2em] text-white uppercase">Paused</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono text-xs">ESC</kbd> to resume
          </p>
        </div>

        {/* Stats card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden mb-5">
          <div className="grid grid-cols-2">
            {stats.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className={`flex items-center gap-3 px-4 py-3.5 ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b' : ''} border-white/[0.07]`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: s.color }} strokeWidth={2.25} />
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase">{s.label}</div>
                    <div className="text-lg font-bold text-white tabular-nums leading-tight">{s.value}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Score row */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.07] bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <Trophy className="w-4 h-4 text-cyan-400" strokeWidth={2.25} />
              <span className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase">Score</span>
            </div>
            <span className="text-2xl font-bold text-cyan-300 tabular-nums">{score.toLocaleString()}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          {showSkillTree && (
            skillTreeLocked ? (
              <div
                className="flex items-center gap-3 w-full rounded-xl px-4 py-3.5 border border-white/10 bg-white/[0.02] opacity-80"
                title="Sign in to unlock the skill tree"
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.06]">
                  <Lock className="w-[18px] h-[18px] text-gray-400" strokeWidth={2} />
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-bold text-gray-300 tracking-wide">Skill Tree</span>
                  <span className="block text-[11px] text-gray-500">Sign in to unlock</span>
                </span>
              </div>
            ) : (
              <button
                onClick={onSkillTree}
                className="group flex items-center gap-3 w-full rounded-xl px-4 py-3.5 border border-white/10
                  bg-white/[0.03] transition-all duration-200 hover:bg-white/[0.07] hover:border-violet-400/50"
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/15">
                  <Network className="w-[18px] h-[18px] text-violet-400" strokeWidth={2} />
                </span>
                <span className="flex-1 text-left text-sm font-bold text-white tracking-wide">Skill Tree</span>
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" strokeWidth={2} />
              </button>
            )
          )}

          <button
            onClick={onMainMenu}
            className="group flex items-center gap-3 w-full rounded-xl px-4 py-3.5 border border-white/10
              bg-white/[0.03] transition-all duration-200 hover:bg-red-500/[0.08] hover:border-red-400/50"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/15">
              <LogOut className="w-[18px] h-[18px] text-red-400" strokeWidth={2} />
            </span>
            <span className="flex-1 text-left text-sm font-bold text-white tracking-wide">Main Menu</span>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" strokeWidth={2} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pmFade {
          from { opacity: 0; transform: scale(0.96) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default PauseMenu;
