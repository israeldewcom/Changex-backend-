// src/controllers/AdminController.ts (full replacement)
import { Request, Response } from 'express';
import { User, Course, Transaction, Marketplace, Job, WithdrawalRequest, Coupon, Announcement, AuditLog, CourseApproval } from '../models';
import { AnalyticsService } from '../services/AnalyticsService';
import { PaymentService } from '../services/PaymentService';
import { NotificationService } from '../services/NotificationService';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';

export class AdminController {
  private analyticsService = AnalyticsService.getInstance();
  private paymentService = PaymentService.getInstance();
  private notificationService = NotificationService.getInstance();

  getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const [totalUsers, totalCourses, totalProducts, totalJobs, totalRevenue, pendingWithdrawals] = await Promise.all([
        User.countDocuments(),
        Course.countDocuments({ published: true }),
        Marketplace.countDocuments({ published: true }),
        Job.countDocuments({ isActive: true }),
        Transaction.aggregate([{ $match: { type: 'purchase', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        WithdrawalRequest.countDocuments({ status: 'pending' }),
      ]);
      res.json({ success: true, data: { totalUsers, totalCourses, totalProducts, totalJobs, totalRevenue: totalRevenue[0]?.total || 0, pendingWithdrawals } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  // Users
  getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, role, isBanned } = req.query;
      const query: any = {};
      if (role) query.roles = role;
      if (isBanned !== undefined) query.isBanned = isBanned === 'true';
      const skip = (Number(page) - 1) * Number(limit);
      const [users, total] = await Promise.all([User.find(query).select('-password -refreshTokens').skip(skip).limit(Number(limit)), User.countDocuments(query)]);
      res.json({ success: true, data: { users, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  updateUserStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { isBanned, roles } = req.body;
      const update: any = {};
      if (isBanned !== undefined) update.isBanned = isBanned;
      if (roles) update.roles = roles;
      const user = await User.findByIdAndUpdate(userId, update, { new: true }).select('-password -refreshTokens');
      if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
      res.json({ success: true, data: user, message: 'User updated' });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  // Courses admin
  getCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, status, instructor } = req.query;
      let query: any = {};
      if (status === 'pending') {
        const pendingApprovals = await CourseApproval.find({ status: 'pending' }).distinct('course');
        query._id = { $in: pendingApprovals };
      } else if (status === 'approved') {
        const approvedApprovals = await CourseApproval.find({ status: 'approved' }).distinct('course');
        query._id = { $in: approvedApprovals };
        query.published = true;
      } else if (status === 'all') {
        // all courses
      } else {
        query.published = status === 'published' ? true : false;
      }
      if (instructor) query.instructor = instructor;
      const skip = (Number(page) - 1) * Number(limit);
      const [courses, total] = await Promise.all([Course.find(query).populate('instructor', 'firstName lastName displayName email').skip(skip).limit(Number(limit)), Course.countDocuments(query)]);
      res.json({ success: true, data: { courses, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  approveCourse = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { courseId } = req.params;
      const { action, rejectionReason } = req.body; // action: 'approve' or 'reject'
      const approval = await CourseApproval.findOne({ course: courseId }).session(session);
      if (!approval) { res.status(404).json({ success: false, message: 'Course not submitted for approval' }); return; }
      if (action === 'approve') {
        approval.status = 'approved';
        approval.reviewedAt = new Date();
        approval.reviewedBy = (req as any).user?.userId;
        await approval.save({ session });
        const course = await Course.findByIdAndUpdate(courseId, { published: true }, { session });
        await this.notificationService.sendNotification(approval.instructor.toString(), 'course', {
          title: 'Course Approved!',
          message: `Your course "${course?.title}" has been published.`,
          metadata: { courseId }
        });
        res.json({ success: true, message: 'Course approved and published' });
      } else {
        approval.status = 'rejected';
        approval.reviewedAt = new Date();
        approval.reviewedBy = (req as any).user?.userId;
        approval.rejectionReason = rejectionReason;
        await approval.save({ session });
        await this.notificationService.sendNotification(approval.instructor.toString(), 'course', {
          title: 'Course Rejected',
          message: `Your course "${(await Course.findById(courseId).session(session))?.title}" was rejected. Reason: ${rejectionReason}`,
          metadata: { courseId }
        });
        res.json({ success: true, message: 'Course rejected' });
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Server error' });
    } finally { session.endSession(); }
  };

  // Withdrawals admin
  getWithdrawals = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const query: any = {};
      if (status) query.status = status;
      const skip = (Number(page) - 1) * Number(limit);
      const [withdrawals, total] = await Promise.all([WithdrawalRequest.find(query).populate('user', 'firstName lastName displayName email').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)), WithdrawalRequest.countDocuments(query)]);
      res.json({ success: true, data: { withdrawals, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  processWithdrawal = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { withdrawalId } = req.params;
      const { action, adminNotes } = req.body; // action: 'approve' or 'reject'
      const withdrawal = await WithdrawalRequest.findById(withdrawalId).session(session);
      if (!withdrawal) { res.status(404).json({ success: false, message: 'Withdrawal not found' }); return; }
      if (action === 'approve') {
        withdrawal.status = 'processing';
        withdrawal.adminNotes = adminNotes;
        await withdrawal.save({ session });
        // Queue the actual bank transfer
        const queueService = (await import('../services/QueueService')).QueueService.getInstance();
        await queueService.addJob('payment', { type: 'process_withdrawal', data: { transactionId: withdrawal._id, userId: withdrawal.user, amount: withdrawal.amount, bankDetails: withdrawal.bankDetails } });
        res.json({ success: true, message: 'Withdrawal approved, processing started' });
      } else {
        withdrawal.status = 'failed';
        withdrawal.adminNotes = adminNotes;
        await withdrawal.save({ session });
        // Refund user's wallet
        const user = await User.findById(withdrawal.user).session(session);
        if (user) {
          user.walletBalance += withdrawal.amount;
          user.pendingWithdrawal -= withdrawal.amount;
          await user.save({ session });
        }
        await this.notificationService.sendNotification(withdrawal.user.toString(), 'payment', {
          title: 'Withdrawal Rejected',
          message: `Your withdrawal of ${withdrawal.amount} NGN was rejected. Reason: ${adminNotes || 'Please contact support'}`,
          metadata: { withdrawalId }
        });
        res.json({ success: true, message: 'Withdrawal rejected, funds returned to wallet' });
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Server error' });
    } finally { session.endSession(); }
  };

  // Coupons admin
  getCoupons = async (req: Request, res: Response): Promise<void> => {
    try {
      const coupons = await Coupon.find().sort({ createdAt: -1 });
      res.json({ success: true, data: coupons });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  createCoupon = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const coupon = new Coupon(req.body);
      await coupon.save();
      res.status(201).json({ success: true, data: coupon });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
  };

  deleteCoupon = async (req: Request, res: Response): Promise<void> => {
    try {
      const { couponId } = req.params;
      await Coupon.findByIdAndDelete(couponId);
      res.json({ success: true, message: 'Coupon deleted' });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  // Announcements
  getAnnouncements = async (req: Request, res: Response): Promise<void> => {
    try {
      const announcements = await Announcement.find().sort({ createdAt: -1 });
      res.json({ success: true, data: announcements });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  createAnnouncement = async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, content, type } = req.body;
      const adminId = (req as any).user?.userId;
      const announcement = new Announcement({ title, content, type, createdBy: adminId });
      await announcement.save();
      // Send to all users
      const allUsers = await User.find().select('_id');
      await this.notificationService.sendBulkNotifications(allUsers.map(u => u._id.toString()), 'system', {
        title: `📢 ${title}`,
        message: content,
        metadata: { announcementId: announcement._id }
      });
      announcement.sentToAll = true;
      announcement.sentAt = new Date();
      await announcement.save();
      res.status(201).json({ success: true, data: announcement });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  // Audit Logs
  getAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 50, user, action, resource } = req.query;
      const query: any = {};
      if (user) query.user = user;
      if (action) query.action = action;
      if (resource) query.resource = resource;
      const skip = (Number(page) - 1) * Number(limit);
      const [logs, total] = await Promise.all([AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('user', 'firstName lastName email'), AuditLog.countDocuments(query)]);
      res.json({ success: true, data: { logs, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };
}
