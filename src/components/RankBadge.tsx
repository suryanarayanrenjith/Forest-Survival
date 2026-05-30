import { Shield, Medal, Award, Star, Gem, Crown, type LucideIcon } from 'lucide-react';
import type { RankInfo } from '../utils/rankSystem';

const TIER_ICON: LucideIcon[] = [Shield, Medal, Award, Star, Gem, Crown];

interface RankBadgeProps {
  rank: RankInfo;
  /** featured = large hero emblem for the profile; compact = inline chip. */
  variant?: 'featured' | 'compact';
}

/**
 * Premium rank emblem — a glowing hexagonal crest tinted by tier color with a
 * shimmer sweep, the tier icon, and a level chip. The featured variant adds the
 * tier name + an XP progress bar to the next tier.
 */
const RankBadge = ({ rank, variant = 'featured' }: RankBadgeProps) => {
  const Icon = TIER_ICON[rank.tierIndex] ?? Shield;
  const color = rank.color;
  const progress = rank.xpForNextTier ? Math.min(100, (rank.xpIntoTier / rank.xpForNextTier) * 100) : 100;
  const emblemSize = variant === 'featured' ? 84 : 44;
  const emblemFrameHeight = emblemSize + (variant === 'featured' ? 14 : 8);
  const iconSize = variant === 'featured' ? 34 : 20;

  const Emblem = (
    <div className="relative flex-shrink-0" style={{ width: emblemSize, height: emblemFrameHeight }}>
      <div className="absolute left-0 top-0" style={{ width: emblemSize, height: emblemSize }}>
        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-[28%]"
          style={{ background: color, filter: 'blur(14px)', opacity: 0.45 }}
        />
        {/* Hexagon crest */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            background: `linear-gradient(150deg, ${color}, ${color}66 55%, #0b0f15 130%)`,
            border: `1.5px solid ${color}`,
            boxShadow: `inset 0 2px 10px ${color}88, inset 0 -6px 14px rgba(0,0,0,0.55)`,
          }}
        >
          {/* Shimmer sweep */}
          <div className="rb-shimmer absolute inset-0" />
        </div>
        {/* Icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon width={iconSize} height={iconSize} strokeWidth={2.1} className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
        </div>
      </div>
      {/* Level chip */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-black tabular-nums tracking-wide"
        style={{ background: '#0b0f15', border: `1.5px solid ${color}`, color }}
      >
        LVL {rank.level}
      </div>
    </div>
  );

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        {Emblem}
        <style>{shimmerCss}</style>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 sm:gap-5">
      {Emblem}
      <div className="flex min-w-0 flex-1 flex-col justify-center" style={{ minHeight: emblemFrameHeight }}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="text-lg sm:text-xl font-black uppercase leading-none tracking-wider" style={{ color }}>
            {rank.tierName}
          </span>
          <span
            className="inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-bold uppercase leading-none tracking-wide tabular-nums"
            style={{ color, borderColor: `${color}40`, background: `${color}14` }}
          >
            Level {rank.level}
          </span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)`, boxShadow: `0 0 10px ${color}99` }}
          />
        </div>
        <p className="mt-2 text-[11px] leading-none text-gray-500">
          {rank.nextTierName
            ? <><span className="font-semibold text-gray-300 tabular-nums">{(rank.xpForNextTier! - rank.xpIntoTier).toLocaleString()}</span> XP to {rank.nextTierName}</>
            : <>Top tier · <span className="font-semibold text-gray-300 tabular-nums">{rank.xp.toLocaleString()}</span> XP</>}
        </p>
      </div>
      <style>{shimmerCss}</style>
    </div>
  );
};

const shimmerCss = `
  .rb-shimmer {
    background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 48%, transparent 62%);
    transform: translateX(-130%);
    animation: rbShimmer 3.4s ease-in-out infinite;
  }
  @keyframes rbShimmer {
    0%, 60% { transform: translateX(-130%); }
    100% { transform: translateX(130%); }
  }
`;

export default RankBadge;
