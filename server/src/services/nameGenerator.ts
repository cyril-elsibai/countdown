/**
 * =============================================================================
 * NAME GENERATOR SERVICE (services/nameGenerator.ts)
 * =============================================================================
 *
 * Generates friendly two-word names (Adjective + Noun) for randomly created
 * frames so players can reference and share them by name.
 *
 * POOL SIZE:
 * 200 adjectives × 200 nouns = 40,000 unique combinations.
 *
 * COLLISION HANDLING:
 * generateUniqueName() retries up to 20 times if a candidate name is already
 * taken, then returns null. At 50% pool utilization (~20,000 names used)
 * the expected number of retries per generation is only 2, so performance
 * stays well within acceptable bounds.
 *
 * MONITORING:
 * checkNameUtilization() logs a warning when utilization exceeds 50%.
 * Call this from the daily scheduled job. When it fires, expand the wordlists
 * in this file (add more adjectives and/or nouns).
 *
 * @module server/services/nameGenerator
 */

import { prisma } from '../db';

// =============================================================================
// WORDLISTS
// =============================================================================

const ADJECTIVES: readonly string[] = [
  // Colors & materials (30)
  'golden', 'silver', 'crimson', 'azure', 'cobalt', 'amber', 'jade', 'iron',
  'steel', 'copper', 'bronze', 'marble', 'crystal', 'onyx', 'opal', 'ivory',
  'scarlet', 'violet', 'indigo', 'emerald', 'sapphire', 'coral', 'obsidian',
  'quartz', 'garnet', 'topaz', 'ruby', 'turquoise', 'ebony', 'alabaster',
  // Nature & weather (24)
  'arctic', 'alpine', 'lunar', 'solar', 'stellar', 'cosmic', 'misty',
  'stormy', 'frosty', 'frozen', 'molten', 'sandy', 'rocky', 'mossy',
  'foggy', 'cloudy', 'sunny', 'breezy', 'rainy', 'snowy', 'fiery', 'dusty', 'icy', 'leafy',
  // Character traits (40)
  'swift', 'bold', 'calm', 'keen', 'brave', 'bright', 'clever', 'fierce',
  'gentle', 'noble', 'quiet', 'wild', 'free', 'proud', 'true', 'wise',
  'agile', 'daring', 'earnest', 'gallant', 'hardy', 'humble', 'jolly',
  'mighty', 'patient', 'plucky', 'serene', 'sincere', 'spirited', 'sturdy',
  'valiant', 'vigilant', 'worthy', 'zealous', 'cryptic', 'mystic', 'sacred',
  'ancient', 'primal', 'rugged',
  // Descriptors (30)
  'grand', 'vast', 'deep', 'tall', 'sharp', 'smooth', 'rough', 'rich',
  'rare', 'pure', 'dark', 'light', 'warm', 'cold', 'loud', 'still',
  'high', 'long', 'wide', 'slim', 'fast', 'slow', 'soft', 'hard',
  'thin', 'strong', 'small', 'large', 'young', 'tough',
  // Visual / light (30)
  'hollow', 'glowing', 'shining', 'gleaming', 'radiant', 'vibrant',
  'vivid', 'lively', 'brisk', 'cunning', 'crafty', 'silent', 'hidden',
  'distant', 'eternal', 'timeless', 'boundless', 'restless', 'fearless',
  'tireless', 'flawless', 'rustic', 'royal', 'regal', 'fair', 'sleek', 'nimble',
  'blazing', 'dazzling', 'sparkling',
  // Form & motion (30)
  'painted', 'crested', 'crowned', 'veiled', 'horned', 'winged',
  'scaled', 'spotted', 'striped', 'gilded', 'carved', 'twisted', 'woven',
  'forged', 'soaring', 'rushing', 'rising', 'drifting', 'floating',
  'wandering', 'burning', 'frosted', 'scorching', 'howling', 'surging',
  'tumbling', 'glimmering', 'smoldering', 'savage', 'charred',
  // Extra (16)
  'galloping', 'striking', 'blinding', 'piercing', 'rumbling', 'echoing',
  'shifting', 'swirling', 'glinting', 'winding', 'towering', 'creeping',
  'thundering', 'whirling', 'unbroken', 'hallowed',
];

