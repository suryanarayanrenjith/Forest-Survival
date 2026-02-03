interface NotificationsProps {
  showWaveComplete: boolean;
  killStreak?: number;
  powerUpMessage?: string;
  t: (key: string) => string;
}

const Notifications = ({ showWaveComplete, killStreak, powerUpMessage, t }: NotificationsProps) => {
  return (
    <>
      {/* Wave Complete Notification */}
      {showWaveComplete && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center" style={{ animation: 'scaleIn 0.5s ease-out' }}>
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-8 rounded-3xl border-4 border-green-400 shadow-2xl">
            <h2 className="text-6xl font-bold text-white mb-4 drop-shadow-lg animate-pulse">
              ✅ {t('waveComplete')}
            </h2>
            <p className="text-white text-2xl">{t('nextWave')}</p>
          </div>
        </div>
      )}

      {/* Kill Streak Notification */}
      {killStreak && killStreak >= 5 && (
        <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2" style={{ animation: 'slideInFromTop 0.5s ease-out' }}>
          <div className="bg-gradient-to-r from-orange-600 to-red-600 px-8 py-4 rounded-2xl border-2 border-orange-400 shadow-2xl">
            <p className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-4xl">🔥</span>
              <span>KILL STREAK x{killStreak}!</span>
            </p>
          </div>
        </div>
      )}

      {/* Power-Up Message */}
      {powerUpMessage && (
        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2" style={{ animation: 'slideInFromBottom 0.5s ease-out' }}>
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 rounded-xl border-2 border-blue-400 shadow-2xl">
            <p className="text-xl font-bold text-white">{powerUpMessage}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default Notifications;
