/**
 * =============================================================================
 * WORDLE POINTS CALCULATOR (services/wordlePointsCalculator.ts)
 * =============================================================================
 *
 * Daily batch recalculation of user points for the 67words leaderboard.
 * Runs alongside the 67numbers points calculation at UTC midnight.
 *
 * FORMULA (per solved word):
 *   base  = floor(50 * (1 + (100 - completionPercent) / 100))  → 50–100 pts
 *   speed = max(0, 30 - floor(max(0, duration - 30) / 3))      → 0–30 pts
 *   total = base + speed                                         → 50–130 pts
 *
 * completionPercent = % of players who solved the word (0 = hardest, 100 = easiest)
 * Only daily words count toward points. Random words are excluded.
 */

import { prisma } from '../db';

/**
 * Calculate points for a single solved word result.
 */
export function calculateWordlePoints(
  completionPercent: number,
  duration: number | null,
): number {
  const base = Math.floor(50 * (1 + (100 - completionPercent) / 100));

  let speed = 0;
  if (duration !== null) {
    if (duration <= 30) {
      speed = 30;
    } else if (duration < 120) {
      speed = Math.max(0, 30 - Math.floor((duration - 30) / 3));
    }
  }

  return base + speed;
}

/**
 * Run the full wordle points recalculation.
 *
 * Steps:
 * 1. Load all solved daily WordleResults with their word's completion stats
 * 2. Compute completionPercent per word from all results
 * 3. Sum points per user
 * 4. Upsert WordleUserStats
 */
export async function runWordlePointsCalculation(): Promise<{
  usersProcessed: number;
  resultsProcessed: number;
}> {
  // Load all results for daily words (solved + unsolved, to compute completionPercent)
  const allDailyResults = await prisma.wordleResult.findMany({
    where: { word: { date: { not: null } } },
    select: { wordId: true, userId: true, solved: true, duration: true },
  });

  // Compute completionPercent per word
  const wordTotals = new Map<string, { total: number; solved: number }>();
  for (const r of allDailyResults) {
    const entry = wordTotals.get(r.wordId) ?? { total: 0, solved: 0 };
    entry.total++;
    if (r.solved) entry.solved++;
    wordTotals.set(r.wordId, entry);
  }

  const wordCompletionPercent = new Map<string, number>();
  for (const [wordId, { total, solved }] of wordTotals) {
    wordCompletionPercent.set(wordId, total > 0 ? Math.round((solved / total) * 100) : 0);
  }

  // Sum points for each user (solved results only)
  const userPointsMap = new Map<string, number>();
  let resultsProcessed = 0;

  for (const r of allDailyResults) {
    if (!r.solved || !r.userId) continue;
    const completionPercent = wordCompletionPercent.get(r.wordId) ?? 0;
    const points = calculateWordlePoints(completionPercent, r.duration);
    userPointsMap.set(r.userId, (userPointsMap.get(r.userId) ?? 0) + points);
    resultsProcessed++;
  }

  // Upsert WordleUserStats
  const now = new Date();
  for (const [userId, totalPoints] of userPointsMap) {
    await prisma.wordleUserStats.upsert({
      where: { userId },
      create: { userId, totalPoints, lastCalculated: now },
      update: { totalPoints, lastCalculated: now },
    });
  }

  return { usersProcessed: userPointsMap.size, resultsProcessed };
}
