import { Request, Response } from 'express';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import AdminCoupon from '../models/AdminCoupon.js';
import Announcement from '../models/Announcement.js';
import { getIO } from '../socket.js';

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
    res.json({ success: true, data: { totalUsers, totalCourses, pendingCourses, totalRevenue, pendingWithdrawals } });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find({}).select('-passwordHash').limit(100);
    res.json({ success: true, data: users });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { roles, isApprovedInstructor, isBanned } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { roles, isApprovedInstructor, isBanned }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

export const getAdminCourses = async (req: Request, res: Response) => {
  try {
    const courses = await Course.find({}).populate('instructorId', 'firstName lastName email').limit(100);
    res.json({ success: true, data: courses });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

export const approveCourse = async (req: Request, res: Response) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, { approvalStatus: 'approved', isPublished: true }, { new: true });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (course.instructorId) {
      await Notification.create({ userId: course.instructorId, title: 'Course Approved', message: `Your course "${course.title}" is live.`, type: 'system' });
      getIO().to(`user:${course.instructorId}`).emit('notification', { title: 'Course Approved' });
    }
    res.json({ success: true, data: course });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

export const rejectCourse = async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const course = await Course.findByIdAndUpdate(req.params.id, { approvalStatus: 'rejected', rejectionReason: reason }, { new: true });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (course.instructorId) {
      await Notification.create({ userId: course.instructorId, title: 'Course Rejected', message: `Your course "${course.title}" was rejected. Reason: ${reason || 'Not specified'}`, type: 'system' });
    }
    res.json({ success: true, data: course });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

export const getWithdrawals = async (req: Request, res: Response) => {
  try {
    const withdrawals = await Transaction.find({ type: 'withdrawal', status: 'pending' }).populate('userId', 'firstName lastName email');
    res.json({ success: true, data: withdrawals });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

export const processWithdrawal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const tx = await Transaction.findById(id);
    if (!tx || tx.type !== 'withdrawal') return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    if (action === 'approve') {
      tx.status = 'completed';
      const user = await User.findById(tx.userId);
      if (user) user.pendingWithdrawal = Math.max(0, user.pendingWithdrawal + tx.amount);
      await user?.save();
    } else {
      tx.status = 'failed';
      const user = await User.findById(tx.userId);
      if (user) {
        user.walletBalance -= tx.amount;
        user.pendingWithdrawal = Math.max(0, user.pendingWithdrawal + tx.amount);
        await user.save();
      }
    }
    await tx.save();
    res.json({ success: true, message: `Withdrawal ${action}d` });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

export const createAnnouncement = async (req: Request, res: Response) => {
  try {
    const { title, message } = req.body;
    const announcement = await Announcement.create({ title, message });
    getIO().emit('announcement', { title, content: message });
    const users = await User.find({}, '_id');
    await Notification.insertMany(users.map(u => ({ userId: u._id, title, message, type: 'system' })));
    res.status(201).json({ success: true, data: announcement });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

export const getCoupons = async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await AdminCoupon.find({}) }); } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};
export const createCoupon = async (req: Request, res: Response) => {
  try { res.status(201).json({ success: true, data: await AdminCoupon.create(req.body) }); } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};
export const deleteCoupon = async (req: Request, res: Response) => {
  try { await AdminCoupon.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

export const approveInstructor = async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.userId, { isApprovedInstructor: true, $addToSet: { roles: 'instructor' } }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    await Notification.create({ userId: user._id, title: 'Instructor Approved', message: 'You can now create courses.', type: 'system' });
    res.json({ success: true, data: user });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};
