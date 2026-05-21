import { useEffect, useState } from 'react';
import { Heart, Crosshair, Skull, Waves, Flame, Lock } from 'lucide-react';
import { WEAPONS } from '../types/game';

interface HUDProps {
  health: number;
  ammo: number;
  maxAmmo: number;
  enemiesKilled: number;
  score: number;
  wave: number;
  weaponName: string;
  combo: number;
  t: (key: string) => string;
  unlockedWeapons: string[];
  currentWeapon: string;
  /** Hide the top-right score/stats panel — used in multiplayer where the
   *  MultiplayerHUD occupies that corner and would otherwise overlap. */
  hideStatsPanel?: boolean;
}

const HUD = ({ health, ammo, maxAmmo, enemiesKilled, score, wave, weaponName, combo, unlockedWeapons, currentWeapon, hideStatsPanel = false }: HUDProps) => {
  const [scorePopup, setScorePopup] = useState(false);
  const [prevScore, setPrevScore] = useState(score);

  useEffect(() => {
    if (score > prevScore) {
      setScorePopup(true);
      const timer = setTimeout(() => setScorePopup(false), 300);
      return () => clearTimeout(timer);
    }
    setPrevScore(score);
  }, [score, prevScore]);

  const healthPct = Math.max(0, Math.min(100, health));
  const healthColor = health > 60 ? '#34d399' : health > 30 ? '#fbbf24' : '#f87171';
  const isLowHealth = health <= 30;
  const isLowAmmo = ammo <= Math.ceil(maxAmmo * 0.2);

  const weaponKeys = Object.keys(WEAPONS);

  return (
    <>
      {/* ===== Top Left — Vitals ===== */}
      <div className="absolute top-4 left-4 select-none">
        <div className="rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md px-4 py-3 w-60">
          {/* Health */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4" style={{ color: healthColor }} strokeWidth={2.25} fill={isLowHealth ? healthColor : 'none'} />
              <span className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase">Health</span>
            </div>
            <span className="text-xl font-bold tabular-nums" style={{ color: healthColor }}>
              {Math.max(0, Math.floor(health))}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${healthPct}%`, backgroundColor: healthColor, boxShadow: `0 0 8px ${healthColor}99` }}
            />
          </div>

          {/* Divider */}
          <div className="my-2.5 h-px bg-white/10" />

          {/* Ammo */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Crosshair className="w-4 h-4 text-gray-300 flex-shrink-0" strokeWidth={2.25} />
              <span className="text-xs font-semibold text-gray-300 truncate">{weaponName}</span>
            </div>
            <div className="flex items-baseline gap-0.5 flex-shrink-0">
              <span
                className={`text-xl font-bold tabular-nums ${isLowAmmo ? 'text-red-400' : 'text-white'}`}
              >
                {ammo}
              </span>
              <span className="text-xs text-gray-500 font-medium">/ {maxAmmo}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Top Right — Stats ===== */}
      {!hideStatsPanel && (
        <div className="absolute top-4 right-4 select-none">
          <div className="rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md px-4 py-3 w-44 text-right">
            <div className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase mb-0.5">Score</div>
            <div
              className={`text-3xl font-bold tabular-nums text-white transition-transform duration-150 ${scorePopup ? 'scale-110' : 'scale-100'}`}
              style={{ transformOrigin: 'right' }}
            >
              {score.toLocaleString()}
            </div>
            <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-end gap-4">
              <div className="flex items-center gap-1.5">
                <Skull className="w-3.5 h-3.5 text-gray-500" strokeWidth={2.25} />
                <span className="text-sm font-semibold text-gray-200 tabular-nums">{enemiesKilled}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.25} />
                <span className="text-sm font-semibold text-emerald-300 tabular-nums">{wave}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Top Center — Combo ===== */}
      {combo > 1 && (
        <div
          className="absolute top-5 left-1/2 -translate-x-1/2 select-none"
          style={{ animation: 'comboIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          <div className="flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-500/15 backdrop-blur-md px-4 py-1.5">
            <Flame className="w-4 h-4 text-orange-400" strokeWidth={2.25} fill="currentColor" />
            <span className="text-base font-bold text-orange-200 tabular-nums tracking-wide">{combo}x</span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-orange-300/80 uppercase">Combo</span>
          </div>
        </div>
      )}

      {/* ===== Bottom Right — Weapons ===== */}
      <div className="absolute bottom-4 right-4 select-none">
        <div className="rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md p-3">
          <div className="text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-2 text-right">
            Loadout
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {weaponKeys.map((key, index) => {
              const isUnlocked = unlockedWeapons.includes(key);
              const isCurrent = currentWeapon === key;
              return (
                <div
                  key={key}
                  title={isUnlocked ? `${WEAPONS[key].name} (${index + 1})` : `Unlocks at ${WEAPONS[key].unlockScore} pts`}
                  className={`relative flex items-center justify-center w-11 h-11 rounded-lg border transition-all duration-200 ${
                    isCurrent
                      ? 'border-emerald-400/70 bg-emerald-500/15'
                      : isUnlocked
                      ? 'border-white/10 bg-white/[0.04]'
                      : 'border-white/5 bg-black/30'
                  }`}
                >
                  {isUnlocked ? (
                    <span className={`text-sm font-bold tabular-nums ${isCurrent ? 'text-emerald-300' : 'text-gray-400'}`}>
                      {index + 1}
                    </span>
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-gray-600" strokeWidth={2.25} />
                  )}
                  {isCurrent && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== Bottom Left — Controls ===== */}
      <div className="absolute bottom-4 left-4 select-none hidden sm:block">
        <div className="rounded-xl border border-white/[0.07] bg-black/40 backdrop-blur-sm px-3 py-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-500">
            <Control keyLabel="RMB" action="Lock Mouse" />
            <Control keyLabel="Scroll" action="Switch Weapon" />
            <Control keyLabel="R" action="Reload" />
            <Control keyLabel="Space" action="Jump" />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes comboIn {
          0% { transform: translateX(-50%) scale(0.6); opacity: 0; }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
};

const Control = ({ keyLabel, action }: { keyLabel: string; action: string }) => (
  <div className="flex items-center gap-1.5">
    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono text-[9px] font-semibold min-w-[1.5rem] text-center">
      {keyLabel}
    </kbd>
    <span>{action}</span>
  </div>
);

export default HUD;
