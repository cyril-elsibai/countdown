import { useState, useEffect, useCallback, useRef } from 'react';
import { wordleApi } from '../api';
import type { WordleGameState } from '../api';
import GameBoard from './GameBoard';
import Keyboard from './Keyboard';
import './Game.css';

interface Props {
  initialState: WordleGameState;
  isDaily: boolean;
  onPlayRandom: () => void;
  onDashboard: () => void;
}

interface WordStats {
  totalPlays: number;
  winRate: number;
  guessDist: number[];
}

function getDailyNumber(name: string | null): number | null {
  if (!name) return null;
  const m = name.match(/Daily Word #(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function buildShareText(
  word: WordleGameState['word'],
  guesses: WordleGameState['guesses'],
  solved: boolean,
  isDaily: boolean,
): string {
  const dailyNum = getDailyNumber(word.name);
  const header = isDaily && dailyNum
    ? `67words Daily #${dailyNum} (${word.wordLength} letters)`
    : `67words (${word.wordLength} letters)`;
  const result = solved ? `${guesses.length}/6` : 'X/6';
  const grid = guesses.map(g =>
    g.feedback.map(f =>
      f === 'correct' ? '🟩' : f === 'present' ? '🟨' : '⬛'
    ).join('')
  ).join('\n');
  return `${header}\n${result}\n\n${grid}`;
}

export default function Game({ initialState, isDaily, onPlayRandom, onDashboard }: Props) {
  const [state, setState] = useState<WordleGameState>(initialState);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const submittingRef = useRef(false);
  const [revealingRow, setRevealingRow] = useState<number | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [showResult, setShowResult] = useState(initialState.gameOver);
  const [flippingLetters, setFlippingLetters] = useState<Set<string>>(new Set());
  const [settledRows, setSettledRows] = useState<Set<number>>(
    new Set(initialState.guesses.map((_, i) => i))
  );
  const [wordStats, setWordStats] = useState<WordStats | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wordLength = state.word.wordLength as 6 | 7;
  const { gameOver, solved, guesses, word } = state;

  // Start server timer on mount for daily
  useEffect(() => {
    if (isDaily && !state.startedAt && !gameOver) {
      wordleApi.startWord(word.id).catch(() => {});
    }
  }, []);

  // Live elapsed timer
  useEffect(() => {
    if (gameOver || !state.startedAt) return;
    const start = new Date(state.startedAt).getTime();
    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.startedAt, gameOver]);

  // Stop timer when game ends
  useEffect(() => {
    if (gameOver && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [gameOver]);

  // Fetch word stats when game ends
  useEffect(() => {
    if (gameOver) {
      wordleApi.getWordStats(word.id).then(setWordStats).catch(() => {});
    }
  }, [gameOver, word.id]);

  const showError = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 400);
    setTimeout(() => setError(''), 1800);
  };

  const submitGuess = useCallback(async (guess: string) => {
    if (submittingRef.current || gameOver) return;
    if (guess.length !== wordLength) {
      showError(`Word must be ${wordLength} letters`);
      return;
    }
    submittingRef.current = true;
    try {
      const newState = await wordleApi.submitGuess(word.id, guess);
      const newRowIdx = newState.guesses.length - 1;
      setState(newState);
      setInput('');
      setRevealingRow(newRowIdx);
      setRevealedCount(0);
      // Apply each cell's color at the flip midpoint (250ms into its 500ms animation)
      const STAGGER = 300;
      const HALF_FLIP = 250;
      for (let i = 0; i < wordLength; i++) {
        setTimeout(() => setRevealedCount(i + 1), i * STAGGER + HALF_FLIP);
      }
      const totalDuration = (wordLength - 1) * STAGGER + HALF_FLIP * 2 + 100;
      // Build current best-status map from previous guesses (before this one)
      const statusPriority: Record<string, number> = { correct: 3, present: 2, absent: 1 };
      const prevBest: Record<string, number> = {};
      for (const g of state.guesses) {
        g.feedback.forEach((s, i) => {
          const l = g.guess[i];
          prevBest[l] = Math.max(prevBest[l] ?? 0, statusPriority[s]);
        });
      }
      // Only animate letters that get a status upgrade
      const newGuess = newState.guesses[newRowIdx];
      const guessedLetters = new Set<string>();
      newGuess.feedback.forEach((s, i) => {
        const l = newGuess.guess[i];
        if ((statusPriority[s] ?? 0) > (prevBest[l] ?? 0)) guessedLetters.add(l);
      });
      setTimeout(() => {
        setRevealingRow(null);
        setRevealedCount(0);
        setSettledRows(prev => new Set(prev).add(newRowIdx));
        setFlippingLetters(guessedLetters);
        setTimeout(() => setFlippingLetters(new Set()), 50);
      }, totalDuration);
      if (newState.gameOver) {
        setTimeout(() => setShowResult(true), totalDuration);
      }
    } catch (err: any) {
      showError(err.message || 'Error submitting guess');
    } finally {
      submittingRef.current = false;
    }
  }, [gameOver, wordLength, word.id]);

  const handleKey = useCallback((key: string) => {
    if (gameOver) return;
    if (key === '⌫' || key === 'Backspace') {
      setInput(prev => prev.slice(0, -1));
    } else if (key === 'ENTER' || key === 'Enter') {
      submitGuess(input);
    } else if (/^[A-Za-z]$/.test(key) && input.length < wordLength) {
      setInput(prev => prev + key.toUpperCase());
    }
  }, [gameOver, input, wordLength, submitGuess]);

  // Physical keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter' || e.key === 'Backspace') e.preventDefault();
      handleKey(e.key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey]);

  const handleShare = () => {
    const text = buildShareText(word, guesses, solved, isDaily);
    navigator.clipboard.writeText(text).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const guessesLeft = state.maxGuesses - guesses.length;
  const distMax = wordStats ? Math.max(...wordStats.guessDist, 1) : 1;

  const formatElapsed = (s: number) => s >= 60
    ? `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`
    : `${s.toFixed(1)}s`;

  return (
    <div className="game">
      <div className="game-meta">
        <span className="game-label">
          {word.name ?? (isDaily ? 'Daily Word' : 'Random Word')}
        </span>
        <span className="game-length">{wordLength} letters</span>
      </div>

      {error && <div className="game-error">{error}</div>}

      <div className="game-board-wrap">
        <GameBoard
          wordLength={wordLength}
          guesses={guesses}
          currentInput={input}
          maxGuesses={state.maxGuesses}
          shake={shake}
          settledRows={settledRows}
          revealingRow={revealingRow}
          revealedCount={revealedCount}
        />
      </div>

      {showResult && (
        <div className="result-overlay">
          <div className="result-modal">
            {solved ? (
              <>
                <p className="result-headline win">Solved!</p>
                {guesses.length === 1 && <p className="result-sub">Genius!</p>}
                {state.duration && <p className="result-time">{state.duration.toFixed(1)}s</p>}
                <div className="result-answer">
                  {state.answer.split('').map((letter, i) => (
                    <div key={i} className="result-answer-cell">{letter}</div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="result-answer">
                  {state.answer.split('').map((letter, i) => (
                    <div key={i} className="result-answer-cell">{letter}</div>
                  ))}
                </div>
                <p className="result-headline lose">So Close!</p>
                {isDaily && <p className="result-tomorrow">Come back tomorrow for the next one.</p>}
              </>
            )}

            {wordStats && (
              <div className="result-stats">
                <div className="result-stats-row">
                  <div className="result-stat">
                    <span className="result-stat-value">{wordStats.totalPlays}</span>
                    <span className="result-stat-label">Played</span>
                  </div>
                  <div className="result-stat">
                    <span className="result-stat-value">{wordStats.winRate}%</span>
                    <span className="result-stat-label">Win rate</span>
                  </div>
                </div>
                <div className="result-dist">
                  {wordStats.guessDist.map((count, i) => (
                    <div key={i} className="result-dist-row">
                      <span className="result-dist-label">{i + 1}</span>
                      <div className="result-dist-bar-wrap">
                        <div
                          className={`result-dist-bar${guesses.length === i + 1 && solved ? ' current' : ''}`}
                          style={{ width: `${Math.max((count / distMax) * 100, count > 0 ? 8 : 0)}%` }}
                        >
                          {count > 0 && <span className="result-dist-count">{count}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {solved && (
              <button className="play-again-btn share-btn" onClick={handleShare}>
                {shareCopied ? 'Copied!' : 'Share'}
              </button>
            )}
            <button className="play-again-btn" onClick={onPlayRandom}>
              Play Random
            </button>
            <button className="play-again-btn secondary" onClick={onDashboard}>
              Dashboard
            </button>
          </div>
        </div>
      )}

      {!gameOver && (
        <div className="game-status-row">
          <span className="game-status">
            {guessesLeft} guess{guessesLeft !== 1 ? 'es' : ''} left
          </span>
          <span className="game-timer" style={{ visibility: state.startedAt ? 'visible' : 'hidden' }}>
            {formatElapsed(elapsed)}
          </span>
        </div>
      )}

      <Keyboard
        guesses={guesses}
        onKey={handleKey}
        disabled={gameOver}
        flippingLetters={flippingLetters}
        revealingRow={revealingRow}
      />
    </div>
  );
}
