import { useState, useEffect } from 'react';
import { dashboardApi, UserStats, StatsResponse } from '../../api';

type Timeframe = 'forever' | 'month' | 'week';

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  forever: 'Forever',
  month: 'Last 30 Days',
  week: 'Last 7 Days',
};

export default function Stats() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<string>('');
  const [comparing, setComparing] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('forever');

  useEffect(() => {
    load();
  }, []);

  const load = async (compareWith?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await dashboardApi.getStats(compareWith);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const handleFriendChange = (friendId: string) => {
    setSelectedFriend(friendId);
    setComparing(!!friendId);
    load(friendId || undefined);
  };

  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '—';
    if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${seconds.toFixed(2)}s`;
  };

  if (loading) return <div className="stats-loading">Loading stats...</div>;
  if (error) return <div className="stats-error">{error}</div>;
  if (!data) return null;

  const { myStats, friendStats, friendName, friends } = data;
  const myStatsSlice: UserStats = myStats[timeframe];
  const friendStatsSlice: UserStats | null = friendStats ? friendStats[timeframe] : null;

  const winner = (myVal: number | null, friendVal: number | null, lowerIsBetter: boolean): 'me' | 'friend' | 'tie' | null => {
    if (!comparing || friendStatsSlice === null) return null;
    if (myVal === null && friendVal === null) return 'tie';
    if (myVal === null) return 'friend';
    if (friendVal === null) return 'me';
    if (myVal === friendVal) return 'tie';
    if (lowerIsBetter) return myVal < friendVal ? 'me' : 'friend';
    return myVal > friendVal ? 'me' : 'friend';
  };

  type StatRow = {
    label: string;
    myValue: string;
    friendValue: string;
    rawMy: number | null;
    rawFriend: number | null;
    lowerIsBetter: boolean;
  };

  const rows: StatRow[] = [
    {
      label: 'Games Played',
      myValue: String(myStatsSlice.totalGamesPlayed),
      friendValue: friendStatsSlice ? String(friendStatsSlice.totalGamesPlayed) : '—',
      rawMy: myStatsSlice.totalGamesPlayed,
      rawFriend: friendStatsSlice?.totalGamesPlayed ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Success Rate',
      myValue: `${myStatsSlice.successRate}%`,
      friendValue: friendStatsSlice ? `${friendStatsSlice.successRate}%` : '—',
      rawMy: myStatsSlice.successRate,
      rawFriend: friendStatsSlice?.successRate ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Exact Solves',
      myValue: String(myStatsSlice.perfectSolves),
      friendValue: friendStatsSlice ? String(friendStatsSlice.perfectSolves) : '—',
      rawMy: myStatsSlice.perfectSolves,
      rawFriend: friendStatsSlice?.perfectSolves ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Avg. Distance from Target',
      myValue: myStatsSlice.averageDistance !== null ? String(myStatsSlice.averageDistance) : '—',
      friendValue: friendStatsSlice
        ? (friendStatsSlice.averageDistance !== null ? String(friendStatsSlice.averageDistance) : '—')
        : '—',
      rawMy: myStatsSlice.averageDistance,
      rawFriend: friendStatsSlice?.averageDistance ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Best Time',
      myValue: formatTime(myStatsSlice.bestTime),
      friendValue: friendStatsSlice ? formatTime(friendStatsSlice.bestTime) : '—',
      rawMy: myStatsSlice.bestTime,
      rawFriend: friendStatsSlice?.bestTime ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Current Streak',
      myValue: `${myStatsSlice.currentStreak} day${myStatsSlice.currentStreak !== 1 ? 's' : ''}`,
      friendValue: friendStatsSlice
        ? `${friendStatsSlice.currentStreak} day${friendStatsSlice.currentStreak !== 1 ? 's' : ''}`
        : '—',
      rawMy: myStatsSlice.currentStreak,
      rawFriend: friendStatsSlice?.currentStreak ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Longest Streak',
      myValue: `${myStatsSlice.longestStreak} day${myStatsSlice.longestStreak !== 1 ? 's' : ''}`,
      friendValue: friendStatsSlice
        ? `${friendStatsSlice.longestStreak} day${friendStatsSlice.longestStreak !== 1 ? 's' : ''}`
        : '—',
      rawMy: myStatsSlice.longestStreak,
      rawFriend: friendStatsSlice?.longestStreak ?? null,
      lowerIsBetter: false,
    },
  ];

  return (
    <div className="stats-page">
      {/* Timeframe filter */}
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
    </div>
  );
}
