import type { PlayerData } from '../utils/MultiplayerManager';

interface MultiplayerGameOverProps {
  winnerId: string;
  finalStats: PlayerData[];
  localPlayerId: string;
  onRestart: () => void;
  onMainMenu: () => void;
  t?: (key: string) => string;
}

// Safe color formatting to handle edge cases
const formatColor = (color: number): string => {
  if (typeof color !== 'number' || color < 0) {
    return '#ffffff';
  }
  return `#${Math.abs(color).toString(16).padStart(6, '0')}`;
};

// Safe K/D ratio calculation
const calculateKD = (kills: number, deaths: number): string => {
  if (deaths === 0) {
    return kills.toString();
  }
  return (kills / deaths).toFixed(1);
};

const MultiplayerGameOver = ({
  winnerId,
  finalStats,
  localPlayerId,
  onRestart,
  onMainMenu
}: MultiplayerGameOverProps) => {
  const sortedPlayers = [...finalStats].sort((a, b) => {
    // Sort by kills first, then by score
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.score - a.score;
  });

  // Winner is always the one with most kills (first in sorted list)
  // Use winnerId as fallback for backwards compatibility
  const winner = sortedPlayers[0] || sortedPlayers.find(p => p.id === winnerId);
  const localPlayer = sortedPlayers.find(p => p.id === localPlayerId);
  const isLocalWinner = winner?.id === localPlayerId;
  const localRank = sortedPlayers.findIndex(p => p.id === localPlayerId) + 1;

  const getMedalEmoji = (rank: number) => {
    if (rank === 0) return '🥇';
    if (rank === 1) return '🥈';
    if (rank === 2) return '🥉';
    return '🎖️';
  };

  const getRankColor = (rank: number) => {
    if (rank === 0) return 'text-yellow-400';
    if (rank === 1) return 'text-gray-300';
    if (rank === 2) return 'text-orange-400';
    return 'text-gray-400';
  };

  const getRankBg = (rank: number, isLocal: boolean, isWinner: boolean) => {
    if (isLocal && isWinner) return 'bg-gradient-to-r from-yellow-900/60 to-green-900/60 border-2 border-yellow-400';
    if (isLocal) return 'bg-green-900/50 border-2 border-green-400';
    if (isWinner) return 'bg-yellow-900/40 border-2 border-yellow-500/60';
    if (rank === 1) return 'bg-gray-800/50 border border-gray-500/40';
    if (rank === 2) return 'bg-orange-900/30 border border-orange-500/30';
    return 'bg-gray-800/30 border border-gray-600/30';
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4" style={{ zIndex: 200 }}>
      <div className="glass-panel rounded-2xl p-3 sm:p-5 lg:p-8 w-full max-w-4xl max-h-[98vh] overflow-y-auto border-2 border-green-500/40 shadow-2xl animate-scaleIn">
        {/* Header */}
        <div className="text-center mb-3 sm:mb-5">
          <h1
            className={`text-2xl sm:text-4xl lg:text-5xl font-bold mb-2 sm:mb-3 ${
              isLocalWinner ? 'text-yellow-400 animate-victory-glow' : 'text-red-400 animate-defeat-pulse'
            }`}
          >
            {isLocalWinner ? '🎉 VICTORY! 🎉' : '💀 GAME OVER 💀'}
          </h1>

          {winner && (
            <div className="space-y-1">
              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-green-400 flex items-center justify-center gap-2 flex-wrap">
                <span className="text-xl sm:text-2xl">👑</span>
                <span className="truncate max-w-[200px] sm:max-w-none">WINNER: {winner.name}</span>
                <span className="text-xl sm:text-2xl">👑</span>
              </div>
              <div className="text-sm sm:text-base lg:text-lg text-gray-300">
                <span className="text-orange-400 font-bold">{winner.kills}</span> Kills
                <span className="mx-2 text-gray-500">•</span>
                <span className="text-blue-400 font-bold">{winner.score}</span> Score
              </div>
            </div>
          )}

          {localPlayer && !isLocalWinner && (
            <div className="mt-2 sm:mt-3 inline-block bg-gray-800/60 rounded-lg px-3 py-1.5 border border-gray-600/50">
              <span className="text-yellow-400 font-bold text-xs sm:text-sm">
                Your Rank: #{localRank} of {sortedPlayers.length}
              </span>
            </div>
          )}
        </div>

        {/* Scoreboard */}
        <div className="glass-panel rounded-xl p-2 sm:p-4 mb-3 sm:mb-5 max-h-[35vh] sm:max-h-[40vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
          <h2 className="text-base sm:text-lg lg:text-xl font-bold text-green-400 mb-2 sm:mb-3 flex items-center gap-2">
            <span>📊</span> FINAL SCOREBOARD
          </h2>

          <div className="space-y-1.5 sm:space-y-2">
            {sortedPlayers.map((player, index) => {
              const isLocalPlayer = player.id === localPlayerId;
              const isWinner = index === 0;

              return (
                <div
                  key={player.id}
                  className={`p-2 sm:p-3 rounded-lg transition-all ${getRankBg(index, isLocalPlayer, isWinner)} ${
                    isLocalPlayer ? 'scale-[1.01] shadow-lg' : ''
                  } animate-slideInRight`}
                  style={{ animationDelay: `${index * 0.08}s` }}
                >
                  <div className="flex items-center gap-1.5 sm:gap-3">
                    {/* Rank & Medal */}
                    <div className="flex items-center gap-1 min-w-[40px] sm:min-w-[60px]">
                      <span className={`text-lg sm:text-2xl ${getRankColor(index)}`}>
                        {getMedalEmoji(index)}
                      </span>
                      <span className={`text-sm sm:text-lg font-bold ${getRankColor(index)}`}>
                        #{index + 1}
                      </span>
                    </div>

                    {/* Player Color */}
                    <div
                      className="w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-white/40 flex-shrink-0 shadow-lg"
                      style={{ backgroundColor: formatColor(player.color) }}
                    />

                    {/* Player Name & Tags */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs sm:text-sm lg:text-base font-bold text-white truncate max-w-[100px] sm:max-w-[150px] md:max-w-none">
                          {player.name}
                        </span>
                        {isLocalPlayer && (
                          <span className="px-1 sm:px-1.5 py-0.5 bg-green-500/30 text-green-300 text-[8px] sm:text-[10px] font-bold rounded border border-green-500/50">
                            YOU
                          </span>
                        )}
                        {isWinner && (
                          <span className="hidden sm:inline-flex items-center px-1 sm:px-1.5 py-0.5 bg-yellow-500/30 text-yellow-300 text-[8px] sm:text-[10px] font-bold rounded border border-yellow-500/50">
                            👑
                          </span>
                        )}
                        {!player.isAlive && (
                          <span className="text-red-400 text-[10px] sm:text-xs hidden sm:inline">💀</span>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-2 sm:gap-4 text-center flex-shrink-0">
                      <div className="min-w-[28px] sm:min-w-[40px]">
                        <div className="text-orange-400 text-sm sm:text-lg font-bold">{player.kills}</div>
                        <div className="text-gray-500 text-[8px] sm:text-[10px] hidden sm:block">Kills</div>
                      </div>
                      <div className="min-w-[28px] sm:min-w-[40px] hidden md:block">
                        <div className="text-gray-400 text-sm sm:text-lg font-bold">{player.deaths}</div>
                        <div className="text-gray-500 text-[8px] sm:text-[10px]">Deaths</div>
                      </div>
                      <div className="min-w-[32px] sm:min-w-[45px]">
                        <div className="text-blue-400 text-sm sm:text-lg font-bold">{player.score}</div>
                        <div className="text-gray-500 text-[8px] sm:text-[10px] hidden sm:block">Score</div>
                      </div>
                      <div className="min-w-[28px] sm:min-w-[40px] hidden sm:block">
                        <div className="text-green-400 text-sm sm:text-lg font-bold">
                          {calculateKD(player.kills, player.deaths)}
                        </div>
                        <div className="text-gray-500 text-[8px] sm:text-[10px]">K/D</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team Stats Summary */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3 mb-3 sm:mb-5">
          <div className="glass-panel rounded-lg p-1.5 sm:p-3 text-center border border-orange-500/30">
            <div className="text-orange-400 text-lg sm:text-2xl font-bold">
              {sortedPlayers.reduce((sum, p) => sum + p.kills, 0)}
            </div>
            <div className="text-gray-400 text-[8px] sm:text-xs">Total Kills</div>
          </div>
          <div className="glass-panel rounded-lg p-1.5 sm:p-3 text-center border border-blue-500/30">
            <div className="text-blue-400 text-lg sm:text-2xl font-bold">
              {sortedPlayers.reduce((sum, p) => sum + p.score, 0)}
            </div>
            <div className="text-gray-400 text-[8px] sm:text-xs">Total Score</div>
          </div>
          <div className="glass-panel rounded-lg p-1.5 sm:p-3 text-center border border-green-500/30">
            <div className="text-green-400 text-lg sm:text-2xl font-bold">
              {sortedPlayers.filter(p => p.isAlive).length}
            </div>
            <div className="text-gray-400 text-[8px] sm:text-xs">Survived</div>
          </div>
          <div className="glass-panel rounded-lg p-1.5 sm:p-3 text-center border border-purple-500/30">
            <div className="text-purple-400 text-lg sm:text-2xl font-bold">
              {sortedPlayers.length}
            </div>
            <div className="text-gray-400 text-[8px] sm:text-xs">Players</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={onRestart}
            className="flex-1 px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-lg font-bold text-black bg-gradient-to-r from-green-400 to-green-600 rounded-lg hover:from-green-500 hover:to-green-700 transition-all transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-green-500/30"
          >
            🔄 PLAY AGAIN
          </button>
          <button
            onClick={onMainMenu}
            className="px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-lg font-bold text-gray-300 bg-gray-800/70 rounded-lg border border-gray-600/50 hover:border-gray-500 hover:bg-gray-700/70 transition-all transform hover:scale-105 active:scale-95"
          >
            🏠 MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerGameOver;
