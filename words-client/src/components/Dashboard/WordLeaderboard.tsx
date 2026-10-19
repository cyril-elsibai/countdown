import { useState, useEffect } from 'react';
import { wordleDashboardApi } from '../../api';
import type { WordleLeaderboardResponse, WordleOverallLeaderboardResponse } from '../../api';
import { formatDuration, ResultChip } from './format';

interface Props {
  wordId: string | null; // null = overall leaderboard
}

type FilterType = 'global' | 'friends';

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

  if (loading) return <div className="dash-note">Loading leaderboard…</div>;
  if (error) return <div className="dash-note">{error}</div>;

  if (!isOverall && wordData) {
    return (
      <div className="leaderboard-section">
        <div className="you-rank">
          <div>
            <h3 className="section-label">Leaderboard · {wordData.wordLength} letters</h3>
            <b>{wordData.dailyNumber ? `Daily #${wordData.dailyNumber}` : 'Random word'}</b>
          </div>
          {wordData.userRank && <span className="sub">You: #{wordData.userRank}</span>}
        </div>

        <div className="seg small" role="tablist">
          <button role="tab" aria-selected={filter === 'global'} className={filter === 'global' ? 'on' : ''} onClick={() => setFilter('global')}>Global</button>
          <button role="tab" aria-selected={filter === 'friends'} className={filter === 'friends' ? 'on' : ''} onClick={() => setFilter('friends')}>Friends</button>
        </div>

        {wordData.leaderboard.length === 0 ? (
          <div className="dash-note">
            {filter === 'friends' ? 'None of your friends have played this word yet.' : 'Nobody has played this word yet.'}
          </div>
        ) : (
          <ol className="list">
            {wordData.leaderboard.map(entry => (
              <li
                key={entry.userId}
                className={`lrow${entry.rank === wordData.userRank ? ' me' : ''}${entry.solved && entry.rank <= 3 ? ' top' : ''}`}
              >
                <span className="r">{entry.rank}</span>
                <span className="who">{entry.name || 'Anonymous'}</span>
                <span className="right">
                  {entry.solved && entry.duration != null && <span className="sub">{formatDuration(entry.duration)}</span>}
                  <ResultChip solved={entry.solved} guessCount={entry.guessCount} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  if (isOverall && overallData) {
    return (
      <div className="leaderboard-section">
        <div className="you-rank">
          <div>
            <h3 className="section-label">All-time points</h3>
            {overallData.userRank && <b>#{overallData.userRank}</b>}
          </div>
          {overallData.userRank ? (
            <span className="sub">{overallData.userPoints.toLocaleString()} pts</span>
          ) : (
            <span className="sub">Not ranked yet</span>
          )}
        </div>

        {overallData.leaderboard.length === 0 ? (
          <div className="dash-note">No points yet. Solve a daily word to get on the board.</div>
        ) : (
          <ol className="list">
            {overallData.leaderboard.map(entry => (
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
  }

  return null;
}
