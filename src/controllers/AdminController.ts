// ============================================
// FILE: src/controllers/AdminController.ts (new)
// ============================================
import { Request, Response } from 'express';
import { User, Course, Transaction, Marketplace, Job } from '../models';
import { AnalyticsService } from '../services/AnalyticsService';
import { logger } from '../utils/logger';

export class AdminController {
  private analyticsService: AnalyticsService;
  constructor() { this.analyticsService = AnalyticsService.getInstance(); }

  getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const [totalUsers, totalCourses, totalProducts, totalJobs, totalRevenue, pendingWithdrawals] = await Promise.all([
        User.countDocuments(),
        Course.countDocuments({ published: true }),
        Marketplace.countDocuments({ published: true }),
        Job.countDocuments({ isActive: true }),
        Transaction.aggregate([{ $match: { type: 'purchase', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Transaction.aggregate([{ $match: { type: 'withdrawal', status: 'pending' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      ]);
      res.json({ success: true, data: { totalUsers, totalCourses, totalProducts, totalJobs, totalRevenue: totalRevenue[0]?.total || 0, pendingWithdrawals: pendingWithdrawals[0]?.total || 0 } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

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
}
