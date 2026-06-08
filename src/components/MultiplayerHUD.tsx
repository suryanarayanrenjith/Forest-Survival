import { useState } from 'react';
import { Timer, Users, Swords, Crosshair, Skull, Star, ListOrdered, X, Smartphone } from 'lucide-react';
import type { PlayerData } from '../utils/MultiplayerManager';
import { RANK_TIERS } from '../utils/rankSystem';
import Minimap from './Minimap';

interface MultiplayerHUDProps {
  localPlayer: PlayerData;
  remotePlayers: PlayerData[];
  remainingTime: number | null;
  gameMode: 'coop' | 'survival';
  /** Touch layout: a compact toggle + scoreboard modal instead of the docked
   *  top-right panel (which would collide with the on-screen controls). */
  isTouch?: boolean;
}

const formatColor = (color: number): string => {
  if (typeof color !== 'number' || color < 0) return '#ffffff';
  return `#${Math.abs(color).toString(16).padStart(6, '0')}`;
};

const calculateKD = (kills: number, deaths: number): string => {
  if (deaths === 0) return kills.toString();
  return (kills / deaths).toFixed(1);
};

const MultiplayerHUD = ({ localPlayer, remotePlayers, remainingTime, gameMode, isTouch = false }: MultiplayerHUDProps) => {
  const [boardOpen, setBoardOpen] = useState(false);
  const allPlayers = [localPlayer, ...remotePlayers].sort((a, b) => b.kills - a.kills);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalKills = allPlayers.reduce((sum, p) => sum + p.kills, 0);
  const aliveCount = allPlayers.filter((p) => p.isAlive).length;

  // Shared scoreboard rows — used by both the desktop panel and the touch modal.
  const scoreRows = allPlayers.map((player, index) => {
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
          {player.isMobile && (
            <span className="flex-shrink-0" title="Playing on mobile">
              <Smartphone className="w-3 h-3 text-teal-300" strokeWidth={2.25} aria-label="Playing on mobile" />
            </span>
          )}
          {player.rankTier !== undefined && RANK_TIERS[player.rankTier] && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
              style={{ color: RANK_TIERS[player.rankTier].color, background: `${RANK_TIERS[player.rankTier].color}22` }}
              title={`${RANK_TIERS[player.rankTier].name}${player.level ? ` · Level ${player.level}` : ''}`}
            >
              {RANK_TIERS[player.rankTier].name}
            </span>
          )}
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
  });

  const teamSummary = (
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
  );

  // ── Touch layout ──
  // Compact toggle on the right edge (below the weapon button), showing the
  // match timer (or mode) + alive count. Tapping opens the full scoreboard as a
  // centered modal that sits above the on-screen controls.
  if (isTouch) {
    return (
      <>
        {/* Tactical map — compact right-edge toggle (below the chat toggle) that
            opens the full radar modal, so it never covers the touch controls. */}
        <Minimap isTouch />

        <button
          onClick={() => setBoardOpen((v) => !v)}
          aria-label="Scoreboard"
          className="touch-control fixed right-2 top-[62px] z-[46] flex min-w-[52px] flex-col items-center gap-0.5 rounded-2xl border border-white/15 bg-black/60 px-2 py-1.5 backdrop-blur-md active:scale-95"
          style={{ pointerEvents: 'auto' }}
        >
          {remainingTime !== null ? (
            <span className={`text-sm font-bold tabular-nums ${remainingTime < 30 ? 'text-red-300' : 'text-white'}`}>
              {formatTime(remainingTime)}
            </span>
          ) : gameMode === 'coop' ? (
            <Users className="h-4 w-4 text-sky-400" strokeWidth={2.25} />
          ) : (
            <Swords className="h-4 w-4 text-rose-400" strokeWidth={2.25} />
          )}
          <span className="flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wide text-gray-400">
            <ListOrdered className="h-2.5 w-2.5" strokeWidth={2.5} />{aliveCount}/{allPlayers.length}
          </span>
        </button>

        {boardOpen && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
            style={{ pointerEvents: 'auto' }}
            onClick={() => setBoardOpen(false)}
          >
            <div
              className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f15]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.07]">
                <span className="text-[11px] font-semibold tracking-[0.15em] text-gray-300 uppercase">
                  Scoreboard · {allPlayers.length}
                </span>
                <button
                  onClick={() => setBoardOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/[0.06] hover:text-white"
                  aria-label="Close scoreboard"
                >
                  <X className="h-4 w-4" strokeWidth={2.25} />
                </button>
              </div>
              <div className="max-h-[60dvh] overflow-y-auto">{scoreRows}</div>
              {teamSummary}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    // The whole HUD column is anchored TOP→just-above-the-loadout (bottom-[176px])
    // and laid out as a flex column, so the scoreboard fills the leftover space
    // and scrolls internally instead of growing down into the bottom-right
    // loadout panel (the overlap bug). Minimap + timer keep their natural height.
    <div className="absolute top-4 right-4 bottom-[176px] w-[280px] flex flex-col gap-2.5" style={{ zIndex: 20 }}>
      {/* Live tactical radar — players (you + allies) and nearby enemies. */}
      <Minimap />

      {/* Timer + mode */}
      <div className="flex flex-shrink-0 items-center gap-2.5">
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

      {/* Scoreboard — flex-1 so it takes the remaining height; the rows scroll. */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-black/60 backdrop-blur-md overflow-hidden">
        <div className="flex flex-shrink-0 items-center justify-between px-3 py-2 border-b border-white/[0.07]">
          <span className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase">
            Players · {allPlayers.length}
          </span>
          <span className="text-[10px] font-semibold tracking-[0.1em] text-gray-600 uppercase">K / D / Score</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{scoreRows}</div>

        <div className="flex-shrink-0">{teamSummary}</div>
      </div>
    </div>
  );
};

export default MultiplayerHUD;
