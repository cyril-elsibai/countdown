/**
 * =============================================================================
 * ADMIN ROUTES (routes/admin.ts)
 * =============================================================================
 *
 * This module handles administrative API endpoints for managing daily challenges.
 * Admin authentication is separate from regular user authentication.
 *
 * ADMIN AUTHENTICATION:
 * - Admin credentials are set via environment variables (ADMIN_USERNAME, ADMIN_PASSWORD)
 * - Admin uses a separate JWT token (ADMIN_JWT_SECRET)
 * - Admin tokens expire after 8 hours
 * - Admin tokens are stored separately in frontend localStorage
 *
 * CAPABILITIES:
 * - View daily challenges (15 days past to 15 days future)
 * - Create or edit future daily challenges
 * - Generate random challenges or set manual values
 * - View play statistics (play count, success rate)
 *
 * RESTRICTIONS:
 * - Cannot edit today's or past challenges (to maintain fairness)
 * - Manual challenges are validated for game rules
 * - Duplicate tile/target combinations are rejected
 *
 * @module server/routes/admin
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { validateFrame, isFrameUnique, generateUniqueFrame, getNextDailyNumber, ensureYearOfChallenges } from '../services/frameGenerator';
import { runPointsCalculation, getCalculationHistory, isCalculationRunning } from '../services/pointsCalculator';
import { runWordlePointsCalculation } from '../services/wordlePointsCalculator';
import { getAnswers6, getAnswers7, getNextDailyWordNumber, wordLengthForDailyNumber, ensureYearOfWords } from '../services/wordleService';
import { checkNameUtilization } from '../services/nameGenerator';

// Create Express router instance
const router = Router();

// =============================================================================
// ADMIN CONFIGURATION
// =============================================================================

/**
 * Admin credentials and JWT configuration.
 * IMPORTANT: Set these via environment variables in production!
 * The defaults are for development only.
 */
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin-secret-key';

/**
 * Extended Request type for admin-authenticated requests.
 */
interface AdminRequest extends Request {
  isAdmin?: boolean;
}

// =============================================================================
// ADMIN AUTHENTICATION MIDDLEWARE
// =============================================================================

