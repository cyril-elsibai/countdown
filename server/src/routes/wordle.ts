/**
 * =============================================================================
 * WORDLE ROUTES (routes/wordle.ts)
 * =============================================================================
 *
 * API endpoints for the 67words game (Wordle-style, 6 or 7 letters).
 *
 * ENDPOINTS:
 *   GET  /api/wordle/daily          — today's daily word (no answer sent)
 *   GET  /api/wordle/word/:id       — word state by id (no answer sent)
 *   POST /api/wordle/word/:id/start — record start time for daily timing
 *   POST /api/wordle/word/:id/guess — submit one guess, get letter feedback
 *   POST /api/wordle/random         — get a random unplayed word (auth required)
 *
 * ANSWER SECURITY:
 * The answer is NEVER sent to the client. Only after the game is over
 * (solved or 6 guesses used) is the answer revealed in the response.
 *
 * GUESS-BY-GUESS MODEL:
 * Each POST /guess adds one guess to WordleResult.guesses[].
 * The server evaluates feedback and returns it alongside game state.
 *
 * @module server/routes/wordle
 */

import { Router, Response } from 'express';
import wordleDashboardRoutes from './wordleDashboard';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import {
  evaluateGuess,
  isValidGuess,
  ensureYearOfWords,
  getNextDailyWordNumber,
  wordLengthForDailyNumber,
  getAnswers6,
  getAnswers7,
  GuessResult,
} from '../services/wordleService';

const router = Router();

const MAX_GUESSES = 6;

// =============================================================================
// HELPERS
// =============================================================================

/** Get today's date at midnight UTC */
function getTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Build the public game state payload (no answer unless game over) */
function buildGameState(
  wordleWord: { id: string; wordLength: number; date: Date | null; name: string | null; randomNumber: number | null },
  result: { guesses: string[]; solved: boolean; duration: number | null } | null,
  startedAt: Date | null,
  answer: string,
) {
  const guesses = result?.guesses ?? [];
  const gameOver = result?.solved || guesses.length >= MAX_GUESSES;
  const guessResults: GuessResult[] = guesses.map(g => evaluateGuess(g, answer));

  const displayName = wordleWord.name ?? (wordleWord.randomNumber != null ? `Random #${wordleWord.randomNumber}` : null);

  return {
    word: {
      id: wordleWord.id,
      wordLength: wordleWord.wordLength,
      date: wordleWord.date,
      name: displayName,
    },
    guesses: guessResults,
    guessCount: guesses.length,
    maxGuesses: MAX_GUESSES,
    solved: result?.solved ?? false,
    gameOver,
    duration: result?.duration ?? null,
    startedAt: startedAt?.toISOString() ?? null,
    // Only reveal answer when game is over
    answer: gameOver ? answer : null,
  };
}

// =============================================================================
// GET /api/wordle/daily
// =============================================================================

