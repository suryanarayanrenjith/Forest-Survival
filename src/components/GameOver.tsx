import { Skull, Trophy, Crown, Waves, RotateCcw, Home } from 'lucide-react';

interface GameOverProps {
  isVictory: boolean;
  score: number;
  enemiesKilled: number;
  wave: number;
  onRestart: () => void;
  onMainMenu: () => void;
  t: (key: string) => string;
}

const SHAPE = '14px 3.5px';

const GameOver = ({ isVictory, score, enemiesKilled, wave, onRestart, onMainMenu }: GameOverProps) => {
  const getRating = () => {
    if (score >= 500) return { text: 'Legendary', color: '#fbbf24' };
    if (score >= 300) return { text: 'Excellent', color: '#22d3ee' };
    if (score >= 150) return { text: 'Solid Run', color: '#2ee8b4' };
    return { text: 'Keep Going', color: '#ffb265' };
  };
  const rating = getRating();
  const accent = isVictory ? '#2ee8b4' : '#ff5a5f';

  const stats = [
    { icon: Skull, label: 'Enemies Killed', value: `${enemiesKilled}`, color: '#ff5a5f' },
    { icon: Waves, label: 'Waves Survived', value: `${wave}`, color: '#c084fc' },
  ];

  return (
    <div
      // Near-opaque grade — no backdrop-filter over the live canvas.
      className="absolute inset-0 overflow-y-auto menu-overlay-in"
      // The accent glow is its own layer over a grade that is never lighter
      // than 80% — the death cam often frames bright ground, and a see-through
      // centre made the eyebrow + icon unreadable.
      style={{
        background: `radial-gradient(ellipse at 50% 38%, ${accent}26 0%, transparent 55%), radial-gradient(ellipse at 50% 40%, rgba(6,9,9,0.8) 0%, rgba(5,9,8,0.93) 45%, rgba(2,4,4,0.985) 100%)`,
      }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-md"
          style={{ animation: 'goFade 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
        >
          {/* Header */}
          <div className="mb-5 text-center sm:mb-7">
            <div
              className="mb-3 inline-flex h-12 w-12 items-center justify-center border sm:mb-4 sm:h-14 sm:w-14"
              style={{ borderColor: `${accent}66`, background: `${accent}18`, borderRadius: '9px 2px' }}
            >
              {isVictory
                ? <Crown className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: accent }} strokeWidth={2} />
                : <Skull className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: accent }} strokeWidth={2} />}
            </div>
            <p className="font-hud mb-1.5 text-[10px] font-semibold uppercase tracking-[0.42em]" style={{ color: `${accent}cc` }}>
              {isVictory ? 'Run Complete' : 'Run Ended'}
            </p>
            <h1
              className="font-display text-4xl font-semibold uppercase sm:text-6xl"
              style={{ color: accent, letterSpacing: '0.14em', paddingLeft: '0.14em', textShadow: `0 0 34px ${accent}55` }}
            >
              {isVictory ? 'Victory' : 'Game Over'}
            </h1>
            <div className="mx-auto mt-3 h-px w-48" style={{ background: `linear-gradient(90deg, transparent, ${accent}99, transparent)` }} />
            <p className="font-hud mt-3 text-xs font-semibold uppercase tracking-[0.3em] sm:text-sm" style={{ color: rating.color }}>
              {rating.text}
            </p>
          </div>

          {/* Score hero + stats */}
          <div className="mb-4 overflow-hidden border border-white/[0.09] bg-[#060b09]/[0.92] sm:mb-6" style={{ borderRadius: SHAPE }}>
            <div className="flex items-end justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-2.5 pb-1.5">
                <Trophy className="h-[18px] w-[18px] text-amber-300" strokeWidth={2.25} />
                <span className="hud-label">Final Score</span>
              </div>
              <span className="hud-num text-[46px] text-white sm:text-[54px]">{score.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2">
              {stats.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className={`flex items-center gap-3 px-5 py-3.5 ${i === 0 ? 'border-r border-white/[0.07]' : ''}`}>
                    <Icon className="h-[17px] w-[17px] flex-shrink-0" style={{ color: s.color }} strokeWidth={2.25} />
                    <div className="min-w-0">
                      <div className="hud-label" style={{ fontSize: 9 }}>{s.label}</div>
                      <div className="hud-num mt-1 text-[26px] text-white">{s.value}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onRestart}
              className="font-hud group flex flex-1 items-center justify-center gap-2 px-4 py-3.5
                text-sm font-bold uppercase tracking-[0.22em] text-[#04130a] transition-all duration-200
                hover:-translate-y-0.5 hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #2ee8b4, #22c55e)', borderRadius: SHAPE }}
            >
              <RotateCcw className="h-[18px] w-[18px] transition-transform duration-500 group-hover:-rotate-180" strokeWidth={2.25} />
              Restart
            </button>
            <button
              onClick={onMainMenu}
              className="font-hud group flex flex-1 items-center justify-center gap-2 border border-white/[0.12] bg-[#060b09]/90 px-4 py-3.5
                text-sm font-bold uppercase tracking-[0.22em] text-white/75 transition-all duration-200 hover:border-white/30 hover:text-white"
              style={{ borderRadius: SHAPE }}
            >
              <Home className="h-[18px] w-[18px]" strokeWidth={2.25} />
              Menu
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes goFade {
          from { opacity: 0; transform: scale(0.96) translateY(14px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default GameOver;
