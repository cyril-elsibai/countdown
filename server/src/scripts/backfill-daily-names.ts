/**
 * Backfill script:
 * 1. Creates missing daily frames from Jan 1 2026 up to yesterday
 * 2. Names ALL daily frames as "Daily #XX" based on their date order
 *
 * Run with: npx ts-node src/scripts/backfill-daily-names.ts
 */

import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ensureYearOfChallenges } from '../services/frameGenerator';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Step 1: Create missing past daily frames starting from Jan 1 2026
  const startDate = new Date('2026-01-01T00:00:00.000Z');
  console.log('Generating missing past daily frames from Jan 1 2026...');
  const { created, existing } = await ensureYearOfChallenges(startDate);
  console.log(`Created: ${created}, Already existed: ${existing}`);

  // Step 2: Name all daily frames based on date order (oldest = #1)
  console.log('\nFetching all daily frames ordered by date...');
  const allDailyFrames = await prisma.frame.findMany({
    where: { date: { not: null } },
    orderBy: { date: 'asc' },
    select: { id: true, date: true, name: true },
  });

  console.log(`Found ${allDailyFrames.length} daily frames. Assigning names...`);

  for (let i = 0; i < allDailyFrames.length; i++) {
    const frame = allDailyFrames[i];
    const expectedName = `Daily #${i + 1}`;
    if (frame.name !== expectedName) {
      await prisma.frame.update({
        where: { id: frame.id },
        data: { name: expectedName },
      });
      console.log(`  ${frame.date!.toISOString().split('T')[0]}: ${frame.name ?? '(unnamed)'} → ${expectedName}`);
    }
  }

  console.log('\nDone!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
