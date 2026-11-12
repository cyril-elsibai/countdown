/**
 * =============================================================================
 * GROUP BOARD (Dashboard/GroupBoard.tsx)
 * =============================================================================
 *
 * One group's leaderboard inside the Ranks tab. Today (default): today's daily
 * among members, with who hasn't played yet at the bottom. This week: points
 * since Monday. 100 days: the main ranking's points among members. Invite shares
 * the group link; Rename sets your own alias for it; Leave removes you.
 *
 * @module client/components/Dashboard/GroupBoard
 */

import { useState, useEffect } from 'react';
import { track } from '@vercel/analytics/react';
import { groupsApi, Group, GroupLeaderboardResponse } from '../../api';
import { shareLink } from '../../share';
import { bandFromDifference, formatDuration } from './format';

interface GroupBoardProps {
  group: Group;
  onLeft: () => void;
  onRenamed: (alias: string | null) => void;
  onSelectPlayer: (playerId: string, isMe: boolean) => void;
  myId?: string;
}

export default function GroupBoard({ group, onLeft, onRenamed, onSelectPlayer, myId }: GroupBoardProps) {
  const [period, setPeriod] = useState<'today' | 'week' | 'hundred'>('today');
  const [data, setData] = useState<GroupLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [alias, setAlias] = useState<string | null>(null);  // null = rename form closed

  useEffect(() => {
    setData(null);
    setError(null);
    groupsApi.leaderboard(group.id, period)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load group'));
  }, [group.id, period]);

  const invite = async () => {
    track('group_invite_shared');
    const url = `${window.location.origin}/?group=${group.inviteCode}`;
    const outcome = await shareLink(`Join my 6/7 Numbers group "${group.name}" and let's compare our daily scores.`, url);
    if (outcome === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await groupsApi.rename(group.id, alias ?? '');
      onRenamed(result.alias);
      setAlias(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename group');
    }
  };

  const leave = async () => {
    if (!window.confirm(`Leave "${group.name}"?`)) return;
    try {
      await groupsApi.leave(group.id);
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave group');
    }
  };

  const rowProps = (userId: string) => ({
    role: 'button',
    tabIndex: 0,
    onClick: () => onSelectPlayer(userId, userId === myId),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectPlayer(userId, userId === myId); }
    },
  });

  const memberCount = data?.group.memberCount ?? group.memberCount;

  return (
    <div className="leaderboard-section group-board">
      <div className="you-rank">
        <div className="group-name">
          <div className="group-title" aria-label={`${group.alias || group.name}, ${memberCount} member${memberCount !== 1 ? 's' : ''}`}>
            <b>{group.alias || group.name}</b>
            <span className="count">({memberCount})</span>
          </div>
          {group.alias && <div className="group-real-name">Group name: {group.name}</div>}
        </div>
        <button className="btn line mini" onClick={invite}>{copied ? 'Link copied' : 'Invite'}</button>
      </div>

      {alias !== null && (
        <form className="inline-form new-group" onSubmit={rename}>
          <input
            autoFocus
            value={alias}
            maxLength={40}
            onChange={e => setAlias(e.target.value)}
            placeholder={group.name}
            aria-label="Your name for this group"
          />
          <button type="submit" className="btn ink">Save</button>
        </form>
      )}
      {alias !== null && <div className="dash-note">Only you see this name. Leave it empty to use “{group.name}”.</div>}

      <div className="seg small" role="tablist">
        <button role="tab" aria-selected={period === 'today'} className={period === 'today' ? 'on' : ''} onClick={() => setPeriod('today')}>
          Today
        </button>
        <button role="tab" aria-selected={period === 'week'} className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>
          This week
        </button>
        <button role="tab" aria-selected={period === 'hundred'} className={period === 'hundred' ? 'on' : ''} onClick={() => setPeriod('hundred')}>
          100 days
        </button>
      </div>

      {error ? (
        <div className="dash-note">{error}</div>
      ) : !data || data.period !== period ? (
        <div className="dash-note">Loading...</div>
      ) : data.period === 'today' ? (
        <ol className="list">
          {data.entries.map(e => (
            <li key={e.userId} className={`lrow${e.userId === myId ? ' me' : ''}${e.solved && e.rank! <= 3 ? ' top' : ''}`} {...rowProps(e.userId)}>
              <span className="r">{e.rank ?? '–'}</span>
              <span className="who">{e.name}</span>
              {!e.played ? (
                <span className="sub">Not played</span>
              ) : e.solved ? (
                <span className="chip exact">{(e.duration ?? Infinity) <= 60 ? `${e.duration!.toFixed(2)}s` : formatDuration(e.duration)}</span>
              ) : (
                <span className={`chip ${bandFromDifference(e.difference)}`}>{e.difference} away</span>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <ol className="list">
          {data.entries.map(e => (
            <li key={e.userId} className={`lrow${e.userId === myId ? ' me' : ''}${e.points > 0 && e.rank <= 3 ? ' top' : ''}`} {...rowProps(e.userId)}>
              <span className="r">{e.rank}</span>
              <span className="who">{e.name}</span>
              <span className="pts">{e.points.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}

      {memberCount < 2 && (
        <div className="dash-note">Invite people to start competing.</div>
      )}

      <div className="group-actions">
        <button className="group-leave" onClick={() => setAlias(alias === null ? group.alias ?? '' : null)}>Rename</button>
        <button className="group-leave" onClick={leave}>Leave group</button>
      </div>
    </div>
  );
}
