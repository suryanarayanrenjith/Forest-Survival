import React, { useState } from 'react';

export interface PlayerStatistics {
  // Combat Stats
  totalKills: number;
  totalDeaths: number;
  killDeathRatio: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  headshots: number;
  headshotPercentage: number;
  accuracy: number;
  longestKillStreak: number;
  highestCombo: number;

  // Survival Stats
  totalPlayTime: number; // seconds
  longestSurvival: number; // seconds
  totalWavesCompleted: number;
  highestWave: number;
  totalRevives: number;

  // Weapon Stats
  favoriteWeapon: string;
  weaponKills: Record<string, number>;

  // Progression
  level: number;
  experience: number;
  experienceToNextLevel: number;
  totalSkillPoints: number;
  skillsUnlocked: number;

  // Achievements
  achievementsUnlocked: number;
  totalAchievements: number;
  achievementProgress: number;

  // Missions
  missionsCompleted: number;
  missionsFailed: number;
  missionSuccessRate: number;

  // Multiplayer
  multiplayerGamesPlayed: number;
  multiplayerWins: number;
  multiplayerWinRate: number;
}

interface StatsGalleryProps {
  stats: PlayerStatistics;
  achievements: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    unlocked: boolean;
    unlockedAt?: number;
    rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  }>;
  onClose: () => void;
}

