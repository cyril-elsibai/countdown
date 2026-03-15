import 'dotenv/config';
import { prisma } from '../db';

async function main() {
  const userId = 'cml0hkaps0001coidwecbn4x9';

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const words = await prisma.wordleWord.findMany({
    where: { date: { not: null, lt: today } },
    orderBy: { date: 'asc' },
  });

  console.log(`Found ${words.length} past daily words`);

  await prisma.wordleResult.deleteMany({ where: { userId } });

  let created = 0;
  for (let i = 0; i < Math.min(words.length, 60); i++) {
    const word = words[i];
    if (Math.random() < 0.2) continue; // skip ~20%

    const solved = Math.random() < 0.75;
    const guessCount = solved ? Math.floor(Math.random() * 5) + 1 : 6;

    const guesses: string[] = [];
    for (let g = 0; g < guessCount; g++) {
      if (solved && g === guessCount - 1) {
        guesses.push(word.word);
      } else {
        const fake = Array.from({ length: word.wordLength }, () =>
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]
        ).join('');
        guesses.push(fake);
      }
    }

    const duration = solved ? 20 + guessCount * 15 + Math.random() * 60 : null;

    await prisma.wordleResult.create({
      data: {
        userId,
        wordId: word.id,
        solved,
        guesses,
        duration,
        playedAt: word.date!,
      },
    });
    created++;
  }

  console.log(`Created ${created} results`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
