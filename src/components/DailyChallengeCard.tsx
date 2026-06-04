import { useQuery, useMutation } from 'convex/react';
import { useConvexAuth } from '@convex-dev/auth/react';
import { CheckCircle, Sparkles, Calendar } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';
import { DAILY_CHALLENGES, type DailyChallengeId } from '../utils/DailyChallengeRegistry';

/**
 * Compact card shown on the Main Menu for signed-in players. Surfaces
 * today's daily challenge, current progress, and a Claim button when the
 * challenge is complete. Returns null while signed-out (the menu hides the
 * whole tile in that case).
 */
const DailyChallengeCard = () => {
  const { isAuthenticated } = useConvexAuth();
  const daily = useQuery(api.daily.getDaily, isAuthenticated ? {} : 'skip');
  const claim = useMutation(api.daily.claim);
  const [claiming, setClaiming] = useState(false);
  const [claimedAt, setClaimedAt] = useState(0);

  if (!isAuthenticated || daily === undefined) return null;
  if (daily === null) return null;

  const challenge = DAILY_CHALLENGES[daily.challengeId as DailyChallengeId];
  if (!challenge) return null;

  const progress = Math.min(daily.progress, challenge.goal);
  const pct = Math.round((progress / challenge.goal) * 100);
  const complete = daily.progress >= challenge.goal;
  const claimed = daily.claimed || claimedAt > 0;

  const onClaim = async () => {
    if (claiming || claimed || !complete) return;
    setClaiming(true);
    try {
      await claim({});
      setClaimedAt(Date.now());
    } catch {
      // Network blip — re-arm the button so the user can retry.
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-400/35 bg-emerald-500/12">
          <Calendar className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2.5} />
        </span>
        <div className="flex flex-1 items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300/80">
            Daily Challenge
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-gray-500">
            {daily.utcDay}
          </span>
        </div>
      </div>

      <h3 className="mt-2 text-base font-black tracking-tight text-white">{challenge.name}</h3>
      <p className="mt-0.5 text-[12px] leading-snug text-gray-400">{challenge.blurb}</p>

      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
            Progress
          </span>
          <span className="text-[12px] font-bold tabular-nums text-emerald-300">
            {progress} / {challenge.goal}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #15803d, #34d399 60%, #22d3ee)',
              boxShadow: '0 0 10px rgba(52,211,153,0.5)',
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onClaim}
        disabled={!complete || claimed || claiming}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-bold uppercase tracking-[0.15em] transition-all ${
          claimed
            ? 'border-emerald-400/55 bg-emerald-500/18 text-emerald-200'
            : complete
              ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
              : 'border-white/10 bg-white/[0.04] text-gray-500'
        }`}
      >
        {claimed ? (
          <>
            <CheckCircle className="h-3.5 w-3.5" strokeWidth={2.5} /> Claimed
          </>
        ) : complete ? (
          <>
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} /> Claim +1 SP
          </>
        ) : (
          <>In Progress…</>
        )}
      </button>
    </div>
  );
};

export default DailyChallengeCard;
