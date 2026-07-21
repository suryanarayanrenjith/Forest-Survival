/**
 * GUIDED TUTORIAL
 *
 * A short, strictly ordered drill that teaches the game ONE control at a time.
 * Every step is interactive — the player reads a card, hits "Try it", performs
 * the action, and the run moves on the instant it lands. There are no timed
 * "read this" filler steps and no optional trivia: if a step is here, the
 * player has to do it to leave it.
 *
 * ── THE CAPABILITY LADDER ────────────────────────────────────────────────
 * The reason the order matters is that the tutorial physically LOCKS what it
 * hasn't taught yet (see `grants` + `isGranted`, enforced in App.tsx):
 *
 *   1. Look     — mouse/swipe only. Walking, sprinting, weapons, abilities off.
 *   2. Move     — grants `move` (walk / jump / crouch). Sprint still off.
 *   3. Sprint   — grants `sprint` AND `combat`: from here the full kit is live
 *                 except the abilities.
 *   4-7. Fire / kill / reload / switch weapon — practice with that kit.
 *   8. Ability  — grants `ability` (signature move + held power-up).
 *   9. Loot     — collect a power-up, then the run is done.
 *
 * A lock is never a dead key: App.tsx answers a locked press with a "not yet"
 * pill, so the tutorial reads as deliberate rather than broken.
 */

import { detectIsTouch } from '../hooks/useDeviceInfo';

// Public wiki, kept in sync with the "Star on GitHub" / Credits links (same
// repo: github.com/suryanarayanrenjith/Forest-Survival). Each step below
// deep-links to the wiki page (and section anchor, where one exists) that
// covers it in full numeric detail, so a curious player can go deeper than
// the short in-tutorial copy without leaving a reference behind.
export const WIKI_BASE = 'https://github.com/suryanarayanrenjith/Forest-Survival/wiki';

/** Player capabilities the guided run hands over, one step at a time. */
export type TutorialCapability = 'move' | 'sprint' | 'combat' | 'ability';

/** How long a finished step holds its "Nice!" confirmation before handing over. */
const STEP_HANDOVER_MS = 600;

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  /** Action that completes this step (matches App.tsx `recordAction` calls). */
  action: string;
  /** How many times the action must be recorded. */
  count: number;
  /** Capabilities unlocked the moment this step becomes current. */
  grants?: TutorialCapability[];
  /** Where the instruction card anchors on screen (desktop only). */
  position?: 'top' | 'bottom' | 'center' | 'left' | 'right';
  /** Deep link to the wiki page/section that documents this step in full. */
  wikiUrl?: string;
  completed: boolean;
  skipped: boolean;
}

export class TutorialSystem {
  private steps: TutorialStep[] = [];
  private index = 0;
  private active = false;
  private enabled = true;
  /** Per-step action tally. Cleared on every transition (see `advance`). */
  private counts = new Map<string, number>();
  /** performance.now() at which a completed step hands over; 0 = idle. */
  private handoverAt = 0;

  constructor() {
    this.buildSteps();
  }

