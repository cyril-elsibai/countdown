/**
 * =============================================================================
 * API CLIENT (api.ts)
 * =============================================================================
 *
 * This module provides a centralized API client for all frontend-to-backend
 * communication. It handles authentication tokens, request formatting, and
 * provides type-safe interfaces for all API endpoints.
 *
 * ARCHITECTURE:
 * - All API calls go through the `request()` helper function
 * - JWT tokens are automatically included in requests
 * - Errors are thrown as Error objects with the server's error message
 *
 * TOKEN STORAGE:
 * - User tokens are stored in localStorage under 'token'
 * - Admin tokens are stored separately under 'admin_token'
 *
 * USAGE:
 * ```typescript
 * import { gameApi, authApi } from './api';
 *
 * // Get daily challenge
 * const response = await gameApi.getDaily();
 *
 * // Login
 * const { token, user } = await authApi.login(email, password);
 * ```
 *
 * @module client/api
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Base URL for all API requests.
 * Uses the same hostname as the frontend to support network access.
 * In production, this should be updated to the production server URL.
 */
const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001/api`;

// =============================================================================
// USER TOKEN MANAGEMENT
// =============================================================================

/**
 * Retrieves the stored authentication token.
 * Used internally by the request() function.
 *
 * @returns The JWT token string, or null if not logged in
 */
function getToken(): string | null {
  return localStorage.getItem('token');
}

/**
 * Stores the authentication token.
 * Called after successful login or email verification.
 *
 * @param token - The JWT token to store
 */
export function setToken(token: string): void {
  localStorage.setItem('token', token);
}

/**
 * Removes the authentication token.
 * Called on logout or when token is invalid.
 */
export function clearToken(): void {
  localStorage.removeItem('token');
}

/**
 * Checks if a user is currently logged in.
 * Note: This only checks if a token exists, not if it's valid.
 *
 * @returns true if a token is stored, false otherwise
 */
export function isLoggedIn(): boolean {
  return !!getToken();
}

// =============================================================================
// HTTP REQUEST HELPER
// =============================================================================

/**
 * Makes an authenticated HTTP request to the API.
 *
 * This is the core request function that:
 * - Adds the Content-Type header for JSON
 * - Includes the JWT token if available
 * - Parses the JSON response
 * - Throws an error if the response is not OK
 *
 * @param endpoint - The API endpoint (e.g., '/auth/login')
 * @param options - Fetch options (method, body, etc.)
 * @returns The parsed JSON response
 * @throws Error with server's error message on failure
 *
 * @example
 * const data = await request<{ user: User }>('/auth/me');
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Get the current auth token
  const token = getToken();

  // Build headers with JSON content type and optional auth token
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  // Make the request
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  // Parse the JSON response
  const data = await response.json();

  // Check for errors
  if (!response.ok) {
    // Throw an error with the server's message
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Represents a game frame (puzzle).
 */
export interface Frame {
  id: string;
  tiles: number[];      // Array of 6 number tiles
  targetNumber: number; // Target to reach (101-999)
  date?: string;        // ISO date string for daily challenges
  name?: string | null; // Friendly name for random frames (e.g. "Golden Fox")
}

/**
 * Represents a previous game result (shown if user already played).
 */
export interface PreviousResult {
  solved: boolean;        // Whether they solved it
  duration: number | null; // Time taken in seconds
  result: number | null;   // Their final result
}

/**
 * Response from GET /api/game/daily endpoint.
 */
export interface DailyResponse {
  frame: Frame;
  startedAt: string | null;       // When the attempt started (for timing)
  previousResult: PreviousResult | null; // Null if not played yet
}

/**
 * Response from POST /api/game/frame/:id/submit endpoint.
 */
export interface SubmitResponse {
  success: boolean;
  valid: boolean;
  result?: number;
  solved: boolean;
  error?: string;
}

/**
 * Basic user information.
 */
export interface User {
  id: string;
  email: string;
  name?: string;
}

/**
 * Response from successful authentication (login or verify).
 */
export interface AuthResponse {
  token: string;
  user: User;
}

// =============================================================================
// GAME API
// =============================================================================

/**
 * Game-related API endpoints.
 *
 * ENDPOINTS:
 * - getDaily() - Get today's daily challenge
 * - getRandom() - Generate a random frame (requires auth)
 * - getFrame(id) - Get a specific frame by ID
 * - submit(frameId, expression, duration, result) - Submit a solution
 */
export const gameApi = {
  /**
   * Gets today's daily challenge.
   *
   * For logged-in users:
   * - Creates a DailyAttempt record to track timing
   * - Returns previousResult if already played
   *
   * @returns The daily frame with timing information
   */
  getDaily: () => request<DailyResponse>('/game/daily'),

  /**
   * Generates a new random frame for practice.
   * Requires authentication.
   *
   * @returns A new random frame with timing information
   */
  getRandom: () => request<{ frame: Frame; startedAt: string }>('/game/random', { method: 'POST' }),

  /**
   * Gets a specific frame by its ID.
   * Used for sharing challenges with friends.
   *
   * @param id - The frame ID
   * @returns The requested frame
   */
  getFrame: (id: string) => request<{ frame: Frame }>(`/game/frame/${id}`),

  /**
   * Submits a solution attempt.
   *
   * @param frameId - The frame being solved
   * @param expression - The solution expression (e.g., "(25 + 50) * 4")
   * @param duration - Time taken in seconds
   * @param result - The calculated result
   * @returns Success status and whether the puzzle was solved
   */
  submit: (frameId: string, expression: string, duration: number, result: number) =>
    request<SubmitResponse>(`/game/frame/${frameId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ expression, duration, result }),
    }),

  /**
   * Starts playing a historical frame.
   * Similar to getDaily but for any frame by ID.
   * Requires authentication.
   *
   * @param frameId - The frame ID to play
   * @returns The frame with timing information
   */
  playHistoricalFrame: (frameId: string) =>
    request<PlayFrameResponse>(`/game/frame/${frameId}/play`),

  startFrame: (frameId: string) =>
    request<{ success: boolean }>(`/game/frame/${frameId}/start`, { method: 'POST' }),

  saveProgress: (frameId: string, duration: number, result: number) =>
    request<{ success: boolean }>(`/game/frame/${frameId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ duration, result }),
    }),
};

// =============================================================================
// AUTHENTICATION TYPES
// =============================================================================

/**
 * Response from registration endpoint.
 */
export interface RegisterResponse {
  message: string;
  requiresVerification: boolean;
}

/**
 * Response from email verification endpoint.
 */
export interface VerifyResponse {
  message: string;
  token: string;
  user: User;
}

// =============================================================================
// AUTHENTICATION API
// =============================================================================

/**
 * Authentication-related API endpoints.
 *
 * FLOW:
 * 1. register() - Create account, receive verification email
 * 2. verify() - Verify email, receive token and login
 * 3. login() - Authenticate and receive token
 *
 * PASSWORD RESET:
 * 1. forgotPassword() - Request reset email
 * 2. resetPassword() - Set new password with token
 */
export const authApi = {
  /**
   * Registers a new user account.
   * After registration, user must verify their email.
   *
   * @param email - User's email address
   * @param password - Password (minimum 6 characters)
   * @param name - Optional display name
   * @returns Success message
   */
  register: (email: string, password: string, name?: string) =>
    request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  /**
   * Authenticates a user and returns a JWT token.
   *
   * @param email - User's email address
   * @param password - User's password
   * @returns JWT token and user information
   */
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /**
   * Verifies a user's email address with a token.
   * On success, user is automatically logged in.
   *
   * @param token - The verification token from the email link
   * @returns JWT token and user information
   */
  verify: (token: string) =>
    request<VerifyResponse>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  /**
   * Resends the email verification link.
   *
   * @param email - User's email address
   * @returns Generic success message (doesn't reveal if email exists)
   */
  resendVerification: (email: string) =>
    request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /**
   * Initiates the password reset flow.
   * Sends a reset link to the user's email.
   *
   * @param email - User's email address
   * @returns Generic success message (doesn't reveal if email exists)
   */
  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /**
   * Resets the user's password using a reset token.
   *
   * @param token - The reset token from the email link
   * @param newPassword - The new password (minimum 6 characters)
   * @returns Success message
   */
  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),

  /**
   * Gets the current authenticated user's profile.
   * Requires authentication.
   *
   * @returns User profile information
   */
  me: () => request<{ user: User }>('/auth/me'),

  /**
   * Updates the current user's profile (name).
   * Requires authentication.
   *
   * @param name - The new display name
   * @returns Updated user information
   */
  updateProfile: (name: string) =>
    request<{ user: User }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  /**
   * Changes the current user's password.
   * Requires authentication and current password verification.
   *
   * @param currentPassword - The current password
   * @param newPassword - The new password (minimum 6 characters)
   * @returns Success message
   */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// =============================================================================
// FRIENDS TYPES
// =============================================================================

/**
 * Represents a friend relationship or request.
 */
export interface Friend {
  id: string;                        // Friendship record ID
  status: 'PENDING' | 'ACCEPTED';    // Relationship status
  direction: 'sent' | 'received';    // Who initiated the request
  user: User;                        // The other user in the relationship
  createdAt: string;                 // When the request was sent
}

// =============================================================================
// FRIENDS API
// =============================================================================

/**
 * Friend-related API endpoints.
 * All endpoints require authentication.
 *
 * FLOW:
 * 1. sendRequest() - Send request by email
 * 2. Other user sees request via list()
 * 3. acceptRequest() - Accept the request
 * 4. remove() - Either party can remove
 */
export const friendsApi = {
  /**
   * Lists all friend relationships and requests.
   *
   * @returns Array of all friendships (sent and received)
   */
  list: () => request<{ friends: Friend[] }>('/friends'),

  /**
   * Sends a friend request to another user.
   *
   * @param email - The email of the user to add
   * @returns The created friendship record
   */
  sendRequest: (email: string) =>
    request<{ friend: Friend }>('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /**
   * Accepts a pending friend request.
   * Only the receiver of a request can accept it.
   *
   * @param id - The friendship record ID
   * @returns The updated friendship record
   */
  acceptRequest: (id: string) =>
    request<{ friend: Friend }>(`/friends/${id}/accept`, {
      method: 'POST',
    }),

  /**
   * Removes a friend or cancels/declines a request.
   * Either party can call this.
   *
   * @param id - The friendship record ID
   * @returns Success message
   */
  remove: (id: string) =>
    request<{ message: string }>(`/friends/${id}`, {
      method: 'DELETE',
    }),
};

// =============================================================================
// ADMIN TOKEN MANAGEMENT
// =============================================================================

/**
 * Key used to store admin token in localStorage.
 * Separate from user token to allow both to be stored.
 */
const ADMIN_TOKEN_KEY = 'admin_token';

/**
 * Retrieves the stored admin token.
 */
function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

/**
 * Stores the admin token.
 */
export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

/**
 * Removes the admin token.
 */
export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/**
 * Checks if an admin is currently logged in.
 */
export function isAdminLoggedIn(): boolean {
  return !!getAdminToken();
}

// =============================================================================
// ADMIN REQUEST HELPER
// =============================================================================

/**
 * Makes an authenticated HTTP request using admin credentials.
 * Similar to request() but uses admin token instead of user token.
 *
 * @param endpoint - The API endpoint
 * @param options - Fetch options
 * @returns The parsed JSON response
 */
async function adminRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// =============================================================================
// ADMIN TYPES
// =============================================================================

/**
 * Represents a daily challenge with statistics.
 */
export interface Challenge {
  id: string;
  date: string;              // ISO date string
  name: string | null;       // e.g. "Daily #64"
  tiles: number[];           // 6 number tiles
  targetNumber: number;      // Target (101-999)
  isManual: boolean;         // Created by admin
  playCount: number;         // Times played
  successRate: number | null; // Percentage solved (null if no plays)
  createdAt: string;         // ISO date string
}

// =============================================================================
// ADMIN API
// =============================================================================

/**
 * Admin-related API endpoints.
 * Uses separate authentication from user accounts.
 *
 * CAPABILITIES:
 * - View challenges (30-day window)
 * - Create/edit future challenges
 * - Generate random or set manual values
 */
// =============================================================================
// DASHBOARD TYPES
// =============================================================================

/**
 * Difficulty statistics for a challenge.
 */
export interface ChallengeDifficulty {
  completionPercent: number;   // Percentage of players who solved it
  under60sPercent: number;     // Percentage of solvers who finished under 60s
  under5minPercent: number;    // Percentage of solvers who finished under 5min
  totalAttempts: number;       // Total number of attempts
}

/**
 * User's result for a specific challenge.
 */
export interface UserChallengeResult {
  solved: boolean;
  duration: number | null;
  result: number | null;
}

/**
 * Represents a challenge in the history view.
 */
export interface HistoryChallenge {
  id: string;
  date: string;                        // ISO date string
  dailyNumber: number;                 // Day number since epoch
  targetNumber: number;
  tiles: number[];
  difficulty: ChallengeDifficulty;
  userResult: UserChallengeResult | null;  // null if user hasn't played
}

/**
 * Response from GET /api/dashboard/history endpoint.
 */
export interface HistoryResponse {
  challenges: HistoryChallenge[];
}

/**
 * Represents an entry in a leaderboard.
 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string | null;
  duration: number | null;
  solved: boolean;
  result: number | null;
  difference: number | null;
  playedAt: string;
}

/**
 * Response from GET /api/dashboard/leaderboard endpoint.
 */
export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  userRank: number | null;
  frameId: string | null;
  dailyNumber: number | null;
}

/**
 * Represents an entry in the overall leaderboard.
 */
export interface OverallLeaderboardEntry {
  rank: number;
  userId: string;
  name: string | null;
  totalPoints: number;
}

/**
 * Response from GET /api/dashboard/overall-leaderboard endpoint.
 */
export interface OverallLeaderboardResponse {
  leaderboard: OverallLeaderboardEntry[];
  userRank: number | null;
  userPoints: number;
}

/**
 * Represents a friend's activity item.
 */
export interface FriendActivity {
  id: string;
  userId: string;
  name: string | null;
  frameId: string;
  dailyNumber: number | null;
  solved: boolean;
  duration: number | null;
  playedAt: string;  // ISO date string
}

/**
 * Response from GET /api/dashboard/friends-activity endpoint.
 */
export interface FriendsActivityResponse {
  activity: FriendActivity[];
}

/**
 * Aggregate stats for a single user.
 */
export interface UserStats {
  totalGamesPlayed: number;
  successRate: number;        // 0–100
  averageDistance: number | null;
  bestTime: number | null;    // seconds
  perfectSolves: number;
  currentStreak: number;
  longestStreak: number;
}

/**
 * Response from GET /api/dashboard/stats endpoint.
 */
export interface StatsResponse {
  myStats: UserStats;
  friendStats: UserStats | null;
  friendName: string | null;
  friends: { id: string; name: string | null }[];
}

/**
 * Response from GET /api/game/frame/:id/play endpoint.
 */
export interface PlayFrameResponse {
  frame: Frame;
  startedAt: string | null;
  previousResult: PreviousResult | null;
}

// =============================================================================
// DASHBOARD API
// =============================================================================

/**
 * Dashboard-related API endpoints.
 * All endpoints require authentication.
 *
 * FEATURES:
 * - View challenge history with difficulty stats
 * - Per-frame leaderboards (global or friends)
 * - Overall points leaderboard
 * - Friends activity feed
 */
export const dashboardApi = {
  /**
   * Gets challenge history for a specific month.
   *
   * @param year - Year (defaults to current year)
   * @param month - Month 1-12 (defaults to current month)
   * @returns List of challenges with difficulty stats and user results
   */
  getHistory: (year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.append('year', year.toString());
    if (month) params.append('month', month.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<HistoryResponse>(`/dashboard/history${query}`);
  },

  /**
   * Gets the leaderboard for a specific frame.
   *
   * @param type - 'global' or 'friends' (defaults to 'global')
   * @param frameId - Frame ID (defaults to today's frame)
   * @returns Leaderboard entries with user's rank
   */
  getLeaderboard: (type?: 'global' | 'friends', frameId?: string) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (frameId) params.append('frameId', frameId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<LeaderboardResponse>(`/dashboard/leaderboard${query}`);
  },

  /**
   * Gets the overall points leaderboard.
   *
   * @returns Top 50 users by points with user's rank
   */
  getOverallLeaderboard: () =>
    request<OverallLeaderboardResponse>('/dashboard/overall-leaderboard'),

  /**
   * Gets recent activity from friends.
   *
   * @param limit - Number of results to return (defaults to 20)
   * @returns List of recent friend game results
   */
  getFriendsActivity: (limit?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<FriendsActivityResponse>(`/dashboard/friends-activity${query}`);
  },

  getStats: (compareWith?: string, timeframe?: 'forever' | 'month' | 'week') => {
    const params = new URLSearchParams();
    if (compareWith) params.append('compareWith', compareWith);
    if (timeframe) params.append('timeframe', timeframe);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<StatsResponse>(`/dashboard/stats${query}`);
  },
};

// Add playHistoricalFrame to gameApi
// (Extending gameApi with this method is done below)

export const adminApi = {
  /**
   * Authenticates as admin.
   * Credentials are configured via environment variables on the server.
   *
   * @param username - Admin username
   * @param password - Admin password
   * @returns JWT token for admin access
   */
  login: (username: string, password: string) =>
    adminRequest<{ token: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  /**
   * Verifies the admin token is still valid.
   * Used to check if admin is still logged in on page load.
   *
   * @returns { valid: true } if token is valid
   */
  verify: () => adminRequest<{ valid: boolean }>('/admin/verify'),

  /**
   * Lists daily challenges for a 30-day window.
   * Includes play statistics for each challenge.
   *
   * @returns Array of challenges sorted by date (newest first)
   */
  listChallenges: () =>
    adminRequest<{ challenges: Challenge[] }>('/admin/challenges'),

  /**
   * Gets a specific challenge by date.
   *
   * @param date - Date in YYYY-MM-DD format
   * @returns The challenge for that date
   */
  getChallenge: (date: string) =>
    adminRequest<{ challenge: Challenge }>(`/admin/challenges/${date}`),

  /**
   * Creates or updates a daily challenge.
   *
   * Options:
   * - { tiles, targetNumber } - Set specific values
   * - { generateRandom: true } - Generate random values
   *
   * @param date - Date in YYYY-MM-DD format
   * @param data - Challenge data or generation flag
   * @returns The saved challenge and whether it was created (vs updated)
   */
  saveChallenge: (date: string, data: { tiles?: number[]; targetNumber?: number; generateRandom?: boolean }) =>
    adminRequest<{ challenge: Challenge; created: boolean }>(`/admin/challenges/${date}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};
