// Haptic feedback for the touch/mobile port.
//
// A tiny wrapper over the Vibration API. It NO-OPS completely unless:
//   • the device exposes `navigator.vibrate` (Android Chrome/Firefox do;
//     desktop and iOS Safari do not — so this is silently inert there), and
//   • the touch control bridge is active (so a desktop with a touchscreen
//     that happens to expose vibrate doesn't buzz during mouse play), and
//   • the player hasn't disabled haptics in settings.
//
// The enabled flag is cached + kept fresh via the settings subscription so
// the hot paths (firing, hits) never parse localStorage. Patterns are kept
// short — long buzzes feel mushy and drain battery on full-auto fire.
import { touchControls } from './touchControls';
import { gameSettingsManager } from './GameSettingsManager';

const canVibrate =
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export type HapticKind =
  | 'tap'       // UI button press
  | 'fire'      // a shot left the barrel
  | 'hit'       // bullet connected with an enemy
  | 'headshot'  // critical / headshot connect
  | 'reload'    // reload started
  | 'dash'      // dash / ability used
  | 'hurt'      // player took damage
  | 'kill'      // enemy killed
  | 'heavy';    // explosion / big impact

// Durations in ms (single number) or on/off pattern arrays.
const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  fire: 11,
  hit: 9,
  headshot: [0, 13, 16, 24],
  reload: [0, 9, 45, 9],
  dash: 17,
  hurt: [0, 24, 32, 24],
  kill: [0, 11, 14, 20],
  heavy: 30,
};

// Cached so firing (up to ~18×/s) never touches localStorage.
let hapticsEnabled = (() => {
  try { return gameSettingsManager.getSetting('haptics'); } catch { return true; }
})();
gameSettingsManager.subscribe((s) => { hapticsEnabled = s.haptics; });

// Full-auto weapons fire faster than a buzz can resolve — rate-limit the
// per-shot pulse so the phone doesn't become a continuous vibrator.
let lastFireBuzz = 0;

export function haptic(kind: HapticKind): void {
  if (!canVibrate || !touchControls.enabled || !hapticsEnabled) return;

  if (kind === 'fire') {
    const now = Date.now();
    if (now - lastFireBuzz < 55) return;
    lastFireBuzz = now;
  }

  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* some locked-down browsers throw on vibrate — ignore */
  }
}

export default haptic;
