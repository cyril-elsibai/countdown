/**
 * =============================================================================
 * GAME ROUTES (routes/game.ts)
 * =============================================================================
 *
 * This module handles all game-related API endpoints for the Countdown Numbers
 * game. It provides endpoints for fetching daily challenges, generating random
 * frames, and submitting solutions.
 *
 * GAME OVERVIEW:
 * The Countdown Numbers game presents players with 6 number tiles and a target
 * number between 101-999. Players must use arithmetic operations (+, -, ×, ÷)
 * to reach the target using each tile at most once.
 *
 * FRAME STRUCTURE:
 * - 6 tiles: Typically 2 large (25, 50, 75, 100) and 4 small (1-10)
 * - Target number: Random integer between 101 and 999
 * - Date: Set for daily challenges, null for random frames
 *
 * TIMING SYSTEM:
 * - For logged-in users, the server tracks when they start the daily challenge
 * - DailyAttempt records store the startedAt timestamp
 * - Duration is calculated server-side for accurate timing
 *
 * @module server/routes/game
 */

import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import { generateFrame, generateUniqueFrame, getDailyDateKey } from '../services/frameGenerator';
import { generateUniqueName } from '../services/nameGenerator';

// Create Express router instance
const router = Router();

// =============================================================================
// DAILY CHALLENGE ENDPOINT
// =============================================================================

/**
 * GET /api/game/daily
 *
 * Retrieves today's daily challenge. This is the main game endpoint that most
 * players will use. The challenge is the same for all players on a given day.
 *
 * AUTHENTICATION: Optional (optionalAuth middleware)
 * - Anonymous users can play but their results aren't saved
 * - Logged-in users get attempt tracking and can't replay
 *
 * RESPONSE (200 OK):
 * {
 *   frame: {
 *     id: string,
 *     tiles: number[],      // Array of 6 numbers
 *     targetNumber: number, // Target to reach (101-999)
 *     date: string          // ISO date string
 *   },
 *   startedAt: string | null,    // When the attempt started (for timing)
 *   previousResult: {            // Null if not played yet
 *     solved: boolean,
 *     duration: number | null,
 *     result: number | null
 *   } | null
 * }
 *
 * BEHAVIOR:
 * 1. Get today's date in UTC
 * 2. Find or create the frame for today
 * 3. For logged-in users:
 *    - Check if they've already played (return previousResult)
 *    - If not, create/update DailyAttempt to track start time
 * 4. Return frame with timing info
 */
router.get('/daily', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Get today's date at midnight UTC
    const today = getDailyDateKey();

    // Find the existing frame for today, or create one if missing
    // (Normally frames are pre-generated, but this handles edge cases)
    let frame = await prisma.frame.findUnique({
      where: { date: today },
    });

    // Frame doesn't exist for today - generate one
    // This should rarely happen as frames are pre-generated on server start
    if (!frame) {
      // Generate a unique frame (checks for duplicates)
      const generated = await generateUniqueFrame();
      if (!generated) {
        return res.status(500).json({ error: 'Failed to generate daily challenge' });
      }

      // Create the frame in the database
      frame = await prisma.frame.create({
        data: {
          tiles: generated.tiles,
          targetNumber: generated.targetNumber,
          date: today,
        },
      });
    }

    // Initialize response data for timing and previous results
    let startedAt: Date | null = null;
    let previousResult: { solved: boolean; duration: number | null; result: number | null } | null = null;

    // For logged-in users, handle attempt tracking
    if (req.userId) {
      // First, check if user has already played this challenge
      const existingResult = await prisma.gameResult.findFirst({
        where: {
          frameId: frame.id,
          userId: req.userId,
        },
        select: {
          solved: true,
          duration: true,
          result: true,
        },
      });

      if (existingResult) {
        // User already played - return their previous result
        // Frontend will show "Already Solved" banner
        previousResult = existingResult;
      } else {
        // User hasn't played yet - create or get their attempt record
        // This tracks when they started for accurate duration calculation
        const attempt = await prisma.dailyAttempt.upsert({
          where: {
            // Composite unique constraint: userId + frameId
            userId_frameId: {
              userId: req.userId,
              frameId: frame.id,
            },
          },
          create: {
            userId: req.userId,
            frameId: frame.id,
            // startedAt defaults to now()
          },
          update: {
            // Don't update anything - keep the original start time
          },
        });

        // Return the start time for the frontend timer sync
        startedAt = attempt.startedAt;
      }
    }

    // Return the frame and timing information
    res.json({
      frame: {
        id: frame.id,
        tiles: frame.tiles,
        targetNumber: frame.targetNumber,
        date: frame.date,
        name: frame.name ?? null,
      },
      startedAt,        // When the attempt started (null for anonymous)
      previousResult,   // Previous submission (null if not played)
    });
  } catch (error) {
    console.error('Daily frame error:', error);
    res.status(500).json({ error: 'Failed to get daily challenge' });
  }
});

