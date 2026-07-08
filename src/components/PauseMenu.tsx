import type { CSSProperties } from 'react';
import { Pause, Play, Heart, Crosshair, Skull, Waves, Trophy, Network, LogOut, ChevronRight, Lock, Camera } from 'lucide-react';

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
  /** Enters the in-game photoshoot. */
  onPhotoMode?: () => void;
  /** When true the Photo Mode action is shown (solo + signed in). */
  showPhotoMode?: boolean;
  /** Touch devices have no ESC key — show an on-screen Resume button + hint. */
  isTouch?: boolean;
  /** Resume gameplay (touch). */
  onResume?: () => void;
  t: (key: string) => string;
}

const PauseMenu = ({ health, ammo, maxAmmo, enemiesKilled, score, wave, onMainMenu, onSkillTree, showSkillTree = true, skillTreeLocked = false, onPhotoMode, showPhotoMode = false, isTouch = false, onResume }: PauseMenuProps) => {
  const stats = [
    { icon: Heart, label: 'Health', value: `${Math.floor(health)}`, color: '#f87171' },
    { icon: Crosshair, label: 'Ammo', value: `${ammo}/${maxAmmo}`, color: '#fbbf24' },
    { icon: Skull, label: 'Kills', value: `${enemiesKilled}`, color: '#c084fc' },
    { icon: Waves, label: 'Wave', value: `${wave}`, color: '#34d399' },
  ];

  return (
    <div
      className="absolute inset-0 flex overflow-y-auto p-4 menu-overlay-in"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(8,11,16,0.92) 0%, rgba(2,4,8,0.97) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        // m-auto (not parent items-center): centred when it fits, but on a
        // short landscape-phone viewport the card scrolls from the TOP instead
        // of clipping its header off-screen (flex-centred overflow bug).
        className="relative m-auto w-full max-w-sm"
        style={{ animation: 'pmFade 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-white/10 bg-white/[0.04] mb-4">
            <Pause className="w-7 h-7 text-white" strokeWidth={2} fill="currentColor" />
          </div>
          <p className="font-hud text-[10px] tracking-[0.36em] text-gray-400 font-semibold uppercase mb-1.5">Run Suspended</p>
          <h1 className="font-display text-3xl font-semibold tracking-[0.1em] text-white uppercase">Paused</h1>
          <p className="font-hud mt-1.5 text-xs text-gray-500">
            {isTouch ? (
              'Tap Resume to keep playing'
            ) : (
              <>Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono text-xs">ESC</kbd> to resume</>
            )}
          </p>
        </div>

        {/* Stats card */}
        <div
          className="hud-frame rounded-2xl border border-emerald-400/15 bg-white/[0.03] backdrop-blur-md overflow-hidden mb-5"
          style={{ '--hud-bracket': 'rgba(46,232,180,0.4)' } as CSSProperties}
        >
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
                    <div className="font-hud text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase">{s.label}</div>
                    <div className="font-display text-lg font-semibold text-white tabular-nums leading-tight">{s.value}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Score row */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.07] bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <Trophy className="w-4 h-4 text-cyan-400" strokeWidth={2.25} />
              <span className="font-hud text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase">Score</span>
            </div>
            <span className="font-display text-2xl font-semibold text-cyan-300 tabular-nums">{score.toLocaleString()}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          {/* Resume — touch only (desktop resumes with ESC). */}
          {isTouch && onResume && (
            <button
              onClick={onResume}
              className="group flex items-center gap-3 w-full rounded-xl px-4 py-3.5 border border-emerald-400/40
                bg-emerald-500/15 transition-all duration-200 hover:bg-emerald-500/25"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/25">
                <Play className="w-[18px] h-[18px] text-emerald-300" strokeWidth={2.5} fill="currentColor" />
              </span>
              <span className="font-display flex-1 text-left text-sm font-semibold uppercase tracking-wide text-white">Resume</span>
              <ChevronRight className="w-4 h-4 text-emerald-400/70 group-hover:translate-x-0.5 transition-all" strokeWidth={2} />
            </button>
          )}

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
                  <span className="font-display block text-sm font-semibold uppercase tracking-wide text-gray-300">Skill Tree</span>
                  <span className="font-hud block text-[11px] text-gray-500">Sign in to unlock</span>
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
                <span className="font-display flex-1 text-left text-sm font-semibold uppercase tracking-wide text-white">Skill Tree</span>
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" strokeWidth={2} />
              </button>
            )
          )}

          {showPhotoMode && onPhotoMode && (
            <button
              onClick={onPhotoMode}
              className="group flex items-center gap-3 w-full rounded-xl px-4 py-3.5 border border-white/10
                bg-white/[0.03] transition-all duration-200 hover:bg-white/[0.07] hover:border-emerald-400/50"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15">
                <Camera className="w-[18px] h-[18px] text-emerald-400" strokeWidth={2} />
              </span>
              <span className="flex-1 text-left">
                <span className="font-display block text-sm font-semibold uppercase tracking-wide text-white">Photo Mode</span>
                <span className="font-hud block text-[11px] text-gray-500">Freeze the world & capture the shot</span>
              </span>
              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" strokeWidth={2} />
            </button>
          )}

          <button
            onClick={onMainMenu}
            className="group flex items-center gap-3 w-full rounded-xl px-4 py-3.5 border border-white/10
              bg-white/[0.03] transition-all duration-200 hover:bg-red-500/[0.08] hover:border-red-400/50"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/15">
              <LogOut className="w-[18px] h-[18px] text-red-400" strokeWidth={2} />
            </span>
            <span className="font-display flex-1 text-left text-sm font-semibold uppercase tracking-wide text-white">Main Menu</span>
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
