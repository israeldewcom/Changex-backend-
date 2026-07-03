// ============================================================
// FILE: src/controllers/admin.controller.ts (COMPLETE – FULLY FIXED)
// ============================================================

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User, { IUser } from '../models/User.js';
import Course from '../models/Course.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import AdminCoupon from '../models/AdminCoupon.js';
import Announcement from '../models/Announcement.js';
import ManualPayment from '../models/ManualPayment.js';
import Enrollment from '../models/Enrollment.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';
import Follow from '../models/Follow.js';
import Challenge from '../models/Challenge.js';
import Ad from '../models/Ad.js';
import ChallengeProgress from '../models/ChallengeProgress.js';
import PostAnalytics from '../models/PostAnalytics.js';
import SocialEarningsConfig from '../models/SocialEarningsConfig.js';
import Book from '../models/Book.js';
import Referral from '../models/Referral.js';
import AffiliateLink from '../models/AffiliateLink.js';
import Rating from '../models/Rating.js';
import { getIO } from '../socket.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { invalidateCache } from '../services/cache.js';

// ==================== DASHBOARD ====================
export const getDashboard = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCourses = await Course.countDocuments({ approvalStatus: 'approved' });
    const pendingCourses = await Course.countDocuments({ approvalStatus: 'pending' });
    
    let totalRevenue = 0;
    try {
      const revenueAgg = await Transaction.aggregate([
        { $match: { type: { $ne: 'withdrawal' }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      totalRevenue = revenueAgg[0]?.total || 0;
    } catch (aggErr) {
      console.error('Aggregation error:', aggErr);
    }
    
    const pendingWithdrawals = await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });
    const pendingManualPayments = await ManualPayment.countDocuments({ status: 'pending_review' });
    const pendingChallengeCompletions = await ChallengeProgress.countDocuments({ status: 'in_progress' });
    const totalSocialEarningsPool = await PostAnalytics.aggregate([{ $group: { _id: null, total: { $sum: '$earnings' } } }]);
    
    res.json({ 
      success: true, 
      data: { 
        totalUsers, 
        totalCourses, 
        pendingCourses, 
        totalRevenue, 
        pendingWithdrawals,
        pendingManualPayments,
        pendingChallengeCompletions,
        totalSocialEarnings: totalSocialEarningsPool[0]?.total || 0,
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ==================== USER MANAGEMENT ====================
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { limit = 100, search = '' } = req.query;
    const filter: any = {};
    
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(filter)
      .select('-passwordHash')
      .limit(Number(limit))
      .sort('-createdAt');
    
    const stats = {
      total: await User.countDocuments(),
      active: await User.countDocuments({ isBanned: false }),
      banned: await User.countDocuments({ isBanned: true }),
      premium: await User.countDocuments({ isPremium: true }),
      instructors: await User.countDocuments({ roles: 'instructor' }),
    };
    
    res.json({ success: true, data: { users, stats } });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const transactions = await Transaction.find({ userId: user._id }).sort('-createdAt').limit(50);
    const enrollments = await Enrollment.find({ userId: user._id }).populate('courseId', 'title');
    const manualPayments = await ManualPayment.find({ userId: user._id }).sort('-createdAt');
    
    res.json({ 
      success: true, 
      data: { 
        user, 
        transactions, 
        enrollments,
        manualPayments
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { roles, isApprovedInstructor, isBanned } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id, 
      { roles, isApprovedInstructor, isBanned }, 
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    await Notification.create({
      userId: user._id,
      title: 'Account Role Updated',
      message: `Your account role has been updated to: ${roles.join(', ')}`,
      type: 'system',
    });
    
    res.json({ success: true, data: user });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const toggleUserBan = async (req: Request, res: Response) => {
  try {
    const { isBanned, reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id, 
      { isBanned }, 
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    await Notification.create({
      userId: user._id,
      title: isBanned ? 'Account Suspended' : 'Account Reactivated',
      message: isBanned 
        ? `Your account has been suspended. Reason: ${reason || 'Violation of terms'}`
        : 'Your account has been reactivated. You can now log in again.',
      type: 'system',
    });
    
    res.json({ success: true, data: user });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const approveInstructor = async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId, 
      { isApprovedInstructor: true, $addToSet: { roles: 'instructor' } }, 
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    await Notification.create({ 
      userId: user._id, 
      title: 'Instructor Approved', 
      message: 'Congratulations! You can now create and sell courses on ChangeX Academy.', 
      type: 'system' 
    });
    
    getIO().to(`user:${user._id}`).emit('notification', { 
      title: 'Instructor Access Granted',
      message: 'You can now create courses!'
    });
    
    res.json({ success: true, data: user });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

// ==================== COURSE MANAGEMENT ====================
export const getAdminCourses = async (req: Request, res: Response) => {
  try {
    const { status, limit = 100 } = req.query;
    const filter: any = {};
    
    if (status === 'pending') filter.approvalStatus = 'pending';
    if (status === 'approved') filter.approvalStatus = 'approved';
    if (status === 'rejected') filter.approvalStatus = 'rejected';
    
    const courses = await Course.find(filter)
      .populate('instructorId', 'firstName lastName email')
      .sort('-createdAt')
      .limit(Number(limit));
    
    const stats = {
      total: await Course.countDocuments(),
      pending: await Course.countDocuments({ approvalStatus: 'pending' }),
      approved: await Course.countDocuments({ approvalStatus: 'approved' }),
      rejected: await Course.countDocuments({ approvalStatus: 'rejected' }),
      published: await Course.countDocuments({ isPublished: true }),
    };
    
    res.json({ success: true, data: { courses, stats } });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const getCourseDetails = async (req: Request, res: Response) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('instructorId', 'firstName lastName email phone bankAccount');
    
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    
    const enrollments = await Enrollment.find({ courseId: course._id })
      .populate('userId', 'firstName lastName email');
    
    const transactions = await Transaction.find({ 
      type: 'course_purchase',
      metadata: { courseId: course._id }
    }).sort('-createdAt');
    
    const ratings = await Rating.find({ courseId: course._id }).populate('userId', 'firstName lastName');
    
    res.json({ success: true, data: { course, enrollments, transactions, ratings } });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const approveCourse = async (req: Request, res: Response) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id, 
      { approvalStatus: 'approved', isPublished: true }, 
      { new: true }
    );
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    // ─── Invalidate course list cache ──────────────────────────────────
    await invalidateCache('courses:*');
    await invalidateCache(`course:${course._id}`);
    await invalidateCache(`course:${course.slug}`);
    
    if (course.instructorId) {
      await Notification.create({ 
        userId: course.instructorId, 
        title: 'Course Approved', 
        message: `Great news! Your course "${course.title}" has been approved and is now live on ChangeX Academy.`, 
        type: 'system' 
      });
      getIO().to(`user:${course.instructorId}`).emit('notification', { 
        title: 'Course Approved', 
        message: `Your course "${course.title}" is now live!`
      });
    }
    
    res.json({ success: true, message: 'Course approved and published', data: course });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const rejectCourse = async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const course = await Course.findByIdAndUpdate(
      req.params.id, 
      { approvalStatus: 'rejected', rejectionReason: reason, isPublished: false }, 
      { new: true }
    );
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    // ─── Invalidate course list cache ──────────────────────────────────
    await invalidateCache('courses:*');
    await invalidateCache(`course:${course._id}`);
    await invalidateCache(`course:${course.slug}`);
    
    if (course.instructorId) {
      await Notification.create({ 
        userId: course.instructorId, 
        title: 'Course Rejected', 
        message: `Your course "${course.title}" was not approved. Reason: ${reason || 'Not specified'}. Please make the necessary changes and resubmit.`, 
        type: 'system' 
      });
      getIO().to(`user:${course.instructorId}`).emit('notification', { 
        title: 'Course Needs Changes',
        message: `Your course "${course.title}" needs revisions.`
      });
    }
    
    res.json({ success: true, message: 'Course rejected', data: course });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

// ==================== WITHDRAWAL MANAGEMENT ====================
export const getWithdrawals = async (req: Request, res: Response) => {
  try {
    const { status, limit = 100 } = req.query;
    const filter: any = { type: 'withdrawal' };
    if (status && status !== 'all') filter.status = status;
    
    const withdrawals = await Transaction.find(filter)
      .populate('userId', 'firstName lastName email phone bankAccount')
      .sort('-createdAt')
      .limit(Number(limit));
    
    const stats = {
      pending: await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' }),
      completed: await Transaction.countDocuments({ type: 'withdrawal', status: 'completed' }),
      failed: await Transaction.countDocuments({ type: 'withdrawal', status: 'failed' }),
      totalAmount: await Transaction.aggregate([
        { $match: { type: 'withdrawal', status: 'completed' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
      ])
    };
    
    res.json({ success: true, data: { withdrawals, stats } });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const processWithdrawal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, adminNote } = req.body;
    const admin = req.user as any;
    
    const tx = await Transaction.findById(id);
    if (!tx || tx.type !== 'withdrawal') {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }
    
    if (tx.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Withdrawal already processed' });
    }
    
    if (action === 'approve') {
      tx.status = 'completed';
      tx.metadata = { ...tx.metadata, adminNote, processedBy: admin._id, processedAt: new Date() };
      await tx.save();
      
      await Notification.create({
        userId: tx.userId,
        title: 'Withdrawal Approved',
        message: `Your withdrawal of ₦${Math.abs(tx.amount).toLocaleString()} has been approved and will be sent to your bank account within 1-3 business days.`,
        type: 'payment',
      });
      
      getIO().to(`user:${tx.userId}`).emit('notification', { 
        title: 'Withdrawal Processed',
        message: 'Your withdrawal has been approved.'
      });
      
    } else if (action === 'reject') {
      tx.status = 'failed';
      tx.metadata = { ...tx.metadata, adminNote, rejectedBy: admin._id, rejectedAt: new Date() };
      await tx.save();
      
      const user = await User.findById(tx.userId);
      if (user) {
        user.walletBalance = (user.walletBalance || 0) + Math.abs(tx.amount);
        user.pendingWithdrawal = Math.max(0, (user.pendingWithdrawal || 0) - Math.abs(tx.amount));
        await user.save();
      }
      
      await Notification.create({
        userId: tx.userId,
        title: 'Withdrawal Rejected',
        message: `Your withdrawal request was rejected. Reason: ${adminNote || 'Not specified'}. Funds have been returned to your wallet.`,
        type: 'payment',
      });
      
      getIO().to(`user:${tx.userId}`).emit('notification', { 
        title: 'Withdrawal Update',
        message: 'Your withdrawal request was not approved.'
      });
    }
    
    res.json({ success: true, message: `Withdrawal ${action}d successfully` });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

// ==================== ANNOUNCEMENTS ====================
export const createAnnouncement = async (req: Request, res: Response) => {
  try {
    const { title, message, sendEmail = false } = req.body;
    
    const announcement = await Announcement.create({ title, message });
    
    getIO().emit('announcement', { title, content: message, createdAt: new Date() });
    
    const users = await User.find({}, '_id');
    await Notification.insertMany(
      users.map(u => ({ 
        userId: u._id, 
        title, 
        message, 
        type: 'system' 
      }))
    );
    
    res.status(201).json({ success: true, message: 'Announcement sent to all users', data: announcement });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const getAnnouncements = async (req: Request, res: Response) => {
  try {
    const announcements = await Announcement.find().sort('-createdAt').limit(50);
    res.json({ success: true, data: announcements });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const deleteAnnouncement = async (req: Request, res: Response) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getPublicAnnouncements = async (req: Request, res: Response) => {
  try {
    const announcements = await Announcement.find().sort('-createdAt').limit(5);
    res.json({ success: true, data: announcements });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

// ==================== COUPONS ====================
export const getCoupons = async (req: Request, res: Response) => {
  try { 
    const coupons = await AdminCoupon.find({}).sort('-createdAt');
    res.json({ success: true, data: coupons }); 
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const createCoupon = async (req: Request, res: Response) => {
  try {
    const { code, discountType, discountValue, usageLimit, validUntil } = req.body;
    
    const existing = await AdminCoupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }
    
    const coupon = await AdminCoupon.create({
      code: code.toUpperCase(),
      discountType: discountType || 'percentage',
      discountValue,
      usageLimit: usageLimit || 0,
      validUntil: validUntil ? new Date(validUntil) : undefined,
    });
    
    res.status(201).json({ success: true, data: coupon });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const updateCoupon = async (req: Request, res: Response) => {
  try {
    const coupon = await AdminCoupon.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    res.json({ success: true, data: coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const deleteCoupon = async (req: Request, res: Response) => {
  try { 
    await AdminCoupon.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Coupon deleted' }); 
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

// ==================== MANUAL PAYMENTS ====================
export const getPendingManualPayments = async (req: Request, res: Response) => {
  try {
    const payments = await ManualPayment.find({ status: 'pending_review' })
      .populate('userId', 'firstName lastName email phone')
      .populate('courseId', 'title price')
      .sort('-createdAt');
    
    const stats = {
      pending: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
    };
    
    res.json({ success: true, data: { payments, stats } });
  } catch (err) {
    console.error('Get pending manual payments error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getAllManualPayments = async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const filter: any = {};
    
    if (status && status !== 'all') filter.status = status;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const payments = await ManualPayment.find(filter)
      .populate('userId', 'firstName lastName email phone')
      .populate('courseId', 'title price')
      .populate('approvedBy', 'firstName lastName email')
      .sort('-createdAt')
      .skip(skip)
      .limit(Number(limit));
    
    const total = await ManualPayment.countDocuments(filter);
    
    const stats = {
      pending: await ManualPayment.countDocuments({ status: 'pending_review' }),
      approved: await ManualPayment.countDocuments({ status: 'approved' }),
      rejected: await ManualPayment.countDocuments({ status: 'rejected' }),
      totalAmount: await ManualPayment.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      weekly: await ManualPayment.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { 
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, 
          count: { $sum: 1 }, 
          amount: { $sum: '$amount' } 
        }},
        { $sort: { _id: 1 } }
      ]),
    };
    
    res.json({ 
      success: true, 
      data: { payments, stats, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } } 
    });
  } catch (err) {
    console.error('Get all manual payments error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getManualPaymentStats = async (req: Request, res: Response) => {
  try {
    const stats = {
      pending: await ManualPayment.countDocuments({ status: 'pending_review' }),
      approved: await ManualPayment.countDocuments({ status: 'approved' }),
      rejected: await ManualPayment.countDocuments({ status: 'rejected' }),
      totalApprovedAmount: await ManualPayment.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      byType: await ManualPayment.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 }, amount: { $sum: '$amount' } } }
      ]),
      autoDetected: await ManualPayment.countDocuments({ autoDetected: true }),
      manualReviewed: await ManualPayment.countDocuments({ autoDetected: false, status: { $ne: 'pending_review' } }),
      last7Days: await ManualPayment.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { 
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, 
          count: { $sum: 1 }, 
          amount: { $sum: '$amount' } 
        }},
        { $sort: { _id: 1 } }
      ]),
    };
    
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('Get manual payment stats error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getManualPaymentById = async (req: Request, res: Response) => {
  try {
    const payment = await ManualPayment.findById(req.params.id)
      .populate('userId', 'firstName lastName email phone bankAccount')
      .populate('courseId', 'title price description')
      .populate('approvedBy', 'firstName lastName email');
    
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    
    res.json({ success: true, data: payment });
  } catch (err) {
    console.error('Get manual payment by ID error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ==================== APPROVE MANUAL PAYMENT ====================
export const approveManualPayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;
    const admin = req.user as any;

    const payment = await ManualPayment.findById(id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.status !== 'pending_review') {
      return res.status(400).json({ success: false, message: `Payment already ${payment.status}` });
    }

    // ─── COURSE PURCHASE ──────────────────────────────────────────────────
    if (payment.type === 'course') {
      const course = await Course.findById(payment.metadata?.courseId || payment.courseId);
      if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

      // Enroll user
      const existingEnrollment = await Enrollment.findOne({ userId: payment.userId, courseId: course._id });
      if (!existingEnrollment) {
        await Enrollment.create({ userId: payment.userId, courseId: course._id });
        course.totalStudents += 1;
        await course.save();
      }

      let affiliateCommission = 0;
      let affiliateUserId = null;

      // 1. Check for explicit affiliate code first
      const affiliateCode = payment.metadata?.affiliateCode;
      if (affiliateCode) {
        const affiliateLink = await AffiliateLink.findOne({ code: affiliateCode });
        if (affiliateLink) {
          const percent = course.affiliatePercent || 15;
          affiliateCommission = (course.salePrice || course.price || 0) * (percent / 100);
          affiliateLink.conversions += 1;
          affiliateLink.totalEarned = (affiliateLink.totalEarned || 0) + affiliateCommission;
          await affiliateLink.save();
          affiliateUserId = affiliateLink.userId;
        }
      }

      // 2. If no affiliate code but referral code exists, treat referral as affiliate
      const referralCode = payment.metadata?.referralCode;
      if (!affiliateCode && referralCode && course.hasAffiliate && course.affiliatePercent > 0) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== payment.userId.toString()) {
          const percent = course.affiliatePercent || 15;
          affiliateCommission = (course.salePrice || course.price || 0) * (percent / 100);
          affiliateUserId = referrer._id;
        }
      }

      // 3. Credit affiliate (if any)
      if (affiliateUserId && affiliateCommission > 0) {
        const affiliate = await User.findById(affiliateUserId);
        if (affiliate) {
          affiliate.walletBalance = (affiliate.walletBalance || 0) + affiliateCommission;
          await affiliate.save();
          await Transaction.create({
            userId: affiliate._id,
            type: 'affiliate_commission',
            amount: affiliateCommission,
            status: 'completed',
            description: `Commission for course: ${course.title} (manual ${affiliateCode ? 'affiliate' : 'referral affiliate'})`,
            reference: payment.reference,
            metadata: { courseId: course._id },
          });
        }
      }

      // 4. Referral bonus (only if no affiliate commission was given)
      const netAmount = (course.salePrice || course.price || 0) - affiliateCommission;
      let referralBonus = 0;
      if (!affiliateCommission && referralCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== payment.userId.toString()) {
          referralBonus = netAmount * 0.1;
          referrer.walletBalance = (referrer.walletBalance || 0) + referralBonus;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_commission',
            amount: referralBonus,
            status: 'completed',
            description: `Referral commission for course: ${course.title} (manual)`,
            reference: payment.reference,
            metadata: { courseId: course._id },
          });
        }
      }

      // 5. Instructor earnings (80% of net after affiliate commission)
      const instructorShare = netAmount * 0.8;
      if (course.instructorId) {
        const instructor = await User.findById(course.instructorId);
        if (instructor) {
          instructor.walletBalance = (instructor.walletBalance || 0) + instructorShare;
          await instructor.save();
          await Transaction.create({
            userId: instructor._id,
            type: 'instructor_earning',
            amount: instructorShare,
            status: 'completed',
            description: `Manual course sale (net after affiliate): ${course.title}`,
            reference: payment.reference,
            metadata: { courseId: course._id },
          });
        }
      }

      // User purchase transaction
      await Transaction.create({
        userId: payment.userId,
        type: 'course_purchase',
        amount: payment.amount,
        status: 'completed',
        description: `Manual purchase of course: ${course.title}`,
        reference: payment.reference,
        metadata: { courseId: course._id },
      });
    }

    // ─── SUBSCRIPTION ──────────────────────────────────────────────────────
    else if (payment.type === 'subscription') {
      await User.findByIdAndUpdate(payment.userId, {
        isPremium: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await Transaction.create({
        userId: payment.userId,
        type: 'subscription',
        amount: payment.amount,
        status: 'completed',
        description: 'Manual premium subscription (admin approved)',
        reference: payment.reference,
      });

      // Referral bonus ₦500
      const referralCode = payment.metadata?.referralCode;
      if (referralCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== payment.userId.toString()) {
          referrer.walletBalance = (referrer.walletBalance || 0) + 500;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_bonus',
            amount: 500,
            status: 'completed',
            description: `Referral bonus for new subscriber (manual approval)`,
            reference: payment.reference,
          });
          await Referral.findOneAndUpdate(
            { referredId: payment.userId, status: 'pending' },
            { status: 'converted', earned: 500 }
          );
        }
      }
    }

    // ─── BOOK PURCHASE ──────────────────────────────────────────────────────
    else if (payment.type === 'book') {
      const bookId = payment.metadata?.bookId;
      if (!bookId) return res.status(400).json({ success: false, message: 'Book ID missing in metadata' });
      const book = await Book.findById(bookId);
      if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

      // --- Revenue Split ---
      const price = book.price || 0;
      let affiliateCommission = 0;
      let affiliateUserId = null;

      // 1. Check affiliate code
      const affiliateCode = payment.metadata?.affiliateCode;
      if (affiliateCode) {
        const affiliateLink = await AffiliateLink.findOne({ code: affiliateCode });
        if (affiliateLink) {
          const targetId = affiliateLink.bookId || affiliateLink.courseId;
          if (targetId && targetId.toString() === book._id.toString()) {
            const percent = book.affiliatePercent || 0;
            affiliateCommission = price * (percent / 100);
            affiliateLink.conversions += 1;
            affiliateLink.totalEarned = (affiliateLink.totalEarned || 0) + affiliateCommission;
            await affiliateLink.save();
            affiliateUserId = affiliateLink.userId;
          }
        }
      }

      // 2. Admin share (20% of remaining after affiliate)
      const remainingAfterAffiliate = price - affiliateCommission;
      const adminShare = remainingAfterAffiliate * 0.20;
      const authorShare = remainingAfterAffiliate - adminShare;

      // 3. Credit author
      if (authorShare > 0) {
        const author = await User.findById(book.authorId);
        if (author) {
          author.walletBalance = (author.walletBalance || 0) + authorShare;
          await author.save();
          await Transaction.create({
            userId: author._id,
            type: 'book_author_earning',
            amount: authorShare,
            status: 'completed',
            description: `Earnings from book: ${book.title} (manual)`,
            reference: payment.reference,
            metadata: { bookId: book._id },
          });
        }
      }

      // 4. Credit affiliate
      if (affiliateUserId && affiliateCommission > 0) {
        const affiliate = await User.findById(affiliateUserId);
        if (affiliate) {
          affiliate.walletBalance = (affiliate.walletBalance || 0) + affiliateCommission;
          await affiliate.save();
          await Transaction.create({
            userId: affiliate._id,
            type: 'affiliate_commission',
            amount: affiliateCommission,
            status: 'completed',
            description: `Affiliate commission for book: ${book.title} (manual)`,
            reference: payment.reference,
            metadata: { bookId: book._id },
          });
        }
      }

      // 5. Credit admin/platform (20%)
      const adminUser = await User.findOne({ roles: 'admin' });
      if (adminUser && adminShare > 0) {
        adminUser.walletBalance = (adminUser.walletBalance || 0) + adminShare;
        await adminUser.save();
        await Transaction.create({
          userId: adminUser._id,
          type: 'platform_fee',
          amount: adminShare,
          status: 'completed',
          description: `Platform fee (20%) for book: ${book.title} (manual)`,
          reference: payment.reference,
          metadata: { bookId: book._id },
        });
      }

      // 6. Record user purchase
      await Transaction.create({
        userId: payment.userId,
        type: 'book_purchase',
        amount: payment.amount,
        status: 'completed',
        description: `Manual purchase of book: ${book.title}`,
        reference: payment.reference,
        metadata: { bookId: book._id },
      });

      // 7. Increment downloads
      book.downloads = (book.downloads || 0) + 1;
      await book.save();

      // 8. Mark purchase record for future downloads
      await ArticlePurchase.findOneAndUpdate(
        { userId: payment.userId, postId: book._id },
        { status: 'completed', completedAt: new Date() },
        { upsert: true }
      );
    }

    payment.status = 'approved';
    payment.adminNote = adminNote;
    payment.approvedBy = admin._id;
    payment.approvedAt = new Date();
    await payment.save();

    await Notification.create({
      userId: payment.userId,
      title: '✅ Manual Payment Approved',
      message: `Your manual payment of ₦${payment.amount.toLocaleString()} has been approved. You now have access to ${payment.type === 'subscription' ? 'Premium features' : payment.type === 'book' ? 'your book' : 'your course'}.`,
      type: 'payment',
    });

    getIO().to(`user:${payment.userId}`).emit('notification', {
      title: 'Payment Approved',
      message: `Your manual payment of ₦${payment.amount.toLocaleString()} has been approved!`
    });

    res.json({ success: true, message: 'Payment approved and access granted', data: payment });
  } catch (err) {
    console.error('Approve manual payment error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ==================== REJECT MANUAL PAYMENT ====================
export const rejectManualPayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const admin = req.user as any;
    
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }
    
    const payment = await ManualPayment.findById(id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    
    if (payment.status !== 'pending_review') {
      return res.status(400).json({ success: false, message: `Payment already ${payment.status}` });
    }
    
    payment.status = 'rejected';
    payment.rejectionReason = rejectionReason;
    payment.adminNote = rejectionReason;
    payment.approvedBy = admin._id;
    payment.approvedAt = new Date();
    await payment.save();
    
    await Notification.create({
      userId: payment.userId,
      title: '❌ Manual Payment Rejected',
      message: `Your manual payment of ₦${payment.amount.toLocaleString()} was rejected. Reason: ${rejectionReason}. Please contact support or try again with correct details.`,
      type: 'payment',
    });
    
    getIO().to(`user:${payment.userId}`).emit('notification', {
      title: 'Payment Rejected',
      message: `Your manual payment was rejected. Reason: ${rejectionReason}`
    });
    
    res.json({ success: true, message: 'Payment rejected', data: payment });
  } catch (err) {
    console.error('Reject manual payment error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ==================== NEW ADMIN FUNCTIONS ====================
export const getUserFullDetails = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-passwordHash')
      .populate('bankAccount');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    const posts = await Post.countDocuments({ authorId: user._id });
    const followers = await Follow.countDocuments({ followingId: user._id });
    const following = await Follow.countDocuments({ followerId: user._id });
    const enrollments = await Enrollment.find({ userId: user._id }).populate('courseId', 'title');
    const transactions = await Transaction.find({ userId: user._id }).sort('-createdAt').limit(20);
    const manualPayments = await ManualPayment.find({ userId: user._id }).sort('-createdAt');
    const postsList = await Post.find({ authorId: user._id, isPublished: true }).sort('-createdAt').limit(10);
    const courses = await Course.find({ instructorId: user._id }).select('title approvalStatus totalStudents');
    const challengeProgress = await ChallengeProgress.find({ userId: user._id })
      .populate('challengeId', 'title status');
    const socialEarnings = await PostAnalytics.aggregate([
      { $match: { postId: { $in: (await Post.find({ authorId: user._id }).select('_id')).map(p => p._id) } } },
      { $group: { _id: null, total: { $sum: '$earnings' } } }
    ]);
    
    res.json({
      success: true,
      data: {
        user,
        stats: { 
          posts, 
          followers, 
          following, 
          enrollmentsCount: enrollments.length,
          coursesCreated: courses.length,
          challengesJoined: challengeProgress.length,
          socialEarnings: socialEarnings[0]?.total || 0,
        },
        recentTransactions: transactions,
        enrollments,
        manualPayments,
        recentPosts: postsList,
        instructorCourses: courses,
        challengeProgress
      }
    });
  } catch (err) {
    console.error('Get user full details error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getUserPosts = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const posts = await Post.find({ authorId: userId })
      .sort('-createdAt')
      .select('title type createdAt likes commentsCount views earnings');
    res.json({ success: true, data: posts });
  } catch (err) {
    console.error('Get user posts error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ==================== CHALLENGE MANAGEMENT ====================
export const createChallenge = async (req: Request, res: Response) => {
  try {
    const admin = req.user as IUser;
    const challenge = await Challenge.create({ ...req.body, createdBy: admin._id });
    
    const users = await User.find({}, '_id');
    await Notification.insertMany(users.map(u => ({
      userId: u._id,
      title: '🏆 New Challenge Available!',
      message: `${challenge.title} - Earn ${challenge.rewardXP} XP. Ends ${new Date(challenge.endDate).toLocaleDateString()}`,
      type: 'system',
      data: { challengeId: challenge._id, type: 'challenge' }
    })));
    
    getIO().emit('announcement', { title: 'New Challenge', content: challenge.title });
    res.status(201).json({ success: true, data: challenge });
  } catch (err) { 
    console.error('Create challenge error:', err);
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const getChallenges = async (req: Request, res: Response) => {
  try {
    const challenges = await Challenge.find().sort('-createdAt').populate('createdBy', 'firstName lastName');
    res.json({ success: true, data: challenges });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const updateChallenge = async (req: Request, res: Response) => {
  try {
    const challenge = await Challenge.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    res.json({ success: true, data: challenge });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const deleteChallenge = async (req: Request, res: Response) => {
  try {
    await Challenge.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Challenge deleted' });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const joinChallenge = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const challenge = await Challenge.findById(id);
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Challenge is not active' });
    }
    
    const existing = await ChallengeProgress.findOne({ challengeId: id, userId: user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already joined' });
    }
    
    if (!challenge.participants.includes(user._id)) {
      challenge.participants.push(user._id);
      await challenge.save();
    }
    
    await ChallengeProgress.create({
      challengeId: id,
      userId: user._id,
      status: 'enrolled',
      startedAt: new Date(),
    });
    
    res.json({ success: true, message: 'Joined challenge!' });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

// ==================== CHALLENGE PROGRESS ====================
export const getChallengeParticipants = async (req: Request, res: Response) => {
  try {
    const { challengeId } = req.params;
    const progress = await ChallengeProgress.find({ challengeId })
      .populate('userId', 'firstName lastName email');
    res.json({ success: true, data: progress });
  } catch (err) {
    console.error('Get challenge participants error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const completeChallengeForUser = async (req: Request, res: Response) => {
  try {
    const { challengeId, userId } = req.params;
    const { adminNote } = req.body;
    const admin = req.user as IUser;
    
    const progress = await ChallengeProgress.findOne({ challengeId, userId });
    if (!progress) {
      return res.status(404).json({ success: false, message: 'User not enrolled in this challenge' });
    }
    if (progress.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Already completed' });
    }
    
    progress.status = 'completed';
    progress.completedAt = new Date();
    progress.progress = 100;
    progress.adminNote = adminNote;
    await progress.save();

    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.xp = (user.xp || 0) + (challenge.rewardXP || 0);
    let xpNeeded = user.level * 1000;
    while (user.xp >= xpNeeded) {
      user.level += 1;
      user.xp -= xpNeeded;
      xpNeeded = user.level * 1000;
    }

    if (challenge.rewardAmount && challenge.rewardAmount > 0) {
      user.walletBalance = (user.walletBalance || 0) + challenge.rewardAmount;
      await Transaction.create({
        userId: user._id,
        type: 'bonus',
        amount: challenge.rewardAmount,
        status: 'completed',
        description: `Challenge reward: ${challenge.title}`,
      });
    }

    if (challenge.rewardPremiumDays && challenge.rewardPremiumDays > 0) {
      const currentExpiry = user.subscriptionExpires || new Date();
      const newExpiry = new Date(currentExpiry.getTime() + challenge.rewardPremiumDays * 24 * 60 * 60 * 1000);
      user.subscriptionExpires = newExpiry;
      user.isPremium = true;
    }

    await user.save();
    progress.rewardClaimed = true;
    await progress.save();

    await Notification.create({
      userId: user._id,
      title: '🎉 Challenge Completed!',
      message: `You completed "${challenge.title}" and earned ${challenge.rewardXP} XP${challenge.rewardAmount ? `, ₦${challenge.rewardAmount} bonus` : ''}${challenge.rewardPremiumDays ? `, and ${challenge.rewardPremiumDays} days of Premium` : ''}.`,
      type: 'system',
    });

    getIO().to(`user:${user._id}`).emit('notification', {
      title: 'Challenge Completed!',
      message: `You earned rewards for completing "${challenge.title}"`
    });

    res.json({ success: true, message: 'User marked as completed and rewards awarded' });
  } catch (err) {
    console.error('Complete challenge error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getAllChallengeProgressStats = async (req: Request, res: Response) => {
  try {
    const stats = await ChallengeProgress.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        }
      }
    ]);
    
    const totalEnrolled = await ChallengeProgress.countDocuments();
    const totalCompleted = await ChallengeProgress.countDocuments({ status: 'completed' });
    
    res.json({
      success: true,
      data: {
        stats,
        totalEnrolled,
        totalCompleted,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ==================== AD MANAGEMENT ====================
export const createAd = async (req: Request, res: Response) => {
  try {
    const admin = req.user as IUser;
    const ad = await Ad.create({ ...req.body, createdBy: admin._id });
    res.status(201).json({ success: true, data: ad });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const getAds = async (req: Request, res: Response) => {
  try {
    const ads = await Ad.find().sort('-createdAt').populate('createdBy', 'firstName lastName');
    res.json({ success: true, data: ads });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const updateAd = async (req: Request, res: Response) => {
  try {
    const ad = await Ad.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, data: ad });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const deleteAd = async (req: Request, res: Response) => {
  try {
    await Ad.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Ad deleted' });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const trackAdImpression = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Ad.findByIdAndUpdate(id, { $inc: { impressions: 1 } });
    res.json({ success: true });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const trackAdClick = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Ad.findByIdAndUpdate(id, { $inc: { clicks: 1 } });
    const ad = await Ad.findById(id);
    res.json({ success: true, redirectUrl: ad?.linkUrl });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

export const getActiveAds = async (req: Request, res: Response) => {
  try {
    const { placement } = req.params;
    const now = new Date();
    const ads = await Ad.find({
      placement,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).limit(5);
    res.json({ success: true, data: ads });
  } catch (err) { 
    res.status(500).json({ success: false, message: String(err) }); 
  }
};

// ==================== SOCIAL EARNINGS ADMIN ====================
export const getSocialEarningsConfig = async (req: Request, res: Response) => {
  try {
    let config = await SocialEarningsConfig.findOne().populate('updatedBy', 'firstName lastName');
    if (!config) {
      const admin = req.user as IUser;
      config = await SocialEarningsConfig.create({
        dailyPoolAmount: 10000,
        engagementWeights: { like: 1, comment: 2, share: 3, view: 0.5 },
        updatedBy: admin._id,
      });
    }
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const updateSocialEarningsConfig = async (req: Request, res: Response) => {
  try {
    const admin = req.user as IUser;
    const { dailyPoolAmount, engagementWeights } = req.body;
    const config = await SocialEarningsConfig.findOneAndUpdate(
      {},
      { dailyPoolAmount, engagementWeights, updatedBy: admin._id },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getTopEarningPosts = async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.query;
    const analytics = await PostAnalytics.find({ earnings: { $gt: 0 } })
      .sort('-earnings')
      .limit(Number(limit))
      .populate('postId', 'title authorId');
    res.json({ success: true, data: analytics });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getTotalSocialEarningsPool = async (req: Request, res: Response) => {
  try {
    const total = await PostAnalytics.aggregate([
      { $group: { _id: null, total: { $sum: '$earnings' } } }
    ]);
    res.json({ success: true, data: { total: total[0]?.total || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const triggerSocialEarnings = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let config = await SocialEarningsConfig.findOne();
    if (!config) {
      const admin = await User.findOne({ roles: 'admin' });
      if (!admin) throw new Error('No admin found to set social earnings config');
      config = await SocialEarningsConfig.create({
        dailyPoolAmount: 10000,
        engagementWeights: { like: 1, comment: 2, share: 3, view: 0.5 },
        updatedBy: admin._id,
      });
    }

    const poolAmount = config.dailyPoolAmount || 10000;

    const analytics = await PostAnalytics.find({ totalEngagement: { $gt: 0 } })
      .populate('postId', 'authorId');

    if (analytics.length === 0) {
      await session.commitTransaction();
      return res.json({ success: true, message: 'No posts with engagement.' });
    }

    const totalEngagement = analytics.reduce((sum, a) => sum + a.totalEngagement, 0);
    if (totalEngagement === 0) {
      await session.commitTransaction();
      return res.json({ success: true, message: 'Total engagement is zero.' });
    }

    for (const a of analytics) {
      const share = (a.totalEngagement / totalEngagement) * poolAmount;
      if (share < 0.01) continue;

      const post = a.postId as any;
      if (!post || !post.authorId) continue;

      const user = await User.findById(post.authorId);
      if (!user) continue;

      user.walletBalance = (user.walletBalance || 0) + share;
      await user.save({ session });

      await Transaction.create([{
        userId: user._id,
        type: 'bonus',
        amount: share,
        status: 'completed',
        description: `Social engagement reward for post "${post.title || 'Untitled'}"`,
      }], { session });

      a.earnings = (a.earnings || 0) + share;
      await a.save({ session });
    }

    config.lastDistributionDate = new Date();
    await config.save({ session });

    await session.commitTransaction();
    res.json({ success: true, message: `Distribution completed: ₦${poolAmount} across ${analytics.length} posts.` });
  } catch (err) {
    await session.abortTransaction();
    console.error('Social earnings trigger error:', err);
    res.status(500).json({ success: false, message: String(err) });
  } finally {
    session.endSession();
  }
};

// ==================== FILE UPLOAD ====================
export const uploadImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'File must be an image' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'admin/uploads', {
      resource_type: 'image',
      transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
    });

    res.json({ success: true, data: { url: result.secure_url } });
  } catch (err) {
    console.error('Upload image error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(req.file.mimetype) && !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'File type not supported. Please upload PDF or image.' });
    }

    const isImage = req.file.mimetype.startsWith('image/');
    const resourceType = isImage ? 'image' : 'raw';

    const result = await uploadToCloudinary(req.file.buffer, 'books', {
      resource_type: resourceType,
      access_mode: 'public',
      use_filename: true,
      unique_filename: true,
    });

    res.json({ success: true, data: { url: result.secure_url } });
  } catch (err) {
    console.error('Upload file error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ==================== BOOKS (Admin CRUD) ====================

export const createBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { title, author, description, price, coverImage, fileUrl } = req.body;

    if (!title || !author || !fileUrl) {
      return res.status(400).json({ success: false, message: 'Title, author, and file URL are required' });
    }

    const book = await Book.create({
      title,
      author,
      description: description || '',
      price: price || 0,
      coverImage: coverImage || '',
      fileUrl,
      uploadedBy: user._id,
      isPublished: true,
    });

    res.status(201).json({ success: true, data: book });
  } catch (err) {
    console.error('Create book error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const updateBook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const book = await Book.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }
    res.json({ success: true, data: book });
  } catch (err) {
    console.error('Update book error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const deleteBook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const book = await Book.findByIdAndDelete(id);
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }
    res.json({ success: true, message: 'Book deleted successfully' });
  } catch (err) {
    console.error('Delete book error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ==================== ADDITIONAL ADMIN FUNCTIONS ====================

export const getAdminBooks = async (req: Request, res: Response) => {
  try {
    const books = await Book.find().sort('-createdAt');
    res.json({ success: true, data: books });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getPlatformStats = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCourses = await Course.countDocuments();
    const totalRevenue = await Transaction.aggregate([
      { $match: { type: { $ne: 'withdrawal' }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalPosts = await Post.countDocuments({ isPublished: true });
    const totalBooks = await Book.countDocuments();
    const totalEnrollments = await Enrollment.countDocuments();

    res.json({
      success: true,
      data: {
        totalUsers,
        totalCourses,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalPosts,
        totalBooks,
        totalEnrollments,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const deletePostByAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    await Comment.deleteMany({ postId: id });
    await Like.deleteMany({ targetId: id, targetType: 'post' });
    await PostAnalytics.deleteOne({ postId: id });
    await post.deleteOne();

    res.json({ success: true, message: 'Post deleted by admin' });
  } catch (err) {
    console.error('Admin delete post error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ============================================================
// NEW: BOOK APPROVAL FUNCTIONS (Admin)
// ============================================================

export const getPendingBooks = async (req: Request, res: Response) => {
  try {
    const books = await Book.find({ status: 'pending' }).populate('authorId', 'firstName lastName email');
    res.json({ success: true, data: books });
  } catch (err) {
    console.error('Get pending books error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const approveBook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const admin = req.user as IUser;

    const book = await Book.findById(id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    if (book.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Book is already ${book.status}` });
    }

    book.status = 'approved';
    book.approvedBy = admin._id;
    book.approvedAt = new Date();
    book.isPublished = true;
    await book.save();

    // Notify author
    await Notification.create({
      userId: book.authorId,
      title: '✅ Book Approved',
      message: `Your book "${book.title}" has been approved and is now available!`,
      type: 'system',
      data: { bookId: book._id },
    });

    res.json({ success: true, message: 'Book approved', data: book });
  } catch (err) {
    console.error('Approve book error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const rejectBook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const admin = req.user as IUser;

    const book = await Book.findById(id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    if (book.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Book is already ${book.status}` });
    }

    book.status = 'rejected';
    book.approvedBy = admin._id;
    book.approvedAt = new Date();
    await book.save();

    await Notification.create({
      userId: book.authorId,
      title: '❌ Book Rejected',
      message: `Your book "${book.title}" was rejected. Reason: ${reason || 'Not specified'}.`,
      type: 'system',
    });

    res.json({ success: true, message: 'Book rejected', data: book });
  } catch (err) {
    console.error('Reject book error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};
