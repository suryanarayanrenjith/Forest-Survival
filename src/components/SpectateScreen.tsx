import { Skull, Crosshair, Star, Activity, Home, Medal } from 'lucide-react';
import type { PlayerData } from '../utils/MultiplayerManager';

interface SpectateScreenProps {
  localPlayer: PlayerData;
  alivePlayers: PlayerData[];
  allPlayers: PlayerData[];
  onMainMenu: () => void;
}

const formatColor = (color: number): string => {
  if (typeof color !== 'number' || color < 0) return '#ffffff';
  return `#${Math.abs(color).toString(16).padStart(6, '0')}`;
};

const calculateKD = (kills: number, deaths: number): string => {
  if (deaths === 0) return kills.toString();
  return (kills / deaths).toFixed(2);
};

const rankColor = (rank: number) => (rank === 0 ? '#fbbf24' : rank === 1 ? '#cbd5e1' : rank === 2 ? '#fb923c' : '#64748b');

const SpectateScreen = ({ localPlayer, alivePlayers, allPlayers, onMainMenu }: SpectateScreenProps) => {
  const sortedPlayers = [...allPlayers].sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.score - a.score;
  });
  const localRank = sortedPlayers.findIndex((p) => p.id === localPlayer.id) + 1;

  const stats = [
    { label: 'Kills', value: localPlayer.kills, color: '#fb923c' },
    { label: 'Deaths', value: localPlayer.deaths, color: '#f87171' },
    { label: 'Score', value: localPlayer.score, color: '#38bdf8' },
    { label: 'K/D', value: calculateKD(localPlayer.kills, localPlayer.deaths), color: '#34d399' },
  ];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 150, background: 'rgba(5,8,10,0.94)', backdropFilter: 'blur(12px)' }}
    >
      <div className="w-full max-w-3xl max-h-[94vh] overflow-y-auto space-y-4">
        {/* Eliminated banner */}
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-6 py-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/15 mb-3">
            <Skull className="w-6 h-6 text-red-400" strokeWidth={2} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[0.15em] text-red-400 uppercase">Eliminated</h1>
          <p className="mt-1 text-sm text-gray-400">
            {alivePlayers.length} {alivePlayers.length === 1 ? 'player' : 'players'} still fighting · spectating
          </p>
        </div>

        {/* Your stats */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
              style={{ background: `${rankColor(localRank - 1)}22` }}
            >
              <Medal className="w-6 h-6" style={{ color: rankColor(localRank - 1) }} strokeWidth={2} />
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase">Your Placement</div>
              <div className="text-2xl font-bold text-white">Rank #{localRank}</div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 text-center">
                <div className="text-xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[10px] font-semibold tracking-[0.1em] text-gray-500 uppercase mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live scoreboard */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.07]">
            <Activity className="w-4 h-4 text-emerald-400" strokeWidth={2.25} />
            <h2 className="text-[11px] font-semibold tracking-[0.2em] text-gray-300 uppercase">Live Scoreboard</h2>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {sortedPlayers.map((player, index) => {
              const isLocal = player.id === localPlayer.id;
              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 px-5 py-3 border-b border-white/[0.05] last:border-0 ${
                    isLocal ? 'bg-emerald-500/[0.06]' : ''
                  } ${!player.isAlive ? 'opacity-50' : ''}`}
                >
                  <span className="w-6 text-sm font-bold text-gray-500 tabular-nums">{index + 1}</span>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: formatColor(player.color) }} />
                  <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">
                    {player.name}
                    {isLocal && <span className="text-emerald-400 ml-1.5 text-xs">· you</span>}
                  </span>
                  {player.isAlive ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                      <Activity className="w-3 h-3" strokeWidth={2.5} /> Alive
                    </span>
                  ) : (
                    <Skull className="w-3.5 h-3.5 text-gray-600" strokeWidth={2.25} />
                  )}
                  <span className="flex items-center gap-1 text-orange-300 text-sm font-semibold tabular-nums w-12 justify-end">
                    <Crosshair className="w-3 h-3" strokeWidth={2.5} />{player.kills}
                  </span>
                  <span className="flex items-center gap-1 text-cyan-300 text-sm font-semibold tabular-nums w-14 justify-end">
                    <Star className="w-3 h-3" strokeWidth={2.5} />{player.score}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action */}
        <div className="flex justify-center">
          <button
            onClick={onMainMenu}
            className="group flex items-center gap-2 rounded-xl px-8 py-3 border border-white/10 bg-white/[0.04]
              text-sm font-bold tracking-wide text-gray-300 transition-all duration-200
              hover:text-white hover:bg-white/[0.08] hover:border-white/20"
          >
            <Home className="w-4 h-4" strokeWidth={2.25} />
            Leave to Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpectateScreen;
