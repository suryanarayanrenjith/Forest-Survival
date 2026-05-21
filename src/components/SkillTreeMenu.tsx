import React, { useState } from 'react';
import { Star, Swords, Heart, Footprints, Brain, Package, Check, Lock, X, type LucideIcon } from 'lucide-react';
import { type Skill, type SkillCategory, type PlayStyle } from '../utils/SmartSkillTreeSystem';

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
  all: Star,
  combat: Swords,
  survival: Heart,
  mobility: Footprints,
  tactical: Brain,
  support: Package,
};

const ACCENT = '#22d3ee'; // cyan accent, on the shared dark base

export const SkillTreeMenu: React.FC<SkillTreeMenuProps> = ({
  skills,
  availablePoints,
  spentPoints,
  totalPoints,
  detectedPlayStyle,
  recommendations,
  onUnlockSkill,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const categories: Array<{ id: SkillCategory | 'all'; name: string }> = [
    { id: 'all', name: 'All Skills' },
    { id: 'combat', name: 'Combat' },
    { id: 'survival', name: 'Survival' },
    { id: 'mobility', name: 'Mobility' },
    { id: 'tactical', name: 'Tactical' },
    { id: 'support', name: 'Support' },
  ];

  const filteredSkills = selectedCategory === 'all'
    ? skills
    : skills.filter((s) => s.category === selectedCategory);

  const groupedByTier = filteredSkills.reduce((acc, skill) => {
    if (!acc[skill.tier]) acc[skill.tier] = [];
    acc[skill.tier].push(skill);
    return acc;
  }, {} as Record<number, Skill[]>);

  const playstyleInfo = {
    aggressive: { name: 'Aggressive', color: '#f87171', description: 'High damage, fast kills' },
    defensive: { name: 'Defensive', color: '#60a5fa', description: 'Survival focused, damage mitigation' },
    balanced: { name: 'Balanced', color: '#34d399', description: 'Well-rounded approach' },
    tactical: { name: 'Tactical', color: '#c084fc', description: 'Ability-focused, strategic' },
    speedrunner: { name: 'Speedrunner', color: '#fbbf24', description: 'Fast movement, efficiency' },
  }[detectedPlayStyle];

  const progressPct = totalPoints > 0 ? (spentPoints / totalPoints) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,8,10,0.92)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="w-full max-w-5xl h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b0f15] overflow-hidden"
        style={{ animation: 'stFade 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: `${ACCENT}1f` }}>
              <Brain className="w-5 h-5" style={{ color: ACCENT }} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Skill Tree</h2>
              <p className="text-xs text-gray-500">
                Playstyle ·{' '}
                <span className="font-semibold" style={{ color: playstyleInfo.color }}>{playstyleInfo.name}</span>
                <span className="hidden sm:inline"> — {playstyleInfo.description}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="flex items-baseline gap-1.5 justify-end">
                <span className="text-2xl font-bold tabular-nums" style={{ color: ACCENT }}>{availablePoints}</span>
                <span className="text-[10px] font-semibold tracking-[0.12em] text-gray-500 uppercase">Points</span>
              </div>
              <div className="mt-1 h-1 w-28 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: ACCENT }} />
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">{spentPoints} / {totalPoints} spent</div>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-gray-400
                transition-colors hover:text-white hover:bg-white/[0.06]"
              aria-label="Close skill tree"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-52 flex-shrink-0 border-r border-white/[0.07] p-3 overflow-y-auto hidden sm:block">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-gray-500 uppercase mb-2 px-1">Categories</div>
            <div className="space-y-1">
              {categories.map((cat) => {
                const Icon = CATEGORY_ICON[cat.id];
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      active ? 'text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                    }`}
                    style={active ? { background: `${ACCENT}1f`, boxShadow: `inset 0 0 0 1px ${ACCENT}55` } : undefined}
                  >
                    <Icon className="w-4 h-4" style={active ? { color: ACCENT } : undefined} strokeWidth={2} />
                    {cat.name}
                  </button>
                );
              })}
            </div>

            {recommendations.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] text-amber-400 uppercase mb-2 px-1">
                  <Star className="w-3 h-3" strokeWidth={2.25} fill="currentColor" /> Recommended
                </div>
                <div className="space-y-1.5">
                  {recommendations.slice(0, 3).map((skillId) => {
                    const skill = skills.find((s) => s.id === skillId);
                    if (!skill) return null;
                    const SkillIcon = CATEGORY_ICON[skill.category] || Star;
                    return (
                      <div
                        key={skillId}
                        className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1.5 text-xs text-gray-300"
                      >
                        <SkillIcon className="w-3.5 h-3.5 flex-shrink-0 text-amber-400/80" strokeWidth={2} />
                        <span className="truncate">{skill.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Skills grid */}
          <div className="flex-1 p-5 overflow-y-auto">
            <div className="space-y-6">
              {[1, 2, 3, 4, 5].map((tier) => {
                const tierSkills = groupedByTier[tier] || [];
                if (tierSkills.length === 0) return null;
                return (
                  <div key={tier}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-[11px] font-semibold tracking-[0.18em] text-gray-400 uppercase">Tier {tier}</span>
                      <div className="flex-1 h-px bg-white/[0.07]" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                      {tierSkills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          isRecommended={recommendations.includes(skill.id)}
                          canAfford={availablePoints >= skill.cost}
                          onClick={() => setSelectedSkill(skill)}
                          isSelected={selectedSkill?.id === skill.id}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details */}
          {selectedSkill && (
            <div className="w-80 flex-shrink-0 border-l border-white/[0.07] p-5 overflow-y-auto hidden lg:block">
              <SkillDetails
                skill={selectedSkill}
                canAfford={availablePoints >= selectedSkill.cost}
                onUnlock={() => {
                  onUnlockSkill(selectedSkill.id);
                  setSelectedSkill(null);
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/[0.07]">
          <span className="text-xs text-gray-600">Earn skill points by eliminating enemies</span>
          <button
            onClick={onClose}
            className="rounded-xl px-7 py-2.5 text-sm font-bold tracking-wide text-[#04131a] transition-all duration-200 hover:-translate-y-0.5"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #0ea5b7)` }}
          >
            Done
          </button>
        </div>
      </div>

      <style>{`
        @keyframes stFade {
          from { opacity: 0; transform: scale(0.97) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

interface SkillCardProps {
  skill: Skill;
  isRecommended: boolean;
  canAfford: boolean;
  onClick: () => void;
  isSelected: boolean;
}

const SkillCard: React.FC<SkillCardProps> = ({ skill, isRecommended, canAfford, onClick, isSelected }) => {
  const isMaxed = skill.currentLevel >= skill.maxLevel;
  const hasLevels = skill.currentLevel > 0 && !isMaxed;
  const Icon = CATEGORY_ICON[skill.category] || Star;

  let borderColor = 'rgba(255,255,255,0.08)';
  let bg = 'rgba(255,255,255,0.02)';
  if (isSelected) { borderColor = `${ACCENT}99`; bg = `${ACCENT}14`; }
  else if (isMaxed) { borderColor = 'rgba(52,211,153,0.5)'; bg = 'rgba(52,211,153,0.07)'; }
  else if (isRecommended && canAfford) { borderColor = 'rgba(251,191,36,0.45)'; bg = 'rgba(251,191,36,0.06)'; }

  const iconColor = isMaxed ? '#34d399' : hasLevels ? ACCENT : canAfford ? '#cbd5e1' : '#6b7280';

  return (
    <button
      onClick={onClick}
      className="group relative p-3 rounded-xl border text-left transition-all duration-200 hover:-translate-y-0.5"
      style={{ borderColor, background: bg }}
    >
      {isRecommended && !isMaxed && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-amber-400">
          <Star className="w-2.5 h-2.5 text-amber-900" strokeWidth={2.5} fill="currentColor" />
        </span>
      )}
      {isMaxed && (
        <span className="absolute top-2 right-2">
          <Check className="w-4 h-4 text-emerald-400" strokeWidth={3} />
        </span>
      )}

      <Icon className="w-5 h-5 mb-2" style={{ color: iconColor }} strokeWidth={1.75} />
      <div className="text-sm font-bold text-white mb-0.5 line-clamp-1">{skill.name}</div>
      <div className="text-[11px] text-gray-500 line-clamp-2 mb-2 leading-snug">{skill.description}</div>

      <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${(skill.currentLevel / skill.maxLevel) * 100}%`, background: isMaxed ? '#34d399' : ACCENT }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono font-semibold" style={{ color: iconColor }}>
          Lv {skill.currentLevel}/{skill.maxLevel}
        </span>
        {!isMaxed && (
          <span className={`font-semibold ${canAfford ? 'text-amber-400' : 'text-gray-600'}`}>
            {skill.cost} pts
          </span>
        )}
      </div>
    </button>
  );
};

interface SkillDetailsProps {
  skill: Skill;
  canAfford: boolean;
  onUnlock: () => void;
}

const SkillDetails: React.FC<SkillDetailsProps> = ({ skill, canAfford, onUnlock }) => {
  const isMaxed = skill.currentLevel >= skill.maxLevel;
  const canUnlock = canAfford && !isMaxed;
  const Icon = CATEGORY_ICON[skill.category] || Star;

  return (
    <div>
      <div className="text-center mb-5">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3"
          style={{ background: `${ACCENT}14`, boxShadow: `inset 0 0 0 1px ${ACCENT}40` }}
        >
          <Icon className="w-8 h-8" style={{ color: ACCENT }} strokeWidth={1.75} />
        </div>
        <h3 className="text-lg font-bold text-white">{skill.name}</h3>
        <div className="text-xs text-gray-500 capitalize mt-0.5">{skill.category}</div>
      </div>

      <DetailBlock title="Description">
        <p className="text-sm text-gray-300 leading-relaxed">{skill.description}</p>
      </DetailBlock>

      <DetailBlock title="Effects">
        <div className="space-y-1.5">
          {skill.effects.map((effect, idx) => (
            <div
              key={idx}
              className="text-xs rounded-lg px-2.5 py-1.5"
              style={{ background: `${ACCENT}10`, color: ACCENT }}
            >
              {effect.description}
            </div>
          ))}
        </div>
      </DetailBlock>

      {skill.requirements.length > 0 && (
        <DetailBlock title="Requirements">
          <div className="space-y-1">
            {skill.requirements.map((req, idx) => (
              <div key={idx} className="text-xs text-gray-400">• {req.type}: {req.value}</div>
            ))}
          </div>
        </DetailBlock>
      )}

      {skill.synergiesWith.length > 0 && (
        <DetailBlock title="Synergies">
          <div className="text-xs text-violet-300">
            Works well with {skill.synergiesWith.length} other skill{skill.synergiesWith.length > 1 ? 's' : ''}
          </div>
        </DetailBlock>
      )}

      <DetailBlock title="Progress">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-white">Level {skill.currentLevel} / {skill.maxLevel}</span>
          <span className="text-sm font-semibold text-amber-400">{skill.cost} pts</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(skill.currentLevel / skill.maxLevel) * 100}%`, background: ACCENT }}
          />
        </div>
      </DetailBlock>

      {isMaxed ? (
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
            border border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
        >
          <Check className="w-4 h-4" strokeWidth={3} /> Maxed Out
        </button>
      ) : canUnlock ? (
        <button
          onClick={onUnlock}
          className="w-full py-3 rounded-xl font-bold text-sm tracking-wide text-[#04131a] transition-all duration-200 hover:-translate-y-0.5"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, #0ea5b7)` }}
        >
          Unlock — {skill.cost} points
        </button>
      ) : (
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
            border border-white/10 bg-white/[0.03] text-gray-500 cursor-not-allowed"
        >
          <Lock className="w-3.5 h-3.5" strokeWidth={2.25} /> Insufficient Points
        </button>
      )}
    </div>
  );
};

const DetailBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <div className="text-[10px] font-semibold tracking-[0.18em] text-gray-500 uppercase mb-1.5">{title}</div>
    {children}
  </div>
);

export default SkillTreeMenu;
