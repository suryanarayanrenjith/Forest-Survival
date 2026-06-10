import { useEffect, useRef, useState, type ReactNode } from 'react';

/** How long the outgoing screen's exit animation runs before the swap. */
const EXIT_MS = 190;

interface MenuTransitionProps {
  /** Identity of the current menu screen (main / classic / tutorial / …). */
  menuKey: string;
  /**
   * Navigation depth of the current screen (main = 0, mode menus = 1,
   * modifier picker = 2 …). Moving to a deeper screen plays the FORWARD
   * transition (enter from the right, travelling right → left); moving
   * shallower (Back) plays the mirrored left → right transition.
   */
  depth?: number;
  children: ReactNode;
}

/**
 * Cinematic, direction-aware cross-screen menu transition.
 *
 * When `menuKey` changes, the outgoing screen is held for a brief exit
 * animation (fade + directional drift + soft blur), then the incoming
 * screen mounts sliding in from the opposite side. Everything is pure CSS
 * keyframes (see `menu-screen-*` in index.css) — no per-frame JS, no
 * animation library — so it runs on the compositor and never competes
 * with the WebGL backdrop for main-thread time.
 *
 * While the same menu stays active its children render straight through,
 * so live UI inside a menu (lobby player polls, availability checks)
 * updates normally. Only during the short exit window is a snapshot of
 * the outgoing screen shown (with pointer events disabled so a mid-exit
 * click can't re-trigger navigation).
 *
 * NOTE: this wrapper animates ONLY the screen content. The dark
 * readability gradients + per-variant tint live at App level OUTSIDE this
 * component, so the backdrop stays rock-solid while screens slide.
 */
export default function MenuTransition({ menuKey, depth = 0, children }: MenuTransitionProps) {
  const [displayed, setDisplayed] = useState({ key: menuKey, depth });
  const exitSnapshotRef = useRef<ReactNode>(children);
  const directionRef = useRef<'fwd' | 'back'>('fwd');

  // While the displayed menu is the live one, keep the snapshot fresh so an
  // exit always starts from the menu's latest rendered state.
  if (menuKey === displayed.key) {
    exitSnapshotRef.current = children;
  } else {
    // Transition detected — lock the direction from the depth delta. This
    // runs during render (idempotent) so the very first exit frame already
    // animates the correct way.
    directionRef.current = depth >= displayed.depth ? 'fwd' : 'back';
  }

  useEffect(() => {
    if (menuKey === displayed.key) return;
    const timer = window.setTimeout(() => setDisplayed({ key: menuKey, depth }), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [menuKey, depth, displayed.key]);

  const exiting = menuKey !== displayed.key;
  const dir = directionRef.current;

  return (
    <div
      key={displayed.key}
      className={exiting ? `menu-screen menu-screen-exit-${dir}` : `menu-screen menu-screen-enter-${dir}`}
    >
      {exiting ? exitSnapshotRef.current : children}
    </div>
  );
}
