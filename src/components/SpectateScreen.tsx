import type { PlayerData } from '../utils/MultiplayerManager';

interface SpectateScreenProps {
  localPlayer: PlayerData;
  alivePlayers: PlayerData[];
  allPlayers: PlayerData[];
  onMainMenu: () => void;
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
  return (kills / deaths).toFixed(2);
};

const SpectateScreen = ({
  localPlayer,
  alivePlayers,
  allPlayers,
  onMainMenu
}: SpectateScreenProps) => {
  const sortedPlayers = [...allPlayers].sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.score - a.score;
  });

  const localRank = sortedPlayers.findIndex(p => p.id === localPlayer.id) + 1;

  const getMedalEmoji = (rank: number) => {
    if (rank === 0) return '🥇';
    if (rank === 1) return '🥈';
    if (rank === 2) return '🥉';
    return '🎖️';
  };

  const getRankColor = (rank: number) => {
    if (rank === 0) return 'from-yellow-400 to-yellow-600';
    if (rank === 1) return 'from-gray-300 to-gray-500';
    if (rank === 2) return 'from-orange-400 to-orange-600';
    return 'from-gray-400 to-gray-600';
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" style={{ zIndex: 150 }}>
      <div className="max-w-4xl w-full mx-2 sm:mx-4 space-y-3 sm:space-y-6 max-h-[95vh] overflow-y-auto">
        {/* Elimination Banner */}
        <div className="bg-gradient-to-r from-red-900/80 to-gray-900/80 rounded-lg p-4 sm:p-8 border-2 border-red-500 shadow-2xl text-center">
          <div className="text-2xl sm:text-4xl lg:text-5xl font-black text-red-400 mb-1 sm:mb-2">
            💀 ELIMINATED 💀
          </div>
          <div className="text-base sm:text-xl lg:text-2xl text-gray-300 mb-2 sm:mb-4">
            {alivePlayers.length} {alivePlayers.length === 1 ? 'player' : 'players'} still fighting
          </div>
        </div>

        {/* Your Final Stats */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-3 sm:p-6 border-2 border-gray-600">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-center mb-3 sm:mb-4 text-gray-200">YOUR FINAL STATS</h2>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4 mb-3 sm:mb-4">
            {/* Rank - Full width on mobile */}
            <div className="col-span-3 sm:col-span-1 bg-gray-800/50 rounded-lg p-2 sm:p-4 text-center">
              <div className={`text-3xl sm:text-5xl bg-gradient-to-r ${getRankColor(localRank - 1)} bg-clip-text text-transparent`}>
                {getMedalEmoji(localRank - 1)}
              </div>
              <div className="text-lg sm:text-2xl font-bold text-white">#{localRank}</div>
              <div className="text-gray-400 text-xs sm:text-sm">Rank</div>
            </div>

            {/* Stats Grid */}
            <div className="bg-orange-900/30 rounded-lg p-2 sm:p-4 text-center border border-orange-500/30">
              <div className="text-orange-400 text-xl sm:text-3xl font-bold">{localPlayer.kills}</div>
              <div className="text-gray-400 text-[10px] sm:text-sm">Kills</div>
            </div>

            <div className="bg-red-900/30 rounded-lg p-2 sm:p-4 text-center border border-red-500/30">
              <div className="text-red-400 text-xl sm:text-3xl font-bold">{localPlayer.deaths}</div>
              <div className="text-gray-400 text-[10px] sm:text-sm">Deaths</div>
            </div>

            <div className="bg-blue-900/30 rounded-lg p-2 sm:p-4 text-center border border-blue-500/30">
              <div className="text-blue-400 text-xl sm:text-3xl font-bold">{localPlayer.score}</div>
              <div className="text-gray-400 text-[10px] sm:text-sm">Score</div>
            </div>

            <div className="bg-green-900/30 rounded-lg p-2 sm:p-4 text-center border border-green-500/30">
              <div className="text-green-400 text-xl sm:text-3xl font-bold">
                {calculateKD(localPlayer.kills, localPlayer.deaths)}
              </div>
              <div className="text-gray-400 text-[10px] sm:text-sm">K/D</div>
            </div>
          </div>
        </div>

        {/* Live Scoreboard */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-3 sm:p-6 border-2 border-green-500/50">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-center mb-3 sm:mb-4 text-green-400">
            🎮 LIVE SCOREBOARD 🎮
          </h2>

          <div className="space-y-1.5 sm:space-y-2 max-h-[200px] sm:max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`p-2 sm:p-3 rounded-lg transition-all ${
                  player.id === localPlayer.id
                    ? 'bg-red-900/40 border-2 border-red-400'
                    : player.isAlive
                    ? 'bg-green-900/30 border border-green-500/30'
                    : 'bg-gray-800/40 border border-gray-600/20 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Rank */}
                  <div className="text-lg sm:text-2xl font-bold text-gray-400 w-7 sm:w-10 flex-shrink-0">
                    #{index + 1}
                  </div>

                  {/* Player Color */}
                  <div
                    className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-white/50 flex-shrink-0"
                    style={{ backgroundColor: formatColor(player.color) }}
                  />

                  {/* Player Name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                      <span className="text-sm sm:text-lg font-bold text-white truncate">{player.name}</span>
                      {player.id === localPlayer.id && (
                        <span className="text-red-400 text-[10px] sm:text-xs font-bold">(YOU)</span>
                      )}
                      {player.isAlive ? (
                        <span className="text-green-400 text-[10px] sm:text-xs font-bold animate-pulse">⚡ ALIVE</span>
                      ) : (
                        <span className="text-gray-500 text-[10px] sm:text-xs">💀</span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-2 sm:gap-4 text-xs sm:text-sm flex-shrink-0">
                    <div className="text-center">
                      <div className="text-orange-400 font-bold">{player.kills}</div>
                      <div className="text-gray-500 text-[8px] sm:text-xs hidden sm:block">K</div>
                    </div>
                    <div className="text-center">
                      <div className="text-blue-400 font-bold">{player.score}</div>
                      <div className="text-gray-500 text-[8px] sm:text-xs hidden sm:block">S</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Scroll indicator */}
          {sortedPlayers.length > 4 && (
            <div className="text-center text-gray-500 text-[10px] sm:text-xs mt-2 animate-bounce">
              ↓ Scroll for more ↓
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex justify-center">
          <button
            onClick={onMainMenu}
            className="px-8 sm:px-12 py-3 sm:py-4 text-base sm:text-xl font-bold text-gray-300 bg-gray-800/80 rounded-lg border-2 border-gray-600 hover:border-gray-400 hover:bg-gray-700/80 transition-all transform hover:scale-105 shadow-lg"
          >
            <span className="hidden sm:inline">LEAVE TO </span>MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpectateScreen;