/**
 * Require Admin Authentication Middleware
 *
 * Validates the admin JWT token from the Authorization header.
 * Admin tokens are separate from user tokens and use a different secret.
 *
 * TOKEN STRUCTURE:
 * - Payload: { isAdmin: true }
 * - Expiration: 8 hours
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  // Extract the Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  // No token provided
  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  try {
    // Verify the token using the admin-specific secret
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as { isAdmin: boolean };

    // Verify the token contains the admin flag
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Admin access denied' });
    }

    // Mark request as admin-authenticated
    req.isAdmin = true;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
}

// =============================================================================
// ADMIN LOGIN ENDPOINT
// =============================================================================

/**
 * POST /api/admin/login
 *
 * Authenticates an admin user and returns a JWT token.
 *
 * REQUEST BODY:
 * {
 *   username: string,
 *   password: string
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   token: string  // JWT token valid for 8 hours
 * }
 *
 * ERRORS:
 * - 401: Invalid credentials
 *
 * NOTE: This uses simple username/password comparison.
 * In production, consider using more secure authentication.
 */
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  // Simple credential check against environment variables
  // In production, you might want to use a more secure approach
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // Generate admin token with 8-hour expiration
    const token = jwt.sign({ isAdmin: true }, ADMIN_JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// =============================================================================
// VERIFY ADMIN TOKEN ENDPOINT
// =============================================================================

/**
 * GET /api/admin/verify
 *
 * Verifies that the current admin token is valid.
 * Used by the frontend to check if the admin is still logged in.
 *
 * AUTHENTICATION: Required (admin)
 *
 * RESPONSE (200 OK):
 * {
 *   valid: true
 * }
 *
 * ERRORS:
 * - 401: Token invalid or expired (from middleware)
 */
router.get('/verify', requireAdmin, (req: AdminRequest, res: Response) => {
  res.json({ valid: true });
});

// =============================================================================
// LIST CHALLENGES ENDPOINT
// =============================================================================

/**
 * GET /api/admin/challenges
 *
 * Lists daily challenges for a 30-day window (15 days past to 15 days future).
 * Includes play statistics for each challenge.
 *
 * AUTHENTICATION: Required (admin)
 *
 * RESPONSE (200 OK):
 * {
 *   challenges: [
 *     {
 *       id: string,
 *       date: string,          // ISO date string
 *       tiles: number[],       // Array of 6 numbers
 *       targetNumber: number,  // Target value (101-999)
 *       isManual: boolean,     // true if manually created by admin
 *       playCount: number,     // Number of times played
 *       successRate: number|null, // Percentage of successful solutions
 *       createdAt: string      // ISO date string
 *     }
 *   ]
 * }
 *
 * NOTES:
 * - Challenges are sorted by date (newest first)
 * - Success rate is null if no one has played yet
 */
router.get('/challenges', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    // Calculate date range: 15 days ago to 15 days from now
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 15);

    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 15);

    // Fetch all challenges in the date range with their results
    const challenges = await prisma.frame.findMany({
      where: {
        date: {
          gte: pastDate,
          lte: futureDate,
        },
      },
      orderBy: { date: 'desc' },  // Newest first
      include: {
        gameResults: {
          select: { solved: true },  // Only need solved status for statistics
        },
      },
    });

    // Map to response format with calculated statistics
    res.json({
      challenges: challenges.map((c) => {
        // Calculate play statistics
        const playCount = c.gameResults.length;
        const solvedCount = c.gameResults.filter((r) => r.solved).length;

        // Success rate as percentage (null if no plays)
        const successRate = playCount > 0 ? Math.round((solvedCount / playCount) * 100) : null;

        return {
          id: c.id,
          date: c.date,
          name: c.name ?? null,
          tiles: c.tiles,
          targetNumber: c.targetNumber,
          isManual: c.isManual,
          playCount,
          successRate,
          createdAt: c.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error('List challenges error:', error);
    res.status(500).json({ error: 'Failed to list challenges' });
  }
});

// =============================================================================
// GET SPECIFIC CHALLENGE ENDPOINT
// =============================================================================

/**
 * GET /api/admin/challenges/:date
 *
 * Retrieves a specific daily challenge by its date.
 *
 * AUTHENTICATION: Required (admin)
 *
 * URL PARAMETERS:
 * - date: The date in YYYY-MM-DD format
 *
 * RESPONSE (200 OK):
 * {
 *   challenge: {
 *     id: string,
 *     date: string,
 *     tiles: number[],
 *     targetNumber: number,
 *     playCount: number,
 *     createdAt: string
 *   }
 * }
 *
 * ERRORS:
 * - 400: Invalid date format
 * - 404: No challenge found for this date
 * - 500: Server error
 */
router.get('/challenges/:date', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const dateParam = req.params.date as string;

    // Parse date string to Date object (treat as UTC)
    const date = new Date(dateParam + 'T00:00:00.000Z');

    // Validate the date is valid
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Find the challenge for this date
    const challenge = await prisma.frame.findUnique({
      where: { date },
      include: {
        _count: {
          select: { gameResults: true },  // Count of plays
        },
      },
    });

    // No challenge exists for this date
    if (!challenge) {
      return res.status(404).json({ error: 'No challenge found for this date' });
    }

    // Return the challenge
    res.json({
      challenge: {
        id: challenge.id,
        date: challenge.date,
        tiles: challenge.tiles,
        targetNumber: challenge.targetNumber,
        playCount: challenge._count.gameResults,
        createdAt: challenge.createdAt,
      },
    });
  } catch (error) {
    console.error('Get challenge error:', error);
    res.status(500).json({ error: 'Failed to get challenge' });
  }
});

// =============================================================================
// CREATE/UPDATE CHALLENGE ENDPOINT
// =============================================================================

