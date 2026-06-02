import React, { useState } from 'react';
import {
  Sparkles, Swords, Heart, Footprints, Package, Check, Lock, X,
  Sigma, Coins, ChevronRight, ArrowRight, TrendingUp, type LucideIcon,
} from 'lucide-react';
import MusicMuteButton from './MusicMuteButton';
import { type Skill, type SkillEffect, type SkillCategory, type PlayStyle } from '../utils/SmartSkillTreeSystem';

interface SkillTreeMenuProps {
  skills: Skill[];
  availablePoints: number;
  spentPoints: number;
  totalPoints: number;
  detectedPlayStyle: PlayStyle;
  recommendations: string[];
  onUnlockSkill: (skillId: string) => void;
  onClose: () => void;
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  all: Sparkles,
  combat: Swords,
  survival: Heart,
  mobility: Footprints,
  support: Package,
};

const CATEGORY_COLOR: Record<string, string> = {
  all: '#34d399',
  combat: '#f87171',
  survival: '#34d399',
  mobility: '#fbbf24',
  support: '#c084fc',
};

const TIER_LABEL: Record<number, string> = {
  1: 'Foundation',
  2: 'Advanced',
  3: 'Mastery',
  4: 'Elite',
  5: 'Legendary',
};

const EMERALD = '#34d399';

/** A skill effect's cumulative bonus at a given level (0 below level 1).
 *  Mirrors SmartSkillTreeSystem.calculateStatBonuses so the UI preview always
 *  matches what the game loop actually applies. */
function effectAtLevel(e: SkillEffect, level: number): number {
  if (level <= 0) return 0;
  return e.value + (e.perLevel ?? 0) * (level - 1);
}

/** Player-facing text for a raw stat-bonus number (e.g. 0.3 → "+30%"). */
function formatStatBonus(stat: string | undefined, value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '+';
  switch (stat) {
    case 'maxHealth':
      return `${sign}${Math.round(abs)} HP`;
    case 'dashCooldown':
      return `−${Math.round(abs * 100)}% CD`;
    default:
      return `${sign}${Math.round(abs * 100)}%`;
  }
}

