import React from 'react';
import { Timer, Gift, X, Check, Target, Plus } from 'lucide-react';
import { type Mission, type MissionObjective } from '../utils/ProceduralMissionSystem';

interface MissionDisplayProps {
  missions: Mission[];
  onDismiss?: (missionId: string) => void;
  /** Touch devices use a compact, top-centre stack so the cards never sit on
   *  top of the on-screen joystick (left) or action buttons (bottom-right). */
  isTouch?: boolean;
}

export const MissionDisplay: React.FC<MissionDisplayProps> = ({ missions, onDismiss, isTouch = false }) => {
  if (missions.length === 0) return null;

  // ── Touch: compact, top-centre, capped to one card ──
  // The left column (joystick) and bottom-right (actions/fire) are control
  // zones on touch, so missions live in the single safe lane: the top-centre
  // band above the joystick. Only the most recent mission is shown to keep it
  // short; the card is compact (no flavour text).
  if (isTouch) {
    return (
      <div className="pointer-events-none fixed top-[60px] left-1/2 z-40 w-[min(82vw,300px)] -translate-x-1/2 space-y-1.5">
        {missions.slice(0, 1).map((mission) => (
          <MissionCard key={mission.id} mission={mission} onDismiss={onDismiss} compact />
        ))}
      </div>
    );
  }

  // Anchored to the left side, below the health panel — the top-right
  // corner is reserved for the kill feed, which previously overlapped.
  return (
    <div className="fixed top-44 left-3 sm:left-5 z-40 space-y-2 max-w-xs sm:max-w-sm">
      {missions.map((mission) => (
        <MissionCard key={mission.id} mission={mission} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

interface MissionCardProps {
  mission: Mission;
  onDismiss?: (missionId: string) => void;
  /** Compact variant (touch): drops the flavour text + trims padding so the
   *  card stays short enough to clear the joystick zone. */
  compact?: boolean;
}

const MissionCard: React.FC<MissionCardProps> = ({ mission, onDismiss, compact = false }) => {
  const progress = calculateProgress(mission);
  const timeRemaining = formatTimeRemaining(mission.timeRemaining);

  const difficultyColor = {
    trivial: 'text-gray-400',
    easy: 'text-green-400',
    moderate: 'text-yellow-400',
    hard: 'text-orange-400',
    extreme: 'text-red-400',
    legendary: 'text-purple-400'
  }[mission.difficulty];

  const difficultyBg = {
    trivial: 'bg-gray-500',
    easy: 'bg-green-500',
    moderate: 'bg-yellow-500',
    hard: 'bg-orange-500',
    extreme: 'bg-red-500',
    legendary: 'bg-purple-500'
  }[mission.difficulty];

  return (
    <div className={`pointer-events-auto rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md shadow-2xl transition-colors hover:border-cyan-400/40 ${compact ? 'p-2.5' : 'p-3.5'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold uppercase tracking-[0.15em] ${difficultyColor}`}>
              {mission.difficulty}
            </span>
            {mission.timeLimit && (
              <span className="flex items-center gap-1 text-xs text-red-400 font-mono">
                <Timer className="w-3 h-3" strokeWidth={2.5} /> {timeRemaining}
              </span>
            )}
          </div>
          <h3 className="text-white font-bold text-sm">{mission.title}</h3>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(mission.id)}
            className="text-gray-500 hover:text-white ml-2 transition-colors"
            aria-label="Dismiss mission"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Story — hidden in the compact (touch) layout to keep the card short. */}
      {mission.story && !compact && (
        <p className="text-gray-300 text-xs italic mb-2 line-clamp-2">
          &quot;{mission.story}&quot;
        </p>
      )}

      {/* Objectives — capped to two on the compact layout. */}
      <div className="space-y-1.5 mb-2">
        {(compact ? mission.objectives.slice(0, 2) : mission.objectives).map((objective) => (
          <ObjectiveItem key={objective.id} objective={objective} />
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mb-2">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${difficultyBg} transition-all duration-300`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Rewards */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-amber-400">
          <Gift className="w-3.5 h-3.5" strokeWidth={2.25} />
          {mission.reward.description}
        </div>
        {mission.bonusReward && (
          <div className="flex items-center gap-1 text-purple-400">
            <Plus className="w-3 h-3" strokeWidth={2.5} />
            {mission.bonusReward.description}
          </div>
        )}
      </div>
    </div>
  );
};

interface ObjectiveItemProps {
  objective: MissionObjective;
}

const ObjectiveItem: React.FC<ObjectiveItemProps> = ({ objective }) => {
  const progress = Math.min(100, (objective.current / objective.target) * 100);
  const isComplete = objective.completed;

  return (
    <div className={`flex items-center gap-2 ${isComplete ? 'opacity-60' : ''}`}>
      <Target className={`w-3.5 h-3.5 flex-shrink-0 ${isComplete ? 'text-green-400' : 'text-cyan-400'}`} strokeWidth={2.25} />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-xs ${isComplete ? 'line-through text-gray-500' : 'text-gray-300'}`}>
            {objective.description}
            {objective.optional && <span className="text-yellow-400 ml-1">(Bonus)</span>}
          </span>
          {isComplete ? (
            <Check className="w-3.5 h-3.5 text-green-400" strokeWidth={3} />
          ) : (
            <span className="text-gray-400 text-xs font-mono">
              {objective.current}/{objective.target}
            </span>
          )}
        </div>
        {!isComplete && (
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

function calculateProgress(mission: Mission): number {
  const requiredObjectives = mission.objectives.filter(obj => !obj.optional);
  if (requiredObjectives.length === 0) return 0;

  const totalProgress = requiredObjectives.reduce((sum, obj) => {
    return sum + (obj.current / obj.target);
  }, 0);

  return Math.min(100, (totalProgress / requiredObjectives.length) * 100);
}

function formatTimeRemaining(time: number | undefined): string {
  if (time === undefined) return '';

  const seconds = Math.ceil(time);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}s`;
}
