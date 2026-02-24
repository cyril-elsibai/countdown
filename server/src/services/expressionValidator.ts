/**
 * =============================================================================
 * EXPRESSION VALIDATOR SERVICE (services/expressionValidator.ts)
 * =============================================================================
 *
 * This service validates and evaluates mathematical expressions submitted as
 * solutions to the Countdown Numbers game.
 *
 * PURPOSE:
 * When a player submits a solution, we need to verify that:
 * 1. The expression uses only the available tiles
 * 2. Each tile is used at most once
 * 3. The expression is syntactically valid
 * 4. The result matches the target number
 *
 * SECURITY CONSIDERATIONS:
 * - Expressions could potentially contain malicious code
 * - We validate the input strictly before any evaluation
 * - Only numbers, operators, parentheses, and spaces are allowed
 * - Uses Function constructor instead of eval() for slightly safer evaluation
 *
 * NOTE: This validator is currently not used in the main flow (the frontend
 * calculates results locally), but is available for server-side validation
 * if needed in the future.
 *
 * @module server/services/expressionValidator
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Validation Result Interface
 *
 * Represents the outcome of validating an expression.
 *
 * @property valid - Whether the expression passed all validation checks
 * @property result - The calculated result (if valid)
 * @property error - Error message describing why validation failed
 */
