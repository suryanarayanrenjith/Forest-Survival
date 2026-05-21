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
      className="absolute inset-0 flex items-center justify-center overflow-y-auto p-4"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(8,11,16,0.94) 0%, rgba(2,4,8,0.98) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        className="relative w-full max-w-md"
        style={{ animation: 'goFade 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="text-center mb-7">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border mb-4"
            style={{ borderColor: `${accent}55`, background: `${accent}1a` }}
          >
            {isVictory
              ? <Crown className="w-8 h-8" style={{ color: accent }} strokeWidth={2} />
              : <Skull className="w-8 h-8" style={{ color: accent }} strokeWidth={2} />}
          </div>
          <h1
            className="text-4xl sm:text-5xl font-bold tracking-[0.12em] uppercase"
            style={{ color: accent }}
          >
            {isVictory ? 'Victory' : 'Game Over'}
          </h1>
          <p className="mt-2 text-sm font-semibold tracking-[0.2em] uppercase" style={{ color: rating.color }}>
            {rating.text}
          </p>
        </div>

        {/* Stats */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden mb-6">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className={`flex items-center justify-between px-5 py-4 ${i < stats.length - 1 ? 'border-b border-white/[0.07]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4.5 h-4.5" style={{ color: s.color }} strokeWidth={2.25} />
                  <span className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase">{s.label}</span>
                </div>
                <span className="text-2xl font-bold text-white tabular-nums">{s.value}</span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onRestart}
            className="group flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3.5
              border border-emerald-400/40 bg-emerald-500/15 text-emerald-300 font-bold tracking-wide
              transition-all duration-200 hover:bg-emerald-500/25 hover:border-emerald-400/70"
          >
            <RotateCcw className="w-4.5 h-4.5 group-hover:-rotate-180 transition-transform duration-500" strokeWidth={2.25} />
            Restart
          </button>
          <button
            onClick={onMainMenu}
            className="group flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3.5
              border border-white/10 bg-white/[0.04] text-gray-300 font-bold tracking-wide
              transition-all duration-200 hover:bg-white/[0.08] hover:text-white hover:border-white/20"
          >
            <Home className="w-4.5 h-4.5" strokeWidth={2.25} />
            Menu
          </button>
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
