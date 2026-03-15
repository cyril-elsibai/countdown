import { useState } from 'react';
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

export default function Dashboard({ onPlayWord, onPlayRandom, onPlayDaily }: Props) {
  const [tab, setTab] = useState<Tab>('daily');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);

  const handleSelectWord = (wordId: string) => {
    setSelectedWordId(wordId);
    setTab('leaderboard');
  };

  const tabLabel = tab === 'daily' ? 'Daily' : tab === 'leaderboard' ? 'Leaderboard' : tab === 'stats' ? 'Stats' : 'History';

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">

        {/* Desktop tabs */}
        <nav className="dashboard-tabs desktop-only">
          {(['daily', 'leaderboard', 'stats', 'history'] as Tab[]).map(t => (
            <button
              key={t}
              className={`dashboard-tab ${tab === t ? 'active' : ''}`}
              onClick={() => { setTab(t); if (t !== 'leaderboard') setSelectedWordId(null); }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>

        {/* Mobile menu */}
        <div className="mobile-menu-bar mobile-only">
          <span className="mobile-active-tab">{tabLabel}</span>
          <button className="burger-btn" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
        {menuOpen && <div className="burger-overlay mobile-only" onClick={() => setMenuOpen(false)} />}
        {menuOpen && (
          <div className="burger-menu mobile-only">
            {(['daily', 'leaderboard', 'stats', 'history'] as Tab[]).map(t => (
              <button
                key={t}
                className={tab === t ? 'active' : ''}
                onClick={() => { setTab(t); if (t !== 'leaderboard') setSelectedWordId(null); setMenuOpen(false); }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}

        <main className="dashboard-content">
          {tab === 'daily' && (
            <WordCalendar onSelectWord={handleSelectWord} onPlayWord={onPlayWord} />
          )}

          {tab === 'leaderboard' && (
            <div>
              {selectedWordId && (
                <button className="back-btn" onClick={() => setSelectedWordId(null)}>
                  ← All-time leaderboard
                </button>
              )}
              <WordLeaderboard wordId={selectedWordId} />
            </div>
          )}

          {tab === 'stats' && <WordStats />}

          {tab === 'history' && (
            <WordHistory onPlayWord={onPlayWord} onSelectWord={handleSelectWord} />
          )}
        </main>

        <div className="dashboard-footer-actions">
          <button className="challenge-btn" onClick={onPlayDaily}>
            Play Today's Word
          </button>
          <button className="challenge-btn random-btn" onClick={onPlayRandom}>
            Play Random
          </button>
        </div>
      </div>
    </div>
  );
}
