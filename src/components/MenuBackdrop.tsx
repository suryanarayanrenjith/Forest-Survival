import { lazy, Suspense, memo } from 'react';

const LazyForestScene = lazy(() => import('./MainMenuForestScene'));
// Eager-import so the WebGL scene is parsed during the initial bundle
// load rather than the first time it appears on screen.
void import('./MainMenuForestScene');

export type MenuBackdropVariant = 'main' | 'classic' | 'tutorial' | 'multiplayer';

interface MenuBackdropProps {
  variant?: MenuBackdropVariant;
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
 * menu change. Per-menu visual differentiation now lives in the
 * MenuShell overlay (gradient + glow tint) rather than the 3D scene.
 *
 * Wrapped in React.memo so re-renders of the App component don't
 * propagate to the scene useEffect (no rebuild on parent re-render).
 */
const MenuBackdrop = memo(function MenuBackdrop({ variant = 'main' }: MenuBackdropProps) {
  // Always pass 'main' to the scene so the heavy useEffect[variant]
  // path inside MainMenuForestScene never re-runs. The per-menu look
  // is provided by the MenuShell CSS overlay layered on top.
  void variant;
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-[#05080a]" />
      <Suspense fallback={null}>
        <LazyForestScene variant="main" />
      </Suspense>
    </div>
  );
});

export default MenuBackdrop;
