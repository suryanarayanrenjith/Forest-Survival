import React, { useState } from 'react';
import {
  Sparkles, Swords, Heart, Footprints, Package, Check, Lock, X,
  Sigma, Coins, ChevronRight, ArrowRight, TrendingUp, Star, type LucideIcon,
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

// Per-category accent colours. `all` carries the brand bio-emerald so the
// default view reads as "the whole lattice", while each path keeps a distinct
// hue for fast scanning.
const CATEGORY_COLOR: Record<string, string> = {
  all: '#2ee8b4',
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
const EMBER = '#fbbf24'; // recommended / points highlight

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

  // Headline counts for the "lattice" summary chips.
  const unlockedCount = skills.filter((s) => s.currentLevel > 0).length;
  const masteredCount = skills.filter((s) => s.currentLevel >= s.maxLevel).length;

  const progressPct = totalPoints > 0 ? (spentPoints / totalPoints) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 menu-overlay-in"
      style={{ background: 'rgba(4,7,9,0.9)', backdropFilter: 'blur(16px)' }}
    >
      <MusicMuteButton />
      <div
        className="hud-frame relative w-full max-w-6xl h-[92dvh] flex flex-col rounded-2xl border border-emerald-400/15 overflow-hidden"
        style={{
          background: 'linear-gradient(157deg, #0a100e 0%, #070c0b 52%, #05090a 100%)',
          boxShadow: '0 50px 130px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.05)',
          animation: 'stFade 0.42s cubic-bezier(0.16,1,0.3,1) forwards',
          '--hud-bracket': 'rgba(46,232,180,0.5)',
        } as React.CSSProperties}
      >
        {/* ===== DECORATIVE ATMOSPHERE (behind content) ===== */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {/* Drifting aurora blooms — the bioluminescent glow that ties the
              panel to the forest's night palette. */}
          <div
            className="panel-drift absolute -top-28 -left-20 w-[26rem] h-[26rem] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(46,232,180,0.15), transparent 68%)', filter: 'blur(14px)' }}
          />
          <div
            className="panel-drift absolute -bottom-32 -right-16 w-[30rem] h-[30rem] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(57,208,230,0.11), transparent 70%)', filter: 'blur(18px)', animationDelay: '-5.5s' }}
          />
          {/* Skill-lattice grid — a faint node mesh, masked to fade toward the
              edges so it sits under the content like circuitry. */}
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'linear-gradient(rgba(46,232,180,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(46,232,180,0.045) 1px, transparent 1px)',
              backgroundSize: '34px 34px',
              maskImage: 'radial-gradient(ellipse at 50% 8%, black 5%, transparent 78%)',
              WebkitMaskImage: 'radial-gradient(ellipse at 50% 8%, black 5%, transparent 78%)',
            }}
          />
          {/* Top emerald→aurora hairline */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(46,232,180,0.65), rgba(57,208,230,0.5), transparent)' }}
          />
        </div>

        {/* ===== HEADER ===== */}
        <div className="relative z-10 flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-white/[0.07] bg-gradient-to-b from-white/[0.025] to-transparent">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="relative flex items-center justify-center w-11 h-11 rounded-xl border border-emerald-400/35 flex-shrink-0"
              style={{ background: 'radial-gradient(circle at 50% 30%, rgba(46,232,180,0.22), rgba(46,232,180,0.06))', boxShadow: '0 0 22px -6px rgba(46,232,180,0.6), inset 0 0 0 1px rgba(46,232,180,0.12)' }}
            >
              <Sparkles className="w-5 h-5 text-emerald-200" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="aurora-rule hidden sm:block h-px w-6 bg-emerald-400/40" />
                <p className="font-hud text-[10px] tracking-[0.38em] text-emerald-300/90 font-semibold uppercase">Progression · Bio-Lattice</p>
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-semibold uppercase tracking-[0.06em] text-white leading-none mt-0.5">Skill Tree</h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-4 flex-shrink-0">
            {/* Points core */}
            <div
              className="flex items-center gap-2.5 sm:gap-3 rounded-xl border border-emerald-400/25 px-3 sm:px-4 py-2"
              style={{ background: 'linear-gradient(135deg, rgba(46,232,180,0.12), rgba(57,208,230,0.05))' }}
            >
              <div
                className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg border border-emerald-400/30"
                style={{ background: 'rgba(46,232,180,0.12)' }}
              >
                <Coins className="w-4 h-4 text-emerald-200" strokeWidth={2.25} />
              </div>
              <div className="text-right sm:text-left">
                <div className="flex items-baseline gap-1.5 justify-end sm:justify-start">
                  <span className="font-display text-2xl sm:text-[28px] font-bold tabular-nums leading-none text-white">{availablePoints}</span>
                  <span className="font-hud text-[9px] font-semibold tracking-[0.18em] text-emerald-300/80 uppercase">pts ready</span>
                </div>
                <div className="mt-1.5 h-1 w-28 sm:w-36 rounded-full overflow-hidden ml-auto sm:ml-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #2ee8b4, #39d0e6)' }}
                  />
                </div>
                <div className="font-hud text-[9px] text-gray-500 mt-0.5 tracking-[0.14em] uppercase">
                  {spentPoints} / {totalPoints} invested
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
        <div className="relative z-10 flex flex-1 overflow-hidden">
          {/* ----- Sidebar ----- */}
          <div className="w-56 flex-shrink-0 border-r border-white/[0.07] overflow-y-auto hidden sm:flex flex-col bg-black/20">
            <div className="p-3">
              <div className="font-hud text-[10px] font-semibold tracking-[0.22em] text-gray-500 uppercase mb-2 px-1">Paths</div>
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
                      className={`group relative w-full flex items-center gap-2.5 pl-3.5 pr-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                        active ? 'text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                      }`}
                      style={active ? {
                        background: `linear-gradient(90deg, ${color}24, ${color}0a)`,
                        boxShadow: `inset 0 0 0 1px ${color}44`,
                      } : undefined}
                    >
                      {/* Active path accent bar */}
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                      )}
                      <Icon
                        className="w-4 h-4 transition-colors"
                        style={{ color: active ? color : '#9ca3af' }}
                        strokeWidth={2.25}
                      />
                      <span className="flex-1 text-left">{cat.name}</span>
                      <span className="font-hud text-[10px] font-bold tabular-nums" style={{ color: active ? color : '#6b7280' }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Lattice summary chips */}
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-center">
                  <div className="font-display text-lg font-bold tabular-nums leading-none text-emerald-200">{unlockedCount}</div>
                  <div className="font-hud text-[8px] tracking-[0.16em] text-gray-500 uppercase mt-1">Unlocked</div>
                </div>
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.05] px-2.5 py-2 text-center">
                  <div className="font-display text-lg font-bold tabular-nums leading-none text-emerald-300">{masteredCount}</div>
                  <div className="font-hud text-[8px] tracking-[0.16em] text-emerald-400/70 uppercase mt-1">Mastered</div>
                </div>
              </div>
            </div>

            {/* Active bonuses summary */}
            <div className="px-3 pb-3 border-t border-white/[0.06] pt-3 mt-1">
              <div className="font-hud flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.2em] text-emerald-400/80 uppercase mb-2 px-1">
                <Sigma className="w-3 h-3" strokeWidth={2.5} /> Active Bonuses
              </div>
              {activeBonuses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.01] px-3 py-3 text-[11px] text-gray-600 text-center leading-relaxed">
                  Spend a point to light up the lattice — live bonuses appear here.
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
                        <div className="font-hud text-[9px] text-gray-500 leading-snug tracking-wide">Level {b.level}</div>
                      </div>
                      <div className="flex-shrink-0 font-mono text-[11px] font-bold tabular-nums text-emerald-200">{b.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ----- Skills grid ----- */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="space-y-7">
              {[1, 2, 3, 4, 5].map((tier) => {
                const tierSkills = groupedByTier[tier] || [];
                if (tierSkills.length === 0) return null;
                return (
                  <div key={tier} style={{ animation: 'stTierIn 0.5s cubic-bezier(0.16,1,0.3,1) backwards', animationDelay: `${0.05 + tier * 0.05}s` }}>
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className="font-display relative inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold tabular-nums"
                        style={{ background: 'linear-gradient(135deg, rgba(46,232,180,0.18), rgba(57,208,230,0.08))', color: EMERALD, boxShadow: 'inset 0 0 0 1px rgba(46,232,180,0.25)' }}
                      >
                        {tier}
                      </span>
                      <div>
                        <div className="font-display text-sm font-semibold uppercase text-white tracking-[0.08em] leading-none">{TIER_LABEL[tier] ?? `Tier ${tier}`}</div>
                        <div className="font-hud text-[9px] text-gray-600 tracking-[0.22em] uppercase mt-0.5">Tier {tier}</div>
                      </div>
                      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(46,232,180,0.25), transparent)' }} />
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
          <div className="w-80 flex-shrink-0 border-l border-white/[0.07] overflow-y-auto hidden lg:block bg-black/20">
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
              className="max-h-[80%] overflow-y-auto rounded-t-2xl border-t border-emerald-400/20 bg-[#080d0b]"
              style={{ animation: 'stSheetUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards', boxShadow: '0 -24px 60px rgba(0,0,0,0.6)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 pt-3">
                <span className="font-hud text-[10px] tracking-[0.24em] text-emerald-300/80 uppercase">Skill Detail</span>
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
        <div className="relative z-10 flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-white/[0.07] bg-gradient-to-t from-white/[0.025] to-transparent">
          <span className="font-hud text-[10px] text-gray-500 tracking-[0.16em] uppercase hidden sm:inline">
            Points earned every run · saved to your account
          </span>
          <span className="font-hud text-[10px] text-gray-500 tracking-[0.16em] uppercase sm:hidden">
            Saved to your account
          </span>
          <button
            onClick={onClose}
            className="font-hud group flex items-center gap-2 rounded-xl px-6 sm:px-7 py-2.5 text-sm font-bold uppercase tracking-wider text-[#04130a] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #2ee8b4, #22c55e)', boxShadow: '0 8px 24px -8px rgba(46,232,180,0.6)' }}
          >
            Done
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes stFade {
          from { opacity: 0; transform: scale(0.975) translateY(14px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes stTierIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes stSheetUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes stRecommendedPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
          50% { box-shadow: 0 0 16px -2px rgba(251,191,36,0.6); }
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
  let bg = 'rgba(255,255,255,0.022)';
  let iconColor = canAfford && requirementsMet ? '#cbd5e1' : '#6b7280';
  let glow = '';
  let accent = 'rgba(255,255,255,0.12)'; // top-edge node accent

  if (isLocked) {
    borderColor = 'rgba(255,255,255,0.05)';
    bg = 'rgba(0,0,0,0.28)';
    iconColor = '#4b5563';
    accent = 'rgba(255,255,255,0.04)';
  } else if (isMaxed) {
    borderColor = 'rgba(52,211,153,0.55)';
    bg = 'linear-gradient(160deg, rgba(52,211,153,0.12), rgba(46,232,180,0.04))';
    iconColor = EMERALD;
    glow = '0 0 22px -6px rgba(52,211,153,0.5)';
    accent = EMERALD;
  } else if (isSelected) {
    borderColor = `${catColor}aa`;
    bg = `${catColor}1c`;
    iconColor = catColor;
    glow = `0 0 20px -8px ${catColor}aa`;
    accent = catColor;
  } else if (isUnlocked) {
    borderColor = `${catColor}66`;
    bg = `${catColor}12`;
    iconColor = catColor;
    accent = `${catColor}99`;
  } else if (isRecommended && canAfford) {
    borderColor = 'rgba(251,191,36,0.5)';
    bg = 'rgba(251,191,36,0.07)';
    accent = EMBER;
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="group relative flex flex-col p-3.5 pt-4 rounded-xl border text-left transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor,
        background: bg,
        boxShadow: glow || undefined,
        animation: isRecommended && !isMaxed && !isUnlocked && canAfford
          ? 'stRecommendedPulse 2.4s ease-in-out infinite'
          : undefined,
      }}
    >
      {/* Top node-accent bar */}
      <span className="absolute top-0 left-3 right-3 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

      {/* Recommended star */}
      {isRecommended && !isMaxed && !isUnlocked && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]">
          <Star className="w-2.5 h-2.5 text-amber-900" strokeWidth={2.5} fill="currentColor" />
        </span>
      )}
      {/* Lock badge */}
      {isLocked && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-[#080d0b] border border-white/15">
          <Lock className="w-2.5 h-2.5 text-gray-500" strokeWidth={2.5} />
        </span>
      )}
      {/* Maxed badge */}
      {isMaxed && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]">
          <Check className="w-3 h-3 text-[#04130a]" strokeWidth={3} />
        </span>
      )}

      <div className="flex items-start gap-2.5 mb-2">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
          style={{ background: `${catColor}1a`, boxShadow: `inset 0 0 0 1px ${catColor}33` }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`font-display text-[13px] font-semibold leading-tight tracking-wide ${isLocked ? 'text-gray-500' : 'text-white'} line-clamp-1`}>
            {skill.name}
          </div>
          <div className="font-hud text-[9px] font-semibold tracking-[0.16em] uppercase mt-0.5" style={{ color: isLocked ? '#4b5563' : catColor }}>
            {skill.category}
          </div>
        </div>
      </div>

      <div className={`text-[11px] line-clamp-2 leading-snug mb-2.5 ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}>
        {skill.description}
      </div>

      {/* Level pips — mt-auto anchors the pips + footer to the card bottom so
          every card in a tier row lines up regardless of description length. */}
      <div className="mt-auto flex items-center gap-1 mb-2">
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
                boxShadow: filled ? `0 0 6px ${isMaxed ? 'rgba(52,211,153,0.6)' : `${catColor}88`}` : undefined,
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
            className="flex items-center gap-1 font-semibold tabular-nums"
            style={{ color: isLocked ? '#4b5563' : canAfford ? EMBER : '#6b7280' }}
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
    <div
      className="relative flex items-center justify-center w-16 h-16 rounded-2xl border border-emerald-400/15 mb-4"
      style={{ background: 'radial-gradient(circle at 50% 30%, rgba(46,232,180,0.1), rgba(255,255,255,0.015))' }}
    >
      <Sparkles className="w-6 h-6 text-emerald-400/50" strokeWidth={1.75} />
    </div>
    <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-gray-300 mb-1.5">Inspect the lattice</h3>
    <p className="text-[11px] text-gray-600 leading-relaxed max-w-[16rem]">
      Hover any node to preview it here, or click to lock it in while you compare your next investment.
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
          className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3"
          style={{
            background: `radial-gradient(circle at 50% 30%, ${catColor}26, ${catColor}0a)`,
            boxShadow: `inset 0 0 0 1px ${catColor}44, 0 10px 26px -10px ${catColor}aa`,
          }}
        >
          <Icon className="w-7 h-7" style={{ color: catColor }} strokeWidth={2} />
        </div>
        <h3 className="font-display text-lg font-semibold uppercase tracking-[0.05em] text-white">{skill.name}</h3>
        <div className="font-hud text-[10px] font-semibold tracking-[0.22em] uppercase mt-1" style={{ color: catColor }}>
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
            <span className="flex items-center gap-1 text-sm font-semibold tabular-nums" style={{ color: EMBER }}>
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
                  boxShadow: filled ? `0 0 6px ${isMaxed ? 'rgba(52,211,153,0.55)' : `${catColor}77`}` : undefined,
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
          className="font-hud w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase tracking-wide
            border border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
        >
          <Check className="w-4 h-4" strokeWidth={3} /> Maxed Out
        </button>
      ) : !reqsMet ? (
        <button
          disabled
          className="font-hud w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase tracking-wide
            border border-white/10 bg-white/[0.03] text-gray-500 cursor-not-allowed"
        >
          <Lock className="w-3.5 h-3.5" strokeWidth={2.25} /> Requirements Not Met
        </button>
      ) : canUnlock ? (
        <button
          onClick={onUnlock}
          className="font-hud group w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase tracking-wide text-[#04130a] transition-all duration-200 hover:-translate-y-0.5"
          style={{
            background: 'linear-gradient(135deg, #2ee8b4, #22c55e)',
            boxShadow: '0 8px 24px -8px rgba(46,232,180,0.65)',
          }}
        >
          {skill.currentLevel === 0 ? <Sparkles className="w-4 h-4" strokeWidth={2.5} /> : <TrendingUp className="w-4 h-4" strokeWidth={2.5} />}
          {skill.currentLevel === 0 ? 'Unlock' : `Upgrade to Lv ${skill.currentLevel + 1}`} — {skill.cost} pts
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
        </button>
      ) : (
        <button
          disabled
          className="font-hud w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase tracking-wide
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
    <div className="font-hud text-[10px] font-semibold tracking-[0.2em] text-gray-500 uppercase mb-1.5">{title}</div>
    {children}
  </div>
);

export default SkillTreeMenu;
