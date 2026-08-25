// ============================================================
// FILE: src/controllers/group-analytics.controller.ts (COMPLETE FIXED)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Group from '../models/Group.js';
import GroupMember from '../models/GroupMember.js';
import GroupPost from '../models/GroupPost.js';
import GroupComment from '../models/GroupComment.js';
import GroupLike from '../models/GroupLike.js';
import GroupAnalytics from '../models/GroupAnalytics.js';

// ─── GET GROUP ANALYTICS ────────────────────────────────────────────
export const getGroupAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { groupId } = req.params;
    const { period = 'week' } = req.query;

    const member = await GroupMember.findOne({ groupId, userId: user._id });
    if (!member || (member.role !== 'admin' && member.role !== 'moderator')) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const now = new Date();
    let startDate = new Date();
    if (period === 'week') startDate.setDate(now.getDate() - 7);
    else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
    else if (period === 'quarter') startDate.setMonth(now.getMonth() - 3);
    else startDate.setDate(now.getDate() - 30);

    const [posts, comments, likes, newMembers, totalMembers, activeMembers] = await Promise.all([
      GroupPost.countDocuments({ groupId, createdAt: { $gte: startDate } }),
      GroupComment.countDocuments({
        postId: { $in: await GroupPost.find({ groupId }).distinct('_id') },
        createdAt: { $gte: startDate }
      }),
      GroupLike.countDocuments({
        targetType: 'post',
        targetId: { $in: await GroupPost.find({ groupId }).distinct('_id') },
        createdAt: { $gte: startDate }
      }),
      GroupMember.countDocuments({ groupId, joinedAt: { $gte: startDate } }),
      GroupMember.countDocuments({ groupId, status: 'active' }),
      GroupMember.countDocuments({
        groupId,
        status: 'active',
        joinedAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
      })
    ]);

    const engagementRate = totalMembers > 0 ? ((activeMembers / totalMembers) * 100) : 0;

    const today = new Date();
    today.setHours(0,0,0,0);
    await GroupAnalytics.findOneAndUpdate(
      { groupId, date: today },
      {
        posts,
        comments,
        likes,
        newMembers,
        totalMembers,
        activeMembers,
        engagementRate: Math.round(engagementRate * 100) / 100,
      },
      { upsert: true }
    );

    const daily = await GroupAnalytics.find({ groupId, date: { $gte: startDate } }).sort('date');

    res.json({
      success: true,
      data: {
        period,
        posts,
        comments,
        likes,
        newMembers,
        totalMembers,
        activeMembers,
        engagementRate: Math.round(engagementRate * 100) / 100,
        daily,
      }
    });
  } catch (err) { next(err); }
};
