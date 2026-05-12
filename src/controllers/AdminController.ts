import { Request, Response } from 'express';
import { User, Course, Transaction, WithdrawalRequest, Coupon, Announcement, AuditLog, CourseApproval } from '../models';
import { NotificationService } from '../services/NotificationService';

export class AdminController {

  // Dashboard stats
  async getDashboardStats(req: Request, res: Response) {
    try {
      const [totalUsers, totalCourses, totalProducts, totalJobs, totalRevenue, pendingWithdrawals] = await Promise.all([
        User.countDocuments(),
        Course.countDocuments({ published: true }),
        0, // Marketplace model if any
        0, // Jobs model if any
        Transaction.aggregate([{ $match: { type: 'purchase', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        WithdrawalRequest.countDocuments({ status: 'pending' }),
      ]);
      res.json({ success: true, data: {
        totalUsers,
        totalCourses,
        totalProducts,
        totalJobs,
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingWithdrawals,
      }});
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get users
  async getUsers(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, role, isBanned } = req.query;
      const query: any = {};
      if (role) query.roles = role;
      if (isBanned !== undefined) query.isBanned = isBanned === 'true';
      const skip = (Number(page) - 1) * Number(limit);
      const [users, total] = await Promise.all([
        User.find(query).select('-password -refreshTokens').skip(skip).limit(Number(limit)),
        User.countDocuments(query),
      ]);
      res.json({ success: true, data: { users, pagination: { page: Number(page), limit: Number(limit), total } } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Update user status
  async updateUserStatus(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { isBanned, roles } = req.body;
      const update: any = {};
      if (isBanned !== undefined) update.isBanned = isBanned;
      if (roles) update.roles = roles;
      const user = await User.findByIdAndUpdate(userId, update, { new: true }).select('-password -refreshTokens');
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      res.json({ success: true, data: user, message: 'User updated' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get courses (admin list)
  async getCourses(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, status, instructor } = req.query;
      const query: any = {};
      if (status === 'pending') {
        const pending = await CourseApproval.find({ status: 'pending' }).distinct('course');
        query._id = { $in: pending };
      } else if (status === 'approved') {
        query.published = true;
      } else if (instructor) {
        query.instructor = instructor;
      }
      const skip = (Number(page) - 1) * Number(limit);
      const [courses, total] = await Promise.all([
        Course.find(query).populate('instructor', 'firstName lastName email').skip(skip).limit(Number(limit)),
        Course.countDocuments(query),
      ]);
      res.json({ success: true, data: { courses, pagination: { page: Number(page), limit: Number(limit), total } } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Approve / reject course
  async approveCourse(req: Request, res: Response) {
    try {
      const { courseId } = req.params;
      const { action, rejectionReason } = req.body;
      const approval = await CourseApproval.findOne({ course: courseId });
      if (!approval) return res.status(404).json({ success: false, message: 'Course not submitted for approval' });

      if (action === 'approve') {
        approval.status = 'approved';
        approval.reviewedAt = new Date();
        approval.reviewedBy = (req as any).user?.userId;
        await approval.save();

        await Course.findByIdAndUpdate(courseId, { published: true, approvalStatus: 'approved' });

        // Notify instructor
        const notifService = NotificationService.getInstance();
        await notifService.sendNotification(approval.instructor.toString(), 'course', {
          title: 'Course Approved!',
          message: `Your course has been published.`,
          metadata: { courseId },
        });
      } else {
        approval.status = 'rejected';
        approval.reviewedAt = new Date();
        approval.reviewedBy = (req as any).user?.userId;
        approval.rejectionReason = rejectionReason;
        await approval.save();

        await Course.findByIdAndUpdate(courseId, { approvalStatus: 'rejected' });
      }
      res.json({ success: true, message: `Course ${action}ed` });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Withdrawal requests list
  async getWithdrawals(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const query: any = {};
      if (status) query.status = status;
      const skip = (Number(page) - 1) * Number(limit);
      const [withdrawals, total] = await Promise.all([
        WithdrawalRequest.find(query).populate('user', 'firstName lastName email').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
        WithdrawalRequest.countDocuments(query),
      ]);
      res.json({ success: true, data: { withdrawals, pagination: { page: Number(page), limit: Number(limit), total } } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Process withdrawal (approve/reject)
  async processWithdrawal(req: Request, res: Response) {
    try {
      const { withdrawalId } = req.params;
      const { action, adminNotes } = req.body;
      const withdrawal = await WithdrawalRequest.findById(withdrawalId);
      if (!withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });

      if (action === 'approve') {
        withdrawal.status = 'processing';
        withdrawal.adminNotes = adminNotes;
        await withdrawal.save();
        // (In production, queue a real payout)
      } else {
        withdrawal.status = 'failed';
        withdrawal.adminNotes = adminNotes;
        await withdrawal.save();
        // Refund the user's wallet
        await User.findByIdAndUpdate(withdrawal.user, {
          $inc: { walletBalance: withdrawal.amount, pendingWithdrawal: -withdrawal.amount },
        });
      }
      res.json({ success: true, message: `Withdrawal ${action}d` });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Coupons
  async getCoupons(req: Request, res: Response) {
    try {
      const coupons = await Coupon.find().sort({ createdAt: -1 });
      res.json({ success: true, data: coupons });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async createCoupon(req: Request, res: Response) {
    try {
      const coupon = new Coupon(req.body);
      await coupon.save();
      res.status(201).json({ success: true, data: coupon });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteCoupon(req: Request, res: Response) {
    try {
      const { couponId } = req.params;
      await Coupon.findByIdAndDelete(couponId);
      res.json({ success: true, message: 'Coupon deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Announcements
  async getAnnouncements(req: Request, res: Response) {
    try {
      const announcements = await Announcement.find().sort({ createdAt: -1 });
      res.json({ success: true, data: announcements });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async createAnnouncement(req: Request, res: Response) {
    try {
      const { title, content, type } = req.body;
      const adminId = (req as any).user?.userId;
      const announcement = new Announcement({ title, content, type, createdBy: adminId });
      await announcement.save();

      // Send to all users (bulk notification)
      const notifService = NotificationService.getInstance();
      const allUsers = await User.find().select('_id');
      await notifService.sendBulkNotifications(allUsers.map(u => u._id.toString()), 'system', {
        title: `📢 ${title}`,
        message: content,
        metadata: { announcementId: announcement._id },
      });

      announcement.sentToAll = true;
      announcement.sentAt = new Date();
      await announcement.save();
      res.status(201).json({ success: true, data: announcement });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Audit logs
  async getAuditLogs(req: Request, res: Response) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const [logs, total] = await Promise.all([
        AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('user', 'firstName lastName email'),
        AuditLog.countDocuments(),
      ]);
      res.json({ success: true, data: { logs, pagination: { page: Number(page), limit: Number(limit), total } } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
