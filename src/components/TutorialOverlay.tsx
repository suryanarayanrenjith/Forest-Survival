import React, { useEffect, useRef, useState } from 'react';
import { Lightbulb, AlertTriangle, AlertOctagon, Siren, GraduationCap, Play, Check, X, type LucideIcon } from 'lucide-react';
import { type TutorialStep } from '../utils/TutorialSystem';
import { detectIsTouch } from '../hooks/useDeviceInfo';

interface TutorialOverlayProps {
  currentStep: TutorialStep | null;
  progress: number;
  onSkip?: () => void;
  onNext?: () => void;
  /** Called when the player chooses to practise an interactive step — the host
   *  unblocks input + locks the pointer so the action can be performed. */
  onTry?: () => void;
  onEndTutorial?: () => void;
}

// Short, friendly prompt for each interactive action while the player practises.
const ACTION_HINTS_KEYBOARD: Record<string, string> = {
  move: 'Walk around with W A S D',
  look: 'Move your mouse to look around',
  shoot: 'Left-click to fire your weapon',
  kill: 'Take down the approaching enemy',
  reload: 'Press R to reload',
  switch_weapon: 'Scroll the wheel or press 1–7',
  use_ability: 'Press Q to Dash',
  collect_powerup: 'Walk over the loot crate',
};

const ACTION_HINTS_TOUCH: Record<string, string> = {
  move: 'Walk around with the left joystick',
  look: 'Swipe the right side to look around',
  shoot: 'Hold the FIRE button',
  kill: 'Take down the approaching enemy',
  reload: 'Tap the Reload button',
  switch_weapon: 'Tap the Weapon button, then pick one',
  use_ability: 'Tap the Dash button',
  collect_powerup: 'Walk over the loot crate',
};

