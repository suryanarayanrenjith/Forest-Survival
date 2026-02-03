import React from 'react';
import { type Mission, type MissionObjective } from '../utils/ProceduralMissionSystem';

interface MissionDisplayProps {
  missions: Mission[];
  onDismiss?: (missionId: string) => void;
}

export const MissionDisplay: React.FC<MissionDisplayProps> = ({ missions, onDismiss }) => {
  if (missions.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-40 space-y-2 max-w-md">
      {missions.map((mission) => (
        <MissionCard key={mission.id} mission={mission} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

interface MissionCardProps {
  mission: Mission;
  onDismiss?: (missionId: string) => void;
}

const MissionCard: React.FC<MissionCardProps> = ({ mission, onDismiss }) => {
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
    <div className="bg-black/90 backdrop-blur-sm border-2 border-cyan-400/50 rounded-lg p-3 shadow-2xl hover:border-cyan-300 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold uppercase tracking-wider ${difficultyColor}`}>
              {mission.difficulty}
            </span>
            {mission.timeLimit && (
              <span className="text-xs text-red-400 font-mono">
                ⏱️ {timeRemaining}
              </span>
            )}
          </div>
          <h3 className="text-white font-bold text-sm">{mission.title}</h3>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(mission.id)}
            className="text-gray-400 hover:text-white text-xs ml-2"
          >
            ✕
          </button>
        )}
      </div>

      {/* Story */}
      {mission.story && (
        <p className="text-gray-300 text-xs italic mb-2 line-clamp-2">
          &quot;{mission.story}&quot;
        </p>
      )}

      {/* Objectives */}
      <div className="space-y-1.5 mb-2">
        {mission.objectives.map((objective) => (
          <ObjectiveItem key={objective.id} objective={objective} />
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mb-2">
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${difficultyBg} transition-all duration-300`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Rewards */}
      <div className="flex items-center justify-between text-xs">
        <div className="text-yellow-400">
          🎁 {mission.reward.description}
        </div>
        {mission.bonusReward && (
          <div className="text-purple-400">
            +{mission.bonusReward.description}
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
      <span className="text-sm">{objective.icon}</span>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-xs ${isComplete ? 'line-through text-gray-500' : 'text-gray-300'}`}>
            {objective.description}
            {objective.optional && <span className="text-yellow-400 ml-1">(Bonus)</span>}
          </span>
          {isComplete ? (
            <span className="text-green-400 text-xs">✓</span>
          ) : (
            <span className="text-gray-400 text-xs font-mono">
              {objective.current}/{objective.target}
            </span>
          )}
        </div>
        {!isComplete && (
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
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
