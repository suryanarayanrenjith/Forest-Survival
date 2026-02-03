import React, { useState } from 'react';
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

export const SkillTreeMenu: React.FC<SkillTreeMenuProps> = ({
  skills,
  availablePoints,
  spentPoints,
  totalPoints,
  detectedPlayStyle,
  recommendations,
  onUnlockSkill,
  onClose
}) => {
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const categories: Array<{id: SkillCategory | 'all', name: string, icon: string}> = [
    { id: 'all', name: 'All Skills', icon: '⭐' },
    { id: 'combat', name: 'Combat', icon: '⚔️' },
    { id: 'survival', name: 'Survival', icon: '❤️' },
    { id: 'mobility', name: 'Mobility', icon: '👟' },
    { id: 'tactical', name: 'Tactical', icon: '🧠' },
    { id: 'support', name: 'Support', icon: '📦' }
  ];

  const filteredSkills = selectedCategory === 'all'
    ? skills
    : skills.filter(s => s.category === selectedCategory);

  const groupedByTier = filteredSkills.reduce((acc, skill) => {
    if (!acc[skill.tier]) acc[skill.tier] = [];
    acc[skill.tier].push(skill);
    return acc;
  }, {} as Record<number, Skill[]>);

  const playstyleInfo = {
    aggressive: { name: 'Aggressive', color: 'text-red-400', description: 'High damage, fast kills' },
    defensive: { name: 'Defensive', color: 'text-blue-400', description: 'Survival focused, damage mitigation' },
    balanced: { name: 'Balanced', color: 'text-green-400', description: 'Well-rounded approach' },
    tactical: { name: 'Tactical', color: 'text-purple-400', description: 'Ability-focused, strategic' },
    speedrunner: { name: 'Speedrunner', color: 'text-yellow-400', description: 'Fast movement, efficiency' }
  }[detectedPlayStyle];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg shadow-2xl w-11/12 max-w-6xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-900/50 to-purple-900/50 p-4 border-b-2 border-cyan-400/50 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Skill Tree</h2>
              <p className="text-sm text-gray-300">
                Playstyle: <span className={`font-bold ${playstyleInfo.color}`}>{playstyleInfo.name}</span> - {playstyleInfo.description}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-cyan-400">{availablePoints}</div>
              <div className="text-xs text-gray-400">Available Points</div>
              <div className="text-xs text-gray-500 mt-1">{spentPoints}/{totalPoints} spent</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Category Sidebar */}
          <div className="w-48 bg-gray-800/50 border-r border-cyan-400/30 p-3 overflow-y-auto">
            <div className="text-xs font-bold text-gray-400 uppercase mb-2">Categories</div>
            <div className="space-y-1">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full text-left px-3 py-2 rounded transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-cyan-500 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span className="mr-2">{cat.icon}</span>
                  <span className="text-sm">{cat.name}</span>
                </button>
              ))}
            </div>

            {recommendations.length > 0 && (
              <div className="mt-6">
                <div className="text-xs font-bold text-yellow-400 uppercase mb-2">⭐ Recommended</div>
                <div className="text-xs text-gray-400 space-y-1">
                  {recommendations.slice(0, 3).map(skillId => {
                    const skill = skills.find(s => s.id === skillId);
                    return skill ? (
                      <div key={skillId} className="bg-yellow-900/20 p-2 rounded border border-yellow-600/30">
                        <span className="mr-1">{skill.icon}</span>
                        {skill.name}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Skills Grid */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="space-y-6">
              {[1, 2, 3, 4, 5].map(tier => {
                const tierSkills = groupedByTier[tier] || [];
                if (tierSkills.length === 0) return null;

                return (
                  <div key={tier}>
                    <div className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2">
                      <span>Tier {tier}</span>
                      <div className="flex-1 h-px bg-cyan-400/30" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {tierSkills.map(skill => (
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

          {/* Skill Details Sidebar */}
          {selectedSkill && (
            <div className="w-80 bg-gray-800/50 border-l border-cyan-400/30 p-4 overflow-y-auto">
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
        <div className="bg-gray-800/50 p-4 border-t border-cyan-400/30 rounded-b-lg flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
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

  let borderColor = 'border-gray-600';
  if (isSelected) borderColor = 'border-cyan-400';
  else if (isRecommended) borderColor = 'border-yellow-400';
  else if (isMaxed) borderColor = 'border-green-400';
  else if (!canAfford && !isMaxed) borderColor = 'border-red-400/50';

  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border-2 ${borderColor} bg-gray-800/80 hover:bg-gray-700/80 transition-all text-left relative ${
        isSelected ? 'ring-2 ring-cyan-400/50' : ''
      }`}
    >
      {isRecommended && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center text-xs">
          ⭐
        </div>
      )}

      <div className="text-2xl mb-1">{skill.icon}</div>
      <div className="text-sm font-bold text-white mb-1 line-clamp-1">{skill.name}</div>
      <div className="text-xs text-gray-400 line-clamp-2 mb-2">{skill.description}</div>

      <div className="flex items-center justify-between text-xs">
        <span className={`font-mono ${isMaxed ? 'text-green-400' : 'text-cyan-400'}`}>
          {skill.currentLevel}/{skill.maxLevel}
        </span>
        <span className={`${canAfford || isMaxed ? 'text-yellow-400' : 'text-red-400'}`}>
          {skill.cost} pts
        </span>
      </div>

      {isMaxed && (
        <div className="absolute inset-0 bg-green-500/10 rounded-lg flex items-center justify-center">
          <span className="text-green-400 text-2xl">✓</span>
        </div>
      )}
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

  return (
    <div>
      <div className="text-center mb-4">
        <div className="text-6xl mb-2">{skill.icon}</div>
        <h3 className="text-xl font-bold text-white mb-1">{skill.name}</h3>
        <div className="text-sm text-gray-400 capitalize">{skill.category}</div>
      </div>

      <div className="mb-4">
        <div className="text-xs font-bold text-gray-400 uppercase mb-1">Description</div>
        <p className="text-sm text-gray-300">{skill.description}</p>
      </div>

      <div className="mb-4">
        <div className="text-xs font-bold text-gray-400 uppercase mb-1">Effects</div>
        <div className="space-y-1">
          {skill.effects.map((effect, idx) => (
            <div key={idx} className="text-xs text-cyan-400 bg-cyan-900/20 p-2 rounded">
              • {effect.description}
            </div>
          ))}
        </div>
      </div>

      {skill.requirements.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">Requirements</div>
          <div className="space-y-1">
            {skill.requirements.map((req, idx) => (
              <div key={idx} className="text-xs text-gray-300">
                • {req.type}: {req.value}
              </div>
            ))}
          </div>
        </div>
      )}

      {skill.synergiesWith.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">Synergies</div>
          <div className="text-xs text-purple-400">
            Works well with {skill.synergiesWith.length} other skill{skill.synergiesWith.length > 1 ? 's' : ''}
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="text-xs font-bold text-gray-400 uppercase mb-1">Progress</div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-white">Level {skill.currentLevel}/{skill.maxLevel}</span>
          <span className="text-sm text-yellow-400">{skill.cost} points</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 transition-all"
            style={{ width: `${(skill.currentLevel / skill.maxLevel) * 100}%` }}
          />
        </div>
      </div>

      {isMaxed ? (
        <button
          disabled
          className="w-full py-3 bg-green-500/20 text-green-400 font-bold rounded border-2 border-green-400/50"
        >
          ✓ Maxed Out
        </button>
      ) : canUnlock ? (
        <button
          onClick={onUnlock}
          className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded transition-colors"
        >
          Unlock ({skill.cost} points)
        </button>
      ) : (
        <button
          disabled
          className="w-full py-3 bg-gray-700 text-gray-500 font-bold rounded cursor-not-allowed"
        >
          Insufficient Points
        </button>
      )}
    </div>
  );
};
