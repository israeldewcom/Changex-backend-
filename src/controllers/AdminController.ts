import { Request, Response } from 'express';
import { User, Course, Transaction, WithdrawalRequest, Coupon, Announcement, CourseApproval, AuditLog } from '../models';
import { NotificationService } from '../services/NotificationService';
import mongoose from 'mongoose';

export class AdminController {
  private notificationService = NotificationService.getInstance();

  getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const [totalUsers, totalCourses, pendingCourses, pendingWithdrawals, totalRevenue] = await Promise.all([
        User.countDocuments(),
        Course.countDocuments({ published: true }),
        Course.countDocuments({ approvalStatus: 'pending' }),
        WithdrawalRequest.countDocuments({ status: 'pending' }),
        Transaction.aggregate([{ $match: { type: 'purchase', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
      ]);
      res.json({ success: true, data: { totalUsers, totalCourses, pendingCourses, pendingWithdrawals, totalRevenue: totalRevenue[0]?.total || 0 } });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ success: false, message: 'Failed to load dashboard stats' });
    }
  };

  getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, role, isBanned } = req.query;
      const query: any = {};
      if (role) query.roles = role;
      if (isBanned !== undefined) query.isBanned = isBanned === 'true';
      const skip = (Number(page) - 1) * Number(limit);
      const [users, total] = await Promise.all([
        User.find(query).select('-password -refreshTokens').skip(skip).limit(Number(limit)),
        User.countDocuments(query)
      ]);
      res.json({ success: true, data: { users, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load users' });
    }
  };

  updateUserStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { isBanned, roles, isApprovedInstructor } = req.body;
      const update: any = {};
      if (isBanned !== undefined) update.isBanned = isBanned;
      if (roles) update.roles = roles;
      if (isApprovedInstructor !== undefined) update.isApprovedInstructor = isApprovedInstructor;
      const user = await User.findByIdAndUpdate(userId, update, { new: true }).select('-password -refreshTokens');
      if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
      res.json({ success: true, data: user, message: 'User updated' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to update user' });
    }
  };

  getPendingCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const courses = await Course.find({ approvalStatus: 'pending', published: false }).populate('instructor', 'firstName lastName email');
      res.json({ success: true, data: courses });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load pending courses' });
    }
  };

  // ✅ NEW – list all courses for admin
  getCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const query: any = {};
      if (status === 'pending') query.approvalStatus = 'pending';
      else if (status === 'approved') query.approvalStatus = 'approved';
      else query.approvalStatus = { $in: ['approved', 'pending', 'rejected'] };
      const skip = (Number(page) - 1) * Number(limit);
      const courses = await Course.find(query).skip(skip).limit(Number(limit)).populate('instructor', 'firstName lastName email');
      const total = await Course.countDocuments(query);
      res.json({ success: true, data: { courses, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load courses' });
    }
  };

  approveCourse = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { courseId } = req.params;
      const adminId = (req as any).user.userId;
      const course = await Course.findById(courseId).session(session);
      if (!course) { res.status(404).json({ success: false, message: 'Course not found' }); return; }
      course.approvalStatus = 'approved';
      course.published = true;
      course.publishedAt = new Date();
      await course.save({ session });
      let approval = await CourseApproval.findOne({ course: courseId }).session(session);
      if (approval) {
        approval.status = 'approved';
        approval.reviewedAt = new Date();
        approval.reviewedBy = adminId;
        await approval.save({ session });
      }
      await this.notificationService.sendNotification(course.instructor.toString(), 'system', { title: 'Course Approved! 🎉', message: `Your course "${course.title}" has been approved and is now live.`, metadata: { courseId } });
      await session.commitTransaction();
      res.json({ success: true, message: 'Course approved and published' });
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Failed to approve course' });
    } finally { session.endSession(); }
  };

  rejectCourse = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { courseId } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).user.userId;
      const course = await Course.findById(courseId).session(session);
      if (!course) { res.status(404).json({ success: false, message: 'Course not found' }); return; }
      course.approvalStatus = 'rejected';
      await course.save({ session });
      let approval = await CourseApproval.findOne({ course: courseId }).session(session);
      if (approval) {
        approval.status = 'rejected';
        approval.reviewedAt = new Date();
        approval.reviewedBy = adminId;
        approval.rejectionReason = reason;
        await approval.save({ session });
      }
      await this.notificationService.sendNotification(course.instructor.toString(), 'system', { title: 'Course Rejected', message: `Your course "${course.title}" was rejected. Reason: ${reason || 'Not specified'}`, metadata: { courseId } });
      await session.commitTransaction();
      res.json({ success: true, message: 'Course rejected' });
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Failed to reject course' });
    } finally { session.endSession(); }
  };

  getPendingWithdrawals = async (req: Request, res: Response): Promise<void> => {
    try {
      const withdrawals = await WithdrawalRequest.find({ status: 'pending' }).populate('user', 'firstName lastName email');
      res.json({ success: true, data: withdrawals });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load pending withdrawals' });
    }
  };

  // ✅ NEW – list all withdrawals
  getWithdrawals = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const withdrawals = await WithdrawalRequest.find().skip(skip).limit(Number(limit)).populate('user', 'firstName lastName email');
      const total = await WithdrawalRequest.countDocuments();
      res.json({ success: true, data: { withdrawals, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load withdrawals' });
    }
  };

  processWithdrawal = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { withdrawalId } = req.params;
      const { action, reason } = req.body;
      const adminId = (req as any).user.userId;
      const withdrawal = await WithdrawalRequest.findById(withdrawalId).session(session);
      if (!withdrawal) { res.status(404).json({ success: false, message: 'Withdrawal not found' }); return; }
      if (action === 'approve') {
        withdrawal.status = 'completed';
        withdrawal.processedAt = new Date();
        withdrawal.processedBy = adminId;
        await withdrawal.save({ session });
        await Transaction.findByIdAndUpdate(withdrawal.transactionId, { status: 'completed', completedAt: new Date() }, { session });
        const user = await User.findById(withdrawal.user).session(session);
        if (user) {
          user.pendingWithdrawal -= withdrawal.amount;
          user.totalWithdrawn += withdrawal.amount;
          await user.save({ session });
        }
        await this.notificationService.sendNotification(withdrawal.user.toString(), 'payment', { title: 'Withdrawal Successful', message: `₦${withdrawal.amount.toLocaleString()} has been sent to your bank account.`, metadata: { withdrawalId } });
      } else if (action === 'reject') {
        withdrawal.status = 'failed';
        withdrawal.adminNotes = reason;
        withdrawal.processedAt = new Date();
        withdrawal.processedBy = adminId;
        await withdrawal.save({ session });
        await Transaction.findByIdAndUpdate(withdrawal.transactionId, { status: 'failed' }, { session });
        const user = await User.findById(withdrawal.user).session(session);
        if (user) {
          user.walletBalance += withdrawal.amount;
          user.pendingWithdrawal -= withdrawal.amount;
          await user.save({ session });
        }
        await this.notificationService.sendNotification(withdrawal.user.toString(), 'payment', { title: 'Withdrawal Rejected', message: `Your withdrawal of ₦${withdrawal.amount.toLocaleString()} was rejected. Reason: ${reason || 'Not specified'}`, metadata: { withdrawalId } });
      }
      await session.commitTransaction();
      res.json({ success: true, message: `Withdrawal ${action}d` });
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Failed to process withdrawal' });
    } finally { session.endSession(); }
  };

  getCoupons = async (req: Request, res: Response): Promise<void> => {
    try {
      const coupons = await Coupon.find().sort({ createdAt: -1 });
      res.json({ success: true, data: coupons });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load coupons' });
    }
  };

  createCoupon = async (req: Request, res: Response): Promise<void> => {
    try {
      const couponData = { ...req.body, description: req.body.description || 'Discount coupon', validFrom: req.body.validFrom || new Date(), validUntil: req.body.validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) };
      const coupon = new Coupon(couponData);
      await coupon.save();
      res.status(201).json({ success: true, data: coupon });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  deleteCoupon = async (req: Request, res: Response): Promise<void> => {
    try {
      await Coupon.findByIdAndDelete(req.params.id);
      res.json({ success: true, message: 'Coupon deleted' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to delete coupon' });
    }
  };

  getAnnouncements = async (req: Request, res: Response): Promise<void> => {
    try {
      const announcements = await Announcement.find().sort({ createdAt: -1 }).populate('createdBy', 'firstName lastName');
      res.json({ success: true, data: announcements });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load announcements' });
    }
  };

  createAnnouncement = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = (req as any).user.userId;
      const announcement = new Announcement({ ...req.body, createdBy: adminId });
      await announcement.save();
      const io = req.app.get('io');
      if (io) io.emit('announcement', announcement);
      res.status(201).json({ success: true, data: announcement });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  getAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const logs = await AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('user', 'firstName lastName email');
      const total = await AuditLog.countDocuments();
      res.json({ success: true, data: { logs, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load audit logs' });
    }
  };
}
