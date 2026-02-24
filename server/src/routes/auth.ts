/**
 * =============================================================================
 * AUTHENTICATION ROUTES (routes/auth.ts)
 * =============================================================================
 *
 * This module handles all user authentication-related API endpoints including
 * registration, login, email verification, password management, and profile updates.
 *
 * AUTHENTICATION FLOW OVERVIEW:
 *
 * 1. REGISTRATION FLOW:
 *    - User submits email + password
 *    - Server validates input and creates user with emailVerified=false
 *    - Server generates verification token (24h expiry)
 *    - Verification link logged to console (email would be sent in production)
 *    - User clicks link to verify email
 *
 * 2. LOGIN FLOW:
 *    - User submits email + password
 *    - Server validates credentials
 *    - Server checks emailVerified status
 *    - Returns JWT token (7-day expiry) on success
 *
 * 3. PASSWORD RESET FLOW:
 *    - User requests reset via email
 *    - Server generates reset token (1h expiry)
 *    - Reset link logged to console (email would be sent in production)
 *    - User clicks link and submits new password
 *
 * SECURITY FEATURES:
 * - Passwords hashed with bcrypt (12 rounds)
 * - Cryptographically secure tokens for verification/reset
 * - Rate limiting recommended for production
 * - Email enumeration protection on certain endpoints
 *
 * @module server/routes/auth
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../db';
import { generateToken, requireAuth, AuthRequest } from '../middleware/auth';

// Create Express router instance
const router = Router();

/**
 * Get the frontend URL from the request's Origin header.
 * Falls back to FRONTEND_URL env var or localhost.
 */
