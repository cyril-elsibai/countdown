/**
 * =============================================================================
 * WORDLE DASHBOARD ROUTES (routes/wordleDashboard.ts)
 * =============================================================================
 *
 * Dashboard endpoints for the 67words game.
 * Mirrors dashboard.ts but adapted for WordleWord/WordleResult models.
 *
 * @module server/routes/wordleDashboard
 */

import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

function getDailyWordNumber(name: string | null): number | null {
  if (!name) return null;
  const match = name.match(/Daily Word #(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// =============================================================================
// HISTORY
// =============================================================================

router.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const year  = parseInt(req.query.year  as string) || now.getUTCFullYear();
    const month = parseInt(req.query.month as string) || (now.getUTCMonth() + 1);

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const words = await prisma.wordleWord.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: {
        results: {
          select: { userId: true, solved: true, duration: true, guesses: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    const challenges = words.map(w => {
      const results = w.results;
      const totalAttempts = results.length;
      const solvedResults = results.filter(r => r.solved);
      const completionPercent = totalAttempts > 0
        ? Math.round((solvedResults.length / totalAttempts) * 100)
        : 0;

      const userResult = results.find(r => r.userId === req.userId);

      return {
        id: w.id,
        date: w.date!.toISOString(),
        dailyNumber: getDailyWordNumber(w.name),
        wordLength: w.wordLength,
        difficulty: { completionPercent, totalAttempts },
        userResult: userResult ? {
          solved: userResult.solved,
          guessCount: userResult.guesses.length,
          duration: userResult.duration,
        } : null,
      };
    });

    res.json({ challenges });
  } catch (error) {
    console.error('Wordle history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// =============================================================================
// PER-WORD LEADERBOARD
// =============================================================================

router.get('/leaderboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const type = (req.query.type as string) || 'global';
    let wordId = req.query.wordId as string;

    if (!wordId) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayWord = await prisma.wordleWord.findUnique({ where: { date: today } });
      if (!todayWord) {
        return res.json({ leaderboard: [], userRank: null, wordId: null, dailyNumber: null });
      }
      wordId = todayWord.id;
    }

    const word = await prisma.wordleWord.findUnique({ where: { id: wordId } });
    if (!word) return res.status(404).json({ error: 'Word not found' });

    let userIdFilter: string[] | undefined;
    if (type === 'friends') {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ userId: req.userId }, { friendId: req.userId }],
        },
      });
      const friendIds = friendships.map(f =>
        f.userId === req.userId ? f.friendId : f.userId
      );
      userIdFilter = [...friendIds, req.userId!];
    }

    const results = await prisma.wordleResult.findMany({
      where: {
        wordId,
        userId: userIdFilter ? { in: userIdFilter } : { not: null },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Ranking: solved → fewer guesses first → faster time first
    //          unsolved → alphabetical
    const solved   = results.filter(r => r.solved);
    const unsolved = results.filter(r => !r.solved);

    solved.sort((a, b) => {
      const guessA = a.guesses.length;
      const guessB = b.guesses.length;
      if (guessA !== guessB) return guessA - guessB;
      return (a.duration ?? Infinity) - (b.duration ?? Infinity);
    });

    unsolved.sort((a, b) =>
      (a.user?.name || '').localeCompare(b.user?.name || '')
    );

    const sorted = [...solved, ...unsolved];

    const leaderboard = sorted.map((r, idx) => ({
      rank: idx + 1,
      userId: r.userId!,
      name: r.user?.name || r.user?.email?.split('@')[0] || 'Anonymous',
      guessCount: r.guesses.length,
      duration: r.duration,
      solved: r.solved,
      playedAt: r.playedAt,
    }));

    const userRank = leaderboard.find(e => e.userId === req.userId)?.rank ?? null;

    res.json({
      leaderboard,
      userRank,
      wordId,
      dailyNumber: getDailyWordNumber(word.name),
      wordLength: word.wordLength,
    });
  } catch (error) {
    console.error('Wordle leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// =============================================================================
// OVERALL LEADERBOARD (most words solved)
// =============================================================================

router.get('/overall-leaderboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Rank by total points from WordleUserStats
    const stats = await prisma.wordleUserStats.findMany({
      orderBy: { totalPoints: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const leaderboard = stats.map((s, idx) => ({
      rank: idx + 1,
      userId: s.userId,
      name: s.user.name || s.user.email?.split('@')[0] || 'Anonymous',
      totalPoints: s.totalPoints,
    }));

    // Current user's rank and points
    const myStats = await prisma.wordleUserStats.findUnique({
      where: { userId: req.userId! },
    });
    const myPoints = myStats?.totalPoints ?? 0;
    const userRank = myPoints > 0
      ? (await prisma.wordleUserStats.count({ where: { totalPoints: { gt: myPoints } } })) + 1
      : null;

    res.json({ leaderboard, userRank, userPoints: myPoints });
  } catch (error) {
    console.error('Wordle overall leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get overall leaderboard' });
  }
});

// =============================================================================
// FRIENDS ACTIVITY
// =============================================================================

router.get('/friends-activity', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userId: req.userId }, { friendId: req.userId }],
      },
    });
    const friendIds = friendships.map(f =>
      f.userId === req.userId ? f.friendId : f.userId
    );

    if (friendIds.length === 0) return res.json({ activity: [] });

    const results = await prisma.wordleResult.findMany({
      where: {
        userId: { in: friendIds },
        word: { date: { not: null } }, // only daily words
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        word: { select: { id: true, date: true, name: true, wordLength: true } },
      },
      orderBy: { playedAt: 'desc' },
      take: limit,
    });

    const activity = results.map(r => ({
      id: r.id,
      userId: r.userId!,
      name: r.user?.name || r.user?.email?.split('@')[0] || 'Friend',
      wordId: r.wordId,
      dailyNumber: getDailyWordNumber(r.word.name),
      wordLength: r.word.wordLength,
      solved: r.solved,
      guessCount: r.guesses.length,
      duration: r.duration,
      playedAt: r.playedAt.toISOString(),
    }));

    res.json({ activity });
  } catch (error) {
    console.error('Wordle friends activity error:', error);
    res.status(500).json({ error: 'Failed to get friends activity' });
  }
});

