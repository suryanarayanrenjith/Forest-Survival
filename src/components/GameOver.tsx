import type { CSSProperties } from 'react';
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

const GameOver = ({ isVictory, score, enemiesKilled, wave, onRestart, onMainMenu }: GameOverProps) => {
  const getRating = () => {
    if (score >= 500) return { text: 'Legendary', color: '#fbbf24' };
    if (score >= 300) return { text: 'Excellent', color: '#22d3ee' };
    if (score >= 150) return { text: 'Solid Run', color: '#34d399' };
    return { text: 'Keep Going', color: '#fb923c' };
  };
  const rating = getRating();
  const accent = isVictory ? '#34d399' : '#f87171';

  const stats = [
    { icon: Trophy, label: 'Final Score', value: score.toLocaleString(), color: '#fbbf24' },
    { icon: Skull, label: 'Enemies Killed', value: `${enemiesKilled}`, color: '#f87171' },
    { icon: Waves, label: 'Waves Survived', value: `${wave}`, color: '#c084fc' },
  ];

  return (
    <div
      className="absolute inset-0 overflow-y-auto menu-overlay-in"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(8,11,16,0.94) 0%, rgba(2,4,8,0.98) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
      <div
        className="relative w-full max-w-md"
        style={{ animation: 'goFade 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="text-center mb-4 sm:mb-7">
          <div
            className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-2xl border mb-2.5 sm:mb-4"
            style={{ borderColor: `${accent}55`, background: `${accent}1a` }}
          >
            {isVictory
              ? <Crown className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: accent }} strokeWidth={2} />
              : <Skull className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: accent }} strokeWidth={2} />}
          </div>
          <p className="font-hud text-[10px] tracking-[0.36em] font-semibold uppercase mb-1.5" style={{ color: `${accent}cc` }}>
            {isVictory ? 'Run Complete' : 'Run Ended'}
          </p>
          <h1
            className="font-display text-3xl sm:text-5xl font-semibold tracking-[0.1em] uppercase"
            style={{ color: accent }}
          >
            {isVictory ? 'Victory' : 'Game Over'}
          </h1>
          <p className="font-hud mt-1.5 sm:mt-2 text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase" style={{ color: rating.color }}>
            {rating.text}
          </p>
        </div>

        {/* Stats */}
        <div
          className="hud-frame rounded-2xl border bg-white/[0.03] backdrop-blur-md overflow-hidden mb-4 sm:mb-6"
          style={{ borderColor: `${accent}26`, '--hud-bracket': `${accent}66` } as CSSProperties}
        >
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className={`flex items-center justify-between px-4 py-2.5 sm:px-5 sm:py-4 ${i < stats.length - 1 ? 'border-b border-white/[0.07]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-[18px] h-[18px]" style={{ color: s.color }} strokeWidth={2.25} />
                  <span className="font-hud text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase">{s.label}</span>
                </div>
                <span className="font-display text-2xl font-semibold text-white tabular-nums">{s.value}</span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onRestart}
            className="font-hud group flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3.5
              text-sm font-bold uppercase tracking-wider text-[#04130a] transition-all duration-200
              hover:-translate-y-0.5 hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)', boxShadow: '0 12px 30px -12px rgba(46,232,180,0.6)' }}
          >
            <RotateCcw className="w-[18px] h-[18px] group-hover:-rotate-180 transition-transform duration-500" strokeWidth={2.25} />
            Restart
          </button>
          <button
            onClick={onMainMenu}
            className="font-hud group flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3.5
              border border-white/10 bg-white/[0.04] text-gray-300 text-sm font-bold uppercase tracking-wider
              transition-all duration-200 hover:bg-white/[0.08] hover:text-white hover:border-white/20"
          >
            <Home className="w-[18px] h-[18px]" strokeWidth={2.25} />
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
