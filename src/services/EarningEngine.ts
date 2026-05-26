import mongoose from 'mongoose';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Course } from '../models/Course';
import { Enrollment } from '../models/Enrollment';
import { logger } from '../utils/logger';

export class EarningEngine {
  private static instance: EarningEngine;
  private constructor() {}
  
  static getInstance(): EarningEngine {
    if (!EarningEngine.instance) {
      EarningEngine.instance = new EarningEngine();
    }
    return EarningEngine.instance;
  }

  async addLessonCompletionReward(userId: string, lessonId: string, courseId: string, xpReward: number, nairaReward: number): Promise<void> {
    try {
      await this.addXP(userId, xpReward);
      if (nairaReward > 0) {
        await this.addToWallet(userId, nairaReward, 'lesson_completion', { lessonId, courseId });
      }
      logger.info(`Lesson completion reward: ${nairaReward} to user ${userId}`);
    } catch (error) {
      logger.error('Error adding lesson reward:', error);
    }
  }

  async addCourseCompletionReward(userId: string, courseId: string, xpReward: number, nairaReward: number): Promise<void> {
    try {
      await this.addXP(userId, xpReward);
      if (nairaReward > 0) {
        await this.addToWallet(userId, nairaReward, 'course_completion', { courseId });
        await User.findByIdAndUpdate(userId, { $addToSet: { coursesCompleted: courseId } });
      }
      logger.info(`Course completion reward: ${nairaReward} to user ${userId}`);
    } catch (error) {
      logger.error('Error adding course reward:', error);
    }
  }

  private async addXP(userId: string, amount: number): Promise<void> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    user.xp += amount;
    const newLevel = Math.floor(Math.pow(user.xp / 100, 0.5)) + 1;
    if (newLevel > user.level) {
      user.level = newLevel;
      user.xp += newLevel * 100;
    }
    await user.save();
  }

  private async addToWallet(userId: string, amount: number, type: string, metadata: Record<string, any>): Promise<void> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    user.walletBalance += amount;
    user.totalEarned += amount;
    await user.save();
    
    const transaction = new Transaction({
      user: userId,
      type: 'reward',
      subtype: type,
      amount,
      currency: 'NGN',
      status: 'completed',
      description: `${type} reward of ₦${amount.toLocaleString()}`,
      reference: `EARN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata,
      completedAt: new Date()
    });
    await transaction.save();
  }
}
