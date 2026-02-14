import React from 'react';
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
      {/* Dark overlay — clickable to dismiss optional steps */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Tutorial card — positioned safely within viewport */}
      <div
        className="absolute pointer-events-auto w-[90vw] max-w-lg"
        style={{
          ...getPositionStyle(position),
          animation: 'tutorialEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-cyan-400 rounded-xl shadow-2xl overflow-hidden"
          style={{ boxShadow: '0 0 30px rgba(6, 182, 212, 0.3)' }}
        >
          {/* Icon and Title */}
          <div className="bg-gradient-to-r from-cyan-500 to-blue-500 p-4 text-center">
            <div className="text-5xl mb-1">{currentStep.icon}</div>
            <h2 className="text-xl font-bold text-white">{currentStep.title}</h2>
          </div>

          {/* Content */}
          <div className="p-5 space-y-3">
            <p className="text-gray-300 text-base font-medium">{currentStep.description}</p>

            {/* Instructions */}
            <div className="bg-black/40 rounded-lg p-3 space-y-1.5">
              {currentStep.instructions.map((instruction, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold mt-0.5">•</span>
                  <p className="text-gray-200 text-sm">{instruction}</p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Tutorial Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Action buttons — always visible */}
            <div className="flex gap-2 justify-between pt-1">
              {/* Skip this step (for optional steps) */}
              {!currentStep.required && onSkip && (
                <button
                  onClick={onSkip}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm"
                >
                  Skip Step
                </button>
              )}

              {/* End Tutorial button — always available so user can exit anytime */}
              {onEndTutorial && (
                <button
                  onClick={onEndTutorial}
                  className="px-4 py-2 bg-red-900/60 hover:bg-red-800/80 text-red-300 hover:text-red-200 rounded-lg transition-colors text-sm border border-red-500/30"
                >
                  End Tutorial
                </button>
              )}

              <div className="flex-1" />

              {/* Continue / Got it button */}
              {onNext && (
                <button
                  onClick={onNext}
                  className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-bold rounded-lg transition-all duration-150 text-sm hover:scale-105 active:scale-95"
                  style={{ boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)' }}
                >
                  Got it!
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
  icon,
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

  const priorityIcon = {
    low: '💡',
    medium: '⚠️',
    high: '🚨',
    critical: '🆘'
  };

  return (
    <div className={`fixed bottom-32 left-1/2 -translate-x-1/2 z-40 animate-slide-up`}>
      <div className={`${priorityStyles[priority]} border-2 rounded-lg p-4 shadow-2xl backdrop-blur-sm max-w-md`}>
        <div className="flex items-start gap-3">
          <div className="text-3xl">{icon}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{priorityIcon[priority]}</span>
              <h4 className="text-white font-bold text-sm">{title}</h4>
            </div>
            <p className="text-gray-200 text-sm">{message}</p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
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