// =============================================================================
// RANDOM FRAME ENDPOINT
// =============================================================================

/**
 * POST /api/game/random
 *
 * Generates or assigns a random frame for the user to play.
 *
 * FRIEND MATCHING:
 * Before generating a new frame, checks for unplayed random frames from
 * the user's friends (limited to 100 most recent). If found, one is randomly
 * selected to build organic competition. Otherwise, a new unique frame is
 * generated.
 *
 * AUTHENTICATION: Required (requireAuth middleware)
 *
 * REQUEST BODY: None required
 *
 * RESPONSE (200 OK):
 * {
 *   frame: {
 *     id: string,
 *     tiles: number[],
 *     targetNumber: number
 *   },
 *   startedAt: string  // ISO timestamp for duration calculation
 * }
 *
 * TIMING:
 * Creates a DailyAttempt record for server-side duration tracking,
 * same as daily challenges.
 *
 * UNIQUENESS:
 * New frames are checked against ALL existing frames to prevent duplicates.
 */
router.post('/random', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let frame;

    // First, try to find an unplayed random frame from friends
    // This builds organic competition without the user knowing
    const friendFrame = await findUnplayedFriendFrame(req.userId!);

    if (friendFrame) {
      // Use the friend's frame
      frame = friendFrame;
    } else {
      // No friend frames — try the general pool (frames played by anyone but not this user)
      const generalFrame = await findUnplayedGeneralFrame(req.userId!);

      if (generalFrame) {
        frame = generalFrame;
      } else {
        // Nothing in the pool — generate a new frame
        const generated = await generateUniqueFrame();

        if (!generated) {
          return res.status(500).json({ error: 'Failed to generate unique frame' });
        }

        const { tiles, targetNumber } = generated;

        // Save the frame to the database with a unique friendly name
        const name = await generateUniqueName();
        frame = await prisma.frame.create({
          data: {
            tiles,
            targetNumber,
            date: null,
            ...(name && { name }),
          },
        });
      }
    }

    // Create a DailyAttempt to track start time for duration calculation
    await prisma.dailyAttempt.create({
      data: {
        userId: req.userId!,
        frameId: frame.id,
      },
    });

    // Return the frame with startedAt for client-side timer sync
    res.json({
      frame: {
        id: frame.id,
        tiles: frame.tiles,
        targetNumber: frame.targetNumber,
        date: frame.date ?? null,
        name: frame.name ?? null,
      },
      startedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Random frame error:', error);
    res.status(500).json({ error: 'Failed to generate random frame' });
  }
});

/**
 * Find a random frame played by friends that the current user hasn't played yet.
 * Includes both random frames and past daily challenges from friends.
 * Limited to the 100 most recent results from friends for performance.
 *
 * @param userId - Current user's ID
 * @returns A random frame from friends, or null if none available
 */
async function findUnplayedFriendFrame(userId: string) {
  // Get all accepted friendships
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [
        { userId: userId },
        { friendId: userId },
      ],
    },
  });

  // Extract friend IDs
  const friendIds = friendships.map(f =>
    f.userId === userId ? f.friendId : f.userId
  );

  if (friendIds.length === 0) {
    return null;
  }

  const today = getDailyDateKey();

  // Get the IDs of frames the current user has already played
  const playedFrames = await prisma.gameResult.findMany({
    where: { userId },
    select: { frameId: true },
  });
  const playedFrameIds = playedFrames.map(r => r.frameId);

  // Find frames (random or past daily) that:
  // 1. Were played by at least one friend
  // 2. Haven't been played by the current user
  // Excludes today's daily challenge (played from the home screen)
  const friendResults = await prisma.gameResult.findMany({
    where: {
      userId: { in: friendIds },
      frame: {
        OR: [
          { date: null },          // random frames
          { date: { lt: today } }, // past daily challenges
        ],
      },
      frameId: playedFrameIds.length > 0 ? { notIn: playedFrameIds } : undefined,
    },
    select: {
      frameId: true,
      frame: true,
    },
    orderBy: {
      playedAt: 'desc',
    },
    take: 100,
    distinct: ['frameId'], // One entry per frame
  });

  if (friendResults.length === 0) {
    return null;
  }

  // Pick a random frame from the pool
  const randomIndex = Math.floor(Math.random() * friendResults.length);
  return friendResults[randomIndex].frame;
}

