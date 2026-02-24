/**
 * =============================================================================
 * FRIENDS ROUTES (routes/friends.ts)
 * =============================================================================
 *
 * This module handles all friend-related API endpoints including listing friends,
 * sending friend requests, accepting requests, and removing friends.
 *
 * FRIENDSHIP MODEL:
 * The friendship system uses a bidirectional request model:
 * - User A sends request to User B → Creates Friendship(userId=A, friendId=B, status=PENDING)
 * - User B accepts → status becomes ACCEPTED
 * - Either user can remove the friendship at any time
 *
 * RELATIONSHIP DIRECTIONS:
 * - "sent" requests: The current user initiated the request (userId = current user)
 * - "received" requests: The other user initiated (friendId = current user)
 *
 * STATUS VALUES:
 * - PENDING: Request sent but not yet accepted
 * - ACCEPTED: Both users are friends
 *
 * All endpoints in this module require authentication.
 *
 * @module server/routes/friends
 */

import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

// Create Express router instance
const router = Router();

// =============================================================================
// LIST FRIENDS ENDPOINT
// =============================================================================

/**
 * GET /api/friends
 *
 * Lists all friend relationships for the current user.
 * This includes both accepted friends and pending requests (sent and received).
 *
 * AUTHENTICATION: Required
 *
 * RESPONSE (200 OK):
 * {
 *   friends: [
 *     {
 *       id: string,           // Friendship record ID
 *       status: "PENDING" | "ACCEPTED",
 *       direction: "sent" | "received",
 *       user: {               // The other user in the relationship
 *         id: string,
 *         email: string,
 *         name: string | null
 *       },
 *       createdAt: string     // ISO date string
 *     }
 *   ]
 * }
 *
 * DIRECTION EXPLANATION:
 * - "sent": Current user sent the request (they are userId in the record)
 * - "received": Current user received the request (they are friendId in the record)
 *
 * The response combines both sent and received relationships into a single list,
 * with the `direction` field indicating which role the current user plays.
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Fetch friendships in parallel:
    // 1. Requests sent by the current user (userId = current user)
    // 2. Requests received by the current user (friendId = current user)
    const [sentRequests, receivedRequests] = await Promise.all([
      // Friendships where current user is the sender
      prisma.friendship.findMany({
        where: { userId: req.userId },
        include: {
          friend: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
      // Friendships where current user is the receiver
      prisma.friendship.findMany({
        where: { friendId: req.userId },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
    ]);

    // Format the response to provide a consistent structure
    // Each item includes the direction so the frontend knows how to handle it
    const friends = [
      // Map sent requests - the "friend" is the other person
      ...sentRequests.map((f) => ({
        id: f.id,
        status: f.status,
        direction: 'sent' as const,
        user: f.friend,           // The person they sent the request to
        createdAt: f.createdAt,
      })),
      // Map received requests - the "user" is the other person
      ...receivedRequests.map((f) => ({
        id: f.id,
        status: f.status,
        direction: 'received' as const,
        user: f.user,             // The person who sent the request
        createdAt: f.createdAt,
      })),
    ];

    res.json({ friends });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// =============================================================================
// SEND FRIEND REQUEST ENDPOINT
// =============================================================================

/**
 * POST /api/friends/request
 *
 * Sends a friend request to another user by their email address.
 *
 * AUTHENTICATION: Required
 *
 * REQUEST BODY:
 * {
 *   email: string  // Email of the user to add as friend
 * }
 *
 * RESPONSE (201 Created):
 * {
 *   friend: {
 *     id: string,
 *     status: "PENDING",
 *     direction: "sent",
 *     user: { id, email, name },
 *     createdAt: string
 *   }
 * }
 *
 * ERRORS:
 * - 400: Email is required
 * - 400: Cannot add yourself as a friend
 * - 400: Already friends or request already exists
 * - 404: User not found
 * - 500: Server error
 *
 * UNIQUENESS:
 * The system checks for existing friendships in BOTH directions before creating.
 * This prevents duplicate requests when:
 * - User A already sent request to User B
 * - User B already sent request to User A
 */