// =============================================================================
// PLAY HISTORY
// =============================================================================

router.get('/play-history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const results = await prisma.wordleResult.findMany({
      where: { userId: req.userId! },
      include: {
        word: { select: { id: true, name: true, date: true, wordLength: true } },
      },
      orderBy: { playedAt: 'desc' },
    });

    const history = results.map(r => ({
      wordId: r.wordId,
      name: r.word.name,
      date: r.word.date ? r.word.date.toISOString() : null,
      wordLength: r.word.wordLength,
      solved: r.solved,
      guessCount: r.guesses.length,
      guesses: r.guesses,
      duration: r.duration,
      playedAt: r.playedAt.toISOString(),
    }));

    res.json({ history });
  } catch (error) {
    console.error('Wordle play history error:', error);
    res.status(500).json({ error: 'Failed to get play history' });
  }
});

// =============================================================================
// STATS
// =============================================================================

function computeWordleStats(results: {
  solved: boolean;
  guesses: string[];
  duration: number | null;
  word: { date: Date | null };
}[]) {
  const total = results.length;
  const solvedResults = results.filter(r => r.solved);
  const successRate = total > 0 ? Math.round((solvedResults.length / total) * 100) : 0;

  const avgGuesses = solvedResults.length > 0
    ? Math.round((solvedResults.reduce((s, r) => s + r.guesses.length, 0) / solvedResults.length) * 10) / 10
    : null;

  const solvedWithTime = solvedResults.filter(r => r.duration !== null);
  const bestTime = solvedWithTime.length > 0
    ? Math.min(...solvedWithTime.map(r => r.duration!))
    : null;

  // Guess distribution [1,2,3,4,5,6]
  const guessDist = [0, 0, 0, 0, 0, 0];
  for (const r of solvedResults) {
    const idx = Math.min(r.guesses.length - 1, 5);
    guessDist[idx]++;
  }

  // Streak (same logic as 67numbers — uses daily solve dates)
  const solvedDailyDates = results
    .filter(r => r.solved && r.word.date !== null)
    .map(r => r.word.date!.toISOString().split('T')[0])
    .sort();

  let currentStreak = 0;
  let longestStreak = 0;

  if (solvedDailyDates.length > 0) {
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
        if (solvedDailyDates[i] === expected) currentStreak++;
        else break;
      }
    }
  }

  return { totalGamesPlayed: total, successRate, avgGuesses, bestTime, guessDist, currentStreak, longestStreak };
}

async function computeUserWordleStats(userId: string) {
  const now = new Date();
  const sinceMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sinceWeek  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);

  const results = await prisma.wordleResult.findMany({
    where: { userId },
    include: { word: { select: { date: true } } },
  });

  return {
    forever: computeWordleStats(results),
    month:   computeWordleStats(results.filter(r => r.playedAt >= sinceMonth)),
    week:    computeWordleStats(results.filter(r => r.playedAt >= sinceWeek)),
  };
}

router.get('/stats', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const compareWithId = req.query.compareWith as string | undefined;

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
      if (!friendship) return res.status(403).json({ error: 'Not friends with this user' });
    }

    const friendships = await prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userId }, { friendId: userId }] },
      include: {
        user:   { select: { id: true, name: true } },
        friend: { select: { id: true, name: true } },
      },
    });

    const friends = friendships.map(f =>
      f.userId === userId
        ? { id: f.friendId, name: f.friend.name }
        : { id: f.userId,   name: f.user.name }
    );

    const myStats = await computeUserWordleStats(userId);
    const friendStats = compareWithId ? await computeUserWordleStats(compareWithId) : null;

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
    console.error('Wordle stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