const ACTION_HINTS = detectIsTouch() ? ACTION_HINTS_TOUCH : ACTION_HINTS_KEYBOARD;

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  currentStep,
  progress,
  onSkip,
  onNext,
  onTry,
  onEndTutorial,
}) => {
  // An interactive step is one completed by performing an action — the player
  // reads it, hits "Try it", and the card minimises so they can actually do it.
  const interactive = currentStep?.completionCondition?.type === 'action';
  const [trying, setTrying] = useState(false);

  // Reset the practise state whenever the step changes (incl. auto-advance).
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentStep && currentStep.id !== lastIdRef.current) {
      lastIdRef.current = currentStep.id;
      setTrying(false);
    }
  }, [currentStep]);

  if (!currentStep) return null;

  // On touch (short landscape) always center the card — the side/top/bottom
  // anchors leave too little room and the card would overflow the screen.
  const touch = detectIsTouch();
  const position = touch ? 'center' : (currentStep.position || 'center');
  const getPositionStyle = (pos: string): React.CSSProperties => {
    switch (pos) {
      case 'top': return { top: '1.5rem', left: '50%', transform: 'translateX(-50%)' };
      case 'bottom': return { bottom: '6.5rem', left: '50%', transform: 'translateX(-50%)' };
      case 'left': return { top: '50%', left: '1.5rem', transform: 'translateY(-50%)' };
      case 'right': return { top: '50%', right: '1.5rem', transform: 'translateY(-50%)' };
      case 'center':
      default: return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
  };

  const actionHint = (currentStep.completionCondition?.action && ACTION_HINTS[currentStep.completionCondition.action]) || 'Give it a try';
  const done = currentStep.completed;

  // ── PRACTISE MODE — minimised, non-blocking banner while the player tries ──
  if (interactive && trying) {
    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        <div
          className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-auto"
          style={{ animation: 'tutorialEnter 0.3s cubic-bezier(0.16,1,0.3,1) forwards' }}
        >
          <div className={`flex items-center gap-3 rounded-2xl border bg-black/75 backdrop-blur-md px-5 py-3 shadow-2xl transition-colors ${
            done ? 'border-emerald-400/60' : 'border-emerald-400/25'
          }`}>
            <div className={`flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${done ? 'bg-emerald-500/25' : 'bg-emerald-500/12'}`}>
              {done ? <Check className="w-5 h-5 text-emerald-300" strokeWidth={2.5} /> : <Play className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-[0.2em] text-emerald-300/80 uppercase">
                {done ? 'Nice!' : 'Try it'}
              </div>
              <div className="text-sm font-semibold text-white whitespace-nowrap">
                {done ? 'Great — moving on…' : actionHint}
              </div>
            </div>
            {!done && (
              <span className="ml-1 flex h-2 w-2 flex-shrink-0">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
            )}
            {!done && !currentStep.required && onSkip && (
              <button
                onClick={onSkip}
                className="ml-2 text-[11px] font-semibold text-gray-400 transition-colors hover:text-gray-200"
              >
                Skip
              </button>
            )}
          </div>
        </div>
        <style>{tutorialCss}</style>
      </div>
    );
  }

  // ── READING MODE — the instruction card (blocking) ─────────────────────────
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" style={{ background: 'rgba(5,8,10,0.6)', backdropFilter: 'blur(2px)' }} />

      <div
        className="absolute pointer-events-auto w-[90vw] max-w-md"
        style={{ ...getPositionStyle(position), animation: 'tutorialEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* flex column + capped height so the card never overflows the screen;
            the body scrolls while the header + action buttons stay pinned. */}
        <div className="flex max-h-[88dvh] flex-col rounded-2xl border border-white/10 bg-[#0b0f15] overflow-hidden shadow-2xl">
          <div className="h-0.5 w-full bg-emerald-400 flex-shrink-0" />

          <div className="flex items-center gap-3 px-5 pt-4 pb-3 flex-shrink-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-emerald-400" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 uppercase">Tutorial</div>
              <h2 className="text-base font-bold text-white truncate">{currentStep.title}</h2>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
            <p className="text-sm text-gray-300 leading-relaxed">{currentStep.description}</p>

            {currentStep.instructions.length > 0 && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-1.5">
                {currentStep.instructions.map((instruction, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-1.5 w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0" />
                    <p className="text-xs text-gray-300 leading-relaxed">{instruction}</p>
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="flex justify-between text-[10px] font-semibold tracking-[0.12em] text-gray-500 uppercase mb-1.5">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          {/* Pinned footer — always visible so the action buttons are reachable */}
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-white/[0.07] px-5 py-3">
            {onEndTutorial && (
              <button onClick={onEndTutorial} className="text-xs font-semibold text-gray-500 transition-colors hover:text-gray-300">
                End Tutorial
              </button>
            )}
            <div className="flex-1" />
            {!currentStep.required && onSkip && (
              <button
                onClick={onSkip}
                className="rounded-lg px-3.5 py-2 text-xs font-semibold text-gray-300 border border-white/10 transition-colors hover:bg-white/[0.06]"
              >
                Skip
              </button>
            )}
            {interactive ? (
              <button
                onClick={() => { setTrying(true); onTry?.(); }}
                className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-bold tracking-wide text-[#04130a] transition-all duration-150 hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}
              >
                <Play className="w-3.5 h-3.5" strokeWidth={2.5} /> Try it
              </button>
            ) : onNext && (
              <button
                onClick={onNext}
                className="rounded-lg px-5 py-2 text-xs font-bold tracking-wide text-[#04130a] transition-all duration-150 hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}
              >
                Got it
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{tutorialCss}</style>
    </div>
  );
};

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

export const CoachTip: React.FC<CoachTipProps> = ({
  title,
  message,
  priority,
  onDismiss
}) => {
  const priorityStyles = {
    low: 'border-blue-400 bg-blue-900/80',
    medium: 'border-yellow-400 bg-yellow-900/80',
    high: 'border-orange-400 bg-orange-900/80',
    critical: 'border-red-400 bg-red-900/80 animate-pulse'
  };

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

  return (
    <div className={`fixed bottom-56 left-1/2 -translate-x-1/2 z-40 animate-slide-up`}>
      <div className={`${priorityStyles[priority]} border-2 rounded-lg p-4 shadow-2xl backdrop-blur-sm max-w-md`}>
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 flex-shrink-0">
            <PriorityIcon className="w-5 h-5" style={{ color: iconColor }} strokeWidth={2} />
          </div>
          <div className="flex-1">
            <h4 className="text-white font-bold text-sm mb-0.5">{title}</h4>
            <p className="text-gray-200 text-sm">{message}</p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

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

export const CoachTipsDisplay: React.FC<CoachTipsDisplayProps> = ({ tips, onDismissTip }) => {
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
};