  private buildSteps(): void {
    // Touch devices use the on-screen controls, so the instruction copy swaps
    // from keyboard/mouse prompts to joystick/button prompts.
    const touch = detectIsTouch();

    this.steps = [
      {
        id: 'look',
        title: 'Look Around',
        description: 'Get your bearings. This is a safe training ground — nothing here can hurt you.',
        instructions: touch ? [
          'Swipe the right half of the screen to look around',
          'Everything else is locked for now — you learn one control at a time',
          'Sweep the camera across the forest to continue',
        ] : [
          'Move your mouse to look around',
          'Everything else is locked for now — you learn one control at a time',
          'Sweep the camera across the forest to continue',
        ],
        action: 'look',
        count: 24,
        position: 'top',
        wikiUrl: `${WIKI_BASE}/Controls`,
        completed: false,
        skipped: false,
      },
      {
        id: 'move',
        title: 'Move Around',
        description: 'Now walk the ground you just scouted.',
        instructions: touch ? [
          'Drag the left joystick to walk in any direction',
          'Tap Jump and Crouch on the right',
          'Sprinting stays locked until the next step',
          'Walk anywhere to continue',
        ] : [
          'W A S D — or the arrow keys — to walk',
          'SPACE to jump, C to crouch',
          'Sprinting stays locked until the next step',
          'Walk anywhere to continue',
        ],
        action: 'move',
        count: 30,
        grants: ['move'],
        position: 'bottom',
        wikiUrl: `${WIKI_BASE}/Controls`,
        completed: false,
        skipped: false,
      },
      {
        id: 'sprint',
        title: 'Sprint',
        description: 'Open the throttle — and pick up the rest of your kit on the way.',
        instructions: touch ? [
          'Push the joystick to its outer ring to sprint',
          'Training stamina is unlimited — run as long as you like',
          'This also brings your weapons online; abilities come later',
          'Sprint for a moment to continue',
        ] : [
          'Hold SHIFT while moving to sprint',
          'Training stamina is unlimited — run as long as you like',
          'This also brings your weapons online; abilities come later',
          'Sprint for a moment to continue',
        ],
        action: 'sprint',
        count: 24,
        grants: ['sprint', 'combat'],
        position: 'bottom',
        wikiUrl: `${WIKI_BASE}/Controls`,
        completed: false,
        skipped: false,
      },
      {
        id: 'shoot',
        title: 'Open Fire',
        description: 'Your weapon is live. Every gun is unlocked and fully mastered in training.',
        instructions: touch ? [
          'Tap the FIRE button to shoot',
          'FIRE also raises the sights and helps you track a target',
          'Fire a single shot to continue',
        ] : [
          'Left-click to fire',
          'The crosshair blooms as you move and fire — stand still for tighter shots',
          'Fire a single shot to continue',
        ],
        action: 'shoot',
        count: 1,
        position: 'center',
        wikiUrl: `${WIKI_BASE}/Controls#aim-and-firing`,
        completed: false,
        skipped: false,
      },
      {
        id: 'kill',
        title: 'Eliminate a Threat',
        description: 'A robot is inbound. Put it down.',
        instructions: touch ? [
          'Aim for the head — headshots hit far harder',
          'Tap Melee for a point-blank bash (light weapons only)',
          'New enemy types reveal themselves as your kill count climbs',
          'Destroy one enemy to continue',
        ] : [
          'Aim for the head — headshots hit far harder',
          'Press V for a point-blank melee bash (light weapons only)',
          'New enemy types reveal themselves as your kill count climbs',
          'Destroy one enemy to continue',
        ],
        action: 'kill',
        count: 1,
        position: 'top',
        wikiUrl: `${WIKI_BASE}/Enemies`,
        completed: false,
        skipped: false,
      },
      {
        id: 'reload',
        title: 'Reload',
        description: 'Never meet a robot on an empty magazine.',
        instructions: touch ? [
          'Tap Reload to swap in a fresh magazine',
          'Tap it AGAIN as the sweep crosses the green arc — a Perfect reload finishes instantly',
          'Reload once to continue',
        ] : [
          'Press R to swap in a fresh magazine',
          'Press R AGAIN as the sweep crosses the green arc — a Perfect reload finishes instantly',
          'Reload once to continue',
        ],
        action: 'reload',
        count: 1,
        position: 'right',
        wikiUrl: `${WIKI_BASE}/Weapons#recoil-and-reloads`,
        completed: false,
        skipped: false,
      },
      {
        id: 'weapon',
        title: 'Switch Weapons',
        description: 'Different guns own different ranges — carry the right one.',
        instructions: touch ? [
          'Tap the Weapon button, then pick a weapon',
          'Every weapon is already unlocked here, so try them all',
          'Switch to any other weapon to continue',
        ] : [
          'Scroll the mouse wheel — or press 1-8 — to change weapon',
          'Every weapon is already unlocked here, so try them all',
          'Switch to any other weapon to continue',
        ],
        action: 'switch_weapon',
        count: 1,
        position: 'right',
        wikiUrl: `${WIKI_BASE}/Weapons`,
        completed: false,
        skipped: false,
      },
      {
        id: 'ability',
        title: 'Signature Ability',
        description: 'Your character\'s own move — unlocked as of right now.',
        instructions: touch ? [
          'Tap the Ability button to cast it',
          'Every character has a different one: a charge, a heal, a shield or an area blast',
          'It runs on a cooldown, so pick your moment',
          'Use your ability to continue',
        ] : [
          'Press Q to cast your ability',
          'Every character has a different one: a charge, a heal, a shield or an area blast',
          'It runs on a cooldown, so pick your moment',
          'Use your ability to continue',
        ],
        action: 'use_ability',
        count: 1,
        grants: ['ability'],
        position: 'bottom',
        wikiUrl: `${WIKI_BASE}/Characters#active-abilities`,
        completed: false,
        skipped: false,
      },
      {
        id: 'powerup',
        title: 'Loot & Power-ups',
        description: 'Destroyed robots leave their gear behind.',
        instructions: touch ? [
          'A crate has dropped nearby — walk over it to pick it up',
          'You can carry only ONE power-up at a time',
          'Tap the Power button to spend it whenever you need it',
          'Collect the crate to finish',
        ] : [
          'A crate has dropped nearby — walk over it to pick it up',
          'You can carry only ONE power-up at a time',
          'Press E to spend it whenever you need it',
          'Collect the crate to finish',
        ],
        action: 'collect_powerup',
        count: 1,
        position: 'center',
        wikiUrl: `${WIKI_BASE}/Equipment#held-loot-powers`,
        completed: false,
        skipped: false,
      },
    ];
  }

