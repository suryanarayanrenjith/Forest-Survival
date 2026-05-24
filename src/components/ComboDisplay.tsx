import { useState, useEffect, useRef } from 'react';
import { Flame, Zap } from 'lucide-react';

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

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }

      hideTimeoutRef.current = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => setShowNotification(false), 300);
      }, 1800);
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
      const timer = setTimeout(() => setComboIncreased(false), 400);
      setPreviousCombo(combo);
      return () => clearTimeout(timer);
    }
    setPreviousCombo(combo);
  }, [combo, previousCombo]);

  if (!visible || !showNotification || (combo === 0 && killStreak === 0)) return null;

  const getComboTier = (c: number) => {
    if (c >= 20) return { label: 'Legendary', color: '#c084fc' };
    if (c >= 15) return { label: 'Unstoppable', color: '#f87171' };
    if (c >= 10) return { label: 'Dominating', color: '#fb923c' };
    if (c >= 5) return { label: 'Killing Spree', color: '#fbbf24' };
    return { label: 'Combo', color: '#38bdf8' };
  };

  const getStreakLabel = (s: number) => {
    if (s >= 50) return 'God Mode';
    if (s >= 30) return 'Rampage';
    if (s >= 20) return 'Merciless';
    if (s >= 10) return 'On Fire';
    if (s >= 5) return 'Sharpshooter';
    return null;
  };

  const tier = getComboTier(combo);
  const streakLabel = getStreakLabel(killStreak);

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex flex-col items-center gap-1.5
        transition-all duration-400 ${fadeOut ? 'opacity-0 -translate-y-2' : 'opacity-100'}`}
    >
      {/* Combo counter */}
      {combo > 0 && (
        <div
          className={`flex items-center gap-2 rounded-full border bg-black/60 backdrop-blur-md px-4 py-1.5
            transition-transform duration-200 ${comboIncreased ? 'scale-110' : 'scale-100'}`}
          style={{ borderColor: `${tier.color}66` }}
        >
          <Flame className="w-4 h-4" style={{ color: tier.color }} strokeWidth={2.25} fill="currentColor" />
          <span className="text-lg font-bold tabular-nums" style={{ color: tier.color }}>{combo}x</span>
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: `${tier.color}cc` }}>
            {tier.label}
          </span>
        </div>
      )}

      {/* Kill streak */}
      {killStreak >= 5 && streakLabel && (
        <div className="flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-500/15 backdrop-blur-md px-3.5 py-1">
          <Zap className="w-3.5 h-3.5 text-orange-400" strokeWidth={2.25} fill="currentColor" />
          <span className="text-xs font-bold text-orange-200 tracking-[0.1em] uppercase">{streakLabel}</span>
          <span className="text-[10px] font-bold text-orange-100 tabular-nums bg-black/30 rounded px-1.5 py-0.5">
            {killStreak}
          </span>
        </div>
      )}
    </div>
  );
};

export default ComboDisplay;
