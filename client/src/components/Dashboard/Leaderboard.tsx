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
  groupsApi,
  Group,
} from '../../api';
import { bandFromDifference } from './format';
import GroupBoard from './GroupBoard';


interface LeaderboardProps {
  frameId: string | null;
  onSelectFrame: (frameId: string | null) => void;
  /** Tap a name: opens that player's sheet (or your own Stats tab) */
  onSelectPlayer: (playerId: string, isMe: boolean) => void;
  /** Ranks tab only: open on this group (e.g. right after joining it) */
  initialGroupId?: string | null;
  myId?: string;
}

type FilterType = 'global' | 'friends';

export default function Leaderboard({ frameId, onSelectFrame, onSelectPlayer, initialGroupId = null, myId }: LeaderboardProps) {
  // Mode is derived from whether a frameId is provided:
  // - frameId present → per-challenge leaderboard (from tooltip)
  // - no frameId → overall points leaderboard (Main Leaderboard tab)
  const type = frameId ? 'daily' : 'overall';
  const [filter, setFilter] = useState<FilterType>('global');
  const [dailyData, setDailyData] = useState<LeaderboardResponse | null>(null);
  const [overallData, setOverallData] = useState<OverallLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ranks tab scope beyond Global / Friends: one of your groups
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [newGroupName, setNewGroupName] = useState<string | null>(null);  // null = form closed
  const [groupError, setGroupError] = useState<string | null>(null);

  useEffect(() => {
    if (frameId) return;
    groupsApi.list().then(r => setGroups(r.groups)).catch(() => {});
  }, [frameId]);

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName?.trim()) return;
    setGroupError(null);
    try {
      const { group } = await groupsApi.create(newGroupName.trim());
      setGroups([...groups, group]);
      setGroupId(group.id);
      setNewGroupName(null);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Failed to create group');
    }
  };

  // Keep the selected pill visible when the row scrolls sideways
  useEffect(() => {
    document.querySelector('.scopes .on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [groupId, groups]);

  const selectScope = (scope: FilterType | string) => {
    setNewGroupName(null);
    if (scope === 'global' || scope === 'friends') {
      setGroupId(null);
      setFilter(scope);
    } else {
      setGroupId(scope);
    }
  };

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
        const response = await dashboardApi.getOverallLeaderboard(filter);
        setOverallData(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const OVERTIME_SECONDS = 60;

  // Rows open the player sheet; keyboard users get Enter/Space too
  const rowProps = (playerId: string, isMe: boolean) => ({
    role: 'button',
    tabIndex: 0,
    onClick: () => onSelectPlayer(playerId, isMe),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectPlayer(playerId, isMe); }
    },
  });

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

  // Global / Friends, shared by both leaderboards
  const filterTabs = (
    <div className="seg small" role="tablist">
      <button role="tab" aria-selected={filter === 'global'} className={filter === 'global' ? 'on' : ''} onClick={() => setFilter('global')}>
        Global
      </button>
      <button role="tab" aria-selected={filter === 'friends'} className={filter === 'friends' ? 'on' : ''} onClick={() => setFilter('friends')}>
        Friends
      </button>
    </div>
  );

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

        {filterTabs}

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
                {...rowProps(entry.userId, entry.rank === dailyData.userRank)}
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

  // Global / Friends / each group / + New group, scrolls sideways when there are many
  const scopeChips = (
    <>
      <div className="scopes" role="tablist">
        {(['global', 'friends'] as FilterType[]).map(f => (
          <button key={f} role="tab" aria-selected={!groupId && filter === f} className={!groupId && filter === f ? 'on' : ''} onClick={() => selectScope(f)}>
            {f === 'global' ? 'Global' : 'Friends'}
          </button>
        ))}
        {groups.map(g => (
          <button key={g.id} role="tab" aria-selected={groupId === g.id} className={groupId === g.id ? 'on' : ''} onClick={() => selectScope(g.id)}>
            {g.name}
          </button>
        ))}
        <button className="add" onClick={() => setNewGroupName(newGroupName === null ? '' : null)}>+ New group</button>
      </div>
      {newGroupName !== null && (
        <form className="inline-form new-group" onSubmit={createGroup}>
          <input
            autoFocus
            value={newGroupName}
            maxLength={40}
            onChange={e => setNewGroupName(e.target.value)}
            placeholder="Group name, e.g. Office"
            aria-label="Group name"
          />
          <button type="submit" className="btn ink" disabled={!newGroupName.trim()}>Create</button>
        </form>
      )}
      {groupError && <div className="dash-note">{groupError}</div>}
    </>
  );

  const selectedGroup = groups.find(g => g.id === groupId);

  const renderOverallLeaderboard = () => {
    if (selectedGroup) {
      return (
        <div className="leaderboard-section">
          {scopeChips}
          <GroupBoard
            key={selectedGroup.id}
            group={selectedGroup}
            myId={myId}
            onSelectPlayer={onSelectPlayer}
            onLeft={() => { setGroups(groups.filter(g => g.id !== selectedGroup.id)); setGroupId(null); }}
          />
        </div>
      );
    }
    if (!overallData) return null;

    return (
      <div className="leaderboard-section">
        {scopeChips}

        <div className="you-rank">
          <div>
            <h3 className="section-label">Last 100 days</h3>
            {overallData.userRank && <b>#{overallData.userRank}</b>}
          </div>
          {overallData.userRank ? (
            <span className="sub">{overallData.userPoints?.toLocaleString()} pts</span>
          ) : (
            <span className="sub">Not ranked yet. Points update daily.</span>
          )}
        </div>

        {overallData.leaderboard.length === 0 ? (
          <div className="dash-note">
            {filter === 'friends'
              ? 'No points among your friends yet. Invite some from the Friends menu.'
              : 'No points yet. Solve a daily to get on the board.'}
          </div>
        ) : (
          <ol className="list">
            {overallData.leaderboard.map((entry: OverallLeaderboardEntry) => (
              <li
                key={entry.userId}
                className={`lrow${entry.rank === overallData.userRank ? ' me' : ''}${entry.rank <= 3 ? ' top' : ''}`}
                {...rowProps(entry.userId, entry.rank === overallData.userRank)}
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
      {type === 'overall' && selectedGroup ? (
        renderOverallLeaderboard()
      ) : loading ? (
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
