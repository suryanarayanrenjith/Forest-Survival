import { Shield, Medal, Award, Star, Gem, Crown, Flame, Trophy, ChevronRight, type LucideIcon } from 'lucide-react';
import type { RankInfo } from '../utils/rankSystem';
import { RANK_TIERS } from '../utils/rankSystem';

// One per RANK_TIERS entry (Bronze…Legend). Keep length in sync with RANK_TIERS.
const TIER_ICON: LucideIcon[] = [Shield, Medal, Award, Star, Gem, Crown, Flame, Trophy];

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

interface RankBadgeProps {
  rank: RankInfo;
}

const RankBadge = ({ rank }: RankBadgeProps) => {
  const Icon = TIER_ICON[rank.tierIndex] ?? Shield;
  const NextIcon = TIER_ICON[rank.tierIndex + 1] ?? Trophy;
  const color = rank.color;
  const nextColor = RANK_TIERS[rank.tierIndex + 1]?.color ?? color;
  const progress = rank.xpForNextTier ? Math.min(100, (rank.xpIntoTier / rank.xpForNextTier) * 100) : 100;
  const xpToNext = rank.xpForNextTier ? rank.xpForNextTier - rank.xpIntoTier : 0;

  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <div className="relative flex-shrink-0" style={{ width: 96, height: 96 }}>
        <div className="absolute inset-1 rounded-[30%]" style={{ background: color, filter: 'blur(17px)', opacity: 0.4 }} />

        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            clipPath: HEX_CLIP,
            background: `linear-gradient(150deg, ${color}, ${color}55 52%, #0b0f15 130%)`,
            border: `1.5px solid ${color}`,
            boxShadow: `inset 0 2px 12px ${color}99, inset 0 -8px 16px rgba(0,0,0,0.6)`,
          }}
        >
          <div
            className="rb-spin absolute -inset-1/4"
            style={{ background: `conic-gradient(from 0deg, transparent, ${color}88 12%, transparent 30%, transparent 62%, rgba(255,255,255,0.18) 76%, transparent 92%)` }}
          />
          <div className="rb-shimmer absolute inset-0" />
          <div className="absolute inset-[6px]" style={{ clipPath: HEX_CLIP, boxShadow: `inset 0 0 0 1px ${color}3a` }} />
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <Icon width={36} height={36} strokeWidth={2.1} className="text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.7)]" />
        </div>

        <div
          className="absolute -bottom-1.5 left-1/2 flex h-6 -translate-x-1/2 items-center justify-center rounded-full border-2 px-2 text-[11px] font-black leading-none tabular-nums shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
          style={{ color: '#0b0f15', background: `linear-gradient(180deg, #fff, ${color})`, borderColor: '#0b0f15' }}
          title={`Account level ${rank.level}`}
        >
          {rank.level}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span
            className="font-display text-xl sm:text-2xl font-black uppercase leading-none tracking-wider"
            style={{ color, textShadow: `0 0 22px ${color}55` }}
          >
            {rank.tierName}
          </span>
          <span
            className="inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-bold uppercase leading-none tracking-wide tabular-nums"
            style={{ color, borderColor: `${color}40`, background: `${color}14` }}
          >
            Level {rank.level}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-1" aria-hidden>
          {RANK_TIERS.map((t, i) => {
            const reached = i <= rank.tierIndex;
            const current = i === rank.tierIndex;
            return (
              <span
                key={t.name}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: current ? 20 : 9,
                  background: reached ? t.color : 'rgba(255,255,255,0.09)',
                  boxShadow: current ? `0 0 9px ${t.color}` : undefined,
                }}
                title={t.name}
              />
            );
          })}
        </div>

        <div className="relative mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="rb-fill h-full rounded-full"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 12px ${color}` }}
          />
        </div>

        <p className="mt-2 flex items-center gap-1 text-[11px] leading-none text-gray-500">
          {rank.nextTierName ? (
            <>
              <span className="font-semibold text-gray-300 tabular-nums">{xpToNext.toLocaleString()}</span>
              <span>XP to</span>
              <ChevronRight className="h-3 w-3 opacity-50" strokeWidth={2.5} />
              <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wide" style={{ color: nextColor }}>
                <NextIcon className="h-3.5 w-3.5" strokeWidth={2.3} /> {rank.nextTierName}
              </span>
            </>
          ) : (
            <>
              <Crown className="h-3.5 w-3.5" strokeWidth={2.3} style={{ color }} />
              <span className="font-bold uppercase tracking-wide" style={{ color }}>Apex tier</span>
              <span>· <span className="font-semibold text-gray-300 tabular-nums">{rank.xp.toLocaleString()}</span> XP</span>
            </>
          )}
        </p>
      </div>

      <style>{`
        .rb-shimmer {
          background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.5) 48%, transparent 62%);
          transform: translateX(-130%);
          animation: rbShimmer 3.6s ease-in-out infinite;
        }
        @keyframes rbShimmer {
          0%, 60% { transform: translateX(-130%); }
          100% { transform: translateX(130%); }
        }
        .rb-spin { animation: rbSpin 9s linear infinite; opacity: 0.5; }
        @keyframes rbSpin { to { transform: rotate(360deg); } }
        .rb-fill { animation: rbFill 0.9s cubic-bezier(0.16,1,0.3,1) backwards; }
        @keyframes rbFill { from { width: 0; } }
      `}</style>
    </div>
  );
};

export default RankBadge;
