/**
 * =============================================================================
 * DASHBOARD ROUTES (routes/dashboard.ts)
 * =============================================================================
 *
 * This module handles all dashboard-related API endpoints for viewing
 * challenge history, leaderboards, and friends activity.
 *
 * @module server/routes/dashboard
 */

import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * Extract the daily challenge number from a frame's name (e.g. "Daily #64" → 64).
 */
function getDailyNumber(name: string | null): number | null {
  if (!name) return null;
  const match = name.match(/Daily #(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// =============================================================================
// HISTORY ENDPOINT
// =============================================================================

/**
 * GET /api/dashboard/history
 *
 * Returns challenges for a given month with difficulty stats and user's result.
 *
 * Query params:
 * - year: Year (defaults to current year)
 * - month: Month 1-12 (defaults to current month)
 *
 * Response:
 * {
 *   challenges: [{
 *     id: string,
 *     date: string,
 *     dailyNumber: number,
 *     targetNumber: number,
 *     tiles: number[],
 *     difficulty: {
 *       completionPercent: number,
 *       under60sPercent: number,
 *       under5minPercent: number,
 *       totalAttempts: number
 *     },
 *     userResult: {
 *       solved: boolean,
 *       duration: number | null,
 *       result: number | null
 *     } | null
 *   }]
 * }
 */
router.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year as string) || now.getUTCFullYear();
    const month = parseInt(req.query.month as string) || (now.getUTCMonth() + 1);

    // Calculate start and end dates for the month
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Get all frames for the month with their game results
    const frames = await prisma.frame.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        gameResults: {
          select: {
            userId: true,
            solved: true,
            duration: true,
            result: true,
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Build response with difficulty stats
    const challenges = frames.map(frame => {
      const results = frame.gameResults;
      const totalAttempts = results.length;
      const solvedResults = results.filter(r => r.solved);
      const completionPercent = totalAttempts > 0
        ? Math.round((solvedResults.length / totalAttempts) * 100)
        : 0;

      const under60s = solvedResults.filter(r => r.duration !== null && r.duration < 60).length;
      const under5min = solvedResults.filter(r => r.duration !== null && r.duration < 300).length;

      const under60sPercent = solvedResults.length > 0
        ? Math.round((under60s / solvedResults.length) * 100)
        : 0;
      const under5minPercent = solvedResults.length > 0
        ? Math.round((under5min / solvedResults.length) * 100)
        : 0;

      // Get user's result if they played
      const userResult = results.find(r => r.userId === req.userId);

      return {
        id: frame.id,
        date: frame.date!.toISOString(),
        dailyNumber: getDailyNumber(frame.name),
        targetNumber: frame.targetNumber,
        tiles: frame.tiles,
        difficulty: {
          completionPercent,
          under60sPercent,
          under5minPercent,
          totalAttempts,
        },
        userResult: userResult ? {
          solved: userResult.solved,
          duration: userResult.duration,
          result: userResult.result,
        } : null,
      };
    });

    res.json({ challenges });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// =============================================================================
// PER-FRAME LEADERBOARD ENDPOINT
// =============================================================================

/**
 * GET /api/dashboard/leaderboard
 *
 * Returns ranked list of users for a specific frame (daily or random).
 *
 * RANKING ALGORITHM (multi-tier):
 * 1. Solved users ranked above unsolved
 * 2. Among equal solve status, closest to target wins
 * 3. Among equal distance, fastest time wins
 *
 * Query params:
 * - type: 'global' | 'friends' (defaults to 'global')
 * - frameId: Frame ID (defaults to today's frame)
 *
 * Response:
 * {
 *   leaderboard: [{
 *     rank: number,
 *     userId: string,
 *     name: string | null,
 *     duration: number | null,
 *     solved: boolean,
 *     result: number | null,
 *     difference: number | null  // Distance from target
 *   }],
 *   userRank: number | null,
 *   frameId: string,
 *   dailyNumber: number | null
 * }
 */
router.get('/leaderboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const type = (req.query.type as string) || 'global';
    let frameId = req.query.frameId as string;

    // If no frameId provided, use today's frame
    if (!frameId) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const todayFrame = await prisma.frame.findUnique({
        where: { date: today },
      });

      if (!todayFrame) {
        return res.json({ leaderboard: [], userRank: null, frameId: null, dailyNumber: null });
      }
      frameId = todayFrame.id;
    }

    // Get the frame for daily number
    const frame = await prisma.frame.findUnique({
      where: { id: frameId },
    });

    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    // Get user IDs to filter by (for friends leaderboard)
    let userIdFilter: string[] | undefined;

    if (type === 'friends') {
      // Get all accepted friendships
      const friendships = await prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { userId: req.userId },
            { friendId: req.userId },
          ],
        },
      });

      // Extract friend IDs
      const friendIds = friendships.map(f =>
        f.userId === req.userId ? f.friendId : f.userId
      );

      // Include current user in friends leaderboard
      userIdFilter = [...friendIds, req.userId!];
    }

    // Get game results for this frame
    const results = await prisma.gameResult.findMany({
      where: {
        frameId,
        userId: userIdFilter ? { in: userIdFilter } : { not: null },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const targetNumber = frame.targetNumber;
    const OVERTIME_SECONDS = 60;

    // Exclude entries where no result was ever submitted (opened but never calculated)
    const submitted = results.filter(r => r.result !== null);

    // Split into three groups
    const solvedInTime  = submitted.filter(r => r.solved && (r.duration ?? Infinity) <= OVERTIME_SECONDS);
    const solvedOvertime = submitted.filter(r => r.solved && (r.duration ?? Infinity) > OVERTIME_SECONDS);
    const unsolved      = submitted.filter(r => !r.solved);

    // Group 1: solved within time → fastest first
    solvedInTime.sort((a, b) => (a.duration ?? Infinity) - (b.duration ?? Infinity));

    // Group 2: solved overtime → submission time order
    solvedOvertime.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());

    // Group 3: unsolved → closest to target, then submission time for ties
    unsolved.sort((a, b) => {
      const diffA = Math.abs(targetNumber - a.result!);
      const diffB = Math.abs(targetNumber - b.result!);
      if (diffA !== diffB) return diffA - diffB;
      return a.playedAt.getTime() - b.playedAt.getTime();
    });

    const sortedResults = [...solvedInTime, ...solvedOvertime, ...unsolved];

    // Build leaderboard with ranks
    const leaderboard = sortedResults.map((result, index) => ({
      rank: index + 1,
      userId: result.userId!,
      name: result.user?.name || result.user?.email?.split('@')[0] || 'Anonymous',
      duration: result.duration,
      solved: result.solved,
      result: result.result,
      difference: result.result !== null ? Math.abs(targetNumber - result.result) : null,
      playedAt: result.playedAt,
    }));

    // Find current user's rank
    const userRank = leaderboard.find(entry => entry.userId === req.userId)?.rank || null;

    res.json({
      leaderboard,
      userRank,
      frameId,
      dailyNumber: getDailyNumber(frame.name ?? null),
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// =============================================================================
// OVERALL LEADERBOARD ENDPOINT
// =============================================================================

/**
 * GET /api/dashboard/overall-leaderboard
 *
 * Returns top users by total points with current user's rank.
 * Points are pre-calculated by the daily batch job and stored in UserStats.
 *
 * Response:
 * {
 *   leaderboard: [{
 *     rank: number,
 *     userId: string,
 *     name: string | null,
 *     totalPoints: number
 *   }],
 *   userRank: number | null,
 *   userPoints: number,
 *   lastCalculated: string | null
 * }
 */
router.get('/overall-leaderboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Get top 50 users by total points from cached UserStats
    const topStats = await prisma.userStats.findMany({
      where: {
        totalPoints: { gt: 0 },
      },
      orderBy: {
        totalPoints: 'desc',
      },
      take: 50,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Build leaderboard with ranks
    const leaderboard = topStats.map((stats, index) => ({
      rank: index + 1,
      userId: stats.userId,
      name: stats.user.name || stats.user.email.split('@')[0],
      totalPoints: stats.totalPoints,
    }));

    // Get current user's stats
    const currentUserStats = await prisma.userStats.findUnique({
      where: { userId: req.userId! },
    });

    // Find current user's rank (count users with more points + 1)
    let userRank: number | null = null;
    if (currentUserStats && currentUserStats.totalPoints > 0) {
      const usersAhead = await prisma.userStats.count({
        where: {
          totalPoints: { gt: currentUserStats.totalPoints },
        },
      });
      userRank = usersAhead + 1;
    }

    // Get last calculation time from most recent completed calculation
    const lastCalculation = await prisma.pointsCalculation.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });

    res.json({
      leaderboard,
      userRank,
      userPoints: currentUserStats?.totalPoints || 0,
      lastCalculated: lastCalculation?.completedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error('Overall leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get overall leaderboard' });
  }
});

// =============================================================================
// FRIENDS ACTIVITY ENDPOINT
// =============================================================================

/**
 * GET /api/dashboard/friends-activity
 *
 * Returns recent game results from friends.
 *
 * Query params:
 * - limit: Number of results to return (defaults to 20)
 *
 * Response:
 * {
 *   activity: [{
 *     id: string,
 *     userId: string,
 *     name: string | null,
 *     frameId: string,
 *     dailyNumber: number | null,
 *     solved: boolean,
 *     duration: number | null,
 *     playedAt: string
 *   }]
 * }
 */
router.get('/friends-activity', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    // Get all accepted friendships
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userId: req.userId },
          { friendId: req.userId },
        ],
      },
    });

    // Extract friend IDs
    const friendIds = friendships.map(f =>
      f.userId === req.userId ? f.friendId : f.userId
    );

    if (friendIds.length === 0) {
      return res.json({ activity: [] });
    }

    // Get recent game results from friends
    const results = await prisma.gameResult.findMany({
      where: {
        userId: { in: friendIds },
        frame: {
          date: { not: null }, // Only daily challenges
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        frame: {
          select: {
            id: true,
            date: true,
            name: true,
          },
        },
      },
      orderBy: {
        playedAt: 'desc',
      },
      take: limit,
    });

    const activity = results.map(result => ({
      id: result.id,
      userId: result.userId!,
      name: result.user?.name || result.user?.email?.split('@')[0] || 'Friend',
      frameId: result.frameId,
      dailyNumber: getDailyNumber(result.frame.name ?? null),
      solved: result.solved,
      duration: result.duration,
      playedAt: result.playedAt.toISOString(),
    }));

    res.json({ activity });
  } catch (error) {
    console.error('Friends activity error:', error);
    res.status(500).json({ error: 'Failed to get friends activity' });
  }
});

