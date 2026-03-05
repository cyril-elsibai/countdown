/**
 * =============================================================================
 * FRAME GENERATOR SERVICE (services/frameGenerator.ts)
 * =============================================================================
 *
 * This service handles the generation and validation of game frames (puzzles)
 * for the Countdown Numbers game. It follows the rules of the TV show.
 *
 * GAME RULES (from the Countdown TV show):
 * 1. Players are given 6 number tiles
 * 2. Tiles are drawn from two pools:
 *    - Small numbers: 1-10 (can repeat)
 *    - Large numbers: 25, 50, 75, 100 (no duplicates)
 * 3. A random target number between 101-999 is generated
 * 4. Players must reach the target using arithmetic (+, -, ×, ÷)
 * 5. Each tile can only be used once
 * 6. Intermediate results must be positive integers
 *
 * DEFAULT TILE SELECTION:
 * Randomly picks 0, 1, or 2 large numbers (equal probability) then fills
 * the remaining slots with small numbers.
 *
 * UNIQUENESS:
 * The service ensures no two daily challenges have the same tile/target
 * combination. This is checked by sorting tiles and comparing.
 *
 * @module server/services/frameGenerator
 */

import { prisma } from '../db';

// =============================================================================
// NUMBER POOLS
// =============================================================================

/**
 * Small Number Pool
 *
 * The "small" numbers available in the Countdown Numbers game.
 * In the TV show, there are exactly 2 of each number (1-10) in the deck.
 * We draw without replacement from a pool of [1,1,2,2,...,10,10].
 */
const SMALL_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Large Number Pool
 *
 * The "large" numbers available in the Countdown Numbers game.
 * There is only one of each in the TV show, so we select without replacement.
 */
const LARGE_NUMBERS = [25, 50, 75, 100];

/**
 * Full tile pool: 2 of each small number + 1 of each large number.
 * Matches the actual Countdown TV show deck.
 */
const TILE_POOL = [...SMALL_NUMBERS, ...SMALL_NUMBERS, ...LARGE_NUMBERS];

// =============================================================================
// GENERATION FUNCTIONS
// =============================================================================

/**
 * Generate Target Number
 *
 * Creates a random 3-digit target number for the game.
 * The range 101-999 ensures a challenging but achievable goal.
 *
 * @returns A random integer between 101 and 999 (inclusive)
 *
 * @example
 * const target = generateTargetNumber(); // e.g., 527
 */
export function generateTargetNumber(): number {
  // Random number from 0 to 898, then add 101 to get 101-999
  return Math.floor(Math.random() * 899) + 101;
}

/**
 * Generate Tiles
 *
 * Creates an array of 6 number tiles following the TV show rules.
 * Draws 6 tiles from the full pool (2× each small number + 1× each large).
 * Each tile is removed from the pool as it is picked. If a large number is
 * drawn when 2 large numbers are already selected, it is skipped and a new
 * pick is made — giving a natural 0–2 large number distribution.
 *
 * @returns An array of 6 numbers in random order
 *
 * @example
 * const tiles = generateTiles(); // e.g., [7, 25, 3, 100, 5, 2]
 */
export function generateTiles(): number[] {
  const tiles: number[] = [];
  const pool = [...TILE_POOL];
  let largeCount = 0;

  while (tiles.length < 6) {
    const index = Math.floor(Math.random() * pool.length);
    const picked = pool[index];

    if (picked > 10 && largeCount >= 2) {
      // Already have 2 large numbers — put it back and try again
      continue;
    }

    pool.splice(index, 1);
    tiles.push(picked);
    if (picked > 10) largeCount++;
  }

  return tiles;
}

/**
 * Generate Complete Frame
 *
 * Creates a complete game frame with tiles and target number.
 * This is the basic generation function that doesn't check for uniqueness.
 *
 * @returns An object containing tiles array and targetNumber
 *
 * @example
 * const frame = generateFrame();
 * // { tiles: [4, 75, 8, 2, 25, 6], targetNumber: 312 }
 */
export function generateFrame(): { tiles: number[]; targetNumber: number } {
  return {
    tiles: generateTiles(),
    targetNumber: generateTargetNumber(),
  };
}

// =============================================================================
// DATE UTILITIES
// =============================================================================

