import { useEffect, useState } from 'react';
import {
  Heart, Crosshair, Skull, Waves, Flame, Lock,
  Zap, Shield as ShieldIcon, Wind, Ghost, Footprints,
  Swords, Infinity as InfinityIcon, Boxes, PackageSearch, Bomb, type LucideIcon,
} from 'lucide-react';
import { WEAPONS } from '../types/game';
import { getAbilityIcon } from './abilityIcons';

/** One slot's live state for the HUD ability bar. */
export interface AbilityHudItem {
  key: string;        // keybind label, e.g. 'Q'
  /** 'dash' = always-available cooldown ability; 'power' = looted power slot. */
  kind: 'dash' | 'power';
  name: string;       // label shown under the slot
  // ── dash / character ability ──
  abilityId?: string; // selects the slot's icon (dash, firestorm, cloak, …)
  accent?: string;    // per-character accent colour
  cooldown?: number;  // 0..1 — 1 means fully recharged / ready
  active?: boolean;   // currently active (dashing or effect running)
  // ── power slot ──
  powerType?: string | null;         // which loot power (null = empty slot)
  state?: 'empty' | 'held' | 'active'; // held = ready to use, active = running
  ratio?: number;     // 0..1 absorb bar (shield while active)
}

/** Unique icon per looted power — no more duplicate lightning bolts. */
const POWER_ICONS: Record<string, LucideIcon> = {
  ammo: Boxes,
  speed: Wind,
  damage: Swords,
  shield: ShieldIcon,
  infinite_ammo: InfinityIcon,
  overcharge: Zap,
  phantom: Ghost,
  nuke: Bomb,
};

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
  /** Weapon Mastery snapshot for the EQUIPPED weapon. When undefined the
   *  mastery sliver is hidden (guests, tutorial, locked weapon). */
  weaponMastery?: {
    level: number;       // 0..10
    intoLevel: number;   // XP into current level
    nextLevelXp: number; // total XP needed to reach next level (0 at max)
  };
  /** Hide the top-right score/stats panel — used in multiplayer where the
   *  MultiplayerHUD occupies that corner and would otherwise overlap. */
  hideStatsPanel?: boolean;
  /** Tutorial mode — the player can't be hurt, so health shows as unlimited. */
  unlimitedHealth?: boolean;
  /** Tutorial mode — hide the wave counter (no wave progression in tutorial). */
  hideWave?: boolean;
  /** Live ability cooldown state for the ability bar. */
  abilities?: AbilityHudItem[];
  /** 0..1 — current stamina fill for the bottom-left sprint meter. */
  staminaRatio?: number;
  /** When true the player has emptied the meter and can't sprint until it
   *  partially refills. The meter renders in a red "depleted" state. */
  staminaExhausted?: boolean;
  /** Tutorial mode — sprinting is free, so the meter shows an "∞" full ring. */
  unlimitedStamina?: boolean;
  /** Touch devices use a compact top-left layout so the bottom corners stay
   *  free for the joystick + fire button, and the top-right for the
   *  weapon/pause touch buttons. Desktop (false) is unchanged. */
  isTouch?: boolean;
  /** When the top-center FPS counter is on, the combo pill drops below it so
   *  the two never overlap. */
  fpsVisible?: boolean;
}

