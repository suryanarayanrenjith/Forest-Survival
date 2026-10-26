import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';

/**
 * Motion (motion.dev) for event-driven UI — toasts, banners, the throwable
 * wheel: spring physics, real EXIT animations via AnimatePresence, and
 * transform/opacity-only motion the compositor runs off the main thread.
 *
 * `LazyMotion` + the `m` component keep the bundle to the DOM-animation
 * feature set; `strict` makes a stray full `motion.*` component throw in dev
 * instead of silently pulling the whole library in. `reducedMotion="user"`
 * honours the OS setting (transforms are skipped, fades kept).
 *
 * Not for the per-frame HUD (ammo, health, radar): those re-render from the
 * game loop and stay plain DOM/CSS.
 */
const MotionRoot = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">{children}</MotionConfig>
  </LazyMotion>
);

export default MotionRoot;
