import { Router } from 'express';

const router = Router();

// Placeholder — 67words routes will be implemented here
// GET  /api/wordle/daily      — today's word
// GET  /api/wordle/word/:id   — get a word by id
// POST /api/wordle/word/:id/start   — start timer for daily
// POST /api/wordle/word/:id/submit  — submit guesses
// POST /api/wordle/random     — get next random word

router.get('/health', (_req, res) => {
  res.json({ ok: true, game: '67words' });
});

export default router;
