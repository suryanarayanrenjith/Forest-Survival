import React, { useEffect, useState } from 'react';
import { Lightbulb, AlertTriangle, AlertOctagon, Siren, GraduationCap, Play, Check, X, BookOpen, type LucideIcon } from 'lucide-react';
import { type TutorialStep } from '../utils/TutorialSystem';
import { detectIsTouch, useDeviceInfo } from '../hooks/useDeviceInfo';

interface TutorialOverlayProps {
  currentStep: TutorialStep | null;
  progress: number;
  /** 1-based position of this step, and how many there are ("Step 3 of 9"). */
  stepNumber: number;
  stepTotal: number;
  /** Escape hatch — offered in practice mode once the player has been stuck. */
  onSkip?: () => void;
  /** Called when the player chooses to practise a step — the host unblocks
   *  input + locks the pointer so the action can be performed. */
  onTry?: () => void;
  onEndTutorial?: () => void;
}

/** How long the player may struggle before the "Skip step" way out appears. */
const STUCK_MS = 12000;

// Short, friendly prompt for each action while the player practises.
const ACTION_HINTS_KEYBOARD: Record<string, string> = {
  look: 'Move your mouse to look around',
  move: 'Walk around with W A S D',
  sprint: 'Hold SHIFT while moving',
  shoot: 'Left-click to fire',
  kill: 'Take down the approaching robot',
  reload: 'Press R to reload',
  switch_weapon: 'Scroll the wheel, or press 1-8',
  use_ability: 'Press Q to use your ability',
  collect_powerup: 'Walk over the loot crate',
};

const ACTION_HINTS_TOUCH: Record<string, string> = {
  look: 'Swipe the right side to look around',
  move: 'Walk with the left joystick',
  sprint: 'Push the joystick to its outer ring',
  shoot: 'Tap the FIRE button',
  kill: 'Take down the approaching robot',
  reload: 'Tap the Reload button',
  switch_weapon: 'Tap the Weapon button, then pick one',
  use_ability: 'Tap the Ability button',
  collect_powerup: 'Walk over the loot crate',
};

const ACTION_HINTS = detectIsTouch() ? ACTION_HINTS_TOUCH : ACTION_HINTS_KEYBOARD;

// Flexbox alignment for each card anchor — NOT translate/transform based, so it
// can never collide with the `tutorialEnter` entrance animation (see note by
// the animated wrapper below). Padding on the anchor edge keeps the card clear
// of the screen edge and, for `bottom`, clear of the bottom-center loadout bar.
const POSITION_WRAPPER_CLASS: Record<'top' | 'bottom' | 'left' | 'right' | 'center', string> = {
  center: 'items-center justify-center p-4',
  top: 'items-start justify-center px-4 pt-6',
  bottom: 'items-end justify-center px-4 pb-[6.5rem]',
  left: 'items-center justify-start py-4 pl-4 sm:pl-6',
  right: 'items-center justify-end py-4 pr-4 sm:pr-6',
};

