import { Request, Response, NextFunction } from 'express';
import Follow from '../models/Follow.js';
import { IUser } from '../models/User.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';

export const followUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const follower = req.user as IUser;
    const { userId } = req.params;
    if (follower._id.toString() === userId) {
      return res.status(400).json({ success: false, message: 'Cannot follow yourself' });
    }
    const existing = await Follow.findOne({ followerId: follower._id, followingId: userId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already following' });
    }
    await Follow.create({ followerId: follower._id, followingId: userId });
    await Notification.create({
      userId,
      title: 'New Follower',
      message: `${follower.firstName} ${follower.lastName} started following you!`,
      type: 'social'
    });
    getIO().to(`user:${userId}`).emit('notification', { title: 'New follower' });
    res.json({ success: true, message: 'Now following' });
  } catch (err) {
    next(err);
  }
};

export const unfollowUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const follower = req.user as IUser;
    const { userId } = req.params;
    await Follow.findOneAndDelete({ followerId: follower._id, followingId: userId });
    res.json({ success: true, message: 'Unfollowed' });
  } catch (err) {
    next(err);
  }
};

export const getFollowers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const followers = await Follow.find({ followingId: userId })
      .populate('followerId', 'firstName lastName username avatarUrl bio');
    res.json({ success: true, data: followers });
  } catch (err) {
    next(err);
  }
};

export const getFollowing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const following = await Follow.find({ followerId: userId })
      .populate('followingId', 'firstName lastName username avatarUrl bio');
    res.json({ success: true, data: following });
  } catch (err) {
    next(err);
  }
};

export const getFollowStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const followersCount = await Follow.countDocuments({ followingId: userId });
    const followingCount = await Follow.countDocuments({ followerId: userId });
    res.json({ success: true, data: { followers: followersCount, following: followingCount } });
  } catch (err) {
    next(err);
  }
};