async function findUnplayedGeneralFrame(userId: string) {
  const today = getDailyDateKey();

  // Get frames the user has already played
  const playedFrames = await prisma.gameResult.findMany({
    where: { userId },
    select: { frameId: true },
  });
  const playedFrameIds = playedFrames.map(r => r.frameId);

  // Find any frame (random or past daily) that has at least one result from any
  // user but hasn't been played by this user. Excludes today's daily challenge.
  const candidates = await prisma.frame.findMany({
    where: {
      OR: [
        { date: null },          // random frames
        { date: { lt: today } }, // past daily challenges
      ],
      id: playedFrameIds.length > 0 ? { notIn: playedFrameIds } : undefined,
      gameResults: {
        some: {},
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
  });

  if (candidates.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex];
}

// =============================================================================
// GET SPECIFIC FRAME ENDPOINT
// =============================================================================

/**
 * GET /api/game/frame/:id
 *
 * Retrieves a specific frame by its ID.
 * Useful for sharing challenges with friends or replaying specific frames.
 *
 * AUTHENTICATION: Optional (optionalAuth middleware)
 *
 * URL PARAMETERS:
 * - id: The frame's unique identifier (CUID)
 *
 * RESPONSE (200 OK):
 * {
 *   frame: {
 *     id: string,
 *     tiles: number[],
 *     targetNumber: number,
 *     date: string | null
 *   }
 * }
 *
 * ERRORS:
 * - 404: Frame not found
 * - 500: Server error
 */
router.get('/frame/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    // Look up the frame by ID
    const frame = await prisma.frame.findUnique({
      where: { id },
    });

    // Frame not found
    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    // Return the frame
    res.json({
      frame: {
        id: frame.id,
        tiles: frame.tiles,
        targetNumber: frame.targetNumber,
        date: frame.date,
        name: frame.name ?? null,
      },
    });
  } catch (error) {
    console.error('Get frame error:', error);
    res.status(500).json({ error: 'Failed to get frame' });
  }
});

// =============================================================================
// SUBMIT SOLUTION ENDPOINT
// =============================================================================

/**
 * POST /api/game/frame/:id/submit
 *
 * Submits a solution attempt for a frame (daily or random).
 * Records the result and calculates whether the user solved the puzzle.
 *
 * AUTHENTICATION: Required (requireAuth middleware)
 * Unauthenticated users are prompted to sign in on the frontend.
 *
 * URL PARAMETERS:
 * - id: The frame's unique identifier
 *
 * REQUEST BODY:
 * {
 *   expression: string,  // The solution expression (e.g., "(25 + 75) * 4")
 *   result: number       // The calculated result
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   success: true,
 *   result: number,       // The result value
 *   solved: boolean,      // Whether result matches target
 *   duration: number|null // Time taken in seconds
 * }
 *
 * ERRORS:
 * - 400: Already solved this challenge
 * - 400: New result is not better than previous submission
 * - 401: Not authenticated
 * - 404: Frame not found
 * - 500: Server error
 *
 * MULTIPLE SUBMISSIONS:
 * Users can submit multiple times until they solve the puzzle, but each
 * submission must be at least as good as (closer to target than) the previous.
 * This allows users to improve their "closest" result over time.
 *
 * DURATION CALCULATION:
 * Duration is calculated server-side from the DailyAttempt.startedAt timestamp
 * for BOTH daily and random frames. This prevents client-side timer manipulation.
 */
router.post('/frame/:id/submit', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { expression, result, duration: clientDuration } = req.body;
    const frameId = req.params.id as string;

    // Find the frame
    const frame = await prisma.frame.findUnique({
      where: { id: frameId },
    });

    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    // For logged-in users, check if they already submitted for this frame
    const existingResult = req.userId
      ? await prisma.gameResult.findFirst({
          where: { frameId, userId: req.userId },
        })
      : null;

    if (existingResult) {
      // If already solved, don't allow more submissions
      if (existingResult.solved) {
        return res.status(400).json({ error: 'You have already solved this challenge' });
      }

      // If not solved, check that the new result is at least as good
      if (existingResult.result !== null) {
        const previousDiff = Math.abs(frame.targetNumber - existingResult.result);
        const newDiff = Math.abs(frame.targetNumber - result);
        if (newDiff > previousDiff) {
          return res.status(400).json({
            error: `New result (${result}) is not better than previous (${existingResult.result})`
          });
        }
      }
    }

    // Use client-sent duration (rounded to hundredths of a second)
    const duration: number | null = typeof clientDuration === 'number'
      ? Math.round(clientDuration * 100) / 100
      : null;

    // Determine if the solution is correct
    // Simple comparison: does the result equal the target?
    const solved = result === frame.targetNumber;

    // Record or update the game result
    let gameResult;
    if (existingResult) {
      // Update existing result with better submission
      gameResult = await prisma.gameResult.update({
        where: { id: existingResult.id },
        data: {
          expression,              // The solution expression
          result: result || null,  // The calculated result
          solved,                  // Whether it matches the target
          duration,                // Time taken (null for random frames)
          playedAt: new Date(),    // Update the timestamp
        },
      });
    } else {
      // Create new result
      gameResult = await prisma.gameResult.create({
        data: {
          frameId,
          userId: req.userId,     // null for anonymous users
          expression,              // The solution expression
          result: result || null,  // The calculated result
          solved,                  // Whether it matches the target
          duration,                // Time taken (null for random frames)
        },
      });
    }

    // Return the submission result
    res.json({
      success: true,
      result: gameResult.result,
      solved: gameResult.solved,
      duration: gameResult.duration,
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: 'Failed to submit solution' });
  }
});

