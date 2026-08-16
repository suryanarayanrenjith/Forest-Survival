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
        {/* <h2>, not <h1>. Googlebot-Smartphone satisfies the isTouch check at a
            portrait viewport, so under mobile-first indexing this overlay is very
            likely Google's rendered impression of the homepage — and "Rotate your
            device" was the document's only H1. The MainMenu wordmark behind this
            overlay is the real H1. */}
        <h2 className="text-2xl font-bold text-white">Rotate your device</h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-gray-400">
          Forest Survival plays in landscape. Turn your device sideways to continue.
        </p>
        {/* A crawler that only ever sees this screen still gets an accurate
            description of the game and a path into the content pages. */}
        <p className="mx-auto mt-5 max-w-sm text-xs leading-relaxed text-gray-400">
          Forest Survival is a free 3D first-person shooter where you survive endless
          waves of hostile robots across eight biome maps, playable instantly in any
          modern browser.
        </p>
        <nav
          aria-label="About Forest Survival"
          className="mx-auto mt-4 flex max-w-sm flex-wrap justify-center gap-x-3 gap-y-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55"
        >
          <a href="/guide" className="transition-colors hover:text-emerald-300">Guide</a>
          <a href="/how-to-play" className="transition-colors hover:text-emerald-300">How to Play</a>
          <a href="/weapons" className="transition-colors hover:text-emerald-300">Weapons</a>
          <a href="/enemies" className="transition-colors hover:text-emerald-300">Robot Enemies</a>
          <a href="/maps" className="transition-colors hover:text-emerald-300">Maps</a>
          <a href="/faq" className="transition-colors hover:text-emerald-300">FAQ</a>
        </nav>
      </div>
    </div>
  );
};

export default OrientationGate;
