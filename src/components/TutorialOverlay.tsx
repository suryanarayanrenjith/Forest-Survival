import React from 'react';
import { Lightbulb, AlertTriangle, AlertOctagon, Siren, GraduationCap, X, type LucideIcon } from 'lucide-react';
import { type TutorialStep } from '../utils/TutorialSystem';

interface TutorialOverlayProps {
  currentStep: TutorialStep | null;
  progress: number;
  onSkip?: () => void;
  onNext?: () => void;
  onEndTutorial?: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  currentStep,
  progress,
  onSkip,
  onNext,
  onEndTutorial
}) => {
  if (!currentStep) return null;

  // All positions now use safe inset values that keep the card fully on-screen
  // Center = dead center, top/bottom = centered horizontally near edge,
  // left/right = centered vertically near the left/right side
  const getPositionStyle = (pos: string): React.CSSProperties => {
    switch (pos) {
      case 'top':
        return { top: '1.5rem', left: '50%', transform: 'translateX(-50%)' };
      case 'bottom':
        return { bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)' };
      case 'left':
        return { top: '50%', left: '1.5rem', transform: 'translateY(-50%)' };
      case 'right':
        return { top: '50%', right: '1.5rem', transform: 'translateY(-50%)' };
      case 'center':
      default:
        return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
  };

  const position = currentStep.position || 'center';

  return (
    <div className="fixed inset-0 z-50">
      {/* Dimmed backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(5,8,10,0.6)', backdropFilter: 'blur(2px)' }} />

      {/* Tutorial card */}
      <div
        className="absolute pointer-events-auto w-[90vw] max-w-md"
        style={{
          ...getPositionStyle(position),
          animation: 'tutorialEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div className="rounded-2xl border border-white/10 bg-[#0b0f15] overflow-hidden shadow-2xl">
          {/* Accent edge */}
          <div className="h-0.5 w-full bg-emerald-400" />

          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-emerald-400" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 uppercase">Tutorial</div>
              <h2 className="text-base font-bold text-white truncate">{currentStep.title}</h2>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 pb-5 space-y-3">
            <p className="text-sm text-gray-300 leading-relaxed">{currentStep.description}</p>

            {/* Instructions */}
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

            {/* Progress */}
            <div>
              <div className="flex justify-between text-[10px] font-semibold tracking-[0.12em] text-gray-500 uppercase mb-1.5">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              {onEndTutorial && (
                <button
                  onClick={onEndTutorial}
                  className="text-xs font-semibold text-gray-500 transition-colors hover:text-gray-300"
                >
                  End Tutorial
                </button>
              )}
              <div className="flex-1" />
              {!currentStep.required && onSkip && (
                <button
                  onClick={onSkip}
                  className="rounded-lg px-3.5 py-2 text-xs font-semibold text-gray-300 border border-white/10
                    transition-colors hover:bg-white/[0.06]"
                >
                  Skip
                </button>
              )}
              {onNext && (
                <button
                  onClick={onNext}
                  className="rounded-lg px-5 py-2 text-xs font-bold tracking-wide text-[#04130a]
                    transition-all duration-150 hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}
                >
                  Got it
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes tutorialEnter {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
            filter: blur(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
      `}</style>
    </div>
  );
};

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
    <div className={`fixed bottom-48 left-1/2 -translate-x-1/2 z-40 animate-slide-up`}>
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
