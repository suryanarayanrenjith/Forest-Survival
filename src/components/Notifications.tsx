import { ChevronsUp, Sparkles } from 'lucide-react';

interface NotificationsProps {
  showWaveComplete: boolean;
  killStreak?: number;
  powerUpMessage?: string;
  t: (key: string) => string;
}

const Notifications = ({ showWaveComplete, powerUpMessage, t }: NotificationsProps) => {
  return (
    <>
      {/* Wave Complete */}
      {showWaveComplete && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ animation: 'wcIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/30 bg-black/70 backdrop-blur-md px-10 py-7">
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

      {/* Power-Up Message */}
      {powerUpMessage && (
        <div
          className="absolute bottom-32 left-1/2 -translate-x-1/2"
          style={{ animation: 'puIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-black/70 backdrop-blur-md px-5 py-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" strokeWidth={2.25} />
            <span className="text-sm font-semibold text-white tracking-wide">{powerUpMessage}</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes wcIn {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes puIn {
          0% { opacity: 0; transform: translate(-50%, 12px); }
          100% { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </>
  );
};

export default Notifications;
