/**
 * =============================================================================
 * AUTHENTICATION MIDDLEWARE (auth.ts)
 * =============================================================================
 *
 * This module provides JWT-based authentication middleware and utilities
 * for protecting API routes and managing user authentication state.
 *
 * AUTHENTICATION FLOW:
 * 1. User logs in via /api/auth/login
 * 2. Server validates credentials and returns a JWT token
 * 3. Client stores token in localStorage
 * 4. Client sends token in Authorization header for subsequent requests
 * 5. Middleware validates token and attaches userId to request
 *
 * JWT TOKEN STRUCTURE:
 * - Payload: { userId: string }
 * - Expiration: 7 days
 * - Algorithm: HS256 (default)
 *
 * SECURITY CONSIDERATIONS:
 * - JWT_SECRET should be set via environment variable in production
 * - Tokens expire after 7 days, requiring re-login
 * - Token validation failures return 401 Unauthorized
 *
 * @module server/middleware/auth
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * JWT Secret Key
 *
 * The secret used to sign and verify JWT tokens.
 * IMPORTANT: In production, always set JWT_SECRET as an environment variable!
 * The default 'dev-secret' is only for local development.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

/**
 * AuthRequest Interface
 *
 * Extends the standard Express Request type to include the userId field.
 * This is populated by the authentication middleware after validating the JWT.
 *
 * @property userId - The authenticated user's ID (undefined if not authenticated)
 */
export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Require Authentication Middleware
 *
 * This middleware enforces authentication on protected routes.
 * It validates the JWT token from the Authorization header and
 * extracts the userId for use in route handlers.
 *
 * USAGE:
 * ```typescript
 * router.get('/protected', requireAuth, (req: AuthRequest, res) => {
 *   // req.userId is guaranteed to be defined here
 *   const userId = req.userId;
 * });
 * ```
 *
 * EXPECTED HEADER FORMAT:
 * Authorization: Bearer <jwt_token>
 *
 * RESPONSES:
 * - 401: No token provided or token is invalid/expired
 * - Continues: Token is valid, userId attached to request
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Extract the Authorization header
  const authHeader = req.headers.authorization;

  // Parse the Bearer token from the header
  // Expected format: "Bearer <token>"
  const token = authHeader?.split(' ')[1]; // "Bearer <token>"

  // No token provided - return unauthorized
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Verify the token signature and decode the payload
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    // Attach the userId to the request for use in route handlers
    req.userId = decoded.userId;

    // Continue to the next middleware/route handler
    next();
  } catch {
    // Token is invalid (expired, tampered, malformed, etc.)
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Optional Authentication Middleware
 *
 * This middleware allows both authenticated and anonymous requests.
 * If a valid token is present, the userId is attached to the request.
 * If no token or an invalid token is present, the request continues
 * without authentication (userId remains undefined).
 *
 * USE CASES:
 * - Endpoints that behave differently for logged-in vs anonymous users
 * - The daily challenge endpoint that tracks attempts for logged-in users
 *
 * USAGE:
 * ```typescript
 * router.get('/daily', optionalAuth, (req: AuthRequest, res) => {
 *   if (req.userId) {
 *     // User is logged in - track their attempt
 *   } else {
 *     // Anonymous user - just return the challenge
 *   }
 * });
 * ```
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Extract the Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  // If a token is present, try to validate it
  if (token) {
    try {
      // Verify and decode the token
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      req.userId = decoded.userId;
    } catch {
      // Invalid token - silently continue without authentication
      // This allows the request to proceed as an anonymous user
    }
  }

  // Always continue to the next middleware/route handler
  next();
}

/**
 * Generate JWT Token
 *
 * Creates a new JWT token for an authenticated user.
 * This is called after successful login or email verification.
 *
 * TOKEN PROPERTIES:
 * - Contains only the userId in the payload (minimal claims)
 * - Expires in 7 days
 * - Signed with the server's JWT_SECRET
 *
 * @param userId - The user's database ID
 * @returns A signed JWT token string
 *
 * @example
 * const token = generateToken(user.id);
 * res.json({ token, user: { id: user.id, email: user.email } });
 */
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}
