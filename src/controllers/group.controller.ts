// ============================================================
// FILE: src/controllers/group.controller.ts (NEW)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Group from '../models/Group.js';
import GroupMember from '../models/GroupMember.js';
import GroupResource from '../models/GroupResource.js';
import GroupEvent from '../models/GroupEvent.js';
import Notification from '../models/Notification.js';

export const createGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { name, description, type, avatar, coverImage } = req.body;

    const group = await Group.create({
      name,
      description,
      type: type || 'public',
      adminId: user._id,
      avatar: avatar || '',
      coverImage: coverImage || '',
    });

    // Add creator as member
    await GroupMember.create({
      groupId: group._id,
      userId: user._id,
      role: 'admin',
    });

    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};

export const getGroups = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const groups = await Group.find({
      $or: [
        { type: 'public' },
        { members: { $elemMatch: { userId: user._id } } },
      ],
    }).sort('-createdAt');

    res.json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
};

export const getGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    // Check membership for private groups
    if (group.type === 'private') {
      const member = await GroupMember.findOne({ groupId: id, userId: (req.user as IUser)._id });
      if (!member) {
        return res.status(403).json({ success: false, message: 'Private group' });
      }
    }

    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};

export const joinGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const existing = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (existing) return res.status(400).json({ success: false, message: 'Already a member' });

    await GroupMember.create({ groupId: id, userId: user._id, role: 'member' });
    await Group.findByIdAndUpdate(id, { $inc: { memberCount: 1 } });

    res.json({ success: true, message: 'Joined group' });
  } catch (err) {
    next(err);
  }
};

export const leaveGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const member = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (!member) return res.status(400).json({ success: false, message: 'Not a member' });

    // Cannot leave if admin
    if (member.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Cannot leave as admin' });
    }

    await member.deleteOne();
    await Group.findByIdAndUpdate(id, { $inc: { memberCount: -1 } });

    res.json({ success: true, message: 'Left group' });
  } catch (err) {
    next(err);
  }
};

export const updateGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const group = await Group.findOne({ _id: id, adminId: user._id });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found or not admin' });

    const updated = await Group.findByIdAndUpdate(id, req.body, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const deleteGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const group = await Group.findOne({ _id: id, adminId: user._id });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found or not admin' });

    await GroupMember.deleteMany({ groupId: id });
    await GroupResource.deleteMany({ groupId: id });
    await GroupEvent.deleteMany({ groupId: id });
    await group.deleteOne();

    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    next(err);
  }
};

export const addResource = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { title, url, type } = req.body;

    const member = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

    const resource = await GroupResource.create({
      groupId: id,
      title,
      url,
      type: type || 'link',
      addedBy: user._id,
    });

    res.status(201).json({ success: true, data: resource });
  } catch (err) {
    next(err);
  }
};

export const getResources = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const resources = await GroupResource.find({ groupId: id })
      .populate('addedBy', 'firstName lastName avatarUrl')
      .sort('-createdAt');
    res.json({ success: true, data: resources });
  } catch (err) {
    next(err);
  }
};

export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { title, description, startTime, endTime, type, meetingUrl } = req.body;

    const member = await GroupMember.findOne({ groupId: id, userId: user._id });
    if (!member) return res.status(403).json({ success: false, message: 'Not a member' });

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
  } catch (err) {
    next(err);
  }
};

export const getEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const events = await GroupEvent.find({ groupId: id })
      .populate('createdBy', 'firstName lastName avatarUrl')
      .sort('startTime');
    res.json({ success: true, data: events });
  } catch (err) {
    next(err);
  }
};
