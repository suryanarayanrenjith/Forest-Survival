import { RotateCcw, Smartphone } from 'lucide-react';
import { useDeviceInfo } from '../hooks/useDeviceInfo';

/**
 * Full-screen "rotate to landscape" gate. Renders only on touch devices held
 * in portrait, overlaying everything (menus and gameplay alike) so the game is
 * always experienced in landscape. No-op on desktop. The companion sim-freeze
 * lives in App (orientationBlockedRef), so the world is paused behind this.
 */
const OrientationGate = () => {
  const { isTouch, isLandscape } = useDeviceInfo();
  if (!isTouch || isLandscape) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-[#05080a] px-8 text-center">
      <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-emerald-500/30 bg-emerald-500/10">
        <Smartphone className="h-12 w-12 text-emerald-400 animate-rotate-hint" strokeWidth={1.75} />
        <RotateCcw className="absolute -right-2 -top-2 h-6 w-6 text-emerald-300" strokeWidth={2.25} />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Rotate your device</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-gray-400">
          Forest Survival plays in landscape. Turn your device sideways to continue.
        </p>
      </div>
    </div>
  );
};

export default OrientationGate;
