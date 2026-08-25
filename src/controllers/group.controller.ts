// ============================================================
// FILE: src/controllers/group.controller.ts (UPDATED)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Group from '../models/Group.js';
import GroupMember from '../models/GroupMember.js';
import Conversation from '../models/Conversation.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';
import mongoose from 'mongoose';

// ─── CREATE GROUP ────────────────────────────────────────────────────
export const createGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { name, description, type, avatar, coverImage } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Group name is required' });
    }

    // Create group
    const group = await Group.create({
      name,
      description: description || '',
      type: type || 'public',
      adminId: user._id,
      avatar: avatar || '',
      coverImage: coverImage || '',
      memberCount: 1,
    });

    // Create conversation for group chat
    const conversation = await Conversation.create({
      participants: [user._id],
      isGroup: true,
      groupName: name,
      groupAvatar: avatar || '',
      adminId: user._id,
      lastMessageAt: new Date(),
    });

    group.conversationId = conversation._id;
    await group.save();

    // Add creator as admin
    await GroupMember.create({
      groupId: group._id,
      userId: user._id,
      role: 'admin',
      status: 'active',
      joinedAt: new Date(),
    });

    // Update user's academyId if not already set? (optional)

    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};

// ─── GET ALL GROUPS ──────────────────────────────────────────────────
export const getGroups = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    // Show public groups + groups user is a member of
    const userGroups = await GroupMember.find({ userId: user._id }).distinct('groupId');
    const filter = {
      $or: [
        { type: 'public' },
        { _id: { $in: userGroups } },
      ],
    };
    const groups = await Group.find(filter).sort('-createdAt');
    // Attach membership status
    const groupsWithMembership = await Promise.all(groups.map(async (g) => {
      const member = await GroupMember.findOne({ groupId: g._id, userId: user._id });
      return {
        ...g.toObject(),
        isMember: !!member,
        role: member?.role || null,
      };
    }));
    res.json({ success: true, data: groupsWithMembership });
  } catch (err) {
    next(err);
  }
};

// ─── GET SINGLE GROUP ──────────────────────────────────────────────
export const getGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }
    // Check if user can view (public or member)
    const member = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (group.type === 'private' && !member) {
      return res.status(403).json({ success: false, message: 'This group is private' });
    }
    // Also check if user is banned
    if (member?.status === 'banned') {
      return res.status(403).json({ success: false, message: 'You have been banned from this group' });
    }
    res.json({
      success: true,
      data: {
        ...group.toObject(),
        isMember: !!member,
        role: member?.role || null,
        isBanned: member?.status === 'banned',
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE GROUP ──────────────────────────────────────────────────
export const updateGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const { name, description, type, avatar, coverImage, settings } = req.body;

    const membership = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can update the group' });
    }

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (type) group.type = type;
    if (avatar !== undefined) group.avatar = avatar;
    if (coverImage !== undefined) group.coverImage = coverImage;
    if (settings) group.settings = { ...group.settings, ...settings };

    await group.save();

    // If name changed, update conversation groupName
    if (name && group.conversationId) {
      await Conversation.findByIdAndUpdate(group.conversationId, { groupName: name });
    }

    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE GROUP ──────────────────────────────────────────────────
export const deleteGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const membership = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can delete the group' });
    }

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    // Delete associated conversation
    if (group.conversationId) {
      await Conversation.findByIdAndDelete(group.conversationId);
    }

    // Delete all members, posts, comments, likes, etc.
    await GroupMember.deleteMany({ groupId: id });
    await GroupPost.deleteMany({ groupId: id });
    await GroupComment.deleteMany({ postId: { $in: await GroupPost.find({ groupId: id }).distinct('_id') } });
    await GroupLike.deleteMany({ targetId: { $in: await GroupPost.find({ groupId: id }).distinct('_id') } });
    await GroupBan.deleteMany({ groupId: id });
    await GroupReport.deleteMany({ groupId: id });
    await GroupAnalytics.deleteMany({ groupId: id });

    await group.deleteOne();

    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    next(err);
  }
};

// ─── JOIN GROUP ──────────────────────────────────────────────────────
export const joinGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const existing = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (existing) {
      if (existing.status === 'banned') {
        return res.status(403).json({ success: false, message: 'You have been banned from this group' });
      }
      return res.status(400).json({ success: false, message: 'Already a member' });
    }

    // If group requires approval, set status to pending
    const status = group.settings?.postApproval ? 'pending' : 'active';
    const member = await GroupMember.create({
      groupId: id,
      userId: user._id,
      role: 'member',
      status,
      joinedAt: new Date(),
    });

    await Group.findByIdAndUpdate(id, { $inc: { memberCount: 1 } });

    // Add user to conversation
    if (group.conversationId) {
      await Conversation.findByIdAndUpdate(group.conversationId, {
        $addToSet: { participants: user._id }
      });
    }

    // Notify admins if pending
    if (status === 'pending') {
      const admins = await GroupMember.find({ groupId: id, role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          userId: admin.userId,
          title: 'Join Request Pending',
          message: `${user.firstName} ${user.lastName} requested to join "${group.name}"`,
          type: 'system',
          data: { groupId: id, memberId: member._id },
        });
      }
    }

    res.json({
      success: true,
      message: status === 'pending' ? 'Join request submitted for approval' : 'Joined group',
      data: member,
    });
  } catch (err) {
    next(err);
  }
};

// ─── LEAVE GROUP ────────────────────────────────────────────────────
export const leaveGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const member = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (!member) {
      return res.status(400).json({ success: false, message: 'Not a member' });
    }
    if (member.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Admin cannot leave; transfer ownership first' });
    }

    await member.deleteOne();
    await Group.findByIdAndUpdate(id, { $inc: { memberCount: -1 } });

    // Remove from conversation
    const group = await Group.findById(id);
    if (group?.conversationId) {
      await Conversation.findByIdAndUpdate(group.conversationId, {
        $pull: { participants: user._id }
      });
    }

    res.json({ success: true, message: 'Left group' });
  } catch (err) {
    next(err);
  }
};

// ─── ADD RESOURCE ──────────────────────────────────────────────────
export const addResource = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { title, url, type } = req.body;

    const member = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (!member || member.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Not a member or inactive' });
    }

    const resource = await GroupResource.create({
      groupId: id,
      title,
      url,
      type: type || 'link',
      addedBy: user._id,
    });

    res.status(201).json({ success: true, data: resource });
  } catch (err) { next(err); }
};

// ─── GET RESOURCES ──────────────────────────────────────────────────
export const getResources = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const resources = await GroupResource.find({ groupId: id })
      .populate('addedBy', 'firstName lastName avatarUrl')
      .sort('-createdAt');
    res.json({ success: true, data: resources });
  } catch (err) { next(err); }
};

// ─── CREATE EVENT ──────────────────────────────────────────────────
export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { title, description, startTime, endTime, type, meetingUrl } = req.body;

    const member = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (!member || member.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Not a member or inactive' });
    }

    const event = await GroupEvent.create({
      groupId: id,
      title,
      description,
      startTime,
      endTime,
      type: type || 'voice_chat',
      meetingUrl: meetingUrl || '',
      createdBy: user._id,
    });

    res.status(201).json({ success: true, data: event });
  } catch (err) { next(err); }
};

// ─── GET EVENTS ────────────────────────────────────────────────────
export const getEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const events = await GroupEvent.find({ groupId: id })
      .populate('createdBy', 'firstName lastName avatarUrl')
      .sort('startTime');
    res.json({ success: true, data: events });
  } catch (err) { next(err); }
};
