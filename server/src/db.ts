/**
 * =============================================================================
 * DATABASE CLIENT (db.ts)
 * =============================================================================
 *
 * This module initializes and exports the Prisma database client for PostgreSQL.
 * It uses the Prisma Postgres adapter for optimal connection handling.
 *
 * CONFIGURATION:
 * - Connection string is read from DATABASE_URL environment variable
 * - Uses PrismaPg adapter for PostgreSQL-specific optimizations
 *
 * USAGE:
 * Import the `prisma` client in any module that needs database access:
 *
 * ```typescript
 * import { prisma } from './db';
 *
 * // Example: Find a user by email
 * const user = await prisma.user.findUnique({ where: { email } });
 * ```
 *
 * IMPORTANT NOTES:
 * - The Prisma client is generated at build time via `prisma generate`
 * - Schema changes require running migrations via `prisma migrate dev`
 * - The client is a singleton - import from this module, don't create new instances
 *
 * @module server/db
 */

import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * PostgreSQL Adapter
 *
 * Creates a PostgreSQL-specific adapter that optimizes Prisma's connection
 * handling for PostgreSQL databases. The connection string is read from
 * the DATABASE_URL environment variable.
 *
 * Example DATABASE_URL format:
 * postgresql://username:password@hostname:5432/database_name
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

/**
 * Prisma Client Instance
 *
 * The main database client used throughout the application.
 * This is a singleton instance configured with the PostgreSQL adapter.
 *
 * Available models (from schema.prisma):
 * - prisma.user - User accounts
 * - prisma.verificationToken - Email verification tokens
 * - prisma.passwordResetToken - Password reset tokens
 * - prisma.frame - Game frames/challenges
 * - prisma.gameResult - User submissions/results
 * - prisma.dailyAttempt - Daily challenge attempts (for timing)
 * - prisma.friendship - Friend relationships
 *
 * @example
 * // Find all frames for today
 * const today = new Date();
 * const frame = await prisma.frame.findUnique({ where: { date: today } });
 */
export const prisma = new PrismaClient({ adapter });
