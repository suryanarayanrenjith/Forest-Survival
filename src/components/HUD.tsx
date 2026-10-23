import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Heart, Skull, Waves, Lock,
  Zap, Shield as ShieldIcon, Wind, Ghost, Footprints,
  Swords, Infinity as InfinityIcon, Boxes, PackageSearch, Bomb,
  Snowflake, Bolt, RadioTower, type LucideIcon,
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
  /**
   * Whether the ability is castable RIGHT NOW.
   *
   * Sent explicitly rather than derived from `cooldown >= 1`: the producer
   * quantises the fill to 1% for change-detection, so on a long cooldown the
   * final step is smaller than one quantum and a derived readiness would never
   * re-render — leaving the slot greyed out while the ability actually worked.
   */
  ready?: boolean;
  active?: boolean;   // currently active (dashing or effect running)
  // ── power slot ──
  powerType?: string | null;         // which loot power (null = empty slot)
  state?: 'empty' | 'held' | 'active'; // held = ready to use, active = running
  ratio?: number;     // 0..1 absorb bar (shield while active)
  /** Inside an ARK-07 interference field the trigger is dead — say so. */
  jammed?: boolean;
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
  cryo: Snowflake,
  tesla: Bolt,
  shockwave: Waves,
  health: Heart,
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
  /** 0..1 — current stamina fill for the sprint meter. */
  staminaRatio?: number;
  /** When true the player has emptied the meter and can't sprint until it
   *  partially refills. The meter renders in a red "depleted" state. */
  staminaExhausted?: boolean;
  /** Tutorial mode — sprinting is free, so the meter shows an "∞" full bar. */
  unlimitedStamina?: boolean;
  /** Touch devices use a compact top-left layout so the bottom corners stay
   *  free for the joystick + fire button, and the top-right for the
   *  weapon/pause touch buttons. */
  isTouch?: boolean;
  /** Difficulty-scaled multiplier on weapon unlock scores (easy 1×, medium/hard
   *  higher, adaptive dynamic). The locked-weapon tooltip shows the scaled
   *  requirement. Defaults to 1. */
  weaponUnlockMult?: number;
  /** ARK-07 network-event state for the CURRENT wave — renders the warning
   *  tag above the vitals ('surge' = OVERDRIVE, 'glitch' = NULL WAVE).
   *  Null/undefined = clean signal, no tag. (Relay-field exposure has NO
   *  tag by design — it announces itself through the interference vision.) */
  waveEvent?: 'surge' | 'glitch' | null;
}

// Status palette — shared with the menus' bio-emerald / ember identity.
const C_ACCENT = '#2ee8b4';
const C_WARN = '#ffb265';
const C_DANGER = '#ff5a5f';
const C_COOL = '#39d0e6';

const healthTone = (ratio: number, unlimited: boolean) =>
  unlimited ? C_ACCENT : ratio > 0.6 ? C_ACCENT : ratio > 0.3 ? C_WARN : C_DANGER;

/**
 * PARTIAL-ROUNDED radius (the game-wide shape language): top-left and
 * bottom-right corners rounded, the other two near-square, straight edges.
 */
const pr = (r: number) => `${r}px ${Math.max(1.5, Math.round(r * 0.25 * 2) / 2)}px`;

/**
 * Fixed-size slot frame: a true 1px border over an independent (translucent)
 * fill. Children (cooldown sweeps, icons) are clipped to the same shape.
 */
const SlotFrame = ({
  w, h, cut = 7, stroke, fill, children, className = '',
}: {
  w: number; h: number; cut?: number; stroke: string; fill: string; children?: ReactNode; className?: string;
}) => (
  <div
    className={`relative overflow-hidden ${className}`}
    style={{ width: w, height: h, borderRadius: pr(cut + 2), border: `1px solid ${stroke}`, background: fill }}
  >
    {children}
  </div>
);