router.post('/request', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;

    // Validate email is provided
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find the user to add by their email
    const friendUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    // User with that email doesn't exist
    if (!friendUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Can't add yourself as a friend
    if (friendUser.id === req.userId) {
      return res.status(400).json({ error: 'You cannot add yourself as a friend' });
    }

    // Check if a friendship already exists in either direction
    // This handles both "I sent you a request" and "you sent me a request"
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: req.userId, friendId: friendUser.id },  // I -> them
          { userId: friendUser.id, friendId: req.userId },  // them -> me
        ],
      },
    });

    // Handle existing relationship
    if (existingFriendship) {
      if (existingFriendship.status === 'ACCEPTED') {
        return res.status(400).json({ error: 'You are already friends with this user' });
      }
      return res.status(400).json({ error: 'A friend request already exists' });
    }

    // Create the friend request
    // userId = sender (current user), friendId = receiver (target user)
    const friendship = await prisma.friendship.create({
      data: {
        userId: req.userId!,
        friendId: friendUser.id,
        status: 'PENDING',
      },
      include: {
        friend: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    // Return the created friendship in the standard format
    res.status(201).json({
      friend: {
        id: friendship.id,
        status: friendship.status,
        direction: 'sent',
        user: friendship.friend,
        createdAt: friendship.createdAt,
      },
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// =============================================================================
// ACCEPT FRIEND REQUEST ENDPOINT
// =============================================================================

/**
 * POST /api/friends/:id/accept
 *
 * Accepts a pending friend request that was sent to the current user.
 *
 * AUTHENTICATION: Required
 *
 * URL PARAMETERS:
 * - id: The friendship record ID
 *
 * RESPONSE (200 OK):
 * {
 *   friend: {
 *     id: string,
 *     status: "ACCEPTED",
 *     direction: "received",
 *     user: { id, email, name },
 *     createdAt: string
 *   }
 * }
 *
 * ERRORS:
 * - 404: Friend request not found
 * - 500: Server error
 *
 * AUTHORIZATION:
 * Only the receiver (friendId) of a PENDING request can accept it.
 * The sender cannot accept their own request.
 */
router.post('/:id/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    // Find the friendship where:
    // - ID matches
    // - Current user is the receiver (friendId)
    // - Status is still PENDING
    const friendship = await prisma.friendship.findFirst({
      where: {
        id,
        friendId: req.userId,  // Only the receiver can accept
        status: 'PENDING',     // Can only accept pending requests
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    // Request not found (wrong ID, not receiver, or already accepted)
    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Update the status to ACCEPTED
    await prisma.friendship.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });

    // Return the updated friendship
    res.json({
      friend: {
        id: friendship.id,
        status: 'ACCEPTED',
        direction: 'received',
        user: friendship.user,      // The person who sent the request
        createdAt: friendship.createdAt,
      },
    });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// =============================================================================
// REMOVE FRIEND / CANCEL REQUEST ENDPOINT
// =============================================================================

/**
 * DELETE /api/friends/:id
 *
 * Removes a friend or cancels/declines a friend request.
 * Works for both:
 * - Removing an accepted friend
 * - Canceling a sent request
 * - Declining a received request
 *
 * AUTHENTICATION: Required
 *
 * URL PARAMETERS:
 * - id: The friendship record ID
 *
 * RESPONSE (200 OK):
 * {
 *   message: "Friend removed successfully"
 * }
 *
 * ERRORS:
 * - 404: Friendship not found
 * - 500: Server error
 *
 * AUTHORIZATION:
 * Either party (userId or friendId) can delete the friendship.
 * This allows:
 * - Sender to cancel their pending request
 * - Receiver to decline a pending request
 * - Either user to remove an accepted friendship
 */
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    // Find the friendship where current user is involved (either side)
    const friendship = await prisma.friendship.findFirst({
      where: {
        id,
        OR: [
          { userId: req.userId },   // Current user sent the request
          { friendId: req.userId }, // Current user received the request
        ],
      },
    });

    // Friendship not found or current user not involved
    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    // Delete the friendship record
    await prisma.friendship.delete({
      where: { id },
    });

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

export default router;
