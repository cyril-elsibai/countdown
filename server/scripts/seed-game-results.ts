/**
 * Seed script: generate GameResults for past frames only (daily challenges up to
 * yesterday + random frames), for a given user.
 * Run with: npx ts-node scripts/seed-game-results.ts
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find user
  const user = await prisma.user.findFirst({
    where: { name: { contains: 'Cyril' } },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    console.error('User not found');
    process.exit(1);
  }
  console.log(`Found user: ${user.name} (${user.email}) — id: ${user.id}`);

  // Today at midnight UTC — exclude today and future frames
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Step 1: delete any seeded results for today or future daily frames
  const deleted = await prisma.gameResult.deleteMany({
    where: {
      userId: user.id,
      frame: {
        date: { gte: today },
      },
    },
  });
  console.log(`Deleted ${deleted.count} results for today/future frames`);

  // Step 2: get only past daily frames (date < today) + random frames (date null)
  const frames = await prisma.frame.findMany({
    where: {
      OR: [
        { date: null },
        { date: { lt: today } },
      ],
    },
    select: { id: true, targetNumber: true, date: true, name: true },
  });
  console.log(`Eligible frames (past daily + random): ${frames.length}`);

  // Get frames already played by this user
  const existing = await prisma.gameResult.findMany({
    where: { userId: user.id },
    select: { frameId: true },
  });
  const playedIds = new Set(existing.map(r => r.frameId));
  console.log(`Already has results for: ${playedIds.size} frames`);

  const toSeed = frames.filter(f => !playedIds.has(f.id));
  console.log(`Seeding ${toSeed.length} new results...`);

  let created = 0;
  for (const frame of toSeed) {
    const solved = Math.random() < 0.6;
    const duration = solved
      ? Math.round((10 + Math.random() * 290) * 100) / 100
      : Math.round((60 + Math.random() * 240) * 100) / 100;

    const diff = solved ? 0 : Math.floor(Math.random() * 50) + 1;
    const result = solved ? frame.targetNumber : frame.targetNumber + (Math.random() < 0.5 ? diff : -diff);

    await prisma.gameResult.create({
      data: {
        frameId: frame.id,
        userId: user.id,
        solved,
        result,
        duration,
        expression: solved ? `(seeded)` : null,
      },
    });
    created++;
  }

  console.log(`Done — created ${created} game results.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
