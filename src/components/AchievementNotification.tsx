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
  // Base offset clears the top-right score panel so they never overlap it.
  const topPosition = 150 + (index * 160); // 150px base + 160px per achievement

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

export default AchievementNotification;
