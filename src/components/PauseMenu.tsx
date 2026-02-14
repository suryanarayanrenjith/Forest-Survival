interface PauseMenuProps {
  health: number;
  ammo: number;
  maxAmmo: number;
  enemiesKilled: number;
  score: number;
  wave: number;
  onMainMenu: () => void;
  onSkillTree: () => void;
  t: (key: string) => string;
}

const PauseMenu = ({ health, ammo, maxAmmo, enemiesKilled, score, wave, onMainMenu, onSkillTree }: PauseMenuProps) => {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-y-auto p-3 sm:p-4"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(17, 24, 39, 0.95) 0%, rgba(3, 7, 18, 0.98) 100%)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Animated corner accents */}
      <div className="absolute top-0 left-0 w-32 h-32 bg-yellow-500/10 blur-[80px] rounded-full" />
      <div className="absolute bottom-0 right-0 w-32 h-32 bg-yellow-500/10 blur-[80px] rounded-full" />

      {/* Content */}
      <div className="relative z-10 text-center max-w-md w-full py-4 my-auto" style={{ animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
        {/* Pause Title */}
        <div className="relative mb-4 sm:mb-6">
          <div className="absolute inset-0 blur-3xl bg-yellow-500/20 scale-150" />
          <h1
            className="relative text-4xl sm:text-5xl md:text-6xl font-black text-yellow-400"
            style={{
              textShadow: '0 0 30px rgba(250, 204, 21, 0.6), 0 0 60px rgba(250, 204, 21, 0.3)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '0.02em',
            }}
          >
            ⏸️ PAUSED
          </h1>
          <p className="relative text-sm sm:text-base md:text-lg text-gray-400 mt-2 font-medium">
            Press <kbd className="px-2 py-0.5 bg-gray-700 rounded text-yellow-400 font-mono text-sm">ESC</kbd> to Resume
          </p>
        </div>

        {/* Stats Container */}
        <div
          className="relative rounded-2xl sm:rounded-3xl overflow-hidden mb-4 sm:mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(250, 204, 21, 0.2)',
          }}
        >
          {/* Header */}
          <div
            className="px-4 sm:px-6 py-2.5 sm:py-3 border-b"
            style={{ borderColor: 'rgba(250, 204, 21, 0.15)' }}
          >
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-green-400 flex items-center justify-center gap-2">
              <span className="text-lg sm:text-xl">📊</span>
              <span>CURRENT STATUS</span>
            </h2>
          </div>

          {/* Stats Grid */}
          <div className="p-3 sm:p-4 grid grid-cols-2 gap-2 sm:gap-3">
            {/* Health */}
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(239,68,68,0.04) 100%)',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
            >
              <div className="p-2.5 sm:p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                  <span className="text-base sm:text-lg">❤️</span>
                  <span className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide">Health</span>
                </div>
                <span
                  className="text-xl sm:text-2xl md:text-3xl font-black text-red-400 tabular-nums block"
                  style={{ textShadow: '0 0 10px rgba(239,68,68,0.4)' }}
                >
                  {Math.floor(health)}
                </span>
              </div>
            </div>

            {/* Ammo */}
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(234,179,8,0.12) 0%, rgba(234,179,8,0.04) 100%)',
                border: '1px solid rgba(234,179,8,0.25)',
              }}
            >
              <div className="p-2.5 sm:p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                  <span className="text-base sm:text-lg">🔫</span>
                  <span className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide">Ammo</span>
                </div>
                <span
                  className="text-xl sm:text-2xl md:text-3xl font-black text-yellow-400 tabular-nums block"
                  style={{ textShadow: '0 0 10px rgba(234,179,8,0.4)' }}
                >
                  {ammo}<span className="text-base sm:text-lg text-gray-500">/{maxAmmo}</span>
                </span>
              </div>
            </div>

            {/* Kills */}
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(168,85,247,0.04) 100%)',
                border: '1px solid rgba(168,85,247,0.25)',
              }}
            >
              <div className="p-2.5 sm:p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                  <span className="text-base sm:text-lg">💀</span>
                  <span className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide">Kills</span>
                </div>
                <span
                  className="text-xl sm:text-2xl md:text-3xl font-black text-purple-400 tabular-nums block"
                  style={{ textShadow: '0 0 10px rgba(168,85,247,0.4)' }}
                >
                  {enemiesKilled}
                </span>
              </div>
            </div>

            {/* Wave */}
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)',
                border: '1px solid rgba(34,197,94,0.25)',
              }}
            >
              <div className="p-2.5 sm:p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                  <span className="text-base sm:text-lg">🌊</span>
                  <span className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide">Wave</span>
                </div>
                <span
                  className="text-xl sm:text-2xl md:text-3xl font-black text-green-400 tabular-nums block"
                  style={{ textShadow: '0 0 10px rgba(34,197,94,0.4)' }}
                >
                  {wave}
                </span>
              </div>
            </div>
          </div>

          {/* Score - Full Width */}
          <div
            className="mx-3 sm:mx-4 mb-3 sm:mb-4 rounded-xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.12) 0%, rgba(34,211,238,0.04) 100%)',
              border: '1px solid rgba(34,211,238,0.25)',
            }}
          >
            <div className="p-3 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl">⭐</span>
                <span className="text-sm sm:text-base font-bold text-gray-300">SCORE</span>
              </div>
              <span
                className="text-2xl sm:text-3xl md:text-4xl font-black text-cyan-400 tabular-nums"
                style={{ textShadow: '0 0 15px rgba(34,211,238,0.5)' }}
              >
                {score.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Skill Tree Button */}
        <button
          onClick={onSkillTree}
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-700 via-purple-700 to-cyan-700 group-hover:from-cyan-600 group-hover:via-purple-600 group-hover:to-cyan-600 transition-all duration-300" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
          <div className="absolute inset-0 rounded-xl sm:rounded-2xl border-2 border-purple-500/60 group-hover:border-purple-400/80 transition-colors duration-300" />
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </div>
          <div className="relative px-8 sm:px-12 py-3 sm:py-4 flex items-center justify-center gap-2">
            <span className="text-lg sm:text-xl">🧠</span>
            <span className="text-base sm:text-xl font-black text-white">SKILL TREE</span>
          </div>
        </button>

        {/* Main Menu Button */}
        <button
          onClick={onMainMenu}
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-red-700 via-red-600 to-red-700 group-hover:from-red-600 group-hover:via-red-500 group-hover:to-red-600 transition-all duration-300" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
          <div className="absolute inset-0 rounded-xl sm:rounded-2xl border-2 border-red-500/60 group-hover:border-red-400/80 transition-colors duration-300" />
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </div>
          <div className="relative px-8 sm:px-12 py-3 sm:py-4 flex items-center justify-center gap-2">
            <span className="text-lg sm:text-xl">🏠</span>
            <span className="text-base sm:text-xl font-black text-white">MAIN MENU</span>
          </div>
        </button>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(20px);
            filter: blur(5px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
            filter: blur(0);
          }
        }
      `}</style>
    </div>
  );
};

export default PauseMenu;
