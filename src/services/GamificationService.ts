// ============================================
// FILE: src/services/GamificationService.ts (new)
// ============================================
import { User, UserBadge, Badge } from '../models';
import { logger } from '../utils/logger';

export class GamificationService {
  private static instance: GamificationService;

  private constructor() {}

  static getInstance(): GamificationService {
    if (!GamificationService.instance) GamificationService.instance = new GamificationService();
    return GamificationService.instance;
  }

  async checkAndAwardBadges(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) return;
    const earnedBadges = await UserBadge.find({ user: userId }).distinct('badge');
    const allBadges = await Badge.find({ isActive: true, _id: { $nin: earnedBadges } });
    const newBadges = [];
    for (const badge of allBadges) {
      let achieved = false;
      switch (badge.requirement.type) {
        case 'xp':
          achieved = user.xp >= badge.requirement.value;
          break;
        case 'courses_completed':
          achieved = user.coursesCompleted.length >= badge.requirement.value;
          break;
        case 'streak':
          achieved = user.streak >= badge.requirement.value;
          break;
        case 'referrals':
          achieved = user.referrals.length >= badge.requirement.value;
          break;
        case 'lessons_completed':
          achieved = user.lessonsCompleted >= badge.requirement.value;
          break;
        case 'custom':
          // Custom logic can be extended
          achieved = false;
          break;
      }
      if (achieved) {
        await UserBadge.create({ user: userId, badge: badge._id, earnedAt: new Date() });
        newBadges.push(badge);
        // Award badge points (optional)
        user.xp += badge.points;
      }
    }
    if (newBadges.length) {
      await user.save();
      logger.info(`Awarded ${newBadges.length} badges to user ${userId}`);
    }
  }

  async getUserBadges(userId: string): Promise<any[]> {
    const userBadges = await UserBadge.find({ user: userId }).populate('badge');
    return userBadges;
  }
}
