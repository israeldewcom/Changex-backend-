import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Group from '../models/Group.js';
import GroupMember from '../models/GroupMember.js';
import GroupBan from '../models/GroupBan.js';
import GroupReport from '../models/GroupReport.js';
import GroupPost from '../models/GroupPost.js';
import GroupComment from '../models/GroupComment.js';

// ─── Ban Member ──────────────────────────────────────
export const banMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { groupId, userId } = req.params;
    const { reason, expiresAt } = req.body;

    // Check admin
    const admin = await GroupMember.findOne({ groupId, userId: user._id, role: 'admin' });
    if (!admin) return res.status(403).json({ success: false, message: 'Admins only' });

    const existing = await GroupBan.findOne({ groupId, userId });
    if (existing) return res.status(400).json({ success: false, message: 'Already banned' });

    const ban = await GroupBan.create({
      groupId,
      userId,
      bannedBy: user._id,
      reason,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    // Update member status
    await GroupMember.findOneAndUpdate({ groupId, userId }, { status: 'banned' });

    // Remove from conversation (if exists)
    const group = await Group.findById(groupId);
    if (group?.conversationId) {
      const Conversation = mongoose.model('Conversation');
      await Conversation.findByIdAndUpdate(group.conversationId, {
        $pull: { participants: userId }
      });
    }

    res.json({ success: true, data: ban });
  } catch (err) { next(err); }
};

// ─── Unban Member ────────────────────────────────────
export const unbanMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { groupId, userId } = req.params;
    const admin = await GroupMember.findOne({ groupId, userId: user._id, role: 'admin' });
    if (!admin) return res.status(403).json({ success: false, message: 'Admins only' });

    await GroupBan.deleteOne({ groupId, userId });
    await GroupMember.findOneAndUpdate({ groupId, userId }, { status: 'active' });
    res.json({ success: true, message: 'Member unbanned' });
  } catch (err) { next(err); }
};

// ─── Report Content ────────────────────────────────
export const reportContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { targetId, targetType, reason } = req.body;
    const groupId = req.params.groupId;

    const report = await GroupReport.create({
      groupId,
      reporterId: user._id,
      targetId,
      targetType,
      reason,
      status: 'pending',
    });

    // Notify admins
    const admins = await GroupMember.find({ groupId, role: 'admin' });
    for (const admin of admins) {
      await Notification.create({
        userId: admin.userId,
        title: 'New Report in Group',
        message: `A report has been submitted for ${targetType}`,
        type: 'system',
        data: { reportId: report._id },
      });
    }

    res.status(201).json({ success: true, data: report });
  } catch (err) { next(err); }
};

// ─── Admin Review Report ────────────────────────────
export const reviewReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { reportId } = req.params;
    const { action, adminNote } = req.body;

    const report = await GroupReport.findById(reportId);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const admin = await GroupMember.findOne({ groupId: report.groupId, userId: user._id, role: 'admin' });
    if (!admin) return res.status(403).json({ success: false, message: 'Admins only' });

    if (action === 'dismiss') {
      report.status = 'dismissed';
    } else if (action === 'delete') {
      // Delete target
      if (report.targetType === 'post') {
        await GroupPost.findByIdAndDelete(report.targetId);
      } else {
        await GroupComment.findByIdAndDelete(report.targetId);
      }
      report.status = 'action_taken';
    }
    report.adminNote = adminNote;
    await report.save();

    res.json({ success: true, data: report });
  } catch (err) { next(err); }
};
