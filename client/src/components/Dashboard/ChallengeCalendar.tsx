/**
 * =============================================================================
 * CHALLENGE CALENDAR (Dashboard/ChallengeCalendar.tsx)
 * =============================================================================
 *
 * Month grid (Monday first) of daily challenges. Each day is colored by the
 * user's best result using the game's distance bands: exact / within 10 /
 * further, or neutral if not played. Dots show difficulty for everyone
 * (more dots = fewer people solved it). Tapping a day opens ChallengeSheet.
 *
 * @module client/components/Dashboard/ChallengeCalendar
 */

import { useState, useEffect } from 'react';
import { dashboardApi, HistoryChallenge } from '../../api';
import ChallengeSheet from './ChallengeSheet';
import { distanceBand, isTodayUTC } from './format';

interface ChallengeCalendarProps {
  onSelectFrame: (frameId: string) => void;
  onPlayFrame: (frameId: string, frameName?: string) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 1 (easy) to 4 (very hard) dots; 0 when nobody has played yet. */
function difficultyDots(challenge: HistoryChallenge): number {
  if (challenge.difficulty.totalAttempts === 0) return 0;
  const percent = challenge.difficulty.completionPercent;
  if (percent > 70) return 1;
  if (percent >= 40) return 2;
  if (percent >= 20) return 3;
  return 4;
}

function dayClass(challenge: HistoryChallenge): string {
  const result = challenge.userResult;
  if (!result) return '';
  if (result.solved) return 'exact';
  if (result.result == null) return 'far';
  return distanceBand(challenge.targetNumber, result.result);
}

export default function ChallengeCalendar({ onSelectFrame, onPlayFrame }: ChallengeCalendarProps) {
  const [challenges, setChallenges] = useState<HistoryChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [month, setMonth] = useState(() => new Date().getUTCMonth() + 1);
  const [selected, setSelected] = useState<HistoryChallenge | null>(null);

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

  const now = new Date();
  const isCurrentMonth = year === now.getUTCFullYear() && month >= now.getUTCMonth() + 1;

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (isCurrentMonth) return;
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  // Index challenges by UTC day of month
  const byDay = new Map<number, HistoryChallenge>();
  challenges.forEach(c => byDay.set(new Date(c.date).getUTCDate(), c));

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay: 0 = Sunday. Shift so Monday is the first column.
  const leadingBlanks = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return (
    <div className="calendar">
      <div className="cal-nav">
        <button
          onClick={handlePrevMonth}
          className="icon-btn"
          aria-label="Previous month"
          disabled={!loading && challenges.length === 0}
        >
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="cal-title">{MONTH_NAMES[month - 1]} {year}</h2>
        <button
          onClick={handleNextMonth}
          className="icon-btn"
          aria-label="Next month"
          disabled={isCurrentMonth}
        >
          <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {error ? (
        <div className="dash-note">{error}</div>
      ) : (
        <div className={`cal-grid${loading ? ' loading' : ''}`}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={`dow-${i}`} className="dow">{d}</div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => <div key={`blank-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const challenge = byDay.get(day);
            const isFuture = Date.UTC(year, month - 1, day) > todayStart;

            // Dailies are generated ahead of time; never reveal or open future ones
            if (!challenge || isFuture) {
              return <div key={day} className={`day ${isFuture ? 'future' : 'none'}`}>{day}</div>;
            }

            const dots = difficultyDots(challenge);
            return (
              <button
                key={day}
                className={`day ${dayClass(challenge)}${isTodayUTC(challenge.date) ? ' today' : ''}`}
                onClick={() => setSelected(challenge)}
                aria-label={`Daily #${challenge.dailyNumber}`}
              >
                {day}
                <span className={`pips${dots === 0 ? ' empty' : ''}`} aria-hidden="true">
                  {[1, 2, 3, 4].map(p => <i key={p} className={p <= dots ? 'on' : ''} />)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="cal-legend">
        <span><i className="exact-bg" />Solved</span>
        <span><i className="close-bg" />Within 10</span>
        <span><i className="far-bg" />Further</span>
        <span><i className="key-bg" />Not played</span>
        <span><span className="pips"><i className="on" /><i className="on" /><i /><i /></span>Difficulty</span>
      </div>

      {selected && (
        <ChallengeSheet
          challenge={selected}
          onClose={() => setSelected(null)}
          onPlay={() => {
            setSelected(null);
            onPlayFrame(selected.id, `Daily #${selected.dailyNumber}`);
          }}
          onViewLeaderboard={() => {
            setSelected(null);
            onSelectFrame(selected.id);
          }}
        />
      )}
    </div>
  );
}
