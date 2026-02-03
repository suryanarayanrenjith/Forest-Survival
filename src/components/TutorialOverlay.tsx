import React from 'react';
import { type TutorialStep } from '../utils/TutorialSystem';

interface TutorialOverlayProps {
  currentStep: TutorialStep | null;
  progress: number;
  onSkip?: () => void;
  onNext?: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  currentStep,
  progress,
  onSkip,
  onNext
}) => {
  if (!currentStep) return null;

  const positionClasses = {
    top: 'top-24 left-1/2 -translate-x-1/2',
    bottom: 'bottom-24 left-1/2 -translate-x-1/2',
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    left: 'left-24 top-1/2 -translate-y-1/2',
    right: 'right-24 top-1/2 -translate-y-1/2'
  };

  const position = currentStep.position || 'center';

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60 pointer-events-auto" />

      {/* Tutorial card */}
      <div className={`absolute ${positionClasses[position]} pointer-events-auto max-w-lg`}>
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-4 border-cyan-400 rounded-xl shadow-2xl overflow-hidden animate-pulse-border">
          {/* Icon and Title */}
          <div className="bg-gradient-to-r from-cyan-500 to-blue-500 p-4 text-center">
            <div className="text-6xl mb-2 animate-bounce">{currentStep.icon}</div>
            <h2 className="text-2xl font-bold text-white">{currentStep.title}</h2>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <p className="text-gray-300 text-lg font-medium">{currentStep.description}</p>

            {/* Instructions */}
            <div className="bg-black/40 rounded-lg p-4 space-y-2">
              {currentStep.instructions.map((instruction, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
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

            {/* Action buttons */}
            <div className="flex gap-2 justify-between pt-2">
              {!currentStep.required && onSkip && (
                <button
                  onClick={onSkip}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors text-sm"
                >
                  Skip (Optional)
                </button>
              )}
              <div className="flex-1" />
              {onNext && (
                <button
                  onClick={onNext}
                  className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded transition-colors text-sm"
                >
                  Got it!
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Pointer arrow (for positioned tooltips) */}
        {position !== 'center' && (
          <div
            className={`absolute ${
              position === 'top' ? 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full' :
              position === 'bottom' ? 'top-0 left-1/2 -translate-x-1/2 -translate-y-full rotate-180' :
              position === 'left' ? 'right-0 top-1/2 -translate-y-1/2 translate-x-full -rotate-90' :
              'left-0 top-1/2 -translate-y-1/2 -translate-x-full rotate-90'
            }`}
          >
            <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-cyan-400" />
          </div>
        )}
      </div>
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
