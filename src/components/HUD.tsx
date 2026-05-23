import { useEffect, useState } from 'react';
import {
  Heart, Crosshair, Skull, Waves, Flame, Lock,
  Zap, Shield as ShieldIcon, Wind, Ghost, Plus, type LucideIcon,
} from 'lucide-react';
import { WEAPONS } from '../types/game';

/** One ability slot's live state for the HUD ability bar. */
export interface AbilityHudItem {
  key: string;        // keybind label, e.g. 'Q'
  name: string;       // ability name, e.g. 'Dash'
  cooldown: number;   // 0..1 — 1 means fully recharged / ready
  active: boolean;    // ability is currently active
  unlocked?: boolean; // false = still locked behind a score threshold
  unlockScore?: number; // score required to unlock
}

interface HUDProps {
  health: number;
  maxHealth?: number; // optional dynamic cap (Thick Skin); defaults to 100
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
  /** Tutorial mode — the player can't be hurt, so health shows as unlimited. */
  unlimitedHealth?: boolean;
  /** Tutorial mode — hide the wave counter (no wave progression in tutorial). */
  hideWave?: boolean;
  /** Live ability cooldown state for the ability bar. */
  abilities?: AbilityHudItem[];
}

const ABILITY_ICONS: Record<string, LucideIcon> = {
  Dash: Zap,
  Shield: ShieldIcon,
  Sprint: Wind,
  Ghost: Ghost,
  Heal: Plus,
};

const HUD = ({
  health, maxHealth = 100, ammo, maxAmmo, enemiesKilled, score, wave, weaponName, combo,
  unlockedWeapons, currentWeapon, hideStatsPanel = false, unlimitedHealth = false,
  hideWave = false, abilities = [],
}: HUDProps) => {
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

  const safeMax = Math.max(1, maxHealth);
  const healthRatio = unlimitedHealth ? 1 : Math.max(0, Math.min(1, health / safeMax));
  const healthPct = healthRatio * 100;
  const healthColor = unlimitedHealth
    ? '#34d399'
    : healthRatio > 0.6 ? '#34d399' : healthRatio > 0.3 ? '#fbbf24' : '#f87171';
  const isLowHealth = !unlimitedHealth && healthRatio <= 0.3;
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
              {unlimitedHealth ? '∞' : Math.max(0, Math.floor(health))}
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
              {!hideWave && (
                <div className="flex items-center gap-1.5">
                  <Waves className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.25} />
                  <span className="text-sm font-semibold text-emerald-300 tabular-nums">{wave}</span>
                </div>
              )}
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

      {/* ===== Bottom Center — Ability Bar ===== */}
      {abilities.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 select-none">
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md px-3 py-2.5">
            {abilities.map((a) => (
              <AbilitySlot key={a.key} ability={a} />
            ))}
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

      <style>{`
        @keyframes comboIn {
          0% { transform: translateX(-50%) scale(0.6); opacity: 0; }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
        @keyframes abilityReady {
          0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0.0); }
          50% { box-shadow: 0 0 10px 1px rgba(52,211,153,0.45); }
        }
      `}</style>
    </>
  );
};

/** A single ability slot with a radial cooldown sweep that "refills". */
const AbilitySlot = ({ ability }: { ability: AbilityHudItem }) => {
  const locked = ability.unlocked === false;
  const Icon = locked ? Lock : (ABILITY_ICONS[ability.name] ?? Zap);
  const ready = !locked && ability.cooldown >= 1;
  const deg = Math.min(360, Math.max(0, ability.cooldown * 360));

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative flex items-center justify-center w-12 h-12 rounded-xl border transition-colors duration-200 ${
          locked
            ? 'border-white/[0.07] bg-black/55'
            : ability.active
            ? 'border-emerald-400/80 bg-emerald-500/25'
            : ready
            ? 'border-emerald-400/55 bg-emerald-500/10'
            : 'border-white/10 bg-black/45'
        }`}
        style={ready && !ability.active ? { animation: 'abilityReady 2.4s ease-in-out infinite' } : undefined}
      >
        <Icon
          className={`${locked ? 'w-4 h-4' : 'w-5 h-5'} ${
            locked ? 'text-gray-600' : ability.active ? 'text-emerald-200' : ready ? 'text-emerald-300' : 'text-gray-500'
          }`}
          strokeWidth={2.25}
        />
        {/* Radial cooldown sweep — the dark wedge shrinks clockwise as it recharges */}
        {!locked && !ready && (
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{ background: `conic-gradient(rgba(0,0,0,0) ${deg}deg, rgba(3,6,10,0.82) ${deg}deg)` }}
          />
        )}
        {/* Keybind chip */}
        <kbd
          className={`absolute -top-1.5 -right-1.5 px-1 min-w-[15px] h-[15px] flex items-center justify-center
            rounded bg-[#0b0f15] border text-[9px] font-bold font-mono ${
            ready ? 'border-emerald-400/50 text-emerald-300' : 'border-white/15 text-gray-500'
          }`}
        >
          {ability.key}
        </kbd>
      </div>
      <span className={`text-[9px] font-semibold tracking-wide uppercase ${
        locked ? 'text-gray-600' : ready ? 'text-gray-300' : 'text-gray-500'
      }`}>
        {locked ? `${ability.unlockScore ?? 0} pts` : ability.name}
      </span>
    </div>
  );
};

export default HUD;
