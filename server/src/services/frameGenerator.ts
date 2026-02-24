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
 * This implementation uses 2 large + 4 small numbers by default.
 * The TV show allows players to choose their mix, but we use a fixed formula.
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
 * Default selection: 2 large numbers + 4 small numbers, shuffled.
 *
 * PROCESS:
 * 1. Pick 2 large numbers WITHOUT replacement (no duplicates)
 * 2. Pick 4 small numbers WITH replacement (duplicates allowed)
 * 3. Shuffle the combined array
 *
 * @returns An array of 6 numbers in random order
 *
 * @example
 * const tiles = generateTiles(); // e.g., [7, 25, 3, 100, 5, 2]
 */
export function generateTiles(): number[] {
  const tiles: number[] = [];

  // Step 1: Pick 2 large numbers WITHOUT replacement
  // Create a copy of the pool so we can remove selected numbers
  const largePool = [...LARGE_NUMBERS];
  for (let i = 0; i < 2; i++) {
    // Pick a random index from remaining large numbers
    const index = Math.floor(Math.random() * largePool.length);
    // Remove and add to tiles (splice returns an array, take first element)
    tiles.push(largePool.splice(index, 1)[0]);
  }

  // Step 2: Pick 4 small numbers WITHOUT replacement from the full pool
  // The TV show deck has exactly 2 of each small number (1-10), so
  // the same number can appear at most twice
  const smallPool = [...SMALL_NUMBERS, ...SMALL_NUMBERS]; // Two of each: 1,1,2,2,...,10,10
  for (let i = 0; i < 4; i++) {
    const index = Math.floor(Math.random() * smallPool.length);
    tiles.push(smallPool.splice(index, 1)[0]);
  }

  // Step 3: Shuffle the tiles using Fisher-Yates algorithm
  // This ensures random presentation order (large numbers aren't always first)
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; // Swap
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
export async function ensureYearOfChallenges(): Promise<{ created: number; existing: number }> {
  // Get today at midnight UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Calculate one year from today
  const oneYearFromNow = new Date(today);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  // Find all existing challenges in the date range
  const existingChallenges = await prisma.frame.findMany({
    where: {
      date: {
        gte: today,
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
  const currentDate = new Date(today);

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
            // isManual defaults to false (auto-generated)
          },
        });
        created++;
      }
      // If generateUniqueFrame returns null, skip this date
      // (extremely rare, will be filled on next server restart)
    }

    // Move to the next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    created,
    existing: existingDates.size,
  };
}
