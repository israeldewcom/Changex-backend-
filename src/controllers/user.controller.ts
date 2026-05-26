// File: src/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import UserBadge from '../models/UserBadge.js';
import Badge from '../models/Badge.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import redis from '../config/redis.js';

export const getProfile = async (req: Request, res: Response) => {
  const user = req.user!;
  res.json({ success: true, data: user });
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allowedUpdates = ['firstName', 'lastName', 'phone', 'bio', 'location', 'bankAccount'];
    const updates = Object.keys(req.body).filter(key => allowedUpdates.includes(key));
    for (const key of updates) {
      (req.user as any)[key] = req.body[key];
    }
    await req.user!.save();
    res.json({ success: true, data: req.user });
  } catch (err) {
    next(err);
  }
};

export const uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const result = await uploadToCloudinary(req.file.path, 'avatars', { transformation: [{ width: 256, height: 256, crop: 'fill' }] });
    req.user!.avatarUrl = result.secure_url;
    await req.user!.save();
    res.json({ success: true, data: { avatarUrl: result.secure_url } });
  } catch (err) {
    next(err);
  }
};

export const getWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transactions = await Transaction.find({ userId: req.user!.id }).sort('-createdAt').limit(50);
    res.json({ success: true, data: { balance: req.user!.walletBalance, pending: req.user!.pendingWithdrawal, transactions } });
  } catch (err) {
    next(err);
  }
};

export const requestWithdrawal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, bankAccount } = req.body;
    if (!req.user!.bankAccount && !bankAccount) {
      return res.status(400).json({ success: false, message: 'Bank account required' });
    }
    if (amount < 2000) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦2,000' });
    }
    if (amount > req.user!.walletBalance) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    req.user!.walletBalance -= amount;
    req.user!.pendingWithdrawal += amount;
    await req.user!.save();

    await Transaction.create({
      userId: req.user!._id,
      type: 'withdrawal',
      amount: -amount,
      status: 'pending',
      description: 'Withdrawal request',
    });

    res.json({ success: true, message: 'Withdrawal request submitted' });
  } catch (err) {
    next(err);
  }
};

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await Notification.find({ userId: req.user!.id }).sort('-createdAt').limit(50);
    res.json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
};

export const markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Notification.updateMany({ userId: req.user!.id, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type = 'xp', limit = 20 } = req.query;
    const cacheKey = `leaderboard:${type}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: JSON.parse(cached) });
    }

    let sortField = 'xp';
    if (type === 'earnings') sortField = 'walletBalance';

    const users = await User.find({})
      .sort({ [sortField]: -1 })
      .limit(Number(limit))
      .select('firstName lastName xp walletBalance level')
      .lean();

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(users));

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

export const getUserBadges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const badges = await UserBadge.find({ userId: req.user!._id }).populate('badgeId');
    res.json({ success: true, data: badges });
  } catch (err) {
    next(err);
  }
};
