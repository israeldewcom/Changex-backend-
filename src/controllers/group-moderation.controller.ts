// ============================================================
// FILE: src/controllers/group-moderation.controller.ts (COMPLETE FIXED)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Group from '../models/Group.js';
import GroupMember from '../models/GroupMember.js';
import GroupBan from '../models/GroupBan.js';
import GroupReport from '../models/GroupReport.js';
import GroupPost from '../models/GroupPost.js';
import GroupComment from '../models/GroupComment.js';
import Conversation from '../models/Conversation.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';

// ─── BAN MEMBER ──────────────────────────────────────────────────────
export const banMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { groupId, userId } = req.params;
    const { reason, expiresAt } = req.body;

    const admin = await GroupMember.findOne({ groupId, userId: user._id, role: { $in: ['admin', 'moderator'] } });
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    if (userId === user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot ban yourself' });
    }

    const existing = await GroupBan.findOne({ groupId, userId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'User is already banned' });
    }

    const ban = await GroupBan.create({
      groupId,
      userId,
      bannedBy: user._id,
      reason: reason || 'No reason provided',
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    await GroupMember.findOneAndUpdate({ groupId, userId }, { status: 'banned' });

    const group = await Group.findById(groupId);
    if (group?.conversationId) {
      await Conversation.findByIdAndUpdate(group.conversationId, {
        $pull: { participants: userId }
      });
    }

    await Notification.create({
      userId,
      title: 'You have been banned from a group',
      message: `You have been banned from "${group?.name || 'the group'}"${reason ? `. Reason: ${reason}` : ''}`,
      type: 'system',
      data: { groupId },
    });
    getIO().to(`user:${userId}`).emit('notification', {
      title: 'Banned from group',
      message: `You have been banned from "${group?.name || 'the group'}"`,
    });

    res.json({ success: true, data: ban });
  } catch (err) { next(err); }
};

// ─── UNBAN MEMBER ──────────────────────────────────────────────────
export const unbanMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { groupId, userId } = req.params;

    const admin = await GroupMember.findOne({ groupId, userId: user._id, role: { $in: ['admin', 'moderator'] } });
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const ban = await GroupBan.findOne({ groupId, userId });
    if (!ban) {
      return res.status(404).json({ success: false, message: 'User is not banned' });
    }

    await ban.deleteOne();
    await GroupMember.findOneAndUpdate({ groupId, userId }, { status: 'active' });

    const group = await Group.findById(groupId);
    if (group?.conversationId) {
      await Conversation.findByIdAndUpdate(group.conversationId, {
        $addToSet: { participants: userId }
      });
    }

    res.json({ success: true, message: 'User unbanned' });
  } catch (err) { next(err); }
};

// ─── MUTE MEMBER ────────────────────────────────────────────────────
export const muteMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { groupId, userId } = req.params;
    const { duration } = req.body;

    const admin = await GroupMember.findOne({ groupId, userId: user._id, role: { $in: ['admin', 'moderator'] } });
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const member = await GroupMember.findOne({ groupId, userId });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const minutes = parseInt(duration) || 60;
    const mutedUntil = new Date(Date.now() + minutes * 60 * 1000);
    member.mutedUntil = mutedUntil;
    await member.save();

    const group = await Group.findById(groupId);
    await Notification.create({
      userId,
      title: 'You have been muted',
      message: `You have been muted in "${group?.name || 'the group'}" for ${minutes} minutes.`,
      type: 'system',
      data: { groupId, mutedUntil },
    });

    res.json({ success: true, mutedUntil });
  } catch (err) { next(err); }
};

// ─── REPORT CONTENT ────────────────────────────────────────────────
export const reportContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { groupId } = req.params;
    const { targetId, targetType, reason } = req.body;

    if (!targetId || !targetType || !reason) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const member = await GroupMember.findOne({ groupId, userId: user._id });
    if (!member || member.status !== 'active') {
      return res.status(403).json({ success: false, message: 'You are not an active member of this group' });
    }

    if (targetType === 'post') {
      const post = await GroupPost.findById(targetId);
      if (!post || post.groupId.toString() !== groupId) {
        return res.status(404).json({ success: false, message: 'Post not found' });
      }
    } else if (targetType === 'comment') {
      const comment = await GroupComment.findById(targetId);
      if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
      const post = await GroupPost.findById(comment.postId);
      if (!post || post.groupId.toString() !== groupId) {
        return res.status(404).json({ success: false, message: 'Comment not found in this group' });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid target type' });
    }

    const report = await GroupReport.create({
      groupId,
      reporterId: user._id,
      targetId,
      targetType,
      reason,
      status: 'pending',
    });

    const admins = await GroupMember.find({ groupId, role: { $in: ['admin', 'moderator'] } });
    for (const admin of admins) {
      await Notification.create({
        userId: admin.userId,
        title: 'New Report in Group',
        message: `A report has been submitted for ${targetType}`,
        type: 'system',
        data: { groupId, reportId: report._id },
      });
      getIO().to(`user:${admin.userId}`).emit('notification', {
        title: 'New Report',
        message: `A report has been submitted in the group`,
      });
    }

    res.status(201).json({ success: true, data: report });
  } catch (err) { next(err); }
};

// ─── REVIEW REPORT ──────────────────────────────────────────────────
export const reviewReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { reportId } = req.params;
    const { action, adminNote } = req.body;

    const report = await GroupReport.findById(reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const admin = await GroupMember.findOne({ groupId: report.groupId, userId: user._id, role: { $in: ['admin', 'moderator'] } });
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    if (action === 'dismiss') {
      report.status = 'dismissed';
    } else if (action === 'delete') {
      if (report.targetType === 'post') {
        await GroupPost.findByIdAndDelete(report.targetId);
      } else if (report.targetType === 'comment') {
        await GroupComment.findByIdAndDelete(report.targetId);
      }
      report.status = 'action_taken';
    } else if (action === 'warn') {
      report.status = 'action_taken';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    report.adminNote = adminNote || '';
    await report.save();

    res.json({ success: true, data: report });
  } catch (err) { next(err); }
};

// ─── GET PENDING REPORTS ───────────────────────────────────────────
export const getPendingReports = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { groupId } = req.params;

    const admin = await GroupMember.findOne({ groupId, userId: user._id, role: { $in: ['admin', 'moderator'] } });
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const reports = await GroupReport.find({ groupId, status: 'pending' })
      .populate('reporterId', 'firstName lastName avatarUrl')
      .sort('-createdAt');

    res.json({ success: true, data: reports });
  } catch (err) { next(err); }
};