export const SkillTreeMenu: React.FC<SkillTreeMenuProps> = ({
  skills,
  availablePoints,
  spentPoints,
  totalPoints,
  recommendations,
  onUnlockSkill,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all');
  const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const focused = hoveredSkill ?? selectedSkill;

  // Only categories that actually have skills (keeps the sidebar clean).
  const availableCategories = Array.from(new Set(skills.map((s) => s.category)));
  const categories: Array<{ id: SkillCategory | 'all'; name: string }> = [
    { id: 'all', name: 'All Skills' },
    ...(['combat', 'survival', 'mobility', 'support'] as const)
      .filter((c) => availableCategories.includes(c))
      .map((c) => ({ id: c, name: c.charAt(0).toUpperCase() + c.slice(1) })),
  ];

  const filteredSkills = selectedCategory === 'all'
    ? skills
    : skills.filter((s) => s.category === selectedCategory);

  const groupedByTier = filteredSkills.reduce((acc, skill) => {
    if (!acc[skill.tier]) acc[skill.tier] = [];
    acc[skill.tier].push(skill);
    return acc;
  }, {} as Record<number, Skill[]>);

  // Summarise live bonuses from unlocked skills for the sidebar — the actual
  // cumulative value at the current level (e.g. "+30 HP"), not the per-level
  // description, so the player sees exactly what they've banked.
  const activeBonuses = skills
    .filter((s) => s.currentLevel > 0)
    .flatMap((s) =>
      s.effects.map((e) => ({
        skillName: s.name,
        value: formatStatBonus(e.stat, effectAtLevel(e, s.currentLevel)),
        category: s.category,
        level: s.currentLevel,
      })),
    );

  const progressPct = totalPoints > 0 ? (spentPoints / totalPoints) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,8,10,0.94)', backdropFilter: 'blur(14px)' }}
    >
      <MusicMuteButton />
      <div
        className="relative w-full max-w-6xl h-[90dvh] flex flex-col rounded-2xl border border-white/10 bg-[#0b0f15] overflow-hidden shadow-2xl"
        style={{ animation: 'stFade 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(52,211,153,0.55), transparent)' }}
        />

        {/* ===== HEADER ===== */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-center gap-3.5">
            <div
              className="flex items-center justify-center w-11 h-11 rounded-xl border border-emerald-400/30"
              style={{ background: 'rgba(52,211,153,0.12)' }}
            >
              <Sparkles className="w-5 h-5 text-emerald-300" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Skill Tree</h2>
              <p className="text-[11px] text-gray-500 tracking-wide">
                Spend points earned from your runs to make your operator stronger.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Points display */}
            <div className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] px-4 py-2">
              <Coins className="w-4 h-4 text-emerald-300" strokeWidth={2.25} />
              <div className="text-right">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums text-emerald-200 leading-none">{availablePoints}</span>
                  <span className="text-[10px] font-semibold tracking-[0.15em] text-emerald-400/70 uppercase">Available</span>
                </div>
                <div className="mt-1.5 h-1 w-32 rounded-full bg-emerald-500/15 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #34d399, #22c55e)' }}
                  />
                </div>
                <div className="text-[9px] text-emerald-400/60 mt-0.5 tracking-wide">
                  {spentPoints} of {totalPoints} spent
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-gray-400
                transition-all hover:text-white hover:bg-white/[0.06] hover:border-white/20"
              aria-label="Close skill tree"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* ===== BODY ===== */}
        <div className="flex flex-1 overflow-hidden">
          {/* ----- Sidebar ----- */}
          <div className="w-56 flex-shrink-0 border-r border-white/[0.07] overflow-y-auto hidden sm:flex flex-col">
            <div className="p-3">
              <div className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 uppercase mb-2 px-1">Categories</div>
              <div className="space-y-1">
                {categories.map((cat) => {
                  const Icon = CATEGORY_ICON[cat.id] ?? Sparkles;
                  const color = CATEGORY_COLOR[cat.id] ?? EMERALD;
                  const active = selectedCategory === cat.id;
                  const count = cat.id === 'all' ? skills.length : skills.filter((s) => s.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                        active ? 'text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                      }`}
                      style={active ? {
                        background: `${color}1a`,
                        boxShadow: `inset 0 0 0 1px ${color}55`,
                      } : undefined}
                    >
                      <Icon
                        className="w-4 h-4 transition-colors"
                        style={{ color: active ? color : '#9ca3af' }}
                        strokeWidth={2.25}
                      />
                      <span className="flex-1 text-left">{cat.name}</span>
                      <span className="text-[10px] font-bold tabular-nums" style={{ color: active ? color : '#6b7280' }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active bonuses summary */}
            <div className="px-3 pb-3 border-t border-white/[0.06] pt-3 mt-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.2em] text-emerald-400/80 uppercase mb-2 px-1">
                <Sigma className="w-3 h-3" strokeWidth={2.5} /> Active Bonuses
              </div>
              {activeBonuses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.01] px-3 py-3 text-[11px] text-gray-600 text-center">
                  Unlock a skill to see live bonuses here.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {activeBonuses.map((b, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold text-emerald-300 truncate">{b.skillName}</div>
                        <div className="text-[9px] text-gray-500 leading-snug">Level {b.level}</div>
                      </div>
                      <div className="flex-shrink-0 text-[11px] font-bold tabular-nums text-emerald-200">{b.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ----- Skills grid ----- */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-7">
              {[1, 2, 3, 4, 5].map((tier) => {
                const tierSkills = groupedByTier[tier] || [];
                if (tierSkills.length === 0) return null;
                return (
                  <div key={tier}>
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold tabular-nums"
                        style={{ background: 'rgba(52,211,153,0.12)', color: EMERALD }}
                      >
                        {tier}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-white tracking-wide">{TIER_LABEL[tier] ?? `Tier ${tier}`}</div>
                        <div className="text-[10px] text-gray-600 tracking-widest uppercase">Tier {tier}</div>
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {tierSkills.map((skill) => {
                        const reqsMet = requirementsMet(skill, skills);
                        return (
                          <SkillCard
                            key={skill.id}
                            skill={skill}
                            isRecommended={recommendations.includes(skill.id)}
                            canAfford={availablePoints >= skill.cost}
                            requirementsMet={reqsMet}
                            onHover={() => setHoveredSkill(skill)}
                            onLeave={() => setHoveredSkill(null)}
                            onClick={() => setSelectedSkill(skill)}
                            isSelected={selectedSkill?.id === skill.id}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ----- Detail panel (desktop / wide) ----- */}
          <div className="w-80 flex-shrink-0 border-l border-white/[0.07] overflow-y-auto hidden lg:block">
            {focused ? (
              <SkillDetails
                key={focused.id}
                skill={focused}
                allSkills={skills}
                canAfford={availablePoints >= focused.cost}
                onUnlock={() => {
                  onUnlockSkill(focused.id);
                  setSelectedSkill(null);
                }}
              />
            ) : (
              <EmptyDetail />
            )}
          </div>
        </div>

        {/* ----- Detail sheet (mobile / tablet, < lg) ----- */}
        {/* The right detail column is hidden below lg, so on phones/tablets a
            tapped skill opens this bottom sheet — the only place to read its
            details and actually unlock it. */}
        {selectedSkill && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/60 lg:hidden" onClick={() => setSelectedSkill(null)}>
            <div
              className="max-h-[78%] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#0b0f15]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-end px-3 pt-2">
                <button
                  onClick={() => setSelectedSkill(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                  aria-label="Close skill details"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
              <SkillDetails
                key={`m-${selectedSkill.id}`}
                skill={selectedSkill}
                allSkills={skills}
                canAfford={availablePoints >= selectedSkill.cost}
                onUnlock={() => {
                  onUnlockSkill(selectedSkill.id);
                  setSelectedSkill(null);
                }}
              />
            </div>
          </div>
        )}

        {/* ===== FOOTER ===== */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/[0.07] bg-gradient-to-t from-white/[0.02] to-transparent">
          <span className="text-[11px] text-gray-500 tracking-wide">
            Skill points are earned each run · Unlocks are saved to your account
          </span>
          <button
            onClick={onClose}
            className="group flex items-center gap-2 rounded-xl px-7 py-2.5 text-sm font-bold tracking-wide text-[#04130a] transition-all duration-200 hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)', boxShadow: '0 8px 24px -8px rgba(52,211,153,0.55)' }}
          >
            Done
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes stFade {
          from { opacity: 0; transform: scale(0.97) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes stRecommendedPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
          50% { box-shadow: 0 0 14px -2px rgba(251,191,36,0.55); }
        }
      `}</style>
    </div>
  );
};

/** Whether all of a skill's prerequisite skills are unlocked. */
function requirementsMet(skill: Skill, all: Skill[]): boolean {
  for (const req of skill.requirements) {
    if (req.type === 'skill') {
      const pre = all.find((s) => s.id === req.value);
      if (!pre || pre.currentLevel < 1) return false;
    }
  }
  return true;
}

/* ============================================================
 * SKILL CARD
 * ============================================================ */
interface SkillCardProps {
  skill: Skill;
  isRecommended: boolean;
  canAfford: boolean;
  requirementsMet: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
  isSelected: boolean;
}

const SkillCard: React.FC<SkillCardProps> = ({
  skill, isRecommended, canAfford, requirementsMet, onHover, onLeave, onClick, isSelected,
}) => {
  const isMaxed = skill.currentLevel >= skill.maxLevel;
  const isUnlocked = skill.currentLevel > 0;
  const isLocked = !requirementsMet;
  const Icon = CATEGORY_ICON[skill.category] ?? Sparkles;
  const catColor = CATEGORY_COLOR[skill.category] ?? EMERALD;

  let borderColor = 'rgba(255,255,255,0.08)';
  let bg = 'rgba(255,255,255,0.025)';
  let iconColor = canAfford && requirementsMet ? '#cbd5e1' : '#6b7280';
  let glow = '';

  if (isLocked) {
    borderColor = 'rgba(255,255,255,0.05)';
    bg = 'rgba(0,0,0,0.25)';
    iconColor = '#4b5563';
  } else if (isMaxed) {
    borderColor = 'rgba(52,211,153,0.55)';
    bg = 'rgba(52,211,153,0.08)';
    iconColor = EMERALD;
    glow = '0 0 18px -4px rgba(52,211,153,0.45)';
  } else if (isSelected) {
    borderColor = `${catColor}99`;
    bg = `${catColor}1a`;
    iconColor = catColor;
  } else if (isUnlocked) {
    borderColor = `${catColor}66`;
    bg = `${catColor}10`;
    iconColor = catColor;
  } else if (isRecommended && canAfford) {
    borderColor = 'rgba(251,191,36,0.5)';
    bg = 'rgba(251,191,36,0.07)';
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="group relative p-3.5 rounded-xl border text-left transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor,
        background: bg,
        boxShadow: glow || undefined,
        animation: isRecommended && !isMaxed && !isUnlocked && canAfford
          ? 'stRecommendedPulse 2.4s ease-in-out infinite'
          : undefined,
      }}
    >
      {/* Recommended star */}
      {isRecommended && !isMaxed && !isUnlocked && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-amber-400">
          <Sparkles className="w-2.5 h-2.5 text-amber-900" strokeWidth={2.5} fill="currentColor" />
        </span>
      )}
      {/* Lock badge */}
      {isLocked && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-[#0b0f15] border border-white/15">
          <Lock className="w-2.5 h-2.5 text-gray-500" strokeWidth={2.5} />
        </span>
      )}
      {/* Maxed badge */}
      {isMaxed && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-emerald-400">
          <Check className="w-3 h-3 text-[#04130a]" strokeWidth={3} />
        </span>
      )}

      <div className="flex items-start gap-2.5 mb-2">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
          style={{ background: `${catColor}1a`, boxShadow: `inset 0 0 0 1px ${catColor}33` }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-bold leading-tight ${isLocked ? 'text-gray-500' : 'text-white'} line-clamp-1`}>
            {skill.name}
          </div>
          <div className="text-[10px] font-semibold tracking-wide capitalize" style={{ color: isLocked ? '#4b5563' : catColor }}>
            {skill.category}
          </div>
        </div>
      </div>

      <div className={`text-[11px] line-clamp-2 leading-snug mb-2.5 ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}>
        {skill.description}
      </div>

      {/* Level pips */}
      <div className="flex items-center gap-1 mb-2">
        {Array.from({ length: skill.maxLevel }).map((_, i) => {
          const filled = i < skill.currentLevel;
          return (
            <div
              key={i}
              className="flex-1 h-1 rounded-full transition-all duration-300"
              style={{
                background: filled
                  ? (isMaxed ? EMERALD : catColor)
                  : 'rgba(255,255,255,0.08)',
                boxShadow: filled && isMaxed ? '0 0 6px rgba(52,211,153,0.55)' : undefined,
              }}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono font-semibold tabular-nums" style={{ color: iconColor }}>
          Lv {skill.currentLevel}/{skill.maxLevel}
        </span>
        {!isMaxed && (
          <span
            className="flex items-center gap-1 font-semibold"
            style={{ color: isLocked ? '#4b5563' : canAfford ? '#fbbf24' : '#6b7280' }}
          >
            <Coins className="w-3 h-3" strokeWidth={2.5} /> {skill.cost}
          </span>
        )}
      </div>
    </button>
  );
};

/* ============================================================
 * DETAIL PANEL
 * ============================================================ */
const EmptyDetail = () => (
  <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
    <div className="flex items-center justify-center w-14 h-14 rounded-2xl border border-white/[0.07] bg-white/[0.02] mb-4">
      <Sparkles className="w-6 h-6 text-gray-600" strokeWidth={1.75} />
    </div>
    <h3 className="text-sm font-bold text-gray-400 mb-1">Hover a skill to inspect it</h3>
    <p className="text-[11px] text-gray-600 leading-relaxed max-w-[16rem]">
      Click any skill to lock it in for inspection while you compare options.
    </p>
  </div>
);

interface SkillDetailsProps {
  skill: Skill;
  allSkills: Skill[];
  canAfford: boolean;
  onUnlock: () => void;
}

const SkillDetails: React.FC<SkillDetailsProps> = ({ skill, allSkills, canAfford, onUnlock }) => {
  const isMaxed = skill.currentLevel >= skill.maxLevel;
  const reqsMet = requirementsMet(skill, allSkills);
  const canUnlock = canAfford && !isMaxed && reqsMet;
  const Icon = CATEGORY_ICON[skill.category] ?? Sparkles;
  const catColor = CATEGORY_COLOR[skill.category] ?? EMERALD;

  return (
    <div className="p-5">
      {/* Header */}
      <div className="text-center mb-5">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3"
          style={{
            background: `${catColor}14`,
            boxShadow: `inset 0 0 0 1px ${catColor}44, 0 8px 22px -10px ${catColor}88`,
          }}
        >
          <Icon className="w-7 h-7" style={{ color: catColor }} strokeWidth={2} />
        </div>
        <h3 className="text-lg font-bold text-white">{skill.name}</h3>
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase mt-1" style={{ color: catColor }}>
          {skill.category} · Tier {skill.tier}
        </div>
      </div>

      {/* Description */}
      <DetailBlock title="Description">
        <p className="text-sm text-gray-300 leading-relaxed">{skill.description}</p>
      </DetailBlock>

      {/* Effects — with a live "current → next level" preview so the player can
          see exactly what the next point buys before spending it. */}
      <DetailBlock title="Effects">
        <div className="space-y-1.5">
          {skill.effects.map((effect, idx) => {
            const cur = effectAtLevel(effect, skill.currentLevel);
            const nextLevel = Math.min(skill.currentLevel + 1, skill.maxLevel);
            const next = effectAtLevel(effect, nextLevel);
            return (
              <div
                key={idx}
                className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" strokeWidth={2.25} />
                  <span className="text-xs text-emerald-200 leading-tight">{effect.description}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 pl-[22px] text-[11px]">
                  {isMaxed ? (
                    <span className="font-semibold text-emerald-300">
                      {formatStatBonus(effect.stat, cur)}
                      <span className="ml-1 font-normal text-emerald-500/70">· maxed</span>
                    </span>
                  ) : skill.currentLevel === 0 ? (
                    <span className="text-gray-400">
                      At Lv 1:{' '}
                      <span className="font-bold tabular-nums text-emerald-300">
                        {formatStatBonus(effect.stat, next)}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-gray-400">
                      <span className="font-bold tabular-nums text-gray-300">{formatStatBonus(effect.stat, cur)}</span>
                      <ArrowRight className="w-3 h-3 text-emerald-400/80" strokeWidth={2.5} />
                      <span className="font-bold tabular-nums text-emerald-300">{formatStatBonus(effect.stat, next)}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DetailBlock>

      {/* Requirements */}
      {skill.requirements.length > 0 && (
        <DetailBlock title="Requirements">
          <div className="space-y-1">
            {skill.requirements.map((req, idx) => {
              if (req.type === 'skill') {
                const pre = allSkills.find((s) => s.id === req.value);
                const met = pre ? pre.currentLevel >= 1 : false;
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                      met
                        ? 'border-emerald-400/25 bg-emerald-500/[0.05] text-emerald-300'
                        : 'border-white/10 bg-white/[0.03] text-gray-400'
                    }`}
                  >
                    {met
                      ? <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} />
                      : <Lock className="w-3 h-3 flex-shrink-0" strokeWidth={2.5} />}
                    <span className="truncate">{pre ? pre.name : String(req.value)}</span>
                  </div>
                );
              }
              return (
                <div key={idx} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-gray-400">
                  <Lock className="w-3 h-3" strokeWidth={2.5} /> {req.type}: {String(req.value)}
                </div>
              );
            })}
          </div>
        </DetailBlock>
      )}

      {/* Synergies */}
      {skill.synergiesWith.length > 0 && (
        <DetailBlock title="Synergises With">
          <div className="flex flex-wrap gap-1.5">
            {skill.synergiesWith.map((sid) => {
              const syn = allSkills.find((s) => s.id === sid);
              if (!syn) return null;
              return (
                <span
                  key={sid}
                  className="text-[11px] px-2 py-0.5 rounded-md border border-violet-400/25 bg-violet-500/[0.07] text-violet-300"
                >
                  {syn.name}
                </span>
              );
            })}
          </div>
        </DetailBlock>
      )}

      {/* Progress */}
      <DetailBlock title="Progress">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-white">Level {skill.currentLevel} / {skill.maxLevel}</span>
          {!isMaxed && (
            <span className="flex items-center gap-1 text-sm font-semibold text-amber-400">
              <Coins className="w-3.5 h-3.5" strokeWidth={2.5} /> {skill.cost} pts
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: skill.maxLevel }).map((_, i) => {
            const filled = i < skill.currentLevel;
            return (
              <div
                key={i}
                className="flex-1 h-1.5 rounded-full transition-all duration-300"
                style={{
                  background: filled ? (isMaxed ? EMERALD : catColor) : 'rgba(255,255,255,0.08)',
                }}
              />
            );
          })}
        </div>
      </DetailBlock>

      {/* Action button */}
      {isMaxed ? (
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
            border border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
        >
          <Check className="w-4 h-4" strokeWidth={3} /> Maxed Out
        </button>
      ) : !reqsMet ? (
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
            border border-white/10 bg-white/[0.03] text-gray-500 cursor-not-allowed"
        >
          <Lock className="w-3.5 h-3.5" strokeWidth={2.25} /> Requirements Not Met
        </button>
      ) : canUnlock ? (
        <button
          onClick={onUnlock}
          className="group w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm tracking-wide text-[#04130a] transition-all duration-200 hover:-translate-y-0.5"
          style={{
            background: 'linear-gradient(135deg, #34d399, #22c55e)',
            boxShadow: '0 8px 24px -8px rgba(52,211,153,0.6)',
          }}
        >
          {skill.currentLevel === 0 ? <Sparkles className="w-4 h-4" strokeWidth={2.5} /> : <TrendingUp className="w-4 h-4" strokeWidth={2.5} />}
          {skill.currentLevel === 0 ? 'Unlock' : `Upgrade to Lv ${skill.currentLevel + 1}`} — {skill.cost} pts
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
        </button>
      ) : (
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
            border border-white/10 bg-white/[0.03] text-gray-500 cursor-not-allowed"
        >
          <Lock className="w-3.5 h-3.5" strokeWidth={2.25} /> Need {skill.cost} pts
        </button>
      )}
    </div>
  );
};

const DetailBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <div className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 uppercase mb-1.5">{title}</div>
    {children}
  </div>
);

export default SkillTreeMenu;
