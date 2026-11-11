import { useState, useEffect } from 'react';
import { dashboardApi, UserStats, StatsResponse } from '../../api';

export type Timeframe = 'forever' | 'month' | 'week';

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  forever: 'All time',
  month: '30 days',
  week: '7 days',
};

// Shown as big numbers at the top; the details table repeats them only when comparing
const SUMMARY_LABELS = ['Games played', 'Success rate', 'Current streak', 'Longest streak'];

export const formatTime = (seconds: number | null | undefined): string => {
  if (seconds == null) return '—';
  if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${seconds.toFixed(2)}s`;
};

/** All time / 30 days / 7 days. Also used by the player sheet. */
export function TimeframePicker({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
  return (
    <div className="seg small" role="tablist">
      {(['forever', 'month', 'week'] as Timeframe[]).map(tf => (
        <button
          key={tf}
          role="tab"
          aria-selected={value === tf}
          className={value === tf ? 'on' : ''}
          onClick={() => onChange(tf)}
        >
          {TIMEFRAME_LABELS[tf]}
        </button>
      ))}
    </div>
  );
}

/** Big numbers + distance chart for one player. Also used by the player sheet. */
export function StatsSummary({ slice }: { slice: UserStats }) {
  // Distance distribution, in the game's three color bands. Absent on older servers;
  // servers still on the 4-bucket shape send within5/within10 instead of close.
  const dist = slice.distanceDist;
  const distRows = dist
    ? [
        { label: 'Exact', value: dist.exact, band: 'exact' },
        { label: '1–10', value: dist.close ?? (dist.within5 ?? 0) + (dist.within10 ?? 0), band: 'close' },
        { label: '11+', value: dist.further, band: 'far' },
      ]
    : [];
  const distMax = Math.max(1, ...distRows.map(r => r.value));

  return (
    <>
      <div className="statrow">
        <div><b>{slice.totalGamesPlayed}</b><span>Played</span></div>
        <div><b>{slice.successRate}</b><span>Solved %</span></div>
        <div><b>{slice.currentStreak}</b><span>Streak</span></div>
        <div><b>{slice.longestStreak}</b><span>Longest</span></div>
      </div>

      {distRows.length > 0 && slice.totalGamesPlayed > 0 && (
        <section className="stats-block">
          <h3 className="section-label">Distance from target</h3>
          <div className="dist">
            {distRows.map(row => (
              <div key={row.label}>
                <em>{row.label}</em>
                {row.value > 0 ? (
                  <span className={`bar ${row.band}-bg`} style={{ width: `${(row.value / distMax) * 100}%` }}>
                    {row.value}
                  </span>
                ) : (
                  <span className="bar zero">0</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

interface StatsProps {
  /** Opened from a player sheet: compare with this player, friend or not */
  compareWith?: { id: string; name: string } | null;
}

export default function Stats({ compareWith = null }: StatsProps) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<string>(compareWith?.id ?? '');
  const [comparing, setComparing] = useState(!!compareWith);
  const [timeframe, setTimeframe] = useState<Timeframe>('forever');

  useEffect(() => {
    load(compareWith?.id);
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

  if (loading) return <div className="dash-note">Loading stats...</div>;
  if (error) return <div className="dash-note">{error}</div>;
  if (!data) return null;

  const { myStats, friendStats, friendName } = data;
  // A player opened from a sheet joins the dropdown for this comparison
  const friends = compareWith && !data.friends.some(f => f.id === compareWith.id)
    ? [...data.friends, { id: compareWith.id, name: compareWith.name }]
    : data.friends;
  const myStatsSlice: UserStats | undefined = myStats[timeframe];
  const friendStatsSlice: UserStats | null = friendStats ? (friendStats[timeframe] ?? null) : null;

  if (!myStatsSlice) return <div className="dash-note">Stats unavailable — please refresh.</div>;

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
      label: 'Games played',
      myValue: String(myStatsSlice.totalGamesPlayed),
      friendValue: friendStatsSlice ? String(friendStatsSlice.totalGamesPlayed) : '—',
      rawMy: myStatsSlice.totalGamesPlayed,
      rawFriend: friendStatsSlice?.totalGamesPlayed ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Success rate',
      myValue: `${myStatsSlice.successRate}%`,
      friendValue: friendStatsSlice ? `${friendStatsSlice.successRate}%` : '—',
      rawMy: myStatsSlice.successRate,
      rawFriend: friendStatsSlice?.successRate ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Exact solves',
      myValue: String(myStatsSlice.perfectSolves),
      friendValue: friendStatsSlice ? String(friendStatsSlice.perfectSolves) : '—',
      rawMy: myStatsSlice.perfectSolves,
      rawFriend: friendStatsSlice?.perfectSolves ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Avg. miss',
      myValue: myStatsSlice.averageDistance !== null ? String(myStatsSlice.averageDistance) : '—',
      friendValue: friendStatsSlice
        ? (friendStatsSlice.averageDistance !== null ? String(friendStatsSlice.averageDistance) : '—')
        : '—',
      // No miss yet is the best possible: compare it as 0, not as "no value"
      rawMy: myStatsSlice.totalGamesPlayed > 0 ? (myStatsSlice.averageDistance ?? 0) : null,
      rawFriend: friendStatsSlice && friendStatsSlice.totalGamesPlayed > 0 ? (friendStatsSlice.averageDistance ?? 0) : null,
      lowerIsBetter: true,
    },
    {
      label: 'Best time',
      myValue: formatTime(myStatsSlice.bestTime),
      friendValue: friendStatsSlice ? formatTime(friendStatsSlice.bestTime) : '—',
      rawMy: myStatsSlice.bestTime,
      rawFriend: friendStatsSlice?.bestTime ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Current streak',
      myValue: `${myStatsSlice.currentStreak} day${myStatsSlice.currentStreak !== 1 ? 's' : ''}`,
      friendValue: friendStatsSlice
        ? `${friendStatsSlice.currentStreak} day${friendStatsSlice.currentStreak !== 1 ? 's' : ''}`
        : '—',
      rawMy: myStatsSlice.currentStreak,
      rawFriend: friendStatsSlice?.currentStreak ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Longest streak',
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
      <TimeframePicker value={timeframe} onChange={setTimeframe} />

      <StatsSummary slice={myStatsSlice} />

      <section className="stats-block">
        <div className="picker">
          <h3 className="section-label">{comparing ? 'Compare' : 'Details'}</h3>
          {friends.length > 0 ? (
            <select
              id="friend-select"
              aria-label="Compare with a friend"
              value={selectedFriend}
              onChange={e => handleFriendChange(e.target.value)}
            >
              <option value="">Compare with…</option>
              {friends.map(f => (
                <option key={f.id} value={f.id}>{f.name || 'Unnamed'}</option>
              ))}
            </select>
          ) : (
            <span className="sub">Add friends to compare</span>
          )}
        </div>

        {/* The better value is bold with a dot. Not green: green means "exact" everywhere else. */}
        <table className="cmp">
          {comparing && (
            <thead>
              <tr>
                <th />
                <th>You</th>
                <th>{friendName || 'Friend'}</th>
              </tr>
            </thead>
          )}
          <tbody>
            {rows.filter(row => comparing || !SUMMARY_LABELS.includes(row.label)).map(row => {
              const w = winner(row.rawMy, row.rawFriend, row.lowerIsBetter);
              return (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className={comparing && w === 'me' ? 'win' : ''}>{row.myValue}</td>
                  {comparing && <td className={w === 'friend' ? 'win' : ''}>{row.friendValue}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
