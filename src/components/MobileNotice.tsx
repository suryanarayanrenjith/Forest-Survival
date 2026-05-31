import { useState } from 'react';
import { Monitor, Smartphone, Check } from 'lucide-react';
import { detectIsTouch } from '../hooks/useDeviceInfo';

const STORAGE_KEY = 'mobileNoticeDismissed';

/**
 * One-time, dismissible heads-up shown to touch (phone/tablet) players: the
 * game is playable on mobile but tuned for desktop. Persists the dismissal in
 * localStorage so it only appears once. No-op on desktop. Sits just below the
 * OrientationGate (z-9999) so the rotate prompt always wins in portrait.
 */
const MobileNotice = () => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!detectIsTouch()) return true; // desktop — never show
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#05080a]/85 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-400/25 bg-[#0b0f15] shadow-2xl">
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10">
            <div className="relative">
              <Monitor className="h-8 w-8 text-amber-300" strokeWidth={1.75} />
              <Smartphone className="absolute -bottom-1 -right-2 h-4 w-4 text-amber-400" strokeWidth={2} />
            </div>
          </div>

          <h1 className="text-xl font-bold text-white">Best experienced on desktop</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-400">
            Forest Survival is built and tuned for keyboard &amp; mouse. It's fully
            playable on phones and tablets with on-screen touch controls, but the
            mobile experience may not be as polished. For the best experience,
            play on a desktop or laptop.
          </p>

          <button
            onClick={dismiss}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold tracking-wide text-[#04130a] transition-transform active:scale-95"
            style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
          >
            <Check className="h-4 w-4" strokeWidth={2.5} /> Continue on mobile
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileNotice;
