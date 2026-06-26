import { Request, Response, NextFunction } from 'express';
import User, { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import Referral from '../models/Referral.js';
import Post from '../models/Post.js';
import Course from '../models/Course.js';
import Follow from '../models/Follow.js';
import ChallengeProgress from '../models/ChallengeProgress.js';
import { uploadToCloudinary } from '../services/cloudinary.js';

export const getProfile = async (req: Request, res: Response) => {
  const user = req.user as IUser;
  res.json({ success: true, data: user });
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const allowedUpdates = ['firstName', 'lastName', 'phone', 'bio', 'location', 'bankAccount', 'preferredCurrency'];
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) (user as any)[key] = req.body[key];
    }
    await user.save();
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

export const uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const user = req.user as IUser;
    const result = await uploadToCloudinary(req.file.buffer, 'avatars', {
      transformation: [{ width: 256, height: 256, crop: 'fill' }],
    });
    user.avatarUrl = result.secure_url;
    await user.save();
    res.json({ success: true, data: { avatarUrl: result.secure_url } });
  } catch (err) { next(err); }
};

export const getWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const transactions = await Transaction.find({ userId: user._id }).sort('-createdAt').limit(50);
    const breakdown = {
      referralEarnings: 0,
      courseBonuses: 0,
      affiliateCommissions: 0,
      instructorEarnings: 0,
      welcomeBonus: 0,
      totalEarnings: 0,
    };
    for (const tx of transactions) {
      const amount = Number(tx.amount) || 0;
      if (amount > 0) {
        switch (tx.type) {
          case 'referral_bonus':
          case 'referral_commission':
            breakdown.referralEarnings += amount;
            break;
          case 'bonus':
            if (tx.description && tx.description.toLowerCase().includes('welcome')) {
              breakdown.welcomeBonus += amount;
            } else {
              breakdown.courseBonuses += amount;
            }
            break;
          case 'affiliate_commission':
            breakdown.affiliateCommissions += amount;
            break;
          case 'instructor_earning':
            breakdown.instructorEarnings += amount;
            break;
        }
      }
    }
    if (user.hasClaimedWelcomeBonus && breakdown.welcomeBonus === 0) {
      breakdown.welcomeBonus = 500;
    }
    breakdown.totalEarnings = breakdown.referralEarnings + breakdown.courseBonuses + breakdown.affiliateCommissions + breakdown.instructorEarnings + breakdown.welcomeBonus;

    const recentTransactions = await Transaction.find({ userId: user._id }).sort('-createdAt').limit(50);
    res.json({
      success: true,
      data: {
        balance: Number(user.walletBalance) || 0,
        pending: Number(user.pendingWithdrawal) || 0,
        transactions: recentTransactions,
        earningsBreakdown: breakdown,
      },
    });
  } catch (err) { next(err); }
};

export const requestWithdrawal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount } = req.body;
    const user = req.user as IUser;
    if (!user.bankAccount) return res.status(400).json({ success: false, message: 'Bank account required' });
    if (amount < 2000) return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦2,000' });
    if (amount > user.walletBalance) return res.status(400).json({ success: false, message: 'Insufficient balance' });
    user.walletBalance -= amount;
    user.pendingWithdrawal += amount;
    await user.save();
    await Transaction.create({ userId: user._id, type: 'withdrawal', amount: -amount, status: 'pending', description: 'Withdrawal request' });
    res.json({ success: true, message: 'Withdrawal request submitted' });
  } catch (err) { next(err); }
};

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const notifications = await Notification.find({ userId: user._id }).sort('-createdAt').limit(100);
    res.json({ success: true, data: notifications });
  } catch (err) { next(err); }
};

export const markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    await Notification.updateMany({ userId: user._id, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type = 'xp', limit = 20 } = req.query;
    let sortField = 'xp';
    if (type === 'earnings') sortField = 'walletBalance';
    const users = await User.find({ roles: { $ne: 'admin' } })
      .sort({ [sortField]: -1 })
      .limit(Number(limit))
      .select('firstName lastName xp walletBalance level avatarUrl streakDays');
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
};

export const getReferrals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const referrals = await Referral.find({ referrerId: user._id }).populate('referredId', 'firstName lastName email');
    const formatted = referrals.map((r: any) => {
      if (!r.referredId) {
        return { id: r._id, name: '⚠️ User Removed', date: r.createdAt, status: 'invalid', earned: r.earned || 0 };
      }
      return {
        id: r._id,
        name: `${r.referredId.firstName || ''} ${r.referredId.lastName || ''}`.trim() || 'User',
        date: r.createdAt,
        status: r.status,
        earned: r.earned || 0,
      };
    });
    res.json({ success: true, data: formatted });
  } catch (err) { next(err); }
};

export const getUserBadges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: [] });
  } catch (err) { next(err); }
};

export const updatePremiumStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isPremium } = req.body;
    const user = req.user as IUser;
    if (isPremium === false && user.isPremium) {
      user.isPremium = false;
      user.subscriptionExpires = undefined;
      await user.save();
    }
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const claimWelcomeBonus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (user.hasClaimedWelcomeBonus) {
      return res.status(400).json({ success: false, message: 'Bonus already claimed' });
    }
    if (!user.bio && !user.location) {
      return res.status(400).json({ success: false, message: 'Complete your profile first' });
    }
    user.walletBalance += 500;
    user.hasClaimedWelcomeBonus = true;
    await user.save();
    await Transaction.create({
      userId: user._id,
      type: 'bonus',
      amount: 500,
      status: 'completed',
      description: 'Welcome bonus',
    });
    res.json({ success: true, message: '₦500 added to your wallet', balance: user.walletBalance });
  } catch (err) { next(err); }
};

export const getUserProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    // If the requested user is admin and the requester is not admin, deny access
    if (user.roles.includes('admin')) {
      const requester = req.user as IUser;
      if (!requester || !requester.roles.includes('admin')) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const posts = await Post.find({ authorId: userId, isPublished: true })
      .populate('authorId', 'firstName lastName avatarUrl')
      .sort('-publishedAt');

    const courses = await Course.find({
      instructorId: userId,
      isPublished: true,
      approvalStatus: 'approved'
    })
      .populate('instructorId', 'firstName lastName avatarUrl')
      .sort('-createdAt');

    const challengeProgress = await ChallengeProgress.find({ userId: userId })
      .populate('challengeId', 'title status startDate endDate rewardXP');

    let isFollowing = false;
    if (req.user) {
      const follow = await Follow.findOne({
        followerId: (req.user as IUser)._id,
        followingId: userId
      });
      isFollowing = !!follow;
    }

    const followersCount = await Follow.countDocuments({ followingId: userId });
    const followingCount = await Follow.countDocuments({ followerId: userId });

    // Remove roles from public profile (except for self or admin)
    const publicUser = user.toObject ? user.toObject() : user;
    const responseUser = { ...publicUser };
    if (req.user && (req.user as IUser)._id.toString() !== userId && !(req.user as IUser).roles.includes('admin')) {
      delete (responseUser as any).roles;
    }

    res.json({
      success: true,
      data: {
        user: responseUser,
        posts,
        courses,
        challengeProgress,
        isFollowing,
        followersCount,
        followingCount,
      }
    });
  } catch (err) {
    next(err);
  }
};