// =============================================================================
// START FRAME ENDPOINT
// =============================================================================

/**
 * POST /api/game/frame/:id/start
 *
 * Creates a GameResult record the moment a user starts playing a frame.
 * Marks the frame as "attempted" even if the user never submits.
 * Idempotent — safe to call if a record already exists.
 */
router.post('/frame/:id/start', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const frameId = req.params.id as string;

    const existing = await prisma.gameResult.findFirst({
      where: { frameId, userId: req.userId },
    });

    if (!existing) {
      await prisma.gameResult.create({
        data: {
          frameId,
          userId: req.userId,
          solved: false,
          result: null,
          duration: null,
          expression: null,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Start frame error:', error);
    res.status(500).json({ error: 'Failed to record start' });
  }
});

// =============================================================================
// PROGRESS ENDPOINT
// =============================================================================

/**
 * POST /api/game/frame/:id/progress
 *
 * Updates an existing GameResult with the current duration and closest result.
 * Called on navigation away or tab/browser close (via sendBeacon).
 * Only updates if not already solved.
 */
router.post('/frame/:id/progress', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const frameId = req.params.id as string;
    const { duration, result } = req.body;

    const existing = await prisma.gameResult.findFirst({
      where: { frameId, userId: req.userId },
    });

    if (existing && !existing.solved) {
      await prisma.gameResult.update({
        where: { id: existing.id },
        data: {
          duration: typeof duration === 'number' ? Math.round(duration * 100) / 100 : existing.duration,
          result: typeof result === 'number' && result > 0 ? result : existing.result,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Progress error:', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// =============================================================================
// PLAY HISTORICAL FRAME ENDPOINT
// =============================================================================

/**
 * GET /api/game/frame/:id/play
 *
 * Starts playing a specific frame (historical challenge).
 * Similar to /daily but for any frame by ID.
 *
 * AUTHENTICATION: Required (requireAuth middleware)
 *
 * URL PARAMETERS:
 * - id: The frame's unique identifier
 *
 * RESPONSE (200 OK):
 * {
 *   frame: {
 *     id: string,
 *     tiles: number[],
 *     targetNumber: number,
 *     date: string | null
 *   },
 *   startedAt: string | null,
 *   previousResult: {
 *     solved: boolean,
 *     duration: number | null,
 *     result: number | null
 *   } | null
 * }
 *
 * BEHAVIOR:
 * 1. Find the frame by ID
 * 2. Check if user has already played
 * 3. If not, create DailyAttempt to track start time
 * 4. Return frame with timing info
 */
router.get('/frame/:id/play', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const frameId = req.params.id as string;

    // Find the frame
    const frame = await prisma.frame.findUnique({
      where: { id: frameId },
    });

    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    // Initialize response data
    let startedAt: Date | null = null;
    let previousResult: { solved: boolean; duration: number | null; result: number | null } | null = null;

    // Check if user has already played this frame
    const existingResult = await prisma.gameResult.findFirst({
      where: {
        frameId,
        userId: req.userId,
      },
      select: {
        solved: true,
        duration: true,
        result: true,
      },
    });

    if (existingResult) {
      // User already played - return their previous result
      previousResult = existingResult;
    } else {
      // User hasn't played yet - create or get their attempt record
      const attempt = await prisma.dailyAttempt.upsert({
        where: {
          userId_frameId: {
            userId: req.userId!,
            frameId,
          },
        },
        create: {
          userId: req.userId!,
          frameId,
        },
        update: {},
      });

      startedAt = attempt.startedAt;
    }

    res.json({
      frame: {
        id: frame.id,
        tiles: frame.tiles,
        targetNumber: frame.targetNumber,
        date: frame.date,
        name: frame.name ?? null,
      },
      startedAt,
      previousResult,
    });
  } catch (error) {
    console.error('Play frame error:', error);
    res.status(500).json({ error: 'Failed to start playing frame' });
  }
});

export default router;