/**
 * PUT /api/admin/challenges/:date
 *
 * Creates or updates a daily challenge for a specific date.
 * Can either specify manual values or generate random ones.
 *
 * AUTHENTICATION: Required (admin)
 *
 * URL PARAMETERS:
 * - date: The date in YYYY-MM-DD format
 *
 * REQUEST BODY (Option 1 - Manual):
 * {
 *   tiles: number[],        // Array of exactly 6 numbers
 *   targetNumber: number    // Target value (101-999)
 * }
 *
 * REQUEST BODY (Option 2 - Random):
 * {
 *   generateRandom: true
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   challenge: {
 *     id: string,
 *     date: string,
 *     tiles: number[],
 *     targetNumber: number,
 *     isManual: boolean,
 *     createdAt: string
 *   },
 *   created: boolean  // true if new, false if updated
 * }
 *
 * VALIDATION RULES (for manual challenges):
 * - Must have exactly 6 tiles
 * - All tiles must be positive integers
 * - No more than 2 tiles can be greater than 10
 * - Target must be between 101 and 999
 * - Tile/target combination must be unique
 *
 * ERRORS:
 * - 400: Invalid date format
 * - 400: Validation error (tiles, target, or uniqueness)
 * - 500: Server error
 */
router.put('/challenges/:date', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const dateParam = req.params.date as string;

    // Parse and validate the date
    const date = new Date(dateParam + 'T00:00:00.000Z');

    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const { tiles, targetNumber, generateRandom } = req.body;

    // Variables to hold the final values
    let finalTiles: number[];
    let finalTarget: number;

    if (generateRandom) {
      // OPTION 1: Generate a random unique frame
      const generated = await generateUniqueFrame();
      if (!generated) {
        return res.status(500).json({ error: 'Could not generate a unique frame. Try again.' });
      }
      finalTiles = generated.tiles;
      finalTarget = generated.targetNumber;
    } else {
      // OPTION 2: Use manually provided values
      if (!tiles || !targetNumber) {
        return res.status(400).json({ error: 'tiles and targetNumber are required (or set generateRandom: true)' });
      }

      finalTiles = tiles;
      finalTarget = targetNumber;

      // Validate the frame follows game rules
      const validation = validateFrame(finalTiles, finalTarget);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
    }

    // Check for existing challenge on this date
    const existing = await prisma.frame.findUnique({
      where: { date },
    });

    // Check uniqueness (exclude current frame if updating)
    // This prevents duplicate tile/target combinations across all challenges
    const isUnique = await isFrameUnique(finalTiles, finalTarget, existing?.id);
    if (!isUnique) {
      return res.status(400).json({ error: 'This tile and target combination has already been used' });
    }

    // isManual is true only for manually specified values, false for generated
    const isManual = !generateRandom;

    let challenge;
    if (existing) {
      // UPDATE existing challenge
      challenge = await prisma.frame.update({
        where: { date },
        data: {
          tiles: finalTiles,
          targetNumber: finalTarget,
          isManual,
        },
      });
    } else {
      // CREATE new challenge
      const dailyNumber = await getNextDailyNumber(date);
      challenge = await prisma.frame.create({
        data: {
          date,
          tiles: finalTiles,
          targetNumber: finalTarget,
          isManual,
          name: `Daily #${dailyNumber}`,
        },
      });
    }

    // Return the challenge with created flag
    res.json({
      challenge: {
        id: challenge.id,
        date: challenge.date,
        tiles: challenge.tiles,
        targetNumber: challenge.targetNumber,
        isManual: challenge.isManual,
        createdAt: challenge.createdAt,
      },
      created: !existing,  // true if this was a new challenge
    });
  } catch (error) {
    console.error('Create/update challenge error:', error);
    res.status(500).json({ error: 'Failed to save challenge' });
  }
});

// =============================================================================
// POINTS CALCULATION ENDPOINTS
// =============================================================================

