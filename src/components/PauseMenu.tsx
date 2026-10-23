import { Pause, Play, Heart, Crosshair, Skull, Waves, Trophy, Network, LogOut, ChevronRight, Lock, Camera, type LucideIcon } from 'lucide-react';

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

const SHAPE = '12px 3px';

/** One partial-rounded action row (Resume / Skill Tree / Photo / Main Menu). */
const ActionRow = ({
  icon: Icon, label, desc, accent, onClick, primary = false,
}: {
  icon: LucideIcon; label: string; desc?: string; accent: string; onClick: () => void; primary?: boolean;
}) => (
  <button
    onClick={onClick}
    className="group relative flex w-full items-center gap-3.5 overflow-hidden border py-3 pl-4 pr-3.5 text-left transition-all duration-200 hover:-translate-y-0.5"
    style={{
      borderRadius: SHAPE,
      borderColor: primary ? `${accent}66` : 'rgba(255,255,255,0.09)',
      background: primary ? `linear-gradient(90deg, ${accent}2a, rgba(6,11,9,0.92))` : 'rgba(6,11,9,0.88)',
    }}
  >
    <span
      className="absolute left-0 top-0 h-full w-[3px] origin-center scale-y-0 transition-transform duration-200 group-hover:scale-y-100"
      style={{ background: accent, transform: primary ? 'scaleY(1)' : undefined }}
    />
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border" style={{ borderColor: `${accent}44`, background: `${accent}18` }}>
      <Icon className="h-[17px] w-[17px]" style={{ color: accent }} strokeWidth={2.1} fill={Icon === Play ? 'currentColor' : 'none'} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="font-display block text-[15px] font-semibold uppercase tracking-wide text-white">{label}</span>
      {desc && <span className="font-hud block truncate text-[11px] text-white/45">{desc}</span>}
    </span>
    <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white" strokeWidth={2} />
  </button>
);

const PauseMenu = ({ health, ammo, maxAmmo, enemiesKilled, score, wave, onMainMenu, onSkillTree, showSkillTree = true, skillTreeLocked = false, onPhotoMode, showPhotoMode = false, isTouch = false, onResume }: PauseMenuProps) => {
  const stats = [
    { icon: Heart, label: 'Health', value: `${Math.floor(health)}`, color: '#ff5a5f' },
    { icon: Crosshair, label: 'Ammo', value: `${ammo}/${maxAmmo}`, color: '#ffb265' },
    { icon: Skull, label: 'Kills', value: `${enemiesKilled}`, color: '#c084fc' },
    { icon: Waves, label: 'Wave', value: `${wave}`, color: '#2ee8b4' },
  ];

  return (
    <div
      // Near-opaque grade — no backdrop-filter: the game canvas keeps
      // rendering underneath and a live blur of it costs frame time.
      className="absolute inset-0 flex overflow-y-auto p-4 menu-overlay-in"
      style={{ background: 'radial-gradient(ellipse at center, rgba(5,9,8,0.9) 0%, rgba(2,4,4,0.97) 100%)' }}
    >
      <div
        // m-auto (not parent items-center): centred when it fits, but on a
        // short landscape-phone viewport the card scrolls from the TOP instead
        // of clipping its header off-screen (flex-centred overflow bug).
        className="relative m-auto w-full max-w-sm"
        style={{ animation: 'pmFade 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center border border-white/15 bg-white/[0.04]" style={{ borderRadius: '8px 2px' }}>
            <Pause className="h-6 w-6 text-white" strokeWidth={2} fill="currentColor" />
          </div>
          <p className="font-hud mb-1.5 text-[10px] font-semibold uppercase tracking-[0.42em] text-emerald-300/80">Run Suspended</p>
          <h1 className="font-display text-4xl font-semibold uppercase tracking-[0.18em] text-white" style={{ paddingLeft: '0.18em' }}>Paused</h1>
          <div className="mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent" />
          <p className="font-hud mt-3 text-xs text-white/50">
            {isTouch ? (
              'Tap Resume to keep playing'
            ) : (
              <>Press <kbd className="mx-0.5 border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-hud text-[10px] font-bold text-white/80">ESC</kbd> to resume</>
            )}
          </p>
        </div>

        <div className="mb-4 overflow-hidden border border-white/[0.09] bg-[#060b09]/90" style={{ borderRadius: SHAPE }}>
          <div className="grid grid-cols-2">
            {stats.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className={`flex items-center gap-3 px-4 py-3 ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b' : ''} border-white/[0.07]`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" style={{ color: s.color }} strokeWidth={2.25} />
                  <div className="min-w-0">
                    <div className="hud-label" style={{ fontSize: 9 }}>{s.label}</div>
                    <div className="hud-num mt-1 text-[22px] text-white">{s.value}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.07] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Trophy className="h-4 w-4 text-cyan-300" strokeWidth={2.25} />
              <span className="hud-label">Score</span>
            </div>
            <span className="hud-num text-[30px] text-cyan-300">{score.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {/* Resume — touch only (desktop resumes with ESC). */}
          {isTouch && onResume && (
            <ActionRow icon={Play} label="Resume" accent="#2ee8b4" onClick={onResume} primary />
          )}

          {showSkillTree && (
            skillTreeLocked ? (
              <div
                className="flex w-full items-center gap-3.5 border border-white/[0.08] bg-[#060b09]/80 py-3 pl-4 pr-3.5 opacity-80"
                style={{ borderRadius: SHAPE }}
                title="Sign in to unlock the skill tree"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.05]">
                  <Lock className="h-[17px] w-[17px] text-white/50" strokeWidth={2} />
                </span>
                <span className="flex-1 text-left">
                  <span className="font-display block text-[15px] font-semibold uppercase tracking-wide text-white/70">Skill Tree</span>
                  <span className="font-hud block text-[11px] text-white/40">Sign in to unlock</span>
                </span>
              </div>
            ) : (
              <ActionRow icon={Network} label="Skill Tree" accent="#a78bfa" onClick={onSkillTree} />
            )
          )}

          {showPhotoMode && onPhotoMode && (
            <ActionRow icon={Camera} label="Photo Mode" desc="Freeze the world & capture the shot" accent="#2ee8b4" onClick={onPhotoMode} />
          )}

          <ActionRow icon={LogOut} label="Main Menu" accent="#ff5a5f" onClick={onMainMenu} />
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
