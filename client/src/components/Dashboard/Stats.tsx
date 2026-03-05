import { useState, useEffect } from 'react';
import { dashboardApi, UserStats, StatsResponse } from '../../api';

export default function Stats() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<string>('');
  const [comparing, setComparing] = useState(false);

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
  const myName = 'You';

  // Determine winner for each stat (lower = better for distance/time, higher = better for others)
  const winner = (myVal: number | null, friendVal: number | null, lowerIsBetter: boolean): 'me' | 'friend' | 'tie' | null => {
    if (!comparing || friendStats === null) return null;
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
      myValue: String(myStats.totalGamesPlayed),
      friendValue: friendStats ? String(friendStats.totalGamesPlayed) : '—',
      rawMy: myStats.totalGamesPlayed,
      rawFriend: friendStats?.totalGamesPlayed ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Success Rate',
      myValue: `${myStats.successRate}%`,
      friendValue: friendStats ? `${friendStats.successRate}%` : '—',
      rawMy: myStats.successRate,
      rawFriend: friendStats?.successRate ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Exact Solves',
      myValue: String(myStats.perfectSolves),
      friendValue: friendStats ? String(friendStats.perfectSolves) : '—',
      rawMy: myStats.perfectSolves,
      rawFriend: friendStats?.perfectSolves ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Avg. Distance from Target',
      myValue: myStats.averageDistance !== null ? String(myStats.averageDistance) : '—',
      friendValue: friendStats
        ? (friendStats.averageDistance !== null ? String(friendStats.averageDistance) : '—')
        : '—',
      rawMy: myStats.averageDistance,
      rawFriend: friendStats?.averageDistance ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Best Time',
      myValue: formatTime(myStats.bestTime),
      friendValue: friendStats ? formatTime(friendStats.bestTime) : '—',
      rawMy: myStats.bestTime,
      rawFriend: friendStats?.bestTime ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Current Streak',
      myValue: `${myStats.currentStreak} day${myStats.currentStreak !== 1 ? 's' : ''}`,
      friendValue: friendStats
        ? `${friendStats.currentStreak} day${friendStats.currentStreak !== 1 ? 's' : ''}`
        : '—',
      rawMy: myStats.currentStreak,
      rawFriend: friendStats?.currentStreak ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Longest Streak',
      myValue: `${myStats.longestStreak} day${myStats.longestStreak !== 1 ? 's' : ''}`,
      friendValue: friendStats
        ? `${friendStats.longestStreak} day${friendStats.longestStreak !== 1 ? 's' : ''}`
        : '—',
      rawMy: myStats.longestStreak,
      rawFriend: friendStats?.longestStreak ?? null,
      lowerIsBetter: false,
    },
  ];

  return (
    <div className="stats-page">
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
              <th className="stats-col-player">{myName}</th>
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
