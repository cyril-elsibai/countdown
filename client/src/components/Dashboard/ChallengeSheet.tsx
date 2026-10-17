/**
 * =============================================================================
 * CHALLENGE SHEET (Dashboard/ChallengeSheet.tsx)
 * =============================================================================
 *
 * Bottom sheet opened by tapping a calendar day. Replaces the old hover
 * tooltip, which didn't work on phones. Shows how the day went for everyone,
 * your own result, and the actions (play / try again / leaderboard).
 *
 * @module client/components/Dashboard/ChallengeSheet
 */

import { HistoryChallenge } from '../../api';
import { distanceBand, formatDuration, isTodayUTC } from './format';

interface ChallengeSheetProps {
  challenge: HistoryChallenge;
  onPlay: () => void;
  onViewLeaderboard: () => void;
  onClose: () => void;
}

export default function ChallengeSheet({ challenge, onPlay, onViewLeaderboard, onClose }: ChallengeSheetProps) {
  const result = challenge.userResult;
  const today = isTodayUTC(challenge.date);
  const canPlay = !result;
  const canRetry = !!result && !result.solved;

  const dateLabel = new Date(challenge.date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`Daily #${challenge.dailyNumber}`}>
        <div className="grab" />
        <div className="sheet-top">
          <div>
            <h2 className="sheet-title">Daily #{challenge.dailyNumber}</h2>
            <div className="sub">{dateLabel}{today ? ' · today' : ''} · target {challenge.targetNumber}</div>
          </div>
          <button className="icon-btn close-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        <div className="facts">
          <div><b>{challenge.difficulty.completionPercent}%</b><span>solved it</span></div>
          <div><b>{challenge.difficulty.under60sPercent}%</b><span>under 60s</span></div>
          <div><b>{challenge.difficulty.totalAttempts}</b><span>players</span></div>
        </div>

        <div className="yours">
          <span>Your result</span>
          {!result ? (
            <span className="sub">Not played</span>
          ) : result.solved ? (
            <span><span className="chip exact">Solved</span>&nbsp; {formatDuration(result.duration)}</span>
          ) : result.result != null ? (
            <span>
              <span className={`chip ${distanceBand(challenge.targetNumber, result.result)}`}>{result.result}</span>
              &nbsp; {Math.abs(challenge.targetNumber - result.result)} away
            </span>
          ) : (
            <span className="sub">Started</span>
          )}
        </div>

        <div className="pair">
          {canPlay && <button className="btn ink" onClick={onPlay}>Play</button>}
          {canRetry && <button className="btn ink" onClick={onPlay}>Try again</button>}
          <button className="btn line" onClick={onViewLeaderboard}>Leaderboard</button>
        </div>
      </div>
    </>
  );
}
