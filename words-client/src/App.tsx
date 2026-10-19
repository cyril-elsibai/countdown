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
import HelpSheet from './components/HelpSheet';
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
  const [showHelp, setShowHelp] = useState(false);

  // dvh ignores iOS Chrome's bottom bar; the game layout sizes itself from the real inner height
  useEffect(() => {
    const setRealVh = () => document.documentElement.style.setProperty('--real-vh', `${window.innerHeight}px`);
    setRealVh();
    window.addEventListener('resize', setRealVh);
    return () => window.removeEventListener('resize', setRealVh);
  }, []);

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

  async function submitGuestGames() {
    const prefix = 'wg-';
    for (const key of Object.keys(localStorage).filter(k => k.startsWith(prefix))) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const { guesses, solved, gameOver } = JSON.parse(raw) as { guesses: string[]; solved?: boolean; gameOver?: boolean };
        if (!gameOver || !Array.isArray(guesses) || guesses.length === 0) continue;
        const wordId = key.slice(prefix.length);
        try {
          await wordleApi.submitResult(wordId, guesses, solved ?? false);
        } catch (err: any) {
          if (err.message !== 'Already submitted') continue; // leave it for next login
        }
        localStorage.removeItem(key);
      } catch {}
    }
  }

  async function handleAuth(newUser: User, token: string) {
    setToken(token);
    setUser(newUser);
    setShowAuth(false);
    setScreen('loading');
    await submitGuestGames();
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

  const dateLabel = gameState?.word.date
    ? new Date(gameState.word.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : null;

  return (
    <div className={`app${screen === 'playing' ? ' game-view' : ''}`}>
      <header className="app-head">
        <div className="head-l">
          <button className="icon-btn" onClick={() => setShowHelp(true)} aria-label="How to play" title="How to play">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><path d="M12 17.2v.1"/></svg>
          </button>
        </div>
        <button className="wordmark" onClick={loadDaily}>6/7 Words</button>
        <div className="head-r">
          {user ? (
            <>
              <button className="icon-btn" onClick={() => setShowFriends(true)} aria-label="Friends" title="Friends">
                <svg viewBox="0 0 24 24"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3"/><path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6"/></svg>
              </button>
              {screen !== 'dashboard' && (
                <button className="icon-btn" onClick={() => setScreen('dashboard')} aria-label="Dashboard" title="Dashboard">
                  <svg viewBox="0 0 24 24"><path d="M5 20v-8M12 20V5M19 20v-5"/></svg>
                </button>
              )}
              <button className="icon-btn" onClick={() => setShowProfile(true)} aria-label="Profile" title={user.name ?? 'Profile'}>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c.6-3.6 3.6-6 7.5-6s6.9 2.4 7.5 6"/></svg>
              </button>
            </>
          ) : screen !== 'pregame' ? (
            /* The landing screen has its own Log in button */
            <button className="head-signin" onClick={() => { setAuthInitialView('login'); setShowAuth(true); }}>Log in</button>
          ) : null}
        </div>
      </header>

      {screen === 'loading' && <div className="loading">Loading…</div>}

      {screen === 'pregame' && (
        <main className="landing">
          <div className="landing-mark">6/7</div>
          <h1 className="landing-title">6/7 Words</h1>
          <p className="landing-desc">Find the hidden 6 or 7 letter word in six guesses.</p>
          {loadError && <p className="load-error">{loadError}</p>}
          {gameState && (
            <div className="landing-actions">
              {user ? (
                <>
                  <button className="btn ink" onClick={startDaily}>
                    {gameState.gameOver ? 'See your result' : "Play today's word"}
                  </button>
                  <button className="btn line" onClick={playRandom}>Random word</button>
                </>
              ) : (
                <>
                  <button className="btn ink" onClick={startDaily}>Play</button>
                  <button className="btn line" onClick={() => { setAuthInitialView('login'); setShowAuth(true); }}>Log in</button>
                  <button className="btn text" onClick={() => { setAuthInitialView('register'); setShowAuth(true); }}>Create an account</button>
                </>
              )}
            </div>
          )}
          {gameState?.word.name && (
            <p className="landing-date">
              {dateLabel && <b>{dateLabel}</b>}
              {gameState.word.name} · {gameState.word.wordLength} letters
            </p>
          )}
        </main>
      )}

      {screen === 'playing' && gameState && (
        <Game
          key={gameState.word.id}
          initialState={gameState}
          isDaily={isDaily}
          userId={user?.id ?? null}
          onPlayRandom={playRandom}
          onDashboard={() => setScreen('dashboard')}
          onRegister={() => { setAuthInitialView('register'); setShowAuth(true); }}
          onLogin={() => { setAuthInitialView('login'); setShowAuth(true); }}
        />
      )}

      {screen === 'dashboard' && (
        <Dashboard
          onPlayWord={playWord}
          onPlayRandom={playRandom}
          onPlayDaily={() => { loadDaily(); }}
        />
      )}

      {showHelp && <HelpSheet onClose={() => setShowHelp(false)} />}

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
