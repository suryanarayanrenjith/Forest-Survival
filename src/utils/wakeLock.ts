// Screen Wake Lock for the mobile/tablet port.
//
// Phones dim and then sleep on an idle timer. Holding a joystick and the fire
// button doesn't reliably count as "activity" on every OS, so the screen can
// dim in the middle of a firefight — the single most obviously-ported-feeling
// thing a mobile game can do. This keeps the display awake for as long as
// gameplay is on screen.
//
// The browser ALWAYS drops the lock when the tab is hidden, so the sentinel is
// re-acquired on return to the foreground (see refreshWakeLock). Unsupported
// browsers and desktop no-op entirely.

// Minimal structural type — `WakeLockSentinel` isn't in every TS lib target.
type Sentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
};
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };

let sentinel: Sentinel | null = null;
/** True while gameplay wants the screen held awake. */
let wanted = false;

function getApi(): WakeLockApi | null {
  if (typeof navigator === 'undefined') return null;
  const wl = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
  return wl ?? null;
}

/** Hold the screen awake. Safe to call repeatedly. */
export async function acquireWakeLock(): Promise<void> {
  wanted = true;
  const api = getApi();
  if (!api || sentinel) return;
  try {
    const next = await api.request('screen');
    // A release can land while this promise was in flight (fast tab switch);
    // if gameplay no longer wants it, drop it straight away.
    if (!wanted) { void next.release().catch(() => {}); return; }
    sentinel = next;
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    // Denied (no user gesture yet / low battery / unsupported) — harmless.
    sentinel = null;
  }
}

/** Let the screen sleep again — call when leaving gameplay. */
export function releaseWakeLock(): void {
  wanted = false;
  const current = sentinel;
  sentinel = null;
  if (current) {
    try { void current.release().catch(() => {}); } catch { /* already gone */ }
  }
}

/** Re-acquire after the browser auto-released it on tab-hide. */
export function refreshWakeLock(): void {
  if (wanted && !sentinel && typeof document !== 'undefined' && !document.hidden) {
    void acquireWakeLock();
  }
}
