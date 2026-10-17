/**
 * Shared formatting for dashboard views, so every tab shows times, ages and
 * distance colors the same way.
 */

export type DistanceBand = 'exact' | 'close' | 'far';

/**
 * Distance band for a result, matching the game screen:
 * exact (hit the target), close (within 10), far (more than 10 away).
 */
export function distanceBand(target: number, result: number): DistanceBand {
  const diff = Math.abs(target - result);
  if (diff === 0) return 'exact';
  if (diff <= 10) return 'close';
  return 'far';
}

/** Band from a known difference (leaderboards return the difference directly). */
export function bandFromDifference(difference: number | null): DistanceBand {
  if (difference === 0) return 'exact';
  if (difference !== null && difference <= 10) return 'close';
  return 'far';
}

/**
 * Solve duration in seconds. Durations >= 10000 are the server's penalty
 * marker for results without a usable time.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds >= 10000) return 'Overtime';
  if (seconds >= 300) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${seconds.toFixed(2)}s`;
}

export function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Daily challenges are keyed by UTC date. */
export function isTodayUTC(dateStr: string): boolean {
  return new Date(dateStr).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}
