// Touch-input bridge for the mobile/tablet port.
//
// The whole game loop in App.tsx is one giant useEffect whose movement/look/aim
// state lives in *local* variables (`keys`, `euler`, `isAiming`, `mouseDown`).
// Rather than refactor that, this singleton carries the *continuous* touch input
// (analog movement, swipe look, ADS hold) and the loop reads it every frame.
//
// Discrete actions (reload, jump, dash, crouch, use-power, weapon select, pause)
// and firing are NOT routed through here — the on-screen buttons dispatch
// synthetic KeyboardEvent / MouseEvent so the existing desktop handlers run
// unchanged. See TouchControls.tsx.
//
// Everything the game loop reads is gated behind `enabled`, so when this is
// false (desktop) the loop's behaviour is byte-for-byte identical to before.

import { detectIsTouch } from '../hooks/useDeviceInfo';

class TouchControlsBridge {
  // ── TAMPER-RESISTANT "GENUINE TOUCH" GATE ───────────────────────────────
  // The mobile-only aim-assist + forgiving hitbox are a real advantage, so
  // they must be impossible to switch on from a desktop — including from the
  // console. Four independent conditions, none of which a desktop can forge:
  //
  //   1. `_deviceIsTouch` — the SAME detection the app uses, sampled ONCE at
  //      load into a private field. `enabled` is now an accessor that refuses
  //      to latch true unless this holds, so `touchControls.enabled = true`
  //      in a desktop console silently does nothing.
  //   2. `_hardwareTouch` — real touch digitiser present.
  //   3. `_sawTrustedTouch` — a browser-dispatched touch actually happened.
  //      A script cannot forge this: any dispatched event has isTrusted false.
  //   4. `!_sawTrustedMouse` — NO genuine mouse input this session. This is
  //      what closes the touchscreen-laptop / 2-in-1 hole: tapping once and
  //      then playing with a mouse permanently disarms the assist. It keys off
  //      PointerEvent.pointerType === 'mouse', which touch never produces
  //      (touch reports 'touch'/'pen'), so it can't misfire on a phone.
  //
  // All fields are private with no public setter, and the listeners
  // self-install once at load.
  private _enabled = false;
  private _deviceIsTouch = false;
  private _hardwareTouch = false;
  private _sawTrustedTouch = false;
  private _sawTrustedMouse = false;

  /** True only on detected touch phones/tablets. Set from useDeviceInfo. */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    // Turning OFF is always honoured. Turning ON only sticks on a device that
    // genuinely reads as a phone/tablet.
    this._enabled = value ? this._deviceIsTouch : false;
  }

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      this._hardwareTouch = (nav?.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
      this._deviceIsTouch = detectIsTouch();

      // Capture-phase + passive so the marks can't be suppressed by a
      // stopPropagation handler and never block scrolling.
      const markTouch = (e: Event) => { if (e.isTrusted) this._sawTrustedTouch = true; };
      window.addEventListener('touchstart', markTouch, { capture: true, passive: true });
      window.addEventListener('touchmove', markTouch, { capture: true, passive: true });

      // A genuine mouse disarms the assist for the rest of the session.
      const markMouse = (e: PointerEvent) => {
        if (this._sawTrustedMouse) return; // latched — nothing more to do
        if (e.isTrusted && e.pointerType === 'mouse') this._sawTrustedMouse = true;
      };
      window.addEventListener('pointerdown', markMouse, { capture: true, passive: true });
      window.addEventListener('pointermove', markMouse, { capture: true, passive: true });
    } catch {
      /* defensive: any detection failure simply leaves the assist disabled */
    }
  }

  /**
   * The hardened gate for the mobile-only aim-assist + forgiving hitbox.
   * Requires ALL FOUR conditions above. Desktop can never pass it — with or
   * without a touchscreen, and no matter what flags are poked in the console.
   */
  assistAllowed(): boolean {
    return this._enabled
      && this._deviceIsTouch
      && this._hardwareTouch
      && this._sawTrustedTouch
      && !this._sawTrustedMouse;
  }

  // ── Analog movement (left joystick) ──
  // Range -1..1. x = strafe (+right), y = forward (+forward).
  moveX = 0;
  moveY = 0;
  /** True when the joystick is pushed to its outer ring → sprint. */
  sprinting = false;

  // NOTE: there is no ADS field anymore — touch has no aim button. Firing
  // auto-engages the sights (see the mobile ADS block in App.tsx), so aiming
  // state is derived from `mouseDown` there rather than carried here.

  // ── Look (right-half swipe) ──
  // Deltas accumulate between frames and are consumed (reset) when the loop reads
  // them, mirroring how mouse `movementX/Y` is consumed in onMouseMove.
  private lookX = 0;
  private lookY = 0;

  addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }

  /** Read + reset the accumulated horizontal look delta. */
  consumeLookX(): number {
    const v = this.lookX;
    this.lookX = 0;
    return v;
  }

  /** Read + reset the accumulated vertical look delta. */
  consumeLookY(): number {
    const v = this.lookY;
    this.lookY = 0;
    return v;
  }

  /** True when the joystick is meaningfully displaced (dead-zone filtered). */
  get moving(): boolean {
    return Math.hypot(this.moveX, this.moveY) > 0.12;
  }

  /** Wipe transient input — call when leaving gameplay so nothing is "stuck". */
  reset(): void {
    this.moveX = 0;
    this.moveY = 0;
    this.sprinting = false;
    this.lookX = 0;
    this.lookY = 0;
  }
}

export const touchControls = new TouchControlsBridge();
export default touchControls;
