// ============================================
// FILE: src/controllers/UserController.ts (unchanged)
// ============================================
import { Request, Response } from 'express';
import { User, Transaction, Referral, Notification } from '../models';
import { StorageService } from '../services/StorageService';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';

export class UserController {
  private storageService: StorageService;
  constructor() { this.storageService = StorageService.getInstance(); }

  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select('-password -refreshTokens').populate('referrals', 'firstName lastName displayName avatar level xp').populate('coursesEnrolled', 'title thumbnail slug').populate('certificatesEarned', 'certificateId issueDate course');
      if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
      res.json({ success: true, data: user });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  updateProfile = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const userId = (req as any).user?.userId;
      const { firstName, lastName, bio, emailNotifications, preferredCurrency } = req.body;
      const updateData: any = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (bio !== undefined) updateData.bio = bio;
      if (emailNotifications !== undefined) updateData.emailNotifications = emailNotifications;
      if (preferredCurrency) updateData.preferredCurrency = preferredCurrency;
      if (firstName || lastName) {
        const user = await User.findById(userId);
        updateData.displayName = `${firstName || user?.firstName} ${lastName || user?.lastName}`;
      }
      const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password -refreshTokens');
      res.json({ success: true, data: user, message: 'Profile updated successfully' });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  uploadAvatar = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }
      const avatarUrl = await this.storageService.uploadImage(req.file, `users/${userId}/avatar`);
      const user = await User.findByIdAndUpdate(userId, { avatar: avatarUrl }, { new: true }).select('-password -refreshTokens');
      res.json({ success: true, data: { avatar: user?.avatar }, message: 'Avatar updated successfully' });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getWallet = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select('walletBalance totalEarned totalWithdrawn pendingWithdrawal');
      if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
      const transactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(50);
      res.json({ success: true, data: { balance: user.walletBalance, totalEarned: user.totalEarned, totalWithdrawn: user.totalWithdrawn, pendingWithdrawal: user.pendingWithdrawal, transactions } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getReferralInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select('referralCode referralEarnings referrals');
      if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
      const referrals = await Referral.find({ referrer: userId }).populate('referred', 'firstName lastName displayName email createdAt').sort({ createdAt: -1 });
      const referralLink = `${process.env.FRONTEND_URL}/signup?ref=${user.referralCode}`;
      const totalReferrals = referrals.length;
      const activeReferrals = referrals.filter(r => r.status === 'active').length;
      const totalCommission = user.referralEarnings;
      res.json({ success: true, data: { referralCode: user.referralCode, referralLink, totalReferrals, activeReferrals, totalCommission, referrals: referrals.map(r => ({ id: r._id, referred: r.referred, level: r.level, status: r.status, totalCommission: r.totalCommission, registeredAt: r.registeredAt, firstPurchaseAt: r.firstPurchaseAt })) } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const [notifications, total] = await Promise.all([Notification.find({ user: userId, isDeleted: false }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)), Notification.countDocuments({ user: userId, isDeleted: false })]);
      const unreadCount = await Notification.countDocuments({ user: userId, isRead: false, isDeleted: false });
      res.json({ success: true, data: { notifications, unreadCount, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  markNotificationRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { notificationId } = req.params;
      await Notification.findOneAndUpdate({ _id: notificationId, user: userId }, { isRead: true, readAt: new Date() });
      res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      await Notification.updateMany({ user: userId, isRead: false }, { isRead: true, readAt: new Date() });
      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getLeaderboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const { type = 'xp', period = 'all', limit = 50 } = req.query;
      let sortField = 'xp';
      if (type === 'earnings') sortField = 'totalEarned';
      if (type === 'referrals') sortField = 'referralEarnings';
      const matchStage: any = {};
      if (period === 'week') { const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7); matchStage.lastActiveAt = { $gte: weekAgo }; }
      if (period === 'month') { const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1); matchStage.lastActiveAt = { $gte: monthAgo }; }
      const leaders = await User.find(matchStage).sort({ [sortField]: -1 }).limit(Number(limit)).select('firstName lastName displayName avatar level xp totalEarned referralEarnings');
      res.json({ success: true, data: leaders });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select('xp level streak walletBalance totalEarned').populate('coursesEnrolled', 'title thumbnail progress').populate('certificatesEarned', 'certificateId issueDate');
      if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
      const currentLevelXP = Math.pow(user.level - 1, 2) * 100;
      const nextLevelXP = Math.pow(user.level, 2) * 100;
      const xpToNextLevel = nextLevelXP - user.xp;
      const xpProgress = ((user.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
      const recentTransactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(10);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const weeklyXP = await Transaction.aggregate([{ $match: { user: new mongoose.Types.ObjectId(userId), createdAt: { $gte: weekAgo }, type: 'reward' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
      res.json({ success: true, data: { profile: { level: user.level, xp: user.xp, xpToNextLevel, xpProgress, streak: user.streak }, wallet: { balance: user.walletBalance, totalEarned: user.totalEarned }, learning: { enrolledCourses: user.coursesEnrolled, certificates: user.certificatesEarned, weeklyXP: weeklyXP[0]?.total || 0 }, recentActivity: recentTransactions } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };
}
