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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await this.addXP(userId, xpReward, session);
      if (nairaReward > 0) {
        await this.addToWallet(userId, nairaReward, 'reward', { type: 'lesson_completion', lessonId, courseId }, session);
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addQuizCompletionReward(userId: string, quizId: string, courseId: string, score: number, xpReward: number, nairaReward: number): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await this.addXP(userId, xpReward, session);
      if (nairaReward > 0 && score >= 70) {
        await this.addToWallet(userId, nairaReward, 'reward', { type: 'quiz_completion', quizId, courseId, score }, session);
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addCourseCompletionReward(userId: string, courseId: string, xpReward: number, nairaReward: number): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await this.addXP(userId, xpReward, session);
      if (nairaReward > 0) {
        await this.addToWallet(userId, nairaReward, 'reward', { type: 'course_completion', courseId }, session);
        // Mark course as completed in user's record
        await User.findByIdAndUpdate(userId, { $addToSet: { coursesCompleted: courseId } }, { session });
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addDailyReward(userId: string): Promise<number> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    const baseReward = 50;
    const streakBonus = Math.min(user.streak * 5, 100);
    const totalReward = baseReward + streakBonus;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await this.addToWallet(userId, totalReward, 'reward', { type: 'daily_reward', streak: user.streak }, session);
      const lastActive = user.lastActiveAt;
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastActive.toDateString() === yesterday.toDateString()) user.streak += 1;
      else if (lastActive.toDateString() !== today.toDateString()) user.streak = 1;
      user.lastActiveAt = today;
      await user.save({ session });
      await session.commitTransaction();
      return totalReward;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  private async addXP(userId: string, amount: number, session: mongoose.ClientSession): Promise<void> {
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error('User not found');
    user.xp += amount;
    const newLevel = user.calculateLevel();
    if (newLevel > user.level) {
      user.level = newLevel;
      const levelBonus = newLevel * 100;
      user.xp += levelBonus;
    }
    await user.save({ session });
  }

  private async addToWallet(userId: string, amount: number, type: string, metadata: Record<string, any>, session: mongoose.ClientSession): Promise<void> {
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error('User not found');
    user.walletBalance += amount;
    user.totalEarned += amount;
    await user.save({ session });
    const transaction = new Transaction({
      user: userId,
      type: 'commission',
      subtype: type,
      amount,
      currency: 'NGN',
      status: 'completed',
      description: `${type} reward of ₦${amount.toLocaleString()}`,
      reference: `EARN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata,
      completedAt: new Date()
    });
    await transaction.save({ session });
  }
}
