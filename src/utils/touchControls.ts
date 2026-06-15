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

class TouchControlsBridge {
  /** True only on detected touch phones/tablets. Set from useDeviceInfo. */
  enabled = false;

  // ── TAMPER-RESISTANT "GENUINE TOUCH" GATE ───────────────────────────────
  // `enabled` is a plain flag derived from device detection — a determined
  // desktop user could flip it in the console to try to unlock the mobile
  // aim-assist + forgiving hitbox (an unfair advantage). So those features do
  // NOT trust `enabled` alone: they require `assistAllowed()`, which also
  // demands real touch HARDWARE *and* a browser-TRUSTED touch event this
  // session. A mouse cannot synthesise a trusted touch (`isTrusted === false`
  // on any dispatched/forged event), so a desktop player can never satisfy
  // this no matter what flags they poke. These fields are private so there's
  // no public setter to abuse, and the listeners self-install once at load.
  private _hardwareTouch = false;
  private _sawTrustedTouch = false;

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      this._hardwareTouch =
        (nav?.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
      // Capture-phase + passive so the mark can't be suppressed by a
      // stopPropagation handler and never blocks scrolling. Only a genuine,
      // browser-dispatched touch (isTrusted) flips the latch.
      const mark = (e: Event) => { if (e.isTrusted) this._sawTrustedTouch = true; };
      window.addEventListener('touchstart', mark, { capture: true, passive: true });
      window.addEventListener('touchmove', mark, { capture: true, passive: true });
    } catch {
      /* defensive: any detection failure simply leaves the assist disabled */
    }
  }

  /**
   * The hardened gate for the mobile-only aim-assist + forgiving hitbox.
   * Requires ALL of: the device flagged as touch, real touch hardware, and a
   * genuine trusted touch having occurred. Desktop (mouse) can never pass it,
   * even with `enabled` forced true — so the assist cannot be unlocked there.
   */
  assistAllowed(): boolean {
    return this.enabled && this._hardwareTouch && this._sawTrustedTouch;
  }

  // ── Analog movement (left joystick) ──
  // Range -1..1. x = strafe (+right), y = forward (+forward).
  moveX = 0;
  moveY = 0;
  /** True when the joystick is pushed to its outer ring → sprint. */
  sprinting = false;

  // ── Aim down sights (ADS button held) ──
  aiming = false;

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
    this.aiming = false;
    this.lookX = 0;
    this.lookY = 0;
  }
}

export const touchControls = new TouchControlsBridge();
export default touchControls;
