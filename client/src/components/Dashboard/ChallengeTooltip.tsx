/**
 * =============================================================================
 * CHALLENGE TOOLTIP (Dashboard/ChallengeTooltip.tsx)
 * =============================================================================
 *
 * Hover tooltip showing challenge details: difficulty breakdown, user result,
 * and action buttons.
 *
 * @module client/components/Dashboard/ChallengeTooltip
 */

import { HistoryChallenge } from '../../api';

interface ChallengeTooltipProps {
  challenge: HistoryChallenge;
  position: { x: number; y: number; placement?: 'above' | 'below' };
  onPlay: () => void;
  onViewLeaderboard: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function ChallengeTooltip({
  challenge,
  position,
  onPlay,
  onViewLeaderboard,
  onMouseEnter,
  onMouseLeave,
}: ChallengeTooltipProps) {
  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '-';
    if (seconds >= 10000) return 'penalty time';
    if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s (overtime)`;
    return `${seconds.toFixed(2)}s`;
  };

  const isToday = (): boolean => {
    const date = new Date(challenge.date);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const canPlay = !challenge.userResult && !isToday();
  const canRetry = challenge.userResult && !challenge.userResult.solved;

  const placement = position.placement ?? 'above';

  return (
    <div
      className={`challenge-tooltip ${placement}`}
      style={{
        left: position.x,
        top: position.y,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="tooltip-header">
        <span className="tooltip-daily">Daily #{challenge.dailyNumber}</span>
        <span className="tooltip-date">
          {new Date(challenge.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>

      <div className="tooltip-stats">
        <div className="stat-row">
          <span className="stat-label">Completion:</span>
          <span className="stat-value">{challenge.difficulty.completionPercent}%</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Under 60s:</span>
          <span className="stat-value">{challenge.difficulty.under60sPercent}%</span>
        </div>
<div className="stat-row">
          <span className="stat-label">Total attempts:</span>
          <span className="stat-value">{challenge.difficulty.totalAttempts}</span>
        </div>
      </div>

      {challenge.userResult && (
        <div className={`tooltip-result ${challenge.userResult.solved ? 'solved' : 'attempted'}`}>
          {challenge.userResult.solved ? (
            <>
              <span className="result-icon">✓</span>
              <span>Solved in {formatDuration(challenge.userResult.duration)}</span>
            </>
          ) : (
            <>
              <span className="result-icon">○</span>
              <span>
                Best: {challenge.userResult.result}
                ({Math.abs(challenge.targetNumber - (challenge.userResult.result || 0))} away)
              </span>
            </>
          )}
        </div>
      )}

      <div className="tooltip-actions">
        {canPlay && (
          <button className="tooltip-btn play" onClick={onPlay}>
            Play Challenge
          </button>
        )}
        {canRetry && (
          <button className="tooltip-btn play" onClick={onPlay}>
            Try Again
          </button>
        )}
        {isToday() && !challenge.userResult && (
          <span className="today-note">Today's challenge - play from home</span>
        )}
        <button className="tooltip-btn leaderboard" onClick={onViewLeaderboard}>
          View Leaderboard
        </button>
      </div>
    </div>
  );
}