/** Auto-sized panel with the same partial-rounded silhouette. */
const Panel = ({
  border, fill, className = '', style, children, cut = 7,
}: {
  border: string; fill: string; className?: string; style?: CSSProperties; children?: ReactNode; cut?: number;
}) => (
  <div
    className={`relative ${className}`}
    style={{ background: fill, border: `1px solid ${border}`, borderRadius: pr(cut + 2), ...style }}
  >
    {children}
  </div>
);

/** Slim warning tag for ARK-07 network events (solid fill — no blur). */
const WaveEventChip = ({ waveEvent, compact = false }: {
  waveEvent?: 'surge' | 'glitch' | null;
  compact?: boolean;
}) => {
  if (!waveEvent) return null;
  const surge = waveEvent === 'surge';
  const color = surge ? C_DANGER : C_COOL;
  const Icon = surge ? Zap : RadioTower;
  return (
    <Panel
      border={surge ? 'rgba(255,90,95,0.55)' : 'rgba(57,208,230,0.5)'}
      fill={surge ? '#1d0507' : '#04131a'}
      cut={5}
      className={`w-fit ${compact ? 'mt-1.5' : ''}`}
      style={{
        animation: surge ? 'hudEventPulse 1.2s ease-in-out infinite' : 'hudGlitchFlicker 0.7s steps(2, jump-none) infinite',
        willChange: 'opacity',
      }}
    >
      <div className={`flex items-center gap-1.5 ${compact ? 'px-2 py-[3px]' : 'px-2.5 py-1'}`}>
        <Icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} style={{ color }} strokeWidth={2.5} />
        <span
          className="hud-label"
          style={{
            color,
            fontSize: compact ? 8.5 : 9.5,
            letterSpacing: '0.22em',
            textShadow: surge ? undefined : '1px 0 rgba(255,60,220,0.7), -1px 0 rgba(64,224,255,0.7)',
          }}
        >
          {surge ? 'Overdrive Surge' : 'Signal Corrupted'}
        </span>
      </div>
    </Panel>
  );
};

/** Five-segment skewed health bar (the tactical-shooter staple). */
const SegmentedBar = ({ ratio, color, low, height = 8, segments = 5 }: {
  ratio: number; color: string; low: boolean; height?: number; segments?: number;
}) => (
  <div className="flex gap-[3px]" style={{ transform: 'skewX(-14deg)' }}>
    {Array.from({ length: segments }, (_, i) => {
      const fill = Math.max(0, Math.min(1, ratio * segments - i));
      return (
        <div key={i} className="relative flex-1 overflow-hidden" style={{ height, background: 'rgba(214,228,220,0.12)' }}>
          {/* Recent-damage chip: trails the fill so every hit reads as a chunk. */}
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: `${fill * 100}%`, background: 'rgba(255,236,214,0.72)', transition: 'width 0.55s cubic-bezier(0.4, 0, 0.2, 1) 0.3s' }}
          />
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-200 ease-out"
            style={{
              width: `${fill * 100}%`,
              background: `linear-gradient(180deg, ${color}, ${color}cc)`,
              boxShadow: `0 0 10px ${color}${low ? 'aa' : '66'}`,
            }}
          />
        </div>
      );
    })}
  </div>
);

