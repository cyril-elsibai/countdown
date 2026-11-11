// Read-only: why is a player missing from the all-time ranking?
// Usage (from /server): DATABASE_URL='<Railway public URL>' node src/scripts/diagnose-ranking.js
const { Client } = require('pg');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const q = async (title, sql) => {
    console.log(`\n== ${title}`);
    console.table((await db.query(sql)).rows);
  };

  await q('Users (real), with points and solved dailies', `
    SELECT u.name, split_part(u.email, '@', 1) AS email_user, u."emailVerified" AS verified,
           u."createdAt"::date AS created, s."totalPoints" AS points,
           (SELECT count(*) FROM "GameResult" g JOIN "Frame" f ON f.id = g."frameId"
             WHERE g."userId" = u.id AND g.solved AND f.date IS NOT NULL) AS solved_dailies,
           (SELECT count(*) FROM "GameResult" g WHERE g."userId" = u.id) AS all_results,
           (SELECT max(g."playedAt")::date FROM "GameResult" g WHERE g."userId" = u.id) AS last_played
    FROM "User" u LEFT JOIN "UserStats" s ON s."userId" = u.id
    WHERE u.email NOT LIKE '%@dummy.test'
    ORDER BY u."createdAt"`);

  await q('Last points calculations', `
    SELECT status, "startedAt", "usersProcessed", "resultsProcessed", "triggeredBy"
    FROM "PointsCalculation" ORDER BY "startedAt" DESC LIMIT 5`);

  await q('Daily frames: count and range', `
    SELECT count(*) AS dailies, min(date)::date AS first, max(date)::date AS last
    FROM "Frame" WHERE date IS NOT NULL`);

  await db.end();
})().catch(e => { console.error(e.message); process.exit(1); });