interface ValidationResult {
  valid: boolean;
  result?: number;
  error?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract Numbers from Expression
 *
 * Parses an expression string and extracts all numeric values.
 * Used to determine which tiles were used in the solution.
 *
 * @param expression - The mathematical expression (e.g., "25 + 50 * 3")
 * @returns Array of numbers found in the expression
 *
 * @example
 * extractNumbers("25 + 50 * 3")  // [25, 50, 3]
 * extractNumbers("(100 - 25) / 5")  // [100, 25, 5]
 */
function extractNumbers(expression: string): number[] {
  // Match sequences of digits (integers only)
  const matches = expression.match(/\d+/g);
  // Convert matched strings to numbers, or return empty array if no matches
  return matches ? matches.map(Number) : [];
}

/**
 * Validate Tile Usage
 *
 * Checks if the numbers used in an expression are a valid subset of
 * the available tiles, with each tile used at most once.
 *
 * ALGORITHM:
 * 1. Create a copy of the available tiles array
 * 2. For each used number, find it in the tiles copy and remove it
 * 3. If any number is not found, the usage is invalid
 *
 * @param usedNumbers - Numbers extracted from the expression
 * @param availableTiles - The tiles available for this puzzle
 * @returns true if all numbers come from available tiles, each used once
 *
 * @example
 * // Tiles: [25, 50, 1, 2, 3, 4]
 * validateTileUsage([25, 50, 3], [25, 50, 1, 2, 3, 4])  // true
 * validateTileUsage([25, 25], [25, 50, 1, 2, 3, 4])     // false (25 used twice)
 * validateTileUsage([100], [25, 50, 1, 2, 3, 4])         // false (100 not available)
 */
function validateTileUsage(usedNumbers: number[], availableTiles: number[]): boolean {
  // Work with a copy so we don't modify the original
  const tilesCopy = [...availableTiles];

  for (const num of usedNumbers) {
    // Find this number in the available tiles
    const index = tilesCopy.indexOf(num);

    if (index === -1) {
      // Number not found - either not available or already used
      return false; // Number not available
    }

    // Remove the used tile so it can't be used again
    tilesCopy.splice(index, 1); // Remove used tile
  }

  return true;
}

/**
 * Safely Evaluate Mathematical Expression
 *
 * Evaluates a mathematical expression string and returns the result.
 * Includes multiple safety checks to prevent code injection.
 *
 * SECURITY MEASURES:
 * 1. Allowlist validation: Only digits, operators, parentheses, spaces, and dots
 * 2. No letters or special characters (prevents variable access, function calls)
 * 3. Uses Function constructor instead of eval() (slightly safer context)
 * 4. Validates result is a finite number
 *
 * SUPPORTED OPERATIONS:
 * - Addition (+)
 * - Subtraction (-)
 * - Multiplication (*)
 * - Division (/)
 * - Parentheses for grouping
 *
 * @param expression - The expression to evaluate
 * @returns The numeric result, or null if evaluation fails
 *
 * @example
 * safeEvaluate("25 + 50")        // 75
 * safeEvaluate("(100 - 25) / 5") // 15
 * safeEvaluate("console.log")    // null (contains letters)
 * safeEvaluate("1/0")            // null (Infinity is not finite)
 */
function safeEvaluate(expression: string): number | null {
  // SECURITY CHECK 1: Only allow numbers, operators, parentheses, spaces, and dots
  // This regex allowlist prevents any code injection attempts
  if (!/^[\d\s+\-*/().]+$/.test(expression)) {
    return null;
  }

  // SECURITY CHECK 2: Additional check for any alphabetic characters
  // This is redundant with the above but provides defense in depth
  if (/[a-zA-Z_$]/.test(expression)) {
    return null;
  }

  try {
    // Evaluate the expression using Function constructor
    // This is slightly safer than eval() as it doesn't have access to local scope
    // However, we've already validated the input is safe
    const result = new Function(`return (${expression})`)();

    // Validate the result is a usable number
    if (typeof result !== 'number' || !isFinite(result)) {
      return null;
    }

    return result;
  } catch {
    // Expression threw an error (e.g., syntax error, division by zero in some contexts)
    return null;
  }
}

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

/**
 * Validate Expression
 *
 * The main validation function that checks a submitted solution against
 * the game rules and calculates whether it reaches the target.
 *
 * VALIDATION STEPS:
 * 1. Check expression is not empty
 * 2. Extract numbers used in the expression
 * 3. Verify numbers come from available tiles (each used at most once)
 * 4. Safely evaluate the expression
 * 5. Check if the result matches the target (with rounding for float tolerance)
 *
 * @param expression - The mathematical expression submitted by the player
 * @param availableTiles - The 6 tiles available for this puzzle
 * @param targetNumber - The target number to reach
 * @returns ValidationResult with valid status, result, and any error message
 *
 * @example
 * // Tiles: [25, 50, 1, 2, 3, 4], Target: 75
 * validateExpression("25 + 50", [25, 50, 1, 2, 3, 4], 75)
 * // { valid: true, result: 75 }
 *
 * validateExpression("25 + 50", [25, 50, 1, 2, 3, 4], 100)
 * // { valid: true, result: 75, error: "Result 75 does not match target 100" }
 *
 * validateExpression("100 + 1", [25, 50, 1, 2, 3, 4], 101)
 * // { valid: false, error: "Invalid tile usage - numbers must come from available tiles" }
 */
export function validateExpression(
  expression: string,
  availableTiles: number[],
  targetNumber: number
): ValidationResult {
  // Step 1: Check for empty expression
  if (!expression || expression.trim() === '') {
    return { valid: false, error: 'Expression is empty' };
  }

  // Step 2: Extract all numbers from the expression
  const usedNumbers = extractNumbers(expression);

  // Check that at least one number was used
  if (usedNumbers.length === 0) {
    return { valid: false, error: 'No numbers found in expression' };
  }

  // Step 3: Validate tile usage
  if (!validateTileUsage(usedNumbers, availableTiles)) {
    return { valid: false, error: 'Invalid tile usage - numbers must come from available tiles' };
  }

  // Step 4: Safely evaluate the expression
  const result = safeEvaluate(expression);

  // Check evaluation succeeded
  if (result === null) {
    return { valid: false, error: 'Invalid expression syntax' };
  }

  // Step 5: Check if result matches target
  // Round to handle floating point precision issues (e.g., 3.9999999 should be 4)
  const roundedResult = Math.round(result);
  const solved = roundedResult === targetNumber;

  return {
    valid: true,
    result: roundedResult,
    // Include error message if result doesn't match target
    // (still "valid" expression, just not a winning solution)
    error: solved ? undefined : `Result ${roundedResult} does not match target ${targetNumber}`,
  };
}
