import { useState, useEffect } from 'react';
import { dashboardApi, PlayHistoryEntry, FriendActivity } from '../../api';
import { distanceBand, formatDuration, formatTimeAgo } from './format';

interface PlayHistoryProps {
  onPlayFrame: (frameId: string, frameName?: string) => void;
  onSelectFrame: (frameId: string) => void; // used by friends activity view
}

type HistoryView = 'me' | 'friends';

export default function PlayHistory({ onPlayFrame, onSelectFrame }: PlayHistoryProps) {
  const [view, setView] = useState<HistoryView>('me');

  const [myHistory, setMyHistory] = useState<PlayHistoryEntry[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState<string | null>(null);

  const [friendActivity, setFriendActivity] = useState<FriendActivity[]>([]);
  const [friendLoading, setFriendLoading] = useState(true);
  const [friendError, setFriendError] = useState<string | null>(null);

  useEffect(() => {
    loadMyHistory();
    loadFriendActivity();
  }, []);

  const loadMyHistory = async () => {
    setMyLoading(true);
    setMyError(null);
    try {
      const response = await dashboardApi.getPlayHistory();
      setMyHistory(response.history);
    } catch (err) {
      setMyError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setMyLoading(false);
    }
  };

  const loadFriendActivity = async () => {
    setFriendLoading(true);
    setFriendError(null);
    try {
      const response = await dashboardApi.getFriendsActivity(50);
      setFriendActivity(response.activity);
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : 'Failed to load friends activity');
    } finally {
      setFriendLoading(false);
    }
  };

  // Poll friends activity every 30s (same as before)
  useEffect(() => {
    const interval = setInterval(loadFriendActivity, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="play-history">
      <div className="seg small" role="tablist">
        <button role="tab" aria-selected={view === 'me'} className={view === 'me' ? 'on' : ''} onClick={() => setView('me')}>
          Me
        </button>
        <button role="tab" aria-selected={view === 'friends'} className={view === 'friends' ? 'on' : ''} onClick={() => setView('friends')}>
          Friends
        </button>
      </div>

      {/* My history: chip color = how close the game ended (exact / within 10 / further) */}
      {view === 'me' && (
        <>
          {myLoading && <div className="dash-note">Loading...</div>}
          {myError && <div className="dash-note">{myError}</div>}
          {!myLoading && !myError && myHistory.length === 0 && (
            <div className="dash-note">No games played yet.</div>
          )}
          {!myLoading && !myError && myHistory.length > 0 && (
            <ul className="list">
              {myHistory.map(item => (
                <li key={item.frameId} className="hrow">
                  <b>{item.name || 'Unnamed'}</b>
                  <span className="when">{formatTimeAgo(item.playedAt)}</span>
                  <span className="right">
                    {item.solved ? (
                      <span className="chip exact">{formatDuration(item.duration)}</span>
                    ) : item.result !== null ? (
                      <span className={`chip ${distanceBand(item.targetNumber, item.result)}`}>
                        {Math.abs(item.targetNumber - item.result)} away
                      </span>
                    ) : (
                      <span className="chip none">Not finished</span>
                    )}
                    {!item.solved && (
                      <button className="btn line mini" onClick={() => onPlayFrame(item.frameId, item.name ?? undefined)}>
                        Play
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view === 'friends' && (
        <>
          {friendLoading && <div className="dash-note">Loading...</div>}
          {friendError && <div className="dash-note">{friendError}</div>}
          {!friendLoading && !friendError && friendActivity.length === 0 && (
            <div className="dash-note">
              Your friends haven't played recently. Add friends with the people icon at the top.
            </div>
          )}
          {!friendLoading && !friendError && friendActivity.length > 0 && (
            <ul className="list">
              {friendActivity.map(item => (
                <li key={item.id} className="hrow">
                  <b>{item.name || 'Friend'}{item.dailyNumber ? <span className="sub"> · Daily #{item.dailyNumber}</span> : null}</b>
                  <span className="when">{formatTimeAgo(item.playedAt)}</span>
                  <span className="right">
                    {item.solved
                      ? <span className="chip exact">{formatDuration(item.duration)}</span>
                      : <span className="chip none">Not solved</span>}
                    <button className="btn line mini" onClick={() => onSelectFrame(item.frameId)}>
                      View
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
