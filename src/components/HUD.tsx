import { useEffect, useState } from 'react';
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
}

const HUD = ({ health, ammo, maxAmmo, enemiesKilled, score, wave, weaponName, combo, unlockedWeapons, currentWeapon }: HUDProps) => {
  const [damageFlash, setDamageFlash] = useState(false);
  const [prevHealth, setPrevHealth] = useState(health);
  const [scorePopup, setScorePopup] = useState(false);
  const [prevScore, setPrevScore] = useState(score);

  useEffect(() => {
    if (health < prevHealth) {
      setDamageFlash(true);
      setTimeout(() => setDamageFlash(false), 200);
    }
    setPrevHealth(health);
  }, [health, prevHealth]);

  useEffect(() => {
    if (score > prevScore) {
      setScorePopup(true);
      setTimeout(() => setScorePopup(false), 300);
    }
    setPrevScore(score);
  }, [score, prevScore]);

  const getHealthColor = () => {
    if (health > 60) return 'from-green-400 to-emerald-500';
    if (health > 30) return 'from-yellow-400 to-orange-500';
    return 'from-red-400 to-red-600';
  };

  const getHealthGlow = () => {
    if (health > 60) return 'rgba(34, 197, 94, 0.5)';
    if (health > 30) return 'rgba(234, 179, 8, 0.5)';
    return 'rgba(239, 68, 68, 0.6)';
  };

  const isLowHealth = health <= 30;
  const isLowAmmo = ammo <= Math.ceil(maxAmmo * 0.2);

  return (
    <>
      {/* Damage Flash Effect */}
      {damageFlash && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 20%, rgba(220, 38, 38, 0.3) 100%)',
            animation: 'damageFlash 0.2s ease-out',
          }}
        />
      )}

      {/* Low Health Vignette */}
      {isLowHealth && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(127, 29, 29, 0.4) 100%)',
            animation: 'pulse 1s ease-in-out infinite',
          }}
        />
      )}

      {/* Top Left - Health & Ammo Panel */}
      <div className="absolute top-3 sm:top-5 left-3 sm:left-5 select-none">
        {/* Glass Card */}
        <div
          className="relative rounded-xl sm:rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="p-2.5 sm:p-4 space-y-2 sm:space-y-3">
            {/* Health Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className={`text-base sm:text-lg ${isLowHealth ? 'animate-pulse' : ''}`}>❤️</span>
                  <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">Health</span>
                </div>
                <span
                  className={`text-lg sm:text-2xl font-black tabular-nums ${
                    health > 60 ? 'text-green-400' : health > 30 ? 'text-yellow-400' : 'text-red-400'
                  }`}
                  style={{ textShadow: `0 0 10px ${getHealthGlow()}` }}
                >
                  {Math.max(0, Math.floor(health))}
                </span>
              </div>
              <div
                className="w-32 sm:w-48 h-2 sm:h-2.5 rounded-full overflow-hidden"
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                }}
              >
                <div
                  className={`h-full bg-gradient-to-r ${getHealthColor()} transition-all duration-300 rounded-full relative`}
                  style={{
                    width: `${Math.max(0, health)}%`,
                    boxShadow: `0 0 10px ${getHealthGlow()}`,
                  }}
                >
                  {/* Shine effect on health bar */}
                  <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent rounded-full" />
                </div>
              </div>
            </div>

            {/* Ammo Section */}
            <div className="flex items-center justify-between gap-2 sm:gap-4 pt-1 border-t border-white/10">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className={`text-base sm:text-lg ${isLowAmmo ? 'animate-bounce' : ''}`}>🔫</span>
                <span className="text-[10px] sm:text-xs font-semibold text-gray-300 truncate max-w-[60px] sm:max-w-[80px]">
                  {weaponName}
                </span>
              </div>
              <div className="flex items-baseline gap-0.5 sm:gap-1">
                <span
                  className={`text-xl sm:text-3xl font-black tabular-nums ${isLowAmmo ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}
                  style={{ textShadow: isLowAmmo ? '0 0 10px rgba(239,68,68,0.6)' : '0 0 10px rgba(234,179,8,0.4)' }}
                >
                  {ammo}
                </span>
                <span className="text-xs sm:text-base text-gray-500 font-medium">/{maxAmmo}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Right - Score & Stats */}
      <div className="absolute top-3 sm:top-5 right-3 sm:right-5 select-none">
        <div
          className="relative rounded-xl sm:rounded-2xl overflow-hidden text-right"
          style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="p-2.5 sm:p-4">
            {/* Score */}
            <div className="mb-2 sm:mb-3">
              <div className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Score</div>
              <div
                className={`text-2xl sm:text-4xl font-black tabular-nums text-cyan-400 ${scorePopup ? 'scale-110' : 'scale-100'} transition-transform duration-150`}
                style={{ textShadow: '0 0 20px rgba(34,211,238,0.5)' }}
              >
                {score.toLocaleString()}
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex justify-end gap-3 sm:gap-4 pt-2 border-t border-white/10">
              <div className="flex items-center gap-1 sm:gap-1.5">
                <span className="text-sm sm:text-base">💀</span>
                <span className="text-sm sm:text-lg font-bold text-gray-200 tabular-nums">{enemiesKilled}</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <span className="text-sm sm:text-base">🌊</span>
                <span className="text-sm sm:text-lg font-bold text-purple-400 tabular-nums">{wave}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Combo - Center Top */}
      {combo > 1 && (
        <div
          className="absolute top-3 sm:top-5 left-1/2 transform -translate-x-1/2"
          style={{ animation: 'comboIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          <div
            className="relative overflow-hidden rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(249,115,22,0.9) 0%, rgba(220,38,38,0.9) 100%)',
              boxShadow: '0 0 30px rgba(249,115,22,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
            <div className="relative px-4 sm:px-8 py-1.5 sm:py-2.5 flex items-center gap-1.5 sm:gap-2">
              <span className="text-lg sm:text-2xl" style={{ animation: 'flame 0.5s ease-in-out infinite' }}>🔥</span>
              <span className="font-black text-lg sm:text-2xl text-white tabular-nums tracking-wide">
                x{combo}
              </span>
              <span className="font-bold text-sm sm:text-lg text-orange-100 hidden sm:inline">COMBO</span>
            </div>
          </div>
        </div>
      )}

      {/* Weapon Selector - Bottom Right */}
      <div className="absolute bottom-3 sm:bottom-5 right-3 sm:right-5 select-none">
        <div
          className="relative rounded-xl sm:rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="p-2 sm:p-3">
            <div className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 sm:mb-2 text-right">
              Weapons
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-1 sm:gap-1.5">
              {Object.entries(WEAPONS).map(([key, weapon], index) => {
                const isUnlocked = unlockedWeapons.includes(key);
                const isCurrent = currentWeapon === key;

                return (
                  <div
                    key={key}
                    title={isUnlocked ? `${weapon.name} (${index + 1})` : `Unlock at ${weapon.unlockScore} pts`}
                    className={`relative w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl transition-all duration-200 flex items-center justify-center ${
                      isCurrent
                        ? 'scale-105'
                        : isUnlocked
                        ? 'hover:scale-105'
                        : 'opacity-50'
                    }`}
                    style={{
                      background: isCurrent
                        ? 'linear-gradient(135deg, rgba(34,211,238,0.8) 0%, rgba(6,182,212,0.8) 100%)'
                        : isUnlocked
                        ? 'rgba(255,255,255,0.1)'
                        : 'rgba(0,0,0,0.3)',
                      boxShadow: isCurrent ? '0 0 20px rgba(34,211,238,0.5), inset 0 1px 0 rgba(255,255,255,0.2)' : 'none',
                      border: isCurrent
                        ? '2px solid rgba(34,211,238,0.8)'
                        : isUnlocked
                        ? '1px solid rgba(255,255,255,0.15)'
                        : '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    {isUnlocked ? (
                      <>
                        <span className={`text-base sm:text-xl ${isCurrent ? 'text-white' : 'text-gray-300'}`}>
                          {weapon.name.split(' ')[0]}
                        </span>
                        <div
                          className={`absolute top-0.5 right-0.5 text-[7px] sm:text-[8px] font-bold px-1 rounded ${
                            isCurrent ? 'bg-white/30 text-white' : 'bg-black/50 text-gray-400'
                          }`}
                        >
                          {index + 1}
                        </div>
                      </>
                    ) : (
                      <span className="text-sm sm:text-lg text-gray-600">🔒</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Controls Hint - Bottom Left */}
      <div className="absolute bottom-3 sm:bottom-5 left-3 sm:left-5 select-none hidden sm:block">
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div className="px-3 py-2 text-[10px] sm:text-xs font-mono text-gray-500 space-y-0.5">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 text-[9px]">RMB</kbd>
              <span>Lock/Unlock Mouse</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 text-[9px]">Scroll</kbd>
              <span>Switch Weapons</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 text-[9px]">R</kbd>
              <span>Reload</span>
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 text-[9px] ml-2">Space</kbd>
              <span>Jump</span>
            </div>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes damageFlash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes comboIn {
          0% { transform: translateX(-50%) scale(0.5); opacity: 0; }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
        @keyframes flame {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </>
  );
};

export default HUD;