/**
 * POST /api/admin/points/calculate
 *
 * Triggers a manual points recalculation.
 * This recalculates all frame stats and user points.
 *
 * AUTHENTICATION: Required (admin)
 *
 * RESPONSE (200 OK):
 * {
 *   success: boolean,
 *   calculationId: string,
 *   durationMs: number,
 *   framesProcessed: number,
 *   usersProcessed: number,
 *   resultsProcessed: number,
 *   error?: string
 * }
 *
 * ERRORS:
 * - 409: Calculation already running
 * - 500: Server error
 */
router.post('/points/calculate', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    // Check if a calculation is already running
    const running = await isCalculationRunning();
    if (running) {
      return res.status(409).json({ error: 'A points calculation is already running' });
    }

    // Trigger the calculation (admin-triggered)
    const result = await runPointsCalculation('admin');

    res.json(result);
  } catch (error) {
    console.error('Trigger points calculation error:', error);
    res.status(500).json({ error: 'Failed to trigger points calculation' });
  }
});

/**
 * GET /api/admin/points/status
 *
 * Gets the status of the most recent points calculation.
 * Also returns whether a calculation is currently running.
 *
 * AUTHENTICATION: Required (admin)
 *
 * RESPONSE (200 OK):
 * {
 *   isRunning: boolean,
 *   lastCalculation: {
 *     id: string,
 *     status: 'RUNNING' | 'COMPLETED' | 'FAILED',
 *     startedAt: string,
 *     completedAt: string | null,
 *     durationMs: number | null,
 *     framesProcessed: number,
 *     usersProcessed: number,
 *     resultsProcessed: number,
 *     error: string | null,
 *     triggeredBy: string | null
 *   } | null
 * }
 */
router.get('/points/status', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const running = await isCalculationRunning();
    const history = await getCalculationHistory(1);
    const lastCalculation = history.length > 0 ? history[0] : null;

    res.json({
      isRunning: running,
      lastCalculation,
    });
  } catch (error) {
    console.error('Get points status error:', error);
    res.status(500).json({ error: 'Failed to get points status' });
  }
});

/**
 * GET /api/admin/points/history
 *
 * Gets the history of points calculations (last 20 runs).
 *
 * AUTHENTICATION: Required (admin)
 *
 * QUERY PARAMETERS:
 * - limit: number (default 20, max 100)
 *
 * RESPONSE (200 OK):
 * {
 *   calculations: [
 *     {
 *       id: string,
 *       status: 'RUNNING' | 'COMPLETED' | 'FAILED',
 *       startedAt: string,
 *       completedAt: string | null,
 *       durationMs: number | null,
 *       framesProcessed: number,
 *       usersProcessed: number,
 *       resultsProcessed: number,
 *       error: string | null,
 *       triggeredBy: string | null
 *     }
 *   ]
 * }
 */
router.get('/points/history', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const limitParam = req.query.limit;
    let limit = 20;

    if (typeof limitParam === 'string') {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100);
      }
    }

    const calculations = await getCalculationHistory(limit);

    res.json({ calculations });
  } catch (error) {
    console.error('Get points history error:', error);
    res.status(500).json({ error: 'Failed to get points history' });
  }
});

// =============================================================================
// WORDLE ADMIN HELPER
// =============================================================================

function getWordleDailyNumber(name: string | null): number | null {
  if (!name) return null;
  const m = name.match(/Daily Word #(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// =============================================================================
// WORDLE: LIST DAILY WORDS ENDPOINT
// =============================================================================

/**
 * GET /api/admin/wordle/words
 *
 * Lists daily words for a 30-day window (15 days past to 15 days future).
 * Includes play statistics for each word.
 *
 * AUTHENTICATION: Required (admin)
 */
router.get('/wordle/words', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 15);

    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 15);

    const words = await prisma.wordleWord.findMany({
      where: {
        date: {
          gte: pastDate,
          lte: futureDate,
        },
      },
      orderBy: { date: 'desc' },
      include: {
        results: {
          select: { solved: true },
        },
      },
    });

    res.json({
      words: words.map((w) => {
        const playCount = w.results.length;
        const solvedCount = w.results.filter((r) => r.solved).length;
        const successRate = playCount > 0 ? Math.round((solvedCount / playCount) * 100) : null;

        return {
          id: w.id,
          date: w.date,
          name: w.name ?? null,
          word: w.word,
          wordLength: w.wordLength,
          isManual: w.isManual,
          playCount,
          successRate,
        };
      }),
    });
  } catch (error) {
    console.error('List wordle words error:', error);
    res.status(500).json({ error: 'Failed to list words' });
  }
});

