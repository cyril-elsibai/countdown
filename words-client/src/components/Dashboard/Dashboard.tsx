/**
 * Dashboard: four tabs as a segmented control (they fit at phone width, so
 * no burger menu): Daily calendar, Ranks (all-time points), Stats, History.
 * A dock at the bottom always offers today's word and a random one.
 * Mirrors 6/7 Numbers' dashboard so both games work the same way.
 */

import { useState, useEffect } from 'react';
import { wordleApi } from '../../api';
import WordCalendar from './WordCalendar';
import WordLeaderboard from './WordLeaderboard';
import WordStats from './WordStats';
import WordHistory from './WordHistory';
import './Dashboard.css';

interface Props {
  onPlayWord: (wordId: string) => void;
  onPlayRandom: () => void;
  onPlayDaily: () => void;
}

type Tab = 'daily' | 'leaderboard' | 'stats' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'leaderboard', label: 'Ranks' },
  { id: 'stats', label: 'Stats' },
  { id: 'history', label: 'History' },
];

/** Hours until the next daily word (midnight UTC). */
function hoursUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((tomorrow - now.getTime()) / 3600000);
}

export default function Dashboard({ onPlayWord, onPlayRandom, onPlayDaily }: Props) {
  const [tab, setTab] = useState<Tab>('daily');
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [dailyOver, setDailyOver] = useState<boolean | null>(null);

  useEffect(() => {
    wordleApi.getDaily()
      .then(state => setDailyOver(state.gameOver))
      .catch(() => setDailyOver(false));
  }, []);

  // Per-word leaderboard opens inside the Daily tab, with a back link to the calendar
  const handleSelectWord = (wordId: string) => {
    setSelectedWordId(wordId);
    setTab('daily');
  };

  const selectTab = (t: Tab) => {
    setTab(t);
    setSelectedWordId(null);
  };

  return (
    <div className="dashboard-page">
      <nav className="seg dash-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="dashboard-content">
        {tab === 'daily' && !selectedWordId && (
          <WordCalendar onSelectWord={handleSelectWord} onPlayWord={onPlayWord} />
        )}
        {tab === 'daily' && selectedWordId && (
          <>
            <button className="back-btn" onClick={() => setSelectedWordId(null)}>← Calendar</button>
            <WordLeaderboard wordId={selectedWordId} />
          </>
        )}
        {tab === 'leaderboard' && <WordLeaderboard wordId={null} />}
        {tab === 'stats' && <WordStats />}
        {tab === 'history' && (
          <WordHistory onPlayWord={onPlayWord} onSelectWord={handleSelectWord} />
        )}
      </main>

      <div className="dock">
        <button className="btn ink grow" onClick={onPlayDaily}>
          {dailyOver === null ? 'Loading…' : dailyOver ? `Next word in ${hoursUntilTomorrow()}h` : "Play today's word"}
        </button>
        <button className="btn line" onClick={onPlayRandom}>Random</button>
      </div>
    </div>
  );
}
