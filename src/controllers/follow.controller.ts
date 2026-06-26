import { Request, Response, NextFunction } from 'express';
import Follow from '../models/Follow.js';
import Notification from '../models/Notification.js';
import { IUser } from '../models/User.js';
import { getIO } from '../socket.js';

// ─── Helper: filter out admin users ──────────────────────────────────
async function filterNonAdminUsers(userIds: string[]) {
  const admins = await User.find({ roles: 'admin' }).select('_id');
  const adminIds = admins.map(a => a._id.toString());
  return userIds.filter(id => !adminIds.includes(id));
}

export const followUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { userId } = req.params;

    if (user._id.toString() === userId) {
      return res.status(400).json({ success: false, message: 'Cannot follow yourself' });
    }

    // Check if target is admin – prevent following admins
    const targetUser = await User.findById(userId);
    if (!targetUser || targetUser.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Cannot follow this user' });
    }

    const existing = await Follow.findOne({ followerId: user._id, followingId: userId });
    if (existing) {
      await existing.deleteOne();
      res.json({ success: true, followed: false, message: 'Unfollowed' });
    } else {
      await Follow.create({ followerId: user._id, followingId: userId });

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
    // Filter out admin users from the list
    const filtered = followers.filter(f => {
      const follower = f.followerId as any;
      return follower && !follower.roles?.includes('admin');
    });
    res.json({ success: true, data: filtered.map(f => f.followerId) });
  } catch (err) { next(err); }
};

export const getFollowing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const following = await Follow.find({ followerId: userId })
      .populate('followingId', 'firstName lastName avatarUrl bio')
      .sort('-createdAt');
    // Filter out admin users
    const filtered = following.filter(f => {
      const followed = f.followingId as any;
      return followed && !followed.roles?.includes('admin');
    });
    res.json({ success: true, data: filtered.map(f => f.followingId) });
  } catch (err) { next(err); }
};

export const getFollowStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const followers = await Follow.countDocuments({ followingId: userId });
    const following = await Follow.countDocuments({ followerId: userId });
    // Stats are just counts – no user data exposed
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
