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
