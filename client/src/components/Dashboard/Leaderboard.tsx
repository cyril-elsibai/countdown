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
import { bandFromDifference } from './format';


interface LeaderboardProps {
  frameId: string | null;
  onSelectFrame: (frameId: string | null) => void;
}

type FilterType = 'global' | 'friends';

export default function Leaderboard({ frameId, onSelectFrame }: LeaderboardProps) {
  // Mode is derived from whether a frameId is provided:
  // - frameId present → per-challenge leaderboard (from tooltip)
  // - no frameId → overall points leaderboard (Main Leaderboard tab)
  const type = frameId ? 'daily' : 'overall';
  const [filter, setFilter] = useState<FilterType>('global');
  const [dailyData, setDailyData] = useState<LeaderboardResponse | null>(null);
  const [overallData, setOverallData] = useState<OverallLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const OVERTIME_SECONDS = 60;

  // Per-day status chip uses the distance colors: solved = exact, otherwise by how far away
  const statusChip = (entry: LeaderboardEntry) => {
    if (entry.solved) {
      const label = (entry.duration ?? Infinity) <= OVERTIME_SECONDS
        ? `${entry.duration!.toFixed(2)}s`
        : 'Overtime';
      return <span className="chip exact">{label}</span>;
    }
    return <span className={`chip ${bandFromDifference(entry.difference)}`}>{entry.difference} away</span>;
  };

  const renderDailyLeaderboard = () => {
    if (!dailyData) return null;

    return (
      <div className="leaderboard-section">
        <div className="you-rank">
          <div>
            <h3 className="section-label">Leaderboard</h3>
            <b>Daily #{dailyData.dailyNumber}</b>
          </div>
          {dailyData.userRank && <span className="sub">You: #{dailyData.userRank}</span>}
        </div>

        <div className="seg small" role="tablist">
          <button role="tab" aria-selected={filter === 'global'} className={filter === 'global' ? 'on' : ''} onClick={() => setFilter('global')}>
            Global
          </button>
          <button role="tab" aria-selected={filter === 'friends'} className={filter === 'friends' ? 'on' : ''} onClick={() => setFilter('friends')}>
            Friends
          </button>
        </div>

        {dailyData.leaderboard.length === 0 ? (
          <div className="dash-note">
            {filter === 'friends'
              ? 'None of your friends have played this one yet.'
              : 'Nobody has played this one yet.'}
          </div>
        ) : (
          <ol className="list">
            {dailyData.leaderboard.map((entry: LeaderboardEntry) => (
              <li
                key={entry.userId}
                className={`lrow${entry.rank === dailyData.userRank ? ' me' : ''}${entry.solved && entry.rank <= 3 ? ' top' : ''}`}
              >
                <span className="r">{entry.rank}</span>
                <span className="who">{entry.name || 'Anonymous'}</span>
                {statusChip(entry)}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  };

  const renderOverallLeaderboard = () => {
    if (!overallData) return null;

    return (
      <div className="leaderboard-section">
        <div className="you-rank">
          <div>
            <h3 className="section-label">All-time points</h3>
            {overallData.userRank && <b>#{overallData.userRank}</b>}
          </div>
          {overallData.userRank ? (
            <span className="sub">{overallData.userPoints?.toLocaleString()} pts</span>
          ) : (
            <span className="sub">Not ranked yet. Points update daily.</span>
          )}
        </div>

        {overallData.leaderboard.length === 0 ? (
          <div className="dash-note">No points yet. Solve a daily to get on the board.</div>
        ) : (
          <ol className="list">
            {overallData.leaderboard.map((entry: OverallLeaderboardEntry) => (
              <li
                key={entry.userId}
                className={`lrow${entry.rank === overallData.userRank ? ' me' : ''}${entry.rank <= 3 ? ' top' : ''}`}
              >
                <span className="r">{entry.rank}</span>
                <span className="who">{entry.name || 'Anonymous'}</span>
                <span className="pts">{entry.totalPoints.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  };

  return (
    <div className="leaderboard">
      {loading ? (
        <div className="dash-note">Loading leaderboard...</div>
      ) : error ? (
        <div className="dash-note">{error}</div>
      ) : type === 'daily' ? (
        renderDailyLeaderboard()
      ) : (
        renderOverallLeaderboard()
      )}
    </div>
  );
}
