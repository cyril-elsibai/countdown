/**
 * =============================================================================
 * CHALLENGE CALENDAR (Dashboard/ChallengeCalendar.tsx)
 * =============================================================================
 *
 * Monthly grid calendar view of daily challenges with color-coded difficulty
 * and hover tooltips showing details.
 *
 * @module client/components/Dashboard/ChallengeCalendar
 */

import { useState, useEffect, useRef } from 'react';
import { dashboardApi, HistoryChallenge } from '../../api';
import ChallengeTooltip from './ChallengeTooltip';

interface ChallengeCalendarProps {
  onSelectFrame: (frameId: string) => void;
  onPlayFrame: (frameId: string, frameName?: string) => void;
}

export default function ChallengeCalendar({ onSelectFrame, onPlayFrame }: ChallengeCalendarProps) {
  const [challenges, setChallenges] = useState<HistoryChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [month, setMonth] = useState(() => new Date().getUTCMonth() + 1);
  const [hoveredChallenge, setHoveredChallenge] = useState<HistoryChallenge | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, placement: 'above' as 'above' | 'below' });

  useEffect(() => {
    loadHistory();
  }, [year, month]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dashboardApi.getHistory(year, month);
      setChallenges(response.challenges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    if (year === currentYear && month >= currentMonth) {
      return;
    }

    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  // Use a ref to track the hide timeout so we can cancel it
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (challenge: HistoryChallenge, event: React.MouseEvent) => {
    // Cancel any pending hide
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const placement = rect.top > 380 ? 'above' : 'below';
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: placement === 'above' ? rect.top : rect.bottom,
      placement,
    });
    setHoveredChallenge(challenge);
  };

  const handleMouseLeave = () => {
    // Delay hiding to allow mouse to move to tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredChallenge(null);
    }, 150);
  };

  const handleTooltipMouseEnter = () => {
    // Cancel the hide when mouse enters tooltip
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
    // Hide immediately when leaving tooltip
    setHoveredChallenge(null);
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getStatusClass = (challenge: HistoryChallenge): string => {
    if (!challenge.userResult) return 'unplayed';
    return challenge.userResult.solved ? 'solved' : 'tried';
  };

  const getDifficultyClass = (challenge: HistoryChallenge): string | null => {
    if (challenge.difficulty.totalAttempts === 0) return null;
    const percent = challenge.difficulty.completionPercent;
    if (percent > 70) return 'easy';
    if (percent >= 40) return 'medium';
    if (percent >= 20) return 'hard';
    return 'very-hard';
  };

  const isToday = (challenge: HistoryChallenge): boolean => {
    const date = new Date(challenge.date);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isFuture = (dateStr: string): boolean => {
    const cellDate = new Date(dateStr);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return cellDate > today;
  };

  if (loading) {
    return <div className="calendar-loading">Loading challenges...</div>;
  }

  if (error) {
    return <div className="calendar-error">{error}</div>;
  }

  return (
    <div className="challenge-calendar">
      <div className="calendar-nav">
        <button
          onClick={handlePrevMonth}
          className="nav-btn"
          aria-label="Previous month"
          disabled={!loading && challenges.length === 0}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="nav-title">{monthNames[month - 1]} {year}</h2>
        <button
          onClick={handleNextMonth}
          className="nav-btn"
          aria-label="Next month"
          disabled={year === new Date().getUTCFullYear() && month >= new Date().getUTCMonth() + 1}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="challenge-grid">
        {challenges.filter(c => !isFuture(c.date)).map((challenge) => {
          const statusClass = getStatusClass(challenge);
          const difficultyClass = getDifficultyClass(challenge);
          const isTodayChallenge = isToday(challenge);

          return (
            <div
              key={challenge.id}
              className={`challenge-tile ${statusClass} ${isTodayChallenge ? 'today' : ''} ${challenge.userResult?.solved ? 'no-click' : ''}`}
              onMouseEnter={(e) => handleMouseEnter(challenge, e)}
              onMouseLeave={handleMouseLeave}
              onClick={() => !challenge.userResult?.solved && onPlayFrame(challenge.id, `Daily #${challenge.dailyNumber}`)}
            >
              <div className={`status-bar ${statusClass}`}>
                {statusClass === 'solved' ? 'Solved' : statusClass === 'tried' ? 'Failed' : 'New'}
              </div>
              <span className="daily-number">#{challenge.dailyNumber}</span>
              {difficultyClass && <div className={`difficulty-bar ${difficultyClass}`} />}
            </div>
          );
        })}
      </div>

      {hoveredChallenge && (
        <ChallengeTooltip
          challenge={hoveredChallenge}
          position={tooltipPosition}
          onPlay={() => {
            setHoveredChallenge(null);
            onPlayFrame(hoveredChallenge.id, `Daily #${hoveredChallenge.dailyNumber}`);
          }}
          onViewLeaderboard={() => {
            setHoveredChallenge(null);
            onSelectFrame(hoveredChallenge.id);
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        />
      )}
    </div>
  );
}
