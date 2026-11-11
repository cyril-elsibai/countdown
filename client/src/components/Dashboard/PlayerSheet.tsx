/**
 * =============================================================================
 * PLAYER SHEET (Dashboard/PlayerSheet.tsx)
 * =============================================================================
 *
 * Bottom sheet opened by tapping a name in any leaderboard. Shows that player
 * only (rank, points, the same stats blocks as the Stats tab), friend or not.
 * "Compare with me" hands over to the Stats tab's side-by-side view.
 *
 * @module client/components/Dashboard/PlayerSheet
 */

import { useState, useEffect } from 'react';
import { dashboardApi, friendsApi, PlayerResponse } from '../../api';
import { StatsSummary, TimeframePicker, Timeframe, formatTime } from './Stats';

interface PlayerSheetProps {
  playerId: string;
  onCompare: (player: { id: string; name: string }) => void;
  onClose: () => void;
}

export default function PlayerSheet({ playerId, onCompare, onClose }: PlayerSheetProps) {
  const [data, setData] = useState<PlayerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('forever');
  const [friendState, setFriendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    dashboardApi.getPlayer(playerId)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load player'));
  }, [playerId]);

  const addFriend = async () => {
    if (!data) return;
    setFriendState('sending');
    try {
      await friendsApi.sendRequestToUser(data.player.id);
      setFriendState('sent');
    } catch {
      setFriendState('error');
    }
  };

  const slice = data?.stats[timeframe];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet player-sheet" role="dialog" aria-label={data?.player.name ?? 'Player'}>
        <div className="grab" />
        <div className="sheet-top">
          <div>
            <h2 className="sheet-title">{data?.player.name ?? ' '}</h2>
            {data && (
              <div className="sub">
                {data.rank ? `#${data.rank} · ${data.points.toLocaleString()} pts` : 'Not ranked yet'}
              </div>
            )}
          </div>
          <button className="icon-btn close-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {error ? (
          <div className="dash-note">{error}</div>
        ) : !data || !slice ? (
          <div className="dash-note">Loading...</div>
        ) : (
          <>
            <TimeframePicker value={timeframe} onChange={setTimeframe} />
            <StatsSummary slice={slice} />

            <table className="cmp">
              <tbody>
                <tr><td>Exact solves</td><td>{slice.perfectSolves}</td></tr>
                <tr><td>Avg. distance</td><td>{slice.averageDistance ?? '—'}</td></tr>
                <tr><td>Best time</td><td>{formatTime(slice.bestTime)}</td></tr>
              </tbody>
            </table>

            {data.friendship !== 'self' && (
              <div className="pair">
                <button className="btn ink" onClick={() => onCompare(data.player)}>Compare with me</button>
                {data.friendship === 'friends' ? (
                  <button className="btn line" disabled>Friends</button>
                ) : friendState === 'sent' ? (
                  <button className="btn line" disabled>Request sent</button>
                ) : data.friendship === 'pending' ? (
                  <button className="btn line" disabled>Request pending</button>
                ) : (
                  <button className="btn line" onClick={addFriend} disabled={friendState === 'sending'}>
                    {friendState === 'error' ? 'Try again' : 'Add as friend'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
