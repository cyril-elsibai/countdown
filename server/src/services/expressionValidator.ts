// Validates that an expression only uses available tiles and each tile at most once
// Returns the result if valid, or an error message

interface ValidationResult {
  valid: boolean;
  result?: number;
  error?: string;
}

// Extract numbers from an expression like "25 + 50 * 3"
function extractNumbers(expression: string): number[] {
  const matches = expression.match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

// Check if the used numbers are a valid subset of available tiles
function validateTileUsage(usedNumbers: number[], availableTiles: number[]): boolean {
  const tilesCopy = [...availableTiles];

  for (const num of usedNumbers) {
    const index = tilesCopy.indexOf(num);
    if (index === -1) {
      return false; // Number not available
    }
    tilesCopy.splice(index, 1); // Remove used tile
  }

  return true;
}

// Safely evaluate a mathematical expression
// Only allows: numbers, +, -, *, /, parentheses, spaces
function safeEvaluate(expression: string): number | null {
  // Validate the expression contains only allowed characters
  if (!/^[\d\s+\-*/().]+$/.test(expression)) {
    return null;
  }

  // Additional safety: check for dangerous patterns
  if (/[a-zA-Z_$]/.test(expression)) {
    return null;
  }

  try {
    // Use Function constructor for safer evaluation than eval
    // This still executes code, but we've validated the input
    const result = new Function(`return (${expression})`)();

    if (typeof result !== 'number' || !isFinite(result)) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

export function validateExpression(
  expression: string,
  availableTiles: number[],
  targetNumber: number
): ValidationResult {
  if (!expression || expression.trim() === '') {
    return { valid: false, error: 'Expression is empty' };
  }

  // Extract and validate tile usage
  const usedNumbers = extractNumbers(expression);

  if (usedNumbers.length === 0) {
    return { valid: false, error: 'No numbers found in expression' };
  }

  if (!validateTileUsage(usedNumbers, availableTiles)) {
    return { valid: false, error: 'Invalid tile usage - numbers must come from available tiles' };
  }

  // Evaluate the expression
  const result = safeEvaluate(expression);

  if (result === null) {
    return { valid: false, error: 'Invalid expression syntax' };
  }

  // Check if result matches target (allowing for floating point in intermediate steps)
  const roundedResult = Math.round(result);
  const solved = roundedResult === targetNumber;

  return {
    valid: true,
    result: roundedResult,
    error: solved ? undefined : `Result ${roundedResult} does not match target ${targetNumber}`,
  };
}
