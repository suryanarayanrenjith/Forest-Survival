import { useState, useEffect } from 'react';
import type { Achievement } from '../utils/AchievementSystem';

interface AchievementNotificationProps {
  achievement: Achievement;
  index: number; // For stacking multiple achievements
  onClose: () => void;
}

const AchievementNotification = ({ achievement, index, onClose }: AchievementNotificationProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Fade in
    setVisible(true);

    // Auto-dismiss after 4 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, 4000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievement.id]); // Only re-run when achievement changes, not when onClose changes

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return {
          border: 'border-yellow-500',
          bg: 'bg-gradient-to-r from-yellow-900/90 to-orange-900/90',
          glow: 'shadow-yellow-500/50',
          text: 'text-yellow-400'
        };
      case 'epic':
        return {
          border: 'border-purple-500',
          bg: 'bg-gradient-to-r from-purple-900/90 to-pink-900/90',
          glow: 'shadow-purple-500/50',
          text: 'text-purple-400'
        };
      case 'rare':
        return {
          border: 'border-blue-500',
          bg: 'bg-gradient-to-r from-blue-900/90 to-cyan-900/90',
          glow: 'shadow-blue-500/50',
          text: 'text-blue-400'
        };
      default:
        return {
          border: 'border-gray-500',
          bg: 'bg-gradient-to-r from-gray-900/90 to-gray-800/90',
          glow: 'shadow-gray-500/50',
          text: 'text-gray-400'
        };
    }
  };

  const colors = getRarityColor(achievement.rarity);

  // Calculate vertical position based on index (stack achievements)
  const topPosition = 80 + (index * 160); // 80px base + 160px per achievement

  return (
    <div
      className={`fixed right-4 transition-all duration-300 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
      style={{
        zIndex: 100 + index, // Higher z-index for newer achievements
        top: `${topPosition}px`
      }}
    >
      <div
        className={`${colors.bg} ${colors.border} border-2 rounded-lg p-4 backdrop-blur-sm shadow-2xl ${colors.glow} min-w-[320px] animate-bounce-in`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="text-4xl">{achievement.icon}</div>
          <div className="flex-1">
            <div className="text-white font-bold text-sm">🏆 ACHIEVEMENT UNLOCKED!</div>
            <div className={`${colors.text} text-xs uppercase font-bold tracking-wider`}>
              {achievement.rarity}
            </div>
          </div>
          <button
            onClick={() => {
              setVisible(false);
              setTimeout(onClose, 300);
            }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Achievement Info */}
        <div className="border-t border-white/20 pt-2">
          <div className="text-white font-bold text-lg mb-1">{achievement.name}</div>
          <div className="text-gray-300 text-sm mb-2">{achievement.description}</div>

          {achievement.reward && (
            <div className="bg-white/10 rounded px-2 py-1 text-center">
              <span className="text-yellow-400 text-xs font-bold">
                🎁 Reward: {achievement.reward}
              </span>
            </div>
          )}
        </div>

        {/* Animated Progress Bar */}
        <div className="mt-3 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bg} animate-progress-fill`}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
};

// Achievement Menu
interface AchievementMenuProps {
  achievements: Achievement[];
  isOpen: boolean;
  onClose: () => void;
}

export const AchievementMenu = ({ achievements, isOpen, onClose }: AchievementMenuProps) => {
  if (!isOpen) return null;

  const unlocked = achievements.filter(a => a.unlocked).length;
  const total = achievements.length;
  const percent = (unlocked / total) * 100;

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return 'border-yellow-500 bg-yellow-900/20';
      case 'epic':
        return 'border-purple-500 bg-purple-900/20';
      case 'rare':
        return 'border-blue-500 bg-blue-900/20';
      default:
        return 'border-gray-500 bg-gray-900/20';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center" style={{ zIndex: 200 }}>
      <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden border-2 border-green-500/50 m-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-6 py-4 border-b border-gray-600/50 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-green-400">🏆 ACHIEVEMENTS</h2>
            <div className="text-gray-400 text-sm mt-1">
              {unlocked} / {total} Unlocked ({percent.toFixed(1)}%)
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-3 bg-gray-800/50">
          <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Achievement Grid */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)] grid grid-cols-1 md:grid-cols-2 gap-4">
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`border-2 rounded-lg p-4 ${
                achievement.unlocked
                  ? getRarityColor(achievement.rarity)
                  : 'border-gray-700 bg-gray-900/40 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div
                  className={`text-4xl ${achievement.unlocked ? '' : 'grayscale opacity-50'}`}
                >
                  {achievement.icon}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="text-white font-bold">{achievement.name}</h3>
                      <p className="text-gray-400 text-sm">{achievement.description}</p>
                    </div>
                    {achievement.unlocked && (
                      <div className="text-green-400 text-xl">✓</div>
                    )}
                  </div>

                  {/* Progress */}
                  {!achievement.unlocked && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Progress</span>
                        <span>
                          {achievement.progress} / {achievement.target}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{
                            width: `${(achievement.progress / achievement.target) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Reward */}
                  {achievement.reward && achievement.unlocked && (
                    <div className="mt-2 text-yellow-400 text-xs">
                      🎁 {achievement.reward}
                    </div>
                  )}

                  {/* Rarity Badge */}
                  <div className="mt-2">
                    <span
                      className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                        achievement.rarity === 'legendary'
                          ? 'bg-yellow-900/50 text-yellow-400'
                          : achievement.rarity === 'epic'
                          ? 'bg-purple-900/50 text-purple-400'
                          : achievement.rarity === 'rare'
                          ? 'bg-blue-900/50 text-blue-400'
                          : 'bg-gray-800/50 text-gray-400'
                      }`}
                    >
                      {achievement.rarity}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AchievementNotification;
