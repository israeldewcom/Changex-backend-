import { Request, Response, NextFunction } from 'express';
import Follow from '../models/Follow.js';
import Notification from '../models/Notification.js';
import { IUser } from '../models/User.js';
import { getIO } from '../socket.js';

export const followUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { userId } = req.params;
    
    if (user._id.toString() === userId) {
      return res.status(400).json({ success: false, message: 'Cannot follow yourself' });
    }
    
    const existing = await Follow.findOne({ followerId: user._id, followingId: userId });
    if (existing) {
      await existing.deleteOne();
      res.json({ success: true, followed: false, message: 'Unfollowed' });
    } else {
      await Follow.create({ followerId: user._id, followingId: userId });
      
      // Notify the followed user
      await Notification.create({
        userId: userId,
        title: 'New Follower',
        message: `${user.firstName} ${user.lastName} started following you!`,
        type: 'system',
        data: { followerId: user._id }
      });
      getIO().to(`user:${userId}`).emit('notification', { title: 'New Follower' });
      
      res.json({ success: true, followed: true, message: 'Followed' });
    }
  } catch (err) { next(err); }
};

export const getFollowers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const followers = await Follow.find({ followingId: userId })
      .populate('followerId', 'firstName lastName avatarUrl bio')
      .sort('-createdAt');
    res.json({ success: true, data: followers.map(f => f.followerId) });
  } catch (err) { next(err); }
};

export const getFollowing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const following = await Follow.find({ followerId: userId })
      .populate('followingId', 'firstName lastName avatarUrl bio')
      .sort('-createdAt');
    res.json({ success: true, data: following.map(f => f.followingId) });
  } catch (err) { next(err); }
};

export const getFollowStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const followers = await Follow.countDocuments({ followingId: userId });
    const following = await Follow.countDocuments({ followerId: userId });
    res.json({ success: true, data: { followers, following } });
  } catch (err) { next(err); }
};

export const checkFollowStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { userId } = req.params;
    const isFollowing = await Follow.exists({ followerId: user._id, followingId: userId });
    res.json({ success: true, data: { isFollowing: !!isFollowing } });
  } catch (err) { next(err); }
};