export const TutorialOverlay = React.memo(function TutorialOverlay({
  currentStep,
  progress,
  stepNumber,
  stepTotal,
  onSkip,
  onTry,
  onEndTutorial,
}: TutorialOverlayProps) {
  // Device capability, not viewport size — computed once (see useDeviceInfo),
  // so this never flip-flops mid-session the way a live media-query read would.
  const { isTouch: touch } = useDeviceInfo();

  // Every step is completed by performing an action: the player reads it, hits
  // "Try it", and the card minimises to a banner so they can actually do it.
  // The practise state carries the step it belongs to, so a step change resets
  // it DURING render — the banner must never carry a previous step's state into
  // the new card, not even for one frame. (React's "adjusting state when a prop
  // changes" pattern; the re-render happens before anything is committed.)
  const stepId = currentStep?.id ?? null;
  const [practice, setPractice] = useState<{ id: string | null; trying: boolean; stuck: boolean }>(
    { id: null, trying: false, stuck: false },
  );
  if (practice.id !== stepId) setPractice({ id: stepId, trying: false, stuck: false });

  const trying = practice.id === stepId && practice.trying;
  const stuck = practice.id === stepId && practice.stuck;

  // Arm the "Skip step" way out only once the player has genuinely been stuck
  // on THIS step for a while — a drill must never be able to soft-lock the run.
  useEffect(() => {
    if (!trying || !stepId) return;
    const timer = window.setTimeout(
      () => setPractice(p => (p.id === stepId ? { ...p, stuck: true } : p)),
      STUCK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [trying, stepId]);

  if (!currentStep) return null;

  // On touch (short landscape) always center the card — the side/top/bottom
  // anchors leave too little room and the card would overflow the screen.
  const position = touch ? 'center' : (currentStep.position || 'center');
  const wrapperClass = POSITION_WRAPPER_CLASS[position] ?? POSITION_WRAPPER_CLASS.center;

  const actionHint = ACTION_HINTS[currentStep.action] || 'Give it a try';
  const done = currentStep.completed;

  // ── PRACTISE MODE — minimised, non-blocking banner while the player tries ──
  if (trying) {
    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        {/* Positioning lives on this OUTER div and never animates, so its
            `-translate-x-1/2` centering transform is never touched. The
            `tutorialEnter` keyframes below set `transform` directly, and a
            running/finished CSS animation always wins over a static transform
            on the SAME element — putting the animation on a separate INNER
            wrapper (which needs no static transform of its own) avoids that
            collision entirely. This is what was pushing tutorial cards off
            the visible screen after their intro animation finished.

            ANCHOR: desktop parks the banner above the bottom-centre ability
            bar. On TOUCH that lane is occupied by the action-button cluster +
            fire button (bottom-right) and the joystick zone (bottom-left) —
            the banner sat on top of the very buttons the step asks the player
            to tap (Reload / Ability / Weapon), softlocking the tutorial. The
            touch banner lives in the top-centre safe lane instead (below the
            FPS pill, clear of the top-left HUD card and top-right weapon /
            pause cluster), offset past any notch. */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-max max-w-[92vw] ${touch ? 'top-14' : 'bottom-24'}`}
          style={touch ? { marginTop: 'env(safe-area-inset-top, 0px)' } : undefined}
        >
          <div
            className="pointer-events-auto"
            style={{ animation: 'tutorialEnter 0.3s cubic-bezier(0.16,1,0.3,1) forwards' }}
          >
            <div className={`flex items-center gap-2.5 rounded-2xl border bg-black/85 px-3.5 py-2.5 shadow-2xl transition-colors sm:gap-3 sm:px-5 sm:py-3 ${
              done ? 'border-emerald-400/60' : 'border-emerald-400/25'
            }`}>
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${done ? 'bg-emerald-500/25' : 'bg-emerald-500/12'}`}>
                {done ? <Check className="w-5 h-5 text-emerald-300" strokeWidth={2.5} /> : <Play className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                  {done ? 'Nice!' : `Try it · ${stepNumber}/${stepTotal}`}
                </div>
                <div className="text-[13px] font-semibold leading-snug text-white sm:text-sm">
                  {done ? 'Great — moving on…' : actionHint}
                </div>
              </div>
              {!done && (
                <span className="relative ml-0.5 flex h-2 w-2 flex-shrink-0">
                  <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
              )}
              {!done && stuck && onSkip && (
                <button
                  onClick={onSkip}
                  className="ml-1 flex-shrink-0 whitespace-nowrap rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
                >
                  Skip step
                </button>
              )}
            </div>
          </div>
        </div>
        <style>{tutorialCss}</style>
      </div>
    );
  }

  // ── READING MODE — the instruction card (blocking) ─────────────────────────
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" style={{ background: 'rgba(5,8,10,0.7)' }} />

      {/* Positioning wrapper — pure flexbox alignment (items-start/end/center
          plus justify-start/end/center), no transform anywhere on it, so it
          can't collide with the entrance animation below. It always spans
          the full viewport and clamps the card inside it, so the card can
          never render off-screen on any device or resolution, regardless of
          how tall its content is. On touch the edge padding is raised to clear
          notches / home indicators — written inline (rather than via `.m-safe`)
          so it ADDS to the anchor padding instead of replacing it. */}
      <div
        className={`relative flex h-full w-full ${wrapperClass}`}
        style={touch ? {
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        } : undefined}
      >
        <div
          className="w-full max-w-md"
          style={{ animation: 'tutorialEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
        >
          {/* flex column + capped height so the card never overflows the screen;
              the body scrolls while the header + action buttons stay pinned. */}
          <div className="flex max-h-[88dvh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f15] shadow-2xl">
            <div className="h-0.5 w-full flex-shrink-0 bg-emerald-400" />

            <div className="flex flex-shrink-0 items-center gap-3 px-4 pb-3 pt-3.5 sm:px-5 sm:pt-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/12">
                <GraduationCap className="w-5 h-5 text-emerald-400" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Tutorial · Step {stepNumber} of {stepTotal}
                </div>
                <h2 className="truncate text-[15px] font-bold text-white sm:text-base">{currentStep.title}</h2>
              </div>
              {/* Deep link to the wiki page that documents this exact mechanic in
                  full numeric detail — a quiet "learn more" for players who want
                  more than the short in-tutorial copy, without blocking anyone
                  who just wants to keep playing. */}
              {currentStep.wikiUrl && (
                <a
                  href={currentStep.wikiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Read more on the Game Wiki"
                  aria-label="Read more on the Game Wiki"
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 transition-colors hover:border-emerald-400/30 hover:bg-emerald-500/[0.08] hover:text-emerald-300"
                >
                  <BookOpen className="w-3.5 h-3.5" strokeWidth={2.1} />
                  <span className="hidden sm:inline">Wiki</span>
                </a>
              )}
            </div>

            {/* Scrollable body */}
            <div className="m-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3 sm:px-5">
              <p className="text-[13px] leading-relaxed text-gray-300 sm:text-sm">{currentStep.description}</p>

              {currentStep.instructions.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  {currentStep.instructions.map((instruction, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />
                      <p className="text-xs leading-relaxed text-gray-300">{instruction}</p>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="mb-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  <span>Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>

            {/* Pinned footer — always visible so the action buttons are reachable.
                Wraps rather than overflowing on very narrow screens. */}
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-white/[0.07] px-4 py-3 sm:px-5">
              {onEndTutorial && (
                <button
                  onClick={onEndTutorial}
                  className="m-tap whitespace-nowrap text-xs font-semibold text-gray-500 transition-colors hover:text-gray-300"
                >
                  End Tutorial
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => { setPractice({ id: stepId, trying: true, stuck: false }); onTry?.(); }}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-5 py-2 text-xs font-bold tracking-wide text-[#04130a] transition-all duration-150 hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}
              >
                <Play className="w-3.5 h-3.5" strokeWidth={2.5} /> Try it
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{tutorialCss}</style>
    </div>
  );
});

const tutorialCss = `
  @keyframes tutorialEnter {
    from { opacity: 0; transform: translateY(20px) scale(0.95); filter: blur(5px); }
    to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  }
`;

interface CoachTipProps {
  icon: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  duration?: number;
  onDismiss?: () => void;
}

export const CoachTip = React.memo(function CoachTip({
  title,
  message,
  priority,
  onDismiss,
}: CoachTipProps) {
  const priorityIcon: Record<string, LucideIcon> = {
    low: Lightbulb,
    medium: AlertTriangle,
    high: AlertOctagon,
    critical: Siren,
  };
  const PriorityIcon = priorityIcon[priority];
  const iconColor = {
    low: '#60a5fa',
    medium: '#fbbf24',
    high: '#fb923c',
    critical: '#f87171',
  }[priority];

  // Touch: bottom-56 lands on the action-button cluster (and the tip is
  // pointer-events-auto for its dismiss ✕, so it also ATE those taps). The
  // top-centre lane — below the FPS pill / practise banner — is the one strip
  // guaranteed free of controls on phones and tablets.
  const touch = detectIsTouch();

  return (
    <div className={`fixed ${touch ? 'top-28' : 'bottom-56'} left-1/2 z-40 w-max max-w-[92vw] -translate-x-1/2`}>
      <div
        className={`rounded-2xl border bg-black/85 p-4 shadow-2xl ${priority === 'critical' ? 'animate-pulse' : ''}`}
        style={{ borderColor: `${iconColor}88`, boxShadow: `0 0 30px ${iconColor}33` }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
            <PriorityIcon className="w-5 h-5" style={{ color: iconColor }} strokeWidth={2} />
          </div>
          <div className="flex-1">
            <h4 className="mb-0.5 text-sm font-bold text-white">{title}</h4>
            <p className="text-sm text-gray-200">{message}</p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="m-tap flex-shrink-0 text-gray-400 transition-colors hover:text-white"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

interface CoachTipsDisplayProps {
  tips: Array<{
    id: string;
    icon: string;
    title: string;
    message: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>;
  onDismissTip: (id: string) => void;
}

export const CoachTipsDisplay = React.memo(function CoachTipsDisplay({ tips, onDismissTip }: CoachTipsDisplayProps) {
  if (tips.length === 0) return null;

  // Show only the most recent tip
  const currentTip = tips[tips.length - 1];

  return (
    <CoachTip
      key={currentTip.id}
      icon={currentTip.icon}
      title={currentTip.title}
      message={currentTip.message}
      priority={currentTip.priority}
      onDismiss={() => onDismissTip(currentTip.id)}
    />
  );
});