// =============================================================================
// WORDLE: CREATE/UPDATE DAILY WORD ENDPOINT
// =============================================================================

/**
 * PUT /api/admin/wordle/words/:date
 *
 * Creates or updates a daily word for a specific date.
 * Can either specify a manual word or generate a random one.
 *
 * AUTHENTICATION: Required (admin)
 *
 * URL PARAMETERS:
 * - date: The date in YYYY-MM-DD format
 *
 * REQUEST BODY (Option 1 - Manual):
 * { word: string }
 *
 * REQUEST BODY (Option 2 - Random):
 * { generateRandom: true }
 */
router.put('/wordle/words/:date', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const dateParam = req.params.date as string;
    const date = new Date(dateParam + 'T00:00:00.000Z');

    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const { word, generateRandom } = req.body;

    // Check for existing word on this date
    const existing = await prisma.wordleWord.findUnique({ where: { date } });

    // Determine daily number
    let dailyNumber: number;
    if (existing) {
      const parsed = getWordleDailyNumber(existing.name);
      if (parsed === null) {
        return res.status(500).json({ error: 'Could not parse daily number from existing word name' });
      }
      dailyNumber = parsed;
    } else {
      dailyNumber = await getNextDailyWordNumber(date);
    }

    // Determine expected word length for this daily number
    const expectedLength = wordLengthForDailyNumber(dailyNumber);

    let finalWord: string;
    let isManual: boolean;

    if (generateRandom) {
      // Pick a random word of the correct length not already used
      const pool = expectedLength === 6 ? getAnswers6() : getAnswers7();

      // Get all used words (excluding current word if updating)
      const usedWords = await prisma.wordleWord.findMany({
        where: existing ? { id: { not: existing.id } } : {},
        select: { word: true },
      });
      const usedSet = new Set(usedWords.map((w) => w.word.toUpperCase()));

      const available = pool.filter((w) => !usedSet.has(w.toUpperCase()));
      if (available.length === 0) {
        return res.status(500).json({ error: 'No available random words of the required length' });
      }

      finalWord = available[Math.floor(Math.random() * available.length)].toUpperCase();
      isManual = false;
    } else {
      // Manual word
      if (!word || typeof word !== 'string') {
        return res.status(400).json({ error: 'word is required (or set generateRandom: true)' });
      }

      finalWord = word.trim().toUpperCase();

      // Validate all letters
      if (!/^[A-Z]+$/.test(finalWord)) {
        return res.status(400).json({ error: 'Word must contain only letters' });
      }

      // Validate length matches expected
      if (finalWord.length !== expectedLength) {
        return res.status(400).json({ error: `Expected a ${expectedLength}-letter word for Daily Word #${dailyNumber}` });
      }

      // Check not already used in another WordleWord
      const duplicate = await prisma.wordleWord.findFirst({
        where: {
          word: { equals: finalWord, mode: 'insensitive' },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
      });
      if (duplicate) {
        return res.status(400).json({ error: 'This word has already been used on another date' });
      }

      isManual = true;
    }

    let savedWord;
    if (existing) {
      savedWord = await prisma.wordleWord.update({
        where: { date },
        data: { word: finalWord, isManual },
      });
    } else {
      savedWord = await prisma.wordleWord.create({
        data: {
          date,
          word: finalWord,
          wordLength: expectedLength,
          isManual,
          name: `Daily Word #${dailyNumber}`,
        },
      });
    }

    res.json({
      word: {
        id: savedWord.id,
        date: savedWord.date,
        name: savedWord.name ?? null,
        word: savedWord.word,
        wordLength: savedWord.wordLength,
        isManual: savedWord.isManual,
        playCount: 0,
        successRate: null,
      },
      created: !existing,
    });
  } catch (error) {
    console.error('Create/update wordle word error:', error);
    res.status(500).json({ error: 'Failed to save word' });
  }
});

