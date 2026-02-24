/**
 * =============================================================================
 * POINTS CALCULATOR SERVICE (services/pointsCalculator.ts)
 * =============================================================================
 *
 * Handles the daily batch recalculation of user points for the leaderboard.
 * This job runs once per day at UTC midnight and recalculates:
 * 1. Frame stats (totalAttempts, solvedCount, completionPercent)
 * 2. User total points based on all their solved challenges
 *
 * @module server/services/pointsCalculator
 */

import { prisma } from '../db';

/**
 * Calculate points for a single game result.
 * Base points = 100 - completionPercent (harder = more points)
 * Time bonus: <60s = 1.2x, <5min = 1.1x, else 1.0x
 */
function calculatePoints(completionPercent: number, durationSeconds: number | null): number {
  const basePoints = 100 - completionPercent;
  let multiplier = 1.0;

  if (durationSeconds !== null) {
    if (durationSeconds < 60) {
      multiplier = 1.2;
    } else if (durationSeconds < 300) {
      multiplier = 1.1;
    }
  }

  return Math.round(basePoints * multiplier);
}

/**
 * Result of a points calculation run.
 */
export interface CalculationResult {
  success: boolean;
  calculationId: string;
  durationMs: number;
  framesProcessed: number;
  usersProcessed: number;
  resultsProcessed: number;
  error?: string;
}

/**
 * Run the full points recalculation.
 *
 * Steps:
 * 1. Create a PointsCalculation record to track the job
 * 2. Calculate and update Frame stats (totalAttempts, solvedCount, completionPercent)
 * 3. Calculate total points for each user with solved results
 * 4. Update UserStats for all users
 * 5. Mark job as completed
 *
 * @param triggeredBy - Optional identifier of who triggered the job (null = scheduled)
 * @returns CalculationResult with stats about the run
 */
export async function runPointsCalculation(triggeredBy?: string): Promise<CalculationResult> {
  const startTime = Date.now();

  // Create tracking record
  const calculation = await prisma.pointsCalculation.create({
    data: {
      triggeredBy: triggeredBy || null,
    },
  });

  let framesProcessed = 0;
  let usersProcessed = 0;
  let resultsProcessed = 0;

  try {
    // =========================================================================
    // STEP 1: Calculate and update Frame stats
    // =========================================================================
    console.log('[PointsCalculator] Step 1: Calculating frame stats...');

    // Get aggregated stats for all frames with daily challenges
    const frameStats = await prisma.gameResult.groupBy({
      by: ['frameId'],
      _count: {
        id: true,
      },
      where: {
        frame: {
          date: { not: null }, // Only daily challenges
        },
      },
    });

    // Get solved counts separately
    const frameSolvedStats = await prisma.gameResult.groupBy({
      by: ['frameId'],
      _count: {
        id: true,
      },
      where: {
        solved: true,
        frame: {
          date: { not: null },
        },
      },
    });

    // Build a map of frameId -> solvedCount
    const solvedCountMap = new Map<string, number>();
    for (const stat of frameSolvedStats) {
      solvedCountMap.set(stat.frameId, stat._count.id);
    }

    // Update each frame's stats
    for (const stat of frameStats) {
      const totalAttempts = stat._count.id;
      const solvedCount = solvedCountMap.get(stat.frameId) || 0;
      const completionPercent = totalAttempts > 0
        ? Math.round((solvedCount / totalAttempts) * 100)
        : 0;

      await prisma.frame.update({
        where: { id: stat.frameId },
        data: {
          totalAttempts,
          solvedCount,
          completionPercent,
        },
      });

      framesProcessed++;
    }

    console.log(`[PointsCalculator] Updated ${framesProcessed} frames`);

    // =========================================================================
    // STEP 2: Calculate user points
    // =========================================================================
    console.log('[PointsCalculator] Step 2: Calculating user points...');

    // Get all solved game results with frame data
    const solvedResults = await prisma.gameResult.findMany({
      where: {
        solved: true,
        userId: { not: null },
        frame: {
          date: { not: null }, // Only daily challenges count
        },
      },
      select: {
        userId: true,
        duration: true,
        frame: {
          select: {
            completionPercent: true,
          },
        },
      },
    });

    resultsProcessed = solvedResults.length;
    console.log(`[PointsCalculator] Processing ${resultsProcessed} solved results`);

    // Calculate total points per user
    const userPointsMap = new Map<string, number>();

    for (const result of solvedResults) {
      if (!result.userId) continue;

      const points = calculatePoints(result.frame.completionPercent, result.duration);
      const currentTotal = userPointsMap.get(result.userId) || 0;
      userPointsMap.set(result.userId, currentTotal + points);
    }

    // =========================================================================
    // STEP 3: Update UserStats
    // =========================================================================
    console.log('[PointsCalculator] Step 3: Updating user stats...');

    const now = new Date();

    // Batch upsert UserStats
    for (const [userId, totalPoints] of userPointsMap) {
      await prisma.userStats.upsert({
        where: { userId },
        create: {
          userId,
          totalPoints,
          lastCalculated: now,
        },
        update: {
          totalPoints,
          lastCalculated: now,
        },
      });

      usersProcessed++;
    }

    console.log(`[PointsCalculator] Updated stats for ${usersProcessed} users`);

    // =========================================================================
    // STEP 4: Mark job as completed
    // =========================================================================
    const durationMs = Date.now() - startTime;

    await prisma.pointsCalculation.update({
      where: { id: calculation.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        durationMs,
        framesProcessed,
        usersProcessed,
        resultsProcessed,
      },
    });

    console.log(`[PointsCalculator] Completed in ${durationMs}ms`);

    return {
      success: true,
      calculationId: calculation.id,
      durationMs,
      framesProcessed,
      usersProcessed,
      resultsProcessed,
    };

  } catch (error) {
    // Mark job as failed
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await prisma.pointsCalculation.update({
      where: { id: calculation.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        durationMs,
        framesProcessed,
        usersProcessed,
        resultsProcessed,
        error: errorMessage,
      },
    });

    console.error('[PointsCalculator] Failed:', errorMessage);

    return {
      success: false,
      calculationId: calculation.id,
      durationMs,
      framesProcessed,
      usersProcessed,
      resultsProcessed,
      error: errorMessage,
    };
  }
}

/**
 * Get the most recent points calculation runs.
 *
 * @param limit - Maximum number of runs to return
 * @returns Array of PointsCalculation records
 */
export async function getCalculationHistory(limit: number = 10) {
  return prisma.pointsCalculation.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

/**
 * Check if a calculation is currently running.
 */
export async function isCalculationRunning(): Promise<boolean> {
  const running = await prisma.pointsCalculation.findFirst({
    where: { status: 'RUNNING' },
  });
  return !!running;
}
