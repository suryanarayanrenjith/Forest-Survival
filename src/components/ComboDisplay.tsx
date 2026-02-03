import { useState, useEffect, useRef } from 'react';

interface ComboDisplayProps {
  combo: number;
  killStreak: number;
  visible: boolean;
}

const ComboDisplay = ({ combo, killStreak, visible }: ComboDisplayProps) => {
  const [previousCombo, setPreviousCombo] = useState(combo);
  const [comboIncreased, setComboIncreased] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide notification after 3 seconds of no changes
  useEffect(() => {
    if (combo > 0 || killStreak > 0) {
      setShowNotification(true);
      setFadeOut(false);

      // Clear existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }

      // Set new timeout to hide after 3 seconds
      hideTimeoutRef.current = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => setShowNotification(false), 500);
      }, 3000);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [combo, killStreak]);

  useEffect(() => {
    if (combo > previousCombo && combo > 0) {
      setComboIncreased(true);
      setTimeout(() => setComboIncreased(false), 500);
    }
    setPreviousCombo(combo);
  }, [combo, previousCombo]);

  if (!visible || !showNotification || (combo === 0 && killStreak === 0)) return null;

  const getComboTier = (comboCount: number) => {
    if (comboCount >= 20) return { text: 'LEGENDARY!', color: 'from-purple-500 to-pink-500', glow: 'purple' };
    if (comboCount >= 15) return { text: 'UNSTOPPABLE!', color: 'from-orange-500 to-red-500', glow: 'red' };
    if (comboCount >= 10) return { text: 'DOMINATING!', color: 'from-yellow-500 to-orange-500', glow: 'orange' };
    if (comboCount >= 5) return { text: 'KILLING SPREE!', color: 'from-green-500 to-yellow-500', glow: 'yellow' };
    return { text: 'COMBO!', color: 'from-blue-500 to-cyan-500', glow: 'cyan' };
  };

  const getStreakTitle = (streak: number) => {
    if (streak >= 50) return '🔥 GOD MODE 🔥';
    if (streak >= 30) return '⚡ RAMPAGE ⚡';
    if (streak >= 20) return '💀 MERCILESS 💀';
    if (streak >= 10) return '⭐ ON FIRE ⭐';
    if (streak >= 5) return '🎯 SHARPSHOOTER 🎯';
    return null;
  };

  const comboTier = getComboTier(combo);
  const streakTitle = getStreakTitle(killStreak);

  return (
    <div
      className={`fixed top-24 left-1/2 transform -translate-x-1/2 z-40 pointer-events-none transition-all duration-500 ${fadeOut ? 'opacity-0 translate-y-[-20px]' : 'opacity-100'}`}
    >
      {/* Compact unified display */}
      <div className="flex flex-col items-center gap-1.5">
        {/* Combo Counter - More compact */}
        {combo > 0 && (
          <div
            className={`
              bg-gradient-to-r ${comboTier.color}
              text-white px-4 py-2 rounded-lg shadow-xl
              transform transition-all duration-200
              ${comboIncreased ? 'scale-110' : 'scale-100'}
            `}
            style={{
              boxShadow: `0 0 20px var(--glow-color)`,
              '--glow-color': comboTier.glow === 'purple' ? 'rgba(168, 85, 247, 0.6)' :
                             comboTier.glow === 'red' ? 'rgba(239, 68, 68, 0.6)' :
                             comboTier.glow === 'orange' ? 'rgba(249, 115, 22, 0.6)' :
                             comboTier.glow === 'yellow' ? 'rgba(234, 179, 8, 0.6)' :
                             'rgba(6, 182, 212, 0.6)'
            } as React.CSSProperties}
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black">{combo}x</span>
              <span className="text-xs font-bold tracking-wide opacity-90">{comboTier.text}</span>
            </div>
          </div>
        )}

        {/* Kill Streak - Inline with title */}
        {killStreak >= 5 && streakTitle && (
          <div
            className="bg-gradient-to-r from-red-600/90 to-orange-600/90 text-white px-4 py-1.5 rounded-lg shadow-lg font-bold text-sm flex items-center gap-2"
            style={{ boxShadow: '0 0 15px rgba(239, 68, 68, 0.5)' }}
          >
            <span className="text-orange-300">🔥</span>
            <span>{streakTitle}</span>
            <span className="bg-black/30 px-2 py-0.5 rounded text-xs">{killStreak}</span>
          </div>
        )}

        {/* Simple streak counter for lower streaks */}
        {killStreak > 0 && killStreak < 5 && (
          <div className="bg-black/60 backdrop-blur-sm px-3 py-1 rounded-lg text-sm">
            <span className="text-orange-400 font-bold">🔥 STREAK: {killStreak}</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.9;
          }
        }
      `}</style>
    </div>
  );
};

export default ComboDisplay;