export const StatsGallery: React.FC<StatsGalleryProps> = ({ stats, achievements, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'combat' | 'progression' | 'achievements'>('overview');

  const tabs = [
    { id: 'overview' as const, name: 'Overview', icon: '📊' },
    { id: 'combat' as const, name: 'Combat', icon: '⚔️' },
    { id: 'progression' as const, name: 'Progression', icon: '📈' },
    { id: 'achievements' as const, name: 'Achievements', icon: '🏆' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg shadow-2xl w-11/12 max-w-6xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-900/50 to-purple-900/50 p-4 border-b-2 border-cyan-400/50 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Player Statistics</h2>
            <div className="text-right">
              <div className="text-2xl font-bold text-cyan-400">Level {stats.level}</div>
              <div className="text-xs text-gray-400">{stats.experience} / {stats.experienceToNextLevel} XP</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Tabs */}
          <div className="w-48 bg-gray-800/50 border-r border-cyan-400/30 p-3">
            <div className="space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2 rounded transition-all ${
                    activeTab === tab.id
                      ? 'bg-cyan-500 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  <span className="text-sm">{tab.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stats Panel */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'overview' && <OverviewTab stats={stats} />}
            {activeTab === 'combat' && <CombatTab stats={stats} />}
            {activeTab === 'progression' && <ProgressionTab stats={stats} />}
            {activeTab === 'achievements' && <AchievementsTab achievements={achievements} />}
          </div>
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

const OverviewTab: React.FC<{ stats: PlayerStatistics }> = ({ stats }) => {
  const playTimeHours = Math.floor(stats.totalPlayTime / 3600);
  const playTimeMinutes = Math.floor((stats.totalPlayTime % 3600) / 60);

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white mb-4">Overview</h3>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="💀" label="Total Kills" value={stats.totalKills} color="text-red-400" />
        <StatCard icon="📈" label="Level" value={stats.level} color="text-cyan-400" />
        <StatCard icon="🏆" label="Achievements" value={`${stats.achievementsUnlocked}/${stats.totalAchievements}`} color="text-yellow-400" />
        <StatCard icon="⏱️" label="Play Time" value={`${playTimeHours}h ${playTimeMinutes}m`} color="text-purple-400" />
      </div>

      {/* Performance Metrics */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h4 className="text-white font-bold mb-4">Performance Metrics</h4>
        <div className="space-y-3">
          <MetricBar label="K/D Ratio" value={stats.killDeathRatio} max={5} color="bg-red-500" />
          <MetricBar label="Accuracy" value={stats.accuracy * 100} max={100} color="bg-cyan-500" suffix="%" />
          <MetricBar label="Headshot %" value={stats.headshotPercentage} max={100} color="bg-yellow-500" suffix="%" />
          <MetricBar label="Mission Success" value={stats.missionSuccessRate} max={100} color="bg-green-500" suffix="%" />
        </div>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <HighlightCard icon="🔥" label="Longest Streak" value={stats.longestKillStreak} />
        <HighlightCard icon="🎯" label="Highest Combo" value={`${stats.highestCombo}x`} />
        <HighlightCard icon="🌊" label="Highest Wave" value={stats.highestWave} />
        <HighlightCard icon="⏳" label="Longest Survival" value={`${Math.floor(stats.longestSurvival / 60)}m`} />
        <HighlightCard icon="🎮" label="MP Wins" value={stats.multiplayerWins} />
        <HighlightCard icon="✅" label="Missions Done" value={stats.missionsCompleted} />
      </div>
    </div>
  );
};

const CombatTab: React.FC<{ stats: PlayerStatistics }> = ({ stats }) => {
  const damageRatio = stats.totalDamageTaken > 0 ? stats.totalDamageDealt / stats.totalDamageTaken : stats.totalDamageDealt;

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white mb-4">Combat Statistics</h3>

      {/* Combat Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon="💀" label="Total Kills" value={stats.totalKills} color="text-red-400" />
        <StatCard icon="☠️" label="Deaths" value={stats.totalDeaths} color="text-gray-400" />
        <StatCard icon="📊" label="K/D Ratio" value={stats.killDeathRatio.toFixed(2)} color="text-cyan-400" />
        <StatCard icon="💥" label="Damage Dealt" value={stats.totalDamageDealt.toLocaleString()} color="text-orange-400" />
        <StatCard icon="🩹" label="Damage Taken" value={stats.totalDamageTaken.toLocaleString()} color="text-red-400" />
        <StatCard icon="📈" label="Damage Ratio" value={damageRatio.toFixed(2)} color="text-green-400" />
      </div>

      {/* Accuracy Stats */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h4 className="text-white font-bold mb-4">Accuracy & Precision</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Overall Accuracy</span>
            <span className="text-cyan-400 font-bold">{(stats.accuracy * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-cyan-500" style={{ width: `${stats.accuracy * 100}%` }} />
          </div>

          <div className="flex justify-between items-center mt-4">
            <span className="text-gray-300">Headshot Percentage</span>
            <span className="text-yellow-400 font-bold">{stats.headshotPercentage.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-yellow-500" style={{ width: `${stats.headshotPercentage}%` }} />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-gray-900/50 p-3 rounded">
              <div className="text-gray-400 text-xs">Total Headshots</div>
              <div className="text-white font-bold text-xl">{stats.headshots}</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded">
              <div className="text-gray-400 text-xs">Longest Streak</div>
              <div className="text-red-400 font-bold text-xl">{stats.longestKillStreak}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Weapon Stats */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h4 className="text-white font-bold mb-4">Weapon Statistics</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300">Favorite Weapon</span>
            <span className="text-cyan-400 font-bold">{stats.favoriteWeapon}</span>
          </div>
          {Object.entries(stats.weaponKills).map(([weapon, kills]) => (
            <div key={weapon}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-300">{weapon}</span>
                <span className="text-gray-400">{kills} kills</span>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                  style={{ width: `${(kills / stats.totalKills) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ProgressionTab: React.FC<{ stats: PlayerStatistics }> = ({ stats }) => (
  <div className="space-y-6">
    <h3 className="text-2xl font-bold text-white mb-4">Progression</h3>

    {/* Level Progress */}
    <div className="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 rounded-lg p-6 border border-cyan-400/30">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-4xl font-bold text-white">Level {stats.level}</div>
          <div className="text-gray-400">Survivor</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-cyan-400">{stats.experience}</div>
          <div className="text-gray-400 text-sm">/ {stats.experienceToNextLevel} XP</div>
        </div>
      </div>
      <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-purple-500"
          style={{ width: `${(stats.experience / stats.experienceToNextLevel) * 100}%` }}
        />
      </div>
    </div>

    {/* Skill Points */}
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="text-gray-400 text-sm mb-1">Total Skill Points</div>
        <div className="text-3xl font-bold text-yellow-400">{stats.totalSkillPoints}</div>
      </div>
      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="text-gray-400 text-sm mb-1">Skills Unlocked</div>
        <div className="text-3xl font-bold text-purple-400">{stats.skillsUnlocked}</div>
      </div>
    </div>

    {/* Survival Stats */}
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h4 className="text-white font-bold mb-4">Survival Records</h4>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Total Waves Completed</span>
          <span className="text-cyan-400 font-bold">{stats.totalWavesCompleted}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Highest Wave Reached</span>
          <span className="text-yellow-400 font-bold">{stats.highestWave}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Longest Survival Time</span>
          <span className="text-green-400 font-bold">{Math.floor(stats.longestSurvival / 60)}m {stats.longestSurvival % 60}s</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Total Revives</span>
          <span className="text-purple-400 font-bold">{stats.totalRevives}</span>
        </div>
      </div>
    </div>

    {/* Mission Stats */}
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h4 className="text-white font-bold mb-4">Mission Performance</h4>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">{stats.missionsCompleted}</div>
          <div className="text-xs text-gray-400">Completed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-400">{stats.missionsFailed}</div>
          <div className="text-xs text-gray-400">Failed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-cyan-400">{stats.missionSuccessRate.toFixed(0)}%</div>
          <div className="text-xs text-gray-400">Success Rate</div>
        </div>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-green-500" style={{ width: `${stats.missionSuccessRate}%` }} />
      </div>
    </div>
  </div>
);

const AchievementsTab: React.FC<{ achievements: any[] }> = ({ achievements }) => {
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');

  const filteredAchievements = achievements.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'unlocked') return a.unlocked;
    return !a.unlocked;
  });

  const rarityColors: Record<'common' | 'rare' | 'epic' | 'legendary', string> = {
    common: 'border-gray-400',
    rare: 'border-blue-400',
    epic: 'border-purple-400',
    legendary: 'border-yellow-400'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-white">Achievements</h3>
        <div className="flex gap-2">
          {['all', 'unlocked', 'locked'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-3 py-1 rounded text-sm ${
                filter === f ? 'bg-cyan-500 text-white' : 'bg-gray-700 text-gray-300'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAchievements.map(achievement => (
          <div
            key={achievement.id}
            className={`bg-gray-800/50 rounded-lg p-4 border-2 ${
              achievement.unlocked
                ? rarityColors[achievement.rarity as keyof typeof rarityColors]
                : 'border-gray-700 opacity-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`text-4xl ${achievement.unlocked ? '' : 'grayscale'}`}>
                {achievement.icon}
              </div>
              <div className="flex-1">
                <h4 className="text-white font-bold mb-1">{achievement.name}</h4>
                <p className="text-gray-400 text-xs mb-2">{achievement.description}</p>
                {achievement.unlocked && achievement.unlockedAt && (
                  <div className="text-xs text-cyan-400">
                    Unlocked: {new Date(achievement.unlockedAt).toLocaleDateString()}
                  </div>
                )}
                {achievement.rarity && (
                  <div className={`text-xs mt-1 font-bold ${
                    achievement.rarity === 'legendary' ? 'text-yellow-400' :
                    achievement.rarity === 'epic' ? 'text-purple-400' :
                    achievement.rarity === 'rare' ? 'text-blue-400' : 'text-gray-400'
                  }`}>
                    {achievement.rarity.toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper Components
const StatCard: React.FC<{ icon: string; label: string; value: string | number; color: string }> = ({
  icon, label, value, color
}) => (
  <div className="bg-gray-800/50 rounded-lg p-4">
    <div className="text-3xl mb-2">{icon}</div>
    <div className="text-gray-400 text-xs mb-1">{label}</div>
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
  </div>
);

const HighlightCard: React.FC<{ icon: string; label: string; value: string | number }> = ({
  icon, label, value
}) => (
  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
    <div className="text-2xl mb-1">{icon}</div>
    <div className="text-gray-400 text-xs mb-1">{label}</div>
    <div className="text-white font-bold">{value}</div>
  </div>
);

const MetricBar: React.FC<{
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
}> = ({ label, value, max, color, suffix = '' }) => {
  const percentage = Math.min((value / max) * 100, 100);

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-white font-bold">{value.toFixed(1)}{suffix}</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};