/**
 * Get Daily Date Key
 *
 * Returns today's date at midnight UTC as a Date object.
 * Used to create a unique key for daily challenges.
 *
 * IMPORTANT: Uses UTC to ensure the same challenge is served globally
 * regardless of user timezone. The challenge "day" starts at midnight UTC.
 *
 * @returns A Date object representing today at 00:00:00 UTC
 *
 * @example
 * const today = getDailyDateKey();
 * // Date object for 2024-01-15T00:00:00.000Z
 */
export function getDailyDateKey(): Date {
  const now = new Date();
  // Create a new Date at midnight UTC using the current UTC date components
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate Frame Rules
 *
 * Checks if a frame follows the game rules for valid challenges.
 * Used to validate manually-created challenges from the admin interface.
 *
 * VALIDATION RULES:
 * 1. Must have exactly 6 tiles
 * 2. All tiles must be positive integers
 * 3. No more than 2 tiles can be greater than 10 (large numbers)
 * 4. Target must be between 101 and 999 (inclusive)
 *
 * @param tiles - Array of tile numbers to validate
 * @param targetNumber - Target number to validate
 * @returns Object with valid boolean and optional error message
 *
 * @example
 * const result = validateFrame([25, 50, 1, 2, 3, 4], 500);
 * // { valid: true }
 *
 * const result = validateFrame([25, 50, 75, 100, 1, 2], 500);
 * // { valid: false, error: 'No more than 2 tiles can be greater than 10' }
 */
export function validateFrame(tiles: number[], targetNumber: number): { valid: boolean; error?: string } {
  // Rule 1: Must have exactly 6 tiles
  if (tiles.length !== 6) {
    return { valid: false, error: 'Must have exactly 6 tiles' };
  }

  // Rule 2: All tiles must be positive integers
  if (!tiles.every(t => Number.isInteger(t) && t > 0)) {
    return { valid: false, error: 'All tiles must be positive integers' };
  }

  // Rule 3: No more than 2 tiles can be greater than 10 (large numbers)
  const largeTiles = tiles.filter(t => t > 10);
  if (largeTiles.length > 2) {
    return { valid: false, error: 'No more than 2 tiles can be greater than 10' };
  }

  // Rule 4: Target must be between 101 and 999 (inclusive)
  if (!Number.isInteger(targetNumber) || targetNumber < 101 || targetNumber > 999) {
    return { valid: false, error: 'Target must be between 101 and 999' };
  }

  return { valid: true };
}

// =============================================================================
// UNIQUENESS FUNCTIONS
// =============================================================================

/**
 * Check Frame Uniqueness
 *
 * Determines if a tile/target combination has been used before.
 * This prevents duplicate challenges, which would be unfair to players
 * who might recognize a puzzle they've solved before.
 *
 * COMPARISON METHOD:
 * - Tiles are sorted before comparison (order doesn't matter)
 * - Both tiles and target must match for a duplicate
 * - Can exclude a specific frame ID (for updating existing frames)
 *
 * @param tiles - Array of tile numbers to check
 * @param targetNumber - Target number to check
 * @param excludeFrameId - Optional frame ID to exclude (for updates)
 * @returns true if the combination is unique, false if it exists
 *
 * @example
 * const isUnique = await isFrameUnique([1, 2, 3, 4, 25, 50], 500);
 * // true if this combination doesn't exist yet
 */
export async function isFrameUnique(tiles: number[], targetNumber: number, excludeFrameId?: string): Promise<boolean> {
  // Sort tiles for consistent comparison (order-independent)
  const sortedTiles = [...tiles].sort((a, b) => a - b);

  // Find all frames with the same target number (potential duplicates)
  // This is more efficient than loading all frames
  const frames = await prisma.frame.findMany({
    where: {
      targetNumber,
      // Optionally exclude a frame (for updates)
      ...(excludeFrameId && { id: { not: excludeFrameId } }),
    },
  });

  // Check each potential duplicate
  for (const frame of frames) {
    // Sort the existing frame's tiles for comparison
    const frameTilesSorted = [...frame.tiles].sort((a, b) => a - b);

    // Compare as JSON strings (simple deep equality)
    if (JSON.stringify(frameTilesSorted) === JSON.stringify(sortedTiles)) {
      return false; // Found a duplicate - not unique
    }
  }

  return true; // No duplicate found - is unique
}

/**
 * Generate Unique Frame
 *
 * Generates a frame that doesn't duplicate any existing frame.
 * Uses retry logic in case of (rare) collisions.
 *
 * @param maxAttempts - Maximum number of generation attempts (default: 100)
 * @returns A unique frame, or null if unable to generate one
 *
 * @example
 * const frame = await generateUniqueFrame();
 * if (frame) {
 *   // Use the frame
 * } else {
 *   // Handle failure (extremely rare)
 * }
 */
export async function generateUniqueFrame(maxAttempts = 100): Promise<{ tiles: number[]; targetNumber: number } | null> {
  // Try up to maxAttempts times to generate a unique frame
  for (let i = 0; i < maxAttempts; i++) {
    const frame = generateFrame();

    // Check if this combination already exists
    if (await isFrameUnique(frame.tiles, frame.targetNumber)) {
      return frame; // Found a unique one!
    }

    // Collision - try again (very rare given the number of possible combinations)
  }

  // Could not find a unique frame after maxAttempts
  // This should be extremely rare given:
  // - 899 possible targets (101-999)
  // - Many tile combinations
  return null;
}

// =============================================================================
// BULK GENERATION FUNCTIONS
// =============================================================================

/**
 * Ensure Year of Challenges Exists
 *
 * Pre-generates daily challenges for the next year (365+ days).
 * Called on server startup to ensure challenges are always available.
 *
 * WHY PRE-GENERATE:
 * 1. Avoids race conditions when multiple users request the daily challenge
 * 2. Ensures challenges are available even if generation fails
 * 3. Allows admins to preview and edit future challenges
 *
 * PROCESS:
 * 1. Calculate date range (today to one year from now)
 * 2. Find existing challenges in that range
 * 3. Generate missing challenges only
 *
 * @returns Object with counts of created and existing challenges
 *
 * @example
 * const { created, existing } = await ensureYearOfChallenges();
 * console.log(`Created ${created}, ${existing} already existed`);
 */
/**
 * Get the next daily challenge number by finding the latest named daily frame
 * before the given date and incrementing, or counting all daily frames before it.
 */
async function getNextDailyNumber(beforeDate: Date): Promise<number> {
  const latest = await prisma.frame.findFirst({
    where: { date: { not: null, lt: beforeDate }, name: { not: null } },
    orderBy: { date: 'desc' },
    select: { name: true },
  });

  if (latest?.name) {
    const match = latest.name.match(/Daily #(\d+)/);
    if (match) return parseInt(match[1]) + 1;
  }

  // No named daily before this date — count existing daily frames before it
  const count = await prisma.frame.count({ where: { date: { not: null, lt: beforeDate } } });
  return count + 1;
}

export async function ensureYearOfChallenges(startDate?: Date): Promise<{ created: number; existing: number }> {
  // Default start date is today at midnight UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const from = startDate ?? today;

  // Calculate one year from today (always anchor end date to today)
  const oneYearFromNow = new Date(today);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  // Find all existing challenges in the date range
  const existingChallenges = await prisma.frame.findMany({
    where: {
      date: {
        gte: from,
        lte: oneYearFromNow,
      },
    },
    select: { date: true },  // Only need the date to check existence
  });

  // Create a Set of existing dates for O(1) lookup
  // Convert to YYYY-MM-DD string format for comparison
  const existingDates = new Set(
    existingChallenges.map((c) => c.date!.toISOString().split('T')[0])
  );

  let created = 0;
  const currentDate = new Date(from);

  // Get the starting daily number (based on what exists before our start date)
  let nextDailyNumber = await getNextDailyNumber(from);

  // Iterate through each day in the range
  while (currentDate <= oneYearFromNow) {
    const dateKey = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Only create if a challenge doesn't exist for this date
    if (!existingDates.has(dateKey)) {
      // Generate a unique frame for this date
      const frame = await generateUniqueFrame();

      if (frame) {
        // Create the challenge in the database
        await prisma.frame.create({
          data: {
            date: new Date(dateKey + 'T00:00:00.000Z'),
            tiles: frame.tiles,
            targetNumber: frame.targetNumber,
            name: `Daily #${nextDailyNumber}`,
          },
        });
        created++;
        nextDailyNumber++;
      }
      // If generateUniqueFrame returns null, skip this date
      // (extremely rare, will be filled on next server restart)
    } else {
      // Existing frame for this date — still advance the counter
      nextDailyNumber++;
    }

    // Move to the next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    created,
    existing: existingDates.size,
  };
}
