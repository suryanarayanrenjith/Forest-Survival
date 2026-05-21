import { Timer, Users, Swords, Crosshair, Skull, Star } from 'lucide-react';
import type { PlayerData } from '../utils/MultiplayerManager';

interface MultiplayerHUDProps {
  localPlayer: PlayerData;
  remotePlayers: PlayerData[];
  remainingTime: number | null;
  gameMode: 'coop' | 'survival';
}

const formatColor = (color: number): string => {
  if (typeof color !== 'number' || color < 0) return '#ffffff';
  return `#${Math.abs(color).toString(16).padStart(6, '0')}`;
};

const calculateKD = (kills: number, deaths: number): string => {
  if (deaths === 0) return kills.toString();
  return (kills / deaths).toFixed(1);
};

const MultiplayerHUD = ({ localPlayer, remotePlayers, remainingTime, gameMode }: MultiplayerHUDProps) => {
  const allPlayers = [localPlayer, ...remotePlayers].sort((a, b) => b.kills - a.kills);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalKills = allPlayers.reduce((sum, p) => sum + p.kills, 0);
  const aliveCount = allPlayers.filter((p) => p.isAlive).length;

  return (
    <div className="absolute top-4 right-4 w-[280px] space-y-2.5" style={{ zIndex: 20 }}>
      {/* Timer + mode */}
      <div className="flex items-center gap-2.5">
        {remainingTime !== null && (
          <div
            className={`flex items-center gap-2 rounded-xl border bg-black/60 backdrop-blur-md px-3 py-2 flex-1 ${
              remainingTime < 30 ? 'border-red-500/50' : 'border-white/10'
            }`}
          >
            <Timer className={`w-4 h-4 ${remainingTime < 30 ? 'text-red-400' : 'text-amber-400'}`} strokeWidth={2.25} />
            <span className={`text-base font-bold tabular-nums ${remainingTime < 30 ? 'text-red-300' : 'text-white'}`}>
              {formatTime(remainingTime)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md px-3 py-2">
          {gameMode === 'coop'
            ? <Users className="w-4 h-4 text-sky-400" strokeWidth={2.25} />
            : <Swords className="w-4 h-4 text-rose-400" strokeWidth={2.25} />}
          <span className="text-[11px] font-bold tracking-[0.12em] text-gray-200 uppercase">
            {gameMode === 'coop' ? 'Co-op' : 'Survival'}
          </span>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="rounded-xl border border-white/10 bg-black/60 backdrop-blur-md overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.07]">
          <span className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase">
            Players · {allPlayers.length}
          </span>
          <span className="text-[10px] font-semibold tracking-[0.1em] text-gray-600 uppercase">K / D / Score</span>
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {allPlayers.map((player, index) => {
            const isLocal = player.id === localPlayer.id;
            return (
              <div
                key={player.id}
                className={`px-3 py-2 border-b border-white/[0.05] last:border-0 ${
                  isLocal ? 'bg-emerald-500/[0.07]' : ''
                } ${!player.isAlive ? 'opacity-45' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500 tabular-nums w-4">{index + 1}</span>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: formatColor(player.color) }} />
                  <span className="flex-1 min-w-0 text-xs font-semibold text-white truncate">
                    {player.name}
                    {isLocal && <span className="text-emerald-400 ml-1">· you</span>}
                  </span>
                  {!player.isAlive && <Skull className="w-3.5 h-3.5 text-red-500 flex-shrink-0" strokeWidth={2.25} />}
                </div>

                <div className="flex items-center gap-3 pl-6 mt-1 text-[11px]">
                  <span className="flex items-center gap-1 text-orange-300">
                    <Crosshair className="w-3 h-3" strokeWidth={2.5} />
                    <span className="font-semibold tabular-nums">{player.kills}</span>
                  </span>
                  <span className="flex items-center gap-1 text-gray-500">
                    <Skull className="w-3 h-3" strokeWidth={2.5} />
                    <span className="font-semibold tabular-nums">{player.deaths}</span>
                  </span>
                  <span className="flex items-center gap-1 text-cyan-300">
                    <Star className="w-3 h-3" strokeWidth={2.5} />
                    <span className="font-semibold tabular-nums">{player.score}</span>
                  </span>
                  <span className="ml-auto text-violet-300 font-semibold tabular-nums">
                    {calculateKD(player.kills, player.deaths)}
                  </span>
                </div>

                {player.isAlive && (
                  <div className="ml-6 mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${(player.health / player.maxHealth) * 100}%`,
                        backgroundColor: player.health > 50 ? '#34d399' : player.health > 25 ? '#fbbf24' : '#f87171',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Team summary */}
        <div className="flex border-t border-white/[0.07]">
          <div className="flex-1 flex items-center justify-center gap-2 py-2 border-r border-white/[0.07]">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Kills</span>
            <span className="text-sm font-bold text-orange-300 tabular-nums">{totalKills}</span>
          </div>
          <div className="flex-1 flex items-center justify-center gap-2 py-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Alive</span>
            <span className="text-sm font-bold text-emerald-300 tabular-nums">{aliveCount}/{allPlayers.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerHUD;
