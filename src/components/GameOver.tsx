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
  const getPerformanceRating = () => {
    if (score >= 500) return { text: 'LEGENDARY', color: 'text-yellow-400', glow: 'rgba(250,204,21,0.5)', icon: '👑' };
    if (score >= 300) return { text: 'EXCELLENT', color: 'text-cyan-400', glow: 'rgba(34,211,238,0.5)', icon: '⚡' };
    if (score >= 150) return { text: 'GOOD JOB', color: 'text-green-400', glow: 'rgba(34,197,94,0.5)', icon: '✨' };
    return { text: 'KEEP TRYING', color: 'text-orange-400', glow: 'rgba(251,146,60,0.5)', icon: '💪' };
  };

  const rating = getPerformanceRating();

  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-y-auto p-3 sm:p-4"
      style={{
        background: isVictory
          ? 'radial-gradient(ellipse at center, rgba(20, 83, 45, 0.95) 0%, rgba(5, 46, 22, 0.98) 50%, rgba(0, 0, 0, 0.99) 100%)'
          : 'radial-gradient(ellipse at center, rgba(127, 29, 29, 0.95) 0%, rgba(69, 10, 10, 0.98) 50%, rgba(0, 0, 0, 0.99) 100%)',
      }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className={`absolute w-1 h-1 rounded-full ${isVictory ? 'bg-green-400' : 'bg-red-400'}`}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.3,
              animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-lg w-full py-4 my-auto" style={{ animation: 'slideIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        {/* Title Section */}
        <div className="relative mb-4 sm:mb-6">
          {/* Title glow */}
          <div
            className={`absolute inset-0 blur-3xl ${isVictory ? 'bg-green-500/30' : 'bg-red-500/30'} scale-150`}
            style={{ animation: 'pulse 2s ease-in-out infinite' }}
          />

          {/* Main Title */}
          <h1
            className={`relative text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-2 ${isVictory ? 'text-green-400' : 'text-red-400'}`}
            style={{
              textShadow: isVictory
                ? '0 0 30px rgba(34, 197, 94, 0.8), 0 0 60px rgba(34, 197, 94, 0.4)'
                : '0 0 30px rgba(239, 68, 68, 0.8), 0 0 60px rgba(239, 68, 68, 0.4)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '0.02em',
            }}
          >
            {isVictory ? '🏆 VICTORY!' : '💀 GAME OVER'}
          </h1>

          {/* Subtitle */}
          {isVictory && (
            <p
              className="relative text-base sm:text-lg md:text-xl text-green-300/90 font-semibold"
              style={{ textShadow: '0 0 10px rgba(34, 197, 94, 0.3)' }}
            >
              You are a true survivor!
            </p>
          )}
        </div>

        {/* Stats Container */}
        <div
          className="relative rounded-2xl sm:rounded-3xl overflow-hidden mb-4 sm:mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 100%)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${isVictory ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          {/* Header */}
          <div
            className="px-4 sm:px-6 py-3 sm:py-4 border-b"
            style={{ borderColor: isVictory ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)' }}
          >
            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-yellow-400 flex items-center justify-center gap-2">
              <span className="text-xl sm:text-2xl">📊</span>
              <span>STATISTICS</span>
            </h2>
          </div>

          {/* Stats Grid */}
          <div className="p-3 sm:p-4 md:p-6 space-y-2 sm:space-y-3">
            {/* Score */}
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(234,179,8,0.15) 0%, rgba(234,179,8,0.05) 100%)',
                border: '1px solid rgba(234,179,8,0.3)',
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 to-transparent" />
              <div className="relative p-3 sm:p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl md:text-3xl">⭐</span>
                  <span className="text-sm sm:text-base md:text-lg font-bold text-gray-300">FINAL SCORE</span>
                </div>
                <span
                  className="text-2xl sm:text-3xl md:text-4xl font-black text-yellow-400 tabular-nums"
                  style={{ textShadow: '0 0 15px rgba(234,179,8,0.5)' }}
                >
                  {score.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Enemies Killed */}
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)',
                border: '1px solid rgba(239,68,68,0.3)',
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-transparent" />
              <div className="relative p-3 sm:p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl md:text-3xl">💀</span>
                  <span className="text-sm sm:text-base md:text-lg font-bold text-gray-300">ENEMIES KILLED</span>
                </div>
                <span
                  className="text-2xl sm:text-3xl md:text-4xl font-black text-red-400 tabular-nums"
                  style={{ textShadow: '0 0 15px rgba(239,68,68,0.5)' }}
                >
                  {enemiesKilled}
                </span>
              </div>
            </div>

            {/* Waves Survived */}
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0.05) 100%)',
                border: '1px solid rgba(168,85,247,0.3)',
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent" />
              <div className="relative p-3 sm:p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl md:text-3xl">🌊</span>
                  <span className="text-sm sm:text-base md:text-lg font-bold text-gray-300">WAVES SURVIVED</span>
                </div>
                <span
                  className="text-2xl sm:text-3xl md:text-4xl font-black text-purple-400 tabular-nums"
                  style={{ textShadow: '0 0 15px rgba(168,85,247,0.5)' }}
                >
                  {wave}
                </span>
              </div>
            </div>
          </div>

          {/* Performance Rating */}
          <div
            className="px-4 sm:px-6 py-3 sm:py-4 border-t"
            style={{ borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <div
              className={`text-xl sm:text-2xl md:text-3xl font-black ${rating.color} flex items-center justify-center gap-2`}
              style={{ textShadow: `0 0 20px ${rating.glow}` }}
            >
              <span className="text-2xl sm:text-3xl">{rating.icon}</span>
              <span>{rating.text}</span>
              <span className="text-2xl sm:text-3xl">{rating.icon}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 sm:gap-3 justify-center flex-wrap">
          {/* Restart Button */}
          <button
            onClick={onRestart}
            className="group relative overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 group-hover:from-green-500 group-hover:via-emerald-500 group-hover:to-green-500 transition-all duration-300" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
            <div className="absolute inset-0 rounded-xl sm:rounded-2xl border-2 border-green-400/60 group-hover:border-green-300/80 transition-colors duration-300" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </div>
            <div className="relative px-6 sm:px-10 py-3 sm:py-4 flex items-center gap-2">
              <span className="text-lg sm:text-xl group-hover:rotate-180 transition-transform duration-500">🔄</span>
              <span className="text-base sm:text-xl font-black text-white">RESTART</span>
            </div>
          </button>

          {/* Main Menu Button */}
          <button
            onClick={onMainMenu}
            className="group relative overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 group-hover:from-gray-600 group-hover:via-gray-500 group-hover:to-gray-600 transition-all duration-300" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
            <div className="absolute inset-0 rounded-xl sm:rounded-2xl border-2 border-gray-500/60 group-hover:border-gray-400/80 transition-colors duration-300" />
            <div className="relative px-6 sm:px-10 py-3 sm:py-4 flex items-center gap-2">
              <span className="text-lg sm:text-xl">🏠</span>
              <span className="text-base sm:text-xl font-black text-white">MENU</span>
            </div>
          </button>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes slideIn {
          0% { opacity: 0; transform: translateY(30px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default GameOver;
