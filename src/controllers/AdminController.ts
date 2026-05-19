// ============================================
// FILE: src/controllers/AdminController.ts (existing + socket broadcast & getAnnouncements)
// ============================================
import { Request, Response } from 'express';
import { User, Course, Transaction, WithdrawalRequest, Coupon, Announcement, CourseApproval, AuditLog, Enrollment } from '../models';
import { NotificationService } from '../services/NotificationService';
import { AffiliateService } from '../services/AffiliateService';
import mongoose from 'mongoose';

export class AdminController {
  private notificationService: NotificationService;
  private affiliateService: AffiliateService;

  constructor() {
    this.notificationService = NotificationService.getInstance();
    this.announcementService = AnnouncementService.getInstance();
    this.affiliateService = AffiliateService.getInstance();
  }

  getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const [totalUsers, totalCourses, pendingCourses, pendingWithdrawals, totalRevenue, totalEnrollments, totalAffiliateClicks] = await Promise.all([
        User.countDocuments(),
        Course.countDocuments({ published: true }),
        Course.countDocuments({ approvalStatus: 'pending' }),
        WithdrawalRequest.countDocuments({ status: 'pending' }),
        Transaction.aggregate([{ $match: { type: 'purchase', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Enrollment.countDocuments(),
        Transaction.aggregate([{ $match: { type: 'commission', subtype: 'affiliate', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
      ]);
      
      const monthlyRevenue = await Transaction.aggregate([
        { $match: { type: 'purchase', status: 'completed' } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            total: { $sum: '$amount' }
          } },
        { $sort: { _id: 1 } },
        { $limit: 12 }
      ]);
      
      const topCourses = await Course.find({ published: true })
        .sort({ enrollmentCount: -1 })
        .limit(5)
        .select('title enrollmentCount totalRevenue');
      
      const topAffiliates = await User.aggregate([
        { $match: { 'affiliateLinks.0': { $exists: true } } },
        { $project: {
            firstName: 1,
            lastName: 1,
            displayName: 1,
            avatar: 1,
            totalAffiliateEarnings: { $sum: '$affiliateLinks.totalEarned' },
            totalAffiliateConversions: { $sum: '$affiliateLinks.conversions' }
          } },
        { $sort: { totalAffiliateEarnings: -1 } },
        { $limit: 5 }
      ]);
      
      res.json({
        success: true,
        data: {
          totalUsers,
          totalCourses,
          pendingCourses,
          pendingWithdrawals,
          totalRevenue: totalRevenue[0]?.total || 0,
          totalEnrollments,
          totalAffiliatePayouts: totalAffiliateClicks[0]?.total || 0,
          monthlyRevenue,
          topCourses,
          topAffiliates
        }
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ success: false, message: 'Failed to load dashboard stats' });
    }
  };

  getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, role, isBanned, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
      const query: any = {};
      if (role) query.roles = role;
      if (isBanned !== undefined) query.isBanned = isBanned === 'true';
      if (search) {
        query.$or = [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ];
      }
      
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;
      const skip = (Number(page) - 1) * Number(limit);
      
      const [users, total] = await Promise.all([
        User.find(query)
          .select('-password -refreshTokens')
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .populate('referredBy', 'firstName lastName email'),
        User.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        data: {
          users,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load users' });
    }
  };

  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId)
        .select('-password -refreshTokens')
        .populate('referrals', 'firstName lastName email')
        .populate('coursesEnrolled', 'title')
        .populate('affiliateLinks.courseId', 'title');
      
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      
      const enrollments = await Enrollment.find({ user: userId }).populate('course', 'title price');
      const transactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(20);
      
      res.json({
        success: true,
        data: {
          user,
          enrollments,
          recentTransactions: transactions
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load user' });
    }
  };

  updateUserStatus = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { userId } = req.params;
      const { isBanned, roles, isApprovedInstructor, subscriptionTier, walletBalance } = req.body;
      const adminId = (req as any).user.userId;
      
      const update: any = {};
      if (isBanned !== undefined) update.isBanned = isBanned;
      if (roles) update.roles = roles;
      if (isApprovedInstructor !== undefined) update.isApprovedInstructor = isApprovedInstructor;
      if (subscriptionTier) update.subscriptionTier = subscriptionTier;
      if (walletBalance !== undefined) update.walletBalance = walletBalance;
      
      const user = await User.findByIdAndUpdate(userId, update, { new: true, session }).select('-password -refreshTokens');
      if (!user) {
        await session.abortTransaction();
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      
      await AuditLog.create({
        user: adminId,
        action: 'UPDATE_USER',
        resource: 'User',
        resourceId: userId,
        details: update,
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      if (isBanned !== undefined) {
        await this.notificationService.sendNotification(userId, 'system', {
          title: isBanned ? 'Account Suspended' : 'Account Reinstated',
          message: isBanned 
            ? 'Your account has been suspended. Contact support for more information.'
            : 'Your account has been reinstated. You can now access all features.',
          metadata: { isBanned }
        });
      }
      
      if (isApprovedInstructor === true) {
        await this.notificationService.sendNotification(userId, 'system', {
          title: '🎉 You are now an Approved Instructor!',
          message: 'Congratulations! You can now create and sell courses on ChangeX Academy.',
          metadata: { isApprovedInstructor: true }
        });
      }
      
      await session.commitTransaction();
      res.json({ success: true, data: user, message: 'User updated successfully' });
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Failed to update user' });
    } finally {
      session.endSession();
    }
  };

  getPendingCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      
      const [courses, total] = await Promise.all([
        Course.find({ approvalStatus: 'pending', published: false })
          .populate('instructor', 'firstName lastName email')
          .sort({ submittedAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Course.countDocuments({ approvalStatus: 'pending', published: false })
      ]);
      
      res.json({
        success: true,
        data: {
          courses,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load pending courses' });
    }
  };

  getAllCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, status, category, level, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
      const query: any = {};
      
      if (status === 'pending') query.approvalStatus = 'pending';
      else if (status === 'approved') query.approvalStatus = 'approved';
      else if (status === 'rejected') query.approvalStatus = 'rejected';
      else if (status === 'draft') query.approvalStatus = { $nin: ['approved', 'pending', 'rejected'] };
      
      if (category) query.category = category;
      if (level) query.level = level;
      if (search) query.$text = { $search: search as string };
      
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;
      const skip = (Number(page) - 1) * Number(limit);
      
      const [courses, total] = await Promise.all([
        Course.find(query)
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .populate('instructor', 'firstName lastName email'),
        Course.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        data: {
          courses,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load courses' });
    }
  };

  getCourseById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { courseId } = req.params;
      const course = await Course.findById(courseId)
        .populate('instructor', 'firstName lastName email walletBalance totalEarned')
        .populate('prerequisites', 'title slug');
      
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      
      const enrollments = await Enrollment.find({ course: courseId }).populate('user', 'firstName lastName email');
      const totalRevenue = enrollments.reduce((sum, e) => sum + e.amountPaid, 0);
      
      res.json({
        success: true,
        data: {
          course,
          enrollments: {
            total: enrollments.length,
            completed: enrollments.filter(e => e.status === 'completed').length,
            active: enrollments.filter(e => e.status === 'active').length,
            list: enrollments.slice(0, 20)
          },
          totalRevenue
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load course' });
    }
  };

  approveCourse = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { courseId } = req.params;
      const adminId = (req as any).user.userId;
      const { adminNotes } = req.body;
      
      const course = await Course.findById(courseId).session(session);
      if (!course) {
        await session.abortTransaction();
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      
      course.approvalStatus = 'approved';
      course.published = true;
      course.publishedAt = new Date();
      await course.save({ session });
      
      let approval = await CourseApproval.findOne({ course: courseId }).session(session);
      if (approval) {
        approval.status = 'approved';
        approval.reviewedAt = new Date();
        approval.reviewedBy = adminId;
        approval.adminNotes = adminNotes;
        await approval.save({ session });
      } else {
        approval = new CourseApproval({
          course: courseId,
          instructor: course.instructor,
          status: 'approved',
          submittedAt: course.submittedAt || new Date(),
          reviewedAt: new Date(),
          reviewedBy: adminId,
          adminNotes
        });
        await approval.save({ session });
      }
      
      await AuditLog.create({
        user: adminId,
        action: 'APPROVE_COURSE',
        resource: 'Course',
        resourceId: courseId,
        details: { courseTitle: course.title, adminNotes },
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      await this.notificationService.sendNotification(course.instructor.toString(), 'system', {
        title: '✅ Course Approved!',
        message: `Your course "${course.title}" has been approved and is now live. Students can now enroll!`,
        metadata: { courseId, status: 'approved' }
      });
      
      const allUsers = await User.find({ isActive: true, isBanned: false }).select('_id');
      for (const user of allUsers) {
        await this.notificationService.sendNotification(user._id.toString(), 'course', {
          title: '🎉 New Course Available!',
          message: `"${course.title}" has just been published. Check it out now!`,
          metadata: { courseId, type: 'new_course' }
        });
      }
      
      const io = req.app.get('io');
      if (io) {
        io.emit('new_course', {
          courseId: course._id,
          title: course.title,
          thumbnail: course.thumbnail,
          instructor: course.instructor,
          message: `New course "${course.title}" is now available!`
        });
      }
      
      await session.commitTransaction();
      res.json({ success: true, message: 'Course approved and published successfully' });
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Failed to approve course' });
    } finally {
      session.endSession();
    }
  };

  rejectCourse = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { courseId } = req.params;
      const { reason, adminNotes } = req.body;
      const adminId = (req as any).user.userId;
      
      const course = await Course.findById(courseId).session(session);
      if (!course) {
        await session.abortTransaction();
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      
      course.approvalStatus = 'rejected';
      await course.save({ session });
      
      let approval = await CourseApproval.findOne({ course: courseId }).session(session);
      if (approval) {
        approval.status = 'rejected';
        approval.reviewedAt = new Date();
        approval.reviewedBy = adminId;
        approval.rejectionReason = reason;
        approval.adminNotes = adminNotes;
        await approval.save({ session });
      } else {
        approval = new CourseApproval({
          course: courseId,
          instructor: course.instructor,
          status: 'rejected',
          submittedAt: course.submittedAt || new Date(),
          reviewedAt: new Date(),
          reviewedBy: adminId,
          rejectionReason: reason,
          adminNotes
        });
        await approval.save({ session });
      }
      
      await AuditLog.create({
        user: adminId,
        action: 'REJECT_COURSE',
        resource: 'Course',
        resourceId: courseId,
        details: { courseTitle: course.title, reason, adminNotes },
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      await this.notificationService.sendNotification(course.instructor.toString(), 'system', {
        title: '❌ Course Rejected',
        message: `Your course "${course.title}" was rejected. Reason: ${reason || 'Not specified'}. Please make the required changes and resubmit.`,
        metadata: { courseId, reason, status: 'rejected' }
      });
      
      await session.commitTransaction();
      res.json({ success: true, message: 'Course rejected' });
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Failed to reject course' });
    } finally {
      session.endSession();
    }
  };

  getPendingWithdrawals = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      
      const [withdrawals, total] = await Promise.all([
        WithdrawalRequest.find({ status: 'pending' })
          .populate('user', 'firstName lastName email walletBalance totalEarned')
          .sort({ createdAt: 1 })
          .skip(skip)
          .limit(Number(limit)),
        WithdrawalRequest.countDocuments({ status: 'pending' })
      ]);
      
      const totalPendingAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);
      
      res.json({
        success: true,
        data: {
          withdrawals,
          totalPendingAmount,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load pending withdrawals' });
    }
  };

  getAllWithdrawals = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const query: any = {};
      if (status && status !== 'all') query.status = status;
      
      const skip = (Number(page) - 1) * Number(limit);
      const [withdrawals, total] = await Promise.all([
        WithdrawalRequest.find(query)
          .populate('user', 'firstName lastName email')
          .populate('processedBy', 'firstName lastName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        WithdrawalRequest.countDocuments(query)
      ]);
      
      const summary = await WithdrawalRequest.aggregate([
        { $group: {
            _id: '$status',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          } }
      ]);
      
      res.json({
        success: true,
        data: {
          withdrawals,
          summary: summary.reduce((acc, s) => {
            acc[s._id] = { total: s.total, count: s.count };
            return acc;
          }, {}),
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load withdrawals' });
    }
  };

  getWithdrawalById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { withdrawalId } = req.params;
      const withdrawal = await WithdrawalRequest.findById(withdrawalId)
        .populate('user', 'firstName lastName email walletBalance totalEarned totalWithdrawn')
        .populate('processedBy', 'firstName lastName email');
      
      if (!withdrawal) {
        res.status(404).json({ success: false, message: 'Withdrawal not found' });
        return;
      }
      
      res.json({ success: true, data: withdrawal });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load withdrawal' });
    }
  };

  processWithdrawal = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { withdrawalId } = req.params;
      const { action, reason, adminNotes } = req.body;
      const adminId = (req as any).user.userId;
      
      const withdrawal = await WithdrawalRequest.findById(withdrawalId).session(session);
      if (!withdrawal) {
        await session.abortTransaction();
        res.status(404).json({ success: false, message: 'Withdrawal not found' });
        return;
      }
      
      if (withdrawal.status !== 'pending') {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: `Withdrawal already ${withdrawal.status}` });
        return;
      }
      
      if (action === 'approve') {
        withdrawal.status = 'completed';
        withdrawal.processedAt = new Date();
        withdrawal.processedBy = adminId;
        withdrawal.adminNotes = adminNotes;
        await withdrawal.save({ session });
        
        await Transaction.findByIdAndUpdate(withdrawal.transactionId, { 
          status: 'completed', 
          completedAt: new Date(),
          metadata: { ...withdrawal.metadata, processedBy: adminId, processedAt: new Date() }
        }, { session });
        
        const user = await User.findById(withdrawal.user).session(session);
        if (user) {
          user.pendingWithdrawal -= withdrawal.amount;
          user.totalWithdrawn += withdrawal.amount;
          await user.save({ session });
        }
        
        await AuditLog.create({
          user: adminId,
          action: 'APPROVE_WITHDRAWAL',
          resource: 'WithdrawalRequest',
          resourceId: withdrawalId,
          details: { amount: withdrawal.amount, user: withdrawal.user, adminNotes },
          ip: req.ip || req.socket.remoteAddress || '',
          userAgent: req.get('user-agent') || '',
          status: 'success'
        });
        
        await this.notificationService.sendNotification(withdrawal.user.toString(), 'payment', {
          title: '✅ Withdrawal Approved',
          message: `Your withdrawal of ${withdrawal.currency} ${withdrawal.amount.toLocaleString()} has been approved and will be sent to your bank account within 1-3 business days.`,
          metadata: { withdrawalId, amount: withdrawal.amount, status: 'approved' }
        });
        
        res.json({ success: true, message: 'Withdrawal approved successfully' });
      } 
      else if (action === 'reject') {
        withdrawal.status = 'failed';
        withdrawal.adminNotes = reason || adminNotes;
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
        
        await AuditLog.create({
          user: adminId,
          action: 'REJECT_WITHDRAWAL',
          resource: 'WithdrawalRequest',
          resourceId: withdrawalId,
          details: { amount: withdrawal.amount, user: withdrawal.user, reason, adminNotes },
          ip: req.ip || req.socket.remoteAddress || '',
          userAgent: req.get('user-agent') || '',
          status: 'success'
        });
        
        await this.notificationService.sendNotification(withdrawal.user.toString(), 'payment', {
          title: '❌ Withdrawal Rejected',
          message: `Your withdrawal of ${withdrawal.currency} ${withdrawal.amount.toLocaleString()} was rejected. Reason: ${reason || 'Not specified'}. The funds have been returned to your wallet.`,
          metadata: { withdrawalId, amount: withdrawal.amount, status: 'rejected', reason }
        });
        
        res.json({ success: true, message: 'Withdrawal rejected' });
      } 
      else {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: 'Invalid action' });
      }
      
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Failed to process withdrawal' });
    } finally {
      session.endSession();
    }
  };

  getCoupons = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, isActive } = req.query;
      const query: any = {};
      if (isActive !== undefined) query.isActive = isActive === 'true';
      
      const skip = (Number(page) - 1) * Number(limit);
      const [coupons, total] = await Promise.all([
        Coupon.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
        Coupon.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        data: {
          coupons,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load coupons' });
    }
  };

  getCouponById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { couponId } = req.params;
      const coupon = await Coupon.findById(couponId);
      if (!coupon) {
        res.status(404).json({ success: false, message: 'Coupon not found' });
        return;
      }
      res.json({ success: true, data: coupon });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load coupon' });
    }
  };

  createCoupon = async (req: Request, res: Response): Promise<void> => {
    try {
      const { code, discountType, discountValue, minOrderAmount, maxDiscount, usageLimit, validFrom, validUntil, applicableTo, applicableIds } = req.body;
      const adminId = (req as any).user.userId;
      
      const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
      if (existingCoupon) {
        res.status(400).json({ success: false, message: 'Coupon code already exists' });
        return;
      }
      
      const couponData = {
        code: code.toUpperCase(),
        description: req.body.description || `Discount coupon - ${code.toUpperCase()}`,
        discountType,
        discountValue,
        minOrderAmount: minOrderAmount || 0,
        maxDiscount: maxDiscount || 0,
        usageLimit: usageLimit || 1,
        usedCount: 0,
        validFrom: validFrom || new Date(),
        validUntil: validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        applicableTo: applicableTo || 'all',
        applicableIds: applicableIds || [],
        isActive: true
      };
      
      const coupon = new Coupon(couponData);
      await coupon.save();
      
      await AuditLog.create({
        user: adminId,
        action: 'CREATE_COUPON',
        resource: 'Coupon',
        resourceId: coupon._id,
        details: { code: coupon.code, discountValue: coupon.discountValue, discountType: coupon.discountType },
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      res.status(201).json({ success: true, data: coupon, message: 'Coupon created successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  updateCoupon = async (req: Request, res: Response): Promise<void> => {
    try {
      const { couponId } = req.params;
      const updateData = req.body;
      const adminId = (req as any).user.userId;
      
      const coupon = await Coupon.findByIdAndUpdate(couponId, updateData, { new: true });
      if (!coupon) {
        res.status(404).json({ success: false, message: 'Coupon not found' });
        return;
      }
      
      await AuditLog.create({
        user: adminId,
        action: 'UPDATE_COUPON',
        resource: 'Coupon',
        resourceId: couponId,
        details: updateData,
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      res.json({ success: true, data: coupon, message: 'Coupon updated successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  deleteCoupon = async (req: Request, res: Response): Promise<void> => {
    try {
      const { couponId } = req.params;
      const adminId = (req as any).user.userId;
      
      const coupon = await Coupon.findByIdAndDelete(couponId);
      if (!coupon) {
        res.status(404).json({ success: false, message: 'Coupon not found' });
        return;
      }
      
      await AuditLog.create({
        user: adminId,
        action: 'DELETE_COUPON',
        resource: 'Coupon',
        resourceId: couponId,
        details: { code: coupon.code },
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      res.json({ success: true, message: 'Coupon deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to delete coupon' });
    }
  };

  getAnnouncements = async (req: Request, res: Response): Promise<void> => {
    try {
      const announcements = await Announcement.find({ sentToAll: true, isActive: true })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('createdBy', 'firstName lastName email');
      res.json({ success: true, data: announcements });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load announcements' });
    }
  };

  createAnnouncement = async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, content, type } = req.body;
      const adminId = (req as any).user.userId;
      
      if (!title || !content) {
        res.status(400).json({ success: false, message: 'Title and content are required' });
        return;
      }
      
      const announcement = new Announcement({
        title,
        content,
        type: type || 'info',
        createdBy: adminId,
        isActive: true,
        sentToAll: false
      });
      await announcement.save();
      
      await AuditLog.create({
        user: adminId,
        action: 'CREATE_ANNOUNCEMENT',
        resource: 'Announcement',
        resourceId: announcement._id,
        details: { title, content, type },
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      res.status(201).json({ success: true, data: announcement, message: 'Announcement created successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  sendAnnouncementToAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const { announcementId } = req.params;
      const adminId = (req as any).user.userId;
      
      const announcement = await Announcement.findById(announcementId);
      if (!announcement) {
        res.status(404).json({ success: false, message: 'Announcement not found' });
        return;
      }
      
      if (announcement.sentToAll) {
        res.status(400).json({ success: false, message: 'Announcement already sent to all users' });
        return;
      }
      
      const users = await User.find({ isActive: true, isBanned: false }).select('_id');
      
      for (const user of users) {
        await this.notificationService.sendNotification(user._id.toString(), 'system', {
          title: `📢 ${announcement.title}`,
          message: announcement.content,
          metadata: { type: announcement.type, announcementId: announcement._id }
        });
      }
      
      announcement.sentToAll = true;
      announcement.sentAt = new Date();
      await announcement.save();
      
      const io = req.app.get('io');
      if (io) {
        io.emit('announcement', {
          id: announcement._id,
          title: announcement.title,
          content: announcement.content,
          type: announcement.type,
          timestamp: new Date()
        });
      }
      
      await AuditLog.create({
        user: adminId,
        action: 'SEND_ANNOUNCEMENT',
        resource: 'Announcement',
        resourceId: announcementId,
        details: { title: announcement.title, recipients: users.length },
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      res.json({ success: true, message: `Announcement sent to ${users.length} users` });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to send announcement' });
    }
  };

  deleteAnnouncement = async (req: Request, res: Response): Promise<void> => {
    try {
      const { announcementId } = req.params;
      const adminId = (req as any).user.userId;
      
      const announcement = await Announcement.findByIdAndDelete(announcementId);
      if (!announcement) {
        res.status(404).json({ success: false, message: 'Announcement not found' });
        return;
      }
      
      await AuditLog.create({
        user: adminId,
        action: 'DELETE_ANNOUNCEMENT',
        resource: 'Announcement',
        resourceId: announcementId,
        details: { title: announcement.title },
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      res.json({ success: true, message: 'Announcement deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to delete announcement' });
    }
  };

  getAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 50, action, resource, userId } = req.query;
      const query: any = {};
      if (action) query.action = action;
      if (resource) query.resource = resource;
      if (userId) query.user = userId;
      
      const skip = (Number(page) - 1) * Number(limit);
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .populate('user', 'firstName lastName email'),
        AuditLog.countDocuments(query)
      ]);
      
      const actions = await AuditLog.distinct('action');
      const resources = await AuditLog.distinct('resource');
      
      res.json({
        success: true,
        data: {
          logs,
          filters: { actions, resources },
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load audit logs' });
    }
  };

  getPlatformStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
      const { period = 'month' } = req.query;
      let startDate = new Date();
      
      if (period === 'week') startDate.setDate(startDate.getDate() - 7);
      else if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);
      else if (period === 'year') startDate.setFullYear(startDate.getFullYear() - 1);
      else startDate = new Date(0);
      
      const [userGrowth, revenueGrowth, courseGrowth, activeUsers] = await Promise.all([
        User.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]),
        Transaction.aggregate([
          { $match: { type: 'purchase', status: 'completed', createdAt: { $gte: startDate } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$amount' } } },
          { $sort: { _id: 1 } }
        ]),
        Course.aggregate([
          { $match: { publishedAt: { $gte: startDate } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$publishedAt' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]),
        User.countDocuments({ lastActiveAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
      ]);
      
      res.json({
        success: true,
        data: {
          userGrowth,
          revenueGrowth,
          courseGrowth,
          activeUsers,
          period
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load statistics' });
    }
  };

  getSystemSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const settings = {
        platformFee: 10,
        creatorCommission: 80,
        affiliateCommission: 20,
        referralBonus: 500,
        minWithdrawalAmount: 2000,
        maxWithdrawalAmount: 1000000,
        currency: 'NGN',
        supportedCurrencies: ['NGN', 'USD', 'GBP', 'EUR'],
        maintenanceMode: false
      };
      
      res.json({ success: true, data: settings });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load settings' });
    }
  };

  updateSystemSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const updates = req.body;
      const adminId = (req as any).user.userId;
      
      await AuditLog.create({
        user: adminId,
        action: 'UPDATE_SYSTEM_SETTINGS',
        resource: 'System',
        details: updates,
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });
      
      res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to update settings' });
    }
  };
}

export default AdminController;
