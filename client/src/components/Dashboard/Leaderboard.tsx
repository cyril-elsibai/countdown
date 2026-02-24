/**
 * =============================================================================
 * LEADERBOARD (Dashboard/Leaderboard.tsx)
 * =============================================================================
 *
 * Per-frame and overall points leaderboards with global/friends filtering.
 *
 * @module client/components/Dashboard/Leaderboard
 */

import { useState, useEffect } from 'react';
import {
  dashboardApi,
  LeaderboardEntry,
  OverallLeaderboardEntry,
  LeaderboardResponse,
  OverallLeaderboardResponse,
} from '../../api';

interface LeaderboardProps {
  frameId: string | null;
  onSelectFrame: (frameId: string | null) => void;
}

type LeaderboardType = 'daily' | 'overall';
type FilterType = 'global' | 'friends';

export default function Leaderboard({ frameId, onSelectFrame }: LeaderboardProps) {
  const [type, setType] = useState<LeaderboardType>(frameId ? 'daily' : 'overall');
  const [filter, setFilter] = useState<FilterType>('global');
  const [dailyData, setDailyData] = useState<LeaderboardResponse | null>(null);
  const [overallData, setOverallData] = useState<OverallLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (frameId) {
      setType('daily');
    }
  }, [frameId]);

  useEffect(() => {
    loadLeaderboard();
  }, [type, filter, frameId]);

  const loadLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      if (type === 'daily') {
        const response = await dashboardApi.getLeaderboard(filter, frameId || undefined);
        setDailyData(response);
      } else {
        const response = await dashboardApi.getOverallLeaderboard();
        setOverallData(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '-';
    if (seconds >= 10000) return 'penalty';
    if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${seconds.toFixed(2)}s`;
  };

  const renderDailyLeaderboard = () => {
    if (!dailyData) return null;

    return (
      <div className="leaderboard-section">
        <div className="leaderboard-info">
          {dailyData.dailyNumber && (
            <h3 className="leaderboard-title">Daily #{dailyData.dailyNumber}</h3>
          )}
          {dailyData.userRank && (
            <span className="user-rank-badge">Your rank: #{dailyData.userRank}</span>
          )}
        </div>

        <div className="leaderboard-filter">
          <button
            className={filter === 'global' ? 'active' : ''}
            onClick={() => setFilter('global')}
          >
            Global
          </button>
          <button
            className={filter === 'friends' ? 'active' : ''}
            onClick={() => setFilter('friends')}
          >
            Friends
          </button>
        </div>

        {dailyData.leaderboard.length === 0 ? (
          <div className="leaderboard-empty">
            {filter === 'friends'
              ? 'No friends have completed this challenge yet.'
              : 'No one has completed this challenge yet.'}
          </div>
        ) : (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {dailyData.leaderboard.map((entry: LeaderboardEntry) => (
                <tr key={entry.userId} className={entry.rank === dailyData.userRank ? 'current-user' : ''}>
                  <td className="rank-cell">
                    {entry.rank <= 3 ? (
                      <span className={`medal medal-${entry.rank}`}>
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
                      </span>
                    ) : (
                      `#${entry.rank}`
                    )}
                  </td>
                  <td className="name-cell">{entry.name || 'Anonymous'}</td>
                  <td className="time-cell">{formatDuration(entry.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  const renderOverallLeaderboard = () => {
    if (!overallData) return null;

    return (
      <div className="leaderboard-section">
        <div className="leaderboard-info">
          <h3 className="leaderboard-title">All-Time Points</h3>
          {overallData.userRank && (
            <span className="user-rank-badge">
              Your rank: #{overallData.userRank} ({overallData.userPoints} pts)
            </span>
          )}
        </div>

        {overallData.leaderboard.length === 0 ? (
          <div className="leaderboard-empty">No leaderboard data yet.</div>
        ) : (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {overallData.leaderboard.map((entry: OverallLeaderboardEntry) => (
                <tr key={entry.userId} className={entry.rank === overallData.userRank ? 'current-user' : ''}>
                  <td className="rank-cell">
                    {entry.rank <= 3 ? (
                      <span className={`medal medal-${entry.rank}`}>
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
                      </span>
                    ) : (
                      `#${entry.rank}`
                    )}
                  </td>
                  <td className="name-cell">{entry.name || 'Anonymous'}</td>
                  <td className="points-cell">{entry.totalPoints.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div className="leaderboard">
      <div className="leaderboard-type-tabs">
        <button
          className={type === 'daily' ? 'active' : ''}
          onClick={() => setType('daily')}
        >
          Daily Challenge
        </button>
        <button
          className={type === 'overall' ? 'active' : ''}
          onClick={() => setType('overall')}
        >
          Overall Points
        </button>
      </div>


      {loading ? (
        <div className="leaderboard-loading">Loading leaderboard...</div>
      ) : error ? (
        <div className="leaderboard-error">{error}</div>
      ) : type === 'daily' ? (
        renderDailyLeaderboard()
      ) : (
        renderOverallLeaderboard()
      )}
    </div>
  );
}
