import { lazy, Suspense, memo } from 'react';

const LazyForestScene = lazy(() => import('./MainMenuForestScene'));
// Eager-import so the WebGL scene is parsed during the initial bundle
// load rather than the first time it appears on screen.
void import('./MainMenuForestScene');

export type MenuBackdropVariant = 'main' | 'classic' | 'tutorial' | 'multiplayer';

interface MenuBackdropProps {
  variant?: MenuBackdropVariant;
}

/** Visible forest artwork for browsers while the live WebGL view is loading or unavailable. */
function ForestFallback() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="menu-forest-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#09170f" />
          <stop offset="42%" stopColor="#214d38" />
          <stop offset="68%" stopColor="#719064" />
          <stop offset="100%" stopColor="#b8c69b" />
        </linearGradient>
        <radialGradient id="menu-forest-sun" cx="72%" cy="27%" r="44%">
          <stop offset="0%" stopColor="#fff6c8" stopOpacity="0.92" />
          <stop offset="20%" stopColor="#dff0b4" stopOpacity="0.45" />
          <stop offset="70%" stopColor="#8db47d" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#8db47d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="menu-forest-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#597a50" />
          <stop offset="100%" stopColor="#1e382b" />
        </linearGradient>
        <symbol id="menu-forest-pine" viewBox="-60 -260 120 320">
          <rect x="-7" y="65" width="14" height="160" rx="4" fill="#241d16" />
          <path d="M0 -250 L-58 -74 H-34 L-62 10 H-38 L-58 87 H58 L38 10 H62 L34 -74 H58 Z" fill="currentColor" />
          <path d="M0 -230 L-34 -68 H34 Z" fill="#8fb771" fillOpacity="0.18" />
        </symbol>
      </defs>

      <rect width="1920" height="1080" fill="url(#menu-forest-sky)" />
      <rect width="1920" height="1080" fill="url(#menu-forest-sun)" />
      <path d="M0 600 C190 500 350 560 525 490 C740 405 870 560 1040 475 C1250 370 1430 545 1640 445 C1770 390 1860 435 1920 400 V770 H0 Z" fill="#486750" fillOpacity="0.86" />
      <path d="M0 660 C230 560 420 645 630 555 C850 465 1050 650 1250 535 C1460 425 1700 555 1920 475 V770 H0 Z" fill="#315340" fillOpacity="0.9" />
      <path d="M0 705 C250 660 420 685 640 642 C840 600 1060 697 1270 628 C1480 560 1730 665 1920 610 V1080 H0 Z" fill="url(#menu-forest-ground)" />

      <g opacity="0.62">
        <use href="#menu-forest-pine" transform="translate(110 650) scale(0.46)" color="#254936" />
        <use href="#menu-forest-pine" transform="translate(260 660) scale(0.5)" color="#294c38" />
        <use href="#menu-forest-pine" transform="translate(405 645) scale(0.42)" color="#31563e" />
        <use href="#menu-forest-pine" transform="translate(565 665) scale(0.5)" color="#2a5039" />
        <use href="#menu-forest-pine" transform="translate(725 650) scale(0.44)" color="#30543e" />
        <use href="#menu-forest-pine" transform="translate(895 658) scale(0.49)" color="#274a36" />
        <use href="#menu-forest-pine" transform="translate(1050 650) scale(0.43)" color="#31533d" />
        <use href="#menu-forest-pine" transform="translate(1200 660) scale(0.5)" color="#284a36" />
        <use href="#menu-forest-pine" transform="translate(1360 646) scale(0.45)" color="#31553d" />
        <use href="#menu-forest-pine" transform="translate(1510 660) scale(0.5)" color="#274934" />
        <use href="#menu-forest-pine" transform="translate(1670 645) scale(0.44)" color="#32543d" />
        <use href="#menu-forest-pine" transform="translate(1820 660) scale(0.52)" color="#274934" />
      </g>

      <g>
        <use href="#menu-forest-pine" transform="translate(75 875) scale(1.43)" color="#0b2a20" />
        <use href="#menu-forest-pine" transform="translate(255 970) scale(1.08)" color="#123827" />
        <use href="#menu-forest-pine" transform="translate(420 1030) scale(0.78)" color="#1a432d" />
        <use href="#menu-forest-pine" transform="translate(1650 1000) scale(0.86)" color="#1b422d" />
        <use href="#menu-forest-pine" transform="translate(1780 920) scale(1.18)" color="#123524" />
        <use href="#menu-forest-pine" transform="translate(1900 875) scale(1.5)" color="#092719" />
      </g>

      <path d="M800 1080 C870 900 1030 810 1190 700 C1300 790 1420 910 1510 1080 Z" fill="#b8c88d" fillOpacity="0.3" />
      <path d="M875 1080 C955 910 1050 840 1190 745 C1305 830 1395 925 1455 1080 Z" fill="#d6dca9" fillOpacity="0.16" />
    </svg>
  );
}

/**
 * Single hoisted MainMenuForestScene used across every menu (Main,
 * Classic, Tutorial, Multiplayer). Previously each menu rendered its
 * own <MenuShell> which lazy-loaded MainMenuForestScene — meaning the
 * WebGL scene was DESTROYED and REBUILT on every menu navigation
 * (~150 trees, 100+ fireflies, custom shaders, post-FX pipeline). That
 * was the user-visible lag every time they moved between Solo /
 * Multiplayer / Tutorial.
 *
 * Hoisting it here means React keeps a single component instance alive
 * across menu navigation — the scene initialises once and survives any
 * menu change. The variant IS forwarded to the scene, but inside it
 * only drives a lightweight camera-rig ease (each menu gets its own
 * randomly-picked vantage of the same forest) — it NEVER re-runs the
 * heavy scene-build effect. The MenuShell CSS overlay still layers the
 * per-menu colour identity on top.
 *
 * Wrapped in React.memo so re-renders of the App component don't
 * propagate to the scene (a render only reaches it when the variant
 * actually changes, and that render is camera-only).
 */
const MenuBackdrop = memo(function MenuBackdrop({ variant = 'main' }: MenuBackdropProps) {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Loading base matches the sunlit scene's palette (sky → fog haze →
          luminous clearing floor) so the WebGL canvas pop-in reads as the
          gradient coming into focus instead of a black screen flashing to
          daylight. The lower stops are kept LUMINOUS (sunlit sage, never a
          dark canopy green) so that even in the impossible case where the
          opaque WebGL canvas failed to cover the viewport, what shows through
          is bright ground-mist — the "black box" has no surface to live on. */}
      <ForestFallback />
      <Suspense fallback={null}>
        <LazyForestScene variant={variant} />
      </Suspense>
    </div>
  );
});

export default MenuBackdrop;
