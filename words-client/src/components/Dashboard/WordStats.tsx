import { useState, useEffect } from 'react';
import { wordleDashboardApi } from '../../api';
import type { WordleUserStats, WordleStatsResponse } from '../../api';

type Timeframe = 'forever' | 'month' | 'week';

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  forever: 'Forever',
  month: 'Last 30 Days',
  week: 'Last 7 Days',
};

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${seconds.toFixed(1)}s`;
}

function GuessDist({ dist, total }: { dist: number[]; total: number }) {
  const max = Math.max(...dist, 1);
  return (
    <div className="guess-dist">
      {dist.map((count, i) => (
        <div key={i} className="guess-dist-row">
          <span className="guess-dist-label">{i + 1}</span>
          <div className="guess-dist-bar-wrap">
            <div
              className="guess-dist-bar"
              style={{ width: total > 0 ? `${Math.max((count / max) * 100, count > 0 ? 8 : 0)}%` : '0%' }}
            >
              {count > 0 && <span className="guess-dist-count">{count}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function WordStats() {
  const [data, setData] = useState<WordleStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState('');
  const [comparing, setComparing] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('forever');

  useEffect(() => { load(); }, []);

  async function load(compareWith?: string) {
    setLoading(true);
    setError(null);
    try {
      setData(await wordleDashboardApi.getStats(compareWith));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }

  const handleFriendChange = (friendId: string) => {
    setSelectedFriend(friendId);
    setComparing(!!friendId);
    load(friendId || undefined);
  };

  if (loading) return <div className="stats-loading">Loading stats...</div>;
  if (error) return <div className="stats-error">{error}</div>;
  if (!data) return null;

  const { myStats, friendStats, friendName, friends } = data;
  const mySlice: WordleUserStats | undefined = myStats[timeframe];
  const friendSlice: WordleUserStats | null = friendStats ? (friendStats[timeframe] ?? null) : null;

  if (!mySlice) return <div className="stats-error">Stats unavailable — please refresh.</div>;

  const winner = (myVal: number | null, friendVal: number | null, lowerIsBetter: boolean): 'me' | 'friend' | 'tie' | null => {
    if (!comparing || !friendSlice) return null;
    if (myVal === null && friendVal === null) return 'tie';
    if (myVal === null) return 'friend';
    if (friendVal === null) return 'me';
    if (myVal === friendVal) return 'tie';
    return lowerIsBetter ? (myVal < friendVal ? 'me' : 'friend') : (myVal > friendVal ? 'me' : 'friend');
  };

  type Row = { label: string; myValue: string; friendValue: string; rawMy: number | null; rawFriend: number | null; lowerIsBetter: boolean };

  const rows: Row[] = [
    {
      label: 'Games Played',
      myValue: String(mySlice.totalGamesPlayed),
      friendValue: friendSlice ? String(friendSlice.totalGamesPlayed) : '—',
      rawMy: mySlice.totalGamesPlayed,
      rawFriend: friendSlice?.totalGamesPlayed ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Success Rate',
      myValue: `${mySlice.successRate}%`,
      friendValue: friendSlice ? `${friendSlice.successRate}%` : '—',
      rawMy: mySlice.successRate,
      rawFriend: friendSlice?.successRate ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Avg Guesses',
      myValue: mySlice.avgGuesses !== null ? String(mySlice.avgGuesses) : '—',
      friendValue: friendSlice ? (friendSlice.avgGuesses !== null ? String(friendSlice.avgGuesses) : '—') : '—',
      rawMy: mySlice.avgGuesses,
      rawFriend: friendSlice?.avgGuesses ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Best Time',
      myValue: formatTime(mySlice.bestTime),
      friendValue: friendSlice ? formatTime(friendSlice.bestTime) : '—',
      rawMy: mySlice.bestTime,
      rawFriend: friendSlice?.bestTime ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Current Streak',
      myValue: `${mySlice.currentStreak} day${mySlice.currentStreak !== 1 ? 's' : ''}`,
      friendValue: friendSlice ? `${friendSlice.currentStreak} day${friendSlice.currentStreak !== 1 ? 's' : ''}` : '—',
      rawMy: mySlice.currentStreak,
      rawFriend: friendSlice?.currentStreak ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Longest Streak',
      myValue: `${mySlice.longestStreak} day${mySlice.longestStreak !== 1 ? 's' : ''}`,
      friendValue: friendSlice ? `${friendSlice.longestStreak} day${friendSlice.longestStreak !== 1 ? 's' : ''}` : '—',
      rawMy: mySlice.longestStreak,
      rawFriend: friendSlice?.longestStreak ?? null,
      lowerIsBetter: false,
    },
  ];

  return (
    <div className="stats-page">
      {/* Timeframe */}
      <div className="stats-timeframe">
        {(['forever', 'month', 'week'] as Timeframe[]).map(tf => (
          <button
            key={tf}
            className={`stats-timeframe-btn ${timeframe === tf ? 'active' : ''}`}
            onClick={() => setTimeframe(tf)}
          >
            {TIMEFRAME_LABELS[tf]}
          </button>
        ))}
      </div>

      {/* Friend picker */}
      <div className="stats-header">
        {friends.length > 0 ? (
          <div className="stats-compare-bar">
            <label htmlFor="friend-select">Compare with:</label>
            <select
              id="friend-select"
              value={selectedFriend}
              onChange={e => handleFriendChange(e.target.value)}
              className="stats-friend-select"
            >
              <option value="">— just my stats —</option>
              {friends.map(f => (
                <option key={f.id} value={f.id}>{f.name || 'Unnamed'}</option>
              ))}
            </select>
          </div>
        ) : (
          <p className="stats-no-friends">Add friends to compare your stats!</p>
        )}
      </div>

      {/* Stats table */}
      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th className="stats-col-label"></th>
              <th className="stats-col-player">You</th>
              {comparing && <th className="stats-col-player">{friendName || 'Friend'}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const w = winner(row.rawMy, row.rawFriend, row.lowerIsBetter);
              return (
                <tr key={row.label}>
                  <td className="stats-row-label">{row.label}</td>
                  <td className={`stats-row-value ${comparing && w === 'me' ? 'stats-winner' : ''}`}>
                    {row.myValue}
                    {comparing && w === 'me' && <span className="stats-win-dot" />}
                  </td>
                  {comparing && (
                    <td className={`stats-row-value ${w === 'friend' ? 'stats-winner' : ''}`}>
                      {row.friendValue}
                      {w === 'friend' && <span className="stats-win-dot" />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Guess distribution */}
      <div className="stats-dist-section">
        <h4 className="stats-dist-title">Guess Distribution</h4>
        <div className={comparing && friendSlice ? 'stats-dist-cols' : ''}>
          <div>
            {comparing && friendSlice && <p className="stats-dist-player">You</p>}
            <GuessDist dist={mySlice.guessDist} total={mySlice.totalGamesPlayed} />
          </div>
          {comparing && friendSlice && (
            <div>
              <p className="stats-dist-player">{friendName || 'Friend'}</p>
              <GuessDist dist={friendSlice.guessDist} total={friendSlice.totalGamesPlayed} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
