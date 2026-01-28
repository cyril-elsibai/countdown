import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import { generateFrame, getDailyDateKey } from '../services/frameGenerator';
import { validateExpression } from '../services/expressionValidator';

const router = Router();

// Get today's daily challenge (available to everyone)
router.get('/daily', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const today = getDailyDateKey();

    // Find or create today's frame
    let frame = await prisma.frame.findUnique({
      where: { date: today },
    });

    if (!frame) {
      const { tiles, targetNumber } = generateFrame();
      frame = await prisma.frame.create({
        data: {
          tiles,
          targetNumber,
          date: today,
        },
      });
    }

    // Check if user has already played today
    let alreadyPlayed = false;
    if (req.userId) {
      const existingResult = await prisma.gameResult.findFirst({
        where: {
          frameId: frame.id,
          userId: req.userId,
        },
      });
      alreadyPlayed = !!existingResult;
    }

    res.json({
      frame: {
        id: frame.id,
        tiles: frame.tiles,
        targetNumber: frame.targetNumber,
        date: frame.date,
      },
      alreadyPlayed,
    });
  } catch (error) {
    console.error('Daily frame error:', error);
    res.status(500).json({ error: 'Failed to get daily challenge' });
  }
});

// Generate a new random frame (requires authentication)
router.post('/random', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { tiles, targetNumber } = generateFrame();

    const frame = await prisma.frame.create({
      data: {
        tiles,
        targetNumber,
        date: null, // Random frames have no date
      },
    });

    res.json({
      frame: {
        id: frame.id,
        tiles: frame.tiles,
        targetNumber: frame.targetNumber,
      },
    });
  } catch (error) {
    console.error('Random frame error:', error);
    res.status(500).json({ error: 'Failed to generate random frame' });
  }
});

// Get a specific frame by ID (for playing friend's frames)
router.get('/frame/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const frame = await prisma.frame.findUnique({
      where: { id: req.params.id },
    });

    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    res.json({
      frame: {
        id: frame.id,
        tiles: frame.tiles,
        targetNumber: frame.targetNumber,
        date: frame.date,
      },
    });
  } catch (error) {
    console.error('Get frame error:', error);
    res.status(500).json({ error: 'Failed to get frame' });
  }
});

// Submit a solution
router.post('/frame/:id/submit', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { expression, duration } = req.body;
    const frameId = req.params.id;

    const frame = await prisma.frame.findUnique({
      where: { id: frameId },
    });

    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    // Validate the expression
    const validation = validateExpression(expression, frame.tiles, frame.targetNumber);

    // Record the result
    const gameResult = await prisma.gameResult.create({
      data: {
        frameId,
        userId: req.userId || null,
        expression,
        result: validation.result || null,
        solved: validation.valid && validation.result === frame.targetNumber,
        duration: duration || null,
      },
    });

    res.json({
      success: true,
      valid: validation.valid,
      result: validation.result,
      solved: gameResult.solved,
      error: validation.error,
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: 'Failed to submit solution' });
  }
});

export default router;
