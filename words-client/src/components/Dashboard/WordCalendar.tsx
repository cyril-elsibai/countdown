/**
 * Month grid (Monday first) of daily words. Each day is colored by the
 * user's result with the game's letter colors: green = solved, gray = out of
 * guesses, open outline = started, neutral = not played. Dots show difficulty
 * for everyone (more dots = fewer people solved it). Tapping a day opens
 * WordSheet, which replaces the old hover tooltip that didn't work on phones.
 */

import { useState, useEffect } from 'react';
import { wordleDashboardApi } from '../../api';
import type { WordleHistoryChallenge } from '../../api';
import WordSheet from './WordSheet';
import { wordOutcome, isTodayUTC } from './format';

interface Props {
  onSelectWord: (wordId: string) => void;
  onPlayWord: (wordId: string) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 1 (easy) to 4 (very hard) dots; 0 when nobody has played yet. */
function difficultyDots(c: WordleHistoryChallenge): number {
  if (c.difficulty.totalAttempts === 0) return 0;
  const p = c.difficulty.completionPercent;
  if (p > 70) return 1;
  if (p >= 40) return 2;
  if (p >= 20) return 3;
  return 4;
}

export default function WordCalendar({ onSelectWord, onPlayWord }: Props) {
  const [challenges, setChallenges] = useState<WordleHistoryChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [month, setMonth] = useState(() => new Date().getUTCMonth() + 1);
  const [selected, setSelected] = useState<WordleHistoryChallenge | null>(null);

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

  const now = new Date();
  const isCurrentMonth = year === now.getUTCFullYear() && month >= now.getUTCMonth() + 1;

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (isCurrentMonth) return;
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Index words by UTC day of month
  const byDay = new Map<number, WordleHistoryChallenge>();
  challenges.forEach(c => byDay.set(new Date(c.date).getUTCDate(), c));

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay: 0 = Sunday. Shift so Monday is the first column.
  const leadingBlanks = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return (
    <div className="calendar">
      <div className="cal-nav">
        <button
          className="icon-btn"
          onClick={prevMonth}
          aria-label="Previous month"
          disabled={!loading && challenges.length === 0}
        >
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="cal-title">{MONTH_NAMES[month - 1]} {year}</h2>
        <button className="icon-btn" onClick={nextMonth} aria-label="Next month" disabled={isCurrentMonth}>
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
            const c = byDay.get(day);
            const isFuture = Date.UTC(year, month - 1, day) > todayStart;

            // Words are generated a year ahead; never reveal or open future ones
            if (!c || isFuture) {
              return <div key={day} className={`day ${isFuture ? 'future' : 'none'}`}>{day}</div>;
            }

            const dots = difficultyDots(c);
            return (
              <button
                key={day}
                className={`day ${wordOutcome(c.userResult)}${isTodayUTC(c.date) ? ' today' : ''}`}
                onClick={() => setSelected(c)}
                aria-label={`Daily #${c.dailyNumber}`}
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
        <span><i className="correct-bg" />Solved</span>
        <span><i className="absent-bg" />Out of guesses</span>
        <span><i className="started-bg" />Started</span>
        <span><i className="key-bg" />Not played</span>
        <span><span className="pips"><i className="on" /><i className="on" /><i /><i /></span>Difficulty</span>
      </div>

      {selected && (
        <WordSheet
          challenge={selected}
          onClose={() => setSelected(null)}
          onPlay={() => { setSelected(null); onPlayWord(selected.id); }}
          onViewLeaderboard={() => { setSelected(null); onSelectWord(selected.id); }}
        />
      )}
    </div>
  );
}