const NOUNS: readonly string[] = [
  // Animals (50)
  'hawk', 'wolf', 'fox', 'bear', 'deer', 'raven', 'eagle', 'falcon', 'lion', 'tiger',
  'cobra', 'viper', 'crane', 'swan', 'lynx', 'otter', 'bison', 'elk', 'owl', 'finch',
  'heron', 'stork', 'jaguar', 'panther', 'badger', 'ferret', 'orca', 'dolphin', 'moose', 'caribou',
  'coyote', 'gecko', 'sparrow', 'robin', 'thrush', 'lark', 'kite', 'martin', 'hare', 'mole',
  'vole', 'toad', 'trout', 'salmon', 'pike', 'carp', 'pelican', 'toucan', 'macaw', 'puffin',
  // Landscape (40)
  'peak', 'vale', 'grove', 'ridge', 'cliff', 'crest', 'dune', 'glade', 'moor', 'fjord',
  'delta', 'gorge', 'basin', 'canyon', 'mesa', 'tundra', 'glacier', 'lagoon', 'marsh', 'reef',
  'atoll', 'shoal', 'bluff', 'hollow', 'ravine', 'cavern', 'grotto', 'tor', 'fen', 'heath',
  'knoll', 'mound', 'spire', 'summit', 'bank', 'shore', 'isle', 'cape', 'bay', 'ford',
  // Weather & elements (20)
  'storm', 'frost', 'ember', 'spark', 'ash', 'tide', 'gale', 'blizzard', 'torrent', 'squall',
  'thunder', 'lightning', 'aurora', 'monsoon', 'drought', 'tempest', 'cyclone', 'mist', 'haze', 'sleet',
  // Artifacts & objects (30)
  'blade', 'shield', 'crown', 'tower', 'lantern', 'compass', 'anchor', 'vessel', 'helm', 'forge',
  'gate', 'bridge', 'beacon', 'arrow', 'drum', 'horn', 'bell', 'wheel', 'key', 'vault',
  'staff', 'tome', 'ring', 'chain', 'lock', 'bolt', 'lever', 'cog', 'sail', 'mast',
  // Abstract concepts (30)
  'quest', 'honor', 'valor', 'spirit', 'legend', 'vision', 'echo', 'shadow', 'glory', 'grace',
  'dream', 'hope', 'dawn', 'song', 'tale', 'lore', 'path', 'trail', 'mark', 'vow',
  'oath', 'pact', 'bond', 'rift', 'void', 'nexus', 'rune', 'sigil', 'omen', 'portent',
  // Elements & materials (20)
  'flame', 'blaze', 'smoke', 'shard', 'stone', 'flint', 'thorn', 'briar', 'root', 'branch',
  'bough', 'bark', 'leaf', 'petal', 'bloom', 'seed', 'spore', 'moss', 'fern', 'reed',
  // Sound & rhythm (10)
  'current', 'wave', 'surge', 'pulse', 'beat', 'chord', 'note', 'chime', 'toll', 'knell',
];

// =============================================================================
// CONSTANTS
// =============================================================================

/** Total number of unique name combinations available. */
export const TOTAL_NAME_COMBINATIONS = ADJECTIVES.length * NOUNS.length;

/** Utilization fraction at which a warning is logged. */
const UTILIZATION_WARNING_THRESHOLD = 0.5;

// =============================================================================
// GENERATION
// =============================================================================

/**
 * Pick a random adjective+noun pair and return it as a title-cased string.
 * Does NOT check for uniqueness.
 */
function generateCandidateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj.charAt(0).toUpperCase()}${adj.slice(1)} ${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
}

/**
 * Generate a name that isn't already used by any frame in the database.
 *
 * Retries up to `maxAttempts` times on collision. At 50% pool utilization
 * the expected number of attempts is only 2, so this is always fast in practice.
 *
 * @param maxAttempts - Max retries before giving up (default 20)
 * @returns A unique name string, or null if all attempts collided
 */
export async function generateUniqueName(maxAttempts = 20): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const name = generateCandidateName();
    const existing = await prisma.frame.findUnique({ where: { name } });

    if (!existing) return name;

    if (attempt > 5) {
      console.warn(`Frame name collision (attempt ${attempt}): "${name}" already taken`);
    }
  }

  console.error(
    `[NAME GENERATOR] Failed to generate a unique frame name after ${maxAttempts} attempts. ` +
    `The name pool may be nearly exhausted — expand the wordlists in nameGenerator.ts.`
  );
  return null;
}

// =============================================================================
// MONITORING
// =============================================================================

/**
 * Check how much of the name pool has been used and warn if over the threshold.
 * Call this from the daily scheduled job.
 */
export async function checkNameUtilization(): Promise<void> {
  const usedCount = await prisma.frame.count({
    where: { name: { not: null } },
  });

  const utilization = usedCount / TOTAL_NAME_COMBINATIONS;
  const percent = (utilization * 100).toFixed(1);

  console.log(
    `Frame name utilization: ${usedCount.toLocaleString()} / ${TOTAL_NAME_COMBINATIONS.toLocaleString()} (${percent}%)`
  );

  if (utilization >= UTILIZATION_WARNING_THRESHOLD) {
    console.warn(
      `[NAME POOL WARNING] Utilization has reached ${percent}% ` +
      `(${usedCount.toLocaleString()} of ${TOTAL_NAME_COMBINATIONS.toLocaleString()} combinations used). ` +
      `Expand the ADJECTIVES or NOUNS lists in server/src/services/nameGenerator.ts ` +
      `before the pool is exhausted.`
    );
  }
}
