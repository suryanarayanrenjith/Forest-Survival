import { useState } from 'react';
import { Monitor, Smartphone, Check, Crosshair, Gamepad2 } from 'lucide-react';
import { detectIsTouch } from '../hooks/useDeviceInfo';

const STORAGE_KEY = 'mobileNoticeDismissed';

/**
 * One-time, dismissible heads-up shown to touch (phone/tablet) players: the
 * game is playable on mobile but tuned for desktop. Persists the dismissal in
 * localStorage so it only appears once. No-op on desktop. Sits just below the
 * OrientationGate (z-9999) so the rotate prompt always wins in portrait.
 *
 * Purpose-built for a short landscape phone viewport: a compact two-column
 * card (identity / quick-start) that never needs vertical scrolling, rather
 * than the tall centered dialog a desktop dismissal would use.
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
    <div className="m-safe fixed inset-0 z-[9998] flex items-center justify-center bg-[#05080a]/90 p-4 backdrop-blur-sm menu-overlay-in">
      <div className="m-sheet-in w-full max-w-lg overflow-hidden rounded-2xl border border-amber-400/25 bg-[#0b0f15] shadow-2xl">
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        <div className="flex items-center gap-4 p-4">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10">
            <div className="relative">
              <Monitor className="h-7 w-7 text-amber-300" strokeWidth={1.75} />
              <Smartphone className="absolute -bottom-1 -right-2 h-3.5 w-3.5 text-amber-400" strokeWidth={2} />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight text-white">Best on desktop — but ready for touch</h1>
            <p className="mt-1 text-[12px] leading-snug text-gray-400">
              Forest Survival is tuned for keyboard &amp; mouse, yet fully playable here
              with purpose-built touch controls. Play in landscape.
            </p>
          </div>
        </div>

        {/* Quick-start reminder of the two touch essentials. */}
        <div className="grid grid-cols-2 gap-2 px-4">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
            <Gamepad2 className="h-4 w-4 flex-none text-emerald-300" strokeWidth={2} />
            <span className="text-[11px] leading-tight text-gray-300">Left thumb moves · swipe right to look</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
            <Crosshair className="h-4 w-4 flex-none text-red-300" strokeWidth={2} />
            <span className="text-[11px] leading-tight text-gray-300">FIRE auto-aims — no aim button needed</span>
          </div>
        </div>

        <div className="p-4">
          <button
            onClick={dismiss}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold tracking-wide text-[#04130a] transition-transform active:scale-95"
            style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
          >
            <Check className="h-4 w-4" strokeWidth={2.5} /> Got it — play on mobile
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileNotice;
