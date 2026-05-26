// File: src/controllers/admin.controller.ts
import { Request, Response, NextFunction } from 'express';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import AdminCoupon from '../models/AdminCoupon.js';
import Announcement from '../models/Announcement.js';
import { getIO } from '../socket.js';
import { sendTemplatedEmail } from '../services/email.js';
import AuditLog from '../models/AuditLog.js';

export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [users, courses, pendingCourses, revenueResult] = await Promise.all([
      User.countDocuments(),
      Course.countDocuments({ approvalStatus: 'approved' }),
      Course.countDocuments({ approvalStatus: 'pending' }),
      Transaction.aggregate([
        { $match: { type: { $ne: 'withdrawal' }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    const revenue = revenueResult[0]?.total || 0;
    res.json({ success: true, data: { users, courses, pendingCourses, revenue } });
  } catch (err) {
    next(err);
  }
};

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 20, offset = 0, role, search } = req.query;
    const filter: any = {};
    if (role) filter.roles = role;
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
      ];
    }
    const [users, total] = await Promise.all([
      User.find(filter).skip(Number(offset)).limit(Number(limit)).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, data: users, meta: { total } });
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const update = req.body;
    delete update.passwordHash; // prevent password update via admin directly

    if (update.roles && !Array.isArray(update.roles)) {
      return res.status(400).json({ success: false, message: 'Roles must be an array' });
    }

    const user = await User.findByIdAndUpdate(id, update, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const getCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const filter: any = {};
    if (status) filter.approvalStatus = status;
    const [courses, total] = await Promise.all([
      Course.find(filter).skip(Number(offset)).limit(Number(limit)).populate('instructorId', 'firstName lastName email').lean(),
      Course.countDocuments(filter),
    ]);
    res.json({ success: true, data: courses, meta: { total } });
  } catch (err) {
    next(err);
  }
};

export const approveCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'approved', isPublished: true },
      { new: true }
    ).populate('instructorId', 'email firstName');
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    // Notify instructor via email and in-app
    const instructor = course.instructorId as any;
    await Notification.create({
      userId: instructor._id,
      title: 'Course Approved',
      message: `Your course "${course.title}" has been approved and is now live.`,
      type: 'system',
    });
    sendTemplatedEmail(instructor.email, 'Your Course is Live!', 'course-approved', {
      firstName: instructor.firstName,
      courseTitle: course.title,
      courseUrl: `${process.env.CLIENT_URL}/courses/${course._id}`,
    }).catch(err => console.error);

    const io = getIO();
    io.to(`user:${instructor._id}`).emit('notification', {
      title: 'Course Approved',
      message: `Your course "${course.title}" has been approved.`,
    });

    res.json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

export const rejectCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'rejected', rejectionReason: reason },
      { new: true }
    ).populate('instructorId', 'email firstName');
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    await Notification.create({
      userId: (course.instructorId as any)._id,
      title: 'Course Rejected',
      message: `Your course "${course.title}" was rejected. Reason: ${reason}`,
      type: 'system',
    });

    res.json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

export const getWithdrawals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status = 'pending', limit = 20, offset = 0 } = req.query;
    const withdrawals = await Transaction.find({ type: 'withdrawal', status })
      .skip(Number(offset))
      .limit(Number(limit))
      .populate('userId', 'email firstName lastName bankAccount pendingWithdrawal')
      .lean();
    const total = await Transaction.countDocuments({ type: 'withdrawal', status });
    res.json({ success: true, data: withdrawals, meta: { total } });
  } catch (err) {
    next(err);
  }
};

export const processWithdrawal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findById(id).populate('userId');
    if (!transaction || transaction.type !== 'withdrawal' || transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal request' });
    }

    const user = transaction.userId as any;
    // In a real scenario, you'd call Paystack transfer API here. For now, just mark as completed.
    transaction.status = 'completed';
    transaction.description = (transaction.description || '') + ' (processed)';
    await transaction.save();

    // Deduct from user's pending withdrawal (already deducted when requested)
    user.pendingWithdrawal -= Math.abs(transaction.amount);
    await user.save();

    await Notification.create({
      userId: user._id,
      title: 'Withdrawal Processed',
      message: `Your withdrawal of ₦${Math.abs(transaction.amount)} has been processed.`,
      type: 'payment',
    });

    // Send email notification
    sendTemplatedEmail(user.email, 'Withdrawal Processed', 'withdrawal-processed', {
      amount: Math.abs(transaction.amount),
    }).catch(err => console.error);

    res.json({ success: true, message: 'Withdrawal processed' });
  } catch (err) {
    next(err);
  }
};

export const createAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, message } = req.body;
    const announcement = await Announcement.create({ title, message });

    const io = getIO();
    io.emit('announcement', { title, message });

    // Notify all users (bulk insert for efficiency)
    const users = await User.find({}, '_id');
    const notifications = users.map(u => ({
      userId: u._id,
      title,
      message,
      type: 'system',
    }));
    await Notification.insertMany(notifications);

    res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    next(err);
  }
};

export const createCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coupon = await AdminCoupon.create(req.body);
    res.status(201).json({ success: true, data: coupon });
  } catch (err) {
    next(err);
  }
};

export const getCoupons = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coupons = await AdminCoupon.find().lean();
    res.json({ success: true, data: coupons });
  } catch (err) {
    next(err);
  }
};

export const deleteCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AdminCoupon.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (err) {
    next(err);
  }
};

export const getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const logs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .populate('userId', 'email')
      .lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
};
