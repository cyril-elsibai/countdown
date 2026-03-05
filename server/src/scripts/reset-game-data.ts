/**
 * Reset Game Data
 *
 * Clears all game-related data and regenerates daily challenges.
 * Users and friendships are preserved.
 *
 * Run with:
 *   npx ts-node src/scripts/reset-game-data.ts
 */

import 'dotenv/config';
import { prisma } from '../db';
import { ensureYearOfChallenges } from '../services/frameGenerator';

async function main() {
  console.log('Starting game data reset...\n');

  // 1. Delete in dependency order (children before parents)
  console.log('Deleting GameResults...');
  const { count: gameResultCount } = await prisma.gameResult.deleteMany({});
  console.log(`  Deleted ${gameResultCount} records.`);

  console.log('Deleting DailyAttempts...');
  const { count: dailyAttemptCount } = await prisma.dailyAttempt.deleteMany({});
  console.log(`  Deleted ${dailyAttemptCount} records.`);

  console.log('Deleting UserStats...');
  const { count: userStatsCount } = await prisma.userStats.deleteMany({});
  console.log(`  Deleted ${userStatsCount} records.`);

  console.log('Deleting PointsCalculations...');
  const { count: pointsCalcCount } = await prisma.pointsCalculation.deleteMany({});
  console.log(`  Deleted ${pointsCalcCount} records.`);

  console.log('Deleting Frames...');
  const { count: frameCount } = await prisma.frame.deleteMany({});
  console.log(`  Deleted ${frameCount} records.`);

  // 2. Regenerate daily challenges from Day #1 (Jan 1 2026) to one year from now
  console.log('\nRegenerating daily challenges...');
  const epoch = new Date('2026-01-01T00:00:00.000Z');
  const { created } = await ensureYearOfChallenges(epoch);
  console.log(`  Created ${created} new challenges.`);

  console.log('\nDone. Users and friendships untouched.');
}

main()
  .catch(err => {
    console.error('Reset failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
