import { useEffect } from 'react';
import { m } from 'motion/react';
import { Award, Gift, X } from 'lucide-react';
import type { Achievement } from '../utils/AchievementSystem';

interface AchievementNotificationProps {
  achievement: Achievement;
  index: number; // For stacking multiple achievements
  onClose: () => void;
  /** Touch: dock top-centre (the right edge holds the control toggle rail) and
   *  slide in from the top instead of the right. */
  isTouch?: boolean;
}

const CARD_SHAPE = '12px 3px';
const CARD_SHAPE_INNER = '11px 3px';
/** How long a card stays up before it dismisses itself (s). */
const LIFETIME_S = 4;

const RARITY: Record<string, string> = {
  legendary: '#fbbf24',
  epic: '#c084fc',
  rare: '#38bdf8',
  common: '#9ca3af',
};

const SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.9 } as const;

/**
 * Achievement toast. Rendered inside an <AnimatePresence> by App, so removing
 * it from the queue plays the exit animation — no timer-delayed unmount.
 * Restacking when a card above leaves is a spring on `y` (transform only),
 * never an animated `top`, so it never forces a layout per frame mid-fight.
 */
const AchievementNotification = ({ achievement, index, onClose, isTouch = false }: AchievementNotificationProps) => {
  useEffect(() => {
    const timer = setTimeout(onClose, LIFETIME_S * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievement.id]);

  const accent = RARITY[achievement.rarity] || RARITY.common;
  // Desktop: down the LEFT edge — the redesigned HUD keeps the top-left clear
  // (vitals moved bottom-left), while the right edge holds score + radar,
  // which these cards used to slide over. Touch: top-centre (the right edge
  // holds the control toggles) with a tighter stack.
  const stackY = index * (isTouch ? 92 : 150);
  // Enter/exit along the dock edge: from the left on desktop, from above on touch.
  const away = isTouch ? { x: 0, y: stackY - 70 } : { x: -380, y: stackY };

  return (
    // Positioning lives on this static wrapper; the animated card inside owns
    // its transform alone (an animated transform on the same element would
    // clobber a centring translate).
    <div
      className={`pointer-events-none fixed ${isTouch ? 'inset-x-0 flex justify-center' : 'left-4'}`}
      style={{ zIndex: 100 + index, top: isTouch ? 54 : 24 }}
    >
      <m.div
        className={`pointer-events-auto relative ${isTouch ? 'w-[min(90vw,340px)]' : 'w-[340px]'}`}
        style={{ filter: `drop-shadow(0 10px 22px rgba(0,0,0,0.55)) drop-shadow(0 0 16px ${accent}33)` }}
        initial={{ ...away, opacity: 0, scale: 0.94 }}
        animate={{ x: 0, y: stackY, opacity: 1, scale: 1, transition: SPRING }}
        exit={{ ...away, opacity: 0, scale: 0.96, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}
      >
        {/* Partial-rounded tactical card: 1px accent frame, opaque body, accent
            spine, soft glow. */}
        <div className="absolute inset-0" style={{ borderRadius: CARD_SHAPE, background: `${accent}66` }} />
        <div className="relative m-px overflow-hidden" style={{ borderRadius: CARD_SHAPE_INNER, background: 'rgba(6,9,9,0.96)' }}>
          <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
          {/* One light sweep across the card as it lands. */}
          <m.div
            className="pointer-events-none absolute inset-y-0 w-1/2"
            style={{ background: `linear-gradient(105deg, transparent, ${accent}2e, transparent)` }}
            initial={{ x: '-110%' }}
            animate={{ x: '260%' }}
            transition={{ duration: 0.9, delay: 0.18, ease: [0.3, 0, 0.2, 1] }}
          />

          <div className="py-3.5 pl-5 pr-4">
            <div className="flex items-center gap-3">
              <m.div
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center border"
                style={{ borderColor: `${accent}55`, background: `${accent}1c`, borderRadius: '8px 2px' }}
                initial={{ scale: 0.3, rotate: -24, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 18, delay: 0.1 }}
              >
                <Award className="h-6 w-6" style={{ color: accent, filter: `drop-shadow(0 0 5px ${accent})` }} strokeWidth={2} />
              </m.div>
              <div className="min-w-0 flex-1">
                <div className="hud-label truncate whitespace-nowrap" style={{ color: `${accent}e6`, fontSize: 8.5, letterSpacing: '0.12em' }}>
                  Achievement Unlocked
                </div>
                <div
                  className="font-display mt-1 truncate text-[17px] font-semibold uppercase leading-none text-white"
                  style={{ letterSpacing: '0.08em' }}
                >
                  {achievement.name}
                </div>
              </div>
              <span
                className="font-hud flex-shrink-0 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.16em]"
                style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}55` }}
              >
                {achievement.rarity}
              </span>
              <button
                onClick={onClose}
                className="flex-shrink-0 text-white/35 transition-colors hover:text-white"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <p className="font-hud mt-2 text-[12px] leading-relaxed text-white/65">{achievement.description}</p>

            {achievement.reward && (
              <m.div
                className="mt-2.5 flex items-center gap-2 border-l-2 bg-white/[0.04] px-2.5 py-1.5"
                style={{ borderColor: accent }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.28, duration: 0.3, ease: 'easeOut' }}
              >
                <Gift className="h-3.5 w-3.5 flex-shrink-0" style={{ color: accent }} strokeWidth={2.25} />
                <span className="font-hud text-[11px] font-semibold text-white/80">{achievement.reward}</span>
              </m.div>
            )}
          </div>
          {/* Lifetime bar — drains as the card times out. */}
          <m.div
            className="absolute inset-x-0 bottom-0 h-[2px] origin-left"
            style={{ background: accent, opacity: 0.55 }}
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: LIFETIME_S, ease: 'linear' }}
          />
        </div>
      </m.div>
    </div>
  );
};

export default AchievementNotification;
