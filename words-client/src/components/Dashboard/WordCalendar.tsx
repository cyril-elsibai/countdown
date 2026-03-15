import { useState, useEffect, useRef } from 'react';
import { wordleDashboardApi } from '../../api';
import type { WordleHistoryChallenge } from '../../api';

interface Props {
  onSelectWord: (wordId: string) => void;
  onPlayWord: (wordId: string) => void;
}

interface TooltipPosition {
  x: number;
  y: number;
  placement: 'above' | 'below';
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function WordCalendar({ onSelectWord, onPlayWord }: Props) {
  const [challenges, setChallenges] = useState<WordleHistoryChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [month, setMonth] = useState(() => new Date().getUTCMonth() + 1);
  const [hovered, setHovered] = useState<WordleHistoryChallenge | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ x: 0, y: 0, placement: 'above' });
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { load(); }, [year, month]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await wordleDashboardApi.getHistory(year, month);
      setChallenges(res.challenges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    const now = new Date();
    if (year === now.getUTCFullYear() && month >= now.getUTCMonth() + 1) return;
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const isAtCurrentMonth = () => {
    const now = new Date();
    return year === now.getUTCFullYear() && month >= now.getUTCMonth() + 1;
  };

  const isFuture = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return d > today;
  };

  const isToday = (dateStr: string) => {
    return new Date(dateStr).toDateString() === new Date().toDateString();
  };

  const getStatusClass = (c: WordleHistoryChallenge) => {
    if (!c.userResult) return 'unplayed';
    if (c.userResult.solved) return 'solved';
    if (c.userResult.guessCount < 6) return 'in-progress';
    return 'tried';
  };

  const getDifficultyClass = (c: WordleHistoryChallenge) => {
    if (c.difficulty.totalAttempts === 0) return null;
    const p = c.difficulty.completionPercent;
    if (p > 70) return 'easy';
    if (p >= 40) return 'medium';
    if (p >= 20) return 'hard';
    return 'very-hard';
  };

  const onMouseEnter = (c: WordleHistoryChallenge, e: React.MouseEvent) => {
    if (hideTimeout.current) { clearTimeout(hideTimeout.current); hideTimeout.current = null; }
    const rect = e.currentTarget.getBoundingClientRect();
    const placement = rect.top > 380 ? 'above' : 'below';
    setTooltipPos({ x: rect.left + rect.width / 2, y: placement === 'above' ? rect.top : rect.bottom, placement });
    setHovered(c);
  };

  const onMouseLeave = () => {
    hideTimeout.current = setTimeout(() => setHovered(null), 150);
  };

  if (loading) return <div className="calendar-loading">Loading...</div>;
  if (error) return <div className="calendar-error">{error}</div>;

  return (
    <div className="challenge-calendar">
      <div className="calendar-nav">
        <button className="nav-btn" onClick={prevMonth} aria-label="Previous month">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="nav-title">{MONTH_NAMES[month - 1]} {year}</h2>
        <button className="nav-btn" onClick={nextMonth} aria-label="Next month" disabled={isAtCurrentMonth()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="challenge-grid">
        {challenges.filter(c => !isFuture(c.date)).map(c => {
          const status = getStatusClass(c);
          const diff = getDifficultyClass(c);
          const today = isToday(c.date);
          return (
            <div
              key={c.id}
              className={`challenge-tile ${status} ${today ? 'today' : ''} ${c.userResult?.solved ? 'no-click' : ''}`}
              onMouseEnter={e => onMouseEnter(c, e)}
              onMouseLeave={onMouseLeave}
              onClick={() => !c.userResult?.solved && onPlayWord(c.id)}
            >
              <div className={`status-bar ${status}`}>
                {status === 'solved' ? 'Solved' : status === 'tried' ? 'Failed' : status === 'in-progress' ? 'In Progress' : 'New'}
              </div>
              <span className="daily-number">#{c.dailyNumber}</span>
              <span className="word-length-badge">{c.wordLength}L</span>
              {diff && <div className={`difficulty-bar ${diff}`} />}
            </div>
          );
        })}
      </div>

      {hovered && (
        <div
          className={`challenge-tooltip ${tooltipPos.placement}`}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
          onMouseEnter={() => { if (hideTimeout.current) { clearTimeout(hideTimeout.current); hideTimeout.current = null; } }}
          onMouseLeave={() => setHovered(null)}
        >
          <div className="tooltip-header">
            <span className="tooltip-daily">Daily #{hovered.dailyNumber} · {hovered.wordLength} letters</span>
            <span className="tooltip-date">{formatDate(hovered.date)}</span>
          </div>

          <div className="tooltip-stats">
            <div className="stat-row">
              <span className="stat-label">Completion:</span>
              <span className="stat-value">{hovered.difficulty.completionPercent}%</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Total attempts:</span>
              <span className="stat-value">{hovered.difficulty.totalAttempts}</span>
            </div>
          </div>

          {hovered.userResult && (
            <div className={`tooltip-result ${hovered.userResult.solved ? 'solved' : hovered.userResult.guessCount < 6 ? 'in-progress' : 'attempted'}`}>
              {hovered.userResult.solved ? (
                <>
                  <span className="result-icon">✓</span>
                  <span>Solved in {hovered.userResult.guessCount} guess{hovered.userResult.guessCount !== 1 ? 'es' : ''}</span>
                </>
              ) : hovered.userResult.guessCount < 6 ? (
                <>
                  <span className="result-icon">○</span>
                  <span>In progress — {hovered.userResult.guessCount} guess{hovered.userResult.guessCount !== 1 ? 'es' : ''} used</span>
                </>
              ) : (
                <>
                  <span className="result-icon">✗</span>
                  <span>Failed</span>
                </>
              )}
            </div>
          )}

          <div className="tooltip-actions">
            {!hovered.userResult && !isToday(hovered.date) && (
              <button className="tooltip-btn play" onClick={() => { setHovered(null); onPlayWord(hovered!.id); }}>
                Play
              </button>
            )}
            {isToday(hovered.date) && !hovered.userResult && (
              <span className="today-note">Today's word — play from home</span>
            )}
            <button className="tooltip-btn leaderboard" onClick={() => { setHovered(null); onSelectWord(hovered!.id); }}>
              View Leaderboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
