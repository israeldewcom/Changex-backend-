// src/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import User, { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import Referral from '../models/Referral.js';
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
  } catch (err) {
    next(err);
  }
};

export const uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }
    const user = req.user as IUser;
    const result = await uploadToCloudinary(req.file.buffer, 'avatars', {
      transformation: [{ width: 256, height: 256, crop: 'fill' }],
    });
    user.avatarUrl = result.secure_url;
    await user.save();
    res.json({ success: true, data: { avatarUrl: result.secure_url } });
  } catch (err) {
    next(err);
  }
};

export const getWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const transactions = await Transaction.find({ userId: user._id }).sort('-createdAt').limit(50);
    res.json({
      success: true,
      data: { balance: user.walletBalance, pending: user.pendingWithdrawal, transactions },
    });
  } catch (err) {
    next(err);
  }
};

export const requestWithdrawal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, bankAccount } = req.body;
    const user = req.user as IUser;
    if (!user.bankAccount && !bankAccount) {
      res.status(400).json({ success: false, message: 'Bank account required' });
      return;
    }
    if (amount < 2000) {
      res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦2,000' });
      return;
    }
    if (amount > user.walletBalance) {
      res.status(400).json({ success: false, message: 'Insufficient balance' });
      return;
    }
    user.walletBalance -= amount;
    user.pendingWithdrawal += amount;
    await user.save();
    await Transaction.create({
      userId: user._id,
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
    const user = req.user as IUser;
    const notifications = await Notification.find({ userId: user._id }).sort('-createdAt').limit(50);
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
    const user = req.user as IUser;
    await Notification.updateMany({ userId: user._id, read: false }, { read: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

export const getUserBadges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Placeholder – implement badge logic if a Badge model exists later
    res.json({ success: true, data: [] });
  } catch (err) {
    next(err);
  }
};

export const getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type = 'xp', limit = 20 } = req.query;
    let sortField = 'xp';
    if (type === 'earnings') sortField = 'walletBalance';
    const users = await User.find({})
      .sort({ [sortField]: -1 })
      .limit(Number(limit))
      .select('firstName lastName xp walletBalance level avatarUrl streakDays');
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

export const getReferrals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const referrals = await Referral.find({ referrerId: user._id }).populate('referredId', 'firstName lastName email');
    const formatted = referrals.map((r: any) => ({
      id: r._id,
      name: r.referredId ? `${r.referredId.firstName} ${r.referredId.lastName}` : 'User',
      date: r.createdAt,
      status: r.status,
      earned: r.earned,
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};
