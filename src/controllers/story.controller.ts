// ============================================================
// FILE: src/controllers/story.controller.ts (NEW)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Story from '../models/Story.js';
import StoryView from '../models/StoryView.js';
import Follow from '../models/Follow.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { invalidateCache } from '../services/cache.js';

export const createStory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No media file uploaded' });
    }

    const { caption, linkUrl, mediaType } = req.body;
    const isVideo = mediaType === 'video' || req.file.mimetype.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';

    const result = await uploadToCloudinary(req.file.buffer, 'stories', {
      resource_type: resourceType,
    });

    const story = await Story.create({
      userId: user._id,
      mediaUrl: result.secure_url,
      mediaType: isVideo ? 'video' : 'image',
      thumbnailUrl: isVideo ? result.secure_url : undefined,
      caption: caption || '',
      linkUrl: linkUrl || '',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    res.status(201).json({ success: true, data: story });
  } catch (err) {
    next(err);
  }
};

export const getStoryFeed = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const follows = await Follow.find({ followerId: user._id }).select('followingId');
    const followedIds = follows.map(f => f.followingId);

    const stories = await Story.find({
      userId: { $in: [...followedIds, user._id] },
      expiresAt: { $gt: new Date() },
    })
      .populate('userId', 'firstName lastName avatarUrl')
      .sort('-createdAt')
      .lean();

    // Group by user
    const grouped: Record<string, any[]> = {};
    for (const story of stories) {
      const userId = story.userId._id.toString();
      if (!grouped[userId]) grouped[userId] = [];
      grouped[userId].push(story);
    }

    res.json({ success: true, data: grouped });
  } catch (err) {
    next(err);
  }
};

export const getUserStories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const stories = await Story.find({
      userId,
      expiresAt: { $gt: new Date() },
    })
      .populate('userId', 'firstName lastName avatarUrl')
      .sort('-createdAt');

    res.json({ success: true, data: stories });
  } catch (err) {
    next(err);
  }
};

export const viewStory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const existing = await StoryView.findOne({ storyId: id, userId: user._id });
    if (!existing) {
      await StoryView.create({ storyId: id, userId: user._id });
      await Story.findByIdAndUpdate(id, { $inc: { views: 1 } });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const reactToStory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { emoji } = req.body;

    const story = await Story.findById(id);
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    const existing = story.reactions.find(r => r.userId.toString() === user._id.toString());
    if (existing) {
      existing.emoji = emoji;
    } else {
      story.reactions.push({ userId: user._id, emoji });
    }
    await story.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const saveToHighlight = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const story = await Story.findOne({ _id: id, userId: user._id });
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    story.isHighlight = true;
    story.highlightGroup = req.body.highlightGroup || 'Default';
    await story.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const deleteStory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const story = await Story.findOne({ _id: id, userId: user._id });
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    await story.deleteOne();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
