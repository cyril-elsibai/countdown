import { useState, useEffect, useRef } from 'react';
import { gameApi, authApi, friendsApi, dashboardApi, Frame, clearToken, isLoggedIn, setToken, User, PreviousResult, UserStats } from './api';
import AuthForm from './components/AuthForm';
import ResetPasswordForm from './components/ResetPasswordForm';
import Profile from './components/Profile';
import FriendsModal from './components/FriendsModal';
import Admin from './components/Admin';
import { Dashboard } from './components/Dashboard';
import TutorialModal from './components/TutorialModal';

// Types
type TileState = {
  value: string;
  filled: boolean;
  active: boolean;
};

type Row = {
  num1: TileState;
  operator: TileState;
  num2: TileState;
  result: TileState;
};

type KeyState = {
  value: string;
  used: boolean;
  inactive: boolean;
};

const COUNTDOWN_SECONDS = 60;
const OVERTIME_THRESHOLD = 300; // 5 minutes in seconds

type GamePhase = 'loading' | 'pre-game' | 'countdown' | 'playing';


export default function App() {
  // Check if we're on the admin page
  if (window.location.pathname === '/admin') {
    return <Admin />;
  }

  // Check for /play/:frameId route
  const playMatch = window.location.pathname.match(/^\/play\/(.+)$/);
  const initialFrameId = playMatch ? playMatch[1] : null;

  // Non-logged-in users can only access the daily challenge (home)
  const loggedIn = isLoggedIn();
  const initialRoute = loggedIn
    ? (window.location.pathname === '/dashboard' ? 'dashboard' : initialFrameId ? 'play' : 'home')
    : 'home';

  // Redirect URL to home if not logged in and on a protected route
  if (!loggedIn && (window.location.pathname === '/dashboard' || initialFrameId)) {
    if (initialFrameId) {
      // Preserve the shared frame so we can route there after sign-in
      sessionStorage.setItem('pendingFrame', initialFrameId);
    }
    window.history.replaceState({}, '', '/');
  }

  const [currentRoute, setCurrentRoute] = useState<'home' | 'dashboard' | 'play'>(initialRoute);
  const [playFrameId, setPlayFrameId] = useState<string | null>(loggedIn ? initialFrameId : null);

  const [target, setTarget] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [initCards, setInitCards] = useState<KeyState[]>([]);
  const [calculatedKeys, setCalculatedKeys] = useState<KeyState[]>([
    { value: '', used: false, inactive: true },
    { value: '', used: false, inactive: true },
    { value: '', used: false, inactive: true },
    { value: '', used: false, inactive: true },
  ]);
  const [currentBest, setCurrentBest] = useState(0);
  const [activePosition, setActivePosition] = useState({ row: 0, type: 'num1' as 'num1' | 'operator' | 'num2' });
  const [gameWon, setGameWon] = useState(false);
  const [wonWhileSignedIn, setWonWhileSignedIn] = useState(false);
  const [winTime, setWinTime] = useState(0);
  const [winSteps, setWinSteps] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerStopped, setTimerStopped] = useState(false);
  const [alert, setAlert] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading today's challenge...");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [user, setUser] = useState<{ id: string; email: string; name?: string } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'none' | 'verifying' | 'success' | 'error'>('none');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [pendingFriendCount, setPendingFriendCount] = useState(0);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('tutorialSeen') && !isLoggedIn());
  const [initialAuthMode, setInitialAuthMode] = useState<'login' | 'register'>('login');
  const [previousResult, setPreviousResult] = useState<PreviousResult | null>(null);
  const [dailyPlayed, setDailyPlayed] = useState(false);
  const [dashboardKey, setDashboardKey] = useState(0);
  const [serverStartTime, setServerStartTime] = useState<Date | null>(null);
  const [gamePhase, setGamePhase] = useState<GamePhase>('loading');
  const [countdownNumber, setCountdownNumber] = useState(3);
  const [shakeRow, setShakeRow] = useState<number | null>(null);
  const [resultClosed, setResultClosed] = useState(false);
  const [winStats, setWinStats] = useState<UserStats | null>(null);

  const startTimeRef = useRef(Date.now());
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeFrameRef = useRef<{ id: string; timer: number; best: number } | null>(null);

  // Handle browser back/forward navigation
  useEffect(() => {
    window.scrollTo(0, 0);
    const setRealVh = () => {
      document.documentElement.style.setProperty('--real-vh', `${window.innerHeight}px`);
    };
    setRealVh();
    window.addEventListener('resize', setRealVh);
    return () => window.removeEventListener('resize', setRealVh);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const playMatch = path.match(/^\/play\/(.+)$/);

      // Non-logged-in users can only access home
      if (!isLoggedIn() && (path === '/dashboard' || playMatch)) {
        window.history.replaceState({}, '', '/');
        setCurrentRoute('home');
        setPlayFrameId(null);
        return;
      }

      if (path === '/dashboard') {
        setCurrentRoute('dashboard');
      } else if (playMatch) {
        setCurrentRoute('play');
        setPlayFrameId(playMatch[1]);
        handlePlayHistorical(playMatch[1]);
      } else {
        setCurrentRoute('home');
        setPlayFrameId(null);
        initializeGame();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check for verification or reset token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const path = window.location.pathname;

    // Check if this is a password reset URL
    if (path === '/reset-password' && token) {
      setResetPasswordToken(token);
      // Clean up URL
      window.history.replaceState({}, '', '/');
      return;
    }

    // Check if this is a verification URL (/verify?token=xxx or /?token=xxx)
    if ((path === '/verify' || path === '/') && token) {
      setVerificationStatus('verifying');

      authApi.verify(token)
        .then(async response => {
          setToken(response.token);
          setUser(response.user);

          setVerificationStatus('success');
          setVerificationMessage('Email verified successfully! You are now logged in.');

          // Clean up URL
          window.history.replaceState({}, '', '/');

          // Refresh game data now that user is authenticated
          initializeGame();

          // Clear success message after 5 seconds
          setTimeout(() => setVerificationStatus('none'), 5000);
        })
        .catch(err => {
          // Only show error if user isn't already logged in
          // (token may have been used successfully but page was refreshed)
          if (!isLoggedIn()) {
            setVerificationStatus('error');
            setVerificationMessage(err instanceof Error ? err.message : 'Verification failed');
          }

          // Clean up URL even on error
          window.history.replaceState({}, '', '/');
        });
    }
  }, []);

  // Fetch pending friend request count, poll every 30s
  useEffect(() => {
    if (!user) { setPendingFriendCount(0); return; }
    const fetchCount = () => {
      friendsApi.list()
        .then(response => {
          const count = response.friends.filter(f => f.status === 'PENDING' && f.direction === 'received').length;
          setPendingFriendCount(count);
        })
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Check if user is already logged in
  useEffect(() => {
    if (isLoggedIn()) {
      authApi.me()
        .then(response => setUser(response.user))
        .catch(() => {
          clearToken();
          setUser(null);
        });
    }
  }, []);

  // Redirect to dashboard if the current frame has already been solved
  useEffect(() => {
    if (previousResult?.solved && user && !gameWon) {
      navigateToDashboard();
    }
  }, [previousResult, user, gameWon]);

  // Initialize game — load shared frame directly if URL contains /play/:id and user is logged in
  useEffect(() => {
    if (loggedIn && initialFrameId) {
      handlePlayHistorical(initialFrameId);
    } else {
      initializeGame();
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Timer effect - only starts when game is in 'playing' phase
  useEffect(() => {
    if (gamePhase !== 'playing' || previousResult?.solved) {
      return;
    }

    // If no serverStartTime set yet (fresh start after countdown), set it now
    if (!serverStartTime) {
      const now = new Date();
      setServerStartTime(now);
      startTimeRef.current = now.getTime();
    } else {
      startTimeRef.current = serverStartTime.getTime();
    }

    timerIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setTimer(elapsed);
      if (activeFrameRef.current) activeFrameRef.current.timer = elapsed;

      if (elapsed >= COUNTDOWN_SECONDS && !timerStopped) {
        setTimerStopped(true);
      }
    }, 100);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [gamePhase, serverStartTime, timerStopped, previousResult]);

  // Countdown animation effect (3, 2, 1)
  useEffect(() => {
    if (gamePhase !== 'countdown') return;

    setCountdownNumber(3);
    setTimer(0);
    setTimerStopped(false);

    const timer2 = setTimeout(() => setCountdownNumber(2), 1000);
    const timer1 = setTimeout(() => setCountdownNumber(1), 2000);
    const timerGo = setTimeout(() => {
      setServerStartTime(new Date());
      setGamePhase('playing');
      if (frame && isLoggedIn()) {
        activeFrameRef.current = { id: frame.id, timer: 0, best: 0 };
        gameApi.startFrame(frame.id).catch(() => {});
      }
    }, 3000);

    return () => {
      clearTimeout(timer2);
      clearTimeout(timer1);
      clearTimeout(timerGo);
    };
  }, [gamePhase, frame]);

  // A new game re-opens the result sheet next time it is won
  useEffect(() => {
    if (!gameWon) setResultClosed(false);
  }, [gameWon]);

  // Sync currentBest to activeFrameRef
  useEffect(() => {
    if (activeFrameRef.current) {
      activeFrameRef.current.best = currentBest;
    }
  }, [currentBest]);

  // Save progress on tab/browser close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const active = activeFrameRef.current;
      if (!active) return;
      const token = localStorage.getItem('token');
      if (!token) return;
      const url = (import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001/api`) + `/game/frame/${active.id}/progress`;
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ duration: active.timer, result: active.best }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const initializeGame = async (fromNavigation = false) => {
    setLoading(true);

    try {
      // Fetch daily challenge from backend
      const response = await gameApi.getDaily();
      const { frame: fetchedFrame, startedAt, previousResult: prevResult } = response;

      setFrame(fetchedFrame);
      setTarget(fetchedFrame.targetNumber);
      setPreviousResult(prevResult);
      setDailyPlayed(!!prevResult);

      // Don't set serverStartTime here - defer to when gamePhase transitions to 'playing'

      // Convert tiles to KeyState format
      const cards = fetchedFrame.tiles.map(tile => ({
        value: String(tile),
        used: false,
        inactive: false,
      }));
      setInitCards(cards);

      // Initialize 5 rows
      const initialRows: Row[] = Array(5).fill(null).map(() => ({
        num1: { value: '', filled: false, active: false },
        operator: { value: '', filled: false, active: false },
        num2: { value: '', filled: false, active: false },
        result: { value: '', filled: false, active: false },
      }));

      initialRows[0].num1.active = true;
      setRows(initialRows);
      setActivePosition({ row: 0, type: 'num1' });
      setGameWon(false);
      setWonWhileSignedIn(false);
      // Load previous best result if available (for non-solved attempts)
      setCurrentBest(prevResult?.result ?? 0);
      setCalculatedKeys([
        { value: '', used: false, inactive: true },
        { value: '', used: false, inactive: true },
        { value: '', used: false, inactive: true },
        { value: '', used: false, inactive: true },
      ]);
      // Set game phase based on auth status
      if (prevResult) {
        // Already played (solved or not) — skip countdown, restore previous time
        restoreTimerFromResult(prevResult);
        if (!prevResult.solved && prevResult.duration != null && prevResult.duration > 0) {
          setServerStartTime(new Date(Date.now() - prevResult.duration * 1000));
          activeFrameRef.current = { id: fetchedFrame.id, timer: prevResult.duration, best: prevResult.result ?? 0 };
        }
        setGamePhase('playing');
      } else if (!fromNavigation && isLoggedIn() && startedAt && (Date.now() - new Date(startedAt).getTime()) > 30000) {
        // Mid-game page reload — startedAt is old enough to be a real in-progress session
        setServerStartTime(new Date(startedAt));
        setGamePhase('playing');
      } else if (isLoggedIn()) {
        setGamePhase('countdown'); // Fresh game, start countdown
      } else {
        setGamePhase('pre-game'); // Show sign-in / guest overlay
      }
    } catch (error) {
      console.error('Failed to load game:', error);
      showAlert('Failed to load game. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (message: string, type: 'error' | 'success' = 'error', duration: number = 1500) => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), duration);
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setCurrentRoute('home');
    setPlayFrameId(null);
    setDailyPlayed(false);
    window.history.replaceState({}, '', '/');
    // Reload the daily challenge so we don't show a stale frame
    initializeGame();
  };

  const handleAuthSuccess = async (loggedInUser: { id: string; email: string; name?: string }) => {
    setUser(loggedInUser);
    setShowAuthModal(false);

    // If the user arrived via a shared frame link, route there now
    const pendingFrameId = sessionStorage.getItem('pendingFrame');
    if (pendingFrameId) {
      sessionStorage.removeItem('pendingFrame');
      handlePlayHistorical(pendingFrameId);
      return;
    }

    // Re-fetch daily data now that we're authenticated
    if (currentRoute === 'home' && frame) {
      try {
        const response = await gameApi.getDaily();
        const { previousResult: prevResult, startedAt } = response;
        setPreviousResult(prevResult);
        setDailyPlayed(!!prevResult);

        if (prevResult) {
          // Already played — restore timer, skip countdown
          restoreTimerFromResult(prevResult);
          if (!prevResult.solved && prevResult.duration != null && prevResult.duration > 0) {
            setServerStartTime(new Date(Date.now() - prevResult.duration * 1000));
            if (frame) activeFrameRef.current = { id: frame.id, timer: prevResult.duration, best: prevResult.result ?? 0 };
          }
          setGamePhase('playing');
        } else if (startedAt && (Date.now() - new Date(startedAt).getTime()) > 30000) {
          // Mid-game resume — startedAt is old enough to be a real in-progress session
          setServerStartTime(new Date(startedAt));
          setGamePhase('playing');
        } else {
          // Fresh game (startedAt was just created by getDaily) — show countdown
          setGamePhase('countdown');
        }
      } catch (err) {
        console.error('Failed to refresh daily data after login:', err);
        setGamePhase('countdown');
      }
    }
  };

  const handleResetPasswordSuccess = () => {
    setResetPasswordToken(null);
    window.history.replaceState({}, '', '/');
    setShowAuthModal(true);
  };

  const handleResetPasswordCancel = () => {
    setResetPasswordToken(null);
    window.history.replaceState({}, '', '/');
  };

  const handleUserUpdate = (updatedUser: User) => {
    setUser(updatedUser);
  };

  const restoreTimerFromResult = (prevResult: PreviousResult) => {
    if (prevResult.duration != null && prevResult.duration > 0) {
      setTimer(prevResult.duration);
      setTimerStopped(prevResult.duration >= COUNTDOWN_SECONDS);
    } else if (prevResult.result != null) {
      // Has a submitted result but duration missing — show overtime
      setTimer(COUNTDOWN_SECONDS);
      setTimerStopped(true);
    }
    // If result is null too (just opened, never submitted) — leave timer at 0
  };

  const saveActiveFrameProgress = () => {
    const active = activeFrameRef.current;
    if (!active) return;
    gameApi.saveProgress(active.id, active.timer, active.best).catch(() => {});
    activeFrameRef.current = null;
  };

  const navigateToDashboard = () => {
    saveActiveFrameProgress();
    setCurrentRoute('dashboard');
    setDashboardKey(k => k + 1);
    window.history.pushState({}, '', '/dashboard');
  };

  const navigateToHome = () => {
    saveActiveFrameProgress();
    setCurrentRoute('home');
    setPlayFrameId(null);
    window.history.pushState({}, '', '/');
    // Reload daily challenge
    initializeGame(true);
  };

  const handlePlayHistorical = async (frameId: string, frameName?: string) => {
    saveActiveFrameProgress();
    setLoadingMessage(frameName ? `Loading ${frameName}...` : 'Loading challenge...');
    setLoading(true);
    setCurrentRoute('play');
    setPlayFrameId(frameId);
    window.history.pushState({}, '', `/play/${frameId}`);

    try {
      const response = await gameApi.playHistoricalFrame(frameId);
      const { frame: fetchedFrame, startedAt, previousResult: prevResult } = response;

      setFrame(fetchedFrame);
      setTarget(fetchedFrame.targetNumber);
      setPreviousResult(prevResult);

      // Convert tiles to KeyState format
      const cards = fetchedFrame.tiles.map(tile => ({
        value: String(tile),
        used: false,
        inactive: false,
      }));
      setInitCards(cards);

      // Initialize 5 rows
      const initialRows: Row[] = Array(5).fill(null).map(() => ({
        num1: { value: '', filled: false, active: false },
        operator: { value: '', filled: false, active: false },
        num2: { value: '', filled: false, active: false },
        result: { value: '', filled: false, active: false },
      }));

      initialRows[0].num1.active = true;
      setRows(initialRows);
      setActivePosition({ row: 0, type: 'num1' });
      setGameWon(false);
      setWonWhileSignedIn(false);
      setCurrentBest(prevResult?.result ?? 0);
      setCalculatedKeys([
        { value: '', used: false, inactive: true },
        { value: '', used: false, inactive: true },
        { value: '', used: false, inactive: true },
        { value: '', used: false, inactive: true },
      ]);

      // Reset timer state
      setTimer(0);
      setTimerStopped(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setServerStartTime(null);

      if (prevResult) {
        // Already started (solved or not) — skip countdown, restore timer if available
        restoreTimerFromResult(prevResult);
        if (!prevResult.solved) {
          activeFrameRef.current = { id: fetchedFrame.id, timer: prevResult.duration ?? 0, best: prevResult.result ?? 0 };
          if (prevResult.duration != null && prevResult.duration > 0) {
            setServerStartTime(new Date(Date.now() - prevResult.duration * 1000));
          }
        }
        setGamePhase('playing');
      } else {
        setGamePhase('countdown');
      }
    } catch (error) {
      console.error('Failed to load historical frame:', error);
      showAlert('Failed to load challenge. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    const name = frame?.name ?? 'a challenge';
    const timeStr = winTime <= OVERTIME_THRESHOLD ? `${winTime.toFixed(1)}s` : 'overtime';
    // One square per step, colored by distance band: shows the path without spoiling the answer
    const text = `6/7 Numbers · ${name}\n${target} in ${timeStr}\n${shareSquares()}`;
    const url = `${window.location.origin}/play/${frame?.id}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: '6/7 Numbers', text, url });
      } catch {
        // user cancelled — do nothing
      }
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  };

  const handlePlayRandom = async () => {
    saveActiveFrameProgress();
    setLoading(true);
    try {
      const response = await gameApi.getRandom();
      const { frame: fetchedFrame, startedAt } = response;

      setCurrentRoute('play');
      setPlayFrameId(fetchedFrame.id);
      window.history.pushState({}, '', `/play/${fetchedFrame.id}`);

      setFrame(fetchedFrame);
      setTarget(fetchedFrame.targetNumber);
      setPreviousResult(null); // New random frame, no previous result

      // Convert tiles to KeyState format
      const cards = fetchedFrame.tiles.map(tile => ({
        value: String(tile),
        used: false,
        inactive: false,
      }));
      setInitCards(cards);

      // Initialize 5 rows
      const initialRows: Row[] = Array(5).fill(null).map(() => ({
        num1: { value: '', filled: false, active: false },
        operator: { value: '', filled: false, active: false },
        num2: { value: '', filled: false, active: false },
        result: { value: '', filled: false, active: false },
      }));

      initialRows[0].num1.active = true;
      setRows(initialRows);
      setActivePosition({ row: 0, type: 'num1' });
      setGameWon(false);
      setWonWhileSignedIn(false);
      setCurrentBest(0);
      setCalculatedKeys([
        { value: '', used: false, inactive: true },
        { value: '', used: false, inactive: true },
        { value: '', used: false, inactive: true },
        { value: '', used: false, inactive: true },
      ]);

      // Reset timer state
      setTimer(0);
      setTimerStopped(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setServerStartTime(null);
      setGamePhase('countdown');
    } catch (error) {
      console.error('Failed to generate random frame:', error);
      showAlert('Failed to generate random challenge. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Distance band drives every color in the UI: exact (green), within 10 (amber), further (gray).
  // Bands follow Countdown's own scoring thresholds.
  const band = (value: number): 'exact' | 'close' | 'far' => {
    const diff = Math.abs(target - value);
    if (diff === 0) return 'exact';
    if (diff <= 10) return 'close';
    return 'far';
  };

  // Operators are stored as ASCII '-' and '/' (server expression format); shown as typographic minus/divide
  const displayOp = (op: string) => (op === '-' ? '−' : op === '/' ? '÷' : op);

  const shareSquares = () => {
    const squares: Record<string, string> = { exact: '🟩', close: '🟨', far: '⬛' };
    return rows
      .filter(row => row.result.filled)
      .map(row => squares[band(parseInt(row.result.value))])
      .join('');
  };

  const handleKeyPress = (value: string, isCalculated: boolean, calcKeyIndex?: number, initCardIndex?: number) => {
    const { row, type } = activePosition;
    const currentRow = rows[row];

    const isNumber = type === 'num1' || type === 'num2';
    const keyIsNumber = !['+', '-', '×', '/'].includes(value);

    if (isNumber !== keyIsNumber) return;

    // Validate the step before consuming anything: an invalid operation
    // (e.g. 5 − 8) must leave the tile available instead of silently using it up.
    const result = type === 'num2'
      ? calculateResult(parseInt(currentRow.num1.value), currentRow.operator.value, parseInt(value))
      : null;
    if (result?.error) {
      showAlert(result.error);
      setShakeRow(row);
      setTimeout(() => setShakeRow(null), 400);
      return;
    }

    const newRows = [...rows];
    newRows[row] = { ...currentRow };
    newRows[row][type] = { value, filled: true, active: false };

    // Track calculated keys updates in a single array to avoid state overwrites
    let newCalcKeys = [...calculatedKeys];

    // Mark the used key as inactive (the step is known to be valid at this point)
    if (isNumber) {
      if (isCalculated && calcKeyIndex !== undefined) {
        newCalcKeys[calcKeyIndex] = { ...newCalcKeys[calcKeyIndex], used: true, inactive: true };
      } else if (!isCalculated && initCardIndex !== undefined) {
        const newInitCards = [...initCards];
        newInitCards[initCardIndex] = { ...newInitCards[initCardIndex], used: true, inactive: true };
        setInitCards(newInitCards);
      }
    }

    if (type === 'num2' && result) {
      newRows[row].result = { value: result.value, filled: true, active: false };

      const newValue = parseInt(result.value);
      const currentDiff = Math.abs(target - currentBest);
      const newDiff = Math.abs(target - newValue);

      if (newDiff <= currentDiff || currentBest === 0) {
        setCurrentBest(newValue);
      }

      if (Math.abs(target - newValue) === 0) {
        const endTime = serverStartTime
          ? (Date.now() - serverStartTime.getTime()) / 1000
          : timer;
        setWinTime(parseFloat(endTime.toFixed(2)));
        setWinSteps(row + 1);
        setGameWon(true);
        setWonWhileSignedIn(!!user);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setRows(newRows);
        setCalculatedKeys(newCalcKeys);

        activeFrameRef.current = null;

        if (frame) {
          const expression = buildExpression(newRows, row + 1);

          if (user) {
            // Signed in user - submit to backend with time tracking
            // Stats for the result sheet are fetched after the submit lands, so they include this win
            setWinStats(null);
            gameApi.submit(frame.id, expression, parseFloat(endTime.toFixed(2)), newValue)
              .then(() => dashboardApi.getStats())
              .then(res => setWinStats(res.myStats.forever ?? null))
              .catch(err => console.error('Failed to submit solution:', err));
            if (frame.date) setDailyPlayed(true);
          }
        }
        return;
      }

      if (row < 4) {
        const emptyIndex = newCalcKeys.findIndex(k => !k.value);
        if (emptyIndex !== -1) {
          newCalcKeys[emptyIndex] = { value: result.value, used: false, inactive: false };
        }

        newRows[row + 1].num1.active = true;
        setActivePosition({ row: row + 1, type: 'num1' });
      }
      // Last row filled without solving: the game isn't over (undo / clear), so the timer keeps running
    } else {
      const nextType = type === 'num1' ? 'operator' : 'num2';
      newRows[row][nextType].active = true;
      setActivePosition({ row, type: nextType });
    }

    setRows(newRows);
    setCalculatedKeys(newCalcKeys);
  };

  const calculateResult = (num1: number, operator: string, num2: number) => {
    let result: number;
    
    switch (operator) {
      case '+':
        result = num1 + num2;
        break;
      case '-':
        if (num2 >= num1) return { error: 'Result must be positive', value: '' };
        result = num1 - num2;
        break;
      case '×':
        result = num1 * num2;
        break;
      case '/':
        result = num1 / num2;
        if (!Number.isInteger(result)) return { error: 'Result must be a whole number', value: '' };
        break;
      default:
        return { error: 'Invalid operator', value: '' };
    }
    
    return { error: null, value: String(result) };
  };

  // Build expression string from completed rows for backend submission
  const buildExpression = (completedRows: Row[], stepCount: number): string => {
    const expressions: string[] = [];
    for (let i = 0; i < stepCount; i++) {
      const row = completedRows[i];
      if (row.result.filled) {
        const op = row.operator.value === '×' ? '*' : row.operator.value;
        expressions.push(`(${row.num1.value} ${op} ${row.num2.value})`);
      }
    }
    return expressions.join(' -> ');
  };

  const deleteRow = (rowIndex: number) => {
    const newRows = [...rows];
    const rowToDelete = newRows[rowIndex];

    const valuesToReactivate: string[] = [];
    if (rowToDelete.num1.filled) valuesToReactivate.push(rowToDelete.num1.value);
    if (rowToDelete.num2.filled) valuesToReactivate.push(rowToDelete.num2.value);
    const resultValue = rowToDelete.result.value;

    newRows[rowIndex] = {
      num1: { value: '', filled: false, active: false },
      operator: { value: '', filled: false, active: false },
      num2: { value: '', filled: false, active: false },
      result: { value: '', filled: false, active: false },
    };

    const newInitCards = [...initCards];
    const newCalcKeys = [...calculatedKeys];

    valuesToReactivate.forEach(value => {
      const initIndex = newInitCards.findIndex(k => k.value === value && k.used);
      if (initIndex !== -1) {
        newInitCards[initIndex] = { ...newInitCards[initIndex], used: false, inactive: false };
      } else {
        const calcIndex = newCalcKeys.findIndex(k => k.value === value);
        if (calcIndex !== -1) {
          newCalcKeys[calcIndex] = { ...newCalcKeys[calcIndex], used: false, inactive: false };
        }
      }
    });

    if (resultValue) {
      const calcIndex = newCalcKeys.findIndex(k => k.value === resultValue);
      if (calcIndex !== -1) {
        newCalcKeys[calcIndex] = { value: '', used: false, inactive: true };
      }
    }

    setInitCards(newInitCards);
    setCalculatedKeys(newCalcKeys);

    // Clear all active states first
    newRows.forEach(row => {
      row.num1.active = false;
      row.operator.active = false;
      row.num2.active = false;
    });

    // Set active position on the deleted row
    newRows[rowIndex].num1.active = true;
    setActivePosition({ row: rowIndex, type: 'num1' });

    setRows(newRows);
    recalculateBest(newRows);
  };

  const recalculateBest = (currentRows: Row[]) => {
    let best = 0;
    let bestDiff = Infinity;

    // Iterate through rows in order - when distances are equal, take the last one
    currentRows.forEach(row => {
      if (row.result.filled) {
        const value = parseInt(row.result.value);
        const diff = Math.abs(target - value);
        // Use <= to prefer later results when distances are equal
        if (diff <= bestDiff) {
          bestDiff = diff;
          best = value;
        }
      }
    });

    setCurrentBest(best);
  };

  const resetGame = () => {
    // Don't reset the timer - keep it running

    // Reset game state but keep target and cards
    setRows(Array(5).fill(null).map(() => ({
      num1: { value: '', filled: false, active: false },
      operator: { value: '', filled: false, active: false },
      num2: { value: '', filled: false, active: false },
      result: { value: '', filled: false, active: false },
    })));

    // First row, first tile active
    setRows(prev => {
      const newRows = [...prev];
      newRows[0].num1.active = true;
      return newRows;
    });

    // Reset all init cards to unused
    setInitCards(prev => prev.map(card => ({
      ...card,
      used: false,
      inactive: false,
    })));

    // Clear all calculated keys
    setCalculatedKeys([
      { value: '', used: false, inactive: true },
      { value: '', used: false, inactive: true },
      { value: '', used: false, inactive: true },
      { value: '', used: false, inactive: true },
    ]);

    setActivePosition({ row: 0, type: 'num1' });
    setCurrentBest(0);
    setGameWon(false);
    setWonWhileSignedIn(false);
  };

  const handleSubmit = async () => {
    // Require authentication to submit
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    // Get the maximum value from initial tiles
    const maxInitialTile = Math.max(...initCards.map(card => parseInt(card.value)));

    // Check if user made progress (bestResult must be greater than max initial tile)
    if (currentBest <= maxInitialTile) {
      showAlert('No progress made - combine tiles to get closer to the target!');
      return;
    }

    // Check if this submission is at least as good as previous best
    const previousBest = previousResult?.result;
    if (previousBest !== null && previousBest !== undefined) {
      const previousDiff = Math.abs(target - previousBest);
      const currentDiff = Math.abs(target - currentBest);
      if (currentDiff > previousDiff) {
        showAlert(`Your current best (${currentBest}) is not better than your previous submission (${previousBest})`);
        return;
      }
    }

    // Calculate duration
    const endTime = serverStartTime
      ? (Date.now() - serverStartTime.getTime()) / 1000
      : timer;

    // Build expression from completed rows
    const completedRowCount = rows.filter(row => row.result.filled).length;
    const expression = buildExpression(rows, completedRowCount);

    // Submit to backend
    if (frame) {
      try {
        await gameApi.submit(frame.id, expression, parseFloat(endTime.toFixed(2)), currentBest);
        if (frame.date) setDailyPlayed(true);
        // Show success message with result
        const diff = Math.abs(target - currentBest);
        if (diff === 0) {
          // Exact solve (shouldn't happen here since auto-submit handles it, but just in case)
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          setGameWon(true);
          setWinTime(parseFloat(endTime.toFixed(2)));
          setWinSteps(completedRowCount);
        } else {
          // Close but not exact - show result and update previousResult
          showAlert(`Submitted! Your best: ${currentBest} (${diff} away from ${target})`, 'success', 3000);
          // Update previousResult with new best (allows continued play)
          setPreviousResult({
            solved: false,
            duration: parseFloat(endTime.toFixed(2)),
            result: currentBest,
          });
        }
      } catch (err) {
        console.error('Failed to submit:', err);
        showAlert('Failed to submit. Please try again.');
      }
    }
  };

  const getAvailableKeys = () => {
    const { type } = activePosition;
    if (type === 'operator') {
      return { numbers: [], operators: ['+', '-', '×', '/'] };
    } else {
      const availableNumbers = [
        ...initCards.filter(k => !k.inactive).map(k => ({ value: k.value, isCalculated: false })),
        ...calculatedKeys.filter(k => k.value && !k.inactive).map(k => ({ value: k.value, isCalculated: true }))
      ];
      return { numbers: availableNumbers, operators: [] };
    }
  };

  const available = getAvailableKeys();
  // Find the current row being worked on (highest row with num1 filled)
  const currentWorkingRowIndex = rows.reduce((lastIndex, row, index) => {
    return row.num1.filled ? index : lastIndex;
  }, -1);

  const locked = gameWon || !!previousResult?.solved;
  const canUndo = gamePhase === 'playing' && !locked && currentWorkingRowIndex >= 0;
  const usedTileCount = initCards.filter(card => card.used).length;
  const frameDate = frame?.date
    ? new Date(frame.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    : null;
  const clockFill = gamePhase === 'playing' ? Math.max(0, 1 - timer / COUNTDOWN_SECONDS) : 1;
  const winTimeLabel = winTime <= OVERTIME_THRESHOLD ? `${winTime.toFixed(1)}s` : 'Overtime';

  const openAuth = (mode: 'login' | 'register') => {
    setInitialAuthMode(mode);
    setShowAuthModal(true);
  };

  if (verificationStatus === 'verifying') {
    return (
      <div className="loading-screen">
        <div className="loading">Verifying your email...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading">{loadingMessage}</div>
      </div>
    );
  }

  // Redirect to home if not logged in on dashboard
  if (currentRoute === 'dashboard' && !user) {
    navigateToHome();
    return null;
  }

  return (
    <div className={`app-container${currentRoute !== 'dashboard' ? ' game-view' : ''}`}>
      {/* Header: help on the left, wordmark centered, account actions on the right (Wordle layout) */}
      <header className="app-head">
        <div className="head-l">
          <button className="icon-btn" onClick={() => setShowTutorial(true)} aria-label="How to play" title="How to play">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><path d="M12 17.2v.1"/></svg>
          </button>
        </div>
        <button
          className="wordmark"
          onClick={() => {
            if (user) navigateToDashboard();
            else openAuth('login');
          }}
        >
          6/7 Numbers
        </button>
        <div className="head-r">
          {user ? (
            <>
              <button className="icon-btn" onClick={() => { setShowFriends(true); setPendingFriendCount(0); }} aria-label="Friends" title="Friends">
                <svg viewBox="0 0 24 24"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3"/><path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6"/></svg>
                {pendingFriendCount > 0 && <span className="badge">{pendingFriendCount}</span>}
              </button>
              {currentRoute !== 'dashboard' && (
                <button className="icon-btn" onClick={navigateToDashboard} aria-label="Dashboard" title="Dashboard">
                  <svg viewBox="0 0 24 24"><path d="M5 20v-8M12 20V5M19 20v-5"/></svg>
                </button>
              )}
              <button className="icon-btn" onClick={() => setShowProfile(true)} aria-label="Profile" title="Profile">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c.6-3.6 3.6-6 7.5-6s6.9 2.4 7.5 6"/></svg>
              </button>
            </>
          ) : gamePhase !== 'pre-game' ? (
            /* The landing screen has its own Log in button */
            <button className="head-signin" onClick={() => openAuth('login')}>Log in</button>
          ) : null}
        </div>
      </header>

      {showAuthModal && (
        <AuthForm
          initialMode={initialAuthMode}
          onSuccess={handleAuthSuccess}
          onCancel={() => setShowAuthModal(false)}
        />
      )}

      {resetPasswordToken && (
        <ResetPasswordForm
          token={resetPasswordToken}
          onSuccess={handleResetPasswordSuccess}
          onCancel={handleResetPasswordCancel}
        />
      )}

      {showProfile && user && (
        <Profile
          user={user}
          onUserUpdate={handleUserUpdate}
          onClose={() => setShowProfile(false)}
          onLogout={() => { setShowProfile(false); handleLogout(); }}
        />
      )}

      {showFriends && (
        <FriendsModal onClose={() => setShowFriends(false)} />
      )}

      {showTutorial && (
        <TutorialModal
          onClose={() => setShowTutorial(false)}
          onClearAll={gamePhase === 'playing' && !locked && currentRoute !== 'dashboard'
            ? () => { resetGame(); setShowTutorial(false); }
            : undefined}
        />
      )}

      {currentRoute === 'dashboard' ? (
        <Dashboard
          key={dashboardKey}
          onNavigateHome={navigateToHome}
          onPlayFrame={handlePlayHistorical}
          onPlayRandom={handlePlayRandom}
        />
      ) : gamePhase === 'pre-game' ? (
        /* First visit for guests: one sentence of rules, one main action */
        <main className="landing">
          <div className="landing-mark">6/7</div>
          <h1 className="landing-title">6/7 Numbers</h1>
          <p className="landing-desc">Reach the target with six numbers and four operations.</p>
          <div className="landing-actions">
            <button className="btn ink" onClick={() => setGamePhase('countdown')}>Play</button>
            <button className="btn line" onClick={() => openAuth('login')}>Log in</button>
            <button className="btn text" onClick={() => openAuth('register')}>Create an account</button>
          </div>
          {frame?.name && (
            <p className="landing-date">
              <b>{frame.date ? new Date(frame.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''}</b>
              {frame.name}
            </p>
          )}
        </main>
      ) : (
      <main className="game">
        {verificationStatus === 'success' && (
          <div className="verify-container verify-success">
            <p>{verificationMessage}</p>
          </div>
        )}
        {verificationStatus === 'error' && (
          <div className="verify-container verify-error">
            <p>{verificationMessage}</p>
            <p className="verify-hint">The link may have expired. Log in to request a new verification email.</p>
            <button onClick={() => { setVerificationStatus('none'); openAuth('login'); }}>
              Log in
            </button>
          </div>
        )}

        {/* The 60-second clock drains as a line; overtime is spelled out in the meta row */}
        <div className="clock" aria-hidden="true">
          <i style={{ width: `${clockFill * 100}%` }} />
        </div>

        <div className="meta">
          <span>
            <b>{frame?.name}</b>
            {frameDate && ` · ${frameDate}`}
            {previousResult?.solved
              ? ' · Solved'
              : previousResult?.result != null
                ? ` · best ${Math.abs(target - previousResult.result)} away`
                : ''}
          </span>
          <span className="meta-r">
            <span className={`timer${timerStopped ? ' over' : ''}`}>
              {gamePhase === 'playing'
                ? (timerStopped ? 'Overtime' : `${timer.toFixed(1)}s`)
                : '0.0s'}
            </span>
            {/* Signed-in players get a way out next to the game, not only the header icon.
                Once the frame is solved there's nothing to give up, so it just says Dashboard. */}
            {user && gamePhase === 'playing' && (
              <button className="give-up" onClick={navigateToDashboard}>
                {locked ? 'Dashboard' : 'Give up'}
              </button>
            )}
          </span>
        </div>

        <div className={`target${gamePhase !== 'playing' ? ' game-hidden' : ''}`}>
          <div className="target-num">{target}</div>
        </div>

        <div className={`closest${gamePhase !== 'playing' ? ' game-hidden' : ''}`}>
          {currentBest > 0 ? (
            <>
              <span>Closest</span>
              <span className={`chip ${band(currentBest)}`}>{currentBest}</span>
              <span>{currentBest === target ? 'Exact' : `${Math.abs(target - currentBest)} away`}</span>
            </>
          ) : (
            <span>Closest so far: none yet</span>
          )}
        </div>

        {/* Calculation rows. Result tiles take the distance color: exact / within 10 / further */}
        <div className={`board${gamePhase !== 'playing' ? ' game-hidden' : ''}`}>
          {rows.map((row, rowIndex) => {
            const resultBand = row.result.filled ? band(parseInt(row.result.value)) : '';
            return (
              <div key={rowIndex} className={`eqrow${shakeRow === rowIndex ? ' shake' : ''}`}>
                <div className={`cell${row.num1.filled ? ' filled' : ''}${row.num1.active ? ' cursor' : ''}`}>
                  {row.num1.value}
                </div>
                <div className={`cell op${row.operator.filled ? ' filled' : ''}${row.operator.active ? ' cursor' : ''}`}>
                  {displayOp(row.operator.value)}
                </div>
                <div className={`cell${row.num2.filled ? ' filled' : ''}${row.num2.active ? ' cursor' : ''}`}>
                  {row.num2.value}
                </div>
                <div className="eq">=</div>
                <div key={row.result.value} className={`cell res${row.result.filled ? ` filled ${resultBand} flip` : ''}`}>
                  {row.result.value}
                </div>
              </div>
            );
          })}
        </div>

        {/* Keyboard: starting numbers, results, then Undo / operators / Submit */}
        <div className={`keys${gamePhase !== 'playing' ? ' game-hidden' : ''}`}>
          <div className="krow">
            {initCards.map((card, i) => (
              card.used ? (
                <button key={i} className="key ghost" disabled aria-label="Used" />
              ) : (
                <button
                  key={i}
                  onClick={() => handleKeyPress(card.value, false, undefined, i)}
                  disabled={locked || available.operators.length > 0}
                  className={`key${available.operators.length > 0 ? ' dim' : ''}`}
                >
                  {card.value}
                </button>
              )
            ))}
          </div>
          <div className="krow results">
            {calculatedKeys.map((key, i) => (
              !key.value || key.used ? (
                <button key={`calc-${i}`} className="key ghost" disabled aria-label="Empty" />
              ) : (
                <button
                  key={`calc-${i}`}
                  onClick={() => handleKeyPress(key.value, true, i)}
                  disabled={locked || key.inactive || available.operators.length > 0}
                  className={`key derived${key.inactive || available.operators.length > 0 ? ' dim' : ''}`}
                >
                  {key.value}
                </button>
              )
            ))}
          </div>
          <div className="krow">
            <button
              className={`key word${canUndo ? '' : ' dim'}`}
              onClick={() => canUndo && deleteRow(currentWorkingRowIndex)}
              disabled={!canUndo}
            >
              Undo
            </button>
            {['+', '-', '×', '/'].map(op => (
              <button
                key={op}
                onClick={() => handleKeyPress(op, false)}
                disabled={locked || available.operators.length === 0}
                className={`key op${available.operators.length === 0 ? ' dim' : ''}`}
                aria-label={op === '/' ? 'Divide' : op === '-' ? 'Minus' : op === '×' ? 'Times' : 'Plus'}
              >
                {displayOp(op)}
              </button>
            ))}
            <button
              className={`key word ink${locked || currentBest === 0 ? ' dim' : ''}`}
              onClick={handleSubmit}
              disabled={locked || currentBest === 0}
            >
              Submit
            </button>
          </div>
        </div>

        {/* 3-2-1 countdown */}
        {gamePhase === 'countdown' && (
          <div className="cover">
            <div className="cover-panel">
              {frame?.name && <div className="eyebrow">{frame.name}</div>}
              <div className="count" key={countdownNumber} aria-live="polite">{countdownNumber}</div>
            </div>
          </div>
        )}

        {alert && <div className={`toast${alert.type === 'success' ? ' success' : ''}`} role="status">{alert.message}</div>}

        {/* Result sheet, signed in */}
        {gameWon && wonWhileSignedIn && !resultClosed && (
          <>
            <div className="scrim delayed" />
            <div className="sheet delayed" role="dialog" aria-label="Solved">
              <div className="grab" />
              <div className="sheet-top">
                <div className="eyebrow">Solved{frame?.name ? ` · ${frame.name}` : ''}</div>
                <button className="icon-btn close-x" onClick={() => setResultClosed(true)} aria-label="Close">
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              </div>
              <div className="solve-line">
                <span className="solve-time">{winTimeLabel}</span>
                <span className="sub">{winSteps} {winSteps === 1 ? 'step' : 'steps'} · {usedTileCount} of 6 numbers</span>
              </div>
              {winStats && (
                <div className="statrow">
                  <div><b>{winStats.totalGamesPlayed}</b><span>Played</span></div>
                  <div><b>{winStats.successRate}</b><span>Solved %</span></div>
                  <div><b>{winStats.currentStreak}</b><span>Streak</span></div>
                  <div><b>{winStats.bestTime != null ? winStats.bestTime.toFixed(1) : '—'}</b><span>Best time</span></div>
                </div>
              )}
              <div className="sharebox">{`${frame?.name ?? ''}\n${target} in ${winTimeLabel === 'Overtime' ? 'overtime' : winTimeLabel}\n${shareSquares()}`}</div>
              {currentRoute === 'home' && (
                <p className="sub">Come back tomorrow for a new daily challenge.</p>
              )}
              <div className="actions">
                <button className="btn ink wide" onClick={handleShare}>
                  {shareCopied ? 'Copied to clipboard' : 'Share result'}
                </button>
                <div className="pair">
                  <button className="btn line" onClick={handlePlayRandom}>Play random</button>
                  <button className="btn line" onClick={navigateToDashboard}>Dashboard</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Result sheet, guest */}
        {gameWon && !user && !resultClosed && (
          <>
            <div className="scrim delayed" />
            <div className="sheet delayed" role="dialog" aria-label="Solved">
              <div className="grab" />
              <div className="sheet-top">
                <div className="eyebrow">Solved{frame?.name ? ` · ${frame.name}` : ''}</div>
                <button className="icon-btn close-x" onClick={() => setResultClosed(true)} aria-label="Close">
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              </div>
              <div className="solve-line">
                <span className="solve-time">{winTimeLabel}</span>
                <span className="sub">{winSteps} {winSteps === 1 ? 'step' : 'steps'}</span>
              </div>
              <p>Create an account to save this result, keep a streak, play past dailies and compete with friends.</p>
              <div className="actions">
                <button className="btn ink wide" onClick={() => openAuth('register')}>Create an account</button>
                <button className="btn line wide" onClick={() => openAuth('login')}>Log in</button>
              </div>
            </div>
          </>
        )}
      </main>
      )}
    </div>
  );
}
