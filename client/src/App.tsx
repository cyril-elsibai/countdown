import { useState, useEffect, useRef } from 'react';
import { gameApi, authApi, friendsApi, Frame, clearToken, isLoggedIn, setToken, User, PreviousResult } from './api';
import AuthForm from './components/AuthForm';
import ResetPasswordForm from './components/ResetPasswordForm';
import Profile from './components/Profile';
import FriendsModal from './components/FriendsModal';
import Admin from './components/Admin';
import { Dashboard } from './components/Dashboard';

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
  const [frame, setFrame] = useState<Frame | null>(null);
  const [user, setUser] = useState<{ id: string; email: string; name?: string } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'none' | 'verifying' | 'success' | 'error'>('none');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [pendingFriendCount, setPendingFriendCount] = useState(0);
  const [previousResult, setPreviousResult] = useState<PreviousResult | null>(null);
  const [dailyPlayed, setDailyPlayed] = useState(false);
  const [serverStartTime, setServerStartTime] = useState<Date | null>(null);
  const [gamePhase, setGamePhase] = useState<GamePhase>('loading');
  const [countdownNumber, setCountdownNumber] = useState(3);

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

  // Auto-redirect to dashboard if daily challenge is already solved
  useEffect(() => {
    if (previousResult?.solved && user && currentRoute === 'home' && !gameWon) {
      navigateToDashboard();
    }
  }, [previousResult, user, currentRoute, gameWon]);

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
      const url = `http://${window.location.hostname}:3001/api/game/frame/${active.id}/progress`;
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

  const initializeGame = async () => {
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
      } else if (isLoggedIn() && startedAt) {
        // Mid-game reload — skip countdown, restore timer from server start time
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
        } else if (startedAt) {
          // Mid-game — restore timer from server start time
          setServerStartTime(new Date(startedAt));
          setGamePhase('playing');
        } else {
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
    window.history.pushState({}, '', '/dashboard');
  };

  const navigateToHome = () => {
    saveActiveFrameProgress();
    setCurrentRoute('home');
    setPlayFrameId(null);
    window.history.pushState({}, '', '/');
    // Reload daily challenge
    initializeGame();
  };

  const handlePlayHistorical = async (frameId: string) => {
    saveActiveFrameProgress();
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
        if (!prevResult.solved && prevResult.duration != null && prevResult.duration > 0) {
          setServerStartTime(new Date(Date.now() - prevResult.duration * 1000));
          activeFrameRef.current = { id: fetchedFrame.id, timer: prevResult.duration, best: prevResult.result ?? 0 };
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
    const name = frame?.name;
    const timeStr = winTime <= OVERTIME_THRESHOLD ? `${winTime}s` : 'overtime';
    const text = name
      ? `I just solved ${name} in ${timeStr} on 6/7 Numbers! Can you beat me?`
      : `I just solved a challenge in ${timeStr} on 6/7 Numbers!`;
    const url = `${window.location.origin}/play/${frame?.id}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: '6/7 Numbers', text, url });
      } catch {
        // user cancelled — do nothing
      }
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
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

  const handleKeyPress = (value: string, isCalculated: boolean, calcKeyIndex?: number, initCardIndex?: number) => {
    const { row, type } = activePosition;
    const currentRow = rows[row];

    const isNumber = type === 'num1' || type === 'num2';
    const keyIsNumber = !['+', '-', '×', '/'].includes(value);

    if (isNumber !== keyIsNumber) return;

    const newRows = [...rows];
    newRows[row] = { ...currentRow };
    newRows[row][type] = { value, filled: true, active: false };

    // Track calculated keys updates in a single array to avoid state overwrites
    let newCalcKeys = [...calculatedKeys];

    // Mark the used key as inactive first (before calculating result)
    if (isNumber) {
      if (isCalculated && calcKeyIndex !== undefined) {
        newCalcKeys[calcKeyIndex] = { ...newCalcKeys[calcKeyIndex], used: true, inactive: true };
      } else if (!isCalculated && initCardIndex !== undefined) {
        const newInitCards = [...initCards];
        newInitCards[initCardIndex] = { ...newInitCards[initCardIndex], used: true, inactive: true };
        setInitCards(newInitCards);
      }
    }

    if (type === 'num2') {
      const result = calculateResult(
        parseInt(currentRow.num1.value),
        currentRow.operator.value,
        parseInt(value)
      );

      if (result.error) {
        showAlert(result.error);
        return;
      }

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
            gameApi.submit(frame.id, expression, parseFloat(endTime.toFixed(2)), newValue)
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
      } else {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      }
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
        if (num2 >= num1) return { error: 'Error: result must be positive', value: '' };
        result = num1 - num2;
        break;
      case '×':
        result = num1 * num2;
        break;
      case '/':
        result = num1 / num2;
        if (!Number.isInteger(result)) return { error: 'Error: result must be an integer', value: '' };
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

  if (verificationStatus === 'verifying') {
    return (
      <div className="app-container">
        <div className="content-wrapper">
          <div className="header">
            <h1>6/7 Numbers</h1>
          </div>
          <div className="verify-container">
            <h2>Verifying your email...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app-container">
        <div className="content-wrapper">
          <div className="header">
            <h1>6/7 Numbers</h1>
          </div>
          {verificationStatus === 'success' && (
            <div className="verify-container verify-success">
              <h2>{verificationMessage}</h2>
            </div>
          )}
          {verificationStatus === 'error' && (
            <div className="verify-container verify-error">
              <h2>{verificationMessage}</h2>
            </div>
          )}
          <div className="loading">Loading today's challenge...</div>
        </div>
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
      <div className="content-wrapper">
        {/* Shared header */}
        <div className="user-bar">
          <div className="user-bar-left">
            <h1 className="site-title" onClick={() => {
              if (user) navigateToDashboard();
              else setShowAuthModal(true);
            }}>6/7 Numbers</h1>
          </div>
          <div className="user-bar-right">
            {user ? (
              <>
                {currentRoute !== 'dashboard' && (
                  <button className="bar-btn primary" onClick={navigateToDashboard}>Dashboard</button>
                )}
                <button className="bar-btn secondary btn-with-badge" onClick={() => { setShowFriends(true); setPendingFriendCount(0); }}>
                  <span className="btn-label">Friends</span>
                  <span className="btn-icon-wrap">
                    <svg className="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    {pendingFriendCount > 0 && (
                      <span className="notif-badge">{pendingFriendCount}</span>
                    )}
                  </span>
                </button>
                <button className="bar-btn secondary" onClick={() => setShowProfile(true)}>
                  <span className="btn-label">Profile</span>
                  <svg className="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                </button>
              </>
            ) : (
              <button className="bar-btn primary" onClick={() => setShowAuthModal(true)}>Sign In</button>
            )}
          </div>
        </div>

        {/* Auth modal */}
        {showAuthModal && (
          <AuthForm
            onSuccess={handleAuthSuccess}
            onCancel={() => setShowAuthModal(false)}
          />
        )}

        {/* Reset password modal */}
        {resetPasswordToken && (
          <ResetPasswordForm
            token={resetPasswordToken}
            onSuccess={handleResetPasswordSuccess}
            onCancel={handleResetPasswordCancel}
          />
        )}

        {/* Profile modal */}
        {showProfile && user && (
          <Profile
            user={user}
            onUserUpdate={handleUserUpdate}
            onClose={() => setShowProfile(false)}
            onLogout={() => { setShowProfile(false); handleLogout(); }}
          />
        )}

        {/* Friends modal */}
        {showFriends && (
          <FriendsModal onClose={() => setShowFriends(false)} />
        )}

        {currentRoute === 'dashboard' ? (
          <Dashboard
            onNavigateHome={navigateToHome}
            onPlayFrame={handlePlayHistorical}
            onPlayRandom={handlePlayRandom}
          />
        ) : (
        <>


        {/* Verification message */}
        {verificationStatus === 'success' && (
          <div className="verify-container verify-success">
            <p>{verificationMessage}</p>
          </div>
        )}
        {verificationStatus === 'error' && (
          <div className="verify-container verify-error">
            <p>{verificationMessage}</p>
            <p className="verify-hint">The link may have expired. Sign in to request a new verification email.</p>
            <button onClick={() => { setVerificationStatus('none'); setShowAuthModal(true); }}>
              Sign In
            </button>
          </div>
        )}

        {/* Daily number + timer inline */}
        <div className="game-header-row">
          {frame?.name ? (
            <div className="daily-number">
              {`${frame.name}${previousResult?.solved ? ' (solved !)' : previousResult?.result != null ? ` (${Math.abs(target - previousResult.result)} away)` : ''}`}
            </div>
          ) : null}
          <div className={`timer ${timerStopped ? 'overtime' : ''}`}>
            {gamePhase === 'playing'
              ? (timerStopped ? `${COUNTDOWN_SECONDS}++ seconds` : `${timer.toFixed(1)}s`)
              : '0.0s'}
          </div>
        </div>

        {/* Target */}
        <div className={`target-grid ${gamePhase !== 'playing' ? 'game-hidden' : ''}`}>
          {String(target).split('').map((digit, i) => (
            <div key={i} className="target-tile">{digit}</div>
          ))}
        </div>

        {/* Pre-game overlay */}
        {gamePhase === 'pre-game' && !showAuthModal && (
          <>
            <div className="pregame-overlay" />
            <div className="pregame-modal">
              <h1 className="pregame-title">6/7 Numbers</h1>
              <p className="pregame-description">
                Play as guest or sign in to compete with your friends!
              </p>
              <div className="pregame-actions">
                <button className="pregame-btn primary" onClick={() => setShowAuthModal(true)}>
                  Sign In
                </button>
                <button className="pregame-btn secondary" onClick={() => setGamePhase('countdown')}>
                  Play as Guest
                </button>
              </div>
            </div>
          </>
        )}

        {/* Countdown animation */}
        {gamePhase === 'countdown' && (
          <>
            <div className="countdown-overlay" />
            {frame?.name && (
              <div className="countdown-frame-label">
                {frame.name}
              </div>
            )}
            <div className="countdown-number" key={countdownNumber}>
              {countdownNumber}
            </div>
          </>
        )}

        {/* Alert */}
        {alert && <div className={`alert-inline ${alert.type === 'success' ? 'success' : ''}`}>{alert.message}</div>}



        {/* Victory Modal - Signed In User */}
        {gameWon && !previousResult?.solved && wonWhileSignedIn && (
          <>
            <div className="victory-overlay" onClick={(e) => e.stopPropagation()} />
            <div className="victory-modal-new">
              <div className="victory-icon">&#x2713;</div>
              <h1 className="victory-title">Congratulations!</h1>
              <p className="victory-message">
                {frame?.name ? (
                  <>You solved <span className="victory-highlight">{frame.name}</span> in <span className="victory-highlight">{winTime <= OVERTIME_THRESHOLD ? `${winTime}s` : 'overtime'}</span>!</>
                ) : (
                  <>You solved it in <span className="victory-highlight">{winTime <= OVERTIME_THRESHOLD ? `${winTime}s` : 'overtime'}</span>!</>
                )}
              </p>
              {currentRoute === 'home' && (
                <p className="victory-hint">Come back tomorrow for a new daily challenge.</p>
              )}
              <div className="victory-actions">
                <button className="victory-btn primary" onClick={handlePlayRandom}>
                  {currentRoute === 'home' ? 'Play Random Challenge' : 'Play another random challenge!'}
                </button>
                <button className="victory-btn secondary" onClick={navigateToDashboard}>
                  View Dashboard
                </button>
                {currentRoute !== 'home' && (
                  <button className="victory-btn share" onClick={handleShare}>
                    {shareCopied ? '✓ Copied to clipboard!' : '🔗 Share your result'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Victory Modal - Guest user (not signed in) */}
        {gameWon && !user && (
          <>
            <div className="victory-overlay" onClick={(e) => e.stopPropagation()} />
            <div className="victory-modal-new">
              <div className="victory-icon">&#x2713;</div>
              <h1 className="victory-title">Congratulations!</h1>
              <p className="victory-hint">
                Come back tomorrow for a new daily challenge.
              </p>
              <p className="victory-hint">
                Sign up to play random challenges and compete with friends!
              </p>
              <div className="victory-actions">
                <button className="victory-btn primary" onClick={() => setShowAuthModal(true)}>
                  Sign Up / Sign In
                </button>
              </div>
            </div>
          </>
        )}

        {/* Game Grid */}
        <div className={`game-grid ${gamePhase !== 'playing' ? 'game-hidden' : ''}`}>
          {rows.map((row, rowIndex) => {
            const isBest = row.result.filled && parseInt(row.result.value) === currentBest;
            const showDelete = row.num1.filled && rowIndex === currentWorkingRowIndex;

            return (
              <div key={rowIndex} className="grid-row">
                <div className="row-spacer" />
                <div className={`tile ${row.num1.active ? 'active' : ''} ${isBest ? 'best' : ''}`}>
                  {row.num1.value}
                </div>
                <div className={`tile operator-tile ${row.operator.active ? 'active' : ''}`}>
                  {row.operator.value}
                </div>
                <div className={`tile ${row.num2.active ? 'active' : ''} ${isBest ? 'best' : ''}`}>
                  {row.num2.value}
                </div>
                <div className="equals">=</div>
                <div className={`tile result-tile ${isBest ? 'best' : ''}`}>
                  {row.result.value}
                </div>
                <button
                  onClick={() => deleteRow(rowIndex)}
                  className="delete-row-btn"
                  style={{ visibility: showDelete && !previousResult?.solved ? 'visible' : 'hidden' }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Keyboard */}
        <div className={`keyboard ${gamePhase !== 'playing' ? 'game-hidden' : ''}`}>
          {initCards.map((card, i) => (
            <button
              key={i}
              onClick={() => handleKeyPress(card.value, false, undefined, i)}
              disabled={gameWon || (previousResult?.solved) || card.inactive || available.operators.length > 0}
              className={`key init-key ${card.inactive || available.operators.length > 0 ? 'inactive' : ''}`}
            >
              {card.value}
            </button>
          ))}

          <div className="spacer" />

          {calculatedKeys.map((key, i) => (
            <button
              key={`calc-${i}`}
              onClick={() => handleKeyPress(key.value, true, i)}
              disabled={gameWon || (previousResult?.solved) || key.inactive || !key.value || available.operators.length > 0}
              className={`key calc-key ${key.inactive || !key.value || available.operators.length > 0 ? 'inactive' : ''} ${key.value ? 'has-value' : ''}`}
            >
              {key.value}
            </button>
          ))}

          <button className="key reset-key" onClick={resetGame} disabled={gameWon || (previousResult?.solved)}>Reset</button>

          {['+', '-', '×', '/'].map(op => (
            <button
              key={op}
              onClick={() => handleKeyPress(op, false)}
              disabled={gameWon || (previousResult?.solved) || available.numbers.length > 0}
              className={`key operator-key ${available.numbers.length > 0 ? 'inactive' : ''}`}
            >
              {op}
            </button>
          ))}

          <button
            className="key submit-key"
            onClick={handleSubmit}
            disabled={gameWon || (previousResult?.solved) || currentBest === 0}
          >
            Submit
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}