import { useState, useEffect } from 'react';
import { dashboardApi, PlayHistoryEntry, FriendActivity } from '../../api';

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

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '—';
    if (seconds >= 10000) return 'overtime';
    if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${seconds.toFixed(2)}s`;
  };

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="play-history">
      {/* Toggle */}
      <div className="history-toggle">
        <button
          className={`history-toggle-btn ${view === 'me' ? 'active' : ''}`}
          onClick={() => setView('me')}
        >
          Me
        </button>
        <button
          className={`history-toggle-btn ${view === 'friends' ? 'active' : ''}`}
          onClick={() => setView('friends')}
        >
          Friends
        </button>
      </div>

      {/* My history */}
      {view === 'me' && (
        <>
          {myLoading && <div className="history-loading">Loading...</div>}
          {myError && <div className="history-error">{myError}</div>}
          {!myLoading && !myError && myHistory.length === 0 && (
            <div className="history-empty">No games played yet.</div>
          )}
          {!myLoading && !myError && myHistory.length > 0 && (
            <div className="history-list">
              {myHistory.map(item => (
                <div key={item.frameId} className="history-item">
                  <span className="history-item-name">{item.name || 'Unnamed'}</span>
                  {item.solved
                    ? <span className="history-status solved">Solved in {formatDuration(item.duration)}</span>
                    : item.result !== null
                      ? <span className="history-status tried">{Math.abs(item.targetNumber - item.result)} away</span>
                      : <span className="history-status tried">Not solved</span>
                  }
                  <span className="history-item-date">{formatTimeAgo(item.playedAt)}</span>
                  <button
                    className={`history-action-btn ${item.solved ? 'view' : 'play'}`}
                    onClick={() => onPlayFrame(item.frameId, item.name ?? undefined)}
                  >
                    {item.solved ? 'View' : 'Play'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Friends activity */}
      {view === 'friends' && (
        <>
          {friendLoading && <div className="history-loading">Loading...</div>}
          {friendError && <div className="history-error">{friendError}</div>}
          {!friendLoading && !friendError && friendActivity.length === 0 && (
            <div className="activity-empty">
              <div className="empty-icon">👥</div>
              <h3>No Recent Activity</h3>
              <p>Your friends haven't played any challenges recently.</p>
            </div>
          )}
          {!friendLoading && !friendError && friendActivity.length > 0 && (
            <div className="activity-feed">
              {friendActivity.map(item => (
                <div key={item.id} className="activity-card">
                  <div className="activity-avatar">
                    {(item.name || 'F')[0].toUpperCase()}
                  </div>
                  <div className="activity-content">
                    <div className="activity-header">
                      <span className="activity-name">{item.name || 'Friend'}</span>
                      <span className="activity-time">{formatTimeAgo(item.playedAt)}</span>
                    </div>
                    <div className="activity-body">
                      {item.dailyNumber && (
                        <span className="activity-challenge">Daily #{item.dailyNumber}</span>
                      )}
                      {item.solved
                        ? <span className="activity-result solved">Solved in {formatDuration(item.duration)}</span>
                        : <span className="activity-result failed">Did not solve</span>
                      }
                    </div>
                  </div>
                  <button className="activity-view-btn" onClick={() => onSelectFrame(item.frameId)}>
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
