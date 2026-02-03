import type { PlayerData } from '../utils/MultiplayerManager';

interface MultiplayerHUDProps {
  localPlayer: PlayerData;
  remotePlayers: PlayerData[];
  remainingTime: number | null;
  gameMode: 'coop' | 'survival';
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

const MultiplayerHUD = ({ localPlayer, remotePlayers, remainingTime, gameMode }: MultiplayerHUDProps) => {
  const allPlayers = [localPlayer, ...remotePlayers].sort((a, b) => b.kills - a.kills);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="absolute top-2 sm:top-4 right-2 sm:right-4 space-y-2 sm:space-y-3" style={{ zIndex: 20 }}>
      {/* Time Limit Display */}
      {remainingTime !== null && (
        <div className="bg-black/80 backdrop-blur-sm border-2 border-yellow-500/50 rounded-lg p-2 sm:p-3 min-w-[140px] sm:min-w-[180px]">
          <div className="text-yellow-400 font-bold text-center text-base sm:text-xl">
            ⏱️ {formatTime(remainingTime)}
          </div>
          {remainingTime < 30 && (
            <div className="text-red-400 text-[10px] sm:text-xs text-center animate-pulse mt-1">
              TIME RUNNING OUT!
            </div>
          )}
        </div>
      )}

      {/* Game Mode Display */}
      <div className="bg-black/80 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-1.5 sm:p-2 min-w-[140px] sm:min-w-[180px]">
        <div className="text-blue-400 font-bold text-center text-[10px] sm:text-sm">
          {gameMode === 'coop' ? '👥 CO-OP' : '⚔️ SURVIVAL'}
        </div>
      </div>

      {/* Players List - Responsive and Scrollable */}
      <div className="bg-black/80 backdrop-blur-sm border-2 border-green-500/50 rounded-lg p-2 sm:p-3 min-w-[200px] sm:min-w-[260px] max-w-[280px]">
        <div className="text-green-400 font-bold text-xs sm:text-sm mb-1.5 sm:mb-2 border-b border-green-500/30 pb-1.5 sm:pb-2 flex items-center justify-between">
          <span>PLAYERS ({allPlayers.length})</span>
          <span className="text-[10px] sm:text-xs text-gray-400">K/D/S</span>
        </div>

        <div className="space-y-1.5 sm:space-y-2 max-h-[250px] sm:max-h-[350px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {allPlayers.map((player, index) => (
            <div
              key={player.id}
              className={`p-1.5 sm:p-2 rounded ${
                player.id === localPlayer.id
                  ? 'bg-green-900/40 border border-green-400/50'
                  : 'bg-gray-900/40'
              } ${!player.isAlive ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                {/* Rank */}
                <div className="text-yellow-400 font-bold text-xs sm:text-base w-4 sm:w-6 flex-shrink-0">
                  #{index + 1}
                </div>

                {/* Player Color */}
                <div
                  className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: formatColor(player.color) }}
                />

                {/* Player Name */}
                <div className="flex-1 text-white font-semibold text-[10px] sm:text-sm truncate min-w-0">
                  {player.name}
                  {player.id === localPlayer.id && (
                    <span className="text-green-400 text-[8px] sm:text-xs ml-1">(YOU)</span>
                  )}
                </div>

                {/* Status */}
                {!player.isAlive && (
                  <div className="text-red-400 text-[8px] sm:text-xs font-bold flex-shrink-0">💀</div>
                )}
              </div>

              {/* Stats Row - Compact */}
              <div className="flex gap-2 sm:gap-3 text-[9px] sm:text-xs pl-5 sm:pl-7">
                {/* Kills */}
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <span className="text-orange-400">💀</span>
                  <span className="text-orange-400 font-medium">{player.kills}</span>
                </div>

                {/* Deaths */}
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <span className="text-gray-400">☠️</span>
                  <span className="text-gray-400">{player.deaths}</span>
                </div>

                {/* Score */}
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <span className="text-blue-400">⭐</span>
                  <span className="text-blue-400">{player.score}</span>
                </div>

                {/* K/D - Hidden on mobile */}
                <div className="hidden sm:flex items-center gap-0.5 sm:gap-1">
                  <span className="text-purple-400 text-[10px]">K/D:</span>
                  <span className="text-purple-400">{calculateKD(player.kills, player.deaths)}</span>
                </div>
              </div>

              {/* Health Bar - Simplified on mobile */}
              {player.isAlive && (
                <div className="mt-1 sm:mt-1.5 h-1 sm:h-1.5 bg-gray-700 rounded-full overflow-hidden ml-5 sm:ml-7">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${(player.health / player.maxHealth) * 100}%`,
                      backgroundColor:
                        player.health > 50
                          ? '#4ade80'
                          : player.health > 25
                          ? '#facc15'
                          : '#ef4444'
                    }}
                  />
                </div>
              )}

              {/* Current Weapon - Hidden on very small screens */}
              <div className="hidden sm:block mt-0.5 sm:mt-1 text-[9px] sm:text-xs text-gray-400 pl-5 sm:pl-7">
                🔫 {player.currentWeapon.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats Summary - Compact on mobile */}
      <div className="bg-black/80 backdrop-blur-sm border-2 border-purple-500/50 rounded-lg p-2 sm:p-3 min-w-[140px] sm:min-w-[180px]">
        <div className="text-purple-400 font-bold text-[10px] sm:text-xs mb-1.5 sm:mb-2">TEAM STATS</div>
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
          <div className="text-center">
            <div className="text-gray-400 text-[8px] sm:text-[10px]">Total Kills</div>
            <div className="text-orange-400 font-bold text-sm sm:text-lg">
              {allPlayers.reduce((sum, p) => sum + p.kills, 0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400 text-[8px] sm:text-[10px]">Alive</div>
            <div className="text-green-400 font-bold text-sm sm:text-lg">
              {allPlayers.filter(p => p.isAlive).length}/{allPlayers.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerHUD;
