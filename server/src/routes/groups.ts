/**
 * =============================================================================
 * GROUP ROUTES (routes/groups.ts) — 67numbers only
 * =============================================================================
 *
 * Private leaderboards, Wordle-group style. Someone creates a group, shares
 * its invite link (/?group=inviteCode) in a WhatsApp chat, and everyone who
 * opens it joins. Members see today's daily and this week's points ranked
 * among themselves. No owner: every member is equal, and the group is
 * deleted when its last member leaves.
 *
 * @module server/routes/groups
 */

import crypto from 'crypto';
import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import { calculatePoints } from '../services/pointsCalculator';

const router = Router();

const MAX_NAME_LENGTH = 40;

// No 0/O/1/I/L: the code may be read aloud or typed
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newInviteCode(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const displayName = (u: { name: string | null; email: string }) => u.name || u.email.split('@')[0];

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Monday 00:00 UTC of the current week */
function weekStartUTC(): Date {
  const d = todayUTC();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

/**
 * GET /api/groups
 * The current user's groups: { groups: [{ id, name, inviteCode, memberCount }] }
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.userId },
      orderBy: { joinedAt: 'asc' },
      include: { group: { include: { _count: { select: { members: true } } } } },
    });
    res.json({
      groups: memberships.map(m => ({
        id: m.group.id,
        name: m.group.name,
        inviteCode: m.group.inviteCode,
        memberCount: m.group._count.members,
      })),
    });
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ error: 'Failed to load groups' });
  }
});

/**
 * POST /api/groups  { name }
 * Creates a group with the current user as its first member.
 */
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'Give your group a name' });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Group names are ${MAX_NAME_LENGTH} characters max` });
    }

    const group = await prisma.group.create({
      data: {
        name,
        inviteCode: newInviteCode(),
        members: { create: { userId: req.userId! } },
      },
    });
    res.status(201).json({ group: { id: group.id, name: group.name, inviteCode: group.inviteCode, memberCount: 1 } });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

/**
 * GET /api/groups/invite/:code
 * Who you'd be joining. Public, so guests see the group name too.
 * { group: { id, name, memberCount }, member: boolean | null }  (null for guests)
 */
router.get('/invite/:code', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.group.findUnique({
      where: { inviteCode: (req.params.code as string).toUpperCase() },
      include: { _count: { select: { members: true } } },
    });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const member = req.userId
      ? !!(await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: req.userId } } }))
      : null;

    res.json({ group: { id: group.id, name: group.name, memberCount: group._count.members }, member });
  } catch (error) {
    console.error('Get group invite error:', error);
    res.status(500).json({ error: 'Failed to load group' });
  }
});

/**
 * POST /api/groups/invite/:code/join
 * Joins the group (no-op if already a member). { group: { id, name } }
 */
router.post('/invite/:code/join', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.group.findUnique({ where: { inviteCode: (req.params.code as string).toUpperCase() } });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: req.userId! } },
      create: { groupId: group.id, userId: req.userId! },
      update: {},
    });
    res.json({ group: { id: group.id, name: group.name } });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

/**
 * DELETE /api/groups/:id/membership
 * Leaves the group; the group goes away with its last member.
 */
router.delete('/:id/membership', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    await prisma.groupMember.deleteMany({ where: { groupId, userId: req.userId } });
    const left = await prisma.groupMember.count({ where: { groupId } });
    if (left === 0) {
      await prisma.group.deleteMany({ where: { id: groupId } });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

/**
 * GET /api/groups/:id/leaderboard?period=today|week
 * Members only.
 *
 * today: today's daily, solved fastest first, then closest, then members who
 *   haven't played yet (so the group sees who's still missing).
 *   { period, dailyNumber, targetNumber, entries: [{ userId, name, rank, played, solved, duration, difference }] }
 *
 * week: points earned on this week's dailies (Monday UTC onward), with the
 *   same formula as the main ranking but live solve rates, so today counts now.
 *   { period, entries: [{ userId, name, rank, points, solves }] }
 */
router.get('/:id/leaderboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    if (!group || !group.members.some(m => m.userId === req.userId)) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const members = group.members.map(m => ({ userId: m.user.id, name: displayName(m.user) }));
    const memberIds = members.map(m => m.userId);
    const base = { group: { id: group.id, name: group.name, inviteCode: group.inviteCode, memberCount: members.length } };

    if (req.query.period === 'week') {
      const frames = await prisma.frame.findMany({
        where: { date: { gte: weekStartUTC(), lte: new Date() } },
        select: { id: true },
      });
      const frameIds = frames.map(f => f.id);

      // Live solve rate per frame (the nightly job only refreshes it once a day)
      const [attempts, solves] = await Promise.all([
        prisma.gameResult.groupBy({ by: ['frameId'], where: { frameId: { in: frameIds } }, _count: { id: true } }),
        prisma.gameResult.groupBy({ by: ['frameId'], where: { frameId: { in: frameIds }, solved: true }, _count: { id: true } }),
      ]);
      const solvedCount = new Map(solves.map(s => [s.frameId, s._count.id]));
      const completion = new Map(attempts.map(a => [a.frameId, Math.round(((solvedCount.get(a.frameId) ?? 0) / a._count.id) * 100)]));

      const results = await prisma.gameResult.findMany({
        where: { frameId: { in: frameIds }, userId: { in: memberIds }, solved: true },
        select: { userId: true, frameId: true, duration: true },
      });

      const totals = new Map(members.map(m => [m.userId, { points: 0, solves: 0 }]));
      for (const r of results) {
        const t = totals.get(r.userId!)!;
        t.points += calculatePoints(completion.get(r.frameId) ?? 0, r.duration);
        t.solves++;
      }

      const entries = members
        .map(m => ({ ...m, ...totals.get(m.userId)! }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
        .map((e, i) => ({ ...e, rank: i + 1 }));

      return res.json({ ...base, period: 'week', entries });
    }

    // Today
    const frame = await prisma.frame.findUnique({ where: { date: todayUTC() } });
    if (!frame) {
      return res.json({ ...base, period: 'today', dailyNumber: null, targetNumber: null, entries: [] });
    }

    const results = await prisma.gameResult.findMany({
      where: { frameId: frame.id, userId: { in: memberIds }, result: { not: null } },
      select: { userId: true, solved: true, duration: true, result: true, playedAt: true },
    });
    const byUser = new Map(results.map(r => [r.userId!, r]));

    const played = members
      .filter(m => byUser.has(m.userId))
      .map(m => {
        const r = byUser.get(m.userId)!;
        return { ...m, played: true, solved: r.solved, duration: r.duration, difference: Math.abs(frame.targetNumber - r.result!), playedAt: r.playedAt };
      })
      .sort((a, b) => {
        if (a.solved !== b.solved) return a.solved ? -1 : 1;
        if (a.solved) return (a.duration ?? Infinity) - (b.duration ?? Infinity);
        return a.difference - b.difference || a.playedAt.getTime() - b.playedAt.getTime();
      })
      .map(({ playedAt, ...e }, i) => ({ ...e, rank: i + 1 }));

    const notPlayed = members
      .filter(m => !byUser.has(m.userId))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => ({ ...m, played: false, solved: false, duration: null, difference: null, rank: null }));

    const dailyMatch = frame.name?.match(/Daily #(\d+)/);
    res.json({
      ...base,
      period: 'today',
      dailyNumber: dailyMatch ? Number(dailyMatch[1]) : null,
      targetNumber: frame.targetNumber,
      entries: [...played, ...notPlayed],
    });
  } catch (error) {
    console.error('Group leaderboard error:', error);
    res.status(500).json({ error: 'Failed to load group leaderboard' });
  }
});

export default router;