const HUD = ({
  health, maxHealth = 100, ammo, maxAmmo, enemiesKilled, score, wave, weaponName, combo,
  unlockedWeapons, currentWeapon, hideStatsPanel = false, unlimitedHealth = false,
  hideWave = false, abilities = [],
  staminaRatio = 1, staminaExhausted = false, unlimitedStamina = false,
  isTouch = false, fpsVisible = false, weaponMastery,
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

  // ── Compact touch HUD ──
  // Everything lives in one small top-left panel so the bottom corners (joystick
  // + fire) and the top-right (weapon/pause buttons) stay clear of the HUD. The
  // loadout grid, ability bar and stamina pie are intentionally omitted — those
  // are surfaced through the on-screen touch buttons instead.
  if (isTouch) {
    const staminaPct = (unlimitedStamina ? 1 : Math.max(0, Math.min(1, staminaRatio))) * 100;
    const staminaColor = unlimitedStamina ? '#34d399' : staminaExhausted ? '#f87171' : staminaPct < 30 ? '#fbbf24' : '#34d399';
    return (
      <>
        <div className="touch-safe-pad absolute left-0 top-0 select-none">
          <div className="m-2 rounded-xl border border-white/10 bg-black/75 px-2.5 py-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* Health */}
              <div className="flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5" style={{ color: healthColor }} strokeWidth={2.25} fill={isLowHealth ? healthColor : 'none'} />
                <span className="text-sm font-bold tabular-nums" style={{ color: healthColor }}>
                  {unlimitedHealth ? '∞' : Math.max(0, Math.floor(health))}
                </span>
              </div>
              {/* Ammo */}
              <div className="flex items-baseline gap-1">
                <Crosshair className="h-3.5 w-3.5 self-center text-gray-300" strokeWidth={2.25} />
                <span className={`text-sm font-bold tabular-nums ${isLowAmmo ? 'text-red-400' : 'text-white'}`}>{ammo}</span>
                <span className="text-[10px] font-medium text-gray-500">/ {maxAmmo}</span>
              </div>
              {/* Score */}
              {!hideStatsPanel && (
                <div className="flex items-baseline gap-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">Score</span>
                  <span className="text-sm font-bold tabular-nums text-white">{score.toLocaleString()}</span>
                </div>
              )}
              {/* Kills */}
              {!hideStatsPanel && (
                <div className="flex items-center gap-1">
                  <Skull className="h-3 w-3 text-gray-500" strokeWidth={2.25} />
                  <span className="text-xs font-semibold tabular-nums text-gray-200">{enemiesKilled}</span>
                </div>
              )}
              {/* Wave */}
              {!hideWave && !hideStatsPanel && (
                <div className="flex items-center gap-1">
                  <Waves className="h-3 w-3 text-emerald-500" strokeWidth={2.25} />
                  <span className="text-xs font-semibold tabular-nums text-emerald-300">{wave}</span>
                </div>
              )}
            </div>
            {/* Health + stamina bars */}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${healthPct}%`, backgroundColor: healthColor }} />
              </div>
              <div className="flex items-center gap-1">
                <Footprints className="h-3 w-3" style={{ color: staminaColor }} strokeWidth={2.25} />
                <div className="h-1 w-12 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-all duration-200" style={{ width: `${staminaPct}%`, backgroundColor: staminaColor }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Combo — top-center, transient. Drops below the FPS pill when shown. */}
        {combo > 1 && (
          <div className={`absolute left-1/2 ${fpsVisible ? 'top-11' : 'top-2'} -translate-x-1/2 select-none`} style={{ animation: 'comboIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <div className="flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-950/75 px-3 py-1">
              <Flame className="h-3.5 w-3.5 text-orange-400" strokeWidth={2.25} fill="currentColor" />
              <span className="text-sm font-bold tabular-nums tracking-wide text-orange-200">{combo}x</span>
            </div>
          </div>
        )}

        <style>{`
          @keyframes comboIn {
            0% { transform: translateX(-50%) scale(0.6); opacity: 0; }
            100% { transform: translateX(-50%) scale(1); opacity: 1; }
          }
        `}</style>
      </>
    );
  }

  return (
    <>
      {/* ===== Top Left — Vitals ===== */}
      <div className="absolute top-4 left-4 select-none">
        <div className="rounded-2xl border border-white/10 bg-black/75 px-4 py-3 w-60">
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

          {/* Weapon Mastery — sliver below ammo. Hidden on guest / tutorial. */}
          {weaponMastery && (
            <div className="mt-2">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[9px] font-bold tracking-[0.15em] text-amber-300/85 uppercase">
                  Mastery
                </span>
                <span className="text-[10px] font-bold tabular-nums text-amber-200/90">
                  L{weaponMastery.level}
                  {weaponMastery.nextLevelXp > 0 && (
                    <span className="ml-1 text-[9px] font-medium text-gray-500">
                      {weaponMastery.intoLevel}/{weaponMastery.nextLevelXp}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-0.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      weaponMastery.nextLevelXp > 0
                        ? Math.min(100, (weaponMastery.intoLevel / weaponMastery.nextLevelXp) * 100)
                        : 100
                    }%`,
                    background: 'linear-gradient(90deg, #b45309, #fbbf24)',
                    boxShadow: '0 0 6px rgba(251,191,36,0.55)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Top Right — Stats ===== */}
      {!hideStatsPanel && (
        <div className="absolute top-4 right-4 select-none">
          <div className="rounded-2xl border border-white/10 bg-black/75 px-4 py-3 w-44 text-right">
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
          className={`absolute ${fpsVisible ? 'top-14' : 'top-5'} left-1/2 -translate-x-1/2 select-none`}
          style={{ animation: 'comboIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          <div className="flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-950/75 px-4 py-1.5">
            <Flame className="w-4 h-4 text-orange-400" strokeWidth={2.25} fill="currentColor" />
            <span className="text-base font-bold text-orange-200 tabular-nums tracking-wide">{combo}x</span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-orange-300/80 uppercase">Combo</span>
          </div>
        </div>
      )}

      {/* ===== Bottom Center — Ability Bar ===== */}
      {abilities.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 select-none">
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/75 px-3 py-2.5">
            {abilities.map((a) => (
              <AbilitySlot key={a.key} ability={a} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Bottom Left — Stamina Pie ===== */}
      {/*
        Sprint meter. The pie sweeps clockwise as stamina depletes —
        emerald when healthy, amber when low, red when exhausted (locked).
        Matches the dark/glassy HUD aesthetic used elsewhere (rounded
        border, backdrop-blur, lucide icon).
      */}
      <StaminaPie ratio={staminaRatio} exhausted={staminaExhausted} unlimited={unlimitedStamina} />

      {/* ===== Bottom Right — Weapons ===== */}
      <div className="absolute bottom-4 right-4 select-none">
        <div className="rounded-2xl border border-white/10 bg-black/75 p-3">
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

/** Routes to the character-ability or looted-power renderer. */
const AbilitySlot = ({ ability }: { ability: AbilityHudItem }) =>
  ability.kind === 'dash' ? <DashSlot ability={ability} /> : <PowerSlot ability={ability} />;

/**
 * Character ability slot — always available, radial cooldown sweep that
 * "refills". Icon + accent colour come from the selected character so each
 * class reads distinctly (Dash, Firestorm, Cloak, …).
 */
const DashSlot = ({ ability }: { ability: AbilityHudItem }) => {
  const cd = ability.cooldown ?? 1;
  const ready = cd >= 1;
  const deg = Math.min(360, Math.max(0, cd * 360));
  const accent = ability.accent ?? '#34d399';
  const Icon = getAbilityIcon(ability.abilityId);
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex items-center justify-center w-12 h-12 rounded-xl border transition-colors duration-200"
        style={{
          borderColor: ability.active ? accent : ready ? `${accent}8c` : 'rgba(255,255,255,0.1)',
          background: ability.active ? `${accent}40` : ready ? `${accent}1a` : 'rgba(0,0,0,0.45)',
          animation: ready && !ability.active ? 'abilityReady 2.4s ease-in-out infinite' : undefined,
        }}
      >
        <Icon
          className="w-5 h-5"
          strokeWidth={2.5}
          style={{ color: ability.active ? '#ffffff' : ready ? accent : '#6b7280' }}
        />
        {!ready && (
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{ background: `conic-gradient(rgba(0,0,0,0) ${deg}deg, rgba(3,6,10,0.82) ${deg}deg)` }}
          />
        )}
        <kbd
          className="absolute -top-1.5 -right-1.5 px-1 min-w-[15px] h-[15px] flex items-center justify-center
            rounded bg-[#0b0f15] border text-[9px] font-bold font-mono"
          style={{ borderColor: ready ? `${accent}80` : 'rgba(255,255,255,0.15)', color: ready ? accent : '#6b7280' }}
        >
          {ability.key}
        </kbd>
      </div>
      <span className="text-[9px] font-semibold tracking-wide uppercase" style={{ color: ready ? '#d1d5db' : '#6b7280' }}>
        {ability.name}
      </span>
    </div>
  );
};

/**
 * The single looted-power slot. Three visual states:
 *   • empty  — dashed grey "Find Loot" prompt (no power held)
 *   • held   — amber, pulsing "ready to use" (press E)
 *   • active — emerald, with the shield's absorb bar when applicable
 */
const PowerSlot = ({ ability }: { ability: AbilityHudItem }) => {
  const state = ability.state ?? 'empty';
  const empty = state === 'empty';
  const held = state === 'held';
  const active = state === 'active';
  const Icon = empty ? PackageSearch : (POWER_ICONS[ability.powerType ?? ''] ?? PackageSearch);
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative flex items-center justify-center w-12 h-12 rounded-xl border transition-colors duration-200 ${
          held ? 'border-amber-400/70 bg-amber-500/15'
            : active ? 'border-emerald-400/70 bg-emerald-500/20'
            : 'border-dashed border-white/15 bg-black/40'
        }`}
        style={held ? { animation: 'abilityReady 1.6s ease-in-out infinite' } : undefined}
      >
        <Icon
          className={`w-5 h-5 ${held ? 'text-amber-300' : active ? 'text-emerald-200' : 'text-gray-600'}`}
          strokeWidth={2.25}
        />
        {/* Shield absorb bar (only while a shield power is active). */}
        {active && ability.ratio !== undefined && (
          <div className="absolute -bottom-0.5 left-1 right-1 h-1 rounded-full bg-black/55 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${Math.round(Math.max(0, Math.min(1, ability.ratio)) * 100)}%`,
                background: ability.ratio > 0.5 ? '#34d399' : ability.ratio > 0.25 ? '#fbbf24' : '#f87171',
              }}
            />
          </div>
        )}
        <kbd className={`absolute -top-1.5 -right-1.5 px-1 min-w-[15px] h-[15px] flex items-center justify-center
          rounded bg-[#0b0f15] border text-[9px] font-bold font-mono ${
          held ? 'border-amber-400/50 text-amber-300'
            : active ? 'border-emerald-400/50 text-emerald-300'
            : 'border-white/15 text-gray-600'}`}>
          {ability.key}
        </kbd>
      </div>
      <span className={`text-[9px] font-semibold tracking-wide uppercase ${
        held ? 'text-amber-300' : active ? 'text-emerald-300' : 'text-gray-600'}`}>
        {empty ? 'Find Loot' : ability.name}
      </span>
    </div>
  );
};

/**
 * Bottom-left circular stamina meter. Uses a conic-gradient for the pie
 * sweep (sweeps clockwise from 12 o'clock) layered behind a small
 * Footprints icon. Matches the game-wide HUD style:
 *   • rounded outer border + backdrop-blur
 *   • neutral grey base, emerald accent for live state
 *   • exhausted = red, low = amber, healthy = emerald
 *
 * Animation is pure CSS (transition on width / conic-gradient angle) so
 * the React state can be throttled (~12Hz) without the bar looking choppy.
 */
const StaminaPie = ({ ratio, exhausted, unlimited = false }: { ratio: number; exhausted: boolean; unlimited?: boolean }) => {
  const clamped = unlimited ? 1 : Math.max(0, Math.min(1, ratio));
  const deg = clamped * 360;
  const low = !unlimited && clamped > 0 && clamped < 0.3;
  const fillColor = unlimited
    ? '#34d399'                            // emerald — endless
    : exhausted
    ? '#f87171'                            // red — locked
    : low
    ? '#fbbf24'                            // amber — almost out
    : '#34d399';                           // emerald — healthy
  const fillGlow = unlimited
    ? 'rgba(52,211,153,0.5)'
    : exhausted
    ? 'rgba(248,113,113,0.45)'
    : low
    ? 'rgba(251,191,36,0.45)'
    : 'rgba(52,211,153,0.45)';

  return (
    <div className="absolute bottom-4 left-4 select-none">
      <div className="rounded-2xl border border-white/10 bg-black/75 px-3 py-2.5 flex items-center gap-3">
        {/* Pie ring */}
        <div className="relative w-12 h-12">
          {/* Outer ring (track) */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${fillColor} 0deg, ${fillColor} ${deg}deg, rgba(255,255,255,0.08) ${deg}deg)`,
              transition: 'background 180ms linear',
              boxShadow: `0 0 14px ${fillGlow}`,
            }}
          />
          {/* Inner cutout — makes it a ring, not a pie */}
          <div className="absolute inset-[5px] rounded-full bg-black/85 flex items-center justify-center">
            <Footprints
              className="w-4 h-4"
              strokeWidth={2.25}
              style={{ color: fillColor, transition: 'color 180ms linear' }}
            />
          </div>
        </div>

        {/* Side text — small numeric + label */}
        <div className="flex flex-col leading-tight pr-1">
          <span className="text-[9px] font-semibold tracking-[0.18em] text-gray-400 uppercase">
            {unlimited ? 'Sprint' : exhausted ? 'Exhausted' : 'Stamina'}
          </span>
          <span
            className="text-base font-bold tabular-nums"
            style={{ color: fillColor, transition: 'color 180ms linear' }}
          >
            {unlimited ? '∞' : `${Math.round(clamped * 100)}%`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default HUD;
