import { useState, useEffect } from 'react';
import { wordleDashboardApi } from '../../api';
import type { WordlePlayHistoryEntry, WordleFriendActivity } from '../../api';

interface Props {
  onPlayWord: (wordId: string) => void;
  onSelectWord: (wordId: string) => void;
}

type View = 'me' | 'friends';

function formatTimeAgo(dateStr: string): string {
  const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${seconds.toFixed(1)}s`;
}

export default function WordHistory({ onPlayWord, onSelectWord }: Props) {
  const [view, setView] = useState<View>('me');

  const [myHistory, setMyHistory] = useState<WordlePlayHistoryEntry[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState<string | null>(null);

  const [friendActivity, setFriendActivity] = useState<WordleFriendActivity[]>([]);
  const [friendLoading, setFriendLoading] = useState(true);
  const [friendError, setFriendError] = useState<string | null>(null);

  useEffect(() => {
    loadMy();
    loadFriends();
  }, []);

  useEffect(() => {
    const interval = setInterval(loadFriends, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadMy() {
    setMyLoading(true);
    setMyError(null);
    try {
      const res = await wordleDashboardApi.getPlayHistory();
      setMyHistory(res.history);
    } catch (err) {
      setMyError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setMyLoading(false);
    }
  }

  async function loadFriends() {
    setFriendLoading(true);
    setFriendError(null);
    try {
      const res = await wordleDashboardApi.getFriendsActivity(50);
      setFriendActivity(res.activity);
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setFriendLoading(false);
    }
  }

  return (
    <div className="play-history">
      <div className="history-toggle">
        <button className={`history-toggle-btn ${view === 'me' ? 'active' : ''}`} onClick={() => setView('me')}>Me</button>
        <button className={`history-toggle-btn ${view === 'friends' ? 'active' : ''}`} onClick={() => setView('friends')}>Friends</button>
      </div>

      {view === 'me' && (
        <>
          {myLoading && <div className="history-loading">Loading...</div>}
          {myError && <div className="history-error">{myError}</div>}
          {!myLoading && !myError && myHistory.length === 0 && (
            <div className="history-empty">No words played yet.</div>
          )}
          {!myLoading && !myError && myHistory.length > 0 && (
            <div className="history-list">
              {myHistory.map(item => (
                <div key={item.wordId} className="history-item">
                  <span className="history-item-name">
                    {item.name || 'Word'} <span className="history-word-length">{item.wordLength}L</span>
                  </span>
                  {item.solved
                    ? <span className="history-status solved">{item.guessCount} guess{item.guessCount !== 1 ? 'es' : ''} · {formatTime(item.duration)}</span>
                    : item.guessCount < 6
                      ? <span className="history-status in-progress">In progress</span>
                      : <span className="history-status tried">Failed</span>
                  }
                  <span className="history-item-date">{formatTimeAgo(item.playedAt)}</span>
                  <button
                    className={`history-action-btn ${item.solved ? 'view' : 'play'}`}
                    onClick={() => onPlayWord(item.wordId)}
                  >
                    {item.solved ? 'View' : 'Play'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'friends' && (
        <>
          {friendLoading && <div className="history-loading">Loading...</div>}
          {friendError && <div className="history-error">{friendError}</div>}
          {!friendLoading && !friendError && friendActivity.length === 0 && (
            <div className="activity-empty">
              <div className="empty-icon">👥</div>
              <h3>No Recent Activity</h3>
              <p>Your friends haven't played any words recently.</p>
            </div>
          )}
          {!friendLoading && !friendError && friendActivity.length > 0 && (
            <div className="activity-feed">
              {friendActivity.map(item => (
                <div key={item.id} className="activity-card">
                  <div className="activity-avatar">{(item.name || 'F')[0].toUpperCase()}</div>
                  <div className="activity-content">
                    <div className="activity-header">
                      <span className="activity-name">{item.name}</span>
                      <span className="activity-time">{formatTimeAgo(item.playedAt)}</span>
                    </div>
                    <div className="activity-body">
                      {item.dailyNumber && (
                        <span className="activity-challenge">Daily #{item.dailyNumber} · {item.wordLength}L</span>
                      )}
                      {item.solved
                        ? <span className="activity-result solved">{item.guessCount} guess{item.guessCount !== 1 ? 'es' : ''}</span>
                        : <span className="activity-result failed">Did not solve</span>
                      }
                    </div>
                  </div>
                  <button className="activity-view-btn" onClick={() => onSelectWord(item.wordId)}>
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
