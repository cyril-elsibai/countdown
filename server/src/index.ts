/**
 * =============================================================================
 * SERVER ENTRY POINT (index.ts)
 * =============================================================================
 *
 * This is the main entry point for the Countdown Numbers Game backend server.
 * It initializes the Express application, sets up middleware, mounts API routes,
 * connects to the database, and ensures daily challenges exist for the upcoming year.
 *
 * ARCHITECTURE OVERVIEW:
 * - Express.js server running on port 3001 (configurable via PORT env var)
 * - PostgreSQL database accessed via Prisma ORM
 * - RESTful API design with separate route modules for auth, game, friends, admin
 * - CORS enabled for frontend dev server (localhost:5173)
 *
 * STARTUP SEQUENCE:
 * 1. Load environment variables from .env file
 * 2. Create Express app and configure middleware
 * 3. Mount API route handlers
 * 4. Connect to PostgreSQL database
 * 5. Generate missing daily challenges for the next year
 * 6. Start HTTP server
 *
 * @module server/index
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import gameRoutes from './routes/game';
import friendsRoutes from './routes/friends';
import adminRoutes from './routes/admin';
import dashboardRoutes from './routes/dashboard';
import wordleRoutes from './routes/wordle';
import { prisma } from './db';
import { ensureYearOfChallenges } from './services/frameGenerator';
import { runPointsCalculation } from './services/pointsCalculator';
import { checkNameUtilization } from './services/nameGenerator';

// Create the Express application instance
const app = express();

// Server port - defaults to 3001 if not specified in environment
const PORT = process.env.PORT || 3001;

// =============================================================================
// MIDDLEWARE CONFIGURATION
// =============================================================================

/**
 * CORS Configuration
 *
 * Cross-Origin Resource Sharing is configured to allow requests from the
 * Vite development server. In production, this should be updated to match
 * the actual frontend domain.
 *
 * - origin: Allows requests from the React frontend dev server
 * - credentials: Enables cookies and authorization headers in cross-origin requests
 */
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    // or from any origin in development
    callback(null, true);
  },
  credentials: true,
}));

/**
 * JSON Body Parser
 *
 * Parses incoming request bodies with JSON payloads.
 * This middleware is required for all POST/PUT/PATCH endpoints
 * that expect JSON data in the request body.
 */
app.use(express.json());

// =============================================================================
// API ROUTES
// =============================================================================

/**
 * Authentication Routes (/api/auth/*)
 *
 * Handles all user authentication operations:
 * - POST /register - Create new user account
 * - POST /verify - Verify email with token
 * - POST /resend-verification - Resend verification email
 * - POST /login - Authenticate user and return JWT
 * - POST /forgot-password - Request password reset
 * - POST /reset-password - Reset password with token
 * - GET /me - Get current authenticated user
 * - PATCH /me - Update user profile
 * - POST /change-password - Change password (requires auth)
 */
app.use('/api/auth', authRoutes);

/**
 * Game Routes (/api/game/*)
 *
 * Handles all game-related operations:
 * - GET /daily - Get today's daily challenge
 * - POST /random - Generate a new random frame (requires auth)
 * - GET /frame/:id - Get a specific frame by ID
 * - POST /frame/:id/submit - Submit a solution for a frame
 */
app.use('/api/game', gameRoutes);

/**
 * Friends Routes (/api/friends/*)
 *
 * Handles friend relationships (all require authentication):
 * - GET / - List all friends and requests
 * - POST /request - Send a friend request
 * - POST /:id/accept - Accept a friend request
 * - DELETE /:id - Remove friend or cancel request
 */
app.use('/api/friends', friendsRoutes);

/**
 * Admin Routes (/api/admin/*)
 *
 * Handles administrative operations (require admin auth):
 * - POST /login - Authenticate as admin
 * - GET /verify - Verify admin token validity
 * - GET /challenges - List daily challenges
 * - GET /challenges/:date - Get challenge for specific date
 * - PUT /challenges/:date - Create or update a challenge
 */
app.use('/api/admin', adminRoutes);

/**
 * Dashboard Routes (/api/dashboard/*)
 *
 * Handles dashboard and statistics (all require authentication):
 * - GET /history - Get challenges for a month with user results
 * - GET /leaderboard - Get per-frame leaderboard (global or friends)
 * - GET /overall-leaderboard - Get overall points leaderboard
 * - GET /friends-activity - Get recent activity from friends
 */
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/wordle', wordleRoutes);

// =============================================================================
// HEALTH CHECK ENDPOINT
// =============================================================================

/**
 * Health Check
 *
 * Simple endpoint to verify server is running.
 * Useful for load balancers, monitoring systems, and container orchestration.
 *
 * @returns {Object} Status object with 'ok' value
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

/**
 * Main Server Initialization Function
 *
 * This async function handles the complete server startup sequence:
 *
 * 1. DATABASE CONNECTION
 *    Connects to PostgreSQL via Prisma. Fails fast if connection fails.
 *
 * 2. DAILY CHALLENGE GENERATION
 *    Ensures that daily challenges exist for today through one year from now.
 *    This pre-generation prevents race conditions when multiple users request
 *    the daily challenge simultaneously.
 *
 * 3. HTTP SERVER
 *    Starts the Express server listening on the configured port.
 *
 * ERROR HANDLING:
 * If any step fails, the error is logged and the process exits with code 1.
 * This ensures container orchestration systems know the server failed to start.
 */
async function main() {
  try {
    // Step 1: Connect to the PostgreSQL database
    await prisma.$connect();
    console.log('Connected to database');

    // Step 2: Ensure a full year of daily challenges exists
    // This runs on every server start to fill any gaps
    console.log('Checking daily challenges...');
    const { created, existing } = await ensureYearOfChallenges();
    if (created > 0) {
      console.log(`Created ${created} new daily challenges (${existing} already existed)`);
    } else {
      console.log(`All ${existing} daily challenges already exist`);
    }

    // Step 3: Run initial points calculation
    console.log('Running points calculation...');
    const pointsResult = await runPointsCalculation('startup');
    console.log(`Points calculated: ${pointsResult.usersProcessed} users, ${pointsResult.resultsProcessed} results`);

    // Step 4: Schedule daily points calculation at midnight UTC
    const scheduleDailyCalculation = () => {
      const now = new Date();
      const nextMidnight = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 30
      ));
      const msUntilMidnight = nextMidnight.getTime() - now.getTime();

      setTimeout(async () => {
        try {
          console.log('Running scheduled points calculation...');
          const result = await runPointsCalculation('scheduled');
          console.log(`Scheduled points: ${result.usersProcessed} users, ${result.resultsProcessed} results`);
        } catch (err) {
          console.error('Scheduled points calculation failed:', err);
        }
        try {
          await checkNameUtilization();
        } catch (err) {
          console.error('Name utilization check failed:', err);
        }
        scheduleDailyCalculation(); // Schedule next run
      }, msUntilMidnight);

      console.log(`Next points calculation scheduled in ${Math.round(msUntilMidnight / 3600000)}h`);
    };
    scheduleDailyCalculation();

    // Step 5: Start the HTTP server on all network interfaces
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    // Log the error and exit with failure code
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Execute the main function to start the server
main();
