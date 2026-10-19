/**
 * Shared formatting for dashboard views, so every tab shows times, ages and
 * result colors the same way.
 */

/** Calendar/day state for a word: solved, failed (out of guesses), started, or not played. */
export type WordOutcome = 'correct' | 'absent' | 'started' | '';

export function wordOutcome(result: { solved: boolean; guessCount: number } | null | undefined): WordOutcome {
  if (!result) return '';
  if (result.solved) return 'correct';
  if (result.guessCount >= 6) return 'absent';
  return 'started';
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${seconds.toFixed(1)}s`;
}

export function formatTimeAgo(dateStr: string): string {
  const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Daily words are keyed by UTC date. */
export function isTodayUTC(dateStr: string): boolean {
  return new Date(dateStr).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

/** Result chip used in history and leaderboards: "3/6" in green, "X/6" in gray, or in progress. */
export function ResultChip({ solved, guessCount }: { solved: boolean; guessCount: number }) {
  if (solved) return <span className="chip correct">{guessCount}/6</span>;
  if (guessCount >= 6) return <span className="chip absent">X/6</span>;
  return <span className="chip none">{guessCount}/6 so far</span>;
}
