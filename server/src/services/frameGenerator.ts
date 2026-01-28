// Number pools matching the TV show rules
const SMALL_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LARGE_NUMBERS = [25, 50, 75, 100];

// Generates a random target number between 101 and 999
export function generateTargetNumber(): number {
  return Math.floor(Math.random() * 899) + 101;
}

// Generates 6 tiles: typically 2 large and 4 small, but can vary
export function generateTiles(): number[] {
  const tiles: number[] = [];

  // Pick 2 large numbers (without replacement)
  const largePool = [...LARGE_NUMBERS];
  for (let i = 0; i < 2; i++) {
    const index = Math.floor(Math.random() * largePool.length);
    tiles.push(largePool.splice(index, 1)[0]);
  }

  // Pick 4 small numbers (with replacement allowed, like the TV show)
  for (let i = 0; i < 4; i++) {
    const index = Math.floor(Math.random() * SMALL_NUMBERS.length);
    tiles.push(SMALL_NUMBERS[index]);
  }

  // Shuffle the tiles
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  return tiles;
}

// Generates a complete frame (tiles + target)
export function generateFrame(): { tiles: number[]; targetNumber: number } {
  return {
    tiles: generateTiles(),
    targetNumber: generateTargetNumber(),
  };
}

// Get the date key for daily challenges (YYYY-MM-DD in UTC)
export function getDailyDateKey(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
