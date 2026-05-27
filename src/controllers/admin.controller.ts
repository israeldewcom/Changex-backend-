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
    const users = await User.countDocuments();
    const courses = await Course.countDocuments({ approvalStatus: 'approved' });
    const pendingCourses = await Course.countDocuments({ approvalStatus: 'pending' });
    const revenue = await Transaction.aggregate([
      { $match: { type: { $ne: 'withdrawal' }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    res.json({ success: true, data: { users, courses, pendingCourses, revenue: revenue[0]?.total || 0 } });
  } catch (err) {
    next(err);
  }
};

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find({}).select('-passwordHash').limit(100);
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

export const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roles } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { roles }, { new: true });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const getAdminCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courses = await Course.find({}).populate('instructorId', 'firstName lastName email').limit(100);
    res.json({ success: true, data: courses });
  } catch (err) {
    next(err);
  }
};

export const approveCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, { approvalStatus: 'approved', isPublished: true }, { new: true });
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }

    await Notification.create({
      userId: course.instructorId,
      title: 'Course Approved',
      message: `Your course "${course.title}" has been approved and is now live.`,
      type: 'system',
    });

    const io = getIO();
    io.to(`user:${course.instructorId}`).emit('notification', {
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
    const course = await Course.findByIdAndUpdate(req.params.id, { approvalStatus: 'rejected', rejectionReason: reason }, { new: true });
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }

    await Notification.create({
      userId: course.instructorId,
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
    const users = await User.find({ pendingWithdrawal: { $gt: 0 } }).select('firstName lastName email pendingWithdrawal bankAccount');
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

export const approveWithdrawal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user || user.pendingWithdrawal <= 0) {
      res.status(400).json({ success: false, message: 'No pending withdrawal' });
      return;
    }

    const amount = user.pendingWithdrawal;
    user.pendingWithdrawal = 0;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: 'withdrawal',
      amount: -amount,
      status: 'completed',
      description: 'Withdrawal processed',
    });

    await Notification.create({
      userId: user._id,
      title: 'Withdrawal Processed',
      message: `Your withdrawal of ₦${amount} has been processed.`,
      type: 'payment',
    });

    res.json({ success: true });
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
    const coupons = await AdminCoupon.find({});
    res.json({ success: true, data: coupons });
  } catch (err) {
    next(err);
  }
};

export const deleteCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AdminCoupon.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
