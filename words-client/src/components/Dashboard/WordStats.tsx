import { useState, useEffect } from 'react';
import { wordleDashboardApi } from '../../api';
import type { WordleUserStats, WordleStatsResponse } from '../../api';
import { formatDuration as formatTime } from './format';

type Timeframe = 'forever' | 'month' | 'week';

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  forever: 'All time',
  month: '30 days',
  week: '7 days',
};

// Shown in the big number row above; repeated in the table only when comparing
const SUMMARY_LABELS = ['Games played', 'Solved', 'Current streak', 'Longest streak'];

/** Solved games by number of guesses. Neutral bars: no single row is "this game" here. */
function GuessDist({ dist }: { dist: number[] }) {
  const max = Math.max(...dist, 1);
  return (
    <div className="dist">
      {dist.map((count, i) => (
        <div key={i}>
          <em>{i + 1}</em>
          <span
            className={`bar${count === 0 ? ' zero' : ''}`}
            style={count > 0 ? { width: `${Math.max((count / max) * 100, 8)}%` } : undefined}
          >
            {count}
          </span>
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

  if (loading) return <div className="dash-note">Loading stats…</div>;
  if (error) return <div className="dash-note">{error}</div>;
  if (!data) return null;

  const { myStats, friendStats, friendName, friends } = data;
  const mySlice: WordleUserStats | undefined = myStats[timeframe];
  const friendSlice: WordleUserStats | null = friendStats ? (friendStats[timeframe] ?? null) : null;

  if (!mySlice) return <div className="dash-note">Stats unavailable. Please refresh.</div>;

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
      label: 'Games played',
      myValue: String(mySlice.totalGamesPlayed),
      friendValue: friendSlice ? String(friendSlice.totalGamesPlayed) : '—',
      rawMy: mySlice.totalGamesPlayed,
      rawFriend: friendSlice?.totalGamesPlayed ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Solved',
      myValue: `${mySlice.successRate}%`,
      friendValue: friendSlice ? `${friendSlice.successRate}%` : '—',
      rawMy: mySlice.successRate,
      rawFriend: friendSlice?.successRate ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Avg. guesses',
      myValue: mySlice.avgGuesses !== null ? String(mySlice.avgGuesses) : '—',
      friendValue: friendSlice ? (friendSlice.avgGuesses !== null ? String(friendSlice.avgGuesses) : '—') : '—',
      rawMy: mySlice.avgGuesses,
      rawFriend: friendSlice?.avgGuesses ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Best time',
      myValue: formatTime(mySlice.bestTime),
      friendValue: friendSlice ? formatTime(friendSlice.bestTime) : '—',
      rawMy: mySlice.bestTime,
      rawFriend: friendSlice?.bestTime ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Current streak',
      myValue: `${mySlice.currentStreak} day${mySlice.currentStreak !== 1 ? 's' : ''}`,
      friendValue: friendSlice ? `${friendSlice.currentStreak} day${friendSlice.currentStreak !== 1 ? 's' : ''}` : '—',
      rawMy: mySlice.currentStreak,
      rawFriend: friendSlice?.currentStreak ?? null,
      lowerIsBetter: false,
    },
    {
      label: 'Longest streak',
      myValue: `${mySlice.longestStreak} day${mySlice.longestStreak !== 1 ? 's' : ''}`,
      friendValue: friendSlice ? `${friendSlice.longestStreak} day${friendSlice.longestStreak !== 1 ? 's' : ''}` : '—',
      rawMy: mySlice.longestStreak,
      rawFriend: friendSlice?.longestStreak ?? null,
      lowerIsBetter: false,
    },
  ];

  return (
    <div className="stats-page">
      <div className="seg small" role="tablist">
        {(['forever', 'month', 'week'] as Timeframe[]).map(tf => (
          <button
            key={tf}
            role="tab"
            aria-selected={timeframe === tf}
            className={timeframe === tf ? 'on' : ''}
            onClick={() => setTimeframe(tf)}
          >
            {TIMEFRAME_LABELS[tf]}
          </button>
        ))}
      </div>

      <div className="statrow">
        <div><b>{mySlice.totalGamesPlayed}</b><span>Played</span></div>
        <div><b>{mySlice.successRate}</b><span>Solved %</span></div>
        <div><b>{mySlice.currentStreak}</b><span>Streak</span></div>
        <div><b>{mySlice.longestStreak}</b><span>Longest</span></div>
      </div>

      {mySlice.totalGamesPlayed > 0 && (
        <section className="stats-block">
          <h3 className="section-label">Guess distribution</h3>
          <div className={comparing && friendSlice ? 'dist-cols' : ''}>
            <div>
              {comparing && friendSlice && <p className="sub">You</p>}
              <GuessDist dist={mySlice.guessDist} />
            </div>
            {comparing && friendSlice && (
              <div>
                <p className="sub">{friendName || 'Friend'}</p>
                <GuessDist dist={friendSlice.guessDist} />
              </div>
            )}
          </div>
        </section>
      )}

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

        {/* The better value is bold with a dot. Not green: green means "right letter" everywhere else. */}
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