// =============================================================================
// WORDLE: TRIGGER POINTS CALCULATION ENDPOINT
// =============================================================================

/**
 * POST /api/admin/wordle/points/calculate
 *
 * Triggers a manual wordle points recalculation.
 *
 * AUTHENTICATION: Required (admin)
 */
router.post('/wordle/points/calculate', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const result = await runWordlePointsCalculation();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Trigger wordle points calculation error:', error);
    res.status(500).json({ error: 'Failed to trigger wordle points calculation' });
  }
});

// =============================================================================
// JOBS ENDPOINTS
// =============================================================================

/**
 * POST /api/admin/jobs/seed-challenges
 *
 * Ensures a full year of daily challenges is seeded.
 *
 * AUTHENTICATION: Required (admin)
 */
router.post('/jobs/seed-challenges', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const result = await ensureYearOfChallenges();
    res.json({ success: true, created: result.created, existing: result.existing });
  } catch (error) {
    console.error('Seed challenges error:', error);
    res.status(500).json({ error: 'Failed to seed challenges' });
  }
});

/**
 * POST /api/admin/jobs/seed-words
 *
 * Ensures a full year of daily words is seeded.
 *
 * AUTHENTICATION: Required (admin)
 */
router.post('/jobs/seed-words', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const result = await ensureYearOfWords();
    res.json({ success: true, created: result.created, existing: result.existing });
  } catch (error) {
    console.error('Seed words error:', error);
    res.status(500).json({ error: 'Failed to seed words' });
  }
});

/**
 * POST /api/admin/jobs/check-names
 *
 * Checks and logs name utilization stats.
 *
 * AUTHENTICATION: Required (admin)
 */
router.post('/jobs/check-names', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    await checkNameUtilization();
    res.json({ success: true });
  } catch (error) {
    console.error('Check names error:', error);
    res.status(500).json({ error: 'Failed to check name utilization' });
  }
});

// =============================================================================
// DUMMY DATA JOBS
// =============================================================================

const DUMMY_EMAIL_DOMAIN = '@dummy.test';
const DUMMY_USER_COUNT = 20;
const DUMMY_RESULTS_PER_USER = 15;
const DUMMY_NAMES = [
  'Alex', 'Jordan', 'Sam', 'Morgan', 'Casey', 'Riley', 'Taylor', 'Quinn',
  'Drew', 'Avery', 'Blake', 'Cameron', 'Dakota', 'Emery', 'Finley', 'Gray',
  'Harper', 'Indigo', 'Jamie', 'Kendall',
];
const FAKE_WORDS_6 = ['STREAM', 'PLANET', 'BRIGHT', 'CALMLY', 'FROZEN', 'GUITAR', 'MARBLE', 'PILLOW'];
const FAKE_WORDS_7 = ['CAPTAIN', 'FREEDOM', 'MYSTERY', 'BALANCE', 'WHISPER', 'CURTAIN', 'BLANKET', 'SPEAKER'];

/**
 * POST /api/admin/jobs/generate-dummy-numbers
 * Creates dummy users with GameResults for 67numbers.
 */
