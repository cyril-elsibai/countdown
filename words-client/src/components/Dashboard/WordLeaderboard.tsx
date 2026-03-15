import { useState, useEffect } from 'react';
import { wordleDashboardApi } from '../../api';
import type {
  WordleLeaderboardResponse,
  WordleOverallLeaderboardResponse,
  WordleLeaderboardEntry,
  WordleOverallLeaderboardEntry,
} from '../../api';

interface Props {
  wordId: string | null; // null = overall leaderboard
}

type FilterType = 'global' | 'friends';

function formatTime(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${seconds.toFixed(1)}s`;
}

export default function WordLeaderboard({ wordId }: Props) {
  const isOverall = wordId === null;
  const [filter, setFilter] = useState<FilterType>('global');
  const [wordData, setWordData] = useState<WordleLeaderboardResponse | null>(null);
  const [overallData, setOverallData] = useState<WordleOverallLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, [wordId, filter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (isOverall) {
        setOverallData(await wordleDashboardApi.getOverallLeaderboard());
      } else {
        setWordData(await wordleDashboardApi.getLeaderboard(filter, wordId!));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="leaderboard-loading">Loading leaderboard...</div>;
  if (error) return <div className="leaderboard-error">{error}</div>;

  if (!isOverall && wordData) {
    return (
      <div className="leaderboard">
        <div className="leaderboard-section">
          <div className="leaderboard-info">
            {wordData.dailyNumber && (
              <h3 className="leaderboard-title">
                Daily #{wordData.dailyNumber} · {wordData.wordLength} letters
              </h3>
            )}
            {wordData.userRank && (
              <span className="user-rank-badge">Your rank: #{wordData.userRank}</span>
            )}
          </div>

          <div className="leaderboard-filter">
            <button className={filter === 'global' ? 'active' : ''} onClick={() => setFilter('global')}>Global</button>
            <button className={filter === 'friends' ? 'active' : ''} onClick={() => setFilter('friends')}>Friends</button>
          </div>

          {wordData.leaderboard.length === 0 ? (
            <div className="leaderboard-empty">
              {filter === 'friends' ? 'No friends have played this word yet.' : 'No one has played this word yet.'}
            </div>
          ) : (
            <table className="leaderboard-table">
              <thead>
                <tr><th>Rank</th><th>Player</th><th>Guesses</th><th>Time</th></tr>
              </thead>
              <tbody>
                {wordData.leaderboard.map((entry: WordleLeaderboardEntry) => (
                  <tr key={entry.userId} className={entry.rank === wordData.userRank ? 'current-user' : ''}>
                    <td className="rank-cell">
                      {entry.solved && entry.rank <= 3
                        ? <span className="medal">{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}</span>
                        : `#${entry.rank}`}
                    </td>
                    <td className="name-cell">{entry.name}</td>
                    <td className={`status-cell ${entry.solved ? 'status-solved' : 'status-away'}`}>
                      {entry.solved ? `${entry.guessCount} guess${entry.guessCount !== 1 ? 'es' : ''}` : '✗'}
                    </td>
                    <td className="status-cell">
                      {entry.solved ? formatTime(entry.duration) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (isOverall && overallData) {
    return (
      <div className="leaderboard">
        <div className="leaderboard-section">
          <div className="leaderboard-info">
            <h3 className="leaderboard-title">All-Time Leaderboard</h3>
            {overallData.userRank && (
              <span className="user-rank-badge">
                Your rank: #{overallData.userRank} · {overallData.userPoints} pts
              </span>
            )}
          </div>

          {overallData.leaderboard.length === 0 ? (
            <div className="leaderboard-empty">No leaderboard data yet.</div>
          ) : (
            <table className="leaderboard-table">
              <thead>
                <tr><th>Rank</th><th>Player</th><th>Points</th></tr>
              </thead>
              <tbody>
                {overallData.leaderboard.map((entry: WordleOverallLeaderboardEntry) => (
                  <tr key={entry.userId} className={entry.rank === overallData.userRank ? 'current-user' : ''}>
                    <td className="rank-cell">
                      {entry.rank <= 3
                        ? <span className="medal">{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}</span>
                        : `#${entry.rank}`}
                    </td>
                    <td className="name-cell">{entry.name}</td>
                    <td className="points-cell">{entry.totalPoints} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return null;
}
