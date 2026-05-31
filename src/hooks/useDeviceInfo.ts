import { useEffect, useState } from 'react';

export interface DeviceInfo {
  /** True on touch phones/tablets that should get the on-screen controls. */
  isTouch: boolean;
  /** Live orientation flag (updates on rotate / resize). */
  isLandscape: boolean;
}

/**
 * Detects whether the on-screen touch controls should be active and tracks
 * orientation. Deliberately does NOT treat a small *desktop* window as mobile
 * (the old `innerWidth < 1024` check did, wrongly blocking small desktop
 * windows) — touch capability plus a mobile UA or a coarse pointer is what
 * gates the mobile experience.
 */
export function detectIsTouch(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const maxTouch = navigator.maxTouchPoints || 0;
  const hasTouch = 'ontouchstart' in window || maxTouch > 0;

  // iPadOS 13+ reports as a Mac; the >1 touch points disambiguates it.
  const isIpadOS = /Macintosh/.test(ua) && maxTouch > 1;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || isIpadOS;

  const isCoarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

  return hasTouch && (isMobileUA || isCoarse);
}

function getIsLandscape(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(orientation: landscape)').matches;
  }
  return window.innerWidth >= window.innerHeight;
}

export function useDeviceInfo(): DeviceInfo {
  // isTouch is a device capability — it won't change at runtime, so compute once.
  const [isTouch] = useState<boolean>(() => detectIsTouch());
  const [isLandscape, setIsLandscape] = useState<boolean>(() => getIsLandscape());

  useEffect(() => {
    const update = () => setIsLandscape(getIsLandscape());
    update();

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    // Some browsers fire orientation changes only on the matchMedia query.
    let mql: MediaQueryList | null = null;
    if (typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(orientation: landscape)');
      if (mql.addEventListener) mql.addEventListener('change', update);
      else if (mql.addListener) mql.addListener(update);
    }

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      if (mql) {
        if (mql.removeEventListener) mql.removeEventListener('change', update);
        else if (mql.removeListener) mql.removeListener(update);
      }
    };
  }, []);

  return { isTouch, isLandscape };
}

export default useDeviceInfo;
