/**
 * =============================================================================
 * WORDLE SERVICE (services/wordleService.ts)
 * =============================================================================
 *
 * Core logic for the 67words game:
 * - Loading word lists from flat text files
 * - Evaluating guesses (correct/present/absent feedback)
 * - Validating guesses against the allowed word list
 * - Seeding daily WordleWords for the next year
 *
 * DAILY PATTERN:
 * Days alternate between 6-letter and 7-letter words.
 * Day 1 of the game = 6 letters, Day 2 = 7 letters, etc.
 * Parity is determined by the sequential daily number (odd → 6, even → 7).
 *
 * GUESS EVALUATION:
 * Returns per-letter status matching standard Wordle rules:
 *   'correct'  — right letter, right position (green)
 *   'present'  — right letter, wrong position (yellow)
 *   'absent'   — letter not in word (grey)
 *
 * Multi-letter handling: letters are consumed greedily left-to-right.
 * A letter is only marked 'present' if there are unmatched occurrences
 * remaining in the answer after all 'correct' positions are accounted for.
 *
 * @module server/services/wordleService
 */

import fs from 'fs';
import path from 'path';
import { prisma } from '../db';

// =============================================================================
// WORD LIST LOADING
// =============================================================================

const DATA_DIR = path.join(__dirname, '../data');

function loadWordList(filename: string): Set<string> {
  const filePath = path.join(DATA_DIR, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  const words = content
    .split('\n')
    .map(w => w.trim().toUpperCase())
    .filter(w => w.length > 0);
  return new Set(words);
}

function loadWordArray(filename: string): string[] {
  const filePath = path.join(DATA_DIR, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map(w => w.trim().toUpperCase())
    .filter(w => w.length > 0);
}

// Lazily loaded word sets (loaded once on first use)
let _answers6: string[] | null = null;
let _answers7: string[] | null = null;
let _valid6: Set<string> | null = null;
let _valid7: Set<string> | null = null;

export function getAnswers6(): string[] {
  if (!_answers6) _answers6 = loadWordArray('answers-6.txt');
  return _answers6;
}

export function getAnswers7(): string[] {
  if (!_answers7) _answers7 = loadWordArray('answers-7.txt');
  return _answers7;
}

export function getValid6(): Set<string> {
  if (!_valid6) _valid6 = loadWordList('valid-6.txt');
  return _valid6;
}

export function getValid7(): Set<string> {
  if (!_valid7) _valid7 = loadWordList('valid-7.txt');
  return _valid7;
}

// =============================================================================
// GUESS EVALUATION
// =============================================================================

export type LetterStatus = 'correct' | 'present' | 'absent';

export interface GuessResult {
  guess: string;
  feedback: LetterStatus[];
  solved: boolean;
}

/**
 * Evaluate a single guess against the answer.
 * Returns per-letter status using standard Wordle rules.
 */
export function evaluateGuess(guess: string, answer: string): GuessResult {
  const g = guess.toUpperCase();
  const a = answer.toUpperCase();
  const len = a.length;

  const feedback: LetterStatus[] = new Array(len).fill('absent');

  // First pass: mark correct positions
  const answerRemaining: (string | null)[] = a.split('');
  for (let i = 0; i < len; i++) {
    if (g[i] === a[i]) {
      feedback[i] = 'correct';
      answerRemaining[i] = null; // consume this letter
    }
  }

  // Second pass: mark present (wrong position) using remaining answer letters
  for (let i = 0; i < len; i++) {
    if (feedback[i] === 'correct') continue;
    const idx = answerRemaining.indexOf(g[i]);
    if (idx !== -1) {
      feedback[i] = 'present';
      answerRemaining[idx] = null; // consume
    }
  }

  return {
    guess: g,
    feedback,
    solved: g === a,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Check whether a guess is in the valid word list for the given length.
 */
export function isValidGuess(word: string, length: 6 | 7): boolean {
  const upper = word.toUpperCase();
  if (upper.length !== length) return false;
  if (length === 6) return getValid6().has(upper);
  return getValid7().has(upper);
}

// =============================================================================
// DAILY NUMBER / SEQUENCING
// =============================================================================

export async function getNextDailyWordNumber(beforeDate: Date): Promise<number> {
  const latest = await prisma.wordleWord.findFirst({
    where: { date: { not: null, lt: beforeDate } },
    orderBy: { date: 'desc' },
    select: { name: true },
  });

  if (latest?.name) {
    const match = latest.name.match(/Daily Word #(\d+)/);
    if (match) return parseInt(match[1]) + 1;
  }

  const count = await prisma.wordleWord.count({ where: { date: { not: null, lt: beforeDate } } });
  return count + 1;
}

/**
 * Determine word length for a given daily number.
 * Odd numbers → 6 letters, even → 7 letters.
 */
export function wordLengthForDailyNumber(n: number): 6 | 7 {
  return n % 2 === 1 ? 6 : 7;
}

// =============================================================================
// DAILY SEEDING
// =============================================================================

/**
 * Ensure daily WordleWords exist for today through one year from now.
 * Mirrors ensureYearOfChallenges from frameGenerator.ts.
 */
export async function ensureYearOfWords(startDate?: Date): Promise<{ created: number; existing: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const from = startDate ?? today;

  const oneYearFromNow = new Date(today);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const existingWords = await prisma.wordleWord.findMany({
    where: { date: { gte: from, lte: oneYearFromNow } },
    select: { date: true },
  });

  const existingDates = new Set(
    existingWords.map(w => w.date!.toISOString().split('T')[0])
  );

  let created = 0;
  const currentDate = new Date(from);
  let nextNum = await getNextDailyWordNumber(from);

  // Track used answer indices to avoid repeating answers
  const usedAnswers6 = new Set<string>();
  const usedAnswers7 = new Set<string>();

  // Pre-load used words from DB to avoid reuse
  const usedInDb = await prisma.wordleWord.findMany({
    where: { date: { not: null } },
    select: { word: true, wordLength: true },
  });
  for (const { word, wordLength } of usedInDb) {
    if (wordLength === 6) usedAnswers6.add(word.toUpperCase());
    else usedAnswers7.add(word.toUpperCase());
  }

  const answers6 = getAnswers6();
  const answers7 = getAnswers7();

  while (currentDate <= oneYearFromNow) {
    const dateKey = currentDate.toISOString().split('T')[0];

    if (!existingDates.has(dateKey)) {
      const wordLength = wordLengthForDailyNumber(nextNum);
      const pool = wordLength === 6 ? answers6 : answers7;
      const used = wordLength === 6 ? usedAnswers6 : usedAnswers7;

      // Pick a random unused word
      const available = pool.filter(w => !used.has(w));
      if (available.length > 0) {
        const word = available[Math.floor(Math.random() * available.length)];
        used.add(word);

        await prisma.wordleWord.create({
          data: {
            word,
            wordLength,
            date: new Date(dateKey + 'T00:00:00.000Z'),
            name: `Daily Word #${nextNum}`,
          },
        });
        created++;
      }
      // If pool exhausted, skip (will fill on next restart with expanded list)
    }

    nextNum++;
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return { created, existing: existingDates.size };
}
