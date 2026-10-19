/**
 * Bottom sheet opened by tapping a calendar day: how the word went for
 * everyone, your own result, and the actions (play / continue / leaderboard).
 */

import type { WordleHistoryChallenge } from '../../api';
import { formatDuration, isTodayUTC, ResultChip } from './format';

interface Props {
  challenge: WordleHistoryChallenge;
  onPlay: () => void;
  onViewLeaderboard: () => void;
  onClose: () => void;
}

export default function WordSheet({ challenge, onPlay, onViewLeaderboard, onClose }: Props) {
  const result = challenge.userResult;
  const today = isTodayUTC(challenge.date);
  const finished = !!result && (result.solved || result.guessCount >= 6);

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
            <div className="sub">{dateLabel}{today ? ' · today' : ''}</div>
          </div>
          <button className="icon-btn close-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        <div className="facts">
          <div><b>{challenge.wordLength}</b><span>letters</span></div>
          <div><b>{challenge.difficulty.completionPercent}%</b><span>solved it</span></div>
          <div><b>{challenge.difficulty.totalAttempts}</b><span>players</span></div>
        </div>

        <div className="yours">
          <span>Your result</span>
          {!result ? (
            <span className="sub">Not played</span>
          ) : (
            <span>
              <ResultChip solved={result.solved} guessCount={result.guessCount} />
              {result.solved && result.duration != null && <>&nbsp; {formatDuration(result.duration)}</>}
            </span>
          )}
        </div>

        <div className="pair">
          {finished ? (
            <button className="btn line" onClick={onPlay}>See your game</button>
          ) : (
            <button className="btn ink" onClick={onPlay}>{result ? 'Continue' : 'Play'}</button>
          )}
          <button className="btn line" onClick={onViewLeaderboard}>Leaderboard</button>
        </div>
      </div>
    </>
  );
}
