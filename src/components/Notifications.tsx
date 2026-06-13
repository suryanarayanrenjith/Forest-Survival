import { ChevronsUp, Sparkles } from 'lucide-react';

interface NotificationsProps {
  showWaveComplete: boolean;
  killStreak?: number;
  powerUpMessage?: string;
  /** Total lifetime of the pill in ms — drives the self-collapsing keyframe. */
  powerUpMessageMs?: number;
  /** Bumped per message so React remounts the pill and replays the animation. */
  powerUpMessageKey?: number;
  t: (key: string) => string;
}

const Notifications = ({
  showWaveComplete,
  powerUpMessage,
  powerUpMessageMs = 2000,
  powerUpMessageKey = 0,
  t,
}: NotificationsProps) => {
  return (
    <>
      {/* Wave Complete */}
      {showWaveComplete && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ animation: 'wcIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/30 bg-black/80 px-10 py-7">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-400/40">
              <ChevronsUp className="w-7 h-7 text-emerald-400" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-[0.15em] text-emerald-300 uppercase">
                {t('waveComplete')}
              </h2>
              <p className="mt-1 text-sm text-gray-400">{t('nextWave')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Power-Up Message — self-contained life cycle: it rises in, holds, then
          auto-COLLAPSES (folds horizontally + fades) at the tail of its own
          animation. `key` remounts it per message so the collapse always
          replays; `animationDuration` scales the whole arc to the message's
          requested on-screen time, keeping the collapse synced to the clear. */}
      {powerUpMessage && (
        <div
          key={powerUpMessageKey}
          className="absolute bottom-40 left-1/2 origin-bottom"
          style={{
            animation: `puLife ${powerUpMessageMs}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
            willChange: 'transform, opacity, clip-path',
          }}
        >
          <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-black/80 px-5 py-2.5 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
            <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" strokeWidth={2.25} />
            <span className="text-sm font-semibold text-white tracking-wide whitespace-nowrap">{powerUpMessage}</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes wcIn {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes puLife {
          0%   { opacity: 0; transform: translate(-50%, 16px) scale(0.9);  clip-path: inset(0 0 0 0 round 9999px); }
          9%   { opacity: 1; transform: translate(-50%, 0) scale(1.06);    clip-path: inset(0 0 0 0 round 9999px); }
          16%  { opacity: 1; transform: translate(-50%, 0) scale(1);       clip-path: inset(0 0 0 0 round 9999px); }
          80%  { opacity: 1; transform: translate(-50%, 0) scale(1);       clip-path: inset(0 0 0 0 round 9999px); }
          92%  { opacity: 0.9; transform: translate(-50%, -2px) scaleX(0.42) scaleY(0.92); clip-path: inset(0 32% 0 32% round 9999px); }
          100% { opacity: 0; transform: translate(-50%, -4px) scaleX(0.04) scaleY(0.6);    clip-path: inset(0 50% 0 50% round 9999px); }
        }
      `}</style>
    </>
  );
};

export default Notifications;
