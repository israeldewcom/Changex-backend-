// ============================================
// FILE: src/services/AnalyticsService.ts (new)
// ============================================
import { Course, Enrollment, User, Transaction } from '../models';
import { RedisService } from './RedisService';
import { logger } from '../utils/logger';

export class AnalyticsService {
  private static instance: AnalyticsService;
  private redis: RedisService;

  private constructor() { this.redis = RedisService.getInstance(); }

  static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) AnalyticsService.instance = new AnalyticsService();
    return AnalyticsService.instance;
  }

  async trackEvent(event: string, userId: string, metadata: Record<string, any> = {}): Promise<void> {
    const key = `analytics:${event}:${new Date().toISOString().split('T')[0]}`;
    await this.redis.hset(key, userId, JSON.stringify(metadata));
    await this.redis.expire(key, 86400 * 30);
  }

  async getCourseAnalytics(courseId: string): Promise<any> {
    const enrollments = await Enrollment.find({ course: courseId });
    const completed = enrollments.filter(e => e.status === 'completed').length;
    const total = enrollments.length;
    const completionRate = total ? (completed / total) * 100 : 0;
    const averageProgress = enrollments.reduce((acc, e) => acc + e.progress, 0) / (total || 1);
    return { totalEnrollments: total, completed, completionRate, averageProgress };
  }

  async getUserAnalytics(userId: string): Promise<any> {
    const user = await User.findById(userId).select('xp level streak totalEarned totalSpent coursesCompleted lessonsCompleted');
    const last30Days = await Transaction.aggregate([
      { $match: { user: userId, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, status: 'completed' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]);
    return { user, last30Days };
  }

  async getPlatformStats(): Promise<any> {
    const cached = await this.redis.get('platform:stats');
    if (cached) return cached;
    const [totalUsers, totalCourses, totalEnrollments, totalRevenue] = await Promise.all([
      User.countDocuments(),
      Course.countDocuments({ published: true }),
      Enrollment.countDocuments(),
      Transaction.aggregate([{ $match: { type: 'purchase', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    const stats = { totalUsers, totalCourses, totalEnrollments, totalRevenue: totalRevenue[0]?.total || 0, updatedAt: new Date() };
    await this.redis.set('platform:stats', stats, 3600);
    return stats;
  }
}
