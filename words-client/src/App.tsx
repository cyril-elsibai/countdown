import { useState, useEffect } from 'react';
import { authApi, wordleApi, setToken, removeToken } from './api';
import type { User, WordleGameState } from './api';
import { loadWordLists } from './wordlist';
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
  const [authInitialView, setAuthInitialView] = useState<'login' | 'register'>('login');
  const [showProfile, setShowProfile] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [screen, setScreen] = useState<Screen>('loading');
  const [gameState, setGameState] = useState<WordleGameState | null>(null);
  const [isDaily, setIsDaily] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Load word lists and check auth on mount (in parallel)
  useEffect(() => {
    loadWordLists().catch(() => {}); // non-blocking; isValidWord fails open if not loaded
    authApi.me()
      .then(({ user }) => setUser(user))
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  // Initial load on mount: logged-in user with completed daily → dashboard
  useEffect(() => {
    if (!authChecked) return;
    setScreen('loading');
    wordleApi.getDaily()
      .then(state => {
        setGameState(state);
        setIsDaily(true);
        if (state.gameOver && user) {
          setScreen('dashboard');
        } else if (state.gameOver) {
          setScreen('playing');
        } else {
          setScreen('pregame');
        }
      })
      .catch(() => {
        setLoadError('Failed to load today\'s word. Please refresh.');
        setScreen('pregame');
      });
  }, [authChecked]);

  // Explicit navigation to daily (from dashboard or landing modal)
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

  async function handleAuth(newUser: User, token: string) {
    setToken(token);
    setUser(newUser);
    setShowAuth(false);
    setScreen('loading');
    try {
      const state = await wordleApi.getDaily();
      setGameState(state);
      setIsDaily(true);
      setScreen(state.gameOver ? 'dashboard' : 'playing');
    } catch (err) {
      console.error('handleAuth loadDaily failed:', err);
      setScreen('pregame');
    }
  }

  function handleSignOut() {
    removeToken();
    setUser(null);
    setShowProfile(false);
    setScreen('pregame');
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
          <div className="logo-wrap">
            <img className="site-logo" src="/logo.png" alt="6/7 Words" onClick={loadDaily} />
          </div>
          <div className="user-bar">
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
              screen !== 'playing' && (
                <button className="bar-btn primary" onClick={() => setShowAuth(true)}>Sign In</button>
              )
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
            <>
              <div className="landing-overlay" />
              <div className="landing-modal">
                <img src="/logo.png" className="landing-logo" alt="6/7 Words" />
                <p className="landing-headline">6/7 Words</p>
                <p className="landing-desc">Six guesses to uncover a hidden 6 or 7 letter word. Each attempt reveals which letters are in the word and which are in the right position. Register to challenge your friends!</p>
                {loadError && <p className="load-error">{loadError}</p>}
                <div className="landing-actions">
                  {user ? (
                    <>
                      <button className="landing-btn login" onClick={startDaily}>
                        {gameState.gameOver ? 'View Result' : "Play Today's Word"}
                      </button>
                      <button className="landing-btn register" onClick={playRandom}>Play Random</button>
                    </>
                  ) : (
                    <>
                      <button className="landing-btn login" onClick={() => { setAuthInitialView('login'); setShowAuth(true); }}>Login</button>
                      <button className="landing-btn register" onClick={() => { setAuthInitialView('register'); setShowAuth(true); }}>Register</button>
                      <button className="landing-btn guest" onClick={startDaily}>Continue as guest</button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {screen === 'playing' && gameState && (
            <Game
              initialState={gameState}
              isDaily={isDaily}
              userId={user?.id ?? null}
              onPlayRandom={playRandom}
              onDashboard={() => setScreen('dashboard')}
              onRegister={() => { setAuthInitialView('register'); setShowAuth(true); }}
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
        <AuthModal onClose={() => setShowAuth(false)} onAuth={handleAuth} initialView={authInitialView} />
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