function getFrontendUrl(req: Request): string {
  const origin = req.get('origin') || req.get('referer');
  if (origin) {
    // Strip trailing slash and any path from referer
    try {
      const url = new URL(origin);
      return `${url.protocol}//${url.host}`;
    } catch {
      // ignore parse errors
    }
  }
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate Cryptographically Secure Verification Token
 *
 * Creates a random 64-character hex string using crypto.randomBytes().
 * This provides 256 bits of entropy, making tokens practically impossible to guess.
 *
 * Used for:
 * - Email verification tokens (24h expiry)
 * - Password reset tokens (1h expiry)
 *
 * @returns A 64-character hex string token
 */
function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// =============================================================================
// REGISTRATION ENDPOINT
// =============================================================================

/**
 * POST /api/auth/register
 *
 * Creates a new user account with email verification required.
 *
 * REQUEST BODY:
 * {
 *   email: string (required) - User's email address
 *   password: string (required) - Minimum 6 characters
 *   name: string (optional) - User's display name
 * }
 *
 * RESPONSE (201 Created):
 * {
 *   message: "Account created. Please check your email to verify your account.",
 *   requiresVerification: true
 * }
 *
 * ERRORS:
 * - 400: Missing email/password, password too short, or email already registered
 * - 500: Server error during registration
 *
 * PROCESS:
 * 1. Validate input (email, password length)
 * 2. Check for existing user with same email
 * 3. Hash password with bcrypt (12 rounds for security)
 * 4. Create user with emailVerified=false
 * 5. Generate and store verification token (24h expiry)
 * 6. Log verification link to console (would email in production)
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate password strength (minimum 6 characters)
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if a user with this email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash the password using bcrypt with cost factor of 12
    // Higher cost = more secure but slower (12 is a good balance)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the user record in the database
    // emailVerified starts as false - user must verify via email link
    const user = await prisma.user.create({
      data: {
        email,
        hashedPassword,
        name,
        emailVerified: false,
      },
    });

    // Generate a verification token with 24-hour expiration
    const token = generateVerificationToken();
    await prisma.verificationToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Log the verification link to console
    // TODO: In production, send this via email service (e.g., SendGrid, SES)
    const verificationLink = `${getFrontendUrl(req)}/verify?token=${token}`;
    console.log('\n========================================');
    console.log('EMAIL VERIFICATION LINK (dev mode):');
    console.log(verificationLink);
    console.log('========================================\n');

    // Return success - user must verify email before logging in
    res.status(201).json({
      message: 'Account created. Please check your email to verify your account.',
      requiresVerification: true,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// =============================================================================
// EMAIL VERIFICATION ENDPOINT
// =============================================================================

/**
 * POST /api/auth/verify
 *
 * Verifies a user's email address and logs them in.
 *
 * REQUEST BODY:
 * {
 *   token: string (required) - The verification token from the email link
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   message: "Email verified successfully",
 *   token: "<jwt_token>",
 *   user: { id, email, name }
 * }
 *
 * ERRORS:
 * - 400: Missing token, invalid token, or expired token
 * - 500: Server error during verification
 *
 * PROCESS:
 * 1. Look up the token in the database
 * 2. Check if token has expired
 * 3. Mark user as verified
 * 4. Delete the used token (one-time use)
 * 5. Generate JWT and return with user info
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    // Validate token is provided
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Look up the token in the database, including the user
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    // Token not found - could be invalid or already used
    if (!verificationToken) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    // Check if token has expired (24h from creation)
    if (verificationToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    // Mark the user's email as verified
    const user = await prisma.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: true },
    });

    // Delete the used token (one-time use security)
    await prisma.verificationToken.delete({
      where: { id: verificationToken.id },
    });

    // Generate a JWT token and log the user in automatically
    const authToken = generateToken(user.id);

    res.json({
      message: 'Email verified successfully',
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// =============================================================================
// RESEND VERIFICATION EMAIL ENDPOINT
// =============================================================================

/**
 * POST /api/auth/resend-verification
 *
 * Resends the email verification link for an unverified user.
 *
 * REQUEST BODY:
 * {
 *   email: string (required) - The user's email address
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   message: "If an account exists, a verification email has been sent."
 * }
 *
 * ERRORS:
 * - 400: Email already verified
 * - 500: Server error
 *
 * SECURITY:
 * - Returns same message whether or not email exists (prevents enumeration)
 * - Deletes old tokens before creating new one
 */
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // User not found - return generic message to prevent email enumeration
    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'If an account exists, a verification email has been sent.' });
    }

    // User already verified
    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Delete any existing verification tokens for this user
    // (Invalidates old links for security)
    await prisma.verificationToken.deleteMany({
      where: { userId: user.id },
    });

    // Create a new verification token
    const token = generateVerificationToken();
    await prisma.verificationToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Log the verification link
    const verificationLink = `${getFrontendUrl(req)}/verify?token=${token}`;
    console.log('\n========================================');
    console.log('EMAIL VERIFICATION LINK (dev mode):');
    console.log(verificationLink);
    console.log('========================================\n');

    res.json({ message: 'If an account exists, a verification email has been sent.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// =============================================================================
// LOGIN ENDPOINT
// =============================================================================

/**
 * POST /api/auth/login
 *
 * Authenticates a user and returns a JWT token.
 *
 * REQUEST BODY:
 * {
 *   email: string (required) - User's email address
 *   password: string (required) - User's password
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   token: "<jwt_token>",
 *   user: { id, email, name }
 * }
 *
 * ERRORS:
 * - 400: Missing email or password
 * - 401: Invalid credentials (wrong email or password)
 * - 403: Email not verified yet
 * - 500: Server error
 *
 * SECURITY:
 * - Uses bcrypt.compare() for timing-safe password comparison
 * - Same error message for wrong email vs wrong password (prevents enumeration)
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Look up the user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Use same error as wrong password to prevent email enumeration
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare the provided password with the stored hash
    // bcrypt.compare() is timing-safe to prevent timing attacks
    const validPassword = await bcrypt.compare(password, user.hashedPassword);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if the user has verified their email
    // This prevents login until email is confirmed
    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Please verify your email before logging in',
        requiresVerification: true,
      });
    }

    // Generate JWT token (7-day expiry)
    const token = generateToken(user.id);

    // Return token and user info
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// =============================================================================
// FORGOT PASSWORD ENDPOINT
// =============================================================================

/**
 * POST /api/auth/forgot-password
 *
 * Initiates the password reset flow by generating a reset token.
 *
 * REQUEST BODY:
 * {
 *   email: string (required) - The user's email address
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   message: "If an account exists with this email, a password reset link has been sent."
 * }
 *
 * SECURITY:
 * - Returns same message whether or not email exists (prevents enumeration)
 * - Deletes old reset tokens before creating new one
 * - Reset token expires in 1 hour (shorter than verification for security)
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Always return the same response to prevent email enumeration
    const successMessage = 'If an account exists with this email, a password reset link has been sent.';

    const user = await prisma.user.findUnique({ where: { email } });

    // User not found - return generic message
    if (!user) {
      return res.json({ message: successMessage });
    }

    // Delete any existing password reset tokens for this user
    // (Invalidates old reset links)
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new token with 1-hour expiration (shorter than verification)
    const token = generateVerificationToken();
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Log reset link to console (would email in production)
    const resetLink = `${getFrontendUrl(req)}/reset-password?token=${token}`;
    console.log('\n========================================');
    console.log('PASSWORD RESET LINK (dev mode):');
    console.log(resetLink);
    console.log('========================================\n');

    res.json({ message: successMessage });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// =============================================================================
// RESET PASSWORD ENDPOINT
// =============================================================================

/**
 * POST /api/auth/reset-password
 *
 * Resets the user's password using a valid reset token.
 *
 * REQUEST BODY:
 * {
 *   token: string (required) - The reset token from the email link
 *   newPassword: string (required) - The new password (min 6 chars)
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   message: "Password has been reset successfully"
 * }
 *
 * ERRORS:
 * - 400: Missing token/password, password too short, invalid/expired token
 * - 500: Server error
 *
 * PROCESS:
 * 1. Validate token and new password
 * 2. Look up the reset token
 * 3. Check if token has expired
 * 4. Hash the new password
 * 5. Update user's password
 * 6. Delete the used token
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    // Validate required fields
    if (!token) {
      return res.status(400).json({ error: 'Reset token is required' });
    }

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Look up the reset token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    // Token not found
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check if token has expired (1 hour)
    if (resetToken.expiresAt < new Date()) {
      // Delete the expired token
      await prisma.passwordResetToken.delete({
        where: { id: resetToken.id },
      });
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update the user's password
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { hashedPassword },
    });

    // Delete the used token (one-time use)
    await prisma.passwordResetToken.delete({
      where: { id: resetToken.id },
    });

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// =============================================================================
// GET CURRENT USER ENDPOINT
// =============================================================================

/**
 * GET /api/auth/me
 *
 * Returns the currently authenticated user's profile information.
 * Requires authentication via JWT token.
 *
 * AUTHORIZATION:
 * Authorization: Bearer <jwt_token>
 *
 * RESPONSE (200 OK):
 * {
 *   user: {
 *     id: string,
 *     email: string,
 *     name: string | null,
 *     emailVerified: boolean,
 *     createdAt: string (ISO date)
 *   }
 * }
 *
 * ERRORS:
 * - 401: Not authenticated (from requireAuth middleware)
 * - 404: User not found
 * - 500: Server error
 */
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Fetch user from database using ID from JWT
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// =============================================================================
// UPDATE PROFILE ENDPOINT
// =============================================================================

/**
 * PATCH /api/auth/me
 *
 * Updates the authenticated user's profile (currently only name).
 * Requires authentication via JWT token.
 *
 * REQUEST BODY:
 * {
 *   name: string | null - The user's display name
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   user: { id, email, name, emailVerified, createdAt }
 * }
 *
 * ERRORS:
 * - 401: Not authenticated
 * - 500: Server error
 */
router.patch('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    // Update the user's name (null clears the name)
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { name: name || null },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    res.json({ user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// =============================================================================
// CHANGE PASSWORD ENDPOINT
// =============================================================================

/**
 * POST /api/auth/change-password
 *
 * Changes the authenticated user's password.
 * Requires authentication and current password verification.
 *
 * REQUEST BODY:
 * {
 *   currentPassword: string (required) - The user's current password
 *   newPassword: string (required) - The new password (min 6 chars)
 * }
 *
 * RESPONSE (200 OK):
 * {
 *   message: "Password changed successfully"
 * }
 *
 * ERRORS:
 * - 400: Missing fields or password too short
 * - 401: Current password is incorrect
 * - 404: User not found
 * - 500: Server error
 */
router.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Fetch the user to get their current password hash
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify the current password
    const validPassword = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash and save the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.userId },
      data: { hashedPassword },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
