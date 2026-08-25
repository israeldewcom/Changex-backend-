// ============================================================
// FILE: src/controllers/group-post.controller.ts (COMPLETE FIXED)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Group from '../models/Group.js';
import GroupMember from '../models/GroupMember.js';
import GroupPost from '../models/GroupPost.js';
import GroupComment from '../models/GroupComment.js';
import GroupLike from '../models/GroupLike.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';

// ─── CREATE POST ──────────────────────────────────────────────────────
export const createGroupPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { groupId } = req.params;
    const { content, media, linkPreview } = req.body;

    const member = await GroupMember.findOne({ groupId, userId: user._id });
    if (!member || member.status !== 'active') {
      return res.status(403).json({ success: false, message: 'You are not an active member of this group' });
    }

    if (member.mutedUntil && member.mutedUntil > new Date()) {
      return res.status(403).json({ success: false, message: `You are muted until ${member.mutedUntil}` });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const needsApproval = group.settings?.postApproval || false;

    const post = await GroupPost.create({
      groupId,
      authorId: user._id,
      content,
      media: media || [],
      linkPreview: linkPreview || undefined,
      isPublished: !needsApproval,
      isPinned: false,
      isAnnouncement: false,
    });

    if (needsApproval) {
      const admins = await GroupMember.find({ groupId, role: { $in: ['admin', 'moderator'] } });
      for (const admin of admins) {
        await Notification.create({
          userId: admin.userId,
          title: 'New Post Pending Approval',
          message: `${user.firstName} posted in "${group.name}"`,
          type: 'system',
          data: { groupId, postId: post._id },
        });
        getIO().to(`user:${admin.userId}`).emit('notification', {
          title: 'New Post Pending Approval',
          message: `${user.firstName} posted in "${group.name}"`,
        });
      }
    } else {
      const members = await GroupMember.find({ groupId, userId: { $ne: user._id } });
      for (const m of members) {
        await Notification.create({
          userId: m.userId,
          title: 'New Post in Group',
          message: `${user.firstName} posted in "${group.name}"`,
          type: 'system',
          data: { groupId, postId: post._id },
        });
        getIO().to(`user:${m.userId}`).emit('notification', {
          title: 'New Group Post',
          message: `${user.firstName} posted in "${group.name}"`,
        });
      }
      getIO().to(`group:${groupId}`).emit('new_group_post', post);
    }

    res.status(201).json({ success: true, data: post });
  } catch (err) { next(err); }
};

// ─── GET POSTS ──────────────────────────────────────────────────────
export const getGroupPosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const user = req.user as IUser;

    const member = await GroupMember.findOne({ groupId, userId: user._id });
    if (!member || member.status !== 'active') {
      return res.status(403).json({ success: false, message: 'You are not an active member of this group' });
    }

    const filter: any = { groupId };
    const group = await Group.findById(groupId);
    if (group?.settings?.postApproval && member.role !== 'admin' && member.role !== 'moderator') {
      filter.isPublished = true;
    }

    const posts = await GroupPost.find(filter)
      .populate('authorId', 'firstName lastName avatarUrl')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const postIds = posts.map(p => p._id);
    const likes = await GroupLike.find({ userId: user._id, targetId: { $in: postIds }, targetType: 'post' });
    const likedMap = likes.reduce((acc, l) => { acc[l.targetId.toString()] = true; return acc; }, {} as Record<string, boolean>);

    const postsWithLikes = posts.map(p => ({
      ...p.toObject(),
      userLiked: !!likedMap[p._id.toString()],
    }));

    const total = await GroupPost.countDocuments(filter);

    res.json({
      success: true,
      data: postsWithLikes,
      pagination: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (err) { next(err); }
};

// ─── DELETE POST ──────────────────────────────────────────────────
export const deleteGroupPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { postId } = req.params;

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const member = await GroupMember.findOne({ groupId: post.groupId, userId: user._id });
    if (!member) {
      return res.status(403).json({ success: false, message: 'Not a member of this group' });
    }

    const isAuthor = post.authorId.toString() === user._id.toString();
    const isMod = member.role === 'admin' || member.role === 'moderator';
    if (!isAuthor && !isMod) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await GroupComment.deleteMany({ postId });
    await GroupLike.deleteMany({ targetId: postId, targetType: 'post' });
    await post.deleteOne();

    res.json({ success: true, message: 'Post deleted' });
  } catch (err) { next(err); }
};

// ─── COMMENT ON POST ──────────────────────────────────────────────
export const commentOnPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { postId } = req.params;
    const { content, parentId } = req.body;

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const member = await GroupMember.findOne({ groupId: post.groupId, userId: user._id });
    if (!member || member.status !== 'active') {
      return res.status(403).json({ success: false, message: 'You are not an active member of this group' });
    }

    if (member.mutedUntil && member.mutedUntil > new Date()) {
      return res.status(403).json({ success: false, message: `You are muted until ${member.mutedUntil}` });
    }

    const group = await Group.findById(post.groupId);
    const needsApproval = group?.settings?.commentApproval || false;

    const comment = await GroupComment.create({
      postId,
      userId: user._id,
      content,
      parentId: parentId || undefined,
    });

    await GroupPost.findByIdAndUpdate(postId, { $inc: { comments: 1 } });

    if (post.authorId.toString() !== user._id.toString()) {
      await Notification.create({
        userId: post.authorId,
        title: 'New Comment on Your Post',
        message: `${user.firstName} commented on your post`,
        type: 'system',
        data: { postId, commentId: comment._id },
      });
      getIO().to(`user:${post.authorId}`).emit('notification', {
        title: 'New Comment',
        message: `${user.firstName} commented on your post`,
      });
    }

    if (parentId) {
      const parent = await GroupComment.findById(parentId);
      if (parent && parent.userId.toString() !== user._id.toString()) {
        await Notification.create({
          userId: parent.userId,
          title: 'New Reply',
          message: `${user.firstName} replied to your comment`,
          type: 'system',
          data: { postId, commentId: comment._id },
        });
        getIO().to(`user:${parent.userId}`).emit('notification', {
          title: 'New Reply',
          message: `${user.firstName} replied to your comment`,
        });
      }
    }

    res.status(201).json({ success: true, data: comment });
  } catch (err) { next(err); }
};

// ─── LIKE POST ──────────────────────────────────────────────────────
export const likePost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { postId } = req.params;

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const member = await GroupMember.findOne({ groupId: post.groupId, userId: user._id });
    if (!member || member.status !== 'active') {
      return res.status(403).json({ success: false, message: 'You are not an active member of this group' });
    }

    const existing = await GroupLike.findOne({
      userId: user._id,
      targetId: postId,
      targetType: 'post',
    });

    let liked = false;
    let newCount = post.likes;

    if (existing) {
      await existing.deleteOne();
      newCount = Math.max(0, post.likes - 1);
      liked = false;
    } else {
      await GroupLike.create({
        userId: user._id,
        targetId: postId,
        targetType: 'post',
      });
      newCount = post.likes + 1;
      liked = true;
    }

    await GroupPost.findByIdAndUpdate(postId, { likes: newCount });

    res.json({ success: true, liked, likes: newCount });
  } catch (err) { next(err); }
};