router.post('/jobs/generate-dummy-numbers', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const frames = await prisma.frame.findMany({
      where: { date: { not: null, lt: new Date() } },
      orderBy: { date: 'desc' },
      take: 60,
    });
    if (frames.length === 0) {
      return res.status(400).json({ error: 'No past daily frames found — seed challenges first' });
    }

    const dummyHash = await bcrypt.hash('dummy-password', 10);
    let usersCreated = 0;
    let resultsCreated = 0;

    for (let i = 0; i < DUMMY_USER_COUNT; i++) {
      const uid = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`;
      const user = await prisma.user.create({
        data: {
          email: `dummy_${uid}${DUMMY_EMAIL_DOMAIN}`,
          hashedPassword: dummyHash,
          name: DUMMY_NAMES[i % DUMMY_NAMES.length],
          emailVerified: true,
        },
      });
      usersCreated++;

      const shuffled = [...frames].sort(() => Math.random() - 0.5);
      const userFrames = shuffled.slice(0, Math.min(DUMMY_RESULTS_PER_USER, frames.length));

      for (const frame of userFrames) {
        const solved = Math.random() < 0.65;
        const duration = Math.random() * 450 + 30;
        await prisma.gameResult.create({
          data: {
            userId: user.id,
            frameId: frame.id,
            solved,
            expression: solved ? `${frame.tiles[0]} + ${frame.targetNumber - frame.tiles[0]}` : null,
            result: solved ? frame.targetNumber : null,
            duration: frame.date ? duration : null,
            playedAt: frame.date ?? new Date(),
          },
        });
        resultsCreated++;
      }
    }

    res.json({ success: true, usersCreated, resultsCreated });
  } catch (error) {
    console.error('Generate dummy numbers error:', error);
    res.status(500).json({ error: 'Failed to generate dummy data' });
  }
});

/**
 * POST /api/admin/jobs/generate-dummy-words
 * Creates dummy users with WordleResults for 67words.
 */
router.post('/jobs/generate-dummy-words', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const words = await prisma.wordleWord.findMany({
      where: { date: { not: null, lt: new Date() } },
      orderBy: { date: 'desc' },
      take: 60,
    });
    if (words.length === 0) {
      return res.status(400).json({ error: 'No past daily words found — seed words first' });
    }

    const dummyHash = await bcrypt.hash('dummy-password', 10);
    let usersCreated = 0;
    let resultsCreated = 0;

    for (let i = 0; i < DUMMY_USER_COUNT; i++) {
      const uid = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`;
      const user = await prisma.user.create({
        data: {
          email: `dummy_${uid}${DUMMY_EMAIL_DOMAIN}`,
          hashedPassword: dummyHash,
          name: DUMMY_NAMES[i % DUMMY_NAMES.length],
          emailVerified: true,
        },
      });
      usersCreated++;

      const shuffled = [...words].sort(() => Math.random() - 0.5);
      const userWords = shuffled.slice(0, Math.min(DUMMY_RESULTS_PER_USER, words.length));

      for (const wordleWord of userWords) {
        const solved = Math.random() < 0.65;
        const duration = Math.random() * 300 + 30;
        const fakePool = wordleWord.wordLength === 7 ? FAKE_WORDS_7 : FAKE_WORDS_6;
        const numGuesses = solved ? Math.floor(Math.random() * 5) + 1 : 6;
        const guesses: string[] = [];
        for (let g = 0; g < numGuesses - (solved ? 1 : 0); g++) {
          guesses.push(fakePool[g % fakePool.length]);
        }
        if (solved) guesses.push(wordleWord.word);

        await prisma.wordleResult.create({
          data: {
            userId: user.id,
            wordId: wordleWord.id,
            guesses,
            solved,
            duration: wordleWord.date ? duration : null,
            playedAt: wordleWord.date ?? new Date(),
          },
        });
        resultsCreated++;
      }
    }

    res.json({ success: true, usersCreated, resultsCreated });
  } catch (error) {
    console.error('Generate dummy words error:', error);
    res.status(500).json({ error: 'Failed to generate dummy data' });
  }
});

/**
 * POST /api/admin/jobs/delete-dummy-data
 * Deletes all users with @dummy.test emails and their cascaded data.
 */
router.post('/jobs/delete-dummy-data', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const deleted = await prisma.user.deleteMany({
      where: { email: { endsWith: DUMMY_EMAIL_DOMAIN } },
    });
    res.json({ success: true, usersDeleted: deleted.count });
  } catch (error) {
    console.error('Delete dummy data error:', error);
    res.status(500).json({ error: 'Failed to delete dummy data' });
  }
});

export default router;
