import { ChevronsUp, Hand, Sparkles } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

interface NotificationsProps {
  showWaveComplete: boolean;
  powerUpMessage?: string;
  /** Total lifetime of the pill in ms — drives the self-collapsing keyframe. */
  powerUpMessageMs?: number;
  /** Bumped per message so React remounts the pill and replays the animation. */
  powerUpMessageKey?: number;
  /** 'warn' = something was refused (amber, hand icon) — e.g. left hand busy. */
  powerUpMessageTone?: 'info' | 'warn';
  t: (key: string) => string;
}

const Notifications = ({
  showWaveComplete,
  powerUpMessage,
  powerUpMessageMs = 2000,
  powerUpMessageKey = 0,
  powerUpMessageTone = 'info',
  t,
}: NotificationsProps) => {
  const warn = powerUpMessageTone === 'warn';
  return (
    <>
      {/* Wave Complete — springs in and glides back OUT (AnimatePresence), the
          chevrons punch up as it lands. Centred by flexbox on a static layer
          so Motion owns the card's transform alone. */}
      <AnimatePresence>
        {showWaveComplete && (
          <div key="wave-complete" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <m.div
              className="text-center"
              initial={{ opacity: 0, scale: 0.86, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 340, damping: 24 } }}
              exit={{ opacity: 0, scale: 1.04, y: -12, transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } }}
            >
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/30 bg-black/80 px-10 py-7">
                <m.div
                  className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-400/40"
                  initial={{ y: 14, scale: 0.6, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 16, delay: 0.12 }}
                >
                  <ChevronsUp className="w-7 h-7 text-emerald-400" strokeWidth={2.25} />
                </m.div>
                <div>
                  <h2 className="text-3xl font-bold tracking-[0.15em] text-emerald-300 uppercase">
                    {t('waveComplete')}
                  </h2>
                  <p className="mt-1 text-sm text-gray-400">{t('nextWave')}</p>
                </div>
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>

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
          <div
            className={`flex items-center gap-2.5 rounded-lg border bg-black/80 px-5 py-2.5 ${warn
              ? 'border-amber-300/40 shadow-[0_0_24px_rgba(255,178,101,0.22)]'
              : 'border-white/15 shadow-[0_0_24px_rgba(34,211,238,0.18)]'}`}
          >
            {warn
              ? <Hand className="w-4 h-4 text-amber-300 flex-shrink-0" strokeWidth={2.25} />
              : <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" strokeWidth={2.25} />}
            <span className={`text-sm font-semibold tracking-wide whitespace-nowrap ${warn ? 'text-amber-50' : 'text-white'}`}>{powerUpMessage}</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes puLife {
          0%   { opacity: 0; transform: translate(-50%, 16px) scale(0.9);  clip-path: inset(0 0 0 0 round 9px 2px); }
          9%   { opacity: 1; transform: translate(-50%, 0) scale(1.06);    clip-path: inset(0 0 0 0 round 9px 2px); }
          16%  { opacity: 1; transform: translate(-50%, 0) scale(1);       clip-path: inset(0 0 0 0 round 9px 2px); }
          80%  { opacity: 1; transform: translate(-50%, 0) scale(1);       clip-path: inset(0 0 0 0 round 9px 2px); }
          92%  { opacity: 0.9; transform: translate(-50%, -2px) scaleX(0.42) scaleY(0.92); clip-path: inset(0 32% 0 32% round 9px 2px); }
          100% { opacity: 0; transform: translate(-50%, -4px) scaleX(0.04) scaleY(0.6);    clip-path: inset(0 50% 0 50% round 9px 2px); }
        }
      `}</style>
    </>
  );
};

export default Notifications;
