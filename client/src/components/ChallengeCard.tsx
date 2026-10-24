/**
 * Challenge card, shown when someone opens a shared link (/play/:frameId?from=userId).
 *
 * Says who sent it and their time, then adapts to where the reader stands:
 * not played → Play, started → Try again, solved → side-by-side + leaderboard,
 * guest → Log in (or Play when it's today's daily, the only frame guests can play).
 * Never shows the sender's expression.
 */

import { useState } from 'react';
import { friendsApi, SharedFrameResponse } from '../api';
import { distanceBand, formatDuration } from './Dashboard/format';

interface Props {
  data: SharedFrameResponse;
  loggedIn: boolean;
  onPlay: () => void;
  onLeaderboard: () => void;
  onLogin: (mode: 'login' | 'register') => void;
  onClose: () => void;
}

export default function ChallengeCard({ data, loggedIn, onPlay, onLeaderboard, onLogin, onClose }: Props) {
  const { frame, sender, me, friendship } = data;
  const [friendState, setFriendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const self = friendship === 'self';
  const solved = !!me?.solved;
  const started = !!me && !me.solved;

  const addFriend = async () => {
    if (!sender) return;
    setFriendState('sending');
    try {
      await friendsApi.sendRequestToUser(sender.id);
      setFriendState('sent');
    } catch {
      setFriendState('error');
    }
  };

  const title = self
    ? 'Your shared link'
    : sender ? `${sender.name} challenges you` : frame.name;

  // Faster time wins; only meaningful when both solved
  const iWon = solved && sender && me?.duration != null && sender.duration != null
    && me.duration < sender.duration;
  const theyWon = solved && sender && me?.duration != null && sender.duration != null
    && sender.duration < me.duration;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet challenge-card" role="dialog" aria-label={title}>
        <div className="grab" />
        <div className="sheet-top">
          <div>
            <h2 className="sheet-title">{title}</h2>
            <div className="sub">{frame.name}{frame.isToday ? ' · today' : ''} · target {frame.targetNumber}</div>
          </div>
          <button className="icon-btn close-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {sender && !self && (
          <div className="vs">
            <div className={theyWon ? 'won' : ''}>
              <span>{sender.name}</span>
              <span><span className="chip exact">Solved</span>&nbsp; {formatDuration(sender.duration)}</span>
            </div>
            {loggedIn && (
              <div className={iWon ? 'won' : ''}>
                <span>You</span>
                {solved ? (
                  <span><span className="chip exact">Solved</span>&nbsp; {formatDuration(me?.duration)}</span>
                ) : started && me?.result != null ? (
                  <span>
                    <span className={`chip ${distanceBand(frame.targetNumber, me.result)}`}>{me.result}</span>
                    &nbsp; {Math.abs(frame.targetNumber - me.result)} away
                  </span>
                ) : (
                  <span className="sub">Not played</span>
                )}
              </div>
            )}
          </div>
        )}

        {self && me?.solved && (
          <div className="vs">
            <div><span>You</span><span><span className="chip exact">Solved</span>&nbsp; {formatDuration(me.duration)}</span></div>
          </div>
        )}

        {!loggedIn ? (
          <>
            <p className="challenge-line">
              {frame.isToday ? 'Play as a guest, or log in to keep your score.' : 'Log in to play this challenge.'}
            </p>
            <div className="pair">
              {frame.isToday ? (
                <>
                  <button className="btn ink" onClick={onPlay}>Play</button>
                  <button className="btn line" onClick={() => onLogin('login')}>Log in</button>
                </>
              ) : (
                <>
                  <button className="btn ink" onClick={() => onLogin('login')}>Log in</button>
                  <button className="btn line" onClick={() => onLogin('register')}>Create account</button>
                </>
              )}
            </div>
          </>
        ) : solved || self ? (
          <>
            {iWon && <p className="challenge-line">You were faster.</p>}
            {theyWon && <p className="challenge-line">{sender?.name} was faster.</p>}
            <div className="pair">
              <button className="btn ink" onClick={onLeaderboard}>Leaderboard</button>
              <button className="btn line" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            {sender && !started && <p className="challenge-line">Can you beat {formatDuration(sender.duration)}?</p>}
            <div className="pair">
              <button className="btn ink" onClick={onPlay}>{started ? 'Try again' : 'Play'}</button>
              <button className="btn line" onClick={onClose}>Not now</button>
            </div>
          </>
        )}

        {loggedIn && sender && friendship === 'none' && (
          <div className="challenge-friend">
            {friendState === 'sent' ? (
              <span className="sub">Friend request sent</span>
            ) : (
              <button onClick={addFriend} disabled={friendState === 'sending'}>
                {friendState === 'error' ? 'Couldn’t send. Try again' : `Add ${sender.name} as a friend`}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
