import { Request, Response } from 'express';
import { User, Transaction, Referral, Notification, Course } from '../models';
import { StorageService } from '../services/StorageService';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';

export class UserController {
  private storageService: StorageService;

  constructor() {
    this.storageService = StorageService.getInstance();
  }

  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId)
        .select('-password -refreshTokens')
        .populate('referrals', 'firstName lastName displayName avatar level xp')
        .populate('coursesEnrolled', 'title thumbnail slug')
        .populate('certificatesEarned', 'certificateId issueDate course');
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  updateProfile = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const userId = (req as any).user?.userId;
      const { firstName, lastName, bio, emailNotifications, preferredCurrency, location, phone } = req.body;
      const updateData: any = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (bio !== undefined) updateData.bio = bio;
      if (emailNotifications !== undefined) updateData.emailNotifications = emailNotifications;
      if (preferredCurrency) updateData.preferredCurrency = preferredCurrency;
      if (location) updateData.location = location;
      if (phone) updateData.phone = phone;
      if (firstName || lastName) {
        const user = await User.findById(userId);
        updateData.displayName = `${firstName || user?.firstName} ${lastName || user?.lastName}`;
      }
      const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password -refreshTokens');
      res.json({ success: true, data: user, message: 'Profile updated successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  uploadAvatar = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const avatarUrl = await this.storageService.uploadImage(req.file.buffer, `users/${userId}/avatar`);
      const user = await User.findByIdAndUpdate(userId, { avatar: avatarUrl }, { new: true }).select('-password -refreshTokens');
      res.json({ success: true, data: { avatar: user?.avatar }, message: 'Avatar updated successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  getWallet = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select('walletBalance totalEarned totalWithdrawn pendingWithdrawal preferredCurrency');
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const transactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(50);
      res.json({ success: true, data: { 
        balance: user.walletBalance, 
        totalEarned: user.totalEarned, 
        totalWithdrawn: user.totalWithdrawn, 
        pendingWithdrawal: user.pendingWithdrawal,
        preferredCurrency: user.preferredCurrency,
        transactions 
      } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  getReferralInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select('referralCode referralEarnings referrals affiliateLinks');
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const referrals = await Referral.find({ referrer: userId }).populate('referred', 'firstName lastName displayName email createdAt').sort({ createdAt: -1 });
      const referralLink = `${process.env.FRONTEND_URL}/ref/${user.referralCode}`;
      const totalReferrals = referrals.length;
      const activeReferrals = referrals.filter(r => r.status === 'active').length;
      const totalCommission = user.referralEarnings;
      
      // Calculate affiliate stats
      const affiliateStats = {
        totalClicks: user.affiliateLinks?.reduce((sum, l) => sum + (l.clicks || 0), 0) || 0,
        totalSignups: user.affiliateLinks?.reduce((sum, l) => sum + (l.signups || 0), 0) || 0,
        totalConversions: user.affiliateLinks?.reduce((sum, l) => sum + (l.conversions || 0), 0) || 0,
        totalEarned: user.affiliateLinks?.reduce((sum, l) => sum + (l.totalEarned || 0), 0) || 0,
        activeLinks: user.affiliateLinks?.length || 0
      };
      
      res.json({
        success: true,
        data: {
          referralCode: user.referralCode,
          referralLink,
          totalReferrals,
          activeReferrals,
          totalCommission,
          referrals: referrals.map(r => ({ id: r._id, referred: r.referred, level: r.level, status: r.status, totalCommission: r.totalCommission, registeredAt: r.registeredAt, firstPurchaseAt: r.firstPurchaseAt })),
          affiliateLinks: user.affiliateLinks || [],
          affiliateStats
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  // ✅ Accept affiliate offer and generate unique link
  acceptAffiliateOffer = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { courseId } = req.body;
      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      
      // Check if already accepted
      const existing = user.affiliateLinks?.find(l => l.courseId.toString() === courseId);
      if (existing) {
        res.status(400).json({ success: false, message: 'Affiliate offer already accepted' });
        return;
      }
      
      // Generate unique affiliate link
      const uniqueId = Math.random().toString(36).substr(2, 8);
      const affiliateLink = `${process.env.FRONTEND_URL}/aff/${userId}/${courseId}/${uniqueId}`;
      
      if (!user.affiliateLinks) user.affiliateLinks = [];
      user.affiliateLinks.push({
        courseId: course._id,
        courseTitle: course.title,
        link: affiliateLink,
        clicks: 0,
        signups: 0,
        conversions: 0,
        commissionRate: course.affiliatePercent || 15,
        totalEarned: 0,
        createdAt: new Date()
      });
      await user.save();
      
      res.json({ success: true, data: { link: affiliateLink, courseTitle: course.title, commissionRate: course.affiliatePercent || 15 }, message: 'Affiliate offer accepted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
  };

  // ✅ Track affiliate click
  trackAffiliateClick = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, courseId, code } = req.params;
      const ip = req.ip || req.socket.remoteAddress || '';
      const userAgent = req.get('user-agent') || '';
      
      // Find the affiliate link
      const affiliate = await User.findOne({ 
        _id: userId,
        'affiliateLinks.courseId': courseId,
        'affiliateLinks.link': { $regex: code }
      });
      
      if (!affiliate) {
        // Redirect to course page anyway
        res.redirect(`${process.env.FRONTEND_URL}/#/courses/${courseId}`);
        return;
      }
      
      // Find the specific affiliate link
      const link = affiliate.affiliateLinks.find(l => l.courseId.toString() === courseId);
      if (link) {
        link.clicks = (link.clicks || 0) + 1;
        await affiliate.save();
        
        // Record click
        if (!affiliate.affiliateClicks) affiliate.affiliateClicks = [];
        affiliate.affiliateClicks.push({
          affiliateLinkId: link._id,
          courseId: mongoose.Types.ObjectId(courseId),
          ip,
          userAgent,
          clickedAt: new Date(),
          converted: false
        });
        await affiliate.save();
      }
      
      // Store referral cookie and redirect
      res.cookie('cx_affiliate', `${userId}|${courseId}|${code}`, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, path: '/' });
      res.redirect(`${process.env.FRONTEND_URL}/#/courses/${courseId}`);
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL}/#/courses/${req.params.courseId}`);
    }
  };

  // ✅ Track affiliate conversion (called when user registers via affiliate link)
  trackAffiliateConversion = async (affiliateCode: string, newUserId: string, session?: any): Promise<void> => {
    try {
      const [affiliateId, courseId, code] = affiliateCode.split('|');
      const affiliate = await User.findById(affiliateId).session(session || null);
      if (!affiliate) return;
      
      const link = affiliate.affiliateLinks?.find(l => l.courseId.toString() === courseId);
      if (!link) return;
      
      link.signups = (link.signups || 0) + 1;
      
      // Find the click record and mark as converted
      const click = affiliate.affiliateClicks?.find(c => 
        c.affiliateLinkId.toString() === link._id.toString() && 
        !c.converted
      );
      if (click) {
        click.converted = true;
        click.convertedAt = new Date();
        click.userId = mongoose.Types.ObjectId(newUserId);
      }
      
      await affiliate.save({ session });
    } catch (error) {
      logger.error('Error tracking affiliate conversion:', error);
    }
  };

  getNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const [notifications, total] = await Promise.all([
        Notification.find({ user: userId, isDeleted: false }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
        Notification.countDocuments({ user: userId, isDeleted: false })
      ]);
      const unreadCount = await Notification.countDocuments({ user: userId, isRead: false, isDeleted: false });
      res.json({ success: true, data: { notifications, unreadCount, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  markNotificationRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { notificationId } = req.params;
      await Notification.findOneAndUpdate({ _id: notificationId, user: userId }, { isRead: true, readAt: new Date() });
      res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      await Notification.updateMany({ user: userId, isRead: false }, { isRead: true, readAt: new Date() });
      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
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
      const leaders = await User.find(matchStage).sort({ [sortField]: -1 }).limit(Number(limit)).select('firstName lastName displayName avatar level xp totalEarned referralEarnings streakDays streak');
      res.json({ success: true, data: leaders });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select('xp level streak walletBalance totalEarned preferredCurrency').populate('coursesEnrolled', 'title thumbnail progress').populate('certificatesEarned', 'certificateId issueDate');
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const currentLevelXP = Math.pow(user.level - 1, 2) * 100;
      const nextLevelXP = Math.pow(user.level, 2) * 100;
      const xpToNextLevel = nextLevelXP - user.xp;
      const xpProgress = ((user.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
      const recentTransactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(10);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const weeklyXP = await Transaction.aggregate([{ $match: { user: new mongoose.Types.ObjectId(userId), createdAt: { $gte: weekAgo }, type: 'reward' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
      res.json({ success: true, data: { 
        profile: { level: user.level, xp: user.xp, xpToNextLevel, xpProgress, streak: user.streak, preferredCurrency: user.preferredCurrency }, 
        wallet: { balance: user.walletBalance, totalEarned: user.totalEarned }, 
        learning: { enrolledCourses: user.coursesEnrolled, certificates: user.certificatesEarned, weeklyXP: weeklyXP[0]?.total || 0 }, 
        recentActivity: recentTransactions 
      } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
}
