import { useState, useEffect } from 'react';
import {
  Skull, Crosshair, Star, Activity, Home, Heart,
  ChevronLeft, ChevronRight, Eye, Swords,
} from 'lucide-react';
import type { PlayerData } from '../utils/MultiplayerManager';

interface SpectateScreenProps {
  localPlayer: PlayerData;
  alivePlayers: PlayerData[];
  allPlayers: PlayerData[];
  killerInfo?: { killerName: string; weapon: string } | null;
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

const weaponLabel = (w: string): string => (w ? w.charAt(0).toUpperCase() + w.slice(1) : 'Pistol');

const rankColor = (rank: number) => (rank === 0 ? '#fbbf24' : rank === 1 ? '#cbd5e1' : rank === 2 ? '#fb923c' : '#64748b');

const SpectateScreen = ({ localPlayer, alivePlayers, allPlayers, killerInfo, onMainMenu }: SpectateScreenProps) => {
  const [focusIndex, setFocusIndex] = useState(0);

  const sortedPlayers = [...allPlayers].sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.score - a.score;
  });
  const localRank = sortedPlayers.findIndex((p) => p.id === localPlayer.id) + 1;

  // Modulo keeps the focus valid even as the alive list shrinks during play.
  const count = alivePlayers.length;
  const safeIndex = count ? ((focusIndex % count) + count) % count : 0;
  const focused = count ? alivePlayers[safeIndex] : null;

  const cycle = (dir: number) => setFocusIndex((i) => i + dir);

  // Arrow keys cycle the spectated player
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') cycle(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const focusHealthPct = focused ? Math.max(0, Math.min(100, (focused.health / focused.maxHealth) * 100)) : 0;
  const focusHealthColor = focusHealthPct > 60 ? '#34d399' : focusHealthPct > 30 ? '#fbbf24' : '#f87171';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 150, background: 'rgba(6,9,13,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <div className="w-full max-w-3xl max-h-[94dvh] overflow-y-auto space-y-3">
        {/* Eliminated banner */}
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-6 py-4 flex items-center gap-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/15 flex-shrink-0">
            <Skull className="w-6 h-6 text-red-400" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-[0.14em] text-red-400 uppercase">Eliminated</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {killerInfo?.killerName
                ? <>Taken down by <span className="text-gray-200 font-semibold">{killerInfo.killerName}</span> · </>
                : null}
              Rank #{localRank} of {sortedPlayers.length} · {count} still fighting
            </p>
          </div>
        </div>

        {/* === SPECTATOR VIEWER === */}
        <div className="rounded-2xl border border-emerald-400/20 bg-white/[0.03] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.07]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <Eye className="w-4 h-4 text-emerald-400" strokeWidth={2.25} />
              <h2 className="text-[11px] font-semibold tracking-[0.2em] text-gray-300 uppercase">Now Spectating</h2>
            </div>
            {count > 1 && (
              <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
                {safeIndex + 1} / {count}
              </span>
            )}
          </div>

          {focused ? (
            <div className="flex items-center gap-3 px-4 py-4">
              {/* Prev */}
              <button
                onClick={() => cycle(-1)}
                disabled={count < 2}
                className="flex items-center justify-center w-10 h-10 rounded-xl border border-white/10 bg-white/[0.04]
                  text-gray-300 transition-colors hover:bg-white/[0.09] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                aria-label="Previous player"
              >
                <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
              </button>

              {/* Focused player card */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-3">
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white/15"
                    style={{ backgroundColor: formatColor(focused.color) }}
                  />
                  <span className="text-lg font-bold text-white truncate">{focused.name}</span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                    <Activity className="w-3 h-3" strokeWidth={2.5} /> Alive
                  </span>
                </div>

                {/* Live health */}
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="w-4 h-4 flex-shrink-0" style={{ color: focusHealthColor }} strokeWidth={2.25} />
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${focusHealthPct}%`, backgroundColor: focusHealthColor }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums w-10 text-right" style={{ color: focusHealthColor }}>
                    {Math.max(0, Math.round(focused.health))}
                  </span>
                </div>

                {/* Live stats */}
                <div className="grid grid-cols-4 gap-2">
                  <SpecStat icon={Crosshair} label="Kills" value={focused.kills} color="#fb923c" />
                  <SpecStat icon={Star} label="Score" value={focused.score} color="#38bdf8" />
                  <SpecStat icon={Swords} label="K/D" value={calculateKD(focused.kills, focused.deaths)} color="#34d399" />
                  <SpecStat icon={Crosshair} label="Weapon" value={weaponLabel(focused.currentWeapon)} color="#c084fc" small />
                </div>
              </div>

              {/* Next */}
              <button
                onClick={() => cycle(1)}
                disabled={count < 2}
                className="flex items-center justify-center w-10 h-10 rounded-xl border border-white/10 bg-white/[0.04]
                  text-gray-300 transition-colors hover:bg-white/[0.09] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                aria-label="Next player"
              >
                <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-gray-500">
              No players remaining — finishing match…
            </div>
          )}
          {count > 1 && (
            <div className="px-5 pb-2.5 -mt-1 text-center text-[10px] text-gray-600">
              Use ← → or A / D to switch players
            </div>
          )}
        </div>

        {/* Live scoreboard */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/[0.07]">
            <Activity className="w-4 h-4 text-emerald-400" strokeWidth={2.25} />
            <h2 className="text-[11px] font-semibold tracking-[0.2em] text-gray-300 uppercase">Live Scoreboard</h2>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {sortedPlayers.map((player, index) => {
              const isLocal = player.id === localPlayer.id;
              const isFocused = focused?.id === player.id;
              return (
                <button
                  key={player.id}
                  onClick={() => {
                    const idx = alivePlayers.findIndex((p) => p.id === player.id);
                    if (idx >= 0) setFocusIndex(idx);
                  }}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 border-b border-white/[0.05] last:border-0 text-left transition-colors ${
                    isFocused ? 'bg-emerald-500/[0.1]' : isLocal ? 'bg-white/[0.03]' : 'hover:bg-white/[0.03]'
                  } ${!player.isAlive ? 'opacity-50' : ''}`}
                >
                  <span className="w-5 text-sm font-bold tabular-nums" style={{ color: rankColor(index) }}>{index + 1}</span>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: formatColor(player.color) }} />
                  <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">
                    {player.name}
                    {isLocal && <span className="text-gray-500 ml-1.5 text-xs">· you</span>}
                  </span>
                  {player.isAlive ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                      <Activity className="w-3 h-3" strokeWidth={2.5} /> Alive
                    </span>
                  ) : (
                    <Skull className="w-3.5 h-3.5 text-gray-600" strokeWidth={2.25} />
                  )}
                  <span className="flex items-center gap-1 text-orange-300 text-sm font-semibold tabular-nums w-11 justify-end">
                    <Crosshair className="w-3 h-3" strokeWidth={2.5} />{player.kills}
                  </span>
                  <span className="flex items-center gap-1 text-cyan-300 text-sm font-semibold tabular-nums w-14 justify-end">
                    <Star className="w-3 h-3" strokeWidth={2.5} />{player.score}
                  </span>
                </button>
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

const SpecStat = ({ icon: Icon, label, value, color, small }: {
  icon: typeof Crosshair; label: string; value: number | string; color: string; small?: boolean;
}) => (
  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] py-2 px-1 text-center">
    <div className={`font-bold tabular-nums truncate ${small ? 'text-sm' : 'text-lg'}`} style={{ color }}>{value}</div>
    <div className="flex items-center justify-center gap-1 mt-0.5">
      <Icon className="w-2.5 h-2.5 text-gray-600" strokeWidth={2.5} />
      <span className="text-[9px] font-semibold tracking-[0.1em] text-gray-500 uppercase">{label}</span>
    </div>
  </div>
);

export default SpectateScreen;
