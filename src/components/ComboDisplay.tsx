import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { Flame, Zap } from 'lucide-react';
import { getBossBarBottom, subscribeBossBar } from './BossHealthBar';

interface ComboDisplayProps {
  combo: number;
  killStreak: number;
  visible: boolean;
  /** When the top-centre FPS counter is on, the stack drops below it so the
   *  two never overlap — this is the ONLY combo/streak UI in the game (the
   *  HUD pill and the kill-feed milestone entries were removed as duplicates). */
  fpsVisible?: boolean;
}

const ComboDisplay = ({ combo, killStreak, visible, fpsVisible = false }: ComboDisplayProps) => {
  const [previousCombo, setPreviousCombo] = useState(combo);
  const [comboIncreased, setComboIncreased] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A live boss bar owns the slot under the FPS pill; the stack drops below it.
  const bossBarBottom = useSyncExternalStore(subscribeBossBar, getBossBarBottom);

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
    if (c >= 15) return { label: 'Unstoppable', color: '#ff5a5f' };
    if (c >= 10) return { label: 'Dominating', color: '#ff8a4c' };
    if (c >= 5) return { label: 'Killing Spree', color: '#ffb265' };
    return { label: 'Combo', color: '#39d0e6' };
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
  const baseTop = fpsVisible ? 48 : 12;
  const top = bossBarBottom > 0 ? Math.max(baseTop, bossBarBottom + 6) : baseTop;

  return (
    // Top-centre notification lane: FPS pill (top-2, when enabled) → boss bar
    // (while a boss lives) → this stack. Nothing else renders in this strip —
    // the HEADSHOT pill and the HUD's own combo pill that used to fight over
    // it were removed.
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-40 pointer-events-none flex flex-col items-center gap-1.5
        transition-all duration-400 ${fadeOut ? 'opacity-0 -translate-y-2' : 'opacity-100'}`}
      style={{ top }}
    >
      {combo > 0 && (
        <div className="flex flex-col items-center hud-ink">
          <div
            className={`flex items-end gap-2.5 px-6 pb-1 pt-0.5 transition-transform duration-200 ${comboIncreased ? 'scale-110' : 'scale-100'}`}
            style={{ background: 'radial-gradient(60% 90% at 50% 60%, rgba(4,8,7,0.6), transparent)' }}
          >
            <Flame className="mb-[5px] w-4 h-4" style={{ color: tier.color, filter: `drop-shadow(0 0 6px ${tier.color})` }} strokeWidth={2.25} fill="currentColor" />
            <span className="hud-num text-[30px]" style={{ color: tier.color }}>{combo}<span className="text-[18px]">x</span></span>
            <span className="hud-label mb-[6px]" style={{ color: tier.color, fontSize: 10.5 }}>
              {tier.label}
            </span>
          </div>
          <div className="h-px w-40" style={{ background: `linear-gradient(90deg, transparent, ${tier.color}aa, transparent)` }} />
        </div>
      )}

      {killStreak >= 5 && streakLabel && (
        <div className="flex items-center gap-2 px-4 py-0.5 hud-ink" style={{ background: 'linear-gradient(90deg, transparent, rgba(40,14,4,0.7), transparent)' }}>
          <Zap className="w-3 h-3" style={{ color: '#ffb265' }} strokeWidth={2.25} fill="currentColor" />
          <span className="hud-label" style={{ color: '#ffd0a3', fontSize: 10 }}>{streakLabel}</span>
          <span className="hud-num text-[14px]" style={{ color: '#ffb265' }}>{killStreak}</span>
        </div>
      )}
    </div>
  );
};

export default ComboDisplay;
