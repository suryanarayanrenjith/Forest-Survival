import { useState } from 'react';
import { Crown, Skull, Crosshair, Star, Medal, RotateCcw, Home, Hourglass, Smartphone } from 'lucide-react';
import type { PlayerData } from '../utils/MultiplayerManager';
import { RANK_TIERS } from '../utils/rankSystem';
import { detectIsTouch } from '../hooks/useDeviceInfo';
import PlayerStatsModal from './PlayerStatsModal';

interface MultiplayerGameOverProps {
  winnerId: string;
  finalStats: PlayerData[];
  localPlayerId: string;
  onRestart: () => void;
  onMainMenu: () => void;
  canRestart?: boolean;
  t?: (key: string) => string;
}

const formatColor = (color: number): string => {
  if (typeof color !== 'number' || color < 0) return '#ffffff';
  return `#${Math.abs(color).toString(16).padStart(6, '0')}`;
};

const calculateKD = (kills: number, deaths: number): string => {
  if (deaths === 0) return kills.toString();
  return (kills / deaths).toFixed(1);
};

const rankColor = (rank: number) => (rank === 0 ? '#fbbf24' : rank === 1 ? '#cbd5e1' : rank === 2 ? '#fb923c' : '#64748b');

const MultiplayerGameOver = ({
  winnerId, finalStats, localPlayerId, onRestart, onMainMenu, canRestart = true,
}: MultiplayerGameOverProps) => {
  const [viewStatsUser, setViewStatsUser] = useState<string | null>(null);
  const isTouch = detectIsTouch();
  const sortedPlayers = [...finalStats].sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.score - a.score;
  });
  const winner = sortedPlayers[0] || sortedPlayers.find((p) => p.id === winnerId);
  const localPlayer = sortedPlayers.find((p) => p.id === localPlayerId);
  const isLocalWinner = winner?.id === localPlayerId;
  const localRank = sortedPlayers.findIndex((p) => p.id === localPlayerId) + 1;
  const accent = isLocalWinner ? '#fbbf24' : '#f87171';

  const teamStats = [
    { label: 'Total Kills', value: sortedPlayers.reduce((s, p) => s + p.kills, 0), color: '#fb923c' },
    { label: 'Total Score', value: sortedPlayers.reduce((s, p) => s + p.score, 0), color: '#22d3ee' },
    { label: 'Survived', value: sortedPlayers.filter((p) => p.isAlive).length, color: '#34d399' },
    { label: 'Players', value: sortedPlayers.length, color: '#c084fc' },
  ];

  return (
    <div
      className={isTouch
        ? 'm-safe fixed inset-0 flex flex-col menu-overlay-in'
        : 'fixed inset-0 flex items-center justify-center p-4 menu-overlay-in'}
      style={{ zIndex: 200, background: 'rgba(5,8,10,0.95)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className={isTouch
          ? 'm-sheet-in m-scroll hud-frame h-full w-full overflow-y-auto border-t bg-[#080d0b]/95 p-4'
          : 'hud-frame w-full max-w-2xl max-h-[96dvh] overflow-y-auto rounded-2xl border bg-[#080d0b]/95 p-6'}
        style={{ borderColor: `${accent}44`, ...(isTouch ? {} : { animation: 'mgoFade 0.4s cubic-bezier(0.16,1,0.3,1) forwards' }) }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border mb-3"
            style={{ borderColor: `${accent}55`, background: `${accent}1a` }}
          >
            {isLocalWinner
              ? <Crown className="w-7 h-7" style={{ color: accent }} strokeWidth={2} />
              : <Skull className="w-7 h-7" style={{ color: accent }} strokeWidth={2} />}
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-[0.06em] uppercase" style={{ color: accent }}>
            {isLocalWinner ? 'Victory' : 'Game Over'}
          </h1>
          {winner && (
            <p className="mt-2 text-sm text-gray-400">
              Winner <span className="font-bold text-white">{winner.name}</span>
              <span className="mx-2 text-gray-600">·</span>
              <span className="text-orange-400 font-semibold">{winner.kills}</span> kills
              <span className="mx-1.5 text-gray-600">·</span>
              <span className="text-cyan-400 font-semibold">{winner.score}</span> score
            </p>
          )}
          {localPlayer && !isLocalWinner && (
            <p className="mt-1.5 text-xs font-semibold tracking-wide text-gray-500">
              You placed #{localRank} of {sortedPlayers.length}
            </p>
          )}
        </div>

        {/* Scoreboard */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-white/[0.07]">
            <h2 className="font-hud text-[11px] font-semibold tracking-[0.2em] text-gray-400 uppercase">Final Scoreboard</h2>
          </div>
          <div className="max-h-[34dvh] overflow-y-auto">
            {sortedPlayers.map((player, index) => {
              const isLocal = player.id === localPlayerId;
              const tier = player.rankTier !== undefined ? RANK_TIERS[player.rankTier] : null;
              return (
                <button
                  type="button"
                  key={player.id}
                  onClick={() => setViewStatsUser(player.name)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] last:border-0 text-left transition-colors hover:bg-white/[0.05] ${
                    isLocal ? 'bg-emerald-500/[0.06]' : ''
                  } ${!player.isAlive ? 'opacity-55' : ''}`}
                >
                  <div className="flex items-center gap-1.5 w-12">
                    {index < 3
                      ? <Medal className="w-4 h-4" style={{ color: rankColor(index) }} strokeWidth={2.25} />
                      : <span className="w-4" />}
                    <span className="text-sm font-bold tabular-nums" style={{ color: rankColor(index) }}>
                      {index + 1}
                    </span>
                  </div>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: formatColor(player.color) }} />
                  <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">
                    {player.name}
                    {isLocal && <span className="text-emerald-400 ml-1.5 text-xs">· you</span>}
                    {tier && (
                      <span
                        className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                        style={{ color: tier.color, background: `${tier.color}22` }}
                      >
                        {tier.name}
                      </span>
                    )}
                    {player.isMobile && (
                      <span className="ml-1.5 inline-flex align-middle" title="Played on mobile">
                        <Smartphone className="w-3 h-3 text-teal-300 inline" strokeWidth={2.5} />
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-orange-300 text-sm font-semibold tabular-nums w-11 justify-end">
                    <Crosshair className="w-3 h-3" strokeWidth={2.5} />{player.kills}
                  </span>
                  <span className="flex items-center gap-1 text-cyan-300 text-sm font-semibold tabular-nums w-14 justify-end">
                    <Star className="w-3 h-3" strokeWidth={2.5} />{player.score}
                  </span>
                  <span className="text-violet-300 text-xs font-semibold tabular-nums w-9 text-right hidden sm:block">
                    {calculateKD(player.kills, player.deaths)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Team stats */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {teamStats.map((s) => (
            <div key={s.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] py-2.5 text-center">
              <div className="font-display text-xl font-semibold tabular-nums" style={{ color: s.color }}>{s.value}</div>
              <div className="font-hud text-[9px] font-semibold tracking-[0.1em] text-gray-500 uppercase mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onRestart}
            disabled={!canRestart}
            className={`font-hud group flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-bold uppercase tracking-wider transition-all duration-200 ${
              canRestart
                ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400/70'
                : 'border border-white/10 bg-white/[0.03] text-gray-500 cursor-not-allowed'
            }`}
          >
            {canRestart
              ? <><RotateCcw className="w-[18px] h-[18px] group-hover:-rotate-180 transition-transform duration-500" strokeWidth={2.25} />Play Again</>
              : <><Hourglass className="w-[18px] h-[18px]" strokeWidth={2.25} />Waiting for Host</>}
          </button>
          <button
            onClick={onMainMenu}
            className="font-hud flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3.5
              border border-white/10 bg-white/[0.04] text-gray-300 font-bold uppercase tracking-wider
              transition-all duration-200 hover:bg-white/[0.08] hover:text-white hover:border-white/20"
          >
            <Home className="w-[18px] h-[18px]" strokeWidth={2.25} />
            Main Menu
          </button>
        </div>
      </div>

      {viewStatsUser && <PlayerStatsModal username={viewStatsUser} onClose={() => setViewStatsUser(null)} />}

      <style>{`
        @keyframes mgoFade {
          from { opacity: 0; transform: scale(0.96) translateY(14px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default MultiplayerGameOver;