// =============================================================================
// STATS ENDPOINT
// =============================================================================

/**
 * Compute aggregate stats for a given user.
 */
async function computeStats(userId: string) {
  // Fetch all game results with frame data for streak/distance calculations
  const results = await prisma.gameResult.findMany({
    where: { userId },
    include: {
      frame: { select: { targetNumber: true, date: true } },
    },
  });

  const totalGamesPlayed = results.length;
  const solvedResults = results.filter(r => r.solved);
  const successRate = totalGamesPlayed > 0
    ? Math.round((solvedResults.length / totalGamesPlayed) * 100)
    : 0;

  const resultsWithValue = results.filter(r => r.result !== null);
  const averageDistance = resultsWithValue.length > 0
    ? Math.round(
        resultsWithValue.reduce((sum, r) => sum + Math.abs(r.frame.targetNumber - r.result!), 0)
        / resultsWithValue.length
      )
    : null;

  // Best time: minimum duration among solved games (exclude penalty time >= 10000s)
  const solvedWithTime = solvedResults.filter(r => r.duration !== null && r.duration < 10000);
  const bestTime = solvedWithTime.length > 0
    ? Math.min(...solvedWithTime.map(r => r.duration!))
    : null;

  const perfectSolves = solvedResults.length;

  // Streak calculation: only daily challenges (frame.date != null), solved
  const solvedDailyDates = results
    .filter(r => r.solved && r.frame.date !== null)
    .map(r => r.frame.date!.toISOString().split('T')[0])
    .sort();

  let currentStreak = 0;
  let longestStreak = 0;

  if (solvedDailyDates.length > 0) {
    // Longest streak
    let tempStreak = 1;
    for (let i = 1; i < solvedDailyDates.length; i++) {
      const prev = new Date(solvedDailyDates[i - 1]);
      const curr = new Date(solvedDailyDates[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Current streak: walk backwards from today
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);
    const todayStr = todayUTC.toISOString().split('T')[0];
    const yesterdayStr = new Date(todayUTC.getTime() - 86400000).toISOString().split('T')[0];

    const lastDate = solvedDailyDates[solvedDailyDates.length - 1];
    if (lastDate === todayStr || lastDate === yesterdayStr) {
      currentStreak = 1;
      for (let i = solvedDailyDates.length - 2; i >= 0; i--) {
        const expected = new Date(new Date(solvedDailyDates[i + 1]).getTime() - 86400000)
          .toISOString().split('T')[0];
        if (solvedDailyDates[i] === expected) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
  }

  return { totalGamesPlayed, successRate, averageDistance, bestTime, perfectSolves, currentStreak, longestStreak };
}

/**
 * GET /api/dashboard/stats
 *
 * Returns aggregate stats for the current user and optionally a friend.
 * Also returns the list of accepted friends for the comparison dropdown.
 *
 * Query params:
 * - compareWith: userId of a friend to compare against (optional)
 */
router.get('/stats', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const compareWithId = req.query.compareWith as string | undefined;

    // Validate friendship if compareWith is provided
    if (compareWithId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          status: 'ACCEPTED',
          OR: [
            { userId, friendId: compareWithId },
            { userId: compareWithId, friendId: userId },
          ],
        },
      });
      if (!friendship) {
        return res.status(403).json({ error: 'Not friends with this user' });
      }
    }

    // Get accepted friends for the dropdown
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userId }, { friendId: userId }],
      },
      include: {
        user: { select: { id: true, name: true } },
        friend: { select: { id: true, name: true } },
      },
    });

    const friends = friendships.map(f =>
      f.userId === userId
        ? { id: f.friendId, name: f.friend.name }
        : { id: f.userId, name: f.user.name }
    );

    const myStats = await computeStats(userId);
    const friendStats = compareWithId ? await computeStats(compareWithId) : null;

    let friendName: string | null = null;
    if (compareWithId) {
      const friend = await prisma.user.findUnique({
        where: { id: compareWithId },
        select: { name: true },
      });
      friendName = friend?.name ?? 'Friend';
    }

    res.json({ myStats, friendStats, friendName, friends });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
