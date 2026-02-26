import { useState, useEffect, useRef } from 'react';
import { gameApi, authApi, Frame, clearToken, isLoggedIn, setToken, User, PreviousResult } from './api';
import AuthForm from './components/AuthForm';
import ResetPasswordForm from './components/ResetPasswordForm';
import Profile from './components/Profile';
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

// Epoch date for calculating daily challenge number (Day 1 = Jan 1, 2026 UTC)
const DAILY_EPOCH = Date.UTC(2026, 0, 1); // January 1, 2026

/**
 * Calculate the daily challenge number based on the frame's date.
 * Day 1 = January 1, 2026
 */
function getDailyNumber(frameDate: string | undefined): number | null {
  if (!frameDate) return null;
  const date = new Date(frameDate);
  const daysSinceEpoch = Math.floor((date.getTime() - DAILY_EPOCH) / (24 * 60 * 60 * 1000));
  return daysSinceEpoch + 1; // Day 1, not Day 0
}

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
  const [previousResult, setPreviousResult] = useState<PreviousResult | null>(null);
  const [dailyPlayed, setDailyPlayed] = useState(false);
  const [serverStartTime, setServerStartTime] = useState<Date | null>(null);
  const [gamePhase, setGamePhase] = useState<GamePhase>('loading');
  const [countdownNumber, setCountdownNumber] = useState(3);

  const startTimeRef = useRef(Date.now());
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle browser back/forward navigation
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

  // Initialize game
  useEffect(() => {
    initializeGame();
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Timer effect - only starts when game is in 'playing' phase
  useEffect(() => {
    if (gamePhase !== 'playing' || previousResult) {
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
    }, 3000);

    return () => {
      clearTimeout(timer2);
      clearTimeout(timer1);
      clearTimeout(timerGo);
    };
  }, [gamePhase]);

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
        if (prevResult.duration != null) {
          setTimer(prevResult.duration);
          setTimerStopped(prevResult.duration >= COUNTDOWN_SECONDS);
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

    // Re-fetch daily data now that we're authenticated
    if (currentRoute === 'home' && frame) {
      try {
        const response = await gameApi.getDaily();
        const { previousResult: prevResult } = response;
        setPreviousResult(prevResult);

        if (prevResult?.solved) {
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

  const navigateToDashboard = () => {
    setCurrentRoute('dashboard');
    window.history.pushState({}, '', '/dashboard');
  };

  const navigateToHome = () => {
    setCurrentRoute('home');
    setPlayFrameId(null);
    window.history.pushState({}, '', '/');
    // Reload daily challenge
    initializeGame();
  };

  const handlePlayHistorical = async (frameId: string) => {
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

      if (prevResult?.solved) {
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

  const handlePlayRandom = async () => {
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
            <h1>6-7 Numbers</h1>
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
            <h1>6-7 Numbers</h1>
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
    <div className="app-container">
      <div className="content-wrapper">
        {/* Shared header */}
        <div className="user-bar">
          <div className="user-bar-left">
            <h1 className="site-title" onClick={navigateToHome}>6-7 Numbers</h1>
          </div>
          <div className="user-bar-right">
            {user ? (
              <>
                {currentRoute !== 'dashboard' && (
                  <button className="bar-btn primary" onClick={navigateToDashboard}>Dashboard</button>
                )}
                <button className="bar-btn secondary" onClick={() => setShowProfile(true)}>
                  <span className="btn-label">Profile</span>
                  <svg className="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                </button>
                <button className="bar-btn secondary" onClick={handleLogout}>
                  <span className="btn-label">Sign Out</span>
                  <svg className="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
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
          />
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

        {/* Daily number */}
        {frame?.date && (
          <div className="daily-number">Daily #{getDailyNumber(frame.date)}</div>
        )}

        {/* Target */}
        <div className={`target-grid ${gamePhase !== 'playing' ? 'game-hidden' : ''}`}>
          {String(target).split('').map((digit, i) => (
            <div key={i} className="target-tile">{digit}</div>
          ))}
        </div>

        {/* Timer */}
        <div className="timer-container">
          <div className={`timer ${timerStopped ? 'overtime' : ''}`}>
            {gamePhase === 'playing'
              ? (timerStopped ? `${COUNTDOWN_SECONDS}++ seconds` : `${timer.toFixed(1)}s`)
              : '0.0s'}
          </div>
        </div>

        {/* Pre-game overlay */}
        {gamePhase === 'pre-game' && !showAuthModal && (
          <>
            <div className="pregame-overlay" />
            <div className="pregame-modal">
              <h1 className="pregame-title">6-7 Numbers</h1>
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
            <div className="countdown-number" key={countdownNumber}>
              {countdownNumber}
            </div>
          </>
        )}

        {/* Alert */}
        {alert && <div className={`alert-inline ${alert.type === 'success' ? 'success' : ''}`}>{alert.message}</div>}

        {/* Already Solved Banner - only shows when puzzle was solved */}
        {previousResult?.solved && (
          <div className="already-played-banner">
            <strong>Already Solved</strong>
            {previousResult.duration !== null && previousResult.duration <= OVERTIME_THRESHOLD
              ? ` in ${previousResult.duration}s`
              : previousResult.duration !== null
              ? ' (overtime)'
              : ''
            }!
            {user && currentRoute === 'home' ? (
              <span className="comeback-hint"> Redirecting to dashboard...</span>
            ) : (
              <span className="comeback-hint"> Come back tomorrow for a new challenge.</span>
            )}
          </div>
        )}

        {/* Current Best Banner - shows when there's a previous submission but not solved */}
        {previousResult && !previousResult.solved && previousResult.result !== null && (
          <div className="current-best-banner">
            <strong>Current best: {previousResult.result}</strong>
            <span> ({Math.abs(target - previousResult.result)} away from target)</span>
          </div>
        )}

        {/* Victory Modal - Signed In User */}
        {gameWon && !previousResult?.solved && wonWhileSignedIn && (
          <>
            <div className="victory-overlay" onClick={(e) => e.stopPropagation()} />
            <div className="victory-modal-new">
              <div className="victory-icon">&#x2713;</div>
              <h1 className="victory-title">Congratulations!</h1>
              <p className="victory-stats">
                {winTime <= OVERTIME_THRESHOLD ? `${winTime}s` : 'Overtime'} &middot; {winSteps} step{winSteps > 1 ? 's' : ''}
              </p>
              <p className="victory-hint">
                Come back tomorrow for a new daily challenge.
              </p>
              <div className="victory-actions">
                <button className="victory-btn primary" onClick={handlePlayRandom}>
                  Play Random Challenge
                </button>
                <button className="victory-btn secondary" onClick={navigateToDashboard}>
                  View Dashboard
                </button>
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
              className={`key calc-key ${key.inactive || !key.value || available.operators.length > 0 ? 'inactive' : ''}`}
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