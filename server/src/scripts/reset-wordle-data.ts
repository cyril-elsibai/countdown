/**
 * Reset Wordle Data
 *
 * Clears all 67words data and regenerates daily words starting Jan 1 2026.
 * Users and friendships are preserved.
 *
 * Run with:
 *   npx ts-node src/scripts/reset-wordle-data.ts
 */

import 'dotenv/config';
import { prisma } from '../db';
import { ensureYearOfWords } from '../services/wordleService';

async function main() {
  console.log('Starting Wordle data reset...\n');

  console.log('Deleting WordleAttempts...');
  const { count: attemptCount } = await prisma.wordleAttempt.deleteMany({});
  console.log(`  Deleted ${attemptCount} records.`);

  console.log('Deleting WordleResults...');
  const { count: resultCount } = await prisma.wordleResult.deleteMany({});
  console.log(`  Deleted ${resultCount} records.`);

  console.log('Deleting WordleWords...');
  const { count: wordCount } = await prisma.wordleWord.deleteMany({});
  console.log(`  Deleted ${wordCount} records.`);

  console.log('\nRegenerating daily words from Jan 1 2026...');
  const startDate = new Date('2026-01-01T00:00:00.000Z');
  const { created } = await ensureYearOfWords(startDate);
  console.log(`  Created ${created} daily words.`);

  console.log('\nDone. Users and friendships untouched.');
}

main()
  .catch(err => {
    console.error('Reset failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
