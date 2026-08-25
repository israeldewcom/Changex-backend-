import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Group from '../models/Group.js';
import GroupMember from '../models/GroupMember.js';
import GroupPost from '../models/GroupPost.js';
import GroupComment from '../models/GroupComment.js';
import GroupLike from '../models/GroupLike.js';
import GroupAnalytics from '../models/GroupAnalytics.js';
import mongoose from 'mongoose';

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
    else startDate.setDate(now.getDate() - 30); // default 30 days

    // Aggregate real‑time stats
    const posts = await GroupPost.countDocuments({ groupId, createdAt: { $gte: startDate } });
    const comments = await GroupComment.countDocuments({ 
      postId: { $in: await GroupPost.find({ groupId }).distinct('_id') },
      createdAt: { $gte: startDate }
    });
    const likes = await GroupLike.countDocuments({ 
      targetType: 'post',
      targetId: { $in: await GroupPost.find({ groupId }).distinct('_id') },
      createdAt: { $gte: startDate }
    });
    const newMembers = await GroupMember.countDocuments({ groupId, joinedAt: { $gte: startDate } });
    const totalMembers = await GroupMember.countDocuments({ groupId, status: 'active' });
    const activeMembers = await GroupMember.countDocuments({
      groupId,
      status: 'active',
      joinedAt: { $gte: new Date(now.getTime() - 30*24*60*60*1000) }
    });

    const engagementRate = totalMembers > 0 ? ((activeMembers / totalMembers) * 100) : 0;

    // Store/update daily analytics
    const today = new Date();
    today.setHours(0,0,0,0);
    await GroupAnalytics.findOneAndUpdate(
      { groupId, date: today },
      { posts, comments, likes, newMembers, totalMembers, activeMembers, engagementRate },
      { upsert: true }
    );

    // Return analytics
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
        // Optional: daily breakdown for charts
        daily: await GroupAnalytics.find({ groupId, date: { $gte: startDate } }).sort('date'),
      }
    });
  } catch (err) { next(err); }
};
