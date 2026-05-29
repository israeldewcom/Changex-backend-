import { Request, Response, NextFunction } from 'express';
import User, { IUser } from '../models/User.js';
import Course from '../models/Course.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import AdminCoupon from '../models/AdminCoupon.js';
import Announcement from '../models/Announcement.js';
import { getIO } from '../socket.js';

export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCourses = await Course.countDocuments({ approvalStatus: 'approved' });
    const pendingCourses = await Course.countDocuments({ approvalStatus: 'pending' });
    const revenueAgg = await Transaction.aggregate([
      { $match: { type: { $ne: 'withdrawal' }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;
    const pendingWithdrawals = await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });
    res.json({ success: true, data: { totalUsers, totalCourses, pendingCourses, totalRevenue, pendingWithdrawals } });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: 'Failed to load dashboard stats', error: errorMessage });
  }
};

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find({}).select('-passwordHash').limit(100);
    res.json({ success: true, data: users });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roles, isApprovedInstructor, isBanned } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { roles, isApprovedInstructor, isBanned }, { new: true });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const getAdminCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courses = await Course.find({}).populate('instructorId', 'firstName lastName email').limit(100);
    res.json({ success: true, data: courses });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const approveCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'approved', isPublished: true },
      { new: true }
    );
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    if (course.instructorId) {
      try {
        await Notification.create({
          userId: course.instructorId,
          title: 'Course Approved',
          message: `Your course "${course.title}" is now live.`,
          type: 'system',
        });
        const io = getIO();
        io.to(`user:${course.instructorId}`).emit('notification', { title: 'Course Approved', message: `Your course "${course.title}" is now live.` });
      } catch (notifError) {
        console.error('Failed to send approval notification:', notifError);
      }
    }
    res.json({ success: true, data: course });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const rejectCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'rejected', rejectionReason: reason },
      { new: true }
    );
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    if (course.instructorId) {
      await Notification.create({
        userId: course.instructorId,
        title: 'Course Rejected',
        message: `Your course "${course.title}" was rejected. Reason: ${reason || 'Not specified'}`,
        type: 'system',
      });
    }
    res.json({ success: true, data: course });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const getWithdrawals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const withdrawals = await Transaction.find({ type: 'withdrawal', status: 'pending' }).populate('userId', 'firstName lastName email bankAccount');
    res.json({ success: true, data: withdrawals });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const processWithdrawal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { action, adminNotes } = req.body;
    const transaction = await Transaction.findById(id);
    if (!transaction || transaction.type !== 'withdrawal') {
      res.status(404).json({ success: false, message: 'Withdrawal not found' });
      return;
    }
    if (action === 'approve') {
      transaction.status = 'completed';
      const user = await User.findById(transaction.userId);
      if (user) user.pendingWithdrawal = Math.max(0, user.pendingWithdrawal + transaction.amount);
      await user?.save();
    } else {
      transaction.status = 'failed';
      const user = await User.findById(transaction.userId);
      if (user) {
        user.walletBalance -= transaction.amount;
        user.pendingWithdrawal = Math.max(0, user.pendingWithdrawal + transaction.amount);
        await user.save();
      }
    }
    await transaction.save();
    res.json({ success: true, message: `Withdrawal ${action}d` });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const createAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, message } = req.body;
    const announcement = await Announcement.create({ title, message });
    const io = getIO();
    io.emit('announcement', { title, content: message });
    const users = await User.find({}, '_id');
    const notifications = users.map(u => ({ userId: u._id, title, message, type: 'system' }));
    await Notification.insertMany(notifications);
    res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const getCoupons = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coupons = await AdminCoupon.find({});
    res.json({ success: true, data: coupons });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const createCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coupon = await AdminCoupon.create(req.body);
    res.status(201).json({ success: true, data: coupon });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const deleteCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AdminCoupon.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

export const approveInstructor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const user = await User.findByIdAndUpdate(
      userId,
      { isApprovedInstructor: true, $addToSet: { roles: 'instructor' } },
      { new: true }
    );
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    await Notification.create({
      userId: user._id,
      title: 'Instructor Approval',
      message: 'Congratulations! You have been approved as an instructor.',
      type: 'system',
    });
    res.json({ success: true, data: user });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, message: errorMessage });
  }
};
