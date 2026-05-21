import { useState, useEffect } from 'react';
import { Award, Gift, X } from 'lucide-react';
import type { Achievement } from '../utils/AchievementSystem';

interface AchievementNotificationProps {
  achievement: Achievement;
  index: number; // For stacking multiple achievements
  onClose: () => void;
}

const RARITY: Record<string, string> = {
  legendary: '#fbbf24',
  epic: '#c084fc',
  rare: '#38bdf8',
  common: '#9ca3af',
};

const AchievementNotification = ({ achievement, index, onClose }: AchievementNotificationProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievement.id]);

  const accent = RARITY[achievement.rarity] || RARITY.common;
  // Base offset clears the top-right score panel so they never overlap it.
  const topPosition = 150 + index * 156;

  return (
    <div
      className={`fixed right-4 transition-all duration-300 ${visible ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'}`}
      style={{ zIndex: 100 + index, top: `${topPosition}px` }}
    >
      <div
        className="w-[330px] rounded-xl border bg-[#0b0f15]/95 backdrop-blur-md overflow-hidden"
        style={{ borderColor: `${accent}55`, boxShadow: `0 10px 30px -10px ${accent}55` }}
      >
        {/* accent edge */}
        <div className="h-0.5 w-full" style={{ background: accent }} />

        <div className="p-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0"
              style={{ background: `${accent}1f` }}
            >
              <Award className="w-6 h-6" style={{ color: accent }} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold tracking-[0.18em] text-gray-500 uppercase">
                Achievement Unlocked
              </div>
              <div className="text-sm font-bold text-white truncate">{achievement.name}</div>
            </div>
            <span
              className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-1 rounded flex-shrink-0"
              style={{ background: `${accent}1f`, color: accent }}
            >
              {achievement.rarity}
            </span>
            <button
              onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
              className="text-gray-600 hover:text-white transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>

          <p className="mt-2 text-xs text-gray-400 leading-relaxed">{achievement.description}</p>

          {achievement.reward && (
            <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5">
              <Gift className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accent }} strokeWidth={2.25} />
              <span className="text-[11px] font-semibold text-gray-300">{achievement.reward}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AchievementNotification;