router.get('/daily', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const today = getTodayUTC();

    // Find or create today's word
    let wordleWord = await prisma.wordleWord.findUnique({ where: { date: today } });

    if (!wordleWord) {
      // Fallback: seed (shouldn't happen if startup seeding worked)
      await ensureYearOfWords(today);
      wordleWord = await prisma.wordleWord.findUnique({ where: { date: today } });
      if (!wordleWord) {
        return res.status(503).json({ error: 'Daily word not available' });
      }
    }

    const userId = req.userId;
    let result: { guesses: string[]; solved: boolean; duration: number | null } | null = null;
    let startedAt: Date | null = null;

    if (userId) {
      // Get existing result if any
      const existing = await prisma.wordleResult.findUnique({
        where: { userId_wordId: { userId, wordId: wordleWord.id } },
        select: { guesses: true, solved: true, duration: true },
      });
      result = existing;

      // Get attempt start time
      const attempt = await prisma.wordleAttempt.findUnique({
        where: { userId_wordId: { userId, wordId: wordleWord.id } },
        select: { startedAt: true },
      });
      startedAt = attempt?.startedAt ?? null;
    }

    return res.json(buildGameState(wordleWord, result, startedAt, wordleWord.word));
  } catch (err) {
    console.error('GET /wordle/daily error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// GET /api/wordle/word/:id
// =============================================================================

router.get('/word/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const wordleWord = await prisma.wordleWord.findUnique({ where: { id } });

    if (!wordleWord) {
      return res.status(404).json({ error: 'Word not found' });
    }

    const userId = req.userId;
    let result: { guesses: string[]; solved: boolean; duration: number | null } | null = null;
    let startedAt: Date | null = null;

    if (userId) {
      const existing = await prisma.wordleResult.findUnique({
        where: { userId_wordId: { userId, wordId: id } },
        select: { guesses: true, solved: true, duration: true },
      });
      result = existing;

      const attempt = await prisma.wordleAttempt.findUnique({
        where: { userId_wordId: { userId, wordId: id } },
        select: { startedAt: true },
      });
      startedAt = attempt?.startedAt ?? null;
    }

    return res.json(buildGameState(wordleWord, result, startedAt, wordleWord.word));
  } catch (err) {
    console.error('GET /wordle/word/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// POST /api/wordle/word/:id/start
// =============================================================================

/**
 * Records when the user started a daily word puzzle (for accurate timing).
 * Creates a WordleAttempt if one doesn't already exist.
 * Only meaningful for daily words (date != null).
 */
router.post('/word/:id/start', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const wordleWord = await prisma.wordleWord.findUnique({ where: { id }, select: { id: true, date: true } });
    if (!wordleWord) return res.status(404).json({ error: 'Word not found' });
    if (!wordleWord.date) return res.status(400).json({ error: 'Not a daily word' });

    // Check if already completed
    const existing = await prisma.wordleResult.findUnique({
      where: { userId_wordId: { userId, wordId: id } },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: 'Already played' });

    // Upsert attempt (idempotent — don't reset startedAt if already set)
    await prisma.wordleAttempt.upsert({
      where: { userId_wordId: { userId, wordId: id } },
      create: { userId, wordId: id },
      update: {}, // keep original startedAt
    });

    return res.json({ started: true });
  } catch (err) {
    console.error('POST /wordle/word/:id/start error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// POST /api/wordle/word/:id/guess
// =============================================================================

/**
 * Submit a single guess for a word.
 *
 * Body: { guess: string }
 *
 * Response: full game state (guesses + feedback, answer if game over)
 */
router.post('/word/:id/guess', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { guess } = req.body;

    if (!guess || typeof guess !== 'string') {
      return res.status(400).json({ error: 'Missing guess' });
    }

    const wordleWord = await prisma.wordleWord.findUnique({ where: { id } });
    if (!wordleWord) return res.status(404).json({ error: 'Word not found' });

    const wordLength = wordleWord.wordLength as 6 | 7;
    const normalizedGuess = guess.trim().toUpperCase();

    // Validate guess length and dictionary
    if (normalizedGuess.length !== wordLength) {
      return res.status(400).json({ error: `Guess must be ${wordLength} letters` });
    }
    if (!isValidGuess(normalizedGuess, wordLength)) {
      return res.status(400).json({ error: 'Not a valid word' });
    }

    const userId = req.userId;

    // Get or create result record
    let result = userId
      ? await prisma.wordleResult.findUnique({
          where: { userId_wordId: { userId, wordId: id } },
        })
      : null;

    // If already game-over, don't accept more guesses
    if (result && (result.solved || result.guesses.length >= MAX_GUESSES)) {
      return res.status(409).json({ error: 'Game already over' });
    }

    const previousGuesses = result?.guesses ?? [];
    if (previousGuesses.length >= MAX_GUESSES) {
      return res.status(409).json({ error: 'No guesses remaining' });
    }

    const newGuesses = [...previousGuesses, normalizedGuess];
    const solved = normalizedGuess === wordleWord.word.toUpperCase();
    const gameOver = solved || newGuesses.length >= MAX_GUESSES;

    // Calculate duration for daily words
    let duration: number | null = null;
    if (gameOver && userId && wordleWord.date) {
      const attempt = await prisma.wordleAttempt.findUnique({
        where: { userId_wordId: { userId, wordId: id } },
        select: { startedAt: true },
      });
      if (attempt) {
        duration = (Date.now() - attempt.startedAt.getTime()) / 1000;
      }
    }

    // Persist result for logged-in users
    if (userId) {
      if (!result) {
        result = await prisma.wordleResult.create({
          data: { userId, wordId: id, guesses: newGuesses, solved, duration },
        });
      } else {
        result = await prisma.wordleResult.update({
          where: { userId_wordId: { userId, wordId: id } },
          data: { guesses: newGuesses, solved, duration: gameOver ? duration : result.duration },
        });
      }
    }

    const resultForState = {
      guesses: newGuesses,
      solved,
      duration: duration ?? result?.duration ?? null,
    };

    let startedAt: Date | null = null;
    if (userId && wordleWord.date) {
      const attempt = await prisma.wordleAttempt.findUnique({
        where: { userId_wordId: { userId, wordId: id } },
        select: { startedAt: true },
      });
      startedAt = attempt?.startedAt ?? null;
    }

    return res.json(buildGameState(wordleWord, resultForState, startedAt, wordleWord.word));
  } catch (err) {
    console.error('POST /wordle/word/:id/guess error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// POST /api/wordle/random
// =============================================================================

/**
 * Get a random unplayed WordleWord for the authenticated user.
 * Priority: unplayed daily words → unplayed random words → generate new random
 */
router.post('/random', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Get IDs of words the user has already played
    const played = await prisma.wordleResult.findMany({
      where: { userId },
      select: { wordId: true },
    });
    const playedIds = played.map(p => p.wordId);

    const idFilter = playedIds.length > 0 ? { notIn: playedIds } : undefined;

    // 1. Try an unplayed past daily word
    const today = getTodayUTC();
    const pastDailies = await prisma.wordleWord.findMany({
      where: { date: { not: null, lt: today }, ...(idFilter && { id: idFilter }) },
      select: { id: true },
    });

    let wordleWord;

    if (pastDailies.length > 0) {
      const pick = pastDailies[Math.floor(Math.random() * pastDailies.length)];
      wordleWord = await prisma.wordleWord.findUnique({ where: { id: pick.id } });
    }

    // 2. Try an unplayed random word
    if (!wordleWord) {
      const randomWords = await prisma.wordleWord.findMany({
        where: { date: null, ...(idFilter && { id: idFilter }) },
        select: { id: true },
      });

      if (randomWords.length > 0) {
        const pick = randomWords[Math.floor(Math.random() * randomWords.length)];
        wordleWord = await prisma.wordleWord.findUnique({ where: { id: pick.id } });
      }
    }

    // 3. Generate a new random word
    if (!wordleWord) {
      // Alternate length based on count of existing random words
      const randomCount = await prisma.wordleWord.count({ where: { date: null } });
      const wordLength: 6 | 7 = randomCount % 2 === 0 ? 6 : 7;
      const pool = wordLength === 6 ? getAnswers6() : getAnswers7();

      // Find used words of this length
      const usedWords = await prisma.wordleWord.findMany({
        where: { wordLength },
        select: { word: true },
      });
      const usedSet = new Set(usedWords.map(w => w.word.toUpperCase()));
      const available = pool.filter(w => !usedSet.has(w));

      if (available.length === 0) {
        return res.status(503).json({ error: 'No words available. Please try again later.' });
      }

      const word = available[Math.floor(Math.random() * available.length)];
      wordleWord = await prisma.wordleWord.create({
        data: { word, wordLength, date: null, name: null },
      });
    }

    // Auto-start the timer (random words start immediately)
    await prisma.wordleAttempt.upsert({
      where: { userId_wordId: { userId, wordId: wordleWord!.id } },
      create: { userId, wordId: wordleWord!.id },
      update: {},
    });

    const result = await prisma.wordleResult.findUnique({
      where: { userId_wordId: { userId, wordId: wordleWord!.id } },
      select: { guesses: true, solved: true, duration: true },
    });

    const attempt = await prisma.wordleAttempt.findUnique({
      where: { userId_wordId: { userId, wordId: wordleWord!.id } },
      select: { startedAt: true },
    });

    return res.json(buildGameState(wordleWord!, result, attempt?.startedAt ?? null, wordleWord!.word));
  } catch (err) {
    console.error('POST /wordle/random error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// GET /api/wordle/word/:id/stats — aggregated stats for the result modal
// =============================================================================

router.get('/word/:id/stats', async (req, res) => {
  try {
    const id = req.params.id as string;
    const results = await prisma.wordleResult.findMany({
      where: { wordId: id },
      select: { solved: true, guesses: true },
    });

    const totalPlays = results.length;
    const solved = results.filter(r => r.solved);
    const winRate = totalPlays > 0 ? Math.round((solved.length / totalPlays) * 100) : 0;

    const guessDist = [0, 0, 0, 0, 0, 0];
    for (const r of solved) {
      const idx = Math.min(r.guesses.length - 1, 5);
      guessDist[idx]++;
    }

    res.json({ totalPlays, winRate, guessDist });
  } catch (err) {
    console.error('GET /wordle/word/:id/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// GET /api/wordle/health
// =============================================================================

router.get('/health', (_req, res) => {
  res.json({ ok: true, game: '67words' });
});

// =============================================================================
// DASHBOARD ROUTES
// =============================================================================

router.use('/dashboard', wordleDashboardRoutes);

export default router;
