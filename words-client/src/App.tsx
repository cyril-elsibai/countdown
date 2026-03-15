import { useState, useEffect } from 'react';
import { authApi, wordleApi, setToken, removeToken } from './api';
import type { User, WordleGameState } from './api';
import Game from './components/Game';
import AuthModal from './components/AuthModal';
import ProfileModal from './components/ProfileModal';
import FriendsModal from './components/FriendsModal';
import Dashboard from './components/Dashboard/Dashboard';
import Admin from './components/Admin';
import './App.css';

type Screen = 'loading' | 'pregame' | 'playing' | 'dashboard';

export default function App() {
  if (window.location.pathname === '/admin') {
    return <Admin />;
  }

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [screen, setScreen] = useState<Screen>('loading');
  const [gameState, setGameState] = useState<WordleGameState | null>(null);
  const [isDaily, setIsDaily] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Check auth on mount
  useEffect(() => {
    authApi.me()
      .then(({ user }) => setUser(user))
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  // Load daily challenge on mount
  useEffect(() => {
    if (!authChecked) return;
    loadDaily();
  }, [authChecked]);

  async function loadDaily() {
    setScreen('loading');
    setLoadError('');
    try {
      const state = await wordleApi.getDaily();
      setGameState(state);
      setIsDaily(true);
      setScreen(state.gameOver ? 'playing' : 'pregame');
    } catch {
      setLoadError('Failed to load today\'s word. Please refresh.');
      setScreen('pregame');
    }
  }

  async function playRandom() {
    if (!user) {
      setShowAuth(true);
      return;
    }
    setScreen('loading');
    setLoadError('');
    try {
      const state = await wordleApi.getRandom();
      setGameState(state);
      setIsDaily(false);
      setScreen('playing');
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load random word.');
      setScreen('pregame');
    }
  }

  async function startDaily() {
    if (!gameState) return;
    setScreen('playing');
  }

  function handleAuth(newUser: User, token: string) {
    setToken(token);
    setUser(newUser);
    setShowAuth(false);
    loadDaily();
  }

  function handleSignOut() {
    removeToken();
    setUser(null);
    setShowProfile(false);
  }

  const wordLength = gameState?.word.wordLength;

  async function playWord(wordId: string) {
    setScreen('loading');
    setLoadError('');
    try {
      const state = await wordleApi.getWord(wordId);
      setGameState(state);
      setIsDaily(!!state.word.date);
      setScreen('playing');
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load word.');
      setScreen('pregame');
    }
  }

  return (
    <div className={`app${screen === 'dashboard' ? ' dashboard-view' : ''}`}>
      {/* Header — always visible */}
      <header className="app-header">
        <div className="app-header-inner">
          <button className="logo-btn" onClick={loadDaily}>
            <span className="logo-67">67</span>
            <span className="logo-words">words</span>
          </button>

          <div className="header-right">
            {user ? (
              <>
                {screen !== 'dashboard' && (
                  <button className="bar-btn secondary" onClick={() => setScreen('dashboard')} title="Dashboard">
                    <svg className="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                    </svg>
                  </button>
                )}
                <button className="bar-btn secondary" onClick={() => setShowFriends(true)} title="Friends">
                  <svg className="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </button>
                <button className="bar-btn secondary" onClick={() => setShowProfile(true)} title={user.name ?? 'Profile'}>
                  <svg className="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                </button>
              </>
            ) : (
              <button className="bar-btn primary" onClick={() => setShowAuth(true)}>Sign In</button>
            )}
          </div>
        </div>
      </header>

      {screen !== 'dashboard' && (
        <main className="app-main">
          {screen === 'loading' && (
            <div className="loading-state">Loading…</div>
          )}

          {screen === 'pregame' && gameState && (
            <div className="pregame">
              <div className="pregame-info">
                <div className="pregame-label">Today's Word</div>
                <div className="pregame-name">{gameState.word.name}</div>
                <div className="pregame-length">{wordLength} letters · {gameState.maxGuesses} guesses</div>
              </div>

              {loadError && <p className="load-error">{loadError}</p>}

              {gameState.gameOver ? (
                <>
                  <div className="pregame-done">
                    {gameState.solved ? '✓ Solved' : '✗ Not solved'} — {gameState.answer}
                  </div>
                  <button className="pregame-btn primary" onClick={startDaily}>
                    View Result
                  </button>
                </>
              ) : (
                <button className="pregame-btn primary" onClick={startDaily}>
                  Play Today's Word
                </button>
              )}

              <button className="pregame-btn secondary" onClick={playRandom}>
                {user ? 'Play Random' : 'Sign in to play random'}
              </button>
            </div>
          )}

          {screen === 'playing' && gameState && (
            <Game
              initialState={gameState}
              isDaily={isDaily}
              onPlayRandom={playRandom}
              onDashboard={() => setScreen('dashboard')}
            />
          )}
        </main>
      )}

      {screen === 'dashboard' && (
        <Dashboard
          onPlayWord={playWord}
          onPlayRandom={playRandom}
          onPlayDaily={() => { loadDaily(); }}
        />
      )}

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onAuth={handleAuth} />
      )}

      {showProfile && user && (
        <ProfileModal
          user={user}
          onUserUpdate={u => setUser(u)}
          onClose={() => setShowProfile(false)}
          onLogout={handleSignOut}
        />
      )}

      {showFriends && (
        <FriendsModal onClose={() => setShowFriends(false)} />
      )}
    </div>
  );
}
