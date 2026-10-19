import { useState, useEffect } from 'react';
import { wordleDashboardApi } from '../../api';
import type { WordlePlayHistoryEntry, WordleFriendActivity } from '../../api';
import { formatDuration, formatTimeAgo, ResultChip } from './format';

interface Props {
  onPlayWord: (wordId: string) => void;
  onSelectWord: (wordId: string) => void;
}

type View = 'me' | 'friends';

export default function WordHistory({ onPlayWord, onSelectWord }: Props) {
  const [view, setView] = useState<View>('me');

  const [myHistory, setMyHistory] = useState<WordlePlayHistoryEntry[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState<string | null>(null);

  const [friendActivity, setFriendActivity] = useState<WordleFriendActivity[]>([]);
  const [friendLoading, setFriendLoading] = useState(true);
  const [friendError, setFriendError] = useState<string | null>(null);

  useEffect(() => {
    loadMy();
    loadFriends();
  }, []);

  useEffect(() => {
    const interval = setInterval(loadFriends, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadMy() {
    setMyLoading(true);
    setMyError(null);
    try {
      const res = await wordleDashboardApi.getPlayHistory();
      setMyHistory(res.history);
    } catch (err) {
      setMyError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setMyLoading(false);
    }
  }

  async function loadFriends() {
    setFriendLoading(true);
    setFriendError(null);
    try {
      const res = await wordleDashboardApi.getFriendsActivity(50);
      setFriendActivity(res.activity);
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setFriendLoading(false);
    }
  }

  return (
    <div className="play-history">
      <div className="seg small" role="tablist">
        <button role="tab" aria-selected={view === 'me'} className={view === 'me' ? 'on' : ''} onClick={() => setView('me')}>Me</button>
        <button role="tab" aria-selected={view === 'friends'} className={view === 'friends' ? 'on' : ''} onClick={() => setView('friends')}>Friends</button>
      </div>

      {view === 'me' && (
        myLoading ? <div className="dash-note">Loading…</div>
        : myError ? <div className="dash-note">{myError}</div>
        : myHistory.length === 0 ? <div className="dash-note">No words played yet.</div>
        : (
          <ul className="list">
            {myHistory.map(item => (
              <li key={item.wordId} className="hrow">
                <b>{item.name || 'Random word'} <span className="sub">· {item.wordLength} letters</span></b>
                <span className="when">
                  {formatTimeAgo(item.playedAt)}{item.solved && item.duration != null ? ` · ${formatDuration(item.duration)}` : ''}
                </span>
                <span className="right">
                  <ResultChip solved={item.solved} guessCount={item.guessCount} />
                  <button className="btn mini line" onClick={() => onPlayWord(item.wordId)}>
                    {item.solved || item.guessCount >= 6 ? 'View' : 'Play'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )
      )}

      {view === 'friends' && (
        friendLoading && friendActivity.length === 0 ? <div className="dash-note">Loading…</div>
        : friendError ? <div className="dash-note">{friendError}</div>
        : friendActivity.length === 0 ? <div className="dash-note">Your friends haven't played any words recently.</div>
        : (
          <ul className="list">
            {friendActivity.map(item => (
              <li key={item.id} className="hrow">
                <b>{item.name}</b>
                <span className="when">
                  {item.dailyNumber ? `Daily #${item.dailyNumber}` : 'Random word'} · {formatTimeAgo(item.playedAt)}
                </span>
                <span className="right">
                  <ResultChip solved={item.solved} guessCount={item.solved ? item.guessCount : 6} />
                  <button className="btn mini line" onClick={() => onSelectWord(item.wordId)}>Ranks</button>
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
