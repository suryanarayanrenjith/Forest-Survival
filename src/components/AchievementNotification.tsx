import { useState, useEffect } from 'react';
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

const RARITY: Record<string, string> = {
  legendary: '#fbbf24',
  epic: '#c084fc',
  rare: '#38bdf8',
  common: '#9ca3af',
};

const AchievementNotification = ({ achievement, index, onClose, isTouch = false }: AchievementNotificationProps) => {
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
  // Desktop: down the LEFT edge — the redesigned HUD keeps the top-left clear
  // (vitals moved bottom-left), while the right edge holds score + radar,
  // which these cards used to slide over. Touch: top-centre (the right edge
  // holds the control toggles) with a tighter stack.
  const topPosition = isTouch ? 54 + index * 92 : 24 + index * 150;

  // Hidden/entry transforms differ per layout so the slide direction matches the
  // dock edge (top-centre slides down; left edge slides in from the left).
  const hiddenTransform = isTouch ? 'translate(-50%, -120%)' : 'translateX(-120%)';
  const shownTransform = isTouch ? 'translate(-50%, 0)' : 'translateX(0)';

  return (
    <div
      className={`fixed transition-all duration-300 ${isTouch ? 'left-1/2' : 'left-4'}`}
      style={{
        zIndex: 100 + index,
        top: `${topPosition}px`,
        transform: visible ? shownTransform : hiddenTransform,
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Partial-rounded tactical card: 1px accent frame, opaque body, accent
          spine, soft glow. */}
      <div
        className={`relative ${isTouch ? 'w-[min(90vw,340px)]' : 'w-[340px]'}`}
        style={{ filter: `drop-shadow(0 10px 22px rgba(0,0,0,0.55)) drop-shadow(0 0 16px ${accent}33)` }}
      >
        <div className="absolute inset-0" style={{ borderRadius: CARD_SHAPE, background: `${accent}66` }} />
        <div className="relative m-px overflow-hidden" style={{ borderRadius: CARD_SHAPE_INNER, background: 'rgba(6,9,9,0.96)' }}>
          <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />

          <div className="py-3.5 pl-5 pr-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center border"
                style={{
                  borderColor: `${accent}55`,
                  background: `${accent}1c`,
                  borderRadius: '8px 2px',
                }}
              >
                <Award className="h-6 w-6" style={{ color: accent, filter: `drop-shadow(0 0 5px ${accent})` }} strokeWidth={2} />
              </div>
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
                onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
                className="flex-shrink-0 text-white/35 transition-colors hover:text-white"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <p className="font-hud mt-2 text-[12px] leading-relaxed text-white/65">{achievement.description}</p>

            {achievement.reward && (
              <div
                className="mt-2.5 flex items-center gap-2 border-l-2 bg-white/[0.04] px-2.5 py-1.5"
                style={{ borderColor: accent }}
              >
                <Gift className="h-3.5 w-3.5 flex-shrink-0" style={{ color: accent }} strokeWidth={2.25} />
                <span className="font-hud text-[11px] font-semibold text-white/80">{achievement.reward}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AchievementNotification;