  // ── LIFECYCLE ────────────────────────────────────────────────────────────

  public start(): void {
    if (!this.enabled) return;
    this.active = true;
    this.index = 0;
    this.handoverAt = 0;
    this.counts.clear();
    for (const step of this.steps) {
      step.completed = false;
      step.skipped = false;
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.active = false;
  }

  public isActive(): boolean {
    return this.active;
  }

  public getCurrentStep(): TutorialStep | null {
    if (!this.active) return null;
    return this.steps[this.index] ?? null;
  }

  /** 1-based position of the current step, for the "Step 3 of 9" readout. */
  public getStepNumber(): number {
    return Math.min(this.index + 1, this.steps.length);
  }

  public getStepCount(): number {
    return this.steps.length;
  }

  /** 0-100. Counts skipped steps as done — the run really has moved past them. */
  public getProgress(): number {
    if (this.steps.length === 0) return 100;
    let done = 0;
    for (const step of this.steps) if (step.completed || step.skipped) done++;
    return (done / this.steps.length) * 100;
  }

  /**
   * Whether a capability has been handed over yet. Every step up to AND
   * INCLUDING the current one counts, so a step's own control is usable the
   * moment its card appears — that's what the player is about to practise.
   * Once the run is over (finished, skipped out, or disabled) nothing is held
   * back. Allocation-free: this is polled from the render loop.
   */
  public isGranted(capability: TutorialCapability): boolean {
    if (!this.active) return true;
    const last = Math.min(this.index, this.steps.length - 1);
    for (let i = 0; i <= last; i++) {
      const grants = this.steps[i].grants;
      if (grants && grants.indexOf(capability) !== -1) return true;
    }
    return false;
  }

  // ── PROGRESSION ──────────────────────────────────────────────────────────

  /**
   * Record a player action. Only the CURRENT step's own action can advance it —
   * an unrelated action never satisfies a step waiting on something else, and
   * the tally is wiped on every transition so a stale count can't make the next
   * step look pre-satisfied.
   */
  public recordAction(action: string, count: number = 1): void {
    if (!this.active || this.handoverAt !== 0) return;

    const step = this.getCurrentStep();
    if (!step || step.completed || action !== step.action) return;

    const total = (this.counts.get(action) ?? 0) + count;
    this.counts.set(action, total);
    if (total < step.count) return;

    // Satisfied — hold the "Nice!" beat, then hand over (see `tick`).
    step.completed = true;
    this.handoverAt = TutorialSystem.now() + STEP_HANDOVER_MS;
  }

  /**
   * Drive the post-completion handover. Called once per frame from the render
   * loop, so no timer can outlive the game session that started it.
   */
  public tick(): void {
    if (!this.active || this.handoverAt === 0) return;
    if (TutorialSystem.now() < this.handoverAt) return;
    this.handoverAt = 0;
    this.advance();
  }

  /**
   * Escape hatch for a player who cannot complete a step (the overlay offers
   * it once they've been stuck a while). The step still hands over whatever it
   * grants — skipping "Sprint" must never leave sprinting locked forever.
   */
  public skipCurrentStep(): void {
    const step = this.getCurrentStep();
    if (!step) return;
    step.skipped = true;
    this.handoverAt = 0;
    this.advance();
  }

  private advance(): void {
    this.counts.clear();
    if (this.index < this.steps.length - 1) {
      this.index++;
    } else {
      this.active = false; // run complete — App.tsx shows the finale card
    }
  }

  private static now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