const HUD = ({
  health, maxHealth = 100, ammo, maxAmmo, enemiesKilled, score, wave, weaponName,
  unlockedWeapons, currentWeapon, hideStatsPanel = false, unlimitedHealth = false,
  hideWave = false, abilities = [],
  staminaRatio = 1, staminaExhausted = false, unlimitedStamina = false,
  isTouch = false, weaponMastery, weaponUnlockMult = 1,
  waveEvent = null,
}: HUDProps) => {
  // Score pop: a short keyed scale-pulse every time the score climbs.
  const [scorePulse, setScorePulse] = useState(0);
  const prevScore = useRef(score);
  useEffect(() => {
    if (score > prevScore.current) setScorePulse((n) => n + 1);
    prevScore.current = score;
  }, [score]);
  // Hurt kick: the health readout jolts red on every hit taken.
  const [hurtTick, setHurtTick] = useState(0);
  const prevHealth = useRef(health);
  useEffect(() => {
    if (health < prevHealth.current - 0.5) setHurtTick((n) => n + 1);
    prevHealth.current = health;
  }, [health]);

  const safeMax = Math.max(1, maxHealth);
  const healthRatio = unlimitedHealth ? 1 : Math.max(0, Math.min(1, health / safeMax));
  const hpColor = healthTone(healthRatio, unlimitedHealth);
  const isLowHealth = !unlimitedHealth && healthRatio <= 0.3;
  const isLowAmmo = ammo <= Math.ceil(maxAmmo * 0.2);
  const ammoColor = ammo === 0 ? C_DANGER : isLowAmmo ? C_WARN : 'var(--hud-ink)';
  const stamina = unlimitedStamina ? 1 : Math.max(0, Math.min(1, staminaRatio));
  const staminaColor = unlimitedStamina ? C_COOL : staminaExhausted ? C_DANGER : stamina < 0.3 ? C_WARN : C_COOL;
  const hpText = unlimitedHealth ? '∞' : String(Math.max(0, Math.floor(health)));
  const weaponKeys = Object.keys(WEAPONS);
  const weaponIndex = weaponKeys.indexOf(currentWeapon);
  const glitchWave = waveEvent === 'glitch';

  // ── Compact touch HUD ──
  // One small top-left panel so the bottom corners (joystick + fire) and the
  // top-right (weapon/pause buttons) stay clear. Loadout, ability bar and the
  // stamina meter are surfaced through the on-screen touch buttons instead.
  if (isTouch) {
    return (
      <div className="touch-safe-pad absolute left-0 top-0 select-none">
        <Panel border="rgba(214,228,220,0.14)" fill="rgba(5,9,8,0.82)" className="m-2" cut={8}>
          <div className="px-2.5 pb-2 pt-1.5 hud-ink">
            <div className="flex flex-wrap items-end gap-x-3.5 gap-y-1">
              <div className="flex items-end gap-1">
                <Heart className="mb-[2px] h-3 w-3" style={{ color: hpColor }} strokeWidth={2.5} fill={isLowHealth ? hpColor : 'none'} />
                <span className="hud-num text-[17px]" style={{ color: hpColor, animation: isLowHealth ? 'hudLowPulse 0.9s ease-in-out infinite' : undefined }}>{hpText}</span>
              </div>
              <div className="flex items-end gap-1">
                <span className="hud-num text-[17px]" style={{ color: ammoColor }}>{ammo}</span>
                <span className="hud-num mb-[1px] text-[11px] text-[color:var(--hud-dim)]">/ {maxAmmo}</span>
              </div>
              {!hideStatsPanel && (
                <div className="flex items-end gap-1">
                  <span className="hud-label mb-[2px]" style={{ fontSize: 8 }}>Score</span>
                  <span className="hud-num text-[15px]">{score.toLocaleString()}</span>
                </div>
              )}
              {!hideStatsPanel && (
                <div className="flex items-end gap-1">
                  <Skull className="mb-[2px] h-3 w-3 text-[color:var(--hud-dim)]" strokeWidth={2.25} />
                  <span className="hud-num text-[13px]">{enemiesKilled}</span>
                </div>
              )}
              {!hideWave && !hideStatsPanel && (
                <div className="flex items-end gap-1">
                  <Waves className="mb-[2px] h-3 w-3" style={{ color: C_ACCENT }} strokeWidth={2.25} />
                  {/* NULL WAVE corrupts the wave readout — the counter itself "glitches". */}
                  <span
                    className="hud-num text-[13px]"
                    style={glitchWave ? { color: C_COOL, textShadow: '1px 0 rgba(255,60,220,0.8), -1px 0 rgba(64,224,255,0.8)' } : { color: C_ACCENT }}
                  >
                    {glitchWave ? '▓▒' : wave}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1">
                <SegmentedBar ratio={healthRatio} color={hpColor} low={isLowHealth} height={4} />
              </div>
              <div className="flex items-center gap-1">
                <Footprints className="h-2.5 w-2.5" style={{ color: staminaColor }} strokeWidth={2.5} />
                <div className="h-[3px] w-11 overflow-hidden" style={{ background: 'rgba(214,228,220,0.12)' }}>
                  <div className="h-full transition-[width] duration-200" style={{ width: `${stamina * 100}%`, background: staminaColor }} />
                </div>
              </div>
            </div>
            <WaveEventChip waveEvent={waveEvent} compact />
          </div>
        </Panel>
        {/* No combo pill here — ComboDisplay (top-centre, below the FPS pill)
            is the single owner of combo/streak UI in every mode. */}
      </div>
    );
  }

  const masteryPct = weaponMastery
    ? (weaponMastery.nextLevelXp > 0 ? Math.min(100, (weaponMastery.intoLevel / weaponMastery.nextLevelXp) * 100) : 100)
    : 0;
  // Individual rounds for magazines a player counts; a gauge for big belts.
  const showPips = maxAmmo > 0 && maxAmmo <= 30;

  return (
    <>
      {/* Legibility grade: a soft floor under the bottom HUD band and a corner
          wash behind the score, so white numerals hold over bright sky/snow.
          Plain gradients — no blur. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[26%]"
        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.34), rgba(0,0,0,0.12) 45%, transparent)' }}
      />
      {!hideStatsPanel && (
        <div
          className="pointer-events-none absolute right-0 top-0 h-48 w-80"
          style={{ background: 'radial-gradient(110% 100% at 100% 0%, rgba(0,0,0,0.32), transparent 70%)' }}
        />
      )}

      {/* ===== Top Right — Score ===== */}
      {!hideStatsPanel && (
        <div className="absolute right-7 top-5 select-none text-right hud-ink">
          <div className="hud-label">Score</div>
          <div
            key={scorePulse}
            className="hud-num mt-1 text-[42px]"
            style={{ transformOrigin: 'right center', animation: scorePulse ? 'hudScorePop 0.32s cubic-bezier(0.2, 0.9, 0.3, 1)' : undefined }}
          >
            {score.toLocaleString()}
          </div>
          <div className="hud-rule-r ml-auto mt-2 w-44" />
          <div className="mt-1.5 flex items-center justify-end gap-4">
            <div className="flex items-center gap-1.5">
              <Skull className="h-3.5 w-3.5 text-[color:var(--hud-dim)]" strokeWidth={2.25} />
              <span className="hud-num text-[17px]">{enemiesKilled}</span>
            </div>
            {!hideWave && (
              <div className="flex items-center gap-1.5">
                <span className="hud-label" style={{ fontSize: 9 }}>Wave</span>
                {/* NULL WAVE corrupts the wave readout — the counter itself "glitches". */}
                <span
                  className="hud-num text-[17px]"
                  style={glitchWave
                    ? { color: C_COOL, textShadow: '1px 0 rgba(255,60,220,0.8), -1px 0 rgba(64,224,255,0.8)' }
                    : { color: C_ACCENT }}
                >
                  {glitchWave ? '▓▒' : String(wave).padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NOTE: no combo pill here — ComboDisplay (top-centre, below the FPS
          pill) is the single owner of combo/streak UI. */}

      {/* ===== Bottom Left — Vitals ===== */}
      <div className="absolute bottom-6 left-7 w-[252px] select-none hud-ink">
        {/* ARK-07 network-event tag sits right above the vitals. */}
        {waveEvent && (
          <div className="mb-2.5">
            <WaveEventChip waveEvent={waveEvent} />
          </div>
        )}
        <div className="flex items-end justify-between">
          <div className="mb-1 flex items-center gap-2">
            <Heart className="h-3.5 w-3.5" style={{ color: hpColor }} strokeWidth={2.4} fill={isLowHealth ? hpColor : 'none'} />
            <span className="hud-label">Health</span>
          </div>
          <span
            key={hurtTick}
            className="hud-num inline-block text-[40px]"
            style={{
              color: isLowHealth ? hpColor : 'var(--hud-ink)',
              transformOrigin: 'right bottom',
              animation: [
                hurtTick ? 'hudHurtHit 0.38s ease-out' : '',
                isLowHealth ? 'hudLowPulse 0.9s ease-in-out infinite' : '',
              ].filter(Boolean).join(', ') || undefined,
            }}
          >
            {hpText}
          </span>
        </div>
        <div className="mt-1.5">
          <SegmentedBar ratio={healthRatio} color={hpColor} low={isLowHealth} />
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <Footprints className="h-3 w-3" style={{ color: staminaColor }} strokeWidth={2.4} />
          <span className="hud-label" style={{ fontSize: 9, color: staminaExhausted ? C_DANGER : undefined }}>
            {unlimitedStamina ? 'Sprint' : staminaExhausted ? 'Exhausted' : 'Stamina'}
          </span>
          <div className="h-[3px] flex-1 overflow-hidden" style={{ background: 'rgba(214,228,220,0.12)' }}>
            <div
              className="h-full transition-[width] duration-200 ease-linear"
              style={{ width: `${stamina * 100}%`, background: staminaColor, boxShadow: `0 0 8px ${staminaColor}88` }}
            />
          </div>
          <span className="hud-num w-8 text-right text-[13px]" style={{ color: staminaColor }}>
            {unlimitedStamina ? '∞' : Math.round(stamina * 100)}
          </span>
        </div>
      </div>

      {/* ===== Bottom Center — Ability Bar ===== */}
      {abilities.length > 0 && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-end gap-3 select-none">
          {abilities.map((a) => (
            <AbilitySlot key={a.key} ability={a} />
          ))}
        </div>
      )}

      {/* ===== Bottom Right — Weapon ===== */}
      <div className="absolute bottom-6 right-7 flex flex-col items-end select-none hud-ink">
        <div className="flex items-center gap-2">
          <span className="hud-label" style={{ color: 'var(--hud-ink)', letterSpacing: '0.24em' }}>{weaponName}</span>
          {weaponIndex >= 0 && (
            <span className="hud-key rounded-[2px] border border-[color:var(--hud-line)] px-1 py-[2px] text-[color:var(--hud-dim)]">
              {weaponIndex + 1}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-end gap-2">
          {/* Keyed on the count, so every shot / reload replays the kick. */}
          <span
            key={ammo}
            className="hud-num inline-block text-[58px]"
            style={{
              color: ammoColor,
              transformOrigin: 'right bottom',
              animation: ammo === 0 ? 'hudLowPulse 0.8s ease-in-out infinite' : 'hudAmmoKick 0.18s cubic-bezier(0.2, 0.9, 0.3, 1)',
            }}
          >
            {ammo}
          </span>
          <span className="hud-num mb-[6px] text-[22px] text-[color:var(--hud-dim)]">/ {maxAmmo}</span>
        </div>
        <div className="mt-1.5 flex justify-end">
          {showPips ? (
            <div className="flex gap-[2px]">
              {Array.from({ length: maxAmmo }, (_, i) => (
                <div
                  key={i}
                  className="h-[10px] w-[4px]"
                  style={{ background: i < ammo ? (isLowAmmo ? C_WARN : 'var(--hud-ink)') : 'rgba(214,228,220,0.13)' }}
                />
              ))}
            </div>
          ) : (
            <div className="relative h-[3px] w-[180px] overflow-hidden" style={{ background: 'rgba(214,228,220,0.13)' }}>
              <div
                className="absolute inset-y-0 right-0 transition-[width] duration-100"
                style={{ width: `${maxAmmo > 0 ? (ammo / maxAmmo) * 100 : 0}%`, background: isLowAmmo ? C_WARN : 'var(--hud-ink)' }}
              />
            </div>
          )}
        </div>
        {/* Weapon Mastery sliver — hidden for guests / tutorial. */}
        {weaponMastery && (
          <div className="mt-2 w-[180px]">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="hud-label" style={{ fontSize: 8.5, color: 'rgba(255,178,101,0.85)' }}>Mastery</span>
              <span className="hud-num text-[11px]" style={{ color: 'rgba(255,214,170,0.92)' }}>
                L{weaponMastery.level}
                {weaponMastery.nextLevelXp > 0 && (
                  <span className="ml-1 text-[10px] text-[color:var(--hud-faint)]">
                    {weaponMastery.intoLevel}/{weaponMastery.nextLevelXp}
                  </span>
                )}
              </span>
            </div>
            <div className="h-[2px] overflow-hidden" style={{ background: 'rgba(214,228,220,0.12)' }}>
              <div
                className="h-full transition-[width] duration-300"
                style={{ width: `${masteryPct}%`, background: 'linear-gradient(90deg, #b45309, #ffb265)', boxShadow: '0 0 6px rgba(255,178,101,0.55)' }}
              />
            </div>
          </div>
        )}
        {/* Loadout strip */}
        <div className="mt-2.5 flex gap-1">
          {weaponKeys.map((key, index) => {
            const unlocked = unlockedWeapons.includes(key);
            const current = currentWeapon === key;
            return (
              <div
                key={key}
                title={unlocked ? `${WEAPONS[key].name} (${index + 1})` : `Unlocks at ${Math.round(WEAPONS[key].unlockScore * weaponUnlockMult)} pts`}
                className="relative"
              >
                <SlotFrame
                  w={30}
                  h={22}
                  cut={5}
                  stroke={current ? 'rgba(46,232,180,0.8)' : unlocked ? 'rgba(214,228,220,0.2)' : 'rgba(214,228,220,0.09)'}
                  fill={current ? 'rgba(46,232,180,0.16)' : 'rgba(5,9,8,0.5)'}
                >
                  <div className="flex h-full w-full items-center justify-center">
                    {unlocked ? (
                      <span className="hud-num text-[13px]" style={{ color: current ? C_ACCENT : 'var(--hud-dim)' }}>{index + 1}</span>
                    ) : (
                      <Lock className="h-2.5 w-2.5 text-[color:var(--hud-faint)]" strokeWidth={2.5} />
                    )}
                  </div>
                </SlotFrame>
                {current && <div className="absolute -bottom-[3px] left-1/2 h-[2px] w-3 -translate-x-1/2" style={{ background: C_ACCENT, boxShadow: `0 0 6px ${C_ACCENT}` }} />}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

/** Routes to the character-ability or looted-power renderer. */
const AbilitySlot = ({ ability }: { ability: AbilityHudItem }) =>
  ability.kind === 'dash' ? <DashSlot ability={ability} /> : <PowerSlot ability={ability} />;

/** Keybind chip shared by both slot kinds. */
const KeyChip = ({ label, color, border }: { label: string; color: string; border: string }) => (
  <span
    className="hud-key absolute -right-1.5 -top-1.5 z-10 flex h-[15px] min-w-[15px] items-center justify-center rounded-[2px] px-1"
    style={{ background: '#070b0a', border: `1px solid ${border}`, color }}
  >
    {label}
  </span>
);

/**
 * Character ability slot — always available, radial cooldown sweep that
 * "refills". Icon + accent colour come from the selected character so each
 * class reads distinctly (Dash, Firestorm, Cloak, …).
 */
const DashSlot = ({ ability }: { ability: AbilityHudItem }) => {
  const cd = ability.cooldown ?? 1;
  // Trust the producer's explicit readiness (see AbilityHudItem.ready); the
  // fill is only for drawing the sweep. Falling back to `cd >= 1` keeps the
  // component correct if a caller omits it.
  const ready = ability.ready ?? cd >= 1;
  const deg = Math.min(360, Math.max(0, cd * 360));
  const accent = ability.accent ?? C_ACCENT;
  const Icon = getAbilityIcon(ability.abilityId);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ animation: ready && !ability.active ? 'hudSlotReady 2.4s ease-in-out infinite' : undefined }}>
        <SlotFrame
          w={52}
          h={52}
          cut={9}
          stroke={ability.active ? accent : ready ? `${accent}b0` : 'rgba(214,228,220,0.18)'}
          fill={ability.active ? `${accent}40` : ready ? `${accent}1a` : 'rgba(5,9,8,0.6)'}
        >
          <div className="flex h-full w-full items-center justify-center">
            <Icon
              className="h-[22px] w-[22px]"
              strokeWidth={2.3}
              style={{ color: ability.active ? '#ffffff' : ready ? accent : '#5f6a66' }}
            />
          </div>
          {!ready && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: `conic-gradient(rgba(0,0,0,0) ${deg}deg, rgba(3,6,6,0.78) ${deg}deg)` }}
            />
          )}
        </SlotFrame>
        <KeyChip label={ability.key} color={ready ? accent : '#6b7672'} border={ready ? `${accent}88` : 'rgba(214,228,220,0.18)'} />
      </div>
      <span className="hud-label" style={{ fontSize: 8.5, letterSpacing: '0.2em', color: ready ? 'var(--hud-ink)' : 'var(--hud-faint)' }}>
        {ability.name}
      </span>
    </div>
  );
};

/**
 * The single looted-power slot. Three visual states:
 *   • empty  — dim "Find Loot" prompt (no power held)
 *   • held   — ember, pulsing "ready to use" (press E)
 *   • active — emerald, with the shield's absorb bar when applicable
 */
const PowerSlot = ({ ability }: { ability: AbilityHudItem }) => {
  const state = ability.state ?? 'empty';
  const empty = state === 'empty';
  // A jammed slot still HOLDS its power — it just can't fire it, so it reads
  // as offline (red, flickering) rather than as ready-to-use. Without this the
  // HUD invites a press that the relay field silently refuses.
  const jammed = ability.jammed === true && !empty;
  const held = state === 'held' && !jammed;
  const active = state === 'active' && !jammed;
  const Icon = empty ? PackageSearch : (POWER_ICONS[ability.powerType ?? ''] ?? PackageSearch);
  const tone = jammed ? C_DANGER : held ? C_WARN : active ? C_ACCENT : '#5f6a66';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative"
        style={jammed
          ? { animation: 'hudGlitchFlicker 0.7s steps(2, jump-none) infinite' }
          : held ? { animation: 'hudSlotReady 1.6s ease-in-out infinite' } : undefined}
      >
        <SlotFrame
          w={52}
          h={52}
          cut={9}
          stroke={jammed ? 'rgba(255,90,95,0.65)' : held ? 'rgba(255,178,101,0.8)' : active ? 'rgba(46,232,180,0.8)' : 'rgba(214,228,220,0.14)'}
          fill={jammed ? 'rgba(48,6,10,0.6)' : held ? 'rgba(255,178,101,0.13)' : active ? 'rgba(46,232,180,0.18)' : 'rgba(5,9,8,0.48)'}
        >
          <div className="flex h-full w-full items-center justify-center">
            <Icon className="h-[21px] w-[21px]" style={{ color: tone }} strokeWidth={2.2} />
          </div>
          {/* Shield absorb bar (only while a shield power is active). */}
          {active && ability.ratio !== undefined && (
            <div className="absolute bottom-[5px] left-2 right-2 h-[3px] overflow-hidden" style={{ background: 'rgba(0,0,0,0.55)' }}>
              <div
                className="h-full transition-[width] duration-200"
                style={{
                  width: `${Math.round(Math.max(0, Math.min(1, ability.ratio)) * 100)}%`,
                  background: ability.ratio > 0.5 ? C_ACCENT : ability.ratio > 0.25 ? C_WARN : C_DANGER,
                }}
              />
            </div>
          )}
        </SlotFrame>
        <KeyChip label={ability.key} color={tone} border={empty ? 'rgba(214,228,220,0.18)' : `${tone}88`} />
      </div>
      <span className="hud-label" style={{ fontSize: 8.5, letterSpacing: '0.2em', color: empty ? 'var(--hud-faint)' : tone }}>
        {jammed ? 'Jammed' : empty ? 'Find Loot' : ability.name}
      </span>
    </div>
  );
};

export default HUD;
