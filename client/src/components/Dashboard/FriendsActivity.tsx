/**
 * =============================================================================
 * FRIENDS ACTIVITY (Dashboard/FriendsActivity.tsx)
 * =============================================================================
 *
 * Feed showing recent game activity from friends.
 *
 * @module client/components/Dashboard/FriendsActivity
 */

import { useState, useEffect } from 'react';
import { dashboardApi, FriendActivity } from '../../api';

interface FriendsActivityProps {
  onSelectFrame: (frameId: string) => void;
}

export default function FriendsActivity({ onSelectFrame }: FriendsActivityProps) {
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadActivity();
  }, []);

  const loadActivity = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dashboardApi.getFriendsActivity(30);
      setActivity(response.activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '-';
    if (seconds >= 10000) return 'penalty time';
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

  if (loading) {
    return <div className="activity-loading">Loading activity...</div>;
  }

  if (error) {
    return <div className="activity-error">{error}</div>;
  }

  if (activity.length === 0) {
    return (
      <div className="activity-empty">
        <div className="empty-icon">👥</div>
        <h3>No Recent Activity</h3>
        <p>Your friends haven't played any challenges recently.</p>
        <p className="empty-hint">Add friends from your Profile to see their activity here!</p>
      </div>
    );
  }

  return (
    <div className="friends-activity">
      <div className="activity-feed">
        {activity.map(item => (
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
                {item.solved ? (
                  <span className="activity-result solved">
                    Solved in {formatDuration(item.duration)}
                  </span>
                ) : (
                  <span className="activity-result failed">
                    Did not solve
                  </span>
                )}
              </div>
            </div>

            <button
              className="activity-view-btn"
              onClick={() => onSelectFrame(item.frameId)}
              title="View leaderboard"
            >
              View
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
